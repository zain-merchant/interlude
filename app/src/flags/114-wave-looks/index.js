// #114 (UI audit flag): wave-looks.
//
// Looks for the waveform, to flip between live: Today, Today exact, Attack,
// Pills, Narrower pills and Tapered ticks. Opt-in. With this off, Direction
// 110 draws Today exact and everything else is the app's own drawing,
// untouched (as Today is). looks.js lists the looks and their values, wave.js
// draws them, and panel.svelte.js is the switcher (dev builds only: main.js
// loads it beside the flags panel).
import { settings } from './looks.js';

export default {
  id: 'wave-looks',
  n: 114,
  title: 'Waveform looks',
  group: 'Waveform',
  byDefault: false,
  settings: settings(),
  notes:
    'Opt-in. ⌥W (or turning this on) opens its own panel with the look and its sliders, and its × closes it and keeps the look; ⌥W again steps to the next look, ⌥⇧W back, ⌥1 to ⌥6 pick one. Hooks, gated on this flag or Direction 110: Waveform.svelte (the look and its values as one string in the view), waveform-2d.js (ribbonShape, ribbon, overview and beats hand over to wave.js).',
};
