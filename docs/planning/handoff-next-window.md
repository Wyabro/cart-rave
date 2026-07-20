# Handoff — next agent window (Run 7 · NH-SMOOTH)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Ship code on prod:** **`0be4cd5`** / **`index-CDlK3jio.js`** (NH-BOOST v3)  
**Local:** NH-SMOOTH coded — **unpushed** until Wyatt “ship it”  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 without new evidence.  
**Do not** re-open combat skip-replay / phantom / hit-delay unless new F8s prove regression.  
**Do not** re-add `ko_path` without new evidence.  
**Do not** re-open P0–P4 / NH-STATS / **NH-BOOST** without new evidence.  
**Do not** multi-lever dump — one card at a time.  
**Ship only on Wyatt “ship it.”**

---

## One rule

**One change (or one forensics card) at a time.**  
Zero-signal probes get rolled back.  
Playtest: [docs/playtest/console.html](../playtest/console.html).  
F8 → `npm run captures:pull` → `.diag-captures/playtest/`.  
Command Center: `npm run dashboard` → `.diag-captures/dashboard.html` + `health.json`.

---

## Where we landed (truth)

| | |
|--|--|
| Mission | Run 7 — **NH-SMOOTH** (non-host driven cart glides smoothly) |
| Prod | still **`index-CDlK3jio.js`** / **`0be4cd5`** until NH-SMOOTH ships |
| Evidence | Video `0432`/`0433` + F8 **78/79** (joiner 4090 HIGH, clean net, felt “slop”) |
| Gates | re-run after ship |

### Closed this arc

| Card | Verdict |
|------|---------|
| P0–P4 | ✅ |
| **NH-STATS** | ✅ PASS `b92d87f` |
| **NH-BOOST** | ✅ PASS `0be4cd5` / `index-CDlK3jio.js` |

### Active: NH-SMOOTH — **coded, unpushed, await ship + retest**

**Player bar:** non-host cart you drive glides across the screen ≈ host/solo — not drunk/rubberband/amateur.

**One lever (NH-SMOOTH):**
1. `gameLoop.js` — after local reconcile hard-snap (+ death/respawn snaps), `snapPhysicsPrevToBody` so physics-alpha mesh interp does not stretch across the snap (was fighting `_reconcileVisOffset` at ~40 Hz).
2. `config.js` — `reconcilePosRate` 8→**3.2**, `reconcileRotRate` 6→**2.5** (longer visual glide to host truth).

**F8 seed:** cap-78/79 — snapGapAvg 25.5, errMax ~1.4 m, teleports 0, over33 0 — net was fine; feel was presentation.

### Parked

- NET-1 full-round smoke — after NH-SMOOTH pass  
- Cap-47 mid-round post-fall LT — only if multi-s freezes return  
- Kill-credit all-null / scores 0 on 78–79 — **not** this card (Wyatt D = feel)  
- NET-PERF-2 / ko_path — no re-solve without new evidence  
- P5 / P6 — later  

---

## DO THIS NOW

1. On **“ship it”:** `npm run qa` → `npm run ship` → verify served bundle + sha.  
2. Hard-refresh **both** clients. Joiner focus.  
3. Drive: turns, boosts, combat, near holes — does the cart **glide**?  
4. Pass → close NH-SMOOTH; next = NET-1.  
5. Fail → F8 joiner (+ host if useful) → `captures:pull` → **one** follow-up lever only.

---

## Priority queue

### P0–P4 · NH-STATS · NH-BOOST — CLOSED

### NH-SMOOTH — non-host driven-cart glide ▶️

**Status:** coded unpushed  
**Files:** `src/gameLoop.js`, `src/config.js`

### NET-1

After NH-SMOOTH pass — [multiplayer-smoke.md](../playtest/multiplayer-smoke.md)

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod still **`index-CDlK3jio.js`** / **`0be4cd5`** until NH-SMOOTH ships.  
> **P0–P4 + NH-STATS + NH-BOOST CLOSED.** **Active: NH-SMOOTH** (joiner drive glide) — coded unpushed.  
> First action: ship on “ship it” or retest if already shipped; joiner drive pass/fail.  
> One card at a time. Do not re-open closed cards / NET-PERF-2 / ko_path.  
> Ship only on “ship it.”

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```

---

## Agent hygiene

- After ship: STATUS one-liner + this handoff if next action changed.  
- Report gates by number.  
- Never claim verified without pull + post-deploy served-bundle marker.  
- Behavior-changing ships need human playtest before “done.”  
- **Probe discipline:** zero-signal cards get rolled back.
