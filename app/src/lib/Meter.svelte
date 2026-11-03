<script>
  /** A vertical LED-style level meter. `level` is linear peak, 0..1. */
  let { level = 0, segments = 16 } = $props();
  // Map -48..0 dBFS onto the meter.
  const lit = $derived(Math.round(Math.max(0, Math.min(1, (20 * Math.log10(Math.max(level, 1e-6)) + 48) / 48)) * segments));
</script>

<div class="meter" aria-hidden="true">
  {#each Array(segments) as _, i}
    {@const n = segments - i}
    <span class:on={n <= lit} class:hot={n > segments - 2} class:warm={n > segments - 5 && n <= segments - 2}></span>
  {/each}
</div>

<style>
  .meter {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 6px;
    height: 100%;
  }
  span {
    flex: 1;
    border-radius: 1px;
    background: #1e2128;
  }
  span.on {
    background: var(--ok);
  }
  span.on.warm {
    background: #ffd23d;
  }
  span.on.hot {
    background: var(--danger);
  }
</style>
