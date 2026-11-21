// Prototype only: mounts the record tuning panel, follows the variant
// switcher, and loads two demo tracks so the platters have something to play.
import { mount } from 'svelte';
import './switcher.js';
import PlatterDials from './PlatterDials.svelte';
import { platter } from './platter.svelte.js';
import { backend } from '../lib/backend.js';
import { loadTrack, control, engine } from '../lib/engine.svelte.js';

mount(PlatterDials, { target: document.body });

// The switcher shows one empty section per style; whichever is visible is
// the style the decks draw.
const sections = [...document.querySelectorAll('prototype-switcher > section')];
setInterval(() => {
  const on = sections.find((s) => s.checkVisibility?.() ?? s.offsetParent !== null);
  if (on && platter.style !== on.dataset.style) platter.style = on.dataset.style;
}, 150);

(async () => {
  try {
    const all = await backend.libraryTracks();
    const pick = (title) => all.find((t) => t.title === title) ?? all[0];
    await loadTrack(0, pick('Afterglow'));
    await loadTrack(1, pick('Glass Rooms'));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(300);
    control({ type: 'seek', deck: 0, seconds: 96 });
    control({ type: 'play', deck: 0 });
    control({ type: 'seek', deck: 1, seconds: 21 });
    control({ type: 'setCue', deck: 1, seconds: 21 });
    for (const [deck, secs] of [[0, [28, 76, 165]], [1, [21, 69, 169]]]) {
      for (const [i, s] of secs.entries()) {
        control({ type: 'seek', deck, seconds: s });
        control({ type: 'hotCuePress', deck, index: i });
        control({ type: 'hotCueRelease', deck, index: i });
      }
    }
    control({ type: 'seek', deck: 0, seconds: 103 });
    control({ type: 'seek', deck: 1, seconds: 21 });
    if (!engine.decks[0].playing) control({ type: 'play', deck: 0 });
  } catch (e) {
    console.error(e);
  }
})();
