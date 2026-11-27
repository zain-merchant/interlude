// Records the website's hero as clips, one per step of the script, in both
// hands, for the player in site/hero/clips.js. See README.md here.
//
//   npm run clips                  (in app/: everything, into site/hero/clips)
//   node demo/segments/record.mjs [--if-changed] [--jobs 3] [--codecs hevc,h264]
//        [--out DIR] [--work DIR] [--phase all|plan|record|encode|parts] [--keep]
//
// --if-changed  does nothing when the app, the demo and this script are as
//               they were for the clips already there (their hash is in the
//               manifest), so a publish step can always run it.
// --jobs        recording processes per hand (each replays the script to its
//               part without capturing, then records that part).
// --codecs      what to encode: hevc, h264, av1 (AV1 is off by default: it
//               only plays where the browser decodes it in hardware, and
//               was barely smaller than HEVC here).
// --only        with --phase encode: only one hand's steps [a, b)
//               (mode:a:b), and nothing after the encoding. Each slice can be
//               encoded on a machine of its own; a last --phase encode with
//               every file there encodes nothing more and writes the rest.
// --profile     with --part: where each frame's time goes, every 60 frames.
// --gpu         with the plan: record with Chrome drawing on the Mac's GPU,
//               where it can (about twice as fast; not quite the same pixels).
// --phase parts --jobs N: how to split the recording between N machines
//               at once (GitHub's Macs), as JSON. See README.md.
// --print-source  prints the hash of what the clips are made from, and stops.
// --work        where the build, the plan, the lossless masters and the
//               logs go (default: the system's temp folder). The masters let
//               the delivery files be encoded again (--phase encode) without
//               recording again.
//
// Time is Stageshow's virtual clock, as in the demo's own tests: the same run
// gives the same frames every time (the level meters aside, which follow the
// engine's own clock and can differ by a few levels from run to run).
//
// 1. Build the demo (vite, demo/vite.config.js) into the work folder.
// 2. Plan. Each hand plays the script; hero.jsx reports when each step
//    starts (mark()) and when the app answers in it (acted()), hooks that
//    only do anything when a recorder sets window.__heroAlign. From that,
//    each step gets one length for both hands and each hand a wait at its
//    start, so the app answers at the same moment in both and every step
//    ends on the same app (checked: the engine at every boundary must match
//    between the hands, play heads within POS_TOLERANCE). Rounds until it
//    holds.
// 3. The loop. The set never ends and never quite repeats: decks trade
//    sides each mix, the two routines alternate, the set is three records,
//    so the app comes round every six mixes (CYCLE_MIXES), but each mix's
//    Sync lines the new record up on the beat of the one playing, so the
//    play heads come round a little later each time (the cycle isn't a
//    whole number of beats). The last step of the cycle is lengthened by
//    the fraction of a beat that makes it come round exactly; then the
//    cycle's first boundary and the next cycle's first are compared, in the
//    engine and in pixels. The clips are that cycle, from LOOP_FROM steps
//    in (the first mixes start from the set-up, not from the cycle), so the
//    player loops it without a seam.
// 4. Record, each hand in --jobs parts at once. Each frame, in layers:
//      app   the app alone, flat (the page tips it back itself in the
//            controller hand), without the controller or the link lines.
//            In the mouse hand twice: with the arrow (appc, what plays) and
//            without (app, its twin, crossed to when the hand switches
//            mid-step).
//      ctl   the controller alone in its box (and the controller hand's
//            fingertip on it, which goes when the controller does).
//    and a timeline: the music's level and the link lines. Each layer of a
//    step is piped into a lossless master (H.264 RGB, crf 0).
// 5. Encode: each master to HEVC and H.264 (and AV1 if asked), at 2x and
//    1x (manifest.small); the twin at 1x only (it shows for the rest of a
//    step at most, while the screen eases back). Plus the controller's
//    outline (controller-mask.png), a poster (the cycle's first frame, for
//    the page to show until the clips play: site/img/screenshot*), and
//    manifest.json (steps, timelines, boundaries that differ between the
//    hands, the controller's box and how it moves when it comes and goes,
//    the styles the player needs from the demo's own stylesheets).
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : a), []),
);
const APP = here('../..');
const OUT = path.resolve(args.out ?? here('../../../site/hero/clips'));
const IMG = path.resolve(here('../../../site/img'));
const WORK = path.resolve(args.work ?? path.join(os.tmpdir(), 'interlude-clips'));
const SITE = path.join(WORK, 'site');
const SCALE = 2;
const FPS = 30;
const FRAME = 1000 / FPS;
const PHASE = args.phase ?? 'all';
const MODES = ['mouse', 'controller'];
const JOBS = +(args.jobs ?? 3);
const CODECS = String(args.codecs ?? 'hevc,h264').split(',');
// The app comes round every six mixes (two routines, three records).
const CYCLE_MIXES = 6;
// Where the loop starts: the first mixes start from the set-up (Lucid, the
// decks' tabs as the app opens), so the cycle is taken from the third mix.
const LOOP_FROM_MIX = 2;
// Settling time added to every step, so whatever eases out at its end
// (a hover, a tooltip, a link fading) has gone in both hands.
const MARGIN = 300;
// How far apart the hands may leave a deck's play head at a step boundary
// (s): a mouse click lands on a frame and a controller key's pulse a little
// after one, so a stopped deck synced by each sits a few ms apart.
const POS_TOLERANCE = 0.012;
const W = 1440;
const H = 900;
fs.mkdirSync(WORK, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// What the clips are made from: if none of it changed, nor this script,
// the clips already there are up to date.
function sourceHash() {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    // (By code point, not locale: the same order on every machine.)
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      // (Tests don't change a frame.)
      else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) continue;
      else if (!/\.(md|png)$/.test(e.name) || p.includes(`${path.sep}src${path.sep}`)) { h.update(path.relative(APP, p)); h.update(fs.readFileSync(p)); }
    }
  };
  for (const d of ['src', 'demo']) walk(path.join(APP, d));
  for (const f of ['package-lock.json', 'svelte.config.js']) h.update(fs.readFileSync(path.join(APP, f)));
  h.update(JSON.stringify({ SCALE, FPS, CODECS, CYCLE_MIXES, LOOP_FROM_MIX }));
  return h.digest('hex').slice(0, 16);
}
const SOURCE = sourceHash();
if (args['print-source']) {
  console.log(SOURCE);
  process.exit(0);
}
const manifestFile = path.join(OUT, 'manifest.json');
if (args['if-changed'] && fs.existsSync(manifestFile)) {
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (m.source === SOURCE) {
    console.log(`clips: up to date (${SOURCE}), nothing to do`);
    process.exit(0);
  }
}

