// #83 (Li7): the Settings button looked like a filter.
//
// The icon at the right end of the library bar was two sliders, right after
// the search field and the track count, so it read as "filter these
// results". With the flag on it's a gear (Lucide's "settings", the icon set
// the app already ships), at the same 14px with the same 1.3px line. The
// tooltip stays "Settings". Hook: Library.svelte (the .gear button's svg).
export default {
  id: 'settings-icon',
  n: 83,
  title: 'Settings button shows a gear',
  group: 'Polish',
  notes: 'The library bar\'s Settings button draws Lucide\'s gear (24-unit path, stroke 2.23 = 1.3px at 14px) instead of two sliders.',
};

/** Show me: a loupe on the button, flipping sliders and gear. */
export const show = {
  about: 'The Settings button at the end of the library bar showed two sliders, which looks like a filter for your search. Now it shows a gear.',
  before: 'Next to the search field, two little sliders: it looks like a way to filter the track list, not the way into Settings.',
  after: 'A gear, the sign everyone knows for settings, at the same size and line weight as the other icons.',
  target: 'section.library .gear',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const b = app.$('section.library .gear')?.getBoundingClientRect();
    if (!b) return;
    const zoom = 5;
    const size = { w: (b.width + 16) * zoom, h: (b.height + 16) * zoom };
    const l = d.loupe('gear', { x: b.x - 8, y: b.y - 8 }, { zoom, size, at: { x: b.right - size.w - 40, y: b.top - size.h - 60 }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x, l.rect.bottom + 16, before ? 'sliders: reads as "filter"' : 'a gear: reads as "settings"', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
