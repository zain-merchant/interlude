<script>
  // The deck's mode panel: tabs for Cues, Loop, FX and Stems over one row of
  // controls. `look` picks how the controls are drawn:
  //  'text'  a toolbar row: words, numbers and small marks, no boxes
  //  'round' round pads and machined dials, like the mixer
  //  'scale' values laid out on a scale, the current one lit
  import Dial from '../bold/Dial.svelte';
  import { CUES, mmss } from './perf.js';
  /** @type {{ deck: number, color: string, mode?: string, look?: 'text'|'round'|'scale' }} */
  let { deck, color, mode = $bindable('Cues'), look = 'text' } = $props();
  const MODES = ['Cues', 'Loop', 'FX', 'Stems'];
  const LENGTHS = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
  const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
  let loop = $state(deck ? 8 : 4);
  let looping = $state(deck === 0);
  let fxBeats = $state(1);
  let fxOn = $state(deck === 1);
  let fxLevel = $state(0.6);
  let on = $state(deck ? [false, true, true, true] : [true, true, true, true]);
  let lv = $state([0.8, 0.9, 0.7, 1]);
  const frac = (b) => (b < 1 ? `1/${1 / b}` : `${b}`);
  const halve = () => (loop = Math.max(1 / 8, loop / 2));
  const double = () => (loop = Math.min(32, loop * 2));
</script>

