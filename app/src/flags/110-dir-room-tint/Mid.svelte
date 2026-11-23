<script>
  // #110 (UI audit flag): a name that gives way in its middle.
  //
  // Two spans in a row: the start, which ends in an ellipsis when there isn't
  // room, and the end, which stays whole. The browser does the cutting, so
  // there is nothing to measure, resize or redraw, and the whole name is in
  // the page in order: it copies, reads aloud and is found as one string.
  // `parts` are a search's matches, kept on both sides of the cut.
  //
  // With `fit` (a deck's title and artist) the cut is measured instead, to the
  // letter, so no gap is left beside the ellipsis; and where it would leave
  // fewer than six letters on either side it cuts the end, as names usually do.
  /** @type {{ text: string, parts?: { s: string, hit: boolean }[] | null, fit?: boolean }} */
  let { text, parts = null, fit = false } = $props();

  const LEAST = 6;
  /** What's shown: the name, or its start and end. @type {string | null} */
  let cut = $state(null);
  /** @param {HTMLElement} probe @param {string} name */
  function fitted(probe, name) {
    const line = /** @type {HTMLElement} */ (probe.parentElement);
    /** @param {string} s */
    const width = (s) => {
      probe.textContent = s;
      return probe.getBoundingClientRect().width;
    };
    const measure = () => {
      const cs = getComputedStyle(line);
      const zoom = line.getBoundingClientRect().width / (line.offsetWidth || 1) || 1;
      const room = (line.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * zoom - 0.5;
      const all = Array.from(name);
      if (room <= 0 || width(name) <= room) cut = null;
      else {
        // Nothing left hanging at the cut: no space, bracket or dash.
        const trim = (/** @type {string[]} */ a) => a.join('').trim();
        const start = (/** @type {string[]} */ a) => trim(a).replace(/[\s([{&,–—-]+$/, '');
        /** The most letters that fit, by `make`. @param {(n: number) => string} make */
        const most = (make) => {
          let lo = 0;
          let hi = all.length - 1;
          while (lo < hi) {
            const m = (lo + hi + 1) >> 1;
            if (width(make(m)) <= room) lo = m;
            else hi = m - 1;
          }
          return lo;
        };
        const tail = (/** @type {number} */ n) => Math.min(12, Math.floor(n * 0.4));
        const mid = (/** @type {number} */ n) => `${start(all.slice(0, n - tail(n)))}…${trim(all.slice(all.length - tail(n)))}`;
        const n = most(mid);
        const end = (/** @type {number} */ k) => `${start(all.slice(0, k))}…`;
        cut = tail(n) >= LEAST && n - tail(n) >= LEAST ? mid(n) : end(most(end));
      }
      probe.textContent = '';
    };
    const ro = new ResizeObserver(measure);
    ro.observe(line);
    document.fonts.addEventListener('loadingdone', measure);
    const styled = new MutationObserver(() => requestAnimationFrame(measure));
    styled.observe(document.documentElement, { attributes: true, attributeFilter: ['data-flag-font-special-gothic', 'data-flag-dir-room-tint', 'style'] });
    measure();
    return {
      update(/** @type {string} */ next) {
        name = next;
        measure();
      },
      destroy() {
        ro.disconnect();
        styled.disconnect();
        document.fonts.removeEventListener('loadingdone', measure);
      },
    };
  }

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

{#if fit}{#if cut}<span class="sr">{text}</span><span aria-hidden="true">{cut}</span>{:else}{text}{/if}<span class="probe" aria-hidden="true" use:fitted={text ?? ''}></span>{:else if keep}<span class="mid"><span class="a">{@render run(slice(0, at))}</span><span class="z">{@render run(slice(at, text.length))}</span></span>{:else}{@render run(slice(0, text?.length ?? 0))}{/if}

<style>
  .probe,
  .sr {
    position: absolute;
    visibility: hidden;
    white-space: pre;
    pointer-events: none;
  }
  .sr {
    visibility: visible;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
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
