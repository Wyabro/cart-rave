# Handoff — next agent window (Run 7 · post NH-STATS)

**Date:** 2026-07-20  
**Ship in prod:** **`b92d87f`** / **`index-BgZqxXtu.js`**  
**Branch:** `cart-clash`  
**Read order:** `npm run dashboard` → health.json → this file → STATUS → AGENTS  

**Do not** re-open P0–P4 / NH-STATS / NET-PERF-2 / ko_path without new evidence.  
**Ship only on Wyatt “ship it.”** One card at a time.

---

## Closed this arc

| Card | Verdict |
|------|---------|
| P0 countdown hold | ✅ F8 64–67 |
| P1 late-round gap storm | ✅ F8 68–71 |
| P2 non-host localKos:0 | ✅ kills work |
| P3 friend join hitch | ✅ Wyatt N |
| P4 solo rematch hitch | ✅ F8 72–74 + feel |
| **NH-STATS** my stats MP | ✅ **`b92d87f` / `index-BgZqxXtu.js` — Wyatt PASS** |

### NH-STATS what shipped

- Superlative combo/crit/leader only when `attacker === localSlot`
- Non-host `MSG.round`: no whole-handler early-return on unvalidated; stats only when `validated === true`
- `recordPodiumStats` once-per-round + string score keys

---

## DO THIS NOW

Pick **one**:

1. **NET-1** — two-human full-round smoke (V2 gate)  
2. **P5** — solo bot/rim death feel  
3. Name another residual non-host symptom  

Parked: cap-47 mid-round LT; fall-delivery undercount (54 vs 55) if chips still short; wrong cart color.

---

## Paste

> Prod `index-BgZqxXtu.js` / `b92d87f`. P0–P4 + **NH-STATS PASS**. Next: NET-1 · P5 · or named residual. Ship only on “ship it.”
