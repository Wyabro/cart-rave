# Handoff — next agent window (LS-1 Living Store smoke)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-BxIgTxPx.js`** / sha **`24f49da`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md) → **[living-store-test-plan.md](./living-store-test-plan.md)**

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · charge SFX · color/pattern | ✅ |
| NET-1 core A+B · S1 rematch · S1 residual · residual leave/migrate/join-score | ✅ |
| **P5** solo bot/rim death feel | ✅ **PASS** (no code) |
| NH-HIT residual · NH-SMOOTH | 🧊 parked |
| **LS-1 Living Store two-browser smoke** | ▶️ **NEXT** — validation first |

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-PERF-2 · ko_path · NH-HIT residual · charge SFX · color/pattern · NET-1 S1 · NET-1 residual · P5

---

## Active card: LS-1 Living Store companion

**Mode:** validation-first (solo already verified; this is **2-client only**).  
**Plan:** [living-store-test-plan.md](./living-store-test-plan.md)

### Setup
- Prod `https://cart-rave.wyabro.workers.dev/?diag=1` (or `npm run dev:local` + `127.0.0.1`)
- Two browsers, **both tabs visible** (hidden tab freezes rAF)
- Hard refresh so both on `index-BxIgTxPx.js` / `24f49da`

### Priority order (don’t boil the ocean in one sit)
1. **Cargo sync** — bay fill matches HUD score both machines after KOs  
2. **Remote ram-spill** — groceries + count both machines; comeback speed ~2.6s both  
3. **Directive fire** — callout + HUD chip both sides within a beat  
4. **One mutator smoke** (pick any live window): Flash Sale / Double Bag / Express Lane / Spill Bonus / Rush Hour — feel + restore on expiry  
5. **Host migrate mid-directive** (if time) — effect dies cleanly; no double-fire  

Full checklist stays in the plan file. **One FAIL → one lever; no batch.**

### F8
If something breaks: F8 both host + non-host, confirm upload, `npm run captures:pull`.

---

## DO THIS NOW

1. Run LS-1 smoke (cargo → spill → directive → one mutator).  
2. Report pass/fail per bullet; code only if named fail.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`, `docs/planning/living-store-test-plan.md`.  
> Branch `cart-clash`. Prod **`index-BxIgTxPx.js`** / sha **`24f49da`**.  
> **Closed:** P0–P4 · NH stack · charge SFX · color/pattern · NET-1 residual · **P5 PASS**.  
> **Active:** **LS-1 Living Store two-browser smoke** (validation-first).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
