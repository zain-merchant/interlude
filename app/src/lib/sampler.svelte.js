// The sampler: eight one-shot slots that play straight to the master,
// from the strip in the library or the FLX4's sampler pads. Which file
// sits in each slot, the level and whether the strip is open are kept
// between sessions; the samples are loaded back into the engine on start.
// A sampler with nothing in it starts with the built-in sounds (air horn,
// kick, ...), so the pads make a noise the first time they're pressed.

import { backend } from './backend.js';
import { engine, control } from './engine.svelte.js';
import { announce } from './announce.svelte.js';

export const SLOTS = 8;
const KEY = 'oss-dj.sampler';

/** @typedef {{ path: string, title: string } | null} Slot */

export const sampler = $state({
  /** @type {Slot[]} */
  slots: Array(SLOTS).fill(null),
  /** Slots being decoded. */
  loading: /** @type {boolean[]} */ (Array(SLOTS).fill(false)),
  level: 0.8,
  open: false,
});

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ slots: sampler.slots, level: sampler.level, open: sampler.open }));
  } catch {}
}

/** Puts a library track in a slot. Throws with the reason if it can't. */
export async function loadSample(slot, track) {
  sampler.loading[slot] = true;
  try {
    await backend.loadSample(slot, track.path);
    sampler.slots[slot] = { path: track.path, title: track.title };
    save();
    announce(`${track.title} in sampler slot ${slot + 1}`);
  } finally {
    sampler.loading[slot] = false;
  }
}

export function clearSample(slot) {
  if (!sampler.slots[slot]) return;
  control({ type: 'clearSample', slot });
  sampler.slots[slot] = null;
  save();
}

export function playSample(slot) {
  if (sampler.slots[slot]) control({ type: 'samplePlay', slot });
}

export function stopSample(slot) {
  control({ type: 'sampleStop', slot });
}

export function setSamplerLevel(value) {
  sampler.level = value;
  control({ type: 'setSamplerLevel', value });
  save();
}

export function setSamplerOpen(open) {
  sampler.open = open;
  save();
}

/** True while the engine says a slot is playing. */
export const slotPlaying = (slot) => !!engine.sampler?.slots[slot]?.playing;

/** The built-in sounds, in slot order, once asked for. */
let defaults = null;
export async function defaultSamples() {
  defaults ??= backend.defaultSamples?.().catch(() => []) ?? Promise.resolve([]);
  return defaults;
}

/** Puts the built-in sound back in a slot. */
export async function loadDefaultSample(slot) {
  const d = (await defaultSamples())[slot];
  if (d) await loadSample(slot, d);
}

/** Asks for an audio file and puts it in a slot. False if none was chosen. */
export async function pickSample(slot) {
  const path = await backend.pickSample?.();
  if (!path) return false;
  const title = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  await loadSample(slot, { path, title });
  return true;
}

/** Loads the saved slots back into the engine. Ones that fail are dropped, quietly. */
export async function restoreSampler() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {}
  sampler.open = !!saved?.open;
  if (typeof saved?.level === 'number') setSamplerLevel(saved.level);
  let slots = (saved?.slots ?? []).slice(0, SLOTS);
  if (!slots.some((s) => s?.path)) slots = await defaultSamples();
  await Promise.all(
    slots.map(async (s, i) => {
      if (!s?.path) return;
      try {
        await loadSample(i, s);
      } catch {
        sampler.slots[i] = null;
      }
    }),
  );
  save();
}
