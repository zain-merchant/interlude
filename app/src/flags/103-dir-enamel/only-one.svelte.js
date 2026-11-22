// #103 (UI audit flag), copied from #100 so this direction can ship alone: directions are whole-app looks, so only one is on at a
// time. Whenever a flag in the Direction group turns on, every other flag in
// that group turns off. Keyed on the group rather than a list of ids, so it
// covers directions added later too. It only ever acts on a flag turning on,
// so with every direction off it does nothing.
import { FLAGS, flags } from '../registry.svelte.js';

const ids = FLAGS.filter((f) => f.group === 'Direction').map((f) => f.id);
let was = Object.fromEntries(ids.map((id) => [id, !!flags.on[id]]));

$effect.root(() => {
  $effect(() => {
    const now = Object.fromEntries(ids.map((id) => [id, !!flags.on[id]]));
    const turned = ids.find((id) => now[id] && !was[id]);
    if (turned) for (const id of ids) if (id !== turned && now[id]) flags.on[id] = false;
    was = Object.fromEntries(ids.map((id) => [id, !!flags.on[id]]));
  });
});
