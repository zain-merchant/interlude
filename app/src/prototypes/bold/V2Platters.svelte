<script>
  // Twin Platters: each deck is a big round instrument. The whole track
  // wraps the platter as a ring of spokes (played part lit in the deck's
  // colour), the disc turns at 33⅓, and the mixer is a narrow machined
  // console between them. Scrolling waveforms are fine scope lines on top.
  import Wave from './Wave.svelte';
  import Dial from './Dial.svelte';
  import Fader from './Fader.svelte';
  import Meter from './Meter.svelte';
  import Platter from './Platter.svelte';
  import Phrase from './Phrase.svelte';
  import { decks, library } from './track.js';

  const C = ['#3db4ff', '#ff8a3d'];
  let eq = $state([[0.5, 0.64, 0.5, 0.28, 0.5], [0.5, 0.5, 0.66, 0.5, 0.4]]);
  let fader = $state([0.85, 0.78]);
  let xf = $state(0.5);
</script>

<div class="v2">
  <div class="scopes">
    {#each [0, 1] as k}
      <div class="sl" style:--c={C[k]}>
        <Wave deck={k} kind="scope" opts={{ low: C[k], mid: '#9b8cff', line: '#f1f0ea', seconds: 10, grid: 'rgba(255,255,255,0.04)', gridStrong: 'rgba(255,255,255,0.09)', headGlow: C[k], past: 'rgba(14,14,17,0.6)' }} />
        <span class="n">{'AB'[k]}</span>
      </div>
    {/each}
  </div>

  <div class="stage">
    {#each [0, 1] as k}
      {@const d = decks[k]}
      <section class="deck" style:--c={C[k]} style:order={k ? 2 : 0}>
        <header>
          <h2>{d.title}</h2>
          <p>{d.artist} <span>·</span> {d.key} <span>·</span> {d.camelot}</p>
        </header>
        <Platter deck={k} color={C[k]} size={300} />
        <div class="ctl">
          <button class="round cue">Cue</button>
          <button class="round play on" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
          <div class="pads">{#each [1, 2, 3, 4] as p}<button class:set={p !== 3}>{p}</button>{/each}</div>
          <button class="sync on">Sync</button>
        </div>
        <div class="pitch"><span>{k ? '−0.78%' : '+0.00%'}</span><Fader vertical={false} value={k ? 0.46 : 0.5} look="machined" /><span>±8</span></div>
        <Phrase deck={k} look="dot" />
      </section>
    {/each}

    <section class="mixer" style:order="1">
      <div class="chs">
        {#each [0, 1] as k}
          <div class="ch">
            {#each ['Trim', 'High', 'Mid', 'Low', 'Filter'] as l, i}
              <Dial bind:value={eq[k][i]} bipolar label={l} size={26} color={C[k]} />
            {/each}
          </div>
        {/each}
      </div>
      <div class="faders">
        <Meter deck={0} look="dots" />
        <Fader bind:value={fader[0]} look="machined" />
        <div class="mid"><Dial value={0.7} label="Master" size={22} color="#ececea" glow={0} /><Dial value={0.5} label="Cue" size={22} color="#ececea" glow={0} /></div>
        <Fader bind:value={fader[1]} look="machined" />
        <Meter deck={1} look="dots" />
      </div>
      <div class="xf"><b style:color={C[0]}>A</b><Fader bind:value={xf} vertical={false} look="machined" /><b style:color={C[1]}>B</b></div>
    </section>
  </div>

  <section class="lib">
    {#each library.slice(0, 6) as r, i}
      <div class="tr" class:sel={i === 2}><span>{r[0]}</span><span class="dim">{r[1]}</span><span>{r[2]}</span><span class="dim">{r[3]}</span><span class="dim">{r[4]}</span></div>
    {/each}
  </section>
</div>

<style>
  .v2 {
    height: 100vh;
    min-width: 1200px;
    display: grid;
    grid-template-rows: 128px minmax(0, 1fr) 196px;
    box-sizing: border-box;
    background:
      repeating-linear-gradient(90deg, rgb(255 255 255 / 0.01) 0 1px, transparent 1px 3px),
      radial-gradient(70% 70% at 50% 45%, #1d1e22, #111214 70%);
    color: #ececea;
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
  }
  button { font: inherit; color: inherit; border: 0; cursor: pointer; }
  .scopes { display: grid; grid-template-rows: 1fr 1fr; border-bottom: 1px solid #08080a; box-shadow: 0 1px 0 rgb(255 255 255 / 0.04); background: #0e0e11; }
  .sl { position: relative; min-height: 0; }
  .sl + .sl { border-top: 1px solid rgb(255 255 255 / 0.04); }
  .n { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); font-size: 0; }

  .stage { display: grid; grid-template-columns: 1fr 300px 1fr; align-items: center; padding: 0 40px; min-height: 0; }
  .deck { display: grid; justify-items: center; gap: 14px; }
  header { text-align: center; }
  h2 { margin: 0; font-size: 26px; font-weight: 300; letter-spacing: -0.02em; }
  header p { margin: 4px 0 0; color: rgb(236 236 234 / 0.5); font-size: 12.5px; letter-spacing: 0.02em; }
  header p span { color: var(--c); }
  .ctl { display: flex; align-items: center; gap: 12px; }
  .round { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 500; background: radial-gradient(circle at 50% 30%, #34353a, #222327 70%); box-shadow: 0 0 0 1px #08080a, 0 4px 8px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.1); }
  .cue { color: #f2b33d; box-shadow: 0 0 0 1px #08080a, 0 0 0 3px color-mix(in srgb, #f2b33d 30%, transparent), 0 4px 8px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.1); }
  .play.on { background: radial-gradient(circle at 50% 35%, #fff, #d9d6cd 70%); color: #111; box-shadow: 0 0 0 1px #08080a, 0 0 0 3px var(--c), 0 0 18px color-mix(in srgb, var(--c) 50%, transparent); }
  .play svg { width: 15px; height: 15px; fill: currentColor; }
  .pads { display: flex; gap: 5px; margin: 0 6px; }
  .pads button { width: 26px; height: 26px; border-radius: 50%; font-size: 10.5px; color: rgb(236 236 234 / 0.35); background: #1a1b1e; box-shadow: 0 0 0 1px #08080a, inset 0 1px 0 rgb(255 255 255 / 0.06); }
  .pads button.set { color: #111; background: #f2b33d; box-shadow: 0 0 0 1px #08080a, 0 0 10px rgb(242 179 61 / 0.35); }
  .sync { height: 26px; padding: 0 12px; border-radius: 13px; font-size: 11.5px; background: #1a1b1e; box-shadow: 0 0 0 1px #08080a; }
  .sync.on { color: var(--c); box-shadow: 0 0 0 1px #08080a, inset 0 0 0 1px color-mix(in srgb, var(--c) 50%, transparent); }
  .pitch { display: flex; align-items: center; gap: 10px; width: 280px; font-size: 11px; color: rgb(236 236 234 / 0.5); }
  .pitch :global(.fader) { flex: 1; }
  .deck :global(.phrase) { width: 280px; }

  .mixer {
    align-self: stretch;
    margin: 18px 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 8px;
    padding: 16px 14px 14px;
    border-radius: 10px;
    background: linear-gradient(180deg, #1f2023, #17181b);
    box-shadow: 0 0 0 1px #08080a, inset 0 1px 0 rgb(255 255 255 / 0.06), 0 20px 40px rgb(0 0 0 / 0.5);
  }
  .chs { display: flex; justify-content: space-between; }
  .ch { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
  .ch :global(.dialwrap:last-child) { grid-column: 1 / -1; justify-self: center; }
  .faders { display: flex; justify-content: center; gap: 12px; min-height: 0; border-top: 1px solid #0a0a0b; box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04); padding-top: 10px; }
  .mid { display: grid; align-content: start; gap: 4px; }
  .xf { display: flex; align-items: center; gap: 8px; font-size: 11px; }

  .lib { margin: 0 40px 18px; padding: 8px; border-radius: 10px; background: rgb(0 0 0 / 0.25); box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.5), 0 1px 0 rgb(255 255 255 / 0.04); overflow: hidden; }
  .tr { display: grid; grid-template-columns: 1.4fr 1.2fr 60px 60px 60px; height: 29px; align-items: center; padding: 0 12px; border-radius: 6px; }
  .tr.sel { background: rgb(255 255 255 / 0.06); }
  .dim { color: rgb(236 236 234 / 0.5); }
</style>
