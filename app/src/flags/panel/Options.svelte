<script>
  // A choice setting as a list: each option on its own line with its label,
  // "recommended" on the recommended one, and the sentence on what it does.
  // Clicking a line tries it live. Lock in marks the current pick as decided
  // (a lock beside it, the other lines quiet); Unlock is one click. A radio
  // group, so the arrow keys move the choice.
  import { flags, recommended, lockedAt, setLocked } from '../registry.svelte.js';

  /** @type {{ id: string, k: string, s: any }} */
  let { id, k, s } = $props();

  const value = $derived(flags.settings[id][k]);
  const rec = $derived(recommended(s));
  const lock = $derived(lockedAt(id, k));
  const locked = $derived(lock !== undefined);
  const i = $derived(Math.max(0, s.options.findIndex(([v]) => String(v) === String(value))));
  /** @type {HTMLElement[]} */
  const btns = $state([]);

  function pick(v) {
    if (locked) return;
    flags.settings[id][k] = v;
  }
  function key(e) {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d || locked) return;
    e.preventDefault();
    const n = (i + d + s.options.length) % s.options.length;
    pick(s.options[n][0]);
    btns[n]?.focus();
  }
</script>

<div class="fp-opts" class:locked>
  <div class="fp-opts-head">
    <span class="fp-label">{s.label ?? k}</span>
    <button type="button" class="fp-lock" aria-pressed={locked} onclick={() => setLocked(id, k, !locked)}
      title={locked ? 'Unlock: try the other options again' : 'Lock in: mark this pick as decided'}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
        {#if locked}<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />{:else}<path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />{/if}
      </svg>
      {locked ? 'Locked in' : 'Lock in'}
    </button>
  </div>
  <div role="radiogroup" aria-label={s.label ?? k}>
    {#each s.options as [v, label, explain], n (v)}
      {@const on = n === i}
      <button
        type="button"
        role="radio"
        class="fp-opt"
        class:on
        aria-checked={on}
        aria-disabled={locked && !on}
        tabindex={on ? 0 : -1}
        bind:this={btns[n]}
        onclick={() => pick(v)}
        onkeydown={key}
      >
        <i class="fp-radio" aria-hidden="true"></i>
        <span class="fp-opt-label">{label}</span>
        {#if String(v) === String(rec)}<span class="fp-rec">recommended</span>{/if}
        {#if locked && String(v) === String(lock)}
          <svg class="fp-opt-lock" viewBox="0 0 16 16" aria-label="locked in"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
        {/if}
        {#if explain}<span class="fp-explain">{explain}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  svg {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  button:focus-visible {
    outline: 2px solid var(--fp-accent);
    outline-offset: 1px;
  }
  .fp-opts {
    display: grid;
    gap: 4px;
  }
  .fp-opts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 22px;
  }
  .fp-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--fp-fg-3);
  }
  [role='radiogroup'] {
    display: grid;
    gap: 2px;
  }
  .fp-opt {
    display: grid;
    grid-template-columns: 14px auto auto 1fr;
    align-items: center;
    column-gap: 8px;
    row-gap: 1px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .fp-opt:hover:not([aria-disabled='true']) {
    background: rgb(255 255 255 / 0.05);
  }
  .fp-opt.on {
    background: rgb(255 255 255 / 0.08);
  }
  .fp-opt[aria-disabled='true'] {
    cursor: default;
    opacity: 0.45;
  }
  .fp-radio {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--fp-fg-3);
  }
  .on .fp-radio {
    box-shadow:
      inset 0 0 0 1.5px var(--fp-accent),
      inset 0 0 0 3.5px rgb(20 20 24),
      inset 0 0 0 6px var(--fp-accent);
  }
  .fp-opt-label {
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    color: var(--fp-fg-2);
  }
  .on .fp-opt-label {
    color: var(--fp-fg);
  }
  .fp-rec {
    padding: 0 6px;
    border-radius: 999px;
    background: rgb(79 227 155 / 0.12);
    font-size: 10.5px;
    font-weight: 500;
    line-height: 16px;
    color: #7fe9b4;
  }
  .fp-opt-lock {
    width: 13px;
    height: 13px;
    justify-self: end;
    color: var(--fp-fg);
  }
  .fp-explain {
    grid-column: 2 / -1;
    font-size: 11.5px;
    line-height: 16px;
    color: var(--fp-fg-3);
    text-wrap: pretty;
  }
  .on .fp-explain {
    color: var(--fp-fg-2);
  }
  .fp-lock {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px 0 6px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-size: 11px;
    font-weight: 500;
    color: var(--fp-fg-3);
    cursor: pointer;
  }
  .fp-lock svg {
    width: 13px;
    height: 13px;
  }
  .fp-lock:hover {
    background: rgb(255 255 255 / 0.06);
    color: var(--fp-fg);
  }
  .fp-lock[aria-pressed='true'] {
    background: rgb(255 255 255 / 0.1);
    color: var(--fp-fg);
  }
</style>
