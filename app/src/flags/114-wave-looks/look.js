// #114 (UI audit flag): wave-looks' current look as one string for the
// renderer's view ('' while it's off or set to Today). One string, so the
// renderer can compare it frame to frame and the frame loop redraws when a
// slider moves.
import { flag, setting } from '../registry.svelte.js';
import { lookOf } from './looks.js';

export function lookString() {
  if (!flag('wave-looks')) return '';
  const l = lookOf(setting('wave-looks', 'look'));
  if (!l.draw) return '';
  const o = { id: l.id, draw: l.draw };
  for (const k in l.values) o[k] = Number(setting('wave-looks', `${l.id}-${k}`) ?? l.values[k]);
  return JSON.stringify(o);
}
