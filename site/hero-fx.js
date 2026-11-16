// Behind the hero: a record, lying on the floor round the screen, turning
// very slowly. Its grooves run up the page behind the hero's words. As with
// a real record, the light doesn't turn with it: a fixed, soft sheen (two
// wedges of light) sits over the grooves, and the turn shows as a slow,
// smooth shimmer that does turn with it.
//
// Drawn crisply: the grooves are drawn once, at full resolution, to a
// stored layer (they're round, so turning doesn't change them); each frame
// only paints light, masked to them. No noise, no grit.
//
// Being tried with the Try panel (localhost or ?try):
//   style   blend  satin's soft bands for presence, fine hairlines over them
//                  for texture (the default)
//           fine   hairline grooves close together, very faint
//           lines  fewer, wider-spaced hairlines, a little more graphic
//           satin  no single grooves: smooth bands for the tracks
//   touch   lamp   the two bands of light swing round to face the pointer
//           hand   hover and the record slows almost to a stop; drag across
//                  the hero to scratch it back and forth, let go and it
//                  spins back up
//           needle click to drop the needle in a groove: that groove lights
//                  warm and creeps slowly inward as the record plays
//
// So the turning shows, faint dust and scuffs ride round with the record.
//
// A kick lifts the sheen a little; reduced motion leaves it still.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero');
const screen = document.querySelector('.shot .screen');
const canvas = document.querySelector('.ripples');
const ctx = canvas.getContext('2d');
const RES = Math.min(1.25, devicePixelRatio || 1);
// How flat the record lies: a low angle, so it reads as a disc on a
// surface going away from you, not a well.
const SQUASH = 0.3;
const TURN = (Math.PI * 2) / 50; // one slow turn every 50 seconds
const COOL = '201 220 242';
const WARM = '240 220 192';

let style = 'blend';
let touch = 'lamp';
let avg = 0;
let swell = 0;
let want = 0;
let lastKick = 0;
const mouse = { x: -1e4, y: -1e4, in: false };
const drag = { on: false, lastX: 0, lastT: 0 };
const ripples = [];
let spin = 0;
// Dust and scuffs on the record, in its own turning frame: short arcs at
// fixed places on the disc, so its turning shows.
const DUST = Array.from({ length: 140 }, (_, i) => {
  const k = Math.sin(i * 12.9898) * 43758.5453;
  const f = k - Math.floor(k);
  const g = Math.sin(i * 78.233) * 12345.678;
  const h = g - Math.floor(g);
  return { r: 0.3 + 0.7 * Math.sqrt(f), a: h * Math.PI * 2, len: 0.004 + 0.03 * ((f * 7) % 1), alpha: 0.04 + 0.12 * ((h * 13) % 1) };
});
const needle = { on: false, r: 0, born: 0 };
let facingNow = -Math.PI * 0.6;
let glow = 0;
let lampOn = 0;
let speed = TURN;
let running = false;

export function setVariant(v) {
  touch = v;
  wake();
}
export function setStyle(v) {
  style = v;
  geo = null;
  wake();
}

const local = (e) => {
  const c = canvas.getBoundingClientRect();
  return { x: e.clientX - c.left, y: e.clientY - c.top };
};
addEventListener('pointermove', (e) => {
  Object.assign(mouse, local(e), { in: true });
  if (drag.on && touch === 'hand') {
    const now = performance.now();
    const dt = Math.max(8, now - drag.lastT) / 1000;
    speed = ((e.clientX - drag.lastX) / dt) * 0.0025;
    drag.lastX = e.clientX;
    drag.lastT = now;
  }
}, { passive: true });
document.addEventListener('pointerleave', () => (mouse.in = false));
hero.addEventListener('pointerdown', (e) => {
  if (touch !== 'hand' || e.target.closest('a, button, input, summary')) return;
  Object.assign(drag, { on: true, lastX: e.clientX, lastT: performance.now() });
  document.documentElement.style.userSelect = 'none';
});
addEventListener('pointerup', () => {
  drag.on = false;
  document.documentElement.style.userSelect = '';
});
addEventListener('pointerdown', (e) => {
  if (touch === 'needle' && !e.target.closest('a, button, input, summary, .try') && geo) {
    const p = local(e);
    ripples.push({ born: performance.now(), ...p });
    Object.assign(needle, { on: true, r: Math.hypot(p.x - geo.cx, (p.y - geo.cy) / SQUASH), born: performance.now() });
  }
}, { passive: true });

