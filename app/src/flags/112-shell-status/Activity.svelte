<script>
  // The stems model coming down, by the track count. It goes before
  // "analyzing" (style.css hides that meanwhile): one thing at a time.
  import { onMount } from 'svelte';
  import { tip } from '../../lib/tooltip.svelte.js';
  import { conn, watchConnections } from './connections.svelte.js';
  /** @type {{ bar?: boolean }} `bar`: in the title bar, where it says "analyzing" too */
  let { bar = false } = $props();
  onMount(watchConnections);
  const mb = (n) => Math.round(n / 1024 / 1024);
</script>

{#if conn.stems}
  <span class="count num shell-act" use:tip={() => 'The stems model, once. Tracks split when it’s in'}>
    <span class="w">Downloading stems,</span> {mb(conn.stems.done)} of {mb(conn.stems.total)} MB
    <i aria-hidden="true"><u style:transform="scaleX({conn.stems.total ? conn.stems.done / conn.stems.total : 0})"></u></i>
  </span>
{:else if bar && conn.pending}
  <span class="num shell-act" use:tip={() => 'Finding each track’s length, BPM and key in the background'}>Analyzing, {conn.pending.toLocaleString()} to go</span>
{/if}
