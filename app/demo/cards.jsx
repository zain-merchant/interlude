// The pictures on the website's cards: the install steps and the features.
// Each card in site/index.html marked data-picture="<name>" gets its picture
// on top, played when it comes into view and again when it's scrolled back
// to, hovered or clicked (pictures.jsx).
import { createRoot } from 'react-dom/client';
import { FEATURES, INSTALL, Replay } from './pictures.jsx';

const ALL = { ...FEATURES, ...INSTALL };

for (const card of document.querySelectorAll('[data-picture]')) {
  const Graphic = ALL[card.dataset.picture];
  if (!Graphic) continue;
  const slot = document.createElement('div');
  slot.className = 'pic';
  slot.setAttribute('aria-hidden', 'true');
  card.prepend(slot);
  createRoot(slot).render(<Replay Graphic={Graphic} card={card} />);
}
