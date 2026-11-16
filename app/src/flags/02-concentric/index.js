// #2: concentric corners wherever a rounded thing sits inset in another.
//
// A rounded control close to its container's rounded corner looks right
// only when the two curves share a centre: inner radius = outer radius −
// inset. Each nesting below is written as that sum, so it keeps working if
// the radius tokens or the spacing change. Where the inner radius would get
// too small (the toast's Undo, the banner's buttons) the outer one grows to
// inner + inset instead.
//
// Inventory (corner nestings, inset on both sides < outer radius):
//   waveforms panel → its zoom pill (8px in)                was 6, now 8
//   zoom pill → its − and + buttons (2px in)                was 4, now 6
//   library panel → nav items, bar controls, track list (8) already 8, now calc
//   track list → its rows (0px in)                          already, now calc
//   search field → its clear button (6px in)                was 4, now 2
//   sampler strip → its close button (8px in)               was 6, now 8
//   settings panel → its bar buttons (8px in)               already 8, now calc
//   beat-jump control → its ‹ › buttons (0px in)            already, now calc
//   context menu → its items (4px in)                       was 5, now 4
//   toast → Undo (6px in)                                   toast 8 → 12
//   banner → its buttons (8px in)                           banner 8 → 16
// Not nestings: the deck and mixer controls sit 16px in from 16px corners
// (inset = radius, so the concentric radius would be 0); the "Padded
// panels" setting tries growing those panels to control radius + padding.
// Dialog cards (Import, Report) pad 24–32px from 14px corners, so their
// contents are clear of the curve too.
export default {
  id: 'concentric',
  n: 2,
  title: 'Concentric inset corners',
  group: 'Shape',
  notes:
    'Inner radius = outer radius − inset wherever a rounded control sits near a rounded corner: zoom pill, clear button, sampler close, menu items, the toast and banner. "Grow" also rounds the deck and mixer panels to control radius + padding (24px), so their corner buttons are concentric too.',
  settings: {
    panels: {
      type: 'choice',
      options: [
        ['keep', 'Keep 16px'],
        ['grow', 'Grow decks'],
      ],
      default: 'keep',
      label: 'Padded panels',
    },
  },
};

/** Show me: each nested corner's radius drawn as a circle with its centre, outer and inner together. */
export const show = {
  note: "Radius circles and centres on the zoom pill, its + button and the track list: concentric where the dots meet (green). Turn the flag off and on to compare.",
  target: (app) => [app.$('.waves .zoom'), app.$("section.library [data-region='tracks']")],
  aid(d, app) {
    const { C } = d;
    /** One corner's radius circle and centre; returns the centre. */
    const corner = (el, which, c) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const prop = { tl: 'borderTopLeftRadius', tr: 'borderTopRightRadius', br: 'borderBottomRightRadius', bl: 'borderBottomLeftRadius' }[which];
      const rad = Math.min(parseFloat(cs[prop]) || 0, r.width / 2, r.height / 2);
      const cx = which.includes('l') ? r.left + rad : r.right - rad;
      const cy = which.includes('t') ? r.top + rad : r.bottom - rad;
      d.circle(cx, cy, rad, { c, dash: '2 2' });
      d.dot(cx, cy, { c, r: 2 });
      return { cx, cy, rad };
    };
    const pair = (outer, inner, which, name, at) => {
      if (!outer || !inner) return;
      const o = corner(outer, which, C.ghost);
      const i = corner(inner, which, C.aid);
      const gap = Math.hypot(o.cx - i.cx, o.cy - i.cy);
      const c = gap < 0.75 ? C.ok : C.bad;
      d.text(at.x, at.y, `${name}: outer r${Math.round(o.rad)}, inner r${Math.round(i.rad)}, ${gap < 0.75 ? 'centres meet' : `centres ${Math.round(gap * 10) / 10}px apart`}`, { c, anchor: at.anchor ?? 'end' });
    };
    const waves = app.$('.waves');
    const zoom = app.$('.waves .zoom');
    const plus = app.$(".waves .zoom button[aria-label='Zoom in']");
    const zr = zoom?.getBoundingClientRect();
    if (zr) {
      pair(waves, zoom, 'tr', 'waveforms > zoom pill', { x: zr.left - 8, y: zr.top + 4 });
      pair(zoom, plus, 'tr', 'zoom pill > + button', { x: zr.left - 8, y: zr.bottom + 10 });
      d.loupe('zoom', { x: zr.right - 30, y: zr.top - 12 }, { zoom: 5, size: { w: 220, h: 150 }, at: { x: zr.right - 236, y: zr.bottom + 28 }, caption: 'zoom pill corner, 5×' });
    }
    const lib = app.$('section.library');
    const list = app.$("section.library [data-region='tracks']");
    const lr = list?.getBoundingClientRect();
    if (lr) pair(lib, list, 'br', 'library > track list', { x: lr.right - 8, y: lr.bottom - 24 });
  },
};
