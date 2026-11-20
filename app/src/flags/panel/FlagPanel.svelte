<script>
  // The UI audit's panel (dev builds only; main.js loads it). One row per
  // flag, grouped by area: its number, its title, a line on what it fixes,
  // a Show me and an on/off switch; its settings open under it while it's
  // on. It folds down to a pill (` or the chevron), and can be dragged by
  // its header (or the pill) to any corner or edge of the window, where it
  // docks; with the header focused, the arrow keys move it. Where it is and
  // whether it's folded are remembered.
  //
  // The picks live in the registry (registry.svelte.js), which remembers
  // them; the panel reads and writes them there and keeps only its own
  // place in localStorage. It reads every flag from the registry and every
  // flag's `show` (the row's line and its Show me) from show.svelte.js, so
  // a new flag folder just appears here.
  //
  // While a Show me runs, the panel turns into its card: what was wrong,
  // what's different now, Before / After (flipping on its own, or pinned),
  // and Guides, Replay, Again and Done. The card keeps off what's shown.
  import { tick, onMount } from 'svelte';
  import { FLAGS, flags } from '../registry.svelte.js';
  import { SHOWS, current, showMe, stopShow, replay, resumePending, setPhase, setFlipping, setSlow } from '../show/show.svelte.js';
  import { uiZoom } from '../../lib/uizoom.svelte.js';
  import Switch from './Switch.svelte';
  import Slider from './Slider.svelte';
  import Segmented from './Segmented.svelte';

  // ── Where it is ───────────────────────────────────────────────────────
  const STORE = 'interlude.flags.panel';
  /** The places it docks, as [column, row] on a 3×3 grid of the window (no middle). */
  const DOCKS = { tl: [0, 0], t: [1, 0], tr: [2, 0], l: [0, 1], r: [2, 1], bl: [0, 2], b: [1, 2], br: [2, 2] };
  const dockAt = (c, r) => /** @type {keyof typeof DOCKS} */ (Object.keys(DOCKS).find((k) => DOCKS[k][0] === c && DOCKS[k][1] === r) ?? 'br');
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '{}');
    } catch {
      return {};
    }
  })();
  let dock = $state(/** @type {keyof typeof DOCKS} */ (saved.dock in DOCKS ? saved.dock : 'br'));
  let folded = $state(saved.folded ?? true);
  /** Settings shown or hidden by hand, by flag (otherwise: shown while on). */
  let disclosed = $state(/** @type {Record<string, boolean>} */ (saved.disclosed ?? {}));
  let query = $state('');
  $effect(() => {
    const s = JSON.stringify({ dock, folded, disclosed });
    try {
      localStorage.setItem(STORE, s);
    } catch {}
  });

  // The browser preview zooms the interface with CSS zoom on <html>; the
  // panel and the card keep their own size by undoing it.
  const unzoom = $derived((uiZoom.scale, 1 / (Number(document.documentElement.style.zoom) || 1)));

  // ── The flags ─────────────────────────────────────────────────────────
  const groups = [...new Set(FLAGS.map((f) => f.group ?? 'Other'))];
  /** A flag's one line: its show's `about`, or its notes. */
  const about = (f) => SHOWS[f.id]?.about ?? f.notes ?? '';
  const isOn = (f) => (current.id === f.id ? true : !!flags.on[f.id]);
  const count = $derived(FLAGS.filter(isOn).length);
  const words = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const shown = $derived.by(() => {
    const q = words(query.trim());
    if (!q) return FLAGS;
    const parts = q.split(/\s+/);
    return FLAGS.filter((f) => {
      const hay = words(`${f.n} ${f.title} ${about(f)} ${f.group ?? ''} ${f.id}`);
      return parts.every((p) => hay.includes(p));
    });
  });
  const hasSettings = (f) => Object.keys(f.settings ?? {}).length > 0;
  const settingsOpen = (f) => hasSettings(f) && (disclosed[f.id] ?? isOn(f));
  function toggle(f, on) {
    flags.on[f.id] = on;
    // Turned on: its settings open (unless they were closed by hand).
    if (on && disclosed[f.id] === false) delete disclosed[f.id];
  }
  const all = (on) => FLAGS.forEach((f) => (flags.on[f.id] = on));

  // ── Moving it ─────────────────────────────────────────────────────────
  let box = /** @type {HTMLElement | null} */ ($state(null));
  let dragging = $state(false);
  /** @type {{ x: number, y: number, id: number, moved: boolean } | null} */
  let press = null;
  const M = 16;
  function grab(e) {
    if (e.button !== 0 || /** @type {Element} */ (e.target).closest('button:not(.fp-pill), input, [role="slider"]')) return;
    // No mousedown: Chrome would start dragging whatever ends up under the
    // press once the panel has moved off it (a library row).
    e.preventDefault();
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    /** @type {Element} */ (e.currentTarget).setPointerCapture?.(e.pointerId);
  }
  function drag(e) {
    if (!press || e.pointerId !== press.id || !box) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 4) return;
    press.moved = true;
    dragging = true;
    // Pointer px to the panel's own px (the interface zoom, undone).
    const k = box.getBoundingClientRect().width / (box.offsetWidth || 1) || 1;
    box.style.translate = `${dx / k}px ${dy / k}px`;
  }
  async function drop(e) {
    if (!press || e.pointerId !== press.id) return;
    const was = press;
    press = null;
    if (!was.moved) return;
    // Docks where its middle is: the nearest of the window's corners and edges.
    const r = /** @type {HTMLElement} */ (box).getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const third = (v, n) => (v < n / 3 ? 0 : v > (2 * n) / 3 ? 2 : 1);
    let c = third(cx, innerWidth);
    let rw = third(cy, innerHeight);
    if (c === 1 && rw === 1) {
      const d = [cx, innerWidth - cx, cy, innerHeight - cy];
      const m = d.indexOf(Math.min(...d));
      [c, rw] = [[0, 1], [2, 1], [1, 0], [1, 2]][m];
    }
    await moveTo(dockAt(c, rw), r);
    dragging = false;
  }
  /** Docks it at `to`, gliding from where it was (`from`, a rect). */
  async function moveTo(to, from = box?.getBoundingClientRect()) {
    const el = box;
    dock = to;
    if (!el || !from) return;
    el.style.transition = 'none';
    el.style.translate = '';
    await tick();
    const next = el.getBoundingClientRect();
    const k = next.width / (el.offsetWidth || 1) || 1;
    el.style.translate = `${(from.left - next.left) / k}px ${(from.top - next.top) / k}px`;
    el.getBoundingClientRect();
    el.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'translate 0.28s var(--fp-ease)';
    el.style.translate = '0px 0px';
    setTimeout(() => {
      if (el.isConnected) (el.style.transition = ''), (el.style.translate = '');
    }, 300);
  }
  /** The arrow keys on the header (or the pill) move it to the next dock that way. */
  function nudge(e) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return false;
    e.preventDefault();
    let [c, r] = DOCKS[dock];
    c = Math.max(0, Math.min(2, c + d[0]));
    r = Math.max(0, Math.min(2, r + d[1]));
    // Past the middle, on to the other side.
    if (c === 1 && r === 1) (c += d[0]), (r += d[1]);
    moveTo(dockAt(c, r));
    return true;
  }

  async function fold(v) {
    folded = v;
    await tick();
    if (!v) /** @type {HTMLElement | null} */ (box?.querySelector('.fp-head'))?.focus();
    else /** @type {HTMLElement | null} */ (box)?.focus();
  }

  // ── Keys ──────────────────────────────────────────────────────────────
  const typing = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable;
  // Esc ends a show whatever the app has focused (a show may keep a field
  // open), so it's taken before the app sees it; not inside the panel's own fields.
  function escape(e) {
    // Only a real key: shows press Escape themselves to close dialogs.
    if (e.key !== 'Escape' || !e.isTrusted || !current.id || /** @type {Element} */ (e.target)?.closest?.('.fp')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    done();
  }
  function windowKey(e) {
    if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey || (typing(e.target) && !/** @type {Element} */ (e.target).closest('.fp'))) return;
    e.preventDefault();
    if (!current.id) fold(!folded);
  }
  // Keys inside the panel are the panel's: they don't reach the app's
  // shortcuts (Space would play a deck, the arrows nudge it).
  function ownKeys(e) {
    if (e.key === '`' || (e.key === 'Escape' && current.id)) return;
    e.stopPropagation();
  }

  // ── Show me ───────────────────────────────────────────────────────────
  const showing = $derived(current.id ? FLAGS.find((f) => f.id === current.id) : null);
  const story = $derived(showing ? SHOWS[showing.id] ?? {} : {});
  /** The flag whose Show me was pressed, and where the list was scrolled: put back after the show. */
  let back = /** @type {{ id: string, scroll: number } | null} */ (null);
  function start(f) {
    back = { id: f.id, scroll: box?.querySelector('.fp-scroll')?.scrollTop ?? 0 };
    showMe(f.id);
  }
  async function done() {
    stopShow();
    await tick();
    if (!back) return;
    const list = box?.querySelector('.fp-scroll');
    if (list) list.scrollTop = back.scroll;
    /** @type {HTMLElement | null} */ (box?.querySelector(`[data-flag="${CSS.escape(back.id)}"] .fp-show`) ?? null)?.focus();
    back = null;
  }

  // The card keeps off the targets and the marks: the first free spot
  // along the window's edges (bottom middle first).
  const hits = (r, avoid) => avoid.some((a) => r.x < a.right && r.x + r.w > a.left && r.y < a.bottom && r.y + r.h > a.top);
  let card = $state(/** @type {HTMLElement | null} */ (null));
  let cardAt = $state(/** @type {{ x: number, y: number } | null} */ (null));
  function place() {
    if (!current.id || !card) return;
    const r = card.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const toast = document.querySelector('.toastbox .toast')?.getBoundingClientRect();
    const avoid = [...current.avoid, ...(toast ? [toast] : [])];
    const spots = [
      { x: (innerWidth - w) / 2, y: innerHeight - M - h },
      { x: (innerWidth - w) / 2, y: M },
      { x: innerWidth - M - w, y: innerHeight - M - h },
      { x: M, y: innerHeight - M - h },
      { x: innerWidth - M - w, y: M },
      { x: M, y: M },
      { x: innerWidth - M - w, y: (innerHeight - h) / 2 },
      { x: M, y: (innerHeight - h) / 2 },
    ];
    const k = r.width / (card.offsetWidth || 1) || 1;
    // The first free spot; failing that, the one that covers least.
    const cover = (s) => avoid.reduce((n, a) => n + Math.max(0, Math.min(s.x + w, a.right) - Math.max(s.x, a.left)) * Math.max(0, Math.min(s.y + h, a.bottom) - Math.max(s.y, a.top)), 0);
    const at = spots.find((s) => !hits({ ...s, w, h }, avoid)) ?? spots.reduce((b, s) => (cover(s) < cover(b) ? s : b));
    cardAt = { x: at.x / k, y: at.y / k };
  }
  $effect(() => {
    if (!current.id) {
      cardAt = null;
      return;
    }
    void current.avoid;
    void card;
    place();
    const t = setInterval(place, 400);
    return () => clearInterval(t);
  });

  onMount(() => {
    resumePending();
    addEventListener('keydown', escape, true);
    return () => removeEventListener('keydown', escape, true);
  });
