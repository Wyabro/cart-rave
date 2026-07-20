# Handoff — NET-1 S1 rematch spawn (coded unpushed)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod (still):** **`index-DWDp_cX_.js`** / **`80ecbf6`**  
**Local:** rematch spawn fix **unpushed** — **do not `git add -A`**

---

## Root cause

Quickplay rematch:
1. Host `rematchResetWorld()` → `host_spawn` on **old** arena ring  
2. Host rotates arena async (shader warm = multi-second snap gap)  
3. Host `rematchResetWorld()` again on **new** ring  
4. Non-host: mid-swap `host_spawn` applies then **collider rebuild wipes bodies**; no reapply → void/edge at GO  

## Fix (one lever)

- `onHostPlayAgainClick`: skip pre-rotation `rematchResetWorld` for quickplay  
- `rotateLoadedArenaInPlace` non-host: local seat + `reapplyCachedCartsSnapshot()`  
- Tests: `tests/rematchSpawnReapply.test.js`

## DO THIS NOW

1. Wyatt **“ship it”** → commit only S1 files → `npm run ship`  
2. Retest: quickplay rematch **×3** both clients — no edge death at GO; F8 if fail  

## Do not

- Multi-lever dump  
- Re-open NET-PERF-2 / NH-HIT residual  
