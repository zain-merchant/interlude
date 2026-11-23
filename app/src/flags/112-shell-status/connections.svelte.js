// What's connected, and what's being fetched, for #112's status items.
import { backend, inTauri } from '../../lib/backend.js';
import { engine } from '../../lib/engine.svelte.js';

/** What App.svelte's windows are opened with: set once, when it mounts. */
/** @type {{ settings: (page: string) => void, setup: () => void }} */
export const open = { settings: () => {}, setup: () => {} };

export const conn = $state({
  /** @type {null | { connected: { port: string, mapping: string, learned: boolean }[], ports: string[], learned: string[] }} */
  controllers: null,
  /** A controller that has just gone, for a few seconds. */
  gone: '',
  /** @type {null | { done: number, total: number }} the stems model coming down */
  stems: null,
  /** The sound has just dropped out. */
  dropping: false,
});

const EVERY = 2000; // as often as the engine looks for controllers
const GONE_MS = 6000;
const DROP_MS = 10000;
let users = 0;
let timer = 0;
let goneTimer = 0;
let dropTimer = 0;
let late = -1;

async function look() {
  if (document.hidden) return;
  try {
    const now = await backend.controllers?.();
    const left = conn.controllers?.connected.find((c) => !now?.connected.some((n) => n.port === c.port));
    if (left) {
      conn.gone = left.port;
      clearTimeout(goneTimer);
      goneTimer = window.setTimeout(() => (conn.gone = ''), GONE_MS);
    } else if (now?.connected.some((c) => c.port === conn.gone)) conn.gone = '';
    conn.controllers = now ?? null;
  } catch {}
  try {
    const m = (await backend.stemsInfo?.())?.model;
    conn.stems = m?.state === 'downloading' ? { done: m.done, total: m.total } : null;
  } catch {}
  if (inTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const s = /** @type {any} */ (await invoke('audio_stats'));
      if (late >= 0 && s && s.lateCallbacks > late) {
        conn.dropping = true;
        clearTimeout(dropTimer);
        dropTimer = window.setTimeout(() => (conn.dropping = false), DROP_MS);
      }
      late = s?.lateCallbacks ?? -1;
    } catch {}
  }
}

/** Keeps `conn` current while anything shows it. */
export function watchConnections() {
  if (users++ === 0) {
    look();
    timer = window.setInterval(look, EVERY);
  }
  return () => {
    if (--users === 0) clearInterval(timer);
  };
}
export const refresh = look;

// MIDI inputs that aren't gear: the Mac's own buses.
const NOT_GEAR = /^(IAC|Network|Session)\b|\bBus \d+$/i;
/** Plugged in with no mapping (or a port that couldn't be opened: the same from here). */
export const unmapped = () =>
  (conn.controllers?.ports ?? []).filter((p) => !NOT_GEAR.test(p) && !conn.controllers?.connected.some((c) => c.port === p));

const plain = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Whether a controller's port and a sound card look like one machine: their names say so, which is all there is to go on. */
export const sameMachine = (port, device) => {
  const a = plain(port);
  const b = plain(device ?? '');
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
};

/**
 * The items to show: { kind, name, icon, state }.
 * state is '' or 'bad' (red: no sound, or it's breaking up).
 */
export function items() {
  const a = engine.audio;
  const c = conn.controllers?.connected ?? [];
  const out =
    a?.state === 'connected'
      ? { kind: 'out', name: conn.dropping ? `${a.device}, sound dropping out` : a.device, icon: conn.dropping ? 'outx' : 'out', state: conn.dropping ? 'bad' : '' }
      : a?.state === 'lost'
        ? { kind: 'out', name: `${a.device} disconnected`, icon: 'outx', state: 'bad' }
        : { kind: 'out', name: 'No output', icon: 'outx', state: 'bad' };
  if (c.length === 1 && a?.state === 'connected' && !conn.dropping && sameMachine(c[0].port, a.device)) return [{ kind: 'both', name: c[0].port, icon: 'both', state: '' }];
  const ctl = conn.gone
    ? { kind: 'ctl', name: `${conn.gone} disconnected`, icon: 'ctlx', state: '' }
    : c.length > 1
      ? { kind: 'ctl', name: `${c.length} controllers`, icon: 'ctl', state: '' }
      : c.length
        ? { kind: 'ctl', name: c[0].port, icon: 'ctl', state: '' }
        : unmapped().length
          ? { kind: 'ctl', name: `${unmapped()[0]}, no mapping`, icon: 'ctlx', state: '' }
          : null;
  return ctl ? [ctl, out] : [out];
}
