<script>
  // The deck's record: a clear, deck-tinted disc that spins with the track,
  // with the elapsed and remaining time in its still centre and a tonearm
  // that plays the record. The angle comes from the play position, so
  // spin-up, brake, scratching and pitch all show as they happen. Dragging
  // the record scratches, as dragging the waveform does.
  import { onMount } from 'svelte';
  import { engine, tracks, displayPos, onFrame, scrubStart, scrubTo, scrubEnd } from './engine.svelte.js';
  import { tip } from './tooltip.svelte.js';
  import { flag, setting, flagsRev } from '../flags/registry.svelte.js';
  import { hms } from '../flags/08-stress-hours/time.js';
  import { timeMode, swapTimes } from '../flags/40-time-remaining/mode.svelte.js';

  /** @type {{ deck: number }} */
  let { deck } = $props();

  const RPM = 33.333;
  // Deck colour, its dark low band and its light high band, as RGB.
  const COLS = [
    { c: [201, 220, 242], high: [244, 248, 252] },
    { c: [240, 220, 192], high: [252, 247, 239] },
  ];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const name = $derived(deck === 0 ? 'A' : 'B');

  function fmt(s) {
    if (!isFinite(s)) return '0:00.0';
    // #8 (UI audit flag): stress-hours shows h:mm:ss.s past an hour.
    if (flag('stress-hours') && Math.abs(s) >= 3600) return hms(flag('deck-polish') ? Math.round(s * 10) / 10 : s, 1);
    const sign = s < 0 ? '−' : '';
    s = Math.abs(s);
    // #54 (UI audit flag): deck-polish rounds to tenths before splitting, so 59.96 s reads 1:00.0, not 0:60.0.
    if (flag('deck-polish')) s = Math.round(s * 10) / 10;
    const m = Math.floor(s / 60);
    return `${sign}${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
  }

  // #54 (UI audit flag): deck-polish sets the tenths of a second apart (class "t"), to step them down.
  const clock = (s) => {
    const m = flag('deck-polish') ? /^(.*)(\.\d)$/.exec(s) : null;
    return m ? { whole: m[1], tenth: m[2] } : { whole: s, tenth: '' };
  };
  // #18 (UI audit flag): the track is playing out its last seconds (class:ending, and class:last for the final ten, on the remaining time).
  const ending = $derived(flag('visual-ending') && !!t && d.playing && d.duration > 0 && d.duration - d.position < (Number(setting('visual-ending', 'secs')) || 30));
  // #40 (UI audit flag): time-remaining makes the time left the big number; clicking the centre swaps them (both decks, remembered).
  const timesProps = $derived(
    flag('time-remaining')
      ? {
          'data-big': timeMode.big,
          role: 'button',
          tabindex: 0,
          'aria-label': timeMode.big === 'remaining' ? 'Show time played big' : 'Show time left big',
          onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), swapTimes()),
        }
      : {},
  );
  const timesTip = () => (flag('time-remaining') ? (timeMode.big === 'remaining' ? 'Click to show time played' : 'Click to show time left') : '');

  let box = $state(0);
  /** @type {HTMLDivElement} */ let wrap;
  /** @type {HTMLCanvasElement | undefined} */ let vinylCv = $state();
  /** @type {HTMLDivElement | undefined} */ let disc = $state();
  /** @type {HTMLDivElement | undefined} */ let arm = $state();

  const size = $derived(Math.max(48, Math.floor(box)));
  const vr = $derived(Math.round(size / 2 - 1));
  // The still centre: big enough to read the times at a glance.
  const hubD = $derived(Math.round(vr * 2 * 0.68));
  // Tonearm parts are drawn for a 200px record and scaled from there.
  const k = $derived(size / 200);
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  // The record, redrawn only when its size or deck changes.
  // UI audit flags (the directions, #92 and up): a direction can tint the
  // record through --record-tint, --record-high (r, g, b) and --record-mat
  // (a colour) on the deck; unset (every flag off), the record is as before.
  const triplet = (v) => {
    const n = String(v).trim().split(/[\s,]+/).map(Number);
    return n.length === 3 && n.every((x) => Number.isFinite(x)) ? n : null;
  };
  function themed() {
    flagsRev();
    void t; // a direction may tint an empty deck's record differently: read again on load and eject
    if (!wrap) return { col: COLS[deck], mat: '#0c0c0f' };
    const cs = getComputedStyle(wrap);
    const c = triplet(cs.getPropertyValue('--record-tint'));
    const high = triplet(cs.getPropertyValue('--record-high'));
    const mat = cs.getPropertyValue('--record-mat').trim();
    return { col: { c: c ?? COLS[deck].c, high: high ?? COLS[deck].high }, mat: mat || '#0c0c0f' };
  }
  $effect(() => {
    if (!vinylCv) return;
    const { col, mat } = themed();
    const R = vr, hr = hubD / 2;
    vinylCv.width = vinylCv.height = Math.round(R * 2 * dpr);
    vinylCv.style.width = vinylCv.style.height = R * 2 + 'px';
    const g = vinylCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, R * dpr, R * dpr);
    const fill = (r, f) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = f; g.fill(); };
    const ring = (r, s, w) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.strokeStyle = s; g.lineWidth = w; g.stroke(); };
    // A fixed seed per deck, so the grooves don't shimmer between redraws.
    let x = deck * 13 + 7;
    const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    // The platter mat, seen through the record.
    fill(R, mat);
    for (let r = R * 0.3; r < R; r += Math.max(3, R * 0.035)) ring(r, 'rgba(255,255,255,.028)', 1);
    // Tinted vinyl: denser at the rim, where light travels through more of it.
    const tint = g.createRadialGradient(0, 0, hr, 0, 0, R);
    tint.addColorStop(0, rgba(col.c, 0.16));
    tint.addColorStop(0.7, rgba(col.c, 0.22));
    tint.addColorStop(1, rgba(col.c, 0.42));
    fill(R, tint);
    const pool = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.9);
    pool.addColorStop(0, rgba(col.high, 0.16));
    pool.addColorStop(1, rgba(col.high, 0));
    fill(R, pool);
    // Grooves, in bands with smooth gaps between tracks.
    const gaps = [0.22, 0.47, 0.71].map((f) => hr + (R - hr) * f);
    for (let r = hr + 4; r < R - 3; r += 0.9) {
      if (gaps.some((v) => Math.abs(r - v) < 1.6)) continue;
      ring(r, `rgba(255,255,255,${(0.02 + rnd() * 0.05) * 0.6})`, 0.5);
    }
    gaps.forEach((v) => ring(v, rgba(col.high, 0.1), 2.4));
    // Bevelled edge: a bright lip and a darker band inside it.
    ring(R - 0.75, rgba(col.high, 0.75), 1.5);
    ring(R - 3, 'rgba(0,0,0,.25)', 2.5);
    // Lead-out: a smooth band just outside the centre.
    ring(hr + 2, rgba(col.c, 0.35), 2);
    // A mark on the record so the spin reads even when it's slow.
    g.rotate(-Math.PI / 2);
    g.fillStyle = 'rgba(244,242,236,.85)';
    g.beginPath();
    g.roundRect(hr + 6, -1.25, Math.max(8, (R - hr) * 0.32), 2.5, 1.25);
    g.fill();
  });

  // The tonearm: pivot just outside the record's inner top corner, the
  // stylus riding from the outer groove to the centre as the track plays.
  const armG = $derived.by(() => {
    const px = deck === 0 ? size + 6 : -6, py = size * 0.1;
    const dx = size / 2 - px, dy = size / 2 - py, dist = Math.hypot(dx, dy);
    return { px, py, base: Math.atan2(dy, dx), dist, L: dist * 0.8 };
  });
  // The arm's angle with its stylus at radius r from the record's centre.
  function angleAt(r) {
    const G = armG;
    const off = Math.acos(Math.max(-1, Math.min(1, (G.L * G.L + G.dist * G.dist - r * r) / (2 * G.L * G.dist))));
    return ((G.base + (deck === 0 ? -off : off)) * 180) / Math.PI;
  }
  // Playing, the stylus sits on the groove for the play position; paused,
  // it lifts and rests just off the record's edge, still in view.
  function armTarget(pos) {
    if (!t || !d.playing) return angleAt(vr + 9);
    const inner = hubD / 2 + 7, outer = vr - 6;
    const f = t.duration > 0 ? Math.max(0, Math.min(1, pos / t.duration)) : 0;
    return angleAt(outer - (outer - inner) * f);
  }

  let armNow = NaN, lastNow = 0;
  onMount(() => {
    const ro = new ResizeObserver(([e]) => (box = Math.min(e.contentRect.height, e.contentRect.width)));
    ro.observe(wrap);
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const off = onFrame((now) => {
      const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const pos = t ? displayPos[deck] : 0;
      if (disc) disc.style.transform = `rotate(${(((pos * RPM) / 60) * 360) % 360}deg)`;
      // The arm eases to where it's going (about 400ms), like a cued lift;
      // the first frame and reduced motion put it there at once.
      const target = armTarget(pos);
      armNow = isNaN(armNow) || still.matches ? target : armNow + (target - armNow) * (1 - Math.exp(-dt / 0.11));
      if (arm) arm.style.transform = `rotate(${armNow.toFixed(2)}deg)`;
    });
    return () => { off(); ro.disconnect(); };
  });

  // Drag the record to scratch it, as on the waveform.
  let last = null;
  const pointerAngle = (e) => {
    const r = disc.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  // #40 (UI audit flag): time-remaining: a tap on the still centre swaps the times. The press
  // still goes to the record (the centre lets pointers through), so a drag from it scratches as
  // anywhere else; only a release within 3px of the press swaps.
  let tap = null;
  function down(e) {
    if (e.button !== 0) return;
    if (flag('time-remaining')) {
      const r = disc.getBoundingClientRect();
      const inHub = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) <= hubD / 2;
      tap = inHub ? { x: e.clientX, y: e.clientY } : null;
    }
    if (!t) return;
    disc.setPointerCapture(e.pointerId);
    last = pointerAngle(e);
    scrubStart(deck, { scratch: true });
  }
  function move(e) {
    if (last == null) return;
    const a = pointerAngle(e);
    let da = a - last;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    last = a;
    scrubTo(deck, displayPos[deck] + (da / (Math.PI * 2)) * (60 / RPM), e.timeStamp);
  }
  function up(e) {
    if (tap && e && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 3) swapTimes();
    tap = null;
    if (last == null) return;
    last = null;
    scrubEnd(deck);
  }
</script>

<div class="wrap" bind:this={wrap}>
  <div class="platter" style:width="{size}px" style:height="{size}px" style:--deckc={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'}>
    <div class="disc" bind:this={disc} style:width="{vr * 2}px" style:height="{vr * 2}px" style:left="{size / 2 - vr}px" style:top="{size / 2 - vr}px"
      role="slider" aria-label="Deck {name} record, drag to scratch" aria-valuenow={Math.round(d.position)} aria-valuemin="0"
      aria-valuemax={Math.round(d.duration)} aria-valuetext="{fmt(d.position)} of {fmt(d.duration)}" tabindex="-1"
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => ((tap = null), up())}>
      <canvas bind:this={vinylCv}></canvas>
    </div>
    <div class="sheen" style:width="{vr * 2}px" style:height="{vr * 2}px" style:left="{size / 2 - vr}px" style:top="{size / 2 - vr}px"></div>
    <!-- The centre doesn't spin, so the times stay readable. -->
    {#if flag('time-remaining') || flag('deck-polish') || flag('visual-ending')}
      <!-- #40, #54, #18 (UI audit flags): time-remaining's swap, deck-polish's tenths, visual-ending's last seconds; with all off, the centre is as before. #110 (dir-room-tint) marks an hour-long track (class long) so its times can step down to fit. -->
      {@const el = clock(fmt(d.position))}
      {@const rm = clock(fmt(d.position - d.duration))}
      <div class="hub" class:empty={!t} class:long={flag('dir-room-tint') && d.duration >= 3600} {...timesProps} use:tip={timesTip} style:width="{hubD}px" style:height="{hubD}px" style:left="{size / 2 - hubD / 2}px" style:top="{size / 2 - hubD / 2}px" style:font-size="{hubD / 6.6}px">
        <div class="el num"><span class="sr">Elapsed </span>{el.whole}{#if el.tenth}<span class="t">{el.tenth}</span>{/if}</div>
        <div class="rm num" class:ending class:last={ending && d.duration - d.position < 10}><span class="sr">Remaining </span>{rm.whole}{#if rm.tenth}<span class="t">{rm.tenth}</span>{/if}</div>
      </div>
    {:else}
    <div class="hub" style:width="{hubD}px" style:height="{hubD}px" style:left="{size / 2 - hubD / 2}px" style:top="{size / 2 - hubD / 2}px" style:font-size="{hubD / 6.6}px">
      <div class="el num"><span class="sr">Elapsed </span>{fmt(d.position)}</div>
      <div class="rm num"><span class="sr">Remaining </span>{fmt(d.position - d.duration)}</div>
    </div>
    {/if}
    <div class="tonearm" class:down={!!t && d.playing} style:left="{armG.px}px" style:top="{armG.py}px" style:--s={k} aria-hidden="true">
      <div class="pivot"></div>
      <div class="swing" bind:this={arm}>
        <svg width={armG.L + 40 * k} height={40 * k} viewBox="{-30 * k} {-20 * k} {armG.L + 40 * k} {40 * k}">
          <defs>
            <linearGradient id="tube{deck}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#f6f4ee" /><stop offset="0.45" stop-color="#c9c7c0" /><stop offset="1" stop-color="#7d7b76" />
            </linearGradient>
            <linearGradient id="weight{deck}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#4a4a50" /><stop offset="0.5" stop-color="#232327" /><stop offset="1" stop-color="#121214" />
            </linearGradient>
          </defs>
          <!-- counterweight -->
          <rect x={-26 * k} y={-6.5 * k} width={18 * k} height={13 * k} rx={2.5 * k} fill="url(#weight{deck})" stroke="rgba(255,255,255,.12)" stroke-width="0.75" />
          <rect x={-24 * k} y={-6.5 * k} width={1.2 * k} height={13 * k} fill="rgba(255,255,255,.18)" />
          <rect x={-8 * k} y={-1.8 * k} width={armG.L - 8 * k} height={3.6 * k} rx={1.8 * k} fill="url(#tube{deck})" />
          <!-- headshell, cartridge in the deck's colour, and finger lift -->
          <g transform="translate({armG.L} 0) rotate(-16)">
            <rect x={-17 * k} y={-5 * k} width={21 * k} height={10 * k} rx={1.5 * k} fill="#1d1d21" stroke="rgba(255,255,255,.16)" stroke-width="0.75" />
            <rect x={-12 * k} y={-3.2 * k} width={11 * k} height={6.4 * k} rx={1 * k} fill="var(--deckc)" />
            <rect x={-16 * k} y={-9 * k} width={2 * k} height={5 * k} rx={1 * k} fill="#c9c7c0" />
          </g>
          <circle cx={armG.L} cy="0" r={1.6 * k} fill="#f4f2ec" />
        </svg>
      </div>
      <div class="cap"></div>
    </div>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    max-height: 100%;
    aspect-ratio: 1;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .platter {
    position: relative;
    flex: none;
    touch-action: none;
  }
  .disc {
    position: absolute;
    border-radius: 50%;
    cursor: grab;
    will-change: transform;
    box-shadow: 0 14px 34px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.05);
  }
  .disc:active {
    cursor: grabbing;
  }
  .disc canvas {
    display: block;
    border-radius: 50%;
  }
  /* Light catching the record: stays put while the record turns under it. */
  .sheen {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    background: conic-gradient(from 210deg, transparent 0deg, rgb(255 255 255 / 0.077) 28deg, transparent 62deg, transparent 180deg, rgb(255 255 255 / 0.05) 212deg, transparent 246deg);
  }
  .hub {
    position: absolute;
    border-radius: 50%;
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    pointer-events: none;
    z-index: 2;
    line-height: 1.15;
    background: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0.03) 60%), rgb(14 14 16 / 0.8);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), inset 0 1px 0 rgb(255 255 255 / 0.16), 0 6px 18px rgb(0 0 0 / 0.5);
    backdrop-filter: blur(6px);
  }
  .hub .el {
    font-size: 1.75em;
    font-weight: 300;
    color: var(--fg);
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .hub .rm {
    font-size: 0.95em;
    color: var(--deckc);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* Tonearm: lifted with a softer, longer shadow while it rests; down on
     the record, a tight one. */
  .tonearm {
    position: absolute;
    width: 0;
    height: 0;
    z-index: 3;
    pointer-events: none;
  }
  .pivot {
    position: absolute;
    width: calc(30px * var(--s));
    height: calc(30px * var(--s));
    margin: calc(-15px * var(--s)) 0 0 calc(-15px * var(--s));
    border-radius: 50%;
    background:
      radial-gradient(circle, #2a2a2f 38%, transparent 40%),
      conic-gradient(from 200deg, #6b6a70, #d8d6d0, #77767b, #3c3c41, #a9a7a2, #6b6a70);
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.6), inset 0 0 0 1px rgb(255 255 255 / 0.12);
  }
  .cap {
    position: absolute;
    width: calc(9px * var(--s));
    height: calc(9px * var(--s));
    margin: calc(-4.5px * var(--s)) 0 0 calc(-4.5px * var(--s));
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #b9b7b1);
  }
  .swing {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    transition: filter 300ms ease;
    filter: drop-shadow(0 calc(9px * var(--s)) calc(5px * var(--s)) rgb(0 0 0 / 0.5));
  }
  .tonearm.down .swing {
    filter: drop-shadow(0 calc(3px * var(--s)) calc(2px * var(--s)) rgb(0 0 0 / 0.6));
  }
  .swing svg {
    display: block;
    position: absolute;
    left: calc(-30px * var(--s));
    top: calc(-20px * var(--s));
    overflow: visible;
  }
</style>
