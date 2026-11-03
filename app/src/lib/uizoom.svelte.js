// Zooms the whole interface from 80% to 200% (⌘= and ⌘−), like a browser
// does, so the layout reflows instead of being scaled as a picture. The
// waveform zoom stays on plain − and =. Remembered between sessions.

import { inTauri } from './backend.js';

const KEY = 'oss-dj.uiZoom';
const STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

let saved = 1;
try {
  saved = Number(localStorage.getItem(KEY)) || 1;
} catch {}

export const uiZoom = $state({ scale: STEPS.includes(saved) ? saved : 1 });

async function apply(scale) {
  if (inTauri) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(scale);
      return;
    } catch (e) {
      console.error('webview zoom failed, falling back to CSS zoom', e);
    }
  }
  document.documentElement.style.zoom = scale === 1 ? '' : String(scale);
}

export function setUiZoom(scale) {
  uiZoom.scale = Math.max(STEPS[0], Math.min(STEPS.at(-1), scale));
  try {
    localStorage.setItem(KEY, String(uiZoom.scale));
  } catch {}
  apply(uiZoom.scale);
}

/** One step bigger (+1) or smaller (−1). */
export function stepUiZoom(dir) {
  const i = STEPS.findIndex((s) => s >= uiZoom.scale - 1e-6);
  setUiZoom(STEPS[Math.max(0, Math.min(STEPS.length - 1, i + dir))]);
}

export const uiZoomSteps = STEPS;

if (uiZoom.scale !== 1) apply(uiZoom.scale);
