// Interface sounds: short, soft drum-machine voices and tuned plucks and
// stabs, all in A minor, so every cue on the page sounds related. Modelled
// on the softness of Raphael Salaja's Pond UI sounds (github.com/
// raphaelsalaja/pond, packages/ui/src/sounds, MIT, Copyright (c) 2026
// Raphael Salaja): very short envelopes, a gentle filtered contact on the
// attack and a trace of a small damped room. Synthesized live (Web Audio, no
// files) by his @web-kits/audio, vendored and tree-shaken in sfx/audio.js.
// lab/sounds.html plays every variant and picks; Pond's own sounds are there
// too, for reference.
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

// ---- the key ----------------------------------------------------------
// A minor, A4 = 440. Every pitched cue uses A, C, E or G (Am7), so any two
// cues heard together are consonant.
const n = (semi) => 440 * 2 ** (semi / 12);   // semitones from A4
const A4 = 440, C5 = n(3), E5 = n(7), G5 = n(10), A5 = n(12), C6 = n(15), E6 = n(19), A6 = n(24);

// ---- Pond's touch (verbatim from its patch) ---------------------------
const env = (decay, release = 0.01, attack = 0) => ({ attack, decay, sustain: 0, release });
// a wide band of white noise: a physical contact without a pitch that tires
const snap = (frequency, decay, gain, delay) => ({ source: { type: 'noise', color: 'white' }, filter: [{ type: 'bandpass', frequency, resonance: 0.9 }, { type: 'lowpass', frequency: 7500 }], envelope: env(decay, 0.002), gain, delay });
const booth = (mix = 0.06) => ({ type: 'reverb', decay: 0.15, damping: 0.75, preDelay: 0.002, mix });
const room = (mix, decay = 0.4) => ({ type: 'reverb', decay, damping: 0.5, preDelay: 0.01, mix });
const sine = (o) => ({ source: { type: 'sine', frequency: o.frequency }, envelope: { attack: o.attack ?? 0.003, decay: o.decay, sustain: 0, release: o.release ?? 0.015 }, delay: o.delay, gain: o.gain });
const tick = (frequency, gain, delay) => sine({ frequency, attack: 0.0003, decay: 0.0025, release: 0.003, delay, gain });
const contact = (pitch, level, delay) => [snap(pitch, 0.0016, 0.5 * level, delay), tick(pitch * 1.62, 0.03 * level, delay)];
const BODY = tick({ start: 900, end: 700 }, 0.03);
export const POND = {
  'Pond: tap': { layers: [...contact(4200, 1), BODY, snap(4950, 0.0012, 0.175, 0.009)], effects: [booth(0.06)] },
  'Pond: soft': { layers: [snap(2400, 0.0014, 0.3), BODY], effects: [booth(0.04)] },
  'Pond: toggleOn': { layers: [...contact(3200, 1), BODY, ...contact(3900, 0.5, 0.04)], effects: [booth(0.08)] },
  'Pond: toggleOff': { layers: [...contact(3600, 1), BODY, ...contact(2800, 0.5, 0.04)], effects: [booth(0.08)] },
  'Pond: success': { layers: [sine({ frequency: 523.3, decay: 0.12, release: 0.04, gain: 0.07 }), sine({ frequency: 784, decay: 0.3, release: 0.1, delay: 0.07, gain: 0.08 }), sine({ frequency: 2352, decay: 0.1, release: 0.04, delay: 0.07, gain: 0.02 })], effects: [room(0.12, 0.7)] },
};

