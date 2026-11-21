<script>
  // Prototype only: live tuning for the record platters.
  import { platter, savePlatter, resetPlatter } from './platter.svelte.js';
  let open = $state(false);
  const RANGES = [
    { key: 'hub', label: 'Centre size', min: 50, max: 80, unit: '%' },
    { key: 'ringWidth', label: 'Waveform ring', min: 8, max: 28, unit: ' px' },
    { key: 'grooves', label: 'Grooves', min: 0, max: 100, unit: '%' },
    { key: 'sheen', label: 'Sheen', min: 0, max: 100, unit: '%' },
  ];
</script>

<aside class="dials" class:open>
  <button class="head" onclick={() => (open = !open)} aria-expanded={open}>
    Tune records
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
  </button>
  {#if open}
    <div class="body">
      {#each RANGES as r}
        <label class="dial">
          <span>{r.label}</span><output>{platter[r.key]}{r.unit}</output>
          <input type="range" min={r.min} max={r.max} step="1" bind:value={platter[r.key]} oninput={savePlatter} />
        </label>
      {/each}
      <div class="dial">
        <span>Speed</span>
        <div class="seg">
          {#each [[33.333, '33⅓ rpm'], [45, '45 rpm']] as [v, l]}
            <button class:on={platter.rpm === v} onclick={() => ((platter.rpm = v), savePlatter())}>{l}</button>
          {/each}
        </div>
      </div>
      <div class="dial">
        <span>Tonearm</span>
        <div class="seg">
          {#each [[true, 'On'], [false, 'Off']] as [v, l]}
            <button class:on={platter.arm === v} onclick={() => ((platter.arm = v), savePlatter())}>{l}</button>
          {/each}
        </div>
      </div>
      <button class="reset" onclick={resetPlatter}>Reset to defaults</button>
    </div>
  {/if}
</aside>

<style>
  .dials {
    position: fixed;
    z-index: 50;
    right: 20px;
    bottom: 20px;
    width: 236px;
    border-radius: 12px;
    background: rgb(24 24 27 / 0.94);
    backdrop-filter: blur(18px);
    box-shadow: var(--glass-edge);
    font-size: 12px;
    color: var(--fg-2);
  }
  .head {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 0;
    background: none;
    color: var(--fg);
    font: 500 13px var(--font);
    cursor: pointer;
  }
  .head svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    transition: transform 200ms ease;
  }
  .open .head svg {
    transform: rotate(180deg);
  }
  .body {
    padding: 0 12px 12px;
    display: grid;
    gap: 10px;
  }
  .dial {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 8px;
    align-items: center;
  }
  output {
    color: var(--fg);
  }
  input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
    accent-color: var(--fg);
  }
  .seg {
    grid-column: 1 / -1;
    display: flex;
    padding: 2px;
    border-radius: 8px;
    background: var(--well);
    box-shadow: var(--well-shadow);
  }
  .seg button {
    flex: 1;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    font: 400 12px var(--font);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--raise);
    color: var(--fg);
  }
  .reset {
    justify-self: start;
    border: 0;
    background: none;
    padding: 2px 0;
    color: var(--fg-3);
    font: 400 12px var(--font);
    cursor: pointer;
  }
  .reset:hover {
    color: var(--fg);
  }
</style>
