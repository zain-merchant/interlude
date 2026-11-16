// #2: concentric corners by construction.
//
// A rounded control near its container's rounded corner looks right only
// when the two curves share a centre: inner radius = outer radius − inset.
// Rather than fix each nesting, this sets the app from two numbers: every
// panel (decks, mixer, waveforms, library, Settings, sampler, the dialogs)
// has the same radius R and insets its content by the same padding P, and
// every radius inside is derived from them (style.css):
//   panels                                   R
//   controls, fields, rows, tabs (--r)        R − P, never below 4px
//   zoom pill (P in) and its buttons (2 in)   R − P, R − P − 2
//   search clear button (6 in)                R − P − 6
//   menu items (4 in)                         --r − 4
//   toast, banner (around Undo / buttons)     --r + 6, --r + 8
// Both are settings, to tune live. The defaults (R 24, P 16) keep today's
// 16px padding and 8px controls, so the panels round more and the mixer
// (12px sides) and the library (8px) pad 16 like the decks.
//
// Before: panels were 16px with controls 16px in (inset = radius, so a
// concentric control would be square), the library padded 8, the mixer 12,
// and the few real nestings were fixed one by one.
export default {
  id: 'concentric',
  n: 2,
  title: 'Concentric inset corners',
  group: 'Shape',
  notes:
    'One panel radius and one panel padding for every panel; every inner radius is the panel radius less its inset (at least 4px). Tune both below: controls follow.',
  settings: {
    radius: { type: 'range', min: 12, max: 32, step: 1, default: 24, unit: 'px', label: 'Panel radius' },
    padding: { type: 'range', min: 8, max: 24, step: 2, default: 16, unit: 'px', label: 'Panel padding' },
  },
};

/** Show me: each nested corner's radius drawn as a circle with its centre, outer and inner together. */
export const show = {
  note: "Radius circles and centres where a rounded thing sits in a rounded panel: concentric where the dots meet (green). Drag Panel radius and Panel padding under More.",
  target: (app) => [app.$('.waves .zoom'), app.$("[data-region='deck0'] .transport .btn.cue"), app.$("section.library [data-region='tracks']")],
  aid(d, app) {
    const { C } = d;
    /** One corner's radius circle and centre. */
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
      d.text(at.x, at.y, `${name}: r${Math.round(o.rad)} > r${Math.round(i.rad)}, ${gap < 0.75 ? 'centres meet' : `centres ${Math.round(gap * 10) / 10}px apart`}`, { c, anchor: at.anchor ?? 'end' });
    };
    const zoom = app.$('.waves .zoom');
    const zr = zoom?.getBoundingClientRect();
    if (zr) {
      pair(app.$('.waves'), zoom, 'tr', 'waveforms > zoom', { x: zr.left - 8, y: zr.top + 4 });
      pair(zoom, app.$(".waves .zoom button[aria-label='Zoom in']"), 'tr', 'zoom > + button', { x: zr.left - 8, y: zr.bottom + 10 });
    }
    const cue = app.$("[data-region='deck0'] .transport .btn.cue");
    const cr = cue?.getBoundingClientRect();
    if (cr) pair(app.deck(0), cue, 'bl', 'deck A > Cue', { x: cr.left, y: cr.bottom + 22, anchor: 'start' });
    const list = app.$("section.library [data-region='tracks']");
    const lr = list?.getBoundingClientRect();
    if (lr) pair(app.$('section.library'), list, 'br', 'library > track list', { x: lr.right - 8, y: lr.bottom - 24 });
  },
};
