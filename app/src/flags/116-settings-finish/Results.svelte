<script>
  import { marks } from './find.js';
  import Keys from './Keys.svelte';
  /** @type {{ results: import('./find.js').Entry[], query: string, active: number, onpick: (i: number) => void, onclear: () => void }} */
  let { results, query, active = $bindable(0), onpick, onclear } = $props();
  let list = $state(/** @type {HTMLElement | null} */ (null));
  $effect(() => {
    list?.querySelector(`#sr-${active}`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="sr" role="status">{results.length ? `${results.length} found` : `No settings match ${query.trim()}`}</div>
{#if results.length}
  <div class="sresults" id="settings-results" role="listbox" aria-label="Settings found" bind:this={list}>
    {#each results as r, i (r.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events (the field's arrows and Return) -->
      <div class="sresult" class:on={i === active} id="sr-{i}" role="option" tabindex="-1" aria-selected={i === active}
        onpointermove={() => (active = i)} onclick={() => onpick(i)}>
        <span class="n">{#each marks(r.label, query) as m}{#if m.hit}<mark>{m.s}</mark>{:else}{m.s}{/if}{/each}{#if r.group}<small>{#each marks(r.group, query) as m}{#if m.hit}<mark>{m.s}</mark>{:else}{m.s}{/if}{/each}</small>{/if}</span>
        {#if r.key}<Keys label={r.key} />{/if}
        <span class="p">{r.page}</span>
      </div>
    {/each}
  </div>
{:else}
  <div class="snone" id="settings-results"><p>No settings match “{query.trim()}”</p><button class="btn sm" onclick={onclear}>Clear search</button></div>
{/if}
