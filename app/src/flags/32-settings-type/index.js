// #32 (critique panel S3, S6, S8, S13; C40): Settings' type and rhythm.
//
// - Section headings ("Output", "Hot cues", "Deck A") were 11px regular at
//   --fg-3: smaller than, and the same grey as, the 13px text under them,
//   and the page title was body size. Headings are now 13/500 at --fg and
//   the title 16/500; help text sits on a 20px line.
// - The gap before a section depended on what ended the last one (12, 20
//   or 24px); every section is now 24px from the last, 8px from heading to
//   control.
// - Scrolled content slid under the header rule and was sliced mid-row; it
//   fades out over 12px at the top and foot.
// - "Check for updates" and "Report a problem…" looked like page links;
//   they're 11px --fg-3 actions under a rule.
// - Keyboard page: caps are 52px (⇧⌘Z broke the 44px column), an
//   unassigned key is a dashed slot that says "Set" (the dash looked like
//   the minus key; hook in Settings.svelte), a slashed zero tells 0 from O,
//   the deck headings stay in view while their lists scroll, the columns
//   stop at 1080px, and runs of related shortcuts get 8px of air.
// - Backlog: inline code at 0.92em (c-K44); text-only rows on the baseline
//   (c-K51); whole-pixel line height (c-K47); column width (c-K66); slashed
//   zero (c-K80); groups (c-K81).
// Also holds the page list's inside ring for #24 focus-after-keys (S2).
export default {
  id: 'settings-type',
  n: 32,
  title: 'Settings headings lead the page',
  group: 'Type and colour',
  notes: 'Settings: h2 16/500, h3 13/500 --fg, p line-height 20px, sections 24px apart, scroll fades 12px top and bottom, quiet footer actions, keyboard caps 52px with a dashed "Set" slot when unassigned, sticky deck headings, 1080px columns.',
};

/** Show me: Settings > Audio and Keyboard, flipping; a loupe on the Output heading and its text. */
export const show = {
  about: 'In Settings the section headings were smaller and greyer than the text under them, the gaps between sections changed from page to page, and on the Keyboard page the deck names scrolled away. Now headings lead, sections are evenly spaced, and the deck names stay put.',
  before: '"Output" is a small grey word above a bigger grey paragraph, so your eye lands on the paragraph first; the page title is no bigger than the menu beside it.',
  after: 'Each heading is white and the same size as the text, a little bolder, with an even gap above every section, so you can scan a page by its headings. The title is a step bigger.',
  async setup(app) {
    await app.openSettings('Audio');
    await app.until(() => app.$('.settings .display h3'), 2000, 'the Output heading');
  },
  target: (app) => [app.$('.settings .display')],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const bar = app.$('.settings .bar h2')?.getBoundingClientRect();
    const sec = app.$('.settings .display')?.getBoundingClientRect();
    if (!bar || !sec) return;
    // Over the decks, left of the card, clear of Settings.
    const top = app.$('.settings')?.getBoundingClientRect().top ?? 500;
    const src = { x: bar.x - 12, y: bar.y - 12 };
    const vw = 300;
    const vh = Math.min(sec.bottom, bar.y + 170) - src.y;
    const zoom = Math.min(2, 470 / vw, (top - 72) / vh);
    const size = { w: Math.round(vw * zoom), h: Math.round(vh * zoom) };
    const l = d.loupe('type', src, { zoom, size, at: { x: 16, y: Math.max(16, top - size.h - 56) }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x + 10, l.rect.bottom + 16, `Settings > Audio, ${zoom.toFixed(1)}× bigger`, { fixed: true });
    d.text(l.rect.x + 10, l.rect.bottom + 40, before ? 'the heading is smaller and greyer than its text' : 'the heading leads, the text follows', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
