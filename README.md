# Cart Clash

Neon-soaked **4-player shopping-cart physics brawler** — live at [www.cartclash.lol](https://www.cartclash.lol/).

**Naming:** Product is **Cart Clash**. Deploy host, Worker name, and some code IDs still say `cart-rave` until a deliberate cutover — see [docs/brand.md](./docs/brand.md).

**Phase (Aug 2026):** Playtesting & stabilization. Run 7 closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 / NET-SD-1 landed; PERF-TIER-1 + PROBE-WARM-RT-1 passed on prod. Current health, blockers, and the next milestone: [docs/STATUS.md](./docs/STATUS.md).

**Stack:** Three.js r185 + Rapier3D (standard + SIMD WASM) + **partyserver** / PartySocket on Cloudflare Workers (Vite 8 + Wrangler 4; WebRTC P2P + Calls TURN). Full table: [docs/README.md § Tech stack](./docs/README.md#tech-stack) · [docs/reference/CREDITS.md](./docs/reference/CREDITS.md). Gate: `npm run qa` — status:size → typecheck → test → knip → briefing:check → arch:check → health:check (see `check` in package.json).

## Gameplay

- **4-player shopping-cart physics sumo** — slam, boost-ram, and hop; knock carts off the edge or into voids/holes.
- **Arenas:** Cart Rave (Classic Record), The Storerooms, Sundial Station.
- **Living Store:** score-driven cargo bay (cart is the scoreboard) + mid-round PA directives (Flash Sale, Double Bag, Express Lane, Spill Bonus, Rush Hour).
- **Progression:** lifetime unlocks for cart patterns, sunglasses, custom color, and levels.
- **Modes:** Solo (private room + NPCs), Quickplay (public room), Friends (`?room=` link).
- **Round length:** 2.5 minutes + Sudden Death on ties.

## Documentation

All project docs live in [`docs/`](./docs/):

| Doc | Purpose |
|-----|---------|
| [docs/BRIEFING.md](./docs/BRIEFING.md) | Generated cold-start briefing — phase, active item, do-nots |
| [docs/STATUS.md](./docs/STATUS.md) | Session source of truth — health, focus, next milestone |
| [docs/README.md](./docs/README.md) | Project overview, setup, controls, full doc index |
| [docs/brand.md](./docs/brand.md) | Naming freeze — Cart Clash vs legacy cart-rave IDs |
| [docs/style-guide.md](./docs/style-guide.md) | Writing standard — brand voice, terminology |
| [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md) | Future — phased plan |
| [docs/planning/BACKLOG.md](./docs/planning/BACKLOG.md) | Future — open items, categorized + prioritized |
| [docs/planning/project-state.md](./docs/planning/project-state.md) | Present — architecture snapshot, known issues |
| [docs/planning/completed-work.md](./docs/planning/completed-work.md) | Past — shipped work log |
| [docs/reference/Game_Architecture.md](./docs/reference/Game_Architecture.md) | Consolidated architecture reference |
| [docs/reference/CREDITS.md](./docs/reference/CREDITS.md) | Third-party libraries, fonts, and assets |

Start with [docs/STATUS.md](./docs/STATUS.md) for where the project stands, [docs/README.md](./docs/README.md) for setup and controls, and [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md) for what's next.

## Run locally

```bash
npm run dev:local   # Vite + local Wrangler worker → http://127.0.0.1:4000/
```

Deploy: `npm run ship` (Cloudflare prod) · `npm run ship:glitch` (Glitch festival copy, after prod is good). Lanes and post-deploy verification: [docs/guides/deploy-urls.md](./docs/guides/deploy-urls.md).
