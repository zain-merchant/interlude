// What the stems model download says, in words. Plain functions, so they
// can be tested without the app.

/**
 * The model download as the engine reports it: missing, downloading, waiting
 * (for a connection), ready or failed, with `done` of `total` bytes in.
 * @typedef {{ state: 'missing' | 'downloading' | 'waiting' | 'ready' | 'failed', done: number, total: number,
 *             secondsLeft: number | null, error: string | null }} StemsModel
 */

/** Bytes in megabytes, as Finder counts them. */
export const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;

/** Whole percent that's in. It says 100 only once everything is. @param {StemsModel} m */
export const percent = (m) => (m.total ? Math.min(100, Math.floor((m.done / m.total) * 100)) : 0);

/** "70 of 166 MB" @param {StemsModel} m */
export const amount = (m) => `${Math.round(m.done / 1e6)} of ${mb(m.total)}`;

/** How long is left, or '' while that's anyone's guess. @param {StemsModel} m */
export function timeLeft(m) {
  if (m.state !== 'downloading' || m.secondsLeft == null) return '';
  if (m.secondsLeft >= 3600) return 'over an hour left';
  return `${Math.max(1, Math.round(m.secondsLeft / 60))} min left`;
}

/** How a download is going, all of it: "42%, 70 of 166 MB, 1 min left". @param {StemsModel} m */
export function progressText(m) {
  return [`${percent(m)}%`, amount(m), timeLeft(m)].filter(Boolean).join(', ');
}

/**
 * What the deck's Stems tab shows until the model is in: what's happening,
 * the detail, and the button that moves it along (or '' to open Settings).
 * @param {StemsModel} m
 * @returns {{ title: string, detail: string, action: string }}
 */
export function stemsStatus(m) {
  switch (m.state) {
    case 'downloading':
      if (m.done >= m.total) return { title: 'Checking the download', detail: '', action: '' };
      return { title: `Downloading, ${percent(m)}%`, detail: [amount(m), timeLeft(m)].filter(Boolean).join(', '), action: '' };
    case 'waiting':
      return { title: 'Waiting for a connection', detail: `${percent(m)}%, ${amount(m)}`, action: 'Try now' };
    case 'failed':
      return { title: m.error ?? "Stems didn't download", detail: '', action: 'Retry' };
    case 'ready':
      return { title: 'Getting stems ready', detail: '', action: '' };
    default:
      return m.done
        ? { title: 'Download stopped', detail: amount(m), action: 'Continue' }
        : { title: 'Stems need a download', detail: mb(m.total), action: 'Download' };
  }
}

/** Why a stem key or pad did nothing yet, in a sentence. @param {StemsModel} m */
export function notYet(m) {
  switch (m.state) {
    case 'downloading':
      return `Stems are still downloading: ${progressText(m)}. They work as soon as it's done.`;
    case 'waiting':
      return `Stems are waiting for a connection, with ${amount(m)} in.`;
    case 'failed':
      return `Stems didn't download. ${m.error ?? ''} Retry in Settings › Stems.`.replace('  ', ' ');
    case 'ready':
      return 'Stems are almost ready';
    default:
      return 'Stems need a one-time download. Get it in Settings › Stems.';
  }
}

/**
 * What to say aloud when the download goes from `was` to `m`, or ''. Only
 * turns of events and, with `milestones`, each quarter: never a stream.
 * @param {StemsModel} was
 * @param {StemsModel} m
 */
export function spoken(was, m, milestones = false) {
  if (was.state !== m.state) {
    switch (m.state) {
      case 'ready':
        return 'Stems have downloaded and are ready to use';
      case 'waiting':
        return 'The stems download is waiting for a connection';
      case 'failed':
        return `Stems didn't download. ${m.error ?? ''}`.trim();
      case 'downloading':
        // It started by itself, or whoever pressed the button hears so.
        return '';
      default:
        return was.state === 'downloading' || was.state === 'waiting' ? 'Stems download stopped' : '';
    }
  }
  const quarter = Math.floor(percent(m) / 25);
  if (milestones && m.state === 'downloading' && quarter < 4 && quarter > Math.floor(percent(was) / 25)) {
    return `Stems, ${quarter * 25}% downloaded`;
  }
  return '';
}
