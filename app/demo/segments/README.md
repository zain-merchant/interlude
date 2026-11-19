# The hero as recorded clips (prototype)

A way to show the hero without running the app in the page: the real demo
(`demo/hero.html`) is recorded, step by step, in both hands, and a small
player (`site/lab/segments/clips.js`, in the page itself, no frame) plays
the clips. Try it at
`/lab/segments/` (pick the hand, the clips, the codec), or in the site's
own hero with Tune > Hero > Performance > demo, or `/?hero=clips`.

## How a recording is made

`record.mjs` drives the real demo under Stageshow's virtual clock (as
`bake-hero.mjs` does), so every run gives the same frames.

1. **Plan.** Each hand plays the steps (`sync`, `stems`, `play`, `eq`,
   `crossfade`). `hero.jsx` reports when each step starts (`mark()`) and
   when the app answers in it (`acted()`): inert hooks that only do
   anything when a recorder sets `window.__heroAlign`. From that each step
   gets one length for both hands, and each hand a wait at the step's start
   so the app answers at the same moment in both.
2. **Check.** Lined up, both hands must leave the engine the same at every
   step boundary (play heads, rates, what's playing, stems, crossfader, EQ,
   tabs). Play heads may differ by up to 12 ms (`POS_TOLERANCE`): a mouse
   click lands on a frame and a controller key's pulse a little after one,
   so a stopped deck synced by each sits a few milliseconds apart (well under
   a pixel). Anything more stops the recording.
3. **Record.** Each frame, in layers:
   - the app alone, flat (the page tips it back itself in the controller
     hand), without the controller or the link lines. In the mouse hand
     twice: with the arrow (`appc`, what plays) and without (`app`, its twin,
     crossed to when the hand switches mid-step; a keyframe every 2 s
     so it can start partway through quickly);
   - the controller alone in its box, with the controller hand's fingertip
     (it goes when the controller does), without the mouse's arrow;
   - a timeline of the link lines (path, opacity, dash) and the music's
     level.
   Each step becomes clips per layer in AV1, HEVC and H.264 (2x, bt709
   limited range, 4:2:0), plus `controller-mask.png` (its outline at rest,
   without a fingertip) and `manifest.json` (steps, layers per hand, the
   controller's box, and the links' and app box's CSS, read from the page's
   own stylesheets).

Build the demo into a copy of the site first, so the live `site/demo` is
never rebuilt under anyone:

    vite build --config demo/vite.config.js --outDir /tmp/rec/demo
    node demo/segments/record.mjs --site /tmp/rec --out ../site/lab/segments

## How the player plays it

- The two hands' clips run in step on one timeline: a step lasts as long in
  either, so at the end of any step the other hand's next clip follows on
  the same app.
- A switch of hands moves the page at once (the screen eases back or
  forward with hero.css's own transform, the controller comes or goes, and
  in the mouse hand the clip crosses to its twin without the arrow, so the
  arrow fades). The clips swap at the end of the step, if the other hand's
  clip has loaded, or else at the end of the next. With the pointer or focus
  on the switch the twin is already running underneath, in step.
- Nothing runs on most frames: a timer, a dozen times a second, hands the
  page the music's levels since the last time (for the glow and the
  record) and keeps the controller's clip in step; frame callbacks run only
  over a clip's last frames and while a link line shows.
- Two video elements per layer cross over: the next clip starts a frame
  before the last ends and comes forward once its first frame is up.
- Codec: AV1 where the browser decodes it in hardware (MediaCapabilities
  `powerEfficient`), else HEVC, else H.264.
- Loading: the first clip, then each next one as the last starts, then
  (idly, after a few seconds) the rest.

## What a UI change in the app needs

Nothing by hand for the app itself: rebuild, re-record, commit the clips.
By hand only if the script changes shape (a new step name is fine; a step
that plays differently per hand may need its wait looked at in the plan's
output), or if the controller's rise in `controller.css` changes (the
player's `.desk` copies it, flattened).

## Not done in this prototype

- Only the first mix's first five steps, so the loop jumps back at its
  end, and switching a clip off jumps too (the app state at each end isn't
  the next one's start). A full version records whole mixes (six, as
  `bake-hero.mjs` does) and splits them at the step marks.
- Lining the hands up makes some steps longer than the live demo's: the
  mouse waits up to 5 s at the start of Sync while the controller rides its
  tempo fader.
- One controller style (the default); the Tune panel's other styles need
  their own recordings.
- The controller's rise is a flattened copy of the live one's 3D move.
