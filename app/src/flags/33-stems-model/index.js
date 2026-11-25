// #33: Settings > Stems says plainly that the separation model is installed,
// and its size (a hook in Settings.svelte). What stands in for the stems
// until then, on a deck and here, is the app's own.
export default {
  id: 'stems-model',
  n: 33,
  title: 'Settings says when the stems model is installed',
  group: 'Controls',
  notes: 'Settings > Stems: "Installed, 166 MB" once the separation model is in.',
};

/** Show me: Settings > Stems, the model's section ringed. */
export const show = {
  about: 'Settings > Stems says in a line that the separation model is installed, and how big it is.',
  before: 'The size is at the end of a paragraph.',
  after: 'Once the model is in, the page says "Installed", with its size, first.',
  async setup(app) {
    await app.openSettings('Stems');
    await app.until(() => app.$$('.settings .display h3').find((h) => /Separation model/.test(h.textContent)), 3000, 'the model');
  },
  target: (app) => [app.$$('.settings .display').find((s) => /Separation model/.test(s.textContent))],
};
