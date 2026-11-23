<script>
  import { onMount } from 'svelte';
  import Deck from './lib/Deck.svelte';
  import Mixer from './lib/Mixer.svelte';
  import Library from './lib/Library.svelte';
  import Waveform from './lib/Waveform.svelte';
  import Tooltip from './lib/Tooltip.svelte';
  import Backdrop from './lib/Backdrop.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import Settings from './lib/Settings.svelte';
  import Import from './lib/Import.svelte';
  import Report from './lib/Report.svelte';
  import ControllerSetup from './lib/ControllerSetup.svelte';
  import { sampler, setSamplerOpen, restoreSampler, loadSample } from './lib/sampler.svelte.js';
  import { engine, tracks, startEngineLoop, loadTrack, control, deckSnapshot, restoreDeck } from './lib/engine.svelte.js';
  import { backend, inTauri } from './lib/backend.js';
  import { syncDeckSettings } from './lib/decksettings.svelte.js';
  import { dropTarget } from './lib/dnd.svelte.js';
  import { commandFor, keyLabel, mac } from './lib/commands.js';
  import { keymap } from './lib/keymap.svelte.js';
  import { keyboardMenu, htmlMenu } from './lib/menu.svelte.js';
  import { tip, tipText } from './lib/tooltip.svelte.js';
  import { live, announce } from './lib/announce.svelte.js';
  import { toast, showToast, hideToast, holdToast, releaseToast, pushEdit, undo, redo } from './lib/undo.svelte.js';
  import { stepUiZoom, setUiZoom } from './lib/uizoom.svelte.js';
  import { installAppMenu } from './lib/appmenu.js';
  import { runPerformance } from './lib/performance.js';
  import { flag, setting } from './flags/registry.svelte.js';
  import { side, sideShut, hideSidebar } from './flags/110-dir-room-tint/sidebar.svelte.js'; // #110 (UI audit flag)
  import { start as startSquircles } from './flags/01-squircles/squircles.js';
  import { padMode, setPadMode } from './lib/padmode.svelte.js';
  import { tempoPickup } from './lib/pickup.svelte.js';
  import { gridEdit, NUDGE } from './lib/grid.svelte.js';
  import { toggleStem, soloStem, syncStemWaveforms, stemsUnavailable, stemsOf } from './lib/stems.svelte.js';
  import { once, stemsReadyTip } from './lib/tips.svelte.js';
  import { libraryHealth, reveal, captureUiErrors, update, checkForUpdate, installUpdate } from './lib/support.svelte.js';
  import Status from './flags/112-shell-status/Status.svelte'; // #112 (UI audit flag)
  import Keys from './flags/116-settings-finish/Keys.svelte'; // #118 (UI audit flag)
  import { open as shellOpen } from './flags/112-shell-status/connections.svelte.js'; // #112 (UI audit flag)

  let library;
  let mixer;
  // On the Mac the window has no title bar: the close, minimize and zoom
  // buttons sit on a plain strip of their own above the panels
  // (tauri.conf.json centres them in it), and the strip drags the window.
  const macWindow = inTauri && mac;
  const TOP_STRIP = 32; // the strip's height, in place of the usual 12px top padding
  let zoom = $state(12);
  const say = (msg) => showToast(msg);

  // #88 (UI audit flag): deck-names: decks are named by side ("left deck"), as
  // the screen never shows a letter; off, "deck A" / "Deck A" as before.
  const deckName = (deck, start = false) =>
    flag('deck-names') ? `${start ? (deck ? 'Right' : 'Left') : deck ? 'right' : 'left'} deck` : `${start ? 'Deck' : 'deck'} ${'AB'[deck]}`;
  // #86 (UI audit flag): copy-toasts: the track title set off in quotes.
  const titled = (t) => (flag('copy-toasts') ? `“${t}”` : t);
  const playingMsg = (deck) => `${deckName(deck, true)} is playing. Pause it first.`;

  // Loading onto a playing deck stops what the room hears, so it takes a
  // second press: the first only warns. Any load onto the same deck within
  // REPLACE_MS (button, key, controller or drag) goes ahead, with whatever
  // track it names, so browsing to a different track in between is fine.
  const REPLACE_MS = 3000;
  /** @type {{ deck: number, until: number } | null} */
  let replacing = null;
  /** True if `deck` can take a track now; otherwise warns and arms the second press. */
  function confirmReplace(deck) {
    if (!engine.decks[deck].playing) return true;
    const now = performance.now();
    if (replacing?.deck === deck && now < replacing.until) {
      replacing = null;
      return true;
    }
    replacing = { deck, until: now + REPLACE_MS };
    showToast(`${deckName(deck, true)} is playing. Load again within 3 seconds to replace it.`, { ms: REPLACE_MS });
    announce(`${deckName(deck, true)} is playing. Load again within 3 seconds to replace it.`);
    return false;
  }

  /** Loads a track, keeping what the deck held so ⌘Z can put it back.
   *  `force` skips the second press, for a choice that already said so. */
  async function load(deck, track, { force = false } = {}) {
    if (!force && !confirmReplace(deck)) return;
    replacing = null;
    const before = deckSnapshot(deck);
    try {
      await loadTrack(deck, track);
      announce(`Loaded ${titled(track.title)} on ${deckName(deck)}`);
    } catch (e) {
      say(`Couldn't load ${titled(track.title)}: ${e}`);
      return;
    }
    let after = null;
    // Undo and redo both refuse a playing deck: they'd stop it with no
    // warning, so pause it first.
    const swap = (snap) => async () => {
      if (engine.decks[deck].playing) {
        say(playingMsg(deck));
        return false;
      }
      const now = deckSnapshot(deck);
      await restoreDeck(deck, snap);
      return now;
    };
    pushEdit({
      label: `Loaded ${titled(track.title)} on ${deckName(deck)}`,
      undo: async () => {
        const now = await swap(before)();
        if (now === false) return false;
        after = now;
      },
      redo: async () => (await swap(after)()) === false ? false : undefined,
    });
  }

  // Settings open as a popup over the whole window.
  let settings = $state(null); // null, 'keyboard', 'decks', 'audio', 'display', 'library', 'stems' or 'controllers'

  // Muted stems drop out of the waveforms.
  $effect(() => syncStemWaveforms());
  // The first time a track's stems are ready, a one-time tip says where they are.
  $effect(() => {
    if ([0, 1].some((d) => stemsOf(d).state === 'ready')) stemsReadyTip();
  });
  // Importing another app's library opens in its own window over the app.
  let importing = $state(false);
  const openImport = () => {
    hideToast();
    importing = true;
  };
  // Report a problem: a small window over the app.
  let reporting = $state(false);
  const openReport = () => {
    hideToast();
    reporting = true;
  };
  // Controller not working: set it up step by step, over the app.
  let settingUp = $state(false);
  const openControllerSetup = () => {
    hideToast();
    settingUp = true;
  };
  /** What the report says about the setup, beyond the version and system. */
  async function reportContext() {
    const a = engine.audio;
    const out = a?.state === 'connected' ? `${a.device}, ${a.sampleRate} Hz` : a?.state === 'lost' ? `${a.device} (disconnected)` : 'none';
    const c = await backend.controllers?.().catch(() => null);
    const pads = c?.connected?.map((x) => `${x.port} (${x.mapping})`).join(', ') || 'none';
    return `Audio output: ${out}\nControllers: ${pads}`;
  }

  // The library file's state on launch, when it needs saying.
  /** @type {import('./lib/support.svelte.js').LibraryHealth | null} */
  let health = $state(null);
  const healthText = $derived.by(() => {
    if (!health || health.state === 'ok') return null;
    if (health.state === 'restored') {
      const date = health.backup.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      return { title: 'Your library was damaged, so it was restored from a backup.', body: `Anything changed after ${date ? new Date(`${date}T12:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'that backup'} is missing. The damaged file is kept.`, file: health.damaged };
    }
    if (health.state === 'fresh') {
      return { title: 'Your library was damaged and had no backup, so a new one was started.', body: 'Add your music folders again. The damaged file is kept.', file: health.damaged };
    }
    return { title: "Your library couldn't be opened, so changes won't be saved.", body: `The cause: ${health.reason}. Quit and open Interlude again.`, file: null };
  });

  // Updates: checked a few seconds after launch, and from the menu.
  let updateDismissed = $state(false);
  const busyOnAir = () => engine.decks.some((d) => d.playing) || engine.recording?.active;
  async function checkUpdatesNow() {
    const found = await checkForUpdate();
    updateDismissed = false;
    if (found === false) say("You're on the latest version");
    else if (found === null) say("Couldn't check for updates. Try again later.");
  }
  function install() {
    // Never restart the app under a playing deck or a recording.
    if (busyOnAir()) {
      say('Stop the decks and the recording first, then install the update.');
      return;
    }
    installUpdate();
  }

  const openSettings = (page = 'keyboard') => {
    hideToast();
    settings = page;
  };

  /** Speaks where a deck is: time, bar and whether it's playing. */
  function readPosition(deck) {
    const t = tracks[deck];
    if (!t) return announce(`${deckName(deck, true)} is empty`);
    const d = engine.decks[deck];
    const spoken = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s - m * 60);
      return `${m} minute${m === 1 ? '' : 's'} ${sec} second${sec === 1 ? '' : 's'}`;
    };
    const parts = [deckName(deck, true), `${spoken(d.position)} of ${spoken(d.duration)}`];
    const g = t.beatgrid;
    if (g?.bpm) {
      const bar = (s) => Math.floor(Math.max(0, ((s - g.firstBeat) * g.bpm) / 60) / 4) + 1;
      parts.push(`bar ${bar(d.position)} of ${bar(d.duration)}`);
    }
    parts.push(d.playing ? 'playing' : 'paused');
    announce(parts.join(', '));
  }

  // The audio device: a banner while it's gone, a toast when it's back.
  let lostDevice = null;
  $effect(() => {
    const a = engine.audio;
    if (a?.state === 'lost' && lostDevice === null) {
      lostDevice = a.device;
      // #23 (UI audit flag): banner-warning: the announcement says what the banner says.
      announce(flag('banner-warning') ? `${a.device} disconnected. Decks paused. They carry on when it's back.` : `${a.device} disconnected. Decks are held where they stopped.`);
    } else if (a?.state === 'connected' && lostDevice !== null) {
      say(a.device === lostDevice ? `${a.device} is back` : `Playing through ${a.device}`);
      announce(`Audio is back on ${a.device}`);
      lostDevice = null;
    }
  });

  const setZoom = (z) => (zoom = Math.max(3, Math.min(48, z)));

  let xf = 0;
  const nextXf = (d) => {
    const from = engine.mixer?.crossfader ?? xf;
    return (xf = Math.max(-1, Math.min(1, Math.round((from + d) * 10) / 10)));
  };

  // Focus regions, in F6 order. The library comes first because that's
  // where the keyboard spends most of its time.
  const REGIONS = ['tracks', 'sidebar', 'deck0', 'mixer', 'deck1', 'waves'];
  function cycleFocus(dir) {
    const here = /** @type {HTMLElement | null} */ (document.activeElement?.closest?.('[data-region]'))?.dataset.region;
    const i = REGIONS.indexOf(here);
    const next = REGIONS[(i + dir + REGIONS.length) % REGIONS.length] ?? REGIONS[0];
    const el = document.querySelector(`[data-region="${next}"]`);
    const target = el?.matches('[tabindex="0"]') ? el : el?.querySelector('button:not([aria-disabled="true"]), [tabindex="0"], input');
    /** @type {HTMLElement | null} */ (target)?.focus();
  }

  /** Runs a command from commands.js. `down` is false on key release, for hold commands. */
  function run(id, down) {
    const [, n] = id.split('.');
    const deck = Number(n);
    const loaded = (d) => !!tracks[d];
    switch (id) {
      case 'deck.0.cue':
      case 'deck.1.cue':
        if (loaded(deck)) control({ type: down ? 'cuePress' : 'cueRelease', deck });
        break;
      case 'deck.0.play':
      case 'deck.1.play':
        if (down && loaded(deck)) control({ type: 'togglePlay', deck });
        break;
      case 'deck.0.sync':
      case 'deck.1.sync':
        if (down && engine.decks[deck].synced) {
          control({ type: 'sync', deck });
          announce(`Deck ${'AB'[deck]} sync off`);
        } else if (down && loaded(deck) && engine.decks[deck].bpm && engine.decks[1 - deck].bpm) {
          control({ type: 'sync', deck });
          announce(`${deckName(deck, true)} synced`);
        }
        break;
      case 'deck.0.slower':
      case 'deck.1.slower':
      case 'deck.0.faster':
      case 'deck.1.faster':
        if (loaded(deck)) control({ type: 'setBend', deck, bend: down ? (id.endsWith('slower') ? -0.04 : 0.04) : 0 });
        break;
      case 'deck.0.pfl':
      case 'deck.1.pfl':
        if (down) mixer.togglePfl(deck);
        break;
      case 'deck.0.load':
      case 'deck.1.load':
        if (down) library.loadSelected(deck);
        break;
      case 'mixer.xfLeft':
      case 'mixer.xfRight':
        if (down) mixer.setCrossfader(nextXf(id === 'mixer.xfLeft' ? -0.1 : 0.1));
        break;
      case 'mixer.xfHardLeft':
      case 'mixer.xfHardRight':
        if (down) mixer.setCrossfader((xf = id === 'mixer.xfHardLeft' ? -1 : 1));
        break;
      case 'view.sampler':
        if (down) {
          setSamplerOpen(!sampler.open);
          samplerFromPads = false;
        }
        break;
      case 'view.zoomOut':
        if (down) setZoom(zoom * 1.4);
        break;
      case 'view.zoomIn':
        if (down) setZoom(zoom / 1.4);
        break;
      case 'library.search':
        if (down) library.focusSearch();
        break;
      case 'focus.next':
      case 'focus.prev':
        if (down) cycleFocus(id === 'focus.next' ? 1 : -1);
        break;
      case 'deck.0.where':
      case 'deck.1.where':
        if (down) readPosition(deck);
        break;
      case 'edit.undo':
        if (down) undo();
        break;
      case 'edit.redo':
        if (down) redo();
        break;
      case 'app.settings':
        if (down) openSettings();
        break;
      case 'view.uiZoomIn':
      case 'view.uiZoomOut':
        if (down) stepUiZoom(id === 'view.uiZoomIn' ? 1 : -1);
        break;
      case 'view.uiZoomReset':
        if (down) setUiZoom(1);
        break;
      case 'deck.0.gridEarlier':
      case 'deck.1.gridEarlier':
        if (down) gridEdit(deck, 'nudge', 'Moved the grid earlier', -NUDGE);
        break;
      case 'deck.0.gridLater':
      case 'deck.1.gridLater':
        if (down) gridEdit(deck, 'nudge', 'Moved the grid later', NUDGE);
        break;
      case 'deck.0.gridDownbeat':
      case 'deck.1.gridDownbeat':
        if (down) gridEdit(deck, 'downbeat', 'Moved the downbeat');
        break;
      default: {
        const stem = /^deck\.(\d)\.stem(Solo)?\.(\d)$/.exec(id);
        if (stem) {
          if (down) (stem[2] ? soloStem : toggleStem)(Number(stem[1]), Number(stem[3]));
          break;
        }
        runPerformance(id, down);
      }
    }
  }

  // ⌘ shortcuts that work even while typing. Undo and redo aren't among
  // them: in a text field they undo the typing.
  const ANYWHERE = new Set(['library.search', 'app.settings', 'view.uiZoomIn', 'view.uiZoomOut', 'view.uiZoomReset']);

  const REPEATS = new Set(['mixer.xfLeft', 'mixer.xfRight', 'view.zoomOut', 'view.zoomIn']);
  const held = new Map(); // key code -> command id, for hold commands

  function keydown(e) {
    if (keyboardMenu(e) || htmlMenu.open) return;
    const t = e.target;
    const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range') || t?.isContentEditable;
    const cmd = commandFor(e);
    // A few ⌘ shortcuts work everywhere; everything else gives way to
    // typing and to a focused control that already used the key (a
    // slider's arrows).
    if (cmd && ANYWHERE.has(cmd.id)) {
      e.preventDefault();
      run(cmd.id, true);
      return;
    }
    if (e.key === 'Escape' && !typing) {
      /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.();
      return;
    }
    if (typing || e.defaultPrevented || !cmd) return;
    e.preventDefault();
    if (e.repeat && !REPEATS.has(cmd.id)) return;
    if (cmd.hold) held.set(e.code, cmd.id);
    run(cmd.id, true);
  }
  function keyup(e) {
    const id = held.get(e.code);
    if (!id) return;
    held.delete(e.code);
    run(id, false);
  }
  // Releasing every held key if the window loses focus keeps a cue or
  // nudge from sticking on.
  function blur() {
    for (const id of held.values()) run(id, false);
    held.clear();
  }

  // The webview's own right-click menu (Reload, Inspect) never shows; text
  // fields keep theirs for copy and paste.
  function contextmenu(e) {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  }

  // The divider between the decks and the library. Its height is kept
  // between sessions.
  const LIB_KEY = 'oss-dj.libraryHeight';
  const LIB_DEFAULT = 360;
  const APP_MIN_H = 720; // matches .app's min-height
  let libHeight = $state(LIB_DEFAULT);
  let winHeight = $state(900);
  try {
    libHeight = Number(localStorage.getItem(LIB_KEY)) || LIB_DEFAULT;
  } catch {}
  // #7 (UI audit flag): edge-tall, and #21 panel-sizes: every row has one
  // designed size (taken from the 1440×900 layout); the library takes what's
  // left, so a tall window gives its extra height to the track list. A short
  // window gives way in order: the library down to 160px, then the
  // waveforms down to 96px, then the decks down to 340px. The decks move as
  // one block: the library's handle sizes the library (the waveforms give
  // way), the waveforms' handle sizes the waveforms (the library gives way),
  // and only ⌥-dragging either deck edge changes the decks. (The sampler is
  // a row inside the library now, so it takes nothing from these.)
  const PANEL = {
    waves: { def: 136, min: 96 }, // the row, with the 12px gap under the panel
    decks: { def: 360, min: 340, max: 400 },
    sidebar: { def: 200, min: 160, max: 320 },
  };
  const LIB_MIN = 160; // what a drag can take the library down to
  // What a short window keeps for the library before the waveforms and
  // decks give way (176px at 1024×760 with the sampler open was a strip of
  // four rows).
  const LIB_FIT = 240;
  const PANEL_KEY = 'oss-dj.panelSizes';
  const sized = $derived(flag('edge-tall') || flag('panel-sizes'));
  /** The sizes asked for; what each row gets (`rows`) also depends on the window. */
  const sizes = $state({ waves: PANEL.waves.def, decks: PANEL.decks.def, sidebar: PANEL.sidebar.def });
  // #21: the sizes are kept, in one key. The old library height is read once
  // to seed it (and left in place, so turning the flag off loses nothing).
  if (flag('panel-sizes')) {
    try {
      const kept = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null');
      if (kept) Object.assign(sizes, { waves: kept.waves ?? sizes.waves, decks: kept.decks ?? sizes.decks, sidebar: kept.sidebar ?? sizes.sidebar });
      else if (localStorage.getItem(LIB_KEY)) {
        const avail = Math.max(innerHeight, APP_MIN_H) - (macWindow ? TOP_STRIP : 12) - 24;
        sizes.waves = Math.max(PANEL.waves.min, avail - PANEL.decks.def - Number(localStorage.getItem(LIB_KEY)));
      }
    } catch {}
  }
  $effect(() => {
    const s = JSON.stringify(sizes);
    if (!flag('panel-sizes')) return;
    try {
      localStorage.setItem(PANEL_KEY, s);
    } catch {}
  });
  /** Height for the waveforms, decks and library rows together. */
  const avail = $derived(Math.max(winHeight, APP_MIN_H) - (macWindow ? TOP_STRIP : 12) - 12 - 12);
  /** What each row gets: the library first gives way to 240, then the waveforms to 96, then the decks to 340.
   *  (Waveforms dragged past their designed size are kept until the library is at 160.) */
  const rows = $derived.by(() => {
    let waves = Math.min(sizes.waves, Math.max(PANEL.waves.min, Math.round(winHeight / 2)));
    let decks = Math.max(PANEL.decks.min, Math.min(PANEL.decks.max, sizes.decks));
    let short = (sizes.waves > PANEL.waves.def ? LIB_MIN : LIB_FIT) - (avail - waves - decks);
    if (short > 0) {
      const w = Math.max(PANEL.waves.min, waves - short);
      short -= waves - w;
      waves = w;
      decks = Math.max(PANEL.decks.min, decks - short);
    }
    return { waves, decks, lib: Math.max(LIB_MIN, avail - waves - decks) };
  });
  /** The waveforms' largest size with the decks as they are: half the window, and the library keeps 160. */
  const wavesMax = $derived(Math.max(PANEL.waves.min, Math.min(Math.round(winHeight / 2), avail - rows.decks - LIB_MIN)));

  const libMax = $derived(sized ? Math.max(LIB_MIN, avail - rows.decks - PANEL.waves.min) : Math.max(160, Math.min(560, Math.max(winHeight, APP_MIN_H) - (macWindow ? TOP_STRIP : 12) - 12 - 136 - 12 - 12 - 300)));
  const lib = $derived(sized ? rows.lib : Math.max(160, Math.min(libMax, libHeight)));
  /** A snap: within `band` of `at`, it's `at`. */
  const snapTo = (v, at, band) => (Math.abs(v - at) <= band ? at : v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // The library's height as the waveforms' size, which gives way for it.
  const libSnap = $derived(avail - PANEL.waves.def - rows.decks);
  function setWaves(h) {
    sizes.waves = Math.round(clamp(snapTo(h, PANEL.waves.def, 6), PANEL.waves.min, wavesMax));
  }
  function setDecks(h) {
    sizes.decks = Math.round(clamp(snapTo(h, PANEL.decks.def, 16), PANEL.decks.min, PANEL.decks.max));
  }
  function setSidebar(w) {
    // #110 (UI audit flag): dir-room-tint: dragged well past its least, the sidebar closes; dragged back out, it opens.
    if (flag('dir-room-tint')) {
      hideSidebar(w < PANEL.sidebar.min - 48);
      if (side.hidden) return;
    }
    sizes.sidebar = Math.round(clamp(snapTo(w, PANEL.sidebar.def, 6), PANEL.sidebar.min, PANEL.sidebar.max));
  }
  function setLib(h) {
    if (sized) {
      // The waveforms give way; the gentle snap is where they're at 136.
      setWaves(avail - rows.decks - snapTo(h, libSnap, 6));
      return;
    }
    libHeight = Math.max(160, Math.min(libMax, h));
    try {
      localStorage.setItem(LIB_KEY, String(libHeight));
    } catch {}
  }
  // #21: a double-click resets a panel to its designed size, settling on
  // the site's snappy spring (none under reduced motion).
  let settling = $state(false);
  let settleTimer;
  function settle(fn) {
    settling = true;
    clearTimeout(settleTimer);
    requestAnimationFrame(() => {
      fn();
      settleTimer = setTimeout(() => (settling = false), 340);
    });
  }
  let split = $state(null);
  const splitDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // #21: ⌥-drag on a deck edge sizes the decks instead.
    split = { y: e.clientY, h: lib, decks: flag('panel-sizes') && e.altKey ? rows.decks : null };
  };
  const splitMove = (e) => {
    if (!split) return;
    if (split.decks != null) setDecks(split.decks + (e.clientY - split.y));
    else setLib(split.h - (e.clientY - split.y));
  };
  const splitKey = (e) => {
    const step = e.shiftKey ? 96 : 24;
    if (e.key === 'ArrowUp') setLib(lib + step);
    else if (e.key === 'ArrowDown') setLib(lib - step);
    else if (e.key === 'Home') setLib(160);
    else if (e.key === 'End') setLib(libMax);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const splitReset = () => (sized ? settle(() => (flag('panel-sizes') ? setWaves(PANEL.waves.def) : (sizes.waves = PANEL.waves.def))) : setLib(LIB_DEFAULT));

  // #21 (UI audit flag): panel-sizes: the other handles. Each drags its
  // panel with the pointer (no easing), takes the same keys as the library's
  // (arrows ±24, ⇧ ±96, Home and End for min and max) and resets on a
  // double-click.
  /** @type {{ which: string, at: number, from: number } | null} */
  let grab = $state(null);
  const GRIPS = {
    waves: { get: () => rows.waves, set: setWaves, min: () => PANEL.waves.min, max: () => wavesMax, def: PANEL.waves.def, axis: 'y', dir: 1 },
    decks: { get: () => rows.decks, set: setDecks, min: () => PANEL.decks.min, max: () => PANEL.decks.max, def: PANEL.decks.def, axis: 'y', dir: -1 },
    sidebar: { get: () => (sideShut() ? 0 : sizes.sidebar), set: setSidebar, min: () => PANEL.sidebar.min, max: () => PANEL.sidebar.max, def: PANEL.sidebar.def, axis: 'x', dir: 1 },
  };
  function gripDown(e, which) {
    e.currentTarget.setPointerCapture(e.pointerId);
    // ⌥ on the waveforms' edge (the decks' top edge) sizes the decks.
    const w = which === 'waves' && e.altKey ? 'decks' : which;
    grab = { which: w, at: GRIPS[w].axis === 'x' ? e.clientX : e.clientY, from: GRIPS[w].get() };
  }
  function gripMove(e) {
    if (!grab) return;
    const g = GRIPS[grab.which];
    const k = Number(document.documentElement.style.zoom) || 1;
    const d = ((g.axis === 'x' ? e.clientX : e.clientY) - grab.at) / k;
    g.set(grab.from + g.dir * d);
  }
  function gripKey(e, which) {
    const g = GRIPS[which];
    const step = (e.shiftKey ? 96 : 24) * g.dir;
    const more = g.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const less = g.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    if (e.key === more) g.set(g.get() + step);
    else if (e.key === less) g.set(g.get() - step);
    else if (e.key === 'Home') g.set(g.min());
    else if (e.key === 'End') g.set(g.max());
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  const gripReset = (which) => settle(() => GRIPS[which].set(GRIPS[which].def));

  /** Undo / redo in a focused text field, for the menu's ⌘Z. True if it was one. */
  function undoInField(again) {
    const t = document.activeElement;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return false;
    document.execCommand(again ? 'redo' : 'undo');
    return true;
  }

  // The macOS menu bar shows each command's current shortcut, so it's
  // rebuilt whenever the user changes one.
  $effect(() => {
    JSON.stringify(keymap.overrides);
    installAppMenu((id) => run(id, true), {
      addFolder: () => library.addFolder(),
      importLibrary: openImport,
      keyboard: () => openSettings('keyboard'),
      report: openReport,
      controllerSetup: openControllerSetup,
      checkUpdates: checkUpdatesNow,
      undoInField,
    }).catch((e) => console.error('menu', e));
  });

  // #13 (UI audit flag): declutter-toast: "In the toolbar" docks the toast in
  // the library's toolbar, between the search field and Sampler (over the
  // track count), never over the rows; a message longer than the gap is cut
  // short with an ellipsis (Undo stays whole). Only with no room at all
  // (under 160px) does it fall back to the corner.
  let toastEl = $state(/** @type {HTMLElement | null} */ (null));
  let toastDock = $state(/** @type {{ left: number, top: number, max: number, at?: string } | null} */ (null));
  // Panels can be resized while a toast shows, and the rows ease to a new
  // size (340ms), so the dock is measured again whenever the toolbar or a
  // panel round it changes size, not only when a toast arrives.
  let dockTurn = $state(0);
  $effect(() => {
    if (!toastEl || !flag('declutter-toast')) return;
    const ro = new ResizeObserver(() => dockTurn++);
    for (const sel of ['.app > .waves', '.app > .decks', 'section.library', 'section.library .bar', 'section.library .bar .filter', 'section.library .bar .chip', 'section.library .bar .shell', '.settings .main .bar']) {
      const n = document.querySelector(sel);
      if (n) ro.observe(n);
    }
    return () => ro.disconnect();
  });
  $effect(() => {
    void toast.id;
    void winHeight;
    void dockTurn;
    const el = toastEl;
    if (!el || !flag('declutter-toast') || setting('declutter-toast', 'place') !== 'toolbar') {
      toastDock = null;
      return;
    }
    const k = Number(document.documentElement.style.zoom) || 1;
    // #37 (UI audit flag): settings-undo: with Settings over the library, the toast sits in its header, left of Done.
    if (settings !== null) {
      const done = document.querySelector('.settings .main .bar > .btn:last-child')?.getBoundingClientRect();
      // The end of the words before Done (the page's instruction line stretches to Done; its text doesn't).
      const before = document.querySelector('.settings .main .bar > .btn:last-child')?.previousElementSibling;
      const text = before && document.createRange();
      text?.selectNodeContents(before);
      const prev = text?.getBoundingClientRect();
      if (!flag('settings-undo') || !done || !prev) return void (toastDock = null);
      const room = (done.left - prev.right) / k - 24;
      // Its right edge 8px before Done, on Done's centre line (placed from its right: data-docked="settings").
      toastDock = room >= 160 ? { left: done.left / k - 8, top: (done.top + done.height / 2) / k, max: room, at: 'settings' } : null;
      return;
    }
    // Since upstream's Fits and Filter sit after the search field, the gap starts after them.
    const from = (document.querySelector('section.library .bar .filter') ?? document.querySelector('section.library .bar .search'))?.getBoundingClientRect();
    const samp = document.querySelector('section.library .bar .samp')?.getBoundingClientRect();
    if (!from || !samp) return void (toastDock = null);
    const gap = (/** @type {DOMRect} */ to) => (to.left - from.right) / k - 24;
    let room = gap(samp);
    let at = 'toolbar';
    // #112 (UI audit flag): shell-status: its items stand before Sampler. The toast stops at them when all its words fit there, covers them for its few seconds when they fit up to Sampler, and goes to the corner (where it's never cut) when they don't.
    const items = flag('shell-status') ? document.querySelector('section.library .bar > .shell')?.getBoundingClientRect() : null;
    if (items) {
      const words = el.querySelector(':scope > span');
      const whole = el.offsetWidth + (words ? words.scrollWidth - words.clientWidth : 0);
      if (whole <= gap(items)) room = gap(items);
      else if (whole <= room) at = 'over';
      else room = 0;
    }
    toastDock = room >= 160 ? { left: from.right / k + 12, top: (from.top + from.height / 2) / k, max: room, at } : null;
  });

  // #12 (UI audit flag): polish-dialog: where the library starts, so a dialog's
  // scrim blurs the library but leaves the decks clear.
  $effect(() => {
    const root = document.documentElement;
    if (!flag('polish-dialog') || !(importing || reporting)) return void root.style.removeProperty('--flag-polish-dialog-lib');
    void winHeight;
    const top = document.querySelector('.app > .below')?.getBoundingClientRect().top;
    if (top != null) root.style.setProperty('--flag-polish-dialog-lib', `${top / (Number(root.style.zoom) || 1)}px`);
  });

  // #24 (UI audit flag): focus-after-keys: html[data-input='keys'] while the
  // keyboard is moving focus (Tab, arrows, Home/End, Page keys, F6), cleared
  // by any pointer press, so focus rings show only after navigating by key.
  // A shortcut like W (play) doesn't count: it acts, it doesn't move focus.
  $effect(() => {
    if (!flag('focus-after-keys')) return;
    const root = document.documentElement;
    const NAV = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F6']);
    const keys = (e) => NAV.has(e.key) && (root.dataset.input = 'keys');
    const pointer = () => delete root.dataset.input;
    addEventListener('keydown', keys, true);
    addEventListener('pointerdown', pointer, true);
    return () => {
      removeEventListener('keydown', keys, true);
      removeEventListener('pointerdown', pointer, true);
      delete root.dataset.input;
    };
  });

  /** True while the sampler is showing because of the controller's SAMPLER button. */
  let samplerFromPads = false;

  // #1 (UI audit flag): squircle corners: native corner-shape, or a clip with the ring redrawn in WebKit.
  $effect(() => (flag('squircles') ? startSquircles() : undefined));

  onMount(() => {
    Object.assign(shellOpen, { settings: openSettings, setup: openControllerSetup }); // #112 (UI audit flag): shell-status
    captureUiErrors();
    libraryHealth().then((h) => (health = h)).catch(() => {});
    const updateTimer = setTimeout(() => checkForUpdate(), 8000);
    startEngineLoop();
    syncDeckSettings();
    // The controller's browse knob and load buttons drive the library.
    const off = backend.onController?.((e) => {
      if (e.type === 'browse') library.browse(e.delta);
      else if (e.type === 'load') library.loadSelected(e.deck);
      else if (e.type === 'stemsUnavailable') say(stemsUnavailable(e.deck));
      else if (e.type === 'tempoPickup') tempoPickup[e.deck] = e.rate ?? null;
      else if (e.type === 'padMode') {
        const was = padMode[e.deck].mode;
        setPadMode(e.deck, e.mode);
        // SAMPLER shows the sampler, and pressed again hides it. Leaving
        // sampler mode on both decks hides it too, if SAMPLER showed it.
        if (e.mode === 'sampler') {
          const open = was !== 'sampler' || !sampler.open;
          if (open !== sampler.open) setSamplerOpen(open);
          samplerFromPads = open;
        } else if (samplerFromPads && !padMode.some((p) => p.mode === 'sampler')) {
          if (sampler.open) setSamplerOpen(false);
          samplerFromPads = false;
        }
      }
      else if (e.type === 'loadSample') {
        // SHIFT + an empty sampler pad: the selected track goes in that slot.
        const t = library.selectedTrack();
        if (!t) return;
        setSamplerOpen(true);
        loadSample(e.slot, t).catch((err) => say(`Couldn't use ${t.title} as a sample: ${err}`));
      }
    });
    restoreSampler();
    return () => {
      clearTimeout(updateTimer);
      off?.then((f) => f());
    };
  });
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={blur} oncontextmenu={contextmenu} />

<!-- #7 / #21 (UI audit flags): edge-tall, panel-sizes: the rows' sizes (--waves, --decks) and the sidebar's, while either is on. -->
<div class="app" class:mac-window={macWindow} class:settling style:--top="{macWindow ? TOP_STRIP : 12}px" style:--lib="{lib}px"
  style:--waves={sized ? `${rows.waves}px` : undefined} style:--decks={sized ? `${rows.decks}px` : undefined}
  style:--library-sidebar={flag('panel-sizes') ? `${sideShut() ? 0 : sizes.sidebar}px` : undefined} style:--side-w={flag('dir-room-tint') ? `${sizes.sidebar}px` : undefined} bind:clientHeight={winHeight}>
  <Backdrop a="var(--deck-a)" b="var(--deck-b)" tint={0.25} />
  {#if macWindow}
    <!-- The window buttons' strip: drag it to move the window, double-click
         to zoom it. -->
    <div class="drag" data-tauri-drag-region aria-hidden="true"></div>
  {/if}
  {#if flag('shell-status') && setting('shell-status', 'place') !== 'library'}<Status bar />{/if}<!-- #112 (UI audit flag): shell-status -->
  <div class="waves glass" data-region="waves" role="group" aria-label="Waveforms">
    {#each [0, 1] as deck}
      <div class="lane" style:--drop-color={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} class:b={deck === 1}
        use:dropTarget={{ ondrop: (t) => load(deck, t), blocked: () => engine.decks[deck].playing }}>
        <Waveform {deck} seconds={zoom} onzoom={(f) => setZoom(zoom * f)} />
        <div class="who"><i></i>{#if tracks[deck]}{tracks[deck].title}{:else}<span class="hint">Drag a track here or press {keyLabel(`deck.${deck}.load`)}</span>{/if}</div>
      </div>
    {/each}
    <div class="zoom">
      <button onclick={() => setZoom(zoom * 1.4)} aria-label="Zoom out" use:tip={() => tipText('Zoom out', keyLabel('view.zoomOut'))}>−</button>
      <span class="num"><span class="sr">Waveforms show </span>{zoom.toFixed(0)} s</span>
      <button onclick={() => setZoom(zoom / 1.4)} aria-label="Zoom in" use:tip={() => tipText('Zoom in', keyLabel('view.zoomIn'))}>+</button>
    </div>
  </div>

  <div class="decks">
    <Deck deck={0} onload={load} onreveal={(p) => library.reveal(p)} onsettings={openSettings} />
    <Mixer bind:this={mixer} onmessage={say} />
    <Deck deck={1} onload={load} onreveal={(p) => library.reveal(p)} onsettings={openSettings} />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator is the ARIA window-splitter pattern) -->
  <div class="split" class:dragging={split} role="separator" aria-orientation="horizontal" aria-label="Resize library"
    aria-valuenow={Math.round(lib)} aria-valuemin={160} aria-valuemax={Math.round(libMax)} tabindex="0"
    onpointerdown={splitDown} onpointermove={splitMove} onpointerup={() => (split = null)} onpointercancel={() => (split = null)}
    ondblclick={splitReset} onkeydown={splitKey}
    use:tip={() => (flag('panel-sizes') ? 'Drag to resize the library, ⌥-drag for the decks, double-click to reset' : 'Drag to resize the library, double-click to reset')}><i></i></div>

  {#if flag('panel-sizes')}
    <!-- #21 (UI audit flag): panel-sizes: the waveforms' bottom edge gets the library's handle. Placed absolutely, out of the grid. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator is the ARIA window-splitter pattern) -->
    <div class="grip" class:dragging={grab?.which === 'waves' || grab?.which === 'decks'} style:top="calc(var(--top) + {rows.waves - 12}px)" role="separator" aria-orientation="horizontal" aria-label="Resize waveforms"
      aria-valuenow={rows.waves} aria-valuemin={PANEL.waves.min} aria-valuemax={wavesMax} tabindex="0"
      onpointerdown={(e) => gripDown(e, 'waves')} onpointermove={gripMove} onpointerup={() => (grab = null)} onpointercancel={() => (grab = null)}
      ondblclick={() => gripReset('waves')} onkeydown={(e) => gripKey(e, 'waves')}
      use:tip={() => 'Drag to resize the waveforms, ⌥-drag for the decks, double-click to reset'}><i></i></div>
  {/if}

  <div class="below">
    {#if flag('panel-sizes')}
      <!-- #21 (UI audit flag): panel-sizes: the sidebar's edge, over the library's divider. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div class="grip side" class:dragging={grab?.which === 'sidebar'} role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
        aria-valuenow={sizes.sidebar} aria-valuemin={PANEL.sidebar.min} aria-valuemax={PANEL.sidebar.max} tabindex="0"
        onmousedown={(e) => e.preventDefault() /* #110: a row that comes under the pointer mid-drag mustn't start a drag of its own */}
        onpointerdown={(e) => gripDown(e, 'sidebar')} onpointermove={gripMove} onpointerup={() => (grab = null)} onpointercancel={() => (grab = null)}
        ondblclick={() => gripReset('sidebar')} onkeydown={(e) => gripKey(e, 'sidebar')}
        use:tip={() => 'Drag to resize the sidebar, double-click to reset'}><i></i></div>
    {/if}
    <div class="libwrap">
      <Library bind:this={library} onload={load} onsettings={() => openSettings()} onmessage={say}
        onimport={openImport} onempty={() => { if (once('importOffer')) openImport(); }} />
    </div>
  </div>

  {#if engine.audio?.state === 'lost'}
    <!-- #23 (UI audit flag): banner-warning: the lost device is a warning (amber), with one clear way out (tonal, so it doesn't outshout the warning). -->
    <div class="banner" class:lost={flag('banner-warning')} role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" /><path d="M8 6.2v3.6M8 11.6v.4" /></svg>
      {#if flag('banner-warning')}
        <span><b>{engine.audio.device} disconnected.</b> Decks paused. They carry on when it's back.</span>
      {:else}
        <span><b>{engine.audio.device} disconnected.</b> Decks are held where they stopped and carry on when it's back.</span>
      {/if}
      {#if engine.audio.fallback && engine.audio.fallback !== engine.audio.device}
        <button class="btn sm" class:primary={flag('banner-warning')} onclick={() => backend.useDefaultOutput?.()}>{flag('banner-warning') ? 'Use' : 'Play through'} {engine.audio.fallback}</button>
      {/if}
    </div>
  {:else if healthText}
    <div class="banner" role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" /><path d="M8 6.2v3.6M8 11.6v.4" /></svg>
      <span><b>{healthText.title}</b> {healthText.body}</span>
      {#if healthText.file}<button class="btn sm ghost" onclick={() => reveal(healthText.file)}>Show file</button>{/if}
      <button class="btn sm" onclick={() => (health = null)}>OK</button>
    </div>
  {:else if update.available && !updateDismissed}
    <div class="banner" role="status">
      {#if update.state === 'downloading'}
        <span><b>Updating to {update.available.version}…</b> {Math.round(update.progress * 100)}%. The app restarts when it's done.</span>
      {:else}
        <span><b>Interlude {update.available.version} is ready.</b> {update.state === 'failed' ? "The last try didn't work." : 'Install it between sets; the app restarts.'}</span>
        <button class="btn sm ghost" onclick={() => (updateDismissed = true)}>Later</button>
        <button class="btn sm" onclick={install}>{update.state === 'failed' ? 'Try again' : 'Install and restart'}</button>
      {/if}
    </div>
  {/if}

  <div class="toastbox" role="status">
    {#if toast.text}
      <!-- #13 (UI audit flag): declutter-toast: hovering holds the toast; docked in the toolbar when chosen. -->
      <!-- svelte-ignore a11y_no_static_element_interactions (hover only pauses its timer; the toast is announced by its role="status" box) -->
      <div class="toast" bind:this={toastEl} data-docked={toastDock ? toastDock.at : undefined} style:left={toastDock ? `${toastDock.left}px` : undefined} style:top={toastDock ? `${toastDock.top}px` : undefined} style:max-width={toastDock ? `${toastDock.max}px` : undefined}
        onpointerenter={() => flag('declutter-toast') && holdToast()} onpointerleave={() => flag('declutter-toast') && releaseToast()}>
        <span>{toast.text}</span>
        {#if toast.undo}
          <!-- #118 (UI audit flag): toast-cut: a cut that holds its keys. -->
          {#if flag('toast-cut') && flag('dir-room-tint')}
          <button class="undo cut" onclick={() => { hideToast(); undo(); }}><span>Undo{#if keyLabel('edit.undo')}<span class="sr"> {keyLabel('edit.undo')}</span>{/if}</span>{#if keyLabel('edit.undo')}<Keys label={keyLabel('edit.undo')} />{/if}</button>
          {:else}
          <button class="undo" onclick={() => { hideToast(); undo(); }}>Undo <kbd>{keyLabel('edit.undo')}</kbd></button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
  <div class="sr" aria-live="polite">{live.text}</div>
</div>

<Tooltip />
<ContextMenu />

{#if settings}<Settings bind:page={settings} onclose={() => (settings = null)} onimport={() => { settings = null; openImport(); }}
  onreport={openReport} onupdates={checkUpdatesNow} onsetup={openControllerSetup} />{/if}
{#if importing}<Import onclose={() => (importing = false)} ondone={() => library.reload()} />{/if}
{#if reporting}<Report onclose={() => (reporting = false)} context={reportContext} />{/if}
{#if settingUp}<ControllerSetup onclose={() => (settingUp = false)} />{/if}

<style>
  .app {
    position: relative;
    height: 100%;
    box-sizing: border-box;
    /* Below this the app scrolls rather than clipping, so the interface
       can be zoomed to 200% on a laptop screen. */
    min-width: 960px;
    min-height: 720px;
    display: grid;
    grid-template-rows: 136px minmax(300px, 1fr) var(--gap) var(--lib);
    padding: var(--top) var(--gap) var(--gap);
    background: var(--bg);
  }
  .app > :global(:not(.bd)) {
    position: relative;
  }
  .app > .drag {
    position: absolute;
    z-index: 5;
  }
  .drag {
    left: 0;
    right: 0;
    top: 0;
    height: var(--top);
  }
  .below {
    position: relative;
    display: grid;
    min-height: 0;
  }
  .libwrap {
    display: grid;
    min-height: 0;
  }
  .banner {
    position: absolute;
    left: 50%;
    top: 10px;
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100% - 32px);
    padding: 8px 8px 8px 14px;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--fg-3), 0 12px 32px rgb(0 0 0 / 0.45);
    color: var(--fg-2);
  }
  .banner b {
    color: var(--fg);
    font-weight: 500;
  }
  .banner svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--fg);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .banner .btn {
    flex: none;
  }
  .waves {
    position: relative;
    display: grid;
    grid-template-rows: 1fr 1fr;
    min-height: 0;
    margin-bottom: var(--gap);
    overflow: hidden;
  }
  .lane {
    position: relative;
    min-height: 0;
  }
  .lane + .lane {
    border-top: 1px solid var(--line);
  }
  .lane :global(.wave) {
    height: 100%;
  }
  .who {
    position: absolute;
    left: var(--pad);
    top: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-xs);
    color: var(--fg-2);
    pointer-events: none;
  }
  .who .hint {
    color: var(--fg-3);
  }
  .who i {
    width: 3px;
    height: 12px;
    border-radius: 2px;
    background: var(--deck-a);
  }
  .b .who i {
    background: var(--deck-b);
  }
  .zoom {
    position: absolute;
    right: 8px;
    top: 8px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--h-sm);
    padding: 0 4px;
    border-radius: 6px;
    background: rgb(11 11 13 / 0.8);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--fg-2);
    font-size: var(--t-xs);
  }
  .zoom button {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--fg-2);
    font: 400 var(--t-sm) var(--font);
  }
  .zoom button:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .zoom span {
    min-width: 28px;
    text-align: center;
  }
  /* Deck, mixer, deck: three glass panels 12px apart. */
  .decks {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px minmax(0, 1fr);
    gap: var(--gap);
    min-height: 0;
  }
  .decks > :global(*) {
    border-radius: var(--r-panel);
    background: var(--glass-fill);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-edge);
  }
  /* The gap between the decks and the library is also its resize handle. */
  .split {
    display: grid;
    place-items: center;
    cursor: row-resize;
    touch-action: none;
  }
  .split i {
    width: 36px;
    height: 3px;
    border-radius: 2px;
    background: transparent;
    transition: background-color 140ms ease;
  }
  .split:hover i,
  .split.dragging i,
  .split:focus-visible i {
    background: var(--fg-3);
  }
  .split:focus-visible {
    outline: none;
  }
  /* #21 (UI audit flag): panel-sizes: the other handles, drawn like the
     library's; out of the grid, over the gaps they resize. */
  .app > .grip {
    position: absolute;
    left: var(--gap);
    right: var(--gap);
    z-index: 6;
    height: var(--gap);
    display: grid;
    place-items: center;
    cursor: row-resize;
    touch-action: none;
  }
  .grip i {
    width: 36px;
    height: 3px;
    border-radius: 2px;
    background: var(--fg-4);
    transition: background-color 140ms ease;
  }
  .grip:hover i,
  .grip.dragging i,
  .grip:focus-visible i {
    background: var(--fg-3);
  }
  .grip:focus-visible {
    outline: none;
  }
  /* The sidebar's edge: no pill (beside a scrolling list it read as a
     scrollbar), just an 8px strip centred on the 1px divider; on hover,
     drag or focus the divider itself lights from top to bottom. */
  .below > .grip.side {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--library-sidebar) - 4px);
    z-index: 6;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }
  .grip.side i {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 1px;
    height: auto;
    border-radius: 0;
    background: transparent;
  }
  .grip.side:hover i,
  .grip.side.dragging i,
  .grip.side:focus-visible i {
    background: var(--fg-3);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 6px 6px 14px;
    min-height: 36px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
  }
  .toast:not(:has(.undo)) {
    padding-right: 14px;
  }
  .undo {
    height: 26px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font: 500 13px var(--font);
  }
  .undo:hover {
    box-shadow: inset 0 0 0 1px var(--fg-3);
  }
  .undo kbd {
    font: 400 11px var(--font);
    color: var(--fg-3);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
