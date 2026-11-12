<script>
  import './liquid.css';
  import '../bold/switcher.js';
  import Studio from './Studio.svelte';

  // Colour-scheme study on the faint-gradient look. Each palette sets the
  // two deck colours; waveform bands are tones of each deck's colour (deep
  // low, the colour itself for mids, a pale high).
  const mint = { low: '#1f7f6c', mid: '#5fd4b4', high: '#d9f5ec' };
  const palettes = {
    one: { a: '#5fd4b4', b: '#5fd4b4', bands: [mint, mint] },
    mint: { a: '#5fd4b4', b: '#b49cff', bands: [mint, { low: '#5a47b8', mid: '#b49cff', high: '#ece6ff' }] },
    whites: { a: '#c9dcf2', b: '#f0dcc0', bands: [{ low: '#4d6580', mid: '#c9dcf2', high: '#f4f8fc' }, { low: '#806548', mid: '#f0dcc0', high: '#fcf7ef' }] },
    peri: { a: '#8f9cff', b: '#f2c14e', bands: [{ low: '#3e4aa8', mid: '#8f9cff', high: '#e4e7ff' }, { low: '#8a6a14', mid: '#f2c14e', high: '#fcf0cf' }] },
    aqua: { a: '#4fd6e8', b: '#ff7a8a', bands: [{ low: '#16707c', mid: '#4fd6e8', high: '#d8f6fa' }, { low: '#8f2f3b', mid: '#ff7a8a', high: '#ffe0e4' }] },
  };
</script>

<prototype-switcher>
  <section data-variant="Chosen: cool and warm white" data-note="Picked direction (Nov 2026). Barely-there colour: an ice white and a cream white. Hardware-like, the decks differ by temperature"><Studio palette={palettes.whites} tint={0.25} modes={['Cues', 'Stems']} /></section>
  <section data-variant="One colour" data-note="Both decks share mint; you tell them apart by side only. Calmest, most product-like"><Studio palette={palettes.one} tint={0.25} modes={['Cues', 'Stems']} /></section>
  <section data-variant="Mint and violet" data-note="Current pair: two soft colours at the same brightness, clearly different but neither shouts"><Studio palette={palettes.mint} tint={0.25} modes={['Cues', 'Stems']} /></section>
  <section data-variant="Periwinkle and saffron" data-note="A colour-blind-safe pair (blue-violet against yellow), most legible at a glance in a dark booth"><Studio palette={palettes.peri} tint={0.25} modes={['Cues', 'Stems']} /></section>
  <section data-variant="Aqua and coral" data-note="The punchiest pair, cool against warm, without going back to blue and orange"><Studio palette={palettes.aqua} tint={0.25} modes={['Cues', 'Stems']} /></section>
</prototype-switcher>

<style>
  :global(body) { background: #0b0b0d; }
</style>
