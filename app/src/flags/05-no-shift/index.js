// #5: the Rec button changed width as it started counting.
//
// The record button grew as "Rec" became a running clock, which nudged
// the mixer's centre column. It now keeps the room of "0:00:00" from the
// start. (This flag also used to keep the EQ kill label from growing into
// "Low · kill"; upstream dropped that suffix in the merge of main, so that
// part is gone.)
export default {
  id: 'no-shift',
  n: 5,
  title: 'Recording no longer nudges the mixer',
  group: 'Stability',
  notes: 'Rec keeps a clock\'s width ("0:00:00", tabular) from the start. (The kill label part went with upstream dropping " · kill".)',
};

/** Show me: kills deck A's Low; flipping shows the mixer jumping sideways (before) and holding still (after). */
export const show = {
  about: 'Starting a recording turned the "Rec" button into a running clock, which is wider, so the mixer\'s centre shifted. Now the button has the clock\'s room from the start.',
  before: 'The Rec button is just wide enough for "Rec": press it and the clock that replaces it pushes its neighbours aside.',
  after: 'The Rec button already holds the room of the clock, so starting a recording moves nothing.',
  target: '.mixer button.rec',
  badge: (app) => app.$('.mixer button.rec')?.getBoundingClientRect(),
};
