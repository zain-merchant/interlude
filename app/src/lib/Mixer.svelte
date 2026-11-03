<script>
  import Knob from './Knob.svelte';
  import Meter from './Meter.svelte';
  import Fader from './Fader.svelte';
  import { engine, control } from './engine.svelte.js';

  const KILL = -40;
  const channels = $state([0, 1].map(() => ({ gain: 0, eq: [0, 0, 0], fader: 1, pfl: false })));
  let master = $state(0);
  let cueMix = $state(0.5);
  let crossfader = $state(0);

  const db = (v) => (v <= KILL ? 'kill' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
  const accents = ['var(--deck-a)', 'var(--deck-b)'];

  export function setCrossfader(v) {
    crossfader = Math.max(-1, Math.min(1, v));
    control({ type: 'setCrossfader', value: crossfader });
  }

  // Sync initial values to the engine once.
  control({ type: 'setCueMix', value: 0.5 });
</script>

<section class="mixer">
  <div class="strips">
    {#each channels as ch, deck}
      <div class="strip" style:order={deck === 0 ? 0 : 2}>
        <Knob label="Trim" bind:value={ch.gain} min={-12} max={12} reset={0} bipolar size={30} format={db}
          onchange={(v) => control({ type: 'setGain', deck, db: v })} />
        {#each [{ label: 'Hi', band: 2 }, { label: 'Mid', band: 1 }, { label: 'Low', band: 0 }] as { label, band }}
          <Knob {label} bind:value={ch.eq[band]} min={KILL} max={6} reset={0} bipolar size={30} accent={accents[deck]} format={db}
            onchange={(v) => control({ type: 'setEq', deck, band, db: v })} />
        {/each}
        <button class="pfl" class:on={ch.pfl} aria-pressed={ch.pfl} title="Headphone cue"
          onclick={() => { ch.pfl = !ch.pfl; control({ type: 'setPfl', deck, on: ch.pfl }); }}>
          <svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z" /></svg>
        </button>
        <div class="fader">
          <Meter level={engine.deckLevels[deck]} />
          <Fader vertical bind:value={ch.fader} reset={1} label="Channel {deck === 0 ? 'A' : 'B'} fader"
            onchange={(v) => control({ type: 'setFader', deck, value: v })} />
        </div>
      </div>
    {/each}

    <div class="center" style:order="1">
      <Knob label="Master" bind:value={master} min={-24} max={6} reset={0} size={34} format={db}
        onchange={(v) => control({ type: 'setMasterGain', db: v })} />
      <Knob label="Cue mix" bind:value={cueMix} min={0} max={1} reset={0.5} size={30}
        format={(v) => `${Math.round((1 - v) * 100)}% cue / ${Math.round(v * 100)}% master`}
        onchange={(v) => control({ type: 'setCueMix', value: v })} />
      <div class="master-meter">
        <Meter level={engine.masterLevels[0]} segments={20} />
        <Meter level={engine.masterLevels[1]} segments={20} />
      </div>
    </div>
  </div>

  <div class="xfader">
    <span class="a">A</span>
    <Fader value={crossfader} min={-1} max={1} reset={0} label="Crossfader" onchange={setCrossfader} />
    <span class="b">B</span>
  </div>
</section>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .strips {
    flex: 1;
    display: flex;
    gap: 4px;
    min-height: 0;
  }
  .strip,
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .center {
    padding: 0 6px;
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }
  .pfl {
    width: 34px;
    height: 26px;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .pfl svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .pfl.on {
    background: #3a2a0c;
    border-color: #ffb02e;
  }
  .pfl.on svg {
    stroke: #ffb02e;
  }
  .fader {
    flex: 1;
    display: flex;
    gap: 4px;
    min-height: 60px;
    padding: 4px 0;
  }
  .master-meter {
    flex: 1;
    display: flex;
    gap: 3px;
    margin-top: 4px;
    min-height: 60px;
  }
  .xfader {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
  }
  .xfader span {
    font-weight: 700;
    font-size: 11px;
  }
  .a {
    color: var(--deck-a);
  }
  .b {
    color: var(--deck-b);
  }
</style>
