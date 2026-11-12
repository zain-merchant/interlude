<script>
  // Classic Glass on the real app's layout: waveforms, deck · mixer · deck,
  // then the library with its sidebar. Flat graphite panels with a hairline
  // edge, machined tick dials, calm liquid waveforms. `palette` sets the two
  // deck colours and their waveform bands.
  import Ruler from './Ruler.svelte';
  import Wave from '../bold/Wave.svelte';
  import Dial from '../bold/Dial.svelte';
  import Fader from '../bold/Fader.svelte';
  import Meter from '../bold/Meter.svelte';
  import Time from '../bold/Time.svelte';
  import { decks, library } from '../bold/track.js';

  // cueBar: how the Cues / Loop / FX / Stems bar is drawn.
  //  'tabs'  underline tabs over full-width named cue pads
  //  'cards' tall cue cards with name and time; modes as a quiet text row
  //  'strip' one row: a mode menu on the left, the mode's controls beside it
  /** @type {{ palette: { a: string, b: string, bands: Record<string, string>[] }, cueBar?: 'tabs'|'cards'|'strip' }} */
  let { palette, cueBar = 'tabs' } = $props();
  const CUES = [
    [{ n: 'Intro', t: 30.2, c: '#e8b04a' }, { n: 'Build', t: 75.1, c: '#7cb6ff' }, { n: 'Drop', t: 105.0, c: '#ef7a64' }, null],
    [{ n: 'Intro', t: 22.4, c: '#e8b04a' }, { n: 'Break', t: 70.0, c: '#7cb6ff' }, null, { n: 'Drop', t: 120.5, c: '#ef7a64' }],
  ];
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // The strip shows its menu open on the right deck, so you can see it.
  let menu = $state([false, cueBar === 'strip']);
  const C = $derived([palette.a, palette.b]);

  let tab = $state(['Cues', 'Cues']);
  let eq = $state([[0.5, 0.58, 0.5, 0.34, 0.5], [0.5, 0.5, 0.64, 0.5, 0.42]]);
  let vol = $state([0.84, 0.7]);
  let xf = $state(0.44);
  let stems = $state([[true, true, true, true], [false, true, true, true]]);
  let pfl = $state([false, true]);
  let keylock = $state([true, false]);
  const pitch = ['+0.00', '−0.78'];
  const tabs = ['Cues', 'Loop', 'FX', 'Stems'];
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
          <div class="ov"><Wave deck={k} kind="overview" opts={{ ...palette.bands[k], past: 'rgba(12,12,14,0.55)' }} />{#each CUES[k] as q}{#if q}<i class="mark" style:left="{(q.t / d.data.length) * 100}%" style:--q={q.c}></i>{/if}{/each}</div>
          <div class="mid" class:bare={cueBar === 'strip'}>
            <span class="el"><Time deck={k} /></span>
            {#if cueBar === 'tabs'}
              <div class="utabs" role="tablist">
                {#each tabs as t}<button role="tab" aria-selected={tab[k] === t} class:on={tab[k] === t} onclick={() => (tab[k] = t)}>{t}</button>{/each}
              </div>
            {:else if cueBar === 'cards'}
              <div class="ttabs" role="tablist">
                {#each tabs as t}<button role="tab" aria-selected={tab[k] === t} class:on={tab[k] === t} onclick={() => (tab[k] = t)}>{t}</button>{/each}
              </div>
            {:else}<span></span>{/if}
            <span class="rm"><Time deck={k} remaining /></span>
          </div>
          <div class="tabbody {cueBar}">
            {#if cueBar === 'strip'}
              <div class="mode">
                <button class="mbtn" aria-haspopup="menu" aria-expanded={menu[k]} onclick={() => (menu[k] = !menu[k])}>{tab[k]}<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4" /></svg></button>
                {#if menu[k]}
                  <div class="mlist" role="menu">{#each tabs as t, i}<button role="menuitem" class:on={tab[k] === t} onclick={() => { tab[k] = t; menu[k] = false; }}>{t}<kbd>{i + 1}</kbd></button>{/each}</div>
                {/if}
              </div>
            {/if}
            {#if tab[k] === 'Cues'}
              <div class="pads">
                {#each CUES[k] as q, i}
                  {#if q}
                    <button class="pad" style:--q={q.c}><span class="no">{i + 1}</span><span class="nm">{q.n}</span>{#if cueBar === 'cards'}<span class="tm">{mmss(q.t)}</span>{/if}</button>
                  {:else}
                    <button class="pad empty"><span class="no">{i + 1}</span><span class="nm">Set cue</span></button>
                  {/if}
                {/each}
              </div>
            {:else if tab[k] === 'Loop'}
              <div class="loop"><button>½</button><button class="on">Loop 4</button><button>2×</button><span></span><button aria-label="Move loop back">«</button><button aria-label="Move loop forward">»</button></div>
            {:else if tab[k] === 'FX'}
              <div class="fx"><button class="sel">Echo <i>⌄</i></button><button aria-label="Shorter">‹</button><span class="num">1</span><button aria-label="Longer">›</button><span class="lbl">Beats</span><Dial value={0.6} size={20} color={C[k]} glow={0.2} /><span class="lbl">Level</span><span></span><button class="on">On</button></div>
            {:else}
              <div class="stems">{#each ['Vocals', 'Melody', 'Bass', 'Drums'] as s, i}<button class:off={!stems[k][i]} onclick={() => (stems[k][i] = !stems[k][i])}><i></i>{s}</button>{/each}</div>
            {/if}
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
  .main { grid-template-columns: minmax(0, 1fr); display: grid; grid-template-rows: auto 52px auto auto auto; gap: 10px; min-width: 0; }
  header { display: flex; justify-content: space-between; align-items: start; }
  .t { display: flex; gap: 10px; }
  h2 { margin: 0; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; line-height: 26px; }
  .t p { margin: 2px 0 0; font-size: 13px; color: rgb(236 234 228 / 0.55); }
  .bpm { display: grid; justify-items: end; }
  .bpm strong { font-size: 30px; font-weight: 300; letter-spacing: -0.03em; line-height: 1; }
  .bpm span { margin-top: 4px; font-size: 11.5px; color: rgb(236 234 228 / 0.55); }
  .ov { position: relative; border-radius: 6px; overflow: hidden; background: #0e0e10; }
  .mid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
  .el { font-size: 26px; font-weight: 300; letter-spacing: -0.03em; }
  .rm { justify-self: end; font-size: 18px; font-weight: 300; color: rgb(236 234 228 / 0.55); }
  .mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--q); opacity: 0.9; }
  .mark::before { content: ''; position: absolute; top: 0; left: -3px; border: 4px solid transparent; border-top-color: var(--q); }

  /* tabs: plain words, the current one underlined in the deck colour. */
  .utabs { display: flex; gap: 18px; }
  .utabs button { position: relative; height: 28px; font-size: 13px; color: rgb(236 234 228 / 0.5); }
  .utabs button:hover { color: rgb(236 234 228 / 0.85); }
  .utabs button.on { color: #eceae4; }
  .utabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 1px; background: var(--c); }
  /* cards: the modes are a quiet row of words, no box. */
  .ttabs { display: flex; gap: 2px; }
  .ttabs button { height: 24px; padding: 0 8px; border-radius: 6px; font-size: 12px; color: rgb(236 234 228 / 0.45); }
  .ttabs button.on { color: #eceae4; background: rgb(255 255 255 / 0.07); }

  .tabbody { display: flex; gap: 8px; align-items: stretch; }
  .tabbody > div:not(.mode) { flex: 1; min-height: 38px; display: flex; align-items: center; gap: 6px; }
  .tabbody button { height: 38px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .tabbody button:hover { background: rgb(255 255 255 / 0.04); }

  .pads { gap: 6px !important; }
  .pad { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 10px; position: relative; overflow: hidden; text-align: left; background: rgb(255 255 255 / 0.02); }
  .pad::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--q); }
  .pad .no { font-size: 11px; color: rgb(236 234 228 / 0.45); }
  .pad .nm { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pad .tm { margin-left: auto; font-size: 11.5px; color: rgb(236 234 228 / 0.5); }
  .pad.empty { background: none; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); outline: 1px dashed rgb(255 255 255 / 0.14); outline-offset: -4px; color: rgb(236 234 228 / 0.35); }
  .pad.empty::before { display: none; }

  /* cards: taller pads, name on top and time below, colour along the top. */
  .cards .pad { height: 54px; flex-direction: column; align-items: start; justify-content: center; gap: 2px; padding: 0 10px; }
  .cards .pad::before { top: 0; left: 0; right: 0; bottom: auto; width: auto; height: 3px; }
  .cards .pad .no { position: absolute; right: 9px; top: 9px; }
  .cards .pad .nm { font-size: 13px; }
  .cards .pad .tm { margin-left: 0; }
  .cards .pad.empty { justify-content: center; }

  /* strip: one row, a mode menu on the left. */
  .mode { position: relative; flex: none; }
  .mbtn { width: 88px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; background: #1d1d20 !important; font-size: 12.5px; }
  .mbtn svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; opacity: 0.6; }
  .mlist { position: absolute; z-index: 5; left: 0; bottom: calc(100% + 6px); width: 150px; padding: 4px; border-radius: 10px; background: #1d1d20; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08), 0 12px 30px rgb(0 0 0 / 0.5); display: grid; gap: 2px; transform-origin: bottom left; animation: pop 160ms cubic-bezier(0.23, 1, 0.32, 1); }
  .mlist button { height: 30px !important; box-shadow: none !important; display: flex; justify-content: space-between; align-items: center; padding: 0 10px; border-radius: 6px; font-size: 12.5px; color: rgb(236 234 228 / 0.75); }
  .mlist button.on { background: rgb(255 255 255 / 0.07); color: #eceae4; }
  .mlist kbd { font: inherit; font-size: 11px; color: rgb(236 234 228 / 0.35); }
  @keyframes pop { from { opacity: 0; transform: scale(0.96); } }
  .mid.bare { grid-template-columns: 1fr auto; }
  .mid.bare > span:empty { display: none; }
  .loop button, .fx button { padding: 0 12px; color: rgb(236 234 228 / 0.75); }
  .loop span, .fx > span:empty { flex: 1; }
  .loop .on, .fx .on { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 50%, transparent); }
  .fx .sel i { font-style: normal; margin-left: 6px; color: rgb(236 234 228 / 0.4); }
  .fx .num { width: 18px; text-align: center; }
  .fx .lbl { font-size: 11.5px; color: rgb(236 234 228 / 0.5); margin-right: 6px; }
  .stems button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .stems button i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
  .stems button.off { color: rgb(236 234 228 / 0.35); }
  .stems button.off i { background: transparent; box-shadow: inset 0 0 0 1px rgb(236 234 228 / 0.3); }
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
