// #115 (UI audit flag): trackpad-zoom's listeners.
//
// A pinch arrives as ctrl + wheel in Chromium (the browser preview) and as
// gesture events in WebKit (the Mac app). The waveform's play head stays
// where it is at every zoom, so zooming is about the play head.

/** The zoom for one wheel event: below 1 is closer. */
export function wheelFactor(e) {
  const d0 = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const d = d0 * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  // Chromium makes a pinch's deltaY 100 × the log of its scale, a few px at
  // a time. Anything bigger is a mouse wheel's notch, which keeps the 15%
  // it always had.
  const notch = Math.log(1.15);
  const step = e.ctrlKey && Math.abs(d) < 50 ? d / 100 : Math.max(-notch, Math.min(notch, d / 300));
  return Math.exp(step);
}

/** Listens on `el`. `on()` is whether the flag is on; `zoom(f)` multiplies the seconds shown by f. Returns how to stop. */
export function trackpadZoom(el, { on, zoom }) {
  /** The last scale of a pinch under way, or null. */
  let pinch = null;
  let last = -1000;
  // A zoom mid-drag would pull the track out from under the hand.
  const take = (e, f) => {
    e.preventDefault();
    e.stopPropagation();
    last = e.timeStamp;
    if (!e.buttons && Number.isFinite(f) && f > 0 && f !== 1) zoom(f);
  };
  const wheel = (e) => {
    if (!on()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // WebKit can send both for one pinch: the gesture is the truer one.
      take(e, pinch !== null && e.ctrlKey ? 1 : wheelFactor(e));
    } else if (e.timeStamp - last < 120) {
      // The glide of a zooming scroll after the key is let go isn't a scratch.
      take(e, 1);
    }
  };
  const start = (e) => {
    if (!on()) return;
    pinch = e.scale || 1;
    take(e, 1);
  };
  const change = (e) => {
    if (!on() || pinch === null || !(e.scale > 0)) return;
    const f = pinch / e.scale;
    pinch = e.scale;
    take(e, f);
  };
  const end = (e) => {
    if (pinch !== null) take(e, 1);
    pinch = null;
  };
  const list = [['wheel', wheel], ['gesturestart', start], ['gesturechange', change], ['gestureend', end]];
  for (const [t, f] of list) el.addEventListener(t, f, { capture: true, passive: false });
  return () => {
    for (const [t, f] of list) el.removeEventListener(t, f, { capture: true });
  };
}
