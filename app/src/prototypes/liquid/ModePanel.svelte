<script>
  import { untrack } from 'svelte';
  // The deck's mode panel: tabs for Cues, Loop, FX and Stems over one row of
  // controls, drawn as a toolbar row: words, numbers and small marks, no
  // boxes. Cues are a colour and a time.
  import Dial from '../bold/Dial.svelte';
  import { CUES, mmss } from './perf.js';
  /** @type {{ deck: number, color: string, mode?: string }} */
  let { deck, color, mode = $bindable('Cues') } = $props();
  // Each panel starts from its deck's demo state; it doesn't follow `deck` after that.
  const first = untrack(() => deck);
  const MODES = ['Cues', 'Loop', 'FX', 'Stems'];
  const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
  let loop = $state(first ? 8 : 4);
  let looping = $state(first === 0);
  let fxBeats = $state(1);
  let fxOn = $state(first === 1);
  let fxLevel = $state(0.6);
  let on = $state(first ? [false, true, true, true] : [true, true, true, true]);
  const frac = (b) => (b < 1 ? `1/${1 / b}` : `${b}`);
  const halve = () => (loop = Math.max(1 / 8, loop / 2));
  const double = () => (loop = Math.min(32, loop * 2));
</script>

<div class="mp" style:--c={color}>
  <div class="tabs" role="tablist">
    {#each MODES as m}<button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => (mode = m)}>{m}</button>{/each}
  </div>

  <div class="body">
      {#if mode === 'Cues'}
        {#each CUES[deck] as q, i}
          <button class="tc" class:empty={!q} style:--q={q?.c}><i></i><b>{i + 1}</b><span>{q ? mmss(q.t) : 'Set'}</span></button>
        {/each}
      {:else if mode === 'Loop'}
        <div class="grp">
        <button class="tb" onclick={halve}>½</button>
        <button class="tb ar" aria-label="Move loop back">‹</button>
        <button class="big" class:live={looping} onclick={() => (looping = !looping)}><b>{frac(loop)}</b><span>{loop > 1 ? 'beats' : 'beat'}</span></button>
        <button class="tb ar" aria-label="Move loop forward">›</button>
        <button class="tb" onclick={double}>2×</button>
        </div>
      {:else if mode === 'FX'}
        <div class="grp">
        <button class="tb name">Echo<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4" /></svg></button>
        <span class="sep"></span>
        <button class="tb ar" aria-label="Fewer beats" onclick={() => (fxBeats = Math.max(0.25, fxBeats / 2))}>‹</button>
        <span class="val"><b>{frac(fxBeats)}</b> {fxBeats > 1 ? 'beats' : 'beat'}</span>
        <button class="tb ar" aria-label="More beats" onclick={() => (fxBeats = Math.min(8, fxBeats * 2))}>›</button>
        <span class="sep"></span>
        <Dial bind:value={fxLevel} size={20} color={color} glow={0.2} />
        <span class="sep"></span>
        <button class="tb tog" class:live={fxOn} onclick={() => (fxOn = !fxOn)}><i></i>{fxOn ? 'On' : 'Off'}</button>
        </div>
      {:else}
        {#each STEMS as s, i}
          <button class="ts" class:off={!on[i]} aria-pressed={on[i]} onclick={() => (on[i] = !on[i])}><i></i>{s}</button>
        {/each}
      {/if}

  </div>
</div>

<style>
  /* Tabs, the mode row and the transport below all sit on the deck's four
     columns, so their edges line up and the tab bar spans the full width. */
  .mp { display: grid; gap: 8px; }
  .tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; border-bottom: 1px solid var(--line); }
  .tabs button { position: relative; height: 32px; font-size: var(--t-sm); color: var(--fg-3); }
  .tabs button:hover { color: var(--fg); }
  .tabs button.on { color: var(--fg); }
  .tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px; background: var(--c); }
  .body { height: 48px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; align-items: center; }
  .body > * { justify-self: center; }
  .live { color: var(--c) !important; }

  .tc, .tb, .ts { display: flex; align-items: center; justify-content: center; gap: 8px; height: var(--h-md); padding: 0 8px; border-radius: var(--r); font-size: var(--t-sm); }
  .tc:hover, .tb:hover, .ts:hover { background: var(--hover); }
  .tc i, .ts i { width: 8px; height: 8px; border-radius: 50%; }
  .tc i { background: var(--q); }
  .tc b { font-weight: 500; }
  .tc span { color: var(--fg-2); }
  .tc.empty i, .ts.off i { background: none; box-shadow: inset 0 0 0 1px var(--fg-off); }
  .tc.empty b, .tc.empty span { color: var(--fg-off); }

  /* Loop and FX: one centred group that spans the four columns. */
  .grp { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .tb { min-width: var(--h-md); color: var(--fg-2); }
  .tb.ar { font-size: var(--t-md); }
  .tb svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; opacity: 0.6; }
  .big { display: flex; align-items: baseline; gap: 8px; padding: 0 12px; height: 40px; border-radius: var(--r); color: var(--fg); }
  .big:hover { background: var(--hover); }
  .big b { font-size: var(--t-lg); font-weight: 300; letter-spacing: -0.02em; }
  .big span { font-size: var(--t-xs); color: var(--fg-3); }
  .big.live span { color: inherit; opacity: 0.7; }
  .sep { width: 1px; height: 16px; background: var(--line); }
  .val { font-size: var(--t-xs); color: var(--fg-3); }
  .val b { font-weight: 400; font-size: var(--t-sm); color: var(--fg); }
  .tog i { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1px currentColor; }
  .tog.live i { background: var(--c); box-shadow: none; }
  .ts { color: var(--fg); }
  .ts i { background: var(--c); }
  .ts.off { color: var(--fg-off); }
</style>
