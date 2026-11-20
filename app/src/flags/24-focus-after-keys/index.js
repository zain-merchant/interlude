// #24 (C15, critique F1 / S2): focus rings only after keyboard navigation.
// Placeholder written by the layout builder so the App.svelte hook has a
// flag to read; the states builder fills in the style, show and notes.
export default {
  id: 'focus-after-keys',
  n: 24,
  title: 'Focus rings only after you use the keys',
  group: 'Controls',
  notes: 'App.svelte sets html[data-input="keys"] on Tab, arrows, Home/End, Page keys and F6, and clears it on any pointer press; rings show only under it.',
};
