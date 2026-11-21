// Records the hero as clips, one per step of the script, for the
// segmented-video prototype (site/lab/segments). A prototype: it records the
// first mix's opening steps in both hands; see README.md here.
//
//   node demo/segments/record.mjs [--site DIR] [--out DIR] [--steps 5]
//                                 [--scale 2] [--phase all|plan|record]
//
// --site is a copy of the site whose demo/ was built from this hero.jsx
// (vite build --config demo/vite.config.js --outDir <copy>/demo), so a
// recording never rebuilds the live site/demo under anyone.
//
// Time is Stageshow's virtual clock, as in bake-hero.mjs: the same run
// gives the same frames every time. Three passes:
//
//   plan    each hand plays the steps unaligned; the script reports when
//           each step starts and when the app answers in it (hero.jsx
//           mark() and acted()). From that, each step gets a length and,
//           per hand, a wait at its start, so the app answers at the same
//           moment in both hands and every step ends on the same app.
//   check   both hands again, lined up; the engine at every step boundary
//           must match between the hands (play heads, rates, what's
//           playing, stems, crossfader, EQ, tabs) or the recording stops.
//   record  both hands, lined up, layer by layer, each frame:
//             app         the app alone, flat (in the controller hand too:
//                         the page tips it back itself), without the
//                         cursor, the controller or the link lines;
//             controller  the controller alone, over nothing, in its box
//                         (the page shows it through its outline);
//             timeline    the cursor (its transform, lean and data-*), the
//                         link lines (path, opacity, dash) and the music's
//                         level, which the page's glow and record follow.
//           Then each step's frames become one clip per layer, in AV1,
//           HEVC and H.264 (bt709, limited range, 4:2:0).
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : a), []),
);
const SITE = path.resolve(args.site ?? here('../../../site'));
const OUT = path.resolve(args.out ?? here('../../../site/lab/segments'));
const STEPS = +(args.steps ?? 5);
const SCALE = +(args.scale ?? 2);
const FPS = 30;
const FRAME = 1000 / FPS;
const PHASE = args.phase ?? 'all';
const MODES = ['mouse', 'controller'];
// Which hands to record (the plan always plays both).
const REC_MODES = (args.modes ?? MODES.join(',')).split(',');
// Settling time added to every step, so whatever eases out at its end
// (a hover, a tooltip, a link fading) has gone in both hands.
const MARGIN = 300;
const CODECS = (args.codecs ?? 'av1,hevc,h264').split(',');
fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });

