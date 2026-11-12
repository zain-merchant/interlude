<script>
  // A still picture of the music right after a cue: what you'll hear when
  // you press the pad.
  import { onMount } from 'svelte';
  import { decks, sample } from '../bold/track.js';
  /** @type {{ deck: number, t: number, color: string, seconds?: number }} */
  let { deck, t, color, seconds = 8 } = $props();
  let canvas;
  onMount(() => {
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
    const step = 2;
    for (let x = 0; x < w; x += step) {
      const tt = t + (x / w) * seconds;
      const v = sample(decks[deck].data, tt, tt + (seconds / w) * step) ?? [0, 0, 0];
      const e = Math.min(1, v[0] * 0.6 + v[1] * 0.35 + v[2] * 0.3);
      const bh = Math.max(1, e * h * 0.9);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, (h - bh) / 2, 1.2, bh);
    }
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas { display: block; width: 100%; height: 100%; }
</style>
