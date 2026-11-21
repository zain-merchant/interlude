<script>
  // A machined tick scale, the straight cousin of the dial's ring. Ticks up
  // to `value` light in `color`; with `from` set they light from that point.
  /** @type {{ value?: number, from?: number, n?: number, major?: number, color?: string, height?: number, label?: boolean }} */
  let { value = 0.5, from = 0, n = 97, major = 8, color = '#3db4ff', height = 14 } = $props();
  const lo = $derived(Math.min(from, value));
  const hi = $derived(Math.max(from, value));
  const on = (i) => { const p = i / (n - 1); return p >= lo - 1e-6 && p <= hi + 1e-6; };
</script>

<svg class="ruler" viewBox="0 0 {n - 1} {height}" preserveAspectRatio="none" style:--c={color} style:height="{height}px" aria-hidden="true">
  <!-- Lit ticks glow as one group: one filter, not one per tick. -->
  {#each Array(n) as _, i}
    {#if !on(i)}<line x1={i} x2={i} y1={i % major === 0 ? 0 : height * 0.4} y2={height} class:big={i % major === 0} vector-effect="non-scaling-stroke" />{/if}
  {/each}
  <g class="lit">
    {#each Array(n) as _, i}
      {#if on(i)}<line x1={i} x2={i} y1={i % major === 0 ? 0 : height * 0.4} y2={height} class="on" class:big={i % major === 0} vector-effect="non-scaling-stroke" />{/if}
    {/each}
  </g>
</svg>

<style>
  .ruler { display: block; width: 100%; overflow: visible; }
  line { stroke: rgb(255 255 255 / 0.16); stroke-width: 1.2; }
  line.big { stroke: rgb(255 255 255 / 0.3); }
  line.on { stroke: var(--c); stroke-width: 1.6; }
  .lit { filter: drop-shadow(0 0 2px var(--c)); }
</style>
