// #91 (against the doc; dropped clusters c-K92 and c-K91): a roomier library.
//
// The design keeps library rows at the body size, 13px on a 28px pitch, and
// #3 puts every sidebar label on that same pitch so the sidebar meets the
// track rows. Judges asked for 14-15px rows on a 32px pitch (easier to read
// from a step back in a dark booth), and for a clearer break above the
// sidebar's Playlists and History headings (the Library heading sat further
// from its first item than Playlists did). Both were dropped as design
// conflicts; this lets the owner try them. The row pitch is read by the
// virtual list (Library.svelte, ROW), so scrolling and keyboard paging stay
// exact; sidebar items take the same pitch.
export default {
  id: 'library-roomy',
  n: 91,
  title: 'Roomier library rows and sidebar sections',
  group: 'Type and colour',
  against: 'Type: "five sizes, 11, 13, 16, 24 and 32px" (library rows are the 13px body on a 28px row), and #3\'s rule that sidebar labels sit on the track rows\' pitch.',
  notes: 'Row pitch 32 (14px text) or 36 (16px); sidebar items match. Sections: 24px above Playlists/History and the Library heading close to its first item, off #3\'s grid.',
  settings: {
    rows: {
      type: 'choice',
      label: 'Rows',
      default: '32',
      options: [
        ['32', '14px on 32px', 'What the judges asked for: a size off the type scale, a little larger and with more air between rows; three fewer rows fit.'],
        ['36', '16px on 36px', 'The scale\'s next size up: much easier to read from a distance, but about a quarter fewer rows fit.'],
        ['28', '13px on 28px', 'As the design has it, so you can try the sidebar sections on their own.'],
      ],
    },
    sections: {
      type: 'choice',
      label: 'Sidebar sections',
      default: 'airy',
      options: [
        ['airy', 'Space above', 'A 24px break above Playlists and History, and every heading the same distance from its first item.'],
        ['grid', 'On the row grid', 'As the design has it: every sidebar label and item lines up with a track row.'],
      ],
    },
  },
};

/** Show me: the library flipping between today's rows and the roomier ones. */
export const show = {
  about: 'The design keeps library rows at the app\'s 13px body size on a 28px pitch, and lines every sidebar label up with a track row. Judges wanted bigger rows with more air, readable from a step back, and a clearer break between the sidebar\'s sections. This goes against the design\'s type scale and grid; try it and decide.',
  before: 'Rows are 13px text on a 28px pitch, and the sidebar headings sit on the track rows\' grid, close to the list above them.',
  after: 'Rows are larger with more space between them, and Playlists and History have a clear break above them. Fewer tracks fit on screen.',
  async setup(app) {
    await app.clearSearch();
    app.$("[data-region='tracks']").scrollTop = 0;
  },
  target: 'section.library',
  badge: (app) => app.$('section.library .bar')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const rows = app.rows().slice(0, 2).map((r) => r.getBoundingClientRect());
    if (rows.length === 2) d.measure(rows[1].left + 200, rows[0].top, rows[1].left + 200, rows[1].top, { label: `${Math.round(rows[1].top - rows[0].top)}px rows`, side: 'right', tone: before ? undefined : 'ok' });
  },
};
