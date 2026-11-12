<script>
  // Prototype: the same decks, mixer and waveforms in three materials.
  // Real components and the simulated engine; only the skin changes.
  import { onMount } from 'svelte';
  import './switcher.js';
  import './skins.css';
  import Deck from '../../lib/Deck.svelte';
  import Mixer from '../../lib/Mixer.svelte';
  import Waveform from '../../lib/Waveform.svelte';
  import Library from '../../lib/Library.svelte';
  import Tooltip from '../../lib/Tooltip.svelte';
  import ContextMenu from '../../lib/ContextMenu.svelte';
  import { engine, tracks, startEngineLoop, loadTrack, control } from '../../lib/engine.svelte.js';
  import { backend } from '../../lib/backend.js';
  import { syncDeckSettings } from '../../lib/decksettings.svelte.js';

  const SKINS = [
    { id: 'soft', label: 'Soft Depth', note: "Today's layout with raised knobs, glowing value arcs and waveforms set into wells" },
    { id: 'machined', label: 'Machined Graphite', note: 'Dark Teenage Engineering: anodised graphite, engraved lines and scales, one accent per deck' },
    { id: 'instrument', label: 'Full Instrument', note: 'Closest to your Notion picks: deck-tinted panels, glass screens and lit controls' },
  ];

  const noop = () => {};

  onMount(async () => {
    startEngineLoop();
    syncDeckSettings();
    // Two real library tracks, playing, so the waveforms and meters move.
    const rows = await backend.libraryTracks(null);
    const pick = (title, i) => rows.find((r) => r.title === title) ?? rows[i];
    for (const [deck, t] of [[0, pick('Afterglow', 0)], [1, pick('Glass Rooms', 1)]]) {
      if (!tracks[deck]) await loadTrack(deck, t);
      if (!engine.decks[deck].playing) control({ type: 'togglePlay', deck });
    }
  });
</script>

<prototype-switcher>
  {#each SKINS as s}
    <section data-variant={s.label} data-note={s.note}>
      <div class="stage" data-skin={s.id}>
        <div class="waves" role="group" aria-label="Waveforms">
          {#each [0, 1] as deck}
            <div class="lane" class:b={deck === 1}>
              <Waveform {deck} seconds={12} />
              <div class="who"><b>{'AB'[deck]}</b>{tracks[deck]?.title ?? ''}</div>
            </div>
          {/each}
        </div>
        <div class="decks">
          <Deck deck={0} onload={noop} onreveal={noop} onsettings={noop} />
          <Mixer onmessage={noop} />
          <Deck deck={1} onload={noop} onreveal={noop} onsettings={noop} />
        </div>
        <div class="lib"><Library onload={noop} /></div>
      </div>
    </section>
  {/each}
</prototype-switcher>

<Tooltip />
<ContextMenu />
