<script>
  import { showTip, hideTip, tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { detent, keyValue } from './control.js';
  import { flag } from '../flags/registry.svelte.js';

  /**
   * A fader drawn with plain elements, so it looks and behaves the same in
   * every webview (WebKit doesn't support vertical range inputs
   * everywhere): a 2 px track and a flat white cap. Drag the cap or click
   * the track (⇧ for fine), scroll, or use the arrow keys; double-click or
   * right-click resets. `tick` marks the default: a line across the slot
   * when horizontal, a longer mark beside it when vertical. `ghost` marks
   * another value, such as where a hardware fader waits to pick up, and
   * `note` explains it in the tooltip.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string,
   *          vertical?: boolean, invert?: boolean, tick?: boolean, big?: boolean,
   *          format?: (v: number) => string, onchange?: (v: number) => void,
   *          ghost?: number | null, note?: string, match?: number | null }}
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
    ghost = null,
    note = '',
    match = null, // #18 (UI audit flag): a value to mark beside the slot (the other deck's tempo); null draws nothing.
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
  // #86 (UI audit flag): copy-toasts says what the reset goes back to.
  const resetLabel = () => (flag('copy-toasts') ? `Reset to ${format(reset)}` : 'Reset to default');

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
    // #62 (UI audit flag): hit-areas: a press anywhere on the track starts a relative drag from where the fader is, like the dials; it never jumps the level to the press.
    if (!grab && !flag('hit-areas')) {
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
  oncontextmenu={(e) => openMenu(e, [{ label: resetLabel(), action: () => set(reset) }])}
  use:tip={() => note || tipText(label, format(value), 'double-click to reset')}
>
  <div class="line"></div>
  {#each [0, 0.25, 0.5, 0.75, 1].filter((m) => !(tick && vertical && Math.abs(m - tickAt) < 1e-6)) as m}<i class="mark" style={vertical ? `bottom: ${m * 100}%` : `left: ${m * 100}%`}></i>{/each}
  {#if tick}<div class="tick" style={vertical ? `bottom: ${tickAt * 100}%` : `left: ${tickAt * 100}%`}></div>{/if}
  <!-- #18 (UI audit flag): the match mark; .out when the value is past the end of the travel. -->
  {#if match !== null}<div class="match" class:out={match < min || match > max} style={vertical ? `bottom: ${along(Math.max(min, Math.min(max, match))) * 100}%` : `left: ${along(Math.max(min, Math.min(max, match))) * 100}%`}></div>{/if}
  {#if ghost !== null}<div class="ghost" style={vertical ? `bottom: ${along(ghost) * 100}%` : `left: ${along(ghost) * 100}%`}></div>{/if}
  <div class="cap" style={vertical ? `bottom: ${t * 100}%` : `left: ${t * 100}%`}></div>
</div>

<style>
  /* The element is the hit area; the cap's centre travels along it, so
     it's inset by half a cap at each end. A machined fader: a recessed
     slot, engraved marks every quarter, a graphite cap with a white line. */
  .fader {
    position: relative;
    touch-action: none;
    cursor: pointer;
    width: calc(100% - 12px);
    height: 28px;
    margin: 0 6px;
  }
  .fader.vertical {
    width: 28px;
    height: calc(100% - 12px);
    margin: 6px 0;
  }
  .line {
    position: absolute;
    left: -6px;
    right: -6px;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 3px;
    background: #070708;
    box-shadow: inset 0 1px 2px #000, 0 1px 0 rgb(255 255 255 / 0.05);
  }
  .vertical .line {
    left: 50%;
    right: auto;
    top: -6px;
    bottom: -6px;
    width: 4px;
    height: auto;
    margin: 0 0 0 -2px;
  }
  .mark {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 12px;
    margin: -6px 0 0 -0.5px;
    background: rgb(255 255 255 / 0.14);
  }
  .vertical .mark {
    top: auto;
    left: 50%;
    width: 5px;
    height: 1px;
    margin: 0 0 -0.5px 8px;
  }
  .tick {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 14px;
    margin: -7px 0 0 -0.5px;
    background: rgb(255 255 255 / 0.3);
  }
  /* Upright, the default sits beside the slot like the other marks, just
     longer and brighter, so nothing crosses the slot. */
  .vertical .tick {
    top: auto;
    left: 50%;
    width: 9px;
    height: 1px;
    margin: 0 0 -0.5px 8px;
    background: rgb(255 255 255 / 0.4);
  }
  .cap {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 26px;
    transform: translate(-50%, -50%);
    border-radius: 2px;
    background: linear-gradient(180deg, #404147, #2a2b30);
    box-shadow: 0 0 0 1px #08080a, 0 3px 5px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.1);
  }
  .cap::after {
    content: '';
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    background: #f4f3ee;
  }
  .vertical .cap {
    top: auto;
    left: 50%;
    width: 26px;
    height: 12px;
    transform: translate(-50%, 50%);
  }
  .vertical .cap::after {
    top: 50%;
    bottom: auto;
    left: 4px;
    right: 4px;
    width: auto;
    height: 2px;
    margin: -1px 0 0;
  }
  /* An outline of the cap where the other fader sits. */
  .ghost {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 26px;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px var(--fg-2);
    pointer-events: none;
  }
  .vertical .ghost {
    top: auto;
    left: 50%;
    width: 26px;
    height: 12px;
    transform: translate(-50%, 50%);
  }
  .fader:hover .cap,
  .dragging .cap {
    background: linear-gradient(180deg, #4a4b52, #313238);
  }
</style>
