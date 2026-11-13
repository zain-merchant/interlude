# UI design direction

This is where the UI redesign stands as of November 2026. The live reference
is the prototype at `/prototypes/liquid` (run `cd app && npm run dev`, then
open http://localhost:1420/prototypes/liquid). The first variant, "Chosen:
cool and warm white", is the picked direction. Source:
`app/src/prototypes/liquid/`.

## What we picked

- **Layout:** the original app's layout. Waveform lanes sit on top. Below
  them are deck, mixer and deck, with the library at the bottom. The mixer
  puts each channel's dials (Trim, High, Mid, Low, Filter) in one line.
- **Material:** Liquid Glass. Panels are frosted:
  - a very light white fill
  - a 30px backdrop blur
  - a 1px inner ring and a top highlight
  - a soft drop shadow
- **Background:** a faint gradient. Graphite with a neutral light from the
  top, plus a trace of each deck's colour at about a quarter strength. The
  pools drift slowly and stop under reduced motion.
- **Deck colours:** a cool and a warm white, so the decks differ by
  temperature, not by hue.
  - Deck 1 is ice white, `#c9dcf2`. Its waveform bands are `#4d6580`,
    `#c9dcf2` and `#f4f8fc`.
  - Deck 2 is cream white, `#f0dcc0`. Its waveform bands are `#806548`,
    `#f0dcc0` and `#fcf7ef`.
  - Both pass contrast as text on the panels, at more than 12:1.
- **Mode panel:** "Text Row" for Cues, Loop, FX and Stems. Underline tabs
  sit over one quiet row:
  - Cues are a coloured dot, a number and a time. Empty slots read "Set".
  - Loop shows ½, ‹ 4 beats ›, 2×.
  - FX shows the effect, its beat length, a level and an on/off control.
  - Stems are dots: filled when on, hollow and dimmed when muted.
- **Typography:** Geist Variable with tabular numbers. Times and BPM are
  large and light.
- **Waveforms:** calm ribbons sampled on a grid anchored to the track, so
  they don't pulse.

## Design system

The refinement pass, after Reese's feedback, puts everything on one set of
tokens. They are defined at the top of the `.studio` styles in `Studio.svelte`.

- **Type**: five sizes, 11, 13, 16, 24 and 32px.
- **Text**: three levels plus an "off" level.
  - `--fg` is full.
  - `--fg-2` is 64%.
  - `--fg-3` is 50%. This is the quietest level that still passes 4.5:1.
  - `--fg-off` is 30%, for empty or disabled items only.
- **Space**: a 4px grid.
  - Panels pad 16px.
  - Gaps between panels are 12px.
  - Control heights are 44px (transport), 32px and 24px.
  - Radii are 16px for panels and 8px for controls.
- **Depth**, from back to front:
  1. The page.
  2. Glass panels.
  3. Recessed wells: darker, with an inner shadow. Used for waveforms and search.
  4. Outlined controls (`.ctl`).
  5. One solid primary control, Play.
- **Alignment**: the mode tabs, the mode row and the transport share the
  deck's four columns. The crossfader row shares the transport row's height.
  Box edges line up with box edges, and text lines up with text.

## What we ruled out, and why

- Strong gradients, glows and saturated deck colours. They looked
  "vibe-coded".
- Blue and orange. They look like legacy DJ software.
- "A" and "B" deck labels. Colour and position already identify the decks.
- Boxy menu blocks and made-up cue names (intro, build, drop). The app can't
  know which part of a track is which.
- Stem progress bars. Their meaning was unclear.
- Big platters, the Ridgeline terrain and other experimental layouts. Fun,
  but not practical to mix on. Round 2 is saved at `/prototypes/bold`.

## In the app

The real app now uses this design. The tokens live in `app/src/app.css`.
Waveforms are drawn by `app/src/lib/waveform-2d.js`, the prototype's ribbon
renderer, reading the analyser's bins. A few things differ from the
prototype because the app does more:

- Nudge is a pair of small ‹ › buttons under the pitch fader. The
  transport's fourth button is beat jump, as in the prototype.
- Hot cues use eight slot colours (`--hc-1` to `--hc-8`), on the cue row,
  the overview and the waveform.
- The sampler strip and the settings page are glass panels too.

## Next

Delete `app/src/prototypes` and the prototype routes in `app/src/main.js`
once the app has been checked against them.
