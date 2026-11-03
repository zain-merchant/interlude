// The sampler: eight one-shot slots that play straight to the master,
// from the strip under the decks or the FLX4's sampler pads. Which file
// sits in each slot, the level and whether the strip is open are kept
// between sessions; the samples are loaded back into the engine on start.

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

/** Loads the saved slots back into the engine. Ones that fail are dropped, quietly. */
export async function restoreSampler() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {}
  if (!saved) return;
  sampler.open = !!saved.open;
  if (typeof saved.level === 'number') setSamplerLevel(saved.level);
  await Promise.all(
    (saved.slots ?? []).slice(0, SLOTS).map(async (s, i) => {
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
