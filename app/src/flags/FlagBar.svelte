<script>
  // The UI audit's toggle bar (dev builds only): a small bar at the bottom
  // right, out of the app's way, in the manner of Raphael Salaja's prototype switcher. It opens
  // a panel listing every flag by number, to turn on or off and tune.
  // ` (backquote) opens and closes it; the picks are remembered.
  import { FLAGS, flags } from './registry.svelte.js';

  let open = $state(false);
  let expanded = $state(/** @type {string | null} */ (null));
  const count = $derived(FLAGS.filter((f) => flags.on[f.id]).length);
  const groups = $derived([...new Set(FLAGS.map((f) => f.group ?? 'Other'))]);

  const all = (on) => FLAGS.forEach((f) => (flags.on[f.id] = on));
  function key(e) {
    if (e.key !== '`' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    open = !open;
  }
</script>

<svelte:window onkeydown={key} />

<div class="flagbar" data-open={open || undefined}>
  {#if open}
    <div class="panel" role="dialog" aria-label="UI audit flags">
      <header>
        <b>UI audit</b>
        <span>{count} of {FLAGS.length} on</span>
        <button type="button" onclick={() => all(true)}>All on</button>
        <button type="button" onclick={() => all(false)}>All off</button>
      </header>
      <div class="list">
        {#each groups as g}
          <div class="group">{g}</div>
          {#each FLAGS.filter((f) => (f.group ?? 'Other') === g) as f (f.id)}
            <div class="flag" data-on={flags.on[f.id] || undefined}>
              <label class="row">
                <input type="checkbox" bind:checked={flags.on[f.id]} />
                <span class="sw" aria-hidden="true"><i></i></span>
                <span class="n">{f.n}</span>
                <span class="t">{f.title}</span>
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
    font: 400 13px/20px 'Geist Variable', -apple-system, sans-serif;
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
    width: 440px;
    max-height: min(70vh, 640px);
    display: grid;
    grid-template-rows: auto 1fr;
    border-radius: 14px;
    background: #111;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 20px 60px rgb(0 0 0 / 0.6);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid rgb(255 255 255 / 0.08);
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
  .seg button {
    height: 26px;
    padding: 0 9px;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.08);
    font-size: 12px;
    font-weight: 500;
  }
  header button:hover,
  .more:hover,
  .seg button:hover {
    background: rgb(255 255 255 / 0.13);
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
  .row {
    display: grid;
    grid-template-columns: 30px 22px 1fr auto;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 6px 0 8px;
    cursor: pointer;
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
