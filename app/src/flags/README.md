# UI audit flags

Each change being tried in the UI audit is a flag. The recommended fixes
are on by default (see "On by default" below); a flag that's off is
exactly the app as it was, so All off is upstream's app. In a dev build (`npm run dev`) the audit's
panel (`panel/FlagPanel.svelte`, loaded only by dev builds) turns flags on
and tunes them. It has a row per flag, grouped by area: its number, its
title, a line on what it fixes, a **Show me** and an on/off switch. A
flag's settings open under its row while it's on (or with the sliders
button beside Show me). There's a search field, All on / All off / Defaults
(the recommended fixes on, the rest off) and a count of what's on. Disabled
flags (see "Disabled flags" below) sit folded away at the bottom, greyed,
with no switch.

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

## On by default

The owner: "the UI polish things you can leave on as default." The registry
(`onByDefault` in `registry.svelte.js`) turns on every fix: every flag that
isn't a direction, doesn't set `against`, and doesn't set `byDefault: false`.
Picks saved in localStorage win over the default from then on (picks saved
before there were defaults keep what was on and take the defaults for the
rest), except for a disabled flag, which stays off whatever was saved. The
panel can still turn any of these off, and **Defaults** puts this list back. The registry ships in production builds, so these are on in the
app too.

On by default (84):

- #1 Smoother rounded corners (`squircles`)
- #2 Rounded corners that nest evenly (`concentric`)
- #3 Things side by side line up (`grid`)
- #4 Clearer edges and selection (`borders`)
- #5 Recording no longer nudges the mixer (`no-shift`)
- #5 Typing a BPM keeps the deck still (`no-shift-bpm`)
- #5 Tempo readout and pitch fader keep still (`no-shift-pitch`)
- #5 Sorting keeps the BPM and Time headings in place (`no-shift-sort`)
- #5 Cues, loop, FX and beat jump hold their places (`no-shift-strip`)
- #5 Deck tabs keep still when their dot lights (`no-shift-tabs`)
- #6 The play button shows which deck is playing (`play-states`)
- #7 Banners float instead of squeezing the decks (`edge-banner`)
- #7 Empty playlists and folders say so (`edge-empty-views`)
- #7 Tall windows give the extra room to the library (`edge-tall`)
- #8 Times past an hour show hours (`stress-hours`)
- #8 Deck buttons fit the smallest window (`stress-narrow-strip`)
- #8 "1 track", not "1 tracks" (`stress-plural`)
- #9 Buttons that look pressable (`buttons`)
- #10 Space instead of middle dots (`no-dots`)
- #11 Arrows and notes at the right brightness (`colour-scale`)
- #11 Text in five clear sizes (`type-scale`)
- #12 Dialogs arrive quickly (`polish-dialog`)
- #12 The "Loaded" message slides in (`polish-toast`)
- #12 Tooltips: no wait when moving between them (`polish-tooltip`)
- #13 Waveform titles stop before the play head (`declutter-lane-label`)
- #13 Load messages stay on one line and off the titles (`declutter-toast`)
- #14 Every control answers pointing, pressing and focus alike (`states`)
- #15 Even margins everywhere (`spacing`)
- #16 Room under the last library row (`library-end`)
- #18 A progress meter while the library is analysed (`visual-analysis`)
- #18 Warn when a track is about to end (`visual-ending`)
- #18 Mark library keys that mix with what's loaded (`visual-key-match`)
- #18 A mark on the pitch slider shows where tempos match (`visual-tempo-match`)
- #20 Track list runs to the library's edge (`library-clip`)
- #21 A grip on every panel edge, and designed sizes (`panel-sizes`)
- #23 A lost audio device looks like a warning (`banner-warning`)
- #24 Focus rings only after you use the keys (`focus-after-keys`)
- #25 The quietest grey clears contrast everywhere (`quiet-text`)
- #26 Toast, banner and dialog details (`overlay-polish`)
- #27 Each dialog's main button looks like one (`primary-button`)
- #28 Report says what it saves and where (`report-copy`)
- #29 Import's links look like links (`import-links`)
- #30 Long tooltips wrap (`tooltip-wrap`)
- #31 Menus in Settings look like menus (`select-chevron`)
- #32 Settings headings lead the page (`settings-type`)
- #33 Stems don't claim to be on before they can be (`stems-model`)
- #34 Settings say it in one line (`settings-copy`)
- #35 Checkboxes that look ready to tick (`settings-checks`)
- #37 Resetting shortcuts can be undone (`settings-undo`)
- #40 Time left is the big number (`time-remaining`)
- #42 Beat-jump arrows work across their whole half (`beat-jump-hit`)
- #43 A running loop or effect looks on (`on-state`)
- #44 Tempo % and key big enough to read (`pitch-readout`)
- #45 Hot cue 1 is no longer the Cue colour (`cue-colour`)
- #46 An empty deck looks empty (`empty-deck`)
- #47 The FX level dial says "Level" (`fx-label`)
- #48 The nudge buttons look like buttons (`nudge-pill`)
- #49 Waveform zoom moves off the waveform (`zoom-pill`)
- #50 Hot cue numbers on the overview (`overview-cues`)
- #51 Flat and sharp signs that match the type (`key-glyphs`)
- #52 Nothing drawn before the track starts (`lane-start`)
- #54 Deck details: play head, cue numbers, tenths, menus (`deck-polish`)
- #60 Meters with a scale, peak hold and a clip light (`meters`)
- #61 EQ kills look like buttons (`eq-kill`)
- #62 Dials grab on their whole ring (`hit-areas`)
- #63 Dials and faders light up under the pointer (`control-feedback`)
- #64 One scale on the crossfader (`crossfader-scale`)
- #65 Right-hand fader scales mirror the left (`mirror-scales`)
- #66 Quieter rings on Master, Cue mix and sampler Level (`knob-rings`)
- #67 The sampler's Level dial fits, and empty slots show their edge (`sampler-strip`)
- #68 Mixer details: dial pointers, sampler menu (`mixer-polish`)
- #80 Track list columns sized to what they hold (`library-columns`)
- #81 Column headings show the sort (`library-sort`)
- #82 Loaded tracks stand out in the list (`loaded-rows`)
- #83 Settings button shows a gear (`settings-icon`)
- #84 Searches say where they looked, and how to get back (`search-scope`)
- #85 Every music folder shows its count (`folder-counts`)
- #86 Library messages say what happened, in plain words (`copy-toasts`)
- #87 Only the list the keys move looks selected (`library-focus`)
- #88 Say "left deck" and "right deck", not A and B (`deck-names`)
- #89 The library writes keys the way the decks do (`key-notation`)
- #90 Library details (`library-polish`)
- #109 Popovers stop repeating values already on screen (`quiet-readouts`)
- #115 Pinch to zoom the waveforms (`trackpad-zoom`)

