<script>
  // How stems work: what they are, then Fast, Efficient and Off, with what
  // each takes on this computer. The words are the Stems tab's.
  import { mac } from '../../lib/commands.js';
  import { STEMS_MODES, STEMS_OFF, STEMS_WHAT } from '../../lib/stemsmodel.js';
  import { takes } from '../../lib/stemsmeasured.js';

  /** @type {{ mode: import('../../lib/stemsmodel.js').StemsMode, figures: ReturnType<typeof import('../../lib/stemsmeasured.js').figures>, set: (mode: import('../../lib/stemsmodel.js').StemsMode) => void }} */
  let { mode, figures, set } = $props();
  // Each sentence stays whole where there's room for it.
  const ways = [...STEMS_MODES, { mode: /** @type {const} */ ('off'), name: 'Off', line: STEMS_OFF }].map((m) => ({ ...m, line: m.line.split(/(?<=\.) /) }));
</script>

<section class="display stemsway">
  <h3 id="stems-way">How stems work on {mac ? 'your Mac' : 'this computer'}</h3>
  <p>{STEMS_WHAT}</p>
  {#if figures.note}<p>{figures.note}</p>{/if}
  <div class="ways" role="radiogroup" aria-labelledby="stems-way">
    {#each ways as m (m.mode)}
      <label class="way" class:on={mode === m.mode}>
        <input type="radio" name="stems-way" checked={mode === m.mode} aria-describedby="stems-{m.mode}" onchange={() => set(m.mode)} />
        <span class="wn">{m.name}</span>
        <span class="wl" id="stems-{m.mode}">{#each m.line as s, i}{#if i}{' '}{/if}<span>{s}</span>{/each}</span>
        {#if m.mode !== 'off'}
          <span class="wf">{#each takes(m.mode, figures.takes) as [a, b]}<span><b>{a}</b>{' '}<small>{b}</small></span>{/each}</span>
        {/if}
      </label>
    {/each}
  </div>
  {#if mode === 'ask'}<p>Nothing is separated until you choose, here or in a deck's Stems tab.</p>{/if}
</section>
