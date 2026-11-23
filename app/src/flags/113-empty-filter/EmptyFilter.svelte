<script>
  // Your tempos, and the range the filter asks for. Live: its two ends drag.
  import { setting } from '../registry.svelte.js';

  /** @type {{ tracks: any[], filter: any, count: number, setFilter: (f: any) => void, clear: () => void, held: boolean }} */
  let { tracks, filter, count, setFilter, clear, held = $bindable(false) } = $props();

  const live = $derived(setting('empty-filter', 'kind') === 'live');
  const W = 264;
  const H = 72;
  const bpms = $derived(tracks.map((t) => t.analysis?.bpm).filter((b) => b > 0));
  const top = $derived(Math.max(...bpms, 60));
  const low = $derived(Math.min(...bpms, 200));
  const asked = $derived([filter.bpmMin ?? low, filter.bpmMax ?? top]);
  // The scale holds still while a handle is dragged.
  let scale = $state(/** @type {[number, number] | null} */ (null));
  const span = $derived(scale ?? /** @type {[number, number]} */ ([Math.floor((Math.min(low, asked[0], asked[1]) - 6) / 10) * 10, Math.ceil((Math.max(top, asked[0], asked[1]) + 6) / 10) * 10]));
  const x = (b) => 12 + ((b - span[0]) / (span[1] - span[0])) * (W - 24);
  const bpmAt = (px) => Math.round(span[0] + ((px - 12) / (W - 24)) * (span[1] - span[0]));
  const bars = $derived.by(() => {
    const n = 40;
    const bins = new Array(n).fill(0);
    for (const b of bpms) bins[Math.max(0, Math.min(n - 1, Math.floor(((b - span[0]) / (span[1] - span[0])) * n)))]++;
    const most = Math.max(...bins, 1);
    return bins.map((c, i) => ({ x: 12 + (i * (W - 24)) / n, h: c ? 4 + (c / most) * (H - 20) : 0 }));
  });
  // An end that isn't set is the end of the scale.
  const ends = $derived([filter.bpmMin ?? span[0], filter.bpmMax ?? span[1]]);
  const inside = (b) => b >= ends[0] && b <= ends[1];
  const words = $derived(filter.bpmMin && filter.bpmMax ? `between ${filter.bpmMin} and ${filter.bpmMax} BPM` : filter.bpmMin ? `at ${filter.bpmMin} BPM or more` : `at ${filter.bpmMax} BPM or less`);

  let svg = $state(/** @type {SVGSVGElement | null} */ (null));
  let drag = -1;
  function set(i, b) {
    const lo = i === 0 ? Math.max(1, Math.min(b, ends[1])) : filter.bpmMin;
    const hi = i === 1 ? Math.max(b, ends[0]) : filter.bpmMax;
    setFilter({ ...filter, bpmMin: lo ?? null, bpmMax: hi ?? null });
  }
  const at = (e) => {
    const r = /** @type {SVGSVGElement} */ (svg).getBoundingClientRect();
    return bpmAt(((e.clientX - r.left) / r.width) * W);
  };
  function down(e, i) {
    if (e.button !== 0) return;
    e.preventDefault();
    scale = [...span];
    held = true;
    drag = i;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  }
  function move(e) {
    if (drag >= 0) set(drag, Math.max(span[0], Math.min(span[1], at(e))));
  }
  function up() {
    if (drag < 0) return;
    drag = -1;
    held = false;
    scale = null;
  }
  function key(e, i) {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    held = true; // stays up while the keys move it, until focus leaves
    set(i, ends[i] + d);
  }
</script>

<div class="empty ef" class:live class:found={count > 0}>
  <svg viewBox="0 0 {W} {live ? H + 24 : H}" width={W} height={live ? H + 24 : H} bind:this={svg} role="img" aria-label="Your tracks' tempos, from {span[0]} to {span[1]} BPM">
    <rect class="well" x="0" y="0" width={W} height={H} rx="8" />
    <clipPath id="ef-clip"><rect width={W} height={H} rx="8" /></clipPath>
    <g class="grooves" clip-path="url(#ef-clip)">{#each Array(22) as _, i}<circle cx={W / 2} cy="380" r={308 + i * 4} />{/each}</g>
    <rect class="range" x={x(ends[0])} y="1" width={Math.max(0, x(ends[1]) - x(ends[0]))} height={H - 2} />
    {#each bars as b}{#if b.h}<rect class="b" class:in={inside(span[0] + ((b.x - 12) / (W - 24)) * (span[1] - span[0]))} x={b.x} y={H - 8 - b.h} width="4" height={b.h} rx="1.5" />{/if}{/each}
    {#each [0, 1] as i}<path class="edge" d="M{x(ends[i])} 1v{H - 2}" />{/each}
    {#if live}<rect class="slot" x="12" y={H + 10} width={W - 24} height="3" rx="1.5" /><rect class="slot on" x={x(ends[0])} y={H + 10} width={Math.max(0, x(ends[1]) - x(ends[0]))} height="3" rx="1.5" />{/if}
  </svg>
  {#if live}
    {#each [0, 1] as i}
      <div class="cap" role="slider" tabindex="0" aria-label={i ? 'Highest BPM' : 'Lowest BPM'} aria-valuemin={span[0]} aria-valuemax={span[1]} aria-valuenow={ends[i]}
        style:left="calc(50% - {W / 2}px + {x(ends[i])}px)" style:--top="{H + 11.5}px" onpointerdown={(e) => down(e, i)} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up}
        onkeydown={(e) => key(e, i)} onblur={() => drag < 0 && (held = false)}><span class="num">{ends[i]}</span></div>
    {/each}
  {/if}
  <div class="tx">
    <p class="what">{count ? `${count} ${count === 1 ? 'track' : 'tracks'} ${words}` : `No tracks ${words}`}</p>
  </div>
  <button class="btn sm" onclick={clear}>Clear filter</button>
</div>
