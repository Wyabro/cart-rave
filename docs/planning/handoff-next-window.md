# Handoff — next agent window (Run 7 · NH-SMOOTH v4)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod still:** **`index-wn0Z0cFw.js`** / **`8c3ba22`** (v3 — **FAIL** cap-84)  
**Local:** NH-SMOOTH **v4 coded unpushed** (spill≠dead hold fix)  
**Do not** `git add -A` — other agent tool WIP may be dirty.  
**Ship only on “ship it.”**

---

## Active: NH-SMOOTH v4

**Bar:** non-host glides **and** never freezes after tip/grocery spill.

| Ship | Result |
|------|--------|
| v1–v2 | partial / fail jank |
| v3 `8c3ba22` / `index-wn0Z0cFw.js` | **FAIL** cap-84 — 5s good → lag → **can't drive / circle** |
| **v4** unpushed | holdPrediction / death-reconcile **not** keyed off wire `s` |

### cap-84 truth

- Build `8c3ba22`, joiner, backrooms  
- `localDeadFlag` / snap.s **true**, **localDeaths 0**, pending **0**  
- Net clean (errMax 0.98m, gapMax 100)  
- Wire `s` = `hasSpilled` (tip-over + ram grocery + fall)  
- Hold used `s:true` as dead → stopped input sample → residual spin = circle  

### v4 lever (`gameLoop.js` only)

- `hostSaysDead` = shatter **or** `respawnAtMs` — **not** snap.s  
- Death hard-snap branch only when truly dead  
- Tip-spill keeps prediction + normal reconcile  

### DO THIS NOW

1. “ship it” → deploy  
2. Retest: tip/spill groceries **without** falling — must still drive  
3. Then combat + glide feel  
4. Fail → F8 + pull  

### Closed

P0–P4 · NH-STATS · NH-BOOST  
