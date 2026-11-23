// #113 (UI audit flag; on 110): the zero states, drawn.
//
// Every empty place says what's empty and the way out, with one drawing
// style: raised or cut, one light, two deck tints at most, ink for what isn't
// there yet.
//   library   no tracks, a playlist, a folder, a search, Fits, a filter, an
//             error (no drawing)
//   decks     the bare platter, and the keys that load it
//   stems     a record in four rings: to download, coming down, off, failed
//   setup     no controller
// An empty filter's picture is true: this list's own tempos (or keys), the
// filter's own range on the same scale, and which half of it each track has
// (tempos.js).
export default {
  id: 'zero-states',
  n: 113,
  title: 'Zero states, drawn',
  group: 'Shell',
  byDefault: true, // approved, on for judging with 110; does nothing without it
  settings: {
    cable: {
      type: 'choice',
      label: 'The controller’s cable',
      default: '2',
      recommended: '2c',
      options: [
        ['2', 'Hanging beside the plug', 'A round loop next to the plug, then up to the right.'],
        ['2a', 'Larger', 'A bigger round loop, wider of the plug.'],
        ['2b', 'Small and tight', 'A small loop, and a longer way out to the right.'],
        ['2c', 'Lazy oval', 'Wider than it’s tall, as slack lies.'],
        ['2d', 'Resting on the controller', 'The loop comes down to the controller’s top edge, and the cable leaves almost straight up.'],
        ['2e', 'To the left, straight up', 'The other way round, and straight up past the title.'],
        ['2f', 'Behind itself, leaning out', 'It crosses behind, and leaves at a slant.'],
      ],
    },
  },
  notes:
    'drawings.js is the SVG, wires.js the cable’s shapes, tempos.js the filter’s picture (tested beside it), Zero.svelte the layout. Hooks: Library.svelte (the empty branches), Deck.svelte (the keys), Platter.svelte (the bare platter), Stems.svelte, ControllerSetup.svelte.',
};

/** Show me: a search that finds nothing. */
export const show = {
  about: 'Empty places get a drawing, what’s empty in a few words, and the way out. An empty filter shows your real tempos and where its range is.',
  before: 'A line of grey text in the middle of nothing.',
  after: 'A drawing, a heading and a button that gets you out.',
  target: '.zs',
};
