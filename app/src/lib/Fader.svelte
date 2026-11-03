<script>
  /**
   * A fader drawn with plain elements, so it looks and behaves the same in
   * every webview (WebKit doesn't support vertical range inputs everywhere).
   * Drag the cap or click the track; arrow keys step; double-click resets.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string,
   *          vertical?: boolean, invert?: boolean, onchange?: (v: number) => void }}
   */
  let {
    value = $bindable(),
    min = 0,
    max = 1,
    reset = min,
    label,
    vertical = false,
    invert = false,
    onchange = () => {},
  } = $props();

  let track;
  let dragging = $state(false);
  let grabOffset = 0;

  // 0..1 along the track, measured from the start (left or bottom).
  const t = $derived(((value - min) / (max - min)) * (invert ? -1 : 1) + (invert ? 1 : 0));

  function set(v) {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      value = next;
      onchange(next);
    }
  }

  function fromPointer(e) {
    const r = track.getBoundingClientRect();
    let f = vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
    f = Math.min(1, Math.max(0, f - grabOffset));
    if (invert) f = 1 - f;
    return min + f * (max - min);
  }

  function down(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
    // Grabbing the cap keeps it under the pointer instead of jumping.
    const onCap = e.target.classList?.contains('cap');
    if (onCap) {
      const r = track.getBoundingClientRect();
      const f = vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
      grabOffset = f - t;
    } else {
      grabOffset = 0;
      set(fromPointer(e));
    }
  }
  function move(e) {
    if (dragging) set(fromPointer(e));
  }
  function up() {
    dragging = false;
    grabOffset = 0;
  }
  function key(e) {
    const step = (max - min) * (e.shiftKey ? 0.01 : 0.05) * (invert ? -1 : 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - step);
    else if (e.key === 'Home') set(reset);
    else return;
    e.preventDefault();
  }
</script>

<div
  class="fader"
  class:vertical
  class:dragging
  bind:this={track}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-orientation={vertical ? 'vertical' : 'horizontal'}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  title="{label} (double-click to reset)"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={() => set(reset)}
  onkeydown={key}
>
  <div class="groove"></div>
  <div class="cap" style={vertical ? `bottom: ${t * 100}%` : `left: ${t * 100}%`}></div>
</div>

<style>
  .fader {
    position: relative;
    touch-action: none;
    cursor: pointer;
    border-radius: 4px;
    width: 100%;
    height: 22px;
    margin: 0 15px;
  }
  .fader.vertical {
    width: 30px;
    height: 100%;
    margin: 15px 0;
  }
  .groove {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 2px;
    background: #0c0d10;
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .vertical .groove {
    left: 50%;
    right: auto;
    top: 0;
    bottom: 0;
    width: 4px;
    height: auto;
    margin: 0 0 0 -2px;
  }
  .cap {
    position: absolute;
    top: 50%;
    width: 30px;
    height: 18px;
    transform: translate(-50%, -50%);
    border-radius: 4px;
    background: linear-gradient(#eef0f5, #b7bbc6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 0 rgba(0, 0, 0, 0.2);
  }
  .cap::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 3px;
    bottom: 3px;
    width: 2px;
    margin-left: -1px;
    background: #1b1d22;
    pointer-events: none;
  }
  .vertical .cap {
    top: auto;
    left: 50%;
    width: 30px;
    height: 18px;
    transform: translate(-50%, 50%);
  }
  .vertical .cap::after {
    left: 3px;
    right: 3px;
    top: 50%;
    bottom: auto;
    width: auto;
    height: 2px;
    margin: -1px 0 0;
  }
  .dragging .cap,
  .fader:focus-visible .cap {
    background: linear-gradient(#ffffff, #cfd3dd);
  }
</style>
