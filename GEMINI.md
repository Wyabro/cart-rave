Read AGENTS.md at the repo root first. It is the canonical rules file for this project.

AGENTS.md holds the stack facts, architecture invariants, standing behavioral rules,
model/tool routing, and what's off-limits. docs/architecture.md is the deep reference.
Everything below is Antigravity-specific and additive — it never overrides AGENTS.md.

## Antigravity notes

- Antigravity is used for exploratory, agentic tasks.
- Verify before you act: this is a physics multiplayer game where the host client is
  authoritative and real-time state travels peer-to-peer over WebRTC DataChannels
  (src/netcode/p2p.js), not through the server. The server (party/index.ts) never simulates
  physics — it does lobby, signaling, round lifecycle, and kill-feed only.
- Do not touch code under src/, party/, shared/, scripts/, or public/ unless the task
  explicitly asks for it. Do not edit docs/handovers/ or docs/audits/ (historical archives).
- Gates that must stay green: `npx vitest run` (21/21), `npm run typecheck` (0 errors),
  `npm run build`.
