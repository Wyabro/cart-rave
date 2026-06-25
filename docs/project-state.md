# Cart Rave — Project State

**Last updated:** June 25, 2026  
**Phase:** 3 — Content & Features (post-jam, working toward Version 2)  
**Branch:** `next-level` (active development) · `main` (production)  
**Production:** https://www.cartrave.lol/  
**Repo:** https://github.com/Wyabro/cart-rave

---

## 1. Overview

Cart Rave is a browser-based **4-player physics sumo** game. Players drive neon shopping carts on arena floors — a vinyl record ring (Classic) or a Backrooms supermarket (Backrooms). Ram opponents off edges or into voids to score. Rounds last **60 seconds**.

**Version 2 goal:** Polished release with new content (including Zanzibar Platform level), better performance, a redesigned rave area, touch controls, and a **new name + domain**. See [ROADMAP.md](./ROADMAP.md) for prioritized work.

---

## 2. Stack & build

| Layer | Technology |
|-------|------------|
| Rendering | Three.js (`src/`, Vite-bundled) |
| Physics | Rapier3D (host-authoritative, client-side only) |
| Multiplayer | PartyKit relay (`party/index.ts`) |
| Build | Vite → `dist/` |
| Hosting | Vercel (client) + PartyKit (worker) |

**No server-side physics.** The PartyKit server relays messages only.

---

## 3. Architecture snapshot

- **Host-authoritative multiplayer** with client-side prediction for the local human cart (non-host).
- **4 cart slots** per room; empty slots filled by NPCs. Humans swap in by color pick.
- **Ready-up gate**: server broadcasts `gameStart` only when all humans are ready.
- **Levels**: `classicRecord` (default), `backrooms` — selected in menu, persisted in `localStorage` (`cartRaveLevel`).
- **Solo play** reuses multiplayer (private `soloXXXXXX` room + 3 NPCs).

### Recent refactor (June 2026)

- `src/bootstrap.js` — menu → gameplay flow extracted from `main.js`
- `src/levelManager.js` — level preview + swapping extracted from `main.js`
- Knip cleanup: unused exports reduced (98 → 19)
- `main.js` remains the live entry point and wiring hub

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation |
| `src/simulation.js` | Rapier physics (host) |
| `src/levels/` | Level definitions |
| `party/index.ts` | PartyKit Durable Object (relay + room state) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](./Game_Architecture.md).

---

## 4. Current phase progress

### Phase 2 — Polish & Balance ✅ Complete

NPC AI, ramming, collision feedback, boost streaks, audio polish, hole rim behavior, nitro balance.

### Phase 3 — Content & Features (active)

| Item | Status |
|------|--------|
| Backrooms Supermarket level | ✅ Shipped |
| Touch controls (joystick + Boost/Hop) | 🔄 In progress |
| More cart customization | ⬜ Planned |
| Level 3: Zanzibar Platform | ⬜ Planned |
| Spectator / chaos features | ⬜ Stretch |

### Version 2 prep (see ROADMAP Tier 3–4)

Performance pass, rave area redesign, `main.js` further slimming, menu overhaul + rename/domain.

---

## 5. Known issues

From `.cursorrules` and recent playtesting — not an exhaustive bug list:

1. **Host cart visually frozen** on host screen after color pick or host migration (suspected slot/connId mismatch).
2. **Solo mode stat tracking** in menu needs verification.
3. **Record label and crowd cart Y-offsets** may need adjustment.
4. **Cart handle color** not reliably black.
5. **Ready button redundancy** — "Ready" and "Ready!" buttons overlap functionally.
6. **Lobby/ready-up refresh races** — Tier 1 on [ROADMAP.md](./ROADMAP.md).

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

- Session handovers: [handovers/](./handovers/) (Sessions 8–14, jam-era)
- Scoring audit: [audits/step-10a-scoring-audit.md](./audits/step-10a-scoring-audit.md)
- Shipped feature log: [todo.md](./todo.md) (historical record)

**Note:** `project-state.md` previously tracked jam deadline tasks and blocking bugs from April 2026. Those items are largely resolved or superseded by the Version 2 roadmap.
