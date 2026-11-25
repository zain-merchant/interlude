<script>
  // #110 (UI audit flag): which columns the track list shows, and in what
  // order. A click shows or hides one; dragging one (anywhere, the grip says
  // so) moves it; ⌥↑ and ⌥↓ move the one that's focused. The list behind
  // follows as you go, and Esc during a drag puts it back.
  import { tick } from 'svelte';
  import { announce } from '../../lib/announce.svelte.js';
  import { colOrder, arrange, setOrder } from './column-order.svelte.js';

  /** @type {{ x: number, y: number, columns: { by: any, label: string }[], hidden: string[], keyboard?: boolean, ontoggle: (by: string) => void, onreset: () => void, onclose: () => void }} */
  let { x, y, columns, hidden, keyboard = false, ontoggle, onreset, onclose } = $props();

  let el = $state(/** @type {HTMLElement | null} */ (null));
  let w = $state(0);
  let h = $state(0);
  const left = $derived(Math.max(6, Math.min(x, window.innerWidth - w - 6)));
  const top = $derived(Math.max(6, Math.min(y, window.innerHeight - h - 6)));
  const list = $derived(arrange(columns));
  let dragging = $state(/** @type {string | null} */ (null));
  let dy = $state(0);
  let press = /** @type {{ by: string, y: number, before: string[] } | null} */ (null);
  let moved = false;
  const back = document.activeElement;

  $effect(() => {
    void el;
    tick().then(() => (keyboard ? el?.querySelector('button')?.focus() : el?.focus()));
  });
  function close() {
    onclose();
    /** @type {HTMLElement | null} */ (back)?.focus?.();
  }
  const rows = () => /** @type {HTMLElement[]} */ ([...(el?.querySelectorAll('[data-by]') ?? [])]);

  function down(/** @type {PointerEvent} */ e, /** @type {string} */ by) {
    if (e.button !== 0) return;
    press = { by, y: e.clientY, before: [...colOrder.by] };
    moved = false;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }
  function move(/** @type {PointerEvent} */ e) {
    if (!press) return;
    if (!moved && Math.abs(e.clientY - press.y) < 5) return;
    moved = true;
    dragging = press.by;
    // The row follows the pointer; the others step aside as its middle passes theirs.
    const all = rows();
    const i = all.findIndex((r) => r.dataset.by === press?.by);
    const r = all[i].getBoundingClientRect();
    const mid = e.clientY;
    const at = all.findIndex((o, j) => j !== i && mid > o.offsetTop + (el?.getBoundingClientRect().top ?? 0) && mid < o.offsetTop + (el?.getBoundingClientRect().top ?? 0) + o.offsetHeight);
    if (at >= 0) place(press.by, at);
    void r;
    tick().then(() => {
      const me = rows().find((o) => o.dataset.by === press?.by);
      if (me && el) dy = e.clientY - (el.getBoundingClientRect().top + me.offsetTop + me.offsetHeight / 2);
    });
  }
  function up() {
    if (press && moved) announce(`${columns.find((c) => c.by === press?.by)?.label}, ${list.findIndex((c) => c.by === press?.by) + 1} of ${list.length}`);
    press = null;
    dragging = null;
    dy = 0;
  }
  function place(/** @type {string} */ by, /** @type {number} */ at) {
    const next = list.map((c) => String(c.by));
    next.splice(next.indexOf(by), 1);
    next.splice(at, 0, by);
    setOrder(next);
  }
  function click(/** @type {string} */ by) {
    if (moved) return void (moved = false);
    if (by !== 'title') ontoggle(by);
  }
  function key(/** @type {KeyboardEvent} */ e) {
    const items = /** @type {HTMLElement[]} */ ([...(el?.querySelectorAll('button:not(:disabled)') ?? [])]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const by = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset.by;
    if (e.key === 'Escape' && press) {
      setOrder(press.before);
      up();
    } else if (e.altKey && by && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const at = list.findIndex((c) => c.by === by);
      const to = Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
      place(by, to);
      announce(`${columns.find((c) => c.by === by)?.label}, ${to + 1} of ${list.length}`);
      tick().then(() => /** @type {HTMLElement | null} */ (el?.querySelector(`[data-by='${by}']`))?.focus());
    } else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Home') items[0]?.focus();
    else if (e.key === 'End') items[items.length - 1]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div class="scrim" role="presentation" onpointerdown={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>
<div class="menu colmenu" role="menu" aria-label="Columns" tabindex="-1" bind:this={el} bind:clientWidth={w} bind:clientHeight={h}
  style:left="{left}px" style:top="{top}px" onkeydown={key}>
  {#each list as c (c.by)}
    {@const on = c.by === 'title' || !hidden.includes(c.by)}
    <button role="menuitemcheckbox" aria-checked={on} aria-disabled={c.by === 'title'} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-by={c.by}
      class:off={!on} class:moving={dragging === c.by} style:translate={dragging === c.by ? `0 ${dy}px` : undefined}
      onpointerdown={(e) => down(e, c.by)} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={() => click(c.by)}>
      <svg class="tick" viewBox="0 0 14 14" aria-hidden="true">{#if on}<path d="M3 7.4 5.8 10 11 4.4" />{/if}</svg>
      <span>{c.label}</span>
      <svg class="grip" viewBox="0 0 8 14" aria-hidden="true"><path d="M2 3.5h.01M6 3.5h.01M2 7h.01M6 7h.01M2 10.5h.01M6 10.5h.01" /></svg>
    </button>
  {/each}
  <div class="sep" role="separator"></div>
  <button role="menuitem" onclick={() => { onreset(); close(); }}><span class="plain">Reset order and widths</span></button>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .menu {
    position: fixed;
    z-index: 91;
    width: 216px;
    box-sizing: border-box;
    background: var(--popover);
    outline: none;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 28px;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    touch-action: none;
  }
  button span {
    flex: 1;
  }
  .off {
    color: var(--fg-3);
  }
  svg {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tick {
    width: 14px;
    height: 14px;
  }
  .grip {
    width: 8px;
    height: 14px;
    color: var(--fg-4);
    stroke-width: 2;
    cursor: grab;
  }
  button:hover .grip {
    color: var(--fg-2);
  }
  .moving {
    position: relative;
    z-index: 1;
    cursor: grabbing;
  }
  .plain {
    padding-left: 22px;
  }
  .sep {
    height: 1px;
    margin: 5px 10px;
    background: var(--line);
  }
</style>
