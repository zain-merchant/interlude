<script>
  // Text with its key marks in the system's own font (style.css).
  import { flag } from '../registry.svelte.js';
  import { runs } from './marks.js';
  /** @type {{ text: string }} */
  let { text } = $props();
</script>

{#if flag('key-marks')}{#each runs(text) as r}{#if r.mark}<span class="km">{r.s}</span>{:else}{r.s}{/if}{/each}{:else}{text}{/if}
