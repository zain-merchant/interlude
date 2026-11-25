// A two-deck DJ controller, drawn top-down, for the hero's controller
// version. It isn't any one model, and it carries what the hero plays: per
// deck a tempo fader, a jog wheel, Sync, Cue and Play, pads (hot cues and
// stems), a four-beat Loop key and an Echo key with its level; in the
// middle a browse knob (turn to choose, push to load), three EQ knobs and a
// fader per channel, meters and the crossfader. Five drawings of it are
// being tried (VERSIONS, below).
//
// Nothing on it is set by hand. Each frame it reads the app's engine, so
// its jogs turn with the decks, its play and cue keys light with them, its
// tempo faders sit where the decks' rates are, its meters move with the
// music and its crossfader sits where the app's does. The script presses
// its keys and turns its knobs; the app does the rest.
import { useEffect, useRef, useState } from 'react';
import { engine } from '$lib/engine.svelte.js';
import { deckSlider } from './app.js';

// 33⅓ rpm: how far a platter turns in a second, in degrees.
const DEG_PER_SEC = (100 / 3 / 60) * 360;

/** One of the app's sliders, for the controller to mirror. */
function appSlider(d, which) {
  return deckSlider(d, which === 'pitch' || which === 'volume' ? which : `${which} EQ`);
}
/** How far along its travel a slider is, 0 to 1, from its own ARIA values. */
function along(el) {
  const min = +el.getAttribute('aria-valuemin');
  const max = +el.getAttribute('aria-valuemax');
  const v = +el.getAttribute('aria-valuenow');
  return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0.5;
}
/**
 * Where an EQ knob points, in degrees from 12 o'clock: its flat setting
 * straight up, full cut at -150, full boost at +150. The app's EQs cut far
 * more than they boost (-40 to +6 dB), so each side is scaled on its own.
 */
function eqAngle(el) {
  const min = +el.getAttribute('aria-valuemin');
  const max = +el.getAttribute('aria-valuemax');
  const v = +el.getAttribute('aria-valuenow');
  if (!(min < 0 && max > 0)) return -150 + 300 * along(el);
  return v >= 0 ? (150 * Math.min(v, max)) / max : (-150 * Math.max(v, min)) / min;
}

/**
 * The five drawings being tried (the site's Try panel picks one with a
 * message; `?controller=` picks one on load). Every one carries the same
 * controls under the same names, laid out and finished differently in
 * controller.css, so the script and the mirror below work on all of them.
 *   plate    the feature card's controller, scaled up: brushed aluminium,
 *            machined jog rims, a black mixer let into the metal
 *   compact  a smaller two-deck: short tempo faders by the jogs, two rows
 *            of pads (hot cues over stems) under them
 *   matte    a black body with aluminium accents: bright jog rims, an
 *            aluminium mixer face, the pads in a long row
 *   club     wide: long tempo faders, big jogs, a full mixer with three
 *            EQ knobs, channel faders and meters
 *   minimal  a thin slab: flat platters inside a lit ring, flat keys,
 *            the least print
 */
export const VERSIONS = ['plate', 'compact', 'matte', 'club', 'minimal'];
const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
const pick = (v) => (VERSIONS.includes(v) ? v : null);
/**
 * How it's drawn, apart from how it's laid out (controller-skins.css): the
 * same parts in the same places, finished in a different illustration
 * style. `?skin=` picks one on load, the site's Try panel after.
 *   current    light silver, halfway to studio industrial (controller.css)
 *   graphite   the graphite anodised metal before it
 *   polish     the silver with every part still dark (controller-finishes.css)
 *   most       the silver most of the way to studio industrial (the same)
 *   flat       a flat vector drawing: solid fills, hard offset shadows
 *   bauhaus    modernist: off-white, black, red, yellow and blue geometry
 *   te         small-studio industrial: flat aluminium grey, chunky
 *              coloured knobs, tiny monospaced print
 *   blueprint  a technical drawing: white linework on drafting blue
 *   riso       a two-ink risograph print: blue and fluoro pink on paper
 *   hifi       a 70s hi-fi: a walnut case, satin silver plates, amber lamps
 */
