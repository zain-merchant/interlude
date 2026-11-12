<script>
  // Hardware Object's library, in glass: mono rows, the selected row inverted.
  import { library } from '../bold/track.js';
  /** @type {{ rows?: number, sel?: number, cols?: 'full'|'compact' }} */
  let { rows = 8, sel = 2, cols = 'full' } = $props();
</script>

<div class="lib {cols}">
  <div class="hd"><span>Title</span>{#if cols === 'full'}<span>Artist</span>{/if}<span>BPM</span><span>Key</span>{#if cols === 'full'}<span>Time</span><span>Crate</span>{/if}</div>
  {#each library.slice(0, rows) as r, i}
    <div class="tr" class:sel={i === sel}>
      <span class="t">{r[0]}</span>{#if cols === 'full'}<span class="m">{r[1]}</span>{/if}<span>{r[2]}</span><span>{r[3]}</span>{#if cols === 'full'}<span>{r[4]}</span><span class="m">{r[5]}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .lib { font-size: 13px; font-feature-settings: 'tnum'; }
  .hd, .tr { display: grid; grid-template-columns: 1.4fr 1.1fr 48px 48px 56px 1fr; gap: 12px; align-items: center; padding: 0 12px; }
  .compact .hd, .compact .tr { grid-template-columns: 1fr 36px 36px; }
  .hd { height: 28px; color: rgb(242 241 236 / 0.45); font-family: 'Geist Variable', sans-serif; font-size: 11.5px; }
  .tr { height: 32px; border-radius: 6px; color: rgb(242 241 236 / 0.86); }
  .tr .m { color: rgb(242 241 236 / 0.55); }
  .tr span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tr.sel { background: #f4f2ec; color: #0b0b0e; box-shadow: 0 0 24px rgb(255 255 255 / 0.12); }
  .tr.sel .m { color: rgb(11 11 14 / 0.6); }
</style>
