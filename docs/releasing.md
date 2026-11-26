# Releasing

Interlude is downloaded from, and updates itself from, this repo's
[GitHub Releases](https://github.com/zain-merchant/interlude/releases).
The website's download button links to
`releases/latest/download/Interlude.dmg`, and installed copies read
`releases/latest/download/latest.json`, so both always point at the newest
(non-prerelease) release. While the repo is private, only people with
access can download.

Each update is signed with the updater key; the app only installs updates
signed with it.

1. Once: the key is in `~/.tauri/oss-dj-updater.key` on the release Mac
   (made with `npx tauri signer generate -w ~/.tauri/oss-dj-updater.key`;
   its public half is `plugins.updater.pubkey` in `tauri.conf.json`).
   Keep a copy somewhere safe, like a password manager: without it,
   installed copies can never be updated again.
2. From a clean, up-to-date `main`, on the Mac:
   ```sh
   app/scripts/release.sh 0.2.0 "What changed, in a line or two"
   ```
   It sets the version, builds and signs the app, writes `latest.json`,
   commits and tags `v0.2.0`, and publishes the release with the disk image
   (also as `Interlude.dmg`), the update bundle, its signature and
   `latest.json`. GitHub adds the source code to each release, which the
   GPL asks for.

## Apple signing

A signed and notarized app opens without the "Apple
could not verify" warning. Set up once on the release Mac:

1. Make a certificate signing request: Keychain Access › Certificate
   Assistant › Request a Certificate From a Certificate Authority, with your
   email, "Saved to disk".
2. At [developer.apple.com › Certificates](https://developer.apple.com/account/resources/certificates/add),
   add a **Developer ID Application** certificate (G2 Sub-CA) from that
   request, download it and double-click it to add it to the login keychain.
   `security find-identity -v -p codesigning` should now list it.
3. Make an app-specific password at [account.apple.com](https://account.apple.com)
   › Sign-In and Security › App-Specific Passwords, and save it with
   `security add-generic-password -s interlude-notarize -a <Apple ID email> -w`
   (it asks for the password).

After that `release.sh` finds the certificate and the password itself, and
Tauri signs the app and sends it to Apple to notarize (a few minutes).

## The website

The website is `site/`, plain HTML and CSS, with no CI. Its animated
parts are built from the app: the hero's demo and the feature cards'
pictures (`site/demo`, committed) and the hero's recorded clips and poster
(`site/hero/clips` and `site/img/screenshot*`, not in git: they're kept in
the `hero-clips` pre-release, see `app/demo/segments/README.md`). Before
publishing, bring them up to date (this fetches the published clips, and
records them again only if the app, the demo or the recorder changed; then
`npm --prefix app run clips:publish`) and commit what changed:
```sh
npm --prefix app run build:site:all
```
`git subtree push` would publish only what git has, so the site without its
clips. Instead, make one commit of the site with the clips and push that
(it has no history, so old clip sets don't pile up in `gh-pages`; it
replaces the branch's history, so agree the switch with the repo owner):
```sh
npm --prefix app run site:pages     # prints the push, e.g.:
git push --force origin <commit>:refs/heads/gh-pages
```
It's served at [interludedj.com](https://interludedj.com) (`site/CNAME`;
DNS at Namecheap points the domain at GitHub Pages).

## Moving over from oss-dj

The app was called oss-dj. On first launch,
Interlude moves the old data folder (library, settings, stems, logs), the
learned controller mappings, `Music/oss-dj recordings`, and on a Mac the UI
settings, to their new places (see `app/src-tauri/src/paths.rs`).
