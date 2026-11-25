// Finding the app's own controls, for the script and the controller.

/** A deck's slider by its name, whichever way the app names its decks. */
export const deckSlider = (d, name) =>
  [['Deck A', 'Left deck'], ['Deck B', 'Right deck']][d].map((deck) => document.querySelector(`[role="slider"][aria-label="${deck} ${name}"]`)).find(Boolean) ?? null;
