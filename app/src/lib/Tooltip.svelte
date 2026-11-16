<script>
  import { tooltip, tipWarm } from './tooltip.svelte.js';
  import { flag } from '../flags/registry.svelte.js';
  let el = $state();
  let width = $state(0);
  // Keep the tip inside the window.
  const left = $derived(Math.max(8, Math.min(window.innerWidth - width - 8, tooltip.x - width / 2)));
</script>

{#if tooltip.visible && tooltip.text}
  <!-- #12 (UI audit flag): data-warm marks a tip that follows straight on from another (no entrance). -->
  <div class="tip" class:below={tooltip.below} role="tooltip" bind:this={el} bind:clientWidth={width} data-warm={flag('polish-tooltip') && tipWarm.on ? '' : undefined}
    style:left="{left}px" style:top="{tooltip.y}px"><!-- #10 (UI audit flag): the tip's parts as spans spaced apart, not joined with middle dots.
    -->{#if flag('no-dots')}{#each tooltip.text.split(' · ') as part, i}{i ? ' ' : ''}<span class="part">{part}</span>{/each}{:else}{tooltip.text}{/if}</div>
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