export const SKINS = ['current', 'graphite', 'polish', 'most', 'flat', 'bauhaus', 'te', 'blueprint', 'riso', 'hifi'];
const pickSkin = (v) => (SKINS.includes(v) ? v : null);

const PLAY = <svg viewBox="0 0 18 12" aria-hidden><path d="M1.5 1.6v8.8l6.6-4.4z" /><rect x="10.6" y="1.6" width="2" height="8.8" rx=".6" /><rect x="14.4" y="1.6" width="2" height="8.8" rx=".6" /></svg>;

/** A key with travel. Named for the script (data-target) and the mirror (data-hw). */
function Key({ name, d, className = '', children }) {
  return <div className={`hw-key ${className}`} data-target={`c-${name}-${d}`} data-hw={`${name}-${d}`}>{children}</div>;
}

function Deck({ side }) {
  const d = side === 'left' ? 0 : 1;
  return (
    <div className={`hw-deck hw-deck--${side}`}>
      <Pitch d={d} />
      <div className="hw-jog" data-target={`c-jog-${d}`}>
        <div className="hw-jog__ring" />
        <div className="hw-jog__platter" data-hw={`jog-${d}`}>
          <i className="hw-jog__mark" />
        </div>
        <div className="hw-jog__hub" />
      </div>
      <Key name="sync" d={d} className="hw-sync"><span>Sync</span></Key>
      <div className="hw-transport">
        <div className="hw-round hw-cue" data-target={`c-cue-${d}`} data-hw={`cue-${d}`}><span>Cue</span></div>
        <div className="hw-round hw-play" data-target={`c-play-${d}`} data-hw={`play-${d}`}>{PLAY}</div>
      </div>
      {/* Performance pads: a row of hot cues over a row of stems (a lit
          stem pad is playing; press to mute it). */}
      <div className="hw-perf">
        <div className="hw-pads hw-pads--cues">
          {[0, 1, 2, 3].map((i) => <i key={i} className="hw-pad" data-hw={`hotcue-${d}-${i}`}><span>{i + 1}</span></i>)}
        </div>
        <div className="hw-pads hw-pads--stems">
          {STEMS.map((s, i) => <i key={s} className="hw-pad" data-target={`c-stem-${d}-${i}`} data-hw={`stem-${d}-${i}`}><span>{s}</span></i>)}
        </div>
      </div>
      {/* A four-beat auto loop, and the deck's effect (Echo) with its level. */}
      <div className="hw-loopfx">
        <Key name="loop" d={d} className="hw-loop"><span>Loop</span><b>4</b></Key>
        <Key name="fx" d={d} className="hw-fx"><span>Echo</span></Key>
        <Knob label="FX" hw={`fxlevel-${d}`} className="hw-fxknob" />
      </div>
    </div>
  );
}

/** A tempo fader. Its cap follows the deck's rate (the slot's middle 90% is its travel). */
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

function Knob({ label, hw, className = '' }) {
  return (
    <div className={`hw-knob ${className}`}>
      <i data-hw={hw} />
      <span>{label}</span>
    </div>
  );
}

/** A channel strip: three EQ knobs (Low is the one the demo turns) and a fader. */
function Channel({ d }) {
  return (
    <div className={`hw-channel hw-channel--${d ? 'b' : 'a'}`}>
      <Knob label="High" hw={`high-${d}`} className="hw-eq hw-eq--high" />
      <Knob label="Mid" hw={`mid-${d}`} className="hw-eq hw-eq--mid" />
      <Knob label="Low" hw={`low-${d}`} className="hw-eq hw-eq--low" />
      <div className="hw-chfader"><div className="hw-chfader__slot" /><div className="hw-chfader__cap" data-hw={`vol-${d}`} /></div>
    </div>
  );
}

