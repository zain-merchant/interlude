<script>
  // Hardware Object: the whole app as one dark anodised device, Teenage
  // Engineering style. An OLED strip shows dot-matrix waveforms and the
  // library; EQ caps are tinted by band (low blue, mid amber, high cream)
  // like OP-1 encoders; transport is chunky square keys.
  import Wave from './Wave.svelte';
  import Dial from './Dial.svelte';
  import Fader from './Fader.svelte';
  import Meter from './Meter.svelte';
  import Time from './Time.svelte';
  import { decks, library } from './track.js';

  const C = ['#4fc3ff', '#ff9a4a'];
  const band = { high: '#efe9dc', mid: '#ff9f2e', low: '#2f6bff' };
  let eq = $state([[0.62, 0.5, 0.3, 0.5], [0.5, 0.7, 0.5, 0.38]]);
  let jog = $state([0.42, 0.66]);
  let fader = $state([0.84, 0.72]);
  let xf = $state(0.55);
</script>

<div class="v4">
  <div class="device">
    <div class="screws">{#each Array(4) as _}<i></i>{/each}</div>

    <div class="oled">
      <div class="lanes">
        {#each [0, 1] as k}
          {@const d = decks[k]}
          <div class="lane" style:--c={C[k]}>
            <div class="hud">
              <span class="id">{'ab'[k]}</span>
              <span class="nm">{d.title.toLowerCase()}</span>
              <span class="sp"></span>
              <span><Time deck={k} /></span>
              <span class="dim"><Time deck={k} remaining /></span>
              <span class="bp">{d.bpm}.0</span>
            </div>
            <div class="w"><Wave deck={k} kind="dots" opts={{ seconds: 9, cell: 4, dot: 3, ahead: C[k], behind: 'rgba(255,255,255,0.22)', peak: '#ffffff', ghost: 'rgba(255,255,255,0.035)', head: '#ffffff' }} /></div>
          </div>
        {/each}
      </div>
      <div class="list">
        <div class="lh"><span>library</span><span class="dim">412</span></div>
        {#each library.slice(0, 7) as r, i}
          <div class="li" class:sel={i === 2}><span>{String(r[0]).toLowerCase()}</span><span>{r[2]}</span><span>{r[3]}</span></div>
        {/each}
      </div>
    </div>

    <div class="panel">
      {#each [0, 1] as k}
        <section class="deck" style:--c={C[k]} style:order={k ? 2 : 0} class:r={k === 1}>
          <div class="jog">
            <Dial bind:value={jog[k]} size={92} cap="soft" color={C[k]} ticks={41} glow={0.4} />
            <span class="eng">jog / pitch {k ? '−0.78' : '+0.00'}</span>
          </div>
          <div class="keys">
            <button class="key cue"><i></i>cue</button>
            <button class="key play on"><i></i>play</button>
            <button class="key"><i class="o"></i>sync</button>
            <button class="key"><i></i>loop</button>
            {#each [1, 2, 3, 4] as p}<button class="key hot" class:set={p !== 3}><i></i>{p}</button>{/each}
          </div>
        </section>
      {/each}

      <section class="mixer" style:order="1">
        <div class="eqs">
          {#each [0, 1] as k}
            <div class="eqc">
              <Dial bind:value={eq[k][0]} bipolar size={34} cap="white" color={band.high} label="hi" glow={0.3} />
              <Dial bind:value={eq[k][1]} bipolar size={34} cap="tint" color={band.mid} label="mid" glow={0.3} />
              <Dial bind:value={eq[k][2]} bipolar size={34} cap="tint" color={band.low} label="lo" glow={0.3} />
              <Dial bind:value={eq[k][3]} bipolar size={34} cap="soft" color={C[k]} label="filter" glow={0.3} />
            </div>
          {/each}
        </div>
        <div class="fz">
          <Meter deck={0} look="dots" />
          <Fader bind:value={fader[0]} look="object" color="#e9e6dd" />
          <div class="grill"></div>
          <Fader bind:value={fader[1]} look="object" color="#e9e6dd" />
          <Meter deck={1} look="dots" />
        </div>
        <div class="xf"><span class="eng">a</span><Fader bind:value={xf} vertical={false} look="object" color="#ff5a36" /><span class="eng">b</span></div>
      </section>
    </div>

    <div class="foot"><span class="eng">oss–dj</span><span class="eng dim">2 deck performance mixer</span></div>
  </div>
</div>

<style>
  .v4 {
    height: 100vh;
    min-width: 1200px;
    display: grid;
    place-items: center;
    background: radial-gradient(80% 70% at 50% 40%, #1b1c20, #08080a 80%);
    color: #ececea;
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
  }
  button { font: inherit; color: inherit; border: 0; cursor: pointer; }
  .eng { font-size: 11px; color: rgb(236 236 234 / 0.45); letter-spacing: 0.02em; }
  .dim { opacity: 0.5; }

  .device {
    position: relative;
    width: min(1240px, calc(100vw - 64px));
    padding: 22px 26px 16px;
    border-radius: 28px;
    background:
      radial-gradient(120% 80% at 30% 0%, rgb(255 255 255 / 0.05), transparent 60%),
      repeating-linear-gradient(0deg, rgb(255 255 255 / 0.012) 0 1px, transparent 1px 2px),
      #18191c;
    box-shadow:
      0 0 0 1px #000,
      inset 0 1px 0 rgb(255 255 255 / 0.1),
      inset 0 -2px 0 rgb(0 0 0 / 0.5),
      0 40px 80px rgb(0 0 0 / 0.7),
      0 8px 20px rgb(0 0 0 / 0.5);
    display: grid;
    gap: 18px;
  }
  .screws i { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #3a3b40, #121214); box-shadow: inset 0 0 0 1px #000; }
  .screws i::after { content: ''; position: absolute; inset: 4px 1.5px; background: #0a0a0b; }
  .screws i:nth-child(1) { left: 10px; top: 10px; }
  .screws i:nth-child(2) { right: 10px; top: 10px; }
  .screws i:nth-child(3) { left: 10px; bottom: 10px; }
  .screws i:nth-child(4) { right: 10px; bottom: 10px; }

  .oled {
    display: grid;
    grid-template-columns: 1fr 250px;
    height: 250px;
    border-radius: 12px;
    background: #000;
    box-shadow: 0 0 0 1px #000, 0 0 0 5px #0f0f11, 0 0 0 6px rgb(255 255 255 / 0.06), inset 0 0 30px rgb(255 255 255 / 0.02);
    font-family: 'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace;
    font-size: 12px;
    overflow: hidden;
  }
  .lanes { display: grid; grid-template-rows: 1fr 1fr; border-right: 1px dashed rgb(255 255 255 / 0.1); }
  .lane { display: grid; grid-template-rows: auto 1fr; min-height: 0; padding: 8px 12px 6px; }
  .lane + .lane { border-top: 1px dashed rgb(255 255 255 / 0.1); }
  .hud { display: flex; gap: 14px; align-items: center; }
  .id { width: 16px; height: 16px; display: grid; place-items: center; background: var(--c); color: #000; border-radius: 3px; font-weight: 600; }
  .nm { color: var(--c); }
  .sp { flex: 1; }
  .bp { color: var(--c); }
  .w { min-height: 0; margin-top: 6px; }
  .list { padding: 10px 12px; display: grid; align-content: start; gap: 2px; }
  .lh { display: flex; justify-content: space-between; color: #ff5a36; margin-bottom: 6px; }
  .li { display: grid; grid-template-columns: 1fr 32px 28px; padding: 3px 6px; color: rgb(255 255 255 / 0.7); border-radius: 2px; }
  .li.sel { background: #fff; color: #000; }

  .panel { display: grid; grid-template-columns: 1fr 360px 1fr; gap: 18px; }
  .deck { display: grid; grid-template-columns: auto 1fr; gap: 22px; align-items: center; padding: 6px 4px; }
  .deck.r { grid-template-columns: 1fr auto; }
  .deck.r .jog { order: 2; }
  .jog { display: grid; justify-items: center; gap: 6px; }
  .keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .key {
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    display: grid;
    place-items: end start;
    padding: 8px;
    font-size: 11px;
    color: rgb(236 236 234 / 0.62);
    background: linear-gradient(180deg, #2b2c31, #222327);
    box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgb(255 255 255 / 0.1), 0 4px 0 #0c0c0e, 0 6px 10px rgb(0 0 0 / 0.5);
    transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 120ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .key:active { transform: translateY(3px); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgb(255 255 255 / 0.1), 0 1px 0 #0c0c0e; }
  .key i { position: absolute; right: 9px; top: 9px; width: 6px; height: 6px; border-radius: 50%; background: rgb(255 255 255 / 0.12); }
  .key i.o { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
  .cue i { background: #f2b33d; box-shadow: 0 0 8px #f2b33d; }
  .play.on { background: linear-gradient(180deg, #f3f1ea, #d3cfc4); color: #1a1a1c; box-shadow: 0 0 0 1px #000, 0 4px 0 #8b887f, 0 6px 10px rgb(0 0 0 / 0.5); }
  .play.on i { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .hot.set i { background: var(--c); box-shadow: 0 0 8px var(--c); }

  .mixer { display: grid; grid-template-rows: auto 1fr auto; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgb(0 0 0 / 0.22); box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.6), 0 1px 0 rgb(255 255 255 / 0.05); }
  .eqs { display: flex; justify-content: space-between; }
  .eqc { display: grid; grid-template-columns: 1fr 1fr; gap: 0 4px; }
  .fz { display: flex; justify-content: center; gap: 14px; height: 120px; }
  .grill { width: 70px; background: radial-gradient(circle, #050506 1.6px, transparent 2px) 0 0 / 8px 8px; opacity: 0.9; }
  .xf { display: flex; align-items: center; gap: 10px; }
  .foot { display: flex; justify-content: space-between; padding: 0 6px; }
</style>
