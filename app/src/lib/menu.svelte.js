// Right-click menus. In the desktop app they're native, so they look,
// scroll and read aloud like the OS; in a plain browser (the simulated
// engine) a matching HTML menu stands in.

import { inTauri } from './backend.js';

/**
 * @typedef {{ label: string, action: () => void, key?: string, enabled?: boolean } | '-'} MenuEntry
 */

/** The HTML fallback's state, drawn by ContextMenu.svelte. */
export const htmlMenu = $state({ items: /** @type {MenuEntry[]} */ ([]), x: 0, y: 0, open: false, returnFocus: null, keyboard: false });

// macOS shows accelerators in its own glyphs; translate ours.
const accel = (k) =>
  k
    ?.replace('⌘', 'CmdOrCtrl+')
    .replace('⇧', 'Shift+')
    .replace('←', 'Left')
    .replace('→', 'Right');

/**
 * Opens a menu for a contextmenu event.
 * @param {MouseEvent} e
 * @param {MenuEntry[]} items
 */
export async function openMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  if (inTauri) {
    const { Menu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
    const built = await Promise.all(
      items.map((it) =>
        it === '-'
          ? PredefinedMenuItem.new({ item: 'Separator' })
          : MenuItem.new({ text: it.label, enabled: it.enabled ?? true, accelerator: accel(it.key), action: it.action }),
      ),
    );
    const menu = await Menu.new({ items: built });
    await menu.popup();
    return;
  }
  htmlMenu.items = items;
  htmlMenu.x = e.clientX;
  htmlMenu.y = e.clientY;
  htmlMenu.returnFocus = document.activeElement;
  // #14 (UI audit flag): states: whether the keyboard opened it (keyboardMenu sends an untrusted event).
  htmlMenu.keyboard = !e.isTrusted;
  htmlMenu.open = true;
}

/**
 * Shift+F10 and the context-menu key open the menu for whatever has
 * keyboard focus, by sending it a contextmenu event at its centre.
 */
export function keyboardMenu(e) {
  if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return false;
  e.preventDefault();
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return true;
}
