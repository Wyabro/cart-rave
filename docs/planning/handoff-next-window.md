# Handoff — Cursor (RC polish; NET-MIG-3 live)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-DGodTO_i.js`** / sha **`f3a9943`** (NET-MIG-3 live + PASS)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.** **No active ship card** — wait for Wyatt to name next.

**Dashboard:** mission + done-when from STATUS `## Current focus` / `### Done when`. Run `npm run dashboard` after STATUS edits.

---

## Where we landed

| Card | Verdict |
|------|---------|
| **Run 7** | ✅ CLOSED |
| **NET-2** | ✅ **PASS** ~3s driveable |
| **NET-MIG-3** | ✅ **PASS** + live `f3a9943` / `index-DGodTO_i.js` |
| NET-PRES-1 | 🟡 partial polish (optional) |
| MAIN-1 / BUNDLE-1 / BRAND-1 | post-gate / frozen |

### Do not re-open without new evidence

Run 7 · NET-1 · NET-2 · NET-MIG-3 · parked NH-HIT / NH-SMOOTH · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6

**UI:** color/look = **main-menu Customize**.

---

## DO THIS NOW

**Nothing auto-started.** Ask Wyatt.

Candidates:

| ID | Mode |
|----|------|
| NET-PRES-1 | polish — event-id dedupe on falls/collisions |
| Tech-debt | MAIN-1 only if Wyatt pulls it |
| Ship checklist | BRAND-1 still frozen |

---

## Suggested paste (Wyatt → Cursor)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-DGodTO_i.js`** / sha **`f3a9943`**.  
> **Closed:** Run 7 · NET-2 · **NET-MIG-3 PASS + live**.  
> **Active:** none — name next card (NET-PRES-1 optional).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run qa
npm run ship   # only on "ship it"
```
