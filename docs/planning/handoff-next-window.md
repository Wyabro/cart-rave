# Handoff — next agent window (post lever-3 PASS)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-DWDp_cX_.js`** / sha **`80ecbf6`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / HOST-ROLE-1 / NET-PERF-2 / ko_path without new evidence.  
**Ship only on Wyatt “ship it.”** Do not `git add -A`.

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH-STATS · NH-BOOST | ✅ |
| NH-SMOOTH | ✅ partial |
| **HOST-ROLE-1 / NH-HIT lever 3** | ✅ **PASS** `80ecbf6` / `index-DWDp_cX_.js` |
| NH-HIT lever 1 optimistic FX | shipped; **FAIL** live (caps 91–94) — residual structural delay |
| NET-1 | open (V2 gate) |

### Lever 3 (done)

Lobby rebalance to **stronger machine** (GPU/tier/cores/RAM score), not connection quality.  
Intel creates room → 4090 joins → host moves (Wyatt pass).

### Residual (if pursued)

Non-host hit delay when a strong peer already hosts: RTT + input jitter + 40Hz. Lever 1 presentation alone was not enough. No next lever assigned — Wyatt picks.

---

## DO THIS NOW

1. Wyatt names next card: **NET-1** · NH-HIT residual · P5/P6 · or other.  
2. One card only.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-DWDp_cX_.js`** / sha **`80ecbf6`**.  
> **P0–P4 + NH-STATS + NH-BOOST + HOST-ROLE-1 (lever 3) CLOSED.** NH-SMOOTH partial.  
> NH-HIT lever 1 FAIL residual (structural delay) parked unless named.  
> Next: Wyatt picks (NET-1 / residual / P5 / other). One card. Ship only on “ship it.” No `git add -A`.
