<script>
  // The UI audit's controls (dev builds only), in DialKit: one panel at the
  // bottom right, a folder per group (Shape, Layout, Stability…) and in it a
  // folder per flag with its Flag switch (Off / On), its Show me and its settings.
  // ` (backquote) opens and closes it. The picks live in the registry
  // (registry.svelte.js), which remembers them; the panel only mirrors them,
  // both ways, so a flag turned on by code (a Show me, setFlag) shows here too.
  //
  // While a Show me runs, a small card says what to look at and holds its
  // Guides, Replay, Again and Done, with the flag's own switch to compare;
  // the panel folds down to that flag and moves off what's being shown.
  import { onMount, tick, untrack } from 'svelte';
  import { DialRoot, DialStore, createDialKitController } from 'dialkit/svelte';
  import { FLAGS, flags } from './registry.svelte.js';
  import { SHOWS, current, showMe, stopShow, replay, resumePending } from './show/show.svelte.js';
  import { uiZoom } from '../lib/uizoom.svelte.js';

  const PANEL = 'interlude-flags';
  const NAME = 'UI audit';

  // DialKit labels a control by its key, spaced before each capital
  // ("BPM" becomes "B P M"). Here a key is its label exactly as written.
  const store = /** @type {any} */ (DialStore);
  if (!store.__asWritten) {
    const parse = store.parseConfig.bind(store);
    const relabel = (/** @type {any[]} */ list) =>
      list.forEach((c) => {
        if (c.type !== 'action') c.label = c.path.slice(c.path.lastIndexOf('.') + 1);
        if (c.children) relabel(c.children);
      });
    store.parseConfig = (config, shortcuts) => {
      const out = parse(config, shortcuts);
      relabel(out.controls);
      return out;
    };
    store.__asWritten = true;
  }

  // A key can't hold a '.', which DialKit uses between folders.
  const key = (/** @type {string} */ s) => s.replaceAll('.', '․');
  const groupOf = (f) => key(f.group ?? 'Other');
  const folderOf = (f) => key(`${f.n} ${f.title}`);
  const groups = [...new Set(FLAGS.map(groupOf))];

  /** @type {{ path: string, id: string, k?: string, options?: any[] }[]} what each control drives */
  const binds = [];
  /** @type {Map<string, string>} a Show me's path → its flag */
  const shows = new Map();
  /** @type {Record<string, any>} */
  const config = { 'All on': { type: 'action' }, 'All off': { type: 'action' } };
  for (const g of groups) {
    /** @type {Record<string, any>} */
    const gc = {};
    for (const f of FLAGS.filter((x) => groupOf(x) === g)) {
      const base = `${g}.${folderOf(f)}`;
      /** @type {Record<string, any>} */
      const fc = { _collapsed: true, Flag: !!flags.on[f.id] };
      binds.push({ path: `${base}.Flag`, id: f.id });
      if (SHOWS[f.id]) {
        fc['Show me'] = { type: 'action', label: 'Show me' };
        shows.set(`${base}.Show me`, f.id);
      }
      for (const [k, s] of Object.entries(f.settings ?? {})) {
        const label = key(s.label ?? k) + (s.unit ? ` (${s.unit})` : '');
        const v = flags.settings[f.id][k];
        if (s.type === 'choice') {
          fc[label] = { type: 'select', options: s.options.map(([value, l]) => ({ value: String(value), label: l })), default: String(v) };
          binds.push({ path: `${base}.${label}`, id: f.id, k, options: s.options.map(([value]) => value) });
        } else {
          fc[label] = [v, s.min, s.max, s.step];
          binds.push({ path: `${base}.${label}`, id: f.id, k });
        }
      }
      gc[folderOf(f)] = fc;
    }
    config[g] = gc;
  }

  const dial = createDialKitController(NAME, config, { id: PANEL, onAction: act });

  function act(/** @type {string} */ path) {
    if (path === 'All on' || path === 'All off') FLAGS.forEach((f) => (flags.on[f.id] = path === 'All on'));
    else if (shows.has(path)) showMe(/** @type {string} */ (shows.get(path)));
  }

  const value = (b) => (b.k ? flags.settings[b.id][b.k] : !!flags.on[b.id]);
  const asPanel = (b, v) => (b.options ? String(v) : v);
  // The picks into the panel (after DialKit has registered it, above).
  $effect(() => {
    const want = binds.map((b) => asPanel(b, value(b)));
    untrack(() => {
      const have = DialStore.getValues(PANEL);
      binds.forEach((b, i) => {
        if (have[b.path] !== undefined && have[b.path] !== want[i]) DialStore.updateValue(PANEL, b.path, want[i]);
      });
    });
  });
  // And what's changed in the panel into the picks.
  $effect(() =>
    DialStore.subscribe(PANEL, () => {
      const have = DialStore.getValues(PANEL);
      for (const b of binds) {
        let v = have[b.path];
        if (v === undefined || v === asPanel(b, value(b))) continue;
        if (b.options) v = b.options.find((o) => String(o) === v) ?? v;
        if (b.k) flags.settings[b.id][b.k] = v;
        else flags.on[b.id] = !!v;
      }
    }),
  );

  // On flags get a dot by their name, and each group and the panel a count.
  const count = $derived(FLAGS.filter((f) => flags.on[f.id]).length);
  const sel = (label) => `.dialkit-root .dialkit-folder-header-top[aria-label="${CSS.escape(label)}"] .dialkit-folder-title`;
  const marks = $derived.by(() => {
    let css = `${sel(NAME)}::after { content: "${count} of ${FLAGS.length} on"; }\n`;
    for (const g of groups) {
      const n = FLAGS.filter((f) => groupOf(f) === g && flags.on[f.id]).length;
      if (n) css += `${sel(g)}::after { content: "${n} on"; }\n`;
    }
    for (const f of FLAGS) if (flags.on[f.id]) css += `${sel(folderOf(f))}::before { content: ""; background: #3ec6ff; }\n`;
    // While a Show me runs the panel folds down to that flag: its group's
    // folder and its own, nothing else.
    const f = current.id && FLAGS.find((x) => x.id === current.id);
    if (f) {
      const keep = [NAME, groupOf(f), folderOf(f)].map((l) => `:not([aria-label="${CSS.escape(l)}"])`).join('');
      css += `.dialkit-root .dialkit-folder:has(> .dialkit-folder-header > .dialkit-folder-header-top${keep}), .dialkit-root .dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner > .dialkit-button { display: none; }\n`;
    }
    return css;
  });

  // The browser preview zooms the interface with CSS zoom on <html>; the
  // panel and the card keep their own size by undoing it.
  const unzoom = $derived((uiZoom.scale, 1 / (Number(document.documentElement.style.zoom) || 1)));

  // Each flag's notes, as the tooltip of its folder.
  const notes = new Map(FLAGS.filter((f) => f.notes).map((f) => [folderOf(f), f.notes]));
  onMount(() => {
    const label = () => {
      for (const el of document.querySelectorAll('.dialkit-root .dialkit-folder-header-top:not([title])')) {
        const n = notes.get(el.getAttribute('aria-label') ?? '');
        el.setAttribute('title', n ?? '');
      }
    };
    const mo = new MutationObserver(label);
    mo.observe(document.body, { childList: true, subtree: true });
    resumePending().then((id) => id && dial.setOpen(true));
    return () => mo.disconnect();
  });

  function keydown(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '`' || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
    e.preventDefault();
    dial.setOpen(!dial.getOpen());
  }

  // ── While a Show me runs ──────────────────────────────────────────────
  const showing = $derived(current.id ? FLAGS.find((f) => f.id === current.id) : null);
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
  const header = (label) => /** @type {HTMLElement | null} */ (document.querySelector(`.dialkit-root .dialkit-folder-header-top[aria-label="${CSS.escape(label)}"]`));
  const isOpen = (label) => header(label)?.getAttribute('aria-expanded') === 'true';
  function setFolder(label, open) {
    const h = header(label);
    if (h && isOpen(label) !== open) h.click();
  }
  /** The folders a show opened, closed again after it. */
  let opened = /** @type {string[]} */ ([]);
  async function focus(id) {
    const f = FLAGS.find((x) => x.id === id);
    if (!f) return;
    dial.setOpen(true);
    for (const label of [groupOf(f), folderOf(f)]) {
      await tick();
      await frame();
      if (!isOpen(label)) (setFolder(label, true), opened.push(label));
    }
  }
  function unfold() {
    for (const label of opened.reverse()) setFolder(label, false);
    opened = [];
  }
  $effect(() => {
    const id = current.id;
    untrack(() => (id ? focus(id) : unfold()));
  });

  // Keeping off the targets: the panel moves to a free corner (and back
  // after), the card takes the first free spot along the window's edges.
  const M = 16;
  const hits = (r, avoid) => avoid.some((a) => r.x < a.right && r.x + r.w > a.left && r.y < a.bottom && r.y + r.h > a.top);
  const panelEl = () => /** @type {HTMLElement | null} */ (document.querySelector('.dialkit-root .dialkit-panel'));
  let home = /** @type {string | null} */ (null);
  let card = $state(/** @type {HTMLElement | null} */ (null));
  let cardAt = $state(/** @type {{ x: number, y: number } | null} */ (null));
  function place() {
    if (!current.id) return;
    const avoid = current.avoid;
    const p = panelEl();
    if (p) {
      const r = p.getBoundingClientRect();
      if (p.dataset.position && hits({ x: r.left, y: r.top, w: r.width, h: r.height }, avoid)) {
        const corners = {
          'top-right': { x: innerWidth - M - r.width, y: M },
          'top-left': { x: M, y: M },
          'bottom-left': { x: M, y: innerHeight - M - r.height },
          'bottom-right': { x: innerWidth - M - r.width, y: innerHeight - M - r.height },
        };
        const free = Object.entries(corners).find(([, c]) => !hits({ ...c, w: r.width, h: r.height }, avoid));
        if (free) {
          home ??= p.dataset.position;
          p.dataset.position = free[0];
        }
      }
    }
    if (card) {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const pr = p?.getBoundingClientRect();
      // The app's toast too: shows often bring one up.
      const toast = document.querySelector('.toastbox .toast')?.getBoundingClientRect();
      const avoidAll = [...avoid, ...(pr && pr.width > 60 ? [pr] : []), ...(toast ? [toast] : [])];
      const spots = [
        { x: (innerWidth - w) / 2, y: innerHeight - M - h },
        { x: (innerWidth - w) / 2, y: M },
        { x: M, y: innerHeight - M - h },
        { x: M, y: M },
        { x: innerWidth - M - w, y: innerHeight - M - h },
        { x: innerWidth - M - w, y: M },
      ];
      cardAt = spots.find((s) => !hits({ ...s, w, h }, avoidAll)) ?? spots[0];
    }
  }
  $effect(() => {
    if (!current.id) {
      cardAt = null;
      const p = panelEl();
      if (p && home) p.dataset.position = home;
      home = null;
      return;
    }
    void current.avoid;
    void card;
    place();
    const t = setInterval(place, 400);
    return () => clearInterval(t);
  });
