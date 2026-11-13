<script>
  // Classic Glass on the real app's layout: waveforms, deck · mixer · deck,
  // then the library with its sidebar. Flat graphite panels with a hairline
  // edge, machined tick dials, calm liquid waveforms. `palette` sets the two
  // deck colours and their waveform bands.
  import Ruler from './Ruler.svelte';
  import ModePanel from './ModePanel.svelte';
  import Backdrop from './Backdrop.svelte';
  import { CUES } from './perf.js';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Meter from '../bold/Meter.svelte';
  import Time from '../bold/Time.svelte';
  import { decks, library } from '../bold/track.js';

  // modes: which mode each deck's panel opens on.
  // tint: how much deck colour the backdrop carries (0 = none).
  /** @type {{ palette: { a: string, b: string, bands: Record<string, string>[] }, modes?: string[], tint?: number }} */
  let { palette, modes = ['Cues', 'Cues'], tint = 0 } = $props();
  // svelte-ignore state_referenced_locally (only the starting mode comes from the prop)
  let mode = $state([...modes]);
  const C = $derived([palette.a, palette.b]);

  let eq = $state([[0.5, 0.58, 0.5, 0.34, 0.5], [0.5, 0.5, 0.64, 0.5, 0.42]]);
  let vol = $state([0.84, 0.7]);
  let xf = $state(0.44);
  let pfl = $state([false, true]);
  let keylock = $state([true, false]);
  const pitch = ['+0.00', '−0.78'];
</script>

