#!/usr/bin/env bash
# Builds Interlude and publishes it as a GitHub release, which is where
# both the website's download button and the in-app updater look.
#
#   app/scripts/release.sh 0.2.0 "What changed, in a line or two"
#
# Run it on the release Mac from a clean checkout of main. It:
#   1. sets the version in Cargo.toml and tauri.conf.json, and commits it
#   2. builds the app, signing the update with the updater key
#   3. writes latest.json (what installed copies check for updates)
#   4. makes the release v<version> in zain-merchant/interlude with the
#      disk image (also as Interlude.dmg, the website's stable link), the
#      update bundle, its signature and latest.json
#   5. pushes the version commit and tag
#
# Needs: gh (signed in), node, the Rust toolchain, and the updater key at
# ~/.tauri/oss-dj-updater.key (or set INTERLUDE_UPDATER_KEY to its path).
#
# Apple signing is optional. With a Developer ID, set these before running
# and Tauri signs and notarizes the app, so testers can open it without the
# "unidentified developer" step:
#   APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   APPLE_ID=you@example.com APPLE_PASSWORD=<app-specific password> APPLE_TEAM_ID=TEAMID

set -euo pipefail

REPO=zain-merchant/interlude
VERSION=${1:?usage: release.sh <version> "<notes>"}
NOTES=${2:?usage: release.sh <version> "<notes>"}
KEY=${INTERLUDE_UPDATER_KEY:-$HOME/.tauri/oss-dj-updater.key}

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

fail() { echo "release: $*" >&2; exit 1; }

[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || fail "$VERSION isn't a version like 0.2.0"
[[ $(uname) == Darwin ]] || fail "run this on a Mac"
command -v gh >/dev/null || fail "install the GitHub CLI: brew install gh"
gh auth status >/dev/null 2>&1 || fail "sign in to GitHub first: gh auth login"
[[ -f $KEY ]] || fail "no updater key at $KEY"
[[ -z $(git status --porcelain --untracked-files=no) ]] || fail "commit or stash your changes first"
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && fail "v$VERSION is already tagged"
if gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  fail "v$VERSION is already released"
fi

echo "==> Version $VERSION"
# Only the workspace version line in Cargo.toml, and the app's in tauri.conf.json.
sed -i '' -E "/^\[workspace\.package\]/,/^\[/ s/^version = \".*\"/version = \"$VERSION\"/" Cargo.toml
node -e '
  const fs = require("fs"), p = "app/src-tauri/tauri.conf.json";
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.version = process.argv[1];
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
' "$VERSION"
grep -q "^version = \"$VERSION\"" Cargo.toml || fail "couldn't set the version in Cargo.toml"
cargo metadata --format-version 1 >/dev/null # refreshes Cargo.lock

echo "==> Building"
if [[ -n ${APPLE_SIGNING_IDENTITY:-} ]]; then
  echo "    signing as $APPLE_SIGNING_IDENTITY"
else
  echo "    not signed with a Developer ID: testers will need the Open Anyway step"
fi
export TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY")
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}
(cd app && npm ci && npm run tauri build)
unset TAURI_SIGNING_PRIVATE_KEY

BUNDLE=target/release/bundle
node app/scripts/latest-json.mjs "$NOTES"
DMG=$(ls "$BUNDLE"/dmg/*.dmg | head -1)
[[ -f $DMG ]] || fail "no disk image in $BUNDLE/dmg"
STAGE=$(mktemp -d)
cp "$DMG" "$STAGE/Interlude.dmg"

echo "==> Committing the version"
git add Cargo.toml Cargo.lock app/src-tauri/tauri.conf.json
# Nothing to commit when the version was already set (a first release).
git diff --cached --quiet || git commit -m "Release $VERSION"
git tag "v$VERSION"
git push origin HEAD "v$VERSION"

echo "==> Publishing v$VERSION to $REPO"
gh release create "v$VERSION" --repo "$REPO" --verify-tag \
  --title "Interlude $VERSION" --notes "$NOTES" \
  "$DMG" "$STAGE/Interlude.dmg" \
  "$BUNDLE"/macos/*.app.tar.gz "$BUNDLE"/macos/*.app.tar.gz.sig "$BUNDLE"/macos/latest.json
rm -rf "$STAGE"

if [[ $(gh repo view "$REPO" --json visibility -q .visibility) != PUBLIC ]]; then
  echo
  echo "Note: $REPO is private, so the download link and updates only work"
  echo "for people with access until you make it public."
fi
echo
echo "Done: https://github.com/$REPO/releases/tag/v$VERSION"
