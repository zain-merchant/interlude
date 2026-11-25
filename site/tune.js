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
//   tune.backups() / tune.restore(n)  the panels' settings as they were on
//                      each of the last 20 loads (see snapshot below)
//   tune.set(label, value)  moves a control as if by hand (its onInput
//                      runs, the panel shows it); one hidden for now keeps
//                      the value for when it shows. label as registered
//                      (a slider's without its unit).
(() => {
  // v1: every control as it was tuned when v1 shipped (2026-11-18), read
  // from the panels' saved values. These are the defaults everywhere: on
  // the live site, which never loads DialKit, and in the panels until
  // something is changed there (what's changed there still wins, on that
  // browser). Keyed by group, then by the control's place in its panel
  // (folder.name, a slider's with its unit).
  const V1 = {
    "Add music": {
      "sweep starts (ms)": 0
    },
    "Cards": {
      "style": "quiet"
    },
    "Controllers picture": {
      "size": 1.15,
      "up or down (px)": 0,
      "fade length (px)": 46
    },
    "Features": {
      "heading": "both",
      "band colour": "#040405",
      "band edge colour": "#ffffff1a",
      "band": "recess",
      "heading to rows (px)": 6,
      "gap between cards (px)": 24,
      "layout": "apart",
      "heading mark": "none",
      "Settled.Decks picture": "stacked"
    },
    "Footer": {
      "Motion.warp amount (px)": 3,
      "Motion.ripple spacing (em)": 0.6,
      "Motion.interference spread (em)": 0.45,
      "Motion.plays for (s)": 2.5,
      "mode": "ripples",
      "Motion.ripple speed (em/s)": 0.25,
      "Motion.ripple bend (px)": 1.25,
      "Motion.ripple style": "breathe",
      "Motion.ripple reach (em)": 1.3,
      "Motion.ripple width (em)": 0.07,
      "Motion.ripple interval (s)": 0.55,
      "Motion.click ring reach": 1,
      "Motion.click ring strength (×)": 7.5,
      "Motion.fade in/out (s)": 0.9,
      "Motion.hover": "follow",
      "Click.click lens magnify": 0.8,
      "Click.click lens size (em)": 0.14,
      "Click.click lens springs back in (s)": 0.75,
      "Click.click lens holds on a quick click (s)": 0.3,
      "Click.click lens in-out swing": 0.55,
      "Click.click wave strength": 0.6,
      "Click.click wave reach (em)": 1,
      "Click.click wave speed (em/s)": 1.6,
      "Shape.groove spacing (px)": 6.25,
      "Shape.groove arcs": "record",
      "Shape.grooves per song (0: no gaps)": 0,
      "Shape.song gap width (grooves)": 0.5,
      "Shape.groove line width (px)": 1.5,
      "Shape.groove tilt (°)": 0,
      "Shape.word cut off at bottom (em)": 0.33,
      "Shape.outline thickness (px)": 1.5,
      "Colour.letter colour": "#000000",
      "Colour.groove gap colour": "#000000",
      "Colour.groove line colour": "#000000",
      "Colour.outline colour": "#0d0d0d",
      "Colour.page background": "#09090b00"
    },
    "Grain": {
      "texture": "film",
      "size": 0.75,
      "amount": 0.12,
      "contrast": 0.9,
      "blend": "normal",
      "movement": "swap",
      "flicker rate": "6",
      "jump distance": 0.03,
      "drift time (s)": 30,
      "fades out toward the features": 1
    },
    "Hero": {
      "Layout.download block": "caption",
      "Layout.version link": "match",
      "Layout.rule": "none",
      "Controller.controller style": "current",
      "Performance.app frame rate": 30,
      // (Was "Performance.render": "live", the live app over a video of it;
      // the hero is now the recorded clips, the live app a pick here.)
      "Performance.demo": "clips",
      "Layout.starts with": "controller",
      "Layout.switches by itself": "on",
      "controller comes in from (px, minus is above) (px)": -40,
      "controller follows the screen by (ms) (ms)": 135,
      "controller blur as it comes in (px)": 10,
      "screen tilt in controller mode (°)": 0,
      "screen scales from": "top"
    },
    "Hero record": {
      "Look.glint colour amount": 0.6,
      "Look.soft glints strength": 1,
      "Look.glints mode strength": 1,
      "Look.glint colour": "none",
      "Look.lamp colour": 0,
      "Vinyl.lamp wedges": 0,
      "Layout.show to the top (mask)": 0,
      "Hover & needle.tilt": 0.5,
      "Hover & needle.colour turn": 0.5,
      "Hover & needle.cone swing": 0.8,
      "Hover & needle.lamp swing": 0.7,
      "Hover & needle.glint slide": 0.6,
      "Hover & needle.follow time (s)": 0.6,
      "Layout.top warp strength": 0.5,
      "Look.spin cue strength": 1,
      "Look.speck style": "hyphen",
      "style": "vinyl",
      "Vinyl.vinyl preset": "custom",
      "Vinyl.vinyl colour": "#000000",
      "Vinyl.vinyl finish": "solid",
      "Vinyl.vinyl body": 0,
      "Vinyl.light through it": 0.4,
      "Vinyl.grooves in its colour": 0.8,
      "Vinyl.flecks": 0,
      "Vinyl.groove spacing (px)": 4.5,
      "Vinyl.spacing opens out by the rim (px)": 10,
      "Vinyl.groove line width": 2.1,
      "Vinyl.groove contrast": 1.7,
      "Vinyl.groove brightness": 0.8,
      "Vinyl.song bands": 1.5,
      "Vinyl.song length": 1,
      "Vinyl.sheen": 1.9,
      "Vinyl.pressing warp": 2.1,
      "Look.what shows the spin": "glints",
      "Look.natural dust": 0.5,
      "Look.dust size": 0.6,
      "Look.dust softness": 0.25,
      "Look.dust brightness": 0.65,
      "Look.dust glow": 0.4,
      "Look.dust glow size": 0.55,
      "Look.dust only in the light": 0.45,
      "Look.dust size variety": 0.45,
      "Look.dust fibres": 0.2,
      "Look.render resolution": 0.8,
      "Glints.glint brightness": 3.12,
      "Glints.glint size": 1.2,
      "Glints.glint sharpness": 1,
      "Glints.glints per turn": 4,
      "Glints.glints turn with the disc (x)": 1,
      "Glints.glint colour": "lamp",
      "Glints.colour spread": 1.55,
      "Glints.colour amount": 1,
      "Glints.colour away from the lamp": 2.5,
      "Glints.colour hue (°)": 0,
      "Lamp.brightness away from the lamp": 1,
      "Lamp.lamp movement": "turn",
      "Lamp.cone direction (°)": 10,
      "Lamp.cone width (°)": 40.7,
      "Lamp.cone edge softness (°)": 6.3,
      "Lamp.cone reach": 0.57,
      "Lamp.cone glow": 0.2,
      "Lamp.cone grooves": 0.1,
      "Lamp.cone colour": "#ffffff",
      "Lamp.cones": "two",
      "Lamp.lamp colour (sides)": 0,
      "Motion.spin speed": 0.25,
      "Motion.scroll twist per 1000px (°)": 36,
      "Motion.scroll twist at most (°)": 69,
      "Motion.scroll twist settles in (s)": 1.55,
      "Hover & needle.hover style": "litarc",
      "Hover & needle.drag tips it": 0.35,
      "Hover & needle.needle and hover strength": 0.5,
      "Hover & needle.hover fades after still (s)": 1.2,
      "Layout.shape preset": "custom",
      "Layout.lower by (px)": 140,
      "Layout.perspective": 0.6,
      "Layout.rings all round": 2,
      "Layout.more rings up top": 0,
      "Layout.top fade starts at (px)": 66,
      "Layout.top fade length (px)": 590,
      "Layout.top warp": "none"
    },
    "Install": {
      "step number": "badge"
    },
    "Nav": {
      "Settled.name size before capsule (px)": 32,
      "Settled.capsule corners": "14",
      "Settled.buttons start at (%)": 75,
      "Settled.button stagger (ms)": 180,
      "Settled.space above the bar (px)": 8,
      "Settled.icon size before capsule": 40,
      "buttons arrive": "island",
      "gap between icon and name before capsule (px)": 13
    },
    "Note": {
      "record flip time (s)": 0.6,
      "record flip bounce": 0.22,
      "label logo": "rings",
      "side A label": "#fb8b38",
      "side B label": "#3fc9ea",
      "white label": "#ffbdd0",
      "sleeve corner radius (px)": 4,
      "sleeve tilt (deg)": 3,
      "question to signature (px)": 4,
      "rings logo outline": 3,
      "record lifted off the sleeve bottom (px)": 12,
      "record speed when out (rpm)": 9.7,
      "how far the record comes out (%)": 42,
      "push right (px)": 12,
      "record slides out": {
        "type": "spring",
        "visualDuration": 0.5,
        "bounce": 0.12
      },
      "record spins up": {
        "type": "spring",
        "visualDuration": 1.1,
        "bounce": 0
      },
      "record slows down": {
        "type": "spring",
        "visualDuration": 1.6,
        "bounce": 0
      },
      "style": "sleeve"
    },
    "Open source": {
      "what fades": "none",
      "card brightness": 1,
      "card brightness at the right": 1,
      "card blur (px)": 17,
      "fade starts at (%)": 64,
      "fade ends at (%)": 63,
      "updates surface white": 0.62,
      "lines": 0.1,
      "look": "poster-light",
      "light card extra": "grooves"
    },
    "Sections": {
      "between": "none"
    }
  };
  const v1 = (label, unit, folder, value) => {
    const i = label.indexOf(':');
    const group = i > 0 ? label.slice(0, i).trim() : 'Tune';
    const name = (i > 0 ? label.slice(i + 1).trim() : label) + (unit ? ` (${unit})` : '');
    const g = V1[group];
    const v = g && (g[folder ? `${folder}.${name}` : name] ?? g[name]);
    return v === undefined ? value : v;
  };
  // On localhost, on a machine's own name on a private network (a name with
  // no dot, for a phone on the same one), or anywhere with ?tune (kept
  // from then on; ?tune=off forgets). Nothing is loaded otherwise.
  // (In the phone preview's frame, tune-frame.js, the panel is the page's
  // outside: the controls here only take the values it hands in.)
  const framed = !!window.__framed;
  const on = framed ? 'off' : new URLSearchParams(location.search).get('tune');
  if (!framed) try { if (on === 'off') localStorage.removeItem('tune-on'); else if (on !== null) localStorage.setItem('tune-on', '1'); } catch {}
  const kept = !framed && (() => { try { return localStorage.getItem('tune-on') === '1'; } catch { return false; } })();
  const show = on !== 'off' && (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || (!location.hostname.includes('.') && location.hostname !== '') || on !== null || kept);
  const base = document.currentScript?.src ? new URL('.', document.currentScript.src).href : './';
  const groups = new Map();
  // The groups' order in the panel: the page's, top to bottom.
  // (This round's switches first; then the Archive, everything tuned before,
  // folded away under its own heading.)
  const ORDER = ['Try', 'Archive', 'Nav', 'Hero', 'Hero record', 'Features', 'Open source', 'Footer'];
  // And within a group, its folders' order where it matters.
  const FOLDERS = { Hero: ['Layout', 'Controller', 'Performance'], Try: ['Preview', 'Nav', 'Wordmark', 'Buttons', 'Controller', 'Record', 'Phone', 'Note', 'Footer', 'Corners'] };
  let queued = false;
  let lib = null;
  let root = null;

  // A copy of every panel's settings and saved versions, taken on each
  // load before any page code can touch them: the last 20 that differ,
  // newest first, in localStorage 'tune-backups'. tune.backups() lists
  // them; tune.restore(n) puts back the nth (0 = newest) and reloads.
  const BACKUPS = 'tune-backups';
  const own = (k) => k.startsWith('dialkit:') || k.startsWith('tune-hidden:');
  function snapshot() {
    try {
      const snap = {};
      for (const k of Object.keys(localStorage)) if (own(k)) snap[k] = localStorage.getItem(k);
      if (!Object.keys(snap).length) return;
      const list = JSON.parse(localStorage.getItem(BACKUPS) || '[]');
      const body = JSON.stringify(snap);
      if (list[0] && JSON.stringify(list[0].snap) === body) return;
      list.unshift({ at: new Date().toISOString(), page: location.pathname, snap });
      localStorage.setItem(BACKUPS, JSON.stringify(list.slice(0, 20)));
    } catch {}
  }
  function backups() {
    try { return JSON.parse(localStorage.getItem(BACKUPS) || '[]').map((b, i) => `${i}: ${b.at} (${b.page})`); } catch { return []; }
  }
  function restore(n = 0) {
    const b = JSON.parse(localStorage.getItem(BACKUPS) || '[]')[n];
    if (!b) return 'no such backup';
    for (const k of Object.keys(localStorage)) if (own(k)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(b.snap)) localStorage.setItem(k, v);
    location.reload();
  }

  // The Archive has a panel of its own to open; what it holds is whatever's
  // below it.
  if (show) queueMicrotask(() => add('Archive: everything from before this round, below', { key: 'archive', apply: () => {}, config: { type: 'select', options: [{ value: 'below', label: 'Open the folders below' }], default: 'below' } }));
  if (show) {
    snapshot();
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${base}vendor/dialkit/styles.css?v=2`;
    document.head.append(css);
    // On a touch screen, up and down on a slider scrolls the panel (a
    // sideways drag still moves it).
    const touch = document.createElement('style');
    touch.textContent = '@media (pointer: coarse) { .dialkit-root .dialkit-slider { touch-action: pan-y; } }'
      // The Archive: everything below its heading is hidden until it's opened.
      + 'html:not([data-tune-archive]) .dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner > .dialkit-folder-section:nth-child(n+3) { display: none; }';
    document.head.append(touch);
    lib = new Promise((done, fail) => {
      const s = document.createElement('script');
      s.src = `${base}vendor/dialkit/browser.global.js?v=4`;
      s.onload = () => (window.DialKit ? done(window.DialKit) : fail());
      s.onerror = fail;
      document.head.append(s);
    });
  }

  function add(label, def) {
    const i = label.indexOf(':');
    const group = i > 0 ? label.slice(0, i).trim() : 'Tune';
    const name = i > 0 ? label.slice(i + 1).trim() : label;
    if (!groups.has(group)) groups.set(group, { name: group, list: [], made: false });
    const path = def.folder ? `${def.folder}.${name}` : name;
    groups.get(group).list.push({ name, path, ...def });
    if (framed) return;
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
    // Folders listed in FOLDERS go first, in that order; the rest follow
    // in the order their controls were added.
    for (const f of FOLDERS[g.name] || []) if (g.list.some((c) => c.folder === f && visible(c))) config[f] = {};
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
    const first = configOf(g);
    g.sig = JSON.stringify(first);
    const kit = DK.createDialKit(group, first, { id, persist: true, defaultCollapsed: group !== 'Try',
      onAction: (path) => g.list.find((c) => c.path === path && c.press)?.press() });
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
        send(group, c.path, x);
      }
    });
  }

  // The phone preview: the same page in a frame the size of a phone, over
  // the page and beside the panel, which goes on working and sets the
  // frame's values too (tune-frame.js makes it a phone inside). Only where
  // the panel shows.
  const SIZES = { '390x844': 'iPhone 15', '375x667': 'iPhone SE', '430x932': 'iPhone Pro Max', '820x1180': 'iPad' };
  let preview = null;
  function send(group, path, value) {
    try { preview?.frame.contentWindow?.tune?.receive?.(group, path, value); } catch {}
  }
  function sendAll() {
    for (const [group, g] of groups) for (const [path, v] of Object.entries(g.last || {})) send(group, path, v);
  }
  function phone(size) {
    if (!show || size === (preview?.size || 'off')) return;
    const [w, h] = (SIZES[size] ? size : '').split('x').map(Number);
    // (The panel's own control says what's showing, however it was asked for.)
    queueMicrotask(() => set('Try: Show as a phone', preview?.size || 'off'));
    if (!w) {
      if (!preview) return;
      preview.box.remove(); preview = null;
      removeEventListener('resize', fitPhone); dispatchEvent(new CustomEvent('interlude:menu', { detail: false }));
      return;
    }
    if (!preview) {
      const box = document.createElement('div');
      Object.assign(box.style, { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgb(40 40 44 / 0.96)' });
      const frame = document.createElement('iframe');
      Object.assign(frame.style, { position: 'absolute', border: 0, borderRadius: '28px', background: '#000', boxShadow: '0 0 0 1px rgb(255 255 255 / 0.2), 0 30px 80px rgb(0 0 0 / 0.5)', transformOrigin: '0 0' });
      frame.title = 'Phone preview';
      const q = new URLSearchParams(location.search); q.delete('tune'); q.set('frame', '1');
      frame.src = `${location.pathname}?${q}`;
      frame.addEventListener('load', () => { sendAll(); setTimeout(sendAll, 1500); });
      const cap = document.createElement('p');
      Object.assign(cap.style, { position: 'absolute', margin: 0, color: '#ccc', font: '13px/1.4 system-ui, sans-serif', whiteSpace: 'nowrap' });
      box.append(frame, cap);
      document.body.append(box);
      preview = { box, frame, cap };
      addEventListener('resize', fitPhone);
      // (The page behind holds still.)
      dispatchEvent(new CustomEvent('interlude:menu', { detail: true }));
    }
    Object.assign(preview, { w, h, size });
    fitPhone();
  }
  function fitPhone() {
    if (!preview) return;
    const { frame, cap, w, h, size } = preview;
    const k = Math.min(1, (innerHeight - 64) / h);
    const left = Math.max(16, (innerWidth - 340 - w * k) / 2);
    Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: '40px', transform: k < 1 ? `scale(${k})` : '' });
    Object.assign(cap.style, { left: `${left}px`, top: '12px' });
    cap.textContent = `${SIZES[size]}, ${w} by ${h}${k < 1 ? `, shown at ${Math.round(k * 100)}%` : ''}`;
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
    // Nothing to change (the same controls, the same options): leave the
    // panel alone, so it doesn't jump to the top or open every folder.
    const cfg = configOf(g);
    const sig = JSON.stringify(cfg);
    if (sig === g.sig && !back.length && !going.length) { g.hold = null; return; }
    g.sig = sig;
    // Otherwise rebuild it, keeping where it was scrolled to and which
    // folders were open or closed.
    const keep = ui.snapshot();
    g.kit.updateConfig(cfg);
    ui.restore(keep);
    for (const [path, v] of back) g.kit.setValue(path, v);
    g.hold = null;
    putBack(g.DK, id, g.stash, back.map(([path]) => path));
    write(stashOf(group), g.stash);
  }

  // The panel's own state, kept across rebuilds and visits: how far it's
  // scrolled, which folders are open or closed (by their titles, outermost
  // first), and where it was dragged to.
  const ui = (() => {
    const FOLDERS_KEY = 'tune-ui:folders';
    const PLACE_KEY = 'tune-ui:place';
    const tops = () => [...document.querySelectorAll('.dialkit-root .dialkit-folder-header-top')];
    const keyOf = (top) => {
      const names = [];
      for (let f = top.closest('.dialkit-folder'); f; f = f.parentElement?.closest('.dialkit-folder')) {
        const t = f.querySelector(':scope > .dialkit-folder-header .dialkit-folder-title, :scope > .dialkit-folder-header .dialkit-folder-header-top');
        names.unshift((t?.textContent || '').trim().slice(0, 48));
      }
      return names.join(' / ');
    };
    const scroller = () => document.querySelector('.dialkit-root .dialkit-panel-inner');
    const folders = () => { const m = {}; for (const t of tops()) m[keyOf(t)] = t.getAttribute('aria-expanded'); return m; };
    const apply = (m) => { for (const t of tops()) { const want = m[keyOf(t)]; if (want && t.getAttribute('aria-expanded') !== want) t.click(); } };
    const after = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
    const save = () => { try { localStorage.setItem(FOLDERS_KEY, JSON.stringify({ ...read(FOLDERS_KEY), ...folders() })); } catch {} };
    // A folder opened or closed by hand is remembered.
    addEventListener('click', (e) => { if (e.target.closest?.('.dialkit-root .dialkit-folder-header-top')) setTimeout(save, 60); }, true);
    // Where the panel was dragged to, remembered when it's let go.
    addEventListener('pointerup', (e) => {
      if (!e.target.closest?.('.dialkit-root')) return;
      setTimeout(() => {
        const shell = document.querySelector('.dialkit-root .dialkit-panel');
        if (!shell) return;
        write(PLACE_KEY, shell.style.left ? { left: shell.style.left, top: shell.style.top } : null);
      }, 60);
    }, true);
    return {
      snapshot: () => ({ top: scroller()?.scrollTop ?? 0, folders: folders() }),
      restore: (k) => after(() => { apply(k.folders); after(() => { const sc = scroller(); if (sc) sc.scrollTop = k.top; }); }),
      // On a visit: the folders as they were left, and the panel where it was.
      start: () => {
        setTimeout(() => apply(read(FOLDERS_KEY) || {}), 400);
        const place = read(PLACE_KEY);
        const shell = document.querySelector('.dialkit-root .dialkit-panel');
        if (place && shell) { delete shell.dataset.position; Object.assign(shell.style, { left: place.left, top: place.top, right: 'auto', bottom: 'auto' }); }
      },
    };
  })();

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

  // The Archive's heading opens and shuts what's below it: its own panel's
  // open state is watched (a few attribute changes a day), and the page gets
  // an attribute for the rule above.
  function archive() {
    const inner = document.querySelector('.dialkit-folder-root > .dialkit-folder-content > .dialkit-folder-inner');
    if (!inner) return;
    const read = () => {
      const a = [...inner.children].find((c) => c.querySelector('.dialkit-folder-title')?.textContent?.trim() === 'Archive');
      document.documentElement.toggleAttribute('data-tune-archive', a?.dataset.open === 'true');
    };
    new MutationObserver(read).observe(inner, { attributes: true, attributeFilter: ['data-open'], subtree: true, childList: true });
    read();
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
      if (!ui.started) { ui.started = true; ui.start(); archive(); }
    };
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  }

  function slider({ label, min, max, step = 1, value, unit = '', css, onInput, folder, show: when }) {
    value = v1(label, unit, folder, value);
    const apply = (v) => {
      if (css) document.documentElement.style.setProperty(css, v + unit);
      onInput?.(v);
    };
    apply(value);
    if (show || framed) add(unit ? `${label} (${unit})` : label, { key: label, apply, config: [value, min, max, step], folder, show: when });
  }

  function select({ label, options, value, onInput, folder, show: when }) {
    value = v1(label, '', folder, value);
    onInput?.(value);
    const list = () => (typeof options === 'function' ? options() : options).map(([v, t]) => ({ value: v, label: t }));
    if (show || framed) add(label, { key: label, apply: (v) => onInput?.(v), config: typeof options === 'function' ? () => ({ type: 'select', options: list(), default: value }) : { type: 'select', options: list(), default: value }, folder, show: when });
  }

  function color({ label, value, onInput, folder, show: when }) {
    value = v1(label, '', folder, value);
    onInput?.(value);
    if (show || framed) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'color', default: value }, folder, show: when });
  }

  // A button: press() when it's pressed.
  function button({ label, onPress, folder, show: when }) {
    if (show) add(label, { key: label, apply: () => {}, press: onPress, config: { type: 'action', label: label.slice(label.indexOf(':') + 1).trim() }, folder, show: when });
  }
  // A checkbox.
  function toggle({ label, value, onInput, folder, show: when }) {
    value = v1(label, '', folder, value);
    onInput?.(value);
    if (show || framed) add(label, { key: label, apply: (v) => onInput?.(v), config: value, folder, show: when });
  }
  // (In the preview's frame: a value from the panel outside.)
  function receive(group, path, value) {
    const c = groups.get(group)?.list.find((c) => c.path === path);
    if (c && !c.press) c.apply(value);
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
    value = v1(label, '', folder, value);
    if (value && value.type) { const { type, ...rest } = value; value = rest; }
    onInput?.(value);
    if (show || framed) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'spring', ...value }, folder, show: when });
  }
  function easing({ label, value, onInput, folder, show: when }) {
    value = v1(label, '', folder, value);
    if (value && value.type) { const { type, ...rest } = value; value = rest; }
    onInput?.(value);
    if (show || framed) add(label, { key: label, apply: (v) => onInput?.(v), config: { type: 'easing', ...value }, folder, show: when });
  }

  window.tune = { slider, select, color, spring, easing, button, toggle, refresh, set, backups, restore, shown: show, phone, framePage: () => preview?.frame.contentWindow, receive: framed ? receive : undefined };
})();
