// #112 (UI audit flag):
// connection status.
//
// What's connected, where the sound goes, and what's being worked on, kept
// in one place that never moves. Today the output only shows in a banner
// when it's lost, controllers only show in Settings, and a stems download
// only shows on its Settings page.
//
// `place` picks where the controller, the output, Settings and what's being
// worked on sit:
//   both      in both, to compare (the owner asked for this for now)
//   library   in the library's toolbar: the items right before Sampler
//   titlebar  at the right of the strip above the waveforms
// Sampler and Settings keep their places in the toolbar, at its right end;
// only the title bar alone takes Settings out of it.
//
// Nothing here needs Rust. controllers() is asked every two seconds while
// the window is showing (the engine itself rescans every two seconds), as
// there's no event for a controller coming or going; audio_stats the same,
// for dropouts. The engine already reports the output every frame.
export default {
  id: 'shell-status',
  n: 112,
  title: 'Controller and output always on show',
  group: 'Shell',
  // Off by default: the controller and output are in Settings (Audio,
  // Controllers), and the banner still says when the output is lost. The
  // library toolbar keeps Sampler and Settings.
  byDefault: false,
  settings: {
    place: {
      type: 'choice',
      label: 'Where',
      default: 'both',
      recommended: 'library',
      options: [
        ['both', 'Both', 'In both places at once, to compare them.'],
        ['library', "Library's toolbar", 'Before Sampler, the same place windowed and full screen.'],
        ['titlebar', 'Title bar', 'At the right of the strip above the waveforms. The Mac can cover it in full screen.'],
      ],
    },
  },
  notes:
    'Status.svelte is the two items (one when the controller is the output) and their popover; Activity.svelte is the stems download by the track count. connections.svelte.js holds what they show. Hooks: Library.svelte (Activity after the count, Status before Settings), App.svelte (Status in the title bar; which windows its links open). The toolbar gives way in this order: the search field to 200px, "analyzing", Sampler\'s label, the two names to 92px, the search field to 160px, analyzing, the names to icons, the count.',
};

/** Show me: the popover open, and the items. */
export const show = {
  about: 'In both places for now, so you can compare them. The controller and the output are always on show beside Settings, with the output picker one click away.',
  before: 'Nothing on the main screen says which controller is connected or where the sound goes.',
  after: 'Both are named in the toolbar. Their menu picks the output and lists the controllers.',
  target: 'section.library .bar .shell',
};
