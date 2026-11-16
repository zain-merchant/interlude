<script>
  // The UI audit's toggle bar (dev builds only): a small bar at the bottom
  // right, out of the app's way, in the manner of Raphael Salaja's prototype switcher. It opens
  // a panel listing every flag by number, to turn on or off and tune.
  // ` (backquote) opens and closes it; the picks are remembered.
  //
  // The panel can be dragged anywhere by its header (double-click the header
  // to put it back in the corner); each flag's "Show me" sets the app up to
  // show its change and draws guides over it (show/show.svelte.js).
  import { onMount } from 'svelte';
  import { FLAGS, flags } from './registry.svelte.js';
  import { SHOWS, current, showMe, stopShow, replay, resumePending } from './show/show.svelte.js';
  import { uiZoom } from '../lib/uizoom.svelte.js';

  // The browser preview zooms the interface with CSS zoom on <html>; the
  // bar keeps its own size (and window coordinates) by undoing it.
  const unzoom = $derived((uiZoom.scale, 1 / (Number(document.documentElement.style.zoom) || 1)));

  let open = $state(false);
  let expanded = $state(/** @type {string | null} */ (null));
  const count = $derived(FLAGS.filter((f) => flags.on[f.id]).length);
  const groups = $derived([...new Set(FLAGS.map((f) => f.group ?? 'Other'))]);
  const showing = $derived(current.id ? FLAGS.find((f) => f.id === current.id) : null);

  const all = (on) => FLAGS.forEach((f) => (flags.on[f.id] = on));
  function key(e) {
    if (e.key !== '`' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    open = !open;
  }

  // Where the panel is: null is the corner over the pill. `dodge` is a
  // place it takes for the length of a Show me, to keep off what it shows.
  const POS = 'interlude.flags.bar';
  /** @type {{ x: number, y: number } | null} */
  let pos = $state(read());
  /** @type {{ x: number, y: number } | null} */
  let dodge = $state(null);
  let panel = $state(/** @type {HTMLElement | null} */ (null));
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(POS) ?? 'null');
      return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
    } catch {
      return null;
    }
  }
  function save() {
    try {
      if (pos) localStorage.setItem(POS, JSON.stringify(pos));
      else localStorage.removeItem(POS);
    } catch {}
  }
  const M = 8;
  /** Keeps a position's panel inside the window. */
  function clamp(p) {
    if (!p || !panel) return p;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    return { x: Math.max(M, Math.min(innerWidth - w - M, p.x)), y: Math.max(M, Math.min(innerHeight - h - M, p.y)) };
  }
  const place = $derived(dodge ?? pos);

  /** @type {{ dx: number, dy: number, id: number } | null} */
  let drag = null;
  function down(e) {
    if (e.button !== 0 || /** @type {Element} */ (e.target).closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    /** @type {Element} */ (e.currentTarget).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    dodge = null;
    pos = clamp({ x: e.clientX - drag.dx, y: e.clientY - drag.dy });
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    save();
  }
  function home() {
    pos = null;
    dodge = null;
    save();
  }
  // The window or the panel changed size: keep it on screen.
  function refit() {
    if (pos) pos = clamp(pos);
    if (dodge) dodge = clamp(dodge);
  }
  $effect(() => {
    if (!panel) return;
    const ro = new ResizeObserver(refit);
    ro.observe(panel);
    return () => ro.disconnect();
  });

  // While a Show me runs, move off its targets if the panel covers them.
  $effect(() => {
    const avoid = current.avoid;
    if (!current.id) {
      dodge = null;
      return;
    }
    if (!panel || !avoid.length) return;
    const hits = (r) => avoid.some((a) => r.x < a.right && r.x + r.w > a.left && r.y < a.bottom && r.y + r.h > a.top);
    const r = panel.getBoundingClientRect();
    if (!hits({ x: r.left, y: r.top, w: r.width, h: r.height })) return;
    const w = r.width;
    const h = r.height;
    const spots = [
      { x: innerWidth - w - 14, y: 14 },
      { x: 14, y: 14 },
      { x: 14, y: innerHeight - h - 14 },
      { x: innerWidth - w - 14, y: innerHeight - h - 60 },
      { x: (innerWidth - w) / 2, y: 14 },
      { x: (innerWidth - w) / 2, y: innerHeight - h - 14 },
    ];
    const spot = spots.find((s) => !hits({ ...s, w, h }));
    if (spot) dodge = clamp(spot);
  });

  onMount(() => {
    resumePending().then((id) => {
      if (id) open = true;
    });
  });
</script>

<svelte:window onkeydown={key} onresize={refit} />

<div class="flagbar" data-open={open || undefined} style:zoom={unzoom === 1 ? undefined : unzoom}>
  {#if open}
    <div class="panel" role="dialog" aria-label="UI audit flags" bind:this={panel} data-placed={place ? '' : undefined}
      style:left={place ? `${place.x}px` : undefined} style:top={place ? `${place.y}px` : undefined}>
      <header role="toolbar" aria-label="UI audit flags: drag to move" tabindex="-1" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} ondblclick={home}
        title="Drag to move; double-click to put back in the corner">
        <b>UI audit</b>
        <span>{count} of {FLAGS.length} on</span>
        <button type="button" onclick={() => all(true)}>All on</button>
        <button type="button" onclick={() => all(false)}>All off</button>
      </header>
      {#if showing}
        <div class="showing" aria-live="polite">
          <p><span class="n">{showing.n}</span>
            {#if current.busy}Setting up…{:else}{current.note}{/if}</p>
          {#if current.error}<p class="err">{current.error}</p>{/if}
          <div class="acts">
            {#if current.hasAid}
              <button type="button" aria-pressed={current.aid} onclick={() => (current.aid = !current.aid)}>Guides</button>
            {/if}
            {#if current.hasReplay}<button type="button" onclick={replay}>Replay</button>{/if}
            <button type="button" onclick={() => showMe(showing.id)}>Again</button>
            <button type="button" onclick={stopShow}>Done</button>
          </div>
        </div>
      {/if}
      <div class="list">
        {#each groups as g}
          <div class="group">{g}</div>
          {#each FLAGS.filter((f) => (f.group ?? 'Other') === g) as f (f.id)}
            <div class="flag" data-id={f.id} data-on={flags.on[f.id] || undefined} data-showing={current.id === f.id || undefined}>
              <label class="row">
                <input type="checkbox" bind:checked={flags.on[f.id]} />
                <span class="sw" aria-hidden="true"><i></i></span>
                <span class="n">{f.n}</span>
                <span class="t">{f.title}</span>
                {#if SHOWS[f.id]}
                  <button type="button" class="more show" title="Turn it on, set the app up and point at the change"
                    onclick={(e) => { e.preventDefault(); showMe(f.id); }}>Show me</button>
                {/if}
                {#if f.settings || f.notes}
                  <button type="button" class="more" aria-expanded={expanded === f.id}
                    onclick={(e) => { e.preventDefault(); expanded = expanded === f.id ? null : f.id; }}>{expanded === f.id ? 'Less' : 'More'}</button>
                {/if}
              </label>
              {#if expanded === f.id}
                <div class="detail">
                  {#if f.notes}<p>{f.notes}</p>{/if}
                  {#each Object.entries(f.settings ?? {}) as [k, s]}
                    <div class="setting">
                      <span>{s.label ?? k}</span>
                      {#if s.type === 'choice'}
                        <div class="seg">
                          {#each s.options as [v, l]}
                            <button type="button" aria-pressed={flags.settings[f.id][k] === v} onclick={() => (flags.settings[f.id][k] = v)}>{l}</button>
                          {/each}
                        </div>
                      {:else}
                        <input type="range" min={s.min} max={s.max} step={s.step} bind:value={flags.settings[f.id][k]} />
                        <output>{flags.settings[f.id][k]}{s.unit ?? ''}</output>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        {/each}
      </div>
    </div>
  {/if}
  <button type="button" class="pill" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="dot" data-on={count > 0 || undefined}></span>UI audit <span class="c">{count}/{FLAGS.length}</span><kbd>`</kbd>
  </button>
</div>

<style>
  .flagbar {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 10000;
    display: grid;
    justify-items: end;
    gap: 8px;
    /* The app's own UI font (app.css), with its fallbacks. */
    font: 400 13px/20px var(--font, 'Geist Variable', 'Helvetica Neue', Arial, sans-serif);
    font-variant-numeric: normal;
    letter-spacing: normal;
    text-transform: none;
    color: #ededed;
    -webkit-font-smoothing: antialiased;
  }
  button {
    font: inherit;
    color: inherit;
    border: 0;
    cursor: pointer;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px 0 12px;
    border-radius: 12px;
    background: #111;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 8px 24px rgb(0 0 0 / 0.5);
    font-weight: 500;
  }
  .pill:hover {
    background: #1a1a1a;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.25);
  }
  .dot[data-on] {
    background: #3ec6ff;
  }
  .c {
    color: rgb(255 255 255 / 0.5);
    font-variant-numeric: tabular-nums;
  }
  kbd {
    padding: 0 6px;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.08);
    color: rgb(255 255 255 / 0.5);
    font: 500 11px/18px ui-monospace, Menlo, monospace;
  }
  .panel {
    width: 480px;
    max-height: min(70vh, 640px);
    display: grid;
    grid-template-rows: auto auto 1fr;
    border-radius: 14px;
    background: #111;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 20px 60px rgb(0 0 0 / 0.6);
    overflow: hidden;
  }
  .panel[data-placed] {
    position: fixed;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid rgb(255 255 255 / 0.08);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  header:active {
    cursor: grabbing;
  }
  header b {
    font-weight: 600;
  }
  header span {
    flex: 1;
    color: rgb(255 255 255 / 0.5);
  }
  header button,
  .more,
  .seg button,
  .acts button {
    height: 26px;
    padding: 0 9px;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.08);
    font-size: 12px;
    font-weight: 500;
  }
  header button:hover,
  .more:hover,
  .seg button:hover,
  .acts button:hover {
    background: rgb(255 255 255 / 0.13);
  }
  .showing {
    display: grid;
    gap: 6px;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid rgb(255 255 255 / 0.08);
    background: rgb(255 79 163 / 0.08);
    box-shadow: inset 2px 0 0 #ff4fa3;
  }
  .showing p {
    margin: 0;
    font-size: 12px;
    line-height: 17px;
    color: rgb(255 255 255 / 0.85);
  }
  .showing .n {
    margin-right: 6px;
  }
  .showing .err {
    color: #ff8a7f;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .acts button[aria-pressed='true'] {
    background: #ededed;
    color: #111;
  }
  .list {
    overflow-y: auto;
    padding: 6px;
  }
  .group {
    padding: 10px 8px 4px;
    color: rgb(255 255 255 / 0.45);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .flag {
    border-radius: 10px;
  }
  .flag[data-on] {
    background: rgb(255 255 255 / 0.04);
  }
  .flag[data-showing] {
    box-shadow: inset 0 0 0 1px rgb(255 79 163 / 0.6);
  }
  .row {
    display: grid;
    grid-template-columns: 30px 22px 1fr auto auto;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 6px 0 8px;
    cursor: pointer;
  }
  .row .show {
    grid-column: 4;
    white-space: nowrap;
  }
  .row .more:not(.show) {
    grid-column: 5;
  }
  .row input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .sw {
    width: 28px;
    height: 16px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
    position: relative;
    transition: background-color 0.15s;
  }
  .sw i {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #fff;
    transition: translate 0.15s cubic-bezier(0.23, 1, 0.32, 1);
  }
  .flag[data-on] .sw {
    background: #3ec6ff;
  }
  .flag[data-on] .sw i {
    translate: 12px 0;
  }
  .row:has(input:focus-visible) .sw {
    outline: 2px solid #3ec6ff;
    outline-offset: 2px;
  }
  .n {
    color: rgb(255 255 255 / 0.4);
    font: 500 12px ui-monospace, Menlo, monospace;
  }
  .detail {
    display: grid;
    gap: 8px;
    padding: 2px 10px 10px 68px;
  }
  .detail p {
    margin: 0;
    color: rgb(255 255 255 / 0.6);
    font-size: 12px;
    line-height: 17px;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgb(255 255 255 / 0.7);
  }
  .setting > span {
    min-width: 70px;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .seg button[aria-pressed='true'] {
    background: #ededed;
    color: #111;
  }
  .setting input[type='range'] {
    flex: 1;
    accent-color: #3ec6ff;
  }
  output {
    min-width: 40px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: rgb(255 255 255 / 0.5);
  }
</style>
