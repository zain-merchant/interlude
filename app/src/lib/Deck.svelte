<script>
  import Waveform from './Waveform.svelte';
  import Fader from './Fader.svelte';
  import Mid from '../flags/110-dir-room-tint/Mid.svelte'; // #110 (UI audit flag): dir-room-tint cuts a long title in the middle.
  import FxUnit from './FxUnit.svelte';
  import Performance from './Performance.svelte';
  import Stems from './Stems.svelte';
  import Grid from './Grid.svelte';
  import Platter from './Platter.svelte';
  import { untrack, tick } from 'svelte';
  import { padMode, padModeTab } from './padmode.svelte.js';
  import { tempoPickup } from './pickup.svelte.js';
  import { engine, tracks, control, ejectTrack, deckSnapshot, restoreDeck } from './engine.svelte.js';
  import { pushEdit, showToast } from './undo.svelte.js';
  import { bpmEdit, gridEdit, gridMenu, gridMode } from './grid.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import Keys from '../flags/116-settings-finish/Keys.svelte'; // #113 (UI audit flag)
  import { flag, setting } from '../flags/registry.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { announce } from './announce.svelte.js';
  import { keyName, keyLongName, camelot, playingKey, keysMix } from './key.js';
  import { toggleSlip, beatJump, hasGrid, beatsLabel, setKeyShift, keyStep, keySync, canKeySync, KEY_SHIFT_MAX } from './performance.js';

  /** @type {{ deck: number, onload: (deck: number, track: any) => void, onreveal: (path: string) => void, onsettings?: (page: string) => void }} */
  let { deck, onload, onreveal, onsettings } = $props();

  const name = $derived(deck === 0 ? 'A' : 'B');
  // #88 (UI audit flag): deck-names calls the decks left and right in words ("Deck A" otherwise).
  const lr = (n) => (n === 0 ? 'left deck' : 'right deck');
  const Dn = $derived(flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${name}`);
  const dn = $derived(flag('deck-names') ? lr(deck) : `deck ${name}`);
  const otherDn = $derived(flag('deck-names') ? lr(1 - deck) : `deck ${deck === 0 ? 'B' : 'A'}`);

  // Fixing the beatgrid: right-click the BPM (or the waveform), or
  // double-click the BPM to type one.
  const editingBpm = $derived(bpmEdit.deck === deck);
  const openGridMenu = (e) => tracks[deck] && openMenu(e, gridMenu(deck));
  // #54 (UI audit flag): deck-polish's Eject offers Undo, like a load: ⌘Z or the toast puts the track back where it was.
  // Undo and redo refuse a playing deck, as a load's do.
  async function eject() {
    const t = tracks[deck];
    const before = deckSnapshot(deck);
    if (!t || !before) return;
    await ejectTrack(deck);
    const title = flag('copy-toasts') ? `“${t.title}”` : t.title;
    announce(`Ejected ${title} from ${dn}`);
    const busy = () => engine.decks[deck].playing && (showToast(`${Dn} is playing. Pause it first.`), true);
    pushEdit({
      label: `Ejected ${title} from ${dn}`,
      undo: async () => (busy() ? false : restoreDeck(deck, before)),
      redo: async () => (busy() ? false : ejectTrack(deck)),
    });
  }
  const focusBpm = (node) => {
    node.focus();
    node.select();
  };
  function bpmKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') finishBpm(e.currentTarget.value);
    else if (e.key === 'Escape') bpmEdit.deck = -1;
  }
  function finishBpm(text) {
    if (!editingBpm) return;
    bpmEdit.deck = -1;
    const v = parseFloat(String(text).replace(',', '.'));
    if (v > 0 && Math.abs(v - d.bpm) > 1e-6) gridEdit(deck, 'bpm', `Set the BPM to ${+v.toFixed(2)}`, v);
  }
  const other = $derived(deck === 0 ? 'B' : 'A');
  const RANGES = [0.08, 0.16, 0.5];

  // The pitch fader's range, remembered per deck. Clicking the tempo
  // readout above the fader steps through them.
  const rangeKey = () => `oss-dj.pitchRange.${deck}`;
  let range = $state(0.08);
  try {
    const saved = Number(localStorage.getItem(rangeKey()));
    if (RANGES.includes(saved)) range = saved;
  } catch {}
  function saveRange() {
    try {
      localStorage.setItem(rangeKey(), String(range));
    } catch {}
  }

  // The performance strip shows one set of controls at a time (hot cues,
  // loop and beat jump, or effects) so the deck stays calm. Keys and the
  // controller reach all of them whichever is showing.
  const MODES = [
    { id: 'cues', label: 'Cues' },
    { id: 'loop', label: 'Loop' },
    { id: 'fx', label: 'FX' },
    { id: 'stems', label: 'Stems' },
    { id: 'grid', label: 'Grid' },
  ];
  const storageKey = () => `oss-dj.deckMode.${deck}`;
  /** @type {'cues' | 'loop' | 'fx' | 'stems' | 'grid'} */
  let mode = $state('cues');
  try {
    const saved = localStorage.getItem(storageKey());
    if (MODES.some((m) => m.id === saved)) mode = /** @type {any} */ (saved);
  } catch {}
  function setMode(m) {
    mode = m;
    // Grid isn't remembered: while it's open, dragging the waveform slides
    // the grid instead of scratching, which shouldn't greet a new session.
    if (m === 'grid') return;
    try {
      localStorage.setItem(storageKey(), m);
    } catch {}
  }
  $effect(() => {
    gridMode[deck] = mode === 'grid';
  });
  // A pad mode button on the controller shows the controls its pads now
  // play, as rekordbox does.
  $effect(() => {
    const tab = padModeTab(padMode[deck].mode);
    padMode[deck].presses;
    if (tab) untrack(() => setMode(tab));
  });
  function modeKey(e) {
    const i = MODES.findIndex((m) => m.id === mode);
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    setMode(MODES[(i + dir + MODES.length) % MODES.length].id);
    const list = /** @type {HTMLElement} */ (e.currentTarget);
    const focus = () => /** @type {HTMLElement} */ (list.querySelector('[aria-selected="true"]'))?.focus();
    // #54 (UI audit flag): deck-polish waits for the new tab to be selected before focusing it (focus stayed on the old tab).
    if (flag('deck-polish')) tick().then(focus);
    else focus();
  }
  // Pitch fader position, -1..1. Up is slower, like a turntable.
  let pitch = $state(0);

  const d = $derived(engine.decks[deck]);
  const grid = $derived(hasGrid(deck));
  const jumpSize = $derived(beatsLabel(d.loopBeats || 4));
  const t = $derived(tracks[deck]);
  const ratePct = $derived((d.rate - 1) * 100);
  // The tempo the deck is set to, not its momentary speed, so scratching
  // or nudging doesn't make the BPM and key jump around.
  const bpm = $derived(d.bpm > 0 ? d.bpm * d.rate : 0);
  const atCue = $derived(!!t && !d.playing && Math.abs(d.position - d.cue) < 0.01);
  const pk = $derived(t ? playingKey(d.key, d.rate, d.keylock, d.keyShift ?? 0) : null);
  const canSync = $derived(!!t && d.bpm > 0 && engine.decks[1 - deck].bpm > 0);
  // #18 (UI audit flag): where the pitch fader would match the other deck's tempo (Fader's match mark).
  const tempoMatch = $derived.by(() => {
    const o = engine.decks[1 - deck];
    if (!flag('visual-tempo-match') || !t || !tracks[1 - deck] || !(d.bpm > 0) || !(o.bpm > 0)) return null;
    return (1 - (o.bpm * o.rate) / d.bpm) / range;
  });
  // #18 (UI audit flag): the two tempos agree to within 0.05 BPM.
  const tempoMatched = $derived(tempoMatch !== null && Math.abs(bpm - engine.decks[1 - deck].bpm * engine.decks[1 - deck].rate) < 0.05);
  // #18 (UI audit flag): this deck's key mixes with the other deck's (as each sounds now); class:mix on .key.
  const keyMix = $derived.by(() => {
    if (!flag('visual-key-match') || !pk || !tracks[1 - deck]) return false;
    const o = engine.decks[1 - deck];
    return keysMix(pk, playingKey(o.key, o.rate, o.keylock));
  });

  // #6 (UI audit flag): whether the on-screen Cue button is held, so the play button can show a cue preview.
  let cueHeld = $state(false);

  let lastTouch = 0;

  // The controller's tempo fader, while it waits to pick up the tempo:
  // where it sits on this fader's scale.
  const pickupRate = $derived(t ? tempoPickup[deck] : null);
  const ghost = $derived(pickupRate === null ? null : Math.max(-1, Math.min(1, (1 - pickupRate) / range)));

  function setPitch(v) {
    lastTouch = performance.now();
    pitch = v;
    control({ type: 'setRate', deck, rate: 1 - pitch * range });
  }

  // Keep the pitch fader in step when the engine changes the rate itself
  // (SYNC, or a controller), widening the range if the new rate doesn't
  // fit. Ignores the engine for a moment after the fader moves, since the
  // engine's reported rate lags the fader by a frame or two.
  $effect(() => {
    const rate = d.rate;
    untrack(() => {
      if (performance.now() - lastTouch < 500) return;
      if (Math.abs(1 - pitch * range - rate) < 1e-6) return;
      let r = range;
      while (Math.abs(1 - rate) > r + 1e-9 && r < RANGES[RANGES.length - 1]) r = RANGES[RANGES.indexOf(r) + 1];
      if (r !== range) {
        range = r;
        saveRange();
      }
      pitch = Math.max(-1, Math.min(1, (1 - rate) / r));
    });
  });

  // Steps to the next range, keeping the tempo where it is if it fits
  // (the fader moves instead), so changing range mid-mix never jumps.
  function cycleRange() {
    const rate = 1 - pitch * range;
    let next = RANGES[(RANGES.indexOf(range) + 1) % RANGES.length];
    while (Math.abs(1 - rate) > next + 1e-9 && next < RANGES[RANGES.length - 1]) next = RANGES[RANGES.indexOf(next) + 1];
    range = next;
    saveRange();
    lastTouch = performance.now();
    pitch = Math.max(-1, Math.min(1, (1 - rate) / range));
    control({ type: 'setRate', deck, rate: 1 - pitch * range });
    announce(`${Dn} pitch range plus or minus ${Math.round(range * 100)} percent`);
  }


  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

  // Buttons act on pointer-down so a press is felt at once; keyboard
  // activation (a click with no pointer) still works.
  const press = (fn) => ({
    onpointerdown: (e) => e.button === 0 && fn(),
    onclick: (e) => e.detail === 0 && fn(),
  });
  const play = () => t && control({ type: 'togglePlay', deck });
  // SYNC turns sync on or off. On, the deck keeps deck {other}'s tempo
  // as either pitch fader moves.
  const sync = () => {
    if (!canSync && !d.synced) return;
    control({ type: 'sync', deck });
    announce(d.synced ? `${Dn} sync off` : `${Dn} synced to ${otherDn}`);
  };
  const toggleKeylock = () => control({ type: 'setKeylock', deck, on: !d.keylock });
  const slipTip = () =>
    tipText('Slip on: after a scratch, loop, held hot cue or pause, the track picks up where it would have been. Click to turn off', keyLabel(`deck.${deck}.slip`));
  // #109 (UI audit flag): quiet-readouts: the button itself is the tempo, so its tip only adds the range.
  const rangeTip = () => (flag('quiet-readouts') ? `Fader range ±${Math.round(range * 100)}%. Click to change the range` : `Tempo ${pct(ratePct)}, fader range ±${Math.round(range * 100)}%. Click to change the range`);
  const st = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'semitone' : 'semitones'}`;
  const keyTip = () => {
    if (!pk) return '';
    const track = `${keyLongName(d.key)} (${camelot(d.key)})`;
    const tempo = pk.shift - pk.keyShift;
    const parts = [
      pk.keyShift && `key shift ${pk.keyShift > 0 ? 'up' : 'down'} ${st(pk.keyShift)}`,
      tempo && `the tempo ${tempo > 0 ? 'up' : 'down'} ${st(tempo)}`,
    ].filter(Boolean);
    const now = pk.shift ? `Key ${keyLongName(pk)} (${camelot(pk)}): the track is in ${track}, moved by ${parts.join(' and ')}` : `Key ${track}${pk.keyShift ? `, after key shift ${pk.keyShift > 0 ? 'up' : 'down'} ${st(pk.keyShift)} and the tempo back` : ''}`;
    return `${now}. Click to shift the key`;
  };
  // The key shift menu, from a click (or keyboard press) on the key.
  function keyMenu(e) {
    if (!pk) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientX || e.clientY ? e : { clientX: r.left, clientY: r.bottom, preventDefault() {}, stopPropagation() {} };
    const ks = d.keyShift ?? 0;
    openMenu(at, [
      { label: 'Key up a semitone', action: () => keyStep(deck, 1), key: keyLabel(`deck.${deck}.keyUp`), enabled: ks < KEY_SHIFT_MAX },
      { label: 'Key down a semitone', action: () => keyStep(deck, -1), key: keyLabel(`deck.${deck}.keyDown`), enabled: ks > -KEY_SHIFT_MAX },
      { label: "Back to the track's key", action: () => setKeyShift(deck, 0), key: keyLabel(`deck.${deck}.keyReset`), enabled: ks !== 0 },
      '-',
      { label: `Match ${otherDn}'s key`, // #88 (UI audit flag): deck-names
        action: () => keySync(deck), key: keyLabel(`deck.${deck}.keySync`), enabled: canKeySync(deck) },
    ]);
  }
  const bend = (v) => () => t && control({ type: 'setBend', deck, bend: v });
  // #48 (UI audit flag): nudge-pill's glyph setting can show − and + (slower, faster) instead of ‹ ›.
  const nudgeGlyph = (n) => (flag('nudge-pill') ? (n.v < 0 ? '−' : '+') : n.glyph);
  const nudgeTip = (n) => (flag('nudge-pill') ? tipText(`Hold to nudge ${n.v < 0 ? 'slower' : 'faster'}`, keyLabel(`deck.${deck}.${n.id}`)) : tipText(n.label, keyLabel(`deck.${deck}.${n.id}`), 'hold'));
  // #18 (UI audit flag): visual-tempo-match's mark explained in the pitch fader's tooltip.
  const pitchNote = $derived.by(() => {
    if (pickupRate !== null) return `The controller's tempo fader is at ${pct((pickupRate - 1) * 100)}. Move it to the marker and it takes over`;
    if (tempoMatch === null) return '';
    const o = engine.decks[1 - deck];
    return tipText(`${Dn} pitch`, flag('quiet-readouts') ? '' : pct(ratePct), 'double-click to reset', `the mark is where it matches the other deck (${(o.bpm * o.rate).toFixed(2)})`); // #109 (UI audit flag)
  });

  const regionLabel = $derived(
    t ? `${Dn}, ${t.title}${t.artist ? ` by ${t.artist}` : ''}, ${d.playing ? 'playing' : 'paused'}${bpm ? `, ${bpm.toFixed(0)} BPM` : ''}` : `${Dn}, empty`,
  );
  // #57 (UI audit flag): against-tab-status: what an idle tab's mode is doing, in a word or two.
  const tabStatus = (id) => {
    if (!t) return '';
    if (id === 'cues') {
      const n = (d.hotCues ?? []).slice(0, 8).filter((c) => c != null).length;
      return n ? `${n} set` : '';
    }
    if (id === 'loop') return d.looping ? jumpSize : '';
    if (id === 'fx') return d.fx?.on ? String(d.fx.kind ?? '').replace(/^./, (c) => c.toUpperCase()) : '';
    if (id === 'stems') {
      const off = 4 - [0, 1, 2, 3].filter((i) => ((d.stems ?? 15) >> i) & 1).length;
      return off ? `${off} off` : '';
    }
    return '';
  };
  // #89 (UI audit flag): key-notation's choice (both, camelot or musical) for the deck's key too.
  const kn = $derived(flag('key-notation') ? setting('key-notation', 'show') : 'both');
  // #54 (UI audit flag): the title cut to fit its box at a glyph boundary,
  // trailing spaces dropped before the "…" (CSS's ellipsis keeps them, so a
  // cut after a word read "Concrete …"); null while the whole title fits.
  let fittedTitle = $state(/** @type {string | null} */ (null));
  /** @type {CanvasRenderingContext2D | null} */
  let measureCtx = null;
  function fitTitle(node, title) {
    const fit = () => {
      if (flag('dir-room-tint')) return; // #110 cuts it in the middle itself (Mid.svelte).
      const cs = getComputedStyle(node);
      measureCtx ??= document.createElement('canvas').getContext('2d');
      if (!measureCtx) return;
      measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const ls = parseFloat(cs.letterSpacing) || 0;
      const width = (s) => measureCtx.measureText(s).width + ls * s.length;
      const room = node.clientWidth;
      if (width(title) <= room + 0.5) return (fittedTitle = null);
      let lo = 0, hi = title.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (width(title.slice(0, mid).trimEnd() + '…') <= room) lo = mid;
        else hi = mid - 1;
      }
      fittedTitle = title.slice(0, lo).trimEnd() + '…';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(node);
    return {
      update(next) {
        title = next;
        fit();
      },
      destroy() {
        ro.disconnect();
        fittedTitle = null;
      },
    };
  }
  const headerMenu = (e) =>
    openMenu(e, [
      { label: 'Show in library', action: () => onreveal(t.path), enabled: !!t },
      // #54 (UI audit flag): deck-polish adds Eject, so the menu isn't one lone command (not while playing).
      ...(flag('deck-polish') ? [{ label: 'Eject', action: eject, enabled: !!t && !d.playing }] : []),
    ]);
</script>

<section class="deck" class:mirror={deck === 1} style:--deck={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'}
  style:--drop-color={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} aria-label={regionLabel} data-region="deck{deck}"
  use:dropTarget={{ ondrop: (track) => onload(deck, track), blocked: () => d.playing }}>
  <div class="body">
    <!-- The record on the outer side with the times in its centre, the title
         beside it, tempo and key in the inner corner, and the overview of
         the whole track across the deck under them. -->
    <div class="rec-cell"><Platter {deck} /></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header oncontextmenu={headerMenu}>
      {#if t}
        <!-- #54 (UI audit flag): deck-polish cuts a long title at a glyph, never leaving a space before the "…". -->
        {#if flag('deck-polish')}
          <div class="name" use:tip={() => t.path} use:fitTitle={t.title}>{#if flag('dir-room-tint')}<Mid text={t.title} fit />{:else}{fittedTitle ?? t.title}{/if}</div>
        {:else}
          <div class="name" use:tip={() => t.path}>{#if flag('dir-room-tint')}<Mid text={t.title} fit />{:else}{t.title}{/if}</div>
        {/if}
        <div class="artist">{#if flag('dir-room-tint')}<Mid text={t.artist || 'Unknown artist'} fit />{:else}{t.artist || 'Unknown artist'}{/if}</div>
      {:else}
        <div class="name dim">Empty deck</div>
        <!-- #113 (UI audit flag): zero-states: the shortcut as keys. -->
        {#if flag('zero-states') && flag('dir-room-tint')}<div class="artist load"><span>Drag a track here</span>{#if keyLabel(`deck.${deck}.load`)}<span>or press<span class="sr">{keyLabel(`deck.${deck}.load`)}</span><Keys label={keyLabel(`deck.${deck}.load`)} /></span>{/if}</div>{:else}
        <div class="artist">Drag a track here or press {keyLabel(`deck.${deck}.load`)}</div>{/if}
      {/if}
    </header>
    <div class="bpm" oncontextmenu={openGridMenu} ondblclick={() => t && (bpmEdit.deck = deck)} role="group" aria-label="Tempo"
      use:tip={() => (editingBpm ? '' : d.bpm > 0 ? `Track tempo ${d.bpm.toFixed(2)} BPM${t?.gridLocked ? ', beatgrid fixed by hand' : ''}. Right-click here or on the waveform to fix the beatgrid` : t ? 'No clear beat found. Double-click to set the BPM' : '')}>
      {#if editingBpm}
        {#if flag('focus-states') && flag('dir-room-tint')}
          <!-- #119 (UI audit flag): focus-states: the figures keep their place (they're still there, unseen, under the field), and the field has room round them. -->
          <div class="typed"><div class="big num" aria-hidden="true">{#if bpm > 0}{bpm.toFixed(2).slice(0, -3)}<span class="frac">{bpm.toFixed(2).slice(-3)}</span>{:else}—{/if}</div><input class="big num edit" value={d.bpm > 0 ? d.bpm.toFixed(2) : ''} inputmode="decimal" aria-label="Track BPM" spellcheck="false"
            use:focusBpm onkeydown={bpmKey} onblur={(e) => finishBpm(e.currentTarget.value)} /></div>
        {:else}
        <input class="big num edit" value={d.bpm > 0 ? +d.bpm.toFixed(2) : ''} inputmode="decimal" aria-label="Track BPM" spellcheck="false"
          use:focusBpm onkeydown={bpmKey} onblur={(e) => finishBpm(e.currentTarget.value)} />
        {/if}
      {:else if bpm > 0 && (flag('dir-graphic2') || flag('dir-sleeve') || flag('dir-room-graphic') || flag('dir-enamel') || flag('dir-alloy') || flag('dir-pebble') || flag('dir-liner') || flag('dir-field') || flag('dir-ground') || flag('dir-room-tint'))}
        <!-- #97, #98, #100, #103, #104, #105, #106, #107, #108, #110 (UI audit flags): the tempo's decimals in their own span, so they can step down like the time's tenths. -->
        <div class="big num"><span class="sr">Tempo </span>{bpm.toFixed(2).slice(0, -3)}<span class="frac">{bpm.toFixed(2).slice(-3)}</span><span class="sr"> BPM</span></div>
      {:else}
        <div class="big num"><span class="sr">Tempo </span>{bpm > 0 ? bpm.toFixed(2) : '—'}<span class="sr"> BPM</span></div>
      {/if}
      {#if pk}
        <!-- #89 (UI audit flag): key-notation's choice for the deck's key too. #10 / #44 (UI audit flags): no-dots, pitch-readout: key and Camelot code set apart by space and tone, not a middle dot. #18: class:mix when it mixes with the other deck. -->
        <div class="unit"><button class="key" class:shifted={pk.shift} class:mix={keyMix} aria-label="Key {keyName(pk)}, {camelot(pk)}{pk.keyShift ? `, shifted ${pk.keyShift > 0 ? 'up' : 'down'} ${st(pk.keyShift)}` : ''}. Shift the key"
          aria-haspopup="menu" onclick={keyMenu} oncontextmenu={keyMenu} ondblclick={(e) => e.stopPropagation()} use:tip={keyTip}>{#if kn === 'camelot'}<span class="cam">{camelot(pk)}</span>{:else if kn === 'musical'}{keyName(pk)}{:else if flag('no-dots') || flag('pitch-readout')}{keyName(pk)} <span class="cam">{camelot(pk)}</span>{:else}{keyName(pk)} · {camelot(pk)}{/if}{#if pk.keyShift}<span class="ks num">{pk.keyShift > 0 ? '+' : '−'}{Math.abs(pk.keyShift)}</span>{/if}<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4l2.5 2.5L7.5 4" /></svg></button></div>
      {/if}
    </div>
    <div class="overview">
      <Waveform {deck} mode="overview" />
    </div>

    <div class="mp">
      <div class="modes" role="tablist" aria-label="{Dn} controls" tabindex="-1" onkeydown={modeKey}>
        {#each MODES as m}
          {@const busy = (m.id === 'loop' && d.looping) || (m.id === 'fx' && d.fx?.on) || (m.id === 'stems' && (d.stems ?? 15) !== 15)}
          <button role="tab" class:on={mode === m.id} aria-selected={mode === m.id} tabindex={mode === m.id ? 0 : -1}
            onclick={() => setMode(m.id)} use:tip={() => (busy ? `${m.label} (active)` : m.id === 'grid' ? 'Grid: fix the beatgrid. While open, drag the waveform to slide it' : m.label)}>
            {m.label}{#if busy}<i aria-label="active"></i>{/if}{#if flag('against-tab-status') && mode !== m.id && tabStatus(m.id)}<small class="st">{tabStatus(m.id)}</small>{/if}
          </button>
        {/each}
      </div>

    <div class="strip" class:cues={mode === 'cues'} role="tabpanel" aria-label={MODES.find((m) => m.id === mode)?.label}>
      {#if mode === 'fx'}
        <FxUnit {deck} />
      {:else if mode === 'grid'}
        <Grid {deck} />
      {:else if mode === 'stems'}
        <Stems {deck} onsettings={() => onsettings?.('stems')} />
      {:else}
        <Performance {deck} show={mode === 'loop' ? 'loop' : 'cues'} />
      {/if}
    </div>
    </div>

    <div class="transport">
      <!-- #6 (UI audit flag): the capture handlers below only track whether Cue is held (cueHeld). -->
      <button class="btn cue" class:lit={atCue} aria-disabled={!t}
        onpointerdown={(e) => e.button === 0 && t && control({ type: 'cuePress', deck })}
        onpointerup={() => t && control({ type: 'cueRelease', deck })}
        onpointerleave={(e) => e.buttons && t && control({ type: 'cueRelease', deck })}
        onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && t && (e.preventDefault(), control({ type: 'cuePress', deck }))}
        onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && t && control({ type: 'cueRelease', deck })}
        onpointerdowncapture={(e) => (cueHeld = flag('play-states') && e.button === 0)}
        onpointerupcapture={() => (cueHeld = false)}
        onpointerleavecapture={() => (cueHeld = false)}
        onkeydowncapture={(e) => (e.key === ' ' || e.key === 'Enter') && (cueHeld = flag('play-states'))}
        onkeyupcapture={() => (cueHeld = false)}
        onblur={() => (cueHeld = false)}
        use:tip={() => (t ? tipText('Cue', keyLabel(`deck.${deck}.cue`), 'hold to preview') : `Load a track onto ${dn} first`)}
      >Cue</button>
      <!-- #6 (UI audit flag): mark the play button while Cue is held and the track previews from the cue point. -->
      <button class="btn play" class:on={d.playing} aria-disabled={!t} aria-pressed={d.playing} aria-label={d.playing ? 'Pause' : 'Play'}
        data-cueing={flag('play-states') && cueHeld && d.playing ? '' : undefined}
        {...press(play)} use:tip={() => (t ? tipText(d.playing ? 'Pause' : 'Play', keyLabel(`deck.${deck}.play`)) : `Load a track onto ${dn} first`)}>
        {#if d.playing}
          <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        {:else}
          <svg viewBox="0 0 16 16"><path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" /></svg>
        {/if}
      </button>
      <button class="btn sync" class:on={d.synced} aria-disabled={!canSync && !d.synced} aria-pressed={!!d.synced} {...press(sync)}
        use:tip={() =>
          d.synced
            ? tipText(`Sync on: keeps ${otherDn}'s tempo when either pitch fader moves. Click to turn off`, keyLabel(`deck.${deck}.sync`))
            : canSync
              ? tipText(`Sync: match tempo and beats to ${otherDn} and stay locked to it`, keyLabel(`deck.${deck}.sync`))
              : `Sync needs a beat on both decks`}>Sync</button>
      <div class="btn jumps" role="group" aria-label="Beat jump">
        {#each [{ dir: -1, id: 'jumpBack', label: 'Jump back', glyph: '‹' }, { dir: 1, id: 'jumpForward', label: 'Jump forward', glyph: '›' }] as j, i}
          <button aria-label="{j.label} {jumpSize} {d.loopBeats === 1 ? 'beat' : 'beats'}" aria-disabled={!grid} style:order={i * 2}
            onpointerdown={(e) => e.button === 0 && beatJump(deck, j.dir, e.shiftKey)} onclick={(e) => e.detail === 0 && beatJump(deck, j.dir, e.shiftKey)}
            use:tip={() => (grid ? tipText(`${j.label} ${jumpSize} ${d.loopBeats === 1 ? 'beat' : 'beats'}`, keyLabel(`deck.${deck}.${j.id}`), `⇧ for 4 bars (${keyLabel(`deck.${deck}.${j.id}Long`)})`) : 'Needs a beatgrid')}>{j.glyph}</button>
        {/each}
        <!-- #5 (UI audit flag): no-shift-strip names the unit ("4" over "beats"); it hides where the slot is too narrow. -->
        <span class="num" style:order="1">{jumpSize}{#if flag('no-shift-strip')}<small>{d.loopBeats === 1 ? 'beat' : 'beats'}</small>{/if}</span>
      </div>
    </div>
  </div>

  <div class="pitch">
    <button class="val num" class:off={Math.abs(ratePct) > 0.005} onclick={cycleRange}
      aria-label="{Dn} tempo {pct(ratePct)}, pitch range plus or minus {Math.round(range * 100)} percent. Click to change the range"
      use:tip={rangeTip}>{#if flag('dir-room-tint')}<!-- #110 (UI audit flag): dir-room-tint sets the tempo's sign, number and unit apart, so each keeps its place. --><span class="lk"><span class="sg">{Math.abs(ratePct) < 0.005 ? '' : ratePct > 0 ? '+' : '−'}</span><span class="dg">{Math.abs(ratePct).toFixed(2)}</span><span class="pc">%</span></span>{:else}{pct(ratePct)}{/if}{#if range !== RANGES[0]}<span class="rng">±{Math.round(range * 100)}</span>{/if}</button>
    <!-- #18 (UI audit flag): visual-tempo-match marks the tempos as matched (the handle's line takes the other deck's colour). -->
    <div class="pitch-fader" class:matched={tempoMatched}>
      <!-- #109 (UI audit flag): quiet-readouts: the tempo % above the fader already shows its value. -->
      <Fader vertical big tick value={pitch} min={-1} max={1} reset={0} label="{Dn} pitch" onchange={setPitch} shown={flag('quiet-readouts')}
        format={(v) => pct(-v * range * 100)} {ghost} match={tempoMatch}
        note={pitchNote} />
    </div>
    {#if d.slip}
      <!-- Slip is set in Settings > Decks or with its key; the deck only
           shows it while it's on, so it's never on by surprise. -->
      <button class="range lock on" aria-pressed="true" aria-label="{Dn} slip on, click to turn off" {...press(() => toggleSlip(deck))}
        use:tip={slipTip}>Slip</button>
    {:else if flag('no-shift-pitch') && engine.decks[1 - deck].slip}
      <!-- #5 (UI audit flag): no-shift-pitch keeps Slip's row on this deck too while the other deck has it, so the decks mirror. -->
      <div class="slip-room" aria-hidden="true"></div>
    {/if}
    <div class="nudge">
      {#each [{ v: -0.04, label: 'Nudge slower', glyph: '‹', id: 'slower' }, { v: 0.04, label: 'Nudge faster', glyph: '›', id: 'faster' }] as n}
        <button aria-label={n.label} aria-disabled={!t}
          onpointerdown={(e) => e.button === 0 && bend(n.v)()} onpointerup={bend(0)} onpointerleave={bend(0)}
          onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), bend(n.v)())}
          onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && bend(0)()}
          use:tip={() => nudgeTip(n)}>{nudgeGlyph(n)}</button>
      {/each}
    </div>
    <button class="range lock kl" class:on={d.keylock} aria-pressed={d.keylock} {...press(toggleKeylock)}
      use:tip={() => (d.keylock ? 'Key lock on: tempo changes keep the pitch' : 'Key lock off: tempo changes raise or lower the pitch')}>Key lock</button>
  </div>
</section>

<style>
  .deck {
    container-type: size;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px;
    gap: var(--pad);
    padding: var(--pad);
    min-width: 0;
    min-height: 0;
  }
  .deck.mirror {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .deck.mirror .pitch {
    order: -1;
  }
  /* The record and track info on top, the overview across the deck under
     them, then the tabs, cues and transport. The record's row is exactly the
     record and the overview's row exactly the overview, both set by the
     deck's height; the rest goes to the cues, so they get two rows when
     there's room and a compact one when there isn't. */
  .body {
    --rec: clamp(84px, 34cqh, 200px);
    --ov: clamp(32px, 11cqh, 60px);
    display: grid;
    grid-template-columns: var(--rec) minmax(0, 1fr) auto;
    grid-template-rows: var(--rec) var(--ov) minmax(var(--h-lg), 1fr) auto;
    grid-template-areas: 'rec head bpm' 'ov ov ov' 'mp mp mp' 'tr tr tr';
    column-gap: 24px;
    row-gap: 6px;
    min-width: 0;
    min-height: 0;
  }
  .mirror .body {
    grid-template-columns: auto minmax(0, 1fr) var(--rec);
    grid-template-areas: 'bpm head rec' 'ov ov ov' 'mp mp mp' 'tr tr tr';
  }
  .rec-cell {
    grid-area: rec;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .body > .mp { grid-area: mp; }
  .body > .transport { grid-area: tr; }
  .body > .overview { grid-area: ov; margin: 4px 0 2px; }
  /* The title, beside the record. */
  header {
    grid-area: head;
    align-self: center;
    min-width: 0;
  }
  .mirror header {
    text-align: right;
  }
  .name {
    font-size: var(--t-lg);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 28px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name.dim {
    color: var(--fg-3);
  }
  .artist {
    color: var(--fg-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Tempo and key in the deck's inner top corner. */
  .bpm {
    grid-area: bpm;
    align-self: center;
    display: grid;
    justify-items: end;
  }
  .mirror .bpm {
    justify-items: start;
  }
  /* A narrow deck (a small window) has no room for the title between the
     record and the tempo, so the tempo and key go under the title. */
  @container (max-width: 500px) {
    .body,
    .mirror .body {
      grid-template-rows: auto auto var(--ov) minmax(var(--h-lg), 1fr) auto;
    }
    .body {
      grid-template-columns: var(--rec) minmax(0, 1fr);
      grid-template-areas: 'rec head' 'rec bpm' 'ov ov' 'mp mp' 'tr tr';
    }
    .mirror .body {
      grid-template-columns: minmax(0, 1fr) var(--rec);
      grid-template-areas: 'head rec' 'bpm rec' 'ov ov' 'mp mp' 'tr tr';
    }
    .rec-cell {
      height: var(--rec);
    }
    header {
      align-self: end;
    }
    .bpm {
      align-self: start;
      justify-items: start;
    }
    .mirror .bpm {
      justify-items: end;
    }
  }
  .bpm .big {
    font-size: var(--t-xl);
    font-weight: 300;
    line-height: 36px;
    letter-spacing: -0.03em;
  }
  .bpm .edit {
    width: 4.2em;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font-family: inherit;
    text-align: right;
    border-radius: 4px;
    box-shadow: 0 0 0 1px var(--fg-3);
  }
  .bpm .unit {
    font-size: var(--t-md);
    font-weight: 300;
    line-height: 22px;
  }
  /* A recessed well: darker than the glass, with an inner shadow. */
  .overview {
    position: relative;
    border-radius: var(--r);
    overflow: hidden;
    min-height: 0;
    background: var(--well);
    box-shadow: var(--well-shadow);
  }
  .overview :global(.wave) {
    height: 100%;
  }

  /* Tabs, the mode row and the transport share the deck's four columns, so
     the tab bar spans the deck and every edge lines up. */
  .mp {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 8px;
    min-height: 0;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    border-bottom: 1px solid var(--line);
  }
  .modes button {
    position: relative;
    height: var(--h-md);
    border: 0;
    background: none;
    color: var(--fg-3);
    font: 400 var(--t-sm) var(--font);
    transition: color 140ms ease;
  }
  .modes button:hover {
    color: var(--fg);
  }
  .modes button.on {
    color: var(--fg);
  }
  .modes button.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 1px;
    background: var(--deck);
  }
  /* Something in that mode is on (a loop, an effect, a muted stem). */
  .modes i {
    display: inline-block;
    width: 4px;
    height: 4px;
    margin-left: 6px;
    vertical-align: 2px;
    border-radius: 50%;
    background: var(--deck);
  }
  .strip {
    min-height: var(--h-lg);
    display: grid;
    align-items: center;
  }
  /* The hot cues fit themselves to the room the deck has (two rows, or one
     compact row in a short window), so they measure the strip. */
  .strip.cues {
    container-type: size;
  }
  .transport {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .transport > :global(*) {
    height: var(--h-lg);
    min-width: 0;
    padding: 0;
  }
  .cue {
    color: var(--cue);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cue) 55%, transparent);
  }
  .cue:hover:not([aria-disabled='true']),
  .cue.lit {
    color: var(--cue);
    box-shadow: inset 0 0 0 1.5px var(--cue);
  }
  /* The one solid control. */
  .play,
  .play:hover:not([aria-disabled='true']) {
    background: var(--fg);
    color: var(--ink);
    box-shadow: none;
  }
  .play[aria-disabled='true'] {
    opacity: 0.35;
  }
  .play svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }
  .sync {
    color: var(--fg-2);
  }
  .sync.on,
  .sync.on:hover {
    color: var(--deck);
    background: color-mix(in srgb, var(--deck) 12%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--deck) 55%, transparent);
  }
  .jumps {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .jumps:hover:not([aria-disabled='true']) {
    background: none;
  }
  .jumps button {
    height: 100%;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
    font: 400 var(--t-md) var(--font);
  }
  .jumps button:hover:not([aria-disabled='true']) {
    background: var(--hover);
    color: var(--fg);
  }
  .jumps button[aria-disabled='true'] {
    opacity: 0.4;
  }
  .jumps span {
    font-size: var(--t-xs);
    color: var(--fg-3);
  }

  .pitch {
    display: grid;
    /* Key lock is always last, so it lines up with the transport row. */
    grid-template-rows: 28px minmax(0, 1fr);
    grid-auto-rows: auto;
    justify-items: center;
    align-items: center;
    gap: 8px;
    min-height: 0;
  }
  .val {
    display: grid;
    justify-items: center;
    padding: 2px 4px;
    border: 0;
    border-radius: 6px;
    background: none;
    font-family: inherit;
    font-size: var(--t-xs);
    color: var(--fg-2);
  }
  .val:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .val.off {
    color: var(--fg);
  }
  /* The fader range, shown only when it isn't the usual ±8. */
  .rng {
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .pitch-fader {
    display: flex;
    justify-content: center;
    height: 100%;
    min-height: 0;
    width: 100%;
  }
  .nudge {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
  .nudge button {
    height: var(--h-sm);
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    font: 400 var(--t-md) var(--font);
  }
  .nudge button:hover:not([aria-disabled='true']) {
    background: var(--hover);
    color: var(--fg);
  }
  .range {
    height: var(--h-sm);
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-3);
    font: 400 var(--t-xs) var(--font);
  }
  .range:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .lock {
    width: 100%;
    padding: 0 4px;
    white-space: nowrap;
  }
  .kl {
    height: var(--h-lg);
    white-space: normal;
    line-height: 1.2;
  }
  .lock.on,
  .lock.on:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* The key opens the key shift menu: a chevron, as on the FX picker, says
     so, and hover gives it a fill like other ghost buttons. */
  .key {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin: 0 -2px 0 -5px;
    padding: 0 2px 0 5px;
    color: var(--deck);
    font: inherit;
    border: 0;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .key svg {
    width: 9px;
    height: 9px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    opacity: 0.7;
  }
  .key.shifted,
  .key:hover {
    color: var(--fg);
  }
  .key:hover {
    background: var(--hover);
  }
  .key:focus-visible {
    outline: 2px solid var(--deck);
    outline-offset: 1px;
  }
  /* Key shift, in semitones, after the key it gives. */
  .ks {
    margin-left: 0.35em;
    color: var(--deck);
  }
</style>
