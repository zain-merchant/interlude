// #5: sorting a number column moved its heading.
//
// The BPM and Time headings are right-aligned over their numbers. Sorting
// by one added an arrow after the word, which pushed the word 14px left;
// sorting by another column moved it back. The arrow now goes before the
// word in those columns, so the word stays over its numbers.
export default {
  id: 'no-shift-sort',
  n: 5,
  title: 'Sorting keeps the BPM and Time headings in place',
  group: 'Stability',
  notes: 'In right-aligned columns the sort arrow sits to the left of the heading, so the heading no longer jumps 14px.',
};
