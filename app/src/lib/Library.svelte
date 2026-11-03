<script>
  import { onMount, tick } from 'svelte';
  import { backend } from './backend.js';
  import { engine, tracks } from './engine.svelte.js';
  import { startDrag, endDrag } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel, MOD } from './commands.js';
  import { pushEdit } from './undo.svelte.js';

  /** @type {{ onload: (deck: number, track: import('./backend.js').LibraryTrack) => void, onsettings?: () => void }} */
  let { onload, onsettings } = $props();

  const ROW = 30;

  let folders = $state([]);
  let folder = $state(null); // null = all
  let all = $state([]);
  let total = $state(null); // track count across every folder
  let query = $state('');
  let selected = $state(0);
  let loading = $state(false);
  let error = $state('');
  let search = $state(null);
  let scroller;
  let scrollTop = $state(0);
  let viewHeight = $state(400);

  /** Every word must appear in the artist, title or folder. */
  const results = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((t) => {
      const hay = `${t.artist} ${t.title} ${t.folder}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  });

  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 5));
  const visible = $derived(results.slice(first, first + Math.ceil(viewHeight / ROW) + 10));
  const onDeck = (t) => [0, 1].filter((d) => tracks[d]?.path === t.path);

  async function refresh() {
    loading = true;
    error = '';
    try {
      folders = await backend.libraryFolders();
      all = await backend.libraryTracks(folder);
      if (folder === null) total = all.length;
      selected = 0;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  export async function addFolder() {
    const path = await backend.pickFolder();
    if (!path) return;
    try {
      folders = await backend.addFolder(path);
      folder = null;
      await refresh();
    } catch (e) {
      error = String(e);
    }
  }

  /** Removes a music folder from the library (never from disk), with Undo. */
  async function removeFolder(f, { undoable = true } = {}) {
    folders = await backend.removeFolder(f);
    if (folder === f) folder = null;
    total = null;
    await refresh();
    if (undoable)
      pushEdit({
        label: `Removed ${short(f)} from the library`,
        undo: () => restoreFolder(f),
        redo: () => removeFolder(f, { undoable: false }),
      });
  }

  async function restoreFolder(f) {
    folders = await backend.addFolder(f);
    total = null;
    await refresh();
  }

  function pick(f) {
    folder = f;
    refresh();
  }

  function select(i) {
    if (!results.length) return;
    selected = Math.max(0, Math.min(results.length - 1, i));
    const y = selected * ROW;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW - scroller.clientHeight;
  }

  /** Moves the selection by `delta` rows, scrolling it into view. */
  export function browse(delta) {
    select(selected + delta);
  }

  /** Loads the selected track into `deck`, then moves to the next row, ready for the next pick. */
  export function loadSelected(deck) {
    const t = results[selected];
    if (!t) return;
    onload(deck, t);
    if (!engine.decks[deck].playing) browse(1);
  }

  /** Selects a track in the library, clearing the search and folder if they hide it. */
  export async function reveal(path) {
    query = '';
    if (!all.some((t) => t.path === path) && folder !== null) {
      folder = null;
      await refresh();
    }
    await tick();
    const i = results.findIndex((t) => t.path === path);
    if (i >= 0) select(i);
    scroller.focus();
  }

  /** Loads into the first deck that isn't playing, preferring A. */
  function autoLoad(t) {
    const deck = !engine.decks[0].playing ? 0 : !engine.decks[1].playing ? 1 : null;
    if (deck !== null) onload(deck, t);
  }

  const page = () => Math.max(1, Math.floor(scroller.clientHeight / ROW) - 1);
  function listKey(e) {
    if (!results.length || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown': browse(1); break;
      case 'ArrowUp': browse(-1); break;
      case 'PageDown': browse(page()); break;
      case 'PageUp': browse(-page()); break;
      case 'Home': select(0); break;
      case 'End': select(results.length - 1); break;
      case 'Enter': autoLoad(results[selected]); browse(1); break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function searchKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      browse(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      if (results[selected]) autoLoad(results[selected]);
      search.blur();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (query) query = '';
      else search.blur();
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !query) {
      e.preventDefault();
      loadSelected(e.key === 'ArrowLeft' ? 0 : 1);
    }
  }

  export function focusSearch() {
    search?.focus();
    search?.select();
  }

  const short = (p) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

  const rowMenu = (e, t, index) => {
    selected = index;
    const blocked = (d) => engine.decks[d].playing;
    openMenu(e, [0, 1].map((d) => ({
      label: blocked(d) ? `Deck ${'AB'[d]} is playing` : `Load to deck ${'AB'[d]}`,
      key: keyLabel(`deck.${d}.load`),
      enabled: !blocked(d),
      action: () => onload(d, t),
    })));
  };
  const folderMenu = (e, f) =>
    openMenu(e, [
      { label: 'Rescan', action: () => (folder === f ? refresh() : pick(f)) },
      '-',
      { label: 'Remove folder from library', action: () => removeFolder(f) },
    ]);

  onMount(refresh);
</script>

<section class="library" aria-label="Library">
  <nav data-region="sidebar" aria-label="Music folders">
    <div class="h">Library</div>
    <button class="item" class:on={folder === null} aria-current={folder === null} onclick={() => pick(null)}>
      <span>All tracks</span>{#if total !== null}<small class="num">{total.toLocaleString()}</small>{/if}
    </button>
    {#each folders as f}
      <button class="item" class:on={folder === f} aria-current={folder === f} onclick={() => pick(f)}
        oncontextmenu={(e) => folderMenu(e, f)} use:tip={() => f}>
        <span>{short(f)}</span>{#if folder === f && !loading}<small class="num">{all.length.toLocaleString()}</small>{/if}
      </button>
    {/each}
    <button class="add" onclick={addFolder}>+ Add music folder</button>
    <span class="grow"></span>
    {#if onsettings}
      <button class="add" onclick={onsettings} use:tip={() => tipText('Settings', keyLabel('app.settings'))}>Settings</button>
    {/if}
  </nav>

  <div class="main">
    <div class="bar">
      <label class="search">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
        <input bind:this={search} type="search" placeholder="Search artist, title, folder" bind:value={query} spellcheck="false"
          aria-label="Search the library" oninput={() => { selected = 0; scroller.scrollTop = 0; }} onkeydown={searchKey} />
        {#if !query}<kbd>{MOD}F</kbd>{/if}
      </label>
      <span class="count num">{loading ? 'Scanning…' : `${results.length.toLocaleString()} tracks`}</span>
    </div>

    <div class="row head" aria-hidden="true">
      <span></span><span>Title</span><span>Artist</span><span>Folder</span>
    </div>

    <div class="scroll" bind:this={scroller} bind:clientHeight={viewHeight} onscroll={() => (scrollTop = scroller.scrollTop)}
      tabindex="0" onkeydown={listKey} role="listbox" aria-label="Tracks" data-region="tracks"
      aria-activedescendant={results[selected] ? `track-${selected}` : undefined}>
      {#if error}
        <div class="empty">{error}</div>
      {:else if !loading && !all.length}
        <div class="empty">
          <p>No tracks yet.</p>
          <button class="btn sm" onclick={addFolder}>Add a music folder</button>
        </div>
      {:else if !loading && !results.length}
        <div class="empty">Nothing matches “{query}”.</div>
      {/if}
      <div style:height="{results.length * ROW}px" style:position="relative">
        {#each visible as t, i (t.path)}
          {@const index = first + i}
          {@const decks = onDeck(t)}
          <div class="row" class:sel={index === selected} style:top="{index * ROW}px" role="option" id="track-{index}"
            aria-selected={index === selected}
            draggable="true" ondragstart={(e) => { selected = index; startDrag(e, t); }} ondragend={endDrag}
            onclick={() => { selected = index; scroller.focus({ preventScroll: true }); }} ondblclick={() => autoLoad(t)} onkeydown={() => {}}
            oncontextmenu={(e) => rowMenu(e, t, index)}>
            <span class="ld">{#each decks as d}<b class:b={d === 1} aria-hidden="true">{'AB'[d]}</b>{/each}</span>
            <span class="t">{t.title}</span>
            <span>{t.artist}</span>
            <span>{t.folder}</span>
            {#if decks.length}<span class="sr">, on deck {decks.map((d) => 'AB'[d]).join(' and ')}</span>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .library {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    min-height: 0;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .h {
    padding: 0 10px 8px;
    font-size: 11px;
    color: var(--fg-3);
  }
  .item,
  .add {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 7px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-2);
    font: inherit;
    text-align: left;
    transition: background-color 0.12s, color 0.12s;
  }
  .item span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item:hover {
    color: var(--fg);
  }
  .item.on {
    background: var(--raise);
    color: var(--fg);
  }
  .item small {
    color: var(--fg-3);
    font-size: 11px;
  }
  .add {
    margin-top: 8px;
    color: var(--fg-3);
  }
  .add:hover {
    color: var(--fg-2);
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 20px 10px;
  }
  .search {
    width: 380px;
    max-width: 60%;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg-3);
    transition: box-shadow 0.12s;
  }
  .search:focus-within {
    box-shadow: inset 0 0 0 1px var(--fg-3);
  }
  .search svg {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    user-select: text;
  }
  .search input::placeholder {
    color: var(--fg-3);
  }
  .search input::-webkit-search-cancel-button {
    display: none;
  }
  .search input:focus-visible {
    outline: none;
  }
  kbd {
    font: 400 11px var(--font);
    color: var(--fg-3);
  }
  .grow {
    flex: 1;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .count {
    font-size: 11px;
    color: var(--fg-3);
  }
  .row {
    display: grid;
    grid-template-columns: 34px minmax(0, 2.4fr) minmax(0, 1.6fr) minmax(0, 1.2fr);
    align-items: center;
    height: 30px;
    padding: 0 10px;
    color: var(--fg-2);
  }
  .row span {
    padding: 0 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row .t {
    color: var(--fg);
  }
  .head {
    margin: 0 10px;
    padding: 0;
    height: 28px;
    font-size: 11px;
    color: var(--fg-3);
    border-bottom: 1px solid var(--line);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    position: relative;
    padding: 4px 0;
  }
  .scroll:focus-visible {
    outline-offset: -2px;
  }
  .scroll .row {
    position: absolute;
    left: 10px;
    right: 10px;
    padding: 0;
    border-radius: 6px;
    cursor: grab;
  }
  .scroll .row:active {
    cursor: grabbing;
  }
  .scroll .row:hover {
    background: color-mix(in srgb, var(--raise) 60%, transparent);
  }
  .scroll .row.sel {
    background: var(--raise);
  }
  .ld {
    display: flex;
    gap: 2px;
    justify-content: center;
    padding: 0 !important;
  }
  .ld b {
    width: 16px;
    height: 16px;
    display: inline-grid;
    place-items: center;
    border-radius: 4px;
    background: var(--deck-a);
    color: var(--ink);
    font-size: 10px;
    font-weight: 600;
  }
  .ld b.b {
    background: var(--deck-b);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--fg-3);
  }
  .empty p {
    margin: 0;
  }
</style>
