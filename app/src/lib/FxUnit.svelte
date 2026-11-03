<script>
  import Knob from './Knob.svelte';
  import { untrack } from 'svelte';
  import { engine, control as send } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';

  /**
   * One deck's effects: the channel filter, then a beat FX unit (effect,
   * beat length, level, on).
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

  let filter = $state(0);
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
  $effect(() => {
    const d = engine.decks[deck];
    untrack(() => {
      if (performance.now() - lastTouch < 500) return;
      if (d.filter !== undefined) filter = d.filter;
      if (d.fx) ({ kind, on, level, beats } = d.fx);
    });
  });

  const filterText = (v) =>
    Math.abs(v) < 0.02 ? 'off' : `${v < 0 ? 'low-pass' : 'high-pass'} ${Math.round(Math.abs(v) * 100)}%`;

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
  <Knob label="Filter" name="Deck {name} filter" bind:value={filter} min={-1} max={1} reset={0} size={24} format={filterText}
    onchange={(v) => control({ type: 'setFilter', deck, value: v })} />
  <span class="sep" aria-hidden="true"></span>
  <button class="btn sm kind" aria-haspopup="menu" aria-label="Deck {name} effect, {k.label}" {...press(pick)}
    use:tip={() => 'Choose effect'}>{k.label}<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4l2.5 2.5L7.5 4" /></svg></button>
  <div class="beats" use:tip={() => `${k.beats}: ${beatText(beats)} ${beats > 1 ? 'beats' : 'beat'}`}>
    <button class="btn sm" aria-label="Shorter" aria-disabled={beats <= BEATS[0]} {...press(() => step(-1))}>‹</button>
    <span class="num" aria-live="polite" aria-label="{beatText(beats)} {beats > 1 ? 'beats' : 'beat'}">{beatText(beats)}</span>
    <button class="btn sm" aria-label="Longer" aria-disabled={beats >= BEATS[BEATS.length - 1]} {...press(() => step(1))}>›</button>
  </div>
  <Knob label="Level" name="Deck {name} {k.label.toLowerCase()} level" bind:value={level} min={0} max={1} reset={0.5} size={24}
    format={(v) => `${Math.round(v * 100)}%`} onchange={(v) => control({ type: 'setFxLevel', deck, value: v })} />
  <button class="btn sm on" class:lit={on} aria-pressed={on} {...press(toggle)}
    use:tip={() => `${k.label} ${on ? 'on' : 'off'}`}>On</button>
</div>

<style>
  .fx {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .fx :global(.knob) {
    grid-auto-flow: column;
    align-items: center;
    gap: 7px;
  }
  .fx :global(.knob .label) {
    order: -1;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--line);
  }
  .btn.sm {
    height: 28px;
  }
  .kind {
    display: inline-flex;
    gap: 4px;
    padding: 0 8px 0 10px;
    min-width: 82px;
    justify-content: space-between;
  }
  .kind svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
  .beats {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .beats .btn {
    width: 26px;
    padding: 0;
    font-size: 14px;
  }
  .beats span {
    min-width: 30px;
    text-align: center;
    font-size: 12px;
    color: var(--fg-2);
  }
  .on {
    margin-left: auto;
  }
  .on.lit {
    color: var(--deck);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--deck) 60%, transparent);
  }
</style>
