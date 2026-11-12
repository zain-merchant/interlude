<script>
  import '@fontsource-variable/geist-mono';
  import './liquid.css';
  import '../bold/switcher.js';
  import L1NowNext from './L1NowNext.svelte';
  import L2OneStage from './L2OneStage.svelte';
  import L3Desktop from './L3Desktop.svelte';
  import L4Classic from './L4Classic.svelte';
  import L5SharedStage from './L5SharedStage.svelte';
</script>

<prototype-switcher>
  <section data-variant="Classic Glass" data-note="The traditional layout (waveforms on top, deck A, mixer, deck B, library) in the Liquid Glass styling"><L4Classic /></section>
  <section data-variant="Shared Stage" data-note="The traditional layout with One Stage's waveforms on top: A above the line, B below, beats lined up"><L5SharedStage /></section>
  <section data-variant="Now and Next" data-note="One hero track and the one you're bringing in, instead of two mirrored decks. Liquid Glass over a slow gradient"><L1NowNext /></section>
  <section data-variant="One Stage" data-note="Both tracks share one waveform stage, A above the line and B below, so beats visibly line up. Channels are a plugin-style rack"><L2OneStage /></section>
  <section data-variant="Desktop App" data-note="Shaped like a modern Mac app: library is the main window, an inspector on the right, both decks in a glass dock"><L3Desktop /></section>
</prototype-switcher>

<style>
  :global(body) { background: #07070a; }
</style>