// 1. The demo, built into the work folder (never site/demo, which may be in use).
if (PHASE === 'all' || PHASE === 'plan') {
  log('building the demo');
  execFileSync('npx', ['vite', 'build', '--config', 'demo/vite.config.js', '--outDir', path.join(SITE, 'demo'), '--emptyOutDir', '--logLevel', 'warn'], { cwd: APP, stdio: 'inherit' });
}

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
    decks: engine.decks.map((d) => ({ loaded: d.loaded, playing: d.playing, pos: +d.position.toFixed(4), rate: +d.rate.toFixed(5), looping: d.looping, stems: d.stems, bpm: d.bpm })),
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
  // Steps the clock until the script has marked step k (or n frames).
  window.__until = async (k, n = 1e9) => {
    let f = 0;
    while (window.__heroAlign.i < k && f < n) { await window.__stageshow.clock.step(1); f++; }
    return f;
  };
})();`;

// The built demo, served as it is.
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
const CHROME = process.env.CHROMIUM || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
// A recording part draws the page at 2x for real (a 2x window), not
// emulated: a 2x capture of an emulated 2x page is drawn again at that scale
// for each capture, two to three times slower, for the same picture.
const NATIVE = !!args.part;
// With --gpu at the plan, drawn by the Mac's GPU (Metal), where Chrome has
// one: each capture costs about half what it does in Chrome's software
// renderer (its headless default). The two don't draw quite the same pixels
// (the controller, tipped back in 3D, most: the edge of its top a few pixels
// lower), so the plan says which one every part uses: the plan's Mac finds
// out (gpuOf), and a part on a Mac that draws otherwise stops rather than
// record a set that doesn't join up.
const GPU_ARGS = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];
/** What draws WebGL in a page: the GPU's name, or null for software or none. */
const rendererOf = (page) => page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const r = gl && gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  return r && !/swiftshader|software|llvmpipe/i.test(r) ? r : null;
});
async function gpuOf() {
  const b = await chromium.launch({ executablePath: CHROME, args: GPU_ARGS });
  try {
    const p = await b.newPage();
    return await rendererOf(p);
  } finally { await b.close(); }
}
// (Started when first needed: encoding a slice needs no browser.)
let browser = null;
const launch = async () => (browser ??= await chromium.launch({ executablePath: CHROME, args: NATIVE ? [...(plan.gpu ? GPU_ARGS : []), `--force-device-scale-factor=${SCALE}`, `--window-size=${W},${920 + +(process.env.REC_WINDOW_EXTRA ?? 87)}`] : [] }));

async function open(mode, plan, scale = SCALE) {
  const ctx = await (await launch()).newContext(NATIVE && scale === SCALE ? { viewport: null } : { viewport: { width: W, height: 920 }, deviceScaleFactor: scale });
  await ctx.addInitScript(install(plan));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?mode=${mode}`);
  // No transitions on the app's own box: the recorder lays it flat and back
  // between captures, and the screen's easing is the page's job.
  await page.addStyleTag({ content: '.app-host { transition: none !important; }' });
  const until = (k, n) => page.evaluate(([k, n]) => window.__until(k, n), [k, n]);
  const step = () => page.evaluate(() => window.__stageshow.clock.step(1));
  const marks = () => page.evaluate(() => window.__heroAlign.log);
  return { ctx, page, until, step, marks, errors };
}

/** Plays a hand until the script marks step `steps`; returns the log. */
async function play(mode, plan, steps) {
  const run = await open(mode, plan, 1);
  // (`steps` may be a function: how far to go, which can come down meanwhile.)
  const to = typeof steps === 'function' ? steps : () => steps;
  for (let k = 0; k < to(); ) {
    k = Math.min(k + 5, to());
    if ((await run.until(k)) >= 1e9) throw new Error(`${mode}: the script never got to step ${k}`);
  }
  const l = await run.marks();
  if (run.errors.length) console.warn(`${mode}: page errors: ${run.errors.join('; ')}`);
  await run.ctx.close();
  return l;
}

/**
 * Each step from a run's log: when it started, how long its own moves took
 * (to when the script reached the next step, before any wait there), when
 * the app last answered in it (a step is one move: hero.jsx marks each) (after the wait at its start), and the
 * engine at its start and end.
 */
const stepsOf = (l, plan, mode, n) => {
  const marks = l.filter((e) => e.type === 'mark');
  return marks.slice(0, n).map((m, i) => {
    const pre = plan?.pre[i]?.[mode] ?? 0;
    const acts = l.filter((e) => e.type === 'act' && e.i === i);
    const arrive = l.find((e) => e.type === 'arrive' && e.i === i);
    return { name: m.name, start: m.t, own: arrive.t - m.t - pre, act: acts.length ? acts[acts.length - 1].t - m.t - pre : 0, state: m.state, endState: marks[i + 1].state };
  });
};
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
const toFrame = (ms) => Math.round(ms / FRAME) * FRAME;

