# Handoff — next agent window (post mid-round join score ship)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-BxIgTxPx.js`** / sha **`24f49da`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| Core NET-1 A+B soft-pass · S1 rematch · S1 residual · color/pattern · charge SFX | ✅ |
| Leave mid-round · host tab-close migrate | ✅ PASS (validation) |
| **Mid-round join score inherit** | ✅ **shipped** `24f49da` / `index-BxIgTxPx.js` — **retest open** |

### Lever

Zero slot score when NPC→human seats mid-round (`party` `#assignHumanToSlot` + host mirror on slots). Monotonic clamp needs server prev=0 first.

---

## DO THIS NOW

1. Wyatt retests mid-round join: joiner scoreboard = **0**.  
2. Pass → NET-1 residual closed; fail → one lever.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BxIgTxPx.js`** / sha **`24f49da`**.  
> **Open retest:** mid-round join score zero. Leave + migrate PASS.  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.
