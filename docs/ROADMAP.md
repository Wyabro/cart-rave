# Cart Rave — Roadmap & Future Plan (Version 2)

**Last Updated:** June 25, 2026  
**Goal:** Ship Version 2 — Polished game with new content, better performance, new name, and new domain.

> **Status snapshot & shipped history:** [todo.md](./todo.md)  
> This file is the single source of truth for **prioritized next steps**.

---

## Current Status (June 2026)

- **Core Game**: Fully playable host-authoritative multiplayer with client-side prediction
- **Physics & Feel**: Version 1 driving core restored + tipping tuned. Ramming, boost, and collision feedback in good shape.
- **Phase**: Content & Features — Backrooms level shipped, touch controls in progress
- **Recent Technical Work**: Major cleanup pass + extraction of `bootstrap.js` and `levelManager.js`
- **Modular Structure**: Core systems extracted to `src/`; `main.js` remains the live entry point

---

## Recent Progress (June 25 Session)

- Major unused export cleanup via Knip (98 → 19)
- Slimmed `customization.js` and cleaned up `netcode.js`
- Extracted `src/bootstrap.js` (menu → gameplay flow)
- Extracted `src/levelManager.js` (level preview + swapping)
- `main.js` significantly reduced in size

---

## Prioritized Roadmap (Ordered by Difficulty / Time)

### Tier 1 — Quick Wins & Stabilization (Do These First)

| Priority | Task | Effort | Notes |
|----------|------|--------|-------|
| 1 | Stabilize lobby / ready-up flows (including refresh race conditions) | Low | High impact on reliability |
| 2 | Color selection gating improvements | Low | Prevents bad states |
| 3 | Rounds / results polish | Low-Medium | Better player experience |
| 4 | Tie-handling correctness (all-zero outcomes, deterministic bias) | Low-Medium | Important for fairness |
| 5 | Non-host lifecycle edge cases (respawn, fall handling) | Low-Medium | Fixes edge case bugs |
| 6 | Add `nipplejs` for virtual joystick / touch controls | Low | Battle-tested mobile joystick; replaces custom DOM joystick in `touchControls.js` |
| 7 | Add `tweakpane` to replace `lil-gui` | Low | Modern dev/debug UI for post-FX and graphics tuning (`postFxDebug.js`) |
| 8 | Add `zustand` or `valtio` for lightweight state management | Low-Medium | Centralize `menuVisible`, level/preview mode, and other globals; unlocks `main.js` slimming |
| 9 | More cart customization options | Medium | Expand beyond current system |
| 10 | Spilling cart contents on knockover | Medium | Fun VFX polish |

### Tier 2 — Content & New Features

| Priority | Task | Effort | Notes |
|----------|------|--------|-------|
| 11 | Mobile / touch controls support | Medium | Already in progress; pair with `nipplejs` adoption (Tier 1) |
| 12 | Level 3: Zanzibar Platform | High | Tropical beach sci-fi level. Platform out in the ocean (Halo Zanzibar inspired) |
| 13 | Crazy Carts mode (solo 8 NPCs) | Medium-High | New single-player mode |
| 14 | Persistent leaderboard using Supabase | High | Online progression feature |
| 15 | Spectator mode / chaos features | High | Stretch content |

### Tier 3 — Technical Polish & Performance

| Priority | Task | Effort | Notes |
|----------|------|--------|-------|
| 16 | Lag mitigation tuning (interpolation buffer, non-host feel) | Medium | Improves perceived smoothness |
| 17 | Client prediction improvements (if needed) | Medium | Evaluate after playtesting |
| 18 | Redesign Cart Rave "rave" area (stage, crowd, lasers, billboard) | High | Much better looking + significantly more performance friendly |
| 19 | Further slim `main.js` (Phase 3 of refactor) | Medium | Reduce `menuVisible` coupling; pairs with state-management adoption (Tier 1) |
| 20 | Move low-level `loadLevel()` fully into `levelManager.js` | Medium | Completes level ownership |
| 21 | Performance optimization pass | High | Especially level swapping + rapid menu preview |
| 22 | Better lag compensation | Medium-High | — |
| 23 | Add `howler.js` for audio system upgrade | Medium | Spatial audio, sound pooling, and cleaner volume/group management vs. current Web Audio glue |

### Tier 4 — Release Prep (Version 2)

| Priority | Task | Effort | Notes |
|----------|------|--------|-------|
| 24 | Menu overhaul + new name/domain | High | Rename game to something sexier/more marketable + new domain (abandon cartrave.lol) |
| 25 | Subtle in-game monetization / ads | Medium | — |
| 26 | Pre-submission checklist | Medium | Final QA, logs, polish |
| 27 | Explore server-authoritative options | High | Long-term technical direction |
| 28 | Final QA and cleanup pass before submission | Medium | — |

---

## Notes

- Items are ordered roughly by **estimated effort + dependencies**.
- Tier 1 items should give the biggest stability and polish wins with relatively low effort.
- **Library adoption** (`nipplejs`, `tweakpane`, `zustand`/`valtio`, `howler.js`) is intentional stack modernization toward Version 2 — not drive-by deps.
- Level 3 (Zanzibar) and the rave area redesign are the two biggest visual/content efforts.
- Rename + new domain is treated as a core part of the Version 2 release.
- User will review and adjust priorities as needed.

---

**Next Review Date:** After touch controls + first few Tier 1 items

See also [todo.md](./todo.md) for phase history and the completed/shipped record.
