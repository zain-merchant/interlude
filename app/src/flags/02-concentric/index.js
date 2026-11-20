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
//   toast, banner (around Undo / buttons)     --r + its inset (6, or 4 with #15), --r + 8
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
  title: 'Rounded corners that nest evenly',
  group: 'Shape',
  notes:
    'One panel radius and one panel padding for every panel; every inner radius is the panel radius less its inset (at least 4px). Tune both below: controls follow.',
  settings: {
    radius: { type: 'range', min: 12, max: 32, step: 1, default: 24, unit: 'px', label: 'Panel radius' },
    padding: { type: 'range', min: 8, max: 24, step: 2, default: 16, unit: 'px', label: 'Panel padding' },
  },
};

/** Show me: a loupe on Cue in deck A's rounded corner, flipping; the gap between the two curves measured at the side and round the corner. */
export const show = {
  about: "A rounded button near a panel's rounded corner left an uneven gap, wider at the corner than along the sides. Now inner corners follow the outer ones, so the gap stays even.",
  before: "Look at the gap between Cue and the corner of its panel: it's wider round the corner than along the edges, so the button looks slightly out of place.",
  after: "Every inner corner is the panel's corner made smaller by the gap, so the gap is the same all the way round and the two shapes look like they belong together.",
  target: (app) => [app.$("[data-region='deck0'] .transport .btn.cue")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const rad = (el, prop) => {
      const r = el.getBoundingClientRect();
      return Math.min(parseFloat(getComputedStyle(el)[prop]) || 0, r.width / 2, r.height / 2);
    };
    /** A line clipped to rect b (the loupe), drawn only where it's inside. */
    const seg = (b, x1, y1, x2, y2, o) => {
      let t0 = 0;
      let t1 = 1;
      const dx = x2 - x1;
      const dy = y2 - y1;
      for (const [p, q] of [[-dx, x1 - b.x], [dx, b.right - x1], [-dy, y1 - b.y], [dy, b.bottom - y1]]) {
        if (p === 0) {
          if (q < 0) return;
        } else {
          const t = q / p;
          if (p < 0) t0 = Math.max(t0, t);
          else t1 = Math.min(t1, t);
        }
      }
      if (t0 < t1) d.line(x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy, o);
    };
    /**
     * A loupe on one corner of `outer` with `inner` near it. sx, sy: which
     * corner (-1 left / +1 right, -1 top / +1 bottom). Draws the even-gap
     * line (dashed) and measures the gap at the side and round the corner.
     */
    const nest = (key, outer, inner, sx, sy, zoom, size, at, caption) => {
      if (!outer || !inner) return null;
      const prop = `border${sy < 0 ? 'Top' : 'Bottom'}${sx < 0 ? 'Left' : 'Right'}Radius`;
      const O = outer.getBoundingClientRect();
      const I = inner.getBoundingClientRect();
      const R = rad(outer, prop);
      const r = rad(inner, prop);
      const cx = sx < 0 ? O.left : O.right;
      const cy = sy < 0 ? O.top : O.bottom;
      const ix = sx < 0 ? I.left : I.right;
      const iy = sy < 0 ? I.top : I.bottom;
      const gap = Math.min(Math.abs(ix - cx), Math.abs(iy - cy));
      // The corners' centres, and where each curve crosses the diagonal.
      const oc = { x: cx - sx * R, y: cy - sy * R };
      const ic = { x: ix - sx * r, y: iy - sy * r };
      const k = Math.SQRT1_2;
      const op = { x: oc.x + sx * R * k, y: oc.y + sy * R * k };
      const ip = { x: ic.x + sx * r * k, y: ic.y + sy * r * k };
      const diag = Math.hypot(op.x - ip.x, op.y - ip.y);
      const even = Math.abs(diag - gap) < 1.5;
      // The view: the outer corner a little in from the loupe's own corner.
      const vw = size.w / zoom;
      const vh = size.h / zoom;
      const src = { x: sx < 0 ? cx - 5 : cx + 5 - vw, y: sy < 0 ? cy - 5 : cy + 5 - vh };
      const l = d.loupe(key, src, { zoom, size, at, caption: '' });
      const b = l.rect;
      const m = (x, y) => l.map(x, y);
      // An even gap: the panel's edge moved in by the gap at the side.
      const e = Math.max(0, R - gap);
      const far = 200;
      const g0 = m(cx - sx * gap, cy - sy * (gap + e + far));
      const g1 = m(cx - sx * gap, cy - sy * (gap + e));
      const g2 = m(cx - sx * (gap + e), cy - sy * gap);
      const g3 = m(cx - sx * (gap + e + far), cy - sy * gap);
      seg(b, g0.x, g0.y, g1.x, g1.y, { c: d.C.ghost, dash: '5 4', w: 1.5 });
      seg(b, g2.x, g2.y, g3.x, g3.y, { c: d.C.ghost, dash: '5 4', w: 1.5 });
      if (e) {
        const E = e * zoom;
        const sweep = sx * sy > 0 ? 1 : 0;
        d.path(`M${g1.x} ${g1.y}A${E} ${E} 0 0 ${sweep} ${g2.x} ${g2.y}`, { c: d.C.ghost, dash: '5 4', w: 1.5 });
      }
      // The gap round the corner, and at the side.
      const c = even ? d.C.ok : d.C.bad;
      const a = m(op.x, op.y);
      const p = m(ip.x, ip.y);
      seg(b, a.x, a.y, p.x, p.y, { c, w: 2.5 });
      // The side: along the edge that runs across the loupe, past the curves.
      const sx0 = ix - sx * (Math.max(r, R - gap) + 14);
      const s0 = m(sx0, cy);
      const s1 = m(sx0, iy);
      seg(b, s0.x, s0.y, s1.x, s1.y, { c, w: 2.5 });
      d.text(b.x + 10, b.y + 16, 'dashed: an even gap from the edge', { fixed: true });
      d.text(b.x + 10, b.bottom - 38, caption, { fixed: true });
      d.text(b.x + 10, b.bottom - 16, even ? `even gap: ${Math.round(gap)}px all the way round` : `gap: ${Math.round(gap)}px at the side, ${Math.round(diag)}px round the corner`, { tone: even ? 'ok' : 'bad', fixed: true });
      return l;
    };
    const a = nest('deck', app.deck(0), app.$("[data-region='deck0'] .transport .btn.cue"), -1, 1, 6, { w: 320, h: 260 }, { x: 160, y: 180 }, "Cue in deck A's corner, 6× bigger");
    if (a) ctx.at = a.rect;
  },
};
