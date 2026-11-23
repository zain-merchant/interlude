// #122 (UI audit flag; on 110): a tooltip is what first.
//
// The name, its value cut in, its key raised; then, after an etched rule, what
// else you can do, what it does on the left and how on the right. One thing
// more goes on the name's line when that fits; more are rows.
export default {
  id: 'tooltips',
  n: 122,
  title: 'Tooltips say what first, then how',
  group: 'Shell',
  byDefault: true, // agreed, on for judging with 110; does nothing without it
  settings: {
    lines: {
      type: 'choice',
      label: 'One thing more to do',
      default: 'one',
      recommended: 'one',
      options: [
        ['one', 'On the name’s line', 'After a standing rule, when the whole tooltip is 320 wide or less.'],
        ['rows', 'Always a row', 'Under a rule, as when there’s more than one.'],
      ],
    },
  },
  notes:
    'read.js turns a tooltip’s sentence into its parts (read.test.js has every sentence in the app); Tip.svelte draws them; style.css. Hooks: Tooltip.svelte, and lib/tooltip.svelte.js (where the control ends, so a tall tip can open below). When this lands, each control should give its parts itself.',
};

/** Show me: a hot cue's. */
export const show = {
  about: 'A tooltip reads as a name with what you can do under it, as in a menu, in place of a sentence.',
  before: 'What it is, its value, its key and what else you can do run on in one sentence.',
  after: 'What is on the left, how is on the right, with a rule between the control and the rest.',
  target: '.tip',
};
