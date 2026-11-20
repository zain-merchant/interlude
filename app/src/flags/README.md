# UI audit flags

Each change being tried in the UI audit is a flag: off by default, and off
is exactly the app as it was. In a dev build (`npm run dev`) the audit's
panel (`panel/FlagPanel.svelte`, loaded only by dev builds) turns flags on
and tunes them. It has a row per flag, grouped by area: its number, its
title, a line on what it fixes, a **Show me** and an on/off switch. A
flag's settings open under its row while it's on (or with the sliders
button beside Show me). There's a search field, All on / All off and a
count of what's on.

<kbd>`</kbd> folds the panel down to a pill and opens it again. Drag it by
its header (or drag the pill) and it docks to the nearest corner or edge
of the window; with the header (or the pill) focused, the arrow keys move
it from dock to dock. Where it is and whether it's folded are kept in
localStorage (`interlude.flags.panel`). The picks themselves live in
`registry.svelte.js`, which keeps them in localStorage
(`interlude.flags`); the panel reads every flag from there, so a new flag
folder just appears in it.

Each flag becomes its own issue and pull request. To ship one: keep its
folder's styles and its hooks, then remove its gate (the
`:root[data-flag-<id>]` prefix and the `flag('<id>')` checks).

## A flag

A folder `NN-name/`, where NN is the audit item's number:

- `index.js`: `export default { id, n, title, group, notes, settings }`.
  `id` is short kebab-case; `n` is the item number; `title` says what it
  does in plain words; `group` is the panel's heading (Shape, Layout,
  Stability, Controls, Type and colour, Polish). `notes` are for whoever
  ships it (what changed and where); the panel shows the show's `about`.
- `style.css`: every rule starts with `:root[data-flag-<id>]`, so nothing
  applies while the flag is off.
- Optional hooks in components, only where CSS can't do it:
  `import { flag, setting } from '../flags/registry.svelte.js'`, then
  `flag('<id>')` / `setting('<id>', '<key>')`. Mark each hook with a
  `// #NN (UI audit flag): …` comment. With the flag off, the hook must
  leave behaviour and markup exactly as before.

Settings, shown in the flag's folder:

- `{ type: 'range', min, max, step, default, unit, label }` becomes the CSS
  variable `--flag-<id>-<key>` (with its unit), and a slider in the panel.
- `{ type: 'choice', options: [[value, label], ...], default, label }`
  becomes the attribute `:root[data-flag-<id>-<key>="<value>"]` while the
  flag is on, and a segmented choice in the panel. Use it for variants to compare (button styles, border
  treatments).

### Options with explanations, and locking one in

Every `choice` option carries a third entry: one plain sentence on what
that option does and why you'd pick it. The `default` is the recommended
pick, and the panel marks it "recommended" (add `recommended: '<value>'`
only in the rare case the recommendation isn't the default):

```js
place: {
  type: 'choice',
  label: 'Place',
  default: 'toolbar', // the recommended pick
  options: [
    ['toolbar', 'In the toolbar', 'Sits beside the track count, so it never covers a row.'],
    ['corner', 'Bottom right', 'Floats over the Time and Folder columns, the ones you read least.'],
  ],
},
```

In the panel each option is its own small line under the flag's row:
its label, "recommended" on the default, and the sentence. Clicking a line
tries it live; the current one is marked. **Lock in** marks the current
pick as decided (a small lock; one click unlocks). Locks are kept with the
picks in localStorage (`interlude.flags`, as `locked: { <id>: { <key>:
'<value>' } }`) and come along in the panel's export. The Show me card
shows the same options as a segmented group, with the chosen option's
sentence under it, so you can click through them while Before / After is
on screen.

A flag that goes against the design doc on purpose (the owner asked to
judge some of the panel's rejected ideas) sets `against: '<the doc rule it
breaks, quoted>'` in its default export, and its `about` says what the
judges argued. The panel tags its row "Against the doc".

`16-library-end/` is a complete example: a style, a range setting and one
gated hook.

## Show me

Each flag's row has a **Show me**. It turns the flag on, sets the app up so
the change is on screen (loads a track, opens a tab or a dialog, unplugs
the simulated audio device…), rings where to look, and then flips the flag
off and on every couple of seconds, with a big **Before** / **After** label
by the change, so the difference is the thing that moves. The panel turns
into a card that says, in plain words, what was wrong (Before) and what's
different now and why it's better for someone using the app (After). On
the card: Before / After to pin one, Flip to start or stop flipping,
Labels to hide the marks, Slow motion (for entrances), Replay, Again and
Done (or <kbd>Esc</kbd>). Done leaves the flag on. The card keeps off what's
being shown.

Write for someone who isn't a designer: the problem as a user would notice
it, then the fix; no jargon unless it's explained in a few words. A flag
describes its show in an optional `show` export in its `index.js`:

```js
export const show = {
  about: "The row's line: the problem as you'd notice it, then the fix.",
  before: 'The card, flag off: what goes wrong, in plain words.',
  after: "The card, flag on: what's different, and why it's better.",
  needs: { 'stress-data': { set: 'worst' } }, // other flags it needs (stress-data reloads the page)
  reload: false,  // true if turning this flag on needs a reload (it can't flip then)
  flip: true,     // false: no Before / After (the card has the flag's switch instead)
  period: 1700,   // ms each of Before and After stays up
  motion: false,  // true for entrances: they run slowed down (Slow motion on the card)
  async setup(app, ctx) { // put the app in the state where the change shows
    if (!app.loaded(0)) await app.loadTrack(0);
    ctx.rest = app.snap([app.$("[data-region='deck0'] .overview")]); // where it sits before the change
    await show.each(app, ctx, true);
  },
  async each(app, ctx, on) {}, // after every flip: put the state back (a field the flip closed, a toast that went)
  target: '.mixer .knob', // or (app, ctx) => element(s) or rects: what to ring and keep the card off
  badge: (app, ctx) => rect, // where the Before / After label goes (default: over the targets)
  aid(d, app, ctx) {      // ten times a second; ctx.phase is 'before' or 'after'
    const live = app.$("[data-region='deck0'] .overview").getBoundingClientRect();
    d.moved(ctx.rest[0], live, { what: 'waveform', side: 'below' }); // "waveform moved 13px down" / "waveform stays put"
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
painting), `without(id, fn)`, `rectsWithout(id, els)`, `setFlag`, `mock`
(`__mockAudio`). Measure in `setup`, not in `aid`.

`d` (show/overlay.js) draws in window pixels, in one visual language:
**ink** (magenta) for what to look at (the ring as a show starts, `box`,
`hguide` / `vguide`, `measure` with its value in a filled tag, `grid`,
`padding`); **dashed white** for where something sits normally;
**tags** (`text(x, y, s, { anchor, tone: 'ok' | 'bad' })`) in plain words,
red dot for the problem, green for the fix, placed clear of each other and
of small targets, with a leader if they had to move; `moved(rest, live, {
what })` says what moved and by how much, or that it stays put;
**loupes** (`loupe(key, src, { zoom, size, near, at })`) magnify a live
copy beside the thing, flipping with it, and return a `map` to draw over
them with `clip` and `path`; `motion(near, { curves, phase, now, legend })`
charts how an entrance moves. The Before / After label is drawn for you.
Keep to the fewest marks that make the point; for changes that are only
about looks, a flipping loupe with a plain caption says it best.

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
