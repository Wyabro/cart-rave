# Handoff — next agent window (Run 7 · NH-SMOOTH v2 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Ship code:** **`af011cc`**  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-Czk-Iu0n.js`** (build sha **`af011cc`**)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / NET-PERF-2 / ko_path without new evidence.  
**One card at a time. Ship only on Wyatt “ship it.”**

---

## Active: NH-SMOOTH v2 — retest open

**Player bar:** non-host driven cart glides (drive + combat), not drunk/jank.

| Ship | Bundle / sha | What |
|------|----------------|------|
| v1 | `34b240d` / `index-CaoV7WsD.js` | prev-pose snap + rates 3.2/2.5 — better, still janky (cap-82) |
| **v2** | **`af011cc` / `index-Czk-Iu0n.js`** | per-snap add cap 0.45m · debt clamp not zero · speed ease 5 m/s / 4 rad/s · maxCorrectionM 6 |

**Seed fail:** cap-82 errMax 12.3m, 2 teleports, clean snap cadence.

### DO THIS NOW

1. Hard-refresh both → confirm `index-Czk-Iu0n.js`  
2. Joiner: drive + **combat**  
3. Pass → close NH-SMOOTH; next NET-1  
4. Fail → F8 + pull → one lever only  

### Closed

P0–P4 · NH-STATS · NH-BOOST  

### Parked

NET-1 after pass · Cap-47 LT · kill-credit zeros (not this card)

---

## Paste for next window

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-Czk-Iu0n.js`** / sha **`af011cc`**.  
> **Active: NH-SMOOTH v2 retest** (joiner drive/combat glide).  
> First action: hard-refresh dual clients; joiner drive + combat pass/fail. F8 + pull if fail.  
> One card. Ship only on “ship it.”
