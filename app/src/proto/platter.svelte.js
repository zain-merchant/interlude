// Prototype only: record platter styles for the decks. Delete with src/proto
// once a style is picked.

/** The layouts being compared: a clear record with the tonearm as its
 *  playhead, and the overview waveform kept flat. `layout` is the grid map
 *  in Deck.svelte; `finish`, `ring` and `extra` are the record itself. */
const REC = { finish: 'clear', ring: 'none', extra: 'pitch', arm: 'classic' };
export const STYLES = {
  wide: { label: 'Big Waveform', layout: 'wide', times: 'stack', ...REC },
  over: { label: 'Title Over Both', layout: 'over', times: 'line', ...REC },
  across: { label: 'Strip Across', layout: 'across', times: 'stack', ...REC },
};

const DEFAULTS = { style: 'wide', rec: 100, rpm: 33.333, grooves: 60, sheen: 55, hub: 68, ringWidth: 18, arm: true };
export const platter = $state({ ...DEFAULTS });
try {
  const saved = JSON.parse(localStorage.getItem('oss-dj.proto.platter.v4') || 'null');
  if (saved) Object.assign(platter, saved, { style: platter.style });
} catch {}
export function savePlatter() {
  try {
    const { style, ...rest } = platter;
    localStorage.setItem('oss-dj.proto.platter.v4', JSON.stringify(rest));
  } catch {}
}
export function resetPlatter() {
  Object.assign(platter, { ...DEFAULTS, style: platter.style });
  savePlatter();
}
