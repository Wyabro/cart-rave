# Handoff — Cursor (post NET-MIG-3 PASS)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod (until ship):** **`index-CzDt6R8Q.js`** / sha **`a42e42c`** — **does not** include NET-MIG-3 residual  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

**Dashboard:** mission + done-when come from STATUS `## Current focus` / `### Done when`. After doc edits always run `npm run dashboard`.

---

## Where we landed

| Card | Verdict |
|------|---------|
| **Run 7** | ✅ CLOSED |
| **NET-2** join freeze | ✅ **PASS** ~3s driveable (prod) |
| **NET-MIG-3** host-migrate ghost feel | ✅ **PASS** local (Wyatt 2026-07-20) — lever in tree |
| NET-PRES-1 | 🟡 partial polish (optional) |
| MAIN-1 / BUNDLE-1 / BRAND-1 | post-gate / frozen |

### Do not re-open without new evidence

Run 7 · NET-1 · NET-2 · NET-MIG-3 · parked NH-HIT / NH-SMOOTH · HUD-MENU-1 · CAM-1 · RC-1 A/B/C

**UI:** color/look = **main-menu Customize**, not a pre-round color step.

---

## DO THIS NOW (Cursor)

### 1. Ship NET-MIG-3 residual (when Wyatt says “ship it”)

Files:

- `src/netcode.js` — ghost guard past freeze max; no lastCartsCache while awaiting first snap; remotes `setEnabled(false)` until first post-epoch snap  
- `tests/hostMigration.test.js` — freeze-max-0 still awaits first snap  

```bash
npm run qa
# on "ship it":
# git add only the intended paths (not -A)
# commit + push origin cart-clash
npm run ship
# record new index-*.js + sha in STATUS; hard-refresh prod
```

### 2. After ship — no auto next card

Ask Wyatt. Candidates:

| ID | Mode |
|----|------|
| NET-PRES-1 | polish — event-id dedupe on falls/collisions |
| Tech-debt triage | MAIN-1 only if Wyatt pulls it forward |
| Ship checklist | domain / external testers — BRAND-1 still frozen |

---

## NET-MIG-3 lever summary (for reviewers)

**Before:** freeze ended at `hostMigrationFreezeMaxMs` (2s) and cleared `awaitingFirstSnap` → remotes re-armed from `lastCartsCache` → ghost bounce.  
**After:** `awaitingFirstSnap` clears only on first new-host snap; freeze may end earlier for local drive; remotes stay collider-off until that snap.

---

## Suggested paste (Wyatt → Cursor)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod still **`index-CzDt6R8Q.js`** / **`a42e42c`** until NET-MIG-3 ships.  
> **Closed:** Run 7 · NET-2 · **NET-MIG-3 PASS** (local).  
> **Do now:** ship NET-MIG-3 residual on “ship it” (netcode.js + hostMigration test); update STATUS prod row.  
> Then wait for named next card (NET-PRES-1 optional).  
> One card/lever. Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run qa
npm run ship   # only on "ship it"
```
