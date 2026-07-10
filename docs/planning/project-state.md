# Cart Clash — Project State

**Last updated:** July 10, 2026  
**Phase:** 4 — Multiplayer & Infrastructure (post-jam, working toward Version 2)  
**Branch:** `cart-clash` (active development) · `main` (production)  
**Production:** https://cart-rave.wyabro.workers.dev/  
**Repo:** https://github.com/Wyabro/cart-rave  
**Naming:** Product is **Cart Clash**; Worker/host/storage IDs may still say `cart-rave` — see [brand.md](../brand.md).

---

## 1. Overview

Cart Clash is a browser-based **4-player physics sumo** game. Players drive neon shopping carts on arena floors — a vinyl record ring (**Cart Rave**, jam tribute), a Backrooms supermarket (**The Storerooms**), or a floating sundeck (**Sundial Station**, level id `zanzibar`). Ram opponents off edges or into voids to score. Rounds last **150 seconds** (2.5 minutes).

**Version 2 goal:** Polished release with strong solo feel, three presentation-elevated arenas, cosmetic/level progression, better performance, and a **domain cutover** after the naming freeze in [brand.md](../brand.md). See [ROADMAP.md](./ROADMAP.md) for open work.

> **This doc = the present** — what's built and works today. Forward plans live in
> [ROADMAP.md](./ROADMAP.md); the shipped log lives in [completed-work.md](./completed-work.md).
> When a task here ships, move its writeup to completed-work.md.

---

## 2. Stack & build

| Layer | Technology |
|-------|------------|
| Rendering | Three.js r185 / `^0.185.1` (`src/`, Vite-bundled) |
| Physics | Rapier3D `^0.19.3` (host-authoritative, client-side only) |
| Multiplayer | partyserver `^0.5.8` Durable Object (`party/index.ts`) + partysocket `^1.3.0` |
| P2P / TURN | WebRTC DataChannels; Cloudflare Calls mint TURN (`request_turn_credentials`) |
| Build | Vite `^8.1.4` + vite-plugin-wasm → `dist/` |
| Hosting | Cloudflare Workers (ASSETS + Durable Object via Wrangler `^4.110.0`) |
| Quality | TypeScript 6.x `tsc --noEmit`, Vitest `^4.1.10`, knip `^6.26.0` |
| Fonts | Self-hosted under `public/fonts/` (`npm run fonts:fetch`) |
| Cart models | Draco GLBs under `public/models/` (masters under `art/`) |

Full version table + licenses: [CREDITS.md](../reference/CREDITS.md) and [docs/README.md § Tech stack](../README.md#tech-stack).

**No server-side physics.** The Durable Object relays messages only. Host snapshots stream at ~**40 Hz** on the DataChannel when P2P is up.

**Tooling notes (July 10, 2026):** TypeScript stays on **6.x** (7.x deferred). Wrangler 4.108+ vs partyserver workers-types peer mismatch is handled by `.npmrc` `legacy-peer-deps=true`.

---

## 3. Architecture snapshot

- **Host-authoritative multiplayer** with client-side prediction for the local human cart (non-host).
- **4 cart slots** per room; empty slots filled by NPCs. Humans swap in by color pick.
- **Ready-up gate**: server broadcasts `gameStart` only when all humans are ready.
- **Levels**: `classicRecord` (default), `backrooms`, `zanzibar` — menu select, persisted in `localStorage` (`cartRaveLevel`); levels gated by lifetime unlocks (dev unlocks all by default).
- **Solo play** reuses multiplayer (private `soloXXXXXX` room + 3 NPCs).
- **KO Event system** — one fall event fans out to reactors (match stats, challenges, kill confirm, arena VFX, feed, announcer). See [scoring-event-system.md](../reference/scoring-event-system.md).
- **Living Store (shipped)** — Living Cargo (cart = scoreboard) + host-authored PA **directives** mid-round. As-built: [living-store.md](../reference/living-store.md).

### Recent work (July 9–10, 2026)

Highlights beyond the June/July refactors: progression unlocks; Sundial Station flagship + three-arena elevation; full HUD redesign (center stage, tokens, icons); gameplay feel pass; match-stat spine + charge glow + auto-quality; boot/load + half-res bloom + level LOD; **Living Store** (cargo + directives + review hardening). Full writeups in [completed-work.md](./completed-work.md). Session plans archived under [archive/session-notes/](../archive/session-notes/).

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation |
| `src/simulation.js` | Rapier physics (host) |
| `src/levels/` | Level definitions (classic, backrooms, zanzibar/Sundial) |
| `src/scoring/` | KO events, reactors, match stats |
| `src/cargoLoad.js` | Living Cargo bay/handling reconciler |
| `src/directives/` | Living Store directive table + host engine |
| `src/stores/unlockStore.js` / `unlockConfig.js` | Lifetime cosmetic + level unlocks |
| `src/announcer/` | "The Store PA" — arbitration, events, director, stings |
| `src/ui/centerStage.js` | HUD stage-band arbiter |
| `src/ui/icons.js` | Shared HUD SVG icons |
| `src/ui/styles/` | hud, pause, results, global, announcer, **tokens** |
| `src/utils/levelLod.js` | Distance-cull decorative props |
| `src/utils/autoQuality.js` | Session low-quality step-down |
| `party/index.ts` | partyserver Durable Object (relay + room state) |
| `tests/` | Vitest suite (currently 145 tests) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](../reference/Game_Architecture.md).

