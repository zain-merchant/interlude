// Tune: a small panel of sliders for settling a few values by eye. Shown
// on localhost or with ?tune in the address; elsewhere every value just
// keeps its default. Values are remembered in this browser.
//
//   tune.slider({ id, label, min, max, step, value, unit, onInput })
//   tune.select({ id, label, options: [[value, label], ...], value, onInput })
//
// Both call onInput straight away with the remembered (or default) value,
// and again as it changes. A slider with `css` instead sets that custom
// property on <html> (with its unit).
(() => {
  const show = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('tune');
  const KEY = 'interlude-tune:';
  const read = (id, v) => {
    try {
      const s = localStorage.getItem(KEY + id);
      return s == null ? v : typeof v === 'number' ? Number(s) : s;
    } catch { return v; }
  };
  const save = (id, v) => { try { localStorage.setItem(KEY + id, String(v)); } catch {} };
  const rows = [];
  let panel = null;

  // Its own styles, so it never depends on a cached stylesheet.
  const CSS = `.tune {
  position: fixed; z-index: 100; right: 16px; bottom: 16px; width: 280px; max-height: calc(100vh - 32px); overflow: auto;
  padding: 10px 14px 12px; border-radius: 14px; font: 12px/1.3 var(--sans, system-ui); color: var(--fg-2);
  background: rgb(20 20 24 / 0.9); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.09), 0 16px 40px rgb(0 0 0 / 0.5);
}
.tune summary { cursor: pointer; font-weight: 600; color: var(--fg); list-style: none; }
.tune summary::-webkit-details-marker { display: none; }
.tune:not([open]) { width: auto; }
.tune__rows { display: grid; gap: 10px; margin-top: 10px; }
.tune__row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; }
.tune__row output { color: var(--fg); font-variant-numeric: tabular-nums; }
.tune__row input, .tune__row select { grid-column: 1 / -1; width: 100%; accent-color: #ff9b45; }
.tune__row select { padding: 4px 6px; border-radius: 6px; color: var(--fg); background: rgb(255 255 255 / 0.06); border: 1px solid var(--line-2); }
.tune__reset { margin-top: 12px; padding: 4px 10px; border-radius: 6px; font: inherit; color: var(--fg-2); background: rgb(255 255 255 / 0.06); border: 0; cursor: pointer; }
.tune__reset:hover { color: var(--fg); }`;
  function mount() {
    if (!show || panel) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    panel = document.createElement('details');
    panel.className = 'tune';
    panel.open = read('open', '1') === '1';
    panel.innerHTML = '<summary>Tune</summary><div class="tune__rows"></div><button type="button" class="tune__reset">Reset all</button>';
    panel.addEventListener('toggle', () => save('open', panel.open ? '1' : '0'));
    panel.querySelector('.tune__reset').addEventListener('click', () => rows.forEach((r) => r.reset()));
    document.body.append(panel);
    rows.forEach((r) => panel.querySelector('.tune__rows').append(r.el));
  }

  function add(row) {
    rows.push(row);
    if (panel) panel.querySelector('.tune__rows').append(row.el);
    else if (document.body) mount();
  }

  function slider({ id, label, min, max, step = 1, value, unit = '', css, onInput }) {
    const apply = (v) => {
      if (css) document.documentElement.style.setProperty(css, v + unit);
      onInput?.(v);
    };
    let v = read(id, value);
    apply(v);
    if (!show) return;
    const el = document.createElement('label');
    el.className = 'tune__row';
    el.innerHTML = `<span>${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
    const input = el.querySelector('input');
    const out = el.querySelector('output');
    const set = (n) => { v = n; input.value = n; out.textContent = `${+Number(n).toFixed(3)}${unit}`; apply(n); save(id, n); };
    input.value = v;
    out.textContent = `${+Number(v).toFixed(3)}${unit}`;
    input.addEventListener('input', () => set(Number(input.value)));
    add({ el, reset: () => set(value) });
  }

  function select({ id, label, options, value, onInput }) {
    let v = read(id, value);
    if (!options.some(([o]) => o === v)) v = value;
    onInput?.(v);
    if (!show) return;
    const el = document.createElement('label');
    el.className = 'tune__row';
    el.innerHTML = `<span>${label}</span><select>${options.map(([o, t]) => `<option value="${o}">${t}</option>`).join('')}</select>`;
    const s = el.querySelector('select');
    const set = (n) => { v = n; s.value = n; onInput?.(n); save(id, n); };
    s.value = v;
    s.addEventListener('change', () => set(s.value));
    add({ el, reset: () => set(value) });
  }

  window.tune = { slider, select, shown: show };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
})();
