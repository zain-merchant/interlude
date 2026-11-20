// #28 (critique E4, E5's grip; backlog e-K32): the Report dialog says what
// it sends and where it goes.
//
// The dialog said the report includes "the app's logs and your system" and
// its button said "Save report", but not where the file goes or that you
// send it yourself. Checked against save_report (src-tauri/src/log.rs) and
// reportContext (App.svelte): the file holds what you write, the app's
// version, macOS version and chip, the audio output and any controllers,
// and this and the last session's logs, and it's saved to the Desktop. The
// lead is now the instruction alone, on one line; the small print under the
// box says what the file holds and where it goes (no support address
// exists in the app, so none is named); the button says "Save to Desktop".
// The placeholder reads as one plain sentence. The text
// box loses the browser's resize grip in its rounded corner, and the close
// × lines up with the content edge. Hook: Report.svelte. (The box's focus
// ring is #14's; the main button's look is #27's.)
export default {
  id: 'report-copy',
  n: 28,
  title: 'Report says what it saves and where',
  group: 'Polish',
  notes: 'One-line instruction above the box; small print under it lists what the file holds (version, logs, macOS, audio device, controllers; no music) and that it saves to the Desktop; "Save to Desktop"; no resize grip; × on the content edge.',
};

/** Show me: the Report dialog, flipping its words and button. */
export const show = {
  about: "The Report dialog didn't say what it sends or where the file goes, and its text box had the browser's resize grip in the corner. Now it lists what's in the report, says it saves to your Desktop, and the grip is gone.",
  before: 'You are asked to "Save report" without being told where it goes or that you have to send it yourself, and "your system" could mean anything.',
  after: 'The instruction is one short line above the box, and the small print under it says exactly what goes in (the app\'s version and logs, your macOS version, audio device and controllers, no music) and that the file lands on your Desktop. The button says where.',
  async setup(app) {
    await app.openReport();
  },
  async each(app) {
    if (!app.$(".card[aria-labelledby='report-title']")) await app.openReport();
  },
  target: ".card[aria-labelledby='report-title']",
  aid(d, app, ctx) {
    const card = app.$(".card[aria-labelledby='report-title']");
    const lead = (card?.querySelector('.fine') ?? card?.querySelector('.lead'))?.getBoundingClientRect();
    const btn = card?.querySelector('.actions .btn:last-child')?.getBoundingClientRect();
    if (!lead || !btn) return;
    const before = ctx.phase === 'before';
    const tone = before ? 'bad' : 'ok';
    d.text(lead.right + 16, lead.y + 10, before ? "doesn't say what's sent" : 'says what goes in', { tone, fixed: true });
    d.text(btn.right + 16, btn.y + btn.height / 2, before ? "doesn't say where" : 'says where the file goes', { tone, fixed: true });
  },
};
