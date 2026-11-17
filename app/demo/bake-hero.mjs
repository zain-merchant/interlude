// Records the website's hero to video, from the real demo: the same
// site/demo/hero.html the page embeds, the app on its simulated engine and
// the Stageshow script playing it, so the video is whatever the app looks
// like today. Run after `npm run build:site` (`npm run bake:hero` does both)
// whenever the app's UI changes, and commit what it writes to site/hero.
//
// Time is Stageshow's virtual clock (stageshow/clock.ts): it only moves when
// this script steps it, one frame at a time, so every frame is rendered in
// full however slow the machine, and a recording comes out the same every
// time. The set never ends, so the recording starts where a mix begins and
// runs for whole mixes (--mixes), as many as it takes for everything to
// come round to where it started, so the video loops without a seam: the
// decks trade sides every mix, the mixes alternate between two routines,
// and the set is three records, so six.
//
//   node demo/bake-hero.mjs [--mode mouse|controller|both] [--mixes 6]
//                           [--scale 1.5] [--fps 30] [--seconds N]
//
// Writes into site/hero/ hero-mouse.mp4 (H.264, about 6 MB for the 108 s
// loop) and hero-mouse.json, the music's level for each frame, which the
// page's glow and record follow. The page plays only that one. The
// controller version (--mode controller) needs see-through video, as the
// page shows round the eased-back app: hero-controller.webm (VP9 with
// alpha) and .mov (HEVC with alpha, needs ffmpeg on a Mac). Tried in
// November 2026: its loop runs four minutes, 14 MB as VP9 and 45 MB as
// HEVC, and Chrome spent more decoding the VP9 than running the live app,
// so the page plays that version live.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
// Its browser, once: `npx playwright-core install chromium-headless-shell`.
import { chromium } from 'playwright-core';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : a), []),
);
const modes = args.mode === 'both' ? ['mouse', 'controller'] : [args.mode ?? 'mouse'];
const FPS = +(args.fps ?? 30);
const SCALE = +(args.scale ?? 1.5);
const MIXES = +(args.mixes ?? 6);
const SECONDS = args.seconds ? +args.seconds : null;
// --site: another copy of the site to record from and write into.
const SITE = path.resolve(args.site ?? here('../../site'));
// Next to the site's other files, not in demo/, which build:site empties.
const OUT = path.join(SITE, 'hero');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(path.join(SITE, 'demo', 'hero.html'))) {
  console.error('No site/demo/hero.html: run `npm run build:site` first.');
  process.exit(1);
}

// The virtual clock, from Stageshow's own source, as a script for the page.
const clockSrc = ts.transpileModule(fs.readFileSync(here('stageshow/clock.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, '');
// And the music's level, which the hero reports to the page around it (here, to itself).
const install = `(() => { ${clockSrc}; installVirtualClock({ fps: ${FPS} }); })();
window.__level = 0; addEventListener('message', (e) => { if (e.data?.interlude === 'level') window.__level = e.data.level; });`;

// The site, served as it is.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/demo/hero.html`;

// CHROMIUM: a browser to use instead of the one playwright-core installed.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

/** Runs ffmpeg reading PNG frames on stdin. */
function encoder(file, codecArgs) {
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...codecArgs, file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c} for ${file}`)) : res())));
  return { write: (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r))), end: () => (ff.stdin.end(), done) };
}

async function bake(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE });
  await ctx.addInitScript(install);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?mode=${mode}`);
  const step = (n = 1) => page.evaluate((n) => window.__stageshow.clock.step(n), n);
  const mark = () => page.evaluate(() => document.querySelector('.ss-stage')?.dataset.mark ?? '');
  const ticks = () => page.evaluate(() => window.__mixes ?? 0);
  // Count mixes: a mix starts each time the script marks 'sync'.
  await page.evaluate(() => {
    window.__mixes = 0;
    new MutationObserver(() => {
      const m = document.querySelector('.ss-stage')?.dataset.mark;
      if (m === 'sync' && window.__lastMark !== 'sync') window.__mixes++;
      window.__lastMark = m;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-mark'] });
  });
  // Past one whole cycle first: the first mixes start from the set-up (and
  // in the controller version the controller is still rising), and leave
  // the decks' tabs as the set-up left them, not as the cycle does.
  let guard = FPS * 400;
  while ((await ticks()) < MIXES + 1 && guard-- > 0) await step();
  if (guard <= 0) throw new Error(`${mode}: the script never reached a mix (mark: ${await mark()})`);
  const startMixes = await ticks();

  const alpha = mode === 'controller';
  const name = path.join(OUT, `hero-${mode}`);
  const outs = [];
  if (!alpha) outs.push(encoder(`${name}.mp4`, ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '24', '-tune', 'animation', '-movflags', '+faststart']));
  else {
    outs.push(encoder(`${name}.webm`, ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-auto-alt-ref', '0']));
    outs.push(encoder(`${name}.mov`, ['-c:v', 'hevc_videotoolbox', '-alpha_quality', '0.5', '-b:v', '3M', '-tag:v', 'hvc1', '-pix_fmt', 'bgra']));
  }
  const levels = [];
  let frames = 0;
  const limit = SECONDS ? SECONDS * FPS : Infinity;
  for (;;) {
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    for (const o of outs) await o.write(png);
    levels.push(await page.evaluate(() => Math.round(window.__level * 1000) / 1000));
    frames++;
    await step();
    if (frames >= limit) break;
    if (!SECONDS && (await ticks()) >= startMixes + MIXES) break;
    if (frames > FPS * 900) throw new Error(`${mode}: over a quarter of an hour without finishing ${MIXES} mixes`);
  }
  await Promise.all(outs.map((o) => o.end()));
  fs.writeFileSync(`${name}.json`, JSON.stringify({ fps: FPS, frames, level: levels }));
  console.log(`${mode}: ${frames} frames (${(frames / FPS).toFixed(1)} s)${errors.length ? `\n  page errors: ${errors.join('; ')}` : ''}`);
  await ctx.close();
}

try {
  for (const m of modes) await bake(m);
} finally {
  await browser.close();
  server.close();
}
