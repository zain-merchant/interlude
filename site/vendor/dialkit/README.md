# DialKit (vendored)

DialKit 2.2.1, MIT (see LICENSE), loaded by `site/tune.js` on localhost only.

One local change in `browser.global.js`: `captureViewport` returns null, so
no version thumbnails are taken. Each one cloned and rasterized the whole page
and read the WebGL canvases back, holding the page at a few frames a second for
about ten seconds after every load.
