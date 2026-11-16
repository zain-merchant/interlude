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

export const PW = 360;
export const PH = 196;
const TOKENS = { '--ss-font': "'Geist', 'Geist Variable', 'Helvetica Neue', Arial, sans-serif" };
const ICON = new URL('../../site/img/icon.svg', import.meta.url).href;

/** The frame every picture shares. */
function Pic({ id, initial, poster, script, delay = 0, bleed, children }) {
  return (
    <Stage width={PW} height={PH} theme="dark" unframed play="once" tokens={TOKENS} className={`p p-${id}`}
      initial={initial} poster={poster}
      script={async (a) => {
        await a.wait(250 + delay);
        await script(a);
      }}>
      {(s) => <div className="p-body" data-bleed={bleed}>{children(s)}</div>}
    </Stage>
  );
}

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

export function Sync({ delay }) {
  return (
    <Pic id="sync" delay={delay} bleed="right" initial={{ on: false, press: false, lock: false }} poster={{ on: true, press: false, lock: true }}
      script={async (a) => {
        await a.set({ press: true });
        await a.wait(110);
        await a.set({ press: false, on: true });
        await a.wait(1050);
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
            <b className="p-bpm"><Count value={s.on ? 129 : B_FROM} format={(n) => n.toFixed(2)} duration={900} /></b>
            <Ticks deck="b" offset={s.on ? 0 : TICK * 0.6} stretch={s.on ? 1 : 129 / B_FROM} />
          </div>
          <div className="p-locks" aria-hidden>
            {[0, 4, 8].map((i) => <i key={i} style={{ left: i * TICK }} />)}
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
      <span className="p-knob__label">{label}{killed ? ' · kill' : ''}</span>
    </div>
  );
}

export function Eq({ delay }) {
  return (
    <Pic id="eq" delay={delay} initial={{ low: 0.5 }} poster={{ low: 0 }}
      script={async (a) => {
        await tween(a, 'low', 0.5, 0, 950, (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2));
      }}>
      {(s) => (
        <div className="p-eq">
          <Knob label="High" pos={0.5} />
          <Knob label="Mid" pos={0.58} />
          <Knob label="Low" pos={s.low} killed={s.low <= 0.001} />
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Stems: the lanes run off the right edge ---------------- */

const STEMS = ['Vocals', 'Melody', 'Bass', 'Drums'];
const STEM_SHAPES = [
  (i) => (i % 10 < 6 ? 0.3 + 0.55 * Math.abs(Math.sin(i * 0.8)) : 0.06),
  (i) => 0.3 + 0.4 * Math.abs(Math.sin(i * 0.3)) + 0.12 * Math.abs(Math.sin(i * 1.7)),
  (i) => (i % 2 === 0 ? 0.72 : 0.38),
  (i) => (i % 4 === 0 ? 0.95 : i % 2 === 0 ? 0.42 : 0.2),
];
export function Stems({ delay }) {
  return (
    <Pic id="stems" delay={delay} bleed="right" initial={{ muted: false }} poster={{ muted: true }}
      script={async (a) => {
        await a.wait(500);
        await a.set({ muted: true });
      }}>
      {(s) => (
        <div className="p-stems">
          {STEMS.map((name, k) => {
            const muted = k === 0 && s.muted;
            return (
              <div key={name} className="p-stem" data-muted={muted || undefined}>
                <span className="p-stem__btn"><i />{name}</span>
                {/* Playing: the lane scrolls by, two copies of its bars end to end. */}
                <div className="p-stem__wave">
                  <div className="p-stem__run">
                    {Array.from({ length: 80 }, (_, i) => <b key={i} style={{ '--h': STEM_SHAPES[k](i % 40), '--i': i % 40 }} />)}
                  </div>
                </div>
              </div>
            );
          })}
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
export function Search({ delay }) {
  return (
    <Pic id="search" delay={delay} bleed="bottom" initial={{ q: '', done: false }} poster={{ q: 'glass', done: true }}
      script={async (a) => {
        await a.type('q', 'glass', { interval: 85 });
        await a.wait(120);
        await a.set({ done: true });
      }}>
      {(s) => (
        <div className="p-lib">
          <div className="p-field" data-focus={s.q ? '' : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
            {s.q ? <span className="p-field__q">{s.q}<i className="p-caret" /></span> : <span className="p-field__ph">Search artist, title, folder…</span>}
            <kbd>⌘F</kbd>
          </div>
          <div className="p-rows">
            {ROWS.map((r) => {
              const hit = r.title.toLowerCase().includes('glass');
              return (
                <Collapse key={r.title} open={!s.done || hit}>
                  <div className="p-row" data-sel={(s.done && r.title === 'Glass Rooms') || undefined}>
                    <span>{r.title}</span><span>{r.artist}</span><span>{r.bpm}</span><span>{r.key}</span>
                  </div>
                </Collapse>
              );
            })}
          </div>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Controllers: plug it in, and it's ready ---------------- */

// The top of a controller, run off the bottom of the card: a lead comes
// down into its back, the pads wake in a sweep, the jog rings light, and
// the app says it's connected and mapped.
export function Controllers({ delay }) {
  return (
    <Pic id="ctl" delay={delay} bleed="bottom" initial={{ plug: false, wake: false, toast: false }} poster={{ plug: true, wake: true, toast: true }}
      script={async (a) => {
        await a.set({ plug: true });
        await a.wait(520);
        await a.set({ wake: true });
        await a.wait(380);
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
          <div className="p-toast" data-on={s.toast || undefined}><i />DDJ-FLX4 connected <span>· mapped</span></div>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Recording: the take runs off the right edge ---------------- */

const TAKE = Array.from({ length: 52 }, (_, i) => 0.22 + 0.62 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) + (i % 4 === 0 ? 0.16 : 0));
export function Record({ delay }) {
  return (
    <Pic id="rec" delay={delay} bleed="right" initial={{ on: false, sec: 0 }} poster={{ on: true, sec: 8 }}
      script={async (a) => {
        await a.set({ on: true });
        for (let sec = 1; sec <= 8; sec++) {
          await a.wait(380);
          await a.set({ sec });
        }
      }}>
      {(s) => (
        <div className="p-rec">
          <div className="p-rec__btn" data-on={s.on || undefined}>
            <i />{s.on ? `0:${String(s.sec).padStart(2, '0')}` : 'Rec'}
          </div>
          <div className="p-rec__take">
            {TAKE.map((h, i) => <b key={i} style={{ '--h': h }} data-in={i < s.sec * 5.5 || undefined} />)}
          </div>
          <div className="p-rec__file">Interlude recordings › Friday set.wav</div>
        </div>
      )}
    </Pic>
  );
}

/* ---------------- Install ---------------- */

/**
 * macOS's Applications folder: the light system blue, a tab at the back, a
 * lighter front with a bright lip, and the Applications mark (an A made of
 * a pencil, a paintbrush and a ruler) engraved into it.
 */
function AppsFolder({ size = 62 }) {
  return (
    <svg viewBox="0 0 100 80" width={size} height={size * 0.8} aria-hidden className="p-folder">
      <defs>
        <linearGradient id="pf-back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f9af0" /><stop offset="1" stopColor="#2b7fdc" /></linearGradient>
        <linearGradient id="pf-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#77c2fd" /><stop offset="1" stopColor="#4ea5f3" /></linearGradient>
        <linearGradient id="pf-mark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f7fd4" /><stop offset="1" stopColor="#3b8fe2" /></linearGradient>
      </defs>
      {/* The back, with its tab on the left. */}
      <path d="M6 12a5 5 0 0 1 5-5h22.5a5 5 0 0 1 3.7 1.6l3.4 3.8a5 5 0 0 0 3.7 1.6H89a5 5 0 0 1 5 5V68H6Z" fill="url(#pf-back)" />
      {/* The front, a touch lower, its top edge catching the light. */}
      <rect x="6" y="21" width="88" height="53" rx="5" fill="url(#pf-front)" />
      <path d="M11 21h78a5 5 0 0 1 5 5v.6a5 5 0 0 0-5-4.6H11a5 5 0 0 0-5 4.6V26a5 5 0 0 1 5-5Z" fill="#b9e0ff" />
      {/* The mark, engraved: a darker blue with a light edge below it. */}
      <g transform="translate(50 48)">
        <g fill="#a9d7ff" transform="translate(0 0.8)">
          <path d="M-3.2-16.5-15 13h5.2L1.6-15.2Z" /><path d="M3.2-16.5 15 13H9.8L-1.6-15.2Z" /><rect x="-11" y="2.5" width="22" height="4" rx="1" />
        </g>
        <g fill="url(#pf-mark)">
          {/* pencil: the left leg, pointed at the foot */}
          <path d="M-3.2-16.5-14.4 11.6l-.6 2.4 2-1.4L1.6-15.2Z" />
          {/* paintbrush: the right leg, its bristles at the foot */}
          <path d="M3.2-16.5 13.2 9.4c.8 2.1 1.3 3.6.9 4.1-.6.4-2.1-.5-3.6-2.3L-1.6-15.2Z" />
          {/* ruler: the crossbar, with its marks */}
          <rect x="-11" y="2.5" width="22" height="4" rx="1" />
        </g>
        <g stroke="#77c2fd" strokeWidth="0.8">
          <path d="M-7 2.5v1.6M-3 2.5v1.6M1 2.5v1.6M5 2.5v1.6" />
        </g>
      </g>
    </svg>
  );
}

export function Download({ delay }) {
  return (
    <Pic id="dmg" delay={delay} initial={{ go: false, done: false }} poster={{ go: false, done: true }}
      script={async (a) => {
        await a.set({ go: true });
        await a.wait(900);
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
              <AppsFolder />
              <span>Applications</span>
            </div>
          </div>
        </div>
      )}
    </Pic>
  );
}

export function Open({ delay }) {
  const WORD = 'Interlude';
  return (
    <Pic id="open" delay={delay} initial={{ n: 0, hit: false, go: false }} poster={{ n: 6, hit: true, go: false }}
      script={async (a) => {
        for (let n = 1; n <= 6; n++) {
          await a.set({ n, hit: n >= 3 });
          await a.wait(80);
        }
        await a.wait(300);
        await a.set({ go: true });
        await a.wait(160);
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

/* ---------------- Add music: the library filling, running off the bottom ---------------- */

const ADDED = [
  { title: 'Afterglow', artist: 'Deepfield', bpm: 129, key: 'Bm' },
  { title: 'Night Shift', artist: 'Mara Lune', bpm: 118, key: 'C' },
  { title: 'Paper Planes', artist: 'Nova Reyes', bpm: 118, key: 'C' },
  { title: 'Concrete Garden', artist: 'Mara Lune', bpm: 119, key: 'C♯m' },
  { title: 'Slow Burn', artist: 'Nova Reyes', bpm: 123, key: 'Fm' },
  { title: 'Signal Fire', artist: 'Low Orbit', bpm: 125, key: 'Gm' },
];
export function AddMusic({ delay }) {
  return (
    <Pic id="add" delay={delay} bleed="bottom" initial={{ rows: 0, known: 0 }} poster={{ rows: ADDED.length, known: ADDED.length }}
      script={async (a) => {
        for (let rows = 1; rows <= ADDED.length; rows++) {
          await a.set({ rows });
          await a.wait(70);
        }
        await a.wait(250);
        for (let known = 1; known <= ADDED.length; known++) {
          await a.set({ known });
          await a.wait(170);
        }
      }}>
      {(s) => (
        <div className="p-add">
          <div className="p-add__head">
            <span>Title</span><span>BPM</span><span>Key</span>
            <em>{s.known < s.rows ? `analyzing, ${s.rows - s.known} to go` : `${48} tracks`}</em>
          </div>
          {ADDED.map((t, i) => (
            <div key={t.title} className="p-add__row" data-in={i < s.rows || undefined}>
              <span className="t"><b>{t.title}</b>{t.artist}</span>
              <span className="v" data-known={i < s.known || undefined}>{i < s.known ? t.bpm : '—'}</span>
              <span className="v" data-known={i < s.known || undefined}>{i < s.known ? t.key : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Pic>
  );
}

export const FEATURES = { decks: Sync, mixer: Eq, stems: Stems, library: Search, controllers: Controllers, recording: Record };
export const INSTALL = { download: Download, open: Open, music: AddMusic };

/* ---------------- Playing them ---------------- */

// Pictures that come into view together start 60ms apart, in reading order
// (Emil: 30 to 80ms; decorative, never blocking).
let batch = [];
let flushing = 0;
function enqueue(fn) {
  batch.push(fn);
  if (!flushing) flushing = setTimeout(() => {
    batch.forEach((f, i) => f(i * 60));
    batch = [];
    flushing = 0;
  }, 16);
}

/**
 * One picture in its card. It plays when the card comes into view, and
 * again each time it's scrolled back to (it resets once it's fully out of
 * view), and when the card is hovered or clicked, once it has finished.
 */
export function Replay({ Graphic, card }) {
  const box = useRef(null);
  const [run, setRun] = useState(null);
  useEffect(() => {
    let n = 0;
    let started = 0;
    const play = (delay = 0) => {
      started = performance.now();
      setRun({ key: ++n, delay });
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.3) enqueue(play);
        else if (!e.isIntersecting) setRun(null);
      }
    }, { threshold: [0, 0.3] });
    io.observe(box.current);
    const again = () => {
      if (performance.now() - started > 1800) play();
    };
    const host = card ?? box.current;
    host.addEventListener('pointerenter', again);
    host.addEventListener('click', again);
    return () => {
      io.disconnect();
      host.removeEventListener('pointerenter', again);
      host.removeEventListener('click', again);
    };
  }, [card]);
  return (
    <div ref={box} className="p-slot">
      {run ? <Graphic key={run.key} delay={run.delay} /> : <div className="p-slot__hold" />}
    </div>
  );
}
