<script>
  // Ridgeline: each deck's next 26 bars rise as terrain that rolls toward
  // you, like a Joy Division cover you can mix. The nearest ridge is "now"
  // and glows in the deck's colour. Controls sit on graphite slabs below.
  import Wave from './Wave.svelte';
  import Dial from './Dial.svelte';
  import Fader from './Fader.svelte';
  import Meter from './Meter.svelte';
  import Time from './Time.svelte';
  import Phrase from './Phrase.svelte';
  import { decks, library } from './track.js';

  const C = ['#3db4ff', '#ff8a3d'];
  const BG = '#0b0b0d';
  let eq = $state([[0.5, 0.6, 0.5, 0.26, 0.5], [0.5, 0.5, 0.68, 0.5, 0.36]]);
  let fader = $state([0.86, 0.74]);
  let xf = $state(0.58);
</script>

<div class="v3">
  <div class="land">
    {#each [0, 1] as k}
      {@const d = decks[k]}
      <div class="field" style:--c={C[k]}>
        <Wave deck={k} kind="ridge" opts={{ rows: 30, bg: BG, line: '#e9e7df', accent: C[k], glow: true }} />
        <div class="title" class:r={k === 1}>
          <span class="dk">Deck {'AB'[k]}</span>
          <h2>{d.title}</h2>
          <p>{d.artist}</p>
        </div>
        <div class="read" class:r={k === 1}>
          <span class="el"><Time deck={k} /></span>
          <span class="rm"><Time deck={k} remaining /></span>
        </div>
      </div>
    {/each}
    <div class="sync">
      <span class="lock"></span>
      <strong>129.00</strong>
      <span>Master tempo</span>
      <div class="phase">{#each Array(8) as _, i}<i class:a={i === 3} class:b={i === 4}></i>{/each}</div>
    </div>
  </div>

  <div class="slabs">
    {#each [0, 1] as k}
      {@const d = decks[k]}
      <section class="slab deck" style:--c={C[k]} style:order={k ? 2 : 0}>
        <div class="stats">
          <div><b>{d.bpm}.00</b><span>BPM</span></div>
          <div><b>{d.key}</b><span>{d.camelot}</span></div>
          <div><b>{k ? '−0.78' : '+0.00'}</b><span>Pitch %</span></div>
        </div>
        <Phrase deck={k} look="block" />
        <div class="keys">
          <button class="cue">Cue</button>
          <button class="play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
          {#each [1, 2, 3, 4] as p}<button class="hc" class:set={p !== 4}>{p}</button>{/each}
          <button class="sm on">Sync</button>
          <button class="sm">Loop 8</button>
        </div>
      </section>
    {/each}

    <section class="slab mixer" style:order="1">
      {#each [0, 1] as k}
        <div class="col">
          {#each ['High', 'Mid', 'Low'] as l, i}
            <Dial bind:value={eq[k][i + 1]} bipolar label={l} size={28} color={C[k]} />
          {/each}
        </div>
      {/each}
      <div class="fz">
        <Meter deck={0} look="led" />
        <Fader bind:value={fader[0]} look="machined" />
        <Fader bind:value={fader[1]} look="machined" />
        <Meter deck={1} look="led" />
      </div>
      <div class="xf"><Fader bind:value={xf} vertical={false} look="machined" /></div>
    </section>
  </div>

  <section class="lib">
    {#each library.slice(0, 4) as r, i}
      <div class="tr" class:sel={i === 2}><span>{r[0]}</span><span class="dim">{r[1]}</span><span>{r[2]}</span><span class="dim">{r[3]}</span><span class="dim">{r[4]}</span><span class="dim">{r[5]}</span></div>
    {/each}
  </section>
</div>

<style>
  .v3 {
    height: 100vh;
    min-width: 1200px;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    background: #0b0b0d;
    color: #ececea;
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
  }
  button { font: inherit; color: inherit; border: 0; cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
  button:active { transform: scale(0.97); }

  .land { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 160px; min-height: 0; padding: 18px 28px 0; }
  .field { position: relative; min-height: 0; }
  /* A haze where the terrain meets the sky. */
  .field::after { content: ''; position: absolute; inset: 0 0 auto; height: 30%; background: linear-gradient(#0b0b0d, transparent); pointer-events: none; }
  .title { position: absolute; left: 0; top: 4px; z-index: 1; }
  .title.r, .read.r { left: auto; right: 0; text-align: right; }
  .dk { font-size: 11.5px; color: var(--c); letter-spacing: 0.04em; }
  h2 { margin: 2px 0 0; font-size: 40px; font-weight: 250; letter-spacing: -0.035em; line-height: 1; }
  .title p { margin: 6px 0 0; color: rgb(236 236 234 / 0.55); font-size: 13px; }
  .read { position: absolute; left: 0; top: 112px; z-index: 1; display: grid; }
  .read .el { font-size: 30px; font-weight: 300; letter-spacing: -0.03em; }
  .read .rm { font-size: 13px; color: rgb(236 236 234 / 0.55); }

  .sync { position: absolute; left: 50%; top: 50%; translate: -50% -50%; display: grid; justify-items: center; gap: 4px; width: 150px; }
  .sync strong { font-size: 30px; font-weight: 300; letter-spacing: -0.03em; }
  .sync > span:not(.lock) { font-size: 11px; color: rgb(236 236 234 / 0.5); }
  .lock { width: 7px; height: 7px; border-radius: 50%; background: #5ee08a; box-shadow: 0 0 10px #5ee08a; }
  .phase { display: flex; gap: 3px; margin-top: 8px; }
  .phase i { width: 12px; height: 4px; border-radius: 1px; background: rgb(255 255 255 / 0.08); }
  .phase i.a { background: #3db4ff; box-shadow: 0 0 8px #3db4ff; }
  .phase i.b { background: #ff8a3d; box-shadow: 0 0 8px #ff8a3d; }

  .slabs { display: grid; grid-template-columns: 1fr 340px 1fr; gap: 14px; padding: 14px 28px; }
  .slab {
    border-radius: 14px;
    background:
      repeating-linear-gradient(90deg, rgb(255 255 255 / 0.012) 0 1px, transparent 1px 3px),
      linear-gradient(180deg, #1d1e22, #151619);
    box-shadow: 0 0 0 1px #050506, inset 0 1px 0 rgb(255 255 255 / 0.07), 0 -20px 40px rgb(0 0 0 / 0.6);
  }
  .deck { display: grid; grid-template-rows: auto auto 1fr; gap: 16px; padding: 16px 18px; position: relative; overflow: hidden; }
  .deck::before { content: ''; position: absolute; inset: -1px auto auto 18px; width: 64px; height: 2px; background: var(--c); box-shadow: 0 0 12px var(--c); }
  .stats { display: flex; gap: 28px; }
  .stats div { display: grid; }
  .stats b { font-size: 22px; font-weight: 300; letter-spacing: -0.02em; }
  .stats span { font-size: 11px; color: rgb(236 236 234 / 0.5); }
  .keys { display: flex; align-items: end; gap: 8px; }
  .keys button { white-space: nowrap; height: 44px; border-radius: 8px; background: linear-gradient(180deg, #2a2b30, #202125); box-shadow: 0 0 0 1px #050506, inset 0 1px 0 rgb(255 255 255 / 0.08), 0 3px 0 #0a0a0b; font-size: 12px; }
  .cue { width: 64px; color: #f2b33d; }
  .play { width: 64px; display: grid; place-items: center; background: linear-gradient(180deg, #f6f5f0, #d6d3ca) !important; color: #111; box-shadow: 0 0 0 1px #050506, 0 3px 0 #8c8a83, 0 0 18px color-mix(in srgb, var(--c) 45%, transparent) !important; }
  .play svg { width: 15px; height: 15px; fill: currentColor; }
  .hc { width: 46px; color: rgb(236 236 234 / 0.4); }
  .hc.set { color: #f2b33d; box-shadow: 0 0 0 1px #050506, inset 0 -2px 0 #f2b33d, inset 0 1px 0 rgb(255 255 255 / 0.08), 0 3px 0 #0a0a0b !important; }
  .sm { padding: 0 14px; color: rgb(236 236 234 / 0.6); }
  .sm.on { color: var(--c); }

  .mixer { display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: 1fr auto; padding: 14px 16px; gap: 6px 10px; }
  .col { display: grid; align-content: space-between; }
  .col:nth-child(2) { grid-column: 3; grid-row: 1; }
  .fz { grid-column: 2; grid-row: 1; display: flex; justify-content: center; gap: 12px; height: 150px; }
  .xf { grid-column: 1 / -1; padding: 0 30px; }

  .lib { margin: 0 28px 16px; padding: 8px; border-radius: 12px; background: rgb(255 255 255 / 0.02); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.05); }
  .tr { display: grid; grid-template-columns: 1.4fr 1.2fr 60px 60px 60px 1fr; height: 30px; align-items: center; padding: 0 12px; border-radius: 6px; font-size: 13px; }
  .tr.sel { background: rgb(255 255 255 / 0.06); }
  .dim { color: rgb(236 236 234 / 0.5); }
</style>
