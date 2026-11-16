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
//   Library      "glass" typed into search; the list closes to its matches
//   Controllers  140+, and a controller connecting
//   Recording    Rec, the clock running, the take growing
//   Download     the disk image: Interlude glides onto Applications
//   Open it      Spotlight: "Interl", the rest filled in, the Top Hit
//   Add music    the library filling: tracks arrive, then their tempo and key
//
// Each is a 360 × 196 Stage. Some sit centred inside the card's insets (the
// knobs, the figure, the windows); some run off its edges where the thing
// they show does (the beat rails, the stem lanes, the take, long lists),
// and the card cuts them.
//
// Each plays once when shown. `Replay` (below) plays it again whenever the
// card is scrolled back into view, hovered or clicked.
import { useEffect, useRef, useState } from 'react';
import { Stage } from './stageshow/stage';
import { Count, Collapse } from './stageshow/motion';
import './pictures.css';

// Timing, one system for every picture. A press reads in PRESS (Emil
// Kowalski's 100–160ms for feedback). These are little stories, not UI
// responses, so movement takes longer than his under-300ms rule for
// interface motion: MOVE on a soft ease-in-out. Related motions overlap,
// CASCADE apart. Across cards, Replay paces when each picture starts.
const START = 120;
const PRESS = 140;
const MOVE = 950;
const CASCADE = 140;

export const PW = 360;
export const PH = 176;
const TOKENS = { '--ss-font': "'Geist', 'Geist Variable', 'Helvetica Neue', Arial, sans-serif" };
const ICON = new URL('../../site/img/icon.svg', import.meta.url).href;

/** The frame every picture shares. */
function Pic({ id, initial, poster, script, gate, onDone, bleed, children }) {
  return (
    <Stage width={PW} height={PH} theme="dark" unframed play="once" tokens={TOKENS} className={`p p-${id}`}
      initial={initial} poster={poster}
      script={async (a) => {
        // Wait for this picture's turn (Replay's sequence), then play.
        await gate;
        await a.wait(START);
        await script(a);
        onDone?.();
      }}>
      {(s) => <div className="p-body" data-bleed={bleed}>{children(s)}</div>}
    </Stage>
  );
}

// A soft ease-in-out (sine): unhurried at both ends.
const inOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Eases a number in state from `from` to `to` over `ms`, a frame at a time. */
async function tween(a, key, from, to, ms, ease = (t) => 1 - (1 - t) ** 3) {
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    a.put({ [key]: from + (to - from) * ease(i / steps) });
    await a.wait(16);
  }
}

/* ---------------- Decks: Sync ---------------- */

// Two decks as two rows: the deck, its tempo, a run of its beats with the
// downbeats tall. B starts well slower (118) and more than half a beat late; Sync lights, B's
// beats slide under A's, its tempo rolls up, and as they lock a faint line
// runs down through each pair of downbeats.
const TICK = 16; // px between beats
const BEATS = 16;
const B_FROM = 118; // deck B's tempo before Sync
function Ticks({ deck, offset = 0, stretch = 1 }) {
  return (
    <div className="p-ticks" data-deck={deck}>
      <div className="p-ticks__run" style={{ transform: `translateX(${offset}px) scaleX(${stretch})` }}>
        {Array.from({ length: BEATS }, (_, i) => <i key={i} data-bar={i % 4 === 0 || undefined} style={{ left: i * TICK }} />)}
      </div>
    </div>
  );
}

