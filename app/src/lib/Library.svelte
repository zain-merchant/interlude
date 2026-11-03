<script>
  import { onMount, tick } from 'svelte';
  import { backend } from './backend.js';
  import { engine, tracks } from './engine.svelte.js';
  import { startDrag, endDrag } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel, MOD } from './commands.js';
  import { pushEdit } from './undo.svelte.js';
  import { keyName, keyLongName, camelot } from './key.js';

  /** @type {{ onload: (deck: number, track: import('./backend.js').LibraryTrack) => void, onsettings?: () => void }} */
  let { onload, onsettings } = $props();

  const ROW = 30;

  let folders = $state([]);
  let folder = $state(null); // null = all
  let all = $state([]);
  let total = $state(null); // track count across every folder
  let query = $state('');
  /** The selected track, by path, so it stays selected when rows reorder. */
  let selPath = $state(null);
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

  // Sorting: by a column, either way. Null keeps the scan's artist, title
  // order. Tracks still being analyzed sort after the rest, whichever way.
  /** @type {{ by: 'title' | 'artist' | 'bpm' | 'key' | 'time' | 'folder' | null, dir: 1 | -1 }} */
  let sort = $state({ by: null, dir: 1 });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  // Camelot order puts harmonically close keys next to each other.
  const keyRank = (k) => {
    if (!k) return null;
    const c = camelot(k);
    return parseInt(c) * 2 + (c.endsWith('B') ? 1 : 0);
  };
  const SORT_VALUE = {
    title: (t) => t.title,
    artist: (t) => t.artist || null,
    folder: (t) => t.folder,
    bpm: (t) => t.analysis?.bpm ?? null,
    key: (t) => keyRank(t.analysis?.key),
    time: (t) => t.analysis?.duration ?? null,
  };
  const sorted = $derived.by(() => {
    if (!sort.by) return results;
    const value = SORT_VALUE[sort.by];
    const dir = sort.dir;
    return results
      .map((t) => ({ t, v: value(t) }))
      .sort((a, b) => {
        if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? 0 : 1) : -1;
        return (typeof a.v === 'string' ? collator.compare(a.v, b.v) : a.v - b.v) * dir;
      })
      .map((x) => x.t);
  });
  /** @param {typeof sort.by} by */
  function sortBy(by) {
    sort = { by, dir: sort.by === by && sort.dir > 0 ? -1 : 1 };
  }
  /** @type {{ by: typeof sort.by, label: string, num?: boolean }[]} */
  const COLUMNS = [
    { by: 'title', label: 'Title' },
    { by: 'artist', label: 'Artist' },
    { by: 'bpm', label: 'BPM', num: true },
    { by: 'key', label: 'Key' },
    { by: 'time', label: 'Time', num: true },
    { by: 'folder', label: 'Folder' },
  ];

  const selected = $derived.by(() => {
    const i = sorted.findIndex((t) => t.path === selPath);
    return i < 0 ? 0 : i;
  });
  const selectIndex = (i) => (selPath = sorted[i]?.path ?? null);

  /** Tracks still waiting for their length, BPM and key. */
  const pending = $derived(all.reduce((n, t) => n + (t.analysis ? 0 : 1), 0));
  const bpmText = (a) => {
    if (!a?.bpm) return '';
    const r = Math.round(a.bpm);
    return Math.abs(a.bpm - r) < 0.05 ? String(r) : a.bpm.toFixed(1);
  };
  const timeText = (a) => {
    if (a?.duration == null) return '';
    const s = Math.round(a.duration);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  /** Shown when analysis found nothing (or the file wouldn't decode). */
  const NONE = '–';

  // Analysis results stream in from the background analyzer.
  let byPath = new Map();
  $effect(() => {
    let off = null;
    let gone = false;
    backend.onLibraryAnalysis?.((e) => {
      const t = byPath.get(e.path);
      if (t) t.analysis = { duration: e.duration, bpm: e.bpm, key: e.key, failed: e.failed };
    }).then((fn) => (gone ? fn() : (off = fn)));
    return () => {
      gone = true;
      off?.();
    };
  });

  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 5));
  const visible = $derived(sorted.slice(first, first + Math.ceil(viewHeight / ROW) + 10));
  const onDeck = (t) => [0, 1].filter((d) => tracks[d]?.path === t.path);

  async function refresh() {
    loading = true;
    error = '';
    try {
      folders = await backend.libraryFolders();
      all = await backend.libraryTracks(folder);
      byPath = new Map(all.map((t) => [t.path, t]));
      if (folder === null) total = all.length;
      selectIndex(0);
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
    if (!sorted.length) return;
    const index = Math.max(0, Math.min(sorted.length - 1, i));
    selectIndex(index);
    const y = index * ROW;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW - scroller.clientHeight;
  }

  /** Moves the selection by `delta` rows, scrolling it into view. */
  export function browse(delta) {
    select(selected + delta);
  }

  /** Loads the selected track into `deck`, then moves to the next row, ready for the next pick. */
  export function loadSelected(deck) {
    const t = sorted[selected];
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
    const i = sorted.findIndex((t) => t.path === path);
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
    if (!sorted.length || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown': browse(1); break;
      case 'ArrowUp': browse(-1); break;
      case 'PageDown': browse(page()); break;
      case 'PageUp': browse(-page()); break;
      case 'Home': select(0); break;
      case 'End': select(sorted.length - 1); break;
      case 'Enter': autoLoad(sorted[selected]); browse(1); break;
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
      if (sorted[selected]) autoLoad(sorted[selected]);
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
    selectIndex(index);
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
          aria-label="Search the library" oninput={() => { selectIndex(0); scroller.scrollTop = 0; }} onkeydown={searchKey} />
        {#if !query}<kbd>{MOD}F</kbd>{/if}
      </label>
      <span class="count num">{loading ? 'Scanning…' : `${results.length.toLocaleString()} tracks`}{#if !loading && pending}<span
          class="pending" use:tip={() => 'Finding each track’s length, BPM and key in the background'}> · analyzing, {pending.toLocaleString()} to go</span>{/if}</span>
    </div>

    <div class="row head" role="group" aria-label="Sort tracks">
      <span></span>
      {#each COLUMNS as c}
        {@const on = sort.by === c.by}
        <button class="sort" class:on class:num={c.num} aria-pressed={on}
          aria-label="Sort by {c.label.toLowerCase()}{on ? (sort.dir > 0 ? ', ascending' : ', descending') : ''}"
          onclick={() => sortBy(c.by)}>{c.label}{#if on}<svg viewBox="0 0 10 10" aria-hidden="true" class:down={sort.dir < 0}><path d="M2.5 6.5 5 4l2.5 2.5" /></svg>{/if}</button>
      {/each}
    </div>

    <div class="scroll" bind:this={scroller} bind:clientHeight={viewHeight} onscroll={() => (scrollTop = scroller.scrollTop)}
      tabindex="0" onkeydown={listKey} role="listbox" aria-label="Tracks" data-region="tracks"
      aria-activedescendant={sorted[selected] ? `track-${selected}` : undefined}>
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
      <div style:height="{sorted.length * ROW}px" style:position="relative">
        {#each visible as t, i (t.path)}
          {@const index = first + i}
          {@const decks = onDeck(t)}
          {@const a = t.analysis}
          <!-- svelte-ignore a11y_interactive_supports_focus (the listbox holds focus; rows are its options) -->
          <div class="row" class:sel={index === selected} style:top="{index * ROW}px" role="option" id="track-{index}"
            aria-selected={index === selected}
            draggable="true" ondragstart={(e) => { selectIndex(index); startDrag(e, t); }} ondragend={endDrag}
            onclick={() => { selectIndex(index); scroller.focus({ preventScroll: true }); }} ondblclick={() => autoLoad(t)} onkeydown={() => {}}
            oncontextmenu={(e) => rowMenu(e, t, index)}>
            <span class="ld">{#each decks as d}<b class:b={d === 1} aria-hidden="true">{'AB'[d]}</b>{/each}</span>
            <span class="t">{t.title}</span>
            <span>{t.artist}</span>
            <span class="n num" class:none={a && !a.bpm}>{a ? bpmText(a) || NONE : ''}</span>
            <span class:none={a && !a.key}>{#if a?.key}<span class="k" use:tip={() => `${keyLongName(a.key)} (${camelot(a.key)})`}>{keyName(a.key)}</span>{:else if a}{NONE}{/if}</span>
            <span class="n num" class:none={a?.failed}>{a ? timeText(a) || NONE : ''}</span>
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
    grid-template-columns: 34px minmax(0, 2.4fr) minmax(0, 1.6fr) 64px 56px 64px minmax(0, 1.2fr);
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
  .row .n {
    text-align: right;
  }
  .row .none {
    color: var(--fg-4);
  }
  .row .k {
    padding: 0;
  }
  .pending {
    color: var(--fg-4);
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    height: 100%;
    padding: 0 10px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    transition: color 0.12s;
  }
  .sort.num {
    justify-content: flex-end;
  }
  .sort:hover,
  .sort.on {
    color: var(--fg-2);
  }
  .sort svg {
    flex: none;
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
  .sort svg.down {
    transform: rotate(180deg);
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
