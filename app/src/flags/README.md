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

## Rules

- Off means unchanged. Check the app with every flag off against `main`.
- Keep class names, `aria-label`s and `data-region`s as they are: other code
  (the website's hero) finds controls by them.
- One flag per audit item, or one per sub-fix for the open-ended items.
- Flags change only their own tokens and rules. Shared values (radii,
  spacing, type, colour, borders) are overridden as CSS custom properties by
  the one flag that owns them.
