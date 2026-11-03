<script>
  // A deck's hot cue pads, loop and beat jump controls, in one row above
  // the transport. Hot cues are cue points, so a set pad takes the cue
  // colour; an active loop is white, like the waveform's loop region.
  import { engine, tracks } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { PADS, hasGrid, beatsLabel, hotCue, clearHotCue, loopToggle, loopScale, beatJump } from './performance.js';

  /** @type {{ deck: number, show?: 'all' | 'cues' | 'loop' }} */
  let { deck, show = 'all' } = $props();

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const grid = $derived(hasGrid(deck));
  const size = $derived(beatsLabel(d.loopBeats || 4));
  const beatsWord = $derived(d.loopBeats === 1 ? 'beat' : 'beats');
  const noGrid = $derived(t ? 'Needs a beatgrid, and none was found for this track' : 'Load a track first');

  let held = $state(-1);

  function fmt(s) {
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
  }

  function padDown(e, i) {
    if (e.button !== 0 || !t) return;
    if (e.shiftKey) return clearHotCue(deck, i);
    held = i;
    hotCue(deck, i, true);
  }
  function padUp(i) {
    if (held !== i) return;
    held = -1;
    hotCue(deck, i, false);
  }
  function padKey(e, i, down) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (down && e.repeat) return;
    if (down) padDown({ button: 0, shiftKey: e.shiftKey }, i);
    else padUp(i);
  }
  const padTip = (i) => {
    const at = d.hotCues?.[i];
    if (!t) return 'Load a track first';
    return at == null
      ? tipText(`Set hot cue ${i + 1}`, keyLabel(`deck.${deck}.hotCue.${i}`))
      : tipText(`Hot cue ${i + 1} at ${fmt(at)}`, keyLabel(`deck.${deck}.hotCue.${i}`), 'hold to preview, ⇧-click to clear');
  };
  const padMenu = (e, i) =>
    openMenu(e, [
      { label: `Clear hot cue ${i + 1}`, action: () => clearHotCue(deck, i), key: keyLabel(`deck.${deck}.hotCueClear.${i}`), enabled: d.hotCues?.[i] != null },
    ]);

  const press = (fn) => ({
    onpointerdown: (e) => e.button === 0 && fn(),
    onclick: (e) => e.detail === 0 && fn(),
  });
</script>

<div class="perf">
  {#if show !== 'loop'}
  <div class="pads" role="group" aria-label="Deck {'AB'[deck]} hot cues">
    {#each Array.from({ length: PADS }, (_, i) => i) as i}
      {@const set = d.hotCues?.[i] != null}
      <button class="btn sm pad num" class:set class:pressed={held === i} aria-disabled={!t}
        aria-label={set ? `Hot cue ${i + 1}, at ${fmt(d.hotCues[i])}` : `Set hot cue ${i + 1}`}
        onpointerdown={(e) => padDown(e, i)} onpointerup={() => padUp(i)} onpointerleave={() => padUp(i)}
        onkeydown={(e) => padKey(e, i, true)} onkeyup={(e) => padKey(e, i, false)}
        oncontextmenu={(e) => padMenu(e, i)} use:tip={() => padTip(i)}>{i + 1}</button>
    {/each}
  </div>
  {/if}
  {#if show === 'all'}<span class="sp"></span>{/if}
  {#if show !== 'cues'}
  <div class="loop" role="group" aria-label="Deck {'AB'[deck]} loop">
    <button class="btn sm ghost step" aria-label="Halve loop" aria-disabled={!t} {...press(() => loopScale(deck, 0.5))}
      use:tip={() => tipText('Halve loop', keyLabel(`deck.${deck}.loopHalve`))}>½</button>
    <button class="btn sm ghost toggle" class:on={d.looping} aria-pressed={d.looping} aria-disabled={!grid}
      {...press(() => loopToggle(deck))}
      use:tip={() => (grid ? tipText(d.looping ? 'Exit loop' : `Loop ${size} ${beatsWord}`, keyLabel(`deck.${deck}.loop`)) : noGrid)}
    >Loop <span class="num size">{size}</span></button>
    <button class="btn sm ghost step" aria-label="Double loop" aria-disabled={!t} {...press(() => loopScale(deck, 2))}
      use:tip={() => tipText('Double loop', keyLabel(`deck.${deck}.loopDouble`))}>2×</button>
  </div>
  <div class="jump" role="group" aria-label="Deck {'AB'[deck]} beat jump">
    {#each [{ dir: -1, id: 'jumpBack', label: 'Jump back' }, { dir: 1, id: 'jumpForward', label: 'Jump forward' }] as j}
      <button class="btn sm ghost step" aria-label="{j.label} {size} {beatsWord}" aria-disabled={!grid} {...press(() => beatJump(deck, j.dir))}
        use:tip={() => (grid ? tipText(`${j.label} ${size} ${beatsWord}`, keyLabel(`deck.${deck}.${j.id}`)) : noGrid)}>
        <svg viewBox="0 0 16 16" aria-hidden="true" class:flip={j.dir > 0}>
          <path d="M8 3.5 3.5 8 8 12.5M12.5 3.5 8 8l4.5 4.5" />
        </svg>
      </button>
    {/each}
  </div>
  {/if}
</div>

<style>
  .perf {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .pads,
  .loop,
  .jump {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .pads {
    flex: 0 1 auto;
  }
  .sp {
    flex: 1;
  }
  .pad {
    width: 40px;
    min-width: 28px;
    flex: 0 1 40px;
    padding: 0;
    color: var(--fg-4);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .pad.set {
    color: var(--cue);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cue) 55%, transparent);
  }
  .pad.set:hover:not([aria-disabled='true']) {
    color: var(--cue);
    box-shadow: inset 0 0 0 1.5px var(--cue);
  }
  .step {
    width: 32px;
    padding: 0;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 68px;
    padding: 0 10px;
    white-space: nowrap;
  }
  .size {
    color: var(--fg-3);
  }
  .toggle.on,
  .toggle.on:hover {
    color: var(--fg);
    background: var(--raise);
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  .toggle.on .size {
    color: var(--fg);
  }
  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  svg.flip {
    transform: scaleX(-1);
  }
</style>
