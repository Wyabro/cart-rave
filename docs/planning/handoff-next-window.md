# Handoff — next agent window (HUD-MENU-1 ready to ship)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-0O6jq9wn.js`** / **`5fade5b`** (CAM-1 PASS)  
**Local (unpushed):** HUD-MENU-1 full menu-HUD audit  
**Ship only on Wyatt “ship it.”** Do not `git add -A`.

---

## CAM-1

✅ **PASS** on prod.

## HUD-MENU-1 — why leftovers happen

Two paint paths stop on menu:

1. `HUD.update()` early-returns when `menuVisible`  
2. Game loop `shouldSkipTiming` → no `frameVisuals` / `setHudDirective` / hit-vignette tick  

Anything mid-window/mid-animation must be cleared in `hideGameplayElements()` (+ `initMenu` extras).

### Audit (after splash + directive repros)

| Element | Sticky risk | Cleared now |
|---------|-------------|-------------|
| timer / scores / ready / status | was OK | yes |
| combo / boost / conn / feed | was OK | yes (+ feed anim cancel) |
| edge danger / hit flash | was OK | yes (full zero) |
| **arena splash** | high (reported) | yes |
| **directive chip** | high (reported) | yes |
| **score floats** | med (mid-KO leave) | yes — remove DOM |
| **hitmarker** | med | yes — drop `.hit` |
| **challenge toast** | med | yes — + `resetStage()` calls hide |
| status residue (SD/MP/GO classes) | low | yes |
| score-chip pip/crown/dizzy | low (parent hidden) | yes |
| **PA callout** | med | `stopAnnouncer()` in initMenu |
| **directive CONFIG mutators** | med | `clearActiveDirective()` in initMenu |

---

## DO THIS NOW

On “ship it”: `npm run qa` → commit HUD-MENU-1 files → `npm run ship` → hard refresh → multi-quickplay leave mid-countdown / mid-directive / mid-KO → clean menu.

---

## Suggested paste

> Branch `cart-clash`. Prod until ship: `index-0O6jq9wn.js` / `5fade5b`.  
> **Closed:** CAM-1 PASS. **Active:** HUD-MENU-1 unpushed (full menu HUD clear). Ship only on “ship it.”