// 2 and 3. The plan.
const planFile = path.join(WORK, 'plan.json');
let plan;
if (PHASE === 'all' || PHASE === 'plan') {
  // How many steps make the cycle, and where it starts, from a first run
  // (far enough for two cycles). Meanwhile the other hand plays as far as
  // the first round needs, once that's known: the first round's runs.
  let need = 140;
  const [probeLog, controllerLog] = await Promise.all([
    play('mouse', null, 140).then((l) => {
      const s = l.filter((e) => e.type === 'mark').map((m, i) => (m.name === 'sync' ? i : -1)).filter((i) => i >= 0);
      need = s[LOOP_FROM_MIX + CYCLE_MIXES] + 1;
      return l;
    }),
    play('controller', null, () => need),
  ]);
  const first = { mouse: probeLog, controller: controllerLog };
  const probe = probeLog.filter((e) => e.type === 'mark');
  const mixStarts = probe.map((m, i) => (m.name === 'sync' ? i : -1)).filter((i) => i >= 0);
  const from = mixStarts[LOOP_FROM_MIX];
  const until = mixStarts[LOOP_FROM_MIX + CYCLE_MIXES];
  const names = probe.map((m) => m.name);
  const cycle = until - from;
  if (names.slice(from, until).join() !== names.slice(until, until + cycle).join()) throw new Error(`the script doesn't repeat every ${CYCLE_MIXES} mixes: ${names.join(' ')}`);
  // Steps planned: up to the start of the next cycle, and its first step.
  const N = until + 1;
  // Where the cycle is lengthened to come round on time: the step before its
  // last mix's Sync (the record that will be playing as the cycle comes
  // round is lined up on the beat of the one playing then; a little more
  // time before that moves where on the beat it starts, and nothing else).
  const padAt = mixStarts[LOOP_FROM_MIX + CYCLE_MIXES - 1] - 1;
  log(`cycle: steps ${from} to ${until} (${cycle} steps), planning ${N}`);
  let last = null;
  let pad = 0;
  for (let round = 0; ; round++) {
    if (round > 8) throw new Error('the hands never lined up, or the cycle never came round');
    const runs = {};
    const logs = {};
    await Promise.all(MODES.map(async (m) => { logs[m] = round ? await play(m, last, N) : first[m]; runs[m] = stepsOf(logs[m], last, m, N); }));
    const nm = runs.mouse.map((s) => s.name).join();
    if (nm !== runs.controller.map((s) => s.name).join()) throw new Error(`the hands play different steps: ${nm} / ${runs.controller.map((s) => s.name)}`);
    if (last) {
      let bad = 0;
      for (let i = 0; i < N; i++) {
        const [a, b] = compare(runs.mouse[i].endState, runs.controller[i].endState);
        if (a !== b) {
          bad++;
          log(`  step ${i} ${last.names[i]} ends differently in the hands`);
          log('    mouse     ', a);
          log('    controller', b);
        }
      }
      if (!bad) {
        // Lined up. Does the cycle come round? (Every hand, every deck: the
        // play heads at its start and at the next one's.)
        const s0 = runs.mouse[from].state;
        const s1 = runs.mouse[until].state;
        const [a, b, gap] = compare(s0, s1);
        // How much later the play heads come round, in the set's own time.
        const drift = s0.decks.map((d, i) => (d.playing ? (s1.decks[i].pos - d.pos) / (s1.decks[i].rate || 1) : null)).filter((x) => x !== null);
        const d = drift.length ? drift.reduce((x, y) => x + y) / drift.length : 0;
        log(`round ${round}: lined up; the cycle comes round ${(d * 1000).toFixed(1)} ms late${a === b ? '' : ' and differently otherwise'}`);
        // (Within 3 ms: a tenth of a pixel on the scrolling waveforms.)
        if (Math.abs(d) <= 0.003 && compareLoose(s0, s1)) break;
        if (round > 6) throw new Error(`the cycle won't come round: ${(d * 1000).toFixed(1)} ms`);
        if (a !== b && !compareLoose(s0, s1)) {
          log('    start', a);
          log('    next ', b);
        }
        // Lengthen the step before the last mix's Sync by the part of a beat
        // that brings it round on time (a whole number of frames: the beat is
        // 900/59 of a frame at 118 BPM, so a 59th of a frame can be reached,
        // 0.56 ms).
        const deck = s0.decks.find((x) => x.playing);
        const beat = 60 / (deck.bpm * deck.rate);
        let best = null;
        for (let f = 0; f < 120; f++) {
          const r = (((d + f / FPS) % beat) + beat) % beat;
          const e = Math.min(r, beat - r);
          if (!best || e < best.e - 1e-9) best = { f, e };
        }
        if (best.f === 0) throw new Error(`the cycle drifts ${(d * 1000).toFixed(1)} ms and no padding brings it round`);
        pad += best.f;
        last.len[padAt] += best.f * FRAME;
        last.pad = pad;
        log(`  step ${padAt} ${best.f} frames longer (${pad} in all); expect ${(best.e * 1000).toFixed(1)} ms`);
        continue;
      }
    }
    const pre = [];
    const len = [];
    for (let i = 0; i < N; i++) {
      // Where the app answers counting the wait before: the later hand's
      // moment is the one both meet, to the frame.
      const at = Object.fromEntries(MODES.map((m) => [m, runs[m][i].act + (last?.pre[i][m] ?? 0)]));
      const act = Math.max(...Object.values(at));
      pre[i] = Object.fromEntries(MODES.map((m) => [m, (last?.pre[i][m] ?? 0) + toFrame(act - at[m])]));
      len[i] = ceilFrame(Math.max(...MODES.map((m) => runs[m][i].own + pre[i][m])) + MARGIN) + (i === padAt ? pad * FRAME : 0);
    }
    const t0 = last?.t0 ?? 1000 + ceilFrame(Math.max(...MODES.map((m) => runs[m][0].start)) - 1000 + FRAME);
    last = { t0, pre, len, names: runs.mouse.map((s) => s.name), from, until, padAt, pad };
    log(`round ${round}: planned`);
  }
  plan = last;
  plan.gpu = args.gpu ? await gpuOf().catch(() => null) : null;
  log(`recording draws with ${plan.gpu ?? 'software'}`);
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 1));
} else plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));

