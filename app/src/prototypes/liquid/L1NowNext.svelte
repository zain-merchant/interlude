<script>
  // Now and Next: not two mirrored decks but one hero track and the one
  // you're bringing in. Big type, a wide liquid waveform, tick rulers.
  import Backdrop from './Backdrop.svelte';
  import Ruler from './Ruler.svelte';
  import Progress from './Progress.svelte';
  import Library from './Library.svelte';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Time from '../bold/Time.svelte';
  import Phrase from '../bold/Phrase.svelte';
  import { decks } from '../bold/track.js';

  const C = ['#4aa8ff', '#ff8a4a'];
  const W = [
    { low: '#2456ff', mid: '#4aa8ff', high: '#d6f0ff' },
    { low: '#ff4d2e', mid: '#ff8a4a', high: '#ffe2c4' },
  ];
  let eq = $state([[0.6, 0.5, 0.32, 0.5], [0.5, 0.62, 0.5, 0.4]]);
  let xf = $state(0.38);
  const crates = ['All tracks', 'Tonight', 'House', 'Disco edits', 'Warmup', 'Recently added'];
</script>

<div class="lq-root l1">
  <Backdrop dim={0.85} />
  <div class="shell">
    <aside class="lq-glass side">
      <div class="brand">oss–dj</div>
      <nav>{#each crates as c, i}<button class:on={i === 1}>{c}<span class="lq-mono">{[412, 18, 96, 41, 22, 9][i]}</span></button>{/each}</nav>
      <div class="lq-label up">Up next</div>
      <Library rows={9} sel={1} cols="compact" />
    </aside>

    <main>
      <section class="lq-glass hero" style:--c={C[0]}>
        <div class="top">
          <div>
            <div class="eyebrow"><i></i>Now playing · Deck A</div>
            <h1>{decks[0].title}</h1>
            <p>{decks[0].artist}</p>
          </div>
          <div class="clock">
            <strong><Time deck={0} /></strong>
            <span><Time deck={0} remaining /></span>
          </div>
        </div>
        <div class="facts">
          <div><b>129.00</b><span>BPM</span></div>
          <div><b>Bm</b><span>10A</span></div>
          <div><b>+0.00%</b><span>Pitch</span></div>
          <div class="ph"><Phrase deck={0} look="pill" /></div>
        </div>
        <div class="wave lq-well"><Wave deck={0} kind="ribbon" opts={{ ...W[0], glow: 0.6, seconds: 16, grid: 'rgba(255,255,255,0.03)', gridStrong: 'rgba(255,255,255,0.07)', headGlow: C[0], past: 'rgba(6,6,10,0.5)' }} /></div>
        <Progress deck={0} color={C[0]} n={161} />
        <div class="tp">
          <button class="lq-pill lq-cue">Cue</button>
          <button class="lq-pill lq-play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
          {#each [1, 2, 3, 4] as p}<button class="lq-hot" class:set={p !== 4}>{p}</button>{/each}
          <span class="sp"></span>
          <button class="lq-pill">Loop 8</button>
          <button class="lq-pill sync">Sync</button>
        </div>
      </section>

      <div class="low">
        <section class="lq-glass next" style:--c={C[1]}>
          <div class="eyebrow"><i></i>Next · Deck B</div>
          <div class="nt">
            <div><h2>{decks[1].title}</h2><p>{decks[1].artist} · 128.00 · B♭m 3A</p></div>
            <div class="nclock"><Time deck={1} /><span><Time deck={1} remaining /></span></div>
          </div>
          <div class="nwave lq-well"><Wave deck={1} kind="ribbon" opts={{ ...W[1], glow: 0.5, seconds: 16, headGlow: C[1], past: 'rgba(6,6,10,0.5)' }} /></div>
          <Progress deck={1} color={C[1]} n={121} height={10} />
          <div class="tp">
            <button class="lq-pill lq-cue">Cue</button>
            <button class="lq-pill lq-play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
            {#each [1, 2, 3, 4] as p}<button class="lq-hot" class:set={p < 3}>{p}</button>{/each}
            <span class="sp"></span>
            <button class="lq-pill sync on">Synced</button>
          </div>
        </section>

        <section class="lq-glass blend">
          <div class="bh"><span class="eyebrow plain">Blend</span><span class="lq-mono lq-dim">A → B · 32 bars</span></div>
          {#each [0, 1] as k}
            <div class="row" style:--c={C[k]}>
              <span class="tag">{'AB'[k]}</span>
              {#each ['High', 'Mid', 'Low', 'Filter'] as l, i}<Dial bind:value={eq[k][i]} bipolar label={l} size={26} color={C[k]} />{/each}
            </div>
          {/each}
          <div class="xf">
            <Ruler value={xf} from={0.5} n={49} major={12} color={xf < 0.5 ? C[0] : C[1]} height={12} />
            <Fader bind:value={xf} vertical={false} look="glow" color="#ffffff" />
            <div class="ends lq-label"><span>A</span><span>B</span></div>
          </div>
        </section>
      </div>
    </main>
  </div>
</div>

<style>
  .shell { position: relative; height: 100%; box-sizing: border-box; display: grid; grid-template-columns: 300px 1fr; gap: 18px; padding: 20px; }
  .side { display: grid; grid-template-rows: auto auto auto 1fr; gap: 12px; padding: 18px 12px; min-height: 0; overflow: hidden; }
  .brand { padding: 0 8px; font-size: 15px; font-weight: 500; letter-spacing: -0.01em; }
  nav { display: grid; gap: 2px; }
  nav button { display: flex; justify-content: space-between; height: 32px; align-items: center; padding: 0 10px; border-radius: 8px; background: none; font-size: 13.5px; color: rgb(242 241 236 / 0.7); }
  nav button span { font-size: 11.5px; color: rgb(242 241 236 / 0.4); }
  nav button.on { background: rgb(255 255 255 / 0.1); color: #f2f1ec; }
  .up { padding: 8px 10px 0; border-top: 1px solid rgb(255 255 255 / 0.07); }

  main { display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 18px; min-height: 0; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--c); }
  .eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }
  .eyebrow.plain { color: #f2f1ec; font-size: 13px; }

  .hero { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; gap: 16px; padding: 26px 28px 22px; min-height: 0; }
  .top { display: flex; justify-content: space-between; align-items: end; }
  h1 { margin: 10px 0 0; font-size: 76px; font-weight: 250; letter-spacing: -0.045em; line-height: 0.95; }
  .top p { margin: 10px 0 0; font-size: 16px; color: rgb(242 241 236 / 0.62); }
  .clock { display: grid; justify-items: end; }
  .clock strong { font-size: 56px; font-weight: 300; letter-spacing: -0.04em; line-height: 1; text-shadow: 0 0 30px color-mix(in srgb, var(--c) 35%, transparent); }
  .clock span { margin-top: 6px; font-size: 16px; color: rgb(242 241 236 / 0.55); }
  .facts { display: flex; gap: 34px; align-items: end; }
  .facts div:not(.ph) { display: grid; }
  .facts b { font-size: 20px; font-weight: 400; }
  .facts span { font-size: 11.5px; color: rgb(242 241 236 / 0.5); }
  .ph { flex: 1; max-width: 420px; margin-left: auto; }
  .wave { min-height: 120px; }
  .tp { display: flex; align-items: center; gap: 10px; }
  .sp { flex: 1; }
  .sync { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }

  .low { display: grid; grid-template-columns: 1fr 440px; gap: 18px; }
  .next { display: grid; gap: 12px; padding: 20px 22px; }
  .nt { display: flex; justify-content: space-between; align-items: end; }
  h2 { margin: 0; font-size: 34px; font-weight: 300; letter-spacing: -0.03em; line-height: 1; }
  .nt p { margin: 6px 0 0; font-size: 13px; color: rgb(242 241 236 / 0.58); }
  .nclock { display: grid; justify-items: end; font-size: 24px; letter-spacing: -0.03em; }
  .nclock span { font-size: 12.5px; color: rgb(242 241 236 / 0.5); }
  .nwave { height: 74px; }

  .blend { display: grid; align-content: space-between; gap: 10px; padding: 18px 20px; }
  .bh { display: flex; justify-content: space-between; font-size: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between; }
  .tag { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 11.5px; font-weight: 600; color: #0a0a0c; background: var(--c); }
  .xf { display: grid; gap: 4px; }
  .ends { display: flex; justify-content: space-between; }
</style>
