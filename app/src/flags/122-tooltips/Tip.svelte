<script>
  // A tooltip: what first, then how. read.js has its parts.
  import { mac } from '../../lib/commands.js';
  import { hideTip, tooltip } from '../../lib/tooltip.svelte.js';
  import { setting } from '../registry.svelte.js';
  import Keys from '../116-settings-finish/Keys.svelte';

  /** @type {{ t: any }} */
  let { t } = $props();
  const a = $derived(t.a ?? []);
  const main = $derived(!!(t.n || t.v || t.x));
  // One thing more goes on the name's line, if that all fits in 360: every dial at its longest value does, so a tooltip keeps its form as its value moves.
  const ask = $derived(setting('tooltips', 'lines') === 'one' && a.length === 1 && !t.x && !!(t.n || t.v));
  let el = $state();
  let wide = $state(false);
  let said = '';
  /** A sentence that wraps is as wide as its longest line. */
  let fit = $state('');
  let tx = $state();
  $effect.pre(() => {
    const s = JSON.stringify(t);
    if (s !== said) {
      wide = false;
      fit = '';
    }
    said = s;
  });
  $effect(() => {
    if (ask && !wide && el && JSON.stringify(t) && el.scrollWidth > 360) wide = true;
  });
  $effect(() => {
    if (!tx || fit || !t.x) return;
    const r = document.createRange();
    r.selectNodeContents(tx);
    const lines = [...r.getClientRects()].filter((c) => c.width);
    if (new Set(lines.map((c) => Math.round(c.top))).size < 2) return;
    // Rects and layout widths differ when the interface is scaled.
    const k = tx.offsetWidth / tx.getBoundingClientRect().width;
    fit = Math.ceil((Math.max(...lines.map((c) => c.right)) - Math.min(...lines.map((c) => c.left))) * k) + 21 + 'px';
  });
  const one = $derived(ask && !wide);
  const word = (p) => /click|drag|hold/.test(p);
  const key = (p) => (mac ? p : (p.replace(/\+$/, '').replace(/^⇧$/, 'Shift').replace(/^⌥$/, 'Alt')));
  // A path breaks after a slash.
  const bits = (s) => s.split(/(?<=[/\\])/);
</script>

<svelte:window onkeydowncapture={(e) => e.key === 'Escape' && tooltip.visible && hideTip()} />

{#snippet how(h)}<span class="th">{#each h.split(' + ') as p, i}{#if i}<span class="tw pl">+</span>{/if}{#if word(p)}<span class="tw tg">{p}</span>{:else}<Keys label={key(p)} />{/if}{/each}</span>{/snippet}

{#if t.live}
<div class="tt live"><span class="tw">{t.v}</span></div>
{:else}
<div class="tt" class:one class:alone={!a.length} bind:this={el}>
  {#if main}
    <div class="tm">
      {#if t.n}<div class="tl"><span class="tw tn">{t.n}</span>{#if t.v}<span class="tv"><span class="tw">{t.v}</span></span>{/if}{#if t.k}<Keys label={t.k} />{/if}</div>
      {:else if t.v}<div class="tl"><span class="tw">{t.v}</span>{#if t.k}<Keys label={t.k} />{/if}</div>{/if}
      {#if t.x}<div class="tx" class:lead={!t.n && !t.v} bind:this={tx} style:width={fit || null}>{#each bits(t.x) as b}{b}<wbr />{/each}</div>{/if}
    </div>
  {/if}
  {#if a.length}
    {#if main}<i class="tr"></i>{/if}
    <div class="ta">{#each a as [w, h]}<span class="tw what">{w}</span>{@render how(h)}{/each}</div>
  {/if}
</div>
{/if}
