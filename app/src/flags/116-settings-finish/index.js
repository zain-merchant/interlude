// #116 (UI audit flag; an opt-in proposal on 110): Settings, finished.
//
// Most of the polish already reached Settings (#02, #15, #31 to #37 and
// 110's keys, menus, checkboxes, selection and focus). This is the rest:
//   corners   the inset page is 24 and stands 12 in, so the window is 36;
//             a key stands 16 in, so it's 8
//   search    over the pages: any setting, shortcut or controller mapping
//   keys      a shortcut is separate caps; the caps are the key
//   grid      help text under its label, one column width, etched rules
//   words     stems are made ready, not split
export default {
  id: 'settings-finish',
  n: 116,
  title: 'Settings: search, separate keys, corners that nest',
  group: 'Shell',
  byDefault: false,
  notes:
    'style.css; Keys.svelte draws a shortcut as caps; find.js is the index and the matching; Search.svelte the field and Results.svelte its list. Hooks: Settings.svelte (the field, the results, the keys, the stems wording, Cmd+F and Esc). A controller’s own mapping file isn’t known to the screen, so only the actions MIDI learn offers and the ones you taught it can be found.',
};

/** Show me: Settings, Keyboard. */
export const show = {
  about: 'Settings gets a search for any setting, shortcut or mapping, shortcuts drawn as separate keys, and corners that nest.',
  before: 'No way to search. Each shortcut is one wide key, and the page’s corner is rounder than the window’s round it.',
  after: 'Search is at the top of the list (Cmd+F). Each key is its own, and every corner follows the one outside it.',
  async setup(app) {
    await app.openSettings('Keyboard');
  },
  target: '.settings',
};