export function Sync(play) {
  return (
    <Pic id="sync" {...play} bleed="right" initial={{ on: false, press: false, lock: false }} poster={{ on: true, press: false, lock: true }}
      script={async (a) => {
        await a.set({ press: true });
        await a.wait(PRESS);
        await a.set({ press: false, on: true });
        // The lock lights as the beats arrive (the slide is 0.75 s).
        await a.wait(650);
        await a.set({ lock: true });
      }}>
      {(s) => (
        <div className="p-decks" data-lock={s.lock || undefined}>
          <div className="p-deckrow" data-deck="a">
            <span className="p-chip">A</span>
            <b className="p-bpm">129.00</b>
            <Ticks deck="a" />
          </div>
          <div className="p-deckrow" data-deck="b">
            <span className="p-chip">B</span>
            <b className="p-bpm"><Count value={s.on ? 129 : B_FROM} format={(n) => n.toFixed(2)} duration={700} /></b>
            <Ticks deck="b" offset={s.on ? 0 : TICK * 0.6} stretch={s.on ? 1 : 129 / B_FROM} />
          </div>
          <div className="p-locks" aria-hidden>
            {[0, 4, 8, 12].map((i, n) => <i key={i} style={{ left: i * TICK, '--n': n }} />)}
          </div>
          <div className="p-sync__key">
            <div className="p-btn" data-on={s.on || undefined} data-press={s.press || undefined}>Sync</div>
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
        <div className="p-knob__dial" style={{ width: size, height: size }}><i /></div>
      </div>
      {/* The band's name stays put; a kill turns it and the ring red and a
          small tag drops in under it, taking no room. */}
      <span className="p-knob__label">{label}<b className="p-knob__kill">Kill</b></span>
    </div>
  );
}

export function Eq(play) {
  // All three turn, the way a DJ shapes a track: High down, Mid up, then
  // Low all the way down to its kill (counter-clockwise, clockwise, counter).
  return (
    <Pic id="eq" {...play} initial={{ hi: 0.5, mid: 0.5, low: 0.5 }} poster={{ hi: 0.18, mid: 0.85, low: 0 }}
      script={async (a) => {
        // One cascade, well staggered so each knob is seen to turn; Low
        // travels furthest, so it turns longest.
        const GAP = 380;
        await Promise.all([
          tween(a, 'hi', 0.5, 0.18, 1050, inOut),
          a.wait(GAP).then(() => tween(a, 'mid', 0.5, 0.85, 1050, inOut)),
          a.wait(GAP * 2).then(() => tween(a, 'low', 0.5, 0, 1250, inOut)),
        ]);
      }}>
      {(s) => (
        <div className="p-eq">
          <Knob label="High" pos={s.hi} />
          <Knob label="Mid" pos={s.mid} />
          <Knob label="Low" pos={s.low} killed={s.low <= 0.001} />
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
export function Stems(play) {
  return (
    <Pic id="stems" {...play} bleed="right" initial={{ muted: [] }} poster={{ muted: STEM_STEPS.at(-1) }}
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
                {Array.from({ length: 40 }, (_, i) => <b key={i} style={{ '--h': STEM_SHAPES[k](i), '--i': i }} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Library: search, the list running off the bottom ---------------- */

const ROWS = [
  { title: 'Afterglow', artist: 'Deepfield', bpm: 129, key: 'Bm' },
  { title: 'Glass Rooms', artist: 'Kite Theory', bpm: 128, key: 'B♭m' },
  { title: 'Night Shift', artist: 'Mara Lune', bpm: 118, key: 'C' },
  { title: 'Halcyon', artist: 'Juno Hale', bpm: 126, key: 'G♯m' },
  { title: 'Glasshouse', artist: 'Sable & Ash', bpm: 124, key: 'Am' },
  { title: 'Signal Fire', artist: 'Low Orbit', bpm: 125, key: 'Gm' },
];
// Library: one small library view that shows all three things at once:
// tracks from Rekordbox and Serato, each tagged with its format, and a
// search that narrows them, letter by letter, to the two that match.
const LIB = [
  { t: 'Night Shift', fmt: 'MP3', src: 'Serato' },
  { t: 'Glass Rooms', fmt: 'FLAC', src: 'Rekordbox' },
  { t: 'Glasshouse', fmt: 'WAV', src: 'Serato' },
];
export function Search(play) {
  return (
    <Pic id="search" {...play} initial={{ rows: LIB.length, q: '', src: 'All', sel: -1, loaded: false }} poster={{ rows: LIB.length, q: 'glass', src: 'All', sel: 1, loaded: true }}
      script={async (a) => {
        // First, where the music came from: just what came from Serato,
        // then everything again.
        await a.wait(500);
        await a.set({ src: 'Serato' });
        await a.wait(1500);
        await a.set({ src: 'All' });
        await a.wait(900);
        for (let i = 1; i <= 5; i++) {
          await a.set({ q: 'glass'.slice(0, i) });
          await a.wait(220);
        }
        // Then the first match is picked and loaded to Deck A.
        await a.wait(800);
        await a.set({ sel: 1 });
        await a.wait(800);
        await a.set({ loaded: true });
      }}>
      {(s) => {
        const hit = (r) => r.t.toLowerCase().includes(s.q) && (s.src === 'All' || r.src === s.src);
        const shown = LIB.slice(0, s.rows).filter(hit).length;
        return (
          <div className="p-lib">
            <div className="p-lib__field">
              <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
              <span>{s.q || <em>Search</em>}{s.q && <i className="p-caret" />}</span>
              <b>{shown} {shown === 1 ? 'track' : 'tracks'}</b>
            </div>
            <div className="p-lib__tabs">{['All', 'Rekordbox', 'Serato'].map((t) => <span key={t} data-on={s.src === t || undefined}>{t === 'All' ? 'All tracks' : t}</span>)}</div>
            <div className="p-lib__list">
              {LIB.map((r, i) => (
                <div key={r.t} className="p-lib__row" data-in={i < s.rows || undefined} data-out={(i < s.rows && !hit(r)) || undefined}
                  data-sel={(s.sel === i) || undefined} data-loaded={(s.sel === i && s.loaded) || undefined}>
                  <span className="t">{r.t}<b className="p-lib__deck">A</b></span>
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
      script={async (a) => {
        await a.set({ plug: true });
        // It wakes as the plug seats; the toast follows close behind.
        await a.wait(380);
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
const WAVE = Array.from({ length: 44 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)));
export function Extras(play) {
  return (
    <Pic id="extras" {...play} initial={{ rec: false, sec: 0, bars: 0, pad: -1, key: 'W', focus: 0 }} poster={{ rec: true, sec: 9, bars: WAVE.length, pad: 5, key: 'Space', focus: 0 }}
      script={async (a) => {
        await a.set({ rec: true });
        let sec = 0;
        let bars = 0;
        const clock = setInterval(() => a.put({ sec: Math.min(59, ++sec) }), 1000);
        const grow = setInterval(() => a.put({ bars: Math.min(WAVE.length, ++bars) }), 70);
        await a.wait(document.documentElement.dataset.reclayout === 'carousel' ? 1500 : 600);
        await a.set({ focus: 1 });
        await a.wait(document.documentElement.dataset.reclayout === 'carousel' ? 450 : 0);
        for (const pad of [0, 5, 2, 5, 7]) {
          await a.set({ pad });
          await a.wait(190);
        }
        await a.wait(500);
        await a.set({ focus: 2, pad: -1 });
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
            <div className="p-pads p-pads--lg">{Array.from({ length: PADS }, (_, i) => <i key={i} data-on={s.pad === i || undefined} />)}</div>
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

export function Download(play) {
  return (
    <Pic id="dmg" {...play} initial={{ go: false, done: false }} poster={{ go: false, done: true }}
      script={async (a) => {
        await a.set({ go: true });
        await a.wait(720);
        await a.set({ go: false, done: true });
      }}>
      {(s) => (
        <div className="p-dmg">
          <div className="p-dmg__bar"><i /><i /><i /><span>Interlude</span></div>
          <div className="p-dmg__body">
            <div className="p-dmg__item">
              <img src={ICON} alt="" width="58" height="58" data-go={s.go || undefined} data-gone={s.done || undefined} />
              <span>Interlude</span>
            </div>
            <svg className="p-dmg__arrow" viewBox="0 0 60 12" aria-hidden><path d="M2 6h52m-6-5 6 5-6 5" /></svg>
            <div className="p-dmg__item" data-done={s.done || undefined}>
              <img src={APPS} alt="" width="64" height="64" className="p-folder" />
              <span>Applications</span>
            </div>
          </div>
        </div>
      )}
    </Pic>
  );
}

export function Open(play) {
  const WORD = 'Interlude';
  return (
    <Pic id="open" {...play} initial={{ n: 0, hit: false, go: false }} poster={{ n: 6, hit: true, go: false }}
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
    <Pic id="add" {...play} bleed="bottom" initial={{ drop: false, rows: 0, known: 0 }} poster={{ drop: true, rows: ADDED.length, known: ADDED.length }}
      script={async (a) => {
        await a.set({ drop: true });
        // Tracks start arriving as the folder lands, and are worked out while
        // they're still arriving.
        await a.wait(560);
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
          <div className="p-add" data-drop={s.drop || undefined} data-ready={ready || undefined}>
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
// that isn't ready yet holds the queue; cards that are off screen are
// passed over, so a row scrolled past doesn't hold up the next. A card
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
  const ready = seen && pic.top >= -pic.height * 0.25 && shownBelow >= below * 0.3;
  return { seen, ready };
}

function step(grid) {
  const ordered = [...grid.entries].sort((x, y) => (x.card.compareDocumentPosition(y.card) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const e of ordered) {
    const { seen } = measure(e);
    if (!seen && e.state !== 'idle') e.reset();
  }
  if (grid.playing) return;
  for (const e of ordered) {
    if (e.state === 'done') continue;
    const { seen, ready } = measure(e);
    if (!seen) continue;
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
    const again = () => {
      // Not had its turn yet: a real hover plays it now, out of the queue.
      if (entry.state === 'idle') {
        if (!grid.playing) grid.playing = entry;
        entry.play();
        return;
      }
      if (entry.state !== 'done' || replaying) return;
      replaying = true;
      setRun({ key: ++n, gate: Promise.resolve() });
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
      {run.gate ? <Graphic key={run.key} gate={run.gate} onDone={() => box.current?.__entry?.finished()} /> : <div className="p-slot__hold" />}
    </div>
  );
}
