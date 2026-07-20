# Handoff — next agent window (Run 7 · NH-BOOST v3 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Origin HEAD:** **`8207ec2`** (docs) — ship code **`0be4cd5`**  
**Local:** clean aside from optional untracked `.claudeignore`  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-CDlK3jio.js`** (build sha **`0be4cd5`**)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 without new evidence.  
**Do not** re-open combat skip-replay / phantom / hit-delay unless new F8s prove regression.  
**Do not** re-add `ko_path` without new evidence.  
**Do not** re-open P0 countdown / P1 gap storm / P2 localKos / P3 join / P4 rematch / NH-STATS without new evidence.  
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
| Mission | Run 7 — **NH-BOOST v3 retest** (joiner boost bar / fire / trails / SFX) |
| Prod | **`index-CDlK3jio.js`** / sha **`0be4cd5`** |
| Gates last known | **561/57** green at v3 ship; re-run after edits |
| Browser | Desktop **Cart Clash Test (Chrome Clean)** when muddy |

### Closed this arc

| Card | Verdict |
|------|---------|
| P0 countdown hold | ✅ F8 64–67 / `60d773e` |
| P1 late-round gap storm | ✅ F8 68–71 re-scope |
| P2 non-host localKos:0 | ✅ kills work |
| P3 friend join hitch | ✅ Wyatt N |
| P4 solo rematch | ✅ F8 72–74 |
| **NH-STATS** my stats MP | ✅ PASS `b92d87f` / `index-BgZqxXtu.js` |

### Active: NH-BOOST — **shipped v3, await human retest**

| Ship | Bundle / sha | What |
|------|----------------|------|
| v1 | `5cf2a5e` / `index-wTIBrAQX.js` | wire `b` from timer; nitro sample + gamepad; charge SFX stop on reconcile |
| v2 | `917af54` / `index-Xu1vuW5T.js` | re-arm charge while held; silent replay re-arm; remote full trail latch |
| **v3** | **`0be4cd5` / `index-CDlK3jio.js`** | local reconcile applies host `snap.b`; no charge cancel on replay `nitro:false`; host drain ORs nitro across batch |

**Prior fail evidence:** F8 75–76 (v1 fail); cap-**77** joiner on v2 — “works but not consistent” (reconcile errMax ~9m).  
**Pass criteria:** as **non-host**, boost bar fills reliably; full charge + early release fire consistently; trails visible on self + peers; charge SFX no loop; no multi-s freezes required for this card.

### Parked

- Cap-47 mid-round post-fall LT — only if multi-s freezes return  
- Missed-fall undercount (54 vs 55) — only if KO chips still short after NH-STATS  
- Wrong cart color — same-build hard-refresh first  
- NET-PERF-2 / ko_path — no re-solve without new evidence  
- P5 bot/rim · P6 AI diag · NET-1 full-round smoke — after NH-BOOST pass  

### Diag keepers

- `?diag=1` · F8 · `npm run captures:pull`  
- Net flow o100 / reconcile err / teleports  
- Boot marks + longtask/longframe  

---

## DO THIS NOW

1. **NH-BOOST retest only** on prod `index-CDlK3jio.js` / `0be4cd5`.  
2. Hard-refresh **both** clients. Joiner (non-host) focus.  
3. Several boosts: full charge → fire; early release; under combat if possible.  
4. Feel: bar · trails (self + peer) · SFX once · fire consistency.  
5. If fail: F8 joiner (+ host if useful) → `captures:pull` → one lever only.  
6. If pass: close NH-BOOST in STATUS/handoff; next card = NET-1 or named residual.

---

## Priority queue (high → low)

### P0–P4 · NH-STATS — CLOSED

### NH-BOOST — non-host boosts / bar / SFX ▶️

**Status:** **SHIPPED v3 — retest open**  
**Prod:** `index-CDlK3jio.js` / `0be4cd5`  
**Code map:** `src/netcode.js` (serialize `b`, `applySnapshotToCartBody` local `b`, drain nitro OR), `src/simulation.js` (re-arm + no replay cancel), `src/input.js` (gamepad nitro), `src/gameLoop.js` (silent re-arm), `src/main.js` (`triggerRamBoost` silent)

### P5 / P6 / NET-1

After NH-BOOST pass.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-CDlK3jio.js`** / sha **`0be4cd5`**.  
> **P0–P4 + NH-STATS CLOSED.** **Active: NH-BOOST v3 retest** (joiner boost consistency).  
> First action: hard-refresh dual clients; joiner several full + early boosts; pass/fail. F8 + pull if fail.  
> One card at a time. Do not re-open P0–P4 / NH-STATS / NET-PERF-2 / ko_path.  
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
