<script>
  // Snapshot Pads: eight pads in two rows, like a controller. The top row
  // is hot cues, and each pad shows a snapshot of the music after its cue.
  // The bottom row is whatever page is chosen on the left: loop rolls, beat
  // jumps or samples.
  import Snippet from './Snippet.svelte';
  import { CUES } from './perf.js';
  /** @type {{ deck: number, color: string }} */
  let { deck, color } = $props();
  const pages = {
    Roll: ['⅛', '¼', '½', '1'],
    Jump: ['−8', '−1', '+1', '+8'],
    Sample: ['Horn', 'Vox', 'Rise', 'Hit'],
  };
  let page = $state(deck ? 'Jump' : 'Roll');
  const unit = { Roll: 'beat', Jump: 'beats', Sample: '' };
</script>

<div class="sp" style:--c={color}>
  <div class="pages" role="tablist">
    <span class="lbl">Cues</span>
    {#each Object.keys(pages) as p}<button role="tab" aria-selected={page === p} class:on={page === p} onclick={() => (page = p)}>{p}</button>{/each}
  </div>
  <div class="grid">
    {#each CUES[deck] as q, i}
      {#if q}
        <button class="pad cue" style:--q={q.c}>
          <div class="snap"><Snippet {deck} t={q.t} color={q.c} /></div>
          <span class="nm">{q.n}</span>
        </button>
      {:else}
        <button class="pad empty"><span class="nm">Set {i + 1}</span></button>
      {/if}
    {/each}
    {#each pages[page] as v}
      <button class="pad act"><span class="v">{v}</span>{#if unit[page]}<span class="u">{unit[page]}</span>{/if}</button>
    {/each}
  </div>
</div>

<style>
  .sp { display: grid; grid-template-columns: 64px 1fr; gap: 10px; }
  .pages { display: grid; align-content: start; gap: 1px; }
  .lbl { height: 42px; display: flex; align-items: center; padding: 0 8px; font-size: 12px; color: rgb(236 234 228 / 0.45); }
  .pages button { height: 20px; padding: 0 8px; border-radius: 5px; text-align: left; font-size: 12px; color: rgb(236 234 228 / 0.5); }
  .pages button.on { color: #eceae4; background: rgb(255 255 255 / 0.07); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: 42px 30px; gap: 5px; }
  .pad { position: relative; border-radius: 8px; overflow: hidden; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); background: #19191c; text-align: left; }
  .pad:hover { background: #1e1e22; }
  .cue { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--q) 40%, transparent); }
  .snap { position: absolute; inset: 6px 8px 18px; opacity: 0.75; }
  .nm { position: absolute; left: 8px; bottom: 4px; font-size: 11.5px; color: #eceae4; }
  .empty { box-shadow: none; outline: 1px dashed rgb(255 255 255 / 0.14); outline-offset: -1px; background: none; }
  .empty .nm { color: rgb(236 234 228 / 0.35); }
  .act { display: flex; align-items: baseline; justify-content: center; gap: 4px; }
  .act .v { font-size: 14px; }
  .act .u { font-size: 11px; color: rgb(236 234 228 / 0.45); }
</style>
