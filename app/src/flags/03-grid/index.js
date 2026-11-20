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
  title: 'Things side by side line up',
  group: 'Layout',
  notes: 'Deck header 44px; nudge, headphone and Rec on the mode row\'s bottom line; sidebar and tracks on one 28px pitch; Master column on whole pixels; lane names centred on the zoom control. Column headings share a centre line with the sidebar\'s first item. The grid overlay is a dev tool (this panel only).',
  settings: {
    overlay: {
      type: 'choice',
      options: [
        ['off', 'Off', 'No overlay: the app as it will ship.'],
        ['4', '4px', 'Draws the 4px grid every size and gap sits on, to check small alignments.'],
        ['16', '16px', 'Draws a coarser 16px grid, to check that panels and rows line up across the window.'],
      ],
      default: 'off',
      label: 'Grid overlay',
    },
  },
};

/** Show me: the line under deck A's controls and the mixer's buttons, and the library's sidebar against its track names (a loupe), flipping. */
export const show = {
  about: "Things meant to sit on one line missed it by a few pixels: the sidebar's words sat lower than the track names, the deck title off its BPM. Now they line up.",
  before: "The − + under the pitch fader end lower than the buttons beside them, and the sidebar's words sit a little below the track names next to them.",
  after: 'They all end on one line, and each sidebar item sits level with a track row, so the screen reads as tidy rows instead of near misses.',
  target: (app) => [app.$("[data-region='deck0'] .pitch .nudge"), ...app.$$('.mixer .hp'), app.$('.mixer button.rec')],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const deckA = app.deck(0)?.getBoundingClientRect();
    const mixer = app.$('.mixer')?.getBoundingClientRect();
    const mp = app.$("[data-region='deck0'] .mp")?.getBoundingClientRect();
    if (deckA && mixer && mp) {
      const y = mp.bottom;
      ctx.at = new DOMRect(deckA.x + 16, y - 40, 10, 10);
      d.hguide(y, { x1: deckA.x + 8, x2: mixer.right - 8, c: before ? d.C.ghost : d.C.ok, dash: '6 4' });
      const nudge = app.$("[data-region='deck0'] .pitch .nudge")?.getBoundingClientRect();
      const rec = app.$('.mixer button.rec')?.getBoundingClientRect();
      const off = (r) => r && Math.abs(r.bottom - y) > 0.5;
      if (before) {
        if (off(nudge)) d.text(nudge.right + 8, nudge.bottom + 14, `‹ › end ${Math.round(nudge.bottom - y)}px below the line`, { tone: 'bad' });
        if (off(rec)) {
          d.box(rec, { c: d.C.bad, w: 1.5, rx: 8 });
          d.text(rec.x + rec.width / 2, rec.y - 16, 'Rec floats mid-mixer', { anchor: 'middle', tone: 'bad' });
        }
      } else {
        d.text(mixer.x + 12, y + 16, 'pitch ‹ ›, headphones and Rec all end on this line', { tone: 'ok' });
      }
    }
    // The library: each track name's middle, carried across the sidebar.
    const main = app.$('section.library .main')?.getBoundingClientRect();
    const nav = app.$('section.library nav')?.getBoundingClientRect();
    const names = app.rows().slice(0, 6).map((r) => r.querySelector('.t') ?? r).map((e) => app.textRect(e) ?? e.getBoundingClientRect());
    const items = app.$$("[data-region='sidebar'] .item").slice(1, 6);
    if (main && nav && names.length > 3 && items.length) {
      const words = items.map((e) => app.textRect(e.querySelector('span') ?? e)).filter(Boolean);
      // How far the sidebar's words sit from the track name beside them.
      let worst = 0;
      for (const w of words) {
        const c = w.top + w.height / 2;
        const near = names.map((n) => n.top + n.height / 2).reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a), Infinity);
        const inView = c > names[0].top - 4 && c < names[3].bottom + 4;
        if (inView && Math.abs(c - near) < 10 && Math.abs(c - near) > Math.abs(worst)) worst = c - near;
      }
      const ok = Math.abs(worst) < 0.75;
      const zoom = 2.5;
      const src = { x: nav.x + 8, y: names[0].top - 8 };
      const size = { w: Math.round((main.x + 120 - src.x) * zoom), h: Math.round((names[3].bottom + 6 - src.y) * zoom) };
      const l = d.loupe('lib', src, { zoom, size, at: { x: d.vw - size.w - 24, y: main.y + 72 }, caption: '' });
      for (const n of names) {
        const a = l.map(src.x, n.top + n.height / 2);
        if (a.y < l.rect.y + 4 || a.y > l.rect.bottom - 4) continue;
        d.line(l.rect.x, a.y, l.rect.right, a.y, { c: ok ? d.C.ok : d.C.ghost, dash: '5 4', opacity: 0.9 });
      }
      d.text(l.rect.x, l.rect.bottom + 16, ok ? 'sidebar words sit level with the track names' : `sidebar words sit ${Math.round(Math.abs(worst) * 10) / 10}px ${worst > 0 ? 'below' : 'above'} the track names`, { tone: ok ? 'ok' : 'bad', fixed: true });
      d.text(l.rect.x, l.rect.y - 14, 'sidebar and track names, 2.5× bigger. Dashed: the middle of each track name', { fixed: true });
    }
  },
};
