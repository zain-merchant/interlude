// #110 (UI audit flag): the order of the track list's columns, kept.
const KEY = 'interlude.columnOrder';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** `by`: the columns moved so far, in order; a column it doesn't name keeps its usual place among the rest. */
export const colOrder = $state({ by: /** @type {string[]} */ (load()) });

/**
 * @template {{ by: string | null }} C
 * @param {C[]} columns every column in its usual order
 * @param {string[]} [by]
 * @returns {C[]}
 */
export function arrange(columns, by = colOrder.by) {
  if (!by.length) return columns;
  const at = (/** @type {C} */ c) => by.indexOf(String(c.by));
  const known = columns.filter((c) => at(c) >= 0).sort((a, b) => at(a) - at(b));
  // A column that isn't in the kept order goes after the one before it.
  columns.forEach((c, i) => {
    if (at(c) < 0) known.splice(i ? known.indexOf(columns[i - 1]) + 1 : 0, 0, c);
  });
  return known;
}

/** @param {string[]} by */
export function setOrder(by) {
  colOrder.by = by;
  try {
    if (by.length) localStorage.setItem(KEY, JSON.stringify(by));
    else localStorage.removeItem(KEY);
  } catch {}
}

/**
 * Moves one column so it stands before (or, `after`, after) another.
 * @param {{ by: string | null }[]} columns @param {string} by @param {string} target @param {boolean} after
 */
export function moveColumn(columns, by, target, after) {
  if (by === target) return;
  const list = arrange(columns).map((c) => String(c.by));
  list.splice(list.indexOf(by), 1);
  list.splice(list.indexOf(target) + (after ? 1 : 0), 0, by);
  setOrder(list);
}
