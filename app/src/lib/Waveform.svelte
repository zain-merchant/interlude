<script>
  import { onMount } from 'svelte';
  import { WaveformGL, themeColors } from './waveform-gl.js';
  import { tracks, engine, displayPos, onFrame, control } from './engine.svelte.js';

  /** @type {{ deck: number, mode?: 'scroll' | 'overview', seconds?: number }} */
  let { deck, mode = 'scroll', seconds = 12 } = $props();

  let canvas;
  let failed = $state(false);

  onMount(() => {
    let gl;
    try {
      gl = new WaveformGL(canvas);
    } catch (e) {
      console.error(e);
      failed = true;
      return;
    }
    const colors = themeColors(deck === 0 ? '--deck-a' : '--deck-b');
    let uploaded = null;

    const off = onFrame(() => {
      const t = tracks[deck];
      const bins = t?.bins ?? null;
      if (bins !== uploaded) {
        gl.setBins(bins ?? new Uint8Array(0));
        uploaded = bins;
      }
      const bps = t?.binsPerSec ?? 172;
      const count = bins ? bins.length / 4 : 0;
      const playhead = displayPos[deck] * bps;
      const cue = t ? engine.decks[deck].cue * bps : -1;
      const w = canvas.width || 1;
      if (mode === 'scroll') {
        const perPx = (seconds * bps) / w;
        gl.draw({ start: playhead - (w / 2) * perPx, perPx, playhead, cue, centerLine: true, colors });
      } else {
        gl.draw({ start: 0, perPx: Math.max(count, 1) / w, playhead, cue, centerLine: false, colors });
      }
    });
    return off;
  });

  function seek(e) {
    if (mode !== 'overview' || !tracks[deck]) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    control({ type: 'seek', deck, seconds: x * tracks[deck].duration });
  }
</script>

<div class="wave {mode}" class:empty={!tracks[deck]}>
  <canvas
    bind:this={canvas}
    onpointerdown={seek}
    aria-label={mode === 'overview' ? 'Track overview, click to jump' : 'Scrolling waveform'}
  ></canvas>
  {#if failed}
    <div class="msg">Waveforms need WebGL2</div>
  {:else if !tracks[deck] && mode === 'scroll'}
    <div class="msg">Deck {deck === 0 ? 'A' : 'B'} · drop a track from the library</div>
  {/if}
</div>

<style>
  .wave {
    position: relative;
    background: var(--panel);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .overview canvas {
    cursor: pointer;
  }
  .msg {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--faint);
    font-size: 12px;
    pointer-events: none;
  }
</style>
