<script>
  import { flag } from '../registry.svelte.js';
  // A shortcut as separate caps ("⇧⌘Z" is three), its marks drawn to sit
  // level with the letters.
  /** @type {{ label: string }} */
  let { label } = $props();
  const MARK = {
    '⇧': 'M8 2.6 13.2 8.2H10.4V13H5.6V8.2H2.8Z',
    '⌘': 'M6 6H10V10H6ZM6 6V4.4A1.9 1.9 0 1 0 4.1 6.3H6M10 6V4.4A1.9 1.9 0 1 1 11.9 6.3H10M6 10V11.6A1.9 1.9 0 1 1 4.1 9.7H6M10 10V11.6A1.9 1.9 0 1 0 11.9 9.7H10',
    '⌥': 'M2.4 4H5.6L10.4 12H13.6M9.8 4H13.6',
    '⌃': 'M3.6 9.4 8 5 12.4 9.4',
    '→': 'M2.6 8H13M9 4 13 8 9 12',
    '←': 'M13.4 8H3M7 4 3 8 7 12',
    '↑': 'M8 13.4V3M4 7 8 3 12 7',
    '↓': 'M8 2.6V13M4 9 8 13 12 9',
    '↩': 'M13 3.6V6.6A2.4 2.4 0 0 1 10.6 9H3M6.4 5.6 3 9 6.4 12.4',
    '−': 'M4 8H12',
    '+': 'M4 8H12M8 4V12',
  };
  const ORDER = '⌃⌥⇧⌘';
  const caps = $derived.by(() => {
    const mods = [];
    let rest = label;
    for (;;) {
      if (rest.length > 1 && ORDER.includes(rest[0])) {
        mods.push(rest[0]);
        rest = rest.slice(1);
      } else if (/^(Ctrl|Alt|Shift)\+./.test(rest)) {
        const i = rest.indexOf('+');
        mods.push(rest.slice(0, i));
        rest = rest.slice(i + 1);
      } else break;
    }
    mods.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return [...mods, rest];
  });
</script>

<span class="kcaps" aria-hidden="true">{#each caps as c}<span class="kcap" class:word={!MARK[c] && c.length > 1}>{#if MARK[c] && !flag('key-marks')}<svg viewBox="0 0 16 16"><path d={MARK[c]} /></svg>{:else}<b>{c}</b>{/if}</span>{/each}</span>
