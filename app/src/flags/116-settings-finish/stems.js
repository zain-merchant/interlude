// How stems work, in words.

/** @typedef {'fast' | 'efficient' | 'off'} StemsMode */

export const INTRO = 'Stems let you mute the vocals, melody, bass or drums of a track, or play one of them alone.';

/** @type {{ mode: StemsMode, name: string, line: string }[]} */
export const MODES = [
  { mode: 'fast', name: 'Fast', line: 'Ready instantly, but uses more memory. Interlude separates each track when you load it.' },
  { mode: 'efficient', name: 'Efficient', line: 'Takes a few seconds, but uses less memory. Interlude separates a track only when you use its stems.' },
  { mode: 'off', name: 'Off', line: 'Stems are turned off and use no memory.' },
];

/**
 * What a way of working takes on this computer, as [figure, what it's for].
 * @param {StemsMode} mode
 * @param {{ perTrackMb: number, makingGb: number, waitSeconds: number } | undefined} m
 */
export function takes(mode, m) {
  if (!m || mode === 'off') return [];
  const fast = mode === 'fast';
  return [
    [`${m.perTrackMb} MB of memory`, fast ? 'for each 5-minute track you load' : 'for each 5-minute track separated'],
    [`${m.makingGb} GB of memory`, 'while separating a track'],
    fast ? ['No wait', 'once a track is separated'] : [`${m.waitSeconds} second wait`, 'the first time, for each track'],
  ];
}
