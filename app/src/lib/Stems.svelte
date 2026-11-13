<script>
  // A deck's stems: vocals, melody, bass and drums. Click mutes a stem,
  // Shift-click plays it alone. A stem that plays has a filled dot; a muted
  // one a hollow dot and dim text; a soloed one takes the deck's colour. While the
  // track is still being split, a hairline under the buttons fills up.
  import { tracks } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { keyLabel } from './commands.js';
  import { STEMS, stemsOf, usable, soloed, toggleStem, soloStem } from './stems.svelte.js';

  /** @type {{ deck: number, onsettings?: () => void }} */
  let { deck, onsettings } = $props();

  const t = $derived(tracks[deck]);
  const s = $derived(stemsOf(deck));
  const can = $derived(usable(deck));
  const solo = $derived(soloed(s.mask));

  /** Why the buttons can't be used, or '' if they can. */
  const why = $derived.by(() => {
    if (!t) return 'Load a track first';
    switch (s.state) {
      case 'needsModel':
        return 'Stems need a one-time download of the separation model. Click to get it in Settings';
      case 'failed':
        return `Stems couldn't be made: ${s.error ?? 'unknown error'}. Click for Settings`;
      case 'off':
        return 'Stems are off. Click to turn them on in Settings';
      default:
        return '';
    }
  });

  function down(e, i) {
    if (e.button !== 0) return;
    if (!can) {
      if (t) onsettings?.();
      return;
    }
    if (e.shiftKey) soloStem(deck, i);
    else toggleStem(deck, i);
  }
  function key(e, i) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) down({ button: 0, shiftKey: e.shiftKey }, i);
  }
  const label = (i) => {
    const on = (s.mask >> i) & 1;
    if (solo === i) return `${STEMS[i]} playing alone`;
    return `${STEMS[i]} ${on ? 'on' : 'muted'}`;
  };
  const stemTip = (i) => {
    if (why) return why;
    const on = (s.mask >> i) & 1;
    const what = solo === i ? `${STEMS[i]} alone, ⇧-click for all` : on ? `Mute ${STEMS[i].toLowerCase()}` : `Unmute ${STEMS[i].toLowerCase()}`;
    const note = s.state === 'splitting' || s.state === 'starting' ? `splitting, ${Math.round(s.ready * 100)}% ready` : '⇧-click to play it alone';
    return tipText(what, keyLabel(`deck.${deck}.stem.${i}`), note);
  };
</script>

<div class="stems" role="group" aria-label="Deck {'AB'[deck]} stems" style:--deck={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'}>
  <div class="row">
    {#each STEMS as name, i}
      {@const on = !!((s.mask >> i) & 1)}
      <button class="stem" class:muted={!on} class:solo={solo === i} aria-disabled={!can && !(t && why)}
        aria-pressed={on} aria-label={label(i)}
        onpointerdown={(e) => down(e, i)} onclick={(e) => e.detail === 0 && down({ button: 0, shiftKey: e.shiftKey }, i)}
        onkeydown={(e) => key(e, i)} use:tip={() => stemTip(i)}><i></i>{name}</button>
    {/each}
  </div>
  {#if t && (s.state === 'splitting' || s.state === 'starting')}
    <div class="progress" role="progressbar" aria-label="Splitting into stems" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow={Math.round(s.ready * 100)}><i style:width="{s.ready * 100}%"></i></div>
  {/if}
</div>

<style>
  .stems {
    position: relative;
    min-width: 0;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
  }
  .stem {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    height: var(--h-md);
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg);
    font: inherit;
    white-space: nowrap;
    overflow: hidden;
    transition: background-color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .stem:hover:not([aria-disabled='true']) {
    background: var(--hover);
  }
  .stem:active:not([aria-disabled='true']) {
    transform: scale(0.97);
  }
  .stem[aria-disabled='true'] {
    opacity: 0.4;
  }
  .stem i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--deck);
  }
  /* Muted, but still a control: dim to fg-3, which stays readable. */
  .stem.muted {
    color: var(--fg-3);
  }
  .stem.muted i {
    background: none;
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .stem.solo {
    color: var(--deck);
  }
  .stem.solo i {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--deck) 25%, transparent);
  }
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -6px;
    height: 1px;
    background: var(--line);
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--fg-3);
    transition: width 0.3s;
  }
</style>
