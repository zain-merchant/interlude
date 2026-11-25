<script>
  // How stems work: what they are, then Fast, Efficient and Off. The words
  // are the Stems tab's.
  import { mac } from '../../lib/commands.js';
  import { STEMS_MODES, STEMS_OFF, STEMS_WHAT } from '../../lib/stemsmodel.js';

  /** @type {{ mode: import('../../lib/stemsmodel.js').StemsMode, set: (mode: import('../../lib/stemsmodel.js').StemsMode) => void }} */
  let { mode, set } = $props();
  // Each sentence stays whole where there's room for it.
  const ways = [...STEMS_MODES, { mode: /** @type {const} */ ('off'), name: 'Off', line: STEMS_OFF }].map((m) => ({ ...m, line: m.line.split(/(?<=\.) /) }));
</script>

<section class="display stemsway">
  <h3 id="stems-way">When to make stems</h3>
  <p>{STEMS_WHAT}</p>
  <div class="ways" role="radiogroup" aria-labelledby="stems-way">
    {#each ways as m (m.mode)}
      <label class="way" class:on={mode === m.mode}>
        <input type="radio" name="stems-way" checked={mode === m.mode} aria-describedby="stems-{m.mode}" onchange={() => set(m.mode)} />
        <span class="wn">{m.name}</span>
        <span class="wl" id="stems-{m.mode}">{#each m.line as s, i}{#if i}{' '}{/if}<span>{s}</span>{/each}</span>
      </label>
    {/each}
  </div>
  {#if mode === 'ask'}<p>Nothing is separated until you choose, here or in a deck's Stems tab.</p>{/if}
</section>
