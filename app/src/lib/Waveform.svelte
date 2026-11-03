<script>
  import { onMount } from 'svelte';
  import { WaveformGL, themeColors, HOT_CUES } from './waveform-gl.js';
  import { tracks, engine, displayPos, onFrame, scrubStart, scrubTo, scrubEnd } from './engine.svelte.js';

  /** @type {{ deck: number, mode?: 'scroll' | 'overview', seconds?: number, onzoom?: (factor: number) => void }} */
  let { deck, mode = 'scroll', seconds = 12, onzoom } = $props();

  let canvas;
  let failed = $state(false);
  /** Hot cue number chips over the scrolling view, moved every frame. */
  const chips = [];

  onMount(() => {
    let gl;
    try {
      gl = new WaveformGL(canvas);
    } catch (e) {
      console.error(e);
      failed = true;
      return;
    }
    const colors = themeColors();
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
      const d = engine.decks[deck];
      const cue = t ? d.cue * bps : -1;
      const w = canvas.width || 1;
      const grid = t?.beatgrid;
      const bin = (s) => (t && s != null ? s * bps : -1);
      const marks = {
        hotCues: Array.from({ length: HOT_CUES }, (_, i) => bin(d.hotCues?.[i])),
        loopIn: bin(d.loopIn), loopOut: bin(d.loopOut), looping: !!t && d.looping,
      };
      if (mode === 'scroll') {
        const perPx = (seconds * bps) / w;
        const start = playhead - (w / 2) * perPx;
        gl.draw({
          start, perPx, playhead, cue, centerLine: true, colors, ...marks,
          beatLen: grid ? (60 / grid.bpm) * bps : 0,
          firstBeat: grid ? grid.firstBeat * bps : 0,
        });
        const dpr = window.devicePixelRatio || 1;
        marks.hotCues.forEach((c, i) => {
          const el = chips[i];
          if (!el) return;
          const x = (c - start) / perPx / dpr;
          const show = c >= 0 && x > -20 && x < w / dpr + 20;
          el.style.display = show ? '' : 'none';
          if (show) el.style.transform = `translateX(${x.toFixed(1)}px)`;
        });
      } else {
        gl.draw({ start: 0, perPx: Math.max(count, 1) / w, playhead, cue, centerLine: false, colors, ...marks });
      }
    });
    return off;
  });

  // Drag to scrub. The overview maps the pointer straight onto the track;
  // the scrolling view moves with the pointer like a record under a hand,
  // and only starts once the pointer has moved, so a stray click does nothing.
  let drag = null;
  let dragging = $state(false);

  function down(e) {
    if (!tracks[deck] || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, from: displayPos[deck], live: mode === 'overview' };
    if (drag.live) begin(e);
  }
  function begin(e) {
    drag.live = true;
    dragging = true;
    scrubStart(deck);
    move(e);
  }
  function move(e) {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    if (mode === 'overview') {
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      scrubTo(deck, x * tracks[deck].duration);
    } else if (drag.live) {
      scrubTo(deck, drag.from - ((e.clientX - drag.x) / r.width) * seconds);
    } else if (Math.abs(e.clientX - drag.x) > 3) {
      begin(e);
    }
  }
  function up() {
    if (drag?.live) scrubEnd(deck);
    drag = null;
    dragging = false;
  }

  // ⌘/Ctrl + scroll zooms; plain scroll moves through a paused track.
  let wheelTimer;
  function wheel(e) {
    if (mode !== 'scroll') return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onzoom?.(e.deltaY > 0 ? 1.15 : 1 / 1.15);
      return;
    }
    if (!tracks[deck] || engine.decks[deck].playing || drag) return;
    e.preventDefault();
    if (!wheelTimer) scrubStart(deck);
    clearTimeout(wheelTimer);
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    scrubTo(deck, displayPos[deck] + (d / canvas.clientWidth) * seconds);
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      scrubEnd(deck);
    }, 200);
  }
</script>

<div class="wave {mode}" class:empty={!tracks[deck]}>
  <canvas
    bind:this={canvas}
    class:dragging
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onlostpointercapture={up}
    onwheel={wheel}
    aria-hidden="true"
  ></canvas>
  {#if mode === 'scroll'}
    {#each Array.from({ length: HOT_CUES }, (_, i) => i) as i}
      <span class="chip num" bind:this={chips[i]} style="display: none" aria-hidden="true">{i + 1}</span>
    {/each}
  {/if}
  {#if failed}
    <div class="msg">Waveforms need WebGL2</div>
  {:else if !tracks[deck] && mode === 'scroll'}
    <div class="msg">Drag a track here or press {deck === 0 ? '⇧←' : '⇧→'}</div>
  {/if}
</div>

<style>
  .wave {
    position: relative;
    background: var(--bg);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  canvas {
    touch-action: none;
  }
  .wave:not(.empty) canvas {
    cursor: grab;
  }
  .wave:not(.empty).overview canvas {
    cursor: pointer;
  }
  .wave:not(.empty) canvas.dragging {
    cursor: grabbing;
  }
  .chip {
    position: absolute;
    left: 0;
    bottom: 6px;
    width: 14px;
    height: 14px;
    margin-left: 1px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background: var(--cue);
    color: var(--ink);
    font-size: 10px;
    font-weight: 600;
    pointer-events: none;
    will-change: transform;
  }
  .msg {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--fg-4);
    font-size: 12px;
    pointer-events: none;
  }
</style>
