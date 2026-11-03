<script>
  // The sampler strip: eight one-shot slots in one slim row under the
  // decks, shown only when asked for (or when a controller plays a
  // sample). A slot plays from the top on press, ⇧-click stops it, and a
  // library track dropped on a slot goes in it.
  import Knob from './Knob.svelte';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { dropTarget } from './dnd.svelte.js';
  import { engine } from './engine.svelte.js';
  import { keyLabel } from './commands.js';
  import { sampler, SLOTS, loadSample, clearSample, playSample, stopSample, setSamplerLevel, setSamplerOpen } from './sampler.svelte.js';

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

  function down(e, i) {
    if (e.button !== 0 || !sampler.slots[i]) return;
    if (e.shiftKey) stopSample(i);
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
    if (!s) return tipText(`Slot ${i + 1} is empty`, '', 'drag a track here');
    const d = live(i)?.duration;
    return tipText(`${s.title}${d ? `, ${len(d)}` : ''}`, '', 'click to play, ⇧-click to stop');
  };
  function menu(e, i) {
    const s = sampler.slots[i];
    const pick = selected();
    openMenu(e, [
      { label: 'Play', action: () => playSample(i), enabled: !!s },
      { label: 'Stop', action: () => stopSample(i), enabled: !!live(i)?.playing },
      '-',
      { label: pick ? `Put ${pick.title} here` : 'Put the selected track here', action: () => put(i, pick), enabled: !!pick },
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
      <button class="slot" class:set={!!s} class:playing={l?.playing} aria-disabled={!s}
        aria-label={s ? `Slot ${i + 1}, ${s.title}${l?.playing ? ', playing' : ''}` : `Slot ${i + 1}, empty`}
        style:--p={l?.playing ? l.progress : 0}
        onpointerdown={(e) => down(e, i)} onkeydown={(e) => key(e, i)} oncontextmenu={(e) => menu(e, i)}
        use:dropTarget={{ ondrop: (t) => put(i, t) }} use:tip={() => slotTip(i)}>
        <span class="n num">{i + 1}</span>
        <span class="name">{sampler.loading[i] ? 'Loading…' : (s?.title ?? '')}</span>
        {#if l?.playing}<i class="bar" aria-hidden="true"></i>{/if}
      </button>
    {/each}
  </div>
  <Knob label="Level" name="Sampler level" size={22} value={sampler.level} min={0} max={1} reset={0.8}
    format={(v) => `${Math.round(v * 100)}%`} onchange={setSamplerLevel} />
  <button class="close" aria-label="Hide sampler" onclick={() => setSamplerOpen(false)}
    use:tip={() => tipText('Hide sampler', keyLabel('view.sampler'), 'slots keep playing from a controller')}>
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
  </button>
</section>

<style>
  .sampler {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    padding: 0 12px 0 16px;
    border-top: 1px solid var(--line);
  }
  .title {
    flex: none;
    font-size: 11px;
    color: var(--fg-3);
  }
  .slots {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }
  .slot {
    position: relative;
    height: 30px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    overflow: hidden;
    border: 0;
    border-radius: 6px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--fg-4);
    font: 400 12px var(--font);
    text-align: left;
    touch-action: none;
    transition: color 0.12s, box-shadow 0.12s;
  }
  .slot.set {
    color: var(--fg-2);
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .slot.set:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .slot.set:active {
    background: var(--raise);
  }
  .slot.playing,
  .slot.playing:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  .n {
    flex: none;
    font-size: 11px;
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
  .close {
    flex: none;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
  }
  .close:hover {
    background: var(--raise);
    color: var(--fg);
  }
  .close svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
</style>
