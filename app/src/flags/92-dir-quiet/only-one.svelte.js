// #92-94 (UI audit flags): the three visual directions are whole-app looks,
// so only one is on at a time. Turning one on turns the other two off.
import { flags } from '../registry.svelte.js';

const DIRECTIONS = ['dir-quiet', 'dir-warm', 'dir-graphic'];
let was = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));

$effect.root(() => {
  $effect(() => {
    const now = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));
    const turned = DIRECTIONS.find((id) => now[id] && !was[id]);
    if (turned) for (const id of DIRECTIONS) if (id !== turned && now[id]) flags.on[id] = false;
    was = Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));
  });
});
