<script>
  // A level meter driven by the prototype tracks' energy at the playhead.
  import { onMount } from 'svelte';
  import { decks, clock, onTick, sample } from './track.js';
  /** @type {{ deck: number, look?: 'led'|'bar'|'dots', seg?: number }} */
  let { deck, look = 'led', seg = 24 } = $props();
  let el;
  let level = 0;
  onMount(() => onTick(() => {
    const v = sample(decks[deck].data, clock.t[deck] - 0.03, clock.t[deck] + 0.03) ?? [0, 0, 0];
    const target = Math.min(1, v[0] * 0.55 + v[1] * 0.35 + v[2] * 0.25 + 0.08);
    level = target > level ? target : level * 0.93 + target * 0.07;
    el?.style.setProperty('--l', level.toFixed(3));
  }));
</script>

<div bind:this={el} class="meter {look}" style:--seg={seg} aria-hidden="true"></div>

<style>
  .meter { position: relative; width: 5px; height: 100%; border-radius: 2px; background: #070708; overflow: hidden; }
  .meter::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(to top, #38c97c 0 62%, #f2c94c 62% 82%, #ff5a4f 82%);
    clip-path: inset(calc((1 - var(--l, 0)) * 100%) 0 0 0);
  }
  .led::after { mask: repeating-linear-gradient(to top, #000 0 3px, transparent 3px 4.5px); filter: drop-shadow(0 0 3px rgb(56 201 124 / 0.55)); }
  .dots { width: 4px; border-radius: 0; }
  .dots::after { mask: repeating-linear-gradient(to top, #000 0 3px, transparent 3px 5px); }
  .bar::after { border-radius: 2px; }
</style>
