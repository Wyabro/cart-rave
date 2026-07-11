# Cart Clash

**Cart Clash** is a neon-soaked **4-player shopping-cart brawler**: slam, boost-ram, and hop your way around arena floors — and try not to get yeeted off the edge or through a void. Matches are **2.5 minutes** of physics chaos (with Sudden Death on ties), and the cart with the **most points** takes the podium.

**Pitch:** *Physics sumo… with shopping carts… on a spinning record.*

**Status (July 2026):** Post-jam. Active development on the **`cart-clash`** branch toward **Version 2**. Physics stability, three elevated arenas (Cart Rave / Storerooms / **Sundial Station**), HUD redesign, lifetime unlocks, and **Living Store** (cargo scoreboard + PA directives) are in tree. See [ROADMAP.md](./planning/ROADMAP.md) for open priorities and [brand.md](./brand.md) for the naming freeze.

---

## Documentation index

Docs are grouped by kind. Two entry points live at the `docs/` root: this index and
[brand.md](./brand.md) (the canonical naming freeze — prefer it when docs disagree).

**Agent / session rehydration:** start with [STATUS.md](./STATUS.md) (current focus, next actions, gotchas).

### `planning/` — status & forward-looking

Three docs split cleanly by time — **past / present / future**:

| Doc | Purpose |
|-----|---------|
| [STATUS.md](./STATUS.md) | **Session source of truth** — rehydration, current focus, next actions |
| [planning/completed-work.md](./planning/completed-work.md) | **Past** — historical log of shipped work |
| [planning/project-state.md](./planning/project-state.md) | **Present** — current status, architecture snapshot, known issues |
| [planning/ROADMAP.md](./planning/ROADMAP.md) | **Future** — forward-looking plan (Version 2 priorities) |
| [planning/living-store-test-plan.md](./planning/living-store-test-plan.md) | Deferred two-browser checklist for Living Store |

### `reference/` — how it's built

| Doc | Purpose |
|-----|---------|
| [reference/Game_Architecture.md](./reference/Game_Architecture.md) | Consolidated architecture & design reference |
| [reference/living-store.md](./reference/living-store.md) | Living Cargo + PA directives (as-built) |
| [reference/scoring-event-system.md](./reference/scoring-event-system.md) | Scoring & event system (as-built) |
| [reference/announcer.md](./reference/announcer.md) | "The Store PA" announcer system + voice asset pipeline |
| [reference/CREDITS.md](./reference/CREDITS.md) | Third-party libraries, fonts, and assets |

### `guides/` — operational workflow

| Doc | Purpose |
|-----|---------|
| [guides/preview-dev.md](./guides/preview-dev.md) | Local multiplayer dev workflow |
| [guides/visual-qa.md](./guides/visual-qa.md) | Screenshot harness, ablation flags, black-frame battery; `npm run qa` / `qa:visual` |
| [guides/deploy-urls.md](./guides/deploy-urls.md) | Production URLs and deploy verification |
| [guides/cart-pattern-reuv.md](./guides/cart-pattern-reuv.md) | Cart body second UV for pattern masks (Blender + compress) |

### `archive/` — frozen historical

| Doc | Purpose |
|-----|---------|
| [archive/handovers/](./archive/handovers/) | Session handover notes (jam-era) |
| [archive/audits/](./archive/audits/) | Code audits (jam-era & July 2026 passes) |
| [archive/session-notes/](./archive/session-notes/) | Shipped July 2026 session plans (HUD, Zanzibar, production-value, etc.) |

---

## Tech stack

Versions are the `package.json` ranges. Full credits, licenses, and services: [reference/CREDITS.md](./reference/CREDITS.md).

### Client

| Layer | Technology | Version |
|-------|------------|---------|
| 3D Rendering | Three.js (`three`) | `^0.185.1` |
| Physics | Rapier3D (`@dimforge/rapier3d`, native WASM) | `^0.19.3` |
| Build | Vite | `^8.1.4` |
| State | Zustand (`zustand/vanilla`) | `^5.0.14` |
| Audio | Howler.js (`howler`) | `^2.2.4` |
| Animation | anime.js (`animejs`) | `^4.5.0` |
| Debug UI | Tweakpane | `^4.0.5` |
| Touch | nipplejs | `^1.0.4` |
| Language | JSDoc + TypeScript for `tsc --noEmit` | `^6.0.3` (stay on 6.x; 7.x deferred) |

