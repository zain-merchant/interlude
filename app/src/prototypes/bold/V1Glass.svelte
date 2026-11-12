<script>
  // Glass Console: Full Instrument's tinted cards and glow, turned down a
  // notch, with Machined Graphite's dials. Waveforms are liquid ribbons in a
  // glass screen.
  import Wave from './Wave.svelte';
  import Dial from './Dial.svelte';
  import Fader from './Fader.svelte';
  import Meter from './Meter.svelte';
  import Time from './Time.svelte';
  import Phrase from './Phrase.svelte';
  import { decks, library } from './track.js';

  const C = { a: '#3db4ff', b: '#ff8a3d' };
  const W = { low: '#2f6bff', mid: '#ff9f2e', high: '#fff4e0' };
  let eq = $state([[0.5, 0.62, 0.5, 0.3, 0.5], [0.5, 0.5, 0.7, 0.42, 0.5]]);
  let fader = $state([0.82, 0.9]);
  let xf = $state(0.56);
</script>

<div class="v1">
  <div class="screen">
    {#each [0, 1] as k}
      <div class="lane" style:--c={C[decks[k].color]}>
        <Wave deck={k} kind="ribbon" opts={{ ...W, glow: 0.7, seconds: 14, grid: 'rgba(255,255,255,0.035)', gridStrong: 'rgba(255,255,255,0.08)', headGlow: C[decks[k].color], past: 'rgba(6,6,9,0.62)' }} />
        <span class="tag"><b>{'AB'[k]}</b>{decks[k].title}<em>{decks[k].bpm}.00</em></span>
      </div>
    {/each}
  </div>

  <div class="row">
    {#each [0, 1] as k}
      {@const d = decks[k]}
      <section class="deck" class:right={k === 1} style:--c={C[d.color]} style:order={k === 0 ? 0 : 2}>
        <header>
          <span class="chip">{'AB'[k]}</span>
          <div class="t"><h2>{d.title}</h2><p>{d.artist}</p></div>
          <div class="bpm"><strong>{d.bpm}.00</strong><span>{d.key} · {d.camelot} · BPM</span></div>
        </header>
        <div class="ov"><Wave deck={k} kind="overview" opts={{ ...W, past: 'rgba(6,6,9,0.6)' }} /></div>
        <div class="times"><span class="el"><Time deck={k} /></span><span class="rm"><Time deck={k} remaining /></span></div>
        <div class="pads">{#each [1, 2, 3, 4] as p}<button class:set={p < 3}>{p}</button>{/each}<span></span><button class="ghost">Loop 8</button></div>
        <Phrase deck={k} />
        <div class="transport">
          <button class="cue">Cue</button>
          <button class="play on" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
          <span></span>
          <button class="sm on">Sync</button>
        </div>
        <div class="pitch"><span class="pv">{k ? '−0.78' : '+0.00'}%</span><Fader value={0.5} look="machined" /><span class="pl">±8</span></div>
      </section>
    {/each}

    <section class="mixer" style:order="1">
      {#each [0, 1] as k}
        <div class="ch" class:mir={k === 1} style:--c={C[decks[k].color]}>
          <div class="knobs">
            <Dial bind:value={eq[k][0]} bipolar label="Trim" size={24} color={C[decks[k].color]} />
            <Dial bind:value={eq[k][1]} bipolar label="High" size={24} color={C[decks[k].color]} />
            <Dial bind:value={eq[k][2]} bipolar label="Mid" size={24} color={C[decks[k].color]} />
            <Dial bind:value={eq[k][3]} bipolar label="Low" size={24} color={C[decks[k].color]} />
            <Dial bind:value={eq[k][4]} bipolar label="Filter" size={24} color={C[decks[k].color]} />
          </div>
          <div class="strip"><Meter deck={k} /><Fader bind:value={fader[k]} look="glow" color={C[decks[k].color]} /></div>
        </div>
      {/each}
      <div class="cen">
        <Dial value={0.72} label="Master" size={28} color="#ececea" glow={0.3} />
        <Dial value={0.5} label="Cue mix" size={24} color="#ececea" glow={0.3} />
        <div class="mm"><Meter deck={0} /><Meter deck={1} /></div>
      </div>
      <div class="xf"><span class="a">A</span><Fader bind:value={xf} vertical={false} look="glow" color="#ececea" /><span class="b">B</span></div>
    </section>
  </div>

  <section class="lib">
    <aside>
      <h3>Library</h3>
      {#each [['All tracks', 48], ['House', 12], ['Techno', 14], ['Disco Edits', 9], ['Warmup', 13]] as [n, c], i}
        <div class="side" class:on={i === 0}>{n}<span>{c}</span></div>
      {/each}
    </aside>
    <div class="tbl">
      <div class="search">Search artist, title, folder<kbd>⌘F</kbd></div>
      <div class="th"><span></span><span>Title</span><span>Artist</span><span>BPM</span><span>Key</span><span>Time</span></div>
      {#each library.slice(0, 9) as r, i}
        <div class="tr" class:sel={i === 2}>
          <span>{#if i === 0}<b class="ld a">A</b>{:else if i === 8}<b class="ld b">B</b>{/if}</span>
          <span>{r[0]}</span><span class="dim">{r[1]}</span><span>{r[2]}</span><span class="dim">{r[3]}</span><span class="dim">{r[4]}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .v1 {
    --bg: #09090b;
    height: 100vh;
    min-width: 1200px;
    display: grid;
    grid-template-rows: 176px 356px minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    background: radial-gradient(90% 60% at 50% -10%, #17171d, var(--bg) 65%);
    color: #ececea;
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
  }
  button { font: inherit; color: inherit; border: 0; cursor: pointer; }
  .screen {
    position: relative;
    display: grid;
    grid-template-rows: 1fr 1fr;
    border-radius: 16px;
    overflow: hidden;
    background: #050507;
    box-shadow: 0 0 0 1px #000, 0 0 0 2px rgb(255 255 255 / 0.05), 0 20px 40px rgb(0 0 0 / 0.55);
  }
  .screen::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(172deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.015) 42%, transparent 43%);
  }
  .lane { position: relative; min-height: 0; }
  .lane + .lane { border-top: 1px solid rgb(255 255 255 / 0.05); }
  .lane::before {
    content: ''; position: absolute; inset: 0 auto 0 0; width: 160px; z-index: 1; pointer-events: none;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 14%, transparent), transparent);
  }
  .tag { position: absolute; left: 14px; top: 10px; z-index: 2; display: flex; gap: 8px; align-items: center; font-size: 12px; font-weight: 500; }
  .tag b { width: 16px; height: 16px; border-radius: 4px; display: grid; place-items: center; background: var(--c); color: #0b0b0c; font-size: 10px; box-shadow: 0 0 10px color-mix(in srgb, var(--c) 60%, transparent); }
  .tag em { font-style: normal; color: rgb(236 236 234 / 0.5); font-weight: 400; }

  .row { display: grid; grid-template-columns: minmax(0, 1fr) 312px minmax(0, 1fr); gap: 12px; min-height: 0; }
  .deck {
    --plate: color-mix(in srgb, var(--c) 10%, #121216);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    grid-template-rows: auto 64px auto auto auto 1fr;
    gap: 12px 18px;
    padding: 18px 20px;
    border-radius: 18px;
    background: radial-gradient(120% 90% at 25% 0%, color-mix(in srgb, var(--c) 17%, #16161b), var(--plate) 55%, #0e0e12);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 0 0 1px color-mix(in srgb, var(--c) 16%, transparent), 0 16px 34px rgb(0 0 0 / 0.5);
  }
  .deck.right { grid-template-columns: 44px minmax(0, 1fr); background: radial-gradient(120% 90% at 75% 0%, color-mix(in srgb, var(--c) 17%, #16161b), var(--plate) 55%, #0e0e12); }
  .deck > :not(.pitch) { grid-column: 1; }
  .deck.right > :not(.pitch) { grid-column: 2; }
  .pitch { grid-column: 2; grid-row: 1 / -1; display: grid; grid-template-rows: auto 1fr auto; justify-items: center; gap: 8px; font-size: 11px; color: rgb(236 236 234 / 0.6); }
  .deck.right .pitch { grid-column: 1; }
  header { display: flex; gap: 12px; align-items: flex-start; }
  .chip { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; background: var(--c); color: #0b0b0c; font-size: 12px; font-weight: 600; box-shadow: 0 0 14px color-mix(in srgb, var(--c) 55%, transparent); }
  .t { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 19px; font-weight: 500; letter-spacing: -0.015em; }
  .t p { margin: 3px 0 0; color: color-mix(in srgb, var(--c) 30%, #a3a39e); }
  .bpm { text-align: right; }
  .bpm strong { display: block; font-size: 32px; font-weight: 400; letter-spacing: -0.03em; line-height: 1; text-shadow: 0 0 18px color-mix(in srgb, var(--c) 35%, transparent); }
  .bpm span { font-size: 11px; color: color-mix(in srgb, var(--c) 30%, #8a8a86); }
  .ov { border-radius: 10px; overflow: hidden; background: #050507; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px rgb(255 255 255 / 0.05); padding: 4px; }
  .times { display: flex; justify-content: space-between; align-items: baseline; }
  .el { font-size: 28px; letter-spacing: -0.02em; }
  .rm { font-size: 18px; color: color-mix(in srgb, var(--c) 30%, #8a8a86); }
  .pads { display: flex; gap: 6px; }
  .pads span { flex: 1; }
  .pads button { width: 40px; height: 30px; border-radius: 8px; background: rgb(255 255 255 / 0.04); color: rgb(236 236 234 / 0.35); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.5); }
  .pads button.set { color: #ffd27a; background: color-mix(in srgb, #f2b33d 16%, #18181d); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), 0 0 0 1px color-mix(in srgb, #f2b33d 40%, #000), 0 0 10px color-mix(in srgb, #f2b33d 16%, transparent); }
  .pads button.ghost { width: auto; padding: 0 12px; background: none; box-shadow: none; color: rgb(236 236 234 / 0.6); }
  .transport { display: flex; gap: 10px; align-items: end; }
  .transport span { flex: 1; }
  .transport button { display: grid; place-items: center; height: 54px; min-width: 88px; border-radius: 13px; font-size: 14px; font-weight: 500; }
  .cue { color: #ffd27a; background: linear-gradient(180deg, color-mix(in srgb, #f2b33d 18%, #1a1a1f), color-mix(in srgb, #f2b33d 7%, #141418)); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), 0 0 0 1px color-mix(in srgb, #f2b33d 45%, #000); }
  .play.on { color: #03130a; background: radial-gradient(circle at 50% 35%, #64e39c, #2fb46c 70%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.35), 0 0 0 1px #1f7d4a, 0 0 22px rgb(56 201 124 / 0.4); }
  .play svg { width: 16px; height: 16px; fill: currentColor; }
  .transport .sm { height: 32px; min-width: 0; padding: 0 14px; border-radius: 9px; font-weight: 400; font-size: 13px; background: rgb(255 255 255 / 0.04); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.5); }
  .transport .sm.on { color: var(--c); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px color-mix(in srgb, var(--c) 50%, #000), 0 0 10px color-mix(in srgb, var(--c) 25%, transparent); }

  .mixer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: 1fr auto;
    gap: 0 6px;
    padding: 14px 12px 12px;
    border-radius: 18px;
    background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.012) 0 1px, transparent 1px 2px), linear-gradient(180deg, #212128, #16161b);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 16px 34px rgb(0 0 0 / 0.5);
  }
  .ch { display: flex; gap: 4px; min-height: 0; }
  .ch.mir { flex-direction: row-reverse; grid-column: 3; grid-row: 1; }
  .knobs { display: grid; gap: 1px; align-content: start; }
  .strip { display: flex; gap: 5px; padding: 6px 0 4px; }
  .ch.mir .strip { flex-direction: row-reverse; }
  .cen { grid-column: 2; grid-row: 1; display: grid; grid-template-rows: auto auto 1fr; justify-items: center; gap: 2px; border-left: 1px solid rgb(0 0 0 / 0.4); border-right: 1px solid rgb(0 0 0 / 0.4); box-shadow: 1px 0 0 rgb(255 255 255 / 0.03), -1px 0 0 rgb(255 255 255 / 0.03); }
  .mm { display: flex; gap: 3px; padding: 8px 0 6px; }
  .xf { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding-top: 10px; margin-top: 8px; border-top: 1px solid rgb(0 0 0 / 0.4); font-size: 11px; }
  .a { color: #3db4ff; text-shadow: 0 0 8px #3db4ff; }
  .b { color: #ff8a3d; text-shadow: 0 0 8px #ff8a3d; }

  .lib {
    display: grid; grid-template-columns: 200px 1fr; min-height: 0; overflow: hidden;
    border-radius: 18px;
    background: linear-gradient(180deg, #17171c, #111115);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 16px 34px rgb(0 0 0 / 0.5);
  }
  aside { padding: 16px 12px; border-right: 1px solid rgb(0 0 0 / 0.45); box-shadow: 1px 0 0 rgb(255 255 255 / 0.03); }
  h3 { margin: 0 8px 8px; font-size: 11px; font-weight: 400; color: rgb(236 236 234 / 0.5); }
  .side { display: flex; justify-content: space-between; padding: 7px 8px; border-radius: 8px; color: rgb(236 236 234 / 0.75); }
  .side span { color: rgb(236 236 234 / 0.35); }
  .side.on { background: rgb(255 255 255 / 0.06); color: #fff; }
  .tbl { padding: 14px 18px; overflow: hidden; }
  .search { display: flex; justify-content: space-between; width: 340px; padding: 8px 12px; border-radius: 10px; background: rgb(0 0 0 / 0.35); box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.5), 0 1px 0 rgb(255 255 255 / 0.04); color: rgb(236 236 234 / 0.45); margin-bottom: 12px; }
  kbd { font: inherit; font-size: 11px; }
  .th, .tr { display: grid; grid-template-columns: 28px 1.4fr 1.2fr 60px 60px 60px; align-items: center; height: 29px; padding: 0 8px; }
  .th { color: rgb(236 236 234 / 0.42); font-size: 11px; }
  .tr { border-radius: 8px; }
  .tr.sel { background: rgb(255 255 255 / 0.06); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); }
  .dim { color: rgb(236 236 234 / 0.55); }
  .ld { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; font-size: 10px; color: #0b0b0c; }
  .ld.a { background: #3db4ff; } .ld.b { background: #ff8a3d; }
</style>
