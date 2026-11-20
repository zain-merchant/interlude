<script>
  import { onMount } from 'svelte';
  import { backend } from './backend.js';
  import { announce } from './announce.svelte.js';
  import { flag } from '../flags/registry.svelte.js';

  /**
   * Bringing another app's library over, one calm step at a time: find it,
   * see what's in it, choose what to bring, import, done. Lives in its own
   * window so the main screen stays uncluttered; onboarding can show it too.
   * @type {{ onclose: () => void, ondone?: () => void }}
   */
  let { onclose, ondone } = $props();

  /** @type {'find' | 'reading' | 'choose' | 'running' | 'done'} */
  let step = $state(/** @type {'find' | 'reading' | 'choose' | 'running' | 'done'} */ ('find'));
  /** @type {{ source: import('./backend.js').ImportSource, modified: number }[]} */
  let found = $state([]);
  let searching = $state(true);
  /** @type {import('./backend.js').ImportSource | null} */
  let source = $state(null);
  /** @type {import('./backend.js').ImportPreview | null} */
  let preview = $state(null);
  let options = $state({ cues: true, grids: true, playlists: true });
  /** Folders to add, each on or off. */
  let folders = $state(/** @type {{ path: string, on: boolean }[]} */ ([]));
  let progress = $state({ done: 0, total: 1 });
  /** @type {import('./backend.js').ImportSummary | null} */
  let summary = $state(null);
  let error = $state('');
  let root;

  const STEPS = ['find', 'choose', 'running', 'done'];
  const stepIndex = $derived(STEPS.indexOf(step === 'reading' ? 'find' : step));
  const n = (x) => x.toLocaleString();
  const plural = (x, one, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
  const fileName = (p) => p.split(/[\\/]/).pop();
  const where = (p) => p.split(/[\\/]/).slice(0, -1).join('/').replace(/^\/Users\/[^/]+/, '~');
  const ago = (ms, verb) => {
    const h = (Date.now() - ms) / 3600e3;
    if (h < 1) return `${verb} just now`;
    // #29 (UI audit flag): import-links: hours in words.
    if (h < 24 && flag('import-links')) return `${verb} ${Math.round(h)} ${Math.round(h) === 1 ? 'hour' : 'hours'} ago`;
    if (h < 24) return `${verb} ${Math.round(h)} h ago`;
    if (h < 48) return `${verb} yesterday`;
    return `${verb} ${new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  const APPS = /** @type {const} */ ([
    { kind: 'rekordbox', name: 'Rekordbox', note: '5, 6 and 7', verb: 'exported', other: 'Use a different file…' },
    { kind: 'serato', name: 'Serato DJ', note: 'Pro and Lite', verb: 'updated', other: 'Choose a different _Serato_ folder…' },
  ]);
  // #29 (UI audit flag): import-links: the brand's own spelling (rekordbox), one verb on the
  // "different" links, and the versions in words.
  const APPS_29 = /** @type {const} */ ([
    { kind: 'rekordbox', name: 'rekordbox', note: 'versions 5, 6 and 7', verb: 'exported', other: 'Choose a different file…' },
    { kind: 'serato', name: 'Serato DJ', note: 'Pro and Lite', verb: 'updated', other: 'Choose a different folder…' },
  ]);
  const apps = $derived(flag('import-links') ? APPS_29 : APPS);
  const appName = $derived(source?.kind === 'serato' ? 'Serato' : flag('import-links') ? 'rekordbox' : 'Rekordbox');
  // #27 (UI audit flag): primary-button: the most recently exported library found is the one main action.
  const newest = $derived(found.reduce((a, f) => (!a || f.modified > a.modified ? f : a), null));
  const foundFor = (kind) => found.filter((f) => f.source.kind === kind).slice(0, kind === 'rekordbox' ? 1 : 3);
  /** What a found library is called: the file, or for Serato where it lives. */
  const title = (src) => {
    if (src.kind === 'rekordbox') return fileName(src.path);
    // #29 (UI audit flag): import-links: named as the thing found, like rekordbox.xml; where it is goes on the line below.
    if (flag('import-links')) return 'Serato folder';
    const drive = src.path.match(/^\/Volumes\/([^/]+)\//);
    return drive ? `On ${drive[1]}` : 'In your Music folder';
  };

  async function read(s) {
    source = s;
    error = '';
    step = 'reading';
    try {
      preview = await backend.importPreview(s);
      folders = preview.folders.map((path) => ({ path, on: true }));
      options = { cues: preview.withCues > 0, grids: preview.grids > 0, playlists: preview.playlists.length > 0 };
      step = 'choose';
      announce(`Found ${plural(preview.tracks, 'track')} in ${appName}`);
    } catch (e) {
      error = String(e);
      step = 'find';
    }
  }

  /** @param {'rekordbox' | 'serato'} kind */
  async function choose(kind) {
    const path = kind === 'serato' ? await backend.pickSeratoFolder() : await backend.pickRekordboxXml();
    if (path) read({ kind, path });
  }

  async function run() {
    step = 'running';
    progress = { done: 0, total: 1 };
    try {
      summary = await backend.importRun(source, $state.snapshot(options), folders.filter((f) => f.on).map((f) => f.path));
      step = 'done';
      announce('Import finished');
      ondone?.();
    } catch (e) {
      error = String(e);
      step = 'choose';
    }
  }

  function key(e) {
    if (e.key === 'Escape' && step !== 'running') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }

  onMount(() => {
    const back = document.activeElement;
    root.focus();
    backend.importSources().then((f) => {
      found = f;
      searching = false;
    });
    const off = backend.onImportProgress((p) => (progress = p));
    return () => {
      off.then((f) => f());
      /** @type {HTMLElement} */ (back)?.focus?.();
    };
  });

  const pct = $derived(Math.min(100, Math.round((progress.done / Math.max(1, progress.total)) * 100)));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onkeydown={key}>
  <div class="card" role="dialog" aria-modal="true" aria-labelledby="import-title" tabindex="-1" bind:this={root}>
    <div class="top">
      <ol class="steps" aria-label="Step {stepIndex + 1} of {STEPS.length}">
        {#each STEPS as s, i}<li class:on={i <= stepIndex}></li>{/each}
        <!-- #29 (UI audit flag): import-links: the step in words beside the dashes. -->
        {#if flag('import-links')}<li class="of num" aria-hidden="true">{stepIndex + 1} of {STEPS.length}</li>{/if}
      </ol>
      {#if step !== 'running'}
        <button class="close" onclick={onclose} aria-label="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      {/if}
    </div>

    {#if step === 'find' || step === 'reading'}
      <h2 id="import-title">Bring your library over</h2>
      <p class="lead">Your cue points, loops, beatgrids and playlists come with your tracks. Your music files aren't changed.</p>

      {#each apps as app}
        {@const mine = foundFor(app.kind)}
        <div class="source" aria-busy={(step === 'reading' && source?.kind === app.kind) || searching}>
          <div class="src-head">
            <span class="src-name">{app.name}</span>
            <span class="src-note">{app.note}</span>
          </div>
          {#if step === 'reading' && source?.kind === app.kind}
            <div class="reading"><span class="spinner" aria-hidden="true"></span>Reading your {app.name} library…</div>
          {:else if searching}
            <div class="reading"><span class="spinner" aria-hidden="true"></span>Looking for your library…</div>
          {:else if mine.length}
            {#each mine as f}
              <button class="found" onclick={() => read(f.source)} disabled={step === 'reading'}>
                <span class="file">
                  <b>{title(f.source)}</b>
                  <!-- #29 (UI audit flag): import-links: where, and when, each on its own line. -->
                  {#if flag('import-links')}
                    <small>{where(f.source.path)}{f.source.kind === 'serato' ? `/${fileName(f.source.path)}` : ''}</small>
                    <small class="when">{ago(f.modified, app.verb)}</small>
                  <!-- #10 (UI audit flag): where and when set apart by space, not a middle dot. -->
                  {:else if flag('no-dots')}
                    <small>{where(f.source.path)}{f.source.kind === 'serato' ? `/${fileName(f.source.path)}` : ''} <span class="when">{ago(f.modified, app.verb)}</span></small>
                  {:else}
                  <small>{where(f.source.path)}{f.source.kind === 'serato' ? `/${fileName(f.source.path)}` : ''} · {ago(f.modified, app.verb)}</small>
                  {/if}
                </span>
                <!-- #27 (UI audit flag): primary-button: "Import" on each, the solid chip on the newest only. -->
                {#if flag('primary-button')}<span class="go" class:primary={f === newest}>Import</span>{:else}<span class="go">Continue</span>{/if}
              </button>
            {/each}
            <button class="link" onclick={() => choose(app.kind)} disabled={step === 'reading'}>{app.other}</button>
          {:else}
            <ol class="how">
              {#if app.kind === 'rekordbox'}
                <li>In {flag('import-links') ? 'rekordbox' : 'Rekordbox'}, choose <b>File › Export Collection in xml format</b>.</li>
                <li>Save it anywhere, then choose it here.</li>
              {:else}
                <li>Open Serato DJ on this computer once, so it saves your library.</li>
                <li>For a library on a drive, choose the drive's <b>_Serato_</b> folder.</li>
              {/if}
            </ol>
            <button class="btn sm" onclick={() => choose(app.kind)} disabled={step === 'reading'}>{app.kind === 'serato' ? 'Choose folder…' : 'Choose file…'}</button>
          {/if}
        </div>
      {/each}
      {#if error}<p class="error" role="alert">{error}</p>{/if}

    {:else if step === 'choose' && preview}
      <h2 id="import-title">{plural(preview.tracks, 'track')} in {appName}</h2>
      <p class="lead">Choose what to bring over. Anything you've already set in Interlude stays as it is.</p>

      <div class="options">
        <label class="opt" class:off={!preview.withCues}>
          <input type="checkbox" bind:checked={options.cues} disabled={!preview.withCues} />
          <span class="what">Cue points and loops</span>
          <span class="count num">{n(preview.withCues)} tracks</span>
        </label>
        <label class="opt" class:off={!preview.grids}>
          <input type="checkbox" bind:checked={options.grids} disabled={!preview.grids} />
          <span class="what">Beatgrids</span>
          <span class="count num">{n(preview.grids)} tracks</span>
        </label>
        <label class="opt" class:off={!preview.playlists.length}>
          <input type="checkbox" bind:checked={options.playlists} disabled={!preview.playlists.length} />
          <span class="what">{source?.kind === 'serato' ? 'Crates, as playlists' : 'Playlists'}</span>
          <span class="count num">{n(preview.playlists.length)}</span>
        </label>
      </div>

      {#if folders.length}
        <h3>Add these folders to your library</h3>
        <div class="folders">
          {#each folders as f}
            <label class="folder">
              <input type="checkbox" bind:checked={f.on} />
              <span>{f.path.replace(/^\/Users\/[^/]+/, '~')}</span>
            </label>
          {/each}
        </div>
      {/if}
      {#if preview.missing}
        <p class="note">{plural(preview.missing, 'track')} {preview.missing === 1 ? "isn't" : "aren't"} on this computer right now. {source?.kind === 'serato'
          ? 'Serato keeps cues inside the music files, so those come over without them.'
          : 'Their cues come along and are ready when the files are back.'}</p>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="actions">
        <button class="btn" onclick={() => (step = 'find')}>Back</button>
        <button class="btn primary" onclick={run} disabled={!options.cues && !options.grids && !options.playlists && !folders.some((f) => f.on)}>Import</button>
      </div>

    {:else if step === 'running'}
      <h2 id="import-title">Importing…</h2>
      <p class="lead">This takes a moment for a big collection. The decks keep playing.</p>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-label="Import progress">
        <i style:width="{pct}%"></i>
      </div>
      <p class="num sub">{n(Math.min(progress.done, progress.total))} of {n(progress.total)}</p>

    {:else if step === 'done' && summary}
      <div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
      <h2 id="import-title">Your {appName} library is in</h2>
      <dl class="summary">
        <div><dt class="num">{n(summary.tracks)}</dt><dd>tracks</dd></div>
        {#if options.cues}<div><dt class="num">{n(summary.cues)}</dt><dd>with cue points</dd></div>{/if}
        {#if options.grids}<div><dt class="num">{n(summary.grids)}</dt><dd>beatgrids</dd></div>{/if}
        {#if options.playlists}<div><dt class="num">{n(summary.playlists)}</dt><dd>new playlists</dd></div>{/if}
      </dl>
      {#if summary.kept}
        <p class="note">{plural(summary.kept, 'track')} kept the cues or beatgrid you'd already set in Interlude.</p>
      {/if}
      <div class="actions">
        <button class="btn primary" onclick={onclose}>Done</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(5 5 6 / 0.72);
    backdrop-filter: blur(6px);
    animation: fade 0.16s ease-out;
  }
  .card {
    width: min(560px, 100%);
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 28px 32px 32px;
    border-radius: 14px;
    background: #121214;
    box-shadow: inset 0 0 0 1px var(--line-2), 0 24px 80px rgb(0 0 0 / 0.5);
    animation: rise 0.2s ease-out;
    outline: none;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px) scale(0.99); }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop, .card { animation: none; }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    margin-bottom: 20px;
  }
  .steps {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    width: 18px;
    height: 3px;
    border-radius: 2px;
    background: var(--line-2);
    transition: background-color 0.2s;
  }
  .steps li.on {
    background: var(--fg-2);
  }
  .close {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
  }
  .close:hover {
    background: var(--raise);
    color: var(--fg);
  }
  .close svg, .tick svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
  }
  h3 {
    margin: 24px 0 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-3);
  }
  .lead {
    margin: 8px 0 24px;
    color: var(--fg-2);
    line-height: 1.5;
  }
  .source {
    padding: 18px;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .source + .source {
    margin-top: 12px;
  }
  .found + .found {
    margin-top: 8px;
  }
  .found:disabled, .link:disabled {
    opacity: 0.5;
  }
  .src-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 14px;
  }
  .src-name {
    font-weight: 500;
    color: var(--fg);
  }
  .src-note {
    font-size: 11px;
    color: var(--fg-3);
  }
  .found {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 0;
    border-radius: 8px;
    background: var(--raise);
    color: inherit;
    font: inherit;
    text-align: left;
    transition: box-shadow 0.12s;
  }
  .found:hover {
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .file {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .file b {
    font-weight: 500;
    color: var(--fg);
  }
  .file small {
    color: var(--fg-3);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go {
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--fg);
    color: var(--bg);
    font-weight: 500;
    font-size: 12px;
  }
  .link {
    margin-top: 10px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg-3);
    font: inherit;
    font-size: 12px;
  }
  .link:hover {
    color: var(--fg-2);
  }
  .how {
    margin: 0 0 16px;
    padding-left: 18px;
    color: var(--fg-2);
    line-height: 1.7;
  }
  .how b {
    font-weight: 500;
    color: var(--fg);
  }
  .reading {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    color: var(--fg-2);
  }
  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid var(--line-2);
    border-top-color: var(--fg-2);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .options {
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    cursor: pointer;
  }
  .opt + .opt {
    border-top: 1px solid var(--line);
  }
  .opt.off {
    opacity: 0.45;
    cursor: default;
  }
  .what {
    flex: 1;
    color: var(--fg);
  }
  .count {
    color: var(--fg-3);
  }
  input[type='checkbox'] {
    appearance: none;
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--fg-4);
    display: grid;
    place-items: center;
    transition: background-color 0.12s, box-shadow 0.12s;
  }
  input[type='checkbox']:checked {
    background: var(--fg);
    box-shadow: none;
  }
  input[type='checkbox']:checked::after {
    content: '';
    width: 8px;
    height: 4px;
    margin-top: -2px;
    border-left: 1.6px solid var(--bg);
    border-bottom: 1.6px solid var(--bg);
    transform: rotate(-45deg);
  }
  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .folders {
    display: grid;
    gap: 2px;
  }
  .folder {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 2px;
    color: var(--fg-2);
    cursor: pointer;
  }
  .folder span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    margin: 16px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--fg-3);
  }
  .error {
    margin: 14px 0 0;
    color: var(--kill);
    font-size: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 28px;
  }
  .btn.primary {
    background: var(--fg);
    color: var(--bg);
    box-shadow: none;
  }
  .btn.primary:hover:not(:disabled) {
    background: #fff;
    color: var(--bg);
    box-shadow: none;
  }
  .bar {
    height: 4px;
    margin-top: 8px;
    border-radius: 2px;
    background: var(--line-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--fg);
    border-radius: 2px;
    transition: width 0.2s ease-out;
  }
  .sub {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--fg-3);
  }
  .tick {
    width: 40px;
    height: 40px;
    margin-bottom: 18px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--go) 16%, transparent);
    color: var(--go);
  }
  .tick svg {
    width: 20px;
    height: 20px;
    stroke-width: 2;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 12px;
    margin: 22px 0 0;
  }
  .summary div {
    padding: 14px;
    border-radius: 10px;
    background: var(--raise);
  }
  .summary dt {
    font-size: 22px;
    color: var(--fg);
    letter-spacing: -0.01em;
  }
  .summary dd {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--fg-3);
  }
</style>
