# Cart Rave

**Cart Rave** is a neon-soaked **4-player shopping-cart brawler**: slam, boost-ram, and hop your way around a club dancefloor ring — and try not to get yeeted through the **center hole**. Matches are **2.5 minutes** of physics chaos (with Sudden Death on ties), and the cart with the **most points** takes the podium.

**Pitch:** *Physics sumo… with shopping carts… on a spinning record.*

**Status (July 2026):** Post-jam. Active development on the `next-level` branch toward **Version 2**. Major physics stability overhaul completed (trimesh colliders replaced with convexHull + primitive colliders on Record, Backrooms, and Zanzibar levels). See [ROADMAP.md](./ROADMAP.md) for current priorities.

---

## Documentation index

| Doc | Purpose |
|-----|---------|
| [ROADMAP.md](./ROADMAP.md) | **Primary forward-looking plan** (Version 2 priorities) |
| [todo.md](./todo.md) | Current status snapshot + shipped history |
| [project-state.md](./project-state.md) | Architecture snapshot, known issues |
| [Game_Architecture.md](./Game_Architecture.md) | Consolidated architecture & design reference |
| [announcer.md](./announcer.md) | "The Store PA" announcer system + voice asset pipeline |
| [preview-dev.md](./preview-dev.md) | `next-level` branch local dev workflow |
| [deploy-urls.md](./deploy-urls.md) | Production URLs and deploy verification |
| [CREDITS.md](./CREDITS.md) | Third-party libraries, fonts, and assets |
| [post-jam-ideas.md](./post-jam-ideas.md) | Deferred ideas (many now tracked in ROADMAP) |
| [handovers/](./handovers/) | Session handover notes (historical) |
| [audits/](./audits/) | Code audits (historical) |

---

## Tech stack

- **Three.js** — rendering, camera, post-processing, UI/world visuals
- **Rapier3D** — real-time physics (host-authoritative simulation). Heavy use of `convexHull` and primitive colliders after July 2026 refactor for stability and performance.
- **partyserver** — multiplayer rooms + WebSocket Durable Object relay + server state running on Cloudflare Workers (migrated from PartyKit July 2026)
- **Vite** — dev server and production build (`dist/`)

Client code lives in `src/`. `src/main.js` is the live entry point and wiring hub; core systems are modular (`netcode.js`, `simulation.js`, `bootstrap.js`, `levelManager.js`, etc.).

---

## Run locally

### Prerequisites

- **Node.js + npm**

### Daily development (`next-level` branch)

One command — Vite client + preview partyserver worker via Wrangler:

```bash
npm run dev:next-level
```

Open **http://127.0.0.1:3000/**. See [preview-dev.md](./preview-dev.md) for the full preview workflow.

### Production config (`main` branch)

```bash
# Terminal 1 — Vite
npm run dev

# Terminal 2 — partyserver via Wrangler (port 8787/1999)
npm run dev:party
```

### Deploy

```bash
npm run build    # Vite → dist/
npm run ship     # build + wrangler deploy (production)
```

---

## Player controls

- **WASD / Arrow keys**: drive (tank steering)
- **Shift**: boost / ram boost
- **Space**: hop
- **M**: mute audio
- **Esc**: in-game overlay (settings + quit to menu; simulation continues)
- **Touch** (mobile): virtual joystick + Boost/Hop buttons via `nipplejs`

---

## Gameplay basics

- **Modes**: Solo (private room + NPCs), Quickplay (public room), Friends (share a `?room=` link)
- **Levels**: 
  - Classic Record (vinyl ring + center hole) — major physics stability pass July 2026
  - Backrooms Supermarket (square floor + corner voids) — major physics stability pass July 2026
  - Zanzibar Platform (floating sundeck + sunset seascape) — added July 2026
- **Scoring**: knock carts off the **edge** or into **voids/holes** for points (bonuses stack for big plays)
- **Multiplayer**: one player becomes **host** and runs authoritative physics; non-host clients send input and interpolate snapshots (with client-side prediction for the local cart)
- **Round length**: 2.5 minutes standard + Sudden Death on ties

---

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run dev:next-level` | Vite + local Wrangler wrangler dev server |
| `npm run dev:party` | Local wrangler worker (Durable Object) |
| `npm run build` | Production build to `dist/` |
| `npm run ship` | Build + deploy worker to Cloudflare |
| `npm run knip` | Unused export analysis |
| `npm run typecheck` | Typecheck codebase with tsc |
| `npm test` | Run Vitest unit tests |

---

## Repo layout (high level)

```
index.html          # Static shell, menu markup
src/main.js         # Entry point + game wiring
src/bootstrap.js    # Menu → gameplay flow
src/levelManager.js # Level preview + swapping
src/levels/         # Level definitions (classic, backrooms, zanzibar)
party/index.ts      # partyserver Durable Object class
docs/               # All project documentation
```

Design constraints and AI guardrails: `.cursorrules` at repo root.

---

**Last Updated:** July 4, 2026