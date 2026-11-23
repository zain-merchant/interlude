<script>
  // #110 (UI audit flag): a name that gives way in its middle.
  //
  // Two spans in a row: the start, which ends in an ellipsis when there isn't
  // room, and the end, which stays whole. The browser does the cutting, so
  // there is nothing to measure, resize or redraw, and the whole name is in
  // the page in order: it copies, reads aloud and is found as one string.
  // `parts` are a search's matches, kept on both sides of the cut.
  /** @type {{ text: string, parts?: { s: string, hit: boolean }[] | null }} */
  let { text, parts = null } = $props();

  // The end: up to 12 characters, never more than the last two fifths, so the
  // start is always the longer part; a short name isn't cut at all.
  const all = $derived(Array.from(text ?? ''));
  const keep = $derived.by(() => {
    if (all.length < 14) return 0;
    let n = Math.min(12, Math.floor(all.length * 0.4));
    // A space at the cut would show as a hole after the ellipsis.
    while (n && all[all.length - n] === ' ') n--;
    return n;
  });
  const at = $derived(all.slice(0, all.length - keep).join('').length);
  /** @param {number} from @param {number} to */
  const slice = (from, to) => {
    /** @type {{ s: string, hit: boolean }[]} */
    const out = [];
    let i = 0;
    for (const p of parts ?? [{ s: text ?? '', hit: false }]) {
      const s = p.s.slice(Math.max(0, from - i), Math.max(0, to - i));
      if (s) out.push({ s, hit: p.hit });
      i += p.s.length;
    }
    return out;
  };
</script>

{#snippet run(/** @type {{ s: string, hit: boolean }[]} */ list)}{#each list as m}{#if m.hit}<mark>{m.s}</mark>{:else}{m.s}{/if}{/each}{/snippet}

{#if keep}<span class="mid"><span class="a">{@render run(slice(0, at))}</span><span class="z">{@render run(slice(at, text.length))}</span></span>{:else}{@render run(slice(0, text?.length ?? 0))}{/if}

<style>
  /* Inline, so it stands where the line's own alignment puts it. */
  .mid {
    display: inline-flex;
    vertical-align: top;
    min-width: 0;
    max-width: 100%;
    padding: 0 !important;
  }
  .mid > span {
    padding: 0 !important;
    overflow: hidden;
    white-space: pre;
  }
  .a {
    flex: 0 1 auto;
    min-width: 0;
    text-overflow: ellipsis;
  }
  /* In a very narrow column the end gives way too, last. */
  .z {
    display: flex;
    justify-content: flex-end;
    flex: 0 0 auto;
    max-width: 60%;
    text-overflow: clip;
  }
</style>
