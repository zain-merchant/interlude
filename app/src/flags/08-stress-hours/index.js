// #8: times past an hour read as minutes.
//
// Times were always minutes and seconds, so a two-hour recorded mix showed
// "134:33" in the library's Time column, "107:38.4" and "−26:54.6" on the
// deck, and a hot cue set an hour in read "64:10". Past an hour they now
// read as hours, minutes and seconds (2:14:33, 1:47:38.4, 1:04:10), like
// the recording clock already does. Shorter tracks read as before. The
// format is in time.js; Library.svelte, Deck.svelte and Performance.svelte
// use it while the flag is on.
export default {
  id: 'stress-hours',
  n: 8,
  title: 'Times past an hour show hours',
  group: 'Stability',
  notes: 'Library Time, deck elapsed/remaining and hot cue times read h:mm:ss past an hour (a recorded mix, a long live set) instead of 134:33.',
};
