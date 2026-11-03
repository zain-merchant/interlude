// One tooltip for the whole app. After 600 ms of hover, or straight away
// on keyboard focus, it shows a control's name, value and shortcut
// ("Low EQ · −6.0 dB · double-click to reset"). Knobs and faders also use
// it as a live readout while they're dragged.

export const tooltip = $state({ text: '', x: 0, y: 0, below: false, visible: false });

let timer;
let owner = null;

function place(node, text) {
  const r = node.getBoundingClientRect();
  tooltip.text = text;
  tooltip.x = r.left + r.width / 2;
  // Above the control unless there's no room; never over its own value.
  tooltip.below = r.top < 40;
  tooltip.y = tooltip.below ? r.bottom + 8 : r.top - 8;
  tooltip.visible = true;
  owner = node;
}

/** Shows `text` for `node` now (live readouts). */
export function showTip(node, text) {
  clearTimeout(timer);
  place(node, text);
}

export function hideTip(node) {
  clearTimeout(timer);
  if (!node || owner === node) {
    tooltip.visible = false;
    owner = null;
  }
}

/**
 * Svelte action: `use:tip={() => 'Play · W'}`. The function is called each
 * time the tip shows, so values stay current.
 * @param {HTMLElement} node
 * @param {() => string} text
 */
export function tip(node, text) {
  let get = text;
  const enter = () => {
    clearTimeout(timer);
    timer = setTimeout(() => place(node, get()), 600);
  };
  const focus = () => node.matches(':focus-visible') && place(node, get());
  const leave = () => hideTip(node);
  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointerleave', leave);
  node.addEventListener('pointerdown', leave);
  node.addEventListener('focus', focus);
  node.addEventListener('blur', leave);
  return {
    update(next) {
      get = next;
      if (owner === node && tooltip.visible) tooltip.text = get();
    },
    destroy() {
      hideTip(node);
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointerdown', leave);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', leave);
    },
  };
}

/** Joins tooltip parts, skipping empty ones. */
export const tipText = (...parts) => parts.filter(Boolean).join(' · ');
