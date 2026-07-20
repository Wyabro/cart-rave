# Handoff — next agent window (NH-HIT parked · pick next)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-DWDp_cX_.js`** / sha **`80ecbf6`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / HOST-ROLE-1 / NET-PERF-2 / ko_path / **NH-HIT residual** without Wyatt naming it.  
**Do not** start **NET-1** as the default next card — run it near last after behavior churn.  
**Ship only on Wyatt “ship it.”** Do not `git add -A`.

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH-STATS · NH-BOOST | ✅ |
| NH-SMOOTH | ✅ partial |
| **HOST-ROLE-1 / lever 3** | ✅ **PASS** `80ecbf6` / `index-DWDp_cX_.js` |
| NH-HIT lever 1 + residual feel | 🧊 **parked** — not 100% happy; move on |
| NET-1 | open — **near last** |

---

## DO THIS NOW

1. Wyatt names next card (examples: READY-SET human MP check, NET-2 feel, P5, or other).  
2. One card only. Not NET-1 by default. Not NH-HIT unless named.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-DWDp_cX_.js`** / sha **`80ecbf6`**.  
> **P0–P4 + NH-STATS + NH-BOOST + HOST-ROLE-1 CLOSED.** NH-SMOOTH partial. **NH-HIT residual parked** (not 100% — no more levers unless named).  
> **NET-1 near last** after churn. Next: Wyatt names card. One at a time. Ship only on “ship it.” No `git add -A`.
