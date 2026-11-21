// Prototype only: record platter styles for the decks. Delete with src/proto
// once a style is picked.

/** The styles being compared. `finish` is the record, `ring` where the
 *  waveform goes, `extra` what the centre shows under BPM and key. */
export const STYLES = {
  'record-strip': { label: 'Record + Strip', finish: 'smoke', ring: 'none', strip: true, extra: 'pitch', strobe: false },
  'cue-ring-strip': { label: 'Cue Ring + Strip', finish: 'smoke', ring: 'cues', strip: true, extra: 'pitch', strobe: false },
  'record-sleeve': { label: 'Record + Sleeve', finish: 'smoke', ring: 'cues', strip: true, extra: 'pitch', strobe: false, sleeve: true },
  'smoked-arm': { label: 'Smoked Record', finish: 'smoke', ring: 'outer', extra: 'pitch', strobe: false },
  'clear-arm': { label: 'Clear Record', finish: 'clear', ring: 'outer', extra: 'pitch', strobe: false },
  'waveform-grooves': { label: 'Waveform Grooves', finish: 'clear', ring: 'grooves', extra: 'pitch', strobe: false },
  'strobe-rim': { label: 'Strobe Rim', finish: 'smoke', ring: 'grooves', extra: 'pitch', strobe: true },
  'beat-centre': { label: 'Beat Centre', finish: 'clear', ring: 'outer', extra: 'beats', strobe: false },
};

const DEFAULTS = { style: 'record-strip', rpm: 33.333, grooves: 60, sheen: 50, hub: 62, ringWidth: 12, arm: true };
export const platter = $state({ ...DEFAULTS });
try {
  const saved = JSON.parse(localStorage.getItem('oss-dj.proto.platter') || 'null');
  if (saved) Object.assign(platter, saved, { style: platter.style });
} catch {}
export function savePlatter() {
  try {
    const { style, ...rest } = platter;
    localStorage.setItem('oss-dj.proto.platter', JSON.stringify(rest));
  } catch {}
}
export function resetPlatter() {
  Object.assign(platter, { ...DEFAULTS, style: platter.style });
  savePlatter();
}
