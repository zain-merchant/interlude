// The hero's recorded clips live in a GitHub release, not in git: one
// archive per set (the clips, their manifest and timelines, and the poster),
// in a rolling pre-release tagged `hero-clips`. See "Where the clips live"
// in app/demo/segments/README.md.
//
//   node scripts/hero-clips.mjs fetch    [--repo owner/name] [--force]
//   node scripts/hero-clips.mjs publish  [--repo owner/name]
//   node scripts/hero-clips.mjs pages
//
// fetch    downloads the newest set into site/hero/clips/ and the poster
//          into site/img/ (`npm run clips:fetch`; `build:site:all` runs it).
//          Nothing to do if the set there is the published one. A set
//          recorded here and not published yet is kept (--force replaces it).
//          Plain HTTPS: no gh, no token.
// publish  packs site/hero/clips/ and the poster and uploads them to the
//          release (`npm run clips:publish`; needs gh, logged in with write
//          access to the repo). The release is a pre-release and never
//          "latest": the site's download buttons and the app's updater read
//          releases/latest.
// pages    makes the commit to publish the site from: what is committed in
//          site/, plus the clips and poster, which git doesn't keep. Prints
//          the push; pushes nothing.
//
// The repo: --repo, else $HERO_CLIPS_REPO, else "config.heroClipsRepo" in
// app/package.json.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = path.join(ROOT, 'site');
const CLIPS = path.join(SITE, 'hero', 'clips');
const IMG = path.join(SITE, 'img');
const POSTER = ['screenshot.jpg', 'screenshot-1x.jpg', 'screenshot.avif', 'screenshot-1x.avif'];
const TAG = 'hero-clips';
// The release's own index of the newest set (uploaded after its archive).
const INDEX = 'hero-clips.json';
// Which set this copy has, from where (written by fetch and publish; a set
// without one was recorded here).
const MARK = path.join(CLIPS, '.release.json');

const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : a), []));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf8'));
const REPO = args.repo ?? process.env.HERO_CLIPS_REPO ?? pkg.config?.heroClipsRepo;
if (!/^[\w.-]+\/[\w.-]+$/.test(REPO ?? '')) die(`no repo: pass --repo owner/name (got ${REPO})`);
// The newest manifest schema the player plays (site/hero/clips.js says).
const SCHEMA = +fs.readFileSync(path.join(SITE, 'hero', 'clips.js'), 'utf8').match(/export const CLIPS_SCHEMA = (\d+)/)?.[1];
if (!SCHEMA) die('site/hero/clips.js has no CLIPS_SCHEMA');

function die(msg) {
  console.error(`hero-clips: ${msg}`);
  process.exit(1);
}
const say = (msg) => console.log(`hero-clips: ${msg}`);
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

/** Every file a set's manifest needs, relative to site/hero/clips. */
function setFiles(m) {
  const files = ['manifest.json', 'controller-mask.png', ...Object.keys(m.modes).map((mode) => `${mode}.json`)];
  for (const [mode, layers] of Object.entries(m.modes)) {
    for (let i = 0; i < m.steps.length; i++) {
      for (const codec of m.codecs) {
        for (const l of [layers.play, 'ctl']) files.push(`${mode}-${i}.${l}.${codec}.mp4`, `${mode}-${i}.${l}${m.small}.${codec}.mp4`);
        if (layers.twin) files.push(`${mode}-${i}.${layers.twin}${m.small}.${codec}.mp4`);
      }
    }
  }
  return files;
}
/** What's missing from the set in site/ (empty: it's complete). */
function missing(m) {
  return [...setFiles(m).map((f) => path.join(CLIPS, f)), ...POSTER.map((f) => path.join(IMG, f))].filter((f) => !fs.existsSync(f));
}
function checkSchema(m, where) {
  const s = m.schema ?? 1;
  if (s > SCHEMA) die(`${where} is schema ${s}; this site's player (site/hero/clips.js) plays up to ${SCHEMA}`);
}

