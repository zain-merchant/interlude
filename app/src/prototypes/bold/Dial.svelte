<script>
  // A machined dial: knurled cap, engraved 270° tick scale, and lit ticks
  // from the centre (bipolar) or from the start to the value. Drag up/down.
  /** @type {{ value?: number, bipolar?: boolean, size?: number, label?: string, color?: string, cap?: 'graphite'|'tint'|'white'|'soft', ticks?: number, glow?: number, ring?: boolean }} */
  let { value = $bindable(0.5), bipolar = false, size = 30, label = '', color = '#3db4ff', cap = 'graphite', ticks = 27, glow = 0.6, ring = false } = $props();

  const angle = (p) => -135 + p * 270;
  const lit = (i) => {
    const p = i / (ticks - 1);
    if (bipolar) return value >= 0.5 ? p >= 0.5 - 1e-6 && p <= value + 1e-6 : p <= 0.5 + 1e-6 && p >= value - 1e-6;
    return p <= value + 1e-6;
  };
  let dragging = false;
  const down = (e) => { dragging = true; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (dragging) value = Math.min(1, Math.max(0, value - e.movementY / 160)); };
  const up = () => (dragging = false);
  const R = $derived(size / 2 + 7);
  const box = $derived(size + 18);
</script>

<div class="dialwrap" style:--size="{size}px" style:--c={color} style:--glow={glow}>
  <svg width={box} height={box} viewBox="{-box / 2} {-box / 2} {box} {box}" aria-hidden="true">
    {#each Array(ticks) as _, i}
      {@const a = ((angle(i / (ticks - 1)) - 90) * Math.PI) / 180}
      {@const on = lit(i) && !(bipolar && Math.abs(value - 0.5) < 0.02)}
      {@const major = i % ((ticks - 1) / 2) === 0 || i % ((ticks - 1) / 6) === 0}
      <line x1={Math.cos(a) * (R - (major ? 3.5 : 2.5))} y1={Math.sin(a) * (R - (major ? 3.5 : 2.5))}
        x2={Math.cos(a) * (R + 1)} y2={Math.sin(a) * (R + 1)}
        class:on class:major />
    {/each}
  </svg>
  <div class="cap {cap}" class:ringed={ring} role="slider" tabindex="0" aria-label={label} aria-valuenow={value}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
    ondblclick={() => (value = bipolar ? 0.5 : value)}
    style:--rot="{angle(value)}deg"><i></i></div>
  {#if label}<span class="lbl">{label}</span>{/if}
</div>

<style>
  .dialwrap {
    position: relative;
    display: grid;
    justify-items: center;
    width: calc(var(--size) + 18px);
  }
  svg {
    grid-area: 1 / 1;
    overflow: visible;
  }
  line {
    stroke: rgb(255 255 255 / 0.16);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  line.major {
    stroke: rgb(255 255 255 / 0.28);
  }
  line.on {
    stroke: var(--c);
    stroke-width: 1.8;
    filter: drop-shadow(0 0 calc(var(--glow) * 3px) var(--c));
  }
  .cap {
    grid-area: 1 / 1;
    align-self: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    position: relative;
    cursor: ns-resize;
    touch-action: none;
    transform: rotate(var(--rot));
    transition: transform 60ms linear;
  }
  .cap i {
    position: absolute;
    left: 50%;
    top: 9%;
    width: 2px;
    height: 30%;
    margin-left: -1px;
    border-radius: 1px;
    background: #f4f3ee;
  }
  /* Knurled graphite: a ridged edge around a flat machined top. */
  .cap.graphite {
    background:
      radial-gradient(circle at 50% 50%, #2e2f34 0 60%, transparent 61%),
      repeating-conic-gradient(#3c3d43 0 5deg, #1c1d20 5deg 10deg);
    box-shadow: 0 0 0 1px #08080a, 0 3px 6px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.1);
  }
  .cap.graphite::after {
    content: '';
    position: absolute;
    inset: 20%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 30%, #3a3b41, #26272b 70%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.4);
  }
  .cap.graphite i {
    z-index: 1;
  }
  /* A soft cap tinted with the dial's colour, OP-1 style. */
  .cap.tint {
    background: radial-gradient(circle at 42% 30%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 45%, color-mix(in srgb, var(--c) 55%, #000));
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6), 0 4px 10px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.4);
  }
  .cap.tint i {
    background: #101014;
  }
  .cap.white {
    background: radial-gradient(circle at 42% 30%, #ffffff, #dedad1 55%, #a9a59b);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6), 0 4px 10px rgb(0 0 0 / 0.55);
  }
  .cap.white i {
    background: #15151a;
  }
  .cap.soft {
    background: radial-gradient(circle at 50% 28%, #45454c, #232327 62%, #1a1a1d);
    box-shadow: 0 0 0 1px #000, 0 4px 9px rgb(0 0 0 / 0.65), inset 0 1px 0 rgb(255 255 255 / 0.14);
  }
  .lbl {
    margin-top: -2px;
    font-size: 10.5px;
    color: rgb(236 236 234 / 0.62);
    letter-spacing: 0.01em;
  }
</style>
