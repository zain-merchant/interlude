<script>
  // Classic Glass and its variations: the traditional DJ layout (waveforms
  // on top, deck A, mixer, deck B, library below) in Liquid Glass.
  // look changes the decks' centrepiece; unified puts waveforms, decks and
  // mixer in one glass console instead of separate cards.
  import Backdrop from './Backdrop.svelte';
  import Library from './Library.svelte';
  import DeckCard from './DeckCard.svelte';
  import MixerCard from './MixerCard.svelte';
  import Wave from '../bold/Wave.svelte';
  import { decks } from '../bold/track.js';

  /** @type {{ look?: 'card'|'platter'|'oled', unified?: boolean }} */
  let { look = 'card', unified = false } = $props();

  const C = ['#4aa8ff', '#ff8a4a'];
  const W = [
    { low: '#2456ff', mid: '#4aa8ff', high: '#d6f0ff' },
    { low: '#ff4d2e', mid: '#ff8a4a', high: '#ffe2c4' },
  ];
</script>

<div class="lq-root l4" class:unified>
  <Backdrop dim={0.8} />
  <div class="shell">
    <div class="console" class:lq-glass={unified}>
      <section class="waves" class:lq-glass={!unified} class:oled={look === 'oled'}>
        {#each [0, 1] as k}
          <div class="ln" style:--c={C[k]}>
            <Wave deck={k} kind="ribbon" opts={{ ...W[k], glow: 0.6, seconds: 16, grid: 'rgba(255,255,255,0.03)', gridStrong: 'rgba(255,255,255,0.07)', headGlow: C[k], past: 'rgba(6,6,10,0.45)' }} />
            <span class="tag">{'AB'[k]}</span><span class="nm">{decks[k].title}</span>
          </div>
        {/each}
      </section>
      <div class="row">
        <DeckCard k={0} color={C[0]} bands={W[0]} {look} bare={unified} />
        <MixerCard colors={C} bare={unified} />
        <DeckCard k={1} color={C[1]} bands={W[1]} pitch="−0.78" {look} bare={unified} />
      </div>
    </div>
    <section class="lq-glass lib"><Library rows={4} sel={2} /></section>
  </div>
</div>

<style>
  .shell { position: relative; height: 100%; box-sizing: border-box; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 14px; padding: 16px 20px; }
  .console { display: grid; grid-template-rows: 190px minmax(0, 1fr); gap: 14px; min-height: 0; }
  .waves { display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; }
  .waves.oled { background: #000; box-shadow: 0 0 0 1px #000, 0 0 0 5px rgb(0 0 0 / 0.3), inset 0 0 0 1px rgb(255 255 255 / 0.06); border-radius: 16px; }
  .ln { position: relative; min-height: 0; }
  .ln + .ln { border-top: 1px solid rgb(255 255 255 / 0.07); }
  .tag { position: absolute; left: 14px; top: 10px; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; font-weight: 600; color: #0a0a0c; background: var(--c); }
  .nm { position: absolute; left: 42px; top: 11px; font-size: 12.5px; color: rgb(242 241 236 / 0.8); }
  .row { display: grid; grid-template-columns: 1fr 330px 1fr; gap: 14px; min-height: 0; }
  .lib { padding: 6px 8px; }

  /* One console: a single glass slab, sections split by hairlines. */
  .unified .console { gap: 0; border-radius: 24px; overflow: hidden; }
  .unified .waves { border-bottom: 1px solid rgb(255 255 255 / 0.08); background: rgb(0 0 0 / 0.18); }
  .unified .row { gap: 0; }
</style>
