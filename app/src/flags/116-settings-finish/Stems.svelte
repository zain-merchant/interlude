<script>
  // How stems work: what they are, then On and Off.
  import { mac } from '../../lib/commands.js';
  import { INTRO, WAYS } from './stems.js';

  /** @type {{ stems: any, ready: boolean, set: (change: any) => void }} */
  let { stems, ready, set } = $props();
</script>

<section class="display stemsway">
  <h3 id="stems-way">How stems work on {mac ? 'your Mac' : 'this computer'}</h3>
  <p>{INTRO}</p>
  {#if !ready}<p class="needs">Download the separation model above to choose.</p>{/if}
  <div class="ways" role="radiogroup" aria-labelledby="stems-way" class:off={!ready}>
    {#each WAYS as w (w.name)}
      {@const picked = ready && stems.enabled === w.on}
      <label class="way" class:on={picked}>
        <input type="radio" name="stems-way" checked={picked} disabled={!ready} aria-describedby="stems-{w.name}" onchange={() => set({ enabled: w.on })} />
        <span class="wn">{w.name}</span>
        <span class="wl" id="stems-{w.name}">{#each w.line as s, i}{#if i}{' '}{/if}<span>{s}</span>{/each}</span>
      </label>
    {/each}
  </div>
</section>
