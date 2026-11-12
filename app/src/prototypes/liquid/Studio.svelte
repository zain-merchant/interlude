<script>
  // Classic Glass on the real app's layout: waveforms, deck · mixer · deck,
  // then the library with its sidebar. Flat graphite panels with a hairline
  // edge, machined tick dials, calm liquid waveforms. `palette` sets the two
  // deck colours and their waveform bands.
  import Ruler from './Ruler.svelte';
  import SectionMap from './SectionMap.svelte';
  import StemLanes from './StemLanes.svelte';
  import SnapPads from './SnapPads.svelte';
  import { CUES } from './perf.js';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Meter from '../bold/Meter.svelte';
  import Time from '../bold/Time.svelte';
  import { decks, library } from '../bold/track.js';

  // cueBar: what fills the deck's performance area (was the Cues / Loop /
  // FX / Stems bar).
  //  'map'   the track as its sections, cue flags, countdown to the next one
  //  'stems' the overview split into four stem lanes with mute and level
  //  'pads'  eight pads: hot cues with a snapshot of the music, plus a page
  /** @type {{ palette: { a: string, b: string, bands: Record<string, string>[] }, cueBar?: 'map'|'stems'|'pads' }} */
  let { palette, cueBar = 'map' } = $props();
  const C = $derived([palette.a, palette.b]);

  let eq = $state([[0.5, 0.58, 0.5, 0.34, 0.5], [0.5, 0.5, 0.64, 0.5, 0.42]]);
  let vol = $state([0.84, 0.7]);
  let xf = $state(0.44);
  let pfl = $state([false, true]);
  let keylock = $state([true, false]);
  const pitch = ['+0.00', '−0.78'];
</script>