/** The same app apart from the play heads (they're compared on their own). */
function compareLoose(x, y) {
  const strip = (s) => JSON.stringify({ ...s, decks: s.decks.map(({ pos, ...d }) => d) });
  return strip(x) === strip(y);
}

const bounds = [plan.t0];
for (const l of plan.len) bounds.push(bounds[bounds.length - 1] + l);
const FROM = plan.from;
const UNTIL = plan.until;
const STEPS = Array.from({ length: UNTIL - FROM }, (_, j) => FROM + j);
const frames = (k) => Math.round(plan.len[k] / FRAME);
const masters = path.join(WORK, 'masters');
const boundsDir = path.join(WORK, 'bounds');
fs.mkdirSync(masters, { recursive: true });
fs.mkdirSync(boundsDir, { recursive: true });

/** ffmpeg reading PNG frames on stdin. */
function encoder(file, codecArgs) {
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...codecArgs, file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c} for ${file}`)) : res())));
  return { write: (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r))), end: () => (ff.stdin.end(), done) };
}
// (Lean: no lookahead or B-frames and two threads, so several recording at
// once don't hold gigabytes of 2880 x 1800 frames between them.)
const MASTER = ['-c:v', 'libx264rgb', '-preset', 'veryfast', '-crf', '0', '-g', '300', '-bf', '0', '-rc-lookahead', '0', '-threads', '2'];
const layersOf = (mode) => (mode === 'mouse' ? [['appc', 'app+cursor'], ['app', 'app'], ['ctl', 'ctl']] : [['app', 'app'], ['ctl', 'ctl']]);
const masterOf = (mode, k, layer) => path.join(masters, `${mode}-${k}.${layer}.mkv`);

// 4. Record: one hand's steps [a, b), in a process of its own (this one,
// run with --part).
// (--profile: milliseconds spent in each kind of work.)
const spent = {};
const timed = async (k, p) => {
  if (!args.profile) return p;
  const t = performance.now();
  const r = await p;
  spent[k] = (spent[k] ?? 0) + performance.now() - t;
  return r;
};
async function recordPart(mode, a, b) {
  const run = await open(mode, plan);
  const { page } = run;
  const cdp = await run.ctx.newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.evaluate(() => { const s = document.createElement('style'); s.id = 'rec-hide'; document.head.append(s); });
  const hide = (css) => timed('hide', page.evaluate((css) => (document.getElementById('rec-hide').textContent = css), css));
  // (At the page's own pixel ratio, within the viewport: no re-layout per capture.)
  const shot = async (clip, k = 1) => (await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { ...clip, scale: k } })).data;
  let vp = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  // (The window is the page and Chrome's own bars, which aren't the same
  // height everywhere: if the page came out another size, by the difference.)
  if (vp[0] !== W || vp[1] !== 920) {
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + W - vp[0], height: bounds.height + 920 - vp[1] } });
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [W, 920], { timeout: 5000 }).catch(() => {});
    vp = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  }
  if (vp.join() !== `${W},920,${SCALE}`) throw new Error(`the window came out ${vp.join()}, not ${W} x 920 at ${SCALE}x`);
  const gpu = await rendererOf(page);
  if (gpu !== (plan.gpu ?? null)) throw new Error(`this Mac draws with ${gpu ?? 'software'}, the plan's with ${plan.gpu ?? 'software'}: the parts wouldn't join up`);
  log(`drawing with ${gpu ?? 'software'}`);
  // To the part's first step, without capturing.
  const t = performance.now();
  log(`to step ${a}: ${await run.until(a)} frames in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  // The controller's box at rest, with room for its shadow, on whole device pixels.
  const box = await page.evaluate((scale) => {
    const r = document.querySelector('.desk .hw').getBoundingClientRect();
    const pad = 28;
    const even = (v) => Math.round((v * scale) / 2) * (2 / scale);
    const x = even(Math.max(0, r.left - pad));
    const y = even(Math.max(0, r.top - pad));
    return { x, y, width: even(Math.min(1440, r.right + pad) - x), height: even(Math.min(920, r.bottom + pad + 12) - y) };
  }, SCALE);
  const info = { box };
  if (mode === 'controller' && a === FROM) {
    // Its outline at rest, without a fingertip, for the mask; and where it
    // is when it's away (controller.css: --hw-from above, scale 0.985 before
    // the tilt), so the page can move the clip the same way.
    await hide('.app-host, .ss-cursor, svg.links { visibility: hidden !important; }');
    fs.writeFileSync(path.join(WORK, 'mask.png'), Buffer.from(await shot(box), 'base64'));
    info.away = await page.evaluate(() => {
      const hw = document.querySelector('.desk .hw');
      const r0 = hw.getBoundingClientRect();
      const was = hw.getAttribute('style') ?? '';
      const from = -100;
      hw.style.transition = 'none';
      hw.style.transform = getComputedStyle(hw).transform === 'none' ? '' : `translateY(${from}px) ${getComputedStyle(hw).transform} scale(0.985)`;
      const r1 = hw.getBoundingClientRect();
      hw.setAttribute('style', was);
      // Per px of --hw-from: how far its middle moves; and how much smaller it is.
      return { rest: [r0.left, r0.top, r0.width, r0.height], perPx: ((r1.top + r1.height / 2) - (r0.top + r0.height / 2)) / from, dx: ((r1.left + r1.width / 2) - (r0.left + r0.width / 2)) / from, scale: r1.width / r0.width };
    });
  }
  const layers = layersOf(mode);
  let k = a;
  let f = 0;
  let enc = null;
  let tl = null;
  const timelines = {};
  const open1 = (k) => Object.fromEntries(layers.map(([l]) => [l, encoder(masterOf(mode, k, l), MASTER)]));
  // What each capture leaves out (the rest of the page shows as it is).
  const only = {
    // The controller alone: with the controller hand's fingertip on it,
    // without the mouse's arrow.
    ctl: `.app-host, svg.links${mode === 'mouse' ? ', .ss-cursor' : ''} { visibility: hidden !important; }`,
    // The app alone, flat; and in the mouse hand with the arrow too.
    app: '.desk, .ss-cursor, svg.links { visibility: hidden !important; } .app-host { transform: none !important; }',
    appc: '.desk, svg.links { visibility: hidden !important; } .app-host { transform: none !important; }',
  };
  // (Each page call does what it can at once: a call costs a few ms.)
  let now = await page.evaluate(() => performance.now());
  let shots = 0;
  let t0 = null;
  for (;;) {
    while (k < b && now >= bounds[k + 1] - 0.5) {
      if (enc) {
        await Promise.all(Object.values(enc).map((e) => e.end()));
        // (Done: kept, so a recording stopped partway can carry on from here.)
        fs.writeFileSync(path.join(WORK, `timeline-${mode}-${k}.json`), JSON.stringify(timelines[k]));
      }
      enc = null;
      k++;
      f = 0;
    }
    // Recorded already, by an earlier run: on to the next step without capturing.
    if (k < b && !enc && fs.existsSync(path.join(WORK, `timeline-${mode}-${k}.json`))) {
      await run.until(k + 1);
      now = await page.evaluate(() => performance.now());
      continue;
    }
    if (k >= b) {
      // The next boundary too (the next part's first frame, or the next
      // cycle's): to compare.
      await hide(only.app);
      fs.writeFileSync(path.join(boundsDir, `${mode}-${b}-end.png`), Buffer.from(await shot({ x: 0, y: 0, width: W, height: H }, mode === 'mouse' ? 1 / SCALE : 1), 'base64'));
      break;
    }
    f = Math.round((now - bounds[k]) / FRAME);
    if (!enc) {
      enc = open1(k);
      tl = timelines[k] = { level: [], links: [] };
    }
    // The lines, and where their two rings are: the controller's in its
    // box, as the controller's clip has it; the app's flat, as the app's clip
    // has it (measured below); and where on each ring the line meets it.
    // The page draws each line from its rings, wherever it puts the clips.
    // Then the page as the controller's capture has it.
    const t = await timed('lines', page.evaluate(([box, css]) => {
      const h = document.getElementById('hero').getBoundingClientRect();
      const rect = (m) => { const r = m.getBoundingClientRect(); return [r.left - h.left, r.top - h.top, r.width, r.height]; };
      const marks = [...document.querySelectorAll('.link-mark')];
      const hw = marks.find((m) => m.closest('.desk')), app = marks.find((m) => m.closest('.app-host'));
      const r = (v) => Math.round(v * 10) / 10;
      const links = [...document.querySelectorAll('svg.links > path')].map((p) => {
        const cs = getComputedStyle(p);
        const l = [p.getAttribute('class'), p.getAttribute('d'), +(+cs.opacity).toFixed(3), cs.strokeDasharray, cs.strokeDashoffset];
        const n = p.getAttribute('d')?.match(/-?[\d.]+/g)?.map(Number);
        if (hw && app && n?.length === 8) {
          const a = rect(hw), b = rect(app);
          const uv = (x, y, q) => [r((x - q[0]) / Math.max(1, q[2]) * 1000) / 1000, r((y - q[1]) / Math.max(1, q[3]) * 1000) / 1000];
          l.push([...uv(n[0], n[1], a), r(a[0] - box.x), r(a[1] - box.y), r(a[2]), r(a[3]), ...uv(n[6], n[7], b)]);
        }
        return l;
      });
      const level = Math.round(window.__level * 1000) / 1000;
      document.getElementById('rec-hide').textContent = css;
      return { level, links };
    }, [box, only.ctl]));
    tl.level[f] = t.level;
    tl.links[f] = t.links.length ? t.links : 0;
    // (Into the masters while the next capture is taken.)
    const writes = [];
    writes.push(enc.ctl.write(Buffer.from(await timed('shot ctl', shot(box)), 'base64')));
    // The app: the page as its capture has it, and the app's ring, flat.
    const ring = t.links.some((l) => l[5]);
    const at = await timed('hide', page.evaluate(([css, ring]) => {
      document.getElementById('rec-hide').textContent = css;
      if (!ring) return null;
      const h = document.getElementById('hero').getBoundingClientRect();
      const m = [...document.querySelectorAll('.link-mark')].find((e) => e.closest('.app-host'));
      const r = m?.getBoundingClientRect();
      return r && [r.left - h.left, r.top - h.top, r.width, r.height].map((v) => Math.round(v * 10) / 10);
    }, [only.app, ring]));
    if (ring) for (const l of t.links) if (l[5]) { if (at) l[5].push(...at); else l.length = 5; }
    // (The mouse hand's flat one is its twin, only ever played at 1x: taken at 1x.)
    const flat = Buffer.from(await timed('shot app', shot({ x: 0, y: 0, width: W, height: H }, mode === 'mouse' ? 1 / SCALE : 1)), 'base64');
    writes.push(enc.app.write(flat));
    if (f === 0) fs.writeFileSync(path.join(boundsDir, `${mode}-${k}.png`), flat);
    if (mode === 'mouse') {
      await hide(only.appc);
      writes.push(enc.appc.write(Buffer.from(await timed('shot app+cursor', shot({ x: 0, y: 0, width: W, height: H })), 'base64')));
    }
    // (--profile: and the frames so far, and their time in all.)
    shots++;
    t0 ??= performance.now();
    if (f % 60 === 0) log(`${mode} step ${k} frame ${f}/${frames(k)}`, args.profile ? JSON.stringify({ frames: shots, all: Math.round(performance.now() - t0), ...Object.fromEntries(Object.entries(spent).map(([x, v]) => [x, Math.round(v)])) }) : '');
    // The whole page again, and the next frame.
    [now] = await Promise.all([
      timed('step', page.evaluate(async () => {
        document.getElementById('rec-hide').textContent = '';
        await window.__stageshow.clock.step(1);
        return performance.now();
      })),
      timed('write', Promise.all(writes)),
    ]);
  }
  if (args.profile) log('in all', JSON.stringify({ frames: shots, all: Math.round(performance.now() - t0), ...Object.fromEntries(Object.entries(spent).map(([x, v]) => [x, Math.round(v)])) }));
  if (run.errors.length) console.warn(`${mode}: page errors: ${run.errors.join('; ')}`);
  fs.writeFileSync(path.join(WORK, `part-${mode}-${a}.json`), JSON.stringify(info));
  await run.ctx.close();
}

