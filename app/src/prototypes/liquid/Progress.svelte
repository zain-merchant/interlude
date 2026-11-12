<script>
  // Track position as a tick ruler, ticking with the prototype clock.
  import { onMount } from 'svelte';
  import Ruler from './Ruler.svelte';
  import { decks, clock, onTick } from '../bold/track.js';
  /** @type {{ deck: number, color: string, n?: number, height?: number }} */
  let { deck, color, n = 121, height = 12 } = $props();
  let v = $state(0);
  onMount(() => onTick(() => {
    const next = Math.round((clock.t[deck] / decks[deck].data.length) * 400) / 400;
    if (next !== v) v = next;
  }));
</script>

<Ruler value={v} {color} {n} {height} major={10} />
