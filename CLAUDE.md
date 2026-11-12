# Notes for Claude

## Front-end skills

Third-party agent skills for UI work live in `.claude/skills/`. They were copied
from upstream and reviewed before committing; see `.claude/skills/README.md` for
sources and versions.

The UI is Svelte 5 + Tailwind 4 + shadcn-svelte inside Tauri. Skills that check
"the running app" (`verify`, `keyboard`, `prototype`) should use the browser
build: `cd app && npm run dev`, then http://localhost:1420 (simulated engine, no
Rust needed). Some examples in these skills are written for React; translate them
to Svelte rather than adding React.

Installed:

- Emil Kowalski (motion and polish): `emil-design-eng`, `review-animations`,
  `improve-animations`, `animation-vocabulary`, `animation-performance`, `break-ui`.
- Raphael Salaja (process): `gather`, `prototype`, `restraint`, `scope`, `reuse`,
  `verify`, `keyboard`, `color`.
- Vercel: `web-design-guidelines` (fetches the current Web Interface Guidelines
  from GitHub each time it runs).

`prototype` is Raphael's (it ships a switcher that works in Svelte). Emil's skill
of the same name is not installed, so there is no name clash.

Workflow: collect references first (`gather`), build variants on one named axis
(`prototype`), and before calling UI work done run `web-design-guidelines` and
`review-animations`.
