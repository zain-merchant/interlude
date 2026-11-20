// The native macOS menu bar: the standard App, File, Edit, View, Window and
// Help menus, plus a Deck menu, with every command and its shortcut.
//
// Only ⌘ shortcuts become real menu shortcuts. A menu shortcut on a plain
// letter would swallow that letter in the search field, so performance
// keys are shown in the item's name instead and stay with the page's own
// key handler, which also gives them key-up for hold actions.

import { inTauri } from './backend.js';
import { binding, commandName, mac } from './commands.js';

/** True when this platform gets a native app menu (macOS in the desktop app). */
export const hasAppMenu = inTauri && mac;

const accelerator = (b) => (b?.mod ? ['CmdOrCtrl', b.shift && 'Shift', b.code].filter(Boolean).join('+') : undefined);

/**
 * Builds the menu and makes it the app menu.
 * @param {(id: string) => void} run runs a command from commands.js
 * @param {{ addFolder: () => void, importLibrary: () => void, keyboard: () => void, report: () => void, controllerSetup: () => void, checkUpdates: () => void, undoInField: (redo: boolean) => boolean }} actions
 */
export async function installAppMenu(run, actions) {
  if (!hasAppMenu) return;
  const { Menu, Submenu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
  const sep = () => PredefinedMenuItem.new({ item: 'Separator' });
  const pre = (item, text) => PredefinedMenuItem.new(text ? { item, text } : { item });

  /** A menu item for a command, showing its shortcut. */
  const cmd = (id, text = commandName(id)) => {
    const b = binding(id);
    const accel = accelerator(b);
    return MenuItem.new({
      text: b && !accel ? `${text}  (${b.label})` : text,
      accelerator: accel,
      action: () => run(id),
    });
  };
  const item = (text, action, accel) => MenuItem.new({ text, action, accelerator: accel });
  const sub = async (text, items) => Submenu.new({ text, items: await Promise.all(items) });

  const deckItems = (d) => {
    const n = 'AB'[d];
    return [
      cmd(`deck.${d}.play`, `Play / Pause Deck ${n}`),
      cmd(`deck.${d}.sync`, `Sync Deck ${n}`),
      cmd(`deck.${d}.pfl`, `Headphone Cue Deck ${n}`),
      cmd(`deck.${d}.where`, `Read Out Deck ${n} Position`),
    ];
  };

  // Undo and Redo first try the focused text field, so ⌘Z still undoes
  // typing in the search box.
  const editCmd = (id, redo) => {
    const b = binding(id);
    return MenuItem.new({
      text: commandName(id),
      accelerator: accelerator(b),
      action: () => actions.undoInField(redo) || run(id),
    });
  };

  const menu = await Menu.new({
    items: await Promise.all([
      sub('Interlude', [
        PredefinedMenuItem.new({ item: { About: null }, text: 'About Interlude' }),
        item('Check for Updates…', actions.checkUpdates),
        sep(),
        cmd('app.settings', 'Settings…'),
        sep(),
        pre('Services'),
        sep(),
        pre('Hide', 'Hide Interlude'),
        pre('HideOthers'),
        pre('ShowAll'),
        sep(),
        pre('Quit', 'Quit Interlude'),
      ]),
      sub('File', [
        item('Add Music Folder…', actions.addFolder),
        item('Import from Rekordbox or Serato…', actions.importLibrary),
        sep(),
        cmd('deck.0.load', 'Load Selected Track to Deck A'),
        cmd('deck.1.load', 'Load Selected Track to Deck B'),
        sep(),
        pre('CloseWindow'),
      ]),
      sub('Edit', [
        editCmd('edit.undo', false),
        editCmd('edit.redo', true),
        sep(),
        pre('Cut'),
        pre('Copy'),
        pre('Paste'),
        pre('SelectAll'),
        sep(),
        cmd('library.search', 'Search Library'),
      ]),
      sub('View', [
        cmd('view.uiZoomIn', 'Zoom In'),
        cmd('view.uiZoomOut', 'Zoom Out'),
        cmd('view.uiZoomReset', 'Actual Size'),
        sep(),
        cmd('view.zoomIn', 'Zoom Waveforms In'),
        cmd('view.zoomOut', 'Zoom Waveforms Out'),
        sep(),
        cmd('view.sampler', 'Show / Hide Sampler'),
        sep(),
        cmd('focus.next', 'Next Area'),
        cmd('focus.prev', 'Previous Area'),
        sep(),
        pre('Fullscreen'),
      ]),
      sub('Deck', [...deckItems(0), sep(), ...deckItems(1)]),
      sub('Window', [pre('Minimize'), pre('Maximize'), sep(), pre('CloseWindow')]),
      sub('Help', [item('Keyboard Shortcuts', actions.keyboard), item('Controller Not Working…', actions.controllerSetup), sep(), item('Report a Problem…', actions.report)]),
    ]),
  });
  await menu.setAsAppMenu();
}
