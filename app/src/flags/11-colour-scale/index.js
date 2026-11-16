// #11 (colours): text levels by role.
//
// Every text colour in the app is already one of the tokens (--fg, --fg-2,
// --fg-3, --fg-4, plus --cue, --kill, --go and --warn for meaning), so
// there's nothing to collapse. What drifted is which level a role gets:
// - The library's "analyzing, 12 to go" is live information but uses
//   --fg-4, the level kept for empty and disabled items, which fails
//   contrast. It goes to --fg-3, like the track count beside it.
// - The nudge ‹ › under the pitch fader are --fg-3 while every other ‹ ›
//   glyph button (beat jump, loop, FX beats) is --fg-2. They match now.
// - Optionally, the deck's inactive mode tabs (--fg-3) can match the other
//   inactive navigation, the library sidebar and Settings (--fg-2).
export default {
  id: 'colour-scale',
  n: 11,
  title: 'Text levels by role',
  group: 'Type and colour',
  notes: 'Analysis note off the disabled level; nudge arrows match the other arrow buttons; optionally deck tabs match the other navigation.',
  settings: {
    tabs: { type: 'choice', options: [['fg-3', 'Tabs as now'], ['fg-2', 'Tabs like nav']], default: 'fg-3', label: 'Inactive deck tabs' },
  },
};
