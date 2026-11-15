import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');

// The design prototypes (/prototypes/liquid is the reference for the
// chosen direction, /prototypes/bold the earlier concepts) are only served
// by `npm run dev`; release builds leave them out.
if (import.meta.env.DEV && location.pathname.startsWith('/prototypes/liquid')) {
  import('./prototypes/liquid/Liquid.svelte').then((m) => mount(m.default, { target }));
} else if (import.meta.env.DEV && location.pathname.startsWith('/prototypes/bold')) {
  import('./prototypes/bold/Bold.svelte').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
