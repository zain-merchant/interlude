<script>
  // Stem Lanes: the overview splits into the track's four stems, each its
  // own lane with a mute and a level, like Traktor's stem decks or djay's
  // Neural Mix. Hot cues stay as flags across all four lanes.
  import Wave from '../bold/Wave.svelte';
  import { decks } from '../bold/track.js';
  import { CUES } from './perf.js';
  /** @type {{ deck: number, color: string, bands: Record<string, string> }} */
  let { deck, color, bands } = $props();
  const L = decks[deck].data.length;
  const off = '#000000';
  // Prototype stand-ins: each stem drawn from the band that carries it.
  const lanes = [
    { n: 'Vocals', o: { low: off, mid: off, high: bands.high } },
    { n: 'Melody', o: { low: off, mid: bands.mid, high: off } },
    { n: 'Bass', o: { low: bands.low, mid: off, high: off } },
    { n: 'Drums', o: { low: bands.mid, mid: off, high: bands.high } },
  ];
  let on = $state(deck ? [false, true, true, true] : [true, true, true, true]);
  let lvl = $state([0.8, 0.9, 0.7, 1]);
</script>

<div class="stems" style:--c={color}>
  {#each lanes as l, i}
    <div class="lane" class:off={!on[i]}>
      <button class="name" aria-pressed={on[i]} onclick={() => (on[i] = !on[i])}><i></i>{l.n}</button>
      <div class="w"><Wave {deck} kind="overview" opts={{ ...l.o, past: 'rgba(12,12,14,0.55)', head: '#eceae4' }} />
        {#each CUES[deck] as q}{#if q}<i class="flag" style:left="{(q.t / L) * 100}%" style:--q={q.c}></i>{/if}{/each}
      </div>
      <div class="lv" style:--v={lvl[i]}><span></span></div>
    </div>
  {/each}
</div>

<style>
  .stems { display: grid; gap: 3px; }
  .lane { display: grid; grid-template-columns: 74px 1fr 46px; align-items: center; gap: 8px; height: 30px; }
  .name { display: flex; align-items: center; gap: 7px; height: 26px; font-size: 12px; color: rgb(236 234 228 / 0.8); text-align: left; }
  .name i { width: 8px; height: 8px; border-radius: 2px; background: var(--c); }
  .off .name { color: rgb(236 234 228 / 0.35); }
  .off .name i { background: transparent; box-shadow: inset 0 0 0 1px rgb(236 234 228 / 0.35); }
  .w { position: relative; height: 26px; border-radius: 4px; overflow: hidden; background: #0e0e10; }
  .off .w { opacity: 0.25; }
  .flag { position: absolute; top: 0; bottom: 0; width: 1.5px; background: var(--q); opacity: 0.85; }
  .lv { height: 4px; border-radius: 2px; background: rgb(255 255 255 / 0.08); position: relative; }
  .lv span { position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--v) * 100%); border-radius: 2px; background: rgb(236 234 228 / 0.6); }
  .off .lv span { background: rgb(236 234 228 / 0.2); }
</style>
