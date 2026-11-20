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

/** Show me: loupes on two nestings, each corner's radius drawn as a circle: one shared centre is concentric. */
export const show = {
  note: 'Nested corners share one centre: in each loupe the circles are the corners\' radii, the dot their centre.',
  target: (app) => [app.$('.waves .zoom'), app.$("[data-region='deck0'] .transport .btn.cue")],
  aid(d, app) {
    /** One corner's radius and centre, in window px. */
    const corner = (el, which) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const prop = { tr: 'borderTopRightRadius', bl: 'borderBottomLeftRadius' }[which];
      const rad = Math.min(parseFloat(cs[prop]) || 0, r.width / 2, r.height / 2);
      return { cx: which === 'tr' ? r.right - rad : r.left + rad, cy: which === 'tr' ? r.top + rad : r.bottom - rad, rad };
    };
    /** A loupe on `view` with the corners of `els` (outermost first) as circles. */
    const nest = (key, els, which, view, zoom, caption) => {
      if (els.some((e) => !e)) return;
      const cs = els.map((e) => corner(e, which));
      const l = d.loupe(key, view, { zoom, size: { w: view.width * zoom, h: view.height * zoom }, near: view, caption: '' });
      d.clip(l.rect, () => {
        for (const c of cs) {
          const p = l.map(c.cx, c.cy);
          d.circle(p.x, p.y, c.rad * zoom, { dash: '4 3', w: 1.25 });
        }
        for (const c of cs) {
          const p = l.map(c.cx, c.cy);
          d.dot(p.x, p.y, { r: 3 });
        }
      });
      const apart = Math.max(...cs.map((c) => Math.hypot(c.cx - cs[0].cx, c.cy - cs[0].cy)));
      const ok = apart < 0.75;
      d.text(l.at.x + 8, l.at.y + l.rect.height - 15, `${caption}: ${ok ? 'one centre' : `centres ${Math.round(apart * 10) / 10}px apart`}`, { tone: ok ? 'ok' : 'bad', fixed: true });
    };
    const waves = app.$('.waves');
    const wr = waves?.getBoundingClientRect();
    if (wr) nest('waves', [waves, app.$('.waves .zoom'), app.$(".waves .zoom button[aria-label='Zoom in']")], 'tr', new DOMRect(wr.right - 104, wr.top - 4, 108, 52), 3, 'waveforms › zoom › +');
    const deck = app.deck(0);
    const dr = deck?.getBoundingClientRect();
    if (dr) nest('deck', [deck, app.$("[data-region='deck0'] .transport .btn.cue")], 'bl', new DOMRect(dr.left - 4, dr.bottom - 68, 76, 72), 3, 'deck A › Cue');
  },
};
