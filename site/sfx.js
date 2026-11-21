// Interface sounds: short, soft drum-machine voices and tuned plucks and
// stabs, all in one minor key (A unless SOUNDS says otherwise), so every cue
// on the page sounds related. Modelled
// on the softness of Raphael Salaja's Pond UI sounds (github.com/
// raphaelsalaja/pond, packages/ui/src/sounds, MIT, Copyright (c) 2026
// Raphael Salaja): very short envelopes, a gentle filtered contact on the
// attack and a trace of a small damped room. Synthesized live (Web Audio, no
// files) by his @web-kits/audio, vendored and tree-shaken in sfx/audio.js.
// What plays is one data object, SOUNDS, below; lab/sounds.html is the form
// that edits it.
//
// Loaded by the boot script in index.html on the first tap or key, never
// before, and never while sound is off. The rules:
// - Nothing plays before a gesture, while the tab is hidden, on hover or on
//   scroll. Only the visitor's own hand makes a sound: a script switching
//   something by itself stays silent.
// - Cues are dropped, never queued: one that can't start within 200ms of
//   being asked for (the context still waking) is skipped, so nothing piles
//   up and sounds at once later (the Kenneth approvals page's lesson).
// - Pond's pacing: one of each cue per 40ms, a repeat within 110ms at 0.7, a
//   few cents of random detune (±14 on drums, ±3 on tuned notes, so the key
//   holds); and at most 3 sounding at once.
// - Positive moves (download, opening, to Controller, sound on) rise; the
//   way back is the same sound, single and softer, never a falling
//   interval or a low thud (those read as an error).
// - A mouse sounds on press, the way a real button does. Touch sounds on
//   lift and only for a tap, so a scroll that starts on a button or the
//   record stays silent.
// - On iOS the audio session is "ambient": the silent switch mutes it and
//   it never stops the visitor's own music. The context sleeps when the tab
//   hides and 20s after the last gesture or cue (a running one keeps phones
//   awake); the next gesture wakes it.

import { defineSound, getMasterBus } from './sfx/audio.js?v=1';

// ---- what plays ------------------------------------------------------
// The one thing to edit: which cue each slot plays, and any edits to it.
// lab/sounds.html is a form for it (hear each slot on a copy of its real
// element, pick, tweak) and writes this block back out, between the two
// marker lines, as a new sfx.js. Per slot: cue (a key of that slot in
// SLOTS below, or 'none'), and optionally pitch (moves every note by that
// many notes of the chord, so it stays in key: 4 is an octave), length (×
// the decays), bright (× the filters) and level (dB).
// SOUNDS:begin
export const SOUNDS = {
  key: 'A',   // the key: every tuned cue is in this minor key
  master: 1,   // the overall level
  slots: {
    download: { cue: 'stabRise' },
    tap: { cue: 'rim' },
    nav: { cue: 'shaker' },
    hand: { cue: 'pluckPair' },
    faq: { cue: 'pluck' },
    needle: { cue: 'hat909' },
    knock: { cue: 'tom' },
    copy: { cue: 'pluckPair' },
    power: { cue: 'arp' },
  },
};
// SOUNDS:end

// ---- the key ----------------------------------------------------------
// Every pitched cue plays notes of the key's minor 7th chord (in A: A, C, E,
// G), so any two cues heard together are consonant. The keys run from E
// up to E flat around A, so nothing lands low.
export const KEYS = ['E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭'];
const NAMES = ['A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭'];
const CHORD = [0, 3, 7, 10];   // root, minor third, fifth, minor seventh
// The edit being built: key offset from A (semitones), pitch (chord
// steps), length and brightness. Set by build() before each sound.
let X = { k: 0, step: 0, len: 1, bright: 1 };
const semis = (i) => { const j = i + X.step, o = Math.floor(j / 4); return X.k + o * 12 + CHORD[j - o * 4]; };
// chord tone i: 0 the root (A4 in A), 1 the third, 2 the fifth, 3 the
// seventh, 4 the root an octave up, and on
const deg = (i) => 440 * 2 ** (semis(i) / 12);
/** The name of chord tone i under an edit (for the lab), e.g. 'E5'. */
export function noteName(i, key = SOUNDS.key, pitch = 0) {
  const keep = X; X = { ...X, k: KEYS.indexOf(key) - 5, step: pitch };
  const s = semis(i); X = keep;
  return NAMES[((s % 12) + 12) % 12] + (4 + Math.floor((s + 9) / 12));
}
const L = (d) => d * X.len;                          // a decay, under the length edit
const B = (f) => Math.min(16000, f * X.bright);      // a filter, under the brightness edit