/** Called with each level report from the app. */
export function hear(l) {
  avg += (l - avg) * 0.05;
  const now = performance.now();
  if (l > 0.12 && l > avg * 1.3 && now - lastKick > 900) {
    lastKick = now;
    want = 1;
  }
}

function wake() {
  if (running || reduced.matches) return;
  running = true;
  requestAnimationFrame(draw);
}

const grooves = document.createElement('canvas');
const gctx = grooves.getContext('2d');
let geo = null;

function layout(w, h) {
  const c = canvas.getBoundingClientRect();
  const s = screen.getBoundingClientRect();
  const cx = s.left - c.left + s.width / 2;
  const cy = s.top - c.top + s.height * 0.5;
  const R = Math.max(cy / SQUASH, w / 2) * 1.06;
  const r0 = s.width * 0.42;
  const key = [w, h, Math.round(cx), Math.round(cy), style].join();
  if (geo?.key === key) return geo;
  grooves.width = canvas.width;
  grooves.height = canvas.height;
  gctx.setTransform(RES, 0, 0, RES * SQUASH, cx * RES, cy * RES);
  gctx.clearRect(-R * 2, -R * 4, R * 4, R * 8);
  // Tracks: the quieter gaps between songs, at steady but uneven spacing.
  const gaps = [];
  for (let r = r0 + 240, i = 0; r < R; r += 260 + ((i++ * 97) % 140)) gaps.push(r);
  const fade = (r) => Math.min(1, (r - r0) / 90) * (1 - ((r - r0) / (R - r0)) * 0.5);
  if (style === 'blend') {
    // Presence from broad, soft bands; texture from quiet hairlines over
    // them. No falloff with radius: the outer grooves, up behind the
    // headline, are as clear as the inner ones (the page's mask sets how
    // strong each part of the hero is).
    const rise = (r) => Math.min(1, (r - r0) / 90);
    let prev = r0;
    for (const g of [...gaps, R]) {
      const grad = gctx.createRadialGradient(0, 0, prev, 0, 0, g);
      grad.addColorStop(0, 'rgb(255 255 255 / 0)');
      grad.addColorStop(0.1, `rgb(255 255 255 / ${0.16 * rise(prev + 40)})`);
      grad.addColorStop(0.9, `rgb(255 255 255 / ${0.16 * rise(g)})`);
      grad.addColorStop(1, 'rgb(255 255 255 / 0)');
      gctx.fillStyle = grad;
      gctx.beginPath();
      gctx.arc(0, 0, g, 0, Math.PI * 2);
      gctx.arc(0, 0, prev, 0, Math.PI * 2, true);
      gctx.fill();
      prev = g;
    }
    gctx.lineWidth = 1 / RES;
    for (let r = r0; r < R; r += 7) {
      if (gaps.some((g) => Math.abs(r - g) < 14)) continue;
      gctx.strokeStyle = `rgb(255 255 255 / ${1 * rise(r)})`;
      gctx.beginPath();
      gctx.arc(0, 0, r, 0, Math.PI * 2);
      gctx.stroke();
    }
  } else if (style === 'satin') {
    // Smooth bands, no single grooves: each track a soft sheet of light.
    let prev = r0;
    for (const g of [...gaps, R]) {
      const grad = gctx.createRadialGradient(0, 0, prev, 0, 0, g);
      grad.addColorStop(0, 'rgb(255 255 255 / 0)');
      grad.addColorStop(0.08, `rgb(255 255 255 / ${0.55 * fade(prev + 40)})`);
      grad.addColorStop(0.92, `rgb(255 255 255 / ${0.55 * fade(g)})`);
      grad.addColorStop(1, 'rgb(255 255 255 / 0)');
      gctx.fillStyle = grad;
      gctx.beginPath();
      gctx.arc(0, 0, g, 0, Math.PI * 2);
      gctx.arc(0, 0, prev, 0, Math.PI * 2, true);
      gctx.fill();
      prev = g;
    }
  } else {
    const spacing = style === 'lines' ? 14 : 5;
    gctx.lineWidth = (style === 'lines' ? 1 : 0.8) / RES;
    for (let r = r0; r < R; r += spacing) {
      const gap = gaps.some((g) => Math.abs(r - g) < (style === 'lines' ? 8 : 12));
      gctx.strokeStyle = `rgb(255 255 255 / ${(gap ? 0.15 : 1) * fade(r)})`;
      gctx.beginPath();
      gctx.arc(0, 0, r, 0, Math.PI * 2);
      gctx.stroke();
    }
  }
  // The page's mask keeps the record clearest above the screen, behind the
  // words, and quieter beside the app, which is the star.
  canvas.style.setProperty('--fx-top', `${Math.round(s.top - c.top)}px`);
  canvas.style.setProperty('--fx-mid', `${Math.round(s.top - c.top + s.height * 0.35)}px`);
  geo = { key, cx, cy, R, r0 };
  return geo;
}

