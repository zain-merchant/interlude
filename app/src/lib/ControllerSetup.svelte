<script>
  import { onMount } from 'svelte';
  import { backend } from './backend.js';
  import { announce } from './announce.svelte.js';

  /**
   * Controller not working? Set it up step by step: pick the controller,
   * then press or move each control as the picture asks. What it learns is
   * saved as the controller's mapping, and can be shared back as a GitHub
   * issue so the next person's controller works out of the box.
   * @type {{ onclose: () => void }}
   */
  let { onclose } = $props();

  const ISSUES = 'https://github.com/zain-merchant/interlude/issues/new';

  // Where each control sits on the picture of a two-deck controller, and
  // what to ask for. `kind` decides the verb and which messages count:
  // a knob, fader or jog step ignores a touch-sensitive control's note.
  const deckSteps = (n) => {
    const ch = `[Channel${n}]`;
    const side = n === 1 ? 'left' : 'right';
    const x = (v) => (n === 1 ? v : 600 - v);
    return [
      { group: ch, key: 'play', kind: 'button', label: 'Play', ask: `Press PLAY on the ${side} deck`, shape: { t: 'btn', x: x(42), y: 262 } },
      { group: ch, key: 'cue_default', kind: 'button', label: 'Cue', ask: `Press CUE on the ${side} deck`, shape: { t: 'btn', x: x(42), y: 230 } },
      { group: ch, key: 'beatsync', kind: 'button', label: 'Sync', ask: `Press SYNC on the ${side} deck`, shape: { t: 'btn', x: x(42), y: 198 } },
      ...[1, 2, 3, 4].map((i) => ({
        group: ch, key: `hotcue_${i}_activate`, kind: 'button', label: `Hot cue ${i}`,
        ask: `Press performance pad ${i} on the ${side} deck${i === 1 ? ', in hot cue mode' : ''}`,
        shape: { t: 'pad', x: (n === 1 ? 70 : 414) + (i - 1) * 30, y: 220 },
      })),
      { group: ch, key: 'jog', kind: 'jog', label: 'Jog wheel', ask: `Spin the ${side} jog wheel by its outer edge`, shape: { t: 'jog', x: x(122), y: 112 } },
      { group: ch, key: 'rate', kind: 'fader', label: 'Tempo fader', ask: `Move the ${side} tempo (pitch) fader`, shape: { t: 'vfader', x: x(16), y: 40, h: 130 } },
      { group: ch, key: 'LoadSelectedTrack', kind: 'button', label: 'Load', ask: `Press LOAD for the ${side} deck`, shape: { t: 'btn', x: x(250), y: 22 } },
    ];
  };
  const mixerSteps = (n) => {
    const ch = `[Channel${n}]`;
    const eq = `[EqualizerRack1_${ch}_Effect1]`;
    const x = n === 1 ? 266 : 334;
    return [
      { group: ch, key: 'pregain', kind: 'knob', label: 'Trim', ask: `Turn the TRIM (gain) knob on channel ${n}`, shape: { t: 'knob', x, y: 62 } },
      { group: eq, key: 'parameter3', kind: 'knob', label: 'EQ high', ask: `Turn the HIGH EQ knob on channel ${n}`, shape: { t: 'knob', x, y: 92 } },
      { group: eq, key: 'parameter2', kind: 'knob', label: 'EQ mid', ask: `Turn the MID EQ knob on channel ${n}`, shape: { t: 'knob', x, y: 122 } },
      { group: eq, key: 'parameter1', kind: 'knob', label: 'EQ low', ask: `Turn the LOW EQ knob on channel ${n}`, shape: { t: 'knob', x, y: 152 } },
      { group: `[QuickEffectRack1_${ch}]`, key: 'super1', kind: 'knob', label: 'Filter', ask: `Turn the FILTER (CFX) knob on channel ${n}`, shape: { t: 'knob', x, y: 182 } },
      { group: ch, key: 'pfl', kind: 'button', label: 'Headphone cue', ask: `Press the headphone CUE button on channel ${n}`, shape: { t: 'btn', x, y: 208 } },
      { group: ch, key: 'volume', kind: 'fader', label: 'Volume fader', ask: `Move the channel ${n} volume fader`, shape: { t: 'vfader', x: x - 4, y: 222, h: 48 } },
    ].map((s) => ({ ...s, section: `Channel ${n}` }));
  };
  const STEPS = [
    ...deckSteps(1).map((s) => ({ ...s, section: 'Left deck' })),
    ...mixerSteps(1),
    ...mixerSteps(2),
    { group: '[Master]', key: 'crossfader', kind: 'fader', label: 'Crossfader', ask: 'Move the crossfader', section: 'Mixer', shape: { t: 'hfader', x: 270, y: 284, w: 60 } },
    { group: '[Library]', key: 'MoveVertical', kind: 'knob', label: 'Browse', ask: 'Turn the browse knob', section: 'Mixer', shape: { t: 'knob', x: 300, y: 26 } },
    { group: '[Master]', key: 'gain', kind: 'knob', label: 'Master level', ask: 'Turn the MASTER level knob (skip it if there isn’t one)', section: 'Mixer', shape: { t: 'knob', x: 300, y: 70 } },
    ...deckSteps(2).map((s) => ({ ...s, section: 'Right deck' })),
  ];
  const stepName = (s) => `${s.section}: ${s.label}`;
  const VERB = { button: 'press', knob: 'turn', fader: 'move', jog: 'spin' };

  /** @type {{ connected: { port: string, mapping: string, learned: boolean }[], ports: string[], learned: string[] } | null} */
  let ctl = $state(null);
  /** @type {string[]} */
  let models = $state([]);
  let port = $state('');
  let model = $state('');
  let modelTouched = false;
  let error = $state('');

  /** 'pick', 'learn' or 'done' */
  let stage = $state('pick');
  let index = $state(0);
  /** What each step learned, by step index. @type {(import('./backend.js').Binding | null | undefined)[]} */
  let learned = $state([]);
  /** A note under the prompt: a clash, or what was just heard. */
  let note = $state('');
  let savedFile = $state('');
  /** Bindings already saved for this port, kept where the guide doesn't replace them. */
  let earlier = [];

  const step = $derived(STEPS[index]);
  const mapped = $derived(learned.filter(Boolean).length);
  const current = $derived(ctl?.connected.find((c) => c.port === port));

  async function refresh() {
    try {
      ctl = await backend.controllers();
      if (!port || !ctl.ports.includes(port)) {
        // The controller without a mapping is most likely the one that's not working.
        port = ctl.ports.find((p) => !ctl.connected.some((c) => c.port === p)) ?? ctl.ports[0] ?? '';
      }
      if (!modelTouched) model = guessModel();
    } catch (e) {
      error = String(e);
    }
  }

  /** The model this port looks like: its mapping's name, else a known model it names. */
  function guessModel() {
    const c = ctl?.connected.find((x) => x.port === port);
    if (c && !c.learned) return c.mapping;
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const p = norm(port);
    const hit = models
      .filter((m) => p.includes(norm(m.split(' ').slice(1).join(' ') || m)))
      .sort((a, b) => b.length - a.length)[0];
    return hit ?? port.replace(/\s*(MIDI|Port)?\s*\d*$/i, '').trim();
  }

  onMount(() => {
    const back = document.activeElement;
    backend.controllerModels?.().then((m) => {
      models = m;
      if (!modelTouched) model = guessModel();
    }).catch(() => {});
    refresh();
    // Notice a controller plugged in while this is open.
    const timer = setInterval(() => stage === 'pick' && refresh(), 2000);
    return () => {
      clearInterval(timer);
      stopListening();
      backend.controllersPause?.(false);
      /** @type {HTMLElement} */ (back)?.focus?.();
    };
  });

  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  async function listen() {
    clearInterval(timer);
    await backend.midiLearnStart();
    timer = setInterval(poll, 80);
  }
  function stopListening() {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
    backend.midiLearnStop?.();
  }

  async function start() {
    error = '';
    try {
      earlier = (await backend.learnedMapping(port)) ?? [];
      // Pressing PLAY to teach it shouldn't start a deck.
      await backend.controllersPause?.(true);
      learned = STEPS.map((s) => earlier.find((b) => b.group === s.group && b.key === s.key) ?? null);
      index = 0;
      note = '';
      stage = 'learn';
      announce(`${STEPS[0].ask}. Step 1 of ${STEPS.length}.`);
      await listen();
    } catch (e) {
      error = String(e);
    }
  }

  let busy = false;
  async function poll() {
    if (busy || stage !== 'learn') return;
    busy = true;
    try {
      const got = await backend.midiLearnPoll();
      if (!got) return;
      const [from, b] = got;
      // Another controller, or a knob step hearing a touch-sensitive
      // control's note: keep listening for the real thing.
      if (from !== port || (step.kind !== 'button' && b.kind === 'button')) {
        await backend.midiLearnStart();
        return;
      }
      const clash = learned.findIndex((x, i) => i !== index && x && x.status === b.status && x.number === b.number);
      if (clash >= 0) {
        note = `That control is already ${stepName(STEPS[clash])}. Use a different one, or skip this step.`;
        announce(note);
        await backend.midiLearnStart();
        return;
      }
      learned[index] = { ...b, group: step.group, key: step.key };
      note = `Got it. ${step.label} is ${b.description}`;
      await go(index + 1);
    } catch (e) {
      error = String(e);
      stopListening();
    } finally {
      busy = false;
    }
  }

  async function go(i) {
    if (i >= STEPS.length) return finish();
    index = Math.max(0, i);
    announce(`${STEPS[index].ask}. Step ${index + 1} of ${STEPS.length}.`);
    await backend.midiLearnStart();
  }
  function skip() {
    learned[index] = null;
    note = '';
    go(index + 1);
  }
  function back() {
    note = '';
    go(index - 1);
  }

  async function finish() {
    stopListening();
    await backend.controllersPause?.(false);
    const ours = learned.filter(Boolean);
    // Earlier bindings the guide didn't touch stay, unless the same
    // control now does something else.
    const kept = earlier.filter(
      (e) => !STEPS.some((s) => s.group === e.group && s.key === e.key) && !ours.some((b) => b.status === e.status && b.number === e.number),
    );
    const list = [...kept, ...ours].map((b) => ({ ...b }));
    if (!list.length) {
      onclose();
      return;
    }
    try {
      savedFile = (await backend.saveLearnedMapping(port, list)) ?? '';
      stage = 'done';
      announce(`Saved. ${ours.length} controls mapped.`);
    } catch (e) {
      error = String(e);
    }
  }

  const hex = (n) => `0x${n.toString(16).padStart(2, '0').toUpperCase()}`;

  /** A GitHub issue with the mapping filled in, for the browser. Nothing is sent until the user submits it. */
  /** What's shared about this mapping: a title, then the parts of the text. */
  async function details() {
    const version = await backend.appVersion?.().catch(() => '') ?? '';
    const lines = learned.flatMap((b, i) => (b ? [`${STEPS[i].group} ${STEPS[i].key} ${b.kind} ${hex(b.status)} ${hex(b.number)}`] : []));
    const skipped = STEPS.filter((_, i) => !learned[i]).map(stepName);
    return {
      title: `Controller mapping: ${model || port}`,
      head: [
        `**Controller:** ${model || 'unknown'}`,
        `**MIDI port:** ${port}`,
        `**Mapping it had:** ${current && !current.learned ? current.mapping : 'none'}`,
        `**Interlude:** ${version || 'unknown'} on ${navigator.platform}`,
        '',
        '**What wasn’t working:** ',
        '',
      ],
      code: ['```', ...lines, '```'],
      tail: [
        '',
        skipped.length ? `Skipped: ${skipped.join(', ')}` : 'Nothing skipped.',
        '',
        `Made with the guided controller setup. The full mapping file is \`${savedFile.split(/[\\/]/).pop()}\`.`,
      ],
    };
  }

  /** A GitHub issue with the mapping filled in, for the browser. Nothing is sent until the user submits it. */
  async function share() {
    const d = await details();
    const table = ['<details><summary>Mapping (group, key, kind, status, number)</summary>', '', ...d.code, '</details>'];
    const tail = [...d.tail.slice(0, -1), `${d.tail.at(-1)} Drag it in here if you can.`];
    const url = (body) =>
      `${ISSUES}?${new URLSearchParams({ title: d.title, labels: 'controller-mapping', body: body.join('\n') })}`;
    let link = url([...d.head, ...table, ...tail]);
    // Browsers and GitHub cut off long links; the file has it all anyway.
    if (link.length > 7500) link = url([...d.head, '_Mapping too long for a link: please attach the file._', ...tail]);
    try {
      await backend.openUrl(link);
    } catch (e) {
      error = String(e);
    }
  }

  /** The same details as plain text, for anyone without a GitHub account to paste wherever they like. */
  let copied = $state(false);
  async function copy() {
    const d = await details();
    try {
      await navigator.clipboard.writeText([`**${d.title}**`, '', ...d.head, 'Mapping (group, key, kind, status, number):', ...d.code, ...d.tail].join('\n'));
      copied = true;
      announce('Details copied');
      setTimeout(() => (copied = false), 2000);
    } catch (e) {
      error = `Couldn't copy: ${e}`;
    }
  }

  function key(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
    // Keep the deck keys from firing while this is open.
    e.stopPropagation();
  }

  /** @param {{ t: string, x: number, y: number, h?: number, w?: number }} s */
  const isOn = (s) => stage === 'learn' && step?.shape === s;
  const done = (s) => {
    const i = STEPS.findIndex((x) => x.shape === s);
    return i >= 0 && !!learned[i];
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onkeydown={key} onkeyup={(e) => e.stopPropagation()}>
  <div class="card" role="dialog" aria-modal="true" aria-labelledby="setup-title" tabindex="-1">
    <div class="top">
      <h2 id="setup-title">{stage === 'done' ? 'Controller set up' : 'Set up your controller'}</h2>
      <button class="close" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>

    {#if stage === 'pick'}
      <p class="lead">If your controller does nothing, or the wrong things, teach it here. The app asks for each control in turn, and you press or move it.</p>
      {#if !ctl}
        <p class="lead">{error || 'Looking for controllers…'}</p>
      {:else if !ctl.ports.length}
        <p class="lead"><b>No MIDI controller found.</b> Plug yours in with its USB cable and switch it on. It shows up here by itself.</p>
      {:else}
        <label class="field">
          <span>Controller</span>
          <select class="btn" bind:value={port} onchange={() => { if (!modelTouched) model = guessModel(); }}>
            {#each ctl.ports as p}<option value={p}>{p}</option>{/each}
          </select>
        </label>
        <p class="status">
          {#if current?.learned}Using the mapping you made. Going through it again updates it.
          {:else if current}Using the {current.mapping} mapping. Your answers replace it for this controller.
          {:else}No mapping found for it, so it does nothing yet.{/if}
        </p>
        <label class="field">
          <span>Model</span>
          <input list="setup-models" bind:value={model} oninput={() => (modelTouched = true)} placeholder="e.g. Hercules DJControl Inpulse 200" spellcheck="false" />
          <datalist id="setup-models">{#each models as m}<option value={m}></option>{/each}</datalist>
        </label>
        <p class="hint">About {STEPS.length} steps, a couple of minutes. Skip anything your controller doesn't have. While you do this the controller won't play or change anything.</p>
      {/if}
      {#if error && ctl}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn ghost" onclick={onclose}>Cancel</button>
        <button class="btn primary" onclick={start} disabled={!port}>Start</button>
      </div>
    {:else if stage === 'learn'}
      <svg class="board" viewBox="0 0 600 300" role="img" aria-label="A two-deck controller, with the control to use now highlighted">
        <rect class="body" x="2" y="2" width="596" height="296" rx="18" />
        <rect class="mixer" x="232" y="8" width="136" height="284" rx="10" />
        {#each STEPS as s (s.group + s.key)}
          {@const sh = s.shape}
          <g class="ctl" class:on={isOn(sh)} class:done={done(sh)}>
            {#if sh.t === 'btn'}
              <rect x={sh.x - 11} y={sh.y - 8} width="22" height="16" rx="4" />
            {:else if sh.t === 'pad'}
              <rect x={sh.x} y={sh.y} width="26" height="26" rx="4" />
              <rect x={sh.x} y={sh.y + 30} width="26" height="26" rx="4" class="ghost" />
            {:else if sh.t === 'knob'}
              <circle cx={sh.x} cy={sh.y} r="10" />
            {:else if sh.t === 'jog'}
              <circle cx={sh.x} cy={sh.y} r="76" />
              <circle cx={sh.x} cy={sh.y} r="50" class="ghost" />
            {:else if sh.t === 'vfader'}
              <rect x={sh.x - 3} y={sh.y} width="6" height={sh.h} rx="3" />
              <rect x={sh.x - 9} y={sh.y + (sh.h ?? 0) / 2 - 5} width="18" height="10" rx="2" class="cap" />
            {:else if sh.t === 'hfader'}
              <rect x={sh.x} y={sh.y - 3} width={sh.w} height="6" rx="3" />
              <rect x={sh.x + (sh.w ?? 0) / 2 - 5} y={sh.y - 9} width="10" height="18" rx="2" class="cap" />
            {/if}
          </g>
        {/each}
      </svg>
      <p class="count">{step.section} · Step {index + 1} of {STEPS.length}</p>
      <p class="ask" aria-live="polite">{step.ask}</p>
      <p class="note" class:clash={note.startsWith('That')} class:got={note.startsWith('Got')}>{note || `Listening… ${VERB[step.kind]} it now.`}</p>
      <div class="progress" aria-hidden="true"><div style:width="{(index / STEPS.length) * 100}%"></div></div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn ghost" onclick={back} disabled={index === 0}>Back</button>
        <span class="grow"></span>
        <button class="btn ghost" onclick={finish}>Finish now</button>
        <button class="btn" onclick={skip}>Skip</button>
      </div>
    {:else}
      <p class="lead"><b>{mapped} controls mapped</b> on {port}{mapped < STEPS.length ? `, ${STEPS.length - mapped} skipped` : ''}. It's working now: load a track and press PLAY to try it. You can change single controls in Settings › Controllers.</p>
      <div class="share">
        <p><b>Please share this mapping on GitHub</b> so the next person with a {model || 'controller'} like yours can use it.</p>
        <p class="hint">No GitHub account? Copy the details and paste them wherever you talk to us.</p>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn ghost" onclick={copy}>{copied ? 'Copied' : 'Copy details'}</button>
        <button class="btn" onclick={share}>Share on GitHub…</button>
        <button class="btn primary" onclick={onclose}>Done</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(5 5 6 / 0.72);
    backdrop-filter: blur(6px);
    animation: fade 0.16s ease-out;
  }
  .card {
    width: min(620px, 100%);
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 24px 28px 24px;
    border-radius: 14px;
    background: #121214;
    box-shadow: inset 0 0 0 1px var(--line-2), 0 24px 80px rgb(0 0 0 / 0.5);
    animation: rise 0.2s ease-out;
    outline: none;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px) scale(0.99); }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--fg);
  }
  .close {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg-3);
  }
  .close:hover {
    background: var(--raise);
    color: var(--fg);
  }
  .close svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .lead {
    margin: 0 0 16px;
    color: var(--fg-2);
    line-height: 1.5;
  }
  .lead b,
  .share b {
    color: var(--fg);
    font-weight: 500;
  }
  .field {
    display: grid;
    grid-template-columns: 88px 1fr;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    color: var(--fg-2);
  }
  .field select,
  .field input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    text-align: left;
  }
  .field input {
    height: var(--h-md);
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.3);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--fg);
    font: inherit;
  }
  .field input:focus-visible {
    outline: 2px solid var(--fg-3);
    outline-offset: 1px;
  }
  .status {
    margin: 6px 0 0 100px;
    color: var(--fg-3);
    font-size: var(--t-sm);
  }
  .hint {
    margin: 16px 0 0;
    color: var(--fg-3);
    font-size: var(--t-sm);
    line-height: 1.5;
  }
  .board {
    display: block;
    width: 100%;
    height: auto;
    margin: 4px 0 14px;
  }
  .board .body {
    fill: rgb(255 255 255 / 0.025);
    stroke: var(--line-2);
  }
  .board .mixer {
    fill: rgb(0 0 0 / 0.2);
    stroke: var(--line);
  }
  .ctl {
    fill: rgb(255 255 255 / 0.05);
    stroke: rgb(255 255 255 / 0.18);
    stroke-width: 1.2;
    transition: fill 0.15s ease-out, stroke 0.15s ease-out;
  }
  .ctl .ghost {
    fill: none;
    stroke: rgb(255 255 255 / 0.08);
  }
  .ctl .cap {
    fill: #1d1d21;
  }
  .ctl.done {
    stroke: rgb(56 201 124 / 0.55);
  }
  .ctl.on {
    fill: rgb(232 176 74 / 0.22);
    stroke: var(--cue);
    stroke-width: 2;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .ctl.on .cap {
    fill: var(--cue);
  }
  @keyframes pulse {
    50% { stroke-opacity: 0.45; }
  }
  .count {
    margin: 0;
    color: var(--fg-3);
    font-size: var(--t-sm);
  }
  .ask {
    margin: 4px 0 2px;
    color: var(--fg);
    font-size: var(--t-md);
    font-weight: 500;
    transition: color 0.2s ease-out;
  }
  .note {
    margin: 0;
    min-height: 1.5em;
    color: var(--fg-3);
    font-size: var(--t-sm);
  }
  .note.got {
    color: var(--go);
  }
  .note.clash {
    color: var(--warn);
  }
  .progress {
    height: 3px;
    margin-top: 12px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .progress div {
    height: 100%;
    background: var(--fg-3);
    transition: width 0.2s ease-out;
  }
  .share {
    padding: 14px 16px;
    border-radius: 10px;
    background: var(--raise);
    color: var(--fg-2);
    line-height: 1.5;
  }
  .share p {
    margin: 0;
  }
  .share .hint {
    margin-top: 6px;
  }
  .error {
    margin: 8px 0 0;
    color: var(--kill);
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .grow {
    flex: 1;
  }
  .btn.primary {
    background: var(--fg);
    color: var(--ink);
    box-shadow: none;
  }
  .btn.primary:hover:not(:disabled) {
    background: #fff;
    color: var(--ink);
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .card,
    .ctl.on {
      animation: none;
    }
  }
</style>
