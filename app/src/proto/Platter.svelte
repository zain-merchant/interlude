<script>
  // Prototype only: a spinning record for the deck, drawn from the deck's
  // real track and play position. Its angle comes from the play position,
  // so spin-up, brake, scratching and pitch all show as they happen.
  import { onMount } from 'svelte';
  import { engine, tracks, displayPos, onFrame, scrubStart, scrubTo, scrubEnd } from '../lib/engine.svelte.js';
  import { keyName, camelot, playingKey } from '../lib/key.js';
  import { platter, STYLES } from './platter.svelte.js';

  /** @type {{ deck: number }} */
  let { deck } = $props();

  const COLS = [
    { c: [201, 220, 242], low: [77, 101, 128], high: [244, 248, 252] },
    { c: [240, 220, 192], low: [128, 101, 72], high: [252, 247, 239] },
  ];
  const HC = ['#e8b04a', '#7cb6ff', '#ef7a64', '#6fd08c', '#c99cff', '#5fd4d4', '#ff9fc8', '#d8d27a'];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const S = $derived(STYLES[platter.style] ?? STYLES.beside);
  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const bpm = $derived(d.bpm > 0 ? d.bpm * d.rate : 0);
  const pk = $derived(t ? playingKey(d.key, d.rate, d.keylock, d.keyShift ?? 0) : null);
  const ratePct = $derived((d.rate - 1) * 100);
  function fmt(s) {
    if (!isFinite(s)) return '0:00.0';
    const sign = s < 0 ? '−' : '';
    s = Math.abs(s);
    const m = Math.floor(s / 60);
    return `${sign}${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
  }
  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

  let box = $state(0);
  /** @type {HTMLDivElement} */ let wrap;
  /** @type {HTMLCanvasElement | undefined} */ let vinylCv = $state();
  /** @type {HTMLCanvasElement | undefined} */ let ringCv = $state();
  /** @type {HTMLCanvasElement | undefined} */ let strobeCv = $state();
  /** @type {HTMLDivElement | undefined} */ let disc = $state();
  /** @type {HTMLDivElement | undefined} */ let strobeEl = $state();
  /** @type {HTMLDivElement | undefined} */ let arm = $state();
  let beat = $state(-1);
  /** @type {HTMLCanvasElement | undefined} */ let sleeveCv = $state();
  // Loaded, stopped and sitting on its cue point: the record that's up next.
  const pending = $derived(!!t && !d.playing && Math.abs(d.position - d.cue) < 0.05);

  const size = $derived(Math.max(72, Math.floor(box)));
  // The record fills the box, less room for an outer waveform ring or the
  // strobe rim, so there's little dead space around it.
  const vr = $derived(Math.round(size / 2 - (S.ring === 'outer' ? platter.ringWidth + 14 : S.ring === 'cues' ? 9 : S.strobe ? 9 : 1)));
  const hubD = $derived(Math.round(vr * 2 * platter.hub / 100));
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  function fit(cv, w) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * dpr);
    cv.style.width = cv.style.height = w + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  // Waveform bands for the ring: 240 segments, each the loudest low, mid
  // and high in its stretch, scaled like the overview.
  const SEG = 240;
  const bands = $derived.by(() => {
    const bins = t?.bins;
    if (!bins || !bins.length) return null;
    const n = Math.floor(bins.length / 4);
    const out = [new Float32Array(SEG), new Float32Array(SEG), new Float32Array(SEG)];
    for (let k = 0; k < 3; k++) {
      const all = new Float32Array(n);
      for (let i = 0; i < n; i++) all[i] = (bins[i * 4 + 1 + k] / 255) ** 2;
      const top = Float32Array.from(all).sort()[Math.floor(n * 0.995)] || 1;
      for (let s = 0; s < SEG; s++) {
        let m = 0;
        for (let i = Math.floor((s / SEG) * n); i < Math.floor(((s + 1) / SEG) * n); i++) m = Math.max(m, all[i]);
        out[k][s] = Math.min(1, m / top);
      }
    }
    return out;
  });

  // The record itself, redrawn only when its look changes.
  $effect(() => {
    if (!vinylCv) return;
    const R = vr, col = COLS[deck], g = fit(vinylCv, R * 2), finish = S.finish, gr = platter.grooves / 100, hr = hubD / 2;
    const seed = (t?.title ?? '').length * 97 + deck * 13 + 7;
    g.clearRect(0, 0, R * 2, R * 2);
    g.translate(R, R);
    const disc0 = (r, f) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = f; g.fill(); };
    const ring = (r, s, w) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.strokeStyle = s; g.lineWidth = w; g.stroke(); };
    let x = seed;
    const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    if (finish === 'clear') {
      // The platter mat, seen through the record.
      disc0(R, '#0c0c0f');
      for (let r = R * 0.3; r < R; r += Math.max(3, R * 0.035)) ring(r, 'rgba(255,255,255,.028)', 1);
      // Tinted vinyl: denser at the rim, where light travels through more of it.
      const tint = g.createRadialGradient(0, 0, hr, 0, 0, R);
      tint.addColorStop(0, rgba(col.c, 0.16));
      tint.addColorStop(0.7, rgba(col.c, 0.22));
      tint.addColorStop(1, rgba(col.c, 0.42));
      disc0(R, tint);
      const pool = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.9);
      pool.addColorStop(0, rgba(col.high, 0.16));
      pool.addColorStop(1, rgba(col.high, 0));
      disc0(R, pool);
    } else {
      const base = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
      base.addColorStop(0, '#0e0e11');
      base.addColorStop(1, '#070709');
      disc0(R, base);
    }
    // Grooves, in bands with smooth gaps between tracks.
    const gaps = [0.22, 0.47, 0.71].map((f) => hr + (R - hr) * f);
    for (let r = hr + 4; r < R - 3; r += 0.9) {
      const near = gaps.some((v) => Math.abs(r - v) < 1.6);
      if (near) continue;
      ring(r, finish === 'clear' ? `rgba(255,255,255,${(0.02 + rnd() * 0.05) * gr})` : `rgba(255,255,255,${(0.018 + rnd() * 0.05) * gr})`, 0.5);
    }
    gaps.forEach((v) => ring(v, finish === 'clear' ? rgba(col.high, 0.1) : 'rgba(255,255,255,.04)', 2.4));
    // Bevelled edge: a bright lip and a darker band inside it.
    ring(R - 0.75, finish === 'clear' ? rgba(col.high, 0.75) : 'rgba(255,255,255,.14)', 1.5);
    ring(R - 3, 'rgba(0,0,0,.25)', 2.5);
    // Lead-out: a smooth band just outside the centre.
    ring(hr + 2, finish === 'clear' ? rgba(col.c, 0.35) : 'rgba(255,255,255,.06)', 2);
    // A mark on the record so the spin reads even when it's slow.
    g.save();
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#f4f2ec';
    g.globalAlpha = 0.85;
    g.beginPath();
    g.roundRect ? g.roundRect(hr + 6, -1.25, Math.max(8, (R - hr) * 0.32), 2.5, 1.25) : g.rect(hr + 6, -1.25, Math.max(8, (R - hr) * 0.32), 2.5);
    g.fill();
    g.restore();
  });

  // Sleeve art: the track's own waveform as a sunburst, with title and tempo.
  $effect(() => {
    if (!sleeveCv || !S.sleeve) return;
    const W = Math.round(size * 0.9), g = fit(sleeveCv, W), col = COLS[deck];
    g.fillStyle = '#141417'; g.fillRect(0, 0, W, W);
    const gr = g.createLinearGradient(0, 0, W, W); gr.addColorStop(0, rgba(col.c, 0.18)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    if (!t) return;
    const cx = W * 0.5, cy = W * 0.42, r0 = W * 0.08, n = SEG;
    if (bands) for (let s = 0; s < n; s++) {
      const a = (s / n) * Math.PI * 2 - Math.PI / 2, amp = bands[0][s] * 0.55 + bands[1][s] * 0.45, len = W * 0.04 + amp * W * 0.27;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      g.strokeStyle = rgba(col.c, 0.3 + bands[2][s] * 0.6); g.lineWidth = 1; g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, r0 * 0.8, 0, Math.PI * 2); g.fillStyle = rgba(col.c, 1); g.fill();
    const fs = Math.max(10, W * 0.085);
    g.fillStyle = '#f4f2ec'; g.font = `500 ${fs}px 'Geist Variable', Geist, Arial, sans-serif`; g.textAlign = 'left';
    let title = t.title; while (g.measureText(title).width > W * 0.88 && title.length > 3) title = title.slice(0, -2) + '…';
    g.fillText(title, W * 0.07, W * 0.86);
    g.fillStyle = 'rgba(236,234,228,.55)'; g.font = `400 ${fs * 0.62}px 'Geist Variable', Geist, Arial, sans-serif`;
    g.fillText(`${t.artist || 'Unknown artist'} · ${bpm > 0 ? bpm.toFixed(0) + ' BPM' : ''}${pk ? ' · ' + camelot(pk) : ''}`, W * 0.07, W * 0.94);
  });

  function drawRing(pos) {
    if (!ringCv) return;
    const g = ringCv.getContext('2d'), c = size / 2, col = COLS[deck];
    g.clearRect(0, 0, size, size);
    if (!t || !bands || S.ring === 'none') return;
    if (S.ring === 'cues') {
      // Progress and cue marks only; the waveform stays in the flat strip.
      const r = vr + 5, a0 = -Math.PI / 2, f = Math.max(0, Math.min(1, pos / t.duration));
      g.lineCap = 'round';
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(c, c, r, a0, a0 + f * Math.PI * 2); g.strokeStyle = rgba(col.c, 0.85); g.lineWidth = 2; g.stroke();
      const dot = (sec, color, rad) => { const a = a0 + (sec / t.duration) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, rad, 0, Math.PI * 2); g.fillStyle = color; g.fill(); };
      d.hotCues.forEach((h, i) => h != null && dot(h, HC[i], 2.6));
      dot(pos, '#f4f2ec', 3.4);
      return;
    }
    const frac = Math.max(0, Math.min(1, pos / t.duration));
    let r0, r1;
    if (S.ring === 'outer') { r0 = vr + 4; r1 = vr + 4 + platter.ringWidth; }
    else { r0 = hubD / 2 + 4; r1 = vr - 3; }
    const mid = (r0 + r1) / 2, half = (r1 - r0) / 2;
    // A faint track under the ring, so quiet passages still read as part of it.
    g.beginPath(); g.arc(c, c, mid, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = r1 - r0; g.stroke();
    g.lineCap = 'butt';
    const w = (Math.PI * 2 * mid) / SEG;
    const line = (a, from, to, color, width) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      g.beginPath(); g.moveTo(c + ca * from, c + sa * from); g.lineTo(c + ca * to, c + sa * to);
      g.strokeStyle = color; g.lineWidth = width; g.stroke();
    };
    for (let s = 0; s < SEG; s++) {
      const f = (s + 0.5) / SEG, a = f * Math.PI * 2 - Math.PI / 2;
      const lo = bands[0][s], mi = bands[1][s], hi = bands[2][s];
      const played = f < frac;
      // Low outside, mids, highs in the core: the overview's three bands, wrapped round.
      const lh = half * Math.max(0.08, lo * 0.7 + mi * 0.3), mh = half * mi * 0.7, hh = half * hi * 0.42;
      line(a, mid - lh, mid + lh, played ? 'rgba(236,234,228,.10)' : rgba(col.low, 0.95), w * 0.82);
      if (mh > 0.5) line(a, mid - mh, mid + mh, played ? 'rgba(236,234,228,.16)' : rgba(col.c, 0.8), w * 0.82);
      if (hh > 0.5) line(a, mid - hh, mid + hh, played ? 'rgba(236,234,228,.24)' : rgba(col.high, 0.95), w * 0.6);
    }
    // Loop, memory cue, hot cues.
    const at = (sec) => (sec / t.duration) * Math.PI * 2 - Math.PI / 2;
    if (d.looping && d.loopIn != null && d.loopOut != null) {
      g.beginPath(); g.arc(c, c, r1 + 3, at(d.loopIn), at(d.loopOut));
      g.strokeStyle = rgba(col.c, 0.9); g.lineWidth = 2; g.stroke();
    }
    const flag = (sec, color, len) => {
      const a = at(sec), ca = Math.cos(a), sa = Math.sin(a);
      line(a, r0, r1, color, 1.5);
      g.beginPath(); g.arc(c + ca * (r1 + len), c + sa * (r1 + len), Math.max(2, platter.ringWidth * 0.17), 0, Math.PI * 2); g.fillStyle = color; g.fill();
    };
    if (d.cue != null && t) flag(d.cue, 'rgba(232,176,74,.95)', 4);
    d.hotCues.forEach((h, i) => h != null && flag(h, HC[i], 4));
    // Playhead: a bright line across the ring and a notch pointing in.
    const a = at(pos), ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca, tip = r1 + 2, base = r1 + 9;
    line(a, r0 - 2, r1 + 1, '#f4f2ec', 2);
    g.beginPath();
    g.moveTo(c + ca * tip, c + sa * tip);
    g.lineTo(c + ca * base + px * 4, c + sa * base + py * 4);
    g.lineTo(c + ca * base - px * 4, c + sa * base - py * 4);
    g.closePath(); g.fillStyle = '#f4f2ec'; g.fill();
  }

  function drawStrobe() {
    if (!strobeCv) return;
    const g = fit(strobeCv, size), c = size / 2, n = 72, r = size / 2 - 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, Math.max(1, size * 0.0085), 0, Math.PI * 2);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.5)'; g.fill();
    }
  }
  $effect(() => {
    size; S.strobe;
    if (ringCv) fit(ringCv, size);
    if (S.strobe) drawStrobe();
  });

  // The tonearm: pivot in the outer top corner, the stylus riding from the
  // outer groove to the label as the track plays.
  const armG = $derived.by(() => {
    const px = deck === 0 ? size + 6 : -6, py = size * 0.1;
    const dx = size / 2 - px, dy = size / 2 - py, dist = Math.hypot(dx, dy);
    return { px, py, base: Math.atan2(dy, dx), dist, L: dist * 0.8 };
  });
  function armAngle(pos) {
    const G = armG, inner = hubD / 2 + 7, outer = vr - 6;
    const f = t ? Math.max(0, Math.min(1, pos / t.duration)) : 0;
    const r = outer - (outer - inner) * f;
    const off = Math.acos(Math.max(-1, Math.min(1, (G.L * G.L + G.dist * G.dist - r * r) / (2 * G.L * G.dist))));
    return ((G.base + (deck === 0 ? -off : off)) * 180) / Math.PI;
  }

  let strobeAngle = 0, lastNow = 0;
  onMount(() => {
    const ro = new ResizeObserver(([e]) => (box = Math.min(e.contentRect.height, e.contentRect.width)));
    ro.observe(wrap);
    const off = onFrame((now) => {
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const pos = t ? displayPos[deck] : 0;
      const deg = ((pos * platter.rpm) / 60) * 360;
      if (disc) disc.style.transform = `rotate(${(deg % 360).toFixed(2)}deg)`;
      // Strobe dots stand still at the record's true speed and drift when the
      // pitch moves it off, like the dots on a turntable's platter edge.
      if (S.strobe && strobeEl) {
        const drift = d.playing ? (d.speed ?? d.rate) - 1 : 0;
        strobeAngle += dt * drift * (platter.rpm / 60) * 360 * 6;
        strobeEl.style.transform = `rotate(${(strobeAngle % 360).toFixed(2)}deg)`;
      }
      if (arm) arm.style.transform = `rotate(${(armAngle(pos) + (d.playing ? 0 : deck === 0 ? -1.2 : 1.2)).toFixed(2)}deg)`;
      drawRing(pos);
      const g = t?.beatgrid;
      beat = g && g.bpm > 0 ? Math.floor(((pos - g.firstBeat) * g.bpm) / 60) : -1;
    });
    return () => { off(); ro.disconnect(); };
  });

  // Drag the record to scratch it, as on the waveform.
  let last = null;
  const angleAt = (e) => {
    const r = disc.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  function down(e) {
    if (!t || e.button !== 0) return;
    disc.setPointerCapture(e.pointerId);
    last = angleAt(e);
    scrubStart(deck, { scratch: true });
  }
  function move(e) {
    if (last == null) return;
    const a = angleAt(e);
    let da = a - last;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    last = a;
    scrubTo(deck, displayPos[deck] + (da / (Math.PI * 2)) * (60 / platter.rpm), e.timeStamp);
  }
  function up() {
    if (last == null) return;
    last = null;
    scrubEnd(deck);
  }
</script>

<div class="wrap" bind:this={wrap}>
  <div class="platter" class:clear={S.finish === 'clear'} style:width="{size}px" style:height="{size}px" style:--sheen={platter.sheen / 100}
    style:--deck={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} style:--dir={deck === 0 ? 1 : -1}>
    <div class="rec" class:pending={S.sleeve && pending}>
    {#if S.strobe}
      <div class="strobe" bind:this={strobeEl}><canvas bind:this={strobeCv}></canvas></div>
    {/if}
    <div class="disc" bind:this={disc} style:width="{vr * 2}px" style:height="{vr * 2}px" style:left="{size / 2 - vr}px" style:top="{size / 2 - vr}px"
      role="slider" aria-label="Deck {deck === 0 ? 'A' : 'B'} record, drag to scratch" aria-valuenow={Math.round(d.position)} aria-valuemin="0" aria-valuemax={Math.round(d.duration)} tabindex="-1"
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
      <canvas bind:this={vinylCv}></canvas>
    </div>
    <div class="sheen" style:width="{vr * 2}px" style:height="{vr * 2}px" style:left="{size / 2 - vr}px" style:top="{size / 2 - vr}px"></div>
    <canvas class="wave-ring" bind:this={ringCv}></canvas>
    <div class="hub" style:width="{hubD}px" style:height="{hubD}px" style:left="{size / 2 - hubD / 2}px" style:top="{size / 2 - hubD / 2}px" style:font-size="{hubD / 6.6}px">
      {#if t && S.hub === 'time'}
        <div class="b num">{fmt(d.position)}</div>
        <div class="k num">{fmt(d.position - d.duration)}</div>
      {:else if t}
        <div class="b num">{bpm > 0 ? bpm.toFixed(2) : '—'}</div>
        <div class="k">{pk ? `${keyName(pk)} · ${camelot(pk)}` : 'BPM'}</div>
        {#if S.extra === 'beats'}
          <div class="beats" aria-hidden="true">{#each [0, 1, 2, 3] as i}<i class:on={beat >= 0 && ((beat % 4) + 4) % 4 === i} class:one={i === 0}></i>{/each}</div>
        {:else}
          <div class="p num" class:off={Math.abs(ratePct) > 0.005}>{pct(ratePct)}</div>
        {/if}
      {:else}
        <div class="k">No track</div>
      {/if}
    </div>
    {#if platter.arm && S.arm !== 'none'}
      {@const k = size / 200}
      <div class="tonearm {S.arm}" class:down={d.playing} style:left="{armG.px}px" style:top="{armG.py}px" style:--s={k} style:--deckc={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'}>
        {#if S.arm !== 'needle'}
          <div class="pivot"></div>
        {/if}
        <div class="swing" bind:this={arm}>
          <svg width={armG.L + 40 * k} height={40 * k} viewBox="{-30 * k} {-20 * k} {armG.L + 40 * k} {40 * k}" aria-hidden="true">
            <defs>
              <linearGradient id="tube{deck}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#f6f4ee" /><stop offset="0.45" stop-color="#c9c7c0" /><stop offset="1" stop-color="#7d7b76" />
              </linearGradient>
              <linearGradient id="weight{deck}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#4a4a50" /><stop offset="0.5" stop-color="#232327" /><stop offset="1" stop-color="#121214" />
              </linearGradient>
            </defs>
            {#if S.arm === 'needle'}
              <line x1="0" y1="0" x2={armG.L} y2="0" stroke="rgba(244,242,236,.75)" stroke-width={1.4 * k} stroke-linecap="round" />
              <circle cx="0" cy="0" r={4 * k} fill="#f4f2ec" />
              <circle cx={armG.L} cy="0" r={4.5 * k} fill="var(--deckc)" stroke="#f4f2ec" stroke-width={1.5 * k} />
            {:else}
              <!-- counterweight -->
              <rect x={-26 * k} y={-6.5 * k} width={18 * k} height={13 * k} rx={2.5 * k} fill="url(#weight{deck})" stroke="rgba(255,255,255,.12)" stroke-width="0.75" />
              <rect x={-24 * k} y={-6.5 * k} width={1.2 * k} height={13 * k} fill="rgba(255,255,255,.18)" />
              {#if S.arm === 's-arm'}
                <path d="M {-8 * k} 0 L {armG.L * 0.3} 0 C {armG.L * 0.5} 0, {armG.L * 0.52} {-7 * k}, {armG.L * 0.7} {-7 * k} C {armG.L * 0.8} {-7 * k}, {armG.L * 0.84} 0, {armG.L - 16 * k} 0"
                  fill="none" stroke="url(#tube{deck})" stroke-width={3.6 * k} stroke-linecap="round" />
              {:else}
                <rect x={-8 * k} y={-1.8 * k} width={armG.L - 8 * k} height={3.6 * k} rx={1.8 * k} fill="url(#tube{deck})" />
              {/if}
              <!-- headshell, cartridge and finger lift -->
              <g transform="translate({armG.L} 0) rotate(-16)">
                <rect x={-17 * k} y={-5 * k} width={21 * k} height={10 * k} rx={1.5 * k} fill="#1d1d21" stroke="rgba(255,255,255,.16)" stroke-width="0.75" />
                <rect x={-12 * k} y={-3.2 * k} width={11 * k} height={6.4 * k} rx={1 * k} fill="var(--deckc)" />
                <rect x={-16 * k} y={-9 * k} width={2 * k} height={5 * k} rx={1 * k} fill="#c9c7c0" />
              </g>
              <circle cx={armG.L} cy="0" r={1.6 * k} fill="#f4f2ec" />
            {/if}
          </svg>
        </div>
        {#if S.arm !== 'needle'}
          <div class="cap"></div>
        {/if}
      </div>
    {/if}
    </div>
    {#if S.sleeve}
      <!-- The sleeve: a cued deck's record waits half inside it; play slides it out. -->
      <div class="sleeve" class:pending style:--sw="{Math.round(size * 0.9)}px" aria-hidden="true"><canvas bind:this={sleeveCv}></canvas></div>
    {/if}
  </div>
</div>

<style>
  .wrap {
    position: relative;
    height: 100%;
    aspect-ratio: 1;
    max-width: 100%;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .platter {
    position: relative;
    flex: none;
    touch-action: none;
  }
  .rec {
    position: absolute;
    inset: 0;
    transition: transform 520ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  /* Waiting in the sleeve: smaller, pushed toward the mixer, mostly covered. */
  .rec.pending {
    transform: translateX(calc(var(--dir) * 17%)) scale(0.84);
  }
  .sleeve {
    position: absolute;
    top: 5%;
    width: var(--sw);
    height: var(--sw);
    left: calc(50% - var(--sw) / 2);
    border-radius: 4px;
    overflow: hidden;
    z-index: 5;
    box-shadow: 0 16px 34px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.07);
    transform: translateX(calc(var(--dir) * -60%)) rotate(calc(var(--dir) * -6deg));
    opacity: 0;
    pointer-events: none;
    transition: transform 520ms cubic-bezier(0.32, 0.72, 0, 1), opacity 360ms ease;
  }
  .sleeve.pending {
    transform: translateX(calc(var(--dir) * -10%));
    opacity: 1;
  }
  .sleeve canvas {
    display: block;
  }
  @media (prefers-reduced-motion: reduce) {
    .rec, .sleeve {
      transition: none;
    }
  }
  .strobe {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle, #1b1b1f 60%, #141417 100%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }
  .strobe canvas {
    display: block;
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
  .sheen {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    background: conic-gradient(from 210deg, transparent 0deg, rgb(255 255 255 / calc(var(--sheen) * 0.14)) 28deg, transparent 62deg, transparent 180deg, rgb(255 255 255 / calc(var(--sheen) * 0.09)) 212deg, transparent 246deg);
  }
  .wave-ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* The centre doesn't spin, so the numbers stay readable. */
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
    background: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.03) 60%), rgb(14 14 16 / 0.84);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), inset 0 1px 0 rgb(255 255 255 / 0.16), 0 6px 18px rgb(0 0 0 / 0.5);
    backdrop-filter: blur(6px);
  }
  .clear .hub {
    background: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0.03) 60%), rgb(14 14 16 / 0.8);
  }
  .hub .b {
    font-size: 1.75em;
    font-weight: 300;
    color: var(--fg);
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .hub .k {
    font-size: 0.95em;
    color: var(--deck);
  }
  .hub .p {
    font-size: 0.8em;
    color: var(--fg-2);
  }
  .hub .p.off {
    color: var(--fg-2);
  }
  .beats {
    display: flex;
    gap: 0.35em;
    margin-top: 0.3em;
  }
  .beats i {
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.14);
  }
  .beats i.on {
    background: var(--fg);
  }
  .beats i.one.on {
    background: var(--deck);
  }
  /* Tonearm: rests a touch above the record while paused, drops when playing. */
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
  .rec.pending .tonearm {
    opacity: 0;
  }
  .tonearm {
    transition: opacity 300ms ease;
  }
</style>
