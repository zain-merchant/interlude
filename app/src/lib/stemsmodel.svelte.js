// The stems model download, shared by the decks' Stems tabs, the toasts and
// Settings › Stems. The engine reports it as it changes, apart from the
// state polled every frame, so a download doesn't keep the frame loop awake.

import { backend } from './backend.js';
import { announce } from './announce.svelte.js';
import { tipOnce } from './tips.svelte.js';
import { mb, progressText, spoken } from './stemsmodel.js';

/** @type {import('./stemsmodel.js').StemsModel & { known: boolean }} */
export const stemsModel = $state({ known: false, state: 'missing', done: 0, total: 0, secondsLeft: null, error: null, mode: 'ask' });

/** How many places on screen show the progress. */
let watchers = 0;

/** Call while progress is on screen, and the returned function after: its quarters are announced. */
export function watchStemsModel() {
  watchers++;
  return () => void watchers--;
}

/** @param {import('./stemsmodel.js').StemsModel | undefined} m */
function take(m) {
  if (!m) return;
  const said = stemsModel.known ? spoken($state.snapshot(stemsModel), m, watchers > 0) : '';
  Object.assign(stemsModel, m, { known: true });
  if (said) announce(said);
}

/** Follows the download. Call once. @returns {Promise<() => void>} stop */
export async function startStemsModel() {
  const off = await backend.onStemsModel?.(take);
  take(await backend.stemsModel?.());
  return off ?? (() => {});
}

/** The app is set up, so the model may download. The first time it does, a tip says so. */
export async function stemsSetupDone() {
  take(await backend.stemsSetupDone?.());
  if (stemsModel.state === 'downloading') {
    tipOnce('stemsDownload', `Stems are downloading in the background (${mb(stemsModel.total)}). Settings › Stems shows how far it's got, and can cancel it.`);
  }
}

/** Downloads the model, carries on with it, or tries again now. */
export async function downloadStems() {
  take(await backend.downloadStemsModel());
  if (stemsModel.state === 'downloading') announce(`Downloading stems, ${progressText(stemsModel)}`);
}
/** Stops the download. It doesn't start again until asked. */
export const cancelStems = async () => take(await backend.cancelStemsModel());
/** Deletes the model, or what's in of it. */
export const removeStems = async () => take(await backend.removeStemsModel());

/** Changes when tracks are split. @param {import('./stemsmodel.js').StemsMode} mode */
export async function setStemsMode(mode) {
  const info = await backend.setStems({ mode });
  take(info.model);
  return info;
}
