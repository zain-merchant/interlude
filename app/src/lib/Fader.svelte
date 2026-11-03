<script>
  import { showTip, hideTip, tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { detent, keyValue } from './control.js';

  /**
   * A fader drawn with plain elements, so it looks and behaves the same in
   * every webview (WebKit doesn't support vertical range inputs
   * everywhere): a 2 px track and a flat white cap. Drag the cap or click
   * the track (⇧ for fine), scroll, or use the arrow keys; double-click or
   * right-click resets. `tick` marks the default with a short line.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string,
   *          vertical?: boolean, invert?: boolean, tick?: boolean, big?: boolean,
   *          format?: (v: number) => string, onchange?: (v: number) => void }}
   */
  let {
    value = $bindable(),
    min = 0,
    max = 1,
    reset = min,
    label,
    vertical = false,
    invert = false,
    tick = false,
    big = false,
    format = (v) => `${Math.round(((v - min) / (max - min)) * 100)}%`,
    onchange = () => {},
  } = $props();

  let track;
  let dragging = $state(false);
  let grab = 0;
  let last = 0;
  let raw = 0;

  // 0..1 along the track, from the start (left or bottom).
  const along = (v) => {
    const f = (v - min) / (max - min);
    return invert ? 1 - f : f;
  };
  const t = $derived(along(value));
  const tickAt = $derived(along(reset));

  function set(v) {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      value = next;
      onchange(next);
    }
  }
  const readout = () => tipText(label, format(value));

  function pos(e) {
    const r = track.getBoundingClientRect();
    return vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
  }
  const length = () => (vertical ? track.clientHeight : track.clientWidth) || 1;

  function down(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
    // Grabbing the cap keeps it under the pointer instead of jumping.
    const f = pos(e);
    grab = e.target.classList?.contains('cap') ? f - t : 0;
    last = f;
    raw = value;
    if (!grab) {
      const g = Math.min(1, Math.max(0, f));
      raw = min + (invert ? 1 - g : g) * (max - min);
      set(raw);
    }
    showTip(track, readout());
  }
  function move(e) {
    if (!dragging) return;
    const f = pos(e);
    const scale = e.shiftKey ? 0.1 : 1;
    raw = Math.min(max, Math.max(min, raw + (f - last) * scale * (invert ? -1 : 1) * (max - min)));
    last = f;
    const perPx = (max - min) / length();
    set(detent(raw, reset, perPx, e.shiftKey));
    showTip(track, readout());
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    hideTip(track);
  }
  function key(e) {
    let v = keyValue(e, value, min, max);
    if (v === null) return;
    if (invert && e.key.startsWith('Arrow')) v = value - (v - value);
    e.preventDefault();
    set(v);
    showTip(track, readout());
  }
  function wheel(e) {
    e.preventDefault();
    const d = (vertical ? -e.deltaY : e.deltaX || -e.deltaY) > 0 ? 1 : -1;
    set(value + d * (invert ? -1 : 1) * (max - min) * (e.shiftKey ? 0.005 : 0.02));
    showTip(track, readout());
  }
</script>

<div
  class="fader"
  class:vertical
  class:dragging
  class:big
  bind:this={track}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-orientation={vertical ? 'vertical' : 'horizontal'}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={format(value)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={() => set(reset)}
  onkeydown={key}
  onwheel={wheel}
  oncontextmenu={(e) => openMenu(e, [{ label: 'Reset to default', action: () => set(reset) }])}
  use:tip={() => tipText(label, format(value), 'double-click to reset')}
>
  <div class="line"></div>
  {#if tick}<div class="tick" style={vertical ? `bottom: ${tickAt * 100}%` : `left: ${tickAt * 100}%`}></div>{/if}
  <div class="cap" style={vertical ? `bottom: ${t * 100}%` : `left: ${t * 100}%`}></div>
</div>

<style>
  /* The element is the hit area; the cap's centre travels along it, so
     it's inset by half a cap at each end. */
  .fader {
    position: relative;
    touch-action: none;
    cursor: pointer;
    width: calc(100% - 14px);
    height: 30px;
    margin: 0 7px;
  }
  .fader.vertical {
    width: 30px;
    height: calc(100% - 12px);
    margin: 6px 0;
  }
  .fader.vertical.big {
    width: 36px;
    height: calc(100% - 14px);
    margin: 7px 0;
  }
  .line {
    position: absolute;
    left: -7px;
    right: -7px;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    border-radius: 1px;
    background: var(--line-2);
  }
  .vertical .line {
    left: 50%;
    right: auto;
    top: -6px;
    bottom: -6px;
    width: 2px;
    height: auto;
    margin: 0 0 0 -1px;
  }
  .tick {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 11px;
    margin: -5.5px 0 0 -0.5px;
    background: var(--fg-3);
  }
  .vertical .tick {
    top: auto;
    left: 50%;
    width: 16px;
    height: 1px;
    margin: 0 0 -0.5px -8px;
  }
  .cap {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 30px;
    transform: translate(-50%, -50%);
    border-radius: 3px;
    background: var(--fg);
    transition: background-color 0.12s;
  }
  .vertical .cap {
    top: auto;
    left: 50%;
    width: 30px;
    height: 12px;
    transform: translate(-50%, 50%);
  }
  .vertical.big .cap {
    width: 36px;
    height: 14px;
  }
  .vertical.big .cap::after {
    content: '';
    position: absolute;
    left: 6px;
    right: 6px;
    top: 6px;
    height: 2px;
    background: var(--bg);
    opacity: 0.5;
  }
  .fader:hover .cap,
  .dragging .cap {
    background: #ffffff;
  }
</style>
