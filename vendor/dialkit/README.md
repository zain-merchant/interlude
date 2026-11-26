# DialKit (vendored)

DialKit 2.2.1, MIT (see LICENSE), loaded by `site/tune.js` on localhost only.

Local changes in `browser.global.js`:

- The spring and curve editors' sliders have lower tops and finer steps, for tuning small UI motion: duration 0.05–0.6s (0.01), bounce 0–0.6 (0.01), stiffness 10–600 (5), damping 1–60 (0.5), mass 0.1–3 (0.05), curve duration 0.05–1s (0.01).
- `captureViewport` returns null, so no version thumbnails are taken. Each one cloned and rasterized the whole page
and read the WebGL canvases back, holding the page at a few frames a second for
about ten seconds after every load.