// --phase parts --jobs N: how a run on GitHub splits the recording (and
// the encoding) between N Macs at once, as JSON. Each Mac gets steps of
// about the same cost, in recorded mouse frames: a frame costs its hand's
// COST; starting a range, START (Chrome, the page) and FF a frame before it
// (replayed without capturing to get there). So a Mac may record the end of
// one hand and the start of the other, one after the other; and each Mac's
// masters are encoded in up to ENC slices, a Linux runner each.
if (PHASE === 'parts') {
  // (Measured: GitHub's Macs in software, a mouse frame about 1 s, a
  // controller one 0.85 s, a replayed one 10 ms, 40 s to the first; with the
  // GPU, here, a mouse frame half that, the controller's 0.65 of it.)
  const COST = plan.gpu ? { mouse: 1, controller: 0.7 } : { mouse: 1, controller: 0.85 };
  const FF = plan.gpu ? 0.03 : 0.01;
  const START = plan.gpu ? 80 : 40;
  // (At most 4: the workflow uploads four slices a Mac.)
  const ENC = Math.max(1, Math.min(4, +(args.enc ?? 4)));
  const MACS = Math.max(1, Math.min(5, JOBS));
  const units = MODES.flatMap((mode) => STEPS.map((k) => ({ mode, k, cost: frames(k) * COST[mode] })));
  // (The frames before step k, replayed to get there.)
  const ff = (k) => START + (bounds[k] / FRAME) * FF;
  const fit = (cap) => {
    const jobs = [];
    let cur = null;
    for (const u of units) {
      const start = !cur || cur.last.mode !== u.mode || cur.last.k !== u.k - 1;
      const add = u.cost + (start ? ff(u.k) : 0);
      if (!cur || (cur.cost + add > cap && cur.cost > 0)) {
        cur = { ranges: [], cost: 0, last: null };
        jobs.push(cur);
      }
      const c = cur.cost === 0 ? u.cost + ff(u.k) : add;
      const r = cur.ranges.at(-1);
      if (r && r.mode === u.mode && r.b === u.k) r.b++;
      else cur.ranges.push({ mode: u.mode, a: u.k, b: u.k + 1 });
      cur.cost += c;
      cur.last = u;
    }
    return jobs;
  };
  const total = units.reduce((x, u) => x + u.cost, 0);
  let lo = total / JOBS;
  let hi = total + ff(UNTIL);
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fit(mid).length <= MACS) hi = mid; else lo = mid; }
  const jobs = fit(hi).map((j, id) => {
    // Slices for the encoders: by frames, within a range, at most ENC a Mac.
    const fr = (r) => STEPS.filter((k) => k >= r.a && k < r.b).reduce((x, k) => x + frames(k), 0);
    const all = j.ranges.reduce((x, r) => x + fr(r), 0);
    let left = ENC;
    const enc = j.ranges.flatMap((r, i) => {
      // (Each range at least one; the ranges after it one each, at least.)
      const rest = j.ranges.length - 1 - i;
      const n = Math.max(1, Math.min(r.b - r.a, left - rest, i === j.ranges.length - 1 ? left : Math.round((ENC * fr(r)) / all)));
      left -= n;
      const out = [];
      let a = r.a;
      let acc = 0;
      for (let k = r.a; k < r.b; k++) {
        acc += frames(k);
        if (acc >= (fr(r) / n) * (out.length + 1) - 1 || k === r.b - 1) { out.push(`${r.mode}:${a}:${k + 1}`); a = k + 1; }
      }
      return out;
    });
    // (Every step of the Mac's in one slice, and no more slices than ENC.)
    const sliced = enc.flatMap((x) => { const [m, a, b] = x.split(':'); return Array.from({ length: b - a }, (_, i) => `${m}:${+a + i}`); });
    const steps = j.ranges.flatMap((r) => Array.from({ length: r.b - r.a }, (_, i) => `${r.mode}:${r.a + i}`));
    if (enc.length > ENC || sliced.join() !== steps.join()) throw new Error(`the encoders' slices don't fit Mac ${id}: ${enc.join(' ')} for ${steps.join(' ')}`);
    return { id, ranges: j.ranges.map((r) => `${r.mode}:${r.a}:${r.b}`).join(' '), enc, cost: Math.round(j.cost) };
  });
  const encodes = jobs.flatMap((j) => j.enc.map((only, i) => ({ job: j.id, i, only })));
  console.log(JSON.stringify({ jobs, encodes }));
  server.close();
  process.exit(0);
}

