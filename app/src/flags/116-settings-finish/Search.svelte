<script>
  // The search field over Settings' pages. The list it finds is
  // Results.svelte's; the arrows and Return are handled here, where the
  // caret stays.
  import { keyLabel } from '../../lib/commands.js';
  /** @type {{ query: string, active: number, count: number, onpick: () => void, input?: HTMLInputElement | null }} */
  let { query = $bindable(''), active = $bindable(0), count, onpick, input = $bindable(null) } = $props();
  const on = $derived(!!query.trim());

  function key(e) {
    if (e.key === 'Escape') {
      if (!query) return; // closes Settings
      query = '';
    } else if (!on) return;
    else if (e.key === 'ArrowDown') active = count ? (active + 1) % count : 0;
    else if (e.key === 'ArrowUp') active = count ? (active - 1 + count) % count : 0;
    else if (e.key === 'Enter') onpick();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<label class="sfind">
  <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.2" /><path d="M9.2 9.2 12.4 12.4" /></svg>
  <input bind:this={input} bind:value={query} oninput={() => (active = 0)} onkeydown={key} type="text" placeholder="Search" spellcheck="false" autocomplete="off"
    role="combobox" aria-label="Search settings" aria-expanded={on} aria-controls="settings-results" aria-autocomplete="list"
    aria-activedescendant={on && count ? `sr-${active}` : undefined} />
  {#if query}
    <button class="clear" aria-label="Clear search" onclick={() => { query = ''; input?.focus(); }}><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" /></svg></button>
  {:else}<kbd aria-hidden="true">{keyLabel('library.search')}</kbd>{/if}
</label>
