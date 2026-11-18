<script>
  // A deck's eight hot cues, or its loop and beat jump, as a quiet strip
  // above the transport. A hot cue is its slot's colour and a time, like its line on
  // the waveform; an active loop takes the deck's colour.
  import { engine, tracks } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel } from './commands.js';
  import { PADS, hasGrid, beatsLabel, hotCue, clearHotCue, loopToggle, loopScale, beatJump } from './performance.js';
  import { deckSettings } from './decksettings.svelte.js';

  /** @type {{ deck: number, show?: 'all' | 'cues' | 'loop' }} */
  let { deck, show = 'all' } = $props();

  const d = $derived(engine.decks[deck]);
  const t = $derived(tracks[deck]);
  const grid = $derived(hasGrid(deck));
  const size = $derived(beatsLabel(d.loopBeats || 4));
  const beatsWord = $derived(d.loopBeats === 1 ? 'beat' : 'beats');
  const noGrid = $derived(t ? 'Needs a beatgrid, and none was found for this track' : 'Load a track first');

  let held = $state(-1);

  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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
      : tipText(`Hot cue ${i + 1} at ${fmt(at)}`, keyLabel(`deck.${deck}.hotCue.${i}`), deckSettings.hotCuePlays ? '⇧-click to clear' : 'hold to preview, ⇧-click to clear');
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
  <div class="row" role="group" aria-label="Deck {'AB'[deck]} hot cues">
    {#each Array.from({ length: PADS }, (_, i) => i) as i}
      {@const set = d.hotCues?.[i] != null}
      <button class="tc" class:set class:pressed={held === i} aria-disabled={!t} style:--hc="var(--hc-{i + 1})"
        aria-label={set ? `Hot cue ${i + 1}, at ${fmt(d.hotCues[i])}` : `Set hot cue ${i + 1}`}
        onpointerdown={(e) => padDown(e, i)} onpointerup={() => padUp(i)} onpointerleave={() => padUp(i)}
        onkeydown={(e) => padKey(e, i, true)} onkeyup={(e) => padKey(e, i, false)}
        oncontextmenu={(e) => padMenu(e, i)} use:tip={() => padTip(i)}><i></i><b class="num">{i + 1}</b><span class="num">{set ? mmss(d.hotCues[i]) : 'Set'}</span></button>
    {/each}
  </div>
  {/if}
  {#if show !== 'cues'}
  <div class="grp" role="group" aria-label="Deck {'AB'[deck]} loop">
    <button class="tb" aria-label="Halve loop" aria-disabled={!t} {...press(() => loopScale(deck, 0.5))}
      use:tip={() => tipText('Halve loop', keyLabel(`deck.${deck}.loopHalve`))}>½</button>
    <button class="tb ar" aria-label="Jump back {size} {beatsWord}" aria-disabled={!grid}
      onpointerdown={(e) => e.button === 0 && beatJump(deck, -1, e.shiftKey)} onclick={(e) => e.detail === 0 && beatJump(deck, -1, e.shiftKey)}
      use:tip={() => (grid ? tipText(`Jump back ${size} ${beatsWord}`, keyLabel(`deck.${deck}.jumpBack`)) : noGrid)}>‹</button>
    <button class="big" class:live={d.looping} aria-pressed={d.looping} aria-disabled={!grid}
      {...press(() => loopToggle(deck))}
      use:tip={() => (grid ? tipText(d.looping ? 'Exit loop' : `Loop ${size} ${beatsWord}`, keyLabel(`deck.${deck}.loop`)) : noGrid)}
    ><b class="num">{size}</b><span>{beatsWord}</span></button>
    <button class="tb ar" aria-label="Jump forward {size} {beatsWord}" aria-disabled={!grid}
      onpointerdown={(e) => e.button === 0 && beatJump(deck, 1, e.shiftKey)} onclick={(e) => e.detail === 0 && beatJump(deck, 1, e.shiftKey)}
      use:tip={() => (grid ? tipText(`Jump forward ${size} ${beatsWord}`, keyLabel(`deck.${deck}.jumpForward`)) : noGrid)}>›</button>
    <button class="tb" aria-label="Double loop" aria-disabled={!t} {...press(() => loopScale(deck, 2))}
      use:tip={() => tipText('Double loop', keyLabel(`deck.${deck}.loopDouble`))}>2×</button>
  </div>
  {/if}
</div>

<style>
  /* Two quiet rows on the deck's four columns, 1-4 over 5-8 like the
     controller's pads: words, numbers and small marks, no boxes. A hot cue
     is a colour and a time. */
  .row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0 8px;
    align-items: center;
  }
  button {
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    transition: background-color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  button:active:not([aria-disabled='true']) {
    transform: scale(0.97);
  }
  button:hover:not([aria-disabled='true']),
  .pressed {
    background: var(--hover);
  }
  button[aria-disabled='true'] {
    opacity: 0.4;
  }
  .tc {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--h-md);
    padding: 0 8px;
    border-radius: var(--r);
  }
  .tc i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .tc.set i {
    background: var(--hc);
    box-shadow: none;
  }
  /* An empty slot still sets a cue when pressed, so its text stays
     readable (fg-3 reaches 4.5:1); only the hollow dot says it's empty. */
  .tc b {
    font-weight: 500;
    color: var(--fg-3);
  }
  .tc span {
    color: var(--fg-3);
  }
  .tc.set b {
    color: var(--fg);
  }
  .tc.set span {
    color: var(--fg-2);
  }
  /* A short window has no room for two rows: all eight go on one, as a
     colour and a number. The time is in the tooltip. */
  @container (max-height: 63.9px) {
    .row {
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 4px;
    }
    .tc {
      gap: 5px;
      padding: 0 4px;
    }
    .tc span {
      display: none;
    }
  }
  .grp {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tb {
    min-width: var(--h-md);
    height: var(--h-md);
    padding: 0 8px;
    border-radius: var(--r);
    color: var(--fg-2);
  }
  .tb.ar {
    font-size: var(--t-md);
  }
  .big {
    display: flex;
    align-items: baseline;
    gap: 8px;
    height: 40px;
    padding: 0 12px;
    border-radius: var(--r);
    color: var(--fg);
  }
  .big b {
    font-size: var(--t-lg);
    font-weight: 300;
    letter-spacing: -0.02em;
  }
  .big span {
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .big.live {
    color: var(--deck);
  }
  .big.live span {
    color: inherit;
    opacity: 0.7;
  }
</style>