if (args.part) {
  const [mode, a, b] = String(args.part).split(':');
  await recordPart(mode, +a, +b);
  await browser?.close();
  server.close();
  process.exit(0);
}

if (PHASE === 'all' || PHASE === 'record') {
  // Each hand in JOBS parts of about the same number of frames, each its own process.
  const total = STEPS.reduce((s, k) => s + frames(k), 0);
  const parts = [];
  for (const mode of MODES) {
    let a = FROM;
    let acc = 0;
    for (let k = FROM; k < UNTIL; k++) {
      acc += frames(k);
      if (acc >= (total / JOBS) * (parts.filter((p) => p.mode === mode).length + 1) - 1 || k === UNTIL - 1) {
        parts.push({ mode, a, b: k + 1 });
        a = k + 1;
      }
    }
  }
  log(`recording ${total} frames a hand in ${parts.length} parts`);
  await Promise.all(parts.map((p) => new Promise((ok, fail) => {
    const out = fs.openSync(path.join(WORK, `part-${p.mode}-${p.a}.log`), 'w');
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url), '--part', `${p.mode}:${p.a}:${p.b}`, '--work', WORK, '--out', OUT, '--phase', 'part', '--codecs', CODECS.join(',')], { stdio: ['ignore', out, out] });
    c.on('close', (code) => (code ? fail(new Error(`part ${p.mode} ${p.a}-${p.b} failed: see ${WORK}/part-${p.mode}-${p.a}.log`)) : ok()));
  })));
  log('recorded');
}