// ---- Pond's touch (from its patch, verbatim but for the edits) --------
const env = (decay, release = 0.01, attack = 0) => ({ attack, decay: L(decay), sustain: 0, release });
// a wide band of white noise: a physical contact without a pitch that tires
const snap = (frequency, decay, gain, delay) => ({ source: { type: 'noise', color: 'white' }, filter: [{ type: 'bandpass', frequency: B(frequency), resonance: 0.9 }, { type: 'lowpass', frequency: B(7500) }], envelope: { attack: 0, decay, sustain: 0, release: 0.002 }, gain, delay });
const booth = (mix = 0.06) => ({ type: 'reverb', decay: 0.15, damping: 0.75, preDelay: 0.002, mix });

// ---- the voices -------------------------------------------------------
// Each returns layers; at is a delay (s), g a gain. Levels are set by
// TRIMS, so a voice's own gains only balance its parts. Notes are chord
// tones (deg), so the key and pitch edits move them together.
// A pluck: a triangle through a lowpass that opens on the attack and closes
// fast, an octave sine on the very start, and Pond's contact.
const pluck = (i, at = 0, g = 1, d = 0.07) => { const f = deg(i); return [
  { source: { type: 'triangle', frequency: f }, filter: { type: 'lowpass', frequency: B(f * 1.5), resonance: 0.7, envelope: { peak: B(Math.min(12000, f * 6)), decay: L(d * 0.5) } }, envelope: env(d, 0.02, 0.002), gain: 0.3 * g, delay: at },
  { source: { type: 'sine', frequency: f * 2 }, envelope: env(d * 0.35, 0.01, 0.001), gain: 0.06 * g, delay: at },
  snap(3000, 0.0014, 0.12 * g, at),
]; };
// A house stab: the chord (from tone i up), each note two triangles a few
// cents apart, through one lowpass sweep (dark, bright, dark again).
const stab = (i, at = 0, g = 1, d = 0.09) => [i, i + 1, i + 2, i + 3].flatMap((t) => [-7, 7].map((detune) => (
  { source: { type: 'triangle', frequency: deg(t), detune }, filter: { type: 'lowpass', frequency: B(700), resonance: 1.2, envelope: { attack: 0.004, peak: B(3600), decay: L(d * 0.7) } }, envelope: env(d, 0.03, 0.003), gain: 0.055 * g, delay: at }
))).concat([snap(2600, 0.0014, 0.1 * g, at)]);
// 909 closed (or open) hat: white noise, high-passed, kept off the very top.
const hat909 = (open = false, at = 0, g = 1) => [{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: B(7000), resonance: 0.7 }, { type: 'lowpass', frequency: B(13000) }], envelope: env(open ? 0.09 : 0.025, open ? 0.03 : 0.01, 0.0005), gain: 0.4 * g, delay: at }];
// 808 closed hat: six square oscillators at the 808's metal frequencies,
// band-passed high, which gives it its ring.
const hat808 = (at = 0, g = 1) => [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => (
  { source: { type: 'square', frequency: f }, filter: [{ type: 'bandpass', frequency: B(10000), resonance: 1 }, { type: 'highpass', frequency: B(7000) }], envelope: env(0.03, 0.01, 0.0005), gain: 0.25 * g, delay: at }
));
// A rim: a short tuned knock (two triangles a fifth apart) and a bright snap.
const rim = (i, at = 0, g = 1) => { const f = deg(i); return [
  { source: { type: 'triangle', frequency: f }, envelope: env(0.014, 0.006, 0.0005), gain: 0.3 * g, delay: at },
  { source: { type: 'triangle', frequency: f * 1.5 }, envelope: env(0.008, 0.004, 0.0005), gain: 0.12 * g, delay: at },
  snap(f * 3, 0.002, 0.35 * g, at),
]; };
// A tight clap: three quick bursts of band-passed noise, then a short tail.
const clap = (at = 0, g = 1) => [0, 0.008, 0.016].map((t) => snap(1500, 0.004, 0.5 * g, at + t))
  .concat([{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'bandpass', frequency: B(1500), resonance: 1 }, { type: 'lowpass', frequency: B(6000) }], envelope: env(0.04, 0.01), gain: 0.35 * g, delay: at + 0.024 }]);
