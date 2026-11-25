// #122 (UI audit flag; on 110): a tooltip is what first.
//
// The name, its value cut in, its key raised; then, after an etched rule, what
// else you can do, what it does on the left and how on the right. One thing
// more goes on the name's line when that fits; more are rows. It says at once
// only what the control doesn't (read.js has the rule); resting 1.5 s says the
// rest. A dial or fader being moved shows its value and nothing else, which
// agrees with #109: where the value is already on screen it shows nothing.
export default {
  id: 'tooltips',
  n: 122,
  title: 'Tooltips say what first, then how',
  group: 'Shell',
  settings: {
    lines: {
      type: 'choice',
      label: 'One thing more to do',
      default: 'one',
      recommended: 'one',
      options: [
        ['one', 'On the name’s line', 'After a standing rule, when the whole tooltip is 360 wide or less.'],
        ['rows', 'Always a row', 'Under a rule, as when there’s more than one.'],
      ],
    },
    sides: {
      type: 'choice',
      label: 'Where words start, beside a key 4 from its edge',
      default: 'eight',
      recommended: 'eight',
      options: [
        ['eight', '8', 'Halfway between the key’s box (4) and its letter (about 12), which is where the eye puts that side.'],
        ['nest', '9.5', 'As far as the words are from the top and bottom.'],
        ['four', '4', 'As far as the key’s box.'],
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
  async setup(app) {
    await app.loadTrack(0, 1);
    const c = app.$("[data-region='deck0'] .tc[aria-label='Set hot cue 1']");
    if (c) await app.click(c);
    await app.wait(300);
    const { showTip, tipText } = await import('../../lib/tooltip.svelte.js');
    const { keyLabel } = await import('../../lib/commands.js');
    const at = app.$("[data-region='deck0'] .tc");
    if (at) showTip(at, tipText('Hot cue 1 at 1:14.0', keyLabel('deck.0.hotCue.0'), 'hold to preview, ⇧-click to clear'));
  },
  target: '.tip',
};
