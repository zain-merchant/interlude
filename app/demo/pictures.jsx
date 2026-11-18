// The website's small pictures: one per feature card and install step.
//
// Simplified and graphic, but built from the app's own parts: its knob (the
// 27-tick ring, the lit arc, the knurled dial), its outlined 8px buttons,
// stem dots, search well and list rows, its Rec button, its deck colours,
// type sizes and tokens. Each shows one thing happening, by itself, with no
// cursor:
//
//   Decks        two rows of beats, B slower and late; Sync lights, and
//                B's beats glide into line under A's as 118.00 rolls to 129.00
//   Mixer        High, Mid and Low; Low turns down to its kill
//   Stems        the four stems; Vocals mutes and its lane goes quiet
//   Library      tracks arrive from Rekordbox and Serato; "glass" lights the
//                matches in place and quiets the rest; the pick loads to A
//   Controllers  140+, and a controller connecting
//   Recording    Rec, the clock running, the take growing
//   Download     the disk image: the pointer drags Interlude onto Applications
//   Open it      Spotlight: "Interl", the rest filled in, the Top Hit
//   Add music    the library filling: tracks arrive, then their tempo and key
//
// Each is a 360 × 176 Stage. Some sit centred inside the card's insets (the
// knobs, the figure, the windows); some run off its edges where the thing
// they show does (the beat rails, the stem lanes, the take, long lists),
// and the card cuts them.
//
// Each plays once when shown. `Replay` (below) plays it again whenever the
// card is scrolled back into view, hovered or clicked.
import { useEffect, useRef, useState } from 'react';
import { Stage } from './stageshow/stage';
import { Count, Collapse } from './stageshow/motion';
import { spring, SMOOTH, SETTLE, GLIDE, SLIDE, LOCK } from './springs.js';
// The sync slide's time (pictures.css, --sync-ms).
const SYNC_MS = 750;
import './pictures.css';

// Timing, one system for every picture. A press is held for PRESS (Emil
// Kowalski's 100–160ms for feedback; the key lands in 92ms of it). Every
// motion runs on one of the named springs (springs.js, and springs.css for
// CSS), so it leaves at once and lands or settles without overshoot; the
// waits below are taken from those springs' times. Across cards, Replay
// paces when each picture starts.
const START = 120;
const PRESS = 200;

export const PW = 360;
export const PH = 176;
const TOKENS = { '--ss-font': "'Geist', 'Geist Variable', 'Helvetica Neue', Arial, sans-serif" };
const ICON = new URL('../../site/img/icon.svg', import.meta.url).href;

/** The frame every picture shares. */
// Played again (a hover or click on a finished card, Replay's `again`), a
// picture goes back to how it started where you can see it, rather than
// jumping there: by its own `rewind` (the knobs turn back, the stems come
// back up), or else a quick fade down, the start state set while it's out,
// and a fade back up. Then it holds the start a moment, so you see where it
// begins, before it plays.
// The same beat for every picture, features and install alike (each
// rewind ends as its last motion lands, so this is all the hold there is).
const HOLD = 220;
/** Steps a whole number from `from` down to `to`, one step every `ms`. */
async function countDown(a, key, from, to, ms) {
  for (let n = from - 1; n >= to; n--) { await a.wait(ms); a.put({ [key]: n }); }
}
const fadeOut = (el) => el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished;
const fadeIn = (el) => el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).finished;
function Pic({ id, initial, poster, script, rewind, hold = HOLD, gate, again, onDone, bleed, children }) {
  const body = useRef(null);
  return (
    <Stage width={PW} height={PH} theme="dark" unframed play="once" tokens={TOKENS} className={`p p--${id}`}
      initial={initial} poster={poster}
      script={async (a) => {
        // Wait for this picture's turn (Replay's sequence), then play.
        await gate;
        await a.wait(START);
        for (;;) {
          await script(a);
          onDone?.();
          if (!again) return;
          await again();
          if (rewind) await rewind(a);
          else {
            // (Set while it's out with its transitions off, so nothing on
            // the way back shows through as it fades up.)
            await fadeOut(body.current);
            body.current?.setAttribute('data-snap', '');
            await a.set(initial);
            await frame();
            await frame();
            body.current?.removeAttribute('data-snap');
            await fadeIn(body.current);
          }
          await a.wait(hold);
        }
      }}>
      {(s) => <div ref={body} className="p-body" data-bleed={bleed}>{children(s)}</div>}
    </Stage>
  );
}

// The EQ knobs, on Apple's spring (springs.js) as tuned by eye in
// site/lab/motion.html: a long, heavily damped turn that the magnet grabs
// over the last fifth and snaps home.
const KNOB_LOW = spring({ duration: 0.86, bounce: -0.3, mass: 0.75, velocity: 3.6, magnet: 1.8, range: 0.21 });
// High and Mid: the same spring without the magnet, and without the extra
// damping that only the magnet makes up for (it would creep for seconds).
const KNOB_SPRING = spring({ duration: 0.86, mass: 0.75, velocity: 3.6 });

