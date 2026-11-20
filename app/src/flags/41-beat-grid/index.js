// #41: the beat grid on the scrolling waveforms (batch D3, audit C4).
//
// Beat lines were 3% white and bar lines 7%, drawn under the ribbon
// (waveform-2d.js beats()), so you couldn't line up the two lanes' beats by
// eye or find a phrase. With the flag the grid is drawn over the ribbon,
// before the veil and the markers (grid()): bars are 1px lines at 20%
// white, every 16th bar (a phrase) at 35%, and beats are 6px ticks at the
// lane's top and bottom edges at 15%, so the waveform between stays clear.
// When beats are closer than 6px only bars are drawn, as before.
//
// Edge setting (backlog b-K37): the 1px edge along the ribbon's outer
// band was 55% of the high band's colour and traced every transient's
// fin. 'soft' (default) draws it at 25%; 'crisp' keeps it as it was.
// Hooks: waveform-2d.js (draw, grid, ribbonShape), Waveform.svelte.
export default {
  id: 'beat-grid',
  n: 41,
  title: 'A beat grid you can see on the waveforms',
  group: 'Type and colour',
  notes: 'Bars as 1px lines over the ribbon (phrases every 16 bars brighter), beats as short ticks at the lane edges. The ribbon\'s fin-tracing edge softens to 25%.',
  settings: {
    edge: {
      type: 'choice',
      label: 'Ribbon edge',
      default: 'soft',
      options: [
        ['soft', 'Soft', 'The thin bright line along the waveform\'s edge is toned down, so the shape reads calm and the grid lines stand out.'],
        ['crisp', 'Crisp', 'The edge line stays as bright as today, tracing every spike.'],
      ],
    },
  },
};

/** Show me: both decks playing; flipping shows the faint grid under the ribbon (before) and the grid over it (after), magnified. */
export const show = {
  about: "The beat and bar lines on the scrolling waveforms were so faint, and drawn under the waveform, that you couldn't line the two decks' beats up by eye. Now bars are clear lines and beats are ticks along the edges.",
  before: 'Look for the bars on the waveforms: the lines are almost invisible and the waveform covers them, so matching the two decks\' beats is guesswork.',
  after: 'Every bar is a clear line across the lane, every 16th bar (a phrase) a brighter one, and each beat a short tick at the top and bottom. You can see whether the two decks\' bars line up.',
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.seek(0, 0.3);
    await app.seek(1, 0.3);
  },
  target: (app) => [app.$("[data-region='waves']")],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const w = app.$("[data-region='waves']")?.getBoundingClientRect();
    if (!w) return;
    const z = 2;
    const src = { x: w.left + w.width / 2 + 8, y: w.top };
    const l = d.loupe('grid', src, { zoom: z, size: { w: Math.min(720, (w.width / 2 - 40) * z), h: w.height * z }, near: w, caption: '' });
    ctx.at = l.rect;
    const before = ctx.phase === 'before';
    d.text(l.at.x + 10, l.at.y + l.rect.height + 16, before ? 'bars and beats: barely there, under the waveform' : 'bars: clear lines; beats: ticks at the edges', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
