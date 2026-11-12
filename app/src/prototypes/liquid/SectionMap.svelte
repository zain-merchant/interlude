<script>
  // Track Map: the track as its sections (Intro, Build, Drop...) instead of
  // a pad bar. Hot cues are flags on the map; click a section to jump to it.
  // Below, "Drop in 6 bars" counts down to the next section beat by beat.
  import { onMount } from 'svelte';
  import { decks, clock, onTick } from '../bold/track.js';
  import { SECTIONS, CUES } from './perf.js';
  /** @type {{ deck: number, color: string }} */
  let { deck, color } = $props();
  const d = decks[deck];
  const L = d.data.length;
  const bar = d.data.beat * 4;
  let t = $state(clock.t[deck]);
  onMount(() => onTick(() => { const n = Math.round(clock.t[deck] * 20) / 20; if (n !== t) t = n; }));
  const cur = $derived(SECTIONS[deck].findIndex(([a, b]) => t >= a && t < b));
  const next = $derived(SECTIONS[deck][cur + 1]);
  const beatsLeft = $derived(next ? Math.max(0, Math.ceil((next[0] - t) / d.data.beat)) : 0);
  const barsLeft = $derived(Math.ceil(beatsLeft / 4));
</script>

<div class="map" style:--c={color}>
  <div class="secs">
    {#each SECTIONS[deck] as [a, b, name, e], i}
      <button class="sec" class:now={i === cur} class:past={b <= t} style:flex-grow={b - a} style:--e={e}>
        <span>{name}</span>
      </button>
    {/each}
    <i class="head" style:left="{(t / L) * 100}%"></i>
    {#each CUES[deck] as q, i}{#if q}<span class="flag" style:left="{(q.t / L) * 100}%" style:--q={q.c}><b>{i + 1}</b></span>{/if}{/each}
  </div>
  {#if next}
    <div class="next">
      <span class="lbl"><b>{next[2]}</b> in {barsLeft} {barsLeft === 1 ? 'bar' : 'bars'}</span>
      <div class="count">{#each Array(16) as _, i}<i class:on={i >= 16 - Math.min(16, beatsLeft)} class:bar={i % 4 === 0}></i>{/each}</div>
      <button class="go">Jump to {next[2]}</button>
    </div>
  {/if}
</div>

<style>
  .map { display: grid; gap: 12px; }
  .secs { position: relative; display: flex; gap: 2px; height: 58px; padding-top: 14px; }
  .sec { position: relative; min-width: 0; border-radius: 5px; padding: 0 8px; display: flex; align-items: end; padding-bottom: 6px; text-align: left;
    background: color-mix(in srgb, var(--c) calc(var(--e) * 28%), #1a1a1d); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.04); }
  .sec span { font-size: 11.5px; color: rgb(236 234 228 / 0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sec.past { filter: brightness(0.6); }
  .sec.now { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 70%, transparent); }
  .sec.now span { color: #eceae4; }
  .sec:hover { filter: brightness(1.2); }
  .head { position: absolute; top: 10px; bottom: -4px; width: 2px; margin-left: -1px; background: #eceae4; border-radius: 1px; pointer-events: none; }
  .flag { position: absolute; top: 0; width: 2px; height: 18px; margin-left: -1px; background: var(--q); pointer-events: none; }
  .flag b { position: absolute; left: 2px; top: 0; height: 12px; padding: 0 4px; border-radius: 0 3px 3px 0; background: var(--q); color: #111; font-size: 9.5px; line-height: 12px; }
  .next { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; }
  .lbl { font-size: 13px; color: rgb(236 234 228 / 0.6); white-space: nowrap; }
  .lbl b { color: #eceae4; font-weight: 500; }
  .count { display: flex; gap: 3px; }
  .count i { flex: 1; height: 6px; border-radius: 2px; background: rgb(255 255 255 / 0.07); }
  .count i.bar { margin-left: 4px; }
  .count i.on { background: var(--c); }
  .go { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; color: rgb(236 234 228 / 0.8); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); }
</style>
