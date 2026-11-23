// The pad mode a hardware controller's deck is in, set by its pad mode
// buttons (HOT CUE, PAD FX, BEAT JUMP, SAMPLER, and KEYBOARD for stems). Each deck shows the
// controls its pads now play, so the screen follows the controller.

/** Deck tab for each pad mode; modes with no controls of their own leave the tab alone. */
const TABS = { hotCue: 'cues', beatJump: 'loop', beatLoop: 'loop', padFx1: 'fx', padFx2: 'fx', keyboard: 'stems' };

/**
 * Per deck: the latest mode and a count of presses, so pressing the same
 * button again brings its tab back after a click elsewhere.
 * @type {{ mode: string | null, presses: number }[]}
 */
export const padMode = $state([
  { mode: null, presses: 0 },
  { mode: null, presses: 0 },
]);

export function setPadMode(deck, mode) {
  padMode[deck] = { mode, presses: padMode[deck].presses + 1 };
}

/** The deck tab a pad mode shows, or null. */
export const padModeTab = (mode) => TABS[mode] ?? null;
