// #37 (critique panel S12; C30): Reset all sat beside Done, with no Undo.
//
// On the Keyboard page "Reset all" was a button of the same style right
// next to Done, and it threw away every custom shortcut at once with no
// way back; a row's Reset and Controllers' "Delete mapping" couldn't be
// taken back either. With the flag on all three go through the app's undo
// (pushEdit): the toast offers Undo, and ⌘Z works after it fades. Reset
// all moves to the foot of the Keyboard page as a quiet "Reset all
// shortcuts", away from Done. Controllers' "Undo changes", which sounded
// like the app's Undo, says "Revert mapping". Hooks in Settings.svelte.
export default {
  id: 'settings-undo',
  n: 37,
  title: 'Resetting shortcuts can be undone',
  group: 'Controls',
  notes: 'Reset all, a row\'s Reset and Delete mapping push an undoable edit (toast with Undo, ⌘Z). Reset all moves from beside Done to the end of the Keyboard page as a ghost button. "Undo changes" becomes "Revert mapping".',
};

/** Show me: Settings > Keyboard with one changed shortcut, flipping; Done ringed with what sits beside it. */
export const show = {
  about: 'On the Keyboard settings page, "Reset all" sat right next to Done and wiped every shortcut you had set, with no way back. Now it lives at the bottom of the page, and it can be undone.',
  before: 'Reset all is the same kind of button as Done, side by side in the header: one slip and every shortcut you set is gone for good.',
  after: 'The header has only Done. "Reset all shortcuts" sits at the end of the list, and if you press it the message at the bottom offers Undo (and ⌘Z works too).',
  async setup(app, ctx) {
    await app.openSettings('Keyboard');
    // One custom shortcut, so Reset all is live.
    const { keymap, saveKeymap } = await import('../../lib/keymap.svelte.js');
    ctx.had = { ...keymap.overrides };
    if (!Object.keys(keymap.overrides).length) {
      keymap.overrides['deck.0.where'] = { code: 'KeyL', label: 'L' };
      saveKeymap();
    }
    ctx.restore = () => {
      keymap.overrides = ctx.had;
      saveKeymap();
    };
    await app.wait(100);
  },
  cleanup(app, ctx) {
    ctx.restore?.();
  },
  target: (app) => [app.$('.settings .bar')],
  badge: (app) => app.$('.settings .bar')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const bar = app.$('.settings .bar')?.getBoundingClientRect();
    if (!bar) return;
    d.text(bar.right - 8, bar.bottom + 20, before ? 'Reset all, right beside Done, and no Undo' : 'only Done up here; Reset all is at the end of the list, undoable', { anchor: 'end', tone: before ? 'bad' : 'ok' });
  },
};
