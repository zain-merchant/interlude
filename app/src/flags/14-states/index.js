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
//
// Later (critique panel, F1-F3, E5, E10, Li4, Li6):
// - Pressed darkened the whole button with brightness(0.85), label too, and
//   holding Cue made it look switched off. Now a press fills the face
//   (--sel) and never dims the label; a held Cue lights its amber at 12%,
//   like a cueing Play (#6); Play itself still darkens a touch.
// - Track rows fill when pressed. A hovered tab shows its label at full
//   strength over a faint --fg-4 underline; column headings go to --fg on
//   hover and fill when pressed.
// - Rings are round everywhere (tabs, headings and faders had square ones),
//   the crossfader's goes round the fader and its scale together, an
//   upright fader's round the cap's whole travel, a knob's outside its tick
//   ring. The track list rings the selected row, not the whole list.
// - The Report box shows one ring, inside it.
// - Context menus (browser build and the site's demo): focus follows the
//   pointer, so only one row is ever lit (the first item was focused on
//   open and the hovered one lit too); Delete items in --kill
//   (ContextMenu.svelte, menu.svelte.js).
// - An empty hot cue's label lifts to --fg-2 on hover.
// Whether rings show at all after a click is #24's.
export default {
  id: 'states',
  n: 14,
  title: 'Every control answers pointing, pressing and focus alike',
  group: 'Controls',
  notes:
    'One rule per state across every control: hover fills, pressed shrinks and fills (never dims the label; Cue lights amber), selected fills, focus is a round 2px ring (on the selected track, round the crossfader with its scale, outside knob ticks), disabled is always 40%. Context menus light one row.',
};

/** Show me: five controls held in a state (pointed at, pressed, keyboard focus, can't be used); flipping shows how each looked before and after. */
export const show = {
  about: 'Controls answered hovering, pressing and keyboard focus in different ways, and some not at all: holding Cue barely changed, and menus lit two rows at once. Now every control answers the same way, so you always know what you\'re touching.',
  before: 'Held in a state: the tab you point at looks already selected, a sidebar item shows nothing when pressed, holding Cue barely changes it, keyboard focus on the search is a faint line, and a button that can\'t be used looks usable.',
  after: 'Pointing shows a faint underline, pressing fills it, a held Cue lights amber, keyboard focus is a clear ring, and a control you can\'t use is dimmed.',
  async setup(app, ctx) {
    if (!app.loaded(0)) await app.loadTrack(0);
    await app.tab(0, 'Cues');
    ctx.unforce = app.forceStates();
    const D = "[data-region='deck0']";
    const nudge = app.$$("[data-region^='deck'] .pitch .nudge").find((n) => n.querySelector("button[aria-disabled='true']"));
    ctx.items = () => [
      { state: 'hover', el: app.$$(`${D} .modes button`).find((b) => b.textContent.trim().startsWith('Loop')), what: 'pointing at it', was: 'looks already selected', now: 'a faint underline' },
      { state: 'active', el: app.$$("[data-region='sidebar'] .item")[1], what: 'pressing it', was: 'no response', now: 'fills', side: true },
      { state: 'focus', el: app.$("input[aria-label='Search the library']"), what: 'keyboard focus', was: 'a faint line', now: 'a clear ring' },
      { state: 'active', el: app.$(`${D} .transport .btn.cue`), what: 'holding Cue', was: 'barely changes', now: 'lights amber', below: true },
      { state: null, el: nudge, what: "can't be used", was: 'looks usable', now: 'dimmed', zoom: 3, key: 'nudge' },
    ];
    for (const it of ctx.items()) if (it.state && it.el) it.el.setAttribute(`data-show-${it.state}`, '');
  },
  cleanup(app, ctx) {
    ctx.unforce?.();
  },
  target: (app, ctx) => (ctx.items ? ctx.items().map((i) => i.el).filter(Boolean) : []),
  badge: () => new DOMRect(16, 16, 10, 10),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    for (const it of ctx.items()) {
      if (!it.el) continue;
      if (it.state && !it.el.hasAttribute(`data-show-${it.state}`)) it.el.setAttribute(`data-show-${it.state}`, '');
      const r = it.el.getBoundingClientRect();
      const label = `${it.what}: ${before ? it.was : it.now}`;
      const tone = before ? 'bad' : 'ok';
      // Small controls get a magnified copy beside them, the label under it.
      if (it.zoom) {
        const z = it.zoom;
        const src = { x: r.x - 8, y: r.y - 8 };
        const l = d.loupe(it.key, src, { zoom: z, size: { w: (r.width + 16) * z, h: (r.height + 16) * z }, near: r, caption: '' });
        d.text(l.at.x + l.rect.width / 2, l.at.y + l.rect.height + 14, label, { anchor: 'middle', tone });
        continue;
      }
      if (it.side) d.text(r.right + 8, r.y + r.height / 2, label, { tone, fixed: true });
      else if (it.below) d.text(r.x + r.width / 2, r.bottom + 14, label, { anchor: 'middle', tone });
      else d.text(r.x + r.width / 2, r.y - 14, label, { anchor: 'middle', tone });
    }
  },
};
