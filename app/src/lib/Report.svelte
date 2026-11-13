<script>
  import { onMount } from 'svelte';
  import { saveReport, reveal } from './support.svelte.js';

  /**
   * Report a problem: the tester says what happened, and the app saves a
   * file with that, the system and the logs, ready to send.
   * @type {{ onclose: () => void, context: () => Promise<string> }}
   */
  let { onclose, context } = $props();

  let description = $state('');
  let saving = $state(false);
  let saved = $state('');
  let error = $state('');
  let field = $state();

  const fileName = (p) => p.split(/[\\/]/).pop();

  async function save() {
    saving = true;
    error = '';
    try {
      saved = await saveReport(description, await context());
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }

  function key(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
    // Keep the deck keys from firing while typing.
    e.stopPropagation();
  }

  onMount(() => {
    const back = document.activeElement;
    field?.focus();
    return () => /** @type {HTMLElement} */ (back)?.focus?.();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onkeydown={key} onkeyup={(e) => e.stopPropagation()}>
  <div class="card" role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1">
    <div class="top">
      <h2 id="report-title">{saved ? 'Report saved' : 'Report a problem'}</h2>
      <button class="close" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>

    {#if saved}
      <p class="lead">It's on your Desktop as <b>{fileName(saved)}</b>. Send it to whoever gave you the beta.</p>
      <div class="actions">
        <button class="btn ghost" onclick={() => reveal(saved)}>Show in Finder</button>
        <button class="btn" onclick={onclose}>Done</button>
      </div>
    {:else}
      <p class="lead">Say what you were doing and what went wrong. The report also includes the app's logs and your system, but no music files.</p>
      <textarea aria-label="What happened" bind:this={field} bind:value={description} rows="6"
        placeholder="e.g. I loaded a track on deck B while A was playing and the audio cut out"></textarea>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn ghost" onclick={onclose}>Cancel</button>
        <button class="btn" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save report'}</button>
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
    width: min(480px, 100%);
    padding: 24px 28px 28px;
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
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: var(--t-lg, 16px);
    font-weight: 500;
    color: var(--fg);
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
  .close svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .lead {
    margin: 0 0 16px;
    color: var(--fg-2);
    line-height: 1.5;
  }
  .lead b {
    color: var(--fg);
    font-weight: 500;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.3);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font: inherit;
    line-height: 1.5;
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 2px solid var(--fg-3);
    outline-offset: 1px;
  }
  textarea::placeholder {
    color: var(--fg-3);
  }
  .error {
    margin: 8px 0 0;
    color: var(--kill);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
</style>
