// Looking after the beta: the app's log, problem reports, the library's
// health on launch, and updates. In a plain browser (no Tauri) these
// quietly do nothing, so the UI can still be designed there.

import { inTauri } from './backend.js';

const invoke = inTauri ? (await import('@tauri-apps/api/core')).invoke : null;

/**
 * @typedef {{ state: 'ok' }
 *         | { state: 'restored', backup: string, damaged: string }
 *         | { state: 'fresh', damaged: string }
 *         | { state: 'unsaved', reason: string }} LibraryHealth
 */

/** How the library file fared when the app opened it. @returns {Promise<LibraryHealth>} */
export const libraryHealth = () => (invoke ? invoke('library_health') : Promise.resolve({ state: 'ok' }));

/** Shows a file in Finder (or the system's file manager). */
export async function reveal(path) {
  if (!inTauri) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

/**
 * Saves a problem report (what happened, the system, the logs) to the
 * Desktop. @returns {Promise<string>} its path
 */
export const saveReport = (description, context) =>
  invoke ? invoke('save_report', { description, context }) : Promise.resolve('~/Desktop/Interlude report.txt');

// The UI's own errors go into the app's log, so a report has them too.
// Capped, so an error in a render loop can't flood it.
let sent = 0;
setInterval(() => (sent = 0), 60_000);
function logUi(text) {
  if (!invoke || sent++ > 50) return;
  invoke('log_ui', { text: String(text) }).catch(() => {});
}

/** Starts copying uncaught errors and console errors into the app's log. */
export function captureUiErrors() {
  if (!invoke) return;
  window.addEventListener('error', (e) => logUi(`error: ${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => logUi(`unhandled: ${e.reason?.stack ?? e.reason}`));
  const error = console.error;
  console.error = (...args) => {
    error(...args);
    logUi(args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
}

/** An update that's ready to install, once `checkForUpdate` finds one. */
export const update = $state({
  /** @type {null | { version: string, notes: string }} */
  available: null,
  /** 'idle', 'downloading' or 'failed' */
  state: 'idle',
  /** 0..1 while downloading */
  progress: 0,
});
let pending = null;

/**
 * Asks the update server whether there's a newer version.
 * @returns {Promise<boolean | null>} true if there is, false if not, null if it couldn't tell
 */
export async function checkForUpdate() {
  if (!inTauri) return false;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    pending = await check();
    update.available = pending ? { version: pending.version, notes: pending.body ?? '' } : null;
    return !!pending;
  } catch (e) {
    console.warn('update check failed', e);
    return null;
  }
}

/** Downloads and installs the update, then restarts the app. */
export async function installUpdate() {
  if (!pending) return;
  update.state = 'downloading';
  update.progress = 0;
  try {
    let total = 0;
    let got = 0;
    await pending.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0;
      else if (e.event === 'Progress') {
        got += e.data.chunkLength;
        if (total) update.progress = got / total;
      }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.error('update failed', e);
    update.state = 'failed';
  }
}
