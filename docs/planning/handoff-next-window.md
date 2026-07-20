# Handoff — next agent window (Run 7 · NH-BOOST)

**Date:** 2026-07-20  
**Ship in prod:** still **`b92d87f`** / **`index-BgZqxXtu.js`** until next ship  
**Local HEAD:** NH-BOOST fix **unpushed** (or unshipped)  
**Active card:** **NH-BOOST** — non-host boosts not visible · bar dead · charge SFX loops  

**Do not** re-open P0–P4 / NH-STATS / NET-PERF-2 / ko_path without new evidence.  
**Ship only on Wyatt “ship it.”**

---

## Closed

| Card | Verdict |
|------|---------|
| P0–P4 | ✅ closed this session |
| NH-STATS | ✅ PASS `b92d87f` / `index-BgZqxXtu.js` |

---

## Active: NH-BOOST (unpushed fix ready)

### Symptoms (Wyatt)
- Non-host boosts not visible  
- Boost bar not working  
- Boost SFX plays on repeat  

### Root causes (code-verified)

1. **Wire `b` always false on host** — `serializeCartToWire` read `isRamBoosting`/`isBoosting` which host never sets; trails need `ramBoostActiveUntilMs`. Non-hosts never got rising-edge `onRemoteBoostStart` or 150ms timer extend.  
2. **Nitro sample omitted gamepad** — `isNitroHeld` lacked `gamepadBoostHeld`; non-host prediction `boostHeld` false while charge SFX started from rising-edge onBoost.  
3. **Reconcile orphaned chargeUp** — replay set `onBoostRelease`/`onBoostCancel` to null → charge completed without stopping loop; re-press stacked loops.

### Fix files
- `src/netcode.js` — serialize `b` from timer; sample nitro from `axis.boostHeld`  
- `src/input.js` — `isNitroHeld` includes gamepad  
- `src/gameLoop.js` — reconcile stopChargeSfx only  
- `src/main.js` — stop orphaned charge before re-play; wire deps  
- `tests/netcode.test.js` — serializeCartToWire b from timer  

### Gates last run
**561** tests / **57** files · typecheck · knip clean  

### DO THIS NOW
1. Wyatt: **ship it** → push + deploy.  
2. Retest as **non-host**: charge bar fills, trails on self + peers, charge SFX stops on release, no loop.  
3. F8 both sides mid-boost if fail.

---

## Paste

> Prod still `index-BgZqxXtu.js` until ship. **NH-BOOST** unpushed fix ready (wire b + nitro sample + charge SFX). Ship only on “ship it.”
