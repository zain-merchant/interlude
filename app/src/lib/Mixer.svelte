<script>
  import Knob from './Knob.svelte';
  import Meter from './Meter.svelte';
  import { tip, tipText } from './tooltip.svelte.js';
  import { keyLabel } from './commands.js';
  import Fader from './Fader.svelte';
  import { untrack } from 'svelte';
  import { engine, control as send } from './engine.svelte.js';
  import { backend } from './backend.js';
  import { announce } from './announce.svelte.js';

  /** @type {{ onmessage?: (text: string) => void }} */
  let { onmessage = () => {} } = $props();

  const KILL = -40;
  const channels = $state([0, 1].map(() => ({ gain: 0, eq: [0, 0, 0], fader: 1, pfl: false })));
  let master = $state(0);
  let cueMix = $state(0.5);
  let crossfader = $state(0);

  const db = (v) => (v <= KILL ? 'killed' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`);
  const BANDS = [{ label: 'High', band: 2 }, { label: 'Mid', band: 1 }, { label: 'Low', band: 0 }];

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
  $effect(() => {
    const decks = engine.decks;
    const mixer = engine.mixer;
    untrack(() => {
      if (performance.now() - lastTouch < 500) return;
      decks.forEach((d, i) => {
        const ch = channels[i];
        if (d.gainDb !== undefined) ch.gain = d.gainDb;
        if (d.eqDb) ch.eq = [...d.eqDb];
        if (d.fader !== undefined) ch.fader = d.fader;
        if (d.pfl !== undefined) ch.pfl = d.pfl;
      });
      if (mixer) {
        crossfader = mixer.crossfader;
        cueMix = mixer.cueMix;
        master = mixer.masterDb;
      }
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
    return tipText('Record the master output', '', 'saved to Music/oss-dj recordings');
  };

  // Sync initial values to the engine once.
  control({ type: 'setCueMix', value: 0.5 });
</script>

{#snippet knobs(deck)}
  {@const ch = channels[deck]}
  {@const n = deck === 0 ? 'A' : 'B'}
  <div class="ch">
    <Knob label="Trim" name="Deck {n} trim" bind:value={ch.gain} min={-12} max={12} reset={0} format={db}
      onchange={(v) => control({ type: 'setGain', deck, db: v })} />
    {#each BANDS as { label, band }}
      <Knob {label} name="Deck {n} {label.toLowerCase()} EQ" bind:value={ch.eq[band]} min={KILL} max={6} reset={0} kill={KILL} format={db}
        onchange={(v) => control({ type: 'setEq', deck, band, db: v })} />
    {/each}
    <button class="hp" class:on={ch.pfl} aria-pressed={ch.pfl} aria-label="Deck {n} headphone cue"
      onclick={() => togglePfl(deck)} use:tip={() => tipText(`Headphone cue ${ch.pfl ? 'on' : 'off'}`, keyLabel(`deck.${deck}.pfl`))}>
      <svg viewBox="0 0 16 16"><path d="M2.5 10V8a5.5 5.5 0 0 1 11 0v2" /><rect x="2" y="9.5" width="3" height="4.5" rx="1" /><rect x="11" y="9.5" width="3" height="4.5" rx="1" /></svg>
    </button>
  </div>
{/snippet}

{#snippet strip(deck)}
  {@const ch = channels[deck]}
  <div class="fwrap" class:mirror={deck === 1}>
    <Meter level={engine.deckLevels[deck]} />
    <Fader vertical bind:value={ch.fader} reset={1} label="Deck {deck === 0 ? 'A' : 'B'} volume"
      onchange={(v) => control({ type: 'setFader', deck, value: v })} />
  </div>
{/snippet}

<section class="mixer" aria-label="Mixer" data-region="mixer">
  {@render knobs(0)}
  {@render strip(0)}
  <div class="cen">
    <Knob label="Master" name="Master volume" bind:value={master} min={-24} max={6} reset={0} format={db}
      onchange={(v) => control({ type: 'setMasterGain', db: v })} />
    <Knob label="Cue mix" name="Headphone cue mix" bind:value={cueMix} min={0} max={1} reset={0.5}
      format={(v) => `${Math.round((1 - v) * 100)}% cue, ${Math.round(v * 100)}% master`}
      onchange={(v) => control({ type: 'setCueMix', value: v })} />
    <div class="mpair" use:tip={() => 'Master level'}>
      <Meter level={engine.masterLevels[0]} />
      <Meter level={engine.masterLevels[1]} />
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
    <span class="a">A</span>
    <Fader tick value={crossfader} min={-1} max={1} reset={0} label="Crossfader" onchange={setCrossfader}
      format={(v) => (Math.abs(v) < 0.005 ? 'centre' : `${Math.round(Math.abs(v) * 100)}% to ${v < 0 ? 'A' : 'B'}`)} />
    <span class="b">B</span>
  </div>
</section>

<style>
  .mixer {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0 10px;
    padding: 14px 16px 12px;
    min-height: 0;
  }
  .ch {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 6px;
  }
  .cen {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    justify-items: center;
    gap: 6px;
    min-height: 0;
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }
  .fwrap {
    display: flex;
    gap: 8px;
    align-items: stretch;
    min-height: 0;
    padding: 4px 0 2px;
  }
  .fwrap.mirror {
    flex-direction: row-reverse;
  }
  .mpair {
    display: flex;
    gap: 3px;
    min-height: 0;
    margin: 4px 0 2px;
  }
  .hp {
    width: 32px;
    height: 24px;
    margin-top: 2px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    box-shadow: inset 0 0 0 1px var(--line-2);
    transition: color 0.12s, box-shadow 0.12s;
  }
  .hp:hover {
    color: var(--fg-2);
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .hp svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .hp.on {
    color: var(--deck-b);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--deck-b) 60%, transparent);
  }
  .rec {
    height: 24px;
    min-width: 52px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
    font: 400 11px var(--font);
    box-shadow: inset 0 0 0 1px var(--line-2);
    transition: color 0.12s, box-shadow 0.12s;
  }
  .rec:hover {
    color: var(--fg-2);
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .rec .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-4);
  }
  .rec.on {
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--fg-4);
  }
  .rec.on .dot {
    background: var(--kill);
  }
  .xf {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .xf span {
    font-size: 11px;
  }
  .a {
    color: var(--deck-a);
  }
  .b {
    color: var(--deck-b);
  }
</style>