// A shaker: soft-edged high noise.
const shaker = (at = 0, g = 1) => [{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: B(5500) }, { type: 'lowpass', frequency: B(11000) }], envelope: env(0.03, 0.01, 0.006), gain: 0.4 * g, delay: at }];
// A tight snare tick: a tuned triangle body (the fifth) and a short rattle.
const snare = (at = 0, g = 1) => [
  { source: { type: 'triangle', frequency: deg(2) }, envelope: env(0.025, 0.008, 0.001), gain: 0.25 * g, delay: at },
  { source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: B(2500) }, { type: 'lowpass', frequency: B(9000) }], envelope: env(0.035, 0.01, 0.0005), gain: 0.3 * g, delay: at },
];
// A high tom, tuned: a sine settling onto its note from a hair above.
const tom = (i, at = 0, g = 1) => { const f = deg(i); return [
  { source: { type: 'sine', frequency: { start: f * 1.06, end: f } }, envelope: env(0.06, 0.02, 0.001), gain: 0.4 * g, delay: at },
  snap(2200, 0.0016, 0.2 * g, at),
]; };
// one sound: some layers in Pond's small room
const S = (...layers) => ({ layers: layers.flat(), effects: [booth()] });
const up = (o) => o.d > 0;

// ---- the slots --------------------------------------------------------
// Each slot: its name and where it plays (for the lab), its loudness
// against Pond's tap (dB), dir (the two directions it plays, if it has
// them: the first rises) and its cues. A cue: name, what it is, def(o) (o.d
// 1 the first direction, -1 the second), tuned (keeps the detune small and
// takes the pitch edit; 'from' is the chord tone it starts on).
export const SLOTS = {
  download: { name: 'Download', where: 'Every Download link: the hero’s button, the nav’s, the install step’s, the footer’s. The one moment worth marking.', db: 0, v: {
    stabRise: { name: 'House stab, rising', what: 'A minor 7th stab on the root, then a pluck an octave up', tuned: 1, from: 0, def: () => S(stab(0), pluck(4, 0.06, 0.8, 0.09)) },
    arp: { name: 'Pluck arpeggio', what: 'Root, fifth, octave, quickly upward', tuned: 1, from: 4, def: () => S(pluck(4), pluck(6, 0.035, 0.8), pluck(8, 0.07, 0.6)) },
    rimPluck: { name: 'Rim and pluck', what: 'A rim on the root, then a pluck on the fifth above', tuned: 1, from: 4, def: () => S(rim(4), pluck(6, 0.03, 0.8)) },
    hat: { name: '909 closed hat', what: 'Short bright noise, unpitched', def: () => S(hat909()) },
  } },
  tap: { name: 'Buttons', where: 'Other buttons: View on GitHub, Suggest an idea', db: -1, v: {
    rim: { name: 'Rim', what: 'A short tuned knock on the root', tuned: 1, from: 4, def: () => S(rim(4)) },
    pluck: { name: 'Pluck', what: 'One short pluck on the root', tuned: 1, from: 4, def: () => S(pluck(4, 0, 1, 0.05)) },
    hat: { name: '909 closed hat', what: 'Short bright noise, unpitched', def: () => S(hat909()) },
    shaker: { name: 'Shaker', what: 'Soft high noise, unpitched', def: () => S(shaker()) },
  } },
  nav: { name: 'Links', where: 'Nav and footer links and the logo; quieter, as Pond’s links are', db: -6, v: {
    shaker: { name: 'Shaker', what: 'Soft high noise, unpitched', def: () => S(shaker()) },
    hat808: { name: '808 closed hat', what: 'Metallic, from six square waves, unpitched', def: () => S(hat808()) },
    pluck: { name: 'Pluck, short', what: 'A very short pluck on the fifth', tuned: 1, from: 2, def: () => S(pluck(2, 0, 1, 0.04)) },
  } },
  hand: { name: 'Mouse / Controller', where: 'The switch under the hero: going to Controller rises; going back plays the first note alone, softer', db: -1, dir: ['To Controller', 'To Mouse'], v: {
    pluckPair: { name: 'Pluck pair', what: 'Fifth, then the octave above the root', tuned: 1, from: 2, def: (o) => (up(o) ? S(pluck(2), pluck(4, 0.045)) : S(pluck(2, 0, 0.7))) },
    stab: { name: 'House stab, rising', what: 'The minor 7th chord, then the same chord voiced higher', tuned: 1, from: 0, def: (o) => (up(o) ? S(stab(0, 0, 0.8), stab(1, 0.055)) : S(stab(0, 0, 0.7))) },
    rimPair: { name: 'Rim pair', what: 'Rims on the fifth, then the octave', tuned: 1, from: 2, def: (o) => (up(o) ? S(rim(2), rim(4, 0.045)) : S(rim(2, 0, 0.7))) },
    hats: { name: '909 hats', what: 'Open hat to Controller, closed to Mouse', def: (o) => S(hat909(up(o))) },
  } },
  faq: { name: 'FAQ', where: 'A question opening (rises) or closing (the first note alone, softer)', db: -3, dir: ['Open', 'Close'], v: {
    pluck: { name: 'Pluck, third to fifth', what: 'Two quick plucks upward; closing, the first alone', tuned: 1, from: 1, def: (o) => (up(o) ? S(pluck(1, 0, 0.8, 0.05), pluck(2, 0.035, 1, 0.06)) : S(pluck(1, 0, 0.6, 0.05))) },
    rim: { name: 'Rim', what: 'High on the fifth opening, the root closing', tuned: 1, from: 6, def: (o) => S(rim(up(o) ? 6 : 4, 0, up(o) ? 1 : 0.7)) },
    hats: { name: '909 hats', what: 'Open hat opening, closed closing', def: (o) => S(hat909(up(o), 0, up(o) ? 1 : 0.8)) },
    tom: { name: 'Tom, high', what: 'On the fifth opening, the third closing', tuned: 1, from: 2, def: (o) => S(tom(up(o) ? 2 : 1, 0, up(o) ? 1 : 0.7)) },
  } },
  needle: { name: 'Record', where: 'A click or tap on the hero record’s grooves, where the needle drops', db: -2, v: {
    hat909: { name: '909 closed hat', what: 'Short bright noise, unpitched', def: () => S(hat909()) },
    hat808: { name: '808 closed hat', what: 'Metallic, from six square waves, unpitched', def: () => S(hat808()) },
    rim: { name: 'Rim', what: 'A short tuned knock on the root', tuned: 1, from: 4, def: () => S(rim(4)) },
    clap: { name: 'Clap, tight', what: 'Three quick bursts and a short tail, unpitched', def: () => S(clap()) },
  } },
  knock: { name: 'Footer word', where: 'Pressing on the big word at the foot of the page (the lens)', db: -2, v: {
    tom: { name: 'Tom, high', what: 'A tom on the root, settling onto it', tuned: 1, from: 0, def: () => S(tom(0)) },
    snare: { name: 'Snare tick', what: 'A tuned body on the fifth and a short rattle', tuned: 1, from: 2, def: () => S(snare()) },
    clap: { name: 'Clap, tight', what: 'Three quick bursts and a short tail, unpitched', def: () => S(clap()) },
    stab: { name: 'House stab', what: 'The minor 7th chord, once', tuned: 1, from: 0, def: () => S(stab(0)) },
  } },
  copy: { name: 'Copy', where: 'Anything that copies (data-sfx="copy"); the site has none yet', db: -2, v: {
    pluckPair: { name: 'Pluck pair', what: 'The octave, then the fifth above it', tuned: 1, from: 4, def: () => S(pluck(4, 0, 0.8, 0.05), pluck(6, 0.04, 1, 0.06)) },
    rimPair: { name: 'Rim pair', what: 'Rims on the octave, then the fifth above', tuned: 1, from: 4, def: () => S(rim(4), rim(6, 0.04)) },
    stabHat: { name: 'Stab and hat', what: 'The minor 7th chord, then a soft closed hat', tuned: 1, from: 0, def: () => S(stab(0), hat909(false, 0.05, 0.6)) },
  } },
  power: { name: 'Sound on / off', where: 'The speaker in the nav and footer: on rises; off is one soft note', db: -2, dir: ['On', 'Off'], v: {
    arp: { name: 'Pluck arpeggio', what: 'Root, fifth, octave upward; off, the root alone', tuned: 1, from: 0, def: (o) => (up(o) ? S(pluck(0), pluck(2, 0.04), pluck(4, 0.08, 0.8)) : S(pluck(0, 0, 0.6))) },
    stab: { name: 'House stab, rising', what: 'The chord, then voiced higher; off, one soft stab', tuned: 1, from: 0, def: (o) => (up(o) ? S(stab(0, 0, 0.8), stab(1, 0.055)) : S(stab(0, 0, 0.6))) },
    hats: { name: '909 hats', what: 'Open hat on, closed off', def: (o) => S(hat909(up(o))) },
  } },
};
// Each cue's level to its slot's (dB), measured in A with no edits:
// K-weighted with a 150Hz high-pass, loudest 100ms, against Pond's tap.
export const TRIMS = {
  'download.stabRise': -17.3, 'download.arp': -20, 'download.rimPluck': -16.3, 'download.hat': -15.4,
  'tap.rim': -10.3, 'tap.pluck': -16.1, 'tap.hat': -16.3, 'tap.shaker': -18.6,
  'nav.shaker': -23.5, 'nav.hat808': -13.6, 'nav.pluck': -19.9,
  'hand.pluckPair': -20.3, 'hand.stab': -16.6, 'hand.rimPair': -13.4, 'hand.hats': -22,
  'faq.pluck': -20.5, 'faq.rim': -13.2, 'faq.hats': -24, 'faq.tom': -22,
  'needle.hat909': -17.6, 'needle.hat808': -9.6, 'needle.rim': -11.2, 'needle.clap': -10.8,
  'knock.tom': -21.2, 'knock.snare': -17.3, 'knock.clap': -10.8, 'knock.stab': -15.5,
  'copy.pluckPair': -20.3, 'copy.rimPair': -14.8, 'copy.stabHat': -17.5,
  'power.arp': -22.3, 'power.stab': -17.6, 'power.hats': -23.2,
};