### Server & infrastructure

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Cloudflare Workers | Free-tier capable |
| Stateful server | Durable Objects via `partyserver` | `^0.5.8` |
| WebSocket client | `partysocket` | `^1.3.0` |
| P2P transport | WebRTC DataChannels | Browser native |
| TURN relay | Cloudflare Calls (API-minted) | Account secrets |
| WASM bundling | `vite-plugin-wasm` | `^3.6.0` |
| Deployment | Wrangler | `^4.110.0` |
| Static assets | Worker `ASSETS` → `dist/` | `wrangler.jsonc` |

### Testing & quality

| Layer | Technology | Version |
|-------|------------|---------|
| Test runner | Vitest | `^4.1.10` |
| DOM environment | happy-dom | `^20.10.6` |
| Dead code | knip | `^6.26.0` |
| Type checking | `tsc --noEmit` | via TypeScript `^6.0.3` |

**Notes:** Physics is **host-authoritative on the client** (Rapier does not run in the Worker). `partyserver` still pulls `@cloudflare/workers-types@4` while Wrangler 4.108+ optional-peers v5 — installs use `.npmrc` `legacy-peer-deps=true`.

Client code lives in `src/`. `src/main.js` is the live entry point and wiring hub; core systems are modular (`netcode.js`, `simulation.js`, `bootstrap.js`, `levelManager.js`, etc.).

---

## Run locally

### Prerequisites

- **Node.js + npm**

### Daily development (`cart-clash` branch)

One command — Vite client + local partyserver worker via Wrangler:

```bash
npm run dev:local
```

(`dev:cart-clash` and legacy `dev:next-level` are aliases.)

Open **http://127.0.0.1:3000/**. See [preview-dev.md](./guides/preview-dev.md) for the full preview workflow.

### Two-terminal alternative

```bash
# Terminal 1 — Vite
npm run dev

# Terminal 2 — partyserver via Wrangler
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
- **Levels** (display names; level ids in code — see [brand.md](./brand.md)):
  - **CART RAVE** / Classic Record (`classicRecord`) — vinyl ring + center hole; jam tribute
  - **THE STOREROOMS** (`backrooms`) — square floor + corner voids
  - **SUNDIAL STATION** (`zanzibar`) — floating sundeck + sunset seascape
- **Scoring**: knock carts off the **edge** or into **voids/holes** for points (crit / leader / kill-zone / combo / directive bonuses stack). Living Cargo fills the bay from round score so standings read off the field.
- **Living Store**: mid-round PA **directives** bend the rules for ~18s windows (Flash Sale, Double Bag, Express Lane, Spill Bonus, Rush Hour) — see [living-store.md](./reference/living-store.md).
- **Progression**: lifetime unlocks for patterns (incl. Bolt), sunglasses, custom color, and levels
- **Multiplayer**: one player becomes **host** and runs authoritative physics; non-host clients send input and interpolate snapshots (with client-side prediction for the local cart)
- **Round length**: 2.5 minutes standard + Sudden Death on ties

---

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (port 3000) |
| `npm run dev:local` | Vite + local Wrangler worker (preferred daily) |
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
src/netcode.js      # Multiplayer + prediction
src/simulation.js   # Host Rapier physics
src/scoring/        # KO events, reactors, match stats
src/cargoLoad.js    # Living Cargo (cart = scoreboard)
src/directives/     # Living Store PA mini-mutators
src/stores/         # Zustand (game, unlocks, challenges, …)
src/ui/styles/      # HUD / pause / results / tokens CSS
party/index.ts      # partyserver Durable Object
docs/               # Project docs (start here)
docs/brand.md       # Naming freeze
```

For architecture detail, see [Game_Architecture.md](./reference/Game_Architecture.md). For naming rules, see [brand.md](./brand.md).
