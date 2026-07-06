# Post-jam ideas

> Many items below are now tracked in [ROADMAP.md](./ROADMAP.md). This file is kept as a lightweight idea scratchpad.

## Gameplay / VFX
- ~~Spilling cart contents on knockover.~~ ✅ **Shipped** (July 2026 — grocery spill VFX, `src/effects/groceryPool.js`).

## Online / Progression
- Persistent leaderboard (Supabase).

## Menu / UX
- Drivable main menu with portals for mode selection.

## Gemini performance notes
- Draw-call reduction: merge static meshes via `BufferGeometryUtils.mergeGeometries`; keep dynamic objects separate.
- Damping: prefer exponential decay form (stable across dt) instead of linear per-frame damping.
- Non-host feel: client-side prediction to reduce input lag, with server reconciliation.
- Net smoothing: interpolation buffer tuning (trade latency vs jitter).
