# Handoff — next agent window (HUD-MENU-1 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-DhaNywQc.js`** / sha **`8d904de`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.

---

## Where we landed

| Card | Verdict |
|------|---------|
| CAM-1 host camera | ✅ PASS `5fade5b` / `index-0O6jq9wn.js` |
| **HUD-MENU-1** menu HUD leftovers | ✅ **shipped** `8d904de` / `index-DhaNywQc.js` — ▶️ **retest** |
| LS-1 · RC-1 A/C · NET-1 residual | ✅ |

### HUD-MENU-1 (in prod)

`hideGameplayElements` now clears splash, directive chip, toast/stage, score floats, hitmarker, status residue, edge flash, score doodads. `initMenu` also `clearActiveDirective` + `stopAnnouncer`. `resetStage` calls occupant `hide()`.

Gates: qa typecheck + **1192** tests + knip. Served: `index-DhaNywQc.js`.

### Do not re-open without new evidence

CAM-1 · HUD-MENU-1 code (unless retest FAIL) · LS-1 · RC-1 A/C · NET-1 residual

---

## DO THIS NOW

1. Hard refresh → confirm **`index-DhaNywQc.js`**.  
2. Multi-quickplay: leave mid-countdown, mid-directive, mid-KO → title must be clean (no SUNDIAL plate, no directive chip, no +score float, no PA plate).  
3. Report pass/fail.

---

## Suggested paste

> Branch `cart-clash`. Prod **`index-DhaNywQc.js`** / **`8d904de`**.  
> **Closed:** CAM-1 PASS · HUD-MENU-1 **shipped**. **Active:** HUD-MENU-1 retest.  
> Ship only on “ship it.” Do not `git add -A`.
