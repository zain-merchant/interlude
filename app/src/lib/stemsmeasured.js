// What each way of making stems takes, for Settings › Stems. The app notes it
// as it makes stems; nothing is run to find out. Plain functions, so they can
// be tested without the app.

/**
 * @typedef {{ heard: number | null, memory: number | null }} Measured
 * Seconds from a press to the sound, and GB at the most while stems are
 * made. Null until known.
 * @typedef {{ perTrackMb: number, makingGb: number | string, waitSeconds: number | string }} Takes
 */

/** Length of track that's talked about, in minutes. */
const TRACK = 5;

/** A wait in whole seconds, never none. */
export const wait = (secs) => Math.max(1, Math.round(secs));

/** Memory in GB, rounded up to the next half. */
export const memory = (gb) => Math.max(0.5, Math.ceil(gb * 2) / 2);

/** What a track's stems take while it's loaded, in MB: three stereo stems, 16 bits each, at 44.1 kHz. Rounded to tens. */
export const kept = (minutes) => Math.round((minutes * 60 * 44_100 * 12) / 1e7) * 10;

/**
 * The figures to show. What isn't known yet on this computer is what it
 * usually is, as a range, and `note` says so.
 * @param {Measured | null | undefined} m
 * @returns {{ takes: Takes, note: string }}
 */
export function figures(m) {
  const { heard, memory: gb } = m ?? { heard: null, memory: null };
  const some = heard != null || gb != null;
  return {
    takes: { perTrackMb: kept(TRACK), makingGb: gb != null ? memory(gb) : '2 to 3', waitSeconds: heard != null ? wait(heard) : '1 to 6' },
    note: heard != null && gb != null ? '' : `${some ? 'Ranges' : 'These'} are the usual figures. Interlude notes this computer's own as it separates tracks.`,
  };
}

/**
 * What a way of working takes, as [figure, what it's for].
 * @param {import('./stemsmodel.js').StemsMode} mode
 * @param {Takes} m
 */
export function takes(mode, m) {
  const fast = mode === 'fast';
  return [
    [`${m.perTrackMb} MB of memory`, fast ? `for each ${TRACK}-minute track you load` : `for each ${TRACK}-minute track separated`],
    [`${m.makingGb} GB of memory`, 'while separating a track'],
    fast ? ['No wait', 'once a track is separated'] : [`${m.waitSeconds} second wait`, 'the first time, for each track'],
  ];
}
