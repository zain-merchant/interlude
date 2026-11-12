<script>
  // Centre mixer: machined tick dials per channel, faders with meters, and
  // a crossfader on a tick ruler.
  import Ruler from './Ruler.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Meter from '../bold/Meter.svelte';
  /** @type {{ colors: string[] }} */
  let { colors } = $props();
  let eq = $state([[0.5, 0.6, 0.5, 0.32, 0.5], [0.5, 0.5, 0.64, 0.5, 0.42]]);
  let vol = $state([0.86, 0.74]);
  let xf = $state(0.44);
</script>

<section class="lq-glass mixer">
  <div class="chs">
    {#each [0, 1] as k}
      <div class="ch">
        {#each ['Trim', 'High', 'Mid', 'Low', 'Filter'] as l, i}<Dial bind:value={eq[k][i]} bipolar label={l} size={26} color={colors[k]} />{/each}
      </div>
    {/each}
  </div>
  <div class="fz">
    <Meter deck={0} look="bar" />
    <Fader bind:value={vol[0]} look="glow" color={colors[0]} />
    <div class="mid"><Dial value={0.72} label="Master" size={22} color="#f2f1ec" glow={0.3} /><Dial value={0.5} label="Cue mix" size={22} color="#f2f1ec" glow={0.3} /></div>
    <Fader bind:value={vol[1]} look="glow" color={colors[1]} />
    <Meter deck={1} look="bar" />
  </div>
  <div class="xf">
    <Ruler value={xf} from={0.5} n={41} major={10} color="#f2f1ec" height={10} />
    <Fader bind:value={xf} vertical={false} look="glow" color="#ffffff" />
    <div class="ends lq-label"><span style:color={colors[0]}>A</span><span style:color={colors[1]}>B</span></div>
  </div>
</section>

<style>
  .mixer { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 16px; min-height: 0; }
  .chs { display: flex; justify-content: space-between; }
  .ch { display: grid; grid-template-columns: 1fr 1fr; gap: 0 4px; }
  .ch :global(.dialwrap:last-child) { grid-column: 1 / -1; justify-self: center; }
  .fz { display: flex; justify-content: center; gap: 14px; min-height: 0; padding-top: 10px; border-top: 1px solid rgb(255 255 255 / 0.07); }
  .mid { display: grid; align-content: start; gap: 6px; }
  .xf { display: grid; gap: 2px; }
  .ends { display: flex; justify-content: space-between; }
</style>
