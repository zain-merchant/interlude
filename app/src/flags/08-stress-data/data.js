// #8 (UI audit flag): the worst-case library for the simulated engine.
// Every value is something a real DJ library holds: titles copied from
// stores and promos, artists with features, other scripts, file names as
// titles, analysis that failed or guessed wrong. Used by lib/mock.js only
// while the stress-data flag is on.

const LONG_FOLDER = '/Volumes/SANDISK EXTREME PRO 2TB/DJ/Promos/2025/Beatport downloads – promos to sort through before Saturday';

/** The first rows, one failure each, so they're all on screen at once. */
const WORST = [
  { title: "Strings of Life (Derrick May's Original Unreleased 1987 Detroit Mix) [2023 Remaster]", artist: 'Rhythim Is Rhythim feat. Derrick May, Kevin Saunderson & Juan Atkins', a: { duration: 437, bpm: 124.62, key: { tonic: 9, minor: true } } },
  { title: 'U', artist: 'Jo', a: { duration: 182, bpm: 128, key: { tonic: 0, minor: false } } },
  { title: 'IMG_20250914_untitled_bounce_master_v12_FINAL_final2', artist: '', a: { duration: 3, bpm: 0, key: null, failed: false } },
  { title: 'Live at Printworks London — Closing Party (Full Set, Unedited)', artist: 'Peggy Gou b2b Honey Dijon b2b Fred again..', a: { duration: 8073, bpm: 126.4, key: { tonic: 2, minor: true } } },
  { title: 'يا ليل يا عين (Extended Club Mix)', artist: 'عمرو دياب', a: { duration: 398, bpm: 122, key: { tonic: 4, minor: true } } },
  { title: '夜に駆ける', artist: 'YOASOBI', a: { duration: 261, bpm: 130, key: { tonic: 5, minor: false } } },
  { title: '🔥🔥 Dancefloor Weapon 🔥🔥 (DJ Tool)', artist: '👩🏽‍💻 DJ Priya', a: { duration: 301, bpm: 999, key: { tonic: 7, minor: true } } },
  { title: 'Xuân Này Con Không Về (Đặng Thị Ngọc Hân Remix)', artist: 'Đặng Thị Ngọc Hân', a: { duration: 344, bpm: 45, key: { tonic: 1, minor: false } } },
  { title: 'Benachrichtigungseinstellungsänderungsbestätigung', artist: 'Konstantin Oberhauser-Wettstein', a: null, failed: true },
  { title: '<b>Bold</b> &amp; Co **remix**', artist: 'Seán O\'Brien-Ó Súilleabháin', a: { duration: null, bpm: null, key: null, failed: true } },
  { title: 'Track 01', artist: '', a: { duration: 245, bpm: 174, key: null } },
  { title: 'Ægishjálmur', artist: 'Ólafur Arnalds & Nils Frahm', a: { duration: 612, bpm: 87.5, key: { tonic: 11, minor: true } } },
  { title: 'Missing From The Old USB Stick (Original Mix)', artist: 'Christopher Alexander Montgomery III', a: { duration: 420, bpm: 123, key: { tonic: 3, minor: true } }, missing: true },
  { title: "Can't Get You Out Of My Head (Kylie Minogue vs. New Order 'Blue Monday' Bootleg Mashup) [Extended Club Edit] [Free Download]", artist: 'Kylie Minogue vs. New Order', a: { duration: 389, bpm: 128, key: { tonic: 9, minor: true } } },
];

const ARTISTS = ['Nova Reyes', 'Kite Theory', 'Mara Lune', 'Deepfield', 'Oskar Velt', 'Juno Hale', 'Sable & Ash', 'Low Orbit'];
const TITLES = ['Afterglow', 'Night Shift', 'Paper Planes', 'Lucid', 'Concrete Garden', 'Slow Burn', 'Signal Fire', 'Halcyon'];

/**
 * The library for a set: 'worst', 'empty', 'one' or 'huge'.
 * Tracks carry `stress`, the analysis the mock reports for them.
 */
export function stressLibrary(set) {
  const folders = set === 'empty' ? [] : set === 'one' ? ['/Music/House'] : ['/Music/House', '/Music/Techno', LONG_FOLDER, '/Users/aleksandra.wisniewska-kowalczyk/Music/Rekordbox Exports/Club Night Prep'];
  const track = (i, t, folder) => {
    const name = folder.split('/').pop();
    return {
      path: `${folder}/${t.artist || 'Unknown'} - ${t.title} (${i}).mp3`, title: t.title, artist: t.artist, album: '', genre: name, folder: name,
      format: i % 7 ? 'MP3' : 'AIFF', missing: !!t.missing,
      // Analysis is already done for a 10,000 library (it would take ten
      // minutes at the mock's pace); the worst case is still analyzing.
      analysis: set === 'huge' ? t.a : null,
      stress: t.a ?? { duration: null, bpm: null, key: null, failed: true },
    };
  };
  const filler = (i) => ({
    title: TITLES[i % TITLES.length] + (i % 3 ? ' (Extended Mix)' : ''),
    artist: ARTISTS[(i * 7) % ARTISTS.length],
    a: { duration: 240 + ((i * 37) % 300), bpm: 118 + (i % 12), key: { tonic: i % 12, minor: i % 3 !== 0 } },
  });
  let tracks;
  if (set === 'empty') tracks = [];
  else if (set === 'one') tracks = [track(0, WORST[1], folders[0])];
  else {
    const n = set === 'huge' ? 10000 : 1284;
    tracks = Array.from({ length: n }, (_, i) => track(i, i < WORST.length && set === 'worst' ? WORST[i] : filler(i), folders[i % folders.length]));
  }
  const paths = (from, n) => tracks.slice(from, from + n).map((t) => t.path);
  const playlists =
    set === 'empty' ? []
    : set === 'one' ? [{ id: 1, name: 'Friday warmup', paths: paths(0, 1) }]
    : [
        { id: 1, name: 'Saturday at Fabric, Room One – peak time (do NOT play before 2am) v3', paths: paths(0, 40) },
        { id: 2, name: 'A', paths: paths(40, 1) },
        { id: 3, name: 'Empty', paths: [] },
        ...Array.from({ length: 24 }, (_, i) => ({ id: 4 + i, name: `Gig ${2025 - Math.floor(i / 12)}-${String(12 - (i % 12)).padStart(2, '0')}`, paths: paths(i * 50, 30 + i) })),
      ];
  const DAY = 24 * 3600 * 1000;
  const sessions =
    set === 'empty' ? []
    : set === 'one' ? [{ start: Date.now() - DAY, paths: paths(0, 1) }]
    : Array.from({ length: 14 }, (_, i) => ({
        // Two sessions on one day (a set and an after-hours), then weekly.
        start: Date.now() - (i === 1 ? 6 * 3600e3 : i * 7 * DAY),
        paths: paths(i * 20, i === 0 ? 312 : 12 + i),
      }));
  return { folders, tracks, playlists, sessions };
}

/** Device names as macOS reports them. */
export const STRESS_DEVICE = 'Pioneer DJ DDJ-FLX10 4-Channel Performance Controller (USB Audio)';
/** A recording that started 59 minutes 50 seconds ago, so the clock rolls past an hour. */
export const STRESS_REC_OFFSET = 3590;
