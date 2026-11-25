// What Settings' search looks through, and how it matches.

/**
 * @typedef {{ id: string, page: string, label: string, group?: string, key?: string, words?: string, at?: string, find?: string }} Entry
 *   label  what's shown       group  which deck or list it's in
 *   key    its shortcut       words  other words for it
 *   at     the row's command  find   the words to go to on its page
 */

/** Splits into the lower-case words of a search. @param {string} q */
export const wordsOf = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Every word must be somewhere in an entry. Best first: the label starts
 * with the search, then a word of the label does, then the label holds it,
 * then the rest; as listed within each.
 * @param {Entry[]} entries @param {string} query
 */
export function search(entries, query) {
  const ws = wordsOf(query);
  if (!ws.length) return [];
  const q = ws.join(' ');
  return entries
    .map((e, i) => {
      const label = e.label.toLowerCase();
      const all = `${label} ${e.group ?? ''} ${e.page} ${e.key ?? ''} ${e.words ?? ''}`.toLowerCase();
      if (!ws.every((w) => all.includes(w))) return null;
      const rank = label.startsWith(q) ? 0 : (e.key ?? '').toLowerCase() === q ? 1 : ws.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, '\\$&')}`).test(label)) ? 2 : ws.every((w) => label.includes(w)) ? 3 : 4;
      return { e, rank, i };
    })
    .filter((x) => x !== null)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.e);
}

/** A label in pieces, the matched ones marked. @param {string} text @param {string} query */
export function marks(text, query) {
  const ws = wordsOf(query).sort((a, b) => b.length - a.length);
  if (!ws.length) return [{ s: text, hit: false }];
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  const out = [];
  for (const s of text.split(re).filter(Boolean)) {
    const hit = ws.includes(s.toLowerCase());
    const last = out.at(-1);
    // Words that follow on are one mark, the space between them too.
    if (hit && last?.hit) last.s += s;
    else if (hit && out.length > 1 && !last.s.trim() && out.at(-2).hit) {
      out.pop();
      out.at(-1).s += last.s + s;
    } else out.push({ s, hit });
  }
  return out;
}
