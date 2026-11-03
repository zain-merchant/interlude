// The UI's only door to the engine. In the desktop app it calls the Rust
// side through Tauri; in a plain browser (`npm run dev` without Tauri) it
// falls back to a simulated engine so the UI can be designed and tested
// without building the Rust app.

import { createMockBackend } from './mock.js';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * @typedef {{ loaded: boolean, playing: boolean, position: number, duration: number,
 *             cue: number, rate: number, speed: number, bpm: number,
 *             generation: number, peak: number, filter?: number,
 *             fx?: { kind: 'echo' | 'reverb' | 'flanger' | 'phaser', on: boolean, level: number, beats: number } }} DeckState
 * @typedef {{ active: boolean, seconds: number, path: string | null, droppedSeconds: number, error: string | null }} RecordingStatus
 * @typedef {{ decks: DeckState[], deckPeaks: number[], masterPeak: number[], recording?: RecordingStatus }} EngineState
 * @typedef {{ title: string, path: string, duration: number, sampleRate: number,
 *             binsPerSec: number, binCount: number,
 *             beatgrid: { bpm: number, firstBeat: number } | null }} TrackInfo
 * @typedef {{ path: string, title: string, artist: string, folder: string, format: string }} LibraryTrack
 */

async function createTauriBackend() {
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { listen } = await import('@tauri-apps/api/event');
  return {
    /** @param {Record<string, any>} cmd */
    control: (cmd) => invoke('control', { cmd }),
    /** @returns {Promise<EngineState>} */
    state: () => invoke('state'),
    /** @returns {Promise<string>} */
    outputName: () => invoke('output_name'),
    /** Starts recording the master output. @returns {Promise<string>} the file's path */
    startRecording: () => invoke('start_recording'),
    /** @returns {Promise<RecordingStatus>} */
    stopRecording: () => invoke('stop_recording'),
    /** @returns {Promise<TrackInfo>} */
    loadTrack: (deck, path) => invoke('load_track', { deck, path }),
    /** @returns {Promise<Uint8Array>} */
    waveform: async (deck) => new Uint8Array(await invoke('waveform', { deck })),
    /** @returns {Promise<string[]>} */
    libraryFolders: () => invoke('library_folders'),
    addFolder: (path) => invoke('add_folder', { path }),
    removeFolder: (path) => invoke('remove_folder', { path }),
    /** @returns {Promise<LibraryTrack[]>} */
    libraryTracks: (folder) => invoke('library_tracks', { folder: folder ?? null }),
    /**
     * Library actions from a hardware controller (browse knob, load buttons).
     * @param {(e: { type: 'browse', delta: number } | { type: 'load', deck: number }) => void} fn
     * @returns {Promise<() => void>} unlisten
     */
    onController: (fn) => listen('controller', (e) => fn(e.payload)),
    /** @returns {Promise<string | null>} */
    pickFolder: async () => {
      const picked = await open({ directory: true, multiple: false, title: 'Add a music folder' });
      return typeof picked === 'string' ? picked : null;
    },
  };
}

export const backend = inTauri ? await createTauriBackend() : createMockBackend();
