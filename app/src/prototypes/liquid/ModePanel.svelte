<script>
  // The deck's mode panel: tabs for Cues, Loop, FX and Stems over one row of
  // controls, drawn as a toolbar row: words, numbers and small marks, no
  // boxes. Cues are a colour and a time.
  import Dial from '../bold/Dial.svelte';
  import { CUES, mmss } from './perf.js';
  /** @type {{ deck: number, color: string, mode?: string }} */
  let { deck, color, mode = $bindable('Cues') } = $props();
  const MODES = ['Cues', 'Loop', 'FX', 'Stems'];
  const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
  let loop = $state(deck ? 8 : 4);
  let looping = $state(deck === 0);
  let fxBeats = $state(1);
  let fxOn = $state(deck === 1);
  let fxLevel = $state(0.6);
  let on = $state(deck ? [false, true, true, true] : [true, true, true, true]);
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
        <button class="tb" onclick={halve}>½</button>
        <button class="tb" aria-label="Move loop back">‹</button>
        <button class="big" class:live={looping} onclick={() => (looping = !looping)}><b>{frac(loop)}</b><span>{loop > 1 ? 'beats' : 'beat'}</span></button>
        <button class="tb" aria-label="Move loop forward">›</button>
        <button class="tb" onclick={double}>2×</button>
      {:else if mode === 'FX'}
        <button class="tb name">Echo<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4" /></svg></button>
        <span class="sep"></span>
        <button class="tb" aria-label="Fewer beats" onclick={() => (fxBeats = Math.max(0.25, fxBeats / 2))}>‹</button>
        <span class="val"><b>{frac(fxBeats)}</b> {fxBeats > 1 ? 'beats' : 'beat'}</span>
        <button class="tb" aria-label="More beats" onclick={() => (fxBeats = Math.min(8, fxBeats * 2))}>›</button>
        <span class="sep"></span>
        <Dial bind:value={fxLevel} size={20} color={color} glow={0.2} />
        <span class="sep"></span>
        <button class="tb tog" class:live={fxOn} onclick={() => (fxOn = !fxOn)}><i></i>{fxOn ? 'On' : 'Off'}</button>
      {:else}
        {#each STEMS as s, i}
          <button class="ts" class:off={!on[i]} aria-pressed={on[i]} onclick={() => (on[i] = !on[i])}><i></i>{s}</button>
        {/each}
      {/if}

  </div>
</div>

<style>
  .mp { display: grid; gap: 6px; }
  .tabs { display: flex; gap: 18px; padding: 0 2px; border-bottom: 1px solid rgb(255 255 255 / 0.06); }
  .tabs button { position: relative; height: 28px; font-size: 12.5px; color: rgb(236 234 228 / 0.45); }
  .tabs button:hover { color: rgb(236 234 228 / 0.85); }
  .tabs button.on { color: #eceae4; }
  .tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px; background: var(--c); }
  .body { height: 58px; display: flex; align-items: center; }
  .live { color: var(--c) !important; }

  /* text: a toolbar row. */
  .body { justify-content: space-between; padding: 0 2px; }
  .tc { display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 6px; border-radius: 7px; }
  .tc:hover, .tb:hover, .ts:hover { background: rgb(255 255 255 / 0.05); }
  .tc i { width: 8px; height: 8px; border-radius: 50%; background: var(--q); }
  .tc b { font-weight: 500; font-size: 13px; }
  .tc span { font-size: 13px; color: rgb(236 234 228 / 0.55); }
  .tc.empty i { background: none; box-shadow: inset 0 0 0 1px rgb(236 234 228 / 0.3); }
  .tc.empty b, .tc.empty span { color: rgb(236 234 228 / 0.3); }
  .tb { height: 36px; min-width: 36px; padding: 0 8px; border-radius: 7px; font-size: 14px; color: rgb(236 234 228 / 0.75); display: flex; align-items: center; justify-content: center; gap: 6px; }
  .tb svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; opacity: 0.5; }
  .big { display: flex; align-items: baseline; gap: 6px; padding: 0 12px; height: 40px; border-radius: 8px; color: #eceae4; }
  .big b { font-size: 24px; font-weight: 300; letter-spacing: -0.02em; }
  .big span { font-size: 12px; color: rgb(236 234 228 / 0.5); }
  .big.live span { color: inherit; opacity: 0.7; }
  .sep { width: 1px; height: 18px; background: rgb(255 255 255 / 0.08); }
  .val { font-size: 12.5px; color: rgb(236 234 228 / 0.55); }
  .val b { font-weight: 400; font-size: 14px; color: #eceae4; }
  .tog i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1px currentColor; }
  .tog.live i { background: var(--c); box-shadow: none; }
  .ts { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; border-radius: 7px; font-size: 13px; color: #eceae4; }
  .ts i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .ts.off { color: rgb(236 234 228 / 0.35); }
  .ts.off i { background: none; box-shadow: inset 0 0 0 1px rgb(236 234 228 / 0.3); }

</style>
