<script>
  import { tooltip, tipWarm, KEY_MARK } from './tooltip.svelte.js';
  import { flag } from '../flags/registry.svelte.js';
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
</script>

{#if tooltip.visible && tooltip.text}
  <!-- #12 (UI audit flag): data-warm marks a tip that follows straight on from another (no entrance). -->
  <div class="tip" class:below={tooltip.below} role="tooltip" bind:this={el} bind:clientWidth={width} data-warm={flag('polish-tooltip') && tipWarm.on ? '' : undefined}
    style:left="{left}px" style:top="{tooltip.y}px"><!-- #10 (UI audit flag): the tip's parts as spans spaced apart, not joined with middle dots.
    -->{#if twoLines}<span class="l1"><span class="part">{words[0]}</span>{#each keycaps as k}{' '}<kbd class="key">{k}</kbd>{/each}</span>{' '}<span class="l2">{rest}</span>{:else if flag('no-dots')}{#each words as part, i}{i ? ' ' : ''}<span class="part">{part}</span>{/each}{#each keycaps as k}{' '}<kbd class="key">{k}</kbd>{/each}{:else}{tooltip.text.replaceAll(KEY_MARK, '')}{/if}</div>
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
