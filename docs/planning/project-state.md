# Cart Clash — Project State

**Last updated:** July 8, 2026  
**Phase:** 4 — Multiplayer & Infrastructure (post-jam, working toward Version 2)  
**Branch:** `cart-clash` (active development) · `main` (production)  
**Production:** https://cart-rave.wyabro.workers.dev/  
**Repo:** https://github.com/Wyabro/cart-rave  
**Naming:** Product is **Cart Clash**; Worker/host/storage IDs may still say `cart-rave` — see [brand.md](../brand.md).

---

## 1. Overview

Cart Clash is a browser-based **4-player physics sumo** game. Players drive neon shopping carts on arena floors — a vinyl record ring (**Cart Rave**, jam tribute), a Backrooms supermarket (The Storerooms), or a floating sundeck (Zanzibar Platform). Ram opponents off edges or into voids to score. Rounds last **150 seconds** (2.5 minutes).

**Version 2 goal:** Polished release with new content (including Zanzibar Platform level), better performance, touch controls, daily/weekly challenges, and a **domain cutover** after the naming freeze in [brand.md](../brand.md). See [ROADMAP.md](./ROADMAP.md) for prioritized work.

> **This doc = the present** — what's built and works today. Forward plans live in
> [ROADMAP.md](./ROADMAP.md); the shipped log lives in [completed-work.md](./completed-work.md).
> When a task here ships, move its writeup to completed-work.md.

---

## 2. Stack & build

| Layer | Technology |
|-------|------------|
| Rendering | Three.js (`src/`, Vite-bundled) |
| Physics | Rapier3D (host-authoritative, client-side only) |
| Multiplayer | partyserver Durable Object (`party/index.ts`) |
| Build | Vite → `dist/` |
| Hosting | Cloudflare Workers (assets + Durable Object via Wrangler) |

**No server-side physics.** The Durable Object relays messages only.

---

## 3. Architecture snapshot

- **Host-authoritative multiplayer** with client-side prediction for the local human cart (non-host).
- **4 cart slots** per room; empty slots filled by NPCs. Humans swap in by color pick.
- **Ready-up gate**: server broadcasts `gameStart` only when all humans are ready.
- **Levels**: `classicRecord` (default), `backrooms`, `zanzibar` — selected in menu, persisted in `localStorage` (`cartRaveLevel`).
- **Solo play** reuses multiplayer (private `soloXXXXXX` room + 3 NPCs).

### Recent refactor (June/July 2026)

Detailed refactor timeline lives in [completed-work.md](./completed-work.md). Highlights: `bootstrap.js` / `levelManager.js` / `pauseOverlay.js` extracted from `main.js`; ~2600 lines of inline CSS moved to `src/ui/styles/`; 100% typecheck compliance under `npx tsc --noEmit`; the WebRTC signaling root-cause fix restoring P2P multiplayer; production-readiness + production-value + visual-polish + announcer-system passes shipped July 7–8. `main.js` remains the thin orchestrator and wiring hub.

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation |
| `src/simulation.js` | Rapier physics (host) |
| `src/levels/` | Level definitions (classic, backrooms, zanzibar) |
| `src/announcer/` | "The Store PA" announcer — arbitration manager, event table, director, procedural stings |
| `src/ui/announcerDisplay.js` | Announcer callout banner + `aria-live` region |
| `src/ui/styles/` | Extracted UI stylesheets (hud, pause, results, global, announcer) |
| `party/index.ts` | partyserver Durable Object (relay + room state) |
| `tests/` | Test files (Vitest) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](../reference/Game_Architecture.md).

---

## 4. Current status

**Phases 1–3 complete; Phase 4 (Multiplayer & Infrastructure) is active.** What works today:

- **Core game** — fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction; solo mode (private `soloXXXXXX` room + NPCs) runs the same path.
- **Physics & feel** — major stability overhaul complete: convex-hull + primitive colliders across all three arenas; mobile performance significantly improved.
- **Content** — three arenas (Classic Record, Backrooms, Zanzibar), touch controls (joystick + Boost/Hop), daily/weekly challenges, personal-best tracking.
- **Presentation** — "The Store PA" announcer, visual-polish pass, and production-value pass all shipped (July 7–8, 2026).

**Next / open** (full plan and priorities in [ROADMAP.md](./ROADMAP.md)):

| Item | Status |
|------|--------|
| Multiplayer runtime smoke test (two browsers, one room; carts visibly syncing) | ⬜ Pending |
| Menu overhaul + domain cutover | 🔧 In progress |
| Persistent leaderboard (Supabase) | ⬜ Planned |

The full shipped log — including the Phase 4 bug-fix ledger (netcode DRY refactor, P2P DataChannel migration, WebRTC signaling root-cause fix, `hostTransform` payload sync, respawn/shatter cleanup, extraction refactors, etc.) — lives in [completed-work.md](./completed-work.md#phase-4-bug-fix-ledger).

---

## 5. Known issues

All primary high-priority bugs (host cart freeze, ready-up races, ready button redundancies, and alignment offsets) from the original playtests have been resolved. Stale known issues from the Jam era have been cleared.

Current validation is focused on:
1. Multiplayer runtime integration smoke tests (two browsers, one room).
2. Evicting/resetting in-memory Durable Object state between server builds.

---

## 6. Dev workflow

| Context | Command | Doc |
|---------|---------|-----|
| `cart-clash` daily dev | `npm run dev:local` | [preview-dev.md](../guides/preview-dev.md) |
| Production local | `npm run dev` + `npm run dev:party` | [README.md](../README.md) |
| Deploy production | `npm run ship` | [deploy-urls.md](../guides/deploy-urls.md) |

---

## 7. Historical context

This project shipped for **Cursor Vibe Jam 2026** (May 2026) as **Cart Rave**. Post-jam work continues on **`cart-clash`** under the product name **Cart Clash**.

- Session handovers: [handovers/](../archive/handovers/)
- Shipped feature log: [completed-work.md](./completed-work.md) (historical record)

**Note:** `project-state.md` previously tracked jam deadline tasks and blocking bugs from April 2026. Those items are resolved or superseded by the Version 2 roadmap.