</script>

<svelte:window onkeydown={keydown} onresize={place} />
<svelte:head>
  {@html `<style data-flag-dials>
.dialkit-root { zoom: ${unzoom}; }
.dialkit-root .dialkit-folder-title-row { min-width: 0; }
.dialkit-root .dialkit-folder .dialkit-folder .dialkit-folder-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dialkit-root .dialkit-folder-title::after { margin-left: 8px; color: rgb(255 255 255 / 0.4); font-weight: 400; }
.dialkit-root .dialkit-folder-title::before { display: inline-block; width: 6px; height: 6px; margin: 0 6px 1px 0; border-radius: 3px; vertical-align: middle; }
${marks}</style>`}
</svelte:head>

<DialRoot position="bottom-right" theme="dark" versions="menu" defaultOpen={false} />

<div class="flag-dials" style:zoom={unzoom === 1 ? undefined : unzoom}>
  {#if showing}
    <div class="card" role="status" aria-live="polite" bind:this={card}
      style:left={cardAt ? `${cardAt.x}px` : undefined} style:top={cardAt ? `${cardAt.y}px` : undefined} data-placed={cardAt ? '' : undefined}>
      <div class="head">
        <span class="n">{showing.n}</span>
        <b>{showing.title}</b>
        <label class="sw" title="Turn the flag off and on to compare">
          <input type="checkbox" bind:checked={flags.on[showing.id]} />
          <span aria-hidden="true"><i></i></span>
          {flags.on[showing.id] ? 'On' : 'Off'}
        </label>
      </div>
      <p>{#if current.busy}Setting up…{:else}{current.note}{/if}</p>
      {#if current.error}<p class="err">{current.error}</p>{/if}
      <div class="acts">
        {#if current.hasAid}
          <button type="button" aria-pressed={current.aid} onclick={() => (current.aid = !current.aid)}>Guides</button>
        {/if}
        {#if current.hasReplay}<button type="button" onclick={replay}>Replay</button>{/if}
        <button type="button" onclick={() => showMe(showing.id)}>Again</button>
        <button type="button" class="done" onclick={stopShow}>Done</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .flag-dials {
    position: fixed;
    inset: 0;
    z-index: 10000;
    pointer-events: none;
    /* The app's own UI font (app.css), with its fallbacks. */
    font: 400 13px/18px var(--font, 'Geist Variable', 'Helvetica Neue', Arial, sans-serif);
    font-variant-numeric: normal;
    letter-spacing: normal;
    text-transform: none;
    color: #ededed;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    position: absolute;
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    width: 380px;
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 14px;
    background: rgb(22 22 22 / 0.92);
    backdrop-filter: blur(12px);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 16px 48px rgb(0 0 0 / 0.55);
    pointer-events: auto;
  }
  .card[data-placed] {
    bottom: auto;
    translate: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .head b {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    color: rgb(255 255 255 / 0.45);
    font: 500 12px ui-monospace, Menlo, monospace;
  }
  p {
    margin: 0;
    font-size: 12px;
    line-height: 17px;
    color: rgb(255 255 255 / 0.7);
  }
  .err {
    color: #ff8a7f;
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.08);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    color: inherit;
    cursor: pointer;
  }
  button:hover {
    background: rgb(255 255 255 / 0.14);
  }
  button[aria-pressed='true'] {
    background: #ededed;
    color: #111;
  }
  .done {
    margin-left: auto;
  }
  .sw {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: rgb(255 255 255 / 0.7);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .sw input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .sw span {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
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
  .sw:has(input:checked) span {
    background: #3ec6ff;
  }
  .sw:has(input:checked) i {
    translate: 12px 0;
  }
  .sw:has(input:focus-visible) span {
    outline: 2px solid #3ec6ff;
    outline-offset: 2px;
  }
</style>
