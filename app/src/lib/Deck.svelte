<script>
  import Waveform from './Waveform.svelte';
  import Fader from './Fader.svelte';
  import FxUnit from './FxUnit.svelte';
  import Performance from './Performance.svelte';
  import { untrack } from 'svelte';
  import { engine, tracks, control, nextGrid, setGrid } from './engine.svelte.js';
  import { pushEdit } from './undo.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { announce } from './announce.svelte.js';
  import { keyName, keyLongName, camelot, playingKey } from './key.js';
  import { toggleSlip } from './performance.js';

  /** @type {{ deck: number, onload: (deck: number, track: any) => void, onreveal: (path: string) => void }} */
  let { deck, onload, onreveal } = $props();

  const name = $derived(deck === 0 ? 'A' : 'B');

  // Fixing the beatgrid: right-click the BPM, or double-click it to type one.
  let editingBpm = $state(false);
  /** Applies a grid change, with Undo back to the grid before it. */
  async function gridEdit(op, label, value) {
    const t = tracks[deck];
    if (!t) return;
    const before = t.gridLocked ? t.beatgrid : null;
    const after = op === 'reset' ? null : nextGrid(t.beatgrid, op, d.position, value);
    if (op !== 'reset' && !after) return;
    await setGrid(deck, after);
    announce(`${label} on deck ${name}`);
    pushEdit({ label: `${label} on deck ${name}`, undo: () => setGrid(deck, before), redo: () => setGrid(deck, after) });
  }
  const gridMenu = (e) => {
    const t = tracks[deck];
    if (!t) return;
    const has = !!t.beatgrid;
    openMenu(e, [
      { label: 'Halve BPM', enabled: has, action: () => gridEdit('halve', 'Halved the BPM') },
      { label: 'Double BPM', enabled: has, action: () => gridEdit('double', 'Doubled the BPM') },
      { label: 'Set BPM…', action: () => (editingBpm = true) },
      '-',
      { label: 'Set downbeat at play head', enabled: has, action: () => gridEdit('downbeat', 'Moved the downbeat') },
      { label: 'Move grid earlier', enabled: has, action: () => gridEdit('nudge', 'Moved the grid earlier', -0.01) },
      { label: 'Move grid later', enabled: has, action: () => gridEdit('nudge', 'Moved the grid later', 0.01) },
      '-',
      { label: 'Reset to detected grid', enabled: !!t.gridLocked, action: () => gridEdit('reset', 'Reset the beatgrid') },
    ]);
  };
  const focusBpm = (node) => {
    node.focus();
    node.select();
  };
  function bpmKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') finishBpm(e.currentTarget.value);
    else if (e.key === 'Escape') editingBpm = false;
  }
  function finishBpm(text) {
    if (!editingBpm) return;
    editingBpm = false;
    const v = parseFloat(String(text).replace(',', '.'));
    if (v > 0 && Math.abs(v - d.bpm) > 1e-6) gridEdit('bpm', `Set the BPM to ${+v.toFixed(2)}`, v);
  }
  const other = $derived(deck === 0 ? 'B' : 'A');
  const RANGES = [0.08, 0.16, 0.5];

  let range = $state(0.08);

  // The performance strip shows one set of controls at a time (hot cues,
  // loop and beat jump, or effects) so the deck stays calm. Keys and the
  // controller reach all of them whichever is showing.
  const MODES = [
    { id: 'cues', label: 'Cues' },
    { id: 'loop', label: 'Loop' },
    { id: 'fx', label: 'FX' },
  ];
  const storageKey = () => `oss-dj.deckMode.${deck}`;
  /** @type {'cues' | 'loop' | 'fx'} */
  let mode = $state('cues');
  try {
    const saved = localStorage.getItem(storageKey());
    if (MODES.some((m) => m.id === saved)) mode = /** @type {any} */ (saved);
  } catch {}
  function setMode(m) {
    mode = m;
    try {
      localStorage.setItem(storageKey(), m);
    } catch {}
  }
  function modeKey(e) {
    const i = MODES.findIndex((m) => m.id === mode);
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    setMode(MODES[(i + dir + MODES.length) % MODES.length].id);
    /** @type {HTMLElement} */ (e.currentTarget.querySelector('[aria-selected="true"]'))?.focus();
  }
  // Pitch fader position, -1..1. Up is slower, like a turntable.
  let pitch = $state(0);

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const ratePct = $derived((d.rate - 1) * 100);
  const bpm = $derived(d.bpm > 0 ? d.bpm * d.speed : 0);
  const atCue = $derived(!!t && !d.playing && Math.abs(d.position - d.cue) < 0.01);
  const pk = $derived(t ? playingKey(d.key, d.speed, d.keylock) : null);
  const canSync = $derived(!!t && d.bpm > 0 && engine.decks[1 - deck].bpm > 0);

  let lastTouch = 0;

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
      range = r;
      pitch = Math.max(-1, Math.min(1, (1 - rate) / r));
    });
  });

  function cycleRange() {
    range = RANGES[(RANGES.indexOf(range) + 1) % RANGES.length];
    setPitch(pitch);
  }

  function fmt(s) {
    if (!isFinite(s)) return '0:00.0';
    const sign = s < 0 ? '−' : '';
    s = Math.abs(s);
    const m = Math.floor(s / 60);
    const sec = (s - m * 60).toFixed(1).padStart(4, '0');
    return `${sign}${m}:${sec}`;
  }
  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

  // Buttons act on pointer-down so a press is felt at once; keyboard
  // activation (a click with no pointer) still works.
  const press = (fn) => ({
    onpointerdown: (e) => e.button === 0 && fn(),
    onclick: (e) => e.detail === 0 && fn(),
  });
  const play = () => t && control({ type: 'togglePlay', deck });
  const sync = () => {
    if (!canSync) return;
    control({ type: 'sync', deck });
    announce(`Deck ${name} synced to deck ${other}`);
  };
  const toggleKeylock = () => control({ type: 'setKeylock', deck, on: !d.keylock });
  const slipTip = () =>
    tipText(
      d.slip ? 'Slip on: after a scratch, loop, held hot cue or pause, the track picks up where it would have been' : 'Slip off',
      keyLabel(`deck.${deck}.slip`),
    );
  const keyTip = () => {
    if (!pk) return '';
    const track = `${keyLongName(d.key)} (${camelot(d.key)})`;
    if (!pk.shift) return `Key ${track}`;
    const st = Math.abs(pk.shift) === 1 ? 'semitone' : 'semitones';
    return `Key ${keyLongName(pk)} (${camelot(pk)}): the track is in ${track}, shifted ${pk.shift > 0 ? 'up' : 'down'} ${Math.abs(pk.shift)} ${st} by the tempo. Key lock keeps the original key.`;
  };
  const bend = (v) => () => t && control({ type: 'setBend', deck, bend: v });

  const regionLabel = $derived(
    t ? `Deck ${name}, ${t.title}${t.artist ? ` by ${t.artist}` : ''}, ${d.playing ? 'playing' : 'paused'}${bpm ? `, ${bpm.toFixed(0)} BPM` : ''}` : `Deck ${name}, empty`,
  );
  const headerMenu = (e) =>
    openMenu(e, [{ label: 'Show in library', action: () => onreveal(t.path), enabled: !!t }]);
