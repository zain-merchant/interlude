// Prototype only: record platter styles for the decks. Delete with src/proto
// once a style is picked.

/** The styles being compared. `finish` is the record, `ring` where the
 *  waveform goes, `extra` what the centre shows under BPM and key. */
export const STYLES = {
  'clear-classic': { label: 'Classic Arm', finish: 'clear', ring: 'outer', extra: 'pitch', arm: 'classic' },
  'clear-s-arm': { label: 'S-Arm', finish: 'clear', ring: 'outer', extra: 'pitch', arm: 's-arm' },
  'clear-needle': { label: 'Light Needle', finish: 'clear', ring: 'outer', extra: 'pitch', arm: 'needle' },
  'clear-no-arm': { label: 'No Arm', finish: 'clear', ring: 'outer', extra: 'pitch', arm: 'none' },
};

const DEFAULTS = { style: 'clear-classic', rpm: 33.333, grooves: 60, sheen: 55, hub: 68, ringWidth: 18, arm: true };
export const platter = $state({ ...DEFAULTS });
try {
  const saved = JSON.parse(localStorage.getItem('oss-dj.proto.platter.v2') || 'null');
  if (saved) Object.assign(platter, saved, { style: platter.style });
} catch {}
export function savePlatter() {
  try {
    const { style, ...rest } = platter;
    localStorage.setItem('oss-dj.proto.platter.v2', JSON.stringify(rest));
  } catch {}
}
export function resetPlatter() {
  Object.assign(platter, { ...DEFAULTS, style: platter.style });
  savePlatter();
}
