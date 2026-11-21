// #96 (UI audit flag; a visual direction): Instrument.
//
// Round 2's bigger swing. Interlude as one made object instead of glass
// cards floating on a backdrop: a single titanium face edge to edge (no
// panels, no blur, no pools), with screens of black glass set into it for
// everything you read (the lanes, each deck's readout of title, tempo,
// overview and times, the meters, the track list, the toast and the
// lost-device message), and keys standing on it for everything you touch
// (the same latch grammar as 95: raised, sinks when pressed, stays down and
// takes its colour when on). Machined seams split the face into the
// waveform, deck and library rows. On black glass the waveforms and the
// numerals are the brightest things there are, so brightness lands on the
// information without adding any light. Only one direction is on at a time
// (only-one.svelte.js, the same module as 95's, so either can ship alone).
if (typeof window !== 'undefined') setTimeout(() => import('./only-one.svelte.js'), 0);

export default {
  id: 'dir-instrument',
  n: 96,
  title: 'Direction E: Instrument',
  group: 'Direction',
  against: 'The Liquid Glass material ("Panels are frosted") and the background ("a faint gradient … the pools drift slowly"): the app becomes one solid face with screens set into it. The doc\'s glass makes every region a card of the same weight; a face with screens tells you at a glance which parts you read (the screens) and which you touch (the keys), and puts the brightest pixels on the time, the tempo and the waveforms instead of on surfaces.',
  notes: 'Whole-app look in style.css (tokens --in-*). Each deck\'s readout screen is header, overview and times drawn flush in three parts that bleed 16px into the deck padding (outer edges on the lane screen\'s edges); the deck\'s column gap goes to 28px so the inner bleed keeps 12px of face before the pitch column, and the body\'s row gap moves into the screen\'s padding. The lost-device banner is placed over the library toolbar (left: gap + sidebar + 16px, bottom: gap + lib - 48px); those offsets assume the baseline\'s concentric library padding (16px) and edge-banner\'s absolute positioning. Dial faces are drawn on .dial::after turned back by -var(--rot), so the light stays on top. Seams are ::before/::after on the mixer and ::after on the library split.',
};

/** Show me: both decks playing, flipping between today and the Instrument look. */
export const show = {
  about: 'A bigger change: the app as one instrument instead of floating glass panels. Everything you read (the waveforms, each deck\'s title, tempo and times, the meters, the track list, messages) sits on black screens set into a single titanium face, and everything you touch stands on the face as a key. Turn on one direction at a time.',
  before: 'Today: every region is the same frosted panel, so the parts you read and the parts you press look alike, and the brightest things are the Play slabs.',
  after: 'Instrument: screens for reading, keys for pressing. On black glass the time, the tempo and the waveforms are the brightest things on screen, with no glow added.',
  period: 2400,
  async setup(app) {
    if (!app.loaded(0)) await app.loadTrack(0);
    if (!app.loaded(1)) await app.loadTrack(1);
    await app.play(0);
    await app.play(1);
  },
  target: '.app',
};
