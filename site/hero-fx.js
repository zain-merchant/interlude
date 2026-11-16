// What happens behind the hero while the set plays. Five ideas, from subtle
// to bold, being tried with the widget at the bottom right (on localhost or
// with ?try in the address); one will stay and the rest go.
//
//   rings     rings leave the screen on each kick, like a speaker cone
//   floor     the screen reflected in a glossy floor, its light pulsing
//   dots      a dot grid that ripples out from the screen on each kick
//   skyline   soft spectrum bars rising behind the top of the screen
//   beams     two club beams, cool and warm, sweeping through faint haze
//
// The app in the hero reports its output level about 30 times a second;
// a kick is that level jumping well above its recent average.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const shot = document.querySelector('.shot');
const screen = shot.querySelector('.screen');
const canvas = shot.querySelector('.beats');
const ctx = canvas.getContext('2d');
const COOL = '201 220 242';
const WARM = '240 220 192';

let effect = 'rings';
let level = 0;
let avg = 0;
let lastBeat = 0;
let beats = 0;
const rings = [];
let running = false;

export function setEffect(name) {
  effect = name;
  shot.dataset.fx = name;
  rings.length = 0;
  kick();
}

/** Called with each level report from the app. */
export function hear(l) {
  level = l;
  avg += (l - avg) * 0.08;
  const now = performance.now();
  if (l > 0.12 && l > avg * 1.25 && now - lastBeat > 300) {
    lastBeat = now;
    beats++;
    rings.push({ born: now, tone: beats % 2 ? WARM : COOL, strength: Math.min(1, l * 1.5) });
    shot.style.setProperty('--kick', '1');
    requestAnimationFrame(() => requestAnimationFrame(() => shot.style.setProperty('--kick', '0')));
  }
  shot.style.setProperty('--fx-level', l.toFixed(3));
  kick();
}

function kick() {
  if (running || reduced.matches || effect === 'none' || effect === 'floor' || effect === 'beams') return;
  running = true;
  requestAnimationFrame(draw);
}

// The skyline's bars, each easing toward a height of its own.
const BARS = 48;
const bars = Array.from({ length: BARS }, () => 0);
const seeds = Array.from({ length: BARS }, (_, i) => 0.5 + 0.5 * Math.sin(i * 1.7) * Math.cos(i * 0.37));

function draw(now) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // Where the screen sits in the canvas.
  const c = canvas.getBoundingClientRect();
  const s = screen.getBoundingClientRect();
  const f = { x: s.left - c.left, y: s.top - c.top, w: s.width, h: s.height };
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;

  for (let i = rings.length - 1; i >= 0; i--) if (now - rings[i].born > 2200) rings.splice(i, 1);

  if (effect === 'rings') {
    for (const r of rings) {
      const t = (now - r.born) / 1600;
      if (t >= 1) continue;
      const grow = 6 + (1 - (1 - t) ** 3) * 120;
      const rw = f.w + grow * 2;
      const rh = f.h + grow * 2;
      ctx.beginPath();
      ctx.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, 16 + grow * 0.6);
      ctx.strokeStyle = `rgb(${r.tone} / ${(1 - t) ** 1.6 * 0.5 * r.strength})`;
      ctx.lineWidth = 2 + (1 - t) * 4;
      ctx.shadowColor = `rgb(${r.tone} / ${(1 - t) * 0.6})`;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  if (effect === 'dots') {
    const gap = 22;
    for (let x = gap / 2; x < w; x += gap) {
      for (let y = gap / 2; y < h; y += gap) {
        // Distance outside the screen's box (0 on its edge).
        const dx = Math.max(f.x - x, 0, x - (f.x + f.w));
        const dy = Math.max(f.y - y, 0, y - (f.y + f.h));
        const d = Math.hypot(dx, dy);
        if (d === 0) continue;
        let push = 0;
        let lit = 0;
        for (const r of rings) {
          const front = ((now - r.born) / 1800) * 520;
          const k = Math.exp(-(((d - front) / 40) ** 2)) * r.strength * Math.max(0, 1 - front / 520);
          push += k * 7;
          lit += k;
        }
        const ux = dx === 0 ? 0 : Math.sign(x - cx);
        const uy = dy === 0 ? 0 : Math.sign(y - cy);
        const fade = Math.max(0, 1 - d / 420);
        ctx.fillStyle = `rgb(${(x + y) % 2 ? COOL : WARM} / ${(0.07 + lit * 0.55) * fade})`;
        ctx.beginPath();
        ctx.arc(x + ux * push, y + uy * push, 1.1 + lit * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (effect === 'skyline') {
    const base = f.y + 40;
    const span = f.w * 1.1;
    const left = cx - span / 2;
    const bw = span / BARS;
    const recent = rings.length ? Math.max(0, 1 - (now - rings[rings.length - 1].born) / 500) : 0;
    for (let i = 0; i < BARS; i++) {
      const wobble = 0.5 + 0.5 * Math.sin(now / 420 + i * 0.9) * Math.sin(now / 1300 + i * 0.31);
      const want = (0.15 + level * 0.9 * seeds[i] + recent * 0.35 * seeds[(i * 7) % BARS]) * (0.5 + wobble * 0.5);
      bars[i] += (want - bars[i]) * 0.18;
      const bh = bars[i] * 150;
      const g = ctx.createLinearGradient(0, base - bh, 0, base);
      const tone = i < BARS / 2 ? COOL : WARM;
      g.addColorStop(0, `rgb(${tone} / 0)`);
      g.addColorStop(1, `rgb(${tone} / 0.32)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(left + i * bw + 2, base - bh, bw - 4, bh, 3);
      ctx.fill();
    }
  }

  if (effect !== 'none' && effect !== 'floor' && effect !== 'beams') requestAnimationFrame(draw);
  else running = false;
}

reduced.addEventListener('change', () => setEffect(effect));
