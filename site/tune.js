// Tune: DialKit panels (vendor/dialkit, MIT) for settling a few values by
// eye. Shown on localhost or with ?tune in the address; elsewhere every
// value keeps its default and DialKit isn't loaded at all.
//
//   tune.slider({ label, min, max, step, value, unit, css, onInput })
//   tune.select({ label, options: [[value, label], ...], value, onInput })
//   tune.color({ label, value: '#rrggbb', onInput })   (DialKit's own picker;
//     it may hand back other CSS colour forms if its format is switched)
//
// A label "Group: name" puts the control in that group's panel. onInput
// gets the default straight away, then whatever the panel holds (DialKit
// remembers what was last set here), and again as it changes. A slider
// with `css` also sets that custom property on <html> (with its unit).
//
// Optional, for panels that change with what's picked in them:
//   folder: 'Name'     shows the control in a folder of the group's panel
//                      (a value saved before it was in one still loads)
//   show: () => bool   the control is only in the panel while this is true;
//                      its value is kept meanwhile and comes back with it
//   options: () => [...]  (selects) the options worked out afresh each time
//                      the panel is rebuilt; keep the same values, relabel
//   tune.refresh('Group')  rebuilds that group's panel (call it when
//                      whatever `show` or `options` read has changed)
(() => {
  const show = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('tune');
  const base = document.currentScript?.src ? new URL('.', document.currentScript.src).href : './';
  const groups = new Map();
  let queued = false;
  let lib = null;
  let root = null;

  if (show) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${base}vendor/dialkit/styles.css?v=2`;
    document.head.append(css);
    lib = new Promise((done, fail) => {
      const s = document.createElement('script');
      s.src = `${base}vendor/dialkit/browser.global.js?v=2`;
      s.onload = () => (window.DialKit ? done(window.DialKit) : fail());
      s.onerror = fail;
      document.head.append(s);
    });
  }

  function add(label, def) {
    const i = label.indexOf(':');
    const group = i > 0 ? label.slice(0, i).trim() : 'Tune';
    const name = i > 0 ? label.slice(i + 1).trim() : label;
    if (!groups.has(group)) groups.set(group, { list: [], made: false });
    const path = def.folder ? `${def.folder}.${name}` : name;
    groups.get(group).list.push({ name, path, ...def });
    if (!queued) {
      queued = true;
      // Controls registered in one go of a script share a panel.
      setTimeout(flush, 0);
    }
  }

  // Where DialKit keeps a panel's values, and where the values of controls
  // hidden for now are kept (DialKit only saves what's in the panel).
  const keyOf = (group) => `dialkit:interlude-${group}`;
  const stashOf = (group) => `tune-hidden:interlude-${group}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const at = (v, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), v);
  const visible = (c) => !c.show || c.show();

  // The panel's config: the controls showing now, in folders where asked.
  function configOf(g) {
    const config = {};
    for (const c of g.list) {
      if (!visible(c)) continue;
      const cfg = typeof c.config === 'function' ? c.config() : c.config;
      if (c.folder) (config[c.folder] ??= {})[c.name] = cfg;
      else config[c.name] = cfg;
    }
    return config;
  }

  function make(DK, group, g) {
    const saved = read(keyOf(group));
    const stash = read(stashOf(group)) || {};
    // A value saved under the control's plain name (before it moved into a
    // folder), or put by while it was hidden, is put back where DialKit
    // will find it.
    if (saved?.version === 1 && saved.values) {
      let moved = false;
      for (const c of g.list) {
        if (saved.values[c.path] !== undefined) continue;
        const v = stash[c.path] ?? (c.path !== c.name ? saved.values[c.name] : undefined);
        if (v !== undefined) { saved.values[c.path] = v; moved = true; }
      }
      if (moved) write(keyOf(group), saved);
    }
    const shownNow = new Set();
    for (const c of g.list) if (visible(c)) shownNow.add(c);
    // Hidden from the start: its last value still applies, and is kept.
    for (const c of g.list) {
      if (shownNow.has(c)) continue;
      const v = stash[c.path] ?? saved?.values?.[c.path];
      if (v !== undefined) { stash[c.path] = v; c.apply(v); }
    }
    write(stashOf(group), stash);
    g.shown = shownNow;
    g.stash = stash;
    const kit = DK.createDialKit(group, configOf(g), { id: `interlude-${group}`, persist: true });
    g.kit = kit;
    const last = {};
    g.last = last;
    kit.subscribe((v) => {
      for (const c of g.list) {
        const x = at(v, c.path);
        if (x === undefined || x === last[c.path]) continue;
        last[c.path] = x;
        c.apply(x);
      }
    });
  }

  function rebuild(group) {
    const g = groups.get(group);
    if (!g?.kit) return;
    const back = [];
    const now = new Set();
    for (const c of g.list) {
      const on = visible(c);
      if (on) now.add(c);
      const was = g.shown.has(c);
      if (was && !on && g.last[c.path] !== undefined) g.stash[c.path] = g.last[c.path];
      if (!was && on && g.stash[c.path] !== undefined) { back.push([c.path, g.stash[c.path]]); delete g.stash[c.path]; }
    }
    g.shown = now;
    write(stashOf(group), g.stash);
    g.kit.updateConfig(configOf(g));
    for (const [path, v] of back) g.kit.setValue(path, v);
  }

  const pending = new Set();
  function refresh(group) {
    if (!show) return;
    pending.add(group);
    // After the panel's own update has settled (this is often called from
    // one of its controls).
    setTimeout(() => {
      for (const gname of pending) rebuild(gname);
      pending.clear();
    }, 0);
  }

  async function flush() {
    queued = false;
    const DK = await lib.catch(() => null);
    if (!DK) return;
    const start = () => {
      root ??= DK.createDialRoot({ position: 'bottom-right', theme: 'dark', defaultOpen: false });
      for (const [group, g] of groups) {
        if (g.made) continue;
        g.made = true;
        make(DK, group, g);
      }
    };
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  }

  function slider({ label, min, max, step = 1, value, unit = '', css, onInput, folder, show: when }) {
    const apply = (v) => {
      if (css) document.documentElement.style.setProperty(css, v + unit);
      onInput?.(v);
    };
    apply(value);
    if (show) add(unit ? `${label} (${unit})` : label, { apply, config: [value, min, max, step], folder, show: when });
  }

  function select({ label, options, value, onInput, folder, show: when }) {
    onInput?.(value);
    const list = () => (typeof options === 'function' ? options() : options).map(([v, t]) => ({ value: v, label: t }));
    if (show) add(label, { apply: (v) => onInput?.(v), config: typeof options === 'function' ? () => ({ type: 'select', options: list(), default: value }) : { type: 'select', options: list(), default: value }, folder, show: when });
  }

  function color({ label, value, onInput, folder, show: when }) {
    onInput?.(value);
    if (show) add(label, { apply: (v) => onInput?.(v), config: { type: 'color', default: value }, folder, show: when });
  }

  window.tune = { slider, select, color, refresh, shown: show };
})();
