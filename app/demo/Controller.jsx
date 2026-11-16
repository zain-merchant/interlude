// A two-deck DJ controller, drawn top-down, for the hero's controller
// version. It isn't any one model, and it carries only what the hero plays,
// each part large: per deck a tempo fader, a jog wheel, Sync and Play; in
// the middle a browse knob (turn to choose, push to load), a Low knob per
// channel, and the crossfader.
//
// Nothing on it is set by hand. Each frame it reads the app's engine, so
// its jogs turn with the decks, its play and cue keys light with them, its
// tempo faders sit where the decks' rates are, its meters move with the
// music and its crossfader sits where the app's does. The script presses
// its keys and turns its knobs; the app does the rest.
import { useEffect, useRef, useState } from 'react';
import { engine } from '$lib/engine.svelte.js';

// 33⅓ rpm: how far a platter turns in a second, in degrees.
const DEG_PER_SEC = (100 / 3 / 60) * 360;

/** One of the app's sliders, for the controller to mirror. */
function appSlider(d, which) {
  if (which === 'low') return document.querySelector(`[role="slider"][aria-label="Deck ${'AB'[d]} low EQ"]`);
  return document.querySelector(`[role="slider"][aria-label="Deck ${'AB'[d]} pitch"]`);
}
/** How far along its travel a slider is, 0 to 1, from its own ARIA values. */
function along(el) {
  const min = +el.getAttribute('aria-valuemin');
  const max = +el.getAttribute('aria-valuemax');
  const v = +el.getAttribute('aria-valuenow');
  return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0.5;
}

function Deck({ side }) {
  const d = side === 'left' ? 0 : 1;
  return (
    <div className={`hw-deck hw-deck--${side}`}>
      <div className="hw-top">
        <div className="hw-key hw-sync" data-target={`c-sync-${d}`} data-hw={`sync-${d}`}><span>Sync</span></div>
      </div>
      <div className="hw-jog" data-target={`c-jog-${d}`}>
        <div className="hw-jog__ring" />
        <div className="hw-jog__platter" data-hw={`jog-${d}`}>
          <i className="hw-jog__mark" />
        </div>
        <div className="hw-jog__hub" />
      </div>
      <div className="hw-bottom">
        <div className="hw-round hw-play" data-target={`c-play-${d}`} data-hw={`play-${d}`}>
          <svg viewBox="0 0 18 12" aria-hidden><path d="M1.5 1.6v8.8l6.6-4.4z" /><rect x="10.6" y="1.6" width="2" height="8.8" rx=".6" /><rect x="14.4" y="1.6" width="2" height="8.8" rx=".6" /></svg>
        </div>
      </div>
    </div>
  );
}

/** A long tempo fader at the controller's outer edge. Its cap follows the deck's rate. */
function Pitch({ d }) {
  return (
    <div className={`hw-pitch hw-pitch--${d ? 'right' : 'left'}`}>
      <span>Tempo</span>
      <div className="hw-pitch__slot">
        <i className="hw-pitch__mid" />
        <div className="hw-pitch__cap" data-hw={`pitch-${d}`} />
      </div>
    </div>
  );
}

function Knob({ label, hw }) {
  return (
    <div className="hw-knob">
      <i data-hw={hw} />
      <span>{label}</span>
    </div>
  );
}

function Channel({ d }) {
  return (
    <div className="hw-channel">
      <Knob label="Low" hw={`low-${d}`} />
    </div>
  );
}

export function Controller({ shown }) {
  const root = useRef(null);
  // Mounted below the frame, then raised, so it always arrives by moving.
  const [up, setUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setUp(shown), 40);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    let raf;
    const el = (k) => root.current?.querySelector(`[data-hw="${k}"]`);
    const frame = () => {
      for (const d of [0, 1]) {
        const deck = engine.decks[d];
        const jog = el(`jog-${d}`);
        if (jog) jog.style.transform = `rotate(${(deck.position * DEG_PER_SEC) % 360}deg)`;
        el(`play-${d}`)?.toggleAttribute('data-lit', deck.playing);
        el(`cue-${d}`)?.toggleAttribute('data-lit', deck.loaded && !deck.playing);
        el(`sync-${d}`)?.toggleAttribute('data-lit', deck.loaded && engine.decks[1 - d].loaded &&
          Math.abs(deck.bpm * deck.rate - engine.decks[1 - d].bpm * engine.decks[1 - d].rate) < 0.01);
        // The tempo fader sits exactly where the app's does: same range, same
        // way up. While a hand holds it ([data-held]) the hand moves it, and
        // the app catches up.
        const cap = el(`pitch-${d}`);
        const app = appSlider(d, 'pitch');
        if (cap && app && !cap.hasAttribute('data-held')) cap.style.setProperty('--at', String(1 - 2 * along(app)));
        // The Low knob turns to where the app's Low EQ is.
        const low = el(`low-${d}`);
        const eq = appSlider(d, 'low');
        if (low && eq && !low.hasAttribute('data-held')) low.style.rotate = `${-150 + 300 * along(eq)}deg`;
      }
      const xfCap = root.current?.querySelector('[data-target="c-xf-cap"]');
      if (!xfCap?.hasAttribute('data-held')) {
        const xf = engine.mixer?.crossfader ?? 0;
        root.current?.style.setProperty('--xf', String((xf + 1) / 2));
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="desk" data-shown={up || undefined}>
      <div ref={root} className="hw" data-target="controller">
        <Pitch d={0} />
        <Deck side="left" />
        <div className="hw-mixer">
          <div className="hw-browse-row">
            <div className="hw-browse" data-target="c-browse"><i /></div>
            <span className="hw-print">Push to load</span>
          </div>
          <div className="hw-channels">
            <Channel d={0} />
            <Channel d={1} />
          </div>
          <div className="hw-xf" data-target="c-xf">
            <div className="hw-xf__slot" />
            <div className="hw-xf__cap" data-target="c-xf-cap" />
          </div>
        </div>
        <Deck side="right" />
        <Pitch d={1} />
        <i className="hw-cable" aria-hidden />
      </div>
    </div>
  );
}
