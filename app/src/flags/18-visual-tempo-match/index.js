// #18 (visual): where the tempos match.
//
// To match tempos by hand you read both BPMs ("129.00", "118.00"), work out
// the difference and move the pitch fader until the numbers agree. With the
// flag on, each deck's pitch fader carries a small mark, in the other
// deck's colour, beside the slot at the position where this deck would play
// at the other deck's tempo. Move the cap onto the mark and the tempos
// match; the gap between cap and mark is the tempo difference. When the
// other tempo is beyond the fader's range, the mark sits hollow at the end.
// Hooks: Fader.svelte (match prop), Deck.svelte.
export default {
  id: 'visual-tempo-match',
  n: 18,
  title: 'Tempo match mark on the pitch fader',
  group: 'Polish',
  notes: 'A mark beside each pitch fader, in the other deck\'s colour, where this deck would match the other\'s tempo. Hollow at the end when out of range.',
};

/** Show me: two decks at different tempos; the gap from each fader cap to its match mark is measured. */
export const show = {
  note: "The decks are at different tempos: the mark by each pitch fader is where it would match the other deck.",
  async setup(app) {
    await app.loadTrack(0, 1);
    await app.loadTrack(1, 0);
  },
  target: "[data-region^='deck'] .pitch-fader .match",
  aid(d, app) {
    for (const n of [0, 1]) {
      const m = app.$(`[data-region='deck${n}'] .pitch-fader .match`)?.getBoundingClientRect();
      const cap = app.$(`[data-region='deck${n}'] .pitch-fader .cap`)?.getBoundingClientRect();
      if (!m || !cap) continue;
      const my = m.top + m.height / 2;
      const cy = cap.top + cap.height / 2;
      d.measure(m.left - 8, cy, m.left - 8, my, { label: `${'BA'[n]}'s tempo`, side: 'left' });
    }
  },
};
