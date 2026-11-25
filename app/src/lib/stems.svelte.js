// Stems: muting and soloing vocals, melody, bass and drums on a deck. The
// engine plays them; this sends the mask (bit n = stem n audible) and keeps
// each deck's waveform showing only what you hear.

import { engine, tracks, control } from './engine.svelte.js';
import { backend } from './backend.js';
import { announce } from './announce.svelte.js';
import { flag } from '../flags/registry.svelte.js';

export const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
export const ALL = 0b1111;

const deckName = (deck) => 'AB'[deck];
// #88 (UI audit flag): deck-names says "Left deck" / "Right deck" ("Deck A" otherwise).
const Deck = (deck) => (flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${deckName(deck)}`);

/** The deck's stems as the engine reports them: which are on, and how far splitting has got. */
export function stemsOf(deck) {
  const mask = engine.decks[deck].stems ?? ALL;
  const s = engine.stems?.[deck] ?? { state: 'off', ready: 0, error: null };
  return { mask, ...s };
}

/** True when the deck's stems can be used (or are on their way). */
export const usable = (deck) => !!tracks[deck] && ['starting', 'splitting', 'ready'].includes(stemsOf(deck).state);

/** Why a stem pad on the controller did nothing, for a toast. */
export function stemsUnavailable(deck) {
  if (!tracks[deck]) return `${Deck(deck)}: load a track first`;
  switch (stemsOf(deck).state) {
    case 'needsModel':
      return 'Stems need a one-time model download. Get it in Settings › Stems';
    case 'failed':
      return `${Deck(deck)}: stems couldn't be made`;
    default:
      return 'Stems are off. Turn them on in Settings › Stems';
  }
}

/** The one stem playing alone, or -1. */
export function soloed(mask) {
  return [0, 1, 2, 3].find((i) => mask === 1 << i) ?? -1;
}

function send(deck, mask, said) {
  control({ type: 'setStems', deck, mask });
  announce(`${Deck(deck)}: ${said}`);
}

/** Mutes or unmutes one stem. */
export function toggleStem(deck, i) {
  if (!usable(deck)) return;
  const { mask } = stemsOf(deck);
  const next = mask ^ (1 << i);
  send(deck, next, `${STEMS[i].toLowerCase()} ${next & (1 << i) ? 'on' : 'off'}`);
}

/** Plays one stem alone, or, if it already is, all of them again. */
export function soloStem(deck, i) {
  if (!usable(deck)) return;
  const { mask } = stemsOf(deck);
  if (mask === 1 << i) send(deck, ALL, 'all stems on');
  else send(deck, 1 << i, `${STEMS[i].toLowerCase()} only`);
}

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
