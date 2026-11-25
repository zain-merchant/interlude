<script>
  // The sampler strip: eight one-shot slots in one slim row at the top of
  // the library, shown when asked for (or when a controller plays a
  // sample). A slot plays from the top on press and ⇧-click stops it.
  // Clicking an empty slot asks for a sound file; a library track dropped
  // on a slot goes in it too.
  import Knob from './Knob.svelte';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { engine } from './engine.svelte.js';
  import { flag } from '../flags/registry.svelte.js';
  import { sampler, SLOTS, loadSample, clearSample, playSample, stopSample, setSamplerLevel, pickSample, loadDefaultSample, defaultSamples } from './sampler.svelte.js';

  /** @type {{ onmessage?: (text: string) => void, selected?: () => any }} */
  let { onmessage = () => {}, selected = () => null } = $props();

  const slots = Array.from({ length: SLOTS }, (_, i) => i);
  const live = (i) => engine.sampler?.slots[i];
  const len = (s) => (s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);

  async function put(i, track) {
    if (!track) return;
    try {
      await loadSample(i, track);
    } catch (e) {
      onmessage(`Couldn't use ${track.title} as a sample: ${e}`);
    }
  }

  async function choose(i) {
    try {
      await pickSample(i);
    } catch (e) {
      onmessage(`Couldn't use that file as a sample: ${e}`);
    }
  }

  async function builtIn(i) {
    try {
      await loadDefaultSample(i);
    } catch (e) {
      onmessage(`Couldn't load the built-in sound: ${e}`);
    }
  }

  // The built-in sound for each slot, for the menu.
  let builtIns = $state([]);
  defaultSamples().then((d) => (builtIns = d));

  function down(e, i) {
    if (e.button !== 0 || sampler.loading[i]) return;
    if (!sampler.slots[i]) choose(i);
    else if (e.shiftKey) stopSample(i);
    else playSample(i);
  }
  function key(e, i) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) down({ button: 0, shiftKey: e.shiftKey }, i);
  }

  const slotTip = (i) => {
    const s = sampler.slots[i];
    if (sampler.loading[i]) return 'Loading…';
    if (!s) return tipText(`Slot ${i + 1} is empty`, '', 'click to choose a sound, or drag a track here');
    const d = live(i)?.duration;
    return tipText(`${s.title}${d ? `, ${len(d)}` : ''}`, '', 'click to play, ⇧-click to stop');
  };
  function menu(e, i) {
    const s = sampler.slots[i];
    const pick = selected();
    const d = builtIns[i];
    openMenu(e, [
      { label: 'Play', action: () => playSample(i), enabled: !!s },
      { label: 'Stop', action: () => stopSample(i), enabled: !!live(i)?.playing },
      '-',
      { label: 'Choose a sound…', action: () => choose(i) },
      // #68 (UI audit flag): mixer-polish names the slot the menu acts on (it can be half under the menu).
      flag('mixer-polish')
        ? { label: pick ? `Load ${pick.title} into slot ${i + 1}` : `Load the selected track into slot ${i + 1}`, action: () => put(i, pick), enabled: !!pick }
        : { label: pick ? `Put ${pick.title} here` : 'Put the selected track here', action: () => put(i, pick), enabled: !!pick },
      ...(d ? [{ label: `Use the built-in ${d.title.toLowerCase()}`, action: () => builtIn(i), enabled: s?.path !== d.path }] : []),
      { label: 'Clear slot', action: () => clearSample(i), enabled: !!s },
    ]);
  }
</script>

<section class="sampler" aria-label="Sampler">
  <span class="title">Sampler</span>
  <div class="slots" role="group" aria-label="Sampler slots">
    {#each slots as i}
      {@const s = sampler.slots[i]}
      {@const l = live(i)}
      <button class="slot" class:set={!!s} class:playing={l?.playing}
        aria-label={s ? `Slot ${i + 1}, ${s.title}${l?.playing ? ', playing' : ''}` : `Slot ${i + 1}, empty, choose a sound`}
        style:--p={l?.playing ? l.progress : 0}
        onpointerdown={(e) => down(e, i)} onkeydown={(e) => key(e, i)} oncontextmenu={(e) => menu(e, i)}
        use:dropTarget={{ ondrop: (t) => put(i, t) }} use:tip={() => slotTip(i)}>
        <span class="n num">{i + 1}</span>
        <span class="name">{sampler.loading[i] ? 'Loading…' : (s?.title ?? 'Add sound')}</span>
        {#if l?.playing}<i class="bar" aria-hidden="true"></i>{/if}
      </button>
    {/each}
  </div>
  <!-- #67 / #66 (UI audit flags): sampler-strip's smaller dial fits the strip; knob-rings' quieter ring. -->
  <Knob label="Level" name="Sampler level" size={flag('sampler-strip') ? 14 : 22} fromMin arc={flag('knob-rings') ? 'var(--fg-2)' : undefined} value={sampler.level} min={0} max={1} reset={0.8}
    format={(v) => `${Math.round(v * 100)}%`} onchange={setSamplerLevel} />
</section>

<style>
  /* A row inside the library panel, under its search bar. */
  .sampler {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 0 0 8px;
  }
  /* The level dial with its label beside it, so it fits the strip. */
  .sampler :global(.knob) {
    grid-auto-flow: column;
    align-items: center;
    gap: 4px;
  }
  .sampler :global(.knob .label) {
    order: -1;
    margin: 0;
  }
  .title {
    flex: none;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .slots {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
  }
  .slot {
    position: relative;
    height: var(--h-sm);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    overflow: hidden;
    border: 0;
    border-radius: 6px;
    background: var(--well);
    box-shadow: var(--well-shadow);
    color: var(--fg-4);
    font: 400 var(--t-xs) var(--font);
    text-align: left;
    touch-action: none;
    transition: color 0.12s, box-shadow 0.12s;
  }
  .slot.set {
    color: var(--fg-2);
    background: none;
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .slot:not(.set):hover {
    color: var(--fg-2);
  }
  .slot.set:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .slot.set:active {
    background: var(--sel);
  }
  .slot.playing,
  .slot.playing:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  .n {
    flex: none;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .playing .n {
    color: var(--fg);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* How far through the sample is, as a hairline along the bottom. */
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: calc(var(--p) * 100%);
    background: var(--fg);
  }
</style>
