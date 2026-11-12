<script>
  // Round 2: five standalone deck concepts. Drawn for looks, not wired to
  // the engine; the waveforms come from two made-up tracks in track.js.
  import './switcher.js';
  import V1Glass from './V1Glass.svelte';
  import V2Platters from './V2Platters.svelte';
  import V3Ridgeline from './V3Ridgeline.svelte';
  import V4Object from './V4Object.svelte';
  import V5Aurora from './V5Aurora.svelte';
</script>

<prototype-switcher>
  <section data-variant="Glass Console" data-note="Full Instrument's tinted cards and glow, a notch softer, with machined tick dials and liquid waveforms"><V1Glass /></section>
  <section data-variant="Twin Platters" data-note="Each deck is a round instrument: the whole track wraps a turning platter, with a narrow machined mixer between"><V2Platters /></section>
  <section data-variant="Ridgeline" data-note="Each deck's next 30 bars rise as terrain rolling toward you; the glowing front ridge is now. Graphite slabs below"><V3Ridgeline /></section>
  <section data-variant="Hardware Object" data-note="The whole app as one dark TE-style device: OLED dot-matrix waveforms, band-tinted encoder caps, chunky square keys"><V4Object /></section>
  <section data-variant="Aurora" data-note="A glow field that breathes with each deck's bass, mids and highs, behind frosted glass cards with fine scope lines"><V5Aurora /></section>
</prototype-switcher>

<style>
  :global(body) { background: #09090b; }
</style>
