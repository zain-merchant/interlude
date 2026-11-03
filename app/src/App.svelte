<script>
  import { onMount } from 'svelte';
  import Deck from './lib/Deck.svelte';
  import Mixer from './lib/Mixer.svelte';
  import Library from './lib/Library.svelte';
  import Waveform from './lib/Waveform.svelte';
  import Meter from './lib/Meter.svelte';
  import { Button } from './lib/components/ui/button/index.js';
  import { engine, startEngineLoop, loadTrack, control } from './lib/engine.svelte.js';
  import { dropTarget } from './lib/dnd.svelte.js';

  let library;
  let mixer;
  let zoom = $state(12);
  let toast = $state('');
  let toastTimer;

  function say(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2600);
  }

  async function load(deck, track) {
    // Never swap the track under a playing deck in the middle of a set.
    if (engine.decks[deck].playing) {
      say(`Deck ${deck === 0 ? 'A' : 'B'} is playing. Pause it first.`);
      return;
    }
    try {
      await loadTrack(deck, track);
    } catch (e) {
      say(`Couldn't load ${track.title}: ${e}`);
    }
  }

  // Keyboard: Q/W cue/play deck A, O/P cue/play deck B, [ ] crossfader,
  // Ctrl/Cmd+F search, - and = zoom the waveforms.
  const held = new Set();
  function keydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      library.focusSearch();
      return;
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type !== 'range';
    if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'o') {
      held.add(k);
      control({ type: 'cuePress', deck: k === 'q' ? 0 : 1 });
    } else if (k === 'w' || k === 'p') {
      control({ type: 'togglePlay', deck: k === 'w' ? 0 : 1 });
    } else if (k === '[' || k === ']') {
      mixer.setCrossfader(nextXf(k === '[' ? -0.1 : 0.1));
    } else if (k === '-' || k === '=') {
      zoom = Math.max(3, Math.min(48, zoom * (k === '-' ? 1.4 : 1 / 1.4)));
    } else return;
    e.preventDefault();
  }
  function keyup(e) {
    const k = e.key.toLowerCase();
    if (held.delete(k)) control({ type: 'cueRelease', deck: k === 'q' ? 0 : 1 });
  }
  let xf = 0;
  const nextXf = (d) => (xf = Math.max(-1, Math.min(1, Math.round((xf + d) * 10) / 10)));

  onMount(startEngineLoop);
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} />

<div class="app">
  <header class="top">
    <div class="brand">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></svg>
      oss-dj
    </div>
    <div class="zoom">
      <Button variant="ghost" size="icon-xs" onclick={() => (zoom = Math.min(48, zoom * 1.4))} aria-label="Zoom out">−</Button>
      <span class="mono">{zoom.toFixed(0)}s</span>
      <Button variant="ghost" size="icon-xs" onclick={() => (zoom = Math.max(3, zoom / 1.4))} aria-label="Zoom in">+</Button>
    </div>
    <div class="master" title="Master level">
      <Meter level={engine.masterLevels[0]} segments={12} />
      <Meter level={engine.masterLevels[1]} segments={12} />
    </div>
  </header>

  <div class="waves">
    {#each [0, 1] as deck}
      <div class="lane" class:a={deck === 0} class:b={deck === 1}
        use:dropTarget={{ ondrop: (t) => load(deck, t), blocked: () => engine.decks[deck].playing }}>
        <Waveform {deck} seconds={zoom} />
      </div>
    {/each}
  </div>

  <div class="decks">
    <Deck deck={0} onload={load} />
    <Mixer bind:this={mixer} />
    <Deck deck={1} onload={load} />
  </div>

  <Library bind:this={library} onload={load} />

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .app {
    height: 100%;
    display: grid;
    grid-template-rows: 44px minmax(110px, 1fr) 410px minmax(180px, 1.5fr);
    gap: 10px;
    padding: 0 12px 12px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--line);
    margin: 0 -12px;
    padding: 0 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .brand svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: var(--deck-a);
    stroke-width: 2;
  }
  .zoom {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted-foreground);
    font-size: 12px;
  }
  .master {
    display: flex;
    gap: 3px;
    height: 26px;
  }
  .waves {
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 2px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .lane {
    position: relative;
    min-height: 0;
  }
  .lane :global(.wave) {
    height: 100%;
  }
  .lane::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    z-index: 1;
  }
  .lane.a {
    --drop-color: var(--deck-a);
  }
  .lane.b {
    --drop-color: var(--deck-b);
  }
  .lane.a::before {
    background: var(--deck-a);
  }
  .lane.b::before {
    background: var(--deck-b);
  }
  .decks {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    min-height: 0;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    background: #2a1418;
    border: 1px solid #6b2630;
    color: #ffd7dc;
    padding: 10px 16px;
    border-radius: 10px;
  }
</style>
