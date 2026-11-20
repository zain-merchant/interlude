// #34 (critique panel S5, S14, S15; C48 copy): Settings in fewer, plainer
// words.
//
// - Every option carried 2-4 lines of about 95 characters; Decks took three
//   screens for five checkboxes. Each option now has one sentence (the
//   detail belongs in docs/guide.md), and paragraphs stop at 440px (about
//   70 characters) while control rows keep 520.
// - Labels say what they do without echoing their heading: under "Hot
//   cues", "Start a paused deck"; under "Quantize", "Snap to the beat"
//   (the Keyboard page's command is still "Quantize: snap to the beat"),
//   with its shortcut filed under a new
//   "Both decks" group on the Keyboard page instead of Mixer; help text
//   names the key the user actually has (it hard-coded "B").
// - One name for interface size: "Interface size: larger / smaller /
//   reset to 100%" on the Keyboard page, "Reset to 100%" on Display.
//   "Read out position" is "Speak the play position". (The macOS menu and
//   commands.js keep the old names: requested in build/requests.md.)
// - "rekordbox" as the brand writes it, and "license" (the app's spelling
//   is American elsewhere).
// - Audio: the select comes first with one line under it ("Automatic uses
//   your controller when it's plugged in, so headphone cue works, and this
//   computer otherwise."); Automatic names the device it picked
//   ("Automatic: DDJ-FLX4"); the Headphones section, which had no control,
//   folds into that line until cue routing exists (C48).
// - Controllers: "Mixxx MIDI and HID mappings work as they are. Add your
//   own to the app's controllers folder." (No "Show folder" button: the
//   backend has no call that opens that folder yet.) The connected row
//   says "Mapping: Pioneer DDJ-FLX4" (c-K45).
// - Every description follows its control, Slip's included (the review
//   asked for one order on the page). Sync's note is one line.
// Hooks in Settings.svelte.
export default {
  id: 'settings-copy',
  n: 34,
  title: 'Settings say it in one line',
  group: 'Polish',
  notes: 'Settings copy: one sentence per option (max-width 440px), clearer labels, Quantize under "Both decks", keys named from the keymap, one interface-size name, rekordbox / license, Audio select first with Automatic naming its device, Headphones folded into Output, shorter Mixxx note.',
};

/** Show me: Settings > Decks, flipping; a loupe on the first three options. */
export const show = {
  about: 'Every Settings option came with a paragraph of two to four long lines, so the Decks page took three screens for five checkboxes. Now each option has one plain sentence and the labels say what they do.',
  before: 'Each checkbox sits on top of a long, wide paragraph, so the page is mostly grey text: you have to read a lot to find the one switch you want.',
  after: 'One short line per option, kept to a comfortable width, and labels that say what they do ("Start a paused deck" under Hot cues), so the page is about half as long and scans at a glance.',
  async setup(app) {
    await app.openSettings('Decks');
    await app.until(() => app.$('.settings .display .opt'), 2000, 'the Decks page');
  },
  target: (app) => [app.$('.settings .scroll')],
  badge: (app) => app.$('.settings .bar')?.getBoundingClientRect(),
  aid(d, app, ctx) {
    const before = ctx.phase === 'before';
    const secs = app.$$('.settings .display');
    const last = secs.at(-1)?.getBoundingClientRect();
    const scroll = app.$('.settings .scroll')?.getBoundingClientRect();
    if (!last || !scroll) return;
    const x = scroll.x + 600;
    const el = app.$('.settings .scroll');
    const long = Math.round(el.scrollHeight);
    d.text(x, scroll.y + 40, before ? 'a paragraph under every checkbox' : 'one line per option', { tone: before ? 'bad' : 'ok' });
    d.text(x, scroll.y + 66, `the page is ${long}px long`, { tone: before ? 'bad' : 'ok' });
  },
};
