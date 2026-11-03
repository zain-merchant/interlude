// The UI's only door to the engine. In the desktop app it calls the Rust
// side through Tauri; in a plain browser (`npm run dev` without Tauri) it
// falls back to a simulated engine so the UI can be designed and tested
// without building the Rust app.

import { createMockBackend } from './mock.js';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * @typedef {{ loaded: boolean, playing: boolean, position: number, duration: number,
 *             cue: number, rate: number, speed: number, bpm: number,
 *             key: { tonic: number, minor: boolean } | null, keylock: boolean,
 *             generation: number, peak: number, hotCues: (number | null)[],
 *             loopIn: number | null, loopOut: number | null, looping: boolean,
 *             loopBeats: number, filter?: number,
 *             fx?: { kind: 'echo' | 'reverb' | 'flanger' | 'phaser', on: boolean, level: number, beats: number } }} DeckState
 * @typedef {{ active: boolean, seconds: number, path: string | null, droppedSeconds: number, error: string | null }} RecordingStatus
 * @typedef {{ state: 'connected', device: string, sampleRate: number }
 *         | { state: 'lost', device: string, fallback: string | null }
 *         | { state: 'none' }} AudioStatus
 * @typedef {{ decks: DeckState[], deckPeaks: number[], masterPeak: number[],
 *             mixer?: { crossfader: number, cueMix: number, masterDb: number, quantize?: boolean },
 *             audio?: AudioStatus, recording?: RecordingStatus }} EngineState
 * @typedef {{ title: string, path: string, duration: number, sampleRate: number,
 *             binsPerSec: number, binCount: number,
 *             beatgrid: Beatgrid | null, gridLocked?: boolean }} TrackInfo
 * @typedef {{ bpm: number, firstBeat: number }} Beatgrid
 * @typedef {{ duration: number | null, bpm: number | null,
 *             key: { tonic: number, minor: boolean } | null, failed: boolean }} TrackAnalysis
 * @typedef {{ path: string, title: string, artist: string, album: string, genre: string,
 *             folder: string, format: string, missing: boolean,
 *             analysis: TrackAnalysis | null }} LibraryTrack
 * @typedef {{ id: number, name: string, count: number }} Playlist
 * @typedef {{ start: number, count: number }} HistorySession
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
    /** Stops waiting for a disconnected audio device and uses the system default. */
    useDefaultOutput: () => invoke('use_default_output'),
    /** @returns {Promise<TrackInfo>} */
    loadTrack: (deck, path) => invoke('load_track', { deck, path }),
    /**
     * Fixes the beatgrid of a deck's track by hand (saved, and kept from
     * analysis), or with null goes back to the detected one.
     * @returns {Promise<{ beatgrid: Beatgrid | null, gridLocked: boolean }>}
     */
    setBeatgrid: (deck, grid) => invoke('set_beatgrid', { deck, grid }),
    /** @returns {Promise<Uint8Array>} */
    waveform: async (deck) => new Uint8Array(await invoke('waveform', { deck })),
    /** @returns {Promise<string[]>} */
    libraryFolders: () => invoke('library_folders'),
    addFolder: (path) => invoke('add_folder', { path }),
    removeFolder: (path) => invoke('remove_folder', { path }),
    /** @returns {Promise<LibraryTrack[]>} */
    libraryTracks: (folder) => invoke('library_tracks', { folder: folder ?? null }),
    /** @returns {Promise<Playlist[]>} */
    playlists: () => invoke('playlists'),
    /** @returns {Promise<number>} the new playlist's id */
    createPlaylist: (name, paths = []) => invoke('create_playlist', { name, paths }),
    renamePlaylist: (id, name) => invoke('rename_playlist', { id, name }),
    deletePlaylist: (id) => invoke('delete_playlist', { id }),
    /** @returns {Promise<LibraryTrack[]>} in playlist order */
    playlistTracks: (id) => invoke('playlist_tracks', { id }),
    addToPlaylist: (id, paths) => invoke('add_to_playlist', { id, paths }),
    /** Replaces a playlist's tracks, in order. */
    setPlaylistTracks: (id, paths) => invoke('set_playlist_tracks', { id, paths }),
    /** @returns {Promise<HistorySession[]>} newest first */
    historySessions: () => invoke('history_sessions'),
    /** @returns {Promise<LibraryTrack[]>} in the order they were played */
    sessionTracks: (start) => invoke('session_tracks', { start }),
    /**
     * A track has been on air long enough to go into History.
     * @param {(path: string) => void} fn
     * @returns {Promise<() => void>} unlisten
     */
    onLibraryPlayed: (fn) => listen('library-played', (e) => fn(e.payload)),
    /**
     * A track's length, BPM and key, as the background analyzer finds them.
     * @param {(e: TrackAnalysis & { path: string }) => void} fn
     * @returns {Promise<() => void>} unlisten
     */
    onLibraryAnalysis: (fn) => listen('library-analysis', (e) => fn(e.payload)),
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