#112 (`shell-status`), #113 (`zero-states`), #116 (`settings-finish`), #117
(`key-marks`) and #118 (`toast-cut`) are proposals, but on by default while the owner judges them; they go off again once that's decided.
#112 is in both places at once; #113, #116 and #118 only do
anything on direction #110.

Off by default, and why:

- #8 Worst-case test data (`stress-data`): test data for checking the fixes, not a fix; it swaps in a fake library and reloads the page. All on leaves it alone too (see "Disabled flags" for why it isn't disabled).
- #114 Waveform looks (`wave-looks`): opt-in, other looks to compare with today's, with a switcher of its own in dev builds.
- #92 and up, the directions: whole-app looks, opt-in and one at a time; not polish.

Disabled (15): the "against the doc" alternatives. They argue against the
design doc, and the owner wants them out of the way: "those ones can't even
be turned on or off without talking with [me] first."

- #38 Solid Done (`against-solid-primary`): against the doc's one solid primary; #27 is the adopted version.
- #39 Brighter, larger quiet text (`against-text-levels`): against the doc's text levels; #25 is the adopted contrast fix.
- #56 Hot cues as pads (`against-cue-pads`): against the doc's quiet text row of cues.
- #56 Stronger deck colours (`against-deck-colours`): against the doc's pale deck whites.
- #56 Brighter empty hot cues (`against-empty-rings`): against owner's call 9, which keeps them quiet.
- #56 Heavier times and BPM (`against-heavy-numerals`): against the doc's light numerals.
- #56 A and B letters on the decks (`deck-letters`): the doc rules deck letters out; #88's left/right words are the adopted fix.
- #57 A stronger Cue at rest (`against-cue-outline`): against the doc's Cue outline.
- #57 An edge on the overview well (`against-deck-wells`): against the doc's edge-free wells.
- #57 Mirror the right deck more (`against-mirror`): against the doc's mirroring rule.
- #57 A paused Play that steps back (`against-quiet-play`): against the doc's one solid Play; competes with #6 play-states.
- #57 Idle tabs show their state (`against-tab-status`): against the doc's quiet tabs.
- #57 Calmer waveform cores (`against-wave-cores`): against the doc's waveform look.
- #69 Mixer wells, slots and ticks the reviewers' way (`mixer-against-doc`): against the doc; the reviewers' alternative.
- #91 Roomier library rows (`library-roomy`): against the doc's 28px row pitch; fewer tracks fit.

