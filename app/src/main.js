import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });

// The UI audit's flags (src/flags): flags apply in every build (all off
// unless turned on); their DialKit controls and Show me are for dev builds only.
import('./flags/registry.svelte.js');
if (import.meta.env.DEV) {
  import('./flags/FlagDials.svelte').then(({ default: FlagDials }) => mount(FlagDials, { target: document.body }));
}
