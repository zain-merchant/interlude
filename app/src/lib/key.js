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

/** Semitones the tempo moves the key by, with keylock off. */
export const tempoShift = (speed, keylock) => (keylock || speed <= 0 ? 0 : Math.round(12 * Math.log2(speed)));

/**
 * The key a deck is sounding in: the track's key, moved by key shift and,
 * unless keylock holds the pitch, by the tempo change. `shift` is the total;
 * `keyShift` the part key shift adds.
 */
export function playingKey(k, speed, keylock, keyShift = 0) {
  if (!k) return null;
  const shift = tempoShift(speed, keylock) + keyShift;
  return { tonic: (((k.tonic + shift) % 12) + 12) % 12, minor: k.minor, shift, keyShift };
}

/**
 * The smallest shift (-5..6) that puts key `a` on the same Camelot code as
 * key `b`, as the engine's key sync does.
 */
export function shiftTo(a, b) {
  const target = a.minor === b.minor ? b.tonic : a.minor ? b.tonic - 3 : b.tonic + 3;
  const d = (((target - a.tonic) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}
