<script>
  // A segmented choice in DialKit's manner: the options side by side, a
  // pill behind the chosen one that slides to the next. A radio group, so
  // the arrow keys move the choice.
  /** @type {{ value: any, options: [any, string][], label: string, onchange?: (v: any) => void }} */
  let { value = $bindable(), options, label, onchange } = $props();

  /** @type {HTMLElement[]} */
  const btns = $state([]);
  let box = /** @type {HTMLElement | null} */ ($state(null));
  let pill = $state({ x: 0, w: 0 });
  const i = $derived(Math.max(0, options.findIndex(([v]) => String(v) === String(value))));
  $effect(() => {
    void i;
    void options;
    const b = btns[i];
    if (b) pill = { x: b.offsetLeft, w: b.offsetWidth };
  });
  function pick(v) {
    value = v;
    onchange?.(v);
  }
  function key(e) {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    pick(options[n][0]);
    btns[n]?.focus();
  }
</script>

<div class="fp-seg" role="radiogroup" aria-label={label} bind:this={box}>
  <span class="pill" style:translate="{pill.x}px 0" style:width="{pill.w}px" aria-hidden="true"></span>
  {#each options as [v, text], n}
    <button
      type="button"
      role="radio"
      aria-checked={n === i}
      tabindex={n === i ? 0 : -1}
      bind:this={btns[n]}
      onclick={() => pick(v)}
      onkeydown={key}>{text}</button
    >
  {/each}
</div>

<style>
  .fp-seg {
    position: relative;
    display: flex;
    flex-wrap: nowrap;
    padding: 2px;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.05);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pill {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.13);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
    transition:
      translate 0.25s var(--fp-ease),
      width 0.25s var(--fp-ease);
  }
  button {
    position: relative;
    flex: 1 0 auto;
    height: 26px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: none;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--fp-fg-3);
    cursor: pointer;
    transition: color 0.15s;
  }
  button:hover {
    color: var(--fp-fg-2);
  }
  button[aria-checked='true'] {
    color: var(--fp-fg);
  }
  button:focus-visible {
    outline: 2px solid var(--fp-accent);
    outline-offset: -2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pill {
      transition: none;
    }
  }
</style>
