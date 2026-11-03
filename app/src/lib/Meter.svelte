<script>
  /** A thin level meter, filled from the bottom. `level` is linear peak, 0..1. */
  let { level = 0 } = $props();
  // Map -48..0 dBFS onto the meter: green to 62%, amber to 82%, red above.
  const fill = $derived(Math.max(0, Math.min(1, (20 * Math.log10(Math.max(level, 1e-6)) + 48) / 48)));
</script>

<div class="meter" aria-hidden="true" style:--l="{fill * 100}%"></div>

<style>
  .meter {
    width: 4px;
    height: 100%;
    border-radius: 2px;
    background: var(--line);
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
</style>
