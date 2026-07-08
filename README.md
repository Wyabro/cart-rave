# Cart Clash

Neon-soaked **4-player shopping-cart physics brawler** — live at [cart-rave.wyabro.workers.dev](https://cart-rave.wyabro.workers.dev/).

Post-jam development continues on the **`cart-clash`** branch toward **Version 2** (content, performance, full rebrand + new domain).

**Naming:** Product is **Cart Clash**. Deploy host, Worker name, and some code IDs still say `cart-rave` until a deliberate cutover — see [docs/brand.md](./docs/brand.md).

**Recent (July 2026):**
- **Production-Readiness Audit**: Full-codebase audit with 50 ranked improvements ([docs/archive/audits/production-readiness-audit-2026-07.md](./docs/archive/audits/production-readiness-audit-2026-07.md)); top 10 implemented — Safari audio fallbacks, social link previews, PWA manifest fix, runtime error reporting, centralized storage, ~25 MB of dead assets/config removed. Baseline gate: `npm run check` (typecheck + tests + knip).
- **Core Stability**: Replaced problematic trimesh colliders on Record, Backrooms, and Zanzibar levels with precise convexHull + primitive colliders for stable physics and zero clipping.
- **Level 3 (Zanzibar Platform)**: Floating sundeck arena set in a dynamic sunset seascape with customized AI hazards and enhanced contact shadows.
- **Touch Controls**: Integrated virtual analog joysticks and touch buttons via `nipplejs` for portrait/landscape mobile play.
- **Progression**: Implemented daily/weekly challenges, personal best tracking, and local stat storage.
- **Tech Stack**: Migrated the multiplayer backend from PartyKit to raw **partyserver** running on Cloudflare Workers / Wrangler.
- **TypeScript Resolution**: Codebase is fully typechecked with 0 errors via `npx tsc --noEmit`.

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
