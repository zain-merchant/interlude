// #110 (UI audit flag): the track list's columns, dragged to size and to order.
//
// Size. There's no line between the columns, so the handles stay out of sight
// until the pointer is over the heading row: then a short etched rule stands
// at each boundary, and the one under the pointer brightens. Each handle is
// 10px wide, lies over the boundary and is no part of a heading, so dragging
// one never sorts. Keys: ← → 8px (⇧ 32px), Home the least, Enter to fit, ⌫ to
// put back. Double-click fits. Right-click fits or resets.
//
// Order. A heading dragged 6px or more moves: a bright rule shows where it
// would land, Esc puts it back, and the click that ends the drag doesn't
// sort. ⌥← and ⌥→ move the heading that's focused.
//
// Library.svelte reads each width from --col-<column> on .main; these are set
// inline there, over #80's. minmax(), so a narrow window still shrinks them.
import { openMenu } from '../../lib/menu.svelte.js';
import { announce } from '../../lib/announce.svelte.js';
import { moveColumn } from './column-order.svelte.js';

const KEY = 'interlude.columnWidths';
const MIN = /** @type {Record<string, number>} */ ({ title: 120, artist: 88, album: 72, genre: 64, bpm: 52, key: 72, time: 52, folder: 72 });

/** @type {Record<string, number>} */
let widths = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
})();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {}
};
const scale = () => Number(document.documentElement.style.zoom) || 1;
const widthOf = (/** @type {Element} */ el) => el.getBoundingClientRect().width / scale();
/** @type {Set<HTMLElement>} */
const mains = new Set();
const put = (/** @type {string} */ by, /** @type {number | undefined} */ w) => {
  for (const m of mains) {
    if (w) m.style.setProperty(`--col-${by}`, `minmax(${MIN[by] ?? 64}px, ${Math.round(w)}px)`);
    else m.style.removeProperty(`--col-${by}`);
  }
};
/** Puts every column back to the width it comes with. */
export function resetWidths() {
  for (const by of Object.keys(widths)) put(by, undefined);
  widths = {};
  save();
}

/**
 * @param {HTMLElement} head the heading row
 * @param {{ on: boolean, columns: { by: any, label: string }[], all: { by: any, label: string }[] }} opts
 */
