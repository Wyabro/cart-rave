# Cart Rave — Todo & Historical Record

**Last Updated:** June 25, 2026

> **Forward-looking work** is tracked in [ROADMAP.md](./ROADMAP.md).  
> This file preserves phase history, shipped features, and current status.

---

## Current Status

- **Core Game**: Fully playable host-authoritative multiplayer with client-side prediction
- **Physics & Feel**: Version 1 driving core restored + tipping tuned. Ramming, boost, and collision feedback in good shape.
- **Current Phase**: Phase 3 — Content & Features (Backrooms level shipped, touch controls in progress)
- **Recent Technical Work**: Major cleanup + extraction of `bootstrap.js` and `levelManager.js` (menu → game flow and level handling now better separated from `main.js`)
- **Modular Structure**: Core systems live in `src/`; `main.js` remains the thin orchestrator

---

## Active Work

Prioritized Phase 3 and Version 2 work is maintained in **[ROADMAP.md](./ROADMAP.md)** (Tier 1 through Tier 4).

**Quick snapshot of open Phase 3 items:**
- Touch controls polish (in progress)
- More cart customization options
- Level 3: Zanzibar Platform (tropical beach sci-fi, platform out in ocean)
- Spectator mode / chaos features (stretch)

---

## Library Adoption (Version 2)

Intentional stack improvements — full priorities and effort estimates in [ROADMAP.md](./ROADMAP.md) (Tier 1 and Tier 3).

| Library | Tier | Purpose |
|---------|------|---------|
| `nipplejs` | 1 | Virtual joystick for touch/mobile controls |
| `tweakpane` | 1 | Modern replacement for `lil-gui` |
| `zustand` or `valtio` | 1 | Lightweight state management (reduce global state coupling) |
| `howler.js` | 3 | Spatial audio, pooling, and volume/group management |

---

## Phase History

### Phase 2 — Polish & Balance ✅ Completed
- NPC AI improvement
- Ramming force & boosted ramming tuning
- Collision feedback (particles, screen shake)
- Boost streaks and audio polish
- Hole rim behavior (smooth tipping/sliding)
- Final boost/nitro balance pass

### Phase 3 — Content & Features (Active)
- ✅ Backrooms Supermarket level shipped
- Touch controls support (base implementation done, polish ongoing)
- More cart customization options *(open)*
- Level 3: Zanzibar Platform *(planned)*
- Spectator mode / chaos features *(stretch)*

### Phase 4 — Netcode & Technical Polish
See [ROADMAP.md](./ROADMAP.md) Tier 3 for current priorities (client prediction, lag mitigation, rave area redesign, audio upgrade, etc.).

### Phase 5 — Release Prep (Version 2)
See [ROADMAP.md](./ROADMAP.md) Tier 4 for release priorities, including:
- Menu overhaul + new name/domain
- Performance optimization pass
- Pre-submission checklist

---

## Completed / Shipped (Historical Record)

### Core Multiplayer & Foundation
- Full modular refactor (`main.js` as thin orchestrator + `src/` modules)
- PartyKit server + client handshake + host migration
- Multiplayer sync for human carts (host-authoritative)
- NPC fill for empty slots + slot sync
- Username system + color picker
- Round structure + HUD (countdown / running / podium)
- Results screen + Play Again + exit portal
- Main menu shell + mode routing (Solo / Quickplay / Friends)
- Friend flow + personal stats
- Portal system (exit + return portals)
- Ready-Up system

### Visuals & Environment
- Procedural cart models with caster wheels
- Spawn booths redesign
- Ground plane, pit wall, crowd silhouettes, main stage
- Skybox (stars, nebula, UFOs, planets, horizon fog)
- Crowd lighting + searchlights + point lights
- Stage lasers, fog, ambient light, spindle light
- Record label, void wall gradient, leader glow
- Vibe Jam billboard + in-world exit portal
- Esc overlay + menu integration

### Physics & Gameplay Feel
- Physics tuning (restitution, angularDamping, maxPitchRoll)
- Version 1 driving core restored + tipping behavior
- Ramming system + boosted ramming
- Collision particles, screen shake, trash bursts
- Nitro boost system + visual/audio feedback
- Wheel screech, hop, fall-off, nitro SFX
- Real cart crash sound sample

### Polish & Quality of Life
- Touch controls (in-game) + rotate prompt for mobile
- Mobile detection (replaces old desktop-only blocking)
- Audio system (separate music/SFX volume, procedural SFX)
- Kill feed, score bar, HUD overhaul
- Stats tracking + match history
- Performance fixes (menu perf, refresh stutter, etc.)
- Bug fixes across many sessions (ghost carts, host migration, etc.)
- Console log cleanup + dead code removal
- `bootstrap.js` and `levelManager.js` extracted from `main.js` (June 2026)

### Recent Technical Improvements (June 2026)
- Major dead code + unused export cleanup (Knip)
- `bootstrap.js` extraction (menu → play flow)
- `levelManager.js` extraction (level preview + swapping)

### Stretch / Deferred Ideas
Tracked in [ROADMAP.md](./ROADMAP.md) and [post-jam-ideas.md](./post-jam-ideas.md) — e.g. Crazy Carts mode, Supabase leaderboard, cart faces, audio-reactive crowd.

---

## Notes

- Phase 2 is complete. Phase 3 is active.
- Session handovers archived under [handovers/](./handovers/).
- For the current prioritized roadmap and next steps, use **[ROADMAP.md](./ROADMAP.md)**.
- This file is maintained as a historical record and status snapshot.