const clockSrc = ts.transpileModule(fs.readFileSync(here('../stageshow/clock.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, '');

/** The page side: the clock, the level, and the step hooks hero.jsx calls. */
const install = (plan) => `(() => { ${clockSrc}; installVirtualClock({ fps: ${FPS}, epoch: 1763500000000 }); })();
window.__level = 0;
addEventListener('message', (e) => { if (e.data?.interlude === 'level') window.__level = e.data.level; });
(() => {
  const plan = ${JSON.stringify(plan)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = (engine) => ({
    decks: engine.decks.map((d) => ({ loaded: d.loaded, playing: d.playing, pos: +d.position.toFixed(3), rate: +d.rate.toFixed(5), looping: d.looping, stems: d.stems, bpm: d.bpm })),
    xf: engine.mixer?.crossfader ?? null,
    tabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.textContent.trim()),
    eq: [...document.querySelectorAll('[role="slider"][aria-label$="EQ"]')].map((s) => s.getAttribute('aria-valuenow')),
  });
  window.__heroAlign = {
    controller: true,
    log: [],
    i: -1,
    cur: null,
    async before(name, mode, engine) {
      this.log.push({ type: 'arrive', i: this.i, t: performance.now() });
      if (plan) {
        const end = this.cur ? this.cur.start + plan.len[this.cur.i] : plan.t0;
        const now = performance.now();
        if (end > now) await sleep(end - now);
      }
      this.i++;
      this.cur = { i: this.i, name, start: performance.now() };
      this.log.push({ type: 'mark', i: this.i, name, t: performance.now(), state: snap(engine) });
    },
    async after(name, mode) {
      const pre = plan?.pre[this.cur.i]?.[mode] ?? 0;
      if (pre > 0) await sleep(pre);
    },
    acted() {
      if (this.cur) this.log.push({ type: 'act', i: this.cur.i, t: performance.now() });
    },
  };
})();`;

// The site, served as it is.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/demo/hero.html`;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined) });

async function open(mode, plan) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: SCALE });
  await ctx.addInitScript(install(plan));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?mode=${mode}`);
  // No transitions on the app's own box: the recorder lays it flat and back
  // between captures, and the screen's easing is the page's job.
  await page.addStyleTag({ content: '.app-host { transition: none !important; }' });
  const step = () => page.evaluate(() => window.__stageshow.clock.step(1));
  const log = () => page.evaluate(() => window.__heroAlign.log);
  return { ctx, page, step, log, errors };
}

/** Plays until the step after the last one wanted starts; returns the log. */
async function play(mode, plan, onFrame) {
  const run = await open(mode, plan);
  let guard = FPS * 300;
  for (;;) {
    await run.step();
    const now = await run.page.evaluate(() => performance.now());
    if (onFrame) await onFrame(run, now);
    const marks = (await run.log()).filter((e) => e.type === 'mark');
    if (marks.length > STEPS) break;
    if (guard-- <= 0) throw new Error(`${mode}: the script never got through ${STEPS} steps`);
  }
  const log = await run.log();
  if (run.errors.length) console.warn(`${mode}: page errors: ${run.errors.join('; ')}`);
  await run.ctx.close();
  return log;
}

/**
 * Each step from a run's log: when it started, how long its own moves took
 * (to when the script reached the next step, before any wait there), when
 * the app last answered in it (after the wait at its start), and the
 * engine at its end.
 */
const steps = (log, plan, mode) => {
  const marks = log.filter((e) => e.type === 'mark');
  return marks.slice(0, STEPS).map((m, i) => {
    const pre = plan?.pre[i]?.[mode] ?? 0;
    const acts = log.filter((e) => e.type === 'act' && e.i === i);
    const arrive = log.find((e) => e.type === 'arrive' && e.i === i);
    return { name: m.name, start: m.t, own: arrive.t - m.t - pre, act: acts.length ? acts[acts.length - 1].t - m.t - pre : 0, state: m.state, endState: marks[i + 1].state };
  });
};
// How far apart the hands may leave a deck's play head at a step boundary.
const POS_TOLERANCE = 0.012;
/** Two engine states as strings, play heads within POS_TOLERANCE made equal, and the largest gap. */
function compare(x, y) {
  let gap = 0;
  const y2 = structuredClone(y);
  y2.decks.forEach((d, i) => {
    const g = Math.abs(d.pos - x.decks[i].pos);
    gap = Math.max(gap, g);
    if (g <= POS_TOLERANCE) d.pos = x.decks[i].pos;
  });
  return [JSON.stringify(x), JSON.stringify(y2), gap];
}
const ceilFrame = (ms) => Math.ceil(ms / FRAME - 1e-6) * FRAME;

// 1. Plan, and 2. check. Each round plays both hands with the last plan
// (none at first) and works out the next from how long each step's own
// moves took and when the app answered; the hands can play a step a little
// differently once lined up (a stem is ready sooner or later), so it goes
// round until a run with the plan leaves the app the same at every step
// boundary in both hands.
let plan;
const planFile = path.join(OUT, 'plan.json');
const toFrame = (ms) => Math.round(ms / FRAME) * FRAME;
if (PHASE === 'all' || PHASE === 'plan') {
  let last = null;
  for (let round = 0; ; round++) {
    if (round > 5) throw new Error('the hands never lined up');
    const runs = {};
    for (const m of MODES) runs[m] = steps(await play(m, last), last, m);
    const names = runs.mouse.map((s) => s.name).join();
    if (names !== runs.controller.map((s) => s.name).join()) throw new Error(`the hands play different steps: ${names} / ${runs.controller.map((s) => s.name)}`);
    if (last) {
      let bad = 0;
      for (let i = 0; i < STEPS; i++) {
        const [a, b, gap] = compare(runs.mouse[i].endState, runs.controller[i].endState);
        const acts = MODES.map((m) => (runs[m][i].act + last.pre[i][m]).toFixed(1)).join(' / ');
        console.log(`  step ${i} ${last.names[i]}: starts ${MODES.map((m) => runs[m][i].start.toFixed(1)).join(' / ')}, app answers at +${acts} ms, ends ${a === b ? `the same${gap ? ` (play heads ${Math.round(gap * 1000)} ms apart)` : ''}` : 'DIFFERENTLY'}`);
        if (a !== b) {
          bad++;
          console.log('    mouse     ', a);
          console.log('    controller', b);
        }
      }
      if (!bad) break;
    }
    const pre = [];
    const len = [];
    for (let i = 0; i < STEPS; i++) {
      // Where the app answers counting the wait before: the later hand's
      // moment is the one both meet, to the frame. (Each hand answers on
      // frames of its own phase, a mouse click on the frame and a key's
      // pulse a little after it, so they can't meet closer than that: a
      // few milliseconds, which only shows as a stopped deck's play head
      // set a fraction of a pixel apart by Sync. POS_TOLERANCE allows it.)
      const at = Object.fromEntries(MODES.map((m) => [m, runs[m][i].act + (last?.pre[i][m] ?? 0)]));
      const act = Math.max(...Object.values(at));
      pre[i] = Object.fromEntries(MODES.map((m) => [m, (last?.pre[i][m] ?? 0) + toFrame(act - at[m])]));
      len[i] = ceilFrame(Math.max(...MODES.map((m) => runs[m][i].own + pre[i][m])) + MARGIN);
    }
    // The first step starts at the same moment in both, on a frame.
    const t0 = last?.t0 ?? 1000 + ceilFrame(Math.max(...MODES.map((m) => runs[m][0].start)) - 1000 + FRAME);
    last = { t0, pre, len, names: runs.mouse.map((s) => s.name) };
    console.log(`round ${round}: plan`, JSON.stringify(last));
  }
  plan = last;
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 1));
} else plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));

// Only the styles again, into an existing manifest.
if (PHASE === 'css') {
  const file = path.join(OUT, 'clips', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.css = await extractCss();

  fs.writeFileSync(file, JSON.stringify(manifest, null, 1));
}

// 3. Record.
if (PHASE === 'all' || PHASE === 'record') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-'));
  const bounds = [plan.t0];
  for (const l of plan.len) bounds.push(bounds[bounds.length - 1] + l);
  const end = bounds[bounds.length - 1];
  const manifest = { fps: FPS, scale: SCALE, codecs: CODECS, steps: plan.names.map((name, i) => ({ name, frames: Math.round(plan.len[i] / FRAME) })), modes: {} };
  for (const mode of REC_MODES) {
    const timelines = plan.names.map(() => ({ level: [], links: [] }));
    let ctlBox = null;
    let cdp = null;
    let cursorHtml = {};
    const shot = async (clip, file) => {
      // (Beyond the viewport: otherwise a capture scaled past the page's own
      // pixel ratio can come back cut short at the foot.)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: true, clip: { ...clip, scale: SCALE } });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    };
    await play(mode, plan, async (run, now) => {
      if (now < plan.t0 - 0.5 || now >= end - 0.5) return;
      const page = run.page;
      if (!cdp) {
        cdp = await run.ctx.newCDPSession(page);
        await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        await page.evaluate(() => { const s = document.createElement('style'); s.id = 'rec-hide'; document.head.append(s); });
        // The controller's box at rest, with room for its shadow, on whole device pixels.
        ctlBox = await page.evaluate((scale) => {
          const r = document.querySelector('.desk .hw').getBoundingClientRect();
          const pad = 28;
          const even = (v) => Math.round((v * scale) / 2) * (2 / scale);
          const x = even(Math.max(0, r.left - pad));
          const y = even(Math.max(0, r.top - pad));
          return { x, y, width: even(Math.min(1440, r.right + pad) - x), height: even(Math.min(920, r.bottom + pad + 12) - y) };
        }, SCALE);
        manifest.controllerBox = ctlBox;
      }
      const k = bounds.findIndex((b, i) => now >= b - 0.5 && now < bounds[i + 1] - 0.5);
      const f = Math.round((now - bounds[k]) / FRAME);
      const dir = path.join(tmp, `${mode}-${k}`);
      fs.mkdirSync(dir, { recursive: true });
      // The timeline, as the page is.
      const t = await page.evaluate(() => {
        const c = document.querySelector('.hero-stage .ss-cursor');
        const attrs = c ? [...c.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`).join(' ') : '';
        const links = [...document.querySelectorAll('svg.links > path')].map((p) => {
          const cs = getComputedStyle(p);
          return [p.getAttribute('class'), p.getAttribute('d'), +(+cs.opacity).toFixed(3), cs.strokeDasharray, cs.strokeDashoffset];
        });
        return { level: Math.round(window.__level * 1000) / 1000, cursor: [c?.style.transform ?? '', c?.style.getPropertyValue('--lean') ?? '', attrs], links, html: c?.outerHTML, style: c?.dataset.style };
      });
      const tl = timelines[k];
      tl.level[f] = t.level;
      tl.links[f] = t.links.length ? t.links : 0;
      if (t.style && !cursorHtml[t.style]) cursorHtml[t.style] = t.html;
      const hide = (css) => page.evaluate((css) => (document.getElementById('rec-hide').textContent = css), css);
      const n = String(f).padStart(4, '0');
      // The controller alone: with the controller hand's fingertip on it,
      // which goes when the controller does; without the mouse's arrow.
      if (mode === 'controller' && k === 0 && f === 0) {
        // (Its outline at rest, without a fingertip, for the mask.)
        await hide('.app-host, .ss-cursor, svg.links { visibility: hidden !important; }');
        await shot(ctlBox, path.join(dir, 'mask.png'));
      }
      await hide(`.app-host, svg.links${mode === 'mouse' ? ', .ss-cursor' : ''} { visibility: hidden !important; }`);
      await shot(ctlBox, path.join(dir, `c${n}.png`));
      // The app alone, flat; and in the mouse hand the same with the arrow
      // in it, the clip that normally plays (the one without is its twin,
      // crossed to when the hand is switched mid-step).
      await hide('.desk, .ss-cursor, svg.links { visibility: hidden !important; } .app-host { transform: none !important; }');
      await shot({ x: 0, y: 0, width: 1440, height: 900 }, path.join(dir, `a${n}.png`));
      if (mode === 'mouse') {
        await hide('.desk, svg.links { visibility: hidden !important; } .app-host { transform: none !important; }');
        await shot({ x: 0, y: 0, width: 1440, height: 900 }, path.join(dir, `p${n}.png`));
      }
      await hide('');
      if (f % 30 === 0) console.log(`${mode} step ${k} frame ${f}`);
    });
    // The controller's outline at rest, for the page to show it through.
    // Which app clip plays in this hand, and its twin without the cursor.
    manifest.modes[mode] = mode === 'mouse' ? { play: 'appc', twin: 'app' } : { play: 'app', twin: null };
    manifest.small = '@1x';
    for (let k = 0; k < plan.names.length; k++) {
      const name = `${mode}-${k}-${plan.names[k]}`;
      fs.writeFileSync(path.join(OUT, 'clips', `${name}.json`), JSON.stringify(timelines[k]));
      const dir = path.join(tmp, `${mode}-${k}`);
      if (mode === 'controller' && k === 0) await ffmpeg(['-i', path.join(dir, 'mask.png'), '-vf', 'alphaextract', path.join(OUT, 'clips', 'controller-mask.png')]);
      // (The twin gets a keyframe every 2 s, so starting it partway
      // through, at a switch nobody hovered first, is quick.)
      // Each also at 1x (manifest.small), for small screens and for the twin
      // on slow connections.
      const layers = mode === 'mouse' ? [['appc', 'p', 300], ['app', 'a', 60], ['ctl', 'c', 300]] : [['app', 'a', 300], ['ctl', 'c', 300]];
      for (const [layer, pre, gop] of layers) {
        for (const codec of CODECS) {
          await encode(path.join(dir, `${pre}%04d.png`), path.join(OUT, 'clips', `${name}.${layer}.${codec}.mp4`), codec, gop);
          await encode(path.join(dir, `${pre}%04d.png`), path.join(OUT, 'clips', `${name}.${layer}@1x.${codec}.mp4`), codec, gop, layer === 'ctl' ? Math.round(ctlBox.width) : 1440);
        }
      }
      console.log('encoded', name);
    }
  }
  // The cursor's and the links' own styles, from the page's stylesheets, so
  // the player draws them as the demo does.
  manifest.css = await extractCss();
  // Another run may have recorded the other hand into the same place.
  const file = path.join(OUT, 'clips', 'manifest.json');
  if (fs.existsSync(file)) manifest.modes = { ...JSON.parse(fs.readFileSync(file, 'utf8')).modes, ...manifest.modes };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 1));
  if (args.keep) console.log('frames kept in', tmp);
  else fs.rmSync(tmp, { recursive: true, force: true });
}

