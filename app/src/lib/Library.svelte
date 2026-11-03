<script>
  import { onMount } from 'svelte';
  import { backend } from './backend.js';
  import { engine } from './engine.svelte.js';
  import { startDrag, endDrag } from './dnd.svelte.js';
  import { Button } from './components/ui/button/index.js';
  import { Input } from './components/ui/input/index.js';

  /** @type {{ onload: (deck: number, track: import('./backend.js').LibraryTrack) => void }} */
  let { onload } = $props();

  const ROW = 30;

  let folders = $state([]);
  let folder = $state(null); // null = all
  let all = $state([]);
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

  async function refresh() {
    loading = true;
    error = '';
    try {
      folders = await backend.libraryFolders();
      all = await backend.libraryTracks(folder);
      selected = 0;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function addFolder() {
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

  function pick(f) {
    folder = f;
    refresh();
  }

  /** Loads into the first deck that isn't playing, preferring A. */
  function autoLoad(t) {
    const deck = !engine.decks[0].playing ? 0 : !engine.decks[1].playing ? 1 : null;
    if (deck !== null) onload(deck, t);
  }

  /** Moves the selection by `delta` rows, scrolling it into view. */
  export function browse(delta) {
    if (!results.length) return;
    selected = Math.max(0, Math.min(results.length - 1, selected + delta));
    const y = selected * ROW;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW - scroller.clientHeight;
  }

  /** Loads the selected track into `deck`. */
  export function loadSelected(deck) {
    if (results[selected]) onload(deck, results[selected]);
  }

  function keydown(e) {
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      browse(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      autoLoad(results[selected]);
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      onload(e.key === 'ArrowLeft' ? 0 : 1, results[selected]);
    }
  }

  export function focusSearch() {
    search?.focus();
    search?.select();
  }

  const short = (p) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

  onMount(refresh);
</script>

<section class="library">
  <nav>
    <div class="nav-title">Library</div>
    <button class="item" class:active={folder === null} onclick={() => pick(null)}>All tracks</button>
    {#each folders as f}
      <div class="folder">
        <button class="item" class:active={folder === f} onclick={() => pick(f)} title={f}>{short(f)}</button>
        <button class="remove" title="Remove folder from library" aria-label="Remove {short(f)}"
          onclick={async () => { folders = await backend.removeFolder(f); if (folder === f) folder = null; refresh(); }}>×</button>
      </div>
    {/each}
    <Button variant="outline" size="sm" class="add" onclick={addFolder}>+ Add music folder</Button>
  </nav>

  <div class="tracks">
    <div class="bar">
      <Input bind:ref={search} type="search" placeholder="Search artist, title, folder" bind:value={query} class="h-8 max-w-md select-text"
        oninput={() => { selected = 0; scroller.scrollTop = 0; }} onkeydown={keydown} spellcheck="false" />
      <span class="count">{loading ? 'Scanning…' : `${results.length.toLocaleString()} tracks`}</span>
    </div>

    <div class="head row">
      <span>Title</span><span>Artist</span><span>Folder</span><span>Format</span>
    </div>

    <div class="scroll" bind:this={scroller} bind:clientHeight={viewHeight} onscroll={() => (scrollTop = scroller.scrollTop)}
      tabindex="-1" onkeydown={keydown} role="grid" aria-rowcount={results.length}>
      {#if error}
        <div class="empty">{error}</div>
      {:else if !loading && !all.length}
        <div class="empty">
          <p>No tracks yet.</p>
          <Button variant="secondary" size="sm" onclick={addFolder}>Add a music folder</Button>
        </div>
      {:else if !loading && !results.length}
        <div class="empty">Nothing matches “{query}”.</div>
      {/if}
      <div style:height="{results.length * ROW}px" style:position="relative">
        {#each visible as t, i (t.path)}
          {@const index = first + i}
          <div class="row" class:sel={index === selected} style:top="{index * ROW}px" role="row" tabindex="-1"
            draggable="true" ondragstart={(e) => { selected = index; startDrag(e, t); }} ondragend={endDrag}
            title="Drag onto a deck, or double-click to load"
            onclick={() => (selected = index)} ondblclick={() => autoLoad(t)} onkeydown={() => {}}>
            <span class="t">{t.title}</span>
            <span class="muted">{t.artist}</span>
            <span class="muted">{t.folder}</span>
            <span class="fmt">{t.format}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .library {
    display: grid;
    grid-template-columns: 200px 1fr;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 8px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .nav-title {
    padding: 0 8px 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .item {
    flex: none;
    text-align: left;
    border: 0;
    background: none;
    padding: 6px 8px;
    border-radius: var(--radius-md);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
  }
  .item:hover {
    background: color-mix(in oklch, var(--panel-2) 60%, transparent);
    color: var(--text);
  }
  .item.active {
    background: var(--panel-2);
    color: var(--text);
  }
  .folder {
    display: flex;
    align-items: center;
  }
  .folder .item {
    flex: 1;
    min-width: 0;
  }
  .remove {
    border: 0;
    background: none;
    color: var(--faint);
    padding: 2px 6px;
    cursor: pointer;
    visibility: hidden;
  }
  .remove:hover {
    color: var(--text);
  }
  .folder:hover .remove {
    visibility: visible;
  }
  nav :global(.add) {
    margin-top: 8px;
    border-style: dashed;
    color: var(--muted-foreground);
  }
  .tracks {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
  }
  .count {
    color: var(--muted-foreground);
    font-size: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 2fr 1.4fr 1fr 64px;
    gap: 12px;
    align-items: center;
    height: 30px;
    padding: 0 12px;
  }
  .row span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head {
    color: var(--faint);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--line);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    position: relative;
    outline: none;
  }
  .scroll .row {
    position: absolute;
    left: 0;
    right: 0;
    cursor: grab;
  }
  .scroll .row:active {
    cursor: grabbing;
  }
  .scroll .row:hover {
    background: color-mix(in oklch, var(--panel-2) 55%, transparent);
  }
  .scroll .row.sel {
    background: color-mix(in oklch, var(--ring) 14%, var(--panel));
  }
  .muted {
    color: var(--muted-foreground);
  }
  .fmt {
    color: var(--faint);
    font-size: 11px;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--muted-foreground);
  }
  .empty p {
    margin: 0;
  }
</style>