/** A cue's sound definition under the key and an edit ({ pitch, length,
 *  bright }); the lab renders these too. */
export function build(slot, cue, o = {}, edit = {}) {
  X = { k: KEYS.indexOf(SOUNDS.key) - 5, step: edit.pitch || 0, len: edit.length || 1, bright: edit.bright || 1 };
  if (X.k < -5) X.k = 0;
  return SLOTS[slot].v[cue].def({ d: 1, ...o });
}
export function setMaster(v) { SOUNDS.master = v; if (bus) bus.gain.value = v; }

// ---- the context ------------------------------------------------------
let ctx = null, bus = null, on = true, sleep = 0;
export const context = () => ctx;
// Wakes (or makes) the context. Called synchronously in every gesture, as
// iOS only lets audio start inside one.
function wake() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* fine */ }
    try { bus = getMasterBus(); ctx = bus.context; bus.gain.value = SOUNDS.master; } catch { return; }
  }
  if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});   // suspended, or iOS's interrupted
  doze();
}
const doze = () => { clearTimeout(sleep); sleep = setTimeout(() => ctx?.state === 'running' && ctx.suspend(), 20000); };

// ---- the gate ---------------------------------------------------------
const recent = new Map(), voices = [];
function gate(key) {
  if (document.hidden) return 0;
  const now = performance.now(), prev = recent.get(key) ?? -1e9;
  if (now - prev < 40) return 0;
  while (voices.length && now - voices[0] > 150) voices.shift();
  if (voices.length >= 3) return 0;
  voices.push(now); recent.set(key, now);
  return now - prev < 110 ? 0.7 : 1;
}

