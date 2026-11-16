// #7: on a tall screen the decks stretched into empty slabs.
//
// The waveforms are a fixed 136px and the library tops out at 560px, so
// every extra pixel of a tall window went to the decks. At 2560×1440 each
// deck was over 1,000px tall: the hot cues floated in the middle of a
// blank panel, the five channel dials spread 230px apart, and the pitch
// fader was a metre of travel. The decks now stop growing at a set height
// and the waveforms take the rest, which is where a DJ wants the room.
export default {
  id: 'edge-tall',
  n: 7,
  title: 'Tall windows grow the waveforms, not the decks',
  group: 'Stability',
  notes: 'The deck row stops at a maximum height; extra height goes to the waveform lanes. No change below about 1,000px of window height.',
  settings: {
    decks: { type: 'range', min: 360, max: 720, step: 20, default: 460, unit: 'px', label: 'Deck max height' },
  },
};
