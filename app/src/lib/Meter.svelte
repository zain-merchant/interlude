<script>
  import { flag, setting } from '../flags/registry.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { untrack } from 'svelte';

  /**
   * A thin level meter, filled from the bottom. `level` is linear peak, 0..1.
   * #60 (UI audit flag) adds, while `meters` is on: `ticks` ('left' |
   * 'right') draws the 0, −6 and −18 dB marks on that side; `over` latches
   * the clip light as well (the master's limiter catching a peak); `what`
   * names the meter in the clip light's tooltip.
   * @type {{ level?: number, ticks?: 'left' | 'right' | '', over?: boolean, what?: string }}
   */
  let { level = 0, ticks = '', over = false, what = '' } = $props();
  // Map -48..0 dBFS onto the meter: green to 62%, amber to 82%, red above.
  const fill = $derived(Math.max(0, Math.min(1, (20 * Math.log10(Math.max(level, 1e-6)) + 48) / 48)));

  // #60 (UI audit flag): peak hold and clip latch. The held peak stays put
  // for a moment (the setting, 1.5 s by default), then drops to the level
  // now; a level at 0 dBFS (or `over`) lights the clip light until clicked.
  const on = $derived(flag('meters'));
  let peak = $state(0);
  let clipped = $state(false);
  let hold;
  $effect(() => {
    if (!on) return;
    const f = fill;
    if (level >= 0.999 || over) clipped = true;
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
  <!-- #60 (UI audit flag): clip light on top, the bar under it, peak hold and dB marks. -->
  <div class="meter m60" class:clipped style:--l="{fill * 100}%" style:--pk="{peak * 100}%">
    <i class="clip" aria-hidden="true"></i>
    <i class="bar" aria-hidden="true"></i>
    {#if peak > 0.01}<i class="peak" aria-hidden="true"></i>{/if}
    {#if ticks}
      {#each DB as db}<i class="db {ticks}" style:--p="{(db + 48) / 48}" aria-hidden="true"></i>{/each}
    {/if}
    {#if clipped}
      <button class="reset" aria-label="Clear the clip light{what ? `, ${what}` : ''}" onclick={() => (clipped = false)}
        use:tip={() => tipText(over ? 'The limiter caught a peak here' : 'This level reached 0 dB', '', 'click to clear')}></button>
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
    top: calc(var(--top) + (100% - var(--top)) * (1 - var(--pk) / 100%));
    background: var(--fg);
  }
  /* 0, −6 and −18 dB: 3px marks, 2px clear of the bar. */
  .m60 .db {
    width: 3px;
    height: 1px;
    top: calc(var(--top) + (100% - var(--top)) * (1 - var(--p)));
    background: var(--fg-4);
  }
  .m60 .db.right {
    left: calc(100% + 2px);
  }
  .m60 .db.left {
    right: calc(100% + 2px);
  }
  .m60 .reset {
    position: absolute;
    inset: 0 -4px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    cursor: pointer;
  }
</style>
