// A polite live region for screen readers. It speaks discrete events
// (track loaded, synced), never streams like the clock or meters.

export const live = $state({ text: '' });

let timer;
export function announce(text) {
  // Clear first so repeating the same message is spoken again.
  live.text = '';
  clearTimeout(timer);
  timer = setTimeout(() => (live.text = text), 50);
}