// ---- the voices -------------------------------------------------------
// Each returns layers; at is a delay (s), g a gain. Levels are set by the
// trims below, so a voice's own gains only balance its parts.
// A pluck: a triangle through a lowpass that opens on the attack and closes
// fast (the "pluck"), an octave sine on the very start, and Pond's contact.
const pluck = (f, at = 0, g = 1, d = 0.07) => [
  { source: { type: 'triangle', frequency: f }, filter: { type: 'lowpass', frequency: f * 1.5, resonance: 0.7, envelope: { peak: Math.min(12000, f * 6), decay: d * 0.5 } }, envelope: env(d, 0.02, 0.002), gain: 0.3 * g, delay: at },
  { source: { type: 'sine', frequency: f * 2 }, envelope: env(d * 0.35, 0.01, 0.001), gain: 0.06 * g, delay: at },
  snap(3000, 0.0014, 0.12 * g, at),
];
// A house stab: each chord note as two triangles a few cents apart, through
// one lowpass sweep (dark, bright, dark again), short.
const stab = (notes, at = 0, g = 1, d = 0.09) => notes.flatMap((f) => [-7, 7].map((detune) => (
  { source: { type: 'triangle', frequency: f, detune }, filter: { type: 'lowpass', frequency: 700, resonance: 1.2, envelope: { attack: 0.004, peak: 3600, decay: d * 0.7 } }, envelope: env(d, 0.03, 0.003), gain: (0.22 * g) / notes.length, delay: at }
))).concat([snap(2600, 0.0014, 0.1 * g, at)]);
// 909 closed (or open) hat: white noise, high-passed and kept off the very top.
const hat909 = (open = false, at = 0, g = 1) => [{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: 7000, resonance: 0.7 }, { type: 'lowpass', frequency: 13000 }], envelope: env(open ? 0.09 : 0.025, open ? 0.03 : 0.01, 0.0005), gain: 0.4 * g, delay: at }];
// 808 closed hat: the six square oscillators at the 808's metal ratios,
// band-passed high, which gives it its ring.
const hat808 = (at = 0, g = 1) => [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => (
  { source: { type: 'square', frequency: f }, filter: [{ type: 'bandpass', frequency: 10000, resonance: 1 }, { type: 'highpass', frequency: 7000 }], envelope: env(0.03, 0.01, 0.0005), gain: 0.25 * g, delay: at }
));
// A rim: a short tuned knock (two triangles a fifth apart) and a bright snap.
const rim = (f, at = 0, g = 1) => [
  { source: { type: 'triangle', frequency: f }, envelope: env(0.014, 0.006, 0.0005), gain: 0.3 * g, delay: at },
  { source: { type: 'triangle', frequency: f * 1.5 }, envelope: env(0.008, 0.004, 0.0005), gain: 0.12 * g, delay: at },
  snap(f * 3, 0.002, 0.35 * g, at),
];
// A tight clap: three quick bursts of band-passed noise, then a short tail.
const clap = (at = 0, g = 1) => [0, 0.008, 0.016].map((t) => snap(1500, 0.004, 0.5 * g, at + t))
  .concat([{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'bandpass', frequency: 1500, resonance: 1 }, { type: 'lowpass', frequency: 6000 }], envelope: env(0.04, 0.01), gain: 0.35 * g, delay: at + 0.024 }]);
// A shaker: soft-edged high noise.
const shaker = (at = 0, g = 1) => [{ source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: 5500 }, { type: 'lowpass', frequency: 11000 }], envelope: env(0.03, 0.01, 0.006), gain: 0.4 * g, delay: at }];
// A tight snare tick: a tuned triangle body (E5) and a short noise rattle.
const snare = (at = 0, g = 1) => [
  { source: { type: 'triangle', frequency: E5 }, envelope: env(0.025, 0.008, 0.001), gain: 0.25 * g, delay: at },
  { source: { type: 'noise', color: 'white' }, filter: [{ type: 'highpass', frequency: 2500 }, { type: 'lowpass', frequency: 9000 }], envelope: env(0.035, 0.01, 0.0005), gain: 0.3 * g, delay: at },
];
// A high tom, tuned: a sine settling onto its note (from a hair above).
const tom = (f, at = 0, g = 1) => [
  { source: { type: 'sine', frequency: { start: f * 1.06, end: f } }, envelope: env(0.06, 0.02, 0.001), gain: 0.4 * g, delay: at },
  snap(2200, 0.0016, 0.2 * g, at),
];
// one sound: some layers in Pond's small room
const S = (...layers) => ({ layers: layers.flat(), effects: [booth()] });
const up = (o) => o.d > 0;

