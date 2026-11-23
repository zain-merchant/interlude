<script>
  import { showTip, hideTip, tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { detent, keyValue } from './control.js';
  import { flag, setting } from '../flags/registry.svelte.js';
  import { axisOf, landed, scrolled } from '../flags/118-knob-feel/feel.js'; // #118 (UI audit flag): knob-feel

  /**
   * A rotary knob: a machined graphite cap with a white indicator inside an
   * engraved 270° tick scale. Drag it up or right to raise it, down or left
   * to lower it (#118; up and down only without it; ⇧ for fine), scroll, or use the
   * arrow keys; double-click or right-click resets. With `kill`, clicking
   * the label kills the band and clicking again brings it back. A `taper`
   * maps values to positions on the sweep (0..1) when they aren't linear,
   * so the knob sits where a hardware knob with the same curve would.
   * The ticks from the default to the current position light up, in `arc`
   * (a CSS colour) or white, so a cut or boost reads at a glance. With
   * `fromMin` (a level, not a cut or boost) they light from the start.
   * @type {{ value: number, min?: number, max?: number, reset?: number, label: string, name?: string,
   *          kill?: number, size?: number, arc?: string, fromMin?: boolean, format?: (v: number) => string, onchange?: (v: number) => void,
   *          taper?: { toPos: (v: number) => number, fromPos: (p: number) => number } }}
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
    arc,
    fromMin = false,
    format = (v) => v.toFixed(1),
    onchange = () => {},
    taper = {
      toPos: (v) => (v - min) / (max - min),
      fromPos: (p) => min + p * (max - min),
    },
  } = $props();

  // Gestures work in sweep positions, so a tapered knob turns like the hardware.
  const clampPos = (p) => Math.min(1, Math.max(0, p));
  const pos = $derived(clampPos(taper.toPos(value)));
  const resetPos = $derived(taper.toPos(reset));
  // The default comes back exact, not as a round trip through the taper.
  const setPos = (p) => set(p === resetPos ? reset : taper.fromPos(clampPos(p)));
  const killed = $derived(kill !== undefined && value <= kill);
  // Angles from 12 o'clock, clockwise.
  const angle = (p) => -135 + p * 270;
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
  // #118 (UI audit flag): knob-feel: the way this drag is going, once that's clear.
  /** @type {'x' | 'y' | null} */
  let axis = null;
  let gone = [0, 0];
  let at = [0, 0];
  /** How far the pointer moved, in px, the way this knob turns: up, or right. */
  function turned(e) {
    const how = setting('knob-feel', 'drag');
    if (!flag('knob-feel')) return -e.movementY;
    const [dx, dy] = [e.clientX - at[0], e.clientY - at[1]];
    at = [e.clientX, e.clientY];
    if (how === 'updown') return -dy;
    if (how === 'across') return dx;
    if (!axis) {
      gone = [gone[0] + dx, gone[1] + dy];
      axis = axisOf(gone[0], gone[1]);
      return 0;
    }
    return axis === 'x' ? dx : -dy;
  }
  let dragging = $state(false);
  const readout = () => tipText(name, format(value));

  function down(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // #62 (UI audit flag): a press on the ring focuses the dial as a press on the cap does. The
    // press's own focus change is cancelled, and focusing here, inside the pointer event, keeps
    // the focus ring off (it's a pointer focus, not a keyboard one).
    if (grabRing && e.target !== dial && !dial.contains(e.target)) {
      e.preventDefault();
      dial.focus({ preventScroll: true });
    }

    dragging = true;
    axis = null;
    gone = [0, 0];
    at = [e.clientX, e.clientY];
    raw = pos;
    showTip(dial, readout());
  }
  function move(e) {
    if (!dragging) return;
    const perPx = (1 / 180) * (e.shiftKey ? 0.1 : 1);
    raw = clampPos(raw + turned(e) * perPx);
    setPos(detent(raw, resetPos, perPx, e.shiftKey));
    showTip(dial, readout());
  }
  function up() {
    if (!dragging) return;
    dragging = false;

    hideTip(dial);
  }
  function wheel(e) {
    e.preventDefault();
    // #118 (UI audit flag): knob-feel: as far as the scroll goes.
    if (flag('knob-feel') && setting('knob-feel', 'scroll') === 'far') {
      const p = scrolled(e, { value: pos, min: 0, max: 1, reset: resetPos, sideways: true, detent });
      if (p === null) return;
      setPos(p);
      landed(pos);
      showTip(dial, readout());
      return;
    }
    setPos(pos - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02));
    showTip(dial, readout());
  }
  function key(e) {
    const p = keyValue(e, pos, 0, 1);
    if (p === null) return;
    e.preventDefault();
    setPos(p);
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
  // #62 (UI audit flag): hit-areas moves the gestures from the cap to the
  // whole tick ring (.wrap); with it off they stay on the cap (.dial).
  const grabRing = $derived(flag('hit-areas'));
  const onRing = (fn) => (e) => grabRing && fn(e);
  const onCap = (fn) => (e) => !grabRing && fn(e);
  const menu = (e) =>
    openMenu(e, [
      // #86 (UI audit flag): copy-toasts says what the reset goes back to.
      { label: flag('copy-toasts') ? `Reset to ${format(reset)}` : 'Reset to default', action: () => set(reset), key: '' },
      ...(kill !== undefined ? [{ label: killed ? 'Bring back' : 'Kill', action: toggleKill }] : []),
    ]);
  // #88 (UI audit flag): with deck-names the name starts "Left deck …", which reads "Kill left deck high EQ" mid-sentence.
  const tipName = () => (flag('deck-names') ? name.charAt(0).toLowerCase() + name.slice(1) : name);
  const TICKS = 27;
  const R = $derived(size / 2 + 7);
  const box = $derived(size + 18);
  const from = $derived(fromMin ? 0 : clampPos(resetPos));
  const lo = $derived(Math.min(pos, from));
  const hi = $derived(Math.max(pos, from));
  /** Tick geometry, outermost point first. Majors at the ends, the middle and every 45°. */
  const ticks = $derived(
    Array.from({ length: TICKS }, (_, i) => {
      const p = i / (TICKS - 1);
      const a = ((angle(p) - 90) * Math.PI) / 180;
      const major = i % ((TICKS - 1) / 2) === 0 || i % ((TICKS - 1) / 6) === 0;
      const r0 = R - (major ? 3.5 : 2.5);
      return { p, major, x1: Math.cos(a) * r0, y1: Math.sin(a) * r0, x2: Math.cos(a) * (R + 1), y2: Math.sin(a) * (R + 1) };
    }),
  );
  const half = 0.5 / (TICKS - 1);
</script>

<div class="knob" style:--c={arc ?? 'var(--fg)'}>
  <!-- svelte-ignore a11y_no_static_element_interactions (the dial inside is the slider; the ring only widens where it grabs) -->
  <div class="wrap" style:width="{box}px" style:height="{box}px"
    onpointerdown={onRing(down)}
    onpointermove={onRing(move)}
    onpointerup={onRing(up)}
    onpointercancel={onRing(up)}
    ondblclick={onRing(() => set(reset))}
    onwheel={onRing(wheel)}
    oncontextmenu={onRing(menu)}>
    <svg width={box} height={box} viewBox="{-box / 2} {-box / 2} {box} {box}" aria-hidden="true">
      {#each ticks as tk}
        <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} class:major={tk.major}
          class:on={hi - lo > 0.02 && tk.p >= lo - half && tk.p <= hi + half} />
      {/each}
    </svg>
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
      style:--rot="{angle(pos)}deg"
      onpointerdown={onCap(down)}
      onpointermove={onCap(move)}
      onpointerup={onCap(up)}
      onpointercancel={onCap(up)}
      ondblclick={onCap(() => set(reset))}
      onwheel={onCap(wheel)}
      onkeydown={key}
      oncontextmenu={onCap(menu)}
      use:tip={() => tipText(name, format(value), 'double-click to reset')}
    ><i></i></div>
  </div>
  {#if kill !== undefined}
    <!-- #61 (UI audit flag): eq-kill opens the kill's tooltip under the label, off the knob. -->
    <button class="label" class:killed onclick={toggleKill} aria-pressed={killed} data-tip-below={flag('eq-kill') ? '' : undefined}
      use:tip={() => (killed ? `Bring back ${tipName()}` : `Kill ${tipName()}`)}>{label}</button>
  {:else if label}
    <span class="label">{label}</span>
  {/if}
</div>

<style>
  .knob {
    display: grid;
    justify-items: center;
  }
  .wrap {
    position: relative;
    display: grid;
    place-items: center;
  }
  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
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
    filter: drop-shadow(0 0 0.75px var(--c));
  }
  .knob:has(.dial.killed) line.on {
    stroke: var(--kill);
  }
  /* Knurled graphite: a ridged edge around a flat machined top. */
  .dial {
    position: relative;
    border-radius: 50%;
    cursor: ns-resize;
    touch-action: none;
    transform: rotate(var(--rot));
    background:
      radial-gradient(circle at 50% 50%, #2e2f34 0 60%, transparent 61%),
      repeating-conic-gradient(#3c3d43 0 5deg, #1c1d20 5deg 10deg);
    box-shadow: 0 0 0 1px #08080a, 0 3px 6px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.1);
  }
  .dial::after {
    content: '';
    position: absolute;
    inset: 20%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 30%, #3a3b41, #26272b 70%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.4);
  }
  .dial i {
    position: absolute;
    z-index: 1;
    left: 50%;
    top: 9%;
    width: 2px;
    height: 30%;
    margin-left: -1px;
    border-radius: 1px;
    background: #f4f3ee;
  }
  .dial.killed i {
    background: var(--fg-4);
  }
  .label {
    margin-top: -2px;
    font-size: var(--t-xs);
    color: var(--fg-3);
    white-space: nowrap;
  }
  button.label {
    border: 0;
    padding: 0 2px;
    background: none;
    font: inherit;
    font-size: var(--t-xs);
    border-radius: 4px;
  }
  button.label:hover {
    color: var(--fg-2);
  }
  .label.killed {
    color: var(--kill);
  }
</style>