</script>

<section class="deck" class:mirror={deck === 1} style:--deck={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'}
  style:--drop-color={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} aria-label={regionLabel} data-region="deck{deck}"
  use:dropTarget={{ ondrop: (track) => onload(deck, track), blocked: () => d.playing }}>
  <div class="body">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header oncontextmenu={headerMenu}>
      <span class="letter" aria-hidden="true">{name}</span>
      <div class="title">
        {#if t}
          <div class="name" use:tip={() => t.path}>{t.title}</div>
          <div class="artist">{t.artist || 'Unknown artist'}</div>
        {:else}
          <div class="name dim">Empty deck</div>
          <div class="artist">Drag a track here or press {keyLabel(`deck.${deck}.load`)}</div>
        {/if}
      </div>
      <div class="bpm" oncontextmenu={gridMenu} ondblclick={() => t && (editingBpm = true)} role="group" aria-label="Tempo"
        use:tip={() => (editingBpm ? '' : d.bpm > 0 ? `Track tempo ${d.bpm.toFixed(2)} BPM${t?.gridLocked ? ', beatgrid fixed by hand' : ''}. Right-click to fix the beatgrid` : t ? 'No clear beat found. Double-click to set the BPM' : '')}>
        {#if editingBpm}
          <input class="big num edit" value={d.bpm > 0 ? +d.bpm.toFixed(2) : ''} inputmode="decimal" aria-label="Track BPM" spellcheck="false"
            use:focusBpm onkeydown={bpmKey} onblur={(e) => finishBpm(e.currentTarget.value)} />
        {:else}
          <div class="big num">{bpm > 0 ? bpm.toFixed(2) : '—'}</div>
        {/if}
        <div class="unit">{#if pk}<span class="key" class:shifted={pk.shift} use:tip={keyTip}>{keyName(pk)}</span>{" · "}{/if}BPM</div>
      </div>
    </header>

    <div class="overview"><Waveform {deck} mode="overview" /></div>

    <div class="times">
      <span class="el num"><span class="sr">Elapsed </span>{fmt(d.position)}</span>
      <div class="modes" role="tablist" aria-label="Deck {name} controls" tabindex="-1" onkeydown={modeKey}>
        {#each MODES as m}
          {@const busy = (m.id === 'loop' && d.looping) || (m.id === 'fx' && (d.fx?.on || Math.abs(d.filter ?? 0) >= 0.02))}
          <button role="tab" class:on={mode === m.id} aria-selected={mode === m.id} tabindex={mode === m.id ? 0 : -1}
            onclick={() => setMode(m.id)} use:tip={() => (busy ? `${m.label} (active)` : m.label)}>
            {m.label}{#if busy}<i aria-label="active"></i>{/if}
          </button>
        {/each}
      </div>
      <span class="rm num"><span class="sr">Remaining </span>{fmt(d.position - d.duration)}</span>
    </div>

    <div class="strip" role="tabpanel" aria-label={MODES.find((m) => m.id === mode)?.label}>
      {#if mode === 'fx'}
        <FxUnit {deck} />
      {:else}
        <Performance {deck} show={mode === 'loop' ? 'loop' : 'cues'} />
      {/if}
    </div>

    <div class="transport">
      <button class="btn big cue" class:lit={atCue} aria-disabled={!t}
        onpointerdown={(e) => e.button === 0 && t && control({ type: 'cuePress', deck })}
        onpointerup={() => t && control({ type: 'cueRelease', deck })}
        onpointerleave={(e) => e.buttons && t && control({ type: 'cueRelease', deck })}
        onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && t && (e.preventDefault(), control({ type: 'cuePress', deck }))}
        onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && t && control({ type: 'cueRelease', deck })}
        use:tip={() => (t ? tipText('Cue', keyLabel(`deck.${deck}.cue`), 'hold to preview') : `Load a track onto deck ${name} first`)}
      >Cue</button>
      <button class="btn big play" class:on={d.playing} aria-disabled={!t} aria-pressed={d.playing} aria-label={d.playing ? 'Pause' : 'Play'}
        {...press(play)} use:tip={() => (t ? tipText(d.playing ? 'Pause' : 'Play', keyLabel(`deck.${deck}.play`)) : `Load a track onto deck ${name} first`)}>
        {#if d.playing}
          <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        {:else}
          <svg viewBox="0 0 16 16"><path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" /></svg>
        {/if}
      </button>
      <span class="sp"></span>
      <button class="btn sm" aria-disabled={!canSync} {...press(sync)}
        use:tip={() => (canSync ? tipText(`Match tempo and beats to deck ${other}`, keyLabel(`deck.${deck}.sync`)) : `Sync needs a beat on both decks`)}>Sync</button>
      <div class="nudge">
        {#each [{ v: -0.04, label: 'Nudge slower', glyph: '‹', id: 'slower' }, { v: 0.04, label: 'Nudge faster', glyph: '›', id: 'faster' }] as n}
          <button class="btn sm ghost" aria-label={n.label} aria-disabled={!t}
            onpointerdown={(e) => e.button === 0 && bend(n.v)()} onpointerup={bend(0)} onpointerleave={bend(0)}
            onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), bend(n.v)())}
            onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && bend(0)()}
            use:tip={() => tipText(n.label, keyLabel(`deck.${deck}.${n.id}`), 'hold')}>{n.glyph}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="pitch">
    <span class="val num" class:off={Math.abs(ratePct) > 0.005}>{pct(ratePct)}</span>
    <div class="pitch-fader">
      <Fader vertical big tick value={pitch} min={-1} max={1} reset={0} label="Deck {name} pitch" onchange={setPitch}
        format={(v) => pct(-v * range * 100)} />
    </div>
    <button class="range num" onclick={cycleRange} aria-label="Deck {name} pitch range, plus or minus {Math.round(range * 100)} percent" use:tip={() => `Pitch range ±${Math.round(range * 100)}%, click to change`}>±{Math.round(range * 100)}</button>
    <button class="range lock" class:on={d.keylock} aria-pressed={d.keylock} {...press(toggleKeylock)}
      use:tip={() => (d.keylock ? 'Key lock on: tempo changes keep the pitch' : 'Key lock off: tempo changes raise or lower the pitch')}>Key lock</button>
    <button class="range lock" class:on={d.slip} aria-pressed={!!d.slip} aria-disabled={!t} {...press(() => toggleSlip(deck))}
      use:tip={slipTip}>Slip</button>
  </div>
</section>

<style>
  .deck {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px;
    gap: 0 22px;
    padding: 18px 20px 16px;
    min-width: 0;
    min-height: 0;
  }
  .deck.mirror {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .deck.mirror .pitch {
    order: -1;
  }
  .body {
    display: grid;
    grid-template-rows: auto minmax(48px, 1fr) auto auto auto;
    align-content: space-between;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }
  .letter {
    flex: none;
    width: 22px;
    height: 22px;
    margin-top: 2px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--deck);
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.015em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name.dim {
    color: var(--fg-3);
  }
  .artist {
    margin-top: 2px;
    color: var(--fg-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bpm {
    flex: none;
    text-align: right;
  }
  .bpm .big {
    font-size: 30px;
    line-height: 1;
    letter-spacing: -0.02em;
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
    user-select: text;
  }
  .bpm .unit {
    margin-top: 6px;
    font-size: 11px;
    color: var(--fg-3);
  }
  .overview {
    position: relative;
    border-radius: 4px;
    overflow: hidden;
    min-height: 0;
  }
  .overview :global(.wave) {
    height: 100%;
  }
  .times {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .el {
    font-size: 26px;
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .rm {
    font-size: 18px;
    line-height: 1;
    color: var(--fg-3);
  }
  .modes {
    display: flex;
    gap: 2px;
    align-self: center;
  }
  .modes button {
    position: relative;
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    font: 400 12px var(--font);
    transition: color 0.12s, background-color 0.12s;
  }
  .modes button:hover {
    color: var(--fg-2);
  }
  .modes button.on {
    background: var(--raise);
    color: var(--fg);
  }
  .modes i {
    position: absolute;
    top: 4px;
    right: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--deck);
  }
  .strip {
    min-height: 32px;
    display: flex;
    align-items: center;
  }
  .strip > :global(*) {
    flex: 1;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  /* A narrow deck (small window, or the interface zoomed in) puts Sync and
     nudge on a second line instead of running into the pitch fader. */
  .body {
    container-type: inline-size;
  }
  @container (max-width: 345px) {
    .transport {
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .transport .btn.big {
      flex: 1;
      min-width: 0;
    }
    .sp {
      flex-basis: 100%;
      height: 0;
    }
  }
  .sp {
    flex: 1;
  }
  .btn.big {
    height: 52px;
    min-width: 84px;
    font-size: 14px;
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
  .play {
    color: var(--go);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--go) 55%, transparent);
  }
  .play:hover:not([aria-disabled='true']) {
    color: var(--go);
    box-shadow: inset 0 0 0 1.5px var(--go);
  }
  .play.on,
  .play.on:hover {
    background: var(--go);
    color: #04140b;
    box-shadow: none;
  }
  .play svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
  .nudge {
    display: flex;
    gap: 6px;
  }
  .nudge .btn {
    width: 36px;
    padding: 0;
    font-size: 15px;
  }
  .pitch {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    justify-items: center;
    gap: 10px;
    padding-top: 2px;
    min-height: 0;
  }
  .val {
    font-size: 12px;
    color: var(--fg-3);
  }
  .val.off {
    color: var(--fg-2);
  }
  .pitch-fader {
    display: flex;
    justify-content: center;
    min-height: 0;
    width: 100%;
  }
  .range {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    font: 400 11px var(--font);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .range:hover {
    color: var(--fg);
    background: var(--raise);
  }
  .lock {
    padding: 0 6px;
    white-space: nowrap;
  }
  .lock.on,
  .lock.on:hover {
    color: var(--deck);
    box-shadow: inset 0 0 0 1px var(--deck);
  }
  .key {
    color: var(--fg-2);
  }
  .key.shifted {
    color: var(--fg);
  }
</style>