// ---- the slots --------------------------------------------------------
// Each slot: where it plays (for the lab), its loudness against Pond's tap
// (dB), and 3 or 4 variants. A variant: label, def(o) (o.d 1 on/open/to
// Controller, -1 off/close/to Mouse), tuned (keeps the detune small).
export const SLOTS = {
  download: { where: 'Every Download (.dmg) link: hero CTA, nav, install step, footer. The one moment worth marking.', db: 0, v: {
    stabRise: { label: 'House stab, A minor 7, rising to an A pluck', tuned: 1, def: () => S(stab([A4, C5, E5, G5]), pluck(A5, 0.06, 0.8, 0.09)) },
    arp: { label: 'Pluck arpeggio, A–E–A, up', tuned: 1, def: () => S(pluck(A5), pluck(E6, 0.035, 0.8), pluck(A6, 0.07, 0.6)) },
    rimPluck: { label: 'Rim tuned A, then a pluck on E', tuned: 1, def: () => S(rim(A5), pluck(E6, 0.03, 0.8)) },
    hat: { label: '909 closed hat', def: () => S(hat909()) },
  } },
  tap: { where: 'Other buttons: GitHub, Suggest an idea', db: -1, v: {
    rim: { label: 'Rim, tuned A', tuned: 1, def: () => S(rim(A5)) },
    pluck: { label: 'Pluck, A5', tuned: 1, def: () => S(pluck(A5, 0, 1, 0.05)) },
    hat: { label: '909 closed hat', def: () => S(hat909()) },
    shaker: { label: 'Shaker', def: () => S(shaker()) },
  } },
  nav: { where: 'Nav and footer links, the logo (quieter, as Pond’s links are)', db: -6, v: {
    shaker: { label: 'Shaker', def: () => S(shaker()) },
    hat808: { label: '808 closed hat', def: () => S(hat808()) },
    pluck: { label: 'Pluck, E5, short', tuned: 1, def: () => S(pluck(E5, 0, 1, 0.04)) },
  } },
  hand: { where: 'The Mouse / Controller switch (hero:hand): rises going to Controller; going back, the first note alone, softer', db: -1, v: {
    pluckPair: { label: 'Pluck pair, E5 → A5', tuned: 1, def: (o) => (up(o) ? S(pluck(E5), pluck(A5, 0.045)) : S(pluck(E5, 0, 0.7))) },
    stab: { label: 'House stab, A minor 7, rising a voicing', tuned: 1, def: (o) => (up(o) ? S(stab([A4, C5, E5, G5], 0, 0.8), stab([C5, E5, G5, A5], 0.055)) : S(stab([A4, C5, E5, G5], 0, 0.7))) },
    rimPair: { label: 'Rim pair, tuned E → A', tuned: 1, def: (o) => (up(o) ? S(rim(E5), rim(A5, 0.045)) : S(rim(E5, 0, 0.7))) },
    hats: { label: '909 hats: open to Controller, closed to Mouse', def: (o) => S(hat909(up(o))) },
  } },
  faq: { where: 'FAQ questions: opening rises; closing is the first note alone, softer', db: -3, v: {
    pluck: { label: 'Pluck, C5 → E5', tuned: 1, def: (o) => (up(o) ? S(pluck(C5, 0, 0.8, 0.05), pluck(E5, 0.035, 1, 0.06)) : S(pluck(C5, 0, 0.6, 0.05))) },
    rim: { label: 'Rim, tuned: E6 opening, A5 closing', tuned: 1, def: (o) => S(rim(up(o) ? E6 : A5, 0, up(o) ? 1 : 0.7)) },
    hats: { label: '909 hats: open opening, closed closing', def: (o) => S(hat909(up(o), 0, up(o) ? 1 : 0.8)) },
    tom: { label: 'Tom, high: E5 opening, C5 closing', tuned: 1, def: (o) => S(tom(up(o) ? E5 : C5, 0, up(o) ? 1 : 0.7)) },
  } },
  needle: { where: 'A click (or tap) on the hero record’s grooves (record:needle)', db: -2, v: {
    hat909: { label: '909 closed hat', def: () => S(hat909()) },
    hat808: { label: '808 closed hat', def: () => S(hat808()) },
    rim: { label: 'Rim, tuned A', tuned: 1, def: () => S(rim(A5)) },
    clap: { label: 'Clap, tight', def: () => S(clap()) },
  } },
  knock: { where: 'Pressing on the footer’s big word (the lens)', db: -2, v: {
    tom: { label: 'Tom, high, tuned A', tuned: 1, def: () => S(tom(A4)) },
    snare: { label: 'Snare tick, tuned E', tuned: 1, def: () => S(snare()) },
    clap: { label: 'Clap, tight', def: () => S(clap()) },
    stab: { label: 'House stab, A minor 7', tuned: 1, def: () => S(stab([A4, C5, E5, G5])) },
  } },
  copy: { where: 'Copy actions (data-sfx="copy" or the sfx:play event); the site has none yet', db: -2, v: {
    pluckPair: { label: 'Pluck pair, A5 → E6', tuned: 1, def: () => S(pluck(A5, 0, 0.8, 0.05), pluck(E6, 0.04, 1, 0.06)) },
    rimPair: { label: 'Rim pair, tuned A → E', tuned: 1, def: () => S(rim(A5), rim(E6, 0.04)) },
    stabHat: { label: 'House stab, A minor 7, with a closed hat', tuned: 1, def: () => S(stab([A4, C5, E5, G5]), hat909(false, 0.05, 0.6)) },
  } },
  power: { where: 'Turning sound on (rises) and off (one soft note) with the speaker', db: -2, v: {
    arp: { label: 'Pluck arpeggio, A–E–A up; off: A alone, softer', tuned: 1, def: (o) => (up(o) ? S(pluck(A4), pluck(E5, 0.04), pluck(A5, 0.08, 0.8)) : S(pluck(A4, 0, 0.6))) },
    stab: { label: 'House stab rising; off: one soft stab', tuned: 1, def: (o) => (up(o) ? S(stab([A4, C5, E5, G5], 0, 0.8), stab([C5, E5, G5, A5], 0.055)) : S(stab([A4, C5, E5, G5], 0, 0.6))) },
    hats: { label: '909 hats: open on, closed off', def: (o) => S(hat909(up(o))) },
  } },
};
// Each variant's trim (dB) to its slot's level, measured in the lab
// (Measure: K-weighted with a 150Hz high-pass, loudest 100ms, against
// Pond's tap; Copy picks gives this object after a Measure).
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

