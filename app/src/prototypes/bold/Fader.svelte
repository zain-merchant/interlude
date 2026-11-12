<script>
  // A fader for the prototypes. `look` picks the cap and slot styling.
  /** @type {{ value?: number, vertical?: boolean, look?: 'machined'|'glow'|'object', color?: string, label?: string }} */
  let { value = $bindable(0.75), vertical = true, look = 'machined', color = '#ececea', label = '' } = $props();
  let el, dragging = false;
  const down = (e) => { dragging = true; el.setPointerCapture(e.pointerId); move(e); };
  const move = (e) => {
    if (!dragging) return;
    const r = el.getBoundingClientRect();
    value = Math.min(1, Math.max(0, vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width));
  };
</script>

<div bind:this={el} class="fader {look}" class:vertical role="slider" tabindex="0" aria-label={label} aria-valuenow={value}
  style:--v={value} style:--c={color}
  onpointerdown={down} onpointermove={move} onpointerup={() => (dragging = false)}>
  <div class="slot"><div class="fill"></div></div>
  {#each [0, 0.25, 0.5, 0.75, 1] as m}<i class="mark" style:--m={m}></i>{/each}
  <div class="cap"></div>
</div>

<style>
  .fader { position: relative; touch-action: none; cursor: pointer; height: 28px; width: 100%; }
  .fader.vertical { width: 28px; height: 100%; }
  .slot { position: absolute; background: #070708; border-radius: 3px; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgb(255 255 255 / 0.05); overflow: hidden; }
  .vertical .slot { left: 50%; width: 4px; margin-left: -2px; top: 6px; bottom: 6px; }
  .fader:not(.vertical) .slot { top: 50%; height: 4px; margin-top: -2px; left: 8px; right: 8px; }
  .fill { position: absolute; background: var(--c); opacity: 0; }
  .vertical .fill { left: 0; right: 0; bottom: 0; height: calc(var(--v) * 100%); }
  .mark { position: absolute; background: rgb(255 255 255 / 0.14); }
  .vertical .mark { left: 50%; width: 14px; height: 1px; margin-left: -7px; bottom: calc(6px + var(--m) * (100% - 12px)); }
  .fader:not(.vertical) .mark { top: 50%; height: 12px; width: 1px; margin-top: -6px; left: calc(8px + var(--m) * (100% - 16px)); }
  .vertical .mark { transform: translateX(13px); width: 5px; margin-left: -2.5px; }
  .cap { position: absolute; }
  .vertical .cap { left: 50%; width: 26px; height: 12px; margin-left: -13px; bottom: calc(var(--v) * (100% - 12px)); }
  .fader:not(.vertical) .cap { top: 50%; width: 12px; height: 26px; margin-top: -13px; left: calc(var(--v) * (100% - 12px)); }

  .machined .cap { border-radius: 2px; background: linear-gradient(180deg, #404147, #2a2b30); box-shadow: 0 0 0 1px #08080a, 0 3px 5px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.1); }
  .machined .cap::after { content: ''; position: absolute; background: #f4f3ee; }
  .vertical.machined .cap::after { left: 4px; right: 4px; top: 50%; height: 2px; margin-top: -1px; }
  .fader:not(.vertical).machined .cap::after { top: 4px; bottom: 4px; left: 50%; width: 2px; margin-left: -1px; }

  .glow .slot { width: 3px; }
  .glow .fill { opacity: 0.9; box-shadow: 0 0 8px var(--c); }
  .glow .cap { border-radius: 4px; background: linear-gradient(180deg, #fbfbf9, #cfcfd4); box-shadow: 0 3px 8px rgb(0 0 0 / 0.7), inset 0 -2px 0 rgb(0 0 0 / 0.18), 0 0 12px color-mix(in srgb, var(--c) 35%, transparent); }

  .object .slot { width: 6px; margin-left: -3px; border-radius: 1px; }
  .object .cap { border-radius: 1px; background: var(--c); box-shadow: 0 2px 0 rgb(0 0 0 / 0.5); }
  .vertical.object .cap { width: 22px; margin-left: -11px; height: 16px; }
</style>
