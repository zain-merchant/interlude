<script>
  // How stems work: what they are, then Fast, Efficient and Off.
  // Efficient is only there when the app can do it (it reports a `mode`), and
  // the figures only when they've been measured (`takes`).
  import { mac } from '../../lib/commands.js';
  import { INTRO, MODES, takes } from './stems.js';

  /** @type {{ stems: any, ready: boolean, set: (change: any) => void }} */
  let { stems, ready, set } = $props();
  const picks = $derived('mode' in stems);
  const modes = $derived(MODES.filter((m) => picks || m.mode !== 'efficient'));
  const on = $derived(!ready ? null : picks ? stems.mode : stems.enabled ? 'fast' : 'off');
  const pick = (/** @type {string} */ mode) => set(picks ? { mode } : { enabled: mode !== 'off' });
</script>

<section class="display stemsway">
  <h3 id="stems-way">How stems work on {mac ? 'your Mac' : 'this computer'}</h3>
  <p>{INTRO}</p>
  {#if !ready}<p class="needs">Download the separation model above to choose.</p>{/if}
  <div class="ways" role="radiogroup" aria-labelledby="stems-way" class:off={!ready}>
    {#each modes as m (m.mode)}
      <label class="way" class:on={on === m.mode}>
        <input type="radio" name="stems-way" checked={on === m.mode} disabled={!ready} aria-describedby="stems-{m.mode}" onchange={() => pick(m.mode)} />
        <span class="wn">{m.name}</span>
        <span class="wl" id="stems-{m.mode}">{m.line}</span>
        {#if takes(m.mode, stems.takes).length}
          <span class="wf">{#each takes(m.mode, stems.takes) as [a, b]}<span><b>{a}</b>{' '}<small>{b}</small></span>{/each}</span>
        {/if}
      </label>
    {/each}
  </div>
</section>
