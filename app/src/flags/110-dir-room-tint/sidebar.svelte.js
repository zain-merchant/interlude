// #110 (UI audit flag): the library's sidebar, put away and brought back.
//
// `hidden` is kept between sessions. `peek` opens it for as long as a track is
// held over the closed edge, so a playlist can still be dropped on.
import { flag } from '../registry.svelte.js';

const KEY = 'interlude.sidebarHidden';

function load() {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    return false;
  }
}

export const side = $state({ hidden: load(), peek: false });

/** Whether the sidebar is out of sight now. */
export const sideShut = () => flag('dir-room-tint') && side.hidden && !side.peek;

/** @param {boolean} on */
export function hideSidebar(on) {
  if (side.hidden === on) return;
  side.hidden = on;
  side.peek = false;
  try {
    localStorage.setItem(KEY, on ? 'yes' : 'no');
  } catch {}
}

/** The shortcut: ⌘\ (Ctrl+\ elsewhere). Nothing else in the app uses it. */
export const SIDE_KEY = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘\\' : 'Ctrl+\\';

if (typeof window !== 'undefined')
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backslash' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (!flag('dir-room-tint') || document.querySelector('.backdrop')) return;
    e.preventDefault();
    hideSidebar(!side.hidden);
  });
