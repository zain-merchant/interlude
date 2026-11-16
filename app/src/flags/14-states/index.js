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
