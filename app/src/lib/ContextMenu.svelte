<script>
  import { tick } from 'svelte';
  import { htmlMenu } from './menu.svelte.js';

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
    if (htmlMenu.open) tick().then(() => el?.querySelector('button:not(:disabled)')?.focus());
  });
  function key(e) {
    const items = [...el.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
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
    style:left="{left}px" style:top="{top}px" onkeydown={key}>
    {#each htmlMenu.items as it}
      {#if it === '-'}
        <div class="sep" role="separator"></div>
      {:else}
        <button role="menuitem" disabled={it.enabled === false} onclick={() => run(it)}>
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
