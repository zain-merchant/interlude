// #114 (UI audit flag): wave-looks.
//
// Other looks for the waveform, to flip between live: Today exact, Attack,
// Nested, Pills, Narrower pills and Tapered ticks. Opt-in, and Today (the
// default look) is the app's own drawing, untouched. looks.js lists the
// looks and their values, wave.js draws them, and panel.svelte.js is the switcher
// (dev builds only: main.js loads it beside the flags panel).
import { settings } from './looks.js';

export default {
  id: 'wave-looks',
  n: 114,
  title: 'Waveform looks',
  group: 'Waveform',
  byDefault: false,
  settings: settings(),
  notes:
    'Opt-in. Opens its own panel (DialKit) with the look and its sliders; ⌥W steps to the next look, ⌥⇧W back, ⌥1 to ⌥7 pick one. Hooks, gated on this flag: Waveform.svelte (the look and its values as one string in the view), waveform-2d.js (ribbonShape, ribbon, overview and beats hand over to wave.js).',
};
