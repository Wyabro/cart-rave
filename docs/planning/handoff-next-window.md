# Handoff — next agent window (Run 7 · NH-SMOOTH v3)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod still:** **`index-Czk-Iu0n.js`** / **`af011cc`** (v2 — **FAIL**)  
**Local:** NH-SMOOTH **v3 coded unpushed**  
**Read order:** dashboard → health.json → this → STATUS → AGENTS  

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / NET-PERF-2 / ko_path.  
**One card. Ship only on “ship it.”**

---

## Active: NH-SMOOTH v3 — coded, await ship + retest

**Bar:** non-host driven cart glides (drive + combat).

| Ship | Result |
|------|--------|
| v1 `34b240d` / `index-CaoV7WsD.js` | better, still janky |
| v2 `af011cc` / `index-Czk-Iu0n.js` | **FAIL** cap-83 + video 0456 |
| **v3** unpushed | display-pose low-pass mesh+camera |

**cap-83 (v2 fail):** snapAvg 26.7 · **snapGapMax 3478ms** · errMax **14.6m** · tele 1 · skip 1 · joiner 4090 HIGH · zanzibar

**v3 lever:** `frameVisuals` — non-host local mesh chases body via `_displayPos/_displayQuat` (rates 14/12); hard snap only if lag ≥ maxCorrectionM. `main` camera follows display. `clearReconcileVisOffset` reseeds display. Physics unchanged.

### DO THIS NOW

1. “ship it” → qa → ship → verify bundle+sha  
2. Hard-refresh dual → joiner drive+combat  
3. Pass → close; next NET-1  
4. Fail → F8+pull → one lever (host stall path if gapMax multi-s again)

### Closed

P0–P4 · NH-STATS · NH-BOOST  

### Note

Multi-second snapGapMax is **host silence** (HOST-ROLE-1 class) — display chase softens recovery; does not fix a frozen host.