function gh(a, opts = {}) {
  return execFileSync('gh', [...a, '--repo', REPO], { encoding: 'utf8', stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  if (!file) return r.json();
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function fetchSet() {
  const base = `https://github.com/${REPO}/releases/download/${TAG}`;
  const local = readJson(path.join(CLIPS, 'manifest.json'));
  const complete = local && !missing(local).length;
  let index;
  try {
    index = await download(`${base}/${INDEX}`);
  } catch (e) {
    if (complete) return say(`couldn't reach the release (${e.message}); keeping the set here (${local.source})`);
    die(`couldn't reach the release, and there is no complete set here: ${e.message}${e.cause ? ` (${e.cause.message ?? e.cause})` : ''}`);
  }
  checkSchema(index, `the published set (${index.source})`);
  if (local && !args.force) {
    if (local.source === index.source && complete) return say(`up to date (${index.source})`);
    // A different set, not from the release: recorded here (hours of work).
    if (local.source !== index.source && readJson(MARK)?.source !== local.source) {
      return say(`keeping the set recorded here (${local.source}): the release has ${index.source}. `
        + 'Publish it (npm run clips:publish), or replace it with --force.');
    }
  }
  say(`downloading ${index.archive} (${mb(index.bytes)}) from ${REPO}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-clips-'));
  try {
    const file = path.join(tmp, 'set.tar.gz');
    await download(`${base}/${index.archive}`, file);
    if (sha256(file) !== index.sha256) die(`${index.archive}: checksum doesn't match ${INDEX}`);
    // Only the set's own files, nothing outside it.
    const entries = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const ok = (e) => /^(hero\/|hero\/clips\/|img\/)$/.test(e) || /^hero\/clips\/[\w@-]+(\.[\w@-]+)*$/.test(e) || POSTER.some((p) => e === `img/${p}`);
    const bad = entries.filter((e) => !ok(e));
    if (bad.length) die(`unexpected files in ${index.archive}: ${bad.slice(0, 5).join(', ')}`);
    const out = path.join(tmp, 'out');
    fs.mkdirSync(out);
    execFileSync('tar', ['-xzf', file, '-C', out]);
    const m = readJson(path.join(out, 'hero', 'clips', 'manifest.json'));
    if (m?.source !== index.source) die(`${index.archive}: its manifest isn't set ${index.source}`);
    const lacking = setFiles(m).filter((f) => !fs.existsSync(path.join(out, 'hero', 'clips', f)));
    if (lacking.length) die(`${index.archive} lacks ${lacking.length} files, e.g. ${lacking[0]}`);
    // In place: the old set out, the new one in, then the poster.
    fs.rmSync(CLIPS, { recursive: true, force: true });
    fs.cpSync(path.join(out, 'hero', 'clips'), CLIPS, { recursive: true });
    for (const p of POSTER) fs.copyFileSync(path.join(out, 'img', p), path.join(IMG, p));
    fs.writeFileSync(MARK, JSON.stringify({ repo: REPO, source: index.source, archive: index.archive, sha256: index.sha256 }, null, 1));
    say(`set ${index.source} in site/hero/clips (${fs.readdirSync(CLIPS).length - 1} files) and the poster in site/img`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function publish() {
  const mFile = path.join(CLIPS, 'manifest.json');
  const m = readJson(mFile);
  if (!m) die('no set in site/hero/clips to publish (npm run clips records one)');
  // The schema, if the recorder didn't write one: what this player plays.
  if (m.schema == null) {
    fs.writeFileSync(mFile, JSON.stringify({ schema: SCHEMA, ...m }, null, 1));
    say(`manifest: schema ${SCHEMA}`);
  }
  checkSchema(m, 'the set here');
  const lacking = missing(m);
  if (lacking.length) die(`the set here is incomplete: ${lacking.length} files missing, e.g. ${path.relative(ROOT, lacking[0])}`);
  const files = setFiles(m);
  const extra = fs.readdirSync(CLIPS).filter((f) => !f.startsWith('.') && !files.includes(f));
  if (extra.length) say(`not packed (not in the manifest): ${extra.join(', ')}`);

  const archive = `hero-clips-${m.source}.tar.gz`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-clips-'));
  try {
    const file = path.join(tmp, archive);
    const list = path.join(tmp, 'files.txt');
    fs.writeFileSync(list, [...files.map((f) => `hero/clips/${f}`), ...POSTER.map((p) => `img/${p}`)].join('\n') + '\n');
    // (No macOS metadata: no ._ files, no extended attributes.)
    execFileSync('tar', ['-czf', file, ...(process.platform === 'darwin' ? ['--no-mac-metadata'] : []), '-C', SITE, '-T', list], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const index = { schema: m.schema ?? SCHEMA, source: m.source, archive, sha256: sha256(file), bytes: fs.statSync(file).size, files: files.length + POSTER.length, published: new Date().toISOString() };
    const indexFile = path.join(tmp, INDEX);
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
    say(`packed ${index.files} files into ${archive} (${mb(index.bytes)})`);

    // The release: made once, a pre-release that is never "latest".
    let release = null;
    try { release = JSON.parse(gh(['release', 'view', TAG, '--json', 'isPrerelease,assets'], { quiet: true })); } catch { /* none yet */ }
    if (!release) {
      say(`making the pre-release ${TAG} in ${REPO}`);
      gh(['release', 'create', TAG, '--prerelease', '--latest=false', '--title', 'Hero clips (rolling)',
        '--notes', 'The website hero\'s recorded clips, replaced with each new set. Not an app release: `npm --prefix app run clips:fetch` puts the newest set into site/. See app/demo/segments/README.md.']);
      release = { assets: [] };
    } else if (!release.isPrerelease) gh(['release', 'edit', TAG, '--prerelease', '--latest=false']);
    // The set before this one stays too, for a page still holding its manifest.
    let previous = null;
    try { previous = execFileSync('gh', ['release', 'download', TAG, '--repo', REPO, '--pattern', INDEX, '--output', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* first set */ }
    const keep = new Set([archive, INDEX, previous && JSON.parse(previous).archive].filter(Boolean));
    // The archive first, then the index that points at it.
    gh(['release', 'upload', TAG, file, '--clobber']);
    gh(['release', 'upload', TAG, indexFile, '--clobber']);
    for (const a of release.assets.map((x) => x.name).filter((n) => !keep.has(n))) {
      say(`removing the older set ${a}`);
      gh(['release', 'delete-asset', TAG, a, '--yes']);
    }
    fs.writeFileSync(MARK, JSON.stringify({ repo: REPO, source: index.source, archive, sha256: index.sha256 }, null, 1));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Never "latest": check, since downloads and updates depend on it.
  const r = JSON.parse(gh(['release', 'list', '--json', 'tagName,isLatest,isPrerelease', '--limit', '100'])).find((x) => x.tagName === TAG);
  let latest = null;
  try { latest = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/releases/latest`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).tag_name; } catch { /* no latest release */ }
  if (!r?.isPrerelease || r.isLatest || latest === TAG) die(`${TAG} must be a pre-release and not latest: ${JSON.stringify(r)}, latest is ${latest}`);
  say(`published ${m.source} to https://github.com/${REPO}/releases/tag/${TAG} (pre-release; latest is still ${latest ?? 'none'})`);
}

function pages() {
  const m = readJson(path.join(CLIPS, 'manifest.json'));
  if (!m || missing(m).length) die('no complete set in site/hero/clips: npm run clips:fetch');
  const git = (a, env = {}) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-clips-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
    // What's committed in site/, then the set and the poster on top.
    git(['read-tree', 'HEAD:site'], env);
    execFileSync('git', ['--work-tree', '.', 'add', '-f', '--', ...setFiles(m).map((f) => `hero/clips/${f}`), ...POSTER.map((p) => `img/${p}`)], { cwd: SITE, env: { ...process.env, ...env } });
    const tree = git(['write-tree'], env);
    const head = git(['rev-parse', '--short', 'HEAD']);
    const commit = git(['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-m', `Site at ${head}, hero clips ${m.source}`]);
    say(`site commit ${commit} (site/ at ${head}, clips ${m.source}). One commit with no history, so old sets don't pile up in gh-pages. To publish:`);
    console.log(`  git push --force origin ${commit}:refs/heads/gh-pages`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (cmd === 'fetch') await fetchSet();
else if (cmd === 'publish') publish();
else if (cmd === 'pages') pages();
else die('usage: hero-clips.mjs fetch|publish|pages [--repo owner/name] [--force]');
