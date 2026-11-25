// How stems work, in words.

export const INTRO = 'Stems let you mute the vocals, melody, bass or drums of a track, or play one of them alone.';

/** @type {{ on: boolean, name: string, line: string[] }[]} */
export const WAYS = [
  { on: true, name: 'On', line: ['Interlude separates each track when you load it.'] },
  { on: false, name: 'Off', line: ['Stems are turned off and use no memory.'] },
];