/** Plays a slot's cue as SOUNDS has it, if sound is on and the gate lets
 *  it. o: { d, pan }. The lab passes cue and edit to audition another, and
 *  force to play while sound is off. */
export function play(slot, o = {}, cue, force, edit) {
  const s = SLOTS[slot], set = SOUNDS.slots[slot] || {}, key = cue || set.cue, v = s?.v[key];
  if (!v || !ctx || (!on && !force)) return false;
  const g = gate(slot);
  if (!g) return false;
  const e = edit || (key === set.cue ? set : {});
  const vol = g * 10 ** (((TRIMS[slot + '.' + key] ?? 0) + (e.level || 0)) / 20), t0 = performance.now();
  const go = () => { defineSound(build(slot, key, o, e))({ volume: vol, pan: o.pan, detune: (Math.random() - 0.5) * (v.tuned ? 6 : 28) }); doze(); window.__sfxLog?.push(slot); };
  if (ctx.state === 'running') go();
  else ctx.resume().then(() => ctx.state === 'running' && performance.now() - t0 < 200 && go(), () => {});
  return true;
}

// ---- on the page ------------------------------------------------------
let lastInput = 0, press = null, started = false;
const now = () => performance.now();
const fresh = () => now() - lastInput < 1000;   // a real input just now

