<script>
  import Waveform from './Waveform.svelte';
  import Fader from './Fader.svelte';
  import { untrack } from 'svelte';
  import { engine, tracks, control } from './engine.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { Button } from './components/ui/button/index.js';

  /** @type {{ deck: number, onload: (deck: number, track: any) => void }} */
  let { deck, onload } = $props();

  const name = $derived(deck === 0 ? 'A' : 'B');
  const accent = $derived(deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)');
  const RANGES = [0.08, 0.16, 0.5];

  let range = $state(0.08);
  // Pitch fader position, -1..1. Up is slower, like a turntable.
  let pitch = $state(0);

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const ratePct = $derived((d.rate - 1) * 100);

  const bpm = $derived(d.bpm > 0 ? d.bpm * d.speed : 0);

  let lastTouch = 0;

  function setPitch(v) {
    lastTouch = performance.now();
    pitch = v;
    control({ type: 'setRate', deck, rate: 1 - pitch * range });
  }

  // Keep the pitch fader in step when the engine changes the rate itself
  // (SYNC), widening the range if the new rate doesn't fit.
  // Ignores the engine for a moment after the fader moves, since the
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
    const sign = s < 0 ? '-' : '';
    s = Math.abs(s);
    const m = Math.floor(s / 60);
    const sec = (s - m * 60).toFixed(1).padStart(4, '0');
    return `${sign}${m}:${sec}`;
  }

  const bend = (v) => () => control({ type: 'setBend', deck, bend: v });
</script>

<section class="deck" class:mirror={deck === 1} style:--deck-accent={accent} style:--drop-color={accent}
  use:dropTarget={{ ondrop: (track) => onload(deck, track), blocked: () => d.playing }}>
  <div class="main">
    <header>
      <span class="badge">{name}</span>
      <div class="title">
        {#if t}
          <div class="name" title={t.path}>{t.title}</div>
          <div class="artist">{t.artist || ' '}</div>
        {:else}
          <div class="name dim">Empty deck</div>
          <div class="artist">Drag a track here from the library</div>
        {/if}
      </div>
      <div class="bpm" title={d.bpm > 0 ? `Track tempo ${d.bpm.toFixed(2)} BPM` : t ? 'No clear beat found' : ''}>
        <span class="mono">{bpm > 0 ? bpm.toFixed(1) : '—'}</span><small>BPM</small>
      </div>
    </header>

    <div class="times mono">
      <span>{fmt(d.position)}</span>
      <span class="remain">{fmt(d.position - d.duration)}</span>
    </div>

    <div class="overview"><Waveform {deck} mode="overview" /></div>

    <div class="transport">
      <button
        class="cue"
        class:lit={t && Math.abs(d.position - d.cue) < 0.01 && !d.playing}
        onpointerdown={() => control({ type: 'cuePress', deck })}
        onpointerup={() => control({ type: 'cueRelease', deck })}
        onpointerleave={(e) => e.buttons && control({ type: 'cueRelease', deck })}
        disabled={!t}
      >CUE</button>
      <button class="play" class:lit={d.playing} onclick={() => control({ type: 'togglePlay', deck })} disabled={!t} aria-label={d.playing ? 'Pause' : 'Play'}>
        {#if d.playing}
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        {:else}
          <svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
        {/if}
      </button>
      <Button variant="outline" class="sync" onclick={() => control({ type: 'sync', deck })} disabled={!t || !d.bpm || !engine.decks[1 - deck].bpm}
        title="Match tempo and beats to deck {deck === 0 ? 'B' : 'A'}">SYNC</Button>
      <div class="nudge">
        <Button variant="ghost" size="icon" class="touch-none text-muted-foreground" onpointerdown={bend(-0.04)} onpointerup={bend(0)} onpointerleave={bend(0)} title="Nudge slower (hold)" aria-label="Nudge slower">‹‹</Button>
        <Button variant="ghost" size="icon" class="touch-none text-muted-foreground" onpointerdown={bend(0.04)} onpointerup={bend(0)} onpointerleave={bend(0)} title="Nudge faster (hold)" aria-label="Nudge faster">››</Button>
      </div>
    </div>
  </div>

  <div class="pitch">
    <div class="rate mono" class:off={Math.abs(ratePct) > 0.005}>{ratePct >= 0 ? '+' : ''}{ratePct.toFixed(2)}%</div>
    <div class="pitch-fader">
      <Fader vertical value={pitch} min={-1} max={1} reset={0} label="Deck {name} pitch" onchange={setPitch} />
    </div>
    <Button variant="ghost" size="xs" class="text-muted-foreground" onclick={cycleRange} title="Pitch range">±{Math.round(range * 100)}</Button>
  </div>
</section>

<style>
  .deck {
    display: grid;
    grid-template-columns: 1fr 64px;
    gap: 14px;
    padding: 14px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  .deck.mirror {
    grid-template-columns: 64px 1fr;
  }
  .deck.mirror .pitch {
    order: -1;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    font-weight: 700;
    color: #0b0c0f;
    background: var(--deck-accent);
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name.dim {
    color: var(--muted-foreground);
  }
  .artist {
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bpm {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
  }
  .bpm span {
    font-size: 20px;
    font-weight: 600;
  }
  .bpm small {
    color: var(--muted-foreground);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 20px;
    font-weight: 500;
  }
  .remain {
    color: var(--muted-foreground);
  }
  .overview {
    flex: 1;
    min-height: 46px;
    max-height: 150px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .overview :global(.wave) {
    height: 100%;
  }
  .transport {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: auto;
  }
  .cue,
  .play {
    cursor: pointer;
    background: var(--panel-2);
    border-style: solid;
    transition: background-color 0.12s, border-color 0.12s, box-shadow 0.12s;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    letter-spacing: 0.06em;
    border-width: 2px;
    touch-action: none;
  }
  .cue {
    color: #ffb02e;
    border-color: #5a4419;
  }
  .cue.lit {
    background: #3a2a0c;
    border-color: #ffb02e;
    box-shadow: 0 0 18px -4px #ffb02e;
  }
  .play svg {
    width: 26px;
    height: 26px;
    fill: var(--ok);
  }
  .play {
    border-color: #1d5a37;
  }
  .play.lit {
    background: #0f2e1d;
    border-color: var(--ok);
    box-shadow: 0 0 18px -4px var(--ok);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .transport :global(.sync) {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--deck-accent);
  }
  .nudge {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
  .pitch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .rate {
    font-size: 12px;
    color: var(--muted-foreground);
  }
  .rate.off {
    color: var(--text);
  }
  .pitch-fader {
    flex: 1;
    display: flex;
    min-height: 100px;
  }
</style>
