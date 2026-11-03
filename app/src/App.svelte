<script>
  import { onMount } from 'svelte';
  import Deck from './lib/Deck.svelte';
  import Mixer from './lib/Mixer.svelte';
  import Library from './lib/Library.svelte';
  import Waveform from './lib/Waveform.svelte';
  import Tooltip from './lib/Tooltip.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import { engine, tracks, startEngineLoop, loadTrack, control } from './lib/engine.svelte.js';
  import { backend } from './lib/backend.js';
  import { dropTarget } from './lib/dnd.svelte.js';
  import { commandFor, keyLabel } from './lib/commands.js';
  import { keyboardMenu, htmlMenu } from './lib/menu.svelte.js';
  import { tip, tipText } from './lib/tooltip.svelte.js';
  import { live, announce } from './lib/announce.svelte.js';
  import { runPerformance } from './lib/performance.js';

  let library;
  let mixer;
  let zoom = $state(12);
  let toast = $state('');
  let toastTimer;

  function say(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2600);
  }

  async function load(deck, track) {
    // Never swap the track under a playing deck in the middle of a set.
    if (engine.decks[deck].playing) {
      say(`Deck ${'AB'[deck]} is playing. Pause it first.`);
      return;
    }
    try {
      await loadTrack(deck, track);
      announce(`Loaded ${track.title} on deck ${'AB'[deck]}`);
    } catch (e) {
      say(`Couldn't load ${track.title}: ${e}`);
    }
  }

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
      default:
        runPerformance(id, down);
    }
  }

  const REPEATS = new Set(['mixer.xfLeft', 'mixer.xfRight', 'view.zoomOut', 'view.zoomIn']);
  const held = new Map(); // key code -> command id, for hold commands

  function keydown(e) {
    if (keyboardMenu(e) || htmlMenu.open) return;
    const t = e.target;
    const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range') || t?.isContentEditable;
    const cmd = commandFor(e);
    // ⌘F works everywhere; everything else gives way to typing and to a
    // focused control that already used the key (a slider's arrows).
    if (cmd?.id === 'library.search') {
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
  const LIB_DEFAULT = 440;
  let libHeight = $state(LIB_DEFAULT);
  let winHeight = $state(900);
  try {
    libHeight = Number(localStorage.getItem(LIB_KEY)) || LIB_DEFAULT;
  } catch {}
  const libMax = $derived(Math.max(160, Math.min(560, winHeight - 150 - 9 - 260)));
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

  onMount(() => {
    startEngineLoop();
    // The controller's browse knob and load buttons drive the library.
    const off = backend.onController?.((e) => {
      if (e.type === 'browse') library.browse(e.delta);
      else if (e.type === 'load') library.loadSelected(e.deck);
    });
    return () => off?.then((f) => f());
  });
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={blur} oncontextmenu={contextmenu} bind:innerHeight={winHeight} />

<div class="app" style:--lib="{lib}px">
  <div class="waves" data-region="waves">
    {#each [0, 1] as deck}
      <div class="lane" style:--drop-color={deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)'} class:b={deck === 1}
        use:dropTarget={{ ondrop: (t) => load(deck, t), blocked: () => engine.decks[deck].playing }}>
        <Waveform {deck} seconds={zoom} onzoom={(f) => setZoom(zoom * f)} />
        <div class="who"><b>{'AB'[deck]}</b>{tracks[deck]?.title ?? ''}</div>
      </div>
    {/each}
    <div class="zoom">
      <button onclick={() => setZoom(zoom * 1.4)} aria-label="Zoom out" use:tip={() => tipText('Zoom out', keyLabel('view.zoomOut'))}>−</button>
      <span class="num" aria-label="Waveform window">{zoom.toFixed(0)} s</span>
      <button onclick={() => setZoom(zoom / 1.4)} aria-label="Zoom in" use:tip={() => tipText('Zoom in', keyLabel('view.zoomIn'))}>+</button>
    </div>
  </div>

  <div class="decks">
    <Deck deck={0} onload={load} onreveal={(p) => library.reveal(p)} />
    <Mixer bind:this={mixer} />
    <Deck deck={1} onload={load} onreveal={(p) => library.reveal(p)} />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator is the ARIA window-splitter pattern) -->
  <div class="split" class:drag={split} role="separator" aria-orientation="horizontal" aria-label="Resize library"
    aria-valuenow={Math.round(lib)} aria-valuemin={160} aria-valuemax={Math.round(libMax)} tabindex="0"
    onpointerdown={splitDown} onpointermove={splitMove} onpointerup={() => (split = null)} onpointercancel={() => (split = null)}
    ondblclick={() => setLib(LIB_DEFAULT)} onkeydown={splitKey}
    use:tip={() => 'Drag to resize the library, double-click to reset'}><i></i></div>

  <Library bind:this={library} onload={load} />

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
  <div class="sr" aria-live="polite">{live.text}</div>
</div>

<Tooltip />
<ContextMenu />

<style>
  .app {
    height: 100%;
    display: grid;
    grid-template-rows: 150px minmax(260px, 1fr) 9px var(--lib);
  }
  .waves {
    position: relative;
    display: grid;
    grid-template-rows: 1fr 1fr;
    min-height: 0;
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
  .lane::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    z-index: 2;
    background: var(--deck-a);
  }
  .lane.b::before {
    background: var(--deck-b);
  }
  .who {
    position: absolute;
    left: 20px;
    top: 9px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--fg-3);
    pointer-events: none;
  }
  .who b {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: var(--deck-a);
    color: var(--ink);
    font-size: 10px;
    font-weight: 600;
  }
  .b .who b {
    background: var(--deck-b);
  }
  .zoom {
    position: absolute;
    right: 12px;
    top: 8px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    color: var(--fg-2);
    font-size: 12px;
  }
  .zoom button {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-2);
    font: 400 15px var(--font);
  }
  .zoom button:hover {
    background: var(--raise);
    color: var(--fg);
  }
  .zoom span {
    width: 36px;
    text-align: center;
  }
  .decks {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px minmax(0, 1fr);
    min-height: 0;
    border-top: 1px solid var(--line);
  }
  .decks > :global(* + *) {
    border-left: 1px solid var(--line);
  }
  .split {
    display: grid;
    place-items: center;
    border-top: 1px solid var(--line);
    cursor: row-resize;
    touch-action: none;
  }
  .split i {
    width: 36px;
    height: 3px;
    border-radius: 2px;
    background: var(--line-2);
    transition: background-color 0.12s;
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
    padding: 9px 14px;
    border-radius: 8px;
    background: var(--popover);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
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
