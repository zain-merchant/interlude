<script>
  import { onMount } from 'svelte';
  import { Waveform2D, themeColors, HOT_CUES } from './waveform-2d.js';
  import { tracks, engine, displayPos, displaySlip, onFrame, scrubStart, scrubTo, scrubEnd, wake } from './engine.svelte.js';
  import { flag, flagsRev, watchFlags } from '../flags/registry.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { gridMenu, gridMode, startSlide, slide, endSlide } from './grid.svelte.js';

  /** @type {{ deck: number, mode?: 'scroll' | 'overview', seconds?: number, onzoom?: (factor: number) => void }} */
  let { deck, mode = 'scroll', seconds = 12, onzoom } = $props();

  let canvas;
  /** Seconds of the track the scrolling view spans: `seconds` of real
   * time at the deck's tempo. A sped-up deck shows more of its track, so
   * two synced decks scroll at the same speed with their beats equally
   * spaced, whatever their own BPMs. */
  const span = () => seconds * (engine.decks[deck]?.rate > 0.05 ? engine.decks[deck].rate : 1);
  let failed = $state(false);
  /** Hot cue number chips over the scrolling view, moved every frame. */
  const chips = [];
  /** Keeps `chips[i]` pointing at hot cue chip `i` while it's on screen. */
  function chip(node, i) {
    chips[i] = node;
    return {
      destroy() {
        if (chips[i] === node) chips[i] = undefined;
      },
    };
  }

  // UI audit flags (#11, #45, #56, #57, the directions #92 and up, …) can
  // change the theme's colours: the canvas reads them again whenever any
  // flag or setting changes (the registry bumps flagsRev), not only for a
  // list of flags that could fall behind.
  // #41, #43, #50, #52, #54 (UI audit flags): what the canvas draws differently with them on.
  const wf = () => ({
    beatGrid: flag('beat-grid'),
    edge: flag('beat-grid') ? 'soft' : '',
    clipStart: flag('lane-start'),
    cueChips: flag('overview-cues'),
    keyline: flag('deck-polish'),
    axis: flag('zoom-pill'),
    loopTint: flag('on-state'),
    // #101 (UI audit flag): dir-centerline draws each scrolling lane as half a ribbon on one shared axis: the left deck's rises from it, the right deck's hangs from it.
    ...(mode === 'scroll' && flag('dir-centerline') ? { half: deck === 0 ? 'up' : 'down' } : {}),
    // #105, #106 (UI audit flags): dir-pebble draws beads on the beat grid, dir-liner flat ink.
    ...(flag('dir-pebble') ? { look: 'beads' } : flag('dir-liner') ? { look: 'ink' } : {}),
    // #107 (UI audit flag): dir-field prints the sound in its deck's inks on a light sheet.
    ...(flag('dir-field') ? { look: 'field' } : {}),
    // #108 (UI audit flag): dir-ground veils the played part in the deck's ground, not grey.
    ...(flag('dir-ground') ? { veil: 'ground' } : {}),
  });

  // #49 (UI audit flag): the play head's x in device px, at the waves
  // panel's horizontal centre; measured when the lane's size changes.
  const zoomAxis = $derived(mode === 'scroll' && flag('zoom-pill'));
  let axis = { w: -1, x: 0 };
  function axisX(w) {
    if (axis.w !== w) {
      const panel = canvas.closest('.waves')?.getBoundingClientRect();
      const lane = canvas.getBoundingClientRect();
      axis = { w, x: panel && lane.width ? (panel.left + panel.width / 2 - lane.left) * (w / lane.width) : w / 2 };
    }
    return axis.x;
  }
  $effect(() => {
    zoomAxis;
    axis = { w: -1, x: 0 };
  });

  // The frame loop sleeps while nothing moves; a flag flipping wakes it
  // to redraw (not on the first run, so with every flag off nothing new
  // happens).
  let watched = false;
  $effect(() => {
    watchFlags();
    wf();
    if (watched) wake();
    watched = true;
  });

  onMount(() => {
    let gl;
    try {
      gl = new Waveform2D(canvas);
    } catch (e) {
      console.error(e);
      failed = true;
      return;
    }
    let colors = themeColors(deck);
    let colorKey = -1;
    gl.font = getComputedStyle(canvas).fontFamily; // #50 (UI audit flag): the overview chips' numbers
    let uploaded = null;
    const off = onFrame(() => {
      const ck = flagsRev();
      if (ck !== colorKey) {
        if (colorKey !== -1) colors = themeColors(deck);
        colorKey = ck;
      }
      const f = wf();
      const flagView = { ...f, flags: Object.values(f).join('|') };
      const t = tracks[deck];
      const bins = t?.bins ?? null;
      if (bins !== uploaded) {
        gl.setBins(bins ?? new Uint8Array(0));
        uploaded = bins;
      }
      const bps = t?.binsPerSec ?? 172;
      const count = bins ? bins.length / 4 : 0;
      // No track, no play head: an empty lane stays empty.
      const playhead = t ? displayPos[deck] * bps : -1000;
      const d = engine.decks[deck];
      const cue = t ? d.cue * bps : -1;
      const w = canvas.width || 1;
      const grid = t?.beatgrid;
      const bin = (s) => (t && s != null ? s * bps : -1);
      const marks = {
        hotCues: Array.from({ length: HOT_CUES }, (_, i) => bin(d.hotCues?.[i])),
        loopIn: bin(d.loopIn), loopOut: bin(d.loopOut), looping: !!t && d.looping,
        slip: bin(displaySlip[deck]),
      };
      if (mode === 'scroll') {
        const perPx = (span() * bps) / w;
        // #49 (UI audit flag): zoom-pill puts the play head on the waveforms panel's centre (the window's axis), not the shortened lane's.
        const start = playhead - (zoomAxis ? axisX(w) : w / 2) * perPx;
        gl.draw({
          mode, start, perPx, playhead, cue, colors, ...marks, ...flagView,
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
        // The whole track in the lane: the play head crosses a pixel every
        // fraction of a second, so it's placed to a quarter pixel and the
        // lane is drawn again only when it moves that far, not every frame.
        const perPx = Math.max(count, 1) / w;
        const q = (b) => (b < 0 ? b : Math.round(b / (perPx / 4)) * (perPx / 4));
        gl.draw({ mode, start: 0, perPx, playhead: q(playhead), cue, colors, ...marks, slip: q(marks.slip), ...flagView });
      }
    });
    return off;
  });

  // Drag to scrub. The overview maps the pointer straight onto the track and
  // seeks silently; the scrolling view scratches, audibly, like a record
  // under a hand, and only starts once the pointer has moved, so a stray
  // click does nothing.
  let drag = null;
  let dragging = $state(false);

  // In grid edit mode, dragging slides the beatgrid instead.
  const editing = $derived(mode === 'scroll' && gridMode[deck]);
  let sliding = null;

  function down(e) {
    if (!tracks[deck] || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    if (editing) {
      if (tracks[deck].beatgrid) sliding = { x: e.clientX, state: startSlide(deck) };
      return;
    }
    drag = { x: e.clientX, from: displayPos[deck], live: mode === 'overview' };
    if (drag.live) begin(e);
  }
  function begin(e) {
    drag.live = true;
    dragging = true;
    scrubStart(deck, { scratch: mode === 'scroll' });
    move(e);
  }
  function move(e) {
    const r = canvas.getBoundingClientRect();
    if (sliding) slide(deck, sliding.state, ((e.clientX - sliding.x) / r.width) * span());
    if (!drag) return;
    if (mode === 'overview') {
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      scrubTo(deck, x * tracks[deck].duration);
    } else if (drag.live) {
      scrubTo(deck, drag.from - ((e.clientX - drag.x) / r.width) * span(), e.timeStamp);
    } else if (Math.abs(e.clientX - drag.x) > 3) {
      begin(e);
    }
  }
  function up() {
    if (sliding) endSlide(deck, sliding.state);
    sliding = null;
    if (drag?.live) scrubEnd(deck);
    drag = null;
    dragging = false;
  }

  // Right-click the scrolling view to fix the beatgrid where you clicked.
  function menu(e) {
    if (mode !== 'scroll' || !tracks[deck]) return;
    const r = canvas.getBoundingClientRect();
    const at = displayPos[deck] + ((e.clientX - r.left) / r.width - 0.5) * span();
    openMenu(e, gridMenu(deck, Math.max(0, Math.min(tracks[deck].duration, at))));
  }

  // ⌘/Ctrl + scroll zooms; plain scroll scratches through a paused track.
  let wheelTimer;
  /** Pixels of scroll that start a scratch; less is a resting finger. */
  const WHEEL_MIN = 4;
  function wheel(e) {
    if (mode !== 'scroll') return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onzoom?.(e.deltaY > 0 ? 1.15 : 1 / 1.15);
      return;
    }
    if (!tracks[deck] || engine.decks[deck].playing || drag) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    // A trackpad or mouse with a finger resting on it sends wheel events
    // that barely move, and macOS sends empty ones as gestures start and
    // end. Each would grab the record for an instant, which clicks and
    // flickers the tempo, so only a real scroll scratches.
    if (!wheelTimer && Math.abs(d) < WHEEL_MIN) return;
    if (!wheelTimer) scrubStart(deck, { scratch: true });
    clearTimeout(wheelTimer);
    scrubTo(deck, displayPos[deck] + (d / canvas.clientWidth) * span(), e.timeStamp);
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
    class:editing
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onlostpointercapture={up}
    onwheel={wheel}
    oncontextmenu={menu}
    aria-hidden="true"
  ></canvas>
  {#if mode === 'scroll'}
    {#each Array.from({ length: HOT_CUES }, (_, i) => i) as i}
      <span class="chip num" use:chip={i} style="display: none" style:--hc="var(--hc-{i + 1})" aria-hidden="true">{i + 1}</span>
    {/each}
  {/if}
  {#if failed}
    <div class="msg">Waveforms can't be drawn here</div>
  {/if}
</div>

<style>
  .wave {
    position: relative;
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
  .wave:not(.empty) canvas.editing {
    cursor: ew-resize;
  }
  .wave:not(.empty) canvas.dragging {
    cursor: grabbing;
  }
  .chip {
    position: absolute;
    left: 0;
    bottom: 4px;
    width: 14px;
    height: 14px;
    margin-left: 2px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: var(--hc);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 600;
    pointer-events: none;
    will-change: transform;
  }
  .msg {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--fg-3);
    font-size: var(--t-xs);
    pointer-events: none;
  }
</style>