// One step a frame, on the screen's own frame clock, timed from the first
// frame drawn: a 16ms timer drifts against the screen and judders.
const frame = () => new Promise((r) => requestAnimationFrame(r));
/** Eases a number in state from `from` to `to` over `ms`, a frame at a time. */
async function tween(a, key, from, to, ms, ease = SMOOTH.ease) {
  const t0 = await frame();
  for (let now = t0; ; now = await frame()) {
    const u = Math.min(1, (now - t0) / ms);
    a.put({ [key]: from + (to - from) * ease(u) });
    if (u >= 1) return;
  }
}

/* ---------------- Decks: Sync ---------------- */

// Two decks as two rows: the deck, its tempo, a run of its beats with the
// downbeats tall. B starts well slower (118) and over two beats late; Sync lights, B's
// beats slide under A's, its tempo rolls up, and as they lock a faint line
// runs down through each pair of downbeats.
// px between beats: chosen so the card's edge cuts mid-bar, between
// downbeats, not on one.
const TICK = 14;
const BEATS = 24;
const B_FROM = 118; // deck B's tempo before Sync
function Ticks({ deck, offset = 0, stretch = 1, children }) {
  return (
    <div className="p-ticks" data-deck={deck}>
      <div className="p-ticks__run" style={{ transform: `translateX(${offset}px) scaleX(${stretch})` }}>
        {Array.from({ length: BEATS }, (_, i) => <i key={i} data-bar={i % 4 === 0 || undefined} style={{ left: i * TICK }} />)}
        {children}
      </div>
    </div>
  );
}
// B starts this many beats behind A: well off, and not a whole number, so
// no beat lines up until Sync.
const B_LATE = 2.4;
// Being tried (html[data-decklayout]):
//   single   just Sync
//   stacked  Sync, then under it the deck's cues: two hot cues set on A
//            (each pad lights and a marker drops onto A's beats), then a
//            four-beat loop that lights its four beats. The pads and the
//            Loop key sit at the right, under the end of the beats
const stacked = () => document.documentElement.dataset.decklayout !== 'single';
const HOT_CUES = [1, 5]; // the beats they're set on
const LOOP_AT = 8; // the loop's first beat (a downbeat), well inside the card

