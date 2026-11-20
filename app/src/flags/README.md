# UI audit flags

Each change being tried in the UI audit is a flag: off by default, and off
is exactly the app as it was. In a dev build (`npm run dev`) a
[DialKit](https://github.com/joshpuckett/dialkit) panel at the bottom right
(press <kbd>`</kbd> to open and close it) turns flags on and tunes them: a
folder per group, and in it a folder per flag with its **Flag** switch, its
**Show me** and its settings. A dot marks the flags that are on; a flag's
notes are the tooltip of its folder. Picks are remembered in the browser
(`registry.svelte.js` keeps them; the panel mirrors them both ways).
`FlagDials.svelte` is the panel, loaded only by dev builds.

Each flag becomes its own issue and pull request. To ship one: keep its
folder's styles and its hooks, then remove its gate (the
`:root[data-flag-<id>]` prefix and the `flag('<id>')` checks).

## A flag

A folder `NN-name/`, where NN is the audit item's number:

- `index.js`: `export default { id, n, title, group, notes, settings }`.
  `id` is short kebab-case; `n` is the item number; `group` is the panel's
  folder (Shape, Layout, Stability, Controls, Type and colour, Polish).
- `style.css`: every rule starts with `:root[data-flag-<id>]`, so nothing
  applies while the flag is off.
- Optional hooks in components, only where CSS can't do it:
  `import { flag, setting } from '../flags/registry.svelte.js'`, then
  `flag('<id>')` / `setting('<id>', '<key>')`. Mark each hook with a
  `// #NN (UI audit flag): …` comment. With the flag off, the hook must
  leave behaviour and markup exactly as before.

Settings, shown in the flag's folder:

- `{ type: 'range', min, max, step, default, unit, label }` becomes the CSS
  variable `--flag-<id>-<key>` (with its unit), and a DialKit slider.
- `{ type: 'choice', options: [[value, label], ...], default, label }`
  becomes the attribute `:root[data-flag-<id>-<key>="<value>"]` while the
  flag is on, and a DialKit select. Use it for variants to compare (button styles, border
  treatments).

`16-library-end/` is a complete example: a style, a range setting and one
gated hook.

## Show me

Each flag's folder has a **Show me** button. It turns the flag on, sets the
app up so the change is on screen (loads a track, opens a tab or a dialog,
unplugs the simulated audio device…), rings where to look for a few seconds,
and draws a visual aid over the app until **Done**. A card says in a
sentence what to look at, with the flag's own switch to compare off and on;
**Guides** hides the aid, **Replay** plays an entrance again, **Again**
reruns the setup. While it runs, the panel folds down to that flag's folder
and moves off the targets.

A flag describes this in an optional `show` export in its `index.js`:

```js
export const show = {
  note: 'One plain sentence: what to look at.',
  needs: { 'stress-data': { set: 'worst' } }, // other flags it needs (stress-data reloads the page)
  reload: false,          // true if turning this flag on needs a reload (stress-data itself)
  async setup(app, ctx) { // put the app in the state where the change shows
    const low = app.$$('.mixer .ch')[0].querySelectorAll('.knob')[3].querySelector('button.label');
    await app.click(low);
    // Once the change is on screen: where things are with the flag on and off.
    ctx.parts = () => [app.$('.mixer .cen')];
    ctx.b = app.both('no-shift', ctx.parts());
  },
  target: '.mixer .knob', // or (app, ctx) => element(s) or rects: what to ring
  aid(d, app, ctx) {      // called ten times a second while the show is up
    // Dashed: where it is with the flag the other way (only if it differs).
    const other = app.other('no-shift', ctx.b);
    d.ghost(other[0], ctx.parts()[0].getBoundingClientRect(), { label: 'off: master' });
  },
  async replay(app, ctx) {}, // optional: adds a Replay button
  cleanup(app, ctx) {},      // optional: undo setup that would surprise (zoom, a lost device)
};
```

`app` (show/app.js) drives the app through its own controls: `$`, `$$`,
`click`, `dblclick`, `hover`, `key('KeyR', { shift })`, `type`, `search`,
`selectRow(n | 'last' | 'text')`, `loadTrack(deck, row)`, `play`, `pause`, `seek(deck, 0.9)`,
`tab(deck, 'Loop')`, `openSettings`, `openImport`, `openReport`, `zoom`,
`forceStates` (puts controls in :hover / :active / :focus-visible through
data-show-* attributes), `snap`, `textRect`, `both(id, els)` and
`other(id, both)` (rects with the flag on and off, measured without
painting, and the pair for the flag the other way from now), `without(id,
fn)`, `rectsWithout(id, els)`, `setFlag`, `mock` (`__mockAudio`). Measure
with the flag flipped once, in `setup`, not in `aid`.

`d` (show/overlay.js) draws in window pixels, in one visual language:
**ink** (magenta) for what to look at (the ring as a show starts, `box`,
`hguide` / `vguide`, `measure` with its value in a filled tag, `grid`,
`padding`); **ghost** (dashed white) for the flag the other way
(`ghost(other, live, { label })` draws only what differs and says by how
much); **tags** (`text(x, y, s, { anchor, tone: 'ok' | 'bad' })`) that place
themselves clear of each other and of small targets, with a leader if they
had to move; **loupes** (`loupe(key, src, { zoom, size, near })`) placed
beside what they magnify, returning a `map` to draw over them with `clip`
and `path`. Keep to the fewest marks that make the point. The panel and
the card keep off the targets and the marks.

Everything is drawn in one fixed layer (`.flag-show`) outside the app, and
`show` exports are only read by the dev-only panel, so production builds
don't contain them and every flag off is still the app as it was.

## Rules

- Off means unchanged. Check the app with every flag off against `main`.
- Keep class names, `aria-label`s and `data-region`s as they are: other code
  (the website's hero) finds controls by them.
- One flag per audit item, or one per sub-fix for the open-ended items.
- Flags change only their own tokens and rules. Shared values (radii,
  spacing, type, colour, borders) are overridden as CSS custom properties by
  the one flag that owns them.
