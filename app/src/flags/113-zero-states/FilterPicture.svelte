<script>
  // Where this list's tracks are, and where the filter is. Drawn, not to drag.
  /** @type {{ p: any }} */
  let { p } = $props();
  const W = 264;
  const H = 72;
  const PAD = 12;
  const x = (b) => PAD + ((b - p.lo) / (p.hi - p.lo)) * (W - PAD * 2);
  const tall = (n) => (n ? Math.max(2, (n / p.most) * (H - 20)) : 0);
  const base = H - 8;
  const n1 = (b) => `${Math.round(b * 10) / 10}`;
  // The ends of the filter, then the ends of the scale where there's room.
  const labels = $derived.by(() => {
    if (p.kind !== 'tempo') return [];
    const out = [];
    const near = (a) => out.some((o) => Math.abs(o.x - a) < 26);
    for (const b of [p.ends.low, p.ends.high]) if (b != null && !near(x(b))) out.push({ x: x(b), s: n1(b), on: true });
    if (p.ends.low != null && p.ends.high != null && p.ends.low !== p.ends.high && Math.abs(x(p.ends.low) - x(p.ends.high)) < 26) out.splice(0, out.length, { x: (x(p.ends.low) + x(p.ends.high)) / 2, s: `${n1(p.ends.low)}–${n1(p.ends.high)}`, on: true });
    for (const [b, a] of [[p.lo, PAD], [p.hi, W - PAD]]) if (!near(a) && !out.some((o) => Math.abs(o.x - a) < 34)) out.push({ x: a, s: n1(b), on: false });
    return out;
  });
  const label = $derived(`Your tracks' tempos, from ${p.lo} to ${p.hi} BPM, and the range chosen`);
</script>

{#if p.kind === 'tempo'}
  <svg class="zfp" viewBox="0 0 {W} {H + 18}" width={W} height={H + 18} role="img" aria-label={label}>
    <foreignObject x="0" y="0" width={W} height={H}><div class="zwell"></div></foreignObject>
    {#if p.range}<rect class="rng" x={x(p.range[0])} y="1" width={Math.max(0, x(p.range[1]) - x(p.range[0]))} height={H - 2} />{/if}
    {#each p.bars as b}
      {#if b.all}
        {@const x0 = x(b.x0)}
        {@const w = Math.max(0.8, x(b.x1) - x0 - Math.min(1.5, (x(b.x1) - x0) * 0.3))}
        <rect class="all" class:only={!p.keyed} x={x0 + 0.4} y={base - tall(b.all)} width={w} height={tall(b.all)} rx={Math.min(1.5, w / 2)} />
        {#if b.a}<rect class="a" x={x0 + 0.4} y={base - tall(b.a)} width={w} height={tall(b.a)} rx={Math.min(1.5, w / 2)} />{/if}
      {/if}
    {/each}
    {#if p.ends.low != null}<path class="edge" d="M{x(p.ends.low)} 1v{H - 2}" />{/if}
    {#if p.ends.high != null}<path class="edge" d="M{x(p.ends.high)} 1v{H - 2}" />{/if}
    {#if p.range && p.range[0] === p.range[1]}<path class="edge" d={p.range[0] <= p.lo ? `M${PAD - 2} ${H / 2 - 4}l-4 4 4 4` : `M${W - PAD + 2} ${H / 2 - 4}l4 4-4 4`} />{/if}
    {#each labels as l}<text class:on={l.on} x={Math.max(8, Math.min(W - 8, l.x))} y={H + 14} text-anchor={l.x < 20 ? 'start' : l.x > W - 20 ? 'end' : 'middle'}>{l.s}</text>{/each}
  </svg>
  {#if p.off.low || p.off.high}<span class="sr-only">{p.off.low + p.off.high} outside this scale</span>{/if}
{/if}
