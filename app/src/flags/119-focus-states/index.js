// #119 (UI audit flag; on direction #110): a quiet line for keyboard focus.
//
// 110's focus line was near white on everything, and fields had a grey one.
// Here it is one thin grey line at 3:1, 2px out and concentric with the
// control's corner (inside where there's no room), and a text field has none:
// the caret, and its words and icon a step brighter.
// Off, or with any other direction on, focus is as it was.
//
// WCAG 2.2 AA: 2.4.7 (visible), 1.4.11 (3:1 against what it lies on; a caret
// counts for a text field). The thin line is smaller than 2.4.13 (AAA) asks;
// Increase Contrast makes it white and 2px.
export default {
  id: 'focus-states',
  n: 119,
  title: 'A quiet line for keyboard focus',
  group: 'Controls',
  settings: {
    tint: {
      type: 'choice',
      label: 'The line on a deck',
      default: 'deck',
      options: [
        ['deck', "A breath of the deck's tint", 'Cool on the left deck and warm on the right, at the same contrast.'],
        ['neutral', 'Grey everywhere', 'One soft grey on both decks, the mixer and the library.'],
      ],
    },
  },
  notes:
    "style.css draws it, on #110 only (110's --focus-ring, --focus-field and --focus-w are unpainted on body and put back in the audit's panel). Real outlines, so corners follow the control and forced colours keep them; Grid's small keys carry it on their ::after. #24 still decides when (html[data-input]). keys.js, whatever the direction: Tab reaches every control whether or not macOS's Keyboard navigation is on, without a click focusing anything new; the sidebar, a deck's hot cues and the headings are one stop each, with the arrows inside; Undo comes where it's drawn; Esc, and what goes away, leave focus somewhere. Hooks: App.svelte (startKeys, the waveforms' handle after the waveforms, the toast stays while Undo has focus), menu.svelte.js, ContextMenu.svelte and Library.svelte (a menu opened by key starts on its first or ticked row; Shift+F10 on the track list is its selected row's), Deck.svelte (the tempo being typed), 110's columns.js (its handles aren't rebuilt while the columns are the same).",
};

/** Show me: a key on the deck, focused, flipping between 110's line and this one. */
export const show = {
  about: 'Keyboard focus was a near-white outline on everything, the loudest shape on the screen. Now it is one thin grey line.',
  before: 'A white line round whatever you reach with Tab. Search gets a ring as well as its caret.',
  after: 'A soft grey line just outside the control, bright enough to find and no more. A text field has only its caret.',
  period: 1900,
  async setup(app, ctx) {
    app.setFlag('dir-room-tint', true); // a fix's show pauses the direction, and this one is for #110
    if (!app.loaded(0)) await app.loadTrack(0);
    ctx.key = app.$("[data-region='deck0'] .transport .sync");
    await show.each(app, ctx);
  },
  async each(app, ctx) {
    document.documentElement.dataset.input = 'keys';
    ctx.key?.focus({ preventScroll: true });
  },
  cleanup(app, ctx) {
    app.setFlag('dir-room-tint', false);
    ctx.key?.blur();
    delete document.documentElement.dataset.input;
  },
  target: (app, ctx) => [ctx.key],
  aid(d, app, ctx) {
    const r = ctx.key?.getBoundingClientRect();
    if (!r) return;
    document.documentElement.dataset.input = 'keys';
    if (document.activeElement !== ctx.key) ctx.key.focus({ preventScroll: true });
    d.loupe('key', { x: r.x - 10, y: r.y - 10 }, { zoom: 2, size: { w: (r.width + 20) * 2, h: (r.height + 20) * 2 }, near: r, caption: ctx.phase === 'before' ? 'a white outline' : 'a thin grey line' });
  },
};