export function Sync(play) {
  return (
    <Pic id="sync" {...play} bleed="right" initial={{ on: false, press: false, lock: false, cues: 0, cuePress: 0, loop: false, loopPress: false }}
      // Again: the lock, cues and loop go off, and B's beats slide back out.
      rewind={async (a) => { await a.set({ lock: false, cues: 0, loop: false }); await a.wait(120); await a.set({ on: false }); await a.wait(750); }}
      poster={{ on: true, press: false, lock: true, cues: HOT_CUES.length, cuePress: 0, loop: true, loopPress: false }}
      script={async (a) => {
        await a.set({ press: true });
        await a.wait(PRESS);
        await a.set({ press: false, on: true });
        // The lock lights as the beats arrive (they slide on the 750ms
        // curve, 90% home by 494ms; the lines take a moment to draw, so they
        // start just before).
        await a.wait(470);
        await a.set({ lock: true });
        if (!stacked()) return;
        // Then the cues: two pads pressed in turn, each setting a hot cue.
        await a.wait(500);
        for (let c = 1; c <= HOT_CUES.length; c++) {
          await a.set({ cuePress: c });
          await a.wait(PRESS);
          await a.set({ cuePress: 0, cues: c });
          await a.wait(320);
        }
        // And a four-beat loop.
        await a.wait(160);
        await a.set({ loopPress: true });
        await a.wait(PRESS);
        await a.set({ loopPress: false, loop: true });
      }}>
      {(s) => (
        <div className="p-decks" data-lock={s.lock || undefined}>
          <div className="p-deckrow" data-deck="a">
            <span className="p-chip">A</span>
            <b className="p-bpm">129.00</b>
            <Ticks deck="a">
              {HOT_CUES.map((b, n) => <b key={b} className="p-hcue" data-on={n < s.cues || undefined} style={{ left: b * TICK }}>{n + 1}</b>)}
              <span className="p-loopband" data-on={s.loop || undefined} style={{ left: LOOP_AT * TICK, width: 4 * TICK }} />
            </Ticks>
          </div>
          <div className="p-deckrow" data-deck="b">
            <span className="p-chip">B</span>
            <b className="p-bpm"><Count value={s.on ? 129 : B_FROM} format={(n) => n.toFixed(2)} duration={SYNC_MS} /></b>
            <Ticks deck="b" offset={s.on ? 0 : TICK * B_LATE} stretch={s.on ? 1 : 129 / B_FROM} />
          </div>
          <div className="p-locks" aria-hidden>
            {[0, 4, 8, 12, 16, 20].map((i, n) => <i key={i} style={{ left: i * TICK, '--n': n }} />)}
          </div>
          <div className="p-sync__key">
            <div className="p-btn" data-on={s.on || undefined} data-press={s.press || undefined}>Sync</div>
            <div className="p-cuepads" aria-hidden>
              {[1, 2, 3, 4].map((n) => <i key={n} data-on={n <= s.cues || undefined} data-press={s.cuePress === n || undefined}>{n}</i>)}
            </div>
            <div className="p-btn p-loopkey" data-on={s.loop || undefined} data-press={s.loopPress || undefined}>Loop 4</div>
          </div>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Mixer: the app's knob, Low to its kill ---------------- */

const TICKS = 27;
const angle = (p) => -135 + p * 270;
/** The app's knob (Knob.svelte): 27 ticks over 270°, lit from the middle to the value, a knurled dial. */
function Knob({ label, pos, killed, size = 44 }) {
  const R = size / 2 + 7;
  const box = size + 18;
  const lo = Math.min(pos, 0.5);
  const hi = Math.max(pos, 0.5);
  const half = 0.5 / (TICKS - 1);
  return (
    <div className="p-knob" data-killed={killed || undefined} style={{ '--rot': `${angle(pos)}deg` }}>
      <div className="p-knob__wrap" style={{ width: box, height: box }}>
        <svg width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden>
          {Array.from({ length: TICKS }, (_, i) => {
            const p = i / (TICKS - 1);
            const a = ((angle(p) - 90) * Math.PI) / 180;
            const major = i % ((TICKS - 1) / 2) === 0 || i % ((TICKS - 1) / 6) === 0;
            const r0 = R - (major ? 3.5 : 2.5);
            const on = hi - lo > 0.02 && p >= lo - half && p <= hi + half;
            return <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * (R + 1)} y2={Math.sin(a) * (R + 1)}
              className={`${major ? 'major' : ''} ${on ? 'on' : ''}`} />;
          })}
        </svg>
        <div className="p-knob__dial" style={{ width: size, height: size }}><b className="p-knob__knurl" /><span className="p-knob__cap" /><b className="p-knob__ptr"><i /></b></div>
      </div>
      {/* The band's name stays put; a kill turns it and the ring red and a
          small tag drops in under it, taking no room. */}
      <span className="p-knob__label">{label}<b className="p-knob__kill">Kill</b></span>
    </div>
  );
}

// Low reads as killed as soon as it reaches its last tick (half a tick's
// turn from the end): a spring only creeps up on the very end, and the
// tick shouldn't sit lit white there first.
const KILL_AT = 0.5 / (TICKS - 1);

export function Eq(play) {
  // All three turn, the way a DJ shapes a track: High down, Mid up, then
  // Low all the way down to its kill (counter-clockwise, clockwise, counter).
  return (
    <Pic id="eq" {...play} initial={{ hi: 0.5, mid: 0.5, low: 0.5 }} poster={{ hi: 0.18, mid: 0.85, low: 0 }}
      // Again: all three turn back to the middle together, on SMOOTH.
      rewind={async (a) => {
        const from = { hi: 0.18, mid: 0.85, low: 0 };
        const t0 = await frame();
        for (let now = t0; ; now = await frame()) {
          const u = Math.min(1, (now - t0) / 480);
          const k = SMOOTH.ease(u);
          a.put({ hi: from.hi + (0.5 - from.hi) * k, mid: from.mid + (0.5 - from.mid) * k, low: from.low + (0.5 - from.low) * k });
          if (u >= 1) break;
        }
      }}
      script={async (a) => {
        // One cascade: Mid takes over while High is still turning, then Low
        // travels furthest and snaps onto its kill (the only one with the
        // magnet).
        const turn = (key, to, sp = KNOB_SPRING) => tween(a, key, 0.5, to, sp.ms, sp.ease);
        await Promise.all([
          turn('hi', 0.18),
          a.wait(290).then(() => turn('mid', 0.85)),
          a.wait(700).then(() => turn('low', 0, KNOB_LOW)),
        ]);
      }}>
      {(s) => (
        <div className="p-eq">
          <Knob label="High" pos={s.hi} size={66} />
          <Knob label="Mid" pos={s.mid} size={66} />
          <Knob label="Low" pos={s.low} killed={s.low <= KILL_AT} size={66} />
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Stems: parts in and out, each lane running off the right ---------------- */

const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
const STEM_SHAPES = [
  (i) => (i % 10 < 6 ? 0.3 + 0.55 * Math.abs(Math.sin(i * 0.8)) : 0.06),
  (i) => 0.3 + 0.4 * Math.abs(Math.sin(i * 0.3)) + 0.12 * Math.abs(Math.sin(i * 1.7)),
  (i) => (i % 2 === 0 ? 0.72 : 0.38),
  (i) => (i % 4 === 0 ? 0.95 : i % 2 === 0 ? 0.42 : 0.2),
];
// Which stems are muted, step by step: vocals out, then drums, the vocals
// back, the melody out. Each lane flattens or grows back, left to right.
const STEM_STEPS = [[0], [0, 3], [3], [3, 1]];
// The order a lane's bars move in when it's muted or unmuted, as tuned in
// site/lab/motion.html: a left-to-right sweep (STEM_STEP apart), every
// second bar a little behind, each by its own amount (up to STEM_LAG steps),
// the same every time.
const STEM_STEP = 15.5;
const STEM_LAG = 4.4;
const jitter = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const stemDelay = (i) => Math.round((i + (i % 2) * (0.4 + 1.2 * jitter(i)) * STEM_LAG) * STEM_STEP);

export function Stems(play) {
  return (
    <Pic id="stems" {...play} bleed="right" initial={{ muted: [] }} poster={{ muted: STEM_STEPS.at(-1) }}
      // Again: every stem comes back up, its bars growing back in their wave.
      rewind={async (a) => { await a.set({ muted: [] }); await a.wait(700); }}
      script={async (a) => {
        for (const muted of STEM_STEPS) {
          await a.set({ muted });
          await a.wait(700);
        }
      }}>
      {(s) => (
        <div className="p-stems">
          {STEMS.map((name, k) => (
            <div key={name} className="p-stem" data-muted={s.muted.includes(k) || undefined}>
              <span className="p-stem__btn"><i />{name}</span>
              <div className="p-stem__wave">
                {Array.from({ length: 40 }, (_, i) => <b key={i} style={{ '--h': STEM_SHAPES[k](i), '--delay': `${stemDelay(i)}ms` }} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Library: tracks come in, a search finds two ---------------- */

// One small library view, in three calm beats, one thing moving at a time:
//   1. The tracks arrive, one by one into their own places, each with its
//      format and where it came from (Rekordbox or Serato).
//   2. "glass" is typed. Nothing moves: as each letter lands, the letters
//      that match light up in place and the tracks that don't fall quiet
//      (g: all four; gl: three; gla: the two Glass ones).
//   3. The first match is picked and loads to Deck A.
// Rows keep their places throughout, so the eye never has to follow a reflow.
const LIB = [
  { t: 'Night Shift', fmt: 'FLAC', src: 'Rekordbox' },
  { t: 'Glass Rooms', fmt: 'MP3', src: 'Serato' },
  { t: 'Afterglow', fmt: 'WAV', src: 'Rekordbox' },
  { t: 'Glasshouse', fmt: 'AIFF', src: 'Serato' },
];
const LIB_QUERY = 'glass';
const LIB_PICK = 1;

/** The title, with the part that matches the search lit. */
function Marked({ text, q }) {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

export function Search(play) {
  return (
    <Pic id="search" {...play} initial={{ rows: 0, q: '', sel: false, loaded: false }} poster={{ rows: LIB.length, q: LIB_QUERY, sel: true, loaded: true }}
      // Again: the search clears and the track lets go, then the rows
      // leave, last first.
      rewind={async (a) => {
        await a.set({ loaded: false, sel: false, q: '' });
        await a.wait(140);
        await countDown(a, 'rows', LIB.length, 0, 40);
        await a.wait(160);
      }}
      script={async (a) => {
        // 1. In they come.
        for (let rows = 1; rows <= LIB.length; rows++) {
          await a.set({ rows });
          await a.wait(110);
        }
        // 2. A short pause, then the search, typed briskly: the first two
        //    letters (where the matches change most) a beat apart, the rest
        //    quick. The rows' own fades keep their length.
        await a.wait(320);
        for (let i = 1; i <= LIB_QUERY.length; i++) {
          await a.set({ q: LIB_QUERY.slice(0, i) });
          await a.wait(i < 3 ? 170 : 95);
        }
        // 3. The first match is picked, then loaded to Deck A.
        await a.wait(420);
        await a.set({ sel: true });
        await a.wait(450);
        await a.set({ loaded: true });
      }}>
      {(s) => {
        const hit = (r) => r.t.toLowerCase().includes(s.q);
        const found = LIB.filter(hit).length;
        return (
          <div className="p-lib">
            <div className="p-lib__field" data-focus={s.q ? '' : undefined}>
              <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
              <span>{s.q || <em>Search</em>}{s.q && <i className="p-caret" />}</span>
              {(s.rows > 0 || s.q) && <b>{s.q ? `${found} of ${LIB.length}` : `${s.rows} ${s.rows === 1 ? 'track' : 'tracks'}`}</b>}
            </div>
            <div className="p-lib__list">
              {LIB.map((r, i) => (
                <div key={r.t} className="p-lib__row" data-in={i < s.rows || undefined} data-dim={(s.q && !hit(r)) || undefined}
                  data-sel={(s.sel && i === LIB_PICK) || undefined} data-loaded={(s.loaded && i === LIB_PICK) || undefined}>
                  <span className="t"><span><Marked text={r.t} q={s.q} /></span><b className="p-lib__deck">A</b></span>
                  <span className="p-lib__fmt">{r.fmt}</span>
                  <span className="p-lib__src" data-src={r.src}>{r.src}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </Pic>
  );
}

/* ---------------- Controllers: plug it in, and it's ready ---------------- */

// The top of a controller, run off the bottom of the card: a lead comes
// down into its back, the pads wake in a sweep, the jog rings light, and
// the app says it's connected and mapped.
export function Controllers(play) {
  return (
    <Pic id="ctl" {...play} bleed="bottom" initial={{ plug: false, wake: false, toast: false }} poster={{ plug: true, wake: true, toast: true }}
      // Again: the toast and the lights go, then the lead lifts out.
      rewind={async (a) => { await a.set({ toast: false, wake: false }); await a.wait(160); await a.set({ plug: false }); await a.wait(LOCK.ms); }}
      script={async (a) => {
        await a.set({ plug: true });
        // It wakes as the plug seats (it comes down on LOCK and stops dead
        // in the port at 352ms); the toast follows close behind.
        await a.wait(LOCK.ms);
        await a.set({ wake: true });
        await a.wait(140);
        await a.set({ toast: true });
      }}>
      {(s) => (
        <div className="p-ctl" data-wake={s.wake || undefined}>
          <div className="p-ctl__lead" data-in={s.plug || undefined}><i /></div>
          <div className="p-ctl__plate">
            <div className="p-ctl__jog" />
            <div className="p-ctl__mix">
              <i /><i /><i /><i />
              <b />
            </div>
            <div className="p-ctl__jog" data-deck="b" />
            <div className="p-ctl__pads">{Array.from({ length: 4 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
            <div className="p-ctl__pads" data-deck="b">{Array.from({ length: 4 }, (_, i) => <i key={i} style={{ '--i': 4 + i }} />)}</div>
          </div>
          <div className="p-toast" data-on={s.toast || undefined}><i />DDJ-FLX4 connected</div>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Recording and more ---------------- */

// Being tried (html[data-reclayout]):
//   stacked   Record (its waveform growing as the set is recorded) over the
//             Sampler's pads
//   side      the same two side by side
//   carousel  Record, Sampler and Shortcuts: one large in the middle doing
//             its thing, then it eases aside as the next grows into place
const PADS = 8;
// The Sampler plays a finger-drum groove on a steady grid of eighths at
// 120 bpm: kick, hat, snare, hat, twice over, with the end pad in place
// of the last hat. Kick sits on the first pad, the hat in the middle, the snare
// beyond it. Capitals are accents (the downbeats), played a little brighter.
const EIGHTH = 250; // ms
const GROOVE = ['K', 'h', 'S', 'h', 'K', 'h', 'S', 'X'];
const GROOVE_PAD = { K: 0, h: 3, S: 5, X: 7 };
const WAVE = Array.from({ length: 44 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)));
export function Extras(play) {
  return (
    <Pic id="extras" {...play}
      // Again: the sampler stays as it is; the recorder stops, its take
      // clears and its time goes back to Rec.
      rewind={async (a) => {
        await a.set({ rec: false, key: 'W', focus: 0 });
        for (let n = WAVE.length; n > 0; ) { n = Math.max(0, n - 4); a.put({ bars: n }); await frame(); }
        await a.set({ sec: 0 });
        await a.wait(120);
      }}
      initial={{ rec: false, sec: 0, bars: 0, hits: Array(PADS).fill(0), accent: Array(PADS).fill(false), key: 'W', focus: 0 }} poster={{ rec: true, sec: 9, bars: WAVE.length, hits: Array(PADS).fill(0), accent: Array(PADS).fill(false), key: 'Space', focus: 0 }}
      script={async (a) => {
        await a.set({ rec: true });
        let sec = 0;
        let bars = 0;
        const clock = setInterval(() => a.put({ sec: Math.min(59, ++sec) }), 1000);
        const grow = setInterval(() => a.put({ bars: Math.min(WAVE.length, ++bars) }), 70);
        await a.wait(document.documentElement.dataset.reclayout === 'carousel' ? 1500 : 600);
        await a.set({ focus: 1 });
        await a.wait(document.documentElement.dataset.reclayout === 'carousel' ? 450 : 0);
        // Each hit lands on the grid, timed from the first (not chained, so
        // nothing drifts), and rings out on its own while the next lands.
        const hits = Array(PADS).fill(0);
        const accent = Array(PADS).fill(false);
        const t0 = performance.now();
        for (let k = 0; k < GROOVE.length; k++) {
          await a.wait(Math.max(0, t0 + k * EIGHTH - performance.now()));
          const g = GROOVE[k];
          const pad = GROOVE_PAD[g];
          hits[pad]++;
          accent[pad] = g === g.toUpperCase() && g !== 'h';
          a.put({ hits: [...hits], accent: [...accent] });
        }
        await a.wait(EIGHTH + 400);
        await a.set({ focus: 2 });
        await a.wait(600);
        await a.set({ key: 'Space' });
        await a.wait(1100);
        await a.set({ focus: 0 });
        await a.wait(900);
        clearInterval(clock);
        clearInterval(grow);
        a.put({ bars: WAVE.length });
      }}>
      {(s) => (
        <div className="p-extras" style={{ '--focus': s.focus }}>
          <figure className="p-x p-x--rec" data-focus={s.focus === 0 || undefined}>
            <figcaption>Record</figcaption>
            <div className="p-recbox">
              <div className="p-rec-lg" data-on={s.rec || undefined}><i /><span>{s.rec ? `0:${String(s.sec).padStart(2, '0')}` : 'Rec'}</span></div>
              <div className="p-recwave" aria-hidden>{WAVE.map((h, i) => <i key={i} data-on={i < s.bars || undefined} style={{ '--h': h }} />)}</div>
            </div>
          </figure>
          <figure className="p-x p-x--pads" data-focus={s.focus === 1 || undefined}>
            <figcaption>Sampler</figcaption>
            <div className="p-pads p-pads--lg">{/* Keyed by its hit count, so each hit starts the pad's light afresh. */}
              {Array.from({ length: PADS }, (_, i) => <i key={`${i}.${s.hits[i]}`} data-hit={s.hits[i] > 0 ? (s.accent[i] ? 'accent' : 'soft') : undefined} />)}</div>
          </figure>
          <figure className="p-x p-x--keys" data-focus={s.focus === 2 || undefined}>
            <figcaption>Shortcuts</figcaption>
            <div className="p-remap">
              <kbd className="p-key">Play</kbd>
              <svg viewBox="0 0 16 8" aria-hidden><path d="M1 4h13m-3-3 3 3-3 3" /></svg>
              <kbd className="p-key"><span key={s.key}>{s.key}</span></kbd>
            </div>
          </figure>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Install ---------------- */

// macOS's own Applications and Music folder icons, from the system's icon files.
const APPS = new URL('./apps-folder.png', import.meta.url).href;
const MUSIC = new URL('./music-folder.png', import.meta.url).href;

// Dragging Interlude into Applications the way Finder does it: the arrow
// comes onto the icon and presses (icon and name take the selection), then
// a faint copy of both, the same size, follows the pointer, keeping where
// it was grabbed, with the green "+" of a copy at the pointer. Over
// Applications the folder darkens in its highlight; let go, and the copy is
// gone at once; the pointer rests where it let go, then fades. The original never moves. Body coordinates, in px: the two
// items are centred at DMG_A and DMG_B, the icons' middles at DMG_Y.
const DMG_A = 78;
const DMG_B = 234;
const DMG_Y = 44;
const GRAB = { x: DMG_A + 6, y: DMG_Y + 8 }; // where the arrow takes the icon
const DROP = { x: DMG_B + 4, y: DMG_Y + 6 };
const REST = { x: DMG_A + 34, y: DMG_Y + 30 }; // where the arrow starts, just off the icon

/**
 * Moves the arrow from `from` to `to` on a spring, bowed upward by `arc` px,
 * a frame at a time on the screen's clock. The spring leaves at once (it has
 * an initial velocity) and comes to rest without overshoot, so the bow,
 * worked out from how far along it is, never dips below the line.
 */
async function glide(a, from, to, sp, arc = 0) {
  const t0 = await frame();
  for (let now = t0; ; now = await frame()) {
    const u = Math.min(1, (now - t0) / sp.ms);
    const t = sp.ease(u);
    a.put({ cx: from.x + (to.x - from.x) * t, cy: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc });
    if (u >= 1) return;
  }
}

/** macOS's arrow pointer: black, a white outline, a soft shadow. Its tip is at (0, 0). */
function Arrow({ x, y, copy, gone }) {
  return (
    <div className="p-cursor" data-gone={gone || undefined} style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden>
      <svg width="15" height="22" viewBox="-1.5 -1.5 15 22"><path d="M0 0v16.2l3.9-3.7 2.6 6.1 2.6-1.1-2.5-5.9H12Z" /></svg>
      <b className="p-cursor__copy" data-on={copy || undefined} />
    </div>
  );
}

export function Download(play) {
  const start = { cx: REST.x, cy: REST.y, sel: false, drag: false, copy: false, done: false, gone: false };
  return (
    <Pic id="dmg" {...play} initial={start} poster={{ ...start, cx: DROP.x, cy: DROP.y, sel: true, done: true, gone: true }}
      // Again: the pointer (gone by now) comes back where it starts, fading
      // in as the selection clears; nothing else has moved.
      rewind={async (a) => {
        a.put({ cx: REST.x, cy: REST.y });
        await frame();
        await a.set({ gone: false, done: false, sel: false });
        await a.wait(260);
      }}
      script={async (a) => {
        // Onto the icon (it starts just beside it), settle, press.
        await glide(a, REST, GRAB, SMOOTH, 3);
        await a.wait(160);
        await a.set({ sel: true });
        await a.wait(200);
        // Drag: the copy lifts off with the pointer; the "+" shows once it's moving.
        a.put({ drag: true });
        const going = glide(a, GRAB, DROP, GLIDE, 16);
        await a.wait(160);
        a.put({ copy: true });
        await going;
        // Over Applications a moment, then let go: it ends there, the
        // pointer resting on the folder a beat before it fades away.
        await a.wait(380);
        await a.set({ drag: false, copy: false, done: true });
        await a.wait(550);
        await a.set({ gone: true });
      }}>
      {(s) => {
        const over = s.drag && s.cx > DMG_B - 40;
        const dx = s.cx - GRAB.x;
        const dy = s.cy - GRAB.y;
        return (
          <div className="p-dmg">
            <div className="p-dmg__bar"><i /><i /><i /><span>Interlude</span></div>
            <div className="p-dmg__body">
              <svg className="p-dmg__arrow" viewBox="0 0 60 12" aria-hidden><path d="M2 6h52m-6-5 6 5-6 5" /></svg>
              <div className="p-dmg__item" data-sel={s.sel || undefined} style={{ left: DMG_A }}>
                <img src={ICON} alt="" width="58" height="58" />
                <span>Interlude</span>
              </div>
              <div className="p-dmg__item" data-over={over || undefined} style={{ left: DMG_B }}>
                <img src={APPS} alt="" width="64" height="64" className="p-folder" />
                <span>Applications</span>
              </div>
              {/* The drag image: a faint copy of icon and name, same size, offset as grabbed. */}
              <div className="p-dmg__item p-dmg__ghost" data-on={s.drag || undefined} style={{ left: DMG_A, transform: `translate(${dx}px, ${dy}px)` }} aria-hidden>
                <img src={ICON} alt="" width="58" height="58" />
                <span>Interlude</span>
              </div>
              <Arrow x={s.cx} y={s.cy} copy={s.copy} gone={s.gone} />
            </div>
          </div>
        );
      }}
    </Pic>
  );
}

export function Open(play) {
  const WORD = 'Interlude';
  return (
    <Pic id="open" {...play} initial={{ n: 0, hit: false, go: false }} poster={{ n: 6, hit: true, go: false }}
      // Again: the word is deleted a letter at a time, the Top Hit closing
      // as it stops matching.
      rewind={async (a) => {
        for (let n = 5; n >= 0; n--) { await a.wait(55); await a.set({ n, hit: n >= 3 }); }
        await a.wait(160);
      }}
      script={async (a) => {
        for (let n = 1; n <= 6; n++) {
          await a.set({ n, hit: n >= 3 });
          await a.wait(60);
        }
        await a.wait(220);
        await a.set({ go: true });
        await a.wait(PRESS);
        await a.set({ go: false });
      }}>
      {(s) => (
        <div className="p-spot">
          <div className="p-spot__bar">
            <svg viewBox="0 0 16 16" aria-hidden><circle cx="6.8" cy="6.8" r="4.6" /><path d="m10.4 10.4 3.3 3.3" /></svg>
            {s.n ? (
              <span className="p-spot__q">
                {WORD.slice(0, s.n)}
                {s.hit && <span className="p-spot__rest">{WORD.slice(s.n)} — Application</span>}
              </span>
            ) : (
              <span className="p-spot__ph">Spotlight Search</span>
            )}
            {s.hit && <img src={ICON} alt="" width="22" height="22" className="p-spot__icon" />}
          </div>
          <Collapse open={s.hit}>
            <div className="p-spot__list">
              <div className="p-spot__head">Top Hit</div>
              <div className="p-spot__hit" data-go={s.go || undefined}><img src={ICON} alt="" width="22" height="22" /><b>Interlude</b><span>Application</span></div>
            </div>
          </Collapse>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Add music: a folder dropped in, the tracks found and worked out ---------------- */

const ADDED = [
  { title: 'Afterglow', artist: 'Deepfield', bpm: 129, key: 'Bm' },
  { title: 'Night Shift', artist: 'Mara Lune', bpm: 118, key: 'C' },
  { title: 'Paper Planes', artist: 'Nova Reyes', bpm: 118, key: 'C' },
  { title: 'Concrete Garden', artist: 'Mara Lune', bpm: 119, key: 'C♯m' },
  { title: 'Slow Burn', artist: 'Nova Reyes', bpm: 123, key: 'Fm' },
];
const TOTAL = 48;
export function AddMusic(play) {
  return (
    <Pic id="add" {...play} bleed="bottom" initial={{ drop: false, rows: 0, known: 0, out: false }} poster={{ drop: true, rows: ADDED.length, known: ADDED.length, out: false }}
      // Again: the tracks curl up, last first, as the folder and its words
      // fade out small and soft (data-out); only once they're gone does the
      // empty "+ Add music folder" come back, so the two never overlap.
      rewind={async (a) => {
        await a.set({ out: true });
        await countDown(a, 'rows', ADDED.length, 0, 35);
        await a.wait(60);
        await a.set({ drop: false, known: 0 });
        await a.wait(220);
        await a.set({ out: false });
      }}
      script={async (a) => {
        await a.set({ drop: true });
        // Tracks start arriving as the folder lands (it drops on SETTLE,
        // nearly home by 350ms), and are worked out while they're still
        // arriving.
        await a.wait(380);
        for (let rows = 1; rows <= ADDED.length; rows++) {
          await a.set({ rows });
          await a.wait(90);
        }
        // Then, calmly, what each one is: its tempo and key, one by one.
        await a.wait(380);
        for (let known = 1; known <= ADDED.length; known++) {
          await a.set({ known });
          await a.wait(340);
        }
      }}>
      {(s) => {
        const ready = s.known >= ADDED.length;
        return (
          <div className="p-add" data-drop={s.drop || undefined} data-ready={ready || undefined} data-out={s.out || undefined}>
            <div className="p-add__zone">
              <span className="p-add__icon">
                <img src={MUSIC} alt="" width="34" height="34" className="p-add__folder" />
                <i className="p-add__badge" />
              </span>
              <div className="p-add__status">
                <b>House</b>
                <span className="p-add__say" key={ready ? 'r' : 'a'}>{ready ? `${TOTAL} tracks ready to play` : s.known ? `Reading ${Math.round((s.known / ADDED.length) * TOTAL)} of ${TOTAL}` : `Reading ${TOTAL} tracks`}</span>
              </div>
            </div>
            {ADDED.map((t, i) => (
              <div key={t.title} className="p-add__row" data-in={i < s.rows || undefined}>
                <span className="t"><b>{t.title}</b>{t.artist}</span>
                <span className="v" data-known={i < s.known || undefined}>{i < s.known ? t.bpm : '–'}</span>
                <span className="v" data-known={i < s.known || undefined}>{i < s.known ? t.key : '–'}</span>
              </div>
            ))}
          </div>
        );
      }}
    </Pic>
  );
}

export const FEATURES = { decks: Sync, mixer: Eq, stems: Stems, library: Search, controllers: Controllers, recording: Extras };
export const INSTALL = { download: Download, open: Open, music: AddMusic };

/* ---------------- Playing them ---------------- */

// The pictures in a grid play one at a time, in reading order: left to
// right, then the next row. A card's turn comes when its picture and at
// least 30% of the text below it are on screen. A card still on screen
// that isn't ready yet holds the queue; cards that are off screen, or
// scrolled up so most of the picture is gone, are passed over, so a row scrolled past doesn't hold up the next. A card
// that leaves the screen entirely resets, to play again when it's back.
// Hover or click a card to play it again at once.
const grids = new Map();
let lastScroll = 0;
addEventListener('scroll', () => (lastScroll = performance.now()), { passive: true });

function gridOf(card) {
  const host = card.parentElement;
  if (!grids.has(host)) {
    const grid = { host, entries: [], playing: null };
    grids.set(host, grid);
    const tick = () => step(grid);
    addEventListener('scroll', tick, { passive: true });
    addEventListener('resize', tick);
  }
  return grids.get(host);
}

function measure(e) {
  const card = e.card.getBoundingClientRect();
  const pic = e.box.getBoundingClientRect();
  const vh = innerHeight;
  const seen = card.bottom > 0 && card.top < vh;
  const below = card.bottom - pic.bottom;
  const shownBelow = Math.min(vh, card.bottom) - pic.bottom;
  // A picture scrolled up so that less than 60% of it still shows has been
  // passed: it never holds the queue (only a card still coming up from
  // below does), so the next row starts as soon as it is in view enough.
  const shown = (Math.min(vh, pic.bottom) - Math.max(0, pic.top)) / pic.height;
  const passed = pic.top < 0 && shown < 0.6;
  const ready = seen && !passed && shownBelow >= below * 0.3;
  return { seen, ready, passed };
}

function step(grid) {
  const ordered = [...grid.entries].sort((x, y) => (x.card.compareDocumentPosition(y.card) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const e of ordered) {
    const { seen } = measure(e);
    if (!seen && e.state !== 'idle') e.reset();
  }
  // A picture that started and was then scrolled up out of view pauses
  // (the stage only runs on screen), so it would never finish: count it as
  // played and let the queue move on.
  if (grid.playing && measure(grid.playing).passed) {
    grid.playing.state = 'done';
    grid.playing = null;
  }
  if (grid.playing) return;
  for (const e of ordered) {
    if (e.state === 'done') continue;
    const { seen, ready, passed } = measure(e);
    if (!seen || passed) continue;
    if (!ready) return;
    grid.playing = e;
    e.play();
    return;
  }
}

export function Replay({ Graphic, card }) {
  const box = useRef(null);
  const [run, setRun] = useState({ key: 0, gate: null, release: null });
  useEffect(() => {
    const grid = gridOf(card);
    let n = 0;
    let open;
    const fresh = () => {
      const gate = new Promise((r) => (open = r));
      setRun({ key: ++n, gate });
    };
    const entry = {
      card,
      box: box.current,
      state: 'idle',
      play() {
        entry.state = 'playing';
        open();
      },
      done() {
        if (entry.state !== 'playing') return;
        entry.state = 'done';
        if (grid.playing === entry) grid.playing = null;
        step(grid);
      },
      reset() {
        if (grid.playing === entry) grid.playing = null;
        entry.state = 'idle';
        replaying = false;
        fresh();
      },
    };
    grid.entries.push(entry);
    fresh();
    requestAnimationFrame(() => step(grid));
    // Play it again, outside the queue, when the mouse really moves over
    // the card (not when scrolling slides the card under a still pointer)
    // or when it's clicked; only once it has had its turn.
    // Never restarts one already running, whichever way it started.
    let replaying = false;
    let hovered = false;
    let next = null;
    box.current.__again = () => new Promise((r) => (next = r));
    const again = () => {
      // Not had its turn yet: a real hover plays it now, out of the queue.
      if (entry.state === 'idle') {
        if (!grid.playing) grid.playing = entry;
        entry.play();
        return;
      }
      if (entry.state !== 'done' || replaying || !next) return;
      // The picture goes back to its start where you can see it, and plays
      // again (Pic), rather than being remounted at its start.
      replaying = true;
      const go = next;
      next = null;
      go();
    };
    const move = (e) => {
      if (hovered || performance.now() - lastScroll < 350) return;
      if (!e.movementX && !e.movementY) return;
      hovered = true;
      again();
    };
    const leave = () => (hovered = false);
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('click', again);
    entry.finished = () => {
      replaying = false;
      entry.done();
    };
    box.current.__entry = entry;
    return () => {
      grid.entries.splice(grid.entries.indexOf(entry), 1);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', leave);
      card.removeEventListener('click', again);
    };
  }, [card]);
  return (
    <div ref={box} className="p-slot">
      {run.gate ? <Graphic key={run.key} gate={run.gate} again={() => box.current.__again()} onDone={() => box.current?.__entry?.finished()} /> : <div className="p-slot__hold" />}
    </div>
  );
}
