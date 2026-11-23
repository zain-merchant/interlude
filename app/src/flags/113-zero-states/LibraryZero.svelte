<script>
  // The library's empty list, whatever made it so.
  import Zero from './Zero.svelte';
  import FilterPicture from './FilterPicture.svelte';
  import { draw } from './drawings.js';
  import { picture, said, head } from './tempos.js';
  import { FIT_TEMPO } from '../../lib/libraryfilter.js';
  import { camelot } from '../../lib/key.js';
  import { describe } from '../../lib/libraryfilter.js';

  /** @type {{ all: any[], error: string, query: string, fits: boolean, filtered: boolean, filter: any, air: any, airPath: string | null | undefined, view: any, retry: () => void, addFolder: () => void, onimport?: () => void, clearSearch: () => void, toggleFits: () => void, clearFilter: () => void }} */
  let { all, error, query, fits, filtered, filter, air, airPath, view, retry, addFolder, onimport, clearSearch, toggleFits, clearFilter } = $props();
  const q = $derived(query.trim());
  const side = $derived(air ? ['left', 'right'][air.deck] : '');
  const p = $derived(!error && all.length && !q && filtered ? picture(all, filter, fits ? air : null, fits ? airPath : null) : null);
  const also = $derived([fits && 'Fits on', filtered && describe(filter).replaceAll(' · ', ', ')].filter(Boolean).join(', '));
</script>

{#if error}
  <Zero title="Couldn’t open your library" help={error}><button class="btn sm" onclick={retry}>Try again</button></Zero>
{:else if !all.length && view.kind === 'playlist'}
  <Zero art={draw.playlist()} title="No tracks in this playlist" help="Drag tracks onto its name in the sidebar." />
{:else if !all.length && view.kind === 'folder'}
  <Zero art={draw.folder()} title="No music in this folder" help="Add music files to it in Finder." />
{:else if !all.length}
  <Zero art={draw.library()} title="No tracks yet" help={onimport ? 'Add a folder of music, or bring your cues, loops, beatgrids and playlists from Rekordbox or Serato.' : 'Add a folder of music.'}>
    <button class="btn sm zpri" onclick={addFolder}>Add music folder</button>
    {#if onimport}<button class="btn sm" onclick={onimport}>Import from Rekordbox or Serato…</button>{/if}
  </Zero>
{:else if q}
  <Zero art={draw.search()} title="No matches for “{q}”" help={also ? `With ${also}.` : ''}>
    <button class="btn sm" onclick={clearSearch}>Clear search<kbd>Esc</kbd></button>
    {#if fits}<button class="btn sm" onclick={toggleFits}>Turn off Fits</button>{/if}
    {#if filtered}<button class="btn sm" onclick={clearFilter}>Clear filter</button>{/if}
  </Zero>
{:else if p}
  <Zero title={head(filter)} help={said(p, filter)}>
    {#snippet picture()}<FilterPicture {p} tint={air?.deck === 1 ? 'var(--deck-b)' : 'var(--deck-a)'} />{/snippet}
    <button class="btn sm" onclick={clearFilter}>Clear filter</button>
    {#if fits}<button class="btn sm" onclick={toggleFits}>Turn off Fits</button>{/if}
  </Zero>
{:else if fits}
  <Zero art={draw.fits()} title={air ? `Nothing mixes with the ${side} deck` : 'Nothing to mix with'}
    help={air ? `Within ${Math.round(FIT_TEMPO * 100)}% of ${air.bpm.toFixed(1)} BPM${air.key ? `, in ${camelot(air.key)} or a key next to it` : ''}.` : 'Load a track first.'}>
    <button class="btn sm" onclick={toggleFits}>Turn off Fits</button>
  </Zero>
{/if}