// The picks (lab › Copy picks). 'none' silences a slot. The lab can also
// leave its picks in this browser (interlude-sound-picks) to hear them on
// the real page.
export const PICKS = { download: 'stabRise', tap: 'rim', nav: 'shaker', hand: 'pluckPair', faq: 'pluck', needle: 'hat909', knock: 'tom', copy: 'pluckPair', power: 'arp' };
const picks = { ...PICKS };
try { Object.assign(picks, JSON.parse(localStorage.getItem('interlude-sound-picks')) || {}); } catch { /* fine */ }
export const pick = (slot, v) => { if (v === undefined) return picks[slot]; picks[slot] = v; };
// A variant's sound definition.
export const definition = (slot, key, o = {}) => SLOTS[slot].v[key].def({ d: 1, ...o });

export let master = +picks.master || 1;   // the overall level, on the master bus (the lab's slider)
export function setMaster(v) { master = v; if (bus) bus.gain.value = v; }

// ---- the context ------------------------------------------------------
let ctx = null, bus = null, on = true, sleep = 0;
export const context = () => ctx;
// Wakes (or makes) the context. Called synchronously in every gesture, as
// iOS only lets audio start inside one.
function wake() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* fine */ }
    try { bus = getMasterBus(); ctx = bus.context; bus.gain.value = master; } catch { return; }
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

/** Plays a slot's picked variant (or `variant`), if sound is on and the gate
 *  lets it. o: { d, pan }. force: the lab's audition (ignores mute). */
export function play(slot, o = {}, variant, force) {
  const s = SLOTS[slot], v = s?.v[variant || picks[slot]];
  if (!v || !ctx || (!on && !force)) return false;
  const g = gate(slot);
  if (!g) return false;
  const vol = g * 10 ** ((TRIMS[slot + '.' + (variant || picks[slot])] ?? 0) / 20), t0 = performance.now();
  const go = () => { defineSound(v.def({ d: 1, ...o }))({ volume: vol, pan: o.pan, detune: (Math.random() - 0.5) * (v.tuned ? 6 : 28) }); doze(); window.__sfxLog?.push(slot); };
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

/** Listens to the page. opts.on: whether sound starts on. */
export function start(opts = {}) {
  on = opts.on !== false;
  if (started) return;
  started = true;
  const cap = { capture: true, passive: true };
  // Every gesture wakes the context (Safari suspends it again after a while).
  for (const t of ['pointerup', 'touchend', 'click']) addEventListener(t, (e) => { if (e.isTrusted && on) wake(); }, cap);
  addEventListener('keydown', (e) => { if (!e.isTrusted || e.repeat) return; lastInput = now(); if (on) wake(); }, cap);
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
