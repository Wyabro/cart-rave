# Handoff — Release candidate residual triage

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-CzDt6R8Q.js`** / sha **`a42e42c`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

**Dashboard note:** mission banner + done-when come from STATUS `## Current focus` / `### Done when` — not from git phase alone. Rewrite those sections when the mission changes.

---

## Where we landed

| Card | Verdict |
|------|---------|
| **Run 7** (P0–P6 · NH · NET-1 · LS-1 · RC-1 · CAM · HUD) | ✅ **CLOSED** |
| **NET-2** join freeze / slow load | ✅ **PASS** — ~**3s** to driveable (Wyatt 2026-07-20) |
| **NET-MIG-3** host-migration rubber-band | ▶️ recommended next |
| NET-PRES-1 · MAIN-1 · BRAND-1 | polish / post-gate / frozen |

### Do not re-open without new evidence

Run 7 closed set · NET-1 · NET-2 · parked NH-HIT / NH-SMOOTH residuals

---

## Active card (recommended): NET-MIG-3

**Mode:** validation-first unless FAIL needs a lever.  
**Symptom:** after host leaves, freeze/grace ends before new host DataChannel is ready → ghost colliders / rubber-band.

### Repro sketch

1. Two browsers, friends/quickplay, mid-round.  
2. Host tab closes or disconnects.  
3. Survivor should promote, get physics, drive cleanly.  
4. **PASS:** short freeze then solid control. **FAIL:** long ghost / rubber-band / stuck.  
5. On FAIL: F8 both if possible, `npm run captures:pull`, one lever only.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-CzDt6R8Q.js`** / sha **`a42e42c`**.  
> **Closed:** Run 7 · **NET-2 PASS** (~3s driveable).  
> **Phase:** Release candidate. **Next:** **NET-MIG-3** (or name another card).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
