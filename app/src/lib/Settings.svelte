<script>
  import Marks from '../flags/117-key-marks/Marks.svelte'; // #117 (UI audit flag)
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
  import { flag } from '../flags/registry.svelte.js';
  import { pushEdit } from './undo.svelte.js';
  import Keys from '../flags/116-settings-finish/Keys.svelte'; // #116 (UI audit flag)
  import Search from '../flags/116-settings-finish/Search.svelte'; // #116 (UI audit flag)
  import Stepper from '../flags/116-settings-finish/Stepper.svelte'; // #116 (UI audit flag)
  import Results from '../flags/116-settings-finish/Results.svelte'; // #116 (UI audit flag)
  import { search } from '../flags/116-settings-finish/find.js'; // #116 (UI audit flag)

  /**
   * Settings open as a popup over the whole window. Performance keys keep
   * working while it's open, except while a shortcut is being recorded.
   * Clicking outside it or pressing Escape closes it.
   * @type {{ page?: 'keyboard' | 'decks' | 'audio' | 'display' | 'library' | 'stems' | 'controllers', onclose: () => void, onimport?: () => void, onreport?: () => void, onupdates?: () => void, onsetup?: () => void }}
   */
  let { page = $bindable('keyboard'), onclose, onimport, onreport, onupdates, onsetup } = $props();

  // #32 (UI audit flag): settings-type: the page fades at its edges like the track list (#20): the top
  // only once scrolled (data-scrolled), the foot only while more is below (data-more).
  let scrollEl = $state(/** @type {HTMLElement | null} */ (null));
  let scrollUp = $state(false);
  let scrollMore = $state(false);
  function scrollEdges() {
    if (!scrollEl) return;
    scrollUp = scrollEl.scrollTop > 0;
    scrollMore = scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 1;
  }
  $effect(() => {
    void page;
    if (flag('settings-type')) tick().then(scrollEdges);
  });

  // #26 (UI audit flag): deck-names: the decks named by where they sit, as the screen shows them.
  const deckName = (i) => (flag('deck-names') ? ['Left deck', 'Right deck'][i] : `Deck ${'AB'[i]}`);
  const groups = $derived.by(() => {
    const GROUPS = [
      { name: deckName(0), test: (id) => id.startsWith('deck.0.') },
      { name: deckName(1), test: (id) => id.startsWith('deck.1.') },
      // #34 (UI audit flag): settings-copy: Quantize applies to both decks, so it's filed there, not under Mixer.
      ...(flag('settings-copy') ? [{ name: 'Both decks', test: (id) => id === 'mixer.quantize' }] : []),
      { name: 'Mixer', test: (id) => id.startsWith('mixer.') },
      { name: 'Library', test: (id) => id.startsWith('library.') },
      { name: 'View', test: (id) => id.startsWith('view.') },
      { name: 'App', test: () => true },
    ];
    const left = Object.keys(keys);
    return GROUPS.map((g) => {
      const ids = left.filter(g.test);
      for (const id of ids) left.splice(left.indexOf(id), 1);
      return { name: g.name, ids };
    }).filter((g) => g.ids.length);
  });

  // #34 (UI audit flag): settings-copy: clearer names for a few commands, here on the Keyboard page.
  const RENAMED = {
    where: 'Speak the play position',
    'mixer.quantize': 'Quantize: snap to the beat',
    'view.uiZoomIn': 'Interface size: larger',
    'view.uiZoomOut': 'Interface size: smaller',
    'view.uiZoomReset': 'Interface size: reset to 100%',
  };
  const nameOf = (id) => (flag('settings-copy') && RENAMED[id.replace(/^deck\.\d\./, '')]) || commandName(id);

  const fullName = (id) => {
    const g = groups.find((g) => g.ids.includes(id));
    return g && /^deck\.\d\./.test(id) ? `${g.name} ${nameOf(id).toLowerCase()}` : nameOf(id);
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
    // #116 (UI audit flag): settings-finish: the library's search shortcut finds settings while they're open.
    if (!recording && finish && sameKey(binding('library.search'), bindingFrom(e, mac))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      findInput?.focus();
      findInput?.select();
      return;
    }
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
    // #37 (UI audit flag): settings-undo: Reset all can be taken back from the toast or with ⌘Z.
    const before = flag('settings-undo') ? { ...keymap.overrides } : null;
    keymap.overrides = {};
    saveKeymap();
    pending = null;
    announce('All shortcuts are back to their defaults');
    if (before) {
      pushEdit(
        {
          label: 'Reset all shortcuts',
          undo: () => {
            keymap.overrides = { ...before };
            saveKeymap();
          },
          redo: () => {
            keymap.overrides = {};
            saveKeymap();
          },
        },
        { ms: 8000 },
      );
    }
  }
  /** One shortcut back to its default. */
  function resetOne(id) {
    // #37 (UI audit flag): settings-undo: a row's Reset can be taken back too.
    const had = flag('settings-undo') ? keymap.overrides[id] : undefined;
    commit(id, keys[id] ?? null);
    announce(`${fullName(id)} is back to ${keyLabel(id) || 'no shortcut'}`);
    if (had !== undefined) {
      const name = fullName(id);
      pushEdit({
        label: `${name} reset`,
        undo: () => {
          keymap.overrides[id] = had;
          saveKeymap();
        },
        redo: () => {
          delete keymap.overrides[id];
          saveKeymap();
        },
      });
    }
  }

  function panelKey(e) {
    if (e.key === 'Escape' && !recording) {
      // #116 (UI audit flag): settings-finish: Esc leaves a search first.
      if (query) {
        query = '';
        e.preventDefault();
        e.stopPropagation();
        findInput?.focus();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (pending) pending = null;
      else onclose();
    }
  }

  /** @type {['keyboard' | 'decks' | 'audio' | 'display' | 'library' | 'stems' | 'controllers', string][]} */
  const PAGES = [
    ['keyboard', 'Keyboard'],
    ['decks', 'Decks'],
    ['audio', 'Audio'],
    ['display', 'Display'],
    ['library', 'Library'],
    ['stems', 'Stems'],
    ['controllers', 'Controllers'],
  ];
  // #24 (UI audit flag): focus-after-keys: the page list is one tab stop. Clicking a page moves
  // focus to it (without a ring), and the arrow keys, Home and End move and open pages, so
  // focus never stays on Keyboard while another page shows.
  const roving = $derived(flag('focus-after-keys'));
  function goPage(id, e) {
    page = id;
    if (roving) /** @type {HTMLElement} */ (e.currentTarget).focus({ preventScroll: true, focusVisible: false });
  }
  function navKey(e) {
    if (!roving) return;
    const i = PAGES.findIndex(([id]) => id === page);
    const n = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: PAGES.length - 1 }[e.key];
    if (n === undefined || !/** @type {Element} */ (e.target).matches('[data-page]')) return;
    e.preventDefault();
    e.stopPropagation();
    const next = PAGES[(n + PAGES.length) % PAGES.length][0];
    page = next;
    tick().then(() => root?.querySelector(`nav [data-page="${next}"]`)?.focus());
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
  const ACTIONS = $derived([
    { name: deckName(0), list: deckActions(1) },
    { name: deckName(1), list: deckActions(2) },
    { name: 'Mixer', list: [
      ['[Master]', 'crossfader', 'Crossfader'],
      ['[Master]', 'gain', 'Master level'],
      ['[Master]', 'headMix', 'Headphone mix'],
      ['[Library]', 'MoveVertical', 'Browse (knob)'],
      ['[Library]', 'MoveUp', 'Browse up'],
      ['[Library]', 'MoveDown', 'Browse down'],
    ] },
    { name: 'Sampler', list: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`[Sampler${i}]`, 'cue_gotoandplay', `Play sample ${i}`]) },
  ].map((g) => ({ name: g.name, list: g.list.map(([group, key, label]) => ({ id: `${group} ${key}`, group, key, label: `${g.name}: ${label}` })) })));
  const ALL_ACTIONS = $derived(ACTIONS.flatMap((g) => g.list));
  const actionLabel = (b) => ALL_ACTIONS.find((a) => a.group === b.group && a.key === b.key)?.label ?? `${b.group} ${b.key}`;

  /** @type {{ connected: { port: string, mapping: string, learned: boolean }[], ports: string[], learned: string[] } | null} */
  let ctl = $state(null);
  let ctlError = $state('');
  let learnPort = $state('');
  /** @type {import('./backend.js').Binding[]} */
  let bindings = $state([]);
  let saved = $state('[]');
  let action = $state('[Channel1] play');
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
    const port = learnPort;
    const was = JSON.parse(saved);
    try {
      await backend.saveLearnedMapping(port, list);
      bindings = list;
      saved = JSON.stringify(list);
      announce(list.length ? `Mapping for ${port} saved` : `Mapping for ${port} deleted`);
    } catch (e) {
      ctlError = String(e);
      return refreshControllers();
    }
    // #37 (UI audit flag): settings-undo: deleting a mapping can be taken back.
    if (flag('settings-undo') && !list.length && was.length) {
      const back = async (to) => {
        await backend.saveLearnedMapping(port, to);
        if (learnPort === port) {
          bindings = to;
          saved = JSON.stringify(to);
        }
        refreshControllers();
      };
      pushEdit({ label: `Mapping for ${port} deleted`, undo: () => back(was), redo: () => back([]) });
    }
    refreshControllers();
  }

  // #116 (UI audit flag): settings-finish: search over every page.
  const finish = $derived(flag('settings-finish') && flag('dir-room-tint'));
  let query = $state('');
  let found = $state(0);
  let findInput = $state(/** @type {HTMLInputElement | null} */ (null));
  const finding = $derived(finish && !!query.trim());
  const entries = $derived.by(() => {
    if (!finding) return [];
    /** @type {import('../flags/116-settings-finish/find.js').Entry[]} */
    const out = [];
    const add = (page, label, words = '', find = label) => out.push({ id: `${page}/${label}`, page, label, words, find });
    add('Decks', 'Hot cues start a paused deck', 'pad play');
    add('Decks', 'Sync when a deck starts', 'auto tempo beat match');
    add('Decks', 'Quantize: snap to the beat', 'grid');
    for (const i of [0, 1]) add('Decks', `Slip on the ${deckName(i).toLowerCase()}`, 'scratch loop');
    add('Audio', 'Output', 'sound card speakers headphones device automatic');
    add('Display', 'Interface size', 'zoom scale text bigger smaller');
    add('Library', 'Auto gain', 'loudness volume trim');
    add('Library', 'Import from another app', 'rekordbox serato cue points playlists beatgrids');
    add('Stems', 'Separation model', 'download htdemucs vocals drums bass melody');
    add('Stems', 'Make stems when a track loads', 'automatic vocals');
    add('Stems', 'Stems cache', 'disk size clear keep');
    add('Controllers', 'Connected', 'midi hid mapping plugged');
    add('Controllers', 'Controller not working?', 'set up step by step wizard');
    add('Controllers', 'MIDI learn', 'teach map control');
    for (const c of ctl?.connected ?? []) out.push({ id: `c/${c.port}`, page: 'Controllers', label: c.port, words: c.mapping, find: 'Connected' });
    for (const g of groups) for (const id of g.ids) out.push({ id, page: 'Keyboard', label: nameOf(id), group: /^deck\.\d\./.test(id) ? g.name : '', key: binding(id)?.label ?? '', words: 'shortcut key', at: id });
    for (const g of ACTIONS) for (const a of g.list) {
      const b = bindings.find((x) => x.group === a.group && x.key === a.key);
      out.push({ id: `m/${a.id}`, page: 'Controllers', label: a.label.slice(g.name.length + 2), group: `${g.name}, ${b ? b.description : 'mapping'}`, words: 'midi learn controller', at: a.id, find: 'MIDI learn' });
    }
    return out;
  });
  const results = $derived(finding ? search(entries, query) : []);
  $effect(() => {
    if (finding && !ctl) refreshControllers();
  });
  async function goTo(i = found) {
    const r = results[i];
    if (!r) return;
    query = '';
    page = /** @type {any} */ (PAGES.find(([, label]) => label === r.page)?.[0] ?? page);
    if (r.page === 'Controllers' && r.at) action = r.at;
    await tick();
    // The stems and controllers pages fill in when their answer comes.
    for (let n = 0; n < 20; n++) {
      const key = r.page === 'Keyboard' ? root?.querySelector(`[data-key="${r.at}"]`) : null;
      const at = key ?? [...(root?.querySelectorAll('.scroll :is(label, h3)') ?? [])].find((e) => e.textContent.trim().startsWith(r.find ?? '~'));
      if (at) {
        const row = at.closest('.row') ?? at.closest('label') ?? at;
        row.scrollIntoView({ block: 'center' });
        row.classList.add('sfound');
        setTimeout(() => row.classList.remove('sfound'), 1400);
        const to = key ?? (r.page === 'Controllers' && r.at ? at.closest('section')?.querySelector('select[aria-label="Action"]') : (at.matches('label') ? at : at.closest('section'))?.querySelector('input, select, button:not(:disabled)'));
        /** @type {HTMLElement | null | undefined} */ (to)?.focus({ preventScroll: true });
        return;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
  }

  const mb = (b) => `${Math.round(b / (1024 * 1024))} MB`;
  const gb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : mb(b));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) onclose(); }}>
