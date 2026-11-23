// Stems: muting and soloing vocals, melody, bass and drums on a deck. The
// engine plays them; this sends the mask (bit n = stem n audible) and keeps
// each deck's waveform showing only what you hear.

import { engine, tracks, control } from './engine.svelte.js';
import { backend } from './backend.js';
import { announce } from './announce.svelte.js';
import { stemsModel, setStemsMode } from './stemsmodel.svelte.js';
import { isWaiting, notYet, onUse } from './stemsmodel.js';
import { showToast } from './undo.svelte.js';

export const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
export const ALL = 0b1111;

const deckName = (deck) => 'AB'[deck];

/** The deck's stems as the engine reports them: which are on, and how far splitting has got. */
export function stemsOf(deck) {
  const mask = engine.decks[deck].stems ?? ALL;
  const s = engine.stems?.[deck] ?? { state: 'off', ready: 0, here: false, error: null };
  return { mask, ...s };
}

/** True when the deck's stems can be used (or are on their way). */
export const usable = (deck) => onUse(stemsModel.mode, { loaded: !!tracks[deck], state: stemsOf(deck).state }) === 'go';

/** True while a stem is muted that's still heard, until the track is split there. */
export const waiting = (deck) => !!tracks[deck] && isWaiting(stemsOf(deck));

/**
 * A press on a deck's stems from before the user has chosen how they work.
 * It's kept while the choice is in front of them, for this track.
 * @type {{ deck: number, path: string, act: () => void } | null}
 */
let held = null;

/** Asks a deck to show its Stems tab, where the choice is made. `n` counts the times. */
export const showStems = $state([{ n: 0 }, { n: 0 }]);

/** Makes the choice, and does what was pressed on the way to it. @param {'fast' | 'efficient'} mode */
export async function chooseStems(deck, mode) {
  const press = held;
  held = null;
  await setStemsMode(mode);
  announce(mode === 'fast' ? 'Fast stems' : 'Efficient stems');
  if (press && tracks[press.deck]?.path === press.path) {
    if (stemsModel.state === 'ready') press.act();
    else showToast(notYet(stemsModel));
  } else if (tracks[deck]) backend.useStems?.(deck);
}

/** Lets go of a press that was waiting for the choice: its Stems tab was left. */
export function leftStems(deck) {
  if (held?.deck === deck) held = null;
}

/** Does `act` with a deck's stems, once the user has chosen how they work, or says why not. */
export function pressStem(deck, act) {
  const what = onUse(stemsModel.mode, { loaded: !!tracks[deck], state: stemsOf(deck).state });
  if (what === 'go') act();
  else if (what === 'ask') {
    held = { deck, path: tracks[deck].path, act };
    showStems[deck].n++;
    showToast(`Deck ${deckName(deck)}: choose how stems work in its Stems tab, and that press goes ahead`);
  } else showToast(stemsUnavailable(deck));
}

/** A deck's Stems tab was opened, on screen or by the controller's stems pads: that's using them. */
export function openedStems(deck) {
  if (tracks[deck] && stemsModel.mode !== 'ask') backend.useStems?.(deck);
}

/** Puts every stem back on where one was left muted with nothing to mute it: stems turned off, removed or failed. */
export function dropWaiting(deck) {
  if (stemsOf(deck).mask !== ALL) control({ type: 'setStems', deck, mask: ALL });
}

/** Why a stem key, or a stem pad on the controller, did nothing, for a toast. */
export function stemsUnavailable(deck) {
  if (!tracks[deck]) return `Deck ${deckName(deck)}: load a track first`;
  switch (stemsOf(deck).state) {
    case 'needsModel':
      return notYet(stemsModel);
    case 'failed':
      return `Deck ${deckName(deck)}: stems couldn't be made`;
    default:
      return 'Stems are off. Turn them on in Settings › Stems';
  }
}

/** The one stem playing alone, or -1. */
export function soloed(mask) {
  return [0, 1, 2, 3].find((i) => mask === 1 << i) ?? -1;
}

function send(deck, mask, said) {
  const later = mask !== ALL && !stemsOf(deck).here;
  control({ type: 'setStems', deck, mask });
  announce(`Deck ${deckName(deck)}: ${said}${later ? ', in a moment' : ''}`);
}

/** What a stem pad on the controller asked for, once the question is answered. */
export const setStemMask = (deck, mask) => pressStem(deck, () => send(deck, mask, mask === ALL ? 'all stems on' : 'stems changed'));

/** Mutes or unmutes one stem. */
export const toggleStem = (deck, i) => pressStem(deck, () => {
  const { mask } = stemsOf(deck);
  const next = mask ^ (1 << i);
  send(deck, next, `${STEMS[i].toLowerCase()} ${next & (1 << i) ? 'on' : 'off'}`);
});

/** Plays one stem alone, or, if it already is, all of them again. */
export const soloStem = (deck, i) => pressStem(deck, () => {
  const { mask } = stemsOf(deck);
  if (mask === 1 << i) send(deck, ALL, 'all stems on');
  else send(deck, 1 << i, `${STEMS[i].toLowerCase()} only`);
});

/** All stems back on. */
export function allStems(deck) {
  if (stemsOf(deck).mask !== ALL) send(deck, ALL, 'all stems on');
}

// The waveform follows the stems: once muting changes, or more of the track
// has been split, fetch a waveform of what the deck plays.
const shown = ['', ''];
let fetching = [false, false];

/** Called after every engine poll. */
export function syncStemWaveforms() {
  for (let deck = 0; deck < 2; deck++) {
    const t = tracks[deck];
    if (!t) {
      shown[deck] = '';
      continue;
    }
    const { mask, state, ready } = stemsOf(deck);
    // Refresh as splitting goes on, in quarters, then once it's done.
    const step = state === 'ready' ? 4 : Math.floor(ready * 4);
    const want = mask === ALL ? `${t.path}|all` : `${t.path}|${mask}|${step}`;
    if (want === shown[deck] || fetching[deck]) continue;
    if (mask === ALL) {
      shown[deck] = want;
      if (t.fullBins && t.bins !== t.fullBins) tracks[deck] = { ...t, bins: t.fullBins };
      continue;
    }
    fetching[deck] = true;
    backend
      .stemsWaveform(deck, mask)
      .then((bins) => {
        const now = tracks[deck];
        if (now?.path !== t.path) return;
        tracks[deck] = { ...now, fullBins: now.fullBins ?? now.bins, bins };
        shown[deck] = want;
      })
      .catch(() => (shown[deck] = want))
      .finally(() => (fetching[deck] = false));
  }
}
