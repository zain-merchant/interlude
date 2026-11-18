// Tune: DialKit panels (vendor/dialkit, MIT) for settling a few values by
// eye. Shown on localhost or with ?tune in the address; elsewhere every
// value keeps its default and DialKit isn't loaded at all.
//
//   tune.slider({ label, min, max, step, value, unit, css, onInput })
//   tune.select({ label, options: [[value, label], ...], value, onInput })
//   tune.color({ label, value: '#rrggbb', onInput })   (DialKit's own picker;
//     it may hand back other CSS colour forms if its format is switched)
//   tune.spring({ label, value: { visualDuration, bounce }, onInput })
//   tune.easing({ label, value: { duration, ease: [x1, y1, x2, y2] }, onInput })
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
//   tune.set(label, value)  moves a control as if by hand (its onInput
//                      runs, the panel shows it); one hidden for now keeps
//                      the value for when it shows. label as registered
//                      (a slider's without its unit).
(() => {
  const show = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('tune');
  const base = document.currentScript?.src ? new URL('.', document.currentScript.src).href : './';
  const groups = new Map();
  // The groups' order in the panel: the page's, top to bottom.
  const ORDER = ['Nav', 'Hero', 'Hero record', 'Features', 'Footer'];
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
      s.src = `${base}vendor/dialkit/browser.global.js?v=3`;
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

  // Saved versions (DialKit's presets) and the panel's base values hold
  // only the controls in the panel too: what they held for a control while
  // it's hidden is put by here (stash.__p by version, stash.__b), and put
  // back when it shows again.
  function putBy(stash, presets, base, paths) {
    for (const p of presets || []) {
      for (const path of paths) {
        if (p.values?.[path] === undefined) continue;
        ((stash.__p ??= {})[p.id] ??= {})[path] = p.values[path];
      }
    }
    for (const path of paths) if (base?.[path] !== undefined) (stash.__b ??= {})[path] = base[path];
  }
  function putBack(DK, id, stash, paths) {
    try {
      const st = DK.DialStore;
      for (const p of st.presets.get(id) || []) {
        for (const path of paths) {
          const v = stash.__p?.[p.id]?.[path];
          if (v !== undefined) { p.values[path] = v; delete stash.__p[p.id][path]; }
        }
      }
      const base = st.baseValues.get(id);
      for (const path of paths) {
        if (stash.__b?.[path] === undefined) continue;
        if (base) base[path] = stash.__b[path];
        delete stash.__b[path];
      }
      st.persistPanel(id);
    } catch {}
  }

  function make(DK, group, g) {
    const id = `interlude-${group}`;
    const saved = read(keyOf(group));
    const stash = read(stashOf(group)) || {};
    const shownNow = new Set();
    for (const c of g.list) if (visible(c)) shownNow.add(c);
    if (saved?.version === 1 && saved.values) {
      // A value saved under the control's plain name (before it moved into
      // a folder) is moved to where DialKit will now look for it, in the
      // panel's values, its base values and every saved version.
      const sets = [saved.values, saved.baseValues, ...(saved.presets || []).map((p) => p.values)].filter(Boolean);
      for (const c of g.list) {
        if (c.path === c.name) continue;
        for (const vs of sets) if (vs[c.path] === undefined && vs[c.name] !== undefined) vs[c.path] = vs[c.name];
      }
      // One showing now that was put by while hidden comes back.
      for (const c of shownNow) if (saved.values[c.path] === undefined && stash[c.path] !== undefined) saved.values[c.path] = stash[c.path];
      // Hidden from the start: what the versions hold for it is put by.
      putBy(stash, saved.presets, saved.baseValues, g.list.filter((c) => !shownNow.has(c)).map((c) => c.path));
      write(keyOf(group), saved);
    }
    // Hidden from the start: its last value still applies, and is kept.
    for (const c of g.list) {
      if (shownNow.has(c)) { delete stash[c.path]; continue; }
      const v = saved?.values?.[c.path] ?? stash[c.path];
      if (v !== undefined) { stash[c.path] = v; c.apply(v); }
    }
    g.shown = shownNow;
    g.stash = stash;
    const kit = DK.createDialKit(group, configOf(g), { id, persist: true });
    g.kit = kit;
    g.DK = DK;
    putBack(DK, id, stash, [...shownNow].map((c) => c.path));
    write(stashOf(group), stash);
    const last = {};
    g.last = last;
    let gen = 0;
    kit.subscribe((v) => {
      // (A control's onInput may set others, which comes back here with
      // newer values: then this older round stops.)
      const mine = ++gen;
      for (const c of g.list) {
        if (gen !== mine) break;
        const x = at(v, c.path);
        if (x === undefined || x === last[c.path]) continue;
        // (A control coming back into the panel shows its default for a
        // moment before its kept value is put back: skip that.)
        if (g.hold?.has(c.path) && g.hold.get(c.path) !== x) continue;
        last[c.path] = x;
        c.apply(x);
      }
    });
  }

  function rebuild(group) {
    const g = groups.get(group);
    if (!g?.kit) return;
    const id = `interlude-${group}`;
    const back = [];
    const going = [];
    const now = new Set();
    for (const c of g.list) {
      const on = visible(c);
      if (on) now.add(c);
      const was = g.shown.has(c);
      if (was && !on) { going.push(c.path); if (g.last[c.path] !== undefined) g.stash[c.path] = g.last[c.path]; }
      if (!was && on && g.stash[c.path] !== undefined) { back.push([c.path, g.stash[c.path]]); delete g.stash[c.path]; }
    }
    try { putBy(g.stash, g.DK.DialStore.presets.get(id), g.DK.DialStore.baseValues.get(id), going); } catch {}
    g.shown = now;
    g.hold = new Map(back);
    g.kit.updateConfig(configOf(g));
    for (const [path, v] of back) g.kit.setValue(path, v);
    g.hold = null;
    putBack(g.DK, id, g.stash, back.map(([path]) => path));
    write(stashOf(group), g.stash);
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
    // The panels go in the page's order (ORDER), whichever script asks
    // first: it waits a moment for the groups it knows of (the record's
    // comes in late, with its module) before making any, then the rest.
    const begun = performance.now();
    const start = () => {
      const waiting = ORDER.some((n) => !groups.has(n)) && performance.now() - begun < 2500;
      if (waiting && !root) { setTimeout(start, 120); return; }
      root ??= DK.createDialRoot({ position: 'bottom-right', theme: 'dark', defaultOpen: false });
      const names = [...ORDER.filter((n) => groups.has(n)), ...[...groups.keys()].filter((n) => !ORDER.includes(n))];
      for (const group of names) {
        const g = groups.get(group);
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
    if (show) add(unit ? `${label} (${unit})` : label, { key: label, apply, config: [value, min, max, step], folder, show: when });
  }

  function select({ label, options, value, onInput, folder, show: when }) {
    onInput?.(value);
    const list = () => (typeof options === 'function' ? options() : options).map(([v, t]) => ({ value: v, label: t }));
    if (show) add(label, { key: label, apply: (v) => onInput?.(v), config: typeof options === 'function' ? () => ({ type: 'select', options: list(), default: value }) : { type: 'select', options: list(), default: value }, folder, show: when });
  }

  function color({ label, value, onInput, folder, show: when }) {
    onInput?.(value);
    if (show) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'color', default: value }, folder, show: when });
  }

  function set(label, value) {
    if (!show) return;
    for (const [group, g] of groups) {
      const c = g.list.find((c) => c.key === label);
      if (!c) continue;
      if (!g.kit) c.apply(value);              // its panel isn't made yet
      else if (g.shown.has(c)) g.kit.setValue(c.path, value);
      else {
        g.stash[c.path] = value;
        write(stashOf(group), g.stash);
        c.apply(value);
      }
      return;
    }
  }

  // DialKit's spring editor ({ type: 'spring', visualDuration, bounce } or
  // { type: 'spring', stiffness, damping, mass }) and its curve editor
  // ({ type: 'easing', duration, ease: [x1, y1, x2, y2] }): onInput gets
  // the object as the panel holds it.
  function spring({ label, value, onInput, folder, show: when }) {
    onInput?.(value);
    if (show) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'spring', ...value }, folder, show: when });
  }
  function easing({ label, value, onInput, folder, show: when }) {
    onInput?.(value);
    if (show) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'easing', ...value }, folder, show: when });
  }

  window.tune = { slider, select, color, spring, easing, refresh, set, shown: show };
})();
