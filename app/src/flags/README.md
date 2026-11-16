# UI audit flags

Each change being tried in the UI audit is a flag: off by default, and off
is exactly the app as it was. The toggle bar at the bottom right of a dev
build (`npm run dev`, then press <kbd>`</kbd>) turns flags on and tunes them.
Picks are remembered in the browser.

Each flag becomes its own issue and pull request. To ship one: keep its
folder's styles and its hooks, then remove its gate (the
`:root[data-flag-<id>]` prefix and the `flag('<id>')` checks).

## A flag

A folder `NN-name/`, where NN is the audit item's number:

- `index.js`: `export default { id, n, title, group, notes, settings }`.
  `id` is short kebab-case; `n` is the item number; `group` is the bar's
  heading (Shape, Layout, Stability, Controls, Type and colour, Polish).
- `style.css`: every rule starts with `:root[data-flag-<id>]`, so nothing
  applies while the flag is off.
- Optional hooks in components, only where CSS can't do it:
  `import { flag, setting } from '../flags/registry.svelte.js'`, then
  `flag('<id>')` / `setting('<id>', '<key>')`. Mark each hook with a
  `// #NN (UI audit flag): …` comment. With the flag off, the hook must
  leave behaviour and markup exactly as before.

Settings, shown under the flag's More button:

- `{ type: 'range', min, max, step, default, unit, label }` becomes the CSS
  variable `--flag-<id>-<key>` (with its unit).
- `{ type: 'choice', options: [[value, label], ...], default, label }`
  becomes the attribute `:root[data-flag-<id>-<key>="<value>"]` while the
  flag is on. Use it for variants to compare (button styles, border
  treatments).

`16-library-end/` is a complete example: a style, a range setting and one
gated hook.

## Show me

Each flag's row in the bar has a **Show me** button. It turns the flag on,
sets the app up so the change is on screen (loads a track, opens a tab or a
dialog, unplugs the simulated audio device…), outlines where to look for a
few seconds, and draws a visual aid over the app (guides, a grid, measured
gaps, ghosts of where things were, loupes) until **Done**. The note at the top
of the panel says what changed and what to compare; **Guides** hides the aid,
**Replay** plays an entrance again, **Again** reruns the setup. The panel can
be dragged by its header (double-click the header to put it back) and moves
off the targets while a show runs.

A flag describes this in an optional `show` export in its `index.js`:

```js
export const show = {
  note: 'What changed and what to compare.',
  needs: { 'stress-data': { set: 'worst' } }, // other flags it needs (stress-data reloads the page)
  reload: false,          // true if turning this flag on needs a reload (stress-data itself)
  async setup(app, ctx) { // put the app in the state where the change shows
    await app.loadTrack(0);
    ctx.rest = app.snap([app.$('.mixer .cen')]);
    await app.click(app.$('.mixer .knob button.label'));
  },
  target: '.mixer .knob', // or (app, ctx) => element(s) or rects: what to outline
  aid(d, app, ctx) {      // called ten times a second while the show is up
    d.ghost(ctx.rest[0], app.$('.mixer .cen').getBoundingClientRect(), { label: 'master' });
  },
  async replay(app, ctx) {}, // optional: adds a Replay button
  cleanup(app, ctx) {},      // optional: undo setup that would surprise (zoom, a lost device)
};
```

`app` (show/app.js) drives the app through its own controls: `$`, `$$`,
`click`, `dblclick`, `hover`, `key('KeyR', { shift })`, `type`, `search`,
`selectRow(n | 'last' | 'text')`, `loadTrack(deck, row)`, `play`, `pause`,
`tab(deck, 'Loop')`, `openSettings`, `openImport`, `openReport`, `zoom`,
`forceStates` (puts controls in :hover / :active / :focus-visible through
data-show-* attributes), `snap`, `textRect`, `rectsWithout(id, els)` (rects
with a flag off, measured without painting), `setFlag`, `mock`
(`__mockAudio`). `d` (show/overlay.js) draws in window pixels: `box`,
`line`, `text`, `hguide`, `vguide`, `measure`, `grid`, `circle`, `dot`,
`arrow`, `ghost(rest, live)`, `padding(el)`, `loupe(key, rect)`, `legend`.

Everything is drawn in one fixed layer (`.flag-show`) outside the app, and
`show` exports are only read by the dev-only bar, so production builds don't
contain them and every flag off is still the app as it was.

## Rules

- Off means unchanged. Check the app with every flag off against `main`.
- Keep class names, `aria-label`s and `data-region`s as they are: other code
  (the website's hero) finds controls by them.
- One flag per audit item, or one per sub-fix for the open-ended items.
- Flags change only their own tokens and rules. Shared values (radii,
  spacing, type, colour, borders) are overridden as CSS custom properties by
  the one flag that owns them.
