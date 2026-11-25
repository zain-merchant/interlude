<script>
  import { flag, setting } from '../flags/registry.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { untrack } from 'svelte';

  /**
   * A thin level meter, filled from the bottom. `level` is linear peak: 1 is
   * full scale (0 dBFS), and a real over reads above it.
   * #60 (UI audit flag) adds, while `meters` is on: `ticks` ('left' |
   * 'right') draws the 0, −6 and −18 dB marks on that side; `what` names
   * the meter in the clip light's tooltip; `light` false leaves out the
   * clip light and its space (the master, which can't go over).
   * @type {{ level?: number, ticks?: 'left' | 'right' | '', what?: string, light?: boolean }}
   */
  let { level = 0, ticks = '', what = '', light = true } = $props();
  // Map -48..0 dBFS onto the meter: green to 62%, amber to 82%, red above.
  const fill = $derived(Math.max(0, Math.min(1, (20 * Math.log10(Math.max(level, 1e-6)) + 48) / 48)));

  // #60 (UI audit flag): peak hold and clip latch. The held peak stays put
  // for a moment (the setting, 1.5 s by default), then drops to the level
  // now. The clip light latches only on a real over: a peak above full
  // scale (0 dBFS). A track peaking at exactly full scale isn't clipping.
  // The master can't go over (its limiter, shown by LIM, holds it under),
  // so its meters have no light (`light` false): the bar runs to the top.
  /** Above full scale, with a hair of room for float rounding (+0.001 dB). */
  const OVER = 1.0001;
  const on = $derived(flag('meters'));
  let peak = $state(0);
  let clipped = $state(false);
  let hold;
  $effect(() => {
    if (!on) return;
    const f = fill;
    if (light && level > OVER) clipped = true;
    if (f >= untrack(() => peak)) {
      peak = f;
      clearTimeout(hold);
      hold = setTimeout(() => (peak = 0), Number(setting('meters', 'hold')) * 1000 || 1500);
    }
  });
  $effect(() => () => clearTimeout(hold));
  const DB = [0, -6, -18];
</script>

{#if on}
  <!-- #60 (UI audit flag): clip light on top (channels only), the bar under it, peak hold and dB marks. -->
  <div class="meter m60" class:clipped class:nolight={!light} style:--l="{fill * 100}%" style:--pk={peak}>
    {#if light}<i class="clip" aria-hidden="true"></i>{/if}
    <i class="bar" aria-hidden="true"></i>
    {#if peak > 0.01}<i class="peak" aria-hidden="true"></i>{/if}
    {#if ticks}
      {#each DB as db}<i class="db {ticks}" class:zero={db === 0} style:--p={(db + 48) / 48} aria-hidden="true"></i>{/each}
    {/if}
    {#if clipped}
      <!-- The light and 4px round it, reaching out only on the side away from the fader. -->
      <button class="reset {ticks || 'right'}" aria-label="Clear the clip light{what ? `, ${what}` : ''}" onclick={() => (clipped = false)}
        use:tip={() => tipText('This level went over 0 dB', '', 'click to clear')}></button>
    {/if}
  </div>
{:else}
  <div class="meter" aria-hidden="true" style:--l="{fill * 100}%"></div>
{/if}

<style>
  .meter {
    width: 5px;
    height: 100%;
    border-radius: 2px;
    background: #070708;
    position: relative;
    overflow: hidden;
  }
  .meter::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: linear-gradient(to top, var(--go) 0 62%, var(--warn) 62% 82%, var(--kill) 82%);
    clip-path: inset(calc(100% - var(--l)) 0 0 0);
  }

  /* #60 (UI audit flag): a 4px clip light, a 1px gap, then the bar. Colour
     zones follow dBFS on the bar: green under −12, amber to −1, red above. */
  .m60 {
    --top: 5px;
    background: none;
    overflow: visible;
  }
  .m60::after {
    content: none;
  }
  .m60 i {
    position: absolute;
    display: block;
  }
  .m60 .clip {
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 2px 2px 1px 1px;
    background: #070708;
  }
  .m60.clipped .clip {
    background: var(--kill);
  }
  .m60 .bar {
    top: var(--top);
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 1px 1px 2px 2px;
    background: #070708;
  }
  /* No clip light (the master): no space kept for one, the bar is the whole meter. */
  .m60.nolight {
    --top: 0px;
  }
  .m60.nolight .bar {
    border-radius: 2px;
  }
  .m60 .bar::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    /* −12 dBFS is 75% up the bar, −1 dBFS is 97.9%. */
    background: linear-gradient(to top, var(--go) 0 75%, var(--warn) 75% 97.9%, var(--kill) 97.9%);
    clip-path: inset(calc(100% - var(--l)) 0 0 0);
  }
  /* The held peak: a 1px line across the bar. */
  .m60 .peak {
    left: 0;
    right: 0;
    height: 1px;
    top: calc(var(--top) + (100% - var(--top)) * (1 - var(--pk)));
    background: var(--fg);
  }
  /* 0, −6 and −18 dB: 3px marks, 2px clear of the bar; 0 dB longer and brighter. */
  .m60 .db {
    width: 3px;
    height: 1px;
    top: calc(var(--top) + (100% - var(--top)) * (1 - var(--p)));
    background: var(--fg-4);
  }
  .m60 .db.zero {
    width: 5px;
    background: var(--fg-2);
  }
  .m60 .db.right {
    left: calc(100% + 2px);
  }
  .m60 .db.left {
    right: calc(100% + 2px);
  }
  .m60 .reset {
    position: absolute;
    top: -4px;
    height: 12px;
    left: 0;
    right: 0;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    cursor: pointer;
  }
  .m60 .reset.right {
    right: -4px;
  }
  .m60 .reset.left {
    left: -4px;
  }
</style>
