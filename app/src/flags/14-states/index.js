// #14: one system for hover, pressed, selected, focus and disabled.
//
// What the audit found (resting looks are #9's; this only does states):
// - Hover is a 5% fill (--hover) almost everywhere, but the toast's Undo
//   and the settings key caps only brighten their outline, the sampler's
//   close button uses --raise, and context menu items use --raise too.
//   On the deck tabs and the library's sort headers hover gives the same
//   text colour as the selected tab or sort, so the two read alike.
// - Pressed: .btn and the deck's mode-row controls shrink a little; the
//   mixer's headphone and Rec buttons, Undo, key caps, the pitch and nudge
//   controls, the zoom buttons, sidebar and settings items and the tabs
//   give no feedback at all. A held hot cue looks merely hovered.
// - Selected is a fill (--sel) in the sidebar, settings and Sampler, but
//   key lock and slip on are an outline with no fill.
// - Focus is a 2px ring 2px out on almost everything, but the track list
//   gets a 1px faint ring and the search field a 1px ring around its well.
//   (The library's resize handle lights its grip instead, which is left
//   as is: a ring around a 12px-tall strip reads worse.)
// - Disabled is 40% opacity, except 35% on Play and in settings, and the
//   nudge buttons under the pitch fader don't dim at all on an empty deck.
//
// The system: hover = 5% fill and full text; pressed = 97% scale and a
// slightly darker face for buttons, the 8% selected fill for list items
// and tabs; selected = 8% fill and full text (tabs keep their underline;
// hovering a tab previews it as a faint one); focus = the 2px ring;
// disabled = 40%, no hover.
export default {
  id: 'states',
  n: 14,
  title: 'States: hover, pressed, selected, focus, disabled',
  group: 'Controls',
  notes:
    'One rule per state across every control: hover fills, pressed shrinks and darkens, selected fills, focus is the 2px ring (now also on the track list and search), disabled is always 40%.',
};

/** Show me: a few controls step in and out of hover, pressed and focus; deck B's nudge shows disabled. */
export const show = {
  note: 'The tagged controls switch between rest and hover, pressed or focus every 1.2s; deck B\'s empty nudge shows disabled.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    ctx.unforce = app.forceStates();
    const D = "[data-region='deck0']";
    ctx.items = () => [
      ['hover', app.$$(`${D} .modes button`).find((b) => b.textContent.trim().startsWith('Loop'))],
      ['hover', app.$("button.sort[aria-label^='Sort by artist']")],
      ['active', app.$(`${D} .btn.sync`)],
      ['active', app.$$("[data-region='sidebar'] .item")[1]],
      ['focus', app.$("input[aria-label='Search the library']")],
    ];
    ctx.t0 = performance.now();
  },
  cleanup(app, ctx) {
    ctx.unforce?.();
  },
  target: (app) => [app.$$("[data-region='deck0'] .modes button")[1], app.$("[data-region='deck0'] .btn.sync"), app.$("input[aria-label='Search the library']"), app.$("[data-region='deck1'] .pitch .nudge")],
  aid(d, app, ctx) {
    const on = Math.floor((performance.now() - ctx.t0) / 1200) % 2 === 1;
    const word = { hover: 'hover', active: 'pressed', focus: 'focus' };
    for (const [state, el] of ctx.items()) {
      if (!el) continue;
      el.toggleAttribute(`data-show-${state}`, on);
      const r = el.getBoundingClientRect();
      // The state's name, filled while it's applied.
      d.text(r.x + r.width / 2, r.y - 13, on ? word[state] : 'rest', { anchor: 'middle', fill: on, fixed: true });
    }
    const nudge = app.$("[data-region='deck1'] .pitch .nudge")?.getBoundingClientRect();
    if (nudge) d.text(nudge.x + nudge.width / 2, nudge.bottom + 13, 'disabled', { anchor: 'middle' });
  },
};