// 5. Encode, and the manifest.
// (Each file takes seconds to a minute. On GitHub's Linux runners one ffmpeg
// in a few hundred has hung for good, all its work done but never exiting:
// one that runs past FF_LIMIT is stopped and run again, twice at most.)
const FF_LIMIT = 6 * 60e3;
function ffmpegOnce(a) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
    let stuck = false;
    const t = setTimeout(() => { stuck = true; p.kill('SIGKILL'); }, FF_LIMIT);
    p.on('close', (c) => {
      clearTimeout(t);
      if (stuck) fail(Object.assign(new Error(`ffmpeg ran past ${FF_LIMIT / 60e3} minutes: ${a.join(' ')}`), { stuck }));
      else if (c) fail(new Error(`ffmpeg exited ${c}: ${a.join(' ')}`));
      else ok();
    });
  });
}
async function ffmpeg(a) {
  for (let k = 0; ; k++) {
    try { return await ffmpegOnce(a); } catch (e) {
      if (!e.stuck || k === 2) throw e;
      log(`${e.message.split(':')[0]}, again`);
    }
  }
}
// HEVC on a Mac by the media engine (VideoToolbox): measured on a 2x app
// clip, quality 66 gives the size and SSIM of x265 fast at crf 26 (about
// 440 KB, 0.992) ten times faster. Elsewhere, or with --software, x265.
const VT = process.platform === 'darwin' && !args.software;
function encode(input, file, codec, gop, width = 0) {
  const vf = ['-vf', `${width ? `scale=${width}:-2:flags=lanczos,` : ''}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`];
  const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  const c = {
    av1: ['-c:v', 'libsvtav1', '-preset', '6', '-crf', '38', '-g', String(gop), '-svtav1-params', 'log-level=0'],
    hevc: VT ? ['-c:v', 'hevc_videotoolbox', '-q:v', '66', '-profile:v', 'main', '-g', String(gop), '-tag:v', 'hvc1'] : ['-c:v', 'libx265', '-preset', 'fast', '-crf', '26', '-g', String(gop), '-tag:v', 'hvc1', '-x265-params', 'log-level=error:pools=4'],
    // (At 2x, x264's faster preset: a tenth bigger than medium, a quarter of the time.)
    h264: ['-c:v', 'libx264', '-preset', width ? 'medium' : 'faster', '-crf', '24', '-g', String(gop), '-tune', 'animation', '-threads', '4'],
  }[codec];
  return ffmpeg(['-i', input, ...vf, ...c, ...tags, '-an', '-movflags', '+faststart', file]);
}
/** Runs the jobs, `n` at a time. */
async function pool(jobs, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) await jobs[i++](); }));
}

