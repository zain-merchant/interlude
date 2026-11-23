<script>
  // Short, ordered steps: minus, what it's at, plus. One component for
  // Display's size and the stems cache; style.css draws it, on 110's tokens.
  /** @type {{ value: string, less: () => void, more: () => void, atLeast: boolean, atMost: boolean, lessLabel: string, moreLabel: string }} */
  let { value, less, more, atLeast, atMost, lessLabel, moreLabel } = $props();
</script>

<div class="sstep">
  <button class="btn sm" onclick={less} disabled={atLeast} aria-label={lessLabel}>−</button>
  <span class="num" aria-live="polite">{value}</span>
  <button class="btn sm" onclick={more} disabled={atMost} aria-label={moreLabel}>+</button>
</div>
