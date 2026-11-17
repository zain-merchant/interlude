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
  import { toast, showToast, hideToast, pushEdit, undo, redo } from './lib/undo.svelte.js';
  import { stepUiZoom, setUiZoom } from './lib/uizoom.svelte.js';
  import { installAppMenu } from './lib/appmenu.js';
  import { runPerformance } from './lib/performance.js';
  import { padMode, setPadMode } from './lib/padmode.svelte.js';
  import { tempoPickup } from './lib/pickup.svelte.js';
  import { gridEdit, NUDGE } from './lib/grid.svelte.js';
  import { toggleStem, soloStem, syncStemWaveforms, stemsUnavailable } from './lib/stems.svelte.js';
  import { libraryHealth, reveal, captureUiErrors, update, checkForUpdate, installUpdate } from './lib/support.svelte.js';

  let library;
  let mixer;
  // On the Mac the window has no title bar: the close, minimize and zoom
  // buttons sit on a plain strip of their own above the panels
  // (tauri.conf.json centres them in it), and the strip drags the window.
  const macWindow = inTauri && mac;
  const TOP_STRIP = 32; // the strip's height, in place of the usual 12px top padding
  let zoom = $state(12);
  const say = (msg) => showToast(msg);

  const playingMsg = (deck) => `Deck ${'AB'[deck]} is playing. Pause it first.`;

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
    showToast(`Deck ${'AB'[deck]} is playing. Load again within 3 seconds to replace it.`, { ms: REPLACE_MS });
    announce(`Deck ${'AB'[deck]} is playing. Load again within 3 seconds to replace it.`);
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
      announce(`Loaded ${track.title} on deck ${'AB'[deck]}`);
    } catch (e) {
      say(`Couldn't load ${track.title}: ${e}`);
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
      label: `Loaded ${track.title} on deck ${'AB'[deck]}`,
      undo: async () => {
        const now = await swap(before)();
        if (now === false) return false;
        after = now;
      },
      redo: async () => (await swap(after)()) === false ? false : undefined,
    });
  }

  // Settings open over the library, leaving the decks in reach.
  let settings = $state(null); // null, 'keyboard', 'decks', 'audio', 'display', 'library', 'stems' or 'controllers'

  // Muted stems drop out of the waveforms.
  $effect(() => syncStemWaveforms());
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
    const n = 'AB'[deck];
    const t = tracks[deck];
    if (!t) return announce(`Deck ${n} is empty`);
    const d = engine.decks[deck];
    const spoken = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s - m * 60);
      return `${m} minute${m === 1 ? '' : 's'} ${sec} second${sec === 1 ? '' : 's'}`;
    };
    const parts = [`Deck ${n}`, `${spoken(d.position)} of ${spoken(d.duration)}`];
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
      announce(`${a.device} disconnected. Decks are held where they stopped.`);
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
        if (down && loaded(deck) && engine.decks[deck].bpm && engine.decks[1 - deck].bpm) {
          control({ type: 'sync', deck });
          announce(`Deck ${'AB'[deck]} synced`);
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
  const libMax = $derived(Math.max(160, Math.min(560, Math.max(winHeight, APP_MIN_H) - (macWindow ? TOP_STRIP : 12) - 12 - 136 - 12 - 12 - 300)));
  const lib = $derived(Math.max(160, Math.min(libMax, libHeight)));
  function setLib(h) {
    libHeight = Math.max(160, Math.min(libMax, h));
    try {
      localStorage.setItem(LIB_KEY, String(libHeight));
    } catch {}
  }
  let split = $state(null);
  const splitDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    split = { y: e.clientY, h: lib };
  };
  const splitMove = (e) => split && setLib(split.h - (e.clientY - split.y));
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
      checkUpdates: checkUpdatesNow,
      undoInField,
    }).catch((e) => console.error('menu', e));
  });

  /** True while the sampler is showing because of the controller's SAMPLER button. */
  let samplerFromPads = false;

  onMount(() => {
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

<div class="app" class:mac-window={macWindow} style:--top="{macWindow ? TOP_STRIP : 12}px" style:--lib="{lib}px"  bind:clientHeight={winHeight}>
  <Backdrop a="var(--deck-a)" b="var(--deck-b)" tint={0.25} />
  {#if macWindow}
    <!-- The window buttons' strip: drag it to move the window, double-click
         to zoom it. -->
    <div class="drag" data-tauri-drag-region aria-hidden="true"></div>
  {/if}
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
  <div class="split" class:drag={split} role="separator" aria-orientation="horizontal" aria-label="Resize library"
    aria-valuenow={Math.round(lib)} aria-valuemin={160} aria-valuemax={Math.round(libMax)} tabindex="0"
    onpointerdown={splitDown} onpointermove={splitMove} onpointerup={() => (split = null)} onpointercancel={() => (split = null)}
    ondblclick={() => setLib(LIB_DEFAULT)} onkeydown={splitKey}
    use:tip={() => 'Drag to resize the library, double-click to reset'}><i></i></div>

  <div class="below">
    <div class="libwrap" inert={settings !== null}>
      <Library bind:this={library} onload={load} onsettings={() => openSettings()} onmessage={say} />
    </div>
    {#if settings}<Settings bind:page={settings} onclose={() => (settings = null)} onimport={() => { settings = null; openImport(); }}
      onreport={openReport} onupdates={checkUpdatesNow} />{/if}
  </div>

  {#if engine.audio?.state === 'lost'}
    <div class="banner" role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" /><path d="M8 6.2v3.6M8 11.6v.4" /></svg>
      <span><b>{engine.audio.device} disconnected.</b> Decks are held where they stopped and carry on when it's back.</span>
      {#if engine.audio.fallback && engine.audio.fallback !== engine.audio.device}
        <button class="btn sm" onclick={() => backend.useDefaultOutput?.()}>Play through {engine.audio.fallback}</button>
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
      <div class="toast">
        <span>{toast.text}</span>
        {#if toast.undo}
          <button class="undo" onclick={() => { hideToast(); undo(); }}>Undo <kbd>{keyLabel('edit.undo')}</kbd></button>
        {/if}
      </div>
    {/if}
  </div>
  <div class="sr" aria-live="polite">{live.text}</div>
</div>

<Tooltip />
<ContextMenu />

{#if importing}<Import onclose={() => (importing = false)} ondone={() => library.reload()} />{/if}
{#if reporting}<Report onclose={() => (reporting = false)} context={reportContext} />{/if}

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
  /* Settings open over the library; its glass would show the list through. */
  .libwrap[inert] {
    visibility: hidden;
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
  .split.drag i,
  .split:focus-visible i {
    background: var(--fg-3);
  }
  .split:focus-visible {
    outline: none;
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