if (PHASE === 'all' || PHASE === 'encode') {
  fs.mkdirSync(OUT, { recursive: true });
  const infoFile = path.join(WORK, `part-controller-${FROM}.json`);
  // (Still recording, --partial: the controller box's width from its master.)
  const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : { box: { width: +execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', masterOf('controller', FROM, 'ctl')]).toString() / SCALE } };
  const box = info.box;
  const jobs = [];
  // (--partial: only the steps recorded so far, while the rest record; files
  // already encoded are kept, unless --fresh.)
  const have = (f) => !args.fresh && fs.existsSync(f) && fs.statSync(f).size > 0;
  const enc1 = (input, file, ...a) => () => (have(file) ? null : encode(input, file + '.part.mp4', ...a).then(() => fs.renameSync(file + '.part.mp4', file)));
  const [onlyMode, onlyA, onlyB] = args.only ? String(args.only).split(':') : [];
  for (const mode of MODES) {
    if (onlyMode && mode !== onlyMode) continue;
    for (const k of STEPS) {
      if (onlyMode && (k < +onlyA || k >= +onlyB)) continue;
      if (args.partial && !fs.existsSync(path.join(WORK, `timeline-${mode}-${k}.json`))) continue;
      const name = `${mode}-${k - FROM}`;
      for (const [layer] of layersOf(mode)) {
        const out = layer === 'appc' ? 'app' : mode === 'mouse' && layer === 'app' ? 'twin' : layer;
        for (const codec of CODECS) {
          const width = layer === 'ctl' ? Math.round(box.width) : W;
          // The twin: at 1x only, and a keyframe every 2 s so it can start partway through.
          if (out !== 'twin') jobs.push(enc1(masterOf(mode, k, layer), path.join(OUT, `${name}.${out}.${codec}.mp4`), codec, 300));
          jobs.push(enc1(masterOf(mode, k, layer), path.join(OUT, `${name}.${out}@1x.${codec}.mp4`), codec, out === 'twin' ? 60 : 300, width));
        }
      }
    }
  }
  log(`encoding ${jobs.length} files`);
  let done = 0;
  await pool(jobs.map((j) => async () => { await j(); if (++done % 20 === 0) log(`  ${done}/${jobs.length}`); }), +(args.encoders ?? Math.max(2, Math.floor(os.cpus().length / 3))));
  if (args.partial || args.only) {
    log(args.only ? `encoded ${args.only}` : 'encoded what was recorded so far');
    await browser?.close();
    server.close();
    process.exit(0);
  }
  // (White where the controller is, as see-through as it is there: its shadow
  // shows through at its own strength. An alpha mask, which every browser takes.)
  await ffmpeg(['-i', path.join(WORK, 'mask.png'), '-vf', 'format=rgba,lutrgb=r=255:g=255:b=255', path.join(OUT, 'controller-mask.png')]);

  // Which boundaries look different between the hands (beyond the meters'
  // run-to-run flicker): the player blends there rather than cutting when it
  // swaps hands. And the cycle's own seam, and the joins between parts.
  const diff = (x, y) => {
    try {
      const r = execFileSync('magick', [x, '-resize', '1440x900!', y, '-resize', '1440x900!', '-compose', 'difference', '-composite', '-threshold', '6%', '-morphology', 'open', 'square:2', '-format', '%[fx:mean*w*h]', 'info:'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      return Math.round(+r);
    } catch { return -1; }
  };
  const steps = STEPS.map((k) => ({ name: plan.names[k], frames: frames(k) }));
  const report = [];
  for (const k of STEPS) {
    const n = diff(path.join(boundsDir, `mouse-${k}.png`), path.join(boundsDir, `controller-${k}.png`));
    steps[k - FROM].blend = n > 200;
    report.push(`${k - FROM} ${plan.names[k]}: ${n} px differ between the hands`);
  }
  for (const mode of MODES) {
    for (const f of fs.readdirSync(boundsDir).filter((x) => x.startsWith(`${mode}-`) && x.endsWith('-end.png'))) {
      const b = +f.split('-')[1];
      const other = b === UNTIL ? `${mode}-${FROM}.png` : `${mode}-${b}.png`;
      report.push(`${mode} ${b === UNTIL ? 'loop seam' : `join at ${b - FROM}`}: ${diff(path.join(boundsDir, f), path.join(boundsDir, other))} px differ`);
    }
  }
  fs.writeFileSync(path.join(WORK, 'bounds.txt'), report.join('\n'));
  log(report.join('\n'));

  // The poster: the cycle's first frame, flat, without the arrow.
  const first = path.join(boundsDir, `controller-${FROM}.png`);
  await ffmpeg(['-i', first, '-q:v', '3', path.join(IMG, 'screenshot.jpg')]);
  await ffmpeg(['-i', first, '-vf', 'scale=1440:-2:flags=lanczos', '-q:v', '3', path.join(IMG, 'screenshot-1x.jpg')]);
  for (const [w, f] of [[2880, 'screenshot.avif'], [1440, 'screenshot-1x.avif']]) {
    await ffmpeg(['-i', first, '-vf', `scale=${w}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libsvtav1', '-crf', '30', '-frames:v', '1', '-svtav1-params', 'log-level=0', path.join(IMG, f)]);
  }

  // Timelines: per hand, one file: levels as thousandths; link lines only on
  // the frames that have them, each [class, path, opacity, dash, offset,
  // ends] (ends: where the line meets the controller's ring [u, v] and that
  // ring in the controller's box [x, y, w, h], then the app's ring the same
  // way, flat), with
  // the classes and paths in tables (a few hundred paths, used again and
  // again) and numbers to a tenth of a pixel.
  for (const mode of MODES) {
    const classes = [];
    const paths = [];
    const idx = (list, v) => { let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
    const tenth = (str) => String(str).replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 10) / 10));
    const steps = STEPS.map((k) => {
      const t = JSON.parse(fs.readFileSync(path.join(WORK, `timeline-${mode}-${k}.json`), 'utf8'));
      const links = {};
      t.links.forEach((l, f) => { if (l) links[f] = l.map(([c, d, op, da, dof, ends]) => [idx(classes, c), idx(paths, tenth(d)), op, tenth(da), tenth(dof), ...(ends?.length === 12 ? [ends] : [])]); });
      return { level: t.level.map((x) => Math.round((x ?? 0) * 1000)), links };
    });
    fs.writeFileSync(path.join(OUT, `${mode}.json`), JSON.stringify({ classes, paths, steps }));
  }
  const manifest = {
    source: SOURCE, fps: FPS, scale: SCALE, codecs: CODECS, small: '@1x', steps,
    modes: { mouse: { play: 'app', twin: 'twin' }, controller: { play: 'app', twin: null } },
    controllerBox: box, controllerAway: info.away, css: await extractCss(),
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  const bytes = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  log(`wrote ${OUT}: ${fs.readdirSync(OUT).length} files, ${(bytes / 1e6).toFixed(1)} MB`);
  if (!args.keep) fs.rmSync(masters, { recursive: true, force: true });
}

async function extractCss() {
  const run = await open('mouse', null, 1);
  const css = await run.page.evaluate(() => {
    const keep = /svg\.links|\.link-line|\.link-spark/;
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

await browser?.close();
server.close();
// (After a plan, something can keep Node waiting with nothing left to do.)
process.exit(0);
