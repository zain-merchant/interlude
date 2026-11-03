<script>
  /**
   * A rotary knob. Drag up/down (hold Shift for fine control), scroll, or use
   * arrow keys. Double-click resets. Bipolar knobs draw their arc from the
   * centre, like EQs.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string,
   *          bipolar?: boolean, size?: number, accent?: string, format?: (v: number) => string,
   *          onchange?: (v: number) => void }}
   */
  let {
    value = $bindable(),
    min = 0,
    max = 1,
    reset = 0,
    label,
    bipolar = false,
    size = 40,
    accent = 'var(--text)',
    format = (v) => v.toFixed(1),
    onchange = () => {},
  } = $props();

  const START = -135;
  const SWEEP = 270;
  const norm = $derived((value - min) / (max - min));
  const angle = $derived(START + norm * SWEEP);
  const zero = $derived(bipolar ? START + ((reset - min) / (max - min)) * SWEEP : START);

  function set(v) {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      value = next;
      onchange(next);
    }
  }

  let dragging = $state(false);
  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
  }
  function move(e) {
    if (!dragging) return;
    const scale = e.shiftKey ? 0.1 : 1;
    set(value - (e.movementY / 180) * (max - min) * scale);
  }
  function up() {
    dragging = false;
  }
  function wheel(e) {
    e.preventDefault();
    set(value - Math.sign(e.deltaY) * (max - min) * 0.02);
  }
  function key(e) {
    const step = (max - min) * (e.shiftKey ? 0.01 : 0.05);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - step);
    else return;
    e.preventDefault();
  }

  function arc(a0, a1, r) {
    const p = (a) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
    };
    const [lo, hi] = a0 < a1 ? [a0, a1] : [a1, a0];
    if (hi - lo < 0.5) return '';
    const [x0, y0] = p(lo);
    const [x1, y1] = p(hi);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${hi - lo > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
</script>

<div class="knob" style:width="{size + 16}px">
  <div
    class="dial"
    class:dragging
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={format(value)}
    style:width="{size}px"
    style:height="{size}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    ondblclick={() => set(reset)}
    onwheel={wheel}
    onkeydown={key}
    title="{label}: {format(value)} (double-click to reset)"
  >
    <svg viewBox="0 0 100 100">
      <path d={arc(START, START + SWEEP, 44)} class="track" />
      <path d={arc(zero, angle, 44)} class="fill" style:stroke={accent} />
      <circle cx="50" cy="50" r="33" class="cap" />
      <line x1="50" y1="50" x2="50" y2="22" class="pointer" transform="rotate({angle} 50 50)" />
    </svg>
  </div>
  <div class="label">{label}</div>
</div>

<style>
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .dial {
    cursor: ns-resize;
    touch-action: none;
    border-radius: 50%;
  }
  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .track {
    fill: none;
    stroke: var(--line-2);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .fill {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
  }
  .cap {
    fill: #1d2027;
    stroke: #343844;
    stroke-width: 2;
  }
  .pointer {
    stroke: var(--text);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .label {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
</style>