<div class="studio" style:--a={C[0]} style:--b={C[1]}>
  <section class="panel waves">
    {#each [0, 1] as k}
      <div class="lane" style:--c={C[k]}>
        <Wave deck={k} kind="ribbon" opts={{ ...palette.bands[k], glow: 0.2, seconds: 12, grid: 'rgba(255,255,255,0.03)', gridStrong: 'rgba(255,255,255,0.07)', past: 'rgba(12,12,14,0.5)', edge: palette.bands[k].high }} />
        <span class="who"><i></i>{decks[k].title}</span>
      </div>
    {/each}
    <div class="zoom"><button aria-label="Zoom out">−</button><span>12 s</span><button aria-label="Zoom in">+</button></div>
  </section>

  <div class="row">
    {#each [0, 1] as k}
      {@const d = decks[k]}
      <section class="panel deck" class:r={k === 1} style:--c={C[k]} style:order={k ? 2 : 0}>
        <div class="main">
          <header>
            <div class="t"><div><h2>{d.title}</h2><p>{d.artist}</p></div></div>
            <div class="bpm"><strong>{d.bpm}.00</strong><span>{d.key} · {d.camelot} · BPM</span></div>
          </header>
          {#if cueBar !== 'stems'}
            <div class="ov" class:thin={cueBar !== 'stems'}><Wave deck={k} kind="overview" opts={{ ...palette.bands[k], past: 'rgba(12,12,14,0.55)' }} />{#each CUES[k] as q}{#if q}<i class="mark" style:left="{(q.t / d.data.length) * 100}%" style:--q={q.c}></i>{/if}{/each}</div>
          {/if}
          <div class="mid">
            <span class="el"><Time deck={k} /></span>
            <span class="rm"><Time deck={k} remaining /></span>
          </div>
          <div class="perf">
            {#if cueBar === 'map'}<SectionMap deck={k} color={C[k]} />
            {:else if cueBar === 'stems'}<StemLanes deck={k} color={C[k]} bands={palette.bands[k]} />
            {:else}<SnapPads deck={k} color={C[k]} />{/if}
          </div>
          <div class="tp">
            <button class="cue">Cue</button>
            <button class="play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
            <span></span>
            <button class="sync" class:on={k === 1}>Sync</button>
            <button class="jump" aria-label="Jump back">‹</button><button class="jump" aria-label="Jump forward">›</button>
          </div>
        </div>
        <div class="pitch">
          <span class="pv">{pitch[k]}%</span>
          <div class="pf"><Fader value={k ? 0.46 : 0.5} look="machined" /></div>
          <button class="kl" class:on={keylock[k]} onclick={() => (keylock[k] = !keylock[k])}>Key lock</button>
        </div>
      </section>
    {/each}

    <section class="panel mixer" style:order="1">
      <div class="strips">
        {#each [0, 1] as k}
          <div class="ch" class:r={k === 1} style:order={k ? 2 : 0}>
            <div class="dials">{#each ['Trim', 'High', 'Mid', 'Low', 'Filter'] as l, i}<Dial bind:value={eq[k][i]} bipolar label={l} size={20} color={C[k]} glow={0.25} />{/each}</div>
            <div class="fz"><Fader bind:value={vol[k]} look="machined" /><Meter deck={k} look="bar" /></div>
            <button class="pfl" class:on={pfl[k]} aria-label="Cue {decks[k].title} in headphones" onclick={() => (pfl[k] = !pfl[k])}><svg viewBox="0 0 16 16"><path d="M3 10V8a5 5 0 0 1 10 0v2" /><rect x="2" y="9.5" width="3" height="4.5" rx="1" /><rect x="11" y="9.5" width="3" height="4.5" rx="1" /></svg></button>
          </div>
        {/each}
        <div class="master" style:order="1">
          <Dial value={0.72} label="Master" size={26} color="#e9e7e0" glow={0.2} />
          <Dial value={0.5} label="Cue mix" size={22} color="#e9e7e0" glow={0.2} />
          <div class="mm"><Meter deck={0} look="bar" /><Meter deck={1} look="bar" /></div>
          <button class="rec"><i></i>Rec</button>
        </div>
      </div>
      <div class="xf">
        <i class="end" style:background={C[0]}></i>
        <div class="xr"><Ruler value={xf} from={0.5} n={41} major={10} color="#e9e7e0" height={8} /><Fader bind:value={xf} vertical={false} look="machined" /></div>
        <i class="end" style:background={C[1]}></i>
      </div>
    </section>
  </div>

  <section class="libarea">
    <nav class="side">
      <div class="h">Library</div>
      {#each [['All tracks', 48], ['House', 12], ['Techno', 12], ['Disco Edits', 12], ['Warmup', 12]] as [n, c], i}<button class:on={i === 0}>{n}{#if i === 0}<span>{c}</span>{/if}</button>{/each}
      <button class="add">+ Add music folder</button>
      <div class="h">Playlists</div>
      <button>Friday warmup<span>6</span></button>
      <button>Peak time<span>4</span></button>
      <button class="add">+ New playlist</button>
      <div class="h">History</div>
    </nav>
    <div class="tracks">
      <div class="bar">
        <div class="search"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>Search artist, title, folder<kbd>Ctrl F</kbd></div>
        <span class="count">48 tracks</span>
        <span></span>
        <button class="sampler">Sampler</button>
      </div>
      <div class="thead"><span></span><span>Title</span><span>Artist</span><span>BPM</span><span>Key</span><span>Time</span><span>Folder</span></div>
      {#each library.slice(0, 9) as r, i}
        <div class="tr" class:sel={i === 2}>
          <span class="dk">{#if i === 0}<i style:background={C[0]}></i>{:else if i === 8}<i style:background={C[1]}></i>{/if}</span>
          <span>{r[0]}</span><span class="dim">{r[1]}</span><span>{r[2]}</span><span>{r[3]}</span><span class="dim">{r[4]}</span><span class="dim">{r[5]}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .studio {
    height: 100vh;
    min-width: 1200px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: 140px 352px minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    background: #0b0b0d;
    color: #eceae4;
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
    font-size: 13px;
  }
  button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms ease; }
  button:active { transform: scale(0.97); }
  .dim { color: rgb(236 234 228 / 0.55); }

  /* One surface for every panel: a step lighter than the page, a hairline
     edge, a 1px top highlight. No gradients, no glow. */
  .panel { border-radius: 12px; background: #141416; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.05); }

  .waves { position: relative; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; }
  .lane { position: relative; min-height: 0; }
  .lane + .lane { border-top: 1px solid rgb(255 255 255 / 0.06); }
  .who { position: absolute; left: 12px; top: 8px; display: flex; gap: 8px; font-size: 12px; color: rgb(236 234 228 / 0.75); }
  .who i { width: 3px; height: 12px; margin-top: 2px; border-radius: 2px; background: var(--c); }
  .zoom { position: absolute; right: 10px; top: 8px; display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px; border-radius: 8px; background: rgb(11 11 13 / 0.8); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); font-size: 12px; color: rgb(236 234 228 / 0.7); }
  .zoom button { width: 22px; height: 22px; border-radius: 6px; }
  .zoom button:hover { background: rgb(255 255 255 / 0.06); }

  .row { display: grid; grid-template-columns: 1fr 300px 1fr; gap: 10px; min-height: 0; }
  .deck { overflow: visible; display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 16px; padding: 16px 16px 14px 18px; min-height: 0; }
  .deck.r { grid-template-columns: 64px minmax(0, 1fr); padding: 16px 18px 14px 16px; }
  .deck.r .pitch { order: -1; }
  .main { grid-template-columns: minmax(0, 1fr); display: grid; align-content: space-between; gap: 10px; min-width: 0; }
  .ov { height: 52px; }
  header { display: flex; justify-content: space-between; align-items: start; }
  .t { display: flex; gap: 10px; }
  h2 { margin: 0; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; line-height: 26px; }
  .t p { margin: 2px 0 0; font-size: 13px; color: rgb(236 234 228 / 0.55); }
  .bpm { display: grid; justify-items: end; }
  .bpm strong { font-size: 30px; font-weight: 300; letter-spacing: -0.03em; line-height: 1; }
  .bpm span { margin-top: 4px; font-size: 11.5px; color: rgb(236 234 228 / 0.55); }
  .ov { position: relative; border-radius: 6px; overflow: hidden; background: #0e0e10; }
  .mid { display: flex; justify-content: space-between; align-items: baseline; }
  .el { font-size: 26px; font-weight: 300; letter-spacing: -0.03em; }
  .rm { justify-self: end; font-size: 18px; font-weight: 300; color: rgb(236 234 228 / 0.55); }
  .mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--q); opacity: 0.9; }
  .mark::before { content: ''; position: absolute; top: 0; left: -3px; border: 4px solid transparent; border-top-color: var(--q); }

  .perf { min-height: 0; }
  .ov.thin { height: 40px; }
  .tp { display: flex; align-items: center; gap: 8px; }
  .tp span { flex: 1; }
  .tp > button { height: 46px; border-radius: 10px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); }
  .cue { width: 80px; color: #e8b04a; box-shadow: inset 0 0 0 1px rgb(232 176 74 / 0.55) !important; }
  .play { width: 80px; display: grid; place-items: center; background: #eceae4 !important; color: #111; }
  .play svg { width: 14px; height: 14px; fill: currentColor; }
  .sync { height: 34px !important; padding: 0 14px; color: rgb(236 234 228 / 0.75); }
  .sync.on { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 50%, transparent) !important; }
  .jump { width: 30px; height: 34px !important; box-shadow: none !important; color: rgb(236 234 228 / 0.55); }
  .pitch { display: grid; grid-template-rows: auto 1fr auto; justify-items: center; gap: 8px; }
  .pv { font-size: 12px; color: rgb(236 234 228 / 0.7); }
  .pf { height: 100%; min-height: 0; }
  .kl { font-size: 11.5px; color: rgb(236 234 228 / 0.45); padding: 4px 6px; border-radius: 6px; }
  .kl.on { color: #eceae4; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12); }

  .mixer { min-height: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 8px; padding: 12px 12px 10px; }
  .strips { display: flex; justify-content: space-between; min-height: 0; }
  .ch { display: grid; grid-template-columns: auto auto; grid-template-rows: 1fr auto; gap: 6px 4px; }
  .ch.r { direction: rtl; }
  .ch.r > * { direction: ltr; }
  .dials { display: grid; align-content: space-between; grid-row: 1 / -1; }
  .fz { display: flex; gap: 6px; height: 100%; min-height: 0; }
  .pfl { width: 32px; height: 26px; border-radius: 7px; display: grid; place-items: center; justify-self: center; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); color: rgb(236 234 228 / 0.55); }
  .pfl svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; }
  .pfl.on { color: #e8b04a; box-shadow: inset 0 0 0 1px rgb(232 176 74 / 0.55); }
  .master { display: grid; justify-items: center; align-content: start; gap: 6px; padding-top: 2px; }
  .mm { display: flex; gap: 3px; height: 70px; }
  .rec { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 7px; font-size: 12px; color: rgb(236 234 228 / 0.7); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); }
  .rec i { width: 6px; height: 6px; border-radius: 50%; background: rgb(236 234 228 / 0.4); }
  .xf { display: flex; align-items: center; gap: 10px; padding: 8px 4px 0; border-top: 1px solid rgb(255 255 255 / 0.06); font-size: 12px; font-weight: 600; }
  .xr { flex: 1; display: grid; gap: 0; }

  .libarea { display: grid; grid-template-columns: 200px 1fr; gap: 10px; min-height: 0; overflow: hidden; }
  .side { display: grid; align-content: start; gap: 1px; padding: 4px 0; }
  .side .h { padding: 14px 10px 6px; font-size: 11.5px; color: rgb(236 234 228 / 0.45); }
  .side .h:first-child { padding-top: 6px; }
  .side button { display: flex; justify-content: space-between; height: 30px; align-items: center; padding: 0 10px; border-radius: 8px; text-align: left; color: rgb(236 234 228 / 0.75); }
  .side button span { font-size: 12px; color: rgb(236 234 228 / 0.4); }
  .side button.on { background: #1c1c1f; color: #eceae4; }
  .side button.add { color: rgb(236 234 228 / 0.45); }
  .tracks { border-radius: 12px; background: #141416; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06); padding: 10px; display: grid; align-content: start; overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; }
  .bar > span:empty { flex: 1; }
  .search { width: 360px; height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 8px; background: #0e0e10; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); color: rgb(236 234 228 / 0.45); }
  .search svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; }
  .search kbd { margin-left: auto; font: inherit; font-size: 11.5px; color: rgb(236 234 228 / 0.35); }
  .count { font-size: 12px; color: rgb(236 234 228 / 0.5); }
  .sampler { height: 30px; padding: 0 12px; border-radius: 8px; color: rgb(236 234 228 / 0.7); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .thead, .tr { display: grid; grid-template-columns: 22px 1.4fr 1.2fr 56px 56px 56px 1fr; gap: 10px; align-items: center; padding: 0 10px; }
  .thead { height: 28px; font-size: 11.5px; color: rgb(236 234 228 / 0.45); border-bottom: 1px solid rgb(255 255 255 / 0.06); }
  .tr { height: 30px; border-radius: 7px; }
  .tr:hover { background: rgb(255 255 255 / 0.03); }
  .tr.sel { background: rgb(255 255 255 / 0.07); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); }
  .dk i { display: block; width: 3px; height: 14px; border-radius: 2px; }
  .end { width: 3px; height: 14px; border-radius: 2px; }
</style>
