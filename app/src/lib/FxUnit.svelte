<script>
  import Knob from './Knob.svelte';
  import { untrack } from 'svelte';
  import { engine, control as send } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';

  /**
   * One deck's beat FX unit: effect, beat length, level, on. The channel
   * filter lives in the mixer, under the EQ, as on the controller.
   * @type {{ deck: number }}
   */
  let { deck } = $props();
  const name = $derived(deck === 0 ? 'A' : 'B');

  const KINDS = [
    { id: 'echo', label: 'Echo', beats: 'Echo time' },
    { id: 'reverb', label: 'Reverb', beats: 'Room size' },
    { id: 'flanger', label: 'Flanger', beats: 'Sweep length' },
    { id: 'phaser', label: 'Phaser', beats: 'Sweep length' },
  ];
  const BEATS = [0.125, 0.25, 0.5, 0.75, 1, 2, 4, 8];
  const beatText = (b) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' })[b] ?? String(b);

  let kind = $state('echo');
  let on = $state(false);
  let level = $state(0.5);
  let beats = $state(1);
  const k = $derived(KINDS.find((x) => x.id === kind) ?? KINDS[0]);

  // Follow the engine (and so a hardware controller), pausing briefly
  // after a change here so a lagging report can't snap the control back.
  let lastTouch = 0;
  function control(cmd) {
    lastTouch = performance.now();
    send(cmd);
  }
  // The engine's state is patched in place: read the fields here so the
  // effect tracks them.
  $effect(() => {
    const fx = engine.decks[deck].fx;
    const next = fx && { kind: fx.kind, on: fx.on, level: fx.level, beats: fx.beats };
    untrack(() => {
      if (performance.now() - lastTouch < 500) return;
      if (next) ({ kind, on, level, beats } = next);
    });
  });

  function pick(e) {
    openMenu(
      e,
      KINDS.map((x) => ({
        label: x.id === kind ? `${x.label} ✓` : x.label,
        action: () => {
          kind = x.id;
          control({ type: 'setFxKind', deck, kind: x.id });
        },
      })),
    );
  }
  function step(dir) {
    const i = BEATS.indexOf(beats);
    const next = BEATS[Math.max(0, Math.min(BEATS.length - 1, (i < 0 ? 4 : i) + dir))];
    beats = next;
    control({ type: 'setFxBeats', deck, beats: next });
  }
  function toggle() {
    on = !on;
    control({ type: 'setFxOn', deck, on });
  }
  // Act on pointer-down, like the transport; keyboard clicks still work.
  const press = (fn) => ({
    onpointerdown: (e) => e.button === 0 && fn(e),
    onclick: (e) => e.detail === 0 && fn(e),
  });
</script>

<div class="fx" role="group" aria-label="Deck {name} effects">
  <button class="tb kind" aria-haspopup="menu" aria-label="Deck {name} effect, {k.label}" {...press(pick)}
    use:tip={() => 'Choose effect'}>{k.label}<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4l2.5 2.5L7.5 4" /></svg></button>
  <span class="sep"></span>
  <div class="beats" use:tip={() => `${k.beats}: ${beatText(beats)} ${beats > 1 ? 'beats' : 'beat'}`}>
    <button class="tb ar" aria-label="Shorter" aria-disabled={beats <= BEATS[0]} {...press(() => step(-1))}>‹</button>
    <span class="val" aria-live="polite" aria-label="{beatText(beats)} {beats > 1 ? 'beats' : 'beat'}"><b class="num">{beatText(beats)}</b> {beats > 1 ? 'beats' : 'beat'}</span>
    <button class="tb ar" aria-label="Longer" aria-disabled={beats >= BEATS[BEATS.length - 1]} {...press(() => step(1))}>›</button>
  </div>
  <span class="sep"></span>
  <Knob label="" name="Deck {name} {k.label.toLowerCase()} level" bind:value={level} min={0} max={1} reset={0.5} size={20} fromMin
    arc={'var(--deck)'} format={(v) => `${Math.round(v * 100)}%`} onchange={(v) => control({ type: 'setFxLevel', deck, value: v })} />
  <span class="sep"></span>
  <button class="tb tog" class:live={on} aria-pressed={on} {...press(toggle)}
    use:tip={() => `${k.label} ${on ? 'on' : 'off'}`}><i></i>{on ? 'On' : 'Off'}</button>
</div>

<style>
  .fx {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }
  button {
    border: 0;
    background: none;
    font: inherit;
    transition: background-color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  button:hover:not([aria-disabled='true']) {
    background: var(--hover);
  }
  button:active:not([aria-disabled='true']) {
    transform: scale(0.97);
  }
  button[aria-disabled='true'] {
    opacity: 0.4;
  }
  .tb {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: var(--h-md);
    height: var(--h-md);
    padding: 0 8px;
    border-radius: var(--r);
    color: var(--fg-2);
  }
  .tb.ar {
    font-size: var(--t-md);
  }
  .kind {
    color: var(--fg);
  }
  .kind svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    opacity: 0.6;
  }
  .sep {
    width: 1px;
    height: 16px;
    background: var(--line);
  }
  .beats {
    display: flex;
    align-items: center;
  }
  .val {
    min-width: 52px;
    text-align: center;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .val b {
    font-weight: 400;
    font-size: var(--t-sm);
    color: var(--fg);
  }
  .tog i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px currentColor;
  }
  .tog.live {
    color: var(--deck);
  }
  .tog.live i {
    background: var(--deck);
    box-shadow: none;
  }
</style>