</script>

<svelte:window onkeydown={windowKey} onresize={place} />

<div class="fp" style:zoom={unzoom === 1 ? undefined : unzoom} onkeydown={ownKeys} role="presentation">
  {#if showing}
    <section
      class="fp-surface fp-card"
      aria-label="Show me: {showing.title}"
      bind:this={card}
      style:left={cardAt ? `${cardAt.x}px` : undefined}
      style:top={cardAt ? `${cardAt.y}px` : undefined}
      data-placed={cardAt ? '' : undefined}
    >
      <header class="fp-card-head">
        <span class="fp-n">{showing.n}</span>
        <h2>{showing.title}</h2>
        <button type="button" class="fp-icon" aria-label="Done" title="Done (Esc)" onclick={done}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      {#if current.busy}
        <p class="fp-busy">Setting up…</p>
      {:else if current.canFlip}
        <div class="fp-phase">
          <Segmented
            label="Before or after"
            options={[
              ['before', 'Before'],
              ['after', 'After'],
            ]}
            value={current.phase}
            onchange={(v) => setPhase(v)}
          />
          <button type="button" class="fp-chip" aria-pressed={current.flipping} onclick={() => setFlipping(!current.flipping)}>
            {#if current.flipping}
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4v8M10.5 4v8" /></svg>Flipping
            {:else}
              <svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M5 3.5v9l7.5-4.5z" /></svg>Flip
            {/if}
          </button>
        </div>
        <dl class="fp-story">
          {#if story.before}
            <div class:now={current.phase === 'before'}>
              <dt><i class="bad"></i>Before</dt>
              <dd>{story.before}</dd>
            </div>
          {/if}
          <div class:now={current.phase === 'after'}>
            <dt><i class="ok"></i>After</dt>
            <dd>{story.after ?? story.note}</dd>
          </div>
        </dl>
      {:else}
        <div class="fp-phase">
          <span class="fp-label">Flag</span>
          <Switch bind:checked={flags.on[showing.id]} label="Turn the flag off and on to compare" small />
        </div>
        <p class="fp-note">{story.after ?? story.note}</p>
      {/if}
      {#if current.error}<p class="fp-err">{current.error}</p>{/if}

      <div class="fp-acts">
        {#if current.hasAid}
          <button type="button" class="fp-chip" aria-pressed={current.aid} onclick={() => (current.aid = !current.aid)}>Labels</button>
        {/if}
        {#if current.hasSlow}
          <button type="button" class="fp-chip" aria-pressed={current.slow} onclick={() => setSlow(!current.slow)}>Slow motion</button>
        {/if}
        {#if current.hasReplay}<button type="button" class="fp-chip" onclick={replay}>Replay</button>{/if}
        <button type="button" class="fp-chip" onclick={() => showMe(showing.id)}>Again</button>
        <button type="button" class="fp-chip fp-primary" onclick={done}>Done</button>
      </div>
    </section>
  {:else if folded}
    <button
      type="button"
      class="fp-surface fp-pill"
      class:dragging
      data-dock={dock}
      bind:this={box}
      aria-label="UI audit, {count} of {FLAGS.length} on. Open the panel (backquote key); arrow keys move it"
      onpointerdown={grab}
      onpointermove={drag}
      onpointerup={(e) => {
        const moved = press?.moved;
        drop(e);
        if (!moved) fold(false);
      }}
      onpointercancel={drop}
      onclick={(e) => e.detail === 0 && fold(false)}
      onkeydown={(e) => nudge(e)}
    >
      <i class="fp-dot" class:lit={count > 0}></i>
      <b>UI audit</b>
      <span class="fp-count">{count} on</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 10l3.5-3.5 3.5 3.5" /></svg>
    </button>
  {:else}
    <section class="fp-surface fp-panel" class:dragging data-dock={dock} bind:this={box} aria-label="UI audit flags" tabindex="-1">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions (the header is the handle that moves the panel: focusable, the arrow keys dock it) -->
      <header
        class="fp-head"
        tabindex="0"
        aria-label="UI audit panel. Arrow keys move it to another corner or edge"
        onpointerdown={grab}
        onpointermove={drag}
        onpointerup={drop}
        onpointercancel={drop}
        onkeydown={(e) => e.target === e.currentTarget && nudge(e)}
      >
        <div class="fp-heading">
          <b>UI audit</b>
          <span class="fp-count">{count} of {FLAGS.length} on</span>
        </div>
        <div class="fp-head-acts">
          <button type="button" class="fp-text-btn" onclick={() => all(true)}>All on</button>
          <button type="button" class="fp-text-btn" onclick={() => all(false)}>All off</button>
          <button type="button" class="fp-icon" aria-label="Fold the panel (backquote key)" title="Fold (backquote key)" onclick={() => fold(true)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6l3.5 3.5L11.5 6" /></svg>
          </button>
        </div>
      </header>
      <label class="fp-search">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="M10.25 10.25L13 13" /></svg>
        <input
          type="search"
          placeholder="Find a change"
          aria-label="Find a change"
          bind:value={query}
          onkeydown={(e) => {
            if (e.key === 'Escape' && query) (e.preventDefault(), (query = ''));
          }}
        />
        {#if query}<span class="fp-hits">{shown.length}</span>{/if}
      </label>

      <div class="fp-scroll">
        {#each groups as g (g)}
          {@const list = shown.filter((f) => (f.group ?? 'Other') === g)}
          {#if list.length}
            {@const on = list.filter(isOn).length}
            <section class="fp-group" aria-label={g}>
              <h3><span>{g}</span>{#if on}<small>{on} on</small>{/if}</h3>
              <ul>
                {#each list as f (f.id)}
                  {@const sets = Object.entries(f.settings ?? {})}
                  <li class="fp-flag" class:on={isOn(f)} data-flag={f.id}>
                    <div class="fp-flag-main">
                      <span class="fp-n">{f.n}</span>
                      <span class="fp-title">{f.title}</span>
                      <div class="fp-flag-acts">
                        {#if sets.length}
                          <button
                            type="button"
                            class="fp-icon fp-tune"
                            aria-label="Settings for {f.title}"
                            title="Settings"
                            aria-expanded={settingsOpen(f)}
                            onclick={() => (disclosed[f.id] = !settingsOpen(f))}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h6M12 5h1M3 11h1M7 11h6" /><circle cx="10.5" cy="5" r="1.5" /><circle cx="5.5" cy="11" r="1.5" /></svg>
                          </button>
                        {/if}
                        {#if SHOWS[f.id]}
                          <button type="button" class="fp-show" onclick={() => start(f)} aria-label="Show me: {f.title}">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M5.5 4v8l6-4z" /></svg>Show me
                          </button>
                        {/if}
                        <Switch checked={isOn(f)} label="{f.title}: {isOn(f) ? 'on' : 'off'}" onchange={(v) => toggle(f, v)} />
                      </div>
                      {#if about(f)}<p class="fp-about">{about(f)}</p>{/if}
                    </div>
                    {#if settingsOpen(f)}
                      <div class="fp-settings">
                        {#each sets as [k, s] (k)}
                          {#if s.type === 'choice'}
                            <div class="fp-setting">
                              <span class="fp-label">{s.label ?? k}</span>
                              <Segmented label={s.label ?? k} options={s.options} bind:value={flags.settings[f.id][k]} />
                            </div>
                          {:else}
                            <Slider label={s.label ?? k} min={s.min} max={s.max} step={s.step} unit={s.unit ?? ''} bind:value={flags.settings[f.id][k]} />
                          {/if}
                        {/each}
                        {#if !isOn(f)}<p class="fp-hint">Takes effect when it's on.</p>{/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        {/each}
        {#if !shown.length}<p class="fp-empty">Nothing matches “{query}”.</p>{/if}
      </div>
      <footer class="fp-foot"><kbd aria-label="backquote">&#96;</kbd> folds it · drag the top to move it, or use the arrow keys on it</footer>
    </section>
  {/if}
</div>

<style>
  .fp {
    --fp-bg: rgb(20 20 24 / 0.95);
    --fp-fg: #eceae4;
    --fp-fg-2: rgb(236 234 228 / 0.68);
    --fp-fg-3: rgb(236 234 228 / 0.46);
    --fp-line: rgb(255 255 255 / 0.08);
    --fp-line-2: rgb(255 255 255 / 0.12);
    --fp-accent: #3ec6ff;
    --fp-ease: cubic-bezier(0.23, 1, 0.32, 1);
    --fp-mono: ui-monospace, 'SF Mono', Menlo, monospace;
    position: fixed;
    inset: 0;
    z-index: 10000;
    pointer-events: none;
    /* The app's own UI font, with its fallbacks; nothing of the app's type. */
    font: 400 13px/18px var(--font, 'Geist Variable', 'Helvetica Neue', Arial, sans-serif);
    font-variant-numeric: normal;
    letter-spacing: normal;
    text-transform: none;
    color: var(--fp-fg);
    -webkit-font-smoothing: antialiased;
  }
  .fp :global(*) {
    box-sizing: border-box;
  }
  svg {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  svg .fill {
    fill: currentColor;
    stroke: none;
  }
  button {
    font: inherit;
    color: inherit;
  }
  button:focus-visible,
  input:focus-visible,
  .fp-head:focus-visible {
    outline: 2px solid var(--fp-accent);
    outline-offset: 2px;
  }

  /* The surface every part shares: the site's glass card. */
  .fp-surface {
    position: absolute;
    pointer-events: auto;
    background: var(--fp-bg);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    backdrop-filter: blur(16px) saturate(1.2);
    box-shadow:
      inset 0 0 0 1px var(--fp-line-2),
      inset 0 1px 0 rgb(255 255 255 / 0.05),
      0 20px 50px rgb(0 0 0 / 0.55);
  }
  .dragging {
    cursor: grabbing;
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.18),
      0 28px 70px rgb(0 0 0 / 0.65);
  }

  /* Docks. */
  [data-dock] {
    --m: 16px;
  }
  [data-dock='tl'],
  [data-dock='l'],
  [data-dock='bl'] {
    left: var(--m);
  }
  [data-dock='tr'],
  [data-dock='r'],
  [data-dock='br'] {
    right: var(--m);
  }
  [data-dock='t'],
  [data-dock='b'] {
    left: 50%;
    transform: translateX(-50%);
  }
  [data-dock='tl'],
  [data-dock='t'],
  [data-dock='tr'] {
    top: var(--m);
  }
  [data-dock='bl'],
  [data-dock='b'],
  [data-dock='br'] {
    bottom: var(--m);
  }
  [data-dock='l'],
  [data-dock='r'] {
    top: 50%;
    transform: translateY(-50%);
  }

  /* The pill. */
  .fp-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 10px 0 14px;
    border: 0;
    border-radius: 999px;
    cursor: grab;
    touch-action: none;
    user-select: none;
    animation: fp-in 0.16s var(--fp-ease);
  }
  .fp-pill b {
    font-weight: 500;
  }
  .fp-pill svg {
    color: var(--fp-fg-3);
  }
  .fp-pill:hover svg {
    color: var(--fp-fg);
  }
  .fp-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.22);
  }
  .fp-dot.lit {
    background: var(--fp-accent);
    box-shadow: 0 0 0 3px rgb(62 198 255 / 0.18);
  }
  .fp-count {
    color: var(--fp-fg-3);
    font-variant-numeric: tabular-nums;
  }

  /* The panel. */
  .fp-panel {
    display: flex;
    flex-direction: column;
    width: 420px;
    max-height: min(760px, calc(100vh - 32px));
    border-radius: 16px;
    outline: none;
    animation: fp-in 0.16s var(--fp-ease);
  }
  @keyframes fp-in {
    from {
      opacity: 0;
      scale: 0.97;
    }
  }
  .fp-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 10px 8px 16px;
    border-radius: 16px 16px 0 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .fp-head:focus-visible {
    outline-offset: -2px;
  }
  .fp-heading {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .fp-heading b {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .fp-head-acts {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .fp-text-btn {
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: none;
    font-size: 12px;
    font-weight: 500;
    color: var(--fp-fg-2);
    cursor: pointer;
  }
  .fp-text-btn:hover {
    color: var(--fp-fg);
    background: rgb(255 255 255 / 0.06);
  }
  .fp-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--fp-fg-3);
    cursor: pointer;
  }
  .fp-icon:hover {
    color: var(--fp-fg);
    background: rgb(255 255 255 / 0.06);
  }
  .fp-head,
  .fp-search,
  .fp-foot {
    flex: none;
  }
  .fp-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 12px 6px;
    height: 32px;
    padding: 0 10px;
    border-radius: 9px;
    background: rgb(0 0 0 / 0.28);
    box-shadow: inset 0 0 0 1px var(--fp-line);
    color: var(--fp-fg-3);
  }
  .fp-search:focus-within {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.22);
  }
  .fp-search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--fp-fg);
    outline: none;
  }
  .fp-search input::placeholder {
    color: var(--fp-fg-3);
  }
  .fp-search input::-webkit-search-cancel-button {
    display: none;
  }
  .fp-hits {
    font: 500 11px var(--fp-mono);
  }
  .fp-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 8px 8px;
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.15) transparent;
  }
  .fp-group h3 {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0;
    padding: 12px 8px 6px;
    background: rgb(21 21 25);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fp-fg-3);
  }
  .fp-group small {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--fp-accent);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }
  .fp-flag {
    border-radius: 11px;
    transition: background-color 0.15s;
  }
  .fp-flag:hover {
    background: rgb(255 255 255 / 0.035);
  }
  .fp-flag.on {
    background: rgb(62 198 255 / 0.06);
  }
  .fp-flag-main {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    column-gap: 10px;
    row-gap: 3px;
    align-items: start;
    padding: 9px 8px 10px;
  }
  .fp-n {
    width: 18px;
    font: 500 11px/20px var(--fp-mono);
    color: var(--fp-fg-3);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .on .fp-n {
    color: var(--fp-accent);
  }
  .fp-title {
    font-weight: 500;
    line-height: 20px;
    text-wrap: pretty;
  }
  .fp-about {
    grid-column: 2 / -1;
    margin: 0;
    font-size: 12px;
    line-height: 17px;
    color: var(--fp-fg-2);
    text-wrap: pretty;
  }
  .fp-flag-acts {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 20px;
  }
  .fp-tune {
    width: 24px;
    height: 24px;
  }
  .fp-tune[aria-expanded='true'] {
    color: var(--fp-fg);
  }
  .fp-show {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 9px 0 5px;
    border: 0;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.07);
    box-shadow: inset 0 0 0 1px var(--fp-line);
    font-size: 11.5px;
    font-weight: 500;
    color: var(--fp-fg-2);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s,
      scale 0.15s var(--fp-ease);
  }
  .fp-show svg {
    width: 14px;
    height: 14px;
  }
  .fp-show:hover {
    background: rgb(255 255 255 / 0.13);
    color: var(--fp-fg);
  }
  .fp-show:active {
    scale: 0.96;
  }
  .fp-settings {
    display: grid;
    gap: 6px;
    padding: 0 10px 10px 36px;
  }
  .fp-setting {
    display: grid;
    gap: 4px;
  }
  .fp-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--fp-fg-3);
  }
  .fp-hint {
    margin: 0;
    font-size: 11px;
    color: var(--fp-fg-3);
  }
  .fp-empty {
    margin: 16px 8px;
    color: var(--fp-fg-3);
  }
  .fp-foot {
    padding: 8px 16px 10px;
    border-top: 1px solid var(--fp-line);
    font-size: 11px;
    color: var(--fp-fg-3);
  }
  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    margin-right: 2px;
    border-radius: 4px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
    /* The backquote sits at the top of its line: set low so it shows centred. */
    font: 600 17px/27px var(--fp-mono);
    color: var(--fp-fg);
  }

  /* The card, while a show runs. */
  .fp-card {
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    width: 440px;
    display: grid;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    border-radius: 16px;
    animation: fp-in 0.16s var(--fp-ease);
  }
  .fp-card[data-placed] {
    bottom: auto;
    translate: none;
    transition:
      left 0.25s var(--fp-ease),
      top 0.25s var(--fp-ease);
  }
  .fp-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fp-card-head .fp-n {
    width: auto;
    padding: 0;
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fp-phase {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fp-phase :global(.fp-seg) {
    flex: none;
  }
  .fp-story {
    display: grid;
    gap: 6px;
    margin: 0;
  }
  .fp-story div {
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 8px;
    opacity: 0.5;
    transition: opacity 0.25s;
  }
  .fp-story div.now {
    opacity: 1;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 18px;
    font-size: 12px;
    font-weight: 600;
  }
  dt i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  dt i.bad {
    background: #ff6a5c;
  }
  dt i.ok {
    background: #4fe39b;
  }
  dd {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--fp-fg);
    text-wrap: pretty;
  }
  .fp-note,
  .fp-busy {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--fp-fg-2);
  }
  .fp-err {
    margin: 0;
    font-size: 12px;
    color: #ff8a7f;
  }
  .fp-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 2px;
  }
  .fp-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border: 0;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--fp-line);
    font-size: 12px;
    font-weight: 500;
    color: var(--fp-fg-2);
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s,
      scale 0.15s var(--fp-ease);
  }
  .fp-chip svg {
    width: 14px;
    height: 14px;
    margin-left: -3px;
  }
  .fp-chip:hover {
    background: rgb(255 255 255 / 0.1);
    color: var(--fp-fg);
  }
  .fp-chip:active {
    scale: 0.97;
  }
  .fp-chip[aria-pressed='true'] {
    background: rgb(255 255 255 / 0.14);
    color: var(--fp-fg);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  }
  .fp-primary {
    margin-left: auto;
    background: var(--fp-fg);
    color: #111113;
    box-shadow: none;
  }
  .fp-primary:hover {
    background: #fff;
    color: #111113;
  }
  @media (prefers-reduced-motion: reduce) {
    .fp-panel,
    .fp-pill,
    .fp-card {
      animation: none;
    }
    .fp-card[data-placed] {
      transition: none;
    }
  }
</style>
