// A two-deck DJ controller, drawn top-down, for the hero's controller
// version. It isn't any one model, but it's laid out the way the common
// two-channel ones are: long tempo faders at the outer edges, a jog wheel,
// transport and eight performance pads on each deck, and a mixer between
// them with a browse knob, load keys, trim and three-band EQ, LED meters,
// channel faders and a crossfader.
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
const SEGMENTS = 9;

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
        <div className="hw-transport">
          <div className="hw-round hw-cue" data-target={`c-cue-${d}`} data-hw={`cue-${d}`}><span>Cue</span></div>
          <div className="hw-round hw-play" data-target={`c-play-${d}`} data-hw={`play-${d}`}>
            <svg viewBox="0 0 18 12" aria-hidden><path d="M1.5 1.6v8.8l6.6-4.4z" /><rect x="10.6" y="1.6" width="2" height="8.8" rx=".6" /><rect x="14.4" y="1.6" width="2" height="8.8" rx=".6" /></svg>
          </div>
        </div>
        <div className="hw-pads">
          {Array.from({ length: 8 }, (_, i) => <i key={i} className="hw-pad" data-hw={`pad-${d}-${i}`} data-target={`c-pad-${d}-${i}`} />)}
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
      <Knob label="Trim" />
      <Knob label="Hi" />
      <Knob label="Mid" />
      <Knob label="Low" hw={`low-${d}`} />
      <Knob label="Filter" />
      <div className="hw-key hw-cuebtn"><span>Cue</span></div>
      <div className="hw-fader">
        <div className="hw-fader__slot" />
        <div className="hw-fader__cap" />
      </div>
    </div>
  );
}

function Meter({ d }) {
  return (
    <div className="hw-meter" data-hw={`meter-${d}`}>
      {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} data-level={i === 0 ? 'peak' : i < 3 ? 'hot' : undefined} />)}
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
        // ±8% is the cap's travel either side of the middle; faster is toward you.
        el(`pitch-${d}`)?.style.setProperty('--at', String(Math.max(-1, Math.min(1, ((deck.rate ?? 1) - 1) / 0.08))));
        const meter = el(`meter-${d}`);
        if (meter) {
          // Segments light from the bottom; the top one is the peak.
          const lit = Math.round(Math.min(1, Math.sqrt(engine.deckLevels[d] ?? 0)) * SEGMENTS);
          [...meter.children].forEach((seg, i) => seg.toggleAttribute('data-lit', SEGMENTS - i <= lit));
        }
      }
      const xf = engine.mixer?.crossfader ?? 0;
      root.current?.style.setProperty('--xf', String((xf + 1) / 2));
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
            <div className="hw-key hw-load" data-target="c-load-0"><span>Load</span></div>
            <div className="hw-browse" data-target="c-browse"><i /></div>
            <div className="hw-key hw-load" data-target="c-load-1"><span>Load</span></div>
          </div>
          <div className="hw-channels">
            <Channel d={0} />
            <div className="hw-master">
              <Knob label="Master" />
              <Knob label="Cue mix" />
              <div className="hw-meters"><Meter d={0} /><Meter d={1} /></div>
            </div>
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
