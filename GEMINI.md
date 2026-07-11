Read [AGENTS.md](./AGENTS.md) at the repo root first. It is the canonical rules file for this project.

AGENTS.md holds the stack facts, architecture invariants, standing behavioral rules,
model/tool routing, and what's off-limits. Session memory: docs/STATUS.md.
Architecture: docs/reference/Game_Architecture.md.
Everything below is Antigravity-specific and additive — it never overrides AGENTS.md.

## Antigravity notes

- Antigravity is used for exploratory, agentic tasks.
- Verify before you act: this is a physics multiplayer game where the host client is
  authoritative and real-time state travels peer-to-peer over WebRTC DataChannels
  (src/netcode/p2p.js), not through the server. The server (party/index.ts) never simulates
  physics — it does lobby, signaling, round lifecycle, and kill-feed only.
- Do not touch code under src/, party/, shared/, scripts/, or public/ unless the task
  explicitly asks for it. Do not edit docs/archive/handovers/ or docs/archive/audits/
  (historical archives).
