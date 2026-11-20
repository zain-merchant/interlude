// #86 (Li11, C59; E10's menu label; E14 via the mixer):
// the library's messages read like a log.
//
// Making a playlist toasted "Made New playlist", which reads as a sentence
// about making something called "New". Names and titles ran straight into
// the message ("Removed Night Shift from Peak time"), and adding a track
// that was already in a playlist offered an Undo for a change that never
// happened. With the flag on, library toasts say what was made and set
// names off in quotes:
//   Created playlist “New playlist”, Renamed “Warmup” to “Opening”,
//   Deleted playlist “Peak time”, Added a track to “Peak time”,
//   Removed “Night Shift” from “Peak time”, Moved “Lucid”,
//   Removed “House” from the library;
// "Already in “Peak time”" is a plain message with no Undo; the playlist
// menu says "Rename playlist" (to match "Delete playlist"). Hooks:
// Library.svelte (q(), the labels). Other files read
// this flag too: App.svelte for "Loaded “Title” on …" (layout builder) and
// Fader/Knob menus for "Reset to 0.0 dB", "Reset to centre" (mixer, E14).
export default {
  id: 'copy-toasts',
  n: 86,
  title: 'Library messages say what happened, in plain words',
  group: 'Polish',
  notes: 'Toasts: "Created playlist “New playlist”", names in quotes, no Undo on "Already in"; "Rename playlist" in the playlist menu. App.svelte and Fader/Knob hook the same id.',
};

/** Show me: makes a playlist; flipping shows "Made New playlist" (before) and "Created playlist “New playlist”" (after). */
export const show = {
  about: 'Making a playlist said "Made New playlist", which reads oddly, and names ran into the sentence. Now it says "Created playlist “New playlist”", with names in quotes, and nothing offers Undo when nothing changed.',
  before: 'The message reads "Made New playlist": is "New" a playlist? Track and playlist names run straight into the words around them.',
  after: 'It reads "Created playlist “New playlist”". Names stand out in quotes, and "Already in" no longer offers an Undo for a change that didn\'t happen.',
  async setup(app, ctx) {
    await show.each(app, ctx);
  },
  // Each flip makes a playlist (the toast is the thing being read), then undoes it.
  async each(app, ctx) {
    if (ctx.made) await show.undo(app);
    const add = app.$$("[data-region='sidebar'] .add").find((b) => /New playlist/.test(b.textContent));
    await app.click(add);
    await app.wait(150);
    const input = app.$("[data-region='sidebar'] input");
    if (input) await app.key('Escape', { target: input });
    ctx.made = true;
    await app.until(() => app.$('.toast'), 2000, 'the toast');
  },
  /** Takes the made playlist back: the toast's Undo, or the shortcut once the toast has gone. */
  async undo(app) {
    const u = app.$('.toast .undo');
    if (u) await app.click(u);
    else await app.key('KeyZ', { meta: true });
    await app.wait(150);
  },
  async cleanup(app, ctx) {
    if (ctx.made) await show.undo(app);
  },
  target: '.toast',
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const t = app.$('.toast');
    const r = t && (app.textRect(t.querySelector('span') ?? t) ?? t.getBoundingClientRect());
    if (r) d.text(r.x, r.y - 16, before ? '"Made New playlist"?' : 'says what was made, the name in quotes', { tone: before ? 'bad' : 'ok' });
  },
};
