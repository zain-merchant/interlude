<script>
  // A deck's beatgrid fixes, in the deck's Grid tab. While this tab is open,
  // dragging the deck's scrolling waveform slides the grid.
  import { tracks } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { keyLabel } from './commands.js';
  import { gridEdit, bpmEdit, NUDGE } from './grid.svelte.js';

  /** @type {{ deck: number }} */
  let { deck } = $props();

  const t = $derived(tracks[deck]);
  const has = $derived(!!t?.beatgrid);
  const why = $derived(!t ? 'Load a track first' : !has ? 'No beatgrid yet. Set the BPM first' : '');

  const ACTIONS = [
    { label: '‹', aria: 'Move grid earlier', grid: true, tip: () => tipText('Move grid earlier', keyLabel(`deck.${deck}.gridEarlier`), 'or drag the waveform'),
      run: () => gridEdit(deck, 'nudge', 'Moved the grid earlier', -NUDGE) },
    { label: '›', aria: 'Move grid later', grid: true, tip: () => tipText('Move grid later', keyLabel(`deck.${deck}.gridLater`), 'or drag the waveform'),
      run: () => gridEdit(deck, 'nudge', 'Moved the grid later', NUDGE) },
    { label: 'Downbeat', grid: true, tip: () => tipText('Make the play head the first beat of a bar', keyLabel(`deck.${deck}.gridDownbeat`)),
      run: () => gridEdit(deck, 'downbeat', 'Moved the downbeat') },
    { label: '½', aria: 'Halve BPM', grid: true, tip: () => 'Halve BPM', run: () => gridEdit(deck, 'halve', 'Halved the BPM') },
    { label: '×2', aria: 'Double BPM', grid: true, tip: () => 'Double BPM', run: () => gridEdit(deck, 'double', 'Doubled the BPM') },
    { label: 'BPM', aria: 'Type the BPM', grid: false, tip: () => 'Type the BPM', run: () => (bpmEdit.deck = deck) },
    { label: 'Reset', aria: 'Reset to detected grid', grid: false, locked: true, tip: () => 'Go back to the detected grid', run: () => gridEdit(deck, 'reset', 'Reset the beatgrid') },
  ];
  const off = (a) => !t || (a.grid && !has) || (a.locked && !t.gridLocked);
</script>

<div class="grid" role="group" aria-label="Deck {'AB'[deck]} beatgrid">
  {#each ACTIONS as a}
    <button class:sym={a.label.length <= 2} aria-label={a.aria} aria-disabled={off(a)}
      onclick={() => !off(a) && a.run()} use:tip={() => (off(a) && why ? why : a.tip())}>{a.label}</button>
  {/each}
</div>

<style>
  .grid {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  button {
    height: var(--h-md);
    min-width: var(--h-md);
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg);
    font: inherit;
    white-space: nowrap;
    transition: background-color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  button.sym {
    font-size: var(--t-md, 15px);
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
</style>