<div class="mp look-{look}" style:--c={color}>
  <div class="tabs" role="tablist">
    {#each MODES as m}<button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => (mode = m)}>{m}</button>{/each}
  </div>

  <div class="body">
    {#if look === 'text'}
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

    {:else if look === 'round'}
      {#if mode === 'Cues'}
        {#each CUES[deck] as q, i}
          <div class="rcell"><button class="rp" class:empty={!q} style:--q={q?.c}>{i + 1}</button><span>{q ? mmss(q.t) : 'Set'}</span></div>
        {/each}
      {:else if mode === 'Loop'}
        <div class="rcell"><button class="rp sm" onclick={halve}>½</button><span>Halve</span></div>
        <div class="rcell"><button class="rp sm" aria-label="Move loop back">‹</button><span>Back</span></div>
        <div class="rcell"><button class="rp lg" class:live={looping} onclick={() => (looping = !looping)}>{frac(loop)}</button><span>{looping ? 'Looping' : 'Loop'}</span></div>
        <div class="rcell"><button class="rp sm" aria-label="Move loop forward">›</button><span>Forward</span></div>
        <div class="rcell"><button class="rp sm" onclick={double}>2×</button><span>Double</span></div>
      {:else if mode === 'FX'}
        <div class="rcell"><button class="rp sm name">Echo</button><span>Effect</span></div>
        <div class="rcell"><Dial value={0.5} size={30} color={color} glow={0.2} /><span>{frac(fxBeats)} beat</span></div>
        <div class="rcell"><Dial bind:value={fxLevel} size={30} color={color} glow={0.2} /><span>Level</span></div>
        <div class="rcell"><button class="rp sm" class:live={fxOn} onclick={() => (fxOn = !fxOn)}>{fxOn ? 'On' : 'Off'}</button><span>Echo</span></div>
      {:else}
        {#each STEMS as s, i}
          <div class="rcell" class:off={!on[i]}><Dial bind:value={lv[i]} size={30} color={on[i] ? color : '#55555c'} glow={0.2} /><button class="mute" aria-pressed={!on[i]} onclick={() => (on[i] = !on[i])}>{on[i] ? s : 'Muted'}</button></div>
        {/each}
      {/if}

    {:else}
      {#if mode === 'Cues'}
        {#each CUES[deck] as q, i}
          <button class="sc" class:empty={!q} style:--q={q?.c}><b>{i + 1}</b><span>{q ? mmss(q.t) : 'Set cue'}</span></button>
        {/each}
      {:else if mode === 'Loop'}
        <div class="vscale">
          {#each LENGTHS as b}<button class:cur={b === loop} class:live={b === loop && looping} onclick={() => (b === loop ? (looping = !looping) : ((loop = b), (looping = true)))}>{frac(b)}</button>{/each}
        </div>
        <div class="move"><button aria-label="Move loop back">‹</button><button aria-label="Move loop forward">›</button></div>
      {:else if mode === 'FX'}
        <button class="fxname">Echo<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4" /></svg></button>
        <div class="vscale">
          {#each [1 / 4, 1 / 2, 1, 2, 4] as b}<button class:cur={b === fxBeats} onclick={() => (fxBeats = b)}>{frac(b)}</button>{/each}
        </div>
        <button class="switch" class:live={fxOn} aria-pressed={fxOn} onclick={() => (fxOn = !fxOn)}><i></i></button>
      {:else}
        {#each STEMS as s, i}
          <button class="ss" class:off={!on[i]} aria-pressed={on[i]} onclick={() => (on[i] = !on[i])}><span>{s}</span><span class="switch" class:live={on[i]}><i></i></span></button>
        {/each}
      {/if}
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
  .look-text .body { justify-content: space-between; padding: 0 2px; }
  .tc { display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 6px; border-radius: 7px; }
  .tc:hover, .tb:hover, .ts:hover { background: rgb(255 255 255 / 0.05); }
  .tc i { width: 8px; height: 8px; border-radius: 50%; background: var(--q); }
  .tc b { font-weight: 500; font-size: 13px; }
  .tc span { font-size: 13px; color: rgb(236 234 228 / 0.55); }
  .tc.empty i { background: none; box-shadow: inset 0 0 0 1px rgb(236 234 228 / 0.3); }
  .tc.empty b, .tc.empty span { color: rgb(236 234 228 / 0.3); }
  .tb { height: 36px; min-width: 36px; padding: 0 8px; border-radius: 7px; font-size: 14px; color: rgb(236 234 228 / 0.75); display: flex; align-items: center; justify-content: center; gap: 6px; }
  .tb svg, .fxname svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; opacity: 0.5; }
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

  /* round: pads and dials, each with a caption underneath. */
  .look-round .body { justify-content: space-around; }
  .rcell { display: grid; justify-items: center; gap: 4px; }
  .rcell > span, .mute { font-size: 11px; color: rgb(236 234 228 / 0.5); }
  .rcell :global(.dialwrap) { margin: -9px 0 -11px; }
  .rp { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 13px;
    background: radial-gradient(circle at 50% 35%, #2e2f34, #1d1e21 70%); box-shadow: 0 0 0 1px #050506, 0 0 0 3px color-mix(in srgb, var(--q, transparent) 70%, transparent), 0 3px 6px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.08); }
  .rp.empty { background: none; color: rgb(236 234 228 / 0.35); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12); }
  .rp.sm { width: 32px; height: 32px; font-size: 13px; color: rgb(236 234 228 / 0.8); }
  .rp.lg { width: 40px; height: 40px; font-size: 15px; }
  .rp.lg.live { box-shadow: 0 0 0 1px #050506, 0 0 0 3px color-mix(in srgb, var(--c) 70%, transparent), 0 3px 6px rgb(0 0 0 / 0.5); }
  .rp.name { width: auto; padding: 0 12px; border-radius: 16px; font-size: 12px; }
  .rcell.off .mute { color: #ef7a64; }

  /* scale: the choices laid out, the current one lit. */
  .look-scale .body { gap: 14px; }
  .sc { flex: 1; display: grid; justify-items: start; gap: 2px; padding: 6px 2px 8px; border-bottom: 2px solid var(--q); text-align: left; }
  .sc b { font-size: 11px; font-weight: 400; color: rgb(236 234 228 / 0.45); }
  .sc span { font-size: 15px; }
  .sc.empty { border-bottom: 2px dashed rgb(255 255 255 / 0.15); }
  .sc.empty span { color: rgb(236 234 228 / 0.35); font-size: 13px; }
  .vscale { flex: 1; display: flex; justify-content: space-between; align-items: center; }
  div.vscale button { position: relative; min-width: 26px; height: 32px; font-size: 13px; color: rgb(236 234 228 / 0.45); }
  div.vscale button::before { content: ''; position: absolute; left: 50%; top: 0; width: 1px; height: 5px; background: rgb(255 255 255 / 0.2); }
  div.vscale button:hover { color: #eceae4; }
  div.vscale button.cur { color: #eceae4; font-weight: 500; }
  div.vscale button.cur::before { width: 2px; margin-left: -0.5px; height: 7px; background: #eceae4; }
  div.vscale button.live { color: var(--c); }
  div.vscale button.live::before { background: var(--c); }
  .move { display: flex; gap: 2px; }
  .move button { width: 28px; height: 32px; border-radius: 6px; color: rgb(236 234 228 / 0.7); }
  .fxname { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .switch { width: 30px; height: 18px; border-radius: 9px; background: rgb(255 255 255 / 0.1); position: relative; flex: none; display: block; }
  .switch i { position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #9a9890; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
  .switch.live { background: color-mix(in srgb, var(--c) 45%, #1a1a1d); }
  .switch.live i { transform: translateX(12px); background: #eceae4; }
  .ss { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px; font-size: 13px; }
  .ss.off > span:first-child { color: rgb(236 234 228 / 0.35); }
</style>
