# Handoff — next agent window (post NET-1 S1 residual ship)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-BcDjbSZd.js`** / sha **`dc1bdac`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 (lever 3) | ✅ |
| NH-SMOOTH | ✅ partial |
| NH-HIT residual | 🧊 parked |
| Charge SFX · color/pattern MP | ✅ PASS |
| NET-1 S1 rematch spawn (first ship) | ✅ `2a6d9ae` |
| **NET-1 S1 residual (Run7 third-round edge)** | ✅ **shipped** `dc1bdac` / `index-BcDjbSZd.js` — **retest open** |

### Run7 decode (brief)

- Match A: 4090 host; soft-pass; anomaly = non-host edge spawn death on third rematch.
- Match B: HOST-ROLE-1 moved host to 4090 → not a weak-host sample.
- Lever: `reapplyCachedCartsSnapshot` only uses spawn-tagged `lastCartsCache` (not stale live snaps).

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-PERF-2 · ko_path · NH-HIT residual · charge SFX · color/pattern MP

---

## DO THIS NOW

1. Wyatt retests 3+ quickplay rematches (non-host no edge death).  
2. Pass/fail → next card.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BcDjbSZd.js`** / sha **`dc1bdac`**.  
> **Closed:** P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · charge SFX · color/pattern · S1 first ship.  
> **Open retest:** NET-1 S1 residual (spawn-tagged reapply).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.
