# Cart Rave — Project State

**Last updated:** July 7, 2026  
**Phase:** 4 — Multiplayer & Infrastructure (post-jam, working toward Version 2)  
**Branch:** `next-level` (active development) · `main` (production)  
**Production:** https://cart-rave.wyabro.workers.dev/  
**Repo:** https://github.com/Wyabro/cart-rave

---

## 1. Overview

Cart Rave is a browser-based **4-player physics sumo** game. Players drive neon shopping carts on arena floors — a vinyl record ring (Classic), a Backrooms supermarket (Backrooms), or a floating sundeck (Zanzibar Platform). Ram opponents off edges or into voids to score. Rounds last **150 seconds** (2.5 minutes).

**Version 2 goal:** Polished release with new content (including Zanzibar Platform level), better performance, touch controls, daily/weekly challenges, and a **new name + domain**. See [ROADMAP.md](./ROADMAP.md) for prioritized work.

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

- `src/bootstrap.js` — menu → gameplay flow extracted from `main.js`
- `src/levelManager.js` — level preview + swapping extracted from `main.js`
- Knip cleanup: unused exports reduced and codebase hardened
- 100% Type safety achieved under `npx tsc --noEmit`
- CSS extraction: ~2600 lines of inline CSS moved from `hud.js`, `pauseOverlay.js`, `resultsOverlay.js` to dedicated stylesheets in `src/ui/styles/` (hud.css, pauseOverlay.css, results.css, global.css)
- `.cursorrules` cleaned up (~200 lines removed, simplified guardrails)
- `tests/p2p-signaling.test.js` added for WebRTC signaling test coverage
- `main.js` remains the thin orchestrator and wiring hub

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation |
| `src/simulation.js` | Rapier physics (host) |
| `src/levels/` | Level definitions (classic, backrooms, zanzibar) |
| `src/ui/styles/` | Extracted UI stylesheets (hud, pause, results, global) |
| `party/index.ts` | partyserver Durable Object (relay + room state) |
| `tests/` | Test files (Vitest) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](./Game_Architecture.md).

---

## 4. Current phase progress

### Phase 2 — Polish & Balance ✅ Complete

NPC AI, ramming, collision feedback, boost streaks, audio polish, hole rim behavior, nitro balance.

### Phase 3 — Content & Features ✅ Complete

| Item | Status |
|------|--------|
| Backrooms Supermarket level | ✅ Shipped |
| Touch controls (joystick + Boost/Hop) | ✅ Shipped |
| Daily/Weekly Challenges | ✅ Shipped |
| Level 3: Zanzibar Platform | ✅ Shipped |
| Cosmetic Progression / Unlock Path | ⬜ Planned |
| Evaluate WebGPU Compute Shaders | ⬜ Planned |
| Spectator / chaos features | ⬜ Stretch |

### Phase 4 — Multiplayer & Infrastructure (active)

| Item | Status |
|------|--------|
| Combo decay order-of-operations race fix | ✅ Fixed |
| Grocery spill pending queue (async load window) | ✅ Fixed |
| Server-authoritative level sync via MSG.round | ✅ Fixed |
| Slot kind nullish coalescing fix (human vs NPC label) | ✅ Fixed |
| Results UI cleanup (NEXT LEVEL removal, PLAY AGAIN rename) | ✅ Fixed |
| CargoBay visibility sync via hostTransform | ✅ Fixed |
| Non-host death shatter VFX wiring | ✅ Fixed |
| Booth snap at countdown (clean round reset) | ✅ Fixed |
| Mid-round join cart teleport (NPC→human) | ✅ Fixed |
| Rate limit exemption for high-freq messages | ✅ Fixed |
| Ram streak VFX on non-host clients | ✅ Fixed |
| hasSpilled state sync via hostTransform | ✅ Fixed |
| Remote boost instant VFX on non-host | ✅ Fixed |
| Kill feed color CSS hex conversion | ✅ Fixed |
| Shatter ref dual-path resolution (module + callback) | ✅ Fixed |
| Respawn visual cleanup (shatter debris + mesh rebuild) | ✅ Fixed |
| Respawn cleanup simplified to single cleanupShatter call | ✅ Fixed |
| Death shatter color hex parsing hardened | ✅ Fixed |
| Host respawn resets hasSpilled + cargoBay state | ✅ Fixed |
| cargoBay lookup by name (resilient getObjectByName) | ✅ Fixed |
| Scene bridge wiring (getSceneRef/getScene/getShatterRef) | ✅ Fixed |
| Shatter hex & 0xffffff bitmask clamping | ✅ Fixed |
| Netcode DRY refactor (applyCartState + serializeCartToWire) | ✅ Fixed |
| Pause/Esc overlay extracted to pauseOverlay.js | ✅ Fixed |
| @ts-expect-error cleanup (cartRaveGltf, cartThemes) | ✅ Fixed |
| Level select Zustand sync (menu + levelManager) | ✅ Fixed |
| Force-clear shatter state on respawn | ✅ Fixed |
| hud getter to avoid stale ref in context injection | ✅ Fixed |
| Null cart guard in updateRemoteCartNetTargets | ✅ Fixed |
| Boost state force-sync from wire (isRamBoosting/isBoosting) | ✅ Fixed |
| Slot 1 debug logging (send/receive state monitor) | ✅ Added |
| Self-contained shatter VFX lifecycle (isShatterAnimating + doRespawnRef) | ✅ Fixed |
| Audio controls extraction (audioControls.js, ~90 lines from main.js) | ✅ Fixed |
| Graphics toggles extraction (graphicsToggles.js, remove window globals) | ✅ Fixed |
| 100% typecheck compliance (0 errors under `npx tsc --noEmit`) | ✅ Verified |
| CSS extraction refactor (inline CSS → `src/ui/styles/`) | ✅ Fixed |
| P2P signaling test coverage (`tests/p2p-signaling.test.js`) | ✅ Added |
| Multiplayer runtime smoke test (two browsers, one room) | ⬜ Pending |
| Persistent leaderboard (Supabase) | ⬜ Planned |

### Version 2 prep (see ROADMAP Tier 3–4)

Performance pass, codebase type resolution, `main.js` further slimming, menu overhaul + rename/domain.

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
| `next-level` daily dev | `npm run dev:next-level` | [preview-dev.md](./preview-dev.md) |
| Production local | `npm run dev` + `npm run dev:party` | [README.md](./README.md) |
| Deploy production | `npm run ship` | [deploy-urls.md](./deploy-urls.md) |

---

## 7. Historical context

This project shipped for **Cursor Vibe Jam 2026** (May 2026). Post-jam work continues on `next-level`.

- Session handovers: [handovers/](./handovers/)
- Shipped feature log: [todo.md](./todo.md) (historical record)

**Note:** `project-state.md` previously tracked jam deadline tasks and blocking bugs from April 2026. Those items are resolved or superseded by the Version 2 roadmap.