<div class="studio" style:--a={C[0]} style:--b={C[1]}>
  <Backdrop a={C[0]} b={C[1]} {tint} />
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
          <div class="ov"><Wave deck={k} kind="overview" opts={{ ...palette.bands[k], past: 'rgba(12,12,14,0.55)' }} />{#each CUES[k] as q}{#if q}<i class="mark" style:left="{(q.t / d.data.length) * 100}%" style:--q={q.c}></i>{/if}{/each}</div>
          <div class="mid">
            <span class="el"><Time deck={k} /></span>
            <span class="rm"><Time deck={k} remaining /></span>
          </div>
          <ModePanel deck={k} color={C[k]} bind:mode={mode[k]} />
          <div class="tp">
            <button class="cue">Cue</button>
            <button class="play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
            <button class="ctl sync" class:on={k === 1}>Sync</button>
            <div class="ctl jumps"><button aria-label="Jump back 4 beats">‹</button><span>4</span><button aria-label="Jump forward 4 beats">›</button></div>
          </div>
        </div>
        <div class="pitch">
          <span class="pv">{pitch[k]}%</span>
          <div class="pf"><Fader value={k ? 0.46 : 0.5} look="machined" /></div>
          <button class="ctl kl" class:on={keylock[k]} onclick={() => (keylock[k] = !keylock[k])}>Key lock</button>
        </div>
      </section>
    {/each}

    <section class="panel mixer" style:order="1">
      <div class="strips">
        {#each [0, 1] as k}
          <div class="ch" class:r={k === 1} style:order={k ? 2 : 0}>
            <div class="dials">{#each ['Trim', 'High', 'Mid', 'Low', 'Filter'] as l, i}<Dial bind:value={eq[k][i]} bipolar label={l} size={20} color={C[k]} glow={0.25} />{/each}</div>
            <div class="fz"><Fader bind:value={vol[k]} look="machined" /><Meter deck={k} look="bar" /></div>
            <button class="ctl pfl" class:on={pfl[k]} aria-label="Cue {decks[k].title} in headphones" onclick={() => (pfl[k] = !pfl[k])}><svg viewBox="0 0 16 16"><path d="M3 10V8a5 5 0 0 1 10 0v2" /><rect x="2" y="9.5" width="3" height="4.5" rx="1" /><rect x="11" y="9.5" width="3" height="4.5" rx="1" /></svg></button>
          </div>
        {/each}
        <div class="master" style:order="1">
          <Dial value={0.72} label="Master" size={26} color="#e9e7e0" glow={0.2} />
          <Dial value={0.5} label="Cue mix" size={22} color="#e9e7e0" glow={0.2} />
          <div class="mm"><Meter deck={0} look="bar" /><Meter deck={1} look="bar" /></div>
          <button class="ctl rec"><i></i>Rec</button>
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
        <button class="ctl sampler">Sampler</button>
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
  /* One system for the whole screen.
     Type: five sizes. Text: three levels plus "off" for empty or disabled.
     Space: a 4px grid; every panel pads 16 and every gap between panels is 12.
     Depth, back to front: page, glass panel, recessed well (darker, inner
     shadow: waveforms, search, zoom), outlined control, solid primary (Play). */
  .studio {
    --t-xs: 11px; --t-sm: 13px; --t-md: 16px; --t-lg: 24px; --t-xl: 32px;
    --fg: #eceae4; --fg-2: rgb(236 234 228 / 0.64); --fg-3: rgb(236 234 228 / 0.5); --fg-off: rgb(236 234 228 / 0.3);
    --line: rgb(255 255 255 / 0.07); --edge: rgb(255 255 255 / 0.11); --hover: rgb(255 255 255 / 0.05); --sel: rgb(255 255 255 / 0.08);
    --well: rgb(0 0 0 / 0.26); --well-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.04);
    --cue: #e8b04a;
    --pad: 16px; --gap: 12px; --r-panel: 16px; --r: 8px;
    --h-lg: 44px; --h-md: 32px; --h-sm: 24px;

    height: 100vh;
    min-width: 1200px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: 136px 356px minmax(0, 1fr);
    gap: var(--gap);
    padding: var(--gap);
    position: relative;
    background: #09090b;
    color: var(--fg);
    font-family: 'Geist Variable', sans-serif;
    font-feature-settings: 'tnum';
    font-size: var(--t-sm);
    line-height: 1.3;
  }
  button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms ease; }
  button:active { transform: scale(0.97); }
  .dim { color: var(--fg-2); }
  /* An outlined control: the one look for every secondary button. */
  .ctl { border-radius: var(--r); box-shadow: inset 0 0 0 1px var(--edge); color: var(--fg-2); }
  .ctl:hover { background: var(--hover); }

  .studio > :not(:global(.bd)) { position: relative; }
  /* Liquid Glass: frosted panels over the backdrop, a bright top edge, a
     faint inner ring. One surface for everything. */
  .panel, .tracks {
    border-radius: var(--r-panel);
    background: linear-gradient(180deg, rgb(255 255 255 / 0.065), rgb(255 255 255 / 0.03));
    backdrop-filter: blur(30px) saturate(1.25);
    -webkit-backdrop-filter: blur(30px) saturate(1.25);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08), inset 0 1px 0 rgb(255 255 255 / 0.14), 0 20px 50px rgb(0 0 0 / 0.3);
  }

  .waves { position: relative; display: grid; grid-template-rows: 1fr 1fr; overflow: hidden; }
  .lane { position: relative; min-height: 0; }
  .lane + .lane { border-top: 1px solid var(--line); }
  .who { position: absolute; left: var(--pad); top: 8px; display: flex; align-items: center; gap: 8px; font-size: var(--t-xs); color: var(--fg-2); }
  .who i { width: 3px; height: 12px; border-radius: 2px; background: var(--c); }
  .zoom { position: absolute; right: 8px; top: 8px; display: flex; align-items: center; gap: 4px; height: var(--h-sm); padding: 0 4px; border-radius: 6px; background: rgb(11 11 13 / 0.8); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--t-xs); color: var(--fg-2); }
  .zoom button { width: 20px; height: 20px; border-radius: 4px; }
  .zoom button:hover { background: var(--hover); }

  .row { display: grid; grid-template-columns: 1fr 300px 1fr; gap: var(--gap); min-height: 0; }
  .deck { overflow: visible; display: grid; grid-template-columns: minmax(0, 1fr) 56px; gap: var(--pad); padding: var(--pad); min-height: 0; }
  .deck.r { grid-template-columns: 56px minmax(0, 1fr); }
  .deck.r .pitch { order: -1; }
  .main { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto 1fr auto; gap: 12px; min-width: 0; }
  header { display: flex; justify-content: space-between; align-items: start; }
  h2 { margin: 0; font-size: var(--t-lg); font-weight: 400; letter-spacing: -0.02em; line-height: 28px; }
  .t p { margin: 0; font-size: var(--t-sm); color: var(--fg-2); }
  .bpm { display: grid; justify-items: end; }
  .bpm strong { font-size: var(--t-xl); font-weight: 300; letter-spacing: -0.03em; line-height: 28px; }
  .bpm span { font-size: var(--t-xs); line-height: 17px; color: var(--fg-3); }
  .ov { position: relative; height: 48px; border-radius: var(--r); overflow: hidden; background: var(--well); box-shadow: var(--well-shadow); }
  .mid { display: flex; justify-content: space-between; align-items: baseline; }
  .el { font-size: var(--t-lg); font-weight: 300; letter-spacing: -0.03em; line-height: 28px; }
  .rm { font-size: var(--t-md); font-weight: 300; color: var(--fg-2); }
  .mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--q); opacity: 0.9; }
  .mark::before { content: ''; position: absolute; top: 0; left: -3px; border: 4px solid transparent; border-top-color: var(--q); }

  /* Transport sits on the same four columns as the tabs and mode row. */
  .tp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .tp > * { height: var(--h-lg); border-radius: var(--r); }
  .cue { color: var(--cue); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cue) 55%, transparent); }
  .play { display: grid; place-items: center; background: var(--fg); color: #111; }
  .play svg { width: 14px; height: 14px; fill: currentColor; }
  .sync.on { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent); }
  .jumps { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
  .jumps:hover { background: none; }
  .jumps button { height: 100%; font-size: var(--t-md); border-radius: var(--r); }
  .jumps button:hover { background: var(--hover); }
  .jumps span { font-size: var(--t-xs); color: var(--fg-3); }
  .pitch { display: grid; grid-template-rows: 28px 1fr var(--h-lg); justify-items: center; align-items: center; gap: 12px; }
  .pv { font-size: var(--t-xs); color: var(--fg-2); }
  .pf { height: 100%; min-height: 0; }
  .kl { width: 100%; height: var(--h-lg); font-size: var(--t-xs); line-height: 1.2; color: var(--fg-3); box-shadow: none; }
  .kl.on { color: var(--fg); box-shadow: inset 0 0 0 1px var(--edge); }

  .mixer { min-height: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 0; padding: var(--pad) 12px; }
  .mixer :global(.lbl) { white-space: nowrap; }
  .strips { display: flex; justify-content: space-between; min-height: 0; }
  .ch { display: grid; grid-template-columns: auto auto; grid-template-rows: 1fr auto; gap: 8px 4px; }
  .ch.r { direction: rtl; }
  .ch.r > * { direction: ltr; }
  .dials { display: grid; align-content: space-between; grid-row: 1 / -1; }
  .fz { display: flex; gap: 4px; height: 100%; min-height: 0; }
  .pfl { width: 32px; height: var(--h-sm); display: grid; place-items: center; justify-self: center; }
  .pfl svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; }
  .pfl.on { color: var(--cue); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cue) 55%, transparent); }
  .master { display: grid; justify-items: center; align-content: start; gap: 8px; }
  .mm { display: flex; gap: 4px; height: 72px; }
  .rec { display: flex; align-items: center; gap: 8px; height: var(--h-sm); padding: 0 8px; font-size: var(--t-xs); }
  .rec i { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-off); }
  .xf { display: flex; align-items: center; gap: 8px; height: var(--h-lg); margin-top: 12px; border-top: 1px solid var(--line); }
  /* The crossfader row shares the transport row's height and baseline. */
  .xr { flex: 1; display: grid; }

  .libarea { display: grid; grid-template-columns: 200px 1fr; gap: var(--gap); min-height: 0; overflow: hidden; }
  .side { display: grid; align-content: start; gap: 0; padding: 8px 0; }
  .side .h { padding: 16px 8px 4px; font-size: var(--t-xs); color: var(--fg-3); }
  .side .h:first-child { padding-top: 0; }
  .side button { display: flex; justify-content: space-between; height: 28px; align-items: center; padding: 0 8px; border-radius: var(--r); text-align: left; color: var(--fg-2); }
  .side button:hover { background: var(--hover); }
  .side button span { font-size: var(--t-xs); color: var(--fg-3); }
  .side button.on { background: var(--sel); color: var(--fg); }
  .side button.add { color: var(--fg-3); }
  /* Box edges line up with box edges (search, selected row); text lines up
     with text, 16px in from the panel. */
  .tracks { padding: 8px; display: grid; align-content: start; overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; }
  .bar > span:empty { flex: 1; }
  .search { width: 360px; height: var(--h-md); display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: var(--r); background: var(--well); box-shadow: var(--well-shadow); color: var(--fg-3); }
  .search svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; }
  .search kbd { margin-left: auto; font: inherit; font-size: var(--t-xs); color: var(--fg-3); }
  .count { font-size: var(--t-xs); color: var(--fg-3); }
  .sampler { height: var(--h-md); padding: 0 12px; }
  .thead, .tr { display: grid; grid-template-columns: 12px 1.4fr 1.2fr 56px 56px 56px 1fr; gap: 12px; align-items: center; padding: 0 8px; }
  .thead { height: 28px; font-size: var(--t-xs); color: var(--fg-3); border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  .tr { height: 28px; border-radius: var(--r); }
  .tr:hover { background: var(--hover); }
  .tr.sel { background: var(--sel); box-shadow: inset 0 0 0 1px var(--edge); }
  .dk i { display: block; width: 3px; height: 14px; border-radius: 2px; }
  .end { width: 3px; height: 14px; border-radius: 2px; }
</style>
