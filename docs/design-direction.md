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

## Next

1. Move this design into the real app components.
2. Then delete `app/src/prototypes` and the prototype routes in
   `app/src/main.js`.
