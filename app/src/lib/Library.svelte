<script>
  import Status from '../flags/112-shell-status/Status.svelte'; // #112 (UI audit flag)
  import EmptyFilter from '../flags/113-empty-filter/EmptyFilter.svelte'; // #113 (UI audit flag)
  import { conn } from '../flags/112-shell-status/connections.svelte.js'; // #112 (UI audit flag)
  import Activity from '../flags/112-shell-status/Activity.svelte'; // #112 (UI audit flag)
  import { flag, setting } from '../flags/registry.svelte.js';
  import { onMount, tick, untrack } from 'svelte';
  import { backend } from './backend.js';
  import { engine, tracks } from './engine.svelte.js';
  import { startDrag, endDrag, drag, dropTarget } from './dnd.svelte.js';
  import { tip, tipText } from './tooltip.svelte.js';
  import { openMenu } from './menu.svelte.js';
  import { keyLabel, MOD } from './commands.js';
  import { sampler, setSamplerOpen } from './sampler.svelte.js';
  import Sampler from './Sampler.svelte';
  import { pushEdit, showToast } from './undo.svelte.js';
  import { keyName, keyLongName, camelot, keysMix, playingKey } from './key.js';
  import { hms } from '../flags/08-stress-hours/time.js';
  // #110 (UI audit flag): dir-room-tint: columns dragged to size and to order.
  import { colResize, resetWidths } from '../flags/110-dir-room-tint/columns.js';
  import { arrange, setOrder } from '../flags/110-dir-room-tint/column-order.svelte.js';
  import ColumnsMenu from '../flags/110-dir-room-tint/ColumnsMenu.svelte';
  import { onAir, passes, filtering, describe, FIT_TEMPO } from './libraryfilter.js';

  /** `onimport` opens the import window; `onempty` is called when the whole library loads with no tracks.
   * @type {{ onload: (deck: number, track: import('./backend.js').LibraryTrack, opts?: { force?: boolean }) => void, onsettings?: () => void, onmessage?: (text: string) => void, onimport?: () => void, onempty?: () => void }} */
  let { onload, onsettings, onmessage = showToast, onimport, onempty } = $props();

  // #91 (UI audit flag): library-roomy (against the doc) sets a taller row pitch.
  // #102 (UI audit flag): dir-crate makes the library the main place, with taller rows.
  const ROW = $derived(flag('dir-crate') ? 40 : flag('library-roomy') ? Number(setting('library-roomy', 'rows')) || 28 : 28);

  let folders = $state([]);
  /**
   * What the track list shows: every track, a folder or a playlist.
   * @typedef {{ kind: 'all' | 'folder' | 'playlist', path?: string, id?: number }} View
   */
  let view = $state(/** @type {View} */ ({ kind: 'all' }));
  const folder = $derived(view.kind === 'folder' ? view.path : null);
  /** Playlists keep their own order; the scan is sorted by artist. */
  const ordered = $derived(view.kind === 'playlist');
  /** @type {import('./backend.js').Playlist[]} */
  let playlists = $state([]);
  /** The playlist whose name is being typed. */
  let renaming = $state(null);
  let all = $state([]);
  let total = $state(null); // track count across every folder
  // #85 (UI audit flag): folder-counts: each music folder's track count, kept from the last All tracks (or that folder's) load.
  let folderCounts = $state(/** @type {Record<string, number>} */ ({}));
  let query = $state('');
  /** The selected track, by path, so it stays selected when rows reorder. */
  let selPath = $state(null);
  let loading = $state(false);
  let error = $state('');
  let search = $state(null);
  let scroller;
  let scrollTop = $state(0);
  let viewHeight = $state(400);

  // Filters: a BPM range and keys (from the Filter button), and Fits, which
  // keeps the tracks that mix with the deck on air.
  /** @type {import('./libraryfilter.js').Filter} */
  let filter = $state({ bpmMin: null, bpmMax: null, keys: [] });
  let fits = $state(false);
  let filterOpen = $state(false);
  const filtered = $derived(filtering(filter));
  /** The deck on air, as a string so the list only re-filters when its tempo or key really changes. */
  const airText = $derived.by(() => {
    const a = onAir(engine.decks, engine.mixer);
    return a ? JSON.stringify({ deck: a.deck, bpm: Math.round(a.bpm * 10) / 10, key: a.key && { tonic: a.key.tonic, minor: a.key.minor } }) : '';
  });
  // While the pitch fader moves, wait for it to settle before re-filtering, so
  // the list doesn't churn. A new deck on air (or none) shows at once.
  let airSettled = $state('');
  $effect(() => {
    const next = airText;
    const deckOf = (t) => (t ? JSON.parse(t).deck : null);
    if (deckOf(next) !== deckOf(untrack(() => airSettled))) {
      airSettled = next;
      return;
    }
    const id = setTimeout(() => (airSettled = next), 300);
    return () => clearTimeout(id);
  });
  const air = $derived(airSettled ? JSON.parse(airSettled) : null);
  const airPath = $derived(air ? tracks[air.deck]?.path : null);
  const airLabel = $derived(air ? `${'AB'[air.deck]} · ${air.key ? `${camelot(air.key)} ` : ''}${Math.round(air.bpm)}` : '');
  const fitsTip = () =>
    !air
      ? 'Fits: load a track to see what mixes with it'
      : `${fits ? 'Showing' : 'Show'} tracks that mix with deck ${'AB'[air.deck]}: within ${Math.round(FIT_TEMPO * 100)}% of ${air.bpm.toFixed(1)} BPM${air.key ? `, in ${camelot(air.key)} or a key next to it on the Camelot wheel` : ''}${fits ? '. Click to show everything' : ''}`;

  /** Every word must appear in the artist, title, album, genre or folder, and the track must pass the filters. */
  const results = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const fit = fits ? air : null;
    if (!words.length && !filtered && !fit) return all;
    return all.filter((t) => {
      if ((filtered || fit) && !passes(t, filter, fit)) return false;
      if (fit && t.path === airPath) return false;
      if (!words.length) return true;
      const hay = `${t.artist} ${t.title} ${t.album ?? ''} ${t.genre ?? ''} ${t.folder}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  });
  let emptyHeld = $state(false); // #113 (UI audit flag): its handles are being dragged
  function setFilter(f) {
    filter = f;
    selectIndex(0);
    if (scroller) scroller.scrollTop = 0;
  }
  const clearFilter = () => setFilter({ bpmMin: null, bpmMax: null, keys: [] });
  /** A typed BPM, or null when the box is empty or not a number. */
  const bpmInput = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const toggleKey = (c) =>
    setFilter({ ...filter, keys: filter.keys.includes(c) ? filter.keys.filter((k) => k !== c) : [...filter.keys, c] });
  /** The Camelot wheel as two rows: minor keys (A) over major (B). */
  const WHEEL = ['A', 'B'].map((l) => Array.from({ length: 12 }, (_, i) => `${i + 1}${l}`));
  function toggleFits() {
    fits = !fits;
    selectIndex(0);
    if (scroller) scroller.scrollTop = 0;
  }
  let filterBox = $state();
  /** Closes the filter panel on a click outside it or Escape. */
  $effect(() => {
    if (!filterOpen) return;
    const down = (e) => !filterBox?.contains(e.target) && (filterOpen = false);
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      filterOpen = false;
      filterBox?.querySelector('button')?.focus();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  });

  // Sorting: by a column, either way. Null keeps the scan's artist, title
  // order. Tracks still being analyzed sort after the rest, whichever way.
  /** @type {{ by: 'title' | 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'time' | 'folder' | null, dir: 1 | -1 }} */
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
    album: (t) => t.album || null,
    genre: (t) => t.genre || null,
    folder: (t) => t.folder,
    bpm: (t) => t.analysis?.bpm ?? null,
    key: (t) => keyRank(t.analysis?.key),
    time: (t) => t.analysis?.duration ?? null,
  };
  // #81 (UI audit flag): library-sort: with no column picked, the scan's lists sort by Artist (then Title), and say so.
  const sortOn = $derived(!sort.by && flag('library-sort') && !ordered ? { by: /** @type {typeof sort.by} */ ('artist'), dir: sort.dir } : sort);
  const sorted = $derived.by(() => {
    if (!sortOn.by) return results;
    const value = SORT_VALUE[sortOn.by];
    const dir = sortOn.dir;
    // #81 (UI audit flag): library-sort breaks ties on Artist by Title.
    const then = flag('library-sort') && sortOn.by === 'artist';
    return results
      .map((t) => ({ t, v: value(t) }))
      .sort((a, b) => {
        if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? 0 : 1) : -1;
        const c = (typeof a.v === 'string' ? collator.compare(a.v, b.v) : a.v - b.v) * dir;
        return c || !then ? c : collator.compare(a.t.title, b.t.title);
      })
      .map((x) => x.t);
  });
  /** @param {typeof sort.by} by */
  function sortBy(by) {
    sort = { by, dir: sortOn.by === by && sortOn.dir > 0 ? -1 : 1 };
  }
  /** Every column, in order. Title always shows; right-click the headings to pick the rest.
   * @type {{ by: typeof sort.by, label: string, num?: boolean, width: string }[]} */
  const COLUMNS = [
    { by: 'title', label: 'Title', width: 'minmax(0, 2.4fr)' },
    { by: 'artist', label: 'Artist', width: 'minmax(0, 1.6fr)' },
    { by: 'album', label: 'Album', width: 'minmax(0, 1.4fr)' },
    { by: 'genre', label: 'Genre', width: 'minmax(0, 1fr)' },
    { by: 'bpm', label: 'BPM', num: true, width: '64px' },
    { by: 'key', label: 'Key', width: '56px' },
    { by: 'time', label: 'Time', num: true, width: '64px' },
    { by: 'folder', label: 'Folder', width: 'minmax(0, 1.2fr)' },
  ];
  const HIDDEN_KEY = 'oss-dj.libraryHiddenColumns';
  const DEFAULT_HIDDEN = ['album', 'genre'];
  let hidden = $state(
    (() => {
      try {
        const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null');
        return Array.isArray(v) ? v : DEFAULT_HIDDEN;
      } catch {
        return DEFAULT_HIDDEN;
      }
    })(),
  );
  const columns = $derived((flag('dir-room-tint') ? arrange(COLUMNS) : COLUMNS).filter((c) => c.by === 'title' || !hidden.includes(c.by))); // #110 (UI audit flag)
  // The last 28px holds the columns button in the heading row.
  // #15, #80, #89 (UI audit flags): spacing, library-columns and key-notation size the columns
  // through --col-mark and --col-<column> on .main; each falls back to the width above.
  const sizedCols = $derived(flag('spacing') || flag('library-columns') || flag('key-notation'));
  const gridColumns = $derived(
    sizedCols
      ? `var(--col-mark, 26px) ${columns.map((c) => `var(--col-${c.by}, ${c.width})`).join(' ')} 28px`
      : `26px ${columns.map((c) => c.width).join(' ')} 28px`,
  );
  // #80 (UI audit flag): library-columns names each cell's column (data-col), since the user picks which show.
  const colAttr = (c) => (flag('library-columns') ? c.by : undefined);
  function toggleColumn(by) {
    hidden = hidden.includes(by) ? hidden.filter((h) => h !== by) : [...hidden, by];
    if (hidden.includes(by) && sort.by === by) sort = { by: null, dir: 1 };
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
    } catch {}
  }
  /** The columns menu, from a right-click on the headings or the columns button (opened under it). */
  const columnsButton = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    headMenu({ preventDefault() {}, stopPropagation() {}, clientX: r.right - 200, clientY: r.bottom + 4 });
  };
  let colMenu = $state(/** @type {{ x: number, y: number, keyboard: boolean } | null} */ (null)); // #110 (UI audit flag)
  const headMenu = (e) =>
    flag('dir-room-tint') ? (e.preventDefault(), e.stopPropagation(), (colMenu = { x: e.clientX, y: e.clientY, keyboard: e.isTrusted === false })) :
    openMenu(e, [
      ...COLUMNS.filter((c) => c.by !== 'title').map((c) => ({ label: c.label, checked: !hidden.includes(c.by), action: () => toggleColumn(c.by) })),
    ]);

  const selected = $derived.by(() => {
    const i = sorted.findIndex((t) => t.path === selPath);
    return i < 0 ? 0 : i;
  });
  const selectIndex = (i) => (selPath = sorted[i]?.path ?? null);

  // #7 (UI audit flag): edge-empty-views: an empty playlist or folder says so, not "No tracks yet. Add a music folder".
  // Two short lines: what's empty, then how to fill it.
  const emptyView = $derived(
    !flag('edge-empty-views') ? null
    : view.kind === 'playlist' ? ['This playlist is empty.', 'Drag tracks onto its name in the sidebar.']
    : view.kind === 'folder' ? ['No music in this folder.', 'Add music files to it in Finder.']
    : null,
  );

  // #8 (UI audit flag): stress-plural says "1 track", not "1 tracks".
  const tracksWord = $derived(flag('stress-plural') && results.length === 1 ? 'track' : 'tracks');
  // #84 (UI audit flag): search-scope: a search's count keeps the total ("4 of 48 tracks").
  const countText = $derived(
    flag('search-scope') && (query.trim() || filtered || fits)
      ? `${results.length.toLocaleString()} of ${all.length.toLocaleString()} ${all.length === 1 ? 'track' : 'tracks'}`
      : `${results.length.toLocaleString()} ${tracksWord}`,
  );
  // #84 (UI audit flag): search-scope: the view a search runs in, for "Nothing in All tracks matches …".
  const viewName = $derived(
    view.kind === 'folder' ? `“${short(view.path ?? '')}”`
    : view.kind === 'playlist' ? `“${playlistName(view.id)}”`
    : 'All tracks',
  );
  // #84 (UI audit flag): search-scope marks the searched words in titles and artists.
  const markOn = $derived(flag('search-scope') && !!query.trim());
  /** Splits `text` into runs that match a searched word and runs that don't. */
  function marks(text) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lower = (text ?? '').toLowerCase();
    if (!text || lower.length !== text.length) return [{ s: text ?? '', hit: false }];
    const hit = new Array(text.length).fill(false);
    for (const w of words) for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + w.length)) hit.fill(true, i, i + w.length);
    const out = [];
    for (let i = 0; i < text.length; i++) {
      if (out.length && out[out.length - 1].hit === hit[i]) out[out.length - 1].s += text[i];
      else out.push({ s: text[i], hit: hit[i] });
    }
    return out;
  }

  // Decode the selected track ahead, so Load (on screen, the keyboard or a
  // controller) finds it ready. Waits for the selection to settle, so
  // browsing through the list doesn't decode every row on the way. Not
  // the row selected by default when the library opens: only one picked.
  const PRELOAD_MS = 150;
  let picked = false;
  $effect(() => {
    const t = sorted[selected];
    const path = t && !t.missing ? t.path : null;
    picked ||= selPath !== null;
    if (!picked || !path) return;
    const timer = setTimeout(() => backend.preloadTrack(path).catch(() => {}), PRELOAD_MS);
    return () => clearTimeout(timer);
  });

  /** Tracks still waiting for their length, BPM and key, or showing ones an
   * older version of the analyzer found until it redoes them. */
  const pending = $derived(all.reduce((n, t) => n + (t.analysis && !t.analysis.outdated ? 0 : 1), 0));
  // #18 (UI audit flag): how much of the library is analysed, for the bar under the analysis note.
  $effect(() => void (conn.pending = loading ? 0 : pending)); // #112 (UI audit flag): shell-status, the title bar says it
  const analysisDone = $derived(flag('visual-analysis') && all.length ? `${((1 - pending / all.length) * 100).toFixed(1)}%` : undefined);
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

  // Analysis results stream in from the background analyzer. A playlist
  // can list a track twice, so each path maps to every row of it.
  let byPath = new Map();
  $effect(() => {
    let off = null;
    let gone = false;
    backend.onLibraryAnalysis?.((e) => {
      for (const t of byPath.get(e.path) ?? []) t.analysis = { duration: e.duration, bpm: e.bpm, key: e.key, failed: e.failed, outdated: e.outdated };
    }).then((fn) => (gone ? fn() : (off = fn)));
    return () => {
      gone = true;
      off?.();
    };
  });

  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 5));
  const visible = $derived(sorted.slice(first, first + Math.ceil(viewHeight / ROW) + 10));
  const onDeck = (t) => [0, 1].filter((d) => tracks[d]?.path === t.path);
  // #18 (UI audit flag): the keys to mix into: the playing decks', or the loaded ones' if none plays (class:mix on .k).
  const mixFrom = $derived.by(() => {
    if (!flag('visual-key-match')) return [];
    const loaded = [0, 1].filter((d) => tracks[d] && engine.decks[d].key);
    const from = loaded.some((d) => engine.decks[d].playing) ? loaded.filter((d) => engine.decks[d].playing) : loaded;
    return from.map((d) => ({ d, key: playingKey(engine.decks[d].key, engine.decks[d].rate, engine.decks[d].keylock) }));
  });
  const mixKeys = $derived(mixFrom.map((m) => m.key));
  // #89 (UI audit flag): key-notation: how the Key column writes a key (null: as today, musical).
  const notation = $derived(flag('key-notation') ? setting('key-notation', 'show') : null);
  /** #18 (UI audit flag): the decks a key mixes with, for its tooltip. */
  const mixWith = (key) => mixFrom.filter((m) => keysMix(m.key, key));
  const side = (d) => ['left', 'right'][d];
  /** #18 (UI audit flag): a mixing key's tooltip says which deck it goes with, by position ("Mixes with the left deck (C, 8B)"). */
  function keyTip(key, loaded = false) {
    const own = `${keyLongName(key)} (${camelot(key)})`;
    const w = loaded ? [] : mixWith(key);
    if (!w.length) return own;
    if (w.length > 1) return tipText(own, 'Mixes with both decks');
    return tipText(own, `Mixes with the ${side(w[0].d)} deck (${keyName(w[0].key)}, ${camelot(w[0].key)})`);
  }

  /** Loads the current view. `keep` holds on to the selection (after an edit). */
  async function refresh({ keep = false } = {}) {
    loading = !keep;
    error = '';
    try {
      [folders, playlists] = await Promise.all([backend.libraryFolders(), backend.playlists()]);
      if (view.kind === 'playlist' && !playlists.some((p) => p.id === view.id)) view = { kind: 'all' };
      const list =
        view.kind === 'playlist' ? await backend.playlistTracks(view.id)
        : await backend.libraryTracks(folder);
      // Rows need a unique key: a playlist can list a track twice.
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
      // #85 (UI audit flag): folder-counts (counted always; only shown with the flag on).
      if (view.kind === 'all') folderCounts = Object.fromEntries(folders.map((f) => [f, all.filter((t) => inFolder(t.path, f)).length]));
      else if (view.kind === 'folder' && view.path) folderCounts = { ...folderCounts, [view.path]: all.length };
      if (view.kind === 'all' && total === 0) onempty?.();
      if (!keep) selectIndex(0);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  /** Whether `path` is inside music folder `f`. */
  const inFolder = (path, f) => path.startsWith(f.endsWith('/') || f.endsWith('\\') ? f : `${f}/`) || path.startsWith(`${f}\\`);

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
        label: `Removed ${q(short(f))} from the library`,
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
  // (Declared as functions so the empty view and #84's view name above can use them.)
  function playlistName(id) {
    return playlists.find((p) => p.id === id)?.name ?? 'playlist';
  }
  // #86 (UI audit flag): copy-toasts sets names off in quotes and says what was made ("Created playlist “New playlist”").
  const copy = () => flag('copy-toasts');
  const q = (s) => (copy() ? `“${s}”` : s);

  /** Makes a playlist (holding `paths`) and starts naming it. */
  async function newPlaylist(paths = []) {
    let name = 'New playlist';
    for (let n = 2; playlists.some((p) => p.name === name); n++) name = `New playlist ${n}`;
    const id = await backend.createPlaylist(name, paths);
    playlists = await backend.playlists();
    renaming = id;
    pushEdit({
      label: copy() ? `Created playlist ${q(name)}` : `Made ${name}`,
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
      label: `Renamed ${q(old)} to ${q(name)}`,
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
      label: copy() ? `Deleted playlist ${q(name)}` : `Deleted ${name}`,
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
    // #86 (UI audit flag): copy-toasts: nothing changed, so nothing to undo.
    if (!added && copy()) return showToast(paths.length === 1 ? `Already in ${q(name)}` : `All already in ${q(name)}`);
    pushEdit({
      label: added ? `Added ${added === 1 ? 'a track' : `${added} tracks`} to ${q(name)}` : `Already in ${name}`,
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
    reorder(all.filter((x) => x.path !== t.path).map((x) => x.path), `Removed ${q(t.title)} from ${q(playlistName(view.id))}`);
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
    reorder(paths, `Moved ${q(drag.track.title)}`);
  }

  // #20 (UI audit flag): library-clip fades the list's and the sidebar's foot while more is below (data-more).
  let nav = $state(/** @type {HTMLElement | null} */ (null));
  let listMore = $state(false);
  let navMore = $state(false);
  let listUp = $state(false);
  let navUp = $state(false);
  const below = (el) => !!el && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  function edges() {
    listMore = below(scroller);
    navMore = below(nav);
    listUp = !!scroller && scroller.scrollTop > 0;
    navUp = !!nav && nav.scrollTop > 0;
    // A section heading keeps with its first item: while that item is out of
    // view below, the heading is hidden (data-cut) rather than left alone
    // at, or half under, the sidebar's foot.
    if (!nav) return;
    const foot = nav.getBoundingClientRect().bottom - 8;
    for (const h of nav.querySelectorAll(':scope > .h')) {
      const next = h.nextElementSibling;
      h.toggleAttribute('data-cut', flag('library-clip') && !!next && next.getBoundingClientRect().top > foot);
    }
  }
  $effect(() => {
    void [flag('library-clip'), viewHeight, sorted.length, playlists.length, folders.length, ROW];
    edges();
  });
  // Other flags change row and heading sizes: measure again when any flag or setting changes.
  $effect(() => {
    if (!flag('library-clip')) return;
    let raf = 0;
    const watch = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(edges);
    });
    watch.observe(document.documentElement, { attributes: true });
    return () => {
      watch.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  /**
   * A tooltip that only exists while a flag asks for one: pass null and the
   * node has no tip at all (an empty tip would still hide the one showing).
   * @param {HTMLElement} node
   * @param {(() => string) | null} get
   */
  function flagTip(node, get) {
    let t = get ? tip(node, get) : null;
    return {
      /** @param {(() => string) | null} next */
      update(next) {
        if (next && t) t.update(next);
        else if (next) t = tip(node, next);
        else if (t) {
          t.destroy();
          t = null;
        }
      },
      destroy() {
        t?.destroy();
      },
    };
  }

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

  function short(p) {
    return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  }

  const rowMenu = (e, t, index) => {
    selectIndex(index);
    // Choosing "Replace" in the menu is the confirmation, so it loads at once.
    const playing = (d) => engine.decks[d].playing;
    // #88 (UI audit flag): deck-names says "the left deck", as the screen shows it, not a letter it never shows.
    const named = flag('deck-names');
    const on = (d) => (named ? `${['left', 'right'][d]} deck` : `deck ${'AB'[d]}`);
    const load = [0, 1].map((d) => ({
      label: t.missing ? 'File not found' : playing(d) ? (named ? `Replace track on ${on(d)}` : `Replace the playing track on ${on(d)}`) : `Load to ${on(d)}`,
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
      { label: copy() ? 'Rename playlist' : 'Rename', action: () => (renaming = p.id) },
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

{#if colMenu && flag('dir-room-tint')}<ColumnsMenu {...colMenu} columns={COLUMNS} {hidden} ontoggle={toggleColumn} onreset={() => { setOrder([]); resetWidths(); }} onclose={() => (colMenu = null)} />{/if}

<section class="library" aria-label="Library">
  <nav data-region="sidebar" aria-label="Library and playlists" bind:this={nav} onscroll={edges}
    data-more={flag('library-clip') && navMore ? '' : undefined} data-scrolled={flag('library-clip') && navUp ? '' : undefined}>
    <div class="h">Library</div>
    <button class="item" class:on={view.kind === 'all'} aria-current={view.kind === 'all'} onclick={() => pick(null)}>
      <span>All tracks</span>{#if total !== null}<small class="num">{total.toLocaleString()}</small>{/if}
    </button>
    {#each folders as f}
      <button class="item" class:on={folder === f} aria-current={folder === f} onclick={() => pick(f)}
        oncontextmenu={(e) => folderMenu(e, f)} use:tip={() => f}>
        <span>{short(f)}</span>{#if folder === f && !loading}<small class="num">{all.length.toLocaleString()}</small>{:else if flag('folder-counts') && folderCounts[f] != null}<small class="num">{folderCounts[f].toLocaleString()}</small>{/if}
      </button>
    {/each}
    <!-- #90 (UI audit flag): library-polish draws the plus as an icon. -->
    <button class="add" onclick={addFolder}>{#if flag('library-polish')}<svg class="plus" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg><span>Add music folder</span>{:else}+ Add music folder{/if}</button>

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
    <button class="add" onclick={() => newPlaylist()}>{#if flag('library-polish')}<svg class="plus" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg><span>New playlist</span>{:else}+ New playlist{/if}</button>


  </nav>

  <div class="main" style:--cols={gridColumns}>
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
      <button class="btn sm chip" class:on={fits} aria-pressed={fits} disabled={!air && !fits} onclick={toggleFits} use:tip={fitsTip}>
        Fits{#if fits && air}<span class="chip-val num">{airLabel}</span>{/if}
      </button>
      <div class="filter" bind:this={filterBox}>
        <button class="btn sm chip" class:on={filtered} aria-expanded={filterOpen} aria-haspopup="dialog"
          onclick={() => (filterOpen = !filterOpen)} use:tip={() => (filterOpen ? '' : 'Filter by BPM and key')}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 3h9M3 6h6M4.75 9h2.5" /></svg>{filtered ? describe(filter) : 'Filter'}
        </button>
        {#if filtered}
          <button class="clear" aria-label="Clear the filter" onclick={clearFilter} use:tip={() => 'Clear the filter'}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" /></svg>
          </button>
        {/if}
        {#if filterOpen}
          <div class="panel" role="dialog" aria-label="Filter by BPM and key">
            <div class="ph">BPM</div>
            <div class="bpm">
              <input class="num" type="number" min="1" step="1" placeholder="From" aria-label="Lowest BPM" value={filter.bpmMin ?? ''}
                oninput={(e) => setFilter({ ...filter, bpmMin: bpmInput(e.currentTarget.value) })} />
              <span>to</span>
              <input class="num" type="number" min="1" step="1" placeholder="To" aria-label="Highest BPM" value={filter.bpmMax ?? ''}
                oninput={(e) => setFilter({ ...filter, bpmMax: bpmInput(e.currentTarget.value) })} />
            </div>
            <div class="ph">Key</div>
            <div class="wheel" role="group" aria-label="Keys, on the Camelot wheel">
              {#each WHEEL as row}
                {#each row as c}
                  <button class="kc num" class:on={filter.keys.includes(c)} aria-pressed={filter.keys.includes(c)} onclick={() => toggleKey(c)}>{c}</button>
                {/each}
              {/each}
            </div>
            <div class="pf">
              <span>A minor keys, B major</span>
              <button class="btn sm ghost" disabled={!filtered} onclick={clearFilter}>Clear</button>
            </div>
          </div>
        {/if}
      </div>
      <!-- #10 (UI audit flag): the analysis note set apart by space, not a middle dot. -->
      {#if flag('no-dots')}
        <span class="count num">{loading ? 'Scanning…' : countText}{#if !loading && pending}{' '}<span
            class="pending" style:--flag-visual-analysis-done={analysisDone} use:tip={() => 'Finding each track’s length, BPM and key in the background'}>analyzing, {pending.toLocaleString()} to go</span>{/if}</span>
      {:else}
      <span class="count num">{loading ? 'Scanning…' : countText}{#if !loading && pending}<span
          class="pending" style:--flag-visual-analysis-done={analysisDone} use:tip={() => 'Finding each track’s length, BPM and key in the background'}> · analyzing, {pending.toLocaleString()} to go</span>{/if}</span>
      {/if}
      {#if flag('shell-status') && setting('shell-status', 'place') !== 'titlebar'}<Activity /><Status />{/if}<!-- #112 (UI audit flag): shell-status -->
      <button class="btn sm samp" class:on={sampler.open} aria-pressed={sampler.open}
        onclick={() => setSamplerOpen(!sampler.open)}
        use:tip={() => tipText(sampler.open ? 'Hide sampler' : 'Show sampler', keyLabel('view.sampler'),
          // #30 (UI audit flag): tooltip-wrap (E9): the description as its own sentence, since the tip now wraps.
          flag('tooltip-wrap') ? 'Eight one-shot sounds to fire over the mix.' : 'eight one-shot sounds to fire over the mix')}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="3.5" height="3.5" rx="1" /><rect x="7" y="1.5" width="3.5" height="3.5" rx="1" /><rect x="1.5" y="7" width="3.5" height="3.5" rx="1" /><rect x="7" y="7" width="3.5" height="3.5" rx="1" /></svg>Sampler
      </button>
      {#if onsettings}
        <!-- Always here, however long the sidebar gets. -->
        <button class="btn sm gear" onclick={onsettings} aria-label="Settings"
          use:tip={() => tipText('Settings', keyLabel('app.settings'))}>
          <!-- #83 (UI audit flag): settings-icon draws a gear (Lucide's "settings"), not two sliders that read as a filter. -->
          {#if flag('settings-icon')}<svg class="cog" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>{:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></svg>{/if}
        </button>
      {/if}
    </div>

    {#if sampler.open}<Sampler {onmessage} selected={() => selectedTrack()} />{/if}

    <!-- #110 (UI audit flag): dir-room-tint: the columns can be dragged to size. -->
    <div class="row head" role="group" aria-label="Sort tracks" oncontextmenu={headMenu} use:colResize={{ on: flag('dir-room-tint') && sizedCols, columns, all: COLUMNS }}>
      <span></span>
      {#each columns as c}
        {@const on = sortOn.by === c.by}
        <!-- #81 (UI audit flag): library-sort gives every heading a slot for its arrow (hidden unless sorted), so nothing shifts. -->
        <button class="sort" class:on class:num={c.num} aria-pressed={on} data-col={colAttr(c)}
          aria-label="Sort by {c.label.toLowerCase()}{on ? (sortOn.dir > 0 ? ', ascending' : ', descending') : ''}"
          use:flagTip={c.by === 'key' && flag('visual-key-match') ? () => 'A line under a key: it mixes with what’s loaded' : null}
          onclick={() => sortBy(c.by)}>{c.label}{#if on || flag('library-sort')}<svg viewBox="0 0 10 10" aria-hidden="true" class:down={on && sortOn.dir < 0} class:ghost={!on}><path d="M2.5 6.5 5 4l2.5 2.5" /></svg>{/if}</button>
      {/each}
      <button class="cols" aria-label="Choose columns" aria-haspopup="menu" onclick={columnsButton}
        use:tip={() => 'Choose columns'}>
        <svg viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" /><path d="M5.25 2.5v9M8.75 2.5v9" /></svg>
      </button>
    </div>

    <div class="scroll" bind:this={scroller} bind:clientHeight={viewHeight} onscroll={() => ((scrollTop = scroller.scrollTop), edges())}
      tabindex="0" onkeydown={listKey} role="listbox" aria-label="Tracks" data-region="tracks" data-more={flag('library-clip') && listMore ? '' : undefined} data-scrolled={flag('library-clip') && listUp ? '' : undefined}
      aria-activedescendant={sorted[selected] ? `track-${selected}` : undefined}>
      {#if flag('empty-filter') && !error && !loading && all.length && (filter.bpmMin || filter.bpmMax) && !filter.keys.length && !query.trim() && !fits && (!results.length || emptyHeld)}
        <!-- #113 (UI audit flag): empty-filter: your tempos, and the range asked for. -->
        <EmptyFilter tracks={all} {filter} count={results.length} {setFilter} clear={clearFilter} bind:held={emptyHeld} />
      {:else if error}
        <div class="empty">{error}</div>
      {:else if !loading && !all.length && emptyView}
        <div class="empty"><p class="what">{emptyView[0]}</p><p class="how">{emptyView[1]}</p></div>
      {:else if !loading && !all.length}
        <div class="empty">
          <p>No tracks yet.</p>
          <div class="empty-actions">
            <button class="btn sm" onclick={addFolder}>Add a music folder</button>
            {#if onimport && view.kind === 'all'}<button class="btn sm" onclick={onimport}>Import from Rekordbox or Serato</button>{/if}
          </div>
          {#if onimport && view.kind === 'all'}<p class="hint">Importing brings your cue points, loops, beatgrids and playlists too.</p>{/if}
        </div>
      {:else if !loading && !results.length && flag('search-scope') && query.trim() && !fits && !filtered}
        <!-- #84 (UI audit flag): search-scope: name the view, and offer the way out. -->
        <div class="empty"><p>Nothing in {viewName} matches “{query.trim()}”.</p><button class="btn sm" onclick={clearSearch}>Clear search<kbd class="keyhint">esc</kbd></button></div>
      {:else if !loading && !results.length}
        <div class="empty">
          <p>{query ? `Nothing matches “${query}”` : 'No tracks'}{fits ? ` that mix with deck ${air ? 'AB'[air.deck] : ''}` : ''}{filtered ? ` in ${describe(filter)}` : ''}.</p>
          {#if fits || filtered}
            <div class="empty-actions">
              {#if fits}<button class="btn sm" onclick={toggleFits}>Show everything</button>{/if}
              {#if filtered}<button class="btn sm" onclick={clearFilter}>Clear the filter</button>{/if}
            </div>
          {/if}
        </div>
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
            oncontextmenu={(e) => rowMenu(e, t, index)}
            use:flagTip={flag('library-polish') && index === selected && !t.missing ? () => `Double-click to load, or ${keyLabel('deck.0.load')} / ${keyLabel('deck.1.load')}` : null}>
            <!-- #90 (UI audit flag): library-polish: the selected row's tip says how to load it (c-K83). -->
            <span class="ld">{#each decks as d}<b class:b={d === 1} aria-hidden="true"></b>{#if flag('deck-letters')}<i class="dl" class:b={d === 1} aria-hidden="true">{'AB'[d]}</i>{/if}{/each}</span>
            {#each columns as c (c.by)}
              {#if c.by === 'title'}
                <span class="t" data-col={colAttr(c)}>{#if t.missing}<span class="k" use:tip={() => `File not found: ${t.path}`}>{t.title}</span><span class="sr">, file not found</span>{:else if markOn}{#each marks(t.title) as m}{#if m.hit}<mark>{m.s}</mark>{:else}{m.s}{/if}{/each}{:else}{t.title}{/if}</span>
              {:else if c.by === 'bpm'}
                <span class="n num" class:none={a && !a.bpm} data-col={colAttr(c)}>{a ? bpmText(a) || NONE : ''}</span>
              {:else if c.by === 'key'}
                <span class:none={a && !a.key} data-col={colAttr(c)}>{#if a?.key}<span class="k" class:mix={!decks.length && mixKeys.some((k) => keysMix(k, a.key))} use:tip={() => keyTip(a.key, decks.length > 0)}><!-- #89 (UI audit flag): key-notation: Camelot, or both as the decks show it (the name in a slot, so the codes line up).
                  -->{#if notation === 'camelot'}{camelot(a.key)}{:else if notation === 'both'}<span class="kn">{keyName(a.key)}</span> <span class="cam">{camelot(a.key)}</span>{:else}{keyName(a.key)}{/if}</span>{:else if a}{NONE}{/if}</span>
              {:else if c.by === 'time'}
                <span class="n num" class:none={a?.failed} data-col={colAttr(c)}>{a ? timeText(a) || NONE : ''}</span>
              {:else if markOn && (c.by === 'artist' || c.by === 'folder' || c.by === 'album' || c.by === 'genre')}
                <!-- #84 (UI audit flag): search-scope marks the searched words. -->
                <span data-col={colAttr(c)}>{#each marks(t[c.by]) as m}{#if m.hit}<mark>{m.s}</mark>{:else}{m.s}{/if}{/each}</span>
              {:else}
                <span data-col={colAttr(c)}>{t[c.by] ?? ''}</span>
              {/if}
            {/each}
            {#if decks.length && flag('deck-names')}<span class="sr">, on the {decks.map((d) => ['left', 'right'][d]).join(' and ')} {decks.length > 1 ? 'decks' : 'deck'}</span>{:else if decks.length}<span class="sr">, on deck {decks.map((d) => 'AB'[d]).join(' and ')}</span>{/if}
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
  .chip {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    white-space: nowrap;
  }
  .chip.on {
    color: var(--fg);
    background: var(--sel);
  }
  .chip svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
  }
  .chip-val {
    color: var(--fg-2);
  }
  .filter {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .filter > .clear {
    margin: 0;
  }
  /* The filter panel: under its button, above the track list. */
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    width: 300px;
    padding: 10px;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2), 0 12px 32px rgb(0 0 0 / 0.45);
  }
  .ph {
    margin: 0 0 6px;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .bpm {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--fg-3);
    font-size: var(--t-xs);
  }
  .bpm input {
    flex: 1;
    min-width: 0;
    height: var(--h-md);
    box-sizing: border-box;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: var(--well);
    box-shadow: var(--well-shadow);
    color: var(--fg);
    font: inherit;
    font-size: var(--t-sm);
  }
  .bpm input:focus-visible {
    outline: none;
    box-shadow: var(--well-shadow), inset 0 0 0 1px var(--fg-3);
  }
  .wheel {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .kc {
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: var(--raise);
    color: var(--fg-2);
    font: inherit;
    font-size: var(--t-xs);
    transition: background-color 140ms ease, color 140ms ease;
  }
  .kc:hover {
    color: var(--fg);
  }
  .kc.on {
    background: var(--sel);
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .kc:focus-visible {
    outline: 1px solid var(--fg-3);
  }
  .pf {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    font-size: var(--t-xs);
    color: var(--fg-3);
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
    grid-template-columns: var(--cols);
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
  /* Opens the columns menu; quiet until hovered, like the headings. */
  .cols {
    justify-self: end;
    width: 24px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: none;
    color: inherit;
    transition: background-color 140ms ease, color 140ms ease;
  }
  .cols:hover,
  .cols:focus-visible {
    background: var(--hover);
    color: var(--fg);
  }
  .cols:focus-visible {
    outline: 1px solid var(--fg-3);
  }
  .cols svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
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
  /* deck-letters (UI audit flag, decks builder's; against the doc): the
     deck's letter beside its bar. Only rendered while that flag is on. */
  .ld .dl {
    font: 500 var(--t-xs) / 1 var(--font);
    font-style: normal;
    color: var(--deck-a);
  }
  .ld .dl.b {
    color: var(--deck-b);
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
  /* edge-empty-views (#7): what's empty, then 4px under it, how to fill it. */
  .empty .what {
    color: var(--fg-2);
  }
  .empty .how {
    margin-top: -4px;
    color: var(--fg-3);
  }
  /* search-scope (#84): the key hint 8px after "Clear search", as Undo's ⌘Z. */
  .empty .btn:has(.keyhint) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .empty .hint {
    font-size: 12px;
  }
</style>
