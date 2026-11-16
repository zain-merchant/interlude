// #3: onto the 4px grid, and edges that should meet, meeting.
//
// Measured with getBoundingClientRect, the app was close to its 4px grid
// but not on it, and several lines that read as one across panels missed
// each other by a few pixels:
// - The deck header was 45px (a 28px title over a 17px artist line), so
//   every row below it sat a pixel off the grid.
// - The pitch column's nudge buttons ended 4px below the headphone
//   buttons beside them in the mixer, and the mode row.
// - The library sidebar's items ran 2px below the track rows next to them
//   (their heading was 18.3px tall, so they sat on fractional pixels too).
// - The mixer's centre column (Master, Cue mix, meters, Rec) sat on
//   fractional pixels, and Rec floated mid-column, lined up with nothing.
// - The waveform lanes' track names weren't centred on the zoom control's
//   line at the same height.
//
// Fixes: line boxes on 4px multiples; nudge, headphones and Rec end on
// the mode row's bottom line, 12px above the transport; the sidebar
// and track list share one 28px row pitch from the search bar down. The
// overlay setting draws the grid over the app to check by eye.
//
// Left as they are: the channel dials are spread with space-between, so
// they sit on quarter pixels (snapping them needs a hook in Mixer.svelte);
// the mode tabs are 33px (32 and their rule); the pitch readout is centred
// in its 28px row. There is no base-unit setting: the window padding,
// sampler height, waveform row and library row height are literals in
// App.svelte and Library.svelte, so a different unit would pull them apart.
export default {
  id: 'grid',
  n: 3,
  title: 'Onto the 4px grid, edges lined up',
  group: 'Layout',
  notes: 'Deck header 44px; nudge, headphone and Rec on the mode row\'s bottom line; sidebar and tracks on one 28px pitch; Master column on whole pixels; lane names centred on the zoom control. Overlay draws the grid.',
  settings: {
    overlay: {
      type: 'choice',
      options: [
        ['off', 'Off'],
        ['4', '4px'],
        ['16', '16px'],
      ],
      default: 'off',
      label: 'Grid overlay',
    },
  },
};

/** Show me: the 4px grid over deck A, the mixer and the library, with guides on the lines that should meet. */
export const show = {
  note: "4px grid (brighter every 16) over deck A, the mixer and the library, with guides on what should line up: the mode row's bottom line (nudge, headphone and Rec end on it), the deck header's height, sidebar items against track rows, the lane name against the zoom control. Green is on the line, red is off by the px shown. Turn the flag off and on to watch them move.",
  target: (app) => [app.$("[data-region='deck0'] header"), app.$("[data-region='deck0'] .pitch .nudge"), ...app.$$('.mixer .hp'), app.$('.mixer button.rec'), app.$("[data-region='sidebar']")],
  aid(d, app) {
    const { C } = d;
    const r1 = (n) => Math.round(n * 10) / 10;
    const near = (a, b) => Math.abs(a - b) < 0.5;
    const off = (a, b) => (near(a, b) ? 'on the line' : `${a > b ? '+' : ''}${r1(a - b)}px`);
    const deckA = app.deck(0)?.getBoundingClientRect();
    const mixer = app.$('.mixer')?.getBoundingClientRect();
    if (deckA && mixer) d.grid(new DOMRect(deckA.x, deckA.y, mixer.right - deckA.x, deckA.height), 4);
    const lib = app.$('section.library')?.getBoundingClientRect();
    if (lib) d.grid(new DOMRect(lib.x, lib.y, Math.min(lib.width, 620), Math.min(lib.height, 220)), 4);

    // The mode row's bottom line, and what should end on it.
    const mp = app.$("[data-region='deck0'] .mp")?.getBoundingClientRect();
    if (mp && mixer) {
      const y = mp.bottom;
      d.hguide(y, { x1: deckA.x, x2: mixer.right, label: `mode row bottom, y ${r1(y)}`, lx: deckA.x + 4 });
      const ends = [
        ['nudge', app.$("[data-region='deck0'] .pitch .nudge")],
        ['headphone A', app.$$('.mixer .hp')[0]],
        ['Rec', app.$('.mixer button.rec')],
        ['headphone B', app.$$('.mixer .hp')[1]],
      ];
      ends.forEach(([name, el], i) => {
        const r = el?.getBoundingClientRect();
        if (!r) return;
        const c = near(r.bottom, y) ? C.ok : C.bad;
        d.box(r, { c, w: 1.5 });
        d.text(r.x + r.width / 2, y + 12 + (i % 2) * 15, `${name} ${off(r.bottom, y)}`, { c, anchor: 'middle' });
      });
    }
    // Deck header: a multiple of 4 or not.
    const h = app.$("[data-region='deck0'] header")?.getBoundingClientRect();
    if (h) {
      const ok = near(h.height / 4, Math.round(h.height / 4));
      d.measure(h.right + 6, h.top, h.right + 6, h.bottom, { c: ok ? C.ok : C.bad, label: `header ${r1(h.height)}px` });
    }
    // Sidebar items against the track list's rows (its header and rows).
    const items = app.$$("[data-region='sidebar'] .item, [data-region='sidebar'] .add").map((e) => e.getBoundingClientRect());
    const tops = [app.$('section.library .row.head'), ...app.rows()].map((e) => e?.getBoundingClientRect().top).filter((v) => v != null);
    const main = app.$('section.library .main')?.getBoundingClientRect();
    for (const r of items.slice(0, 6)) {
      if (!main || r.top > main.bottom) continue;
      const nearest = tops.reduce((a, b) => (Math.abs(b - r.top) < Math.abs(a - r.top) ? b : a), Infinity);
      const c = near(nearest, r.top) ? C.ok : C.bad;
      d.line(r.left, r.top, main.left + 420, r.top, { c, dash: '3 3' });
      d.text(main.left + 424, r.top, near(nearest, r.top) ? 'meets a row' : `${r1(r.top - nearest)}px off the row`, { c });
    }
    // Lane name against the zoom control's centre line.
    const who = app.$('.waves .lane .who')?.getBoundingClientRect();
    const zoom = app.$('.waves .zoom')?.getBoundingClientRect();
    if (who && zoom) {
      const y = zoom.top + zoom.height / 2;
      const wy = who.top + who.height / 2;
      const c = near(wy, y) ? C.ok : C.bad;
      d.hguide(y, { c, label: `lane name's centre ${off(wy, y)} from the zoom control's`, lx: who.right + 40 });
      d.box(who, { c });
      d.box(zoom, { c });
    }
  },
};
