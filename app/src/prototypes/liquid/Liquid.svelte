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
  <section data-variant="No gradient" data-note="Text Row menus; frosted panels over plain graphite with a neutral light from the top, no deck colour behind"><Studio palette={palettes.mint} tint={0} modes={['Cues', 'Stems']} /></section>
  <section data-variant="Faint gradient" data-note="Same, with a trace of the deck colours behind the glass (about a quarter of before)"><Studio palette={palettes.mint} tint={0.25} modes={['Cues', 'Stems']} /></section>
</prototype-switcher>

<style>
  :global(body) { background: #0b0b0d; }
</style>
