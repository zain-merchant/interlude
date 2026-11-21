// #93 (UI audit flag): the deck light. While the Listening room direction is
// on, each deck's output level (eased, as the site's .glow is) is written to
// --dir-la / --dir-lb on the root, and the backdrop's deck pools swell with
// it (style.css). Nothing runs while the flag is off.
import { flag } from '../registry.svelte.js';
import { engine, onFrame } from '../../lib/engine.svelte.js';

const root = document.documentElement;
let off = null;
const eased = [0, 0];

function frame() {
  for (let i = 0; i < 2; i++) {
    const l = Math.min(1, Math.max(0, engine.deckLevels[i] ?? 0));
    // Rise quickly, fall slowly, like a light warming and cooling.
    const k = l > eased[i] ? 0.25 : 0.04;
    eased[i] += (l - eased[i]) * k;
  }
  root.style.setProperty('--dir-la', eased[0].toFixed(3));
  root.style.setProperty('--dir-lb', eased[1].toFixed(3));
}

$effect.root(() => {
  $effect(() => {
    const on = flag('dir-warm') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (on && !off) off = onFrame(frame);
    if (!on && off) {
      off();
      off = null;
      root.style.removeProperty('--dir-la');
      root.style.removeProperty('--dir-lb');
    }
  });
});
