<script>
  import { onMount, tick } from 'svelte';
  import { keys, binding, commandName, sameKey, mac } from './commands.js';
  import { keymap, saveKeymap, bindingFrom, reserved } from './keymap.svelte.js';
  import { uiZoom, setUiZoom, stepUiZoom, uiZoomSteps } from './uizoom.svelte.js';
  import { announce } from './announce.svelte.js';
  import { keyLabel } from './commands.js';

  /**
   * Settings sit over the library, never over the decks, and don't block
   * them: performance keys keep working while this is open, except while a
   * shortcut is being recorded.
   * @type {{ page?: 'keyboard' | 'display' | 'library', onclose: () => void, onimport?: () => void }}
   */
  let { page = $bindable('keyboard'), onclose, onimport } = $props();

  const GROUPS = [
    { name: 'Deck A', test: (id) => id.startsWith('deck.0.') },
    { name: 'Deck B', test: (id) => id.startsWith('deck.1.') },
    { name: 'Mixer', test: (id) => id.startsWith('mixer.') },
    { name: 'Library', test: (id) => id.startsWith('library.') },
    { name: 'View', test: (id) => id.startsWith('view.') },
    { name: 'App', test: () => true },
  ];
  const groups = $derived.by(() => {
    const left = Object.keys(keys);
    return GROUPS.map((g) => {
      const ids = left.filter(g.test);
      for (const id of ids) left.splice(left.indexOf(id), 1);
      return { name: g.name, ids };
    }).filter((g) => g.ids.length);
  });

  const fullName = (id) => {
    const g = groups.find((g) => g.ids.includes(id));
    return g && g.name.startsWith('Deck') ? `${g.name} ${commandName(id).toLowerCase()}` : commandName(id);
  };

  /** The command being recorded, and what's waiting on a conflict. */
  let recording = $state(null);
  let pending = $state(null); // { id, b, other }
  let note = $state(null); // { id, text }
  let root;
  let returnFocus;

  const changed = (id) => id in keymap.overrides;

  function commit(id, b) {
    const def = keys[id];
    if ((b === null && !def) || sameKey(b, def)) delete keymap.overrides[id];
    else keymap.overrides[id] = b;
    saveKeymap();
  }

  function assign(id, b) {
    const other = b && Object.keys(keys).find((o) => o !== id && sameKey(binding(o), b));
    if (other) {
      pending = { id, b, other };
      return;
    }
    commit(id, b);
    announce(b ? `${fullName(id)} is now ${b.label}` : `${fullName(id)} has no shortcut`);
  }

  function replace() {
    const { id, b, other } = pending;
    commit(other, null);
    commit(id, b);
    announce(`${fullName(id)} is now ${b.label}. ${fullName(other)} has no shortcut`);
    pending = null;
    focusKey(id);
  }

  function record(id) {
    pending = null;
    note = null;
    recording = recording === id ? null : id;
  }

  function focusKey(id) {
    tick().then(() => root?.querySelector(`[data-key="${id}"]`)?.focus());
  }

  // While recording, every key press is captured here first, so it can't
  // also play a deck.
  function capture(e) {
    if (!recording) return;
    const id = recording;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      recording = null;
      return;
    }
    if (!(e.metaKey || e.ctrlKey || e.shiftKey) && (e.code === 'Backspace' || e.code === 'Delete')) {
      recording = null;
      assign(id, null);
      return;
    }
    if (reserved(e)) {
      note = { id, text: e.code === 'Tab' ? 'Tab moves focus, so it stays free' : 'That shortcut belongs to the system' };
      return;
    }
    const b = bindingFrom(e, mac);
    if (!b) return;
    recording = null;
    note = null;
    assign(id, b);
  }

  function resetAll() {
    keymap.overrides = {};
    saveKeymap();
    pending = null;
    announce('All shortcuts are back to their defaults');
  }

  function panelKey(e) {
    if (e.key === 'Escape' && !recording) {
      e.preventDefault();
      e.stopPropagation();
      if (pending) pending = null;
      else onclose();
    }
  }

  onMount(() => {
    returnFocus = document.activeElement;
    root.querySelector('nav button[aria-current="page"]')?.focus();
    window.addEventListener('keydown', capture, true);
    return () => {
      window.removeEventListener('keydown', capture, true);
      /** @type {HTMLElement} */ (returnFocus)?.focus?.();
    };
  });

  const pct = (s) => `${Math.round(s * 100)}%`;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="settings" role="dialog" aria-modal="false" aria-label="Settings" bind:this={root} onkeydown={panelKey} tabindex="-1">
  <nav aria-label="Settings pages">
    <div class="h">Settings</div>
    <button class="item" class:on={page === 'keyboard'} aria-current={page === 'keyboard' ? 'page' : undefined}
      onclick={() => (page = 'keyboard')}>Keyboard</button>
    <button class="item" class:on={page === 'display'} aria-current={page === 'display' ? 'page' : undefined}
      onclick={() => (page = 'display')}>Display</button>
    <button class="item" class:on={page === 'library'} aria-current={page === 'library' ? 'page' : undefined}
      onclick={() => (page = 'library')}>Library</button>
  </nav>

  <div class="main">
    <div class="bar">
      <h2>{page === 'keyboard' ? 'Keyboard' : page === 'library' ? 'Library' : 'Display'}</h2>
      {#if page === 'keyboard'}
        <p>Click a shortcut, then press the new key. Backspace removes it, Esc cancels.</p>
        <button class="btn sm" onclick={resetAll} disabled={!Object.keys(keymap.overrides).length}>Reset all</button>
      {:else}
        <span class="sp"></span>
      {/if}
      <button class="btn sm" onclick={onclose}>Done</button>
    </div>

    <div class="scroll">
      {#if page === 'keyboard'}
        <div class="cols">
          {#each groups as g}
            <section aria-labelledby="kg-{g.name}">
              <h3 id="kg-{g.name}">{g.name}</h3>
              {#each g.ids as id}
                {@const b = binding(id)}
                <div class="row" class:active={recording === id || pending?.id === id}>
                  <span class="name">{commandName(id)}</span>
                  {#if changed(id)}
                    <button class="reset" onclick={() => { commit(id, keys[id] ?? null); announce(`${fullName(id)} is back to ${keyLabel(id) || 'no shortcut'}`); }}
                      aria-label="Reset {fullName(id)} to {keys[id]?.label ?? 'no shortcut'}">Reset</button>
                  {/if}
                  <button class="key num" class:rec={recording === id} class:none={!b} data-key={id}
                    aria-label={recording === id ? `Press a key for ${fullName(id)}` : `${fullName(id)}, ${b ? b.label : 'no shortcut'}. Change`}
                    onclick={() => record(id)}>{recording === id ? 'Press a key…' : (b?.label ?? '—')}</button>
                </div>
                {#if note?.id === id}
                  <div class="inline" role="status">{note.text}</div>
                {/if}
                {#if pending?.id === id}
                  <div class="inline" role="alert">
                    <span>{pending.b.label} is already {fullName(pending.other)}.</span>
                    <button class="btn sm" onclick={replace}>Use it here</button>
                    <button class="btn sm" onclick={() => { pending = null; focusKey(id); }}>Cancel</button>
                  </div>
                {/if}
              {/each}
            </section>
          {/each}
        </div>
      {:else if page === 'library'}
        <section class="display">
          <h3>Import from another app</h3>
          <p>Bring over your Rekordbox or Serato library: cue points, loops, beatgrids and playlists. Your music files aren't changed, and anything you've set here stays as it is.</p>
          <div class="size">
            <button class="btn sm" onclick={onimport}>Import a library…</button>
          </div>
        </section>
      {:else}
        <section class="display">
          <h3>Interface size</h3>
          <p>Scales everything, text and controls alike. {keyLabel('view.uiZoomIn')} and {keyLabel('view.uiZoomOut')} do the same from anywhere.</p>
          <div class="size" role="group" aria-label="Interface size">
            <button class="btn sm" onclick={() => stepUiZoom(-1)} disabled={uiZoom.scale <= uiZoomSteps[0]} aria-label="Smaller">−</button>
            <span class="num" aria-live="polite">{pct(uiZoom.scale)}</span>
            <button class="btn sm" onclick={() => stepUiZoom(1)} disabled={uiZoom.scale >= uiZoomSteps.at(-1)} aria-label="Bigger">+</button>
            <button class="btn sm" onclick={() => setUiZoom(1)} disabled={uiZoom.scale === 1}>Actual size</button>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    background: var(--bg);
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    border-right: 1px solid var(--line);
  }
  .h {
    padding: 0 10px 8px;
    font-size: 11px;
    color: var(--fg-3);
  }
  .item {
    padding: 7px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-2);
    font: inherit;
    text-align: left;
  }
  .item:hover {
    color: var(--fg);
  }
  .item.on {
    background: var(--raise);
    color: var(--fg);
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
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }
  .bar p {
    flex: 1;
    margin: 0;
    color: var(--fg-3);
    font-size: 12px;
  }
  .sp {
    flex: 1;
  }
  .btn:disabled {
    opacity: 0.35;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 6px 20px 20px;
  }
  .cols {
    columns: 300px 3;
    column-gap: 40px;
  }
  section {
    break-inside: avoid;
    padding-top: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 400;
    color: var(--fg-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    border-bottom: 1px solid var(--line);
  }
  .name {
    flex: 1;
    min-width: 0;
    color: var(--fg-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.active .name {
    color: var(--fg);
  }
  .key {
    min-width: 44px;
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font: 400 12px var(--font);
  }
  .key:hover {
    box-shadow: inset 0 0 0 1px var(--fg-3);
  }
  .key.none {
    color: var(--fg-3);
  }
  .key.rec {
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  .reset {
    border: 0;
    padding: 0 4px;
    background: none;
    color: var(--fg-3);
    font: inherit;
    font-size: 11px;
  }
  .reset:hover {
    color: var(--fg-2);
  }
  .inline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
    color: var(--fg-2);
    font-size: 12px;
    border-bottom: 1px solid var(--line);
  }
  .inline span {
    flex: 1;
  }
  .display {
    max-width: 520px;
  }
  .display p {
    margin: 0 0 12px;
    color: var(--fg-3);
  }
  .size {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .size span {
    width: 48px;
    text-align: center;
  }
</style>
