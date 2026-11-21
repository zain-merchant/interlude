// #97, #98 (UI audit flags): a visual direction is a whole-app look, so only
// one is on at a time. Turning any flag in the Direction group on turns the
// others in that group off (92's only-one covers 92-94 alone).
import { FLAGS, flags } from '../registry.svelte.js';

const DIRECTIONS = FLAGS.filter((f) => f.group === 'Direction').map((f) => f.id);
const read = () => Object.fromEntries(DIRECTIONS.map((id) => [id, !!flags.on[id]]));
let was = read();

$effect.root(() => {
  $effect(() => {
    const now = read();
    const turned = DIRECTIONS.find((id) => now[id] && !was[id]);
    if (turned) for (const id of DIRECTIONS) if (id !== turned && now[id]) flags.on[id] = false;
    was = read();
  });
});
