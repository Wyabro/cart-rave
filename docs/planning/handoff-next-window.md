# Handoff — next agent window (Run 7 · NH-SMOOTH v3 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Ship code:** **`8c3ba22`**  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-wn0Z0cFw.js`** (build sha **`8c3ba22`**)  
**Read order:** dashboard → health.json → this → STATUS → AGENTS  

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / NET-PERF-2 / ko_path.  
**One card. Ship only on “ship it.”**  
**Note:** unstaged Claude harness/dashboard WIP may exist — do not `git add -A`.

---

## Active: NH-SMOOTH v3 — retest open

**Bar:** non-host driven cart glides (drive + combat).

| Ship | Bundle / sha | Result |
|------|----------------|--------|
| v1 | `34b240d` / `index-CaoV7WsD.js` | better, still janky |
| v2 | `af011cc` / `index-Czk-Iu0n.js` | **FAIL** cap-83 (gapMax 3478ms) |
| **v3** | **`8c3ba22` / `index-wn0Z0cFw.js`** | display-pose low-pass — **retest open** |

**v3 lever:** mesh+camera chase body (`displayPosRate` 14 / `displayRotRate` 12); hard snap only if lag ≥ maxCorrectionM.

### DO THIS NOW

1. Hard-refresh both → confirm `index-wn0Z0cFw.js`  
2. Joiner: drive + combat  
3. Pass → close; next NET-1  
4. Fail → F8 + pull → one lever  

### Closed

P0–P4 · NH-STATS · NH-BOOST  

### Paste

> Prod **`index-wn0Z0cFw.js`** / **`8c3ba22`**. Active: **NH-SMOOTH v3 retest**. Hard-refresh; joiner drive+combat pass/fail. Ship only on “ship it.”
