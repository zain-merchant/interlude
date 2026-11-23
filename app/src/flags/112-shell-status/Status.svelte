<script>
  // The controller and the output, beside Settings; a click opens one menu
  // for both. In the title bar it brings Settings with it.
  import { onMount, tick } from 'svelte';
  import { backend } from '../../lib/backend.js';
  import { engine } from '../../lib/engine.svelte.js';
  import { tip, tipText } from '../../lib/tooltip.svelte.js';
  import { keyLabel } from '../../lib/commands.js';
  import { conn, items, open as go, unmapped, watchConnections, refresh } from './connections.svelte.js';

  /** @type {{ bar?: boolean }} `bar`: in the title bar, rather than the library's toolbar */
  let { bar = false } = $props();

  const list = $derived(items());
  const said = { ctl: 'controller', out: 'output', both: 'controller and output' };

  let shown = $state(/** @type {HTMLElement | null} */ (null)); // the item the menu hangs from
  let pop = $state(/** @type {HTMLElement | null} */ (null));
  let root = $state(/** @type {HTMLElement | null} */ (null));
  let at = $state({ left: 0, top: 0 });
  /** @type {{ devices: string[], choice: string | null } | null} */
  let outputs = $state(null);
  let error = $state('');
  /** Picked while a deck plays, waiting for Switch now. */
  let asked = $state(/** @type {string | null | undefined} */ (undefined));
  let busy = $state(false);
  let askTimer = 0;

  onMount(watchConnections);

  // The library toolbar gives way a step at a time until it fits (style.css
  // says what each step drops); the search field has already narrowed.
  const STEPS = 6;
  $effect(() => {
    if (bar || !root) return;
    const toolbar = /** @type {HTMLElement} */ (root.parentElement);
    let turn = 0;
    const fit = () => {
      cancelAnimationFrame(turn);
      turn = requestAnimationFrame(() => {
        for (let i = 0; i <= STEPS; i++) {
          toolbar.dataset.fit = String(i);
          if (toolbar.scrollWidth <= toolbar.clientWidth) break;
        }
      });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(toolbar);
    const mo = new MutationObserver(fit);
    mo.observe(toolbar, { subtree: true, childList: true, characterData: true });
    return () => {
      cancelAnimationFrame(turn);
      ro.disconnect();
      mo.disconnect();
      delete toolbar.dataset.fit;
    };
  });

  async function toggle(e) {
    if (shown) return close();
    shown = e.currentTarget;
    error = '';
    asked = undefined;
    refresh();
    backend.audioOutputs?.().then((o) => (outputs = o)).catch((x) => (error = String(x)));
    await tick();
    place(true);
    pop?.querySelector('button')?.focus();
  }
  function close(back = true) {
    const b = shown;
    shown = null;
    if (back) b?.focus();
  }
  // Under the item, its right edge on the item's, or over it with no room
  // below. It stays on the side it opened on, whatever its rows then do.
  let over = false;
  function place(opening = false) {
    if (!shown || !pop) return;
    const k = Number(document.documentElement.style.zoom) || 1;
    const r = shown.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const below = r.bottom / k + 4;
    const end = innerHeight / k - 12;
    if (opening) over = below + h > end && r.top / k > end - below;
    at = {
      left: Math.max(12, Math.min(innerWidth / k - w - 12, r.right / k - w)),
      top: Math.max(12, over ? r.top / k - 4 - h : Math.min(below, end - h)),
    };
  }
  $effect(() => {
    void outputs;
    void asked;
    void error;
    void conn.controllers;
    if (shown) tick().then(() => place());
  });

  /** @param {string | null} device */
  async function pick(device) {
    if (busy || (outputs && device === outputs.choice && engine.audio?.state === 'connected')) return;
    // Moving the sound closes one card before it opens the other, so while
    // a deck plays it asks first, on the row.
    if (engine.decks.some((d) => d.playing) && asked !== device) {
      asked = device;
      clearTimeout(askTimer);
      askTimer = window.setTimeout(() => (asked = undefined), 4000);
      return;
    }
    asked = undefined;
    busy = true;
    error = '';
    try {
      await backend.setAudioOutput?.(device);
      outputs = (await backend.audioOutputs?.()) ?? outputs;
    } catch (x) {
      error = String(x);
    }
    busy = false;
  }
  function link(fn) {
    close(false);
    fn();
  }
  function key(e) {
    e.stopPropagation();
    const rows = /** @type {HTMLButtonElement[]} */ ([...(pop?.querySelectorAll('button') ?? [])]);
    const i = rows.indexOf(/** @type {any} */ (document.activeElement));
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') rows[(i + 1) % rows.length]?.focus();
    else if (e.key === 'ArrowUp') rows[(i - 1 + rows.length) % rows.length]?.focus();
    else if (e.key === 'Home') rows[0]?.focus();
    else if (e.key === 'End') rows.at(-1)?.focus();
    else if (e.key === 'Tab') return close();
    else return;
    e.preventDefault();
  }
  const outside = (e) => {
    if (shown && !pop?.contains(e.target) && !shown.contains(e.target)) close(false);
  };

  /** Moves the menu to the body: a toolbar that clips would cut it. @param {HTMLElement} node */
  const portal = (node) => {
    document.body.append(node);
    return { destroy: () => node.remove() };
  };
  const dev = $derived(engine.audio?.state === 'connected' ? engine.audio.device : '');
  const others = $derived(unmapped());
</script>

<svelte:window onpointerdowncapture={outside} onresize={() => shown && place()} />

{#snippet icon(n)}
  {#if n === 'ctl' || n === 'both'}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8.5" rx="2" /><circle cx="5" cy="8.25" r="1.9" /><circle cx="11" cy="8.25" r="1.9" /></svg>
  {:else if n === 'ctlx'}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8.5" rx="2" /><path d="M5.2 8.25h5.6" /></svg>{/if}
  {#if n === 'out' || n === 'both'}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.2h2.2L7.4 3.4v9.2L4.2 9.8H2zM10 6a3 3 0 0 1 0 4M12 4.2a5.6 5.6 0 0 1 0 7.6" /></svg>
  {:else if n === 'outx'}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.2h2.2L7.4 3.4v9.2L4.2 9.8H2zM10.2 6.2l3.6 3.6M13.8 6.2l-3.6 3.6" /></svg>{/if}
{/snippet}

<div class="shell" class:bar data-tauri-drag-region={bar ? 'deep' : undefined} role="group" aria-label="Connections" bind:this={root}>
  {#if bar}<span data-zoom-slot></span>{/if}
  {#each list as it (it.kind)}
    <button class="st" class:bad={it.state === 'bad'} class:open={!!shown && shown.dataset.kind === it.kind} data-kind={it.kind} aria-haspopup="dialog" aria-expanded={!!shown && shown.dataset.kind === it.kind}
      aria-label="{it.name}, {said[it.kind]}" onclick={toggle} use:tip={() => (shown ? '' : tipText(it.name, '', said[it.kind]))}>
      {@render icon(it.icon)}<span class="nm">{it.name}</span><svg class="cv" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 4 5 6.5 7.5 4" /></svg>
    </button>
  {/each}
  {#if bar}
    <button class="st cog" aria-label="Settings" onclick={() => go.settings('keyboard')} use:tip={() => tipText('Settings', keyLabel('app.settings'))}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  {/if}
</div>

{#if shown}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="shell-pop" role="dialog" aria-label="Connections" tabindex="-1" bind:this={pop} use:portal onkeydown={key} style:left="{at.left}px" style:top="{at.top}px">
    <h6 id="sp-out">Output</h6>
    <div role="group" aria-labelledby="sp-out">
      {#each [null, ...(outputs?.devices ?? [])] as d}
        {@const on = !!outputs && outputs.choice === d}
        <button class="rw" aria-pressed={on} disabled={busy} onclick={() => pick(d)}>
          <i>{#if on}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.8 9 10 3.4" /></svg>{/if}</i>
          <span>{d ?? 'Automatic'}</span>
          {#if asked !== undefined && asked === d}<b class="k">Switch now</b>{:else if d === null && on && dev}<small>{dev} now</small>{/if}
        </button>
      {/each}
    </div>
    {#if error}<p class="err" role="alert">{error}</p>
    {:else}<p role="status">{asked !== undefined ? 'A deck is playing. This stops it for a moment.' : 'Switching stops the sound for a moment.'}</p>{/if}
    <hr />
    <h6>Controllers</h6>
    {#each conn.controllers?.connected ?? [] as c}
      <div class="ln"><span>{c.port}</span><small>{c.learned ? 'Your mapping' : c.mapping}</small></div>
    {/each}
    {#each others as p}
      <div class="ln"><span>{p}</span><button class="k" onclick={() => link(go.setup)}>Set up…</button></div>
    {/each}
    {#if conn.controllers && !conn.controllers.connected.length && !others.length}<p class="none">None connected. Plug one in and it shows up here by itself.</p>{/if}
    <hr />
    <button class="rw" onclick={() => link(() => go.settings('audio'))}><span>Audio settings…</span></button>
    <button class="rw" onclick={() => link(() => go.settings('controllers'))}><span>Controller settings…</span></button>
  </div>
{/if}
