# Handoff — next agent window (Run 7 · NH-SMOOTH retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Origin HEAD:** **`34b240d`** (code) — docs may tip after  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-CaoV7WsD.js`** (build sha **`34b240d`**)  
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
| Mission | Run 7 — **NH-SMOOTH retest** (joiner driven-cart glide) |
| Prod | **`index-CaoV7WsD.js`** / sha **`34b240d`** |
| Gates | **561/57** green at ship |
| Evidence seed | Video `0432`/`0433` + F8 **78/79** (clean net, felt slop) |

### Closed this arc

| Card | Verdict |
|------|---------|
| P0–P4 | ✅ |
| **NH-STATS** | ✅ PASS `b92d87f` |
| **NH-BOOST** | ✅ PASS `0be4cd5` / `index-CDlK3jio.js` |

### Active: NH-SMOOTH — **shipped, await human retest**

**Player bar:** non-host cart you drive glides ≈ host/solo — not drunk/rubberband.

**Ship lever:**
1. `gameLoop.js` — `snapPhysicsPrevToBody` after local reconcile / death / respawn hard-snaps  
2. `config.js` — `reconcilePosRate` 8→**3.2**, `reconcileRotRate` 6→**2.5**

### Parked

- NET-1 — after NH-SMOOTH pass  
- Cap-47 LT — only if multi-s freezes return  
- Kill-credit zeros on 78–79 — not this card  
- NET-PERF-2 / ko_path — no re-solve without new evidence  

---

## DO THIS NOW

1. Hard-refresh **both** clients — confirm `index-CaoV7WsD.js`.  
2. Joiner focus: drive, turn, boost, combat, near holes.  
3. Feel: does **your** cart glide smoothly?  
4. Pass → close NH-SMOOTH; next = NET-1.  
5. Fail → F8 joiner (+ host) → `captures:pull` → one lever only.

---

## Priority queue

### P0–P4 · NH-STATS · NH-BOOST — CLOSED

### NH-SMOOTH — non-host driven-cart glide ▶️

**Status:** **SHIPPED — retest open**  
**Prod:** `index-CaoV7WsD.js` / `34b240d`

### NET-1

After NH-SMOOTH pass.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-CaoV7WsD.js`** / sha **`34b240d`**.  
> **P0–P4 + NH-STATS + NH-BOOST CLOSED.** **Active: NH-SMOOTH retest** (joiner drive glide).  
> First action: hard-refresh dual clients; joiner drive pass/fail. F8 + pull if fail.  
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