function Meter({ d }) {
  return <div className="hw-meter" data-hw={`meter-${d}`}>{Array.from({ length: 12 }, (_, i) => <i key={i} data-level={i > 10 ? 'peak' : i > 8 ? 'hot' : undefined} />).reverse()}</div>;
}

export function Controller({ shown }) {
  const root = useRef(null);
  // Mounted below the frame, then raised, so it always arrives by moving.
  const [up, setUp] = useState(false);
  // If it's asked for before the app is on screen (the page swaps a still
  // picture for the live app once it's loaded), it waits until the app has
  // faded in, so the rise is always seen.
  useEffect(() => {
    let t;
    const go = (wait) => (t = setTimeout(() => setUp(shown), wait));
    if (!shown || document.documentElement.hasAttribute('data-ready')) go(40);
    else {
      const watch = new MutationObserver(() => {
        if (!document.documentElement.hasAttribute('data-ready')) return;
        watch.disconnect();
        go(700);
      });
      watch.observe(document.documentElement, { attributes: true });
      return () => watch.disconnect();
    }
    return () => clearTimeout(t);
  }, [shown]);
  // Which drawing: ?controller= on load, then the site's Try panel.
  const [version, setVersion] = useState(() => pick(new URLSearchParams(location.search).get('controller')) ?? 'club');
  const [skin, setSkin] = useState(() => pickSkin(new URLSearchParams(location.search).get('skin')) ?? 'current');
  useEffect(() => {
    const on = (e) => {
      if (e.data?.interlude !== 'controller') return;
      if (pick(e.data.v)) setVersion(e.data.v);
      if (pickSkin(e.data.skin)) setSkin(e.data.skin);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => {
    // Only while it's up: a controller off screen has nothing to show.
    if (!up) return;
    let raf;
    // Its parts and the app's sliders, found once (and again if the app
    // redraws one), not on every frame.
    const parts = new Map();
    const el = (k) => {
      let n = parts.get(k);
      if (!n || !n.isConnected) {
        n = root.current?.querySelector(`[data-hw="${k}"]`) ?? null;
        parts.set(k, n);
      }
      return n;
    };
    const sliders = new Map();
    const slider = (d, which) => {
      const k = `${d}.${which}`;
      let n = sliders.get(k);
      if (!n || !n.isConnected) {
        n = appSlider(d, which);
        sliders.set(k, n);
      }
      return n;
    };
    // Each write only when it changes: a frame of the same values costs nothing.
    const last = new Map();
    const lit = (n, key, on) => {
      if (!n) return;
      const k = n.dataset.hw + key;
      if (last.get(k) === on) return;
      last.set(k, on);
      n.toggleAttribute(key, on);
    };
    const put = (n, prop, v) => {
      if (!n) return;
      const k = (n.dataset.hw ?? n.className) + prop;
      // A hand holding it sets it itself; forget what was written, so it's
      // written afresh when the hand lets go.
      if (n.hasAttribute('data-held')) return void last.delete(k);
      if (last.get(k) === v) return;
      last.set(k, v);
      if (prop === 'rotate') n.style.rotate = v;
      else if (prop === 'transform') n.style.transform = v;
      else n.style.setProperty(prop, v);
    };
    let xfCap = null;
    const frame = () => {
      for (const d of [0, 1]) {
        const deck = engine.decks[d];
        const other = engine.decks[1 - d];
        const jog = el(`jog-${d}`);
        put(jog, 'transform', `rotate(${((deck.position * DEG_PER_SEC) % 360).toFixed(1)}deg)`);
        // The jog's ring glows brighter while its deck plays.
        if (jog) lit(jog.parentElement, 'data-playing', deck.playing);
        lit(el(`play-${d}`), 'data-lit', deck.playing);
        lit(el(`cue-${d}`), 'data-lit', deck.loaded && !deck.playing);
        lit(el(`sync-${d}`), 'data-lit', deck.loaded && other.loaded &&
          Math.abs(deck.bpm * deck.rate - other.bpm * other.rate) < 0.01);
        // The tempo fader sits exactly where the app's does: same range, same
        // way up. While a hand holds it ([data-held]) the hand moves it, and
        // the app catches up.
        const cap = el(`pitch-${d}`);
        const app = slider(d, 'pitch');
        if (cap && app) put(cap, '--at', (1 - 2 * along(app)).toFixed(4));
        // The EQ knobs turn to where the app's are (flat is straight up).
        for (const band of ['high', 'mid', 'low']) {
          const knob = el(`${band}-${d}`);
          const eq = slider(d, band);
          if (knob && eq) put(knob, 'rotate', `${eqAngle(eq).toFixed(1)}deg`);
        }
        // The channel fader sits where the app's volume is (up is loud).
        const vol = el(`vol-${d}`);
        const fader = slider(d, 'volume');
        if (vol && fader) put(vol, '--at', (1 - along(fader)).toFixed(4));
        // Pads and keys light from the deck's state: hot cues that are set,
        // stems that are playing, a running loop, the effect when it's on.
        deck.hotCues?.forEach((c, i) => lit(el(`hotcue-${d}-${i}`), 'data-lit', c != null));
        const stems = deck.stems ?? 0b1111;
        for (let i = 0; i < 4; i++) lit(el(`stem-${d}-${i}`), 'data-lit', deck.loaded && !!(stems & (1 << i)));
        lit(el(`loop-${d}`), 'data-lit', !!deck.looping);
        lit(el(`fx-${d}`), 'data-lit', !!deck.fx?.on);
        const fxLevel = el(`fxlevel-${d}`);
        if (fxLevel) put(fxLevel, 'rotate', `${(-150 + 300 * (deck.fx?.level ?? 0.5)).toFixed(1)}deg`);
        // The channel meter, from the deck's level.
        const meter = el(`meter-${d}`);
        if (meter) {
          const n = meter.children.length;
          const on = Math.round((engine.deckLevels[d] ?? 0) * n);
          if (last.get(`meter${d}`) !== on) {
            last.set(`meter${d}`, on);
            for (let i = 0; i < n; i++) meter.children[i].toggleAttribute('data-lit', n - i <= on);
          }
        }
      }
      if (!xfCap?.isConnected) xfCap = root.current?.querySelector('[data-target="c-xf-cap"]');
      if (xfCap?.hasAttribute('data-held')) last.delete('xf');
      else {
        const xf = String(((engine.mixer?.crossfader ?? 0) + 1) / 2);
        if (last.get('xf') !== xf) {
          last.set('xf', xf);
          root.current?.style.setProperty('--xf', xf);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [up]);

  return (
    // (In a layer of its own the size of the hero, so the soft edge it
    // rises through is the controller's alone: hero.css .desk-clip.)
    <div className="desk-clip">
    <div className="desk" data-shown={up || undefined}>
      <div ref={root} className="hw" data-target="controller" data-v={version} data-skin={skin}>
        <Deck side="left" />
        <div className="hw-mixer">
          <div className="hw-browse-row">
            <div className="hw-browse" data-target="c-browse"><i /></div>
            <span className="hw-print">Push to load</span>
          </div>
          <div className="hw-channels">
            <Channel d={0} />
            <div className="hw-meters"><Meter d={0} /><Meter d={1} /></div>
            <Channel d={1} />
          </div>
          <div className="hw-xf" data-target="c-xf">
            <div className="hw-xf__slot" />
            <div className="hw-xf__cap" data-target="c-xf-cap" />
          </div>
        </div>
        <Deck side="right" />
        <i className="hw-badge" aria-hidden />
      </div>
    </div>
    </div>
  );
}
