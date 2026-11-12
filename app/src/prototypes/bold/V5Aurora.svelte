<script>
  // Aurora: the room is lit by the music. A full-bleed glow field breathes
  // with each deck's bass, mids and highs (A from the left, B from the right)
  // behind frosted glass cards. Waveforms are fine scope lines on the glass.
  import { onMount } from 'svelte';
  import Wave from './Wave.svelte';
  import Dial from './Dial.svelte';
  import Fader from './Fader.svelte';
  import Meter from './Meter.svelte';
  import Time from './Time.svelte';
  import Phrase from './Phrase.svelte';
  import { decks, library, clock, onTick, sample } from './track.js';

  const C = ['#3db4ff', '#ff8a3d'];
  const BANDS = [['#1f5bff', '#3db4ff', '#a8e6ff'], ['#ff4d2e', '#ff8a3d', '#ffe0b8']];
  let eq = $state([[0.5, 0.6, 0.5, 0.3, 0.5], [0.5, 0.5, 0.66, 0.5, 0.4]]);
  let fader = $state([0.84, 0.76]);
  let xf = $state(0.5);
  let field;

  onMount(() => {
    // Drawn small and scaled up behind a CSS blur: cheap, and soft by nature.
    const ctx = field.getContext('2d');
    const W = 160, H = 100;
    field.width = W; field.height = H;
    const lv = [[0, 0, 0], [0, 0, 0]];
    return onTick(() => {
      const now = performance.now() / 1000;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const v = sample(decks[k].data, clock.t[k] - 0.05, clock.t[k] + 0.05) ?? [0, 0, 0];
        for (let b = 0; b < 3; b++) lv[k][b] = v[b] > lv[k][b] ? lv[k][b] * 0.6 + v[b] * 0.4 : lv[k][b] * 0.94 + v[b] * 0.06;
        const side = k ? 1 : -1;
        for (let b = 0; b < 3; b++) {
          const ph = now * (0.07 + b * 0.04) + k * 2 + b * 1.7;
          const x = W / 2 + side * (W * (0.22 + b * 0.06)) + Math.sin(ph) * W * 0.08;
          const y = H * (0.75 - b * 0.22) + Math.cos(ph * 1.3) * H * 0.12;
          const r = W * (0.3 - b * 0.06) * (0.75 + lv[k][b] * 0.5);
          const a = 0.18 + lv[k][b] * (b === 0 ? 0.45 : 0.3);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const c = BANDS[k][b];
          g.addColorStop(0, c + Math.round(a * 255).toString(16).padStart(2, '0'));
          g.addColorStop(1, c + '00');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
      }
    });
  });
</script>

