# Cart Rave

Neon-soaked **4-player shopping-cart physics brawler** — live at [cart-rave.wyabro.workers.dev](https://cart-rave.wyabro.workers.dev/).

Post-jam development continues on the **`next-level`** branch toward **Version 2** (new content, performance, rename + new domain).

**Recent (July 2026):**
- **Core Stability**: Replaced problematic trimesh colliders on Record, Backrooms, and Zanzibar levels with precise convexHull + primitive colliders for stable physics and zero clipping.
- **Level 3 (Zanzibar Platform)**: Floating sundeck arena set in a dynamic sunset seascape with customized AI hazards and enhanced contact shadows.
- **Touch Controls**: Integrated virtual analog joysticks and touch buttons via `nipplejs` for portrait/landscape mobile play.
- **Progression**: Implemented daily/weekly challenges, personal best tracking, and local stat storage.
- **Tech Stack**: Migrated the multiplayer backend from PartyKit to raw **partyserver** running on Cloudflare Workers / Wrangler.
- **Netcode**: Real-time physics, input, and spill events moved to **WebRTC peer-to-peer DataChannels** (`src/netcode/p2p.js`); the server is now signaling + lobby + kill-feed only.
- **TypeScript Resolution**: Codebase is fully typechecked with 0 errors via `npx tsc --noEmit`.

## Documentation

Agent rules for all tools (Claude Code, Cursor, Antigravity) live in [`AGENTS.md`](./AGENTS.md).
Project docs live in [`docs/`](./docs/):

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](./AGENTS.md) | **Canonical rules file** — stack facts, invariants, workflow (root) |
| [docs/README.md](./docs/README.md) | Project overview, setup, controls, full doc index |
| [docs/architecture.md](./docs/architecture.md) | **How the stack works** — single architecture source of truth |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | **Primary forward-looking plan** (Version 2 priorities) |
| [docs/todo.md](./docs/todo.md) | Current status + shipped history |
| [docs/project-state.md](./docs/project-state.md) | Architecture snapshot, known issues |
| [docs/preview-dev.md](./docs/preview-dev.md) | `next-level` branch local dev workflow |
| [docs/CREDITS.md](./docs/CREDITS.md) | Third-party libraries, fonts, and assets |

Start with [docs/README.md](./docs/README.md) for setup, [docs/architecture.md](./docs/architecture.md)
for how it works, and [docs/ROADMAP.md](./docs/ROADMAP.md) for what we're building next.