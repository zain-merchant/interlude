<script>
  // Shared Stage: the classic deck-mixer-deck layout, but the waveforms on
  // top are One Stage's: A rises above the line and B hangs below it, so the
  // beats line up in one view.
  import Backdrop from './Backdrop.svelte';
  import Library from './Library.svelte';
  import DeckCard from './DeckCard.svelte';
  import MixerCard from './MixerCard.svelte';
  import Wave from '../bold/Wave.svelte';
  import { decks } from '../bold/track.js';

  const C = ['#4aa8ff', '#ff8a4a'];
  const W = [
    { low: '#2456ff', mid: '#4aa8ff', high: '#d6f0ff' },
    { low: '#ff4d2e', mid: '#ff8a4a', high: '#ffe2c4' },
  ];
</script>

<div class="lq-root l5">
  <Backdrop dim={0.8} />
  <div class="shell">
    <section class="lq-glass stage">
      <div class="ln"><Wave deck={0} kind="ribbon" opts={{ ...W[0], side: 'up', glow: 0.6, seconds: 18, grid: 'rgba(255,255,255,0.035)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[0], past: 'rgba(6,6,10,0.45)' }} /></div>
      <div class="ln"><Wave deck={1} kind="ribbon" opts={{ ...W[1], side: 'down', glow: 0.6, seconds: 18, grid: 'rgba(255,255,255,0.035)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[1], past: 'rgba(6,6,10,0.45)' }} /></div>
      <span class="lbl a" style:--c={C[0]}><b>A</b>{decks[0].title}</span>
      <span class="lbl b" style:--c={C[1]}><b>B</b>{decks[1].title}</span>
      <span class="sync"><i></i>129.00 · synced</span>
    </section>
    <div class="row">
      <DeckCard k={0} color={C[0]} bands={W[0]} />
      <MixerCard colors={C} />
      <DeckCard k={1} color={C[1]} bands={W[1]} pitch="−0.78" />
    </div>
    <section class="lq-glass lib"><Library rows={4} sel={2} /></section>
  </div>
</div>

<style>
  .shell { position: relative; height: 100%; box-sizing: border-box; display: grid; grid-template-rows: 210px minmax(0, 1fr) auto; gap: 14px; padding: 16px 20px; }
  .stage { position: relative; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; }
  .ln { position: relative; min-height: 0; }
  .ln + .ln { box-shadow: 0 -1px 0 rgb(255 255 255 / 0.22); }
  .lbl { position: absolute; left: 14px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: rgb(242 241 236 / 0.85); }
  .lbl b { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; color: #0a0a0c; background: var(--c); }
  .lbl.a { top: 10px; }
  .lbl.b { bottom: 10px; }
  .sync { position: absolute; right: 14px; top: 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgb(242 241 236 / 0.7); }
  .sync i { width: 7px; height: 7px; border-radius: 50%; background: #5ee08a; box-shadow: 0 0 10px #5ee08a; }
  .row { display: grid; grid-template-columns: 1fr 330px 1fr; gap: 14px; min-height: 0; }
  .lib { padding: 6px 8px; }
</style>