---

## 4. Current status

**Phases 1–3 largely complete; Phase 4 (Multiplayer & Infrastructure) is active.** What works today:

- **Core game** — fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction; solo mode (private `soloXXXXXX` room + NPCs) runs the same path.
- **Physics & feel** — convex-hull + primitive colliders across all three arenas; July 9 feel pass (hit feedback parity, hit-stop presentation, haptics, remote boost/hop FX).
- **Content** — three elevated arenas (Cart Rave / Classic Record, The Storerooms, Sundial Station); touch controls; daily/weekly challenges; lifetime cosmetic/level unlocks; personal-best tracking.
- **Presentation** — Store PA announcer; center-stage HUD redesign; production-value + visual-polish + feel passes (July 7–9).
- **Progression** — lifetime unlocks for patterns (incl. Bolt), sunglasses, custom color, and levels; mid-match unlock toasts; results challenge progress.
- **Living Store** — cargo bay tracks round score (spill-rush comeback, top-heavy grip); Store PA issues mid-round directives (Flash Sale / Double Bag / Express Lane / Spill Bonus / Rush Hour) with HUD chip + focus callouts.
- **Perf foundations** — lazy game music, Draco cart models, self-hosted fonts, half-res bloom, prop LOD, auto-quality watchdog, menu preview LOD.

**Next / open** (full plan in [ROADMAP.md](./ROADMAP.md)):

| Item | Status |
|------|--------|
| Multiplayer runtime smoke test (two browsers, one room) | ⬜ Pending — includes [Living Store netcode checklist](./living-store-test-plan.md) |
| Black-frame flicker triage | ⬜ Open plan — [plan-flicker-fix…](./plan-flicker-fix-and-classic-audit.md) |
| Menu overhaul + domain cutover | 🔧 In progress |
| Deeper performance pass (level swap / menu / profiling) | ⬜ Partial foundations shipped |
| Spill Bonus float/feed presentation | ⬜ Known follow-up (points award works; no dedicated float/feed line yet) |
| Persistent leaderboard (Supabase) | ⬜ Planned |

The full shipped log — including the Phase 4 bug-fix ledger — lives in [completed-work.md](./completed-work.md#phase-4-bug-fix-ledger).

---

## 5. Known issues

All primary high-priority bugs (host cart freeze, ready-up races, ready button redundancies, and alignment offsets) from the original playtests have been resolved. Stale known issues from the Jam era have been cleared.

Current validation / risk focus:

1. Multiplayer runtime integration smoke tests (two browsers, one room) — still the Phase 4 gate; Living Store paths deferred to [living-store-test-plan.md](./living-store-test-plan.md).
2. Intermittent black-frame flicker on some Windows + Chromium + NVIDIA stacks (environment-first investigation).
3. Evicting/resetting in-memory Durable Object state between server builds.

---

## 6. Dev workflow

| Context | Command | Doc |
|---------|---------|-----|
| `cart-clash` daily dev | `npm run dev:local` | [preview-dev.md](../guides/preview-dev.md) |
| Production local | `npm run dev` + `npm run dev:party` | [README.md](../README.md) |
| Deploy production | `npm run ship` | [deploy-urls.md](../guides/deploy-urls.md) |
| Full gate | `npm run check` | typecheck + test + knip |

**Dev unlocks:** Vite dev treats all cosmetics/levels as unlocked by default. Force real locks with `?devUnlocks=off` or `localStorage cartRaveDevUnlocks=off`. See `unlockConfig.js` header.

---

## 7. Historical context

This project shipped for **Cursor Vibe Jam 2026** (May 2026) as **Cart Rave**. Post-jam work continues on **`cart-clash`** under the product name **Cart Clash**.

- Session handovers: [handovers/](../archive/handovers/)
- July 2026 session plans (HUD, Sundial, feel): [session-notes/](../archive/session-notes/)
- Shipped feature log: [completed-work.md](./completed-work.md)

**Note:** `project-state.md` previously tracked jam deadline tasks and blocking bugs from April 2026. Those items are resolved or superseded by the Version 2 roadmap.