async function extractCss() {
  const run = await open('mouse', null);
  const css = await run.page.evaluate(() => {
    const keep = /ss-cursor|svg\.links|\.link-line|\.link-spark/;
    const out = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) walk(r.cssRules);
        else if (r.selectorText && keep.test(r.selectorText) && !/link-label|link-mark/.test(r.selectorText)) out.push(r.cssText);
        // The app's box and how it tips back in the controller hand.
        else if (r.selectorText === '.app-host' || r.selectorText === '#hero[data-hand="controller"] .app-host') out.push(r.cssText);
        // The named springs (springs.css, scoped to #hero).
        else if (r.selectorText && /(^|,\s*)#hero\s*($|,)/.test(r.selectorText)) {
          const decls = [...r.style].filter((p) => /^--(snappy|smooth|settle|glide|lock|press|pulse)(-ms)?$/.test(p)).map((p) => `${p}: ${r.style.getPropertyValue(p)};`);
          if (decls.length) out.push(`#hero { ${decls.join(' ')} }`);
        }
      }
    };
    // (The built stylesheets only, not the recorder's own.)
    for (const s of document.styleSheets) if (s.ownerNode?.tagName === 'LINK') walk(s.cssRules);
    return out.join('\n');
  });
  await run.ctx.close();
  return css;
}

function ffmpeg(a) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (c) => (c ? fail(new Error(`ffmpeg exited ${c}`)) : ok()));
  });
}
function encode(input, file, codec, gop = 300, width = 0) {
  const vf = ['-vf', `scale=${width ? `${width}:-2:flags=lanczos:` : ''}out_color_matrix=bt709:out_range=tv,format=yuv420p`];
  const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  const c = {
    av1: ['-c:v', 'libsvtav1', '-preset', '5', '-crf', '38', '-g', String(gop), '-svtav1-params', 'log-level=0'],
    hevc: ['-c:v', 'libx265', '-preset', 'slow', '-crf', '26', '-g', String(gop), '-tag:v', 'hvc1', '-x265-params', 'log-level=error'],
    h264: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-g', String(gop), '-tune', 'animation'],
  }[codec];
  return ffmpeg(['-framerate', String(FPS), '-i', input, ...vf, ...c, ...tags, '-movflags', '+faststart', file]);
}

await browser.close();
server.close();
