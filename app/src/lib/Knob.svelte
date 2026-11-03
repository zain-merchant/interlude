<script>
  import { showTip, hideTip, tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { detent, keyValue } from './control.js';

  /**
   * A rotary knob: a dark disc with a hairline ring and a white indicator
   * over a 270° sweep. Drag up/down (⇧ for fine), scroll, or use the
   * arrow keys; double-click or right-click resets. With `kill`, clicking
   * the label kills the band and clicking again brings it back.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string, name?: string,
   *          kill?: number, size?: number, format?: (v: number) => string, onchange?: (v: number) => void }}
   */
  let {
    value = $bindable(),
    min = 0,
    max = 1,
    reset = 0,
    label,
    name = label,
    kill,
    size = 28,
    format = (v) => v.toFixed(1),
    onchange = () => {},
  } = $props();

  const norm = $derived((value - min) / (max - min));
  const killed = $derived(kill !== undefined && value <= kill);
  let beforeKill = 0;
  let dial;

  function set(v) {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      value = next;
      onchange(next);
    }
  }

  let raw = 0;
  let dragging = $state(false);
  const readout = () => tipText(name, format(value));

  function down(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
    raw = value;
    showTip(dial, readout());
  }
  function move(e) {
    if (!dragging) return;
    const perPx = ((max - min) / 180) * (e.shiftKey ? 0.1 : 1);
    raw = Math.min(max, Math.max(min, raw - e.movementY * perPx));
    set(detent(raw, reset, perPx, e.shiftKey));
    showTip(dial, readout());
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    hideTip(dial);
  }
  function wheel(e) {
    e.preventDefault();
    set(value - Math.sign(e.deltaY) * (max - min) * (e.shiftKey ? 0.005 : 0.02));
    showTip(dial, readout());
  }
  function key(e) {
    const v = keyValue(e, value, min, max);
    if (v === null) return;
    e.preventDefault();
    set(v);
    showTip(dial, readout());
  }
  function toggleKill() {
    if (killed) set(beforeKill > kill ? beforeKill : reset);
    // (beforeKill is 0 until the first kill, which is the EQ default.)
    else {
      beforeKill = value;
      set(kill);
    }
  }
  const menu = (e) =>
    openMenu(e, [
      { label: 'Reset to default', action: () => set(reset), key: '' },
      ...(kill !== undefined ? [{ label: killed ? 'Bring back' : 'Kill', action: toggleKill }] : []),
    ]);
</script>

<div class="knob">
  <div
    bind:this={dial}
    class="dial"
    class:dragging
    class:killed
    role="slider"
    tabindex="0"
    aria-label={name}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={format(value)}
    style:width="{size}px"
    style:height="{size}px"
    style:--v={norm}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    ondblclick={() => set(reset)}
    onwheel={wheel}
    onkeydown={key}
    oncontextmenu={menu}
    use:tip={() => tipText(name, format(value), 'double-click to reset')}
  ></div>
  {#if kill !== undefined}
    <button class="label" class:killed onclick={toggleKill} aria-pressed={killed}
      use:tip={() => (killed ? `Bring back ${name}` : `Kill ${name}`)}>{label}{killed ? ' · kill' : ''}</button>
  {:else}
    <span class="label">{label}</span>
  {/if}
</div>

<style>
  .knob {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  .dial {
    position: relative;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: inset 0 0 0 1.5px var(--line-2);
    cursor: ns-resize;
    touch-action: none;
    transition: box-shadow 0.12s;
  }
  .dial:hover,
  .dial.dragging {
    box-shadow: inset 0 0 0 1.5px var(--fg-4);
  }
  .dial::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 14%;
    width: 2px;
    height: 32%;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--fg);
    transform-origin: 50% 112%;
    transform: rotate(calc(-135deg + var(--v) * 270deg));
  }
  .dial.killed::after {
    background: var(--fg-4);
  }
  .label {
    font-size: 10.5px;
    color: var(--fg-3);
    white-space: nowrap;
  }
  button.label {
    border: 0;
    padding: 0 2px;
    background: none;
    font: inherit;
    font-size: 10.5px;
    border-radius: 3px;
  }
  button.label:hover {
    color: var(--fg-2);
  }
  .label.killed {
    color: var(--kill);
  }
</style>
