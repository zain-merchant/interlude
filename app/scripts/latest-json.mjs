// Writes latest.json, the file the in-app updater reads, for a release
// built with `npm run tauri build`. scripts/release.sh runs it.
//
//   node scripts/latest-json.mjs "What changed in this version"
//
// It finds the signed update bundle (`*.app.tar.gz` and its `.sig`) for
// this Mac's architecture, and writes `latest.json` next to it. Upload
// both files and latest.json to the GitHub release tagged v<version> in
// zain-merchant/interlude (see "Releasing" in the README).

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch } from 'node:process';

const RELEASES = 'https://github.com/zain-merchant/interlude/releases/download';

const here = dirname(fileURLToPath(import.meta.url));
const conf = JSON.parse(readFileSync(join(here, '../src-tauri/tauri.conf.json'), 'utf8'));
const version = conf.version;
const notes = process.argv[2] ?? '';

const dir = join(here, '../../target/release/bundle/macos');
if (!existsSync(dir)) {
  console.error(`No macOS bundle in ${dir}. Run \`npm run tauri build\` first.`);
  process.exit(1);
}
const bundle = readdirSync(dir).find((f) => f.endsWith('.app.tar.gz'));
if (!bundle || !existsSync(join(dir, `${bundle}.sig`))) {
  console.error('No signed .app.tar.gz found. Set TAURI_SIGNING_PRIVATE_KEY (see the README) and build again.');
  process.exit(1);
}

const platform = `darwin-${arch === 'arm64' ? 'aarch64' : 'x86_64'}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: {
      signature: readFileSync(join(dir, `${bundle}.sig`), 'utf8').trim(),
      url: `${RELEASES}/v${version}/${encodeURIComponent(bundle)}`,
    },
  },
};
const out = join(dir, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${out}\nUpload ${bundle}, ${bundle}.sig and latest.json to the v${version} release.`);
