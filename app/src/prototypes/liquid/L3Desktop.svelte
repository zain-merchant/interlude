<script>
  // Desktop App: shaped like a modern Mac app, not DJ software. The library
  // is the main window, a track inspector sits on the right, and both decks
  // live in a glass dock along the bottom with a compact mixer.
  import Backdrop from './Backdrop.svelte';
  import Ruler from './Ruler.svelte';
  import Progress from './Progress.svelte';
  import Library from './Library.svelte';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Time from '../bold/Time.svelte';
  import { decks } from '../bold/track.js';

  const C = ['#4aa8ff', '#ff8a4a'];
  const W = [
    { low: '#2456ff', mid: '#4aa8ff', high: '#d6f0ff' },
    { low: '#ff4d2e', mid: '#ff8a4a', high: '#ffe2c4' },
  ];
  let eq = $state([[0.6, 0.5, 0.32], [0.5, 0.64, 0.5]]);
  let xf = $state(0.47);
  const crates = ['All tracks', 'Tonight', 'House', 'Disco edits', 'Warmup', 'Recently added'];
</script>

<div class="lq-root l3">
  <Backdrop dim={0.75} a="#2a49ff" b="#ff6a2e" c="#9a4dff" />
  <div class="shell">
    <aside class="lq-glass side">
      <div class="lights"><i></i><i></i><i></i></div>
      <div class="lq-label grp">Crates</div>
      <nav>{#each crates as c, i}<button class:on={i === 2}>{c}<span class="lq-mono">{[412, 18, 96, 41, 22, 9][i]}</span></button>{/each}</nav>
      <div class="lq-label grp">Smart</div>
      <nav>{#each ['Fits after Afterglow', '126–130 BPM', 'Never played'] as c}<button>{c}</button>{/each}</nav>
    </aside>

    <main class="lq-glass browser">
      <div class="bh">
        <div><h1>House</h1><p class="lq-dim">96 tracks · 9 h 12 min</p></div>
        <div class="search">Search</div>
      </div>
      <Library rows={13} sel={2} />
    </main>

    <aside class="lq-glass insp">
      <div class="art"><span>Paper Planes</span></div>
      <h2>Paper Planes</h2>
      <p class="lq-dim">Nova Reyes · Disco Edits</p>
      <div class="facts">
        <div><b>118</b><span>BPM</span></div><div><b>C</b><span>8B</span></div><div><b>6:43</b><span>Length</span></div>
      </div>
      <div class="lq-label">Overview</div>
      <div class="ov lq-well"><Wave deck={1} kind="overview" opts={{ low: '#ff4d2e', mid: '#9a4dff', high: '#ffe2c4', past: 'rgba(0,0,0,0)', head: 'rgba(0,0,0,0)' }} /></div>
      <div class="lq-label">Fit with Afterglow</div>
      <Ruler value={0.72} n={41} major={10} color="#5ee08a" height={12} />
      <div class="lq-label fit"><span>Key: 2 steps</span><span>Tempo: −8.5%</span></div>
      <div class="ld"><button class="lq-pill" style:color={C[0]}>Load to A</button><button class="lq-pill" style:color={C[1]}>Load to B</button></div>
    </aside>

    <section class="lq-glass dock">
      <div class="decks">
        {#each [0, 1] as k}
          {@const d = decks[k]}
          <div class="dk" style:--c={C[k]}>
            <div class="meta">
              <span class="tag">{'AB'[k]}</span>
              <div class="tt"><b>{d.title}</b><span>{d.artist}</span></div>
              <button class="lq-hot cue" aria-label="Cue">C</button>
              <button class="lq-hot play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
            </div>
            <div class="w lq-well"><Wave deck={k} kind="ribbon" opts={{ ...W[k], glow: 0.5, seconds: 14, headGlow: C[k], past: 'rgba(6,6,10,0.5)' }} /></div>
            <div class="tm"><strong><Time deck={k} /></strong><span><Time deck={k} remaining /></span><span>{d.bpm}.00</span></div>
          </div>
        {/each}
      </div>
      <div class="mix">
        {#each [0, 1] as k}
          <div class="eq">{#each ['Hi', 'Mid', 'Lo'] as l, i}<Dial bind:value={eq[k][i]} bipolar label={l} size={22} color={C[k]} />{/each}</div>
        {/each}
        <div class="xf"><Ruler value={xf} from={0.5} n={41} major={10} color="#f2f1ec" height={9} /><Fader bind:value={xf} vertical={false} look="glow" color="#fff" /></div>
      </div>
    </section>
  </div>
</div>

<style>
  .shell { position: relative; height: 100%; box-sizing: border-box; display: grid; grid-template-columns: 220px 1fr 330px; grid-template-rows: minmax(0, 1fr) auto; gap: 14px; padding: 16px; }
  .side { padding: 16px 10px; display: grid; align-content: start; gap: 6px; }
  .lights { display: flex; gap: 8px; padding: 0 8px 14px; }
  .lights i { width: 12px; height: 12px; border-radius: 50%; background: rgb(255 255 255 / 0.16); }
  .grp { padding: 10px 10px 2px; }
  nav { display: grid; gap: 2px; }
  nav button { display: flex; justify-content: space-between; height: 30px; align-items: center; padding: 0 10px; border-radius: 8px; background: none; font-size: 13.5px; color: rgb(242 241 236 / 0.72); }
  nav button span { font-size: 11.5px; color: rgb(242 241 236 / 0.4); }
  nav button.on { background: rgb(255 255 255 / 0.12); color: #f2f1ec; }

  .browser { padding: 22px 16px 10px; display: grid; grid-template-rows: auto 1fr; gap: 12px; overflow: hidden; min-height: 0; }
  .bh { display: flex; justify-content: space-between; align-items: end; padding: 0 12px; }
  h1 { margin: 0; font-size: 52px; font-weight: 250; letter-spacing: -0.045em; line-height: 1; }
  .bh p { margin: 6px 0 0; font-size: 13px; }
  .search { width: 240px; height: 34px; border-radius: 17px; padding: 0 14px; display: flex; align-items: center; font-size: 13px; color: rgb(242 241 236 / 0.45); background: rgb(0 0 0 / 0.2); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }

  .insp { padding: 16px; display: grid; align-content: start; gap: 10px; overflow: hidden; }
  .art { aspect-ratio: 1.3; border-radius: 14px; display: grid; align-items: end; padding: 14px; font-size: 13px; color: rgb(255 255 255 / 0.85);
    background: radial-gradient(80% 90% at 20% 20%, #ffb36b, transparent 60%), radial-gradient(90% 90% at 90% 80%, #7b4dff, transparent 60%), linear-gradient(135deg, #ff6a2e, #2a49ff);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15), 0 20px 40px rgb(0 0 0 / 0.4); }
  .art span { font-size: 22px; font-weight: 300; letter-spacing: -0.03em; }
  h2 { margin: 6px 0 0; font-size: 30px; font-weight: 300; letter-spacing: -0.03em; line-height: 1; }
  .insp p { margin: 0; font-size: 13px; }
  .facts { display: flex; gap: 26px; margin: 6px 0; }
  .facts div { display: grid; }
  .facts b { font-size: 20px; font-weight: 400; }
  .facts span { font-size: 11.5px; color: rgb(242 241 236 / 0.5); }
  .ov { height: 70px; }
  .fit { display: flex; justify-content: space-between; }
  .ld { display: flex; gap: 8px; margin-top: 6px; }
  .ld button { flex: 1; }

  .dock { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 360px; gap: 18px; padding: 14px 18px; }
  .decks { display: grid; gap: 10px; }
  .dk { display: grid; grid-template-columns: 300px 1fr 110px; gap: 14px; align-items: center; }
  .meta { display: flex; align-items: center; gap: 10px; }
  .tag { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 11.5px; font-weight: 600; color: #0a0a0c; background: var(--c); flex: none; }
  .tt { display: grid; flex: 1; min-width: 0; }
  .tt b { font-weight: 450; font-size: 15px; }
  .tt span { font-size: 12px; color: rgb(242 241 236 / 0.55); }
  .cue { color: #f6c45a; }
  .play { display: grid; place-items: center; background: #f6f4ee; color: #111; }
  .play svg { width: 12px; height: 12px; fill: currentColor; }
  .w { height: 54px; }
  .tm { display: grid; justify-items: end; }
  .tm strong { font-size: 22px; font-weight: 300; letter-spacing: -0.03em; }
  .tm span { font-size: 11.5px; color: rgb(242 241 236 / 0.5); }
  .mix { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; align-content: center; padding-left: 18px; border-left: 1px solid rgb(255 255 255 / 0.07); }
  .eq { display: flex; justify-content: space-around; }
  .xf { grid-column: 1 / -1; display: grid; gap: 2px; }
</style>
