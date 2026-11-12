<script>
  import './liquid.css';
  import '../bold/switcher.js';
  import Studio from './Studio.svelte';

  // Three deck colour pairs on the same layout. Each pair's waveform bands
  // are tones of its own colour (deep low, the colour for mids, a pale high).
  const palettes = {
    mint: { a: '#5fd4b4', b: '#b49cff', bands: [{ low: '#1f7f6c', mid: '#5fd4b4', high: '#d9f5ec' }, { low: '#5a47b8', mid: '#b49cff', high: '#ece6ff' }] },
    lime: { a: '#c8e64c', b: '#ef6f9b', bands: [{ low: '#5f7a12', mid: '#c8e64c', high: '#f2f8d6' }, { low: '#8f2f53', mid: '#ef6f9b', high: '#fbe1ea' }] },
    ice: { a: '#8ec5ff', b: '#f2a65a', bands: [{ low: '#36598a', mid: '#8ec5ff', high: '#e6f1ff' }, { low: '#8a5520', mid: '#f2a65a', high: '#fbe9d6' }] },
  };
</script>

<prototype-switcher>
  <section data-variant="Track Map" data-note="The track as its sections (Intro, Build, Drop) with cue flags; click a section to jump; counts down the bars to the next one"><Studio palette={palettes.mint} cueBar="map" /></section>
  <section data-variant="Stem Lanes" data-note="The overview splits into Vocals, Melody, Bass and Drums lanes, each with mute and level, like Traktor stem decks and djay Neural Mix"><Studio palette={palettes.mint} cueBar="stems" /></section>
  <section data-variant="Snapshot Pads" data-note="Eight pads like a controller: hot cues show a picture of the music after each cue; the bottom row is loop rolls, beat jumps or samples"><Studio palette={palettes.mint} cueBar="pads" /></section>
</prototype-switcher>

<style>
  :global(body) { background: #0b0b0d; }
</style>
