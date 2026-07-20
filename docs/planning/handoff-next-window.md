# Handoff — active window (Playtesting & stabilization)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** `index-DGodTO_i.js` / sha `f3a9943` (NET-MIG-3 live + PASS)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.** **No active ship card** — wait for Wyatt to name next.

**Declared phase:** Playtesting & stabilization (STATUS owns the ▶ marker).  
**Dashboard:** regenerate with `npm run dashboard` after STATUS edits. Evidence ≠ phase advance.  
**Battery:** complete core **5/5 green** (`battery-2026-07-20T20-11-15-661Z.json`) — dirty-tree run; re-run clean after push for exact-HEAD readiness.

---

## Where we landed (evidence, not phase exit)

| Card | Verdict |
|------|---------|
| **Run 7** | ✅ CLOSED |
| **NET-1** | ✅ PASS |
| **NET-2** | ✅ PASS ~3s driveable |
| **NET-MIG-3** | ✅ PASS + live |
| NET-PRES-1 | 🟡 optional polish |
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
| Phase advance | Release candidate only on Wyatt instruction |

---

## Suggested paste (Wyatt → agent)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Declared phase: **Playtesting & stabilization**.  
> **Closed evidence:** Run 7 · NET-1 · NET-2 · NET-MIG-3.  
> **Active:** none — name next card. Do not advance phase without explicit instruction.  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run qa
npm run ship   # only on "ship it"
```
