// Tune: DialKit panels (vendor/dialkit, MIT) for settling a few values by
// eye. Shown on localhost or with ?tune in the address; elsewhere every
// value keeps its default and DialKit isn't loaded at all.
//
//   tune.slider({ label, min, max, step, value, unit, css, onInput })
//   tune.select({ label, options: [[value, label], ...], value, onInput })
//
// A label "Group: name" puts the control in that group's panel. onInput
// gets the default straight away, then whatever the panel holds (DialKit
// remembers what was last set here), and again as it changes. A slider
// with `css` also sets that custom property on <html> (with its unit).
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
    groups.get(group).list.push({ name, ...def });
    if (!queued) {
      queued = true;
      // Controls registered in one go of a script share a panel.
      setTimeout(flush, 0);
    }
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
        const config = {};
        for (const c of g.list) config[c.name] = c.config;
        const kit = DK.createDialKit(group, config, { id: `interlude-${group}`, persist: true });
        const last = {};
        kit.subscribe((v) => {
          for (const c of g.list) {
            if (v[c.name] === undefined || v[c.name] === last[c.name]) continue;
            last[c.name] = v[c.name];
            c.apply(v[c.name]);
          }
        });
      }
    };
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  }

  function slider({ label, min, max, step = 1, value, unit = '', css, onInput }) {
    const apply = (v) => {
      if (css) document.documentElement.style.setProperty(css, v + unit);
      onInput?.(v);
    };
    apply(value);
    if (show) add(unit ? `${label} (${unit})` : label, { apply, config: [value, min, max, step] });
  }

  function select({ label, options, value, onInput }) {
    onInput?.(value);
    if (show) add(label, { apply: (v) => onInput?.(v), config: { type: 'select', options: options.map(([v, t]) => ({ value: v, label: t })), default: value } });
  }

  window.tune = { slider, select, shown: show };
})();
