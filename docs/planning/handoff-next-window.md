# Handoff — next agent window (CAM-1 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-0O6jq9wn.js`** / sha **`5fade5b`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH stack · charge SFX · color/pattern · NET-1 · P5 · LS-1 | ✅ |
| RC-1 A AI cautious · RC-1 C READY-SET | ✅ PASS |
| RC-1 B host-reap | ⬜ optional skip |
| **CAM-1** host camera freeze | ✅ **shipped** `5fade5b` / `index-0O6jq9wn.js` — ▶️ **retest** |

### CAM-1 fix (in prod)

Host camera no longer follows stale NH-SMOOTH `_displayPos` (non-host-only display path). Host tracks body; `_displayReady` cleared on promote. F8 camera probe: `bodyPos`, `displayReady`, `displayPos`, `isSdSpectator`.

Gates at ship: qa typecheck + **1192** tests + knip green. Served-bytes: bundle in index.html; `isSdSpectator` + `bodyPos` present.

### Do not re-open without new evidence

P0–P4 · NH stack · NET-1 · P5 · LS-1 · RC-1 A · RC-1 C · CAM-1 code (unless retest FAIL)

---

## DO THIS NOW

1. Hard refresh both browsers → confirm `index-0O6jq9wn.js`.  
2. Reproduce path: non-host first, then become host (peer leave or rematch rebalance), drive hard.  
3. **PASS** if camera sticks to local cart. **FAIL** → F8, pull, one lever.

---

## Suggested next window paste

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-0O6jq9wn.js`** / sha **`5fade5b`**.  
> **Closed:** LS-1 · RC-1 A/C · CAM-1 **shipped**. **Active:** **CAM-1 retest**.  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
