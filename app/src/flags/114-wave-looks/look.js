// #114 (UI audit flag): wave-looks' look as one string for the renderer's
// view, '' for the app's own drawing. One string, so the renderer can compare
// it frame to frame and the frame loop redraws when a slider moves.
import { flag, setting, FLAGS } from '../registry.svelte.js';
import { lookOf, DEFAULT } from './looks.js';

const ID = 'wave-looks';
/** The look that shows: the flag's pick while it's on, else Direction 110's, else the app's own. */
export const lookNow = () => lookOf(flag(ID) ? setting(ID, 'pick') : flag('dir-room-tint') ? DEFAULT : 'today');

export function lookString() {
  const l = lookNow();
  if (!l.draw) return '';
  // With the flag off, 110's look has its defaults, whatever was tuned.
  const on = flag(ID);
  const set = FLAGS.find((f) => f.id === ID)?.settings;
  const at = (k) => (on ? setting(ID, k) : set?.[k].default);
  const o = { id: l.id, draw: l.draw, lines: at('beats'), chip: at('chip') };
  for (const k in l.values) o[k] = Number((on ? setting(ID, `${l.id}-${k}`) : null) ?? l.values[k]);
  return JSON.stringify(o);
}
