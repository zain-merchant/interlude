import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');

// Temporary: /prototypes/bold shows the round-2 deck concepts side by side.
// Delete this branch with src/prototypes once a variant is picked.
if (location.pathname.startsWith('/prototypes/bold')) {
  import('./prototypes/bold/Bold.svelte').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