// The control under a press or click, and its cue (null: silent).
function cueFor(t) {
  const el = t?.closest?.('[data-sfx], a[href], button, summary');
  if (!el || el.closest('.dialkit-root, .switch, .sfx-btn') || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  const named = el.dataset.sfx;
  if (named) return named === 'none' ? null : { el, slot: named };
  if (el.localName === 'summary') return { el, slot: 'faq', o: { d: el.parentElement?.open ? -1 : 1 } };
  if (/\.dmg(\?|$)/.test(el.getAttribute('href') || '')) return { el, slot: 'download' };
  if (el.closest('.nav, .foot, .brand')) return { el, slot: 'nav' };
  if (el.matches('.btn, button')) return { el, slot: 'tap' };
  return null;   // links in the text stay quiet
}
const panAt = (x) => Math.max(-0.4, Math.min(0.4, (x / innerWidth * 2 - 1) * 0.4));
// Over the footer's big word (not a link on it): where index.html sends the lens.
function onWord(e) {
  const w = document.querySelector('.foot-word');
  if (!w || e.target.closest?.('a, button, .dialkit-root')) return false;
  const r = w.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

/** Sound on or off (the speaker button): a toggle's on or off, then sleep. */
export function setOn(v) {
  if (v) { on = true; wake(); play('power', { d: 1 }); }
  else { play('power', { d: -1 }); on = false; clearTimeout(sleep); sleep = setTimeout(() => ctx?.state === 'running' && ctx.suspend(), 600); }
}

/** Listens to the page. opts.on: whether sound starts on. opts.listen:
 *  false only wakes the audio on gestures (the lab plays cues itself). */
export function start(opts = {}) {
  on = opts.on !== false;
  if (started) return;
  started = true;
  const cap = { capture: true, passive: true };
  // Every gesture wakes the context (Safari suspends it again after a while).
  for (const t of ['pointerup', 'touchend', 'click']) addEventListener(t, (e) => { if (e.isTrusted && on) wake(); }, cap);
  addEventListener('keydown', (e) => { if (!e.isTrusted || e.repeat) return; lastInput = now(); if (on) wake(); }, cap);
  if (opts.listen === false) { addEventListener('pointerdown', (e) => { if (e.isTrusted && on) wake(); }, cap); return; }
  addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || !e.isPrimary) return;
    lastInput = now();
    if (on) wake();
    if (e.button) { press = null; return; }
    const c = cueFor(e.target), mouse = e.pointerType === 'mouse';
    press = { c, mouse, x: e.clientX, y: e.clientY, at: now(), word: onWord(e), played: false };
    if (mouse && c) press.played = play(c.slot, c.o) || true;
    if (mouse && press.word) play('knock', { pan: panAt(e.clientX) });
  }, cap);
  // Touch: a tap is a lift close to where it went down (a scroll cancels).
  addEventListener('pointercancel', () => { press = null; }, cap);
  addEventListener('pointerup', (e) => {
    const p = press;
    if (!p || p.mouse || !e.isTrusted) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10 || now() - p.at > 600) return;
    if (p.needle) play('needle');
    if (p.word) play('knock', { pan: panAt(e.clientX) });
  }, cap);
  // Clicks: keyboard (Enter, Space) and touch taps; a mouse already
  // sounded on press.
  addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const c = cueFor(e.target);
    if (!c) return;
    if (press?.mouse && press.played && press.c?.el === c.el && now() - press.at < 1500) return;
    play(c.slot, c.o);
  }, cap);
  // From the page's scripts, answering the visitor's own hand only.
  // hero-fx.js: a needle dropped on the record (on pointerdown).
  addEventListener('record:needle', () => {
    const p = press;
    if (!p || now() - p.at > 300) return;
    p.needle = true;
    if (p.mouse) play('needle');
  });
  // The Mouse / Controller switch (index.html).
  document.addEventListener('hero:hand', (e) => { if (fresh()) play('hand', { d: e.detail?.hand === 'controller' ? 1 : -1 }); });
  // Anything else: document.dispatchEvent(new CustomEvent('sfx:play', { detail: { cue: 'copy' } }))
  document.addEventListener('sfx:play', (e) => { if (fresh() && e.detail?.cue) play(e.detail.cue, e.detail); });
  // Hidden: sleep once the last cue's tail is out (a suspended context keeps
  // what it was playing and would finish it on the way back).
  document.addEventListener('visibilitychange', () => { if (document.hidden) setTimeout(() => document.hidden && ctx?.state === 'running' && ctx.suspend(), 700); });
}
