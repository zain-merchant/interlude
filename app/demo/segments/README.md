# The hero's clips

The website's hero plays recorded clips of the real demo (`demo/hero.html`),
not the app itself: a clip per step of the script, in both hands, over the
whole loop. The player is `site/hero/clips.js` (in the page, no frame); the
clips are in `site/hero/clips/`, fetched from a release (see "Where the
clips live"). The live app is still there, for comparing:
`/?hero=app`, or Tune > Hero > Performance > demo.

## Making them

When the app's UI or the demo changes, record them again, in `app/`:

    npm run clips

It builds the demo into a work folder (the system's temp folder, or
`--work DIR`), records, encodes into `site/hero/clips/`, and writes the
poster (`site/img/screenshot*.jpg` and `.avif`, the loop's first frame).
It takes a while (on an M1 Pro: about 2 hours to record both hands, then
the encoding), and needs ffmpeg with libx264, libx265 (and libsvtav1 for
`--codecs av1`), and ImageMagick (`magick`) for comparing the hands'
pictures. Then publish the set (below); nothing to commit.

    npm run build:site:all

builds the demo for the site, fetches the published set, and records the
clips only if the app, the demo or the recorder have changed since that set
was made (the manifest keeps a hash of them): the step to run before
publishing the site.

## Where the clips live

Not in git: a set is about 200 MB and a new one comes with every UI change.
`site/hero/clips/` and the poster (`site/img/screenshot*`) are gitignored.
Each set is one archive (`hero-clips-<hash>.tar.gz`: the clips, the
manifest, the timelines, the controller's mask and the poster) in a
GitHub pre-release tagged `hero-clips`, with `hero-clips.json` beside it
naming the newest. `app/scripts/hero-clips.mjs` does both ends:

    npm run clips:fetch      the newest set into site/hero/clips and site/img
    npm run clips:publish    the set in site/hero/clips to the release

- **fetch** needs nothing but Node (a plain download, no gh or token). It
  does nothing if the set there is the published one, and keeps a set
  recorded here that isn't published yet (`--force` replaces it). It checks
  the archive's checksum and contents, and takes only a set whose manifest
  schema the player plays (`CLIPS_SCHEMA` in `site/hero/clips.js`; the
  player refuses a newer one too, and the poster stays). Run it once after
  cloning to see the hero with its clips locally.
- **publish** needs gh, logged in with write access to the repo. It checks
  the set is complete (every file the manifest names, and the poster),
  writes the schema into the manifest if the recorder didn't, uploads the
  archive and then the index, and keeps the set before too (for a page
  still holding the older manifest), removing older ones.
- **The release is never "latest".** The site's download buttons and the
  app's updater read `releases/latest`, so the clips' release is a
  pre-release made with `--latest=false`, and publish checks afterwards
  that it still isn't.
- **Which repo:** `config.heroClipsRepo` in `app/package.json`
  (`zain-merchant/interlude`), or `--repo owner/name`, or
  `$HERO_CLIPS_REPO`.
- **Bump the schema** (`CLIPS_SCHEMA` in `clips.js`, and the manifest the
  recorder writes) only when the player can't play older sets any more.

Options (`node demo/segments/record.mjs ...`):

- `--if-changed`: nothing to do if the clips are up to date.
- `--jobs 3`: recording processes per hand. More is not faster on a laptop
  (the GPU and memory are the limit, not the cores).
- `--codecs hevc,h264`: add `av1` for AV1 too (it only plays where the
  browser decodes it in hardware, and was barely smaller than HEVC here).
- `--phase plan|record|encode`: one stage at a time; `--keep` keeps the
  lossless masters, so `--phase encode` can encode them again (other
  settings, other codecs) without recording again.

## How a recording is made

`record.mjs` drives the real demo under Stageshow's virtual clock, so every
run gives the same frames (the level meters aside, which can differ by a few
levels from run to run).

1. **The loop.** The set never ends: decks trade sides each mix, the two
   routines alternate and the set is three records, so the app comes round
   every six mixes, from the third (the first two start from the app's
   set-up). Not quite, though: each mix's Sync lines the new record up on
   the beat of the one playing, so the play heads came round 58 ms later
   each time. The step before the cycle's last Sync is lengthened by the
   part of a beat that brings it round (within 3 ms, a tenth of a pixel on
   the waveforms), and the two cycles' starts are compared to check it.
2. **Lining up the hands.** `hero.jsx` reports when each step starts
   (`mark()`) and when the app answers in it (`acted()`): hooks that only do
   anything when a recorder sets `window.__heroAlign`. Each step gets one
   length for both hands, and each hand a wait at its start, so the app
   answers at the same moment in both and every step ends on the same app
   (the engine at every boundary must match between the hands, play heads
   within 12 ms). A step is one move: putting an EQ or the echo back after a
   stop, or letting a loop go after a crossfade, are steps of their own.
3. **Recording**, each hand in parts at once, each part in a real 2x window.
   Each frame, in layers:
   - the app alone, flat (the page tips it back itself in the controller
     hand), without the controller or the link lines; in the mouse hand
     with the arrow (what plays) and without it (its twin, crossed to when
     the hand switches mid-step; 1x only);
   - the controller alone in its box, with the controller hand's fingertip;
   - a timeline: the music's level and the link lines.
   Each layer of each step goes into a lossless master as it's recorded.
4. **Encoding**: HEVC and H.264 (bt709, limited range, 4:2:0), 2x and 1x;
   the twin at 1x with a keyframe every 2 s. Then the boundaries where the
   hands' pictures differ (a tooltip one has and the other hasn't), which
   the player blends across instead of cutting; the controller's outline
   (`controller-mask.png`) and where it is when it's away (`controller.css`
   moves it in 3D; measured, so the page can move the clip the same way);
   the styles the player needs from the demo's stylesheets; one timeline
   file per hand; `manifest.json`.

## How the player plays it

- Both hands run in step on one timeline: at the end of any step the other
  hand's next clip follows on the same app, and the last step leads into the
  first without a seam.
- A switch of hands moves the page at once (the screen eases back or
  forward with hero.css's own transform; the controller comes or goes as
  the live one does; in the mouse hand the clip crosses to its twin, so the
  arrow fades, and back again if the hand comes straight back). The clips
  swap at the end of the step once the other hand's are in.
- Nothing runs on most frames: a timer, a dozen times a second, hands the
  page the music's levels and keeps the controller's clip in step; frame
  callbacks run only over a clip's last frames and while a link line shows
  (with a fallback for browsers without `requestVideoFrameCallback`, and the
  clip's end as a backstop).
- Codec: AV1 where the browser decodes it in hardware (if recorded), else
  HEVC where it plays it without spending power on it, else H.264; if a
  clip won't play, H.264. Size: the 1x set where the screen is at most about
  1600 device pixels across (phones, small windows), else 2x.
- Loading: what's needed next, one file at a time. Where the browser says
  the connection is slow or metered, or doesn't say (Safari, Firefox) until
  the first clip has come in fast, nothing ahead of need; on a fast one, the
  step after and the other hand's next step too.
- Autoplay refused (Low Power Mode): the screenshot stays, and a tap or a
  click starts it. Reduced motion: the screenshot only.

## What a UI change in the app needs

`npm run clips` (or `npm run build:site:all`), then `npm run clips:publish`.
By hand only if
the script changes shape (a new step name is fine), or if the controller's
move in `controller.css` changes beyond its transform's distance (the
player copies its timing).

## Not covered

- One controller style (the default); the Tune panel's other styles play
  only in the live app.
- The cursor and the controller's fingertip are in the pictures, so their
  styles can't be changed in the page.
