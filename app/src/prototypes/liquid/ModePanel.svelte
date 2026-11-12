<script>
  // The deck's mode panel. One rule for every mode: four equal cells on the
  // same grid as the tabs above them and the transport below, each cell
  // with a small label on top and its value underneath.
  import { CUES } from './perf.js';
  /** @type {{ deck: number, color: string, mode?: string }} */
  let { deck, color, mode = $bindable('Cues') } = $props();
  const MODES = ['Cues', 'Loop', 'FX', 'Stems'];
  let loop = $state(deck ? 8 : 4);
  let looping = $state(deck === 0);
  let fxBeats = $state(1);
  let fxOn = $state(deck === 1);
  let stems = $state(deck ? [false, true, true, true] : [true, true, true, true]);
  const lv = [0.8, 0.9, 0.7, 1];
  const fmtLoop = (b) => (b < 1 ? `1/${1 / b}` : `${b}`);
</script>

<div class="panel" style:--c={color}>
  <div class="tabs" role="tablist">
    {#each MODES as m}<button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => (mode = m)}>{m}</button>{/each}
  </div>
  <div class="cells">
    {#if mode === 'Cues'}
      {#each CUES[deck] as q, i}
        {#if q}
          <button class="cell cue" style:--q={q.c}><span class="l">{i + 1}</span><span class="v">{q.n}</span></button>
        {:else}
          <button class="cell empty"><span class="l">{i + 1}</span><span class="v">Set cue</span></button>
        {/if}
      {/each}
    {:else if mode === 'Loop'}
      <button class="cell" onclick={() => (loop = Math.max(1 / 8, loop / 2))}><span class="l">Halve</span><span class="v">½</span></button>
      <button class="cell" class:on={looping} onclick={() => (looping = !looping)}><span class="l">{looping ? 'Looping' : 'Loop'}</span><span class="v">{fmtLoop(loop)} {loop > 1 ? 'beats' : 'beat'}</span></button>
      <button class="cell" onclick={() => (loop = Math.min(32, loop * 2))}><span class="l">Double</span><span class="v">2×</span></button>
      <div class="cell split"><span class="l">Move</span><span class="v"><button aria-label="Move loop back">‹</button><button aria-label="Move loop forward">›</button></span></div>
    {:else if mode === 'FX'}
      <button class="cell"><span class="l">Effect</span><span class="v">Echo<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4" /></svg></span></button>
      <div class="cell split"><span class="l">Beats</span><span class="v"><button aria-label="Fewer beats" onclick={() => (fxBeats = Math.max(0.25, fxBeats / 2))}>‹</button><b>{fmtLoop(fxBeats)}</b><button aria-label="More beats" onclick={() => (fxBeats = Math.min(8, fxBeats * 2))}>›</button></span></div>
      <div class="cell"><span class="l">Level</span><span class="v bar" style:--v={0.6}><i></i></span></div>
      <button class="cell" class:on={fxOn} onclick={() => (fxOn = !fxOn)}><span class="l">Echo</span><span class="v">{fxOn ? 'On' : 'Off'}</span></button>
    {:else}
      {#each ['Vocals', 'Melody', 'Bass', 'Drums'] as s, i}
        <button class="cell stem" class:muted={!stems[i]} aria-pressed={stems[i]} onclick={() => (stems[i] = !stems[i])}>
          <span class="l">{s}</span><span class="v bar" style:--v={stems[i] ? lv[i] : 0}><i></i></span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* The panel is one object: a recessed tray with the tabs on its top edge. */
  .panel { border-radius: 10px; background: #0f0f11; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); padding: 4px; }
  .tabs, .cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .tabs button { height: 26px; border-radius: 6px; font-size: 12px; color: rgb(236 234 228 / 0.5); position: relative; }
  .tabs button:hover { color: rgb(236 234 228 / 0.85); }
  .tabs button.on { color: #eceae4; }
  .tabs button.on::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 16px; margin-left: -8px; height: 2px; border-radius: 1px; background: var(--c); }
  .cells { margin-top: 4px; }

  .cell { height: 46px; padding: 0 10px; border-radius: 7px; display: grid; align-content: center; gap: 2px; text-align: left; position: relative; overflow: hidden;
    background: #18181b; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.04); }
  button.cell:hover { background: #1c1c20; }
  .l { font-size: 11px; color: rgb(236 234 228 / 0.45); }
  .v { font-size: 13.5px; color: #eceae4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .v svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; opacity: 0.5; }

  .cue::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 2px 2px 0; background: var(--q); }
  .empty { background: none; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); }
  .empty .v { color: rgb(236 234 228 / 0.35); }
  .cell.on { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent); }
  .cell.on .l { color: var(--c); }

  .split .v { justify-content: space-between; }
  .split .v button { width: 26px; height: 20px; border-radius: 5px; color: rgb(236 234 228 / 0.7); }
  .split .v button:hover { background: rgb(255 255 255 / 0.06); }
  .split .v b { font-weight: 400; }
  .bar { height: 18px; }
  .bar i { display: block; width: 100%; height: 4px; border-radius: 2px; background: linear-gradient(90deg, var(--c) calc(var(--v) * 100%), rgb(255 255 255 / 0.08) 0); }
  .stem.muted .l { color: rgb(236 234 228 / 0.3); text-decoration: line-through; }
</style>
