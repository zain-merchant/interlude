<script>
  import Waveform from './Waveform.svelte';
  import Fader from './Fader.svelte';
  import FxUnit from './FxUnit.svelte';
  import Performance from './Performance.svelte';
  import Stems from './Stems.svelte';
  import { untrack } from 'svelte';
  import { padMode, padModeTab } from './padmode.svelte.js';
  import { tempoPickup } from './pickup.svelte.js';
  import { engine, tracks, control, nextGrid, setGrid } from './engine.svelte.js';
  import { pushEdit } from './undo.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { flag } from '../flags/registry.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { announce } from './announce.svelte.js';
  import { keyName, keyLongName, camelot, playingKey, keysMix } from './key.js';
  import { toggleSlip, beatJump, hasGrid, beatsLabel } from './performance.js';

  /** @type {{ deck: number, onload: (deck: number, track: any) => void, onreveal: (path: string) => void, onsettings?: (page: string) => void }} */
  let { deck, onload, onreveal, onsettings } = $props();

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
  ];
  const storageKey = () => `oss-dj.deckMode.${deck}`;
  /** @type {'cues' | 'loop' | 'fx' | 'stems'} */
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
    /** @type {HTMLElement} */ (e.currentTarget.querySelector('[aria-selected="true"]'))?.focus();
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
  const pk = $derived(t ? playingKey(d.key, d.rate, d.keylock) : null);
  const canSync = $derived(!!t && d.bpm > 0 && engine.decks[1 - deck].bpm > 0);
  // #18 (UI audit flag): this deck's key mixes with the other deck's (as each sounds now); class:mix on .key.
  const keyMix = $derived.by(() => {
    if (!flag('visual-key-match') || !pk || !tracks[1 - deck]) return false;
    const o = engine.decks[1 - deck];
    return keysMix(pk, playingKey(o.key, o.rate, o.keylock));
  });

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
    announce(`Deck ${name} pitch range plus or minus ${Math.round(range * 100)} percent`);
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
    tipText('Slip on: after a scratch, loop, held hot cue or pause, the track picks up where it would have been. Click to turn off', keyLabel(`deck.${deck}.slip`));
  const rangeTip = () => `Tempo ${pct(ratePct)}, fader range ±${Math.round(range * 100)}%. Click to change the range`;
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
        <!-- #10 (UI audit flag): key, Camelot code and unit set apart by space and tone, not middle dots. -->
        {#if flag('no-dots')}
          <div class="unit">{#if pk}<span class="key" class:shifted={pk.shift} class:mix={keyMix} use:tip={keyTip}>{keyName(pk)} <span class="cam">{camelot(pk)}</span></span>{' '}{/if}<span class="u">BPM</span></div>
        {:else}
        <div class="unit">{#if pk}<span class="key" class:shifted={pk.shift} class:mix={keyMix} use:tip={keyTip}>{keyName(pk)} · {camelot(pk)}</span>{" · "}{/if}BPM</div>
        {/if}
      </div>
    </header>

    <div class="overview"><Waveform {deck} mode="overview" /></div>

    <div class="times">
      <span class="el num"><span class="sr">Elapsed </span>{fmt(d.position)}</span>
      <span class="rm num"><span class="sr">Remaining </span>{fmt(d.position - d.duration)}</span>
    </div>

    <div class="mp">
      <div class="modes" role="tablist" aria-label="Deck {name} controls" tabindex="-1" onkeydown={modeKey}>
        {#each MODES as m}
          {@const busy = (m.id === 'loop' && d.looping) || (m.id === 'fx' && d.fx?.on) || (m.id === 'stems' && (d.stems ?? 15) !== 15)}
          <button role="tab" class:on={mode === m.id} aria-selected={mode === m.id} tabindex={mode === m.id ? 0 : -1}
            onclick={() => setMode(m.id)} use:tip={() => (busy ? `${m.label} (active)` : m.label)}>
            {m.label}{#if busy}<i aria-label="active"></i>{/if}
          </button>
        {/each}
      </div>

    <div class="strip" role="tabpanel" aria-label={MODES.find((m) => m.id === mode)?.label}>
      {#if mode === 'fx'}
        <FxUnit {deck} />
      {:else if mode === 'stems'}
        <Stems {deck} onsettings={() => onsettings?.('stems')} />
      {:else}
        <Performance {deck} show={mode === 'loop' ? 'loop' : 'cues'} />
      {/if}
    </div>
    </div>

    <div class="transport">
      <button class="btn cue" class:lit={atCue} aria-disabled={!t}
        onpointerdown={(e) => e.button === 0 && t && control({ type: 'cuePress', deck })}
        onpointerup={() => t && control({ type: 'cueRelease', deck })}
        onpointerleave={(e) => e.buttons && t && control({ type: 'cueRelease', deck })}
        onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && t && (e.preventDefault(), control({ type: 'cuePress', deck }))}
        onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && t && control({ type: 'cueRelease', deck })}
        use:tip={() => (t ? tipText('Cue', keyLabel(`deck.${deck}.cue`), 'hold to preview') : `Load a track onto deck ${name} first`)}
      >Cue</button>
      <button class="btn play" class:on={d.playing} aria-disabled={!t} aria-pressed={d.playing} aria-label={d.playing ? 'Pause' : 'Play'}
        {...press(play)} use:tip={() => (t ? tipText(d.playing ? 'Pause' : 'Play', keyLabel(`deck.${deck}.play`)) : `Load a track onto deck ${name} first`)}>
        {#if d.playing}
          <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        {:else}
          <svg viewBox="0 0 16 16"><path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" /></svg>
        {/if}
      </button>
      <button class="btn sync" aria-disabled={!canSync} {...press(sync)}
        use:tip={() => (canSync ? tipText(`Match tempo and beats to deck ${other}`, keyLabel(`deck.${deck}.sync`)) : `Sync needs a beat on both decks`)}>Sync</button>
      <div class="btn jumps" role="group" aria-label="Beat jump">
        {#each [{ dir: -1, id: 'jumpBack', label: 'Jump back', glyph: '‹' }, { dir: 1, id: 'jumpForward', label: 'Jump forward', glyph: '›' }] as j, i}
          <button aria-label="{j.label} {jumpSize} {d.loopBeats === 1 ? 'beat' : 'beats'}" aria-disabled={!grid} style:order={i * 2}
            onpointerdown={(e) => e.button === 0 && beatJump(deck, j.dir, e.shiftKey)} onclick={(e) => e.detail === 0 && beatJump(deck, j.dir, e.shiftKey)}
            use:tip={() => (grid ? tipText(`${j.label} ${jumpSize} ${d.loopBeats === 1 ? 'beat' : 'beats'}`, keyLabel(`deck.${deck}.${j.id}`), `⇧ for 4 bars (${keyLabel(`deck.${deck}.${j.id}Long`)})`) : 'Needs a beatgrid')}>{j.glyph}</button>
        {/each}
        <span class="num" style:order="1">{jumpSize}</span>
      </div>
    </div>
  </div>

  <div class="pitch">
    <button class="val num" class:off={Math.abs(ratePct) > 0.005} onclick={cycleRange}
      aria-label="Deck {name} tempo {pct(ratePct)}, pitch range plus or minus {Math.round(range * 100)} percent. Click to change the range"
      use:tip={rangeTip}>{pct(ratePct)}{#if range !== RANGES[0]}<span class="rng">±{Math.round(range * 100)}</span>{/if}</button>
    <div class="pitch-fader">
      <Fader vertical big tick value={pitch} min={-1} max={1} reset={0} label="Deck {name} pitch" onchange={setPitch}
        format={(v) => pct(-v * range * 100)} {ghost}
        note={pickupRate === null ? '' : `The controller's tempo fader is at ${pct((pickupRate - 1) * 100)}. Move it to the marker and it takes over`} />
    </div>
    {#if d.slip}
      <!-- Slip is set in Settings > Decks or with its key; the deck only
           shows it while it's on, so it's never on by surprise. -->
      <button class="range lock on" aria-pressed="true" aria-label="Deck {name} slip on, click to turn off" {...press(() => toggleSlip(deck))}
        use:tip={slipTip}>Slip</button>
    {/if}
    <div class="nudge">
      {#each [{ v: -0.04, label: 'Nudge slower', glyph: '‹', id: 'slower' }, { v: 0.04, label: 'Nudge faster', glyph: '›', id: 'faster' }] as n}
        <button aria-label={n.label} aria-disabled={!t}
          onpointerdown={(e) => e.button === 0 && bend(n.v)()} onpointerup={bend(0)} onpointerleave={bend(0)}
          onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), bend(n.v)())}
          onkeyup={(e) => (e.key === ' ' || e.key === 'Enter') && bend(0)()}
          use:tip={() => tipText(n.label, keyLabel(`deck.${deck}.${n.id}`), 'hold')}>{n.glyph}</button>
      {/each}
    </div>
    <button class="range lock kl" class:on={d.keylock} aria-pressed={d.keylock} {...press(toggleKeylock)}
      use:tip={() => (d.keylock ? 'Key lock on: tempo changes keep the pitch' : 'Key lock off: tempo changes raise or lower the pitch')}>Key lock</button>
  </div>
</section>

<style>
  .deck {
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
  .body {
    display: grid;
    grid-template-rows: auto minmax(32px, 48px) auto 1fr auto;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .title {
    flex: 1;
    min-width: 0;
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
  .bpm {
    flex: none;
    display: grid;
    justify-items: end;
  }
  .bpm .big {
    font-size: var(--t-xl);
    font-weight: 300;
    line-height: 28px;
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
    font-size: var(--t-xs);
    line-height: 17px;
    color: var(--fg-3);
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
  .times {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .el {
    font-size: var(--t-lg);
    font-weight: 300;
    line-height: 28px;
    letter-spacing: -0.03em;
  }
  .rm {
    font-size: var(--t-md);
    font-weight: 300;
    color: var(--fg-2);
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
  .key {
    color: var(--fg-3);
  }
  .key.shifted {
    color: var(--fg);
  }
</style>
