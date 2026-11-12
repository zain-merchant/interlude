<script>
  import '@fontsource-variable/geist-mono';
  import './liquid.css';
  import '../bold/switcher.js';
  import L4Classic from './L4Classic.svelte';
</script>

<prototype-switcher>
  <section data-variant="Classic Glass" data-note="The traditional layout (waveforms on top, deck A, mixer, deck B, library) in Liquid Glass"><L4Classic /></section>
  <section data-variant="Platter Decks" data-note="The ring is the whole track (lit = played) with hot cues marked; the inner ring counts 16 beats to the next phrase; drag the disc to nudge"><L4Classic look="platter" /></section>
  <section data-variant="One Console" data-note="Waveforms, decks and mixer in one glass slab split by hairlines, instead of separate cards"><L4Classic unified /></section>
  <section data-variant="Readout Screens" data-note="Deck numbers in black mono screens, Hardware Object style, set into the glass; waveforms on a black screen"><L4Classic look="oled" /></section>
</prototype-switcher>

<style>
  :global(body) { background: #07070a; }
</style>
