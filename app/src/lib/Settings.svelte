<script>
  import { onMount, tick } from 'svelte';
  import { keys, binding, commandName, sameKey, mac } from './commands.js';
  import { keymap, saveKeymap, bindingFrom, reserved } from './keymap.svelte.js';
  import { uiZoom, setUiZoom, stepUiZoom, uiZoomSteps } from './uizoom.svelte.js';
  import { announce } from './announce.svelte.js';
  import { autoGain, setAutoGain } from './autogain.svelte.js';
  import { deckSettings, setDeckSetting } from './decksettings.svelte.js';
  import { engine } from './engine.svelte.js';
  import { setSlip } from './performance.js';
  import { keyLabel } from './commands.js';
  import { backend } from './backend.js';

  /**
   * Settings sit over the library, never over the decks, and don't block
   * them: performance keys keep working while this is open, except while a
   * shortcut is being recorded.
   * @type {{ page?: 'keyboard' | 'decks' | 'audio' | 'display' | 'library' | 'stems' | 'controllers', onclose: () => void, onimport?: () => void }}
   */
  let { page = $bindable('keyboard'), onclose, onimport } = $props();

  const GROUPS = [
    { name: 'Deck A', test: (id) => id.startsWith('deck.0.') },
    { name: 'Deck B', test: (id) => id.startsWith('deck.1.') },
    { name: 'Mixer', test: (id) => id.startsWith('mixer.') },
    { name: 'Library', test: (id) => id.startsWith('library.') },
    { name: 'View', test: (id) => id.startsWith('view.') },
    { name: 'App', test: () => true },
  ];
  const groups = $derived.by(() => {
    const left = Object.keys(keys);
    return GROUPS.map((g) => {
      const ids = left.filter(g.test);
      for (const id of ids) left.splice(left.indexOf(id), 1);
      return { name: g.name, ids };
    }).filter((g) => g.ids.length);
  });

  const fullName = (id) => {
    const g = groups.find((g) => g.ids.includes(id));
    return g && g.name.startsWith('Deck') ? `${g.name} ${commandName(id).toLowerCase()}` : commandName(id);
  };

  /** The command being recorded, and what's waiting on a conflict. */
  let recording = $state(null);
  let pending = $state(null); // { id, b, other }
  let note = $state(null); // { id, text }
  let root;
  let returnFocus;

  const changed = (id) => id in keymap.overrides;

  function commit(id, b) {
    const def = keys[id];
    if ((b === null && !def) || sameKey(b, def)) delete keymap.overrides[id];
    else keymap.overrides[id] = b;
    saveKeymap();
  }

  function assign(id, b) {
    const other = b && Object.keys(keys).find((o) => o !== id && sameKey(binding(o), b));
    if (other) {
      pending = { id, b, other };
      return;
    }
    commit(id, b);
    announce(b ? `${fullName(id)} is now ${b.label}` : `${fullName(id)} has no shortcut`);
  }

  function replace() {
    const { id, b, other } = pending;
    commit(other, null);
    commit(id, b);
    announce(`${fullName(id)} is now ${b.label}. ${fullName(other)} has no shortcut`);
    pending = null;
    focusKey(id);
  }

  function record(id) {
    pending = null;
    note = null;
    recording = recording === id ? null : id;
  }

  function focusKey(id) {
    tick().then(() => root?.querySelector(`[data-key="${id}"]`)?.focus());
  }

  // While recording, every key press is captured here first, so it can't
  // also play a deck.
  function capture(e) {
    if (!recording) return;
    const id = recording;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      recording = null;
      return;
    }
    if (!(e.metaKey || e.ctrlKey || e.shiftKey) && (e.code === 'Backspace' || e.code === 'Delete')) {
      recording = null;
      assign(id, null);
      return;
    }
    if (reserved(e)) {
      note = { id, text: e.code === 'Tab' ? 'Tab moves focus, so it stays free' : 'That shortcut belongs to the system' };
      return;
    }
    const b = bindingFrom(e, mac);
    if (!b) return;
    recording = null;
    note = null;
    assign(id, b);
  }

  function resetAll() {
    keymap.overrides = {};
    saveKeymap();
    pending = null;
    announce('All shortcuts are back to their defaults');
  }

  function panelKey(e) {
    if (e.key === 'Escape' && !recording) {
      e.preventDefault();
      e.stopPropagation();
      if (pending) pending = null;
      else onclose();
    }
  }

  onMount(() => {
    returnFocus = document.activeElement;
    root.querySelector('nav button[aria-current="page"]')?.focus();
    window.addEventListener('keydown', capture, true);
    return () => {
      window.removeEventListener('keydown', capture, true);
      /** @type {HTMLElement} */ (returnFocus)?.focus?.();
    };
  });

  const pct = (s) => `${Math.round(s * 100)}%`;

  // Stems: the model download, and how splitting and the cache behave.
  const CACHE_SIZES = [0, 1, 2, 5, 10, 20, 50];
  /** @type {any} */
  let stems = $state(null);
  let stemsError = $state('');
  async function refreshStems() {
    if (!backend.stemsInfo) return;
    try {
      stems = await backend.stemsInfo();
    } catch (e) {
      stemsError = String(e);
    }
  }
  $effect(() => {
    if (page !== 'stems') return;
    refreshStems();
    // Follow a download while the page is open.
    const timer = setInterval(() => stems?.model?.state === 'downloading' && refreshStems(), 250);
    return () => clearInterval(timer);
  });
  async function setStems(change) {
    try {
      stems = await backend.setStems(change);
    } catch (e) {
      stemsError = String(e);
    }
  }
  async function download() {
    stemsError = '';
    try {
      await backend.downloadStemsModel();
    } catch (e) {
      stemsError = String(e);
    }
    refreshStems();
  }
  async function clearCache() {
    try {
      stems = await backend.clearStemsCache();
      announce('Stems cache cleared');
    } catch (e) {
      stemsError = String(e);
    }
  }
  // Audio: which sound card the master plays through.
  /** @type {{ devices: string[], choice: string | null } | null} */
  let outputs = $state(null);
  let outputError = $state('');
  let switching = $state(false);
  async function refreshOutputs() {
    if (!backend.audioOutputs) return;
    try {
      outputs = await backend.audioOutputs();
    } catch (e) {
      outputError = String(e);
    }
  }
  $effect(() => {
    if (page !== 'audio') return;
    refreshOutputs();
    // Pick up a device plugged in while the page is open.
    const timer = setInterval(refreshOutputs, 2000);
    return () => clearInterval(timer);
  });
  async function pickOutput(value) {
    const device = value === '' ? null : value;
    outputError = '';
    switching = true;
    try {
      const playing = await backend.setAudioOutput(device);
      announce(`Playing through ${playing}`);
    } catch (e) {
      outputError = String(e);
    }
    switching = false;
    refreshOutputs();
  }
  // Controllers: what's connected, and MIDI learn for anything unmapped.
  const deckActions = (n) => {
    const ch = `[Channel${n}]`;
    return [
      [ch, 'play', 'Play'],
      [ch, 'cue_default', 'Cue'],
      [ch, 'beatsync', 'Sync'],
      [ch, 'pfl', 'Headphone cue'],
      [ch, 'keylock', 'Key lock'],
      [ch, 'slip_enabled', 'Slip'],
      [ch, 'volume', 'Volume fader'],
      [ch, 'pregain', 'Trim'],
      [`[EqualizerRack1_${ch}_Effect1]`, 'parameter3', 'EQ high'],
      [`[EqualizerRack1_${ch}_Effect1]`, 'parameter2', 'EQ mid'],
      [`[EqualizerRack1_${ch}_Effect1]`, 'parameter1', 'EQ low'],
      [`[QuickEffectRack1_${ch}]`, 'super1', 'Filter'],
      [ch, 'rate', 'Tempo fader'],
      [ch, 'jog', 'Jog wheel'],
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => [ch, `hotcue_${i}_activate`, `Hot cue ${i}`]),
      [ch, 'loop_in', 'Loop in'],
      [ch, 'loop_out', 'Loop out'],
      [ch, 'reloop_toggle', 'Loop on/off'],
      [ch, 'beatloop_4_activate', '4-beat loop'],
      [ch, 'loop_halve', 'Halve loop'],
      [ch, 'loop_double', 'Double loop'],
      [ch, 'beatjump_backward', 'Beat jump back'],
      [ch, 'beatjump_forward', 'Beat jump forward'],
      [ch, 'LoadSelectedTrack', 'Load selected track'],
      [`[EffectRack1_EffectUnit${n}]`, 'enabled', 'Effect on/off'],
      [`[EffectRack1_EffectUnit${n}]`, 'mix', 'Effect amount'],
    ];
  };
  const ACTIONS = [
    { name: 'Deck A', list: deckActions(1) },
    { name: 'Deck B', list: deckActions(2) },
    { name: 'Mixer', list: [
      ['[Master]', 'crossfader', 'Crossfader'],
      ['[Master]', 'gain', 'Master level'],
      ['[Master]', 'headMix', 'Headphone mix'],
      ['[Library]', 'MoveVertical', 'Browse (knob)'],
      ['[Library]', 'MoveUp', 'Browse up'],
      ['[Library]', 'MoveDown', 'Browse down'],
    ] },
    { name: 'Sampler', list: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`[Sampler${i}]`, 'cue_gotoandplay', `Play sample ${i}`]) },
  ].map((g) => ({ name: g.name, list: g.list.map(([group, key, label]) => ({ id: `${group} ${key}`, group, key, label: `${g.name}: ${label}` })) }));
  const ALL_ACTIONS = ACTIONS.flatMap((g) => g.list);
  const actionLabel = (b) => ALL_ACTIONS.find((a) => a.group === b.group && a.key === b.key)?.label ?? `${b.group} ${b.key}`;

  /** @type {{ connected: { port: string, mapping: string, learned: boolean }[], ports: string[], learned: string[] } | null} */
  let ctl = $state(null);
  let ctlError = $state('');
  let learnPort = $state('');
  /** @type {import('./backend.js').Binding[]} */
  let bindings = $state([]);
  let saved = $state('[]');
  let action = $state(ALL_ACTIONS[0].id);
  let learning = $state(false);
  const dirty = $derived(JSON.stringify(bindings) !== saved);

  async function refreshControllers() {
    if (!backend.controllers) return;
    try {
      ctl = await backend.controllers();
      if (!learnPort || !ctl.ports.includes(learnPort)) {
        const unmapped = ctl.ports.find((p) => !ctl.connected.some((c) => c.port === p));
        const port = unmapped ?? ctl.ports[0] ?? '';
        if (port !== learnPort && !dirty) pickPort(port);
      }
    } catch (e) {
      ctlError = String(e);
    }
  }
  $effect(() => {
    if (page !== 'controllers') return;
    refreshControllers();
    // Pick up a controller plugged in while the page is open.
    const timer = setInterval(refreshControllers, 2000);
    return () => {
      clearInterval(timer);
      stopLearn();
    };
  });
  async function pickPort(port) {
    stopLearn();
    learnPort = port;
    bindings = [];
    saved = '[]';
    if (!port) return;
    try {
      bindings = await backend.learnedMapping(port);
      saved = JSON.stringify(bindings);
    } catch (e) {
      ctlError = String(e);
    }
  }
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let learnTimer;
  async function startLearn() {
    ctlError = '';
    try {
      await backend.midiLearnStart();
    } catch (e) {
      ctlError = String(e);
      return;
    }
    learning = true;
    announce(`Move a control on ${learnPort} for ${ALL_ACTIONS.find((a) => a.id === action)?.label}`);
    clearInterval(learnTimer);
    learnTimer = setInterval(pollLearn, 100);
  }
  async function pollLearn() {
    /** @type {[string, import('./backend.js').Binding] | null} */
    let got;
    try {
      got = await backend.midiLearnPoll();
    } catch (e) {
      ctlError = String(e);
      stopLearn();
      return;
    }
    if (!got || !learning) return;
    const [port, b] = got;
    // A control on another controller: keep listening for this one.
    if (port !== learnPort) {
      await backend.midiLearnStart();
      return;
    }
    const a = ALL_ACTIONS.find((x) => x.id === action);
    if (!a) return;
    const entry = { ...b, group: a.group, key: a.key };
    bindings = [
      ...bindings.filter((x) => !(x.group === a.group && x.key === a.key) && !(x.status === b.status && x.number === b.number)),
      entry,
    ];
    announce(`${a.label} is ${b.description}`);
    // Straight on to the next action, so a whole controller goes quickly.
    const next = ALL_ACTIONS[ALL_ACTIONS.indexOf(a) + 1];
    if (next) {
      action = next.id;
      await backend.midiLearnStart();
    } else {
      stopLearn();
    }
  }
  function stopLearn() {
    if (!learning && !learnTimer) return;
    learning = false;
    clearInterval(learnTimer);
    learnTimer = undefined;
    backend.midiLearnStop?.();
  }
  function removeBinding(b) {
    bindings = bindings.filter((x) => x !== b);
  }
  async function saveBindings(list) {
    stopLearn();
    ctlError = '';
    try {
      await backend.saveLearnedMapping(learnPort, list);
      bindings = list;
      saved = JSON.stringify(list);
      announce(list.length ? `Mapping for ${learnPort} saved` : `Mapping for ${learnPort} deleted`);
    } catch (e) {
      ctlError = String(e);
    }
    refreshControllers();
  }

  const mb = (b) => `${Math.round(b / (1024 * 1024))} MB`;
  const gb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : mb(b));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="settings" role="dialog" aria-modal="false" aria-label="Settings" bind:this={root} onkeydown={panelKey} tabindex="-1">
  <nav aria-label="Settings pages">
    <div class="h">Settings</div>
    <button class="item" class:on={page === 'keyboard'} aria-current={page === 'keyboard' ? 'page' : undefined}
      onclick={() => (page = 'keyboard')}>Keyboard</button>
    <button class="item" class:on={page === 'decks'} aria-current={page === 'decks' ? 'page' : undefined}
      onclick={() => (page = 'decks')}>Decks</button>
    <button class="item" class:on={page === 'audio'} aria-current={page === 'audio' ? 'page' : undefined}
      onclick={() => (page = 'audio')}>Audio</button>
    <button class="item" class:on={page === 'display'} aria-current={page === 'display' ? 'page' : undefined}
      onclick={() => (page = 'display')}>Display</button>
    <button class="item" class:on={page === 'library'} aria-current={page === 'library' ? 'page' : undefined}
      onclick={() => (page = 'library')}>Library</button>
    <button class="item" class:on={page === 'stems'} aria-current={page === 'stems' ? 'page' : undefined}
      onclick={() => (page = 'stems')}>Stems</button>
    <button class="item" class:on={page === 'controllers'} aria-current={page === 'controllers' ? 'page' : undefined}
      onclick={() => (page = 'controllers')}>Controllers</button>
  </nav>

  <div class="main">
    <div class="bar">
      <h2>{{ keyboard: 'Keyboard', decks: 'Decks', audio: 'Audio', library: 'Library', stems: 'Stems', controllers: 'Controllers' }[page] ?? 'Display'}</h2>
      {#if page === 'keyboard'}
        <p>Click a shortcut, then press the new key. Backspace removes it, Esc cancels.</p>
        <button class="btn sm" onclick={resetAll} disabled={!Object.keys(keymap.overrides).length}>Reset all</button>
      {:else}
        <span class="sp"></span>
      {/if}
      <button class="btn sm" onclick={onclose}>Done</button>
    </div>

    <div class="scroll">
      {#if page === 'keyboard'}
        <div class="cols">
          {#each groups as g}
            <section aria-labelledby="kg-{g.name}">
              <h3 id="kg-{g.name}">{g.name}</h3>
              {#each g.ids as id}
                {@const b = binding(id)}
                <div class="row" class:active={recording === id || pending?.id === id}>
                  <span class="name">{commandName(id)}</span>
                  {#if changed(id)}
                    <button class="reset" onclick={() => { commit(id, keys[id] ?? null); announce(`${fullName(id)} is back to ${keyLabel(id) || 'no shortcut'}`); }}
                      aria-label="Reset {fullName(id)} to {keys[id]?.label ?? 'no shortcut'}">Reset</button>
                  {/if}
                  <button class="key num" class:rec={recording === id} class:none={!b} data-key={id}
                    aria-label={recording === id ? `Press a key for ${fullName(id)}` : `${fullName(id)}, ${b ? b.label : 'no shortcut'}. Change`}
                    onclick={() => record(id)}>{recording === id ? 'Press a key…' : (b?.label ?? '—')}</button>
                </div>
                {#if note?.id === id}
                  <div class="inline" role="status">{note.text}</div>
                {/if}
                {#if pending?.id === id}
                  <div class="inline" role="alert">
                    <span>{pending.b.label} is already {fullName(pending.other)}.</span>
                    <button class="btn sm" onclick={replace}>Use it here</button>
                    <button class="btn sm" onclick={() => { pending = null; focusKey(id); }}>Cancel</button>
                  </div>
                {/if}
              {/each}
            </section>
          {/each}
        </div>
      {:else if page === 'stems'}
        <section class="display">
          <h3>Separation model</h3>
          {#if !stems}
            <p>{stemsError || 'Loading…'}</p>
          {:else if stems.model.state === 'ready'}
            <p>Ready. Each track you load is split into vocals, melody, bass and drums on this computer, starting at the play head, so the part you're about to play is ready first.</p>
          {:else if stems.model.state === 'downloading'}
            <p>Downloading, {mb(stems.model.done)} of {mb(stems.model.total)}…</p>
            <div class="bar-track" role="progressbar" aria-label="Model download" aria-valuemin="0" aria-valuemax="100"
              aria-valuenow={Math.round((stems.model.done / stems.model.total) * 100)}><i style:width="{(stems.model.done / stems.model.total) * 100}%"></i></div>
          {:else}
            <p>Stems need a one-time {mb(stems.modelBytes)} download: HTDemucs, an open model (MIT licence) that runs on this computer. Nothing is uploaded.</p>
            {#if stems.model.state === 'failed'}<p class="err" role="alert">{stems.model.error}</p>{/if}
            <div class="size"><button class="btn sm" onclick={download}>{stems.model.state === 'failed' ? 'Try again' : `Download (${mb(stems.modelBytes)})`}</button></div>
          {/if}
        </section>
        {#if stems}
          <section class="display">
            <h3>Splitting</h3>
            <label class="check"><input type="checkbox" checked={stems.enabled} onchange={(e) => setStems({ enabled: e.currentTarget.checked })} />
              Split tracks into stems when they load</label>
          </section>
          <section class="display">
            <h3>Stems cache</h3>
            <p>Finished stems are kept so a track you've played before has them at once. The oldest go first when it's full. Using {gb(stems.cacheBytes)}.</p>
            <div class="size">
              <select class="btn sm" aria-label="Stems cache size" value={stems.cacheGb} onchange={(e) => setStems({ cacheGb: Number(e.currentTarget.value) })}>
                {#each CACHE_SIZES as n}<option value={n}>{n ? `${n} GB` : 'Off'}</option>{/each}
              </select>
              <button class="btn sm" onclick={clearCache} disabled={!stems.cacheBytes}>Clear cache</button>
            </div>
          </section>
          {#if stemsError}<p class="err" role="alert">{stemsError}</p>{/if}
        {/if}
      {:else if page === 'decks'}
        <section class="display">
          <h3>Hot cues</h3>
          <label class="opt">
            <input type="checkbox" checked={deckSettings.hotCuePlays} onchange={(e) => setDeckSetting('hotCuePlays', e.currentTarget.checked)} />
            <span>Start a paused deck</span>
          </label>
          <p>A hot cue on a paused deck plays the track from there. Turn this off to play only while the pad is held and go back when it's let go, like the cue button.</p>
        </section>
        <section class="display">
          <h3>Sync</h3>
          <label class="opt">
            <input type="checkbox" checked={deckSettings.autoSync} onchange={(e) => setDeckSetting('autoSync', e.currentTarget.checked)} />
            <span>Sync when a deck starts</span>
          </label>
          <p>Starting a deck with play, cue or a hot cue while the other deck is playing brings it in at that deck's tempo and on its beat, as if you'd pressed Sync.</p>
        </section>
        <section class="display">
          <h3>Quantize</h3>
          <label class="opt">
            <input type="checkbox" checked={deckSettings.quantize} onchange={(e) => setDeckSetting('quantize', e.currentTarget.checked)} />
            <span>Snap to the beat</span>
          </label>
          <p>Hot cues and loops you set land on the nearest beat, and jumping to a hot cue or back into a loop while a track plays stays in time. Turn this off to set and jump exactly where you press. B turns it on and off too.</p>
        </section>
        <section class="display">
          <h3>Slip</h3>
          {#each [0, 1] as i}
            <label class="opt">
              <input type="checkbox" checked={!!engine.decks[i].slip} onchange={(e) => setSlip(i, e.currentTarget.checked)} />
              <span>Slip on deck {'AB'[i]}</span>
            </label>
          {/each}
          <p>After a scratch, loop, held hot cue or pause, the track picks up where it would have been playing all along, so you stay in time. {#if keyLabel('deck.0.slip') && keyLabel('deck.1.slip')}Press {keyLabel('deck.0.slip')} or {keyLabel('deck.1.slip')} to turn it on or off mid-set.{' '}{/if}The deck shows "Slip" while it's on.</p>
        </section>
      {:else if page === 'audio'}
        <section class="display">
          <h3>Output</h3>
          <p>Where the master plays. Automatic uses your controller's sound card when it's plugged in, so its headphone output works, and this computer's speakers otherwise. Pick a device to play through it even with the controller connected; the controller still works for everything else.</p>
          {#if outputs}
            <div class="size">
              <select class="btn sm" aria-label="Audio output" value={outputs.choice ?? ''} disabled={switching}
                onchange={(e) => pickOutput(e.currentTarget.value)}>
                <option value="">Automatic</option>
                {#each outputs.devices as d}<option value={d}>{d}</option>{/each}
                {#if outputs.choice && !outputs.devices.includes(outputs.choice)}
                  <option value={outputs.choice}>{outputs.choice} (not connected)</option>
                {/if}
              </select>
            </div>
            {#if outputs.choice && !outputs.devices.includes(outputs.choice)}
              <p>{outputs.choice} isn't connected, so the app is playing through the automatic choice for now.</p>
            {/if}
          {:else}
            <p>{outputError || 'Loading…'}</p>
          {/if}
          {#if outputs && outputError}<p class="err" role="alert">{outputError}</p>{/if}
        </section>
        <section class="display">
          <h3>Headphones</h3>
          <p>Headphone cue comes out of channels 3 and 4 of the output, which DJ controllers have and laptop speakers don't. Playing through the speakers, the controller's headphone socket is silent.</p>
        </section>
      {:else if page === 'controllers'}
        <section class="display">
          <h3>Connected</h3>
          {#if !ctl}
            <p>{ctlError || 'Loading…'}</p>
          {:else if !ctl.connected.length}
            <p>No mapped controller is connected. Plug one in, or teach the app one below.</p>
          {:else}
            {#each ctl.connected as c}
              <div class="row"><span class="name">{c.port}</span><span class="dim">{c.learned ? 'Your mapping' : c.mapping}</span></div>
            {/each}
          {/if}
          <p class="gap">Mixxx mappings work as they are, MIDI and HID (such as Traktor Kontrol controllers): put a <code>.midi.xml</code> or <code>.hid.xml</code> file and its scripts in the app's <code>controllers</code> folder, or install Mixxx and its mappings are picked up.</p>
        </section>
        <section class="display">
          <h3>MIDI learn</h3>
          <p>Map a controller yourself: pick an action, press Learn, then move the button, knob or fader for it. Each learned control moves on to the next action. A mapping you make here is used for that controller ahead of any other.</p>
          {#if ctl && !ctl.ports.length}
            <p>No MIDI controller is plugged in.</p>
          {:else if ctl}
            <div class="size">
              <select class="btn sm" aria-label="Controller" value={learnPort} disabled={learning}
                onchange={(e) => pickPort(e.currentTarget.value)}>
                {#each ctl.ports as p}<option value={p}>{p}{ctl.learned.includes(p) ? ' (your mapping)' : ''}</option>{/each}
              </select>
            </div>
            <div class="size gap">
              <select class="btn sm" aria-label="Action" bind:value={action}>
                {#each ACTIONS as g}
                  <optgroup label={g.name}>
                    {#each g.list as a}<option value={a.id}>{a.label.slice(g.name.length + 2)}{bindings.some((b) => b.group === a.group && b.key === a.key) ? ' ✓' : ''}</option>{/each}
                  </optgroup>
                {/each}
              </select>
              {#if learning}
                <button class="btn sm rec" onclick={stopLearn}>Move a control… (stop)</button>
              {:else}
                <button class="btn sm" onclick={startLearn} disabled={!learnPort}>Learn</button>
              {/if}
            </div>
            {#if bindings.length}
              <div class="gap">
                {#each bindings as b}
                  <div class="row">
                    <span class="name">{actionLabel(b)}</span>
                    <span class="dim">{b.description}</span>
                    <button class="reset" onclick={() => removeBinding(b)} aria-label="Remove {actionLabel(b)}">Remove</button>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="size gap">
              <button class="btn sm" onclick={() => saveBindings(bindings)} disabled={!dirty || !bindings.length}>Save</button>
              <button class="btn sm" onclick={() => pickPort(learnPort)} disabled={!dirty}>Undo changes</button>
              {#if ctl.learned.includes(learnPort)}
                <button class="btn sm" onclick={() => saveBindings([])}>Delete mapping</button>
              {/if}
            </div>
          {/if}
          {#if ctl && ctlError}<p class="err" role="alert">{ctlError}</p>{/if}
        </section>
      {:else if page === 'library'}
        <section class="display">
          <h3>Loudness</h3>
          <label class="opt">
            <input type="checkbox" checked={autoGain.on} onchange={(e) => setAutoGain(e.currentTarget.checked)} />
            <span>Auto gain</span>
          </label>
          <p>Tracks load at the same loudness, so you can leave trim near the middle. Trim still works on top. Applies to the next track you load.</p>
        </section>
        <section class="display">
          <h3>Import from another app</h3>
          <p>Bring over your Rekordbox or Serato library: cue points, loops, beatgrids and playlists. Your music files aren't changed, and anything you've set here stays as it is.</p>
          <div class="size">
            <button class="btn sm" onclick={onimport}>Import a library…</button>
          </div>
        </section>
      {:else}
        <section class="display">
          <h3>Interface size</h3>
          <p>Scales everything, text and controls alike. {keyLabel('view.uiZoomIn')} and {keyLabel('view.uiZoomOut')} do the same from anywhere.</p>
          <div class="size" role="group" aria-label="Interface size">
            <button class="btn sm" onclick={() => stepUiZoom(-1)} disabled={uiZoom.scale <= uiZoomSteps[0]} aria-label="Smaller">−</button>
            <span class="num" aria-live="polite">{pct(uiZoom.scale)}</span>
            <button class="btn sm" onclick={() => stepUiZoom(1)} disabled={uiZoom.scale >= uiZoomSteps.at(-1)} aria-label="Bigger">+</button>
            <button class="btn sm" onclick={() => setUiZoom(1)} disabled={uiZoom.scale === 1}>Actual size</button>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--gap);
  }
  nav {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
  }
  .h {
    padding: 0 8px 4px;
    font-size: var(--t-xs);
    color: var(--fg-3);
  }
  .item {
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--fg-2);
    font: inherit;
    text-align: left;
    transition: background-color 140ms ease, color 140ms ease;
  }
  .item:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .item.on {
    background: var(--sel);
    color: var(--fg);
  }
  /* The page is a glass panel, like the track list it covers. */
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-radius: var(--r-panel);
    background: var(--glass-fill);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-edge);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 8px 8px var(--pad);
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .bar p {
    flex: 1;
    margin: 0;
    color: var(--fg-3);
    font-size: var(--t-xs);
  }
  .sp {
    flex: 1;
  }
  .btn:disabled {
    opacity: 0.35;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px var(--pad) var(--pad);
  }
  .cols {
    columns: 300px 3;
    column-gap: 40px;
  }
  section {
    break-inside: avoid;
    padding-top: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 400;
    color: var(--fg-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    border-bottom: 1px solid var(--line);
  }
  .name {
    flex: 1;
    min-width: 0;
    color: var(--fg-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.active .name {
    color: var(--fg);
  }
  .key {
    min-width: 44px;
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font: 400 12px var(--font);
  }
  .key:hover {
    box-shadow: inset 0 0 0 1px var(--fg-3);
  }
  .key.none {
    color: var(--fg-3);
  }
  .key.rec {
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  .reset {
    border: 0;
    padding: 0 4px;
    background: none;
    color: var(--fg-3);
    font: inherit;
    font-size: 11px;
  }
  .reset:hover {
    color: var(--fg-2);
  }
  .inline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
    color: var(--fg-2);
    font-size: 12px;
    border-bottom: 1px solid var(--line);
  }
  .inline span {
    flex: 1;
  }
  .display {
    max-width: 520px;
  }
  .display p {
    margin: 0 0 12px;
    color: var(--fg-3);
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
    color: var(--fg);
  }
  input[type='checkbox'] {
    appearance: none;
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--fg-4);
    display: grid;
    place-items: center;
  }
  input[type='checkbox']:checked {
    background: var(--fg);
    box-shadow: none;
  }
  input[type='checkbox']:checked::after {
    content: '';
    width: 8px;
    height: 4px;
    margin-top: -2px;
    border-left: 1.6px solid var(--bg);
    border-bottom: 1.6px solid var(--bg);
    transform: rotate(-45deg);
  }
  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .size {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .size span {
    width: 48px;
    text-align: center;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    color: var(--fg-2);
  }
  .check input {
    accent-color: var(--fg);
  }
  .err {
    color: var(--kill);
  }
  .dim {
    color: var(--fg-3);
    font-size: 12px;
    white-space: nowrap;
  }
  .gap {
    margin-top: 12px;
  }
  .btn.rec {
    box-shadow: inset 0 0 0 1.5px var(--fg);
  }
  code {
    font-size: 11px;
  }
  .bar-track {
    height: 2px;
    background: var(--line);
    border-radius: 1px;
    margin-bottom: 12px;
  }
  .bar-track i {
    display: block;
    height: 100%;
    background: var(--fg-2);
    border-radius: 1px;
  }
  select.btn {
    appearance: none;
    padding-right: 12px;
  }
</style>
