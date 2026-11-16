import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });

// The UI audit's flags and their toggle bar (src/flags): flags apply in
// every build (all off unless turned on); the bar is for dev builds only.
import('./flags/registry.svelte.js');
if (import.meta.env.DEV) {
  import('./flags/FlagBar.svelte').then(({ default: FlagBar }) => mount(FlagBar, { target: document.body }));
}