<div class="settings" role="dialog" aria-modal="true" aria-label="Settings" bind:this={root} onkeydown={panelKey} tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (the arrow keys move between pages: #24 focus-after-keys) -->
  <nav aria-label="Settings pages" onkeydown={navKey}>
    {#if finish}<div class="stitle">Settings</div>{/if}<!-- #116 (UI audit flag): settings-finish -->
    {#if finish}<Search bind:query bind:active={found} bind:input={findInput} count={results.length} onpick={() => goTo()} />{/if}<!-- #116 (UI audit flag): settings-finish -->
    <div class="h">Settings</div>
    {#each PAGES as [id, label] (id)}
      <button class="item" class:on={page === id && !finding} aria-current={page === id ? 'page' : undefined}
        data-page={roving ? id : undefined} tabindex={roving ? (page === id ? 0 : -1) : undefined}
        onclick={(e) => { query = ''; goPage(id, e); }}>{label}</button>
    {/each}
    <div class="foot">
      {#if onupdates}<button class="item" onclick={onupdates}>Check for updates</button>{/if}
      {#if onreport}<button class="item" onclick={onreport}>Report a problem…</button>{/if}
    </div>
  </nav>

  <div class="main">
    <div class="bar">
      <h2>{finding ? 'Search' : { keyboard: 'Keyboard', decks: 'Decks', audio: 'Audio', library: 'Library', stems: 'Stems', controllers: 'Controllers' }[page] ?? 'Display'}</h2>
      {#if finding}
        <p>{results.length ? `${results.length} found` : ''}</p>
      {:else if page === 'keyboard'}
        <p>Click a shortcut, then press the new key. Backspace removes it, Esc cancels.</p>
        {#if !flag('settings-undo')}
          <button class="btn sm" onclick={resetAll} disabled={!Object.keys(keymap.overrides).length}>Reset all</button>
        {/if}
      {:else}
        <span class="sp"></span>
      {/if}
      <button class="btn sm" onclick={onclose}>Done</button>
    </div>

    <div class="scroll" bind:this={scrollEl} onscroll={() => flag('settings-type') && scrollEdges()}
      data-scrolled={flag('settings-type') && scrollUp ? '' : undefined} data-more={flag('settings-type') && scrollMore ? '' : undefined}>
      {#if finding}
        <Results {results} {query} bind:active={found} onpick={goTo} onclear={() => { query = ''; findInput?.focus(); }} /><!-- #116 (UI audit flag): settings-finish -->
      {:else if page === 'keyboard'}
        <div class="cols">
          {#each groups as g}
            <section aria-labelledby="kg-{g.name}">
              <h3 id="kg-{g.name}">{g.name}</h3>
              {#each g.ids as id}
                {@const b = binding(id)}
                <div class="row" class:active={recording === id || pending?.id === id}>
                  <span class="name">{nameOf(id)}</span>
                  {#if changed(id)}
                    <button class="reset" onclick={() => resetOne(id)}
                      aria-label="Reset {fullName(id)} to {keys[id]?.label ?? 'no shortcut'}">Reset</button>
                  {/if}
                  <!-- #32 (UI audit flag): settings-type: an unassigned key says "Set" rather than a dash that looks like the minus key. -->
                  <button class="key num" class:rec={recording === id} class:none={!b} data-key={id}
                    aria-label={recording === id ? `Press a key for ${fullName(id)}` : `${fullName(id)}, ${b ? b.label : 'no shortcut'}. Change`}
                    onclick={() => record(id)}>{#if finish && b && recording !== id}<Keys label={b.label} />{:else}{recording === id ? 'Press a key…' : (b?.label ?? (flag('settings-type') ? 'Set' : '—'))}{/if}</button>
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
        <!-- #37 (UI audit flag): settings-undo: Reset all at the foot of the page, away from Done, and undoable. -->
        {#if flag('settings-undo')}
          <div class="reset-all">
            <button class="btn sm ghost" onclick={resetAll} disabled={!Object.keys(keymap.overrides).length}>Reset all shortcuts</button>
          </div>
        {/if}
      {:else if page === 'stems'}
        <section class="display">
          <h3>Separation model</h3>
          {#if !stems}
            <p>{stemsError || 'Loading…'}</p>
          {:else if stems.model.state === 'ready'}
            <!-- #33 (UI audit flag): stems-model: says it's installed, and its size. #34 (UI audit flag): settings-copy: one sentence. -->
            {#if flag('stems-model')}<p class="installed">Installed, {mb(stems.modelBytes)}</p>{/if}
            <p>{flag('settings-copy') ? (finish ? 'Makes vocals, melody, bass and drums from each track on this computer.' : 'Each track you load is split into vocals, melody, bass and drums on this computer, starting at the play head.') : "Ready. Each track you load is split into vocals, melody, bass and drums on this computer, starting at the play head, so the part you're about to play is ready first."}</p>
          {:else if stems.model.state === 'downloading'}
            <p>Downloading, {mb(stems.model.done)} of {mb(stems.model.total)}…</p>
            <div class="bar-track" role="progressbar" aria-label="Model download" aria-valuemin="0" aria-valuemax="100"
              aria-valuenow={Math.round((stems.model.done / stems.model.total) * 100)}><i style:width="{(stems.model.done / stems.model.total) * 100}%"></i></div>
          {:else}
            {#if flag('settings-copy')}
              <!-- #34 (UI audit flag): settings-copy: one sentence; the size is on the button; American spelling, like the rest of the app. -->
              <p>Stems need a one-time download of HTDemucs, an open model (MIT license) that runs on this computer, so nothing is uploaded.</p>
            {:else}
              <p>Stems need a one-time {mb(stems.modelBytes)} download: HTDemucs, an open model (MIT licence) that runs on this computer. Nothing is uploaded.</p>
            {/if}
            {#if stems.model.state === 'failed'}<p class="err" role="alert">{stems.model.error}</p>{/if}
            <div class="size"><button class="btn sm" onclick={download}>{stems.model.state === 'failed' ? 'Try again' : `Download (${mb(stems.modelBytes)})`}</button></div>
          {/if}
        </section>
        {#if stems}
          <section class="display">
            {#if !finish}<h3>Splitting</h3>{/if}
            {#if flag('settings-checks') || flag('stems-model')}
              <!-- #35 (UI audit flag): settings-checks: the same checkbox row as every other page.
                   #33 (UI audit flag): stems-model: off and unavailable until the model is installed. -->
              {@const ready = !flag('stems-model') || stems.model.state === 'ready'}
              <label class={flag('settings-checks') ? 'opt' : 'check'} class:off={!ready}>
                <input type="checkbox" checked={stems.enabled && ready} disabled={!ready} onchange={(e) => setStems({ enabled: e.currentTarget.checked })} />
                <span>{finish ? 'Make stems when a track loads' : 'Split tracks into stems when they load'}</span>
              </label>
              {#if !ready}<p class="needs">Download the separation model above to turn this on.</p>{/if}
            {:else}
              <label class="check"><input type="checkbox" checked={stems.enabled} onchange={(e) => setStems({ enabled: e.currentTarget.checked })} />
                Split tracks into stems when they load</label>
            {/if}
          </section>
          <section class="display">
            <h3>Stems cache</h3>
            {#if flag('settings-copy')}
              <p>Finished stems are kept so a track you've played before has them at once; the oldest go first. Using {gb(stems.cacheBytes)}.</p>
            {:else}
              <p>Finished stems are kept so a track you've played before has them at once. The oldest go first when it's full. Using {gb(stems.cacheBytes)}.</p>
            {/if}
            <div class="size">
              <!-- #31 (UI audit flag): select-chevron: a caption names the menu. -->
              {#if flag('select-chevron')}<span class="cap">Keep up to</span>{/if}
              <!-- #116 (UI audit flag): settings-finish: seven sizes in order are steps, not a menu. -->
              {#if finish}
              {@const at = Math.max(0, CACHE_SIZES.findIndex((n) => n >= stems.cacheGb))}
              <div role="group" aria-label="Stems cache size"><Stepper value={stems.cacheGb ? `${stems.cacheGb} GB` : 'Off'} less={() => setStems({ cacheGb: CACHE_SIZES[at - 1] })} more={() => setStems({ cacheGb: CACHE_SIZES[CACHE_SIZES[at] > stems.cacheGb ? at : at + 1] })} atLeast={at === 0} atMost={stems.cacheGb >= CACHE_SIZES.at(-1)} lessLabel="Keep less" moreLabel="Keep more" /></div>
              {:else}
              <select class="btn sm" aria-label="Stems cache size" value={stems.cacheGb} onchange={(e) => setStems({ cacheGb: Number(e.currentTarget.value) })}>
                {#each CACHE_SIZES as n}<option value={n}>{n ? `${n} GB` : 'Off'}</option>{/each}
              </select>
              {/if}
              <button class="btn sm" onclick={clearCache} disabled={!stems.cacheBytes}>Clear cache</button>
            </div>
          </section>
          {#if stemsError}<p class="err" role="alert">{stemsError}</p>{/if}
        {/if}
      {:else if page === 'decks'}
        {#if flag('settings-copy')}
          <!-- #34 (UI audit flag): settings-copy: one sentence per option; labels say what they do; keys named as the user has them. -->
          <section class="display">
            <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
            {#if !flag('settings-type')}<h3>Hot cues</h3>{/if}
            <label class="opt">
              <input type="checkbox" checked={deckSettings.hotCuePlays} onchange={(e) => setDeckSetting('hotCuePlays', e.currentTarget.checked)} />
              <span>{flag('settings-type') ? 'Hot cues start a paused deck' : 'Start a paused deck'}</span>
            </label>
            <p>Turn this off to play only while the pad is held, like the Cue button.</p>
          </section>
          <section class="display">
            <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
            {#if !flag('settings-type')}<h3>Sync</h3>{/if}
            <label class="opt">
              <input type="checkbox" checked={deckSettings.autoSync} onchange={(e) => setDeckSetting('autoSync', e.currentTarget.checked)} />
              <span>Sync when a deck starts</span>
            </label>
            <p>Starting a deck while the other plays matches its tempo and beat.</p>
          </section>
          <section class="display">
            <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
            {#if !flag('settings-type')}<h3>Quantize</h3>{/if}
            <label class="opt">
              <input type="checkbox" checked={deckSettings.quantize} onchange={(e) => setDeckSetting('quantize', e.currentTarget.checked)} />
              <span>{flag('settings-type') ? 'Quantize: snap to the beat' : 'Snap to the beat'}</span>
            </label>
            <p>Hot cues, loops and jumps land on the nearest beat{#if keyLabel('mixer.quantize')}; <Marks text={keyLabel('mixer.quantize')} /> turns it on and off{/if}.</p>
          </section>
          <section class="display">
            <h3>Slip</h3>
            {#each [0, 1] as i}
              <label class="opt">
                <input type="checkbox" checked={!!engine.decks[i].slip} onchange={(e) => setSlip(i, e.currentTarget.checked)} />
                <span>{flag('deck-names') ? `Slip on the ${deckName(i).toLowerCase()}` : `Slip on deck ${'AB'[i]}`}</span>
              </label>
            {/each}
            <p>After a scratch, loop or held cue, the track carries on from where it would have been, so you stay in time.</p>
          </section>
        {:else}
        <section class="display">
          <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
          {#if !flag('settings-type')}<h3>Hot cues</h3>{/if}
          <label class="opt">
            <input type="checkbox" checked={deckSettings.hotCuePlays} onchange={(e) => setDeckSetting('hotCuePlays', e.currentTarget.checked)} />
            <span>{flag('settings-type') ? 'Hot cues start a paused deck' : 'Start a paused deck'}</span>
          </label>
          <p>A hot cue on a paused deck plays the track from there. Turn this off to play only while the pad is held and go back when it's let go, like the cue button.</p>
        </section>
        <section class="display">
          <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
          {#if !flag('settings-type')}<h3>Sync</h3>{/if}
          <label class="opt">
            <input type="checkbox" checked={deckSettings.autoSync} onchange={(e) => setDeckSetting('autoSync', e.currentTarget.checked)} />
            <span>Sync when a deck starts</span>
          </label>
          <p>Starting a deck with play, cue or a hot cue while the other deck is playing brings it in at that deck's tempo and on its beat, as if you'd pressed Sync.</p>
        </section>
        <section class="display">
          <!-- #32 (UI audit flag): settings-type drops a heading over a single option; the label carries its name. -->
          {#if !flag('settings-type')}<h3>Quantize</h3>{/if}
          <label class="opt">
            <input type="checkbox" checked={deckSettings.quantize} onchange={(e) => setDeckSetting('quantize', e.currentTarget.checked)} />
            <span>{flag('settings-type') ? 'Quantize: snap to the beat' : 'Snap to the beat'}</span>
          </label>
          <p>Hot cues and loops you set land on the nearest beat, and jumping to a hot cue or back into a loop while a track plays stays in time. Turn this off to set and jump exactly where you press. B turns it on and off too.</p>
        </section>
        <section class="display">
          <h3>Slip</h3>
          {#each [0, 1] as i}
            <label class="opt">
              <input type="checkbox" checked={!!engine.decks[i].slip} onchange={(e) => setSlip(i, e.currentTarget.checked)} />
              <span>{flag('deck-names') ? `Slip on the ${deckName(i).toLowerCase()}` : `Slip on deck ${'AB'[i]}`}</span>
            </label>
          {/each}
          <p>After a scratch, loop, held hot cue or pause, the track picks up where it would have been playing all along, so you stay in time. {#if keyLabel('deck.0.slip') && keyLabel('deck.1.slip')}Press {keyLabel('deck.0.slip')} or {keyLabel('deck.1.slip')} to turn it on or off mid-set.{' '}{/if}The deck shows "Slip" while it's on.</p>
        </section>
        {/if}
      {:else if page === 'audio'}
        <section class="display">
          <h3>Output</h3>
          {#if !flag('settings-copy')}
            <p>Where the master plays. Automatic uses your controller's sound card when it's plugged in, so its headphone output works, and this computer's speakers otherwise. Pick a device to play through it even with the controller connected; the controller still works for everything else.</p>
          {/if}
          {#if outputs}
            <div class="size">
              <select class="btn sm" aria-label="Audio output" value={outputs.choice ?? ''} disabled={switching}
                onchange={(e) => pickOutput(e.currentTarget.value)}>
                <!-- #34 (UI audit flag): settings-copy: Automatic names the device it picked. -->
                <option value="">{flag('settings-copy') && !outputs.choice && engine.audio?.device ? `Automatic: ${engine.audio.device}` : 'Automatic'}</option>
                {#each outputs.devices as d}<option value={d}>{d}</option>{/each}
                {#if outputs.choice && !outputs.devices.includes(outputs.choice)}
                  <option value={outputs.choice}>{outputs.choice} (not connected)</option>
                {/if}
              </select>
            </div>
            {#if flag('settings-copy')}
              <!-- #34 (UI audit flag): settings-copy: the control first, one line under it, and headphone cue folded in here. -->
              <p class="under">Automatic uses your controller when it's plugged in, so headphone cue works, and this computer otherwise.</p>
            {/if}
            {#if outputs.choice && !outputs.devices.includes(outputs.choice)}
              <p>{outputs.choice} isn't connected, so the app is playing through the automatic choice for now.</p>
            {/if}
          {:else}
            <p>{outputError || 'Loading…'}</p>
          {/if}
          {#if outputs && outputError}<p class="err" role="alert">{outputError}</p>{/if}
        </section>
        {#if !flag('settings-copy')}
        <section class="display">
          <h3>Headphones</h3>
          <p>Headphone cue comes out of channels 3 and 4 of the output, which DJ controllers have and laptop speakers don't. Playing through the speakers, the controller's headphone socket is silent.</p>
        </section>
        {/if}
      {:else if page === 'controllers'}
        <section class="display">
          <h3>Connected</h3>
          {#if !ctl}
            <p>{ctlError || 'Loading…'}</p>
          {:else if !ctl.connected.length}
            <p>No mapped controller is connected. Plug one in, or teach the app one below.</p>
          {:else}
            {#each ctl.connected as c}
              <div class="row"><span class="name">{c.port}</span><span class="dim">{c.learned ? 'Your mapping' : flag('settings-copy') ? `Mapping: ${c.mapping}` : c.mapping}</span></div>
            {/each}
          {/if}
          {#if flag('settings-copy')}
            <p class="gap">Mixxx MIDI and HID mappings work as they are. Add your own to the app's controllers folder.</p>
          {:else}
            <p class="gap">Mixxx mappings work as they are, MIDI and HID (such as Traktor Kontrol controllers): put a <code>.midi.xml</code> or <code>.hid.xml</code> file and its scripts in the app's <code>controllers</code> folder, or install Mixxx and its mappings are picked up.</p>
          {/if}
        </section>
        <section class="display">
          <h3>Controller not working?</h3>
          <!-- #34 (UI audit flag): settings-copy says it in one sentence. -->
          {#if flag('settings-copy')}
            <p>If it does nothing or the wrong things, the app asks for each control in turn and you press or move it.</p>
          {:else}
          <p>If it does nothing, or the wrong things, set it up step by step: the app asks for each control and you press or move it. It takes a couple of minutes, and you can share the result so it works for everyone.</p>
          {/if}
          <div class="size">
            <button class="btn sm" onclick={onsetup}>Set up step by step…</button>
          </div>
        </section>
        <section class="display">
          <h3>MIDI learn</h3>
          {#if flag('settings-copy')}
            <p>Pick an action, press Learn, then move the control for it; each one moves on to the next action.</p>
          {:else}
            <p>Map a controller yourself: pick an action, press Learn, then move the button, knob or fader for it. Each learned control moves on to the next action. A mapping you make here is used for that controller ahead of any other.</p>
          {/if}
          {#if ctl && !ctl.ports.length}
            <p>No MIDI controller is plugged in.</p>
          {:else if ctl}
            <div class="size">
              {#if flag('select-chevron')}<span class="cap">Controller</span>{/if}
              <select class="btn sm" aria-label="Controller" value={learnPort} disabled={learning}
                onchange={(e) => pickPort(e.currentTarget.value)}>
                {#each ctl.ports as p}<option value={p}>{p}{ctl.learned.includes(p) ? ' (your mapping)' : ''}</option>{/each}
              </select>
            </div>
            <div class="size gap">
              {#if flag('select-chevron')}<span class="cap">Action</span>{/if}
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
              <!-- #37 (UI audit flag): settings-undo: names what it throws away, so it isn't mistaken for the app's Undo. -->
              <button class="btn sm" onclick={() => pickPort(learnPort)} disabled={!dirty}>{flag('settings-undo') ? 'Revert mapping' : 'Undo changes'}</button>
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
          <p>{flag('settings-copy') ? 'Tracks load at the same loudness, so trim can stay near the middle.' : 'Tracks load at the same loudness, so you can leave trim near the middle. Trim still works on top. Applies to the next track you load.'}</p>
        </section>
        <section class="display">
          <h3>Import from another app</h3>
          <p>{flag('settings-copy') ? 'Bring over cue points, loops, beatgrids and playlists from rekordbox or Serato; your music files aren\'t changed.' : "Bring over your Rekordbox or Serato library: cue points, loops, beatgrids and playlists. Your music files aren't changed, and anything you've set here stays as it is."}</p>
          <div class="size">
            <button class="btn sm" onclick={onimport}>Import a library…</button>
          </div>
        </section>
      {:else}
        <section class="display">
          <h3>Interface size</h3>
          <p>{#if flag('settings-copy')}Scales text and controls alike; <Marks text={keyLabel('view.uiZoomIn')} /> and <Marks text={keyLabel('view.uiZoomOut')} /> work from anywhere.{:else}Scales everything, text and controls alike. <Marks text={keyLabel('view.uiZoomIn')} /> and <Marks text={keyLabel('view.uiZoomOut')} /> do the same from anywhere.{/if}</p>
          <div class="size" role="group" aria-label="Interface size">
            <!-- #116 (UI audit flag): settings-finish: raised, sunken, raised. -->
            {#if finish}
            <Stepper value={pct(uiZoom.scale)} less={() => stepUiZoom(-1)} more={() => stepUiZoom(1)} atLeast={uiZoom.scale <= uiZoomSteps[0]} atMost={uiZoom.scale >= uiZoomSteps.at(-1)} lessLabel="Smaller" moreLabel="Bigger" />
            {:else}
            <button class="btn sm" onclick={() => stepUiZoom(-1)} disabled={uiZoom.scale <= uiZoomSteps[0]} aria-label="Smaller">−</button>
            <span class="num" aria-live="polite">{pct(uiZoom.scale)}</span>
            <button class="btn sm" onclick={() => stepUiZoom(1)} disabled={uiZoom.scale >= uiZoomSteps.at(-1)} aria-label="Bigger">+</button>
            {/if}
            <button class="btn sm" onclick={() => setUiZoom(1)} disabled={uiZoom.scale === 1}>{flag('settings-copy') ? 'Reset to 100%' : 'Actual size'}</button>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    /* One full-height row, so the popup's height (and centring) can't be pushed by a tall page. */
    grid-template-rows: minmax(0, 1fr);
    place-items: center;
    padding: 24px;
    background: rgb(5 5 6 / 0.6);
    animation: fade 0.16s ease-out;
  }
  .settings {
    width: min(960px, 100%);
    height: min(640px, 100%);
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--gap);
    padding: var(--gap);
    border-radius: 14px;
    background: #121214;
    box-shadow: inset 0 0 0 1px var(--line-2), 0 24px 80px rgb(0 0 0 / 0.5);
    outline: none;
    animation: rise 0.2s ease-out;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px) scale(0.99); }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop, .settings { animation: none; }
  }
  nav {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
  }
  .foot {
    display: flex;
    flex-direction: column;
    margin-top: auto;
    padding-top: 12px;
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
  /* The page is a glass panel inside the popup. */
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
