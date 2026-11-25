// #118 (UI audit flag): knob-feel.
//
// Drag. A knob turns with a drag left and right as well as up and down (right
// and up raise it), following the way the drag is going and changing axis when
// it turns (feel.js says what else was measured).
// Nothing jumps. ⇧ for fine, the detent, double-click, the keys and focus are
// as they were. Faders keep their own axis.
//
// Scroll. A knob or a fader moves as far as the scroll does (400px for the
// whole travel) instead of 2% for every event however small. ⇧ for fine. The
// detent holds it, and coasting stops there. A scroll belongs to the control
// it started on until it pauses, so it never carries on to the next one, nor
// after the pointer leaves.
//
// Hooks: Knob.svelte and Fader.svelte (feel.js).
export default {
  id: 'knob-feel',
  n: 118,
  title: 'Knobs turn sideways, and follow the scroll',
  group: 'Controls',
  settings: {
    drag: {
      type: 'choice',
      label: 'Dragging a knob',
      default: 'turn',
      options: [
        ['turn', 'Follows the way you drag', 'Left and right or up and down: the way the drag is going, changing when it turns.'],
        ['across', 'Left and right', 'Only sideways.'],
        ['updown', 'Up and down', 'As it was.'],
      ],
    },
    scroll: {
      type: 'choice',
      label: 'Scrolling on a knob or fader',
      default: 'far',
      options: [
        ['far', 'As far as you scroll', 'It moves with the scroll and stops at the detent.'],
        ['step', '2% an event', 'As it was: every event moves it the same, however small.'],
      ],
    },
  },
  notes: 'Hooks: Knob.svelte (drag and wheel), Fader.svelte (wheel). Off, both are as they were. Waveform.svelte’s scroll is another thing (it moves the track) and isn’t touched.',
};
