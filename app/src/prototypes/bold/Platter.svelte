<script>
  // A platter: the whole track as a ring of spokes, a slowly turning disc
  // with engraved grooves inside it, and the deck's numbers in the middle.
  import { onMount } from 'svelte';
  import Wave from './Wave.svelte';
  import Time from './Time.svelte';
  import { decks, clock, onTick } from './track.js';
  // cues: hot cue times (s), drawn as amber marks across the track ring.
  // phrase: a ring of 16 beats around the disc, lit up to the current beat,
  // so you can see where the next phrase lands. The disc can be dragged to
  // nudge the track (visual only in the prototype).
  /** @type {{ deck: number, color: string, size?: number, cues?: number[], phrase?: boolean }} */
  let { deck, color, size = 320, cues = [], phrase = false } = $props();
  let disc;
  let beat = $state(0);
  let nudge = 0, drag = null;
  onMount(() => onTick(() => {
    // 33⅓ rpm.
    disc && (disc.style.transform = `rotate(${(clock.t[deck] * 200 + nudge) % 360}deg)`);
    const b = Math.floor(clock.t[deck] / decks[deck].data.beat) % 16;
    if (b !== beat) beat = b;
  }));
  const angleAt = (e) => {
    const r = disc.getBoundingClientRect();
    return (Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180) / Math.PI;
  };
  const down = (e) => { drag = angleAt(e); disc.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag === null) return; const a = angleAt(e); nudge += a - drag; drag = a; };
  const up = () => (drag = null);
  const d = decks[deck];
  const len = d.data.length;
  const pt = (f, r) => [Math.cos(f * Math.PI * 2 - Math.PI / 2) * r, Math.sin(f * Math.PI * 2 - Math.PI / 2) * r];
</script>

<div class="platter" style:--c={color} style:--s="{size}px">
  <div class="spokes"><Wave {deck} kind="radial" opts={{ played: color, ahead: 'rgba(236,236,234,0.55)', inner: 0.8, spokes: 180, spokeW: 2, pad: 4, glow: true, headGlow: color }} /></div>
  <div class="disc" bind:this={disc} role="slider" aria-label="Nudge" aria-valuenow={0} tabindex="0"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}><i></i></div>
  <svg class="marks" viewBox="{-size / 2} {-size / 2} {size} {size}" aria-hidden="true">
    {#each cues as c, i}
      {@const a = pt(c / len, size * 0.4 - 4)}
      {@const b = pt(c / len, size / 2 - 1)}
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="cue" />
      {@const n = pt(c / len, size / 2 + 9)}
      <text x={n[0]} y={n[1]} class="cn">{i + 1}</text>
    {/each}
    {#if phrase}
      {#each Array(16) as _, i}
        {@const r = size * 0.372}
        {@const gap = i % 4 === 3 ? 0.012 : 0.004}
        {@const a0 = i / 16 + 0.002}
        {@const a1 = (i + 1) / 16 - gap}
        {@const p0 = pt(a0, r)}
        {@const p1 = pt(a1, r)}
        <path d="M {p0[0]} {p0[1]} A {r} {r} 0 0 1 {p1[0]} {p1[1]}" class="ph" class:on={i <= beat} class:now={i === beat} />
      {/each}
    {/if}
  </svg>
  <div class="center">
    <span class="bpm">{d.bpm}.00</span>
    <span class="el"><Time {deck} /></span>
    <span class="rm"><Time {deck} remaining /></span>
  </div>
</div>

<style>
  .platter { position: relative; width: var(--s); height: var(--s); display: grid; place-items: center; }
  .spokes { position: absolute; inset: 0; }
  .marks { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .cue { stroke: #f6c45a; stroke-width: 2.5; stroke-linecap: round; filter: drop-shadow(0 0 3px rgb(246 196 90 / 0.6)); }
  .cn { fill: #f6c45a; font-size: 10px; text-anchor: middle; dominant-baseline: central; }
  .ph { fill: none; stroke: rgb(255 255 255 / 0.1); stroke-width: 4; stroke-linecap: butt; }
  .ph.on { stroke: color-mix(in srgb, var(--c) 55%, transparent); }
  .ph.now { stroke: var(--c); filter: drop-shadow(0 0 4px var(--c)); }
  .disc {
    cursor: grab;
    touch-action: none;
    position: absolute;
    inset: 15%;
    border-radius: 50%;
    background:
      repeating-radial-gradient(circle, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 4px),
      radial-gradient(circle at 50% 50%, #17171b 0 38%, #0d0d10 39% 100%);
    box-shadow: 0 0 0 1px #000, 0 0 0 2px rgb(255 255 255 / 0.04), inset 0 0 40px rgb(0 0 0 / 0.8), 0 18px 40px rgb(0 0 0 / 0.6);
  }
  .disc::before {
    content: ''; position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(from 30deg, transparent 0 40deg, rgb(255 255 255 / 0.06) 60deg, transparent 80deg 220deg, rgb(255 255 255 / 0.04) 240deg, transparent 260deg);
  }
  .disc i {
    position: absolute; left: 50%; top: 3%; width: 3px; height: 14%; margin-left: -1.5px; border-radius: 2px;
    background: var(--c); box-shadow: 0 0 10px var(--c);
  }
  .center { position: relative; display: grid; justify-items: center; gap: 2px; pointer-events: none; }
  .bpm { font-size: 13px; color: color-mix(in srgb, var(--c) 60%, #ececea); letter-spacing: 0.02em; }
  .el { font-size: 34px; letter-spacing: -0.03em; line-height: 1.05; }
  .rm { font-size: 14px; color: rgb(236 236 234 / 0.5); }
</style>
