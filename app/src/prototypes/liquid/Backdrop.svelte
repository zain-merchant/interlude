<script>
  // The Liquid Glass backdrop, kept calm: two soft pools of the deck colours
  // and a cool neutral glow, drifting over about a minute. Not tied to audio.
  // tint: how much of the deck colours shows (0 = none, just a neutral
  // light from the top).
  /** @type {{ a: string, b: string, tint?: number }} */
  let { a, b, tint = 1 } = $props();
</script>

<div class="bd" style:--a={a} style:--b={b} aria-hidden="true">{#if tint > 0}<i class="o1" style:opacity={tint}></i><i class="o2" style:opacity={tint}></i>{/if}<i class="o3"></i></div>

<style>
  .bd { position: absolute; inset: 0; overflow: hidden; pointer-events: none; background: radial-gradient(100% 80% at 50% 0%, #16171b, #09090b 70%); }
  i { position: absolute; border-radius: 50%; filter: blur(90px); will-change: transform; }
  .o1 { width: 60vw; height: 60vw; left: -18vw; top: -10vh; background: radial-gradient(circle, color-mix(in srgb, var(--a) 26%, transparent), transparent 65%); animation: d1 70s ease-in-out infinite alternate; }
  .o2 { width: 60vw; height: 60vw; right: -18vw; top: -6vh; background: radial-gradient(circle, color-mix(in srgb, var(--b) 24%, transparent), transparent 65%); animation: d2 80s ease-in-out infinite alternate; }
  .o3 { width: 70vw; height: 50vw; left: 15vw; bottom: -30vw; background: radial-gradient(circle, rgb(140 160 200 / 0.10), transparent 65%); animation: d3 90s ease-in-out infinite alternate; }
  @keyframes d1 { to { transform: translate(6vw, 5vh) scale(1.06); } }
  @keyframes d2 { to { transform: translate(-6vw, 6vh) scale(0.95); } }
  @keyframes d3 { to { transform: translate(-5vw, -4vh); } }
  @media (prefers-reduced-motion: reduce) { i { animation: none; } }
</style>
