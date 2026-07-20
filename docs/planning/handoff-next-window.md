# Handoff — next agent window (post NET-1 residual PASS)

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
| P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · charge SFX · color/pattern | ✅ |
| NET-1 core A+B (full rounds) | Soft-pass |
| NET-1 S1 rematch · S1 residual | ✅ PASS |
| **NET-1 residual** leave · host migrate · mid-join score | ✅ **PASS** `24f49da` / `index-BxIgTxPx.js` |
| NH-HIT residual · NH-SMOOTH | 🧊 parked |

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-PERF-2 · ko_path · NH-HIT residual · charge SFX · color/pattern · NET-1 S1 · NET-1 residual (leave/migrate/join-score)

---

## Open / pick next

| Option | Notes |
|--------|--------|
| **P5** | Solo bot/rim death feel |
| **Living Store** companion smoke | Optional NET-1 companion checklist |
| **Named** | Whatever Wyatt says |

---

## DO THIS NOW

1. Wyatt names next card (or stop — NET-1 residual is closed).  
2. One card only.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BxIgTxPx.js`** / sha **`24f49da`**.  
> **Closed:** P0–P4 · NH stack · charge SFX · color/pattern · rematch S1 · **NET-1 residual** (leave/migrate/mid-join score). NH-HIT residual parked. NH-SMOOTH partial.  
> **Next:** Wyatt names card (P5, Living Store smoke, or other).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
