# Cart Clash — Todo & Status Snapshot

**Last Updated:** July 8, 2026

> **Forward-looking work** is tracked in [ROADMAP.md](./ROADMAP.md).  
> **Historical/completed work** lives in [completed-work.md](./completed-work.md). When something ships, move its writeup there rather than adding it back here.  
> This file preserves phase snapshot and current-status headlines.

---

## Current Status

- **Core Game**: Fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction.
- **Physics & Feel**: Major stability overhaul complete. Convex-hull + primitive colliders across all three arenas. Mobile performance significantly improved.
- **Current Phase**: Phase 4 — Multiplayer & Infrastructure (active); Phase 3 content is complete.
- **Latest passes (July 7–8, 2026)**: Announcer system ("The Store PA"), visual polish, production value pass, production-readiness audit, WebRTC signaling root-cause fix. Full details in [completed-work.md](./completed-work.md).
- **Modular Structure**: Core systems live in `src/`; `main.js` remains the thin orchestrator.

---

## Active Work

Prioritized Phase 3 and Version 2 work is maintained in **[ROADMAP.md](./ROADMAP.md)** (Tier 1 through Tier 4).

**Quick snapshot of open Phase 3 items:**
- More cart customization options
- Spectator mode / chaos features (stretch)

---

## Library Adoption (Version 2)

Intentional stack improvements — full priorities and effort estimates in [ROADMAP.md](./ROADMAP.md) (Tier 1 and Tier 3).

| Library | Tier | Purpose |
|---------|------|---------|
| `nipplejs` | 1 | Virtual joystick for touch/mobile controls |
| `tweakpane` | 1 | Modern replacement for `lil-gui` |
| `zustand` | 1 | Lightweight state management (reduce global state coupling) |
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

### Phase 3 — Content & Features ✅ Completed
- ✅ Backrooms Supermarket level shipped
- ✅ Touch controls support (joystick + Boost/Hop via nipplejs)
- ✅ Daily/Weekly Challenges system shipped
- ✅ Level 3: Zanzibar Platform (sunset ocean arena) shipped
- More cart customization options *(Planned)*
- Spectator mode / chaos features *(Stretch)*

### Phase 4 — Netcode & Technical Polish
See [ROADMAP.md](./ROADMAP.md) Tier 3 for current priorities (client prediction, lag mitigation, rave area redesign, audio upgrade, etc.).

### Phase 5 — Release Prep (Version 2)
See [ROADMAP.md](./ROADMAP.md) Tier 4 for release priorities, including:
- Menu overhaul + new name/domain
- Performance optimization pass
- Pre-submission checklist

---

## Completed / Shipped

The full chronological log of shipped work — dated writeups from June 29, 2026 through the current session, plus the pre-June 2026 foundation list — has been consolidated into **[completed-work.md](./completed-work.md)**.

**When something ships:** add the writeup to completed-work.md, not here.

---

## Notes

- Phase 2 is complete. Phase 3 is complete. Phase 4 is active.
- Session handovers archived under [handovers/](./handovers/).
- For the current prioritized roadmap and next steps, use **[ROADMAP.md](./ROADMAP.md)**.
- This file is maintained as a current-status snapshot; historical detail lives in [completed-work.md](./completed-work.md).

---

**Last Updated:** July 8, 2026
