import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, marks } from './find.js';

const E = [
  { id: 'a', page: 'Keyboard', label: 'Hot cue 1', group: 'Left deck', key: '1' },
  { id: 'b', page: 'Keyboard', label: 'Clear hot cue 1', group: 'Left deck', key: '⇧1' },
  { id: 'c', page: 'Decks', label: 'Hot cues start a paused deck' },
  { id: 'd', page: 'Audio', label: 'Output', words: 'sound card speakers headphones' },
  { id: 'e', page: 'Keyboard', label: 'Sync', group: 'Right deck', key: 'I' },
];
const ids = (q) => search(E, q).map((e) => e.id).join('');

test('a label that starts with the search comes first', () => assert.equal(ids('hot'), 'acb'));
test('every word must match, in any field', () => assert.equal(ids('right sync'), 'e'));
test('other words find a setting', () => assert.equal(ids('speakers'), 'd'));
test('a shortcut finds its command', () => assert.equal(search(E, '⇧1')[0].id, 'b'));
test('nothing matches nothing', () => assert.equal(ids('zzz') + ids('  '), ''));
test('special characters are plain text', () => assert.equal(ids('(.*'), ''));
test('marks keep the text whole', () => {
  const m = marks('Clear hot cue 1', 'CUE hot');
  assert.equal(m.map((x) => x.s).join(''), 'Clear hot cue 1');
  assert.deepEqual(m.filter((x) => x.hit).map((x) => x.s), ['hot', 'cue']);
});
