<script>
  import { onMount } from 'svelte';
  import { decks, clock, onTick } from './track.js';
  import * as styles from './waves.js';

  /** @type {{ deck: number, kind: keyof typeof styles, opts?: Record<string, any>, class?: string }} */
  let { deck, kind, opts = {}, class: cls = '' } = $props();
  let canvas;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0;
    const ro = new ResizeObserver(() => {
      const dpr = devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);
    const off = onTick(() => {
      if (!w || !h || !canvas.offsetParent) return;
      ctx.clearRect(0, 0, w, h);
      /** @type {Function} */ (styles[kind])(ctx, w, h, decks[deck].data, clock.t[deck], { seconds: 12, ...opts });
    });
    return () => (off(), ro.disconnect());
  });
</script>

<div class="wave {cls}"><canvas bind:this={canvas}></canvas></div>

<style>
  .wave {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
