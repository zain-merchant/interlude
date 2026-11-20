// #23 (critique panel E1, E2; C31): "Audio device disconnected" looked like
// an update notice.
//
// The worst thing that can happen mid-set used the same grey bar as the
// update banner, the toast and the tooltips, with a white icon (--warn
// existed in app.css but nothing used it), and its only way out, "Play
// through MacBook Pro Speakers", was the quietest thing in the bar: a
// tonal fill at 1.19:1 with a grey label, so it read as disabled.
//
// With the flag on, the lost-device banner (.banner.lost) gets an amber
// (--warn) triangle on a neutral --line-2 edge (an amber ring echoed Cue's),
// one line with the icon, text and button on one centre line, the device
// name at weight 500,
// and shorter copy ("Decks are held. Waiting for it to come back…"). Its
// button is the solid primary (ink on --fg, 24px, weight 500), the one
// main action the dialogs use too (#27, owner's call 3 (a): a solid button
// only inside dialogs and alert banners), 32px like Report's Save. #7
// edge-banner places it at the foot of the window over the library. The
// update and library banners stay neutral. Hooks: App.svelte (class, copy,
// button class).
//
// Amber also means "headphone cue on" in the mixer: --warn is yellow
// #f2c94c and the cue is amber #e8b04a, so they're close but the banner
// sits over the waveforms, away from the mixer's buttons.
export default {
  id: 'banner-warning',
  n: 23,
  title: 'A lost audio device looks like a warning',
  group: 'Polish',
  notes: 'Lost-device banner: amber icon on a neutral edge, one line, device name at 500, shorter copy, and a solid 32px "Play through …" button. Other banners unchanged.',
};

/** Show me: unplugs the simulated audio device; a loupe on the banner flips between the grey notice and the amber warning. */
export const show = {
  about: "When your audio device dropped out mid-set, the banner looked like an update notice, and its one way out, \"Play through MacBook Pro Speakers\", looked switched off. Now it's an amber warning with a clear button.",
  before: 'The device-lost banner is the same grey as an update notice, with a white icon, and the button to keep playing through the laptop is so faint it looks disabled.',
  after: 'The banner carries an amber warning sign and sits on one line at the foot of the window, off the decks, and "Play through …" is a solid button: the obvious thing to press.',
  needs: { 'edge-banner': true }, // the banner floats over the waveforms, as designed
  async setup(app) {
    app.mock.lose();
    await app.until(() => app.$('.banner'), 3000, 'the banner');
    await app.wait(100);
  },
  cleanup(app) {
    app.mock?.restore();
  },
  target: '.banner',
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const b = app.$('.banner')?.getBoundingClientRect();
    if (!b) return;
    const zoom = 1.5;
    const size = { w: Math.min(innerWidth - 32, (b.width + 24) * zoom), h: (b.height + 20) * zoom };
    const l = d.loupe('banner', { x: b.x - 12, y: b.y - 10 }, { zoom, size, at: { x: Math.max(16, b.x + b.width / 2 - size.w / 2), y: Math.max(16, b.y - size.h - 48) } });
    ctx.at = new DOMRect(l.rect.x, l.rect.y + 8, 10, 10);
    const before = ctx.phase === 'before';
    d.text(l.rect.x + 10, l.rect.bottom + 14, before ? 'grey like an update notice; the button looks switched off' : 'a warning sign, one line; the way out is the one solid button', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
