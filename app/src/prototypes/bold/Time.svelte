<script>
  // Elapsed or remaining time for a deck, ticking with the prototype clock.
  import { onMount } from 'svelte';
  import { decks, clock, onTick, fmt } from './track.js';
  /** @type {{ deck: number, remaining?: boolean }} */
  let { deck, remaining = false } = $props();
  let text = $state('');
  onMount(() => onTick(() => {
    const t = clock.t[deck];
    const next = remaining ? '−' + fmt(decks[deck].data.length - t) : fmt(t);
    if (next !== text) text = next;
  }));
</script>

{text}
