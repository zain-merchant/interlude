// The phone preview's inside (tune.js, the Phone preview folder): loaded
// only in a frame opened by a page of this site with the Tune panel showing
// (index.html's head), so never by a visitor. It makes the frame a phone as
// far as the page can tell: no hover and a coarse pointer, to its scripts
// and its stylesheets, and the mouse a finger. The panel outside sets the
// values; nothing of its own is saved.
(() => {
  window.__framed = true;
  const NO = '(max-width: 0px)', YES = '(min-width: 0px)';
  const touch = (q) => q.replace(/\(\s*(any-)?hover:\s*none\s*\)/g, YES).replace(/\(\s*(any-)?pointer:\s*coarse\s*\)/g, YES)
    .replace(/\(\s*(any-)?hover:\s*hover\s*\)/g, NO).replace(/\(\s*(any-)?pointer:\s*fine\s*\)/g, NO);
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => mm(touch(String(q)));
  const fix = (rules) => {
    for (const r of rules) {
      if (r.media && r.media.mediaText) { const t = touch(r.media.mediaText); if (t !== r.media.mediaText) r.media.mediaText = t; }
      if (r.cssRules) fix(r.cssRules);
    }
  };
  const sheets = () => { for (const s of document.styleSheets) { try { fix(s.cssRules); } catch {} } };
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeName === 'LINK' || n.nodeName === 'STYLE') { sheets(); n.addEventListener?.('load', sheets); }
  }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('DOMContentLoaded', sheets);
  addEventListener('load', sheets);
  // The mouse as one finger: a move counts only while it's pressed, and
  // nothing is hovered.
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerenter', 'pointerleave', 'pointerover', 'pointerout']) {
    addEventListener(t, (e) => {
      if (e.pointerType !== 'mouse') return;
      if (/enter|leave|over|out/.test(t) || (t === 'pointermove' && !e.buttons)) { e.stopImmediatePropagation(); return; }
      Object.defineProperty(e, 'pointerType', { value: 'touch' });
    }, true);
  }
})();
