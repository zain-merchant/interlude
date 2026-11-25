<script>
  // A tuner slider in DialKit's manner: the whole row is the track, filled
  // up to the value, its name on the left and the value on the right. Drag
  // anywhere on it (or use the arrow keys) to set it; tick marks show the
  // steps while it's held.
  /** @type {{ value: number, min: number, max: number, step: number, label: string, unit?: string }} */
  let { value = $bindable(), min, max, step, label, unit = '' } = $props();

  let el = /** @type {HTMLElement | null} */ ($state(null));
  let held = $state(false);
  let W = $state(0);
  let nameW = $state(0);
  let valW = $state(0);
  const frac = $derived(Math.max(0, Math.min(1, (value - min) / (max - min))));
  // The handle fades where it would run through the name or the value.
  const hx = $derived(frac * (W - 3));
  const over = $derived(W > 0 && ((hx > 4 && hx < 14 + nameW) || (hx > W - 16 - valW && hx < W - 6)));
  const decimals = $derived((String(step).split('.')[1] ?? '').length);
  const shown = $derived(`${Number(value).toFixed(decimals)}${unit}`);
  const steps = $derived(Math.round((max - min) / step));
  const snap = (v) => {
    const s = Math.round((v - min) / step) * step + min;
    return Number(Math.max(min, Math.min(max, s)).toFixed(decimals));
  };
  function at(e) {
    const r = el.getBoundingClientRect();
    value = snap(min + ((e.clientX - r.left) / r.width) * (max - min));
  }
  function down(e) {
    if (e.button !== 0) return;
    el.setPointerCapture?.(e.pointerId);
    held = true;
    at(e);
  }
  function key(e) {
    const big = e.shiftKey ? 10 : 1;
    const by = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 }[e.key];
    if (by != null) value = snap(value + by * big);
    else if (e.key === 'Home') value = min;
    else if (e.key === 'End') value = max;
    else return;
    e.preventDefault();
  }
</script>

<div
  class="fp-slider"
  class:held
  bind:this={el}
  bind:clientWidth={W}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={shown}
  onpointerdown={down}
  onpointermove={(e) => held && at(e)}
  onpointerup={() => (held = false)}
  onpointercancel={() => (held = false)}
  onkeydown={key}
>
  <span class="fill" style:width="{frac * 100}%"></span>
  {#if steps <= 40}
    <span class="ticks" aria-hidden="true">
      {#each { length: steps - 1 } as _, i}<i style:left="{((i + 1) / steps) * 100}%"></i>{/each}
    </span>
  {/if}
  <span class="handle" class:over style:left="calc({frac * 100}% - {frac * 3}px)"></span>
  <span class="name" bind:clientWidth={nameW}>{label}</span>
  <span class="val" bind:clientWidth={valW}>{shown}</span>
</div>

<style>
  .fp-slider {
    position: relative;
    height: 30px;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.05);
    overflow: hidden;
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
  }
  .fp-slider:focus-visible {
    outline: 2px solid var(--fp-accent);
    outline-offset: 2px;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgb(255 255 255 / 0.09);
    transition: background-color 0.15s;
  }
  .held .fill {
    background: rgb(255 255 255 / 0.15);
  }
  .ticks i {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 8px;
    translate: -50% -50%;
    border-radius: 1px;
    background: rgb(255 255 255 / 0);
    transition: background-color 0.2s;
  }
  .held .ticks i {
    background: rgb(255 255 255 / 0.16);
  }
  .handle {
    position: absolute;
    top: 50%;
    width: 3px;
    height: 16px;
    translate: 0 -50%;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.9);
    transition: opacity 0.15s;
  }
  .handle.over {
    opacity: 0.2;
  }
  .name,
  .val {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    font-size: 12px;
    font-weight: 500;
    color: var(--fp-fg-2);
    pointer-events: none;
  }
  .name {
    left: 10px;
  }
  .val {
    right: 10px;
    font-family: var(--fp-mono);
    font-variant-numeric: tabular-nums;
  }
  .held .val,
  .fp-slider:focus-visible .val {
    color: var(--fp-fg);
  }
</style>