export function colResize(head, opts) {
  const main = /** @type {HTMLElement} */ (head.parentElement);
  mains.add(main);
  let o = opts;
  /** @type {{ by: string, label: string, cell: HTMLElement, left: HTMLElement, sign: number, el: HTMLElement }[]} */
  let handles = [];
  const cells = () => /** @type {HTMLElement[]} */ ([...head.querySelectorAll(':scope > .sort')]);
  // Folder takes whatever is left, so what a column may grow by is what Folder can give up.
  const most = (/** @type {HTMLElement} */ cell) => {
    const i = o.columns.findIndex((c) => c.by === 'folder');
    const flex = i >= 0 ? cells()[i] : null;
    if (flex) return widthOf(cell) + Math.max(0, widthOf(flex) - MIN.folder);
    const used = [...head.children].reduce((n, c) => n + (c.classList.contains('colh') ? 0 : widthOf(c)), 0);
    return widthOf(cell) + Math.max(0, head.clientWidth - used);
  };
  /** @typedef {typeof handles[number]} H */
  const resize = (/** @type {H} */ h, /** @type {number} */ w, /** @type {number} */ max) => {
    widths[h.by] = Math.round(Math.max(MIN[h.by] ?? 64, Math.min(max, w)));
    put(h.by, widths[h.by]);
    h.el.setAttribute('aria-valuenow', String(widths[h.by]));
  };
  /** As wide as its heading and the longest of the rows drawn. */
  const fit = (/** @type {H} */ h) => {
    let w = 0;
    const range = document.createRange();
    for (const cell of [h.cell, ...main.querySelectorAll(`.scroll .row > [data-col='${h.by}']`)]) {
      range.selectNodeContents(cell);
      const c = getComputedStyle(cell);
      w = Math.max(w, range.getBoundingClientRect().width / scale() + parseFloat(c.paddingLeft) + parseFloat(c.paddingRight));
    }
    resize(h, Math.ceil(w) + 2, most(h.cell));
    save();
  };
  const lay = () => {
    const x0 = head.getBoundingClientRect().left;
    for (const h of handles) {
      h.el.style.left = `${(h.left.getBoundingClientRect().right - x0) / scale()}px`;
      h.el.setAttribute('aria-valuenow', String(Math.round(widthOf(h.cell))));
    }
  };
  const seen = new ResizeObserver(lay);

  function wire(/** @type {H} */ h) {
    let from = 0;
    let start = 0;
    let max = 0;
    /** @type {number | undefined} */
    let before;
    let moving = false;
    h.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      h.el.setPointerCapture(e.pointerId);
      h.el.focus({ preventScroll: true });
      from = e.clientX;
      start = widthOf(h.cell);
      max = most(h.cell);
      before = widths[h.by];
      moving = true;
      h.el.classList.add('moving');
    });
    h.el.addEventListener('pointermove', (e) => {
      if (moving && (Math.abs(e.clientX - from) > 1 || widths[h.by] !== before)) resize(h, start + (h.sign * (e.clientX - from)) / scale(), max);
    });
    const end = () => {
      if (!moving) return;
      moving = false;
      h.el.classList.remove('moving');
      save();
    };
    h.el.addEventListener('pointerup', end);
    h.el.addEventListener('pointercancel', end);
    h.el.addEventListener('click', (e) => e.stopPropagation());
    h.el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      fit(h);
    });
    h.el.addEventListener('contextmenu', (e) => {
      openMenu(e, [
        { label: `Fit ${h.label} to its contents`, action: () => fit(h) },
        { label: 'Reset column widths', action: resetWidths, enabled: Object.keys(widths).length > 0 },
      ]);
    });
    h.el.addEventListener('keydown', (e) => {
      const step = (e.shiftKey ? 32 : 8) * h.sign;
      if (e.key === 'Escape' && moving) {
        moving = false;
        h.el.classList.remove('moving');
        if (before) widths[h.by] = before;
        else delete widths[h.by];
        put(h.by, before);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') resize(h, widthOf(h.cell) + (e.key === 'ArrowLeft' ? -step : step), most(h.cell));
      else if (e.key === 'Home') resize(h, 0, most(h.cell));
      else if (e.key === 'Enter') fit(h);
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        delete widths[h.by];
        put(h.by, undefined);
      } else return;
      e.preventDefault();
      e.stopPropagation();
      save();
    });
  }

  // ── Order ──
  const mark = document.createElement('div');
  mark.className = 'colins';
  /** @type {{ by: string, x: number, id: number, cell: HTMLElement, target: string, after: boolean, on: boolean } | null} */
  let lift = null;
  /** @param {PointerEvent} e */
  const down = (e) => {
    const cell = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest?.('.sort'));
    if (!o.on || e.button !== 0 || !cell) return;
    const c = o.columns[cells().indexOf(cell)];
    if (c) lift = { by: c.by, x: e.clientX, id: e.pointerId, cell, target: c.by, after: false, on: false };
  };
  /** @param {PointerEvent} e */
  const move = (e) => {
    if (!lift || e.pointerId !== lift.id) return;
    if (!lift.on) {
      if (Math.abs(e.clientX - lift.x) < 6) return;
      lift.on = true;
      lift.cell.setPointerCapture(lift.id);
      lift.cell.classList.add('lifted');
      head.classList.add('lifting');
      head.append(mark);
    }
    const x0 = head.getBoundingClientRect().left;
    const cs = cells();
    let at = cs.length - 1;
    let after = true;
    for (const [i, c] of cs.entries()) {
      const r = c.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        at = i;
        after = false;
        break;
      }
    }
    lift.target = o.columns[at].by;
    lift.after = after;
    const r = cs[at].getBoundingClientRect();
    const me = cs.indexOf(lift.cell);
    const stays = (after && at === me) || (!after && (at === me || at === me + 1));
    mark.style.left = `${((after ? r.right : r.left) - x0) / scale()}px`;
    mark.classList.toggle('stays', stays);
  };
  const drop = (/** @type {boolean} */ keep) => {
    if (!lift) return;
    const l = lift;
    lift = null;
    if (!l.on) return;
    l.cell.classList.remove('lifted');
    head.classList.remove('lifting');
    mark.remove();
    // The click this drag ends with isn't a sort.
    const eat = (/** @type {Event} */ e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    head.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => head.removeEventListener('click', eat, { capture: true }), 60);
    if (keep && l.target !== l.by) {
      moveColumn(o.all, l.by, l.target, l.after);
      announce(`${o.all.find((c) => c.by === l.by)?.label} column moved`);
    }
  };
  const up = () => drop(true);
  const cancel = () => drop(false);
  /** @param {KeyboardEvent} e */
  const esc = (e) => {
    if (e.key !== 'Escape' || !lift?.on) return;
    e.preventDefault();
    e.stopPropagation();
    drop(false);
  };
  /** @param {KeyboardEvent} e */
  const key = (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest?.('.sort');
    if (!o.on || !cell || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const i = cells().indexOf(/** @type {HTMLElement} */ (cell));
    const j = i + (e.key === 'ArrowRight' ? 1 : -1);
    if (!o.columns[j]) return;
    const by = o.columns[i].by;
    moveColumn(o.all, by, o.columns[j].by, j > i);
    announce(`${o.columns[i].label}, ${j + 1} of ${o.columns.length}`);
    requestAnimationFrame(() => cells()[j]?.focus());
  };
  head.addEventListener('pointerdown', down);
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', cancel);
  head.addEventListener('keydown', key);
  window.addEventListener('keydown', esc, true);

  function build(/** @type {typeof opts} */ next) {
    o = next;
    seen.disconnect();
    for (const h of handles) h.el.remove();
    handles = [];
    if (!o.on) {
      for (const by of Object.keys(widths)) put(by, undefined);
      return;
    }
    const cs = cells();
    for (const by of Object.keys(widths)) put(by, by === 'folder' ? undefined : widths[by]);
    o.columns.slice(0, -1).forEach((c, i) => {
      // Beside Folder (which takes what's left) the boundary belongs to the column after it.
      const own = c.by === 'folder' ? i + 1 : i;
      const cell = cs[own];
      if (!cell || !cs[i]) return;
      const el = document.createElement('div');
      el.className = 'colh';
      el.tabIndex = 0;
      el.setAttribute('role', 'separator');
      el.setAttribute('aria-orientation', 'vertical');
      el.setAttribute('aria-label', `Resize the ${o.columns[own].label} column`);
      el.setAttribute('aria-valuemin', String(MIN[o.columns[own].by] ?? 64));
      const h = { by: o.columns[own].by, label: o.columns[own].label, cell, left: cs[i], sign: own === i ? 1 : -1, el };
      handles.push(h);
      wire(h);
      head.append(el);
    });
    for (const c of cs) seen.observe(c);
    seen.observe(head);
    lay();
  }
  build(opts);
  return {
    // The headings are redrawn after this runs.
    update: (/** @type {typeof opts} */ next) => requestAnimationFrame(() => build(next)),
    destroy() {
      mains.delete(main);
      seen.disconnect();
      window.removeEventListener('keydown', esc, true);
      for (const h of handles) h.el.remove();
    },
  };
}
