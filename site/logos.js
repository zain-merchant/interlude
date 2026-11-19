// Logo ideas for Interlude, each drawn in an app icon's squircle. Used by
// lab/logos.html (the gallery) and by the site itself, when one is picked
// in Tune (Logo: mark) or with ?logo=<id> in the address.
//
// Each logo: id, name, family ('light' for the lamp and colour ideas, or
// 'shape'), a note, tile ('dark' or 'light'), lockup (the wordmark it pairs
// with, see LOCKUPS) and art(u), the mark itself in a 100 x 100 box, where
// u(name) makes an id unique to this drawing (gradients and filters).

// The decks' two colours, as in the app and the lamp's glints.
export const A = '#4aa8ff';
export const B = '#ff9b45';
const W = '#f4f2ec';

// An app icon's squircle: a superellipse (n = 5), not a rounded rectangle.
const squircle = (() => {
  const pts = [];
  for (let i = 0; i < 128; i++) {
    const t = (i / 128) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push(`${(50 + 50 * Math.sign(c) * Math.abs(c) ** 0.4).toFixed(2)} ${(50 + 50 * Math.sign(s) * Math.abs(s) ** 0.4).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

const blur = (u, id, sd) => `<filter id="${u(id)}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const radial = (u, id, stops, attrs = '') => `<radialGradient id="${u(id)}" ${attrs}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
const linear = (u, id, stops, attrs = 'x1="0" y1="0" x2="1" y2="0"') => `<linearGradient id="${u(id)}" ${attrs}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
// A soft beam: a long thin wedge from (x0, y0) toward (x1, y1), wider at
// the far end, its light fading along it.
const beam = (u, id, x0, y0, x1, y1, w0, w1, col) => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const p = [[x0 + nx * w0, y0 + ny * w0], [x1 + nx * w1, y1 + ny * w1], [x1 - nx * w1, y1 - ny * w1], [x0 - nx * w0, y0 - ny * w0]];
  return `<linearGradient id="${u(id)}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"><stop offset="0" stop-color="${col}" stop-opacity="1"/><stop offset="0.55" stop-color="${col}" stop-opacity="0.75"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
    <polygon points="${p.map((q) => q.map((v) => v.toFixed(2)).join(',')).join(' ')}" fill="url(#${u(id)})"/>`;
};
const rings = (cx, cy, r0, step, n, col, sw = 0.6, op = 0.5) => Array.from({ length: n }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${(r0 + i * step).toFixed(2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}"/>`).join('');

export const LOGOS = [
  // ── Light: the lamp, the glints, two beams ──────────────────────────
  {
    id: 'beams', family: 'light', name: 'Two beams', lockup: 'classic',
    note: 'Two beams of light, A and B, crossing; white where they meet, as two records do in the mix.',
    art: (u) => `<defs>${blur(u, 'b', 2.2)}${radial(u, 'core', [[0, W, 0.95], [0.35, W, 0.5], [1, W, 0]])}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">${beam(u, 'a', 14, 86, 78, 18, 1.5, 9, A)}${beam(u, 'bb', 86, 86, 22, 18, 1.5, 9, B)}</g>
      <g style="mix-blend-mode:screen">${beam(u, 'a2', 14, 86, 78, 18, 0.5, 3.2, A)}${beam(u, 'b2', 86, 86, 22, 18, 0.5, 3.2, B)}</g>
      <circle cx="50" cy="48" r="13" fill="url(#${u('core')})"/>`,
  },
  {
    id: 'spots', family: 'light', name: 'Stage lights', lockup: 'regular',
    note: 'Two spotlights from below, crossing over the booth; their overlap is the brightest thing on stage.',
    art: (u) => `<defs>${blur(u, 'b', 3)}${radial(u, 'core', [[0, W, 0.9], [1, W, 0]])}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">${beam(u, 'a', 30, 84, 62, 14, 1, 16, A)}${beam(u, 'bb', 70, 84, 38, 14, 1, 16, B)}</g>
      <circle cx="50" cy="40" r="10" fill="url(#${u('core')})"/>
      <circle cx="30" cy="84" r="2.6" fill="${A}"/><circle cx="70" cy="84" r="2.6" fill="${B}"/>`,
  },
  {
    id: 'venn-light', family: 'light', name: 'Venn of light', lockup: 'classic',
    note: 'The two discs as pools of light rather than outlines: blue and orange, adding up to white.',
    art: (u) => `<defs>${radial(u, 'a', [[0, A, 1], [0.6, A, 0.75], [1, A, 0]])}${radial(u, 'b', [[0, B, 1], [0.6, B, 0.75], [1, B, 0]])}</defs>
      <g style="mix-blend-mode:screen"><circle cx="39" cy="50" r="25" fill="url(#${u('a')})"/><circle cx="61" cy="50" r="25" fill="url(#${u('b')})"/></g>
      <path d="M50 30.2 A25 25 0 0 1 50 69.8 A25 25 0 0 1 50 30.2 Z" fill="${W}" opacity="0.92"/>`,
  },
  {
    id: 'venn-soft', family: 'light', name: 'Venn of light, soft', lockup: 'classic',
    note: 'Two soft discs of light added together: where they overlap the blue and orange really sum to white, and the edge of that lens is as soft as the light itself.',
    art: (u) => `<defs>${blur(u, 'b', 2.6)}</defs>
      <g filter="url(#${u('b')})" style="isolation:isolate"><circle cx="39" cy="50" r="22" fill="${A}" opacity="0.95"/><circle cx="61" cy="50" r="22" fill="${B}" opacity="0.95" style="mix-blend-mode:plus-lighter"/></g>`,
  },
  {
    id: 'venn-spot', family: 'light', name: 'Venn of light, spotlit', lockup: 'regular',
    note: 'Two spotlights on a dark floor: even in the middle, falling off at the rim, and white where the two pools of light overlap.',
    art: (u) => `<defs>${radial(u, 'a', [[0, A, 1], [0.72, A, 0.92], [1, A, 0]])}${radial(u, 'b', [[0, B, 1], [0.72, B, 0.92], [1, B, 0]])}</defs>
      <g style="isolation:isolate"><circle cx="39" cy="50" r="24" fill="url(#${u('a')})"/><circle cx="61" cy="50" r="24" fill="url(#${u('b')})" style="mix-blend-mode:plus-lighter"/></g>`,
  },
  {
    id: 'venn-glow', family: 'light', name: 'Venn of light, glowing', lockup: 'light',
    note: 'Pools of light brightest at their centres and fading out, overlapping further, with a soft bloom round them; the white grows out of the overlap rather than being drawn on it.',
    art: (u) => `<defs>${blur(u, 'bl', 5)}${radial(u, 'a', [[0, A, 1], [0.5, A, 0.85], [1, A, 0]])}${radial(u, 'b', [[0, B, 1], [0.5, B, 0.85], [1, B, 0]])}</defs>
      <g filter="url(#${u('bl')})" opacity="0.6" style="isolation:isolate"><circle cx="41" cy="50" r="24" fill="${A}"/><circle cx="59" cy="50" r="24" fill="${B}" style="mix-blend-mode:plus-lighter"/></g>
      <g style="isolation:isolate"><circle cx="41" cy="50" r="25" fill="url(#${u('a')})"/><circle cx="59" cy="50" r="25" fill="url(#${u('b')})" style="mix-blend-mode:plus-lighter"/></g>`,
  },
  {
    id: 'venn-rings-light', family: 'light', name: 'Venn of light, rings', lockup: 'classic',
    note: 'Today\'s two rings drawn in light: each a glowing line, and where they cross they add up to two white sparks.',
    art: (u) => `<defs>${blur(u, 'b', 2.4)}</defs>
      <g filter="url(#${u('b')})" style="isolation:isolate"><circle cx="39" cy="50" r="20" fill="none" stroke="${A}" stroke-width="6"/><circle cx="61" cy="50" r="20" fill="none" stroke="${B}" stroke-width="6" style="mix-blend-mode:plus-lighter"/></g>
      <g style="isolation:isolate"><circle cx="39" cy="50" r="20" fill="none" stroke="${A}" stroke-width="2.6"/><circle cx="61" cy="50" r="20" fill="none" stroke="${B}" stroke-width="2.6" style="mix-blend-mode:plus-lighter"/></g>`,
  },
  {
    id: 'venn-haze', family: 'light', name: 'Venn of light, hazy', lockup: 'serif',
    note: 'Lit discs with a crisp-ish core and a wide haze, the way light looks through a little smoke on stage; the overlap glows white and spills.',
    art: (u) => `<defs>${blur(u, 'h', 7)}${blur(u, 'c', 1.4)}</defs>
      <g filter="url(#${u('h')})" opacity="0.75" style="isolation:isolate"><circle cx="39" cy="50" r="23" fill="${A}"/><circle cx="61" cy="50" r="23" fill="${B}" style="mix-blend-mode:plus-lighter"/></g>
      <g filter="url(#${u('c')})" opacity="0.85" style="isolation:isolate"><circle cx="39" cy="50" r="19" fill="${A}"/><circle cx="61" cy="50" r="19" fill="${B}" style="mix-blend-mode:plus-lighter"/></g>`,
  },
  {
    id: 'venn-chroma', family: 'light', name: 'Chromatic rings', lockup: 'classic',
    note: 'Today\'s two rings, split like light through a lens: each edge carries a cool and a warm fringe.',
    art: (u) => {
      const ring = (cx, col) => `<circle cx="${cx - 1.8}" cy="49.4" r="20" fill="none" stroke="#3fe0ff" stroke-width="2.2" opacity="0.85"/><circle cx="${cx + 1.8}" cy="50.6" r="20" fill="none" stroke="#ff4f6a" stroke-width="2.2" opacity="0.85"/><circle cx="${cx}" cy="50" r="20" fill="none" stroke="${col}" stroke-width="3.6"/>`;
      return `<g style="mix-blend-mode:screen">${ring(39, A)}${ring(61, B)}</g><path d="M50 33.2 A20 20 0 0 1 50 66.8 A20 20 0 0 1 50 33.2 Z" fill="${W}"/>`;
    },
  },
  {
    id: 'lens', family: 'light', name: 'Prism lens', lockup: 'light',
    note: 'Only the overlap: a white lens with the lamp\'s fringes, cool on one side, warm on the other.',
    art: (u) => `<defs>${blur(u, 'b', 2.6)}${linear(u, 'g', [[0, '#dfeeff'], [0.5, W], [1, '#ffeedd']])}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">
        <path d="M50 22 A31 31 0 0 0 50 78" fill="none" stroke="${A}" stroke-width="6"/>
        <path d="M50 22 A31 31 0 0 1 50 78" fill="none" stroke="${B}" stroke-width="6"/></g>
      <path d="M50 22 A31 31 0 0 1 50 78 A31 31 0 0 1 50 22 Z" fill="url(#${u('g')})"/>`,
  },
  {
    id: 'eclipse', family: 'light', name: 'Eclipse', lockup: 'caps',
    note: 'A black record against the lamp: only its rim is lit, blue down one side and orange down the other.',
    art: (u) => `<defs>${blur(u, 'b', 3.2)}${blur(u, 's', 0.8)}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><path d="M50 24 A26 26 0 0 0 50 76" fill="none" stroke="${A}" stroke-width="7"/><path d="M50 24 A26 26 0 0 1 50 76" fill="none" stroke="${B}" stroke-width="7"/><circle cx="50" cy="24" r="5" fill="${W}"/></g>
      <g filter="url(#${u('s')})"><path d="M50 24 A26 26 0 0 0 50 76" fill="none" stroke="${A}" stroke-width="1.6"/><path d="M50 24 A26 26 0 0 1 50 76" fill="none" stroke="${B}" stroke-width="1.6"/></g>
      <circle cx="50" cy="50" r="25" fill="#060607"/>${rings(50, 50, 9, 2.4, 7, '#ffffff', 0.35, 0.12)}<circle cx="50" cy="50" r="2" fill="#1c1c20"/>`,
  },
  {
    id: 'sheen', family: 'light', name: 'Lamp on vinyl', lockup: 'regular',
    note: 'The hero\'s record in miniature: grooves, and the lamp\'s streak across them with its two fringes.',
    art: (u) => `<defs>${blur(u, 'b', 1.6)}<clipPath id="${u('c')}"><circle cx="50" cy="50" r="30"/></clipPath>${linear(u, 'st', [[0, A, 0], [0.38, A, 0.9], [0.5, W, 1], [0.62, B, 0.9], [1, B, 0]])}</defs>
      <circle cx="50" cy="50" r="30" fill="#08080a"/>${rings(50, 50, 10, 1.6, 13, '#ffffff', 0.4, 0.13)}
      <g clip-path="url(#${u('c')})"><g filter="url(#${u('b')})" transform="rotate(-35 50 50)" style="mix-blend-mode:screen"><rect x="42" y="18" width="16" height="64" fill="url(#${u('st')})"/></g></g>
      <circle cx="50" cy="50" r="7" fill="${B}"/><circle cx="50" cy="50" r="1.4" fill="#08080a"/>`,
  },
  {
    id: 'interference', family: 'light', name: 'Interference', lockup: 'light',
    note: 'Two sets of rings spreading from two sources, one per deck; where they cross, a pattern only the pair makes.',
    art: (u) => `<defs><clipPath id="${u('c')}"><circle cx="50" cy="50" r="31"/></clipPath></defs>
      <g clip-path="url(#${u('c')})" style="mix-blend-mode:screen">${rings(38, 50, 3, 4.2, 12, A, 1.3, 0.9)}${rings(62, 50, 3, 4.2, 12, B, 1.3, 0.9)}</g>`,
  },
  {
    id: 'halo', family: 'light', name: 'Halo', lockup: 'light',
    note: 'A single ring of white light, cool inside and warm outside: the moment between two songs.',
    art: (u) => `<defs>${blur(u, 'b', 3)}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><circle cx="50" cy="50" r="19" fill="none" stroke="${A}" stroke-width="6"/><circle cx="50" cy="50" r="27" fill="none" stroke="${B}" stroke-width="6"/></g>
      <circle cx="50" cy="50" r="23" fill="none" stroke="${W}" stroke-width="3.2"/>`,
  },
  {
    id: 'crossfade', family: 'light', name: 'Crossfade', lockup: 'caps',
    note: 'The crossfader as a beam: blue at one end, orange at the other, and the cap a bar of white light.',
    art: (u) => `<defs>${blur(u, 'b', 2.4)}${linear(u, 'l', [[0, A], [0.5, W], [1, B]])}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><rect x="16" y="46" width="68" height="8" rx="4" fill="url(#${u('l')})"/><rect x="45" y="32" width="10" height="36" rx="5" fill="${W}" opacity="0.7"/></g>
      <rect x="18" y="48.6" width="64" height="2.8" rx="1.4" fill="url(#${u('l')})"/><rect x="46.5" y="34" width="7" height="32" rx="3.5" fill="${W}"/>`,
  },
  {
    id: 'columns', family: 'light', name: 'Two columns', lockup: 'regular',
    note: 'Two shafts of light leaning together, overlapping into one bright stroke: an I made of light.',
    art: (u) => `<defs>${blur(u, 'b', 2.8)}${linear(u, 'a', [[0, A, 0], [0.5, A, 1], [1, A, 0]], 'x1="0" y1="0" x2="0" y2="1"')}${linear(u, 'bb', [[0, B, 0], [0.5, B, 1], [1, B, 0]], 'x1="0" y1="0" x2="0" y2="1"')}${linear(u, 'w', [[0, W, 0], [0.5, W, 1], [1, W, 0]], 'x1="0" y1="0" x2="0" y2="1"')}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><rect x="36" y="12" width="14" height="76" fill="url(#${u('a')})" transform="rotate(14 43 50)"/><rect x="50" y="12" width="14" height="76" fill="url(#${u('bb')})" transform="rotate(-14 57 50)"/></g>
      <g style="mix-blend-mode:screen" opacity="0.9"><rect x="41.5" y="16" width="3" height="68" rx="1.5" fill="url(#${u('a')})" transform="rotate(14 43 50)"/><rect x="55.5" y="16" width="3" height="68" rx="1.5" fill="url(#${u('bb')})" transform="rotate(-14 57 50)"/></g>
      <rect x="47.4" y="20" width="5.2" height="60" rx="2.6" fill="url(#${u('w')})"/>`,
  },
  {
    id: 'dawn', family: 'light', name: 'Horizon', lockup: 'serif',
    note: 'A low sun on a horizon of grooves: blue night above, orange morning below. An interlude between sets.',
    art: (u) => `<defs>${blur(u, 'b', 2.4)}${linear(u, 'sky', [[0, A, 0], [0.7, A, 0.55], [1, W, 0.9]], 'x1="0" y1="0" x2="0" y2="1"')}<clipPath id="${u('c')}"><circle cx="50" cy="50" r="30"/></clipPath></defs>
      <g clip-path="url(#${u('c')})"><rect x="0" y="20" width="100" height="36" fill="url(#${u('sky')})"/>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><circle cx="50" cy="56" r="11" fill="${B}"/></g><circle cx="50" cy="56" r="7.5" fill="${W}"/>
      <rect x="0" y="56" width="100" height="30" fill="#0b0b0d"/>${[59, 63, 68, 74].map((y, i) => `<line x1="0" x2="100" y1="${y}" y2="${y}" stroke="${B}" stroke-opacity="${0.55 - i * 0.12}" stroke-width="1"/>`).join('')}</g>`,
  },
  {
    id: 'cones', family: 'light', name: 'Two cones', lockup: 'light',
    note: 'Two lamps from above, their cones overlapping on the floor below: blue, orange, and white between.',
    art: (u) => `<defs>${blur(u, 'b', 3.4)}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">${beam(u, 'a', 32, 10, 58, 86, 1, 20, A)}${beam(u, 'bb', 68, 10, 42, 86, 1, 20, B)}</g>
      <ellipse cx="50" cy="80" rx="18" ry="4" fill="${W}" opacity="0.55"/><circle cx="32" cy="12" r="2.2" fill="${A}"/><circle cx="68" cy="12" r="2.2" fill="${B}"/>`,
  },
  {
    id: 'vee', family: 'light', name: 'Meeting point', lockup: 'classic',
    note: 'Two beams coming down to a single point of white: the two decks meeting in the mix.',
    art: (u) => `<defs>${blur(u, 'b', 2)}${radial(u, 'core', [[0, W, 1], [0.4, W, 0.6], [1, W, 0]])}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">${beam(u, 'a', 50, 72, 18, 20, 1, 7, A)}${beam(u, 'bb', 50, 72, 82, 20, 1, 7, B)}</g>
      <g style="mix-blend-mode:screen">${beam(u, 'a2', 50, 72, 18, 20, 0.6, 2.2, A)}${beam(u, 'b2', 50, 72, 82, 20, 0.6, 2.2, B)}</g>
      <circle cx="50" cy="72" r="9" fill="url(#${u('core')})"/>`,
  },
  {
    id: 'bands', family: 'light', name: 'Overlap', lockup: 'caps',
    note: 'Two bars of coloured light sliding together; where they overlap, white. The crossfade, as a picture.',
    art: (u) => `<defs>${blur(u, 'b', 2.2)}</defs>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><rect x="20" y="40" width="40" height="20" rx="10" fill="${A}"/><rect x="40" y="40" width="40" height="20" rx="10" fill="${B}"/></g>
      <g style="mix-blend-mode:screen"><rect x="22" y="42" width="36" height="16" rx="8" fill="${A}"/><rect x="42" y="42" width="36" height="16" rx="8" fill="${B}"/></g>
      <rect x="42" y="42" width="16" height="16" rx="3" fill="${W}"/>`,
  },
  {
    id: 'prism', family: 'light', name: 'Prism', lockup: 'regular',
    note: 'One white beam in, two coloured beams out: one record splitting into the next.',
    art: (u) => `<defs>${blur(u, 'b', 1.8)}${linear(u, 'w', [[0, W, 0], [1, W, 1]])}</defs>
      <rect x="12" y="48" width="30" height="4" fill="url(#${u('w')})"/>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen">${beam(u, 'a', 54, 48, 90, 30, 1.2, 5, A)}${beam(u, 'bb', 54, 52, 90, 70, 1.2, 5, B)}</g>
      <path d="M50 32 L62 56 L38 56 Z" transform="rotate(90 50 46)" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round" opacity="0.85"/>`,
  },
  {
    id: 'lamp', family: 'light', name: 'Under the lamp', lockup: 'serif',
    note: 'A record under a lamp, its light falling in a cone with a cool and a warm edge, the way the hero is lit.',
    art: (u) => `<defs>${blur(u, 'b', 2.6)}<clipPath id="${u('c')}"><ellipse cx="50" cy="70" rx="30" ry="10"/></clipPath></defs>
      <ellipse cx="50" cy="70" rx="30" ry="10" fill="#08080a" stroke="#ffffff" stroke-opacity="0.12"/>
      <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><polygon points="50,18 33,70 40,70" fill="${A}" opacity="0.8"/><polygon points="50,18 60,70 67,70" fill="${B}" opacity="0.8"/><polygon points="50,18 40,70 60,70" fill="${W}" opacity="0.35"/></g>
      <g clip-path="url(#${u('c')})"><ellipse cx="50" cy="70" rx="13" ry="4.2" fill="${W}" opacity="0.6"/></g>
      <path d="M42 18 L58 18 L54 13 L46 13 Z" fill="${W}"/>`,
  },
  {
    id: 'glints', family: 'light', name: 'Glints', lockup: 'light',
    note: 'Two glints off the grooves, a blue and an orange star of light, the way the lamp catches a spinning record.',
    art: (u) => {
      const star = (cx, cy, r, col) => `<path d="M${cx} ${cy - r} Q ${cx + r * 0.12} ${cy - r * 0.12} ${cx + r} ${cy} Q ${cx + r * 0.12} ${cy + r * 0.12} ${cx} ${cy + r} Q ${cx - r * 0.12} ${cy + r * 0.12} ${cx - r} ${cy} Q ${cx - r * 0.12} ${cy - r * 0.12} ${cx} ${cy - r} Z" fill="${col}"/>`;
      return `<defs>${blur(u, 'b', 3)}</defs>
        <g filter="url(#${u('b')})" style="mix-blend-mode:screen"><circle cx="40" cy="44" r="10" fill="${A}"/><circle cx="62" cy="58" r="8" fill="${B}"/></g>
        ${star(40, 44, 22, A)}${star(40, 44, 9, W)}${star(62, 58, 16, B)}${star(62, 58, 6.5, W)}`;
    },
  },
  // ── Shape: everything else ────────────────────────────────────────────
  {
    id: 'current', family: 'shape', name: 'Venn rings (today)', lockup: 'classic',
    note: 'The mark the site uses now: two decks\' rings and the white of their overlap.',
    art: () => `<path d="M50 33.2 A20.5 20.5 0 0 1 50 66.8 A20.5 20.5 0 0 1 50 33.2 Z" fill="#ececea"/><circle cx="38.3" cy="50" r="20.5" fill="none" stroke="#3db4ff" stroke-width="4.3"/><circle cx="61.7" cy="50" r="20.5" fill="none" stroke="#ff8a3d" stroke-width="4.3"/>`,
  },
  {
    id: 'discs', family: 'shape', name: 'Two discs', lockup: 'regular',
    note: 'The venn as solid records, one over the other; the overlap is the mix.',
    art: () => `<circle cx="39" cy="50" r="21" fill="${A}"/><circle cx="61" cy="50" r="21" fill="${B}"/><path d="M50 32.2 A21 21 0 0 1 50 67.8 A21 21 0 0 1 50 32.2 Z" fill="${W}"/>`,
  },
  {
    id: 'pause', family: 'shape', name: 'Pause', lockup: 'caps',
    note: 'An interlude is a pause: the two bars, one per deck, with the music\'s dot between them.',
    art: () => `<rect x="31" y="28" width="11" height="44" rx="5.5" fill="${A}"/><rect x="58" y="28" width="11" height="44" rx="5.5" fill="${B}"/><circle cx="50" cy="50" r="3.6" fill="${W}"/>`,
  },
  {
    id: 'gap', family: 'shape', name: 'The gap', lockup: 'light',
    note: 'A waveform with a quiet stretch in the middle: the break between two songs, where the mix happens.',
    art: () => {
      const h = [8, 14, 22, 12, 26, 18, 10, 2, 2, 2, 12, 24, 16, 28, 14, 20, 8];
      return h.map((v, i) => `<rect x="${(17 + i * 3.9).toFixed(1)}" y="${(50 - v / 2).toFixed(1)}" width="2.4" height="${v}" rx="1.2" fill="${i < 7 ? A : i > 9 ? B : W}"/>`).join('');
    },
  },
  {
    id: 'record-i', family: 'shape', name: 'Record i', lockup: 'lower',
    note: 'A lowercase i: its dot a spinning record, its stem the tonearm\'s rest.',
    art: () => `<circle cx="50" cy="33" r="13" fill="#0b0b0d" stroke="${W}" stroke-width="1.4"/>${rings(50, 33, 5, 2.2, 3, '#ffffff', 0.5, 0.35)}<circle cx="50" cy="33" r="4.2" fill="${B}"/><circle cx="50" cy="33" r="1" fill="#0b0b0d"/><rect x="44.5" y="52" width="11" height="26" rx="5.5" fill="${W}"/>`,
  },
  {
    id: 'loop', family: 'shape', name: 'Loop', lockup: 'regular',
    note: 'One continuous line making two loops, blue into orange: the mix as an infinity sign.',
    art: (u) => `<defs>${linear(u, 'g', [[0, A], [0.5, W], [1, B]])}</defs><path d="M50 50 C 41 38, 22 38, 22 50 C 22 62, 41 62, 50 50 C 59 38, 78 38, 78 50 C 78 62, 59 62, 50 50 Z" fill="none" stroke="url(#${u('g')})" stroke-width="6" stroke-linejoin="round"/>`,
  },
  {
    id: 'tonearm', family: 'shape', name: 'Tonearm', lockup: 'classic',
    note: 'A record and its arm, in the fewest lines: the turntable, from above.',
    art: () => `<circle cx="44" cy="54" r="24" fill="#0b0b0d" stroke="${W}" stroke-opacity="0.25" stroke-width="1"/>${rings(44, 54, 9, 2.6, 6, '#ffffff', 0.5, 0.18)}<circle cx="44" cy="54" r="6" fill="${B}"/><path d="M76 24 L72 52 L58 64" fill="none" stroke="${W}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="76" cy="24" r="4.2" fill="${A}"/>`,
  },
  {
    id: 'parens', family: 'shape', name: 'Between', lockup: 'serif',
    note: 'Inter-lude: something in between. A dot held between two brackets, one per deck.',
    art: () => `<path d="M36 26 C 24 36, 24 64, 36 74" fill="none" stroke="${A}" stroke-width="5.5" stroke-linecap="round"/><path d="M64 26 C 76 36, 76 64, 64 74" fill="none" stroke="${B}" stroke-width="5.5" stroke-linecap="round"/><circle cx="50" cy="50" r="6" fill="${W}"/>`,
  },
  {
    id: 'arc', family: 'shape', name: 'Level arc', lockup: 'caps',
    note: 'Seven meter bars rising and falling in an arch: a track building and breaking.',
    art: () => [10, 18, 26, 32, 26, 18, 10].map((v, i) => `<rect x="${(25 + i * 7.6).toFixed(1)}" y="${62 - v}" width="4.4" height="${v}" rx="2.2" fill="${i < 3 ? A : i > 3 ? B : W}"/>`).join('') + `<rect x="24" y="68" width="52" height="2.4" rx="1.2" fill="${W}" opacity="0.4"/>`,
  },
  {
    id: 'knob', family: 'shape', name: 'Knob', lockup: 'regular',
    note: 'The mixer\'s knob, turned halfway from blue to orange: the crossover point.',
    art: (u) => `<defs>${linear(u, 'r', [[0, A], [1, B]])}${radial(u, 'k', [[0, '#3a3a40'], [1, '#141416']], 'cx="0.4" cy="0.35" r="0.7"')}</defs><path d="M30.2 69.8 A28 28 0 1 1 69.8 69.8" fill="none" stroke="url(#${u('r')})" stroke-width="4.2" stroke-linecap="round"/><circle cx="50" cy="50" r="19" fill="url(#${u('k')})" stroke="#ffffff" stroke-opacity="0.12"/><rect x="48.6" y="33" width="2.8" height="12" rx="1.4" fill="${W}"/>`,
  },
  {
    id: 'sine', family: 'shape', name: 'Breath', lockup: 'light',
    note: 'A wave that rests flat for a moment before it carries on: the music taking a breath.',
    art: (u) => `<defs>${linear(u, 'g', [[0, A], [0.42, A], [0.5, W], [0.58, B], [1, B]])}</defs><path d="M16 50 C 20 34, 26 34, 30 50 S 38 66, 42 50 L 58 50 C 62 34, 68 34, 72 50 S 80 66, 84 50" fill="none" stroke="url(#${u('g')})" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: 'stack', family: 'shape', name: 'Stacked decks', lockup: 'caps',
    note: 'Two records seen edge on, one above the other: deck A and deck B as one capital I.',
    art: () => `<ellipse cx="50" cy="34" rx="24" ry="7" fill="${A}"/><ellipse cx="50" cy="66" rx="24" ry="7" fill="${B}"/><rect x="46.5" y="36" width="7" height="28" rx="3.5" fill="${W}"/>`,
  },
  {
    id: 'cue', family: 'shape', name: 'Cue', lockup: 'classic',
    note: 'The playhead on a beatgrid with a cue marker set: the one moment you choose to drop in.',
    art: () => `${[22, 30, 38, 46, 54, 62, 70, 78].map((x, i) => `<rect x="${x - 0.8}" y="${i % 4 === 0 ? 38 : 44}" width="1.6" height="${i % 4 === 0 ? 24 : 12}" rx="0.8" fill="${W}" opacity="${i % 4 === 0 ? 0.8 : 0.35}"/>`).join('')}<rect x="48.6" y="26" width="2.8" height="48" rx="1.4" fill="${B}"/><path d="M44 26 L56 26 L50 33 Z" fill="${B}"/><path d="M31 70 L37 64 L37 76 Z" fill="${A}"/>`,
  },
];

// How the name sits with each mark (the wordmark's weight, case, tracking,
// size against the icon, and the gap between). font: the page's Geist, or a
// serif where the system has one (New York on Apple systems).
export const LOCKUPS = {
  classic: { name: 'Geist semibold, tight', weight: 600, tracking: -0.03, case: 'none', font: 'var(--font)', size: 1, gap: 0.3 },
  regular: { name: 'Geist medium', weight: 500, tracking: -0.02, case: 'none', font: 'var(--font)', size: 1, gap: 0.3 },
  light: { name: 'Geist light, open', weight: 300, tracking: 0, case: 'none', font: 'var(--font)', size: 1.04, gap: 0.32 },
  lower: { name: 'lowercase, tight', weight: 600, tracking: -0.045, case: 'lowercase', font: 'var(--font)', size: 1.05, gap: 0.26 },
  caps: { name: 'CAPITALS, spaced', weight: 500, tracking: 0.2, case: 'uppercase', font: 'var(--font)', size: 0.62, gap: 0.42 },
  serif: { name: 'Serif', weight: 400, tracking: -0.01, case: 'none', font: "ui-serif, 'New York', 'Iowan Old Style', Georgia, serif", size: 1.08, gap: 0.3 },
};

let n = 0;
/** The whole icon: tile, mark and the tile's lit edge, as an SVG string. */
export function iconSVG(logo, { size } = {}) {
  const k = `l${++n}`;
  const u = (id) => `${k}-${id}`;
  const light = logo.tile === 'light';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${size ? ` width="${size}" height="${size}"` : ''}>
    <defs>${linear(u, 'bg', light ? [[0, '#fbfaf7'], [1, '#e7e4dc']] : [[0, '#232327'], [1, '#0d0d0f']], 'x1="0" y1="0" x2="0" y2="1"')}
      <linearGradient id="${u('edge')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${light ? 0.9 : 0.22}"/><stop offset="0.5" stop-color="#fff" stop-opacity="${light ? 0.3 : 0.07}"/><stop offset="1" stop-color="#fff" stop-opacity="${light ? 0.1 : 0.04}"/></linearGradient>
      <clipPath id="${u('tile')}"><path d="${squircle}"/></clipPath></defs>
    <path d="${squircle}" fill="url(#${u('bg')})"/>
    <g clip-path="url(#${u('tile')})" style="isolation:isolate">${logo.art(u)}</g>
    <path d="${squircle}" fill="none" stroke="url(#${u('edge')})" stroke-width="0.6"/>
  </svg>`;
}

/** As a data: URL, for an <img> or a favicon. */
export const iconURL = (logo) => `data:image/svg+xml,${encodeURIComponent(iconSVG(logo))}`;
export const byId = (id) => LOGOS.find((l) => l.id === id);
