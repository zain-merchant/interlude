<script>
  import { flag, setting } from '../flags/registry.svelte.js';
  import { onMount, tick } from 'svelte';
  import { backend } from './backend.js';
  import { engine, tracks } from './engine.svelte.js';
  import { startDrag, endDrag, drag, dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel, MOD } from './commands.js';
  import { sampler, setSamplerOpen } from './sampler.svelte.js';
  import { pushEdit, showToast } from './undo.svelte.js';
  import { keyName, keyLongName, camelot } from './key.js';
  import { hms } from '../flags/08-stress-hours/time.js';

  /** @type {{ onload: (deck: number, track: import('./backend.js').LibraryTrack, opts?: { force?: boolean }) => void, onsettings?: () => void }} */
  let { onload, onsettings } = $props();

  const ROW = 28;

  let folders = $state([]);
  /**
   * What the track list shows: every track, a folder, a playlist or a History session.
   * @typedef {{ kind: 'all' | 'folder' | 'playlist' | 'session', path?: string, id?: number, start?: number }} View
   */
  let view = $state(/** @type {View} */ ({ kind: 'all' }));
  const folder = $derived(view.kind === 'folder' ? view.path : null);
  /** Playlists and History keep their own order; the scan is sorted by artist. */
  const ordered = $derived(view.kind === 'playlist' || view.kind === 'session');
  /** @type {import('./backend.js').Playlist[]} */
  let playlists = $state([]);
  /** @type {import('./backend.js').HistorySession[]} */
  let sessions = $state([]);
  /** The playlist whose name is being typed. */
  let renaming = $state(null);
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

  /** Every word must appear in the artist, title, album, genre or folder. */
  const results = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((t) => {
      const hay = `${t.artist} ${t.title} ${t.album ?? ''} ${t.genre ?? ''} ${t.folder}`.toLowerCase();
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

  // #7 (UI audit flag): edge-empty-views: an empty playlist or folder says so, not "No tracks yet. Add a music folder".
  const emptyView = $derived(
    !flag('edge-empty-views') ? null
    : view.kind === 'playlist' ? 'This playlist is empty. Drag tracks onto its name to add them.'
    : view.kind === 'folder' ? `No music files found in ${(view.path ?? '').split(/[\\/]/).filter(Boolean).pop()}.`
    : null,
  );

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
    // #8 (UI audit flag): stress-hours shows h:mm:ss past an hour.
    if (flag('stress-hours') && s >= 3600) return hms(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  /** Shown when analysis found nothing (or the file wouldn't decode). */
  const NONE = '–';

  // Analysis results stream in from the background analyzer. A History
  // session can list a track twice, so each path maps to every row of it.
  let byPath = new Map();
  $effect(() => {
    let off = null;
    let gone = false;
    backend.onLibraryAnalysis?.((e) => {
      for (const t of byPath.get(e.path) ?? []) t.analysis = { duration: e.duration, bpm: e.bpm, key: e.key, failed: e.failed };
    }).then((fn) => (gone ? fn() : (off = fn)));
    return () => {
      gone = true;
      off?.();
    };
  });
  // A track just went into History.
  $effect(() => {
    let off = null;
    let gone = false;
    backend.onLibraryPlayed?.(async () => {
      sessions = await backend.historySessions();
      if (view.kind === 'session' && view.start === sessions[0]?.start) refresh({ keep: true });
      else if (view.kind === 'session' && sessions.length && !sessions.some((x) => x.start === view.start)) refresh({ keep: true });
    }).then((fn) => (gone ? fn() : (off = fn)));
    return () => {
      gone = true;
      off?.();
    };
  });

  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 5));
  const visible = $derived(sorted.slice(first, first + Math.ceil(viewHeight / ROW) + 10));
  const onDeck = (t) => [0, 1].filter((d) => tracks[d]?.path === t.path);

  /** Loads the current view. `keep` holds on to the selection (after an edit). */
  async function refresh({ keep = false } = {}) {
    loading = !keep;
    error = '';
    try {
      [folders, playlists, sessions] = await Promise.all([backend.libraryFolders(), backend.playlists(), backend.historySessions()]);
      if (view.kind === 'playlist' && !playlists.some((p) => p.id === view.id)) view = { kind: 'all' };
      if (view.kind === 'session' && !sessions.some((x) => x.start === view.start)) view = { kind: 'all' };
      const list =
        view.kind === 'playlist' ? await backend.playlistTracks(view.id)
        : view.kind === 'session' ? await backend.sessionTracks(view.start)
        : await backend.libraryTracks(folder);
      // Rows need a unique key: History can list a track twice.
      const seen = new Map();
      for (const t of list) {
        const n = seen.get(t.path) ?? 0;
        seen.set(t.path, n + 1);
        t.key = n ? `${t.path}#${n}` : t.path;
      }
      all = list;
      byPath = new Map();
      for (const t of all) byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
      if (view.kind === 'all') total = all.length;
      if (!keep) selectIndex(0);
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
      view = { kind: 'all' };
      await refresh();
    } catch (e) {
      error = String(e);
    }
  }

  /** Removes a music folder from the library (never from disk), with Undo. */
  async function removeFolder(f, { undoable = true } = {}) {
    folders = await backend.removeFolder(f);
    if (folder === f) view = { kind: 'all' };
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

  /** Reloads everything, keeping the selection (after an import). */
  export function reload() {
    return refresh({ keep: true });
  }

  /** Shows a folder, or every track when `f` is null. */
  function pick(f) {
    show(f === null ? { kind: 'all' } : { kind: 'folder', path: f });
  }

  /** @param {View} v */
  function show(v) {
    view = v;
    sort = { by: null, dir: 1 };
    refresh();
  }

  // Playlists. Every change can be undone, and none touches the files.
  const playlistName = (id) => playlists.find((p) => p.id === id)?.name ?? 'playlist';

  /** Makes a playlist (holding `paths`) and starts naming it. */
  async function newPlaylist(paths = []) {
    let name = 'New playlist';
    for (let n = 2; playlists.some((p) => p.name === name); n++) name = `New playlist ${n}`;
    const id = await backend.createPlaylist(name, paths);
    playlists = await backend.playlists();
    renaming = id;
    pushEdit({
      label: `Made ${name}`,
      undo: async () => { await backend.deletePlaylist(id); await refresh({ keep: true }); },
      redo: async () => { await backend.createPlaylist(name, paths); await refresh({ keep: true }); },
    });
  }

  async function finishRename(id, value) {
    renaming = null;
    const name = value.trim();
    const old = playlistName(id);
    if (!name || name === old) return;
    await backend.renamePlaylist(id, name);
    playlists = await backend.playlists();
    pushEdit({
      label: `Renamed ${old} to ${name}`,
      undo: async () => { await backend.renamePlaylist(id, old); playlists = await backend.playlists(); },
      redo: async () => { await backend.renamePlaylist(id, name); playlists = await backend.playlists(); },
    });
  }

  async function deletePlaylist(id) {
    const name = playlistName(id);
    const paths = (await backend.playlistTracks(id)).map((t) => t.path);
    await backend.deletePlaylist(id);
    if (view.kind === 'playlist' && view.id === id) view = { kind: 'all' };
    await refresh({ keep: view.kind !== 'all' });
    let current = id;
    pushEdit({
      label: `Deleted ${name}`,
      undo: async () => { current = await backend.createPlaylist(name, paths); await refresh({ keep: true }); },
      redo: async () => { await backend.deletePlaylist(current); await refresh({ keep: true }); },
    });
  }

  /** Adds tracks to the end of a playlist (ones already there stay put). */
  async function addTo(id, paths) {
    const before = (await backend.playlistTracks(id)).map((t) => t.path);
    await backend.addToPlaylist(id, paths);
    const added = paths.filter((p) => !before.includes(p)).length;
    await refresh({ keep: true });
    const name = playlistName(id);
    pushEdit({
      label: added ? `Added ${added === 1 ? 'a track' : `${added} tracks`} to ${name}` : `Already in ${name}`,
      undo: async () => { await backend.setPlaylistTracks(id, before); await refresh({ keep: true }); },
      redo: async () => { await backend.addToPlaylist(id, paths); await refresh({ keep: true }); },
    });
  }

  /** Sets the open playlist's order (reorder or remove), with Undo. */
  async function reorder(paths, label) {
    if (view.kind !== 'playlist') return;
    const id = view.id;
    const before = all.map((t) => t.path);
    await backend.setPlaylistTracks(id, paths);
    await refresh({ keep: true });
    pushEdit({
      label,
      undo: async () => { await backend.setPlaylistTracks(id, before); await refresh({ keep: true }); },
      redo: async () => { await backend.setPlaylistTracks(id, paths); await refresh({ keep: true }); },
    });
  }

  function removeFromPlaylist(t) {
    reorder(all.filter((x) => x.path !== t.path).map((x) => x.path), `Removed ${t.title} from ${playlistName(view.id)}`);
  }

  // Drag to reorder: only in a playlist shown in its own order, unfiltered.
  const canReorder = $derived(view.kind === 'playlist' && !sort.by && !query);
  /** Where a dragged row would land: before row `index`. */
  let dropAt = $state(null);
  function rowDragOver(e, index) {
    if (!canReorder || !drag.track || !all.some((t) => t.path === drag.track.path)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    dropAt = e.clientY > r.top + r.height / 2 ? index + 1 : index;
  }
  function rowDrop(e) {
    if (dropAt === null || !drag.track) return;
    e.preventDefault();
    const moving = drag.track.path;
    const paths = all.map((t) => t.path);
    const from = paths.indexOf(moving);
    let to = dropAt;
    dropAt = null;
    if (from < 0 || to === from || to === from + 1) return;
    paths.splice(from, 1);
    if (to > from) to--;
    paths.splice(to, 0, moving);
    reorder(paths, `Moved ${drag.track.title}`);
  }

  /** History session label: "Fri 31 Oct", with the time if a day has two. */
  function sessionLabel(x) {
    const d = new Date(x.start);
    const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const twice = sessions.some((o) => o !== x && new Date(o.start).toDateString() === d.toDateString());
    return twice ? `${day}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : day;
  }
  const HISTORY_SHOWN = 10;

  function select(i) {
    if (!sorted.length) return;
    const index = Math.max(0, Math.min(sorted.length - 1, i));
    selectIndex(index);
    const y = index * ROW;
    // #16 (UI audit flag): scroll the row clear of the list's foot by the gap under the last row.
    const pad = flag('library-end') ? parseFloat(setting('library-end', 'gap')) || 0 : 0;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + ROW + pad > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW + pad - scroller.clientHeight;
  }

  /** Moves the selection by `delta` rows, scrolling it into view. */
  export function browse(delta) {
    select(selected + delta);
  }

  /** Loads the selected track into `deck`, then moves to the next row, ready for the next pick. */
  export function loadSelected(deck) {
    const t = sorted[selected];
    if (!t || t.missing) return;
    onload(deck, t);
    if (!engine.decks[deck].playing) browse(1);
  }

  /** The selected track, or null. */
  export function selectedTrack() {
    const t = sorted[selected];
    return t && !t.missing ? t : null;
  }

  /** Selects a track in the library, clearing the search and folder if they hide it. */
  export async function reveal(path) {
    query = '';
    if (!all.some((t) => t.path === path) && view.kind !== 'all') {
      view = { kind: 'all' };
      await refresh();
    }
    await tick();
    const i = sorted.findIndex((t) => t.path === path);
    if (i >= 0) select(i);
    scroller.focus();
  }

  /** Loads into the first deck that isn't playing, preferring A. With both
   *  playing it says how to pick one, rather than guess which to stop. */
  function autoLoad(t) {
    if (!t || t.missing) return;
    const deck = !engine.decks[0].playing ? 0 : !engine.decks[1].playing ? 1 : null;
    if (deck !== null) onload(deck, t);
    else showToast(`Both decks are playing. Press ${keyLabel('deck.0.load')} or ${keyLabel('deck.1.load')} twice to replace one.`);
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
      case 'Backspace':
      case 'Delete':
        if (view.kind !== 'playlist') return;
        removeFromPlaylist(sorted[selected]);
        break;
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

  function clearSearch() {
    query = '';
    selectIndex(0);
    if (scroller) scroller.scrollTop = 0;
    search?.focus();
  }

  export function focusSearch() {
    search?.focus();
    search?.select();
  }

  const short = (p) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

  const rowMenu = (e, t, index) => {
    selectIndex(index);
    // Choosing "Replace" in the menu is the confirmation, so it loads at once.
    const playing = (d) => engine.decks[d].playing;
    const load = [0, 1].map((d) => ({
      label: t.missing ? 'File not found' : playing(d) ? `Replace the playing track on deck ${'AB'[d]}` : `Load to deck ${'AB'[d]}`,
      key: playing(d) ? undefined : keyLabel(`deck.${d}.load`),
      enabled: !t.missing,
      action: () => onload(d, t, { force: true }),
    }));
    const add = playlists
      .filter((p) => !(view.kind === 'playlist' && view.id === p.id))
      .map((p) => ({ label: `Add to ${p.name}`, action: () => addTo(p.id, [t.path]) }));
    const remove = view.kind === 'playlist' ? [{ label: 'Remove from playlist', key: '⌫', action: () => removeFromPlaylist(t) }] : [];
    /** @type {import('./menu.svelte.js').MenuEntry[]} */
    const items = [...load, '-', ...add, { label: 'Add to new playlist', action: () => newPlaylist([t.path]) }];
    if (remove.length) items.push('-', ...remove);
    openMenu(e, items);
  };
  const playlistMenu = (e, p) =>
    openMenu(e, [
      { label: 'Rename', action: () => (renaming = p.id) },
      '-',
      { label: 'Delete playlist', action: () => deletePlaylist(p.id) },
    ]);
  /** Focuses and selects the name field when renaming starts. */
  const focusName = (node) => {
    node.focus();
    node.select();
  };
  function nameKey(e, id) {
    e.stopPropagation();
    if (e.key === 'Enter') finishRename(id, e.currentTarget.value);
    else if (e.key === 'Escape') renaming = null;
  }
  const folderMenu = (e, f) =>
    openMenu(e, [
      { label: 'Rescan', action: () => (folder === f ? refresh() : pick(f)) },
      '-',
      { label: 'Remove folder from library', action: () => removeFolder(f) },
    ]);

  onMount(refresh);
</script>

<section class="library" aria-label="Library">
  <nav data-region="sidebar" aria-label="Library, playlists and history">
    <div class="h">Library</div>
    <button class="item" class:on={view.kind === 'all'} aria-current={view.kind === 'all'} onclick={() => pick(null)}>
      <span>All tracks</span>{#if total !== null}<small class="num">{total.toLocaleString()}</small>{/if}
    </button>
    {#each folders as f}
      <button class="item" class:on={folder === f} aria-current={folder === f} onclick={() => pick(f)}
        oncontextmenu={(e) => folderMenu(e, f)} use:tip={() => f}>
        <span>{short(f)}</span>{#if folder === f && !loading}<small class="num">{all.length.toLocaleString()}</small>{/if}
      </button>
    {/each}
    <button class="add" onclick={addFolder}>+ Add music folder</button>

    <div class="h sec">Playlists</div>
    {#each playlists as p (p.id)}
      {#if renaming === p.id}
        <input class="item name" value={p.name} aria-label="Playlist name" spellcheck="false" use:focusName
          onkeydown={(e) => nameKey(e, p.id)} onblur={(e) => finishRename(p.id, e.currentTarget.value)} />
      {:else}
        {@const on = view.kind === 'playlist' && view.id === p.id}
        <button class="item" class:on aria-current={on} onclick={() => show({ kind: 'playlist', id: p.id })}
          ondblclick={() => (renaming = p.id)} oncontextmenu={(e) => playlistMenu(e, p)}
          use:dropTarget={{ ondrop: (t) => addTo(p.id, [t.path]) }}>
          <span>{p.name}</span><small class="num">{p.count.toLocaleString()}</small>
        </button>
      {/if}
    {/each}
    <button class="add" onclick={() => newPlaylist()}>+ New playlist</button>

    {#if sessions.length}
      <div class="h sec">History</div>
      {#each sessions.slice(0, HISTORY_SHOWN) as x (x.start)}
        {@const on = view.kind === 'session' && view.start === x.start}
        <button class="item" class:on aria-current={on} onclick={() => show({ kind: 'session', start: x.start })}
          use:tip={() => `Played ${new Date(x.start).toLocaleString()}`}>
          <span>{sessionLabel(x)}</span><small class="num">{x.count.toLocaleString()}</small>
        </button>
      {/each}
    {/if}
  </nav>

  <div class="main">
    <div class="bar">
      <label class="search">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
        <input bind:this={search} type="search" placeholder="Search artist, title, folder…" bind:value={query} spellcheck="false"
          aria-label="Search the library" oninput={() => { selectIndex(0); scroller.scrollTop = 0; }} onkeydown={searchKey} />
        {#if query}
          <button class="clear" aria-label="Clear search" onclick={clearSearch} use:tip={() => tipText('Clear search', 'Esc')}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" /></svg>
          </button>
        {:else}<kbd>{MOD}F</kbd>{/if}
      </label>
      <span class="count num">{loading ? 'Scanning…' : `${results.length.toLocaleString()} tracks`}{#if !loading && pending}<span
          class="pending" use:tip={() => 'Finding each track’s length, BPM and key in the background'}> · analyzing, {pending.toLocaleString()} to go</span>{/if}</span>
      <button class="btn sm samp" class:on={sampler.open} aria-pressed={sampler.open}
        onclick={() => setSamplerOpen(!sampler.open)}
        use:tip={() => tipText(sampler.open ? 'Hide sampler' : 'Show sampler', keyLabel('view.sampler'), 'eight one-shot slots; drag tracks onto them')}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="3.5" height="3.5" rx="1" /><rect x="7" y="1.5" width="3.5" height="3.5" rx="1" /><rect x="1.5" y="7" width="3.5" height="3.5" rx="1" /><rect x="7" y="7" width="3.5" height="3.5" rx="1" /></svg>Sampler
      </button>
      {#if onsettings}
        <!-- Always here, however long the sidebar gets. -->
        <button class="btn sm gear" onclick={onsettings} aria-label="Settings"
          use:tip={() => tipText('Settings', keyLabel('app.settings'))}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></svg>
        </button>
      {/if}
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
      {:else if !loading && !all.length && emptyView}
        <div class="empty"><p>{emptyView}</p></div>
      {:else if !loading && !all.length}
        <div class="empty">
          <p>No tracks yet.</p>
          <button class="btn sm" onclick={addFolder}>Add a music folder</button>
        </div>
      {:else if !loading && !results.length}
        <div class="empty">Nothing matches “{query}”.</div>
      {/if}
      <div style:height="{sorted.length * ROW}px" style:position="relative">
        {#each visible as t, i (t.key ?? t.path)}
          {@const index = first + i}
          {@const decks = onDeck(t)}
          {@const a = t.analysis}
          <!-- svelte-ignore a11y_interactive_supports_focus (the listbox holds focus; rows are its options) -->
          <div class="row" class:sel={index === selected} class:missing={t.missing}
            class:drop-before={dropAt === index} class:drop-after={dropAt === index + 1 && index === sorted.length - 1} style:top="{index * ROW}px" role="option" id="track-{index}"
            aria-selected={index === selected}
            draggable={!t.missing || canReorder} ondragstart={(e) => { selectIndex(index); startDrag(e, t); if (canReorder) e.dataTransfer.effectAllowed = 'copyMove'; }}
            ondragend={() => { dropAt = null; endDrag(); }} ondragover={(e) => rowDragOver(e, index)} ondrop={rowDrop}
            ondragleave={(e) => { if (!e.currentTarget.contains(/** @type {Node} */ (e.relatedTarget))) dropAt = null; }}
            onclick={() => { selectIndex(index); scroller.focus({ preventScroll: true }); }} ondblclick={() => autoLoad(t)} onkeydown={() => {}}
            oncontextmenu={(e) => rowMenu(e, t, index)}>
            <span class="ld">{#each decks as d}<b class:b={d === 1} aria-hidden="true"></b>{/each}</span>
            <span class="t">{#if t.missing}<span class="k" use:tip={() => `File not found: ${t.path}`}>{t.title}</span><span class="sr">, file not found</span>{:else}{t.title}{/if}</span>
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
  /* One glass panel: the sidebar and the track list, with a line between.
     Box edges line up with box edges (search, selected row), and text with
     text: the search text starts where the titles do. */
  .library {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    min-height: 0;
    border-radius: var(--r-panel);
    background: var(--glass-fill);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-edge);
  }
  nav {
    display: flex;
    flex-direction: column;
    padding: 8px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .h {
    padding: 0 8px 4px;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .item,
  .add {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
    font: inherit;
    text-align: left;
    transition: background-color 140ms ease, color 140ms ease;
  }
  .item span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item:hover,
  .add:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .item.on {
    background: var(--sel);
    color: var(--fg);
  }
  .item small {
    color: var(--fg-3);
    font-size: var(--t-xs);
  }
  .h.sec {
    margin-top: 16px;
  }
  .item.name {
    border: 0;
    font: inherit;
    color: var(--fg);
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--fg-3);
  }
  /* Where a dragged row will land in a playlist. */
  .row.drop-before {
    box-shadow: inset 0 2px 0 var(--fg-2);
  }
  .row.drop-after {
    box-shadow: inset 0 -2px 0 var(--fg-2);
  }
  .add {
    color: var(--fg-3);
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 8px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
  }
  /* A recessed well, like the waveforms. */
  .search {
    width: 360px;
    max-width: 60%;
    height: var(--h-md);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: var(--r);
    background: var(--well);
    box-shadow: var(--well-shadow);
    color: var(--fg-3);
    transition: box-shadow 140ms ease;
  }
  .search:focus-within {
    box-shadow: var(--well-shadow), inset 0 0 0 1px var(--fg-3);
  }
  .search svg {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
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
    font: 400 var(--t-xs) var(--font);
    color: var(--fg-3);
  }
  .clear {
    flex: none;
    width: 20px;
    height: 20px;
    margin-right: -4px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--fg-3);
    transition: background-color 140ms ease, color 140ms ease;
  }
  .clear:hover,
  .clear:focus-visible {
    background: var(--hover);
    color: var(--fg);
  }
  .clear:focus-visible {
    outline: 1px solid var(--fg-3);
  }
  .clear svg {
    width: 12px;
    height: 12px;
    stroke-linecap: round;
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
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .samp {
    margin-left: auto;
    display: inline-flex;
    gap: 8px;
    padding: 0 12px;
  }
  .gear {
    aspect-ratio: 1;
    padding: 0;
    display: inline-grid;
    place-items: center;
  }
  .gear svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
  }
  .samp.on {
    color: var(--fg);
    background: var(--sel);
  }
  .samp svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
  }
  .row {
    display: grid;
    grid-template-columns: 26px minmax(0, 2.4fr) minmax(0, 1.6fr) 64px 56px 64px minmax(0, 1.2fr);
    align-items: center;
    height: 28px;
    color: var(--fg-2);
  }
  .row span {
    padding: 0 6px;
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
  /* A file that's gone from disk: listed, with its cues kept, but can't load. */
  .row.missing,
  .row.missing .t {
    color: var(--fg-3);
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
    padding: 0 6px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    transition: color 140ms ease;
  }
  .sort.num {
    justify-content: flex-end;
  }
  .sort:hover,
  .sort.on {
    color: var(--fg);
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
    height: 28px;
    margin-bottom: 4px;
    font-size: var(--t-xs);
    color: var(--fg-3);
    border-bottom: 1px solid var(--line);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    position: relative;
    border-radius: var(--r);
  }
  .scroll:focus-visible {
    outline: 1px solid var(--fg-3);
    outline-offset: -1px;
  }
  .scroll .row {
    position: absolute;
    left: 0;
    right: 0;
    border-radius: var(--r);
    cursor: grab;
  }
  .scroll .row:active {
    cursor: grabbing;
  }
  .scroll .row:hover {
    background: var(--hover);
  }
  /* The browse cursor has to read at a glance from the decks: a lighter
     fill, a hairline, full-strength text. */
  .scroll .row.sel {
    background: var(--sel);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
  }
  /* Which deck a track is on: a bar in the deck's colour. */
  .ld {
    display: flex;
    gap: 3px;
    justify-content: center;
    padding: 0 !important;
  }
  .ld b {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: var(--deck-a);
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
    gap: 8px;
    color: var(--fg-3);
  }
  .empty p {
    margin: 0;
  }
</style>