## Disabled flags

Besides on and off, a flag can be disabled: its `index.js` sets
`disabled: '<why, in one line>'` beside `against`. Its folder, styles and
hooks stay in the code, but:

- The registry keeps it off whatever happens: a saved pick that turned it on
  is ignored, `flag('<id>')` is false, its `data-flag-<id>` attribute is
  never set (so its CSS never applies), and anything that sets
  `flags.on[<id>]` (a show, a mask coming back) is put back to off.
- All on, All off and Defaults leave it out, and the count ("N of M on")
  doesn't include it.
- The panel lists it in a folded **Disabled** section at the bottom,
  greyed, with its reason and no switch, settings or Show me.

Turning one back on is an edit, not a click: delete its `disabled` line
(it's then an ordinary off-by-default flag), and only after talking it over
with the owner. To disable another, add the line.

`stress-data` is not disabled. It is a dev-only tool rather than a design
choice: it only changes the simulated engine's library (`lib/mock.js`, the
browser build), and three Show me's (#8 `stress-hours`, #13
`declutter-lane-label`, #18 `visual-analysis`) turn it on to set their
scene, which disabling would break. It stays off by default, All on skips
it (it isn't a fix, and it reloads the page into a fake library), and it
can be switched on by hand. The other `08-stress-*` flags are fixes found
with it and are on by default.

Retired at the merge of upstream main (folder and hooks removed), because
upstream now does the same thing its own way: #17 headphone-align (the cue
button spans fader and meter), #19 library-resize (the handle is
`.dragging`), #36 settings-panel (Settings is a popup), #41 beat-grid (the
grid draws over the waveform with edge ticks) and #53 deck-spare-height (the
deck sizes its own rows; its old rows squeezed the hot cues to one line).

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
judges argued. The panel tags its row "Against the doc". The non-direction
ones are now disabled as well (see "Disabled flags").

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
  masks: ['buttons'], // flags that do the same thing while on: Before turns them off too (see below)
  overrides: ['x'],   // flags that override this change while on: off for the whole show
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

**Before is "as if this fix weren't made".** Some fixes are hidden by
another flag that's on, and with every fix on, flipping only this flag
then changes nothing. When that flag does the same thing (a later flag
that took the change over), the show lists it in `masks`: Before turns it
off too and After puts it back. When it does something else to the same
thing (After would show it instead of this fix), the show lists it in
`overrides`: it's off for the whole show. Either way it comes back on
Done (or on a reload mid-show), the card says which, and while that flag
is on the flag's row in the panel says so ("Shows less while …" for
`masks`, "Hidden while …" for `overrides`).
A flag that no longer changes anything on its own (everything it did moved
into another flag) says so in its `about` and sets `superseded: '<id>'` in
its default export; the panel tags its row.

**Directions are paused.** The directions (#92 and up, the "Direction"
group) restyle the whole app on top of the fixes, so a fix's show pauses
the one that's on and puts it back on Done; the card says so. All on turns
on every fix but no direction (and not the test data or a disabled flag), and while a direction is on the panel says
so at the top, with a button to turn it off.

Canvases (the waveforms) read the theme's colours again whenever any flag
or setting changes (`flagsRev` in the registry), so a flag that changes a
colour token shows on them too.

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

- Off means unchanged. Check the app with every flag off (All off) against `main`.
- Keep class names, `aria-label`s and `data-region`s as they are: other code
  (the website's hero) finds controls by them.
- One flag per audit item, or one per sub-fix for the open-ended items.
- Flags change only their own tokens and rules. Shared values (radii,
  spacing, type, colour, borders) are overridden as CSS custom properties by
  the one flag that owns them.
