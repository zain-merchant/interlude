// Musical keys as the engine reports them: { tonic: 0..11 (0 = C), minor }.

const MAJOR = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

/** Short name, e.g. "A♭" or "F♯m". */
export const keyName = (k) => (k.minor ? `${MINOR[k.tonic]}m` : MAJOR[k.tonic]);

/** Long name, e.g. "F♯ minor". */
export const keyLongName = (k) => `${(k.minor ? MINOR : MAJOR)[k.tonic]} ${k.minor ? 'minor' : 'major'}`;

/** Camelot wheel code, e.g. "8A" for A minor. */
export function camelot(k) {
  const major = k.minor ? (k.tonic + 3) % 12 : k.tonic;
  return `${((major * 7 + 7) % 12) + 1}${k.minor ? 'A' : 'B'}`;
}

/**
 * The key a deck is sounding in: the track's key, shifted by the tempo
 * change unless keylock holds the pitch.
 */
export function playingKey(k, speed, keylock) {
  if (!k) return null;
  const shift = keylock || speed <= 0 ? 0 : Math.round(12 * Math.log2(speed));
  return { tonic: (((k.tonic + shift) % 12) + 12) % 12, minor: k.minor, shift };
}
