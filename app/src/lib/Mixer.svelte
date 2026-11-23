<script>
  import Ruler from './Ruler.svelte';
  import Knob from './Knob.svelte';
  import Meter from './Meter.svelte';
  import { tip, tipText } from './tooltip.svelte.js';
  import { keyLabel } from './commands.js';
  import Fader from './Fader.svelte';
  import { untrack } from 'svelte';
  import { engine, control as send } from './engine.svelte.js';
  import { backend } from './backend.js';
  import { announce } from './announce.svelte.js';
  import { flag } from '../flags/registry.svelte.js';

  /** @type {{ onmessage?: (text: string) => void }} */
  let { onmessage = () => {} } = $props();

  const KILL = -40;
  const EQ_MAX = 6;
  // EQ knobs turn like the controller's (crates/controller/src/flx4.rs,
  // eq_db): 0 dB at 12 o'clock, linear in dB up to +6 on the right, and
  // linear in gain down to the kill on the left.
  const eqTaper = {
    toPos: (v) => (v >= 0 ? 0.5 + v / EQ_MAX / 2 : v <= KILL ? 0 : 10 ** (v / 20) / 2),
    fromPos: (p) => (p >= 0.5 ? (p - 0.5) * 2 * EQ_MAX : Math.max(KILL, 20 * Math.log10(Math.max(p * 2, 1e-6)))),
  };
  /** Channel knob size: five of them fit the shortest deck row. */
  const KNOB = 20;
  /** Height of the channel dial columns; on a short mixer the dials shrink so their labels never overlap. */
  let chHeight = $state(0);
  // Each dial takes its size plus 24px (tick ring and label), with 4px between dials.
  // #61 (UI audit flag): eq-kill's kill buttons add 9px under three of the five dials and the captions 5px under two.
  // #101, #102 (UI audit flags): dir-centerline and dir-crate lay each channel's dials in two columns, three rows deep.
  const dialRows = $derived(flag('dir-centerline') || flag('dir-crate') ? 3 : 5);
  const knob = $derived(chHeight ? Math.max(14, Math.min(KNOB, Math.floor((chHeight - 16) / dialRows - 24 - (flag('eq-kill') ? 7.4 : 0)))) : KNOB);
  const color = (deck) => (deck === 0 ? 'var(--deck-a)' : 'var(--deck-b)');
  const channels = $state([0, 1].map(() => ({ gain: 0, eq: [0, 0, 0], filter: 0, fader: 1, pfl: false })));
  let master = $state(0);
  let cueMix = $state(0.5);
  let crossfader = $state(0);

  const db = (v) => (v <= KILL ? 'killed' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`);
  const BANDS = [{ label: 'High', band: 2 }, { label: 'Mid', band: 1 }, { label: 'Low', band: 0 }];
  const filterText = (v) =>
    Math.abs(v) < 0.02 ? 'off' : `${v < 0 ? 'low-pass' : 'high-pass'} ${Math.round(Math.abs(v) * 100)}%`;

  export function togglePfl(deck) {
    const ch = channels[deck];
    ch.pfl = !ch.pfl;
    control({ type: 'setPfl', deck, on: ch.pfl });
  }

  // Controls follow the engine, so a hardware controller moves them too.
  // Right after a change here the engine's report lags a frame or two,
  // so following pauses briefly to keep the control from jumping back.
  let lastTouch = 0;
  function control(cmd) {
    lastTouch = performance.now();
    send(cmd);
  }
  // The engine's state is patched in place, so read each value here, where
  // the effect tracks it, and only decide what to do with it untracked.
  $effect(() => {
    const decks = engine.decks.map((d) => ({
      gain: d.gainDb,
      eq: d.eqDb && [...d.eqDb],
      filter: d.filter,
      fader: d.fader,
      pfl: d.pfl,
    }));
    const m = engine.mixer;
    const mixer = m && { crossfader: m.crossfader, cueMix: m.cueMix, master: m.masterDb };
    untrack(() => {
      if (performance.now() - lastTouch < 500) return;
      decks.forEach((d, i) => {
        const ch = channels[i];
        if (d.gain !== undefined) ch.gain = d.gain;
        if (d.eq) ch.eq = d.eq;
        if (d.filter !== undefined) ch.filter = d.filter;
        if (d.fader !== undefined) ch.fader = d.fader;
        if (d.pfl !== undefined) ch.pfl = d.pfl;
      });
      if (mixer) ({ crossfader, cueMix, master } = mixer);
    });
  });

  export function setCrossfader(v) {
    crossfader = Math.max(-1, Math.min(1, v));
    control({ type: 'setCrossfader', value: crossfader });
  }

  // Set recording: the master output, to a WAV file in the Music folder.
  const rec = $derived(engine.recording);
  let recBusy = false;
  const clock = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const fileName = (p) => p?.split(/[\\/]/).pop() ?? '';
  async function toggleRecording() {
    if (recBusy || !rec) return;
    recBusy = true;
    try {
      if (rec.active) {
        const done = await backend.stopRecording();
        const msg = `Recording saved: ${fileName(done.path)} (${clock(done.seconds)})`;
        onmessage(msg);
        announce(msg);
      } else {
        await backend.startRecording();
        announce('Recording started');
      }
    } catch (e) {
      onmessage(`Recording failed: ${e}`);
    } finally {
      recBusy = false;
    }
  }
  // A recording that stops by itself (disk full, say) is reported once.
  let lastError = null;
  $effect(() => {
    const err = rec?.error ?? null;
    if (err && err !== lastError) onmessage(`Recording stopped: ${err}`);
    lastError = err;
  });
  const recTip = () => {
    if (!rec) return '';
    if (rec.active) {
      const lost = rec.droppedSeconds > 0 ? `, ${rec.droppedSeconds.toFixed(1)} s lost to a slow disk` : '';
      return tipText(`Recording to ${fileName(rec.path)}${lost}`, '', 'click to stop');
    }
    return tipText('Record the master output', '', 'saved to Music/Interlude recordings');
  };

  // Sync initial values to the engine once.
  control({ type: 'setCueMix', value: 0.5 });
</script>

{#snippet knobs(deck)}
  {@const ch = channels[deck]}
  {@const n = deck === 0 ? 'A' : 'B'}
  <!-- #88 (UI audit flag): deck-names calls the decks left and right. -->
  {@const D = flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${n}`}
  <div class="ch" bind:clientHeight={chHeight}>
    <Knob label="Trim" name="{D} trim" size={knob} bind:value={ch.gain} min={-12} max={12} reset={0} format={db} arc={color(deck)}
      onchange={(v) => control({ type: 'setGain', deck, db: v })} />
    {#each BANDS as { label, band }}
      <Knob {label} name="{D} {label.toLowerCase()} EQ" size={knob} bind:value={ch.eq[band]} min={KILL} max={EQ_MAX} reset={0} kill={KILL} taper={eqTaper} format={db}
        arc={color(deck)}
        onchange={(v) => control({ type: 'setEq', deck, band, db: v })} />
    {/each}
    <Knob label="Filter" name="{D} filter" size={knob} bind:value={ch.filter} min={-1} max={1} reset={0} format={filterText} arc={color(deck)}
      onchange={(v) => control({ type: 'setFilter', deck, value: v })} />
  </div>
{/snippet}

{#snippet strip(deck)}
  {@const ch = channels[deck]}
  {@const n = deck === 0 ? 'A' : 'B'}
  <!-- #88 (UI audit flag): deck-names calls the decks left and right. -->
  {@const D = flag('deck-names') ? (deck === 0 ? 'Left deck' : 'Right deck') : `Deck ${n}`}
  <div class="fwrap" class:mirror={deck === 1}>
    <div class="frow">
      <!-- #60 (UI audit flag): ticks and what only matter while meters is on. -->
      <Meter level={engine.deckLevels[deck]} ticks={deck === 0 ? 'right' : 'left'} what={D} />
      <!-- #110 (UI audit flag): dir-room-tint marks 0, -6, -12, -18 and -24 dB and silence; the engine's gain is the fader squared. -->
      <Fader vertical bind:value={ch.fader} reset={1} label="{D} volume" marks={flag('dir-room-tint') ? [0, 0.251, 0.355, 0.501, 0.708, 1] : undefined}
        onchange={(v) => control({ type: 'setFader', deck, value: v })} />
    </div>
    <button class="hp" class:on={ch.pfl} aria-pressed={ch.pfl} aria-label="{D} headphone cue"
      onclick={() => togglePfl(deck)} use:tip={() => tipText(`Headphone cue ${ch.pfl ? 'on' : 'off'}`, keyLabel(`deck.${deck}.pfl`))}>
      {#if flag('dir-room-tint')}<svg viewBox="0 0 16 16"><path d="M2 8a6 6 0 0 1 12 0v4.5a1.5 1.5 0 0 1-1.5 1.5H12a1.5 1.5 0 0 1-1.5-1.5v-2A1.5 1.5 0 0 1 12 9h.5V8a4.5 4.5 0 0 0-9 0v1H4a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 4 14h-.5A1.5 1.5 0 0 1 2 12.5z" /></svg>{:else}<svg viewBox="0 0 16 16"><path d="M2.5 10V8a5.5 5.5 0 0 1 11 0v2" /><rect x="2" y="9.5" width="3" height="4.5" rx="1" /><rect x="11" y="9.5" width="3" height="4.5" rx="1" /></svg>{/if}
    </button>
  </div>
{/snippet}

<section class="mixer" aria-label="Mixer" data-region="mixer">
  {@render knobs(0)}
  {@render strip(0)}
  <div class="cen">
    <!-- #66 (UI audit flag): knob-rings draws the global rings a step quieter, and Cue mix from 12 o'clock. -->
    <Knob label="Master" name="Master volume" size={26} fromMin arc={flag('knob-rings') ? 'var(--fg-2)' : undefined} bind:value={master} min={-24} max={6} reset={0} format={db}
      onchange={(v) => control({ type: 'setMasterGain', db: v })} />
    <Knob label="Cue mix" name="Headphone cue mix" size={22} fromMin={!flag('knob-rings')} arc={flag('knob-rings') ? 'var(--fg-2)' : undefined} bind:value={cueMix} min={0} max={1} reset={0.5}
      format={(v) => `${Math.round((1 - v) * 100)}% cue, ${Math.round(v * 100)}% master`}
      onchange={(v) => control({ type: 'setCueMix', value: v })} />
    <div class="mpair" use:tip={() => engine.limiting >= 0.5
      ? `Master level. The limiter is turning the mix down ${engine.limiting.toFixed(1)} dB to stop it distorting; lower the master or channel levels.`
      : 'Master level'}>
      <!-- #60 (UI audit flag): the limiter keeps the master under full scale, so its meters have no clip light. -->
      <Meter level={engine.masterLevels[0]} ticks="left" light={false} />
      <Meter level={engine.masterLevels[1]} light={false} />
      {#if engine.limiting >= 0.5}<span class="lim" aria-hidden="true">LIM</span>{/if}
    </div>
    {#if rec}
      <button class="rec num" class:on={rec.active} aria-pressed={rec.active}
        aria-label={rec.active ? `Stop recording, ${clock(rec.seconds)} recorded` : 'Record set'}
        onclick={toggleRecording} use:tip={recTip}>
        <span class="dot" aria-hidden="true"></span>{rec.active ? clock(rec.seconds) : 'Rec'}
      </button>
    {/if}
  </div>
  {@render strip(1)}
  {@render knobs(1)}

  <div class="xf">
    <!-- #56 (UI audit flag, decks builder): deck-letters names each side with its deck's letter, under that channel's dials. -->
    {#if flag('deck-letters')}<span class="letter" style:color="var(--deck-a)" aria-hidden="true">A</span>{:else}<i class="end" style:background="var(--deck-a)"></i>{/if}
    <div class="xr">
    <Ruler value={(crossfader + 1) / 2} from={0.5} n={41} major={10} color="var(--fg)" height={8} />
    <Fader tick value={crossfader} min={-1} max={1} reset={0} label="Crossfader" onchange={setCrossfader}
      format={(v) => (Math.abs(v) < 0.005 ? 'centre' : `${Math.round(Math.abs(v) * 100)}% to ${flag('deck-names') ? (v < 0 ? 'the left deck' : 'the right deck') : v < 0 ? 'A' : 'B'}`)} />
    </div>
    {#if flag('deck-letters')}<span class="letter" style:color="var(--deck-b)" aria-hidden="true">B</span>{:else}<i class="end" style:background="var(--deck-b)"></i>{/if}
  </div>
</section>

<style>
  /* Each channel: its dials in one column, then its fader with the meter on
     the inner side and the headphone cue under it. Master in the middle.
     The crossfader row shares the decks' transport row height. */
  .mixer {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0 4px;
    padding: var(--pad) 12px;
    min-height: 0;
    overflow: hidden;
  }
  .ch {
    display: grid;
    justify-items: center;
    align-content: space-between;
    min-height: 0;
  }
  /* The tick ring's margin overlaps a little, so five dials still fit
     when the decks are short (a small window). */
  .ch :global(.knob) {
    margin: -3px 0;
  }
  .ch :global(.label) {
    line-height: 12px;
  }
  .cen {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 8px;
    min-height: 0;
  }
  .fwrap {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 0;
  }
  .frow {
    display: flex;
    flex-direction: row-reverse;
    gap: 4px;
    align-items: stretch;
    min-height: 0;
  }
  .fwrap.mirror .frow {
    flex-direction: row;
  }
  /* The headphone cue spans the fader and meter above it, so its edges
     line up with both. */
  .fwrap .hp {
    width: auto;
  }
  .mpair {
    position: relative;
    display: flex;
    gap: 4px;
    height: 72px;
  }
  /* Lights while the master limiter is holding the mix down. */
  .lim {
    position: absolute;
    left: calc(100% + 6px);
    bottom: 0;
    font: 500 var(--t-xs) var(--font);
    letter-spacing: 0.04em;
    color: var(--warn);
  }
  .hp {
    width: 32px;
    height: var(--h-sm);
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
    box-shadow: inset 0 0 0 1px var(--line-2);
    transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .hp:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .hp svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
  .hp.on {
    color: var(--cue);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cue) 55%, transparent);
  }
  .rec {
    height: var(--h-sm);
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
    font: 400 var(--t-xs) var(--font);
    box-shadow: inset 0 0 0 1px var(--line-2);
    transition: background-color 140ms ease, color 140ms ease;
  }
  .rec:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .rec .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-4);
  }
  .rec.on {
    color: var(--fg);
  }
  .rec.on .dot {
    background: var(--kill);
  }
  .xf {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--h-lg);
    margin-top: 12px;
    border-top: 1px solid var(--line);
  }
  .xr {
    flex: 1;
    display: grid;
  }
  .end {
    width: 3px;
    height: 14px;
    border-radius: 2px;
  }
  /* #56 (UI audit flag): the deck's letter in place of its colour bar. */
  .letter {
    width: 8px;
    font: 500 var(--t-xs) / 1 var(--font);
    text-align: center;
  }
</style>
