<script>
  // A classic deck in Liquid Glass: big title and clock, whole-track
  // overview with a tick ruler, phrase, transport and pitch.
  import Wave from '../bold/Wave.svelte';
  import Fader from '../bold/Fader.svelte';
  import Time from '../bold/Time.svelte';
  import Platter from '../bold/Platter.svelte';
  import { decks } from '../bold/track.js';
  // look: 'card' (title and clock on top), 'platter' (a turning platter
  // with tick ring beside the title), 'oled' (readouts in black mono
  // screens, Hardware Object style). bare drops the glass for a shared pane.
  /** @type {{ k: number, color: string, bands: Record<string, string>, pitch?: string, look?: 'card'|'platter'|'oled', bare?: boolean }} */
  let { k, color, bands, pitch = '+0.00', look = 'card', bare = false } = $props();
  const d = decks[k];
</script>

<section class="deck {look}" class:lq-glass={!bare} style:--c={color} class:r={k === 1}>
  {#if look === 'platter'}
    <div class="pl">
      <Platter deck={k} {color} size={262} cues={k ? [22.4, 98, 120.5] : [30, 75.2, 105]} phrase />
      <div class="pt">
        <div class="eyebrow"><i></i>Deck {'AB'[k]}</div>
        <h2>{d.title}</h2>
        <p>{d.artist}</p>
        <div class="facts">
          <div><b>{d.key}</b><span>{d.camelot}</span></div>
          <div><b>{pitch}%</b><span>Pitch</span></div>
        </div>
      </div>
    </div>
  {:else if look === 'oled'}
    <div class="t">
      <div class="eyebrow"><i></i>Deck {'AB'[k]}</div>
      <h2>{d.title}</h2>
      <p>{d.artist}</p>
    </div>
    <div class="screen lq-mono">
      <div class="cell big"><span>elapsed</span><b><Time deck={k} /></b></div>
      <div class="cell"><span>remain</span><b><Time deck={k} remaining /></b></div>
      <div class="cell"><span>bpm</span><b class="hi">{d.bpm}.00</b></div>
      <div class="cell"><span>key</span><b>{d.key.toLowerCase()} {d.camelot.toLowerCase()}</b></div>
      <div class="cell"><span>pitch</span><b>{pitch}</b></div>
    </div>
  {:else}
  <header>
    <div class="t">
      <div class="eyebrow"><i></i>Deck {'AB'[k]}</div>
      <h2>{d.title}</h2>
      <p>{d.artist}</p>
    </div>
    <div class="clk"><strong><Time deck={k} /></strong><span><Time deck={k} remaining /></span></div>
  </header>
  <div class="facts">
    <div><b>{d.bpm}.00</b><span>BPM</span></div>
    <div><b>{d.key}</b><span>{d.camelot}</span></div>
    <div><b>{pitch}%</b><span>Pitch</span></div>
  </div>
  {/if}
  {#if look !== 'platter'}<div class="ov lq-well"><Wave deck={k} kind="overview" opts={{ ...bands, past: 'rgba(6,6,10,0.55)' }} /></div>{/if}
  <div class="tp">
    <button class="lq-pill lq-cue">Cue</button>
    <button class="lq-pill lq-play" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button>
    {#each [1, 2, 3, 4] as p}<button class="lq-hot" class:set={p !== 4 - k}>{p}</button>{/each}
    <span class="sp"></span>
    <button class="lq-pill sync">Sync</button>
  </div>
  <div class="pitch"><span class="lq-label">Pitch</span><Fader value={k ? 0.46 : 0.5} vertical={false} look="machined" /><span class="lq-label">±8</span></div>
</section>

<style>
  .deck { display: grid; align-content: space-between; gap: 12px; padding: 20px 22px; min-height: 0; }
  header { display: flex; justify-content: space-between; align-items: end; gap: 12px; }
  .r header { flex-direction: row-reverse; }
  .r .t { text-align: right; }
  .r .screen { direction: rtl; }
  .r .screen > * { direction: ltr; }
  .r .eyebrow { justify-content: flex-end; }
  .r .clk { justify-items: start; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--c); }
  .eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }
  h2 { margin: 8px 0 0; font-size: 40px; font-weight: 250; letter-spacing: -0.04em; line-height: 1; white-space: nowrap; }
  .t p { margin: 6px 0 0; font-size: 13px; color: rgb(242 241 236 / 0.6); }
  .clk { display: grid; justify-items: end; }
  .clk strong { font-size: 38px; font-weight: 300; letter-spacing: -0.04em; line-height: 1; text-shadow: 0 0 26px color-mix(in srgb, var(--c) 35%, transparent); }
  .clk span { margin-top: 4px; font-size: 13px; color: rgb(242 241 236 / 0.55); }
  .facts { display: flex; gap: 26px; }
  .r .facts { justify-content: flex-end; }
  .facts div { display: grid; }
  .facts b { font-size: 18px; font-weight: 400; }
  .facts span { font-size: 11.5px; color: rgb(242 241 236 / 0.5); }
  .ov { height: 56px; }
  .oled .ov { background: #000; border-radius: 8px; }
  .pl { display: flex; align-items: center; gap: 22px; }
  .r .pl { flex-direction: row-reverse; }
  .pt { display: grid; gap: 2px; }
  .r .pt { text-align: right; }
  .pt .facts { margin-top: 12px; }
  .pl :global(.platter .el) { font-size: 28px; }
  .pl :global(.platter .bpm), .pl :global(.platter .rm) { font-size: 11px; }
  .screen { display: grid; grid-template-columns: 1.5fr 1fr 1fr; grid-template-rows: auto auto; gap: 1px; border-radius: 10px; overflow: hidden; background: rgb(255 255 255 / 0.08); box-shadow: 0 0 0 1px #000, 0 0 0 4px rgb(0 0 0 / 0.25); }
  .cell { display: grid; gap: 2px; padding: 8px 12px; background: #000; }
  .cell.big { grid-row: span 2; align-content: center; }
  .cell span { font-size: 10.5px; color: rgb(255 255 255 / 0.45); }
  .cell b { font-weight: 400; font-size: 15px; color: #f4f2ec; }
  .cell.big b { font-size: 34px; letter-spacing: -0.03em; color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); }
  .cell b.hi { color: var(--c); }
  .tp { display: flex; align-items: center; gap: 8px; }
  .sp { flex: 1; }
  .sync { color: var(--c); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
  .pitch { display: flex; align-items: center; gap: 10px; }
  .pitch :global(.fader) { flex: 1; }
</style>
