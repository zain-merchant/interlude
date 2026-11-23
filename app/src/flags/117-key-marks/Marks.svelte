<script>
  // Text with its key marks in the system's own font (style.css).
  import { flag } from '../registry.svelte.js';
  import { runs } from './marks.js';
  /** @type {{ text: string }} */
  let { text } = $props();
</script>

{#if flag('key-marks')}{#each runs(text) as r}{#if r.ours}<span class="km own"><svg viewBox="0 -705 {r.ours.w} 705" style:width="{r.ours.w / 1000}em" aria-hidden="true"><path d={r.ours.d} /></svg><span class="km-say">{r.s}</span></span>{:else if r.mark}<span class="km">{r.s}</span>{:else}{r.s}{/if}{/each}{:else}{text}{/if}
