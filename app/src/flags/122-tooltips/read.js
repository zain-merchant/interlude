// @ts-nocheck
// A tooltip's sentence, as its parts:
//   n  what it is, or what a click does     v  its value, or its state
//   k  its key                              x  a sentence about it
//   a  what else you can do: [what, how], how being keys, a gesture or both
//   late  more of the same, for when the pointer has rested a while
// null: no tooltip (it would only repeat the words on the control).
//
// What's said at once is what the control doesn't say itself: its name where
// nothing beside it has it, its key, a state or a fact you can't see. Something
// else to do is said at once only if nothing else offers it (a button, its
// right-click menu), it isn't what anyone would try (double-click for a
// reset), and it's used while playing. How it works, and the rest, are late.
export const KEY = '⁣';
const RESET = ['Reset', 'double-click'];
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stop = (s) => (/[.!?…]$/.test(s) ? s : s + '.');

/** [the sentence without its key, its parts]. The first that matches is used. */
const RULES = [
  // Only a word that's on the control.
  [/^(Cues|Loop|FX|Stems)( \(active\))?$|^Choose effect$|^[A-Z][a-z]+ (on|off)$|^Master level$/, () => null],
  [/^[A-G][♭♯b#]? (major|minor) \(\d+[AB]\)$/, () => null],

  // Window
  [/^Drag to resize the (library|waveforms|sidebar|mixer)(, (⌥|Alt\+)-?drag for the decks)?, double-click to reset$/, (m) => ({ late: { n: { library: 'Library height', waveforms: 'Waveform height', sidebar: 'Sidebar width', mixer: 'Mixer width' }[m[1]], a: [m[2] && ['Resize the decks', '⌥ + drag'], RESET].filter(Boolean) } })],
  [/^(.+) · (controller|output)$/, (m) => ({ n: up(m[2]) })],
  [/^The stems model, a one-time download$/, () => ({ late: { x: 'A one-time download.' } })],

  // Deck
  [/^Track tempo ([\d.]+ BPM)(, beatgrid fixed by hand)?\. Right-click here or on the waveform to fix the beatgrid$/, (m) => ({ n: 'Track tempo', v: m[2] && 'fixed by hand', late: { a: [['Fix the beatgrid', 'right-click']] } })],
  [/^No clear beat found\. Double-click to set the BPM$/, () => ({ v: 'No clear beat found', a: [['Set the BPM', 'double-click']] })],
  [/^Key (.+? \(\d+[AB]\)): the track is in (.+? \(\d+[AB]\)), moved by (.+)\. Click to shift the key$/, (m) => ({ n: 'Shift key', x: /^key shift (up|down) [^ ]+ semitones?$/.test(m[3]) ? stop(up(m[3].slice(10)) + ' from ' + m[2]) : stop(`${m[2]}, moved by ${m[3]}`) })],
  [/^Key (.+? \(\d+[AB]\))(?:, after (.+))?\. Click to shift the key$/, (m) => ({ n: 'Shift key', x: m[2] && stop(up(m[2])) })],
  [/^Grid: fix the beatgrid\. While open, drag the waveform to slide it$/, () => ({ late: { x: 'While open, drag the waveform to slide the beatgrid.' } })],
  [/^Cue · hold to preview$/, () => ({ n: 'Cue', late: { a: [['Preview', 'hold']] } })],
  [/^Load a track (onto .+ )?first$/, () => ({ v: 'Load a track first' })],
  [/^Sync: match tempo and beats to (.+) and stay locked to it$/, (m) => ({ n: 'Sync', late: { x: `Matches ${the(m[1])}’s tempo and beats, and stays locked to it.` } })],
  [/^Sync on: keeps (.+)'s tempo when either pitch fader moves\. Click to turn off$/, (m) => ({ n: 'Sync off', late: { x: `Now following ${the(m[1])}’s tempo.` } })],
  [/^Sync needs a beat on both decks$/, () => ({ v: 'Both decks need a beat' })],
  [/^(Jump (?:back|forward)) (.+) · ⇧ for 4 bars \((.+)\)$/, (m) => ({ n: `${m[1]} ${m[2]}`, a: [['4 bars', m[3]]] })],
  [/^(Jump (?:back|forward)) (.+) · ⇧ for 4 bars \(\)$/, (m) => ({ n: `${m[1]} ${m[2]}`, a: [['4 bars', '⇧ + click']] })],
  [/^Fader range (.+)\. Click to change the range$/, (m) => ({ n: 'Fader range', v: m[1] })],
  [/^Tempo (.+), fader range (.+)\. Click to change the range$/, (m) => ({ n: 'Fader range', v: m[2] })],
  [/^Slip on: .+\. Click to turn off$/, () => ({ n: 'Slip off', late: { x: 'Now a scratch, loop, held cue or pause picks up where the track would have been.' } })],
  [/^(.+) · hold$/, (m) => ({ n: 'Hold to ' + m[1].charAt(0).toLowerCase() + m[1].slice(1) })],
  [/^Key lock on: /, () => ({ late: { x: 'Tempo changes keep the pitch.' } })],
  [/^Key lock off: /, () => ({ late: { x: 'Tempo changes move the pitch.' } })],
  [/^Click to (show time (?:played|left))$/, (m) => ({ n: up(m[1]) })],
  [/^The controller's tempo fader is at (.+)\. Move it to the marker and it takes over$/, (m) => ({ n: 'Controller fader', v: m[1], x: 'Move it to the marker and it takes over.' })],
  [/^(.+?)(?: · ([^·]+))? · double-click to reset · the mark is where it matches the other deck \((.+)\)$/, (m) => ({ n: level(m[1]).n, late: { x: `The mark matches the ${/^left/i.test(m[1]) ? 'right' : /^right/i.test(m[1]) ? 'left' : 'other'} deck, ${m[3]} BPM.`, a: [RESET] } })],

  // Mixer
  [/^(.+?)(?: · ([^·]+))? · double-click to reset$/, (m) => ({ n: CAPTIONED.test(m[1]) ? undefined : level(m[1]).n, late: { a: [RESET] } })],
  [/^(Kill|Bring back) (?:(?:left|right) deck |deck [AB] )?(.+?)(?: EQ)?$/i, (m) => ({ n: `${m[1]} ${m[2].toLowerCase()}` })],
  [/^Headphone cue (on|off)$/, (m) => ({ n: m[1] === 'on' ? 'Headphone cue off' : 'Headphone cue' })],
  [/^Master level\. The limiter is turning the mix down (.+) to stop it distorting; .+$/, (m) => ({ n: 'Limiter', v: '−' + m[1], x: 'Lower the master or channel levels.' })],
  [/^This level went over 0 dB · click to clear$/, () => ({ n: 'Clear clip light' })],
  [/^Record the master output · saved to (.+)$/, (m) => ({ n: 'Record', late: { x: `Saves to ${m[1]}.` } })],
  [/^Recording to (.+?)(?:, ([\d.]+ s) lost to a slow disk)? · click to stop$/, (m) => ({ n: 'Stop recording', v: m[2] && `${m[2]} lost, slow disk`, late: { x: m[1] } })],

  // Panels
  [/^Hot cue (\d+) at (.+?)(?: · (hold to preview, )?⇧-click to clear)?$/, (m) => ({ n: 'Hot cue ' + m[1], a: m[3] && [['Preview', 'hold']], late: { v: m[2], a: [m[3] && ['Preview', 'hold'], ['Clear', '⇧ + click']].filter(Boolean) } })],
  [/^Needs a beatgrid, and none was found for this track$/, () => ({ v: 'Needs a beatgrid', x: 'Set the BPM in Grid.' })],
  [/^.+: (.+ beats?)$/, (m, s) => ({ n: s.slice(0, s.indexOf(':')), v: m[1] })],
  [/^((?:Un)?[Mm]ute .+) · ⇧-click to play it alone$/, (m) => ({ n: m[1], a: [['Play alone', '⇧ + click']] })],
  [/^(.+) alone, ⇧-click for all · .+$/, (m) => ({ n: 'Mute ' + m[1].toLowerCase(), a: [['Play all', '⇧ + click']] })],
  [/^((?:Un)?[Mm]ute .+) · splitting, (.+)$/, (m) => ({ n: m[1], v: m[2] })],
  [/^Stems need a one-time download/, () => ({ n: 'Get stems in Settings', v: 'one download' })],
  [/^Stems couldn't be made: (.+)\. Click for Settings$/, () => ({ n: 'Open Settings', v: 'Couldn’t make stems' })],
  [/^Stems are off\. Click to turn them on in Settings$/, () => ({ n: 'Turn on in Settings', v: 'Stems are off' })],
  [/^(Move grid (?:earlier|later)) · or drag the waveform$/, (m) => ({ n: m[1], late: { x: 'Dragging the waveform moves it too.' } })],
  [/^Make the play head the first beat of a bar$/, (m, s, k) => ({ n: k && 'Downbeat', late: { x: 'Makes the play head beat 1.' } })],
  [/^Go back to the detected grid$/, () => ({ n: 'Back to the detected grid' })],
  [/^No beatgrid yet\. Set the BPM first$/, () => ({ v: 'Set the BPM first' })],
  [/^Needs a beatgrid$/, () => ({ v: 'Needs a beatgrid' })],

  // Library
  [/^(\/|[A-Z]:\\)/, (m, s) => ({ late: { x: s } })],
  [/^Fits: load a track to see what mixes with it$/, () => ({ v: 'Load a track first' })],
  [/^Show tracks that mix with deck [AB]: within (.+?)(?:, in (.+) or a key next to it on the Camelot wheel)?$/, (m) => ({ n: 'Show what mixes', late: { x: `Within ${m[1]}${m[2] ? `, in ${m[2]} or a key next to it` : ''}.` } })],
  [/^Showing tracks that mix with deck [AB]: within (.+?)(?:, in (.+) or a key next to it on the Camelot wheel)?\. Click to show everything$/, (m) => ({ n: 'Show everything', late: { x: `Now within ${m[1]}${m[2] ? `, in ${m[2]} or a key next to it` : ''}.` } })],
  [/^Clear the filter$/, () => ({ n: 'Clear filter' })],
  [/^Finding each track’s length, BPM and key in the background$/, () => ({ late: { x: 'Finding each track’s length, BPM and key.' } })],
  [/^(Show|Hide) sampler · .+$/, (m) => ({ n: m[0].slice(0, 12), late: m[1] === 'Show' ? { x: 'Eight sounds to fire over the mix.' } : undefined })],
  [/^A line under a key: it mixes with what’s loaded$/, () => ({ late: { x: 'A line under a key means it mixes with what’s loaded.' } })],
  // Its right-click menu has these, with their keys.
  [/^Double-click to load, or /, () => null],
  [/^Filter by BPM and key$/, () => null],
  [/^File not found: (.+)$/, (m) => ({ v: 'File not found', x: m[1] })],
  [/^.+? \(\d+[AB]\) · Mixes with (the (?:left|right) deck) \(.*?(\d+[AB])\)$/, (m) => ({ v: `Mixes with ${m[1]}, ${m[2]}` })],
  [/^.+? \(\d+[AB]\) · (Mixes with both decks)$/, (m) => ({ v: m[1] })],

  // Sampler
  [/^Slot \d+ is empty · click to choose a sound, or drag a track here$/, () => ({ n: 'Choose a sound', late: { x: 'Or drag a track here.' } })],
  [/^(.+?)(?:, ([\d.:]+ ?s?))? · click to play, ⇧-click to stop$/, (m) => ({ late: { n: 'Play ' + m[1], v: m[2], a: [['Stop', '⇧ + click']] } })],
  [/^Loading…$/, () => ({ v: 'Loading…' })],
];

const the = (d) => (/^(left|right) deck$/i.test(d) ? 'the ' + d.toLowerCase() : d);
/** The dials with their names beside them. */
const CAPTIONED = / (trim|high EQ|mid EQ|low EQ|filter)$|^Master volume$|^Headphone cue mix$|^Sampler level$/;
/** A dial's or fader's name and value, in fewer words. Whose deck it is, is where it is. */
const level = (n, v) => ({
  n: n === 'Headphone cue mix' ? 'Cue mix' : up(n.replace(/^(?:(?:Left|Right) deck|Deck [AB]) /i, '').replace(/ EQ$/, '')),
  v: v?.replace(/ cue, \d+% master$/, ' cue').replace(/^(\d+%) to (?:the )?(left|right)(?: deck)?$/, '$1 $2'),
});

/**
 * @param {string} text
 * @param {{ live?: boolean, rested?: boolean }} [when] a value while it's changed; the pointer has rested
 */
export function read(text, { live = false, rested = false } = {}) {
  const t = parse(text, live);
  if (!t) return null;
  const { late, ...now } = t;
  const all = rested && late ? { ...now, ...Object.fromEntries(Object.entries(late).filter(([, v]) => v !== undefined)) } : now;
  if (!all.k) delete all.k;
  return all.n || all.v || all.x || all.a?.length || all.k ? all : null;
}
/** Whether a longer rest says more. @param {string} text */
export const hasMore = (text) => !!parse(text, false)?.late;

function parse(text, live) {
  // A key is marked (tipText), or is plainly a shortcut.
  const isKey = (p) => p.startsWith(KEY) || /^[⌃⌥⇧⌘]+[^ ]{1,3}$/.test(p) || /^(Ctrl|Alt|Shift)\+\S+$/.test(p);
  const parts = text.split(' · ');
  const k = parts.find((p) => isKey(p))?.replace(KEY, '');
  const said = parts.filter((p) => !isKey(p));
  // While it's dragged, only what it's at: the name is under the hand.
  if (live) return said.length > 1 ? { v: level('', said[1]).v, live: true, known: true } : null;
  const s = said.join(' · ');
  for (const [re, as] of RULES) {
    const m = s.match(re);
    if (!m) continue;
    const t = as(m, s, k);
    return t && { ...t, k, known: true };
  }
  // A name and its value; a name alone; or a name and whatever's said about it.
  const l = said.length === 2 && level(said[0], said[1]);
  if (l && l.v.length <= 24 && !/ (to|for) /.test(l.v)) return { ...l, k };
  if (said.length === 1 && k) return { n: s, k, known: true };
  if (said.length === 1 && s.length <= 32) return { n: s };
  return said.length === 1 ? { x: stop(s) } : { n: said[0], x: stop(up(said.slice(1).join(', '))), k };
}
