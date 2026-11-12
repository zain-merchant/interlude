<script>
  // A platter: the whole track as a ring of spokes, a slowly turning disc
  // with engraved grooves inside it, and the deck's numbers in the middle.
  import { onMount } from 'svelte';
  import Wave from './Wave.svelte';
  import Time from './Time.svelte';
  import { decks, clock, onTick } from './track.js';
  /** @type {{ deck: number, color: string, size?: number }} */
  let { deck, color, size = 320 } = $props();
  let disc;
  onMount(() => onTick(() => {
    // 33⅓ rpm.
    disc && (disc.style.transform = `rotate(${(clock.t[deck] * 200) % 360}deg)`);
  }));
  const d = decks[deck];
</script>

<div class="platter" style:--c={color} style:--s="{size}px">
  <div class="spokes"><Wave {deck} kind="radial" opts={{ played: color, ahead: 'rgba(236,236,234,0.55)', inner: 0.8, spokes: 180, spokeW: 2, pad: 4, glow: true, headGlow: color }} /></div>
  <div class="disc" bind:this={disc}><i></i></div>
  <div class="center">
    <span class="bpm">{d.bpm}.00</span>
    <span class="el"><Time {deck} /></span>
    <span class="rm"><Time {deck} remaining /></span>
  </div>
</div>

<style>
  .platter { position: relative; width: var(--s); height: var(--s); display: grid; place-items: center; }
  .spokes { position: absolute; inset: 0; }
  .disc {
    position: absolute;
    inset: 15%;
    border-radius: 50%;
    background:
      repeating-radial-gradient(circle, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 4px),
      radial-gradient(circle at 50% 50%, #17171b 0 38%, #0d0d10 39% 100%);
    box-shadow: 0 0 0 1px #000, 0 0 0 2px rgb(255 255 255 / 0.04), inset 0 0 40px rgb(0 0 0 / 0.8), 0 18px 40px rgb(0 0 0 / 0.6);
  }
  .disc::before {
    content: ''; position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(from 30deg, transparent 0 40deg, rgb(255 255 255 / 0.06) 60deg, transparent 80deg 220deg, rgb(255 255 255 / 0.04) 240deg, transparent 260deg);
  }
  .disc i {
    position: absolute; left: 50%; top: 3%; width: 3px; height: 14%; margin-left: -1.5px; border-radius: 2px;
    background: var(--c); box-shadow: 0 0 10px var(--c);
  }
  .center { position: relative; display: grid; justify-items: center; gap: 2px; pointer-events: none; }
  .bpm { font-size: 13px; color: color-mix(in srgb, var(--c) 60%, #ececea); letter-spacing: 0.02em; }
  .el { font-size: 34px; letter-spacing: -0.03em; line-height: 1.05; }
  .rm { font-size: 14px; color: rgb(236 236 234 / 0.5); }
</style>
