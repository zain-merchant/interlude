import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');

// Temporary: /prototypes/bold keeps the round-2 concepts and
// /prototypes/liquid the round-3 ones. Delete these branches with
// src/prototypes once a direction is picked.
if (location.pathname.startsWith('/prototypes/liquid')) {
  import('./prototypes/liquid/Liquid.svelte').then((m) => mount(m.default, { target }));
} else if (location.pathname.startsWith('/prototypes/bold')) {
  import('./prototypes/bold/Bold.svelte').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
