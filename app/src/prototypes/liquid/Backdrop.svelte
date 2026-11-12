<script>
  // A deep gradient that drifts slowly (about a minute per cycle). It is not
  // tied to the audio: the room is lit, not flashing.
  /** @type {{ a?: string, b?: string, c?: string, dim?: number }} */
  let { a = '#1f4fff', b = '#ff6a2e', c = '#7b4dff', dim = 1 } = $props();
</script>

<div class="bd" style:--a={a} style:--b={b} style:--c={c} style:opacity={dim} aria-hidden="true">
  <i class="o1"></i><i class="o2"></i><i class="o3"></i>
  <div class="noise"></div>
</div>

<style>
  .bd { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(90% 80% at 50% 0%, #17181c, #0a0a0c 70%); pointer-events: none; }
  i { position: absolute; border-radius: 50%; filter: blur(80px); will-change: transform; }
  .o1 { width: 70vw; height: 70vw; left: -22vw; top: 10vh; background: radial-gradient(circle, color-mix(in srgb, var(--a) 16%, transparent), transparent 65%); animation: d1 64s ease-in-out infinite alternate; }
  .o2 { width: 64vw; height: 64vw; right: -20vw; top: 22vh; background: radial-gradient(circle, color-mix(in srgb, var(--b) 12%, transparent), transparent 65%); animation: d2 72s ease-in-out infinite alternate; }
  .o3 { width: 50vw; height: 50vw; left: 28vw; top: -26vw; background: radial-gradient(circle, color-mix(in srgb, var(--c) 8%, transparent), transparent 65%); animation: d3 80s ease-in-out infinite alternate; }
  @keyframes d1 { to { transform: translate(8vw, -6vh) scale(1.08); } }
  @keyframes d2 { to { transform: translate(-7vw, 5vh) scale(0.94); } }
  @keyframes d3 { to { transform: translate(6vw, 8vh) scale(1.1); } }
  @media (prefers-reduced-motion: reduce) { i { animation: none; } }
  .noise { position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
</style>
