// #29 (critique E6, E7, E11's Import line; backlog e-K32, e-K54, e-K55,
// e-K56, e-K57, e-K58): Import's links look like links, and its details
// read cleanly.
//
// "Use a different file…" and "Choose a different _Serato_ folder…" were
// --fg-3 like the static notes round them, with no underline, so they read
// as captions; the second showed the folder's raw underscores, and the two
// used different verbs. Now both say "Choose a different file…" / "…folder…",
// at --fg-2 with a quiet underline, lined up with the file name.
// Details: "rekordbox" in its own spelling, "versions 5, 6 and 7", "3 hours
// ago" for "3 h ago", the path and its age on two lines (the age read 4.41:1
// on the raised row; both lines are --fg-2 now), idle step dashes at --fg-4
// (from 1.34:1) with "1 of 4" beside them. From the backlog: each source is
// a heading and its rows, not an outlined card round a filled row round a
// chip; the found file is regular weight under its bold source; the Serato
// row is named "Serato folder" like "rekordbox.xml", its place on the line
// below; the lead keeps to about 60 characters a line; the close × meets the
// content edge; the step row sits level with the side padding.
// Hooks: Import.svelte.
export default {
  id: 'import-links',
  n: 29,
  title: "Import's links look like links",
  group: 'Polish',
  notes:
    'Links at --fg-2 with an underline, one verb, aligned with the file name. rekordbox spelling, versions in words, "hours ago", path and age on two lines at --fg-2, step dashes at --fg-4 with "1 of 4". Sources without the outlined card.',
};

/** Show me: the Import dialog's first step, flipping; the "different file" link and the found row in a loupe. */
export const show = {
  about: 'In the Import dialog, "Use a different file…" looked like a grey caption, not something you can click, and the rows were boxes inside boxes. Now the links are underlined, the wording is consistent, and the page is calmer.',
  before: '"Use a different file…" is the same faint grey as the notes, with no underline, so you would not guess it is a link. Each library sits in a box, in a box, in a box.',
  after: 'The links are brighter and underlined, say "Choose a different file…" or "…folder…", and line up with the file name. Sources are set apart by a heading and space instead of another outline.',
  async setup(app, ctx) {
    await app.openImport();
    await app.until(() => app.$(".card[aria-labelledby='import-title'] .found, .card[aria-labelledby='import-title'] .how"), 3000, 'the sources');
    ctx.card = () => app.$(".card[aria-labelledby='import-title']");
  },
  async each(app) {
    if (!app.$(".card[aria-labelledby='import-title']")) await app.openImport();
  },
  target: (app, ctx) => [ctx.card?.()?.querySelector('.source')],
  aid(d, app, ctx) {
    const link = ctx.card?.()?.querySelector('.link')?.getBoundingClientRect();
    if (!link) return;
    const before = ctx.phase === 'before';
    const l = d.loupe('link', { x: link.x - 24, y: link.y - 64 }, { zoom: 2, size: { w: 420, h: 200 }, near: ctx.card().getBoundingClientRect(), caption: '' });
    d.text(l.at.x + l.rect.width / 2, l.at.y + l.rect.height + 14, before ? 'a link that looks like a caption' : 'an underlined link, lined up with the file', { anchor: 'middle', tone: before ? 'bad' : 'ok' });
  },
};
