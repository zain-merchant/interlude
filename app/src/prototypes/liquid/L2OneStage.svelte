<script>
  // One Stage: both tracks share a single waveform stage, A rising from the
  // centre line and B hanging below it, so you see the beats line up. The
  // channels are a plugin-style rack, not two mirrored decks.
  import Backdrop from './Backdrop.svelte';
  import Ruler from './Ruler.svelte';
  import Progress from './Progress.svelte';
  import Library from './Library.svelte';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Meter from '../bold/Meter.svelte';
  import Time from '../bold/Time.svelte';
  import { decks } from '../bold/track.js';

  const C = ['#4aa8ff', '#ff8a4a'];
  const W = [
    { low: '#2456ff', mid: '#4aa8ff', high: '#d6f0ff' },
    { low: '#ff4d2e', mid: '#ff8a4a', high: '#ffe2c4' },
  ];
  let eq = $state([[0.5, 0.6, 0.5, 0.32, 0.5], [0.5, 0.5, 0.64, 0.5, 0.42]]);
  let vol = $state([0.86, 0.7]);
  let xf = $state(0.44);
</script>

<div class="lq-root l2">
  <Backdrop dim={0.8} />
  <div class="shell">
    <header class="bar">
      <span class="brand">oss–dj</span>
      <div class="master"><span class="lock"></span><strong>129.00</strong><span class="lq-label">Master tempo · B synced to A</span></div>
      <div class="lq-mono lq-dim rec">● Rec 00:41:12</div>
    </header>

    <section class="lq-glass stage">
      <div class="lanes">
        <div class="ln"><Wave deck={0} kind="ribbon" opts={{ ...W[0], side: 'up', glow: 0.6, seconds: 18, grid: 'rgba(255,255,255,0.035)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[0], past: 'rgba(6,6,10,0.45)' }} /></div>
        <div class="ln"><Wave deck={1} kind="ribbon" opts={{ ...W[1], side: 'down', glow: 0.6, seconds: 18, grid: 'rgba(255,255,255,0.035)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[1], past: 'rgba(6,6,10,0.45)' }} /></div>
      </div>
      {#each [0, 1] as k}
        {@const d = decks[k]}
        <div class="id" class:b={k === 1} style:--c={C[k]}>
          <span class="tag">{'AB'[k]}</span>
          <h2>{d.title}</h2>
          <p>{d.artist} · {d.bpm}.00 · {d.key} {d.camelot}</p>
        </div>
        <div class="tm" class:b={k === 1}><strong><Time deck={k} /></strong><span><Time deck={k} remaining /></span></div>
      {/each}
      <div class="prog">
        <Progress deck={0} color={C[0]} n={181} height={9} />
        <Progress deck={1} color={C[1]} n={181} height={9} />
      </div>
    </section>

    <section class="lq-glass rack">
      <div class="rh lq-label"><span></span><span>Transport</span><span>Cues</span><span>Trim</span><span>High</span><span>Mid</span><span>Low</span><span>Filter</span><span>Volume</span></div>
      {#each [0, 1] as k}
        <div class="ch" style:--c={C[k]}>
          <span class="tag">{'AB'[k]}</span>
          <div class="tp">
            <button class="lq-pill lq-cue">Cue</button>
            <button class="lq-pill lq-play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
          </div>
          <div class="cues">{#each [1, 2, 3, 4] as p}<button class="lq-hot" class:set={p !== 4 - k}>{p}</button>{/each}</div>
          {#each eq[k] as _, i}<Dial bind:value={eq[k][i]} bipolar size={30} color={C[k]} />{/each}
          <div class="vol">
            <Ruler value={vol[k]} n={41} major={10} color={C[k]} height={10} />
            <Fader bind:value={vol[k]} vertical={false} look="machined" />
          </div>
          <div class="mt"><Meter deck={k} look="bar" /></div>
        </div>
      {/each}
      <div class="xf">
        <span class="lq-label">A</span>
        <div class="xr"><Ruler value={xf} from={0.5} n={61} major={15} color="#f2f1ec" height={10} /><Fader bind:value={xf} vertical={false} look="glow" color="#ffffff" /></div>
        <span class="lq-label">B</span>
      </div>
    </section>

    <section class="lq-glass lib"><Library rows={5} sel={2} /></section>
  </div>
</div>

<style>
  .shell { position: relative; height: 100%; box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; gap: 16px; padding: 18px 22px; }
  .bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
  .brand { font-size: 15px; font-weight: 500; }
  .master { display: flex; align-items: baseline; gap: 10px; }
  .master strong { font-size: 26px; font-weight: 300; letter-spacing: -0.03em; }
  .lock { width: 7px; height: 7px; border-radius: 50%; background: #5ee08a; box-shadow: 0 0 10px #5ee08a; align-self: center; }
  .rec { justify-self: end; font-size: 12px; }

  .stage { position: relative; display: grid; grid-template-rows: 1fr auto; padding: 0 0 14px; overflow: hidden; min-height: 0; }
  .lanes { display: grid; grid-template-rows: 1fr 1fr; min-height: 0; }
  .ln { min-height: 0; position: relative; }
  .ln + .ln { box-shadow: 0 -1px 0 rgb(255 255 255 / 0.22); }
  .id { position: absolute; left: 26px; top: 22px; --tagc: var(--c); }
  .id.b { top: auto; bottom: 64px; }
  .tag { width: 22px; height: 22px; border-radius: 6px; display: inline-grid; place-items: center; font-size: 11.5px; font-weight: 600; color: #0a0a0c; background: var(--c); }
  .id h2 { margin: 10px 0 0; font-size: 44px; font-weight: 250; letter-spacing: -0.04em; line-height: 1; }
  .id.b h2 { margin: 0 0 6px; }
  .id.b { display: flex; flex-direction: column-reverse; }
  .id.b .tag { margin-top: 10px; }
  .id p { margin: 6px 0 0; font-size: 13px; color: rgb(242 241 236 / 0.6); }
  .tm { position: absolute; right: 26px; top: 22px; display: grid; justify-items: end; }
  .tm.b { top: auto; bottom: 64px; }
  .tm, .id { text-shadow: 0 1px 12px rgb(0 0 0 / 0.6); }
  .tm strong { font-size: 40px; font-weight: 300; letter-spacing: -0.04em; line-height: 1; }
  .tm span { font-size: 13px; color: rgb(242 241 236 / 0.55); }
  .prog { display: grid; gap: 6px; padding: 12px 26px 0; }

  .rack { padding: 12px 18px 14px; display: grid; gap: 4px; }
  .rh, .ch { display: grid; grid-template-columns: 34px 130px 170px repeat(5, 52px) 1fr 14px; gap: 0 14px; align-items: center; justify-items: center; }
  .rh span:first-child, .ch > .tag { justify-self: start; }
  .rh { height: 22px; }
  .ch { height: 58px; border-radius: 12px; }
  .ch + .ch { border-top: 1px solid rgb(255 255 255 / 0.06); }
  .tp, .cues { display: flex; gap: 8px; align-items: center; }
  .vol { width: 100%; display: grid; gap: 2px; }
  .mt { height: 40px; }
  .xf { display: flex; align-items: center; gap: 12px; padding: 8px 260px 0; }
  .xr { flex: 1; display: grid; gap: 2px; }

  .lib { padding: 8px; }
</style>
