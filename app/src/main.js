import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');

// Temporary: /prototypes/material shows the deck-material variants side by side.
// Delete this branch with src/prototypes once a variant is picked.
if (location.pathname.startsWith('/prototypes/material')) {
  import('./prototypes/material/Material.svelte').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
