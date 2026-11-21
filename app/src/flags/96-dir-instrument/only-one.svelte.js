// #95, #96 (UI audit flags; visual directions): only one direction is on at
// a time. Every flag in the "Direction" group is a whole-app look, so turning
// one on turns every other one off. It reads the group from the registry, so
// directions added later are covered without editing this list.
import { FLAGS, flags } from '../registry.svelte.js';

const DIRECTIONS = FLAGS.filter((f) => f.group === 'Direction').map((f) => f.id);
let was = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));

$effect.root(() => {
  $effect(() => {
    const now = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));
    const turned = DIRECTIONS.find((id) => now[id] && !was[id]);
    if (turned) for (const id of DIRECTIONS) if (id !== turned && now[id]) flags.on[id] = false;
    was = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));
  });
});