<div class="v5">
  <canvas class="field" bind:this={field} aria-hidden="true"></canvas>
  <div class="grain" aria-hidden="true"></div>

  <div class="ui">
    <div class="scopes glass">
      {#each [0, 1] as k}
        <div class="sl" style:--c={C[k]}>
          <Wave deck={k} kind="scope" opts={{ low: BANDS[k][0], mid: BANDS[k][1], line: '#f6f4ee', seconds: 12, grid: 'rgba(255,255,255,0.03)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[k], past: 'rgba(10,10,14,0.35)' }} />
          <span class="tag">{'AB'[k]} · {decks[k].title}</span>
        </div>
      {/each}
    </div>

    <div class="row">
      {#each [0, 1] as k}
        {@const d = decks[k]}
        <section class="glass deck" style:--c={C[k]} style:order={k ? 2 : 0}>
          <header>
            <div><h2>{d.title}</h2><p>{d.artist}</p></div>
            <div class="big"><Time deck={k} /></div>
          </header>
          <div class="meta">
            <span><b>{d.bpm}.00</b> BPM</span><span><b>{d.key}</b> {d.camelot}</span><span class="dim"><Time deck={k} remaining /></span>
          </div>
          <div class="ov"><Wave deck={k} kind="overview" opts={{ low: BANDS[k][0], mid: BANDS[k][1], high: BANDS[k][2], past: 'rgba(8,8,12,0.45)' }} /></div>
          <Phrase deck={k} look="pill" />
          <div class="tp">
            <button class="pill cue">Cue</button>
            <button class="pill play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
            <span class="pads">{#each [1, 2, 3, 4] as p}<button class:set={p < 4}>{p}</button>{/each}</span>
            <button class="pill sync">Sync</button>
          </div>
        </section>
      {/each}

      <section class="glass mixer" style:order="1">
        <div class="chs">
          {#each [0, 1] as k}
            <div class="ch">
              {#each ['High', 'Mid', 'Low', 'Filter'] as l, i}
                <Dial bind:value={eq[k][i + 1]} bipolar label={l} size={24} color={C[k]} />
              {/each}
            </div>
          {/each}
        </div>
        <div class="fz">
          <Meter deck={0} look="bar" />
          <Fader bind:value={fader[0]} look="glow" color={C[0]} />
          <Fader bind:value={fader[1]} look="glow" color={C[1]} />
          <Meter deck={1} look="bar" />
        </div>
        <Fader bind:value={xf} vertical={false} look="glow" color="#ffffff" />
      </section>
    </div>

    <section class="glass lib">
      {#each library.slice(0, 5) as r, i}
        <div class="tr" class:sel={i === 2}><span>{r[0]}</span><span class="dim">{r[1]}</span><span>{r[2]}</span><span class="dim">{r[3]}</span><span class="dim">{r[4]}</span><span class="dim">{r[5]}</span></div>
      {/each}
    </section>
  </div>
</div>

<style>
  .v5 { position: relative; height: 100vh; min-width: 1200px; overflow: hidden; background: #07070a; color: #f2f1ec; font-family: 'Geist Variable', sans-serif; font-feature-settings: 'tnum'; }
  .field { position: absolute; inset: -60px; width: calc(100% + 120px); height: calc(100% + 120px); filter: blur(40px) saturate(1.2); }
  .grain { position: absolute; inset: 0; opacity: 0.06; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); mix-blend-mode: overlay; pointer-events: none; }
  button { font: inherit; color: inherit; border: 0; cursor: pointer; transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
  button:active { transform: scale(0.97); }

  .ui { position: relative; height: 100%; display: grid; grid-template-rows: 170px minmax(0, 1fr) 190px; gap: 16px; padding: 20px 28px; box-sizing: border-box; }
  .glass {
    border-radius: 18px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.025));
    backdrop-filter: blur(24px) saturate(1.3);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.09), inset 0 1px 0 rgb(255 255 255 / 0.14), 0 24px 50px rgb(0 0 0 / 0.35);
  }
  .scopes { display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; }
  .sl { position: relative; min-height: 0; }
  .sl + .sl { border-top: 1px solid rgb(255 255 255 / 0.06); }
  .tag { position: absolute; left: 14px; top: 8px; font-size: 11.5px; color: var(--c); }

  .row { display: grid; grid-template-columns: 1fr 320px 1fr; gap: 16px; min-height: 0; }
  .deck { display: grid; align-content: space-between; padding: 20px 22px; }
  header { display: flex; justify-content: space-between; align-items: start; }
  h2 { margin: 0; font-size: 34px; font-weight: 300; letter-spacing: -0.03em; line-height: 1; }
  header p { margin: 6px 0 0; font-size: 13px; color: rgb(242 241 236 / 0.6); }
  .big { font-size: 40px; font-weight: 250; letter-spacing: -0.04em; line-height: 1; text-shadow: 0 0 24px color-mix(in srgb, var(--c) 40%, transparent); }
  .meta { display: flex; gap: 20px; font-size: 12.5px; color: rgb(242 241 236 / 0.6); }
  .meta b { color: #f2f1ec; font-weight: 450; }
  .ov { height: 84px; border-radius: 10px; overflow: hidden; background: rgb(0 0 0 / 0.18); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); }
  .tp { display: flex; align-items: center; gap: 10px; }
  .pill { height: 42px; padding: 0 20px; border-radius: 21px; background: rgb(255 255 255 / 0.08); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); font-size: 13px; }
  .cue { color: #f6c45a; }
  .play { display: grid; place-items: center; background: #f6f4ee; color: #111; box-shadow: 0 0 24px color-mix(in srgb, var(--c) 45%, transparent); }
  .play svg { width: 15px; height: 15px; fill: currentColor; }
  .sync { margin-left: auto; color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
  .pads { display: flex; gap: 6px; }
  .pads button { width: 34px; height: 34px; border-radius: 50%; font-size: 12px; color: rgb(242 241 236 / 0.4); background: rgb(255 255 255 / 0.05); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .pads button.set { color: #1a1408; background: #f6c45a; box-shadow: 0 0 12px rgb(246 196 90 / 0.35); }

  .mixer { display: grid; grid-template-rows: auto 1fr auto; gap: 10px; padding: 16px; }
  .chs { display: flex; justify-content: space-between; }
  .ch { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 4px; }
  .fz { display: flex; justify-content: center; gap: 16px; min-height: 0; }

  .lib { padding: 8px; overflow: hidden; }
  .tr { display: grid; grid-template-columns: 1.4fr 1.2fr 60px 60px 60px 1fr; height: 32px; align-items: center; padding: 0 12px; border-radius: 8px; font-size: 13px; }
  .tr.sel { background: rgb(255 255 255 / 0.1); }
  .dim { color: rgb(242 241 236 / 0.58); }
</style>
