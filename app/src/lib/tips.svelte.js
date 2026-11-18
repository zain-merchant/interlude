// One-time tips. Each shows once per computer, the first time it applies,
// and is never shown again. "Seen" is kept in localStorage with the other
// settings, which lives in the user's app data folder, so app updates keep
// it. A tip that is already seen, or can't be saved, stays quiet.

import { backend } from './backend.js';
import { showToast } from './undo.svelte.js';

const KEY = 'oss-dj.tips';
/** How long a tip stays up, in milliseconds: longer than a plain toast. */
const TIP_MS = 9000;

function seen() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Marks tip `id` seen. Returns false if it already was, or can't be saved. */
function markSeen(id) {
  const done = seen();
  if (!Array.isArray(done) || done.includes(id)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify([...done, id]));
    return true;
  } catch {
    // Not saved means it could show every time: better not at all.
    return false;
  }
}

/** True the first time it's called for `id` on this computer, then never again. */
export function once(id) {
  return markSeen(id);
}

/** Shows `text` once, ever, under `id`. Returns whether it showed. */
export function tipOnce(id, text) {
  if (!markSeen(id)) return false;
  showToast(text, { ms: TIP_MS });
  return true;
}

/** True when a DDJ-FLX4 is plugged in and using the built-in mapping. */
async function flx4Connected() {
  const c = await backend.controllers?.().catch(() => null);
  return !!c?.connected?.some((x) => !x.learned && /FLX4/i.test(x.mapping ?? ''));
}

let checking = false;
/**
 * A deck's stems are ready: the first time, say where they are. On the
 * FLX4 that's SHIFT + HOT CUE (the pad FX buttons now hold pad effects);
 * otherwise the deck's Stems tab. The FLX4 tip still shows once if the
 * controller is plugged in after the screen tip was seen.
 */
export async function stemsReadyTip() {
  if (checking) return;
  if (seen().includes('stemsFlx4')) return;
  checking = true;
  try {
    if (await flx4Connected()) {
      // It covers the screen tip too.
      if (tipOnce('stemsFlx4', 'Stems are ready. On the FLX4, hold SHIFT and press HOT CUE to mute or solo them. PAD FX1 and PAD FX2 now play pad effects.')) {
        markSeen('stems');
      }
    } else {
      tipOnce('stems', "Stems are ready. Mute or solo vocals, melody, bass and drums in the deck's Stems tab.");
    }
  } finally {
    checking = false;
  }
}
