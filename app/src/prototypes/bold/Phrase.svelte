<script>
  // 16 beats of the current 4-bar phrase; the current beat is lit, the
  // phrase's downbeats are marked. Ticks with the prototype clock.
  import { onMount } from 'svelte';
  import { decks, clock, onTick } from './track.js';
  /** @type {{ deck: number, look?: 'pill'|'dot'|'block' }} */
  let { deck, look = 'pill' } = $props();
  let beat = $state(0);
  let bar = $state(0);
  onMount(() => onTick(() => {
    const b = Math.floor(clock.t[deck] / decks[deck].data.beat);
    if (b % 16 !== beat) beat = b % 16;
    const br = Math.floor(b / 4) + 1;
    if (br !== bar) bar = br;
  }));
</script>

<div class="phrase {look}">
  {#each Array(16) as _, i}<i class:on={i <= beat} class:now={i === beat} class:down={i % 4 === 0}></i>{/each}
  <span>bar {bar}</span>
</div>

<style>
  .phrase { display: flex; align-items: center; gap: 3px; font-size: 11px; color: rgb(236 236 234 / 0.5); }
  .phrase span { margin-left: 8px; font-variant-numeric: tabular-nums; min-width: 44px; }
  i { flex: 1; height: 4px; border-radius: 2px; background: rgb(255 255 255 / 0.07); }
  i.down { background: rgb(255 255 255 / 0.12); }
  i:nth-child(4n + 1) { margin-left: 4px; }
  i.on { background: color-mix(in srgb, var(--c, #ececea) 45%, transparent); }
  i.now { background: var(--c, #ececea); box-shadow: 0 0 8px var(--c, #ececea); }
  .dot i { flex: none; width: 6px; height: 6px; border-radius: 50%; }
  .block i { height: 10px; border-radius: 1px; }
</style>
