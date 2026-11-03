<script>
  import Waveform from './Waveform.svelte';
  import Fader from './Fader.svelte';
  import { untrack } from 'svelte';
  import { engine, tracks, control } from './engine.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { announce } from './announce.svelte.js';

  /** @type {{ deck: number, onload: (deck: number, track: any) => void, onreveal: (path: string) => void }} */
  let { deck, onload, onreveal } = $props();

  const name = $derived(deck === 0 ? 'A' : 'B');
  const other = $derived(deck === 0 ? 'B' : 'A');
  const RANGES = [0.08, 0.16, 0.5];

  let range = $state(0.08);
  // Pitch fader position, -1..1. Up is slower, like a turntable.
  let pitch = $state(0);

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const ratePct = $derived((d.rate - 1) * 100);
  const bpm = $derived(d.bpm > 0 ? d.bpm * d.speed : 0);
  const atCue = $derived(!!t && !d.playing && Math.abs(d.position - d.cue) < 0.01);
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
      <div class="bpm" use:tip={() => (d.bpm > 0 ? `Track tempo ${d.bpm.toFixed(2)} BPM` : t ? 'No clear beat found' : '')}>
        <div class="big num">{bpm > 0 ? bpm.toFixed(2) : '—'}</div>
        <div class="unit">BPM</div>
      </div>
    </header>

    <div class="overview"><Waveform {deck} mode="overview" /></div>

    <div class="times">
      <span class="el num" aria-label="Elapsed">{fmt(d.position)}</span>
      <span class="rm num" aria-label="Remaining">{fmt(d.position - d.duration)}</span>
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
          <button class="btn sm" aria-label={n.label} aria-disabled={!t}
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
    <button class="range num" onclick={cycleRange} use:tip={() => `Pitch range ±${Math.round(range * 100)}%, click to change`}>±{Math.round(range * 100)}</button>
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
    grid-template-rows: auto minmax(56px, 1fr) auto auto;
    align-content: space-between;
    gap: 14px;
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
  .transport {
    display: flex;
    align-items: center;
    gap: 10px;
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
    grid-template-rows: auto minmax(0, 1fr) auto;
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
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--fg-3);
    font: 400 11px var(--font);
  }
  .range:hover {
    color: var(--fg-2);
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
</style>
