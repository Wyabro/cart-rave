# Handoff — next agent window (CAM-1 host camera freeze)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod (still live):** **`index-BxIgTxPx.js`** / sha **`24f49da`**  
**Local (unpushed):** CAM-1 fix in working tree — host camera no longer follows stale non-host `_displayPos`  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH stack · charge SFX · color/pattern · NET-1 · P5 · LS-1 | ✅ |
| **RC-1 A** AI cautious MP | ✅ **PASS** (Wyatt) |
| **RC-1 C** READY-SET rematch | ✅ **PASS** (Wyatt) |
| **RC-1 B** host-reap | ⬜ skipped (repro unclear to Wyatt — optional later) |
| **CAM-1** host camera stop-follow | ▶️ **ACTIVE** — fix coded, needs ship + retest |

### CAM-1 root cause (coded, unpushed)

NH-SMOOTH v3 display pose is **non-host only** in `frameVisuals`, but `main.js` camera still read `_displayReady` while host. After promote (or any stale flag), cart body drives on and camera freezes on the last display sample.  
**Lever:** host always tracks body; clear `_displayReady` on host promote (`setAuthorityMode`). F8 camera probe now includes `bodyPos` / `displayReady` / `displayPos`.

**Evidence:** cap-112 host `24f49da` (mode=follow, local deaths 3). Only one new upload found (user reported 2 bad + 1 refresh-good).

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-1 · P5 · LS-1 · RC-1 A · RC-1 C

---

## Active card: CAM-1 — ship + retest

1. On “ship it”: `npm run qa` → `npm run ship` → verify bundle.  
2. Two-browser: become non-host first, then host (leave/rejoin or quality rebalance), drive — camera must stick to local cart.  
3. F8 if fail: new probe shows `bodyPos` vs `camera.position` + `displayReady`.

---

## RC-1 B (optional, not blocking)

**What it was:** idle on color picker ~35s as first joiner while a second player seats — room must not go hostless after the 30s pending-picker reap.  
**Skip OK** unless you want to prove HOST-REAP-1 live.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BxIgTxPx.js`** / `24f49da` until CAM-1 ships.  
> **Closed:** LS-1 · RC-1 A · RC-1 C. **Active:** **CAM-1** host camera freeze (fix unpushed).  
> Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
