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

/** Show me: the 4px grid over deck A and the mixer, and the lines that should meet, each with its verdict. */
export const show = {
  note: 'On the 4px grid, with the lines that should meet: a green dot is lined up, a red one says by how much it misses.',
  target: (app) => [app.$("[data-region='deck0'] .pitch .nudge"), ...app.$$('.mixer .hp'), app.$('.mixer button.rec')],
  aid(d, app) {
    const r1 = (n) => Math.round(n * 10) / 10;
    const near = (a, b) => Math.abs(a - b) < 0.5;
    const miss = (a, b) => `${a > b ? '+' : '−'}${r1(Math.abs(a - b))}px`;
    const deckA = app.deck(0)?.getBoundingClientRect();
    const mixer = app.$('.mixer')?.getBoundingClientRect();
    if (deckA && mixer) d.grid(new DOMRect(deckA.x, deckA.y, mixer.right - deckA.x, deckA.height), 4);

    // The mode row's bottom line, and the four that should end on it.
    const mp = app.$("[data-region='deck0'] .mp")?.getBoundingClientRect();
    if (mp && mixer) {
      const y = mp.bottom;
      const ends = [app.$("[data-region='deck0'] .pitch .nudge"), app.$$('.mixer .hp')[0], app.$('.mixer button.rec'), app.$$('.mixer .hp')[1]]
        .map((e) => e?.getBoundingClientRect())
        .filter(Boolean);
      const off = ends.filter((r) => !near(r.bottom, y));
      d.hguide(y, { x1: deckA.x, x2: mixer.right, label: off.length ? "mode row's line" : "mode row's line: nudge, headphones and Rec end on it", lx: deckA.x + 8, tone: off.length ? 'bad' : 'ok' });
      for (const r of off) d.text(r.x + r.width / 2, y + 14, miss(r.bottom, y), { anchor: 'middle', tone: 'bad' });
    }
    // The deck header: a multiple of 4.
    const h = app.$("[data-region='deck0'] header")?.getBoundingClientRect();
    if (h) {
      const ok = near(h.height / 4, Math.round(h.height / 4));
      d.measure(h.right + 8, h.top, h.right + 8, h.bottom, { label: `${r1(h.height)}`, tone: ok ? 'ok' : 'bad' });
    }
    // Sidebar items against the track rows: one verdict for all of them.
    const items = app.$$("[data-region='sidebar'] .item").map((e) => e.getBoundingClientRect()).slice(0, 6);
    const tops = [app.$('section.library .row.head'), ...app.rows()].map((e) => e?.getBoundingClientRect().top).filter((v) => v != null);
    const main = app.$('section.library .main')?.getBoundingClientRect();
    if (items.length && main && tops.length) {
      const worst = items.reduce((w, r) => {
        const n = tops.reduce((a, b) => (Math.abs(b - r.top) < Math.abs(a - r.top) ? b : a), Infinity);
        return Math.abs(r.top - n) > Math.abs(w) ? r.top - n : w;
      }, 0);
      for (const r of items) d.line(r.left, r.top, main.left + 160, r.top, { dash: '2 3', opacity: 0.7 });
      d.text(main.left + 166, items[0].top, Math.abs(worst) < 0.5 ? 'sidebar items on the row lines' : `sidebar items ${miss(worst, 0)} off the rows`, { tone: Math.abs(worst) < 0.5 ? 'ok' : 'bad' });
    }
    // The lane name against the zoom control's centre line.
    const who = app.$('.waves .lane .who')?.getBoundingClientRect();
    const zoom = app.$('.waves .zoom')?.getBoundingClientRect();
    if (who && zoom) {
      const y = zoom.top + zoom.height / 2;
      const wy = who.top + who.height / 2;
      const ok = near(wy, y);
      d.hguide(y, { x1: who.right + 6, x2: zoom.left - 6, dash: '2 3' });
      d.text(who.right + 12, y, ok ? 'lane name centred on the zoom control' : `lane name ${miss(wy, y)} off the zoom control's centre`, { tone: ok ? 'ok' : 'bad' });
    }
  },
};
