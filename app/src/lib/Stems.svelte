<script>
  // A deck's stems: vocals, melody, bass and drums. Click mutes a stem,
  // Shift-click plays it alone. A stem that plays has a filled dot; a muted
  // one a hollow dot and dim text; a soloed one takes the deck's colour. While the
  // track is still being split, a hairline under the buttons fills up. Until
  // the model has downloaded, the buttons give way to how that's going. A
  // press that isn't heard yet, because the track isn't split there, pulses.
  import { tick } from 'svelte';
  import { announce } from './announce.svelte.js';
  import { tracks } from './engine.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { keyLabel } from './commands.js';
  import { STEMS, stemsOf, usable, waiting, soloed, toggleStem, soloStem, chooseStems, prepares } from './stems.svelte.js';
  import { stemsModel, downloadStems, watchStemsModel } from './stemsmodel.svelte.js';
  import { percent, progressText, stemsStatus, STEMS_MODES, STEMS_WHAT } from './stemsmodel.js';
  import { flag } from '../flags/registry.svelte.js';
  import { draw } from '../flags/113-zero-states/drawings.js'; // #113 (UI audit flag)

  /** @type {{ deck: number, onsettings?: () => void }} */
  let { deck, onsettings } = $props();

  const t = $derived(tracks[deck]);
  const s = $derived(stemsOf(deck));
  const can = $derived(usable(deck));
  const solo = $derived(soloed(s.mask));
  const later = $derived(waiting(deck));

  /** Why the buttons can't be used, or '' if they can. */
  const why = $derived.by(() => {
    if (!t) return 'Load a track first';
    switch (s.state) {
      case 'failed':
        return `Stems couldn't be made: ${s.error ?? 'unknown error'}. Click for Settings`;
      case 'off':
        return 'Stems are off. Click to turn them on in Settings';
      default:
        return '';
    }
  });

  // A track that's in the cache has its stems without the model, so the
  // deck decides. An empty deck shows a download that's on its way.
  const getting = $derived(t ? s.state === 'needsModel' : ['downloading', 'waiting', 'failed'].includes(stemsModel.state));
  // Until it's chosen how stems work, the choice is here, ahead of a
  // download: there's nothing to wait for. A cached track has its stems.
  const asking = $derived(stemsModel.known && stemsModel.mode === 'ask' && !(t && s.state === 'ready'));
  let more = $state(false);
  let failed = $state('');
  async function choose(mode) {
    failed = '';
    try {
      await chooseStems(deck, mode);
      more = false;
    } catch (e) {
      failed = String(e);
    }
  }
  // On the window: in WebKit a click leaves a button without focus.
  /** @param {KeyboardEvent} e */
  function moreKey(e) {
    if (e.key !== 'Escape' || !more) return;
    e.preventDefault();
    e.stopPropagation();
    more = false;
    /** @type {HTMLElement | null} */ (root?.querySelector('.info'))?.focus();
  }
  function showMore() {
    more = !more;
    // It's put at the end of the page, so it's read out rather than found.
    if (more) announce([STEMS_WHAT, ...STEMS_MODES.map((m) => `${m.name}. ${m.line}`)].join(' '));
  }
  /** Puts the detail over everything: a panel would cover or cut it off. @param {HTMLElement} node */
  function over(node) {
    document.body.append(node);
    const at = root.getBoundingClientRect();
    node.style.left = `${Math.max(16, Math.min(at.left, innerWidth - node.offsetWidth - 16))}px`;
    node.style.bottom = `${innerHeight - at.top + 8}px`;
    return { destroy: () => node.remove() };
  }
  const status = $derived(stemsStatus(stemsModel));
  const act = () => (status.action ? downloadStems().catch((e) => console.error('stems model', e)) : onsettings?.());
  $effect(() => (getting ? watchStemsModel() : undefined));

  // #113 (UI audit flag): zero-states: what stands in for the stems when there are none to press.
  const zero = $derived.by(() => {
    if (!flag('zero-states') || !flag('dir-room-tint') || asking) return null;
    if (getting) return { title: status.title, line: status.detail, p: stemsModel.total ? stemsModel.done / stemsModel.total : 0, act: status.action || 'Settings' };
    if (!t) return null;
    if (s.state === 'off') return { title: 'Stems are off', line: '', p: 0, act: 'Turn on…' };
    if (s.state === 'failed') return { title: 'Couldn’t make stems', line: s.error ?? '', p: 0, act: 'Settings' };
    return null;
  });
  const zeroAct = () => (getting ? act() : onsettings?.());

  // Focus on the status's button moves to the first stem when they're back.
  let root;
  $effect.pre(() => {
    if (getting || asking || !root?.contains(document.activeElement)) return;
    tick().then(() => document.activeElement === document.body && root?.querySelector('.stem')?.focus());
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
    const soon = later ? ', in a moment' : '';
    if (solo === i) return `${STEMS[i]} playing alone${soon}`;
    return `${STEMS[i]} ${on ? 'on' : `muted${soon}`}`;
  };
  const stemTip = (i) => {
    if (why) return why;
    const on = (s.mask >> i) & 1;
    const what = solo === i ? `${STEMS[i]} alone, ⇧-click for all` : on ? `Mute ${STEMS[i].toLowerCase()}` : `Unmute ${STEMS[i].toLowerCase()}`;
    const note = later ? 'heard in a moment, once this part is ready' : s.state === 'onUse' ? 'ready a moment after you press it' : s.state === 'splitting' || s.state === 'starting' ? `${Math.round(s.ready * 100)}% of the track ready` : '⇧-click to play it alone';
    return tipText(what, keyLabel(`deck.${deck}.stem.${i}`), note);
  };
</script>

<svelte:window onkeydowncapture={moreKey} onpointerdown={(e) => { if (more && !root?.contains(/** @type {Node} */ (e.target))) more = false; }} onresize={() => (more = false)} />

<div class="stems" use:prepares={() => ({ deck })} role="group" aria-label="{flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${'AB'[deck]}`} stems" style:--deck={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} bind:this={root}>
  {#if asking}
    <div class="choice">
      <div class="options" role="group" aria-label="How should stems work?">
        {#each STEMS_MODES as m}
          <button class="option" onclick={() => choose(m.mode)} aria-describedby="stems-{deck}-{m.mode}" use:tip={() => m.line}>
            <b>{m.name}</b><span id="stems-{deck}-{m.mode}">{m.short}</span></button>
        {/each}
      </div>
      <button class="info" aria-expanded={more} aria-controls="stems-more-{deck}" aria-label="About this choice" onclick={showMore}
        use:tip={() => 'About this choice'}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v4M8 4.6v.6" /></svg></button>
      {#if more}
        <div class="more" use:over id="stems-more-{deck}">
          <p>{STEMS_WHAT}</p>
          {#each STEMS_MODES as m}<p><b>{m.name}.</b> {m.line}</p>{/each}
          <p>Change it whenever you like in Settings › Stems.</p>
        </div>
      {/if}
      {#if failed}<p class="failed" role="alert">{failed}</p>{/if}
    </div>
  {:else if zero}
    <!-- #113 (UI audit flag): zero-states: a record in four rings, filling as the model comes down. -->
    <div class="zstem">
      {@html draw.stems(64, zero.p)}
      <div><p>{zero.title}</p>{#if zero.line}<p class="num">{zero.line}</p>{/if}</div>
      <button class="btn sm" onclick={zeroAct}>{zero.act}</button>
      {#if getting && stemsModel.done && stemsModel.state !== 'ready'}
        <span class="sr" role="progressbar" aria-label="Stems download" aria-valuemin="0" aria-valuemax="100"
          aria-valuenow={percent(stemsModel)} aria-valuetext={progressText(stemsModel)}></span>
      {/if}
    </div>
  {:else if getting}
    <div class="getting">
      <span class="what num" use:tip={() => [status.title, status.detail].filter(Boolean).join(': ')}>{status.title}
        {#if status.detail}<span class="detail">{status.detail}</span>{/if}</span>
      <button class="btn sm" onclick={act}>{status.action || 'Settings'}</button>
    </div>
    {#if stemsModel.done && stemsModel.state !== 'ready'}
      <div class="progress" role="progressbar" aria-label="Stems download" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow={percent(stemsModel)} aria-valuetext={progressText(stemsModel)}><i style:transform="scaleX({stemsModel.done / stemsModel.total})"></i></div>
    {/if}
  {:else}
    <div class="row">
      {#each STEMS as name, i}
        {@const on = !!((s.mask >> i) & 1)}
        <button class="stem" class:muted={!on} class:solo={solo === i} class:later={later && (solo === i || (solo < 0 && !on))} aria-disabled={!can && !(t && why)}
          aria-pressed={on} aria-label={label(i)}
          onpointerdown={(e) => down(e, i)} onclick={(e) => e.detail === 0 && down({ button: 0, shiftKey: e.shiftKey }, i)}
          onkeydown={(e) => key(e, i)} use:tip={() => stemTip(i)}><i></i>{name}</button>
      {/each}
    </div>
  {/if}
  {#if t && (s.state === 'splitting' || s.state === 'starting')}
    <div class="progress" role="progressbar" aria-label="Getting stems ready" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow={Math.round(s.ready * 100)}><i style:transform="scaleX({Math.round(s.ready * 200) / 200})"></i></div>
  {/if}
</div>

<style>
  .stems {
    position: relative;
    container-type: inline-size;
    min-width: 0;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
  }
  .choice {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .options {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .option {
    min-width: 0;
    min-height: var(--h-lg);
    padding: 4px 12px;
    border: 0;
    border-radius: var(--r);
    background: none;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg-2);
    font: inherit;
    text-align: left;
    transition: background-color 140ms ease;
  }
  .option:hover {
    background: var(--hover);
  }
  .option b,
  .option span {
    display: block;
  }
  .option span {
    line-height: 13px;
    text-wrap: balance;
  }
  .option b {
    line-height: 16px;
    font-weight: 400;
    color: var(--fg);
  }
  .option span {
    font-size: var(--t-xs);
  }
  .info {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--h-md);
    height: var(--h-md);
    padding: 0;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
  }
  .info:hover,
  .info[aria-expanded='true'] {
    background: var(--hover);
    color: var(--fg);
  }
  .info svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .more {
    position: fixed;
    z-index: 40;
    width: min(360px, 100vw - 32px);
    padding: 12px;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2), 0 12px 32px rgb(0 0 0 / 0.45);
    color: var(--fg-2);
    pointer-events: none;
  }
  .more p {
    margin: 0 0 8px;
  }
  .more p:last-child {
    margin: 0;
  }
  .more b {
    font-weight: 400;
    color: var(--fg);
  }
  .failed {
    position: absolute;
    top: 100%;
    margin: 0;
    color: var(--kill);
    font-size: var(--t-xs);
  }
  .getting {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--h-md);
    padding-left: 8px;
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }
  .detail {
    margin-left: 8px;
    color: var(--fg-2);
  }
  .getting .btn {
    flex: none;
  }
  /* Too narrow for the line: the name, and the rest in the detail. */
  @container (max-width: 299px) {
    .choice .option {
      min-height: var(--h-md);
      padding: 0 8px;
      text-align: center;
    }
    .option span {
      display: none;
    }
  }
  /* Narrow decks: two small lines, in the height of one. */
  @container (max-width: 320px) {
    .getting {
      padding-left: 0;
    }
    .option {
      padding: 4px 8px;
    }
    .what {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      white-space: normal;
      font-size: var(--t-xs);
      line-height: 14px;
    }
    .detail {
      display: block;
      margin-left: 0;
      white-space: nowrap;
    }
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
  /* Pressed, and not heard yet. */
  .stem.later i {
    animation: later 0.9s ease-in-out infinite alternate;
  }
  @keyframes later {
    to {
      opacity: 0.25;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stem.later i {
      animation: none;
      opacity: 0.4;
    }
  }
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -6px;
    height: 1px;
    background: var(--line);
  }
  /* Grown by scaling, not by width, so the bar moving (every frame while a
     track splits) doesn't lay the deck out again each time; and in half
     percent steps, which its transition smooths over. */
  .progress i {
    display: block;
    height: 100%;
    background: var(--fg-3);
    transform-origin: left;
    transition: transform 0.3s linear;
  }
</style>
