// #13: the toast wrapped and sat on the rows being browsed.
//
// Toasts ("Loaded … on deck B" with Undo, errors, "Recording saved") are
// pinned at left: 50% with a centring transform, which gives them only half
// the window before they wrap: a long title made a two- or three-line block
// at the smallest window. And they sit at the bottom centre, over the
// library's titles, right where the DJ is picking the next track, for
// several seconds after every load. The toast now keeps to one line where
// the window allows, and can sit in the bottom-right corner, over the
// library's least-read columns (Time, Folder).
export default {
  id: 'declutter-toast',
  n: 13,
  title: 'Toasts stay on one line and off the titles',
  group: 'Stability',
  notes: 'Toasts size to their text (one line up to the window width) and, by default, sit bottom right instead of over the library\'s titles.',
  settings: {
    place: {
      type: 'choice',
      label: 'Place',
      options: [
        ['corner', 'Bottom right'],
        ['centre', 'Bottom centre'],
      ],
      default: 'corner',
    },
  },
};