/**
 * Conic stops for light round the centre: `n` wedges, `sharp` how narrow,
 * as the darkness laid over grooves drawn at full strength. Where a wedge
 * falls the grooves keep their light; elsewhere they sink to `rest` of it.
 */
function shade(l, at, n, sharp, rest, lift) {
  const grad = l.createConicGradient(at, 0, 0);
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = Math.max(0, Math.cos(t * Math.PI * 2 * n)) ** sharp;
    const keep = Math.min(1, rest + v * lift);
    grad.addColorStop(t, `rgb(9 9 11 / ${1 - keep})`);
  }
  return grad;
}

let last = performance.now();
function draw(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * RES) || canvas.height !== Math.round(h * RES)) {
    canvas.width = Math.round(w * RES);
    canvas.height = Math.round(h * RES);
    geo = null;
  }
  const g = layout(w, h);
  swell += (want - swell) * Math.min(1, dt * (want > swell ? 2.5 : 1));
  want *= Math.exp(-dt * 1.4);

  let target = TURN;
  if (touch === 'hand' && mouse.in && !drag.on) {
    const d = Math.hypot(mouse.x - g.cx, (mouse.y - g.cy) / SQUASH);
    if (d > g.r0 && d < g.R) target = TURN * 0.03;
  }
  if (!drag.on) speed += (target - speed) * Math.min(1, dt * 1.5);
  spin += speed * dt;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // The grooves at full strength; light and shade are then laid over them
  // in place (source-atop keeps it all on the grooves).
  ctx.globalAlpha = (style === 'blend' ? 0.36 : style === 'satin' ? 0.17 : style === 'lines' ? 0.24 : 0.2) * (1 + swell * 0.18);
  // A record never sits quite true: the grooves drift a pixel or so round
  // the spindle, slowly, so they seem to breathe.
  const wob = now / 1000 * ((Math.PI * 2) / 11);
  ctx.drawImage(grooves, Math.cos(wob) * 1.4 * RES, Math.sin(wob) * 1.4 * SQUASH * RES);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.setTransform(RES, 0, 0, RES * SQUASH, g.cx * RES, g.cy * RES);
  // The sheen swings slowly on its own, and eases round to face the
  // pointer (the short way round), never snapping.
  const rest = -Math.PI * 0.6 + Math.sin(now / 1000 * ((Math.PI * 2) / 17)) * 0.14;
  const aim = touch === 'lamp' && mouse.in ? Math.atan2((mouse.y - g.cy) / SQUASH, mouse.x - g.cx) : rest;
  let delta = ((aim - facingNow + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  facingNow += delta * Math.min(1, dt * (touch === 'lamp' && mouse.in ? 4 : 1.5));
  const facing = facingNow;
  // The fixed sheen: two soft wedges; the rest sinks to a fifth.
  lampOn += ((touch === 'lamp' && mouse.in ? 1 : 0) - lampOn) * Math.min(1, dt * 3);
  ctx.fillStyle = shade(ctx, facing - Math.PI / 2, 1, 4 + lampOn * 4, 0.32 - lampOn * 0.16, 0.68 + lampOn * 0.3);
  ctx.fillRect(-g.R, -g.R, g.R * 2, g.R * 2);
  // The turn: three broad lobes going round with the record, gently.
  ctx.fillStyle = shade(ctx, spin, 1.5, 2, 0.55, 0.45);
  ctx.fillRect(-g.R, -g.R, g.R * 2, g.R * 2);
  // Under the pointer, the grooves catch a little more light: a soft pool
  // that fades in as the pointer arrives and out when it leaves.
  glow += ((mouse.in && touch === 'lamp' ? 0.6 : 0) - glow) * Math.min(1, dt * 3);
  if (glow > 0.01) {
    const mx = mouse.x - g.cx;
    const my = (mouse.y - g.cy) / SQUASH;
    const pool = ctx.createRadialGradient(mx, my, 0, mx, my, 460);
    pool.addColorStop(0, `rgb(${COOL} / ${0.5 * glow})`);
    pool.addColorStop(0.45, `rgb(${COOL} / ${0.2 * glow})`);
    pool.addColorStop(1, `rgb(${COOL} / 0)`);
    ctx.fillStyle = pool;
    ctx.fillRect(mx - 460, my - 460, 920, 920);
  }
  // The needle's groove: lit warm, creeping inward as the record plays.
  if (touch === 'needle' && needle.on) {
    needle.r = Math.max(g.r0 + 20, needle.r - dt * 3);
    const fadeIn = Math.min(1, (now - needle.born) / 400);
    const band = ctx.createRadialGradient(0, 0, Math.max(0, needle.r - 14), 0, 0, needle.r + 14);
    band.addColorStop(0, `rgb(${WARM} / 0)`);
    band.addColorStop(0.5, `rgb(${WARM} / ${1 * fadeIn})`);
    band.addColorStop(1, `rgb(${WARM} / 0)`);
    ctx.fillStyle = band;
    ctx.fillRect(-needle.r - 16, -needle.r - 16, (needle.r + 16) * 2, (needle.r + 16) * 2);
  }
  // A dropped needle: a ring of light running out through the grooves.
  for (const rp of ripples) {
    const t = (now - rp.born) / 3200;
    const r = Math.hypot(rp.x - g.cx, (rp.y - g.cy) / SQUASH) + t * 600;
    const band = ctx.createRadialGradient(0, 0, Math.max(0, r - 70), 0, 0, r + 70);
    band.addColorStop(0, `rgb(${WARM} / 0)`);
    band.addColorStop(0.5, `rgb(${WARM} / ${(1 - t) ** 2 * 0.6})`);
    band.addColorStop(1, `rgb(${WARM} / 0)`);
    ctx.fillStyle = band;
    ctx.fillRect(-r - 70, -r - 70, (r + 70) * 2, (r + 70) * 2);
  }
  // Dust and scuffs, turning with the record.
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.2;
  for (const d of DUST) {
    const r = g.r0 + (g.R - g.r0) * d.r;
    ctx.strokeStyle = `rgb(255 255 255 / ${d.alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, d.a + spin, d.a + spin + d.len);
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].born > 3200) ripples.splice(i, 1);

  if (!reduced.matches) requestAnimationFrame(draw);
  else {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

reduced.addEventListener('change', wake);
wake();
