<script>
  // One zero state: a drawing, what's empty, a line of help, the way out.
  // 12 between what belongs together, 24 between the rest, from the ink.
  /** @type {{ art?: string, title: string, help?: string, picture?: import('svelte').Snippet, children?: import('svelte').Snippet }} */
  let { art = '', title, help = '', picture, children } = $props();
</script>

<div class="zs">
  <div class="in" class:pic={!!picture}>
    {#if picture}<div class="gr">{@render picture()}</div>{:else if art}<!-- eslint-disable-next-line svelte/no-at-html-tags (our own drawing) --><div class="gr">{@html art}</div>{/if}
    <div class="tx"><p class="zh">{title}</p>{#if help}<p class="zp">{help}</p>{/if}</div>
    {#if children}<div class="acts">{@render children()}</div>{/if}
  </div>
</div>
