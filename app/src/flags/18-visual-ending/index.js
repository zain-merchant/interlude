// #18 (visual): the track is running out.
//
// The remaining time ("−0:24.3") looked the same at five minutes and at
// five seconds, so a track could end on you mid-mix. With the flag on,
// while a deck plays its last seconds the remaining time turns the warning
// colour, and in the last ten seconds it pulses slowly (not under reduced
// motion). Hook: Deck.svelte (class:ending on the remaining time).
export default {
  id: 'visual-ending',
  n: 18,
  title: 'Warn when a track is ending',
  group: 'Polish',
  notes: 'While playing, the remaining time turns the warning colour in the last seconds, and pulses in the last ten.',
  settings: {
    secs: { type: 'range', min: 10, max: 60, step: 5, default: 30, label: 'Warn from (s)' },
    pulse: { type: 'choice', options: [['on', 'Pulse'], ['off', 'Steady']], default: 'on', label: 'Last ten seconds' },
  },
};

/** Show me: plays deck A's last ~25 seconds, so its remaining time warns. */
export const show = {
  note: "Deck A is playing its last ~25s: the remaining time turns the warning colour, and pulses in the last ten.",
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    const ov = app.$("[data-region='deck0'] .overview");
    const r = ov.getBoundingClientRect();
    // The mock's tracks run 5 to 8 minutes; 93% in is about 25 seconds from the end.
    await app.click(ov, { clientX: r.x + r.width * 0.93, clientY: r.y + r.height / 2 });
    await app.play(0);
  },
  target: "[data-region='deck0'] .times .rm",
  aid(d, app) {
    const rm = app.$("[data-region='deck0'] .times .rm");
    if (!rm) return;
    const r = rm.getBoundingClientRect();
    const state = rm.classList.contains('last') ? 'last ten seconds' : rm.classList.contains('ending') ? 'ending' : null;
    if (state) d.text(r.right, r.bottom + 14, state, { anchor: 'end', fixed: true });
  },
};
