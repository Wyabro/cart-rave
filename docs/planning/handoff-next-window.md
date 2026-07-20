# Handoff — next agent window (post NET-1 S1 residual PASS)

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
| **NET-1 S1 residual (Run7 third-round edge)** | ✅ **PASS** `dc1bdac` / `index-BcDjbSZd.js` |
| NET-1 full gate | Soft-pass A+B core; join/leave/migration still open if pursued |

### Recent ships

| Sha | Bundle | What |
|-----|--------|------|
| `72227b7` | `index-DcKjB-hY.js` | Color/pattern live netSlots (PASS) |
| `dc1bdac` | **`index-BcDjbSZd.js`** | **S1 residual: spawn-tagged reapply (PASS)** |

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-PERF-2 · ko_path · NH-HIT residual · charge SFX · color/pattern MP · NET-1 S1 residual

---

## Open / pick next

| Option | Notes |
|--------|--------|
| **NET-1 residual** | Join/leave/migration/Living Store companions if full gate wanted |
| **P5 / P6** | Taste / tooling |
| **Named** | Whatever Wyatt says |

**NET-1 Match B note:** lever 3 always moves host to strong machine — weak-host isolation needs a force-host probe if retested.

---

## DO THIS NOW

1. Wyatt names next card (or stop).  
2. One card only.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BcDjbSZd.js`** / sha **`dc1bdac`**.  
> **Closed:** P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · charge SFX · rematch spawn S1 · color/pattern · S1 residual. NH-HIT residual parked. NH-SMOOTH partial.  
> **Next:** Wyatt names card (NET-1 residual, P5, or other).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
