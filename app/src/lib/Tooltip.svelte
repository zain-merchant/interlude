<script>
  import Marks from '../flags/117-key-marks/Marks.svelte'; // #117 (UI audit flag)
  import { tooltip, tipWarm, KEY_MARK } from './tooltip.svelte.js';
  import { flag } from '../flags/registry.svelte.js';
  import Tip from '../flags/122-tooltips/Tip.svelte'; // #122 (UI audit flag)
  import { read } from '../flags/122-tooltips/read.js';
  let el = $state();
  let width = $state(0);
  // Keep the tip inside the window. #30 (UI audit flag): tooltip-wrap: 16px (--pad) from the edges.
  const edge = $derived(flag('tooltip-wrap') ? 16 : 8);
  const left = $derived(Math.max(edge, Math.min(window.innerWidth - width - edge, tooltip.x - width / 2)));
  // #10 (UI audit flag): no-dots: the words, then any key at the end, set apart (a bare dim glyph).
  const parts = $derived(tooltip.text.split(' · '));
  const words = $derived(parts.filter((p) => !p.startsWith(KEY_MARK)));
  const keycaps = $derived(parts.filter((p) => p.startsWith(KEY_MARK)).map((p) => p.slice(1)));
  // #30 (UI audit flag): tooltip-wrap: a tip with a description is a title line (its key at the end) over the description.
  const rest = $derived(words.slice(1).join(' '));
  const twoLines = $derived(flag('tooltip-wrap') && rest.length > 24);
  // #122 (UI audit flag): tooltips: the tip's parts; null is no tip. It opens on whichever side of its control has room.
  const own = $derived(flag('tooltips') && flag('dir-room-tint'));
  const tipParts = $derived(own && tooltip.text ? read(tooltip.text) : null);
  let height = $state(0);
  // The browser preview scales the interface with CSS zoom, where rects are scaled and lengths aren't; the app's webview zooms by itself.
  const z = $derived((tooltip.visible && parseFloat(document.documentElement.style.zoom)) || 1);
  const above = $derived(tooltip.top / z - 8 - height >= edge);
  const fitsUnder = $derived(tooltip.bottom / z + 8 + height <= window.innerHeight / z - edge);
  const under = $derived(!own ? tooltip.below : tooltip.below ? fitsUnder || !above : !above && fitsUnder);
  const y = $derived(!own ? tooltip.y : under ? tooltip.bottom / z + 8 : tooltip.top / z - 8);
  const x = $derived(!own ? left : Math.max(edge, Math.min(window.innerWidth / z - width - edge, tooltip.x / z - width / 2)));
</script>

{#if tooltip.visible && tooltip.text && (!own || tipParts)}
  <!-- #12 (UI audit flag): data-warm marks a tip that follows straight on from another (no entrance). -->
  <div class="tip" class:below={under} role="tooltip" bind:this={el} bind:clientWidth={width} bind:clientHeight={height} data-warm={flag('polish-tooltip') && tipWarm.on ? '' : undefined}
    style:left="{x}px" style:top="{y}px">{#if tipParts}<Tip t={tipParts} />{:else}<!-- #10 (UI audit flag): the tip's parts as spans spaced apart, not joined with middle dots.
    -->{#if twoLines}<span class="l1"><span class="part"><Marks text={words[0]} /></span>{#each keycaps as k}{' '}<kbd class="key"><Marks text={k} /></kbd>{/each}</span>{' '}<span class="l2"><Marks text={rest} /></span>{:else if flag('no-dots')}{#each words as part, i}{i ? ' ' : ''}<span class="part"><Marks text={part} /></span>{/each}{#each keycaps as k}{' '}<kbd class="key"><Marks text={k} /></kbd>{/each}{:else}{tooltip.text.replaceAll(KEY_MARK, '')}{/if}{/if}</div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 100;
    transform: translateY(-100%);
    padding: 5px 9px;
    border-radius: 6px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .tip.below {
    transform: none;
  }
</style>
