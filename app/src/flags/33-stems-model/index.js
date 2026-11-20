// #33 (critique panel S4; C9, approved): Stems showed "Split tracks" as on
// while the separation model wasn't installed.
//
// On Settings > Stems the Split tracks box was ticked while "Download
// (84 MB)" was still offered, and nothing said whether the model was there.
// With the flag on the box is unticked and unavailable until the model is
// installed, with "Download the separation model above to turn this on" under it, and once it's
// installed the model section says "Installed, 84 MB" (hooks in
// Settings.svelte). The deck's Stems tab line ("Stems need a one-time
// 84 MB download", with a way to get it) is requested from the decks
// builder (lib/Stems.svelte) under this flag. The sentence above the
// download button no longer repeats the size (c-K84) with #34 on.
export default {
  id: 'stems-model',
  n: 33,
  title: "Stems don't claim to be on before they can be",
  group: 'Controls',
  notes: 'Settings > Stems: Split tracks is off and disabled until the model is ready, with "Download the separation model above to turn this on"; "Installed, 84 MB" once it is. Disabled at the app\'s 40%; the earlier choice comes back once it is installed. Deck Stems tab: the decks builder\'s line.',
};

/** Show me: Settings > Stems with the model not yet downloaded, flipping; the Split tracks box ringed. */
export const show = {
  about: 'Settings showed "Split tracks into stems" ticked while the model that does the splitting was still waiting to be downloaded, so it looked on but did nothing. Now it stays off until the model is installed, and says so.',
  before: 'The box is ticked, so stems look switched on, but the model they need is still offered for download above it: nothing will be split, and nothing tells you why.',
  after: 'Until the model is downloaded the box is off and greyed out, with "Download the separation model above to turn this on" under it. Once it\'s in, the page says "Installed, 84 MB".',
  async setup(app) {
    await app.openSettings('Stems');
    await app.until(() => app.$$('.settings .display h3').find((h) => /Splitting/.test(h.textContent)), 3000, 'the Splitting section');
  },
  target: (app) => [app.$$('.settings .display').find((s) => /Splitting/.test(s.textContent))],
  badge: (app, ctx) => ctx.at,
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const secs = app.$$('.settings .display');
    const model = secs[0]?.getBoundingClientRect();
    const split = secs.find((s) => /Splitting/.test(s.textContent))?.getBoundingClientRect();
    if (!model || !split) return;
    // Over the decks, left of the card, clear of Settings.
    const top = app.$('.settings')?.getBoundingClientRect().top ?? 500;
    const src = { x: model.x - 12, y: model.y - 8 };
    const vw = 380;
    const vh = split.bottom - model.y + 20;
    const zoom = Math.min(2, 470 / vw, (top - 72) / vh);
    const size = { w: Math.round(vw * zoom), h: Math.round(vh * zoom) };
    const l = d.loupe('stems', src, { zoom, size, at: { x: 16, y: Math.max(16, top - size.h - 56) }, caption: '' });
    ctx.at = l.rect;
    d.text(l.rect.x + 10, l.rect.bottom + 16, 'Settings > Stems, model not downloaded yet', { fixed: true });
    d.text(l.rect.x + 10, l.rect.bottom + 40, before ? 'ticked, but nothing can be split yet' : 'off until the model is in, and it says why', { tone: before ? 'bad' : 'ok', fixed: true });
  },
};
