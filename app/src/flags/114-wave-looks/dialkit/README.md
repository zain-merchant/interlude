# DialKit (vendored)

DialKit 2.2.1, MIT (see LICENSE), as the website's copy (`site/vendor/dialkit`, whose README lists its local changes), with one more: `dialkit.js` ends in `export default DialKit`, so it loads as a module. Plain DOM: no React, no network, no eval. Loaded only by `../panel.svelte.js`, in dev builds.
