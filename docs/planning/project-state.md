# Cart Clash — Project State (as-built)

**Last updated:** July 20, 2026  
**Branch:** `cart-clash` (active development) · `main` (production mirror)  
**Production:** https://cart-rave.wyabro.workers.dev/  
**Repo:** https://github.com/Wyabro/cart-rave  
**Naming:** Product is **Cart Clash**; Worker/host/storage IDs may still say `cart-rave` — see [brand.md](../brand.md).

> **This doc = as-built architecture and capability snapshot.** It does **not** own live
> phase, blockers, test totals, HEAD, or next actions — those live in [STATUS.md](../STATUS.md)
> (declared) and the generated Command Center (observed). Forward plans:
> [ROADMAP.md](./ROADMAP.md) + [BACKLOG.md](./BACKLOG.md). Shipped log: [completed-work.md](./completed-work.md).

---

## 1. Overview

Cart Clash is a browser-based **4-player physics sumo** game. Players drive neon shopping carts
on arena floors — a vinyl record ring (**Cart Rave**, jam tribute), a Backrooms supermarket
(**The Storerooms**), or a floating sundeck (**Sundial Station**, level id `zanzibar`). Ram
opponents off edges or into voids to score. Rounds last **150 seconds** (2.5 minutes).

**Version 2 goal:** Polished release with strong solo feel, three presentation-elevated arenas,
cosmetic/level progression, better performance, and a **domain cutover** after the naming
freeze in [brand.md](../brand.md).

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

**Tooling notes:** TypeScript stays on **6.x** (7.x deferred). Wrangler vs partyserver workers-types peer mismatch is handled by `.npmrc` `legacy-peer-deps=true`.

---

## 3. Architecture snapshot

- **Host-authoritative multiplayer** with client-side prediction for the local human cart (non-host).
- **4 cart slots** per room; empty slots filled by NPCs. Humans swap in by color pick.
- **Ready-up gate**: server broadcasts `gameStart` only when all humans are ready.
- **Levels**: `classicRecord` (default), `backrooms`, `zanzibar` — menu select, persisted in `localStorage` (`cartRaveLevel`); levels gated by lifetime unlocks (dev unlocks all by default).
- **Solo play** reuses multiplayer (private `soloXXXXXX` room + 3 NPCs).
- **KO Event system** — one fall event fans out to reactors (match stats, challenges, kill confirm, arena VFX, feed, announcer). See [scoring-event-system.md](../reference/scoring-event-system.md).
- **Living Store (shipped)** — Living Cargo (cart = scoreboard) + host-authored PA **directives** mid-round. As-built: [living-store.md](../reference/living-store.md).

### Capabilities present in the tree

- Progression unlocks; Sundial Station + three-arena elevation; HUD redesign; match-stat spine; Living Store; solo rubberband; netcode connection lifecycle hardening.
- Production passes 2–5 (quality, sticker UI, gameplay/AI, VFX/audio) + stabilization pass.
- Display-referred byte bloom default (VFX-1 closed); netcode unit punch list; Rapier SIMD opt-in only.
- Store PA recorded voice pack; diagnostics + gameplay E2E (`gameharness`); netcode 2-client harness; battery sweep; playtest console; observability + Command Center.

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levels/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation, host P2P maintain |
| `src/netcode/p2p.js` | WebRTC peers/DataChannels, ICE grace, TURN wait |
| `src/netcode/binary.js` | Host snapshot encode/decode (bounds-checked) |
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
| `party/roundValidation.ts` / `hostSelection.ts` | Unit-tested `host_round` validation + promote-oldest |
| `src/netcode/p2pLimits.js` | P2P DataChannel frame/tail size gates |
| `tests/` | Vitest suite (count drifts — trust `npm run qa`) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](../reference/Game_Architecture.md).  
Control-flow map before cross-module edits: [control-flow.md](../reference/control-flow.md).

---

## 4. What works today (capability, not status)

- **Core game** — host-authoritative multiplayer with client-side rewind-and-replay prediction; solo mode runs the same path.
- **Physics & feel** — convex-hull + primitive colliders; hit feedback, hit-stop, haptics, remote boost/hop FX; solo directional vignette + rubberband.
- **Content** — three elevated arenas; touch controls; daily/weekly challenges; lifetime unlocks; personal-best tracking.
- **Presentation** — Store PA announcer; center-stage HUD; Spill Bonus float/feed.
- **Living Store** — cargo bay tracks round score; mid-round directives with HUD + callouts.
- **Perf foundations** — lazy game music, Draco carts, self-hosted fonts, half-res bloom, prop LOD, auto-quality.
- **Tooling** — visual QA harness, netcode/gameplay harnesses, battery, dashboard/Command Center, capture + analytics.

Open work and phase exit criteria: [STATUS.md](../STATUS.md), [ROADMAP.md](./ROADMAP.md), [BACKLOG.md](./BACKLOG.md).

---

## 5. Verified healthy / non-issues

Static code + gate review items cleared so future agents do not re-investigate as open defects
without new evidence. Full table history lives in archive session notes; summary:

| Area | Verdict |
|------|---------|
| SD spectator per-frame KO spam | Fixed; regression tests cover fall-loop guard |
| Gameplay music dies after track 1 | Fixed |
| Lobby stuck on READY when non-host leaves | Fixed in `party/index.ts` |
| Customization partial save → magenta body | Fixed |
| Cart permanently wrong size after shatter | Fixed |
| Solo AI rubberband leaking into MP | Safe — solo-gated |
| Hop landing double-thud on non-host | Safe |
| Living Store directive restore on SD / leave | Safe |
| Directive one-shot / mid-join catch-up | Safe |
| First-solo cold-load racing idle-warm | Hardened |
| Near-edge ambient “danger telegraph” | Product cut — not a bug |
| Customize sunglasses “cart resize” | Deliberate camera zoom |
| Random arena rotation at rematch | Feature does not exist (not broken) |

Hazard catalog (open + closed IDs): [netcode-deep-dive.md](./netcode-deep-dive.md).

---

## 6. Dev workflow

| Context | Command | Doc |
|---------|---------|-----|
| `cart-clash` daily dev | `npm run dev:local` | [preview-dev.md](../guides/preview-dev.md) |
| Production local | `npm run dev` + `npm run dev:party` | [README.md](../README.md) |
| Deploy production | `npm run ship` | [deploy-urls.md](../guides/deploy-urls.md) |
| Full gate | `npm run qa` | typecheck + test + knip + health:check — same as CI |
| Visual QA | `npm run shoot` / `compare` / `blackframes` / `qa:visual` | [visual-qa.md](../guides/visual-qa.md) |
| Command Center | `npm run dashboard` | [observability.md](../guides/observability.md) |

**Dev unlocks:** Vite dev treats all cosmetics/levels as unlocked by default. Force real locks with `?devUnlocks=off` or `localStorage cartRaveDevUnlocks=off`.

---

## 7. Historical context

This project shipped for **Cursor Vibe Jam 2026** (May 2026) as **Cart Rave**. Post-jam work continues on **`cart-clash`** under the product name **Cart Clash**.

- Session handovers: [handovers/](../archive/handovers/)
- July 2026 session plans: [session-notes/](../archive/session-notes/)
- Shipped feature log: [completed-work.md](./completed-work.md)
- Playtest triage docs (historical / superseded by Run 7 close): [playtest-triage-2026-07-17.md](./playtest-triage-2026-07-17.md) et al.
