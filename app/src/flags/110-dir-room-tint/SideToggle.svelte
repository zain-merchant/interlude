<script>
  // #110 (UI audit flag): the button that puts the sidebar away, on the line
  // of the Library heading. It's one button: it rides the sidebar's edge, so
  // closed it stands at the toolbar's start, on the same line, still focused.
  // A track dragged to the closed edge opens the sidebar until it's dropped.
  import { tip, tipText } from '../../lib/tooltip.svelte.js';
  import { drag } from '../../lib/dnd.svelte.js';
  import { side, sideShut, hideSidebar, SIDE_KEY } from './sidebar.svelte.js';

  let el = $state(/** @type {HTMLButtonElement | null} */ (null));
  // Focus in the sidebar comes out of it as it goes.
  $effect(() => {
    if (!sideShut()) return;
    const nav = el?.parentElement?.querySelector('nav');
    if (nav?.contains(document.activeElement)) el?.focus({ preventScroll: true });
  });
  $effect(() => {
    if (!drag.track && side.peek) side.peek = false;
  });
  let over = 0;
  const enter = () => {
    clearTimeout(over);
    over = window.setTimeout(() => (side.peek = true), 180);
  };
  const leave = () => clearTimeout(over);
</script>

<button class="sidetoggle" bind:this={el} aria-label={side.hidden ? 'Show the sidebar' : 'Hide the sidebar'} aria-expanded={!side.hidden} aria-keyshortcuts="Meta+\"
  onclick={() => hideSidebar(!side.hidden)} use:tip={() => tipText(side.hidden ? 'Show the sidebar' : 'Hide the sidebar', SIDE_KEY)}>
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.75 3h8.5C13.22 3 14 3.78 14 4.75v6.5c0 .97-.78 1.75-1.75 1.75h-8.5C2.78 13 2 12.22 2 11.25v-6.5C2 3.78 2.78 3 3.75 3zM6.5 3v10" /></svg>
</button>
{#if side.hidden && drag.track && !side.peek}
  <!-- svelte-ignore a11y_no_static_element_interactions (a drag's way in; the keyboard has ⌘\) -->
  <div class="sideedge" ondragenter={enter} ondragover={(e) => e.preventDefault()} ondragleave={leave}></div>
{/if}

<style>
  .sidetoggle {
    position: absolute;
    z-index: 7;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--fg-3);
  }
  .sidetoggle:hover {
    background: var(--hover);
    color: var(--fg);
  }
  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .sideedge {
    position: absolute;
    z-index: 6;
    left: 0;
    top: 0;
    bottom: 0;
    width: 28px;
  }
</style>
