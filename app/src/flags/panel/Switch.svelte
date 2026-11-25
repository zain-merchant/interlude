<script>
  // An on/off switch (the panel's and the show card's). A real checkbox
  // underneath, so it takes focus, Space and a label.
  /** @type {{ checked: boolean, label: string, onchange?: (v: boolean) => void, small?: boolean }} */
  let { checked = $bindable(), label, onchange, small = false } = $props();
</script>

<label class="fp-switch" class:small title={label}>
  <input type="checkbox" bind:checked aria-label={label} onchange={() => onchange?.(checked)} />
  <span aria-hidden="true"><i></i></span>
</label>

<style>
  .fp-switch {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  span {
    position: relative;
    width: 30px;
    height: 18px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.14);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    transition: background-color 0.2s var(--fp-ease);
  }
  .small span {
    width: 26px;
    height: 16px;
  }
  i {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
    transition: translate 0.2s var(--fp-ease);
  }
  .small i {
    width: 12px;
    height: 12px;
  }
  .fp-switch:has(input:checked) span {
    background: var(--fp-accent);
  }
  .fp-switch:has(input:checked) i {
    translate: 12px 0;
  }
  .small:has(input:checked) i {
    translate: 10px 0;
  }
  .fp-switch:has(input:focus-visible) span {
    outline: 2px solid var(--fp-accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    span,
    i {
      transition: none;
    }
  }
</style>
