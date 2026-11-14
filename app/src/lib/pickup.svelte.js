// Where a hardware controller's tempo fader sits while it doesn't set the
// deck's tempo: after SYNC, or after the tempo was changed on screen, the
// fader only takes over once it's moved to the deck's tempo. The deck's
// on-screen pitch fader marks the spot so it's clear why moving it does
// nothing yet. Per deck: the rate the hardware fader is at, or null.

/** @type {(number | null)[]} */
export const tempoPickup = $state([null, null]);
