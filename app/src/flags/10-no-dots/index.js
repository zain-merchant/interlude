// #10: middle dots as separators.
//
// The UI joined related bits with " · ": the deck's "Bm · 10A · BPM" line,
// every tooltip ("Crossfader · 50% · double-click to reset"), the library's
// "48 tracks · analyzing, 12 to go" and the import dialog's "where · when".
// The dots add noise without adding meaning. This sets the parts apart with
// space and a step in tone instead: the first, most important part stays
// bright and the rest step down a level. Hooks: Tooltip.svelte, Deck.svelte,
// Library.svelte, Import.svelte. The EQ knob's "Low · kill" label is left
// alone (another flag owns it).
export default {
  id: 'no-dots',
  n: 10,
  title: 'Space instead of middle dots',
  group: 'Type and colour',
  notes: 'Tooltips, the deck key/BPM line, the library count and import sources: parts are spaced and stepped in tone instead of joined with " · ".',
  settings: {
    gap: { type: 'range', min: 4, max: 16, step: 1, default: 8, unit: 'px', label: 'Gap between parts' },
    tone: { type: 'choice', options: [['step', 'Step down'], ['same', 'Same tone']], default: 'step', label: 'Later parts' },
  },
};
