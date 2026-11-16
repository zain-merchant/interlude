// #5: a deck's mode tab moved its label when its dot came on.
//
// When a loop, an effect or a muted stem is on, its tab (Loop, FX, Stems)
// shows a small dot after the label. The dot added 10px to the centred
// label, so the word slid 5px left as the loop started and back when it
// ended. The dot now hangs after the word without taking any room.
export default {
  id: 'no-shift-tabs',
  n: 5,
  title: 'Mode tabs keep still when their dot lights',
  group: 'Stability',
  notes: 'Loop / FX / Stems labels no longer slide 5px when a loop, effect or muted stem turns their dot on.',
};
