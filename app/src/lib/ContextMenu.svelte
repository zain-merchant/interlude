<script>
  import { tick } from 'svelte';
  import { htmlMenu } from './menu.svelte.js';
  import { flag } from '../flags/registry.svelte.js';

  let el = $state();
  let w = $state(0);
  let h = $state(0);
  const left = $derived(Math.min(htmlMenu.x, window.innerWidth - w - 6));
  const top = $derived(Math.min(htmlMenu.y, window.innerHeight - h - 6));

  function close() {
    htmlMenu.open = false;
    htmlMenu.returnFocus?.focus?.();
  }
  function run(it) {
    close();
    it.action();
  }
  $effect(() => {
    // #14 (UI audit flag): states: opened by the pointer, the menu itself takes focus and no row is lit
    // until the pointer is on one; opened from the keyboard, the first item, as before.
    const roving = flag('states') && !htmlMenu.keyboard;
    if (htmlMenu.open) tick().then(() => (roving ? el?.focus() : el?.querySelector('button:not(:disabled)')?.focus()));
  });
  // #14 (UI audit flag): states: focus follows the pointer, so the lit row is always the one the
  // arrow keys and Return act on; leaving the menu puts focus back on the menu.
  const follow = (e) => flag('states') && !e.currentTarget.disabled && e.currentTarget.focus();
  const leave = () => flag('states') && el?.contains(document.activeElement) && el.focus();
  function key(e) {
    const items = [...el.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    // #14 (UI audit flag): states: from the menu itself (nothing lit), Down lights the first item and Up the last.
    if (i < 0 && flag('states') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) items[e.key === 'ArrowDown' ? 0 : items.length - 1]?.focus();
    else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

{#if htmlMenu.open}
  <div class="scrim" role="presentation" onpointerdown={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>
  <div class="menu" role="menu" tabindex="-1" bind:this={el} bind:clientWidth={w} bind:clientHeight={h}
    style:left="{left}px" style:top="{top}px" onkeydown={key} onpointerleave={leave}>
    {#each htmlMenu.items as it}
      {#if it === '-'}
        <div class="sep" role="separator"></div>
      {:else}
        <!-- #14 (UI audit flag): states: destructive items are marked, to draw them in --kill. -->
        <button role="menuitem" disabled={it.enabled === false} onclick={() => run(it)} onpointermove={follow}
          class:danger={flag('states') && /^(Delete|Remove)\b/.test(it.label)}>
          <span>{it.label}</span>{#if it.key}<kbd>{it.key}</kbd>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .menu {
    position: fixed;
    z-index: 91;
    min-width: 200px;
    padding: 4px;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2), 0 12px 32px rgb(0 0 0 / 0.45);
  }
  button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 6px 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--raise);
    outline: none;
  }
  button:disabled {
    color: var(--fg-4);
  }
  kbd {
    font: inherit;
    color: var(--fg-3);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--line);
  }
</style>
