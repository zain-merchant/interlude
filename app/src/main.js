import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });

// The UI audit's flags (src/flags): flags apply in every build (all off
// unless turned on); their panel and Show me are for dev builds only.
import('./flags/registry.svelte.js');
if (import.meta.env.DEV) {
  import('./flags/panel/FlagPanel.svelte').then(({ default: FlagPanel }) => mount(FlagPanel, { target: document.body }));
  import('./flags/114-wave-looks/panel.svelte.js'); // #114 (UI audit flag): the waveform looks' switcher
}
