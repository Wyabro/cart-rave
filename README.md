# Cart Clash

Neon-soaked **4-player shopping-cart physics brawler** — live at [cart-rave.wyabro.workers.dev](https://cart-rave.wyabro.workers.dev/).

Post-jam development continues on the **`cart-clash`** branch toward **Version 2** (content, performance, full rebrand + new domain).

**Naming:** Product is **Cart Clash**. Deploy host, Worker name, and some code IDs still say `cart-rave` until a deliberate cutover — see [docs/brand.md](./docs/brand.md).

**Recent (July 2026):**
- **Arenas**: Cart Rave (Classic Record), The Storerooms, and **Sundial Station** (level id `zanzibar`) — physics stability pass + July presentation elevation / flagship Sundial overhaul.
- **HUD redesign**: Center-stage events, design tokens, icon system, sticker scoreboard, touch layout.
- **Progression**: Lifetime unlocks for cart patterns (incl. Bolt), sunglasses, custom color, and levels — plus daily/weekly challenges and personal bests.
- **Living Store**: Score-driven cargo bay (cart is the scoreboard) + mid-round PA **directives** (Flash Sale, Double Bag, Express Lane, Spill Bonus, Rush Hour). As-built: [docs/reference/living-store.md](./docs/reference/living-store.md).
- **Feel & presentation**: Store PA announcer, production-value / feel passes, match-stat superlatives, charge glow.
- **Perf foundations**: Boot/load pass, self-hosted fonts, half-res bloom, level prop LOD, Draco cart models.
- **Stack**: Three.js r185 + Rapier3D + **partyserver** / PartySocket on Cloudflare Workers (Vite 8 + Wrangler 4; WebRTC P2P + Calls TURN). Full table: [docs/README.md § Tech stack](./docs/README.md#tech-stack) · [docs/reference/CREDITS.md](./docs/reference/CREDITS.md). Baseline gate: `npm run check` (typecheck + tests + knip).

## Documentation

All project docs live in [`docs/`](./docs/):

| Doc | Purpose |
|-----|---------|
| [docs/README.md](./docs/README.md) | Project overview, setup, controls, full doc index |
| [docs/brand.md](./docs/brand.md) | **Naming freeze** (Cart Clash vs legacy cart-rave IDs) |
| [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md) | **Future** — forward-looking plan (Version 2 priorities) |
| [docs/planning/project-state.md](./docs/planning/project-state.md) | **Present** — current status, architecture snapshot, known issues |
| [docs/planning/completed-work.md](./docs/planning/completed-work.md) | **Past** — historical log of shipped work |
| [docs/guides/preview-dev.md](./docs/guides/preview-dev.md) | Local multiplayer dev workflow |
| [docs/reference/Game_Architecture.md](./docs/reference/Game_Architecture.md) | Consolidated architecture reference |
| [docs/reference/CREDITS.md](./docs/reference/CREDITS.md) | Third-party libraries, fonts, and assets |

Start with [docs/README.md](./docs/README.md) for setup and [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md) for what we're building next.
