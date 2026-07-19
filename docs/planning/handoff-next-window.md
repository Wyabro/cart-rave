# Handoff — next agent window (Run 7 · P0 mid-flight)

**Date:** 2026-07-19 (P0 menu card SHIPPED — F8 retest pending)  
**Branch:** `cart-clash`  
**Origin HEAD:** **`67059ad`** (deployed)  
**Local:** clean — nothing unpushed  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-CEjuO4Z7.js`** (Version `be5c1fb1`, build sha **`67059ad`**; `idle-shader-start` verified in served bytes)  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 (decode ring pool).  
**Do not** re-open combat skip-replay / phantom / hit-delay order unless new F8s prove regression.  
**Do not** re-add `ko_path` fall-path timing without new evidence (rolled back: 0 signal).  
**Do not** multi-lever dump — one card at a time.  
**Ship only on Wyatt “ship it.”**

---

## One rule

**One change (or one forensics card) at a time.**  
If a probe gets zero signal on retest, **roll it back** before stacking another.  
Playtest: [docs/playtest/console.html](../playtest/console.html).  
F8 → `npm run captures:pull` → `.diag-captures/playtest/`.

---

## Where we landed (truth)

| | |
|--|--|
| Code | Longtask observer + longframe `hidden`/`vis`/`focused`/`lt[]` **kept** (`8f17aba` arc). `ko_path` **removed** (`5bfe7e5`). |
| Prod | **`index-D3QXm4Qq.js`** — served: sha `5bfe7e5`, `longtask`/`ltN` present, **`ko_path` absent**. |
| Gates last known | qa **515/55** on ko_path ship; rollback is delete-only — re-run `npm run qa` if unsure. |

### Diag that helped (keep)

- Under `?diag=1`: `PerformanceObserver("longtask")` + longframe stamps.
- Multi-s freezes are **`resume:true`**, **`focused:true`**, **`hidden:false`**, longtask name **`unknown|window`** — main-thread, not alt-tab.

### Diag that did not help (gone)

- Host fall-path `perf/ko_path` (spill/score/dispatch/shatter + per-reactor ms). Cap **48–51**: **30 KOs → 0 events** (every fall path &lt;32ms). Cost was outside that timer.

---

## F8 evidence (do not re-decode from scratch)

### Friend 2-human — caps **31–40** (`1adef95`) — still authoritative pain

| Role | GPU | Caps |
|------|-----|------|
| Host | RTX **4090** High | 32, 35, 38 |
| Non-host | AMD **RX 9070 XT** High | 31, 33, 34, 36, 37, 39, 40 |

- Multi-s host freezes (2.4–4.1s) = friend tHost snap gaps 1:1.  
- Late friend snap o100 **117** vs host send o100 **6** → **P1** (locked until P0).  
- Friend combat errMax **11.2 m**, tele **15**, localKos **0**.  
- Solo cap-**41** (9070): rematch ~8s hitch; AI probe empty mid-fight — **P4/P5/P6**.

### Match B / Intel retests — caps **42–47** (`8f17aba`), **48–51** (host `be8eba3` / non-host **`8f17aba` skew**)

- **42–47:** multi-s host longtasks `unknown|window` on KO cascades + menu; Intel Low non-host.  
- **48–51:** host mid-round **cleaner** (worst ~0.4s); menu still **1.7–1.9s** longtasks; non-host **wrong color** (no color fields in F8); **build skew** (Intel never hard-refreshed).  
- Both humans hard-refresh same build next session.

---

## Priority queue (high → low) — one at a time

### P0 — Host multi-second freezes under 2-human load (focused 4090)

**Status:** Open. Menu sub-card **SHIPPED** (`be5c1fb1` / `index-CEjuO4Z7.js`) — **F8 retest is the next step** (menu sit ~15s + one round, both machines hard-refreshed).

**Menu multi-s (this window — done in tree, not shipped):**

- Caps **45–51**: multi-s longtasks (`unknown|window` 1.7–4.2s) start **~5ms after `world-ready`**, long before `play-entry`.  
- Cause: `isWorldBootstrapped()` un-gates menu attract → first `composer.render` compiles arena + postFX. Idle warm loaded geometry but did **not** `compileAsync` / prime composer before ready.  
- Fix (local): `bootstrapWorldCore` → `idle-shader-start` → `warmupActiveSceneShaders({ forPlay:false })` (always primes composer now) → `idle-shader-end` → then promise resolves → `world-ready`. Attract stays on gradient until warm finishes.  
- Gates: **514 tests / 55 files**, typecheck + knip clean.  
- **Still possible after ship:** post-ready `prefetchLevelChunks` + `warmSunsetEnv` (cap-47 ~4s LT ~14s after ready); announcer fire-and-forget decode on menu — separate cards if F8 still shows multi-s after world-ready.

**Next dig candidates after menu retest:**

1. **Post-fall / mid-round frame** — cap-47: 2.3–2.5s longtask on KO cascade + announcer burst; fall path already cleared (0 ko_path).  
2. If multi-s **returns** on friend 2-human with warm menu: longtask/`lt[]` only; no new probe until one lever.

**Pass:** No multi-s host_send_gap / friend tHost snap_gap mid-round; friend errMax/tele drop.

---

### P1 — Late-round P2P gap storm (friend o100 117 vs host o100 6)

Locked until P0. Do not re-solve decode ring pool.

### P2 — Non-host `localKos: 0` in friend MP

Re-check after stream stable.

### P3 — Friend join ~58s resume hitch

NET-2 class.

### P4 — Solo rematch ~8s hitch (9070, cap-41)

### P5 — Solo bot / rim death feel

### P6 — AI diag probe empty mid-round (tooling)

### Side — Non-host wrong cart color (cap 48–51 report)

No F8 color fields. Separate from P0. Both machines same build first.

---

## Closed / not the bug

| Claim | Verdict |
|-------|---------|
| Constant host 100–500 ms send starve (lab) | ❌ Closed (send probe + cap-29/30) |
| Client wall-clock gap inflation | ✅ Mitigated (`1adef95` tHost) |
| Fall path is the multi-s block (when freezes absent) | ❌ Cap 48–51: falls &lt;32ms, 0 ko_path |
| Alt-tab only | ❌ focused + visible + longtask |
| Re-solve NET-PERF-2 | ❌ Forbidden without new evidence |

---

## Suggested next window paste (Wyatt → new agent)

> Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md` and `AGENTS.md`.  
> Continue Run 7 **one item at a time** from P0→P6.  
> Do not re-triage run-1…6; do not re-solve NET-PERF-2; do not re-open skip-replay/phantom; do not re-add ko_path without evidence.  
> Prod still `index-D3QXm4Qq.js` / `5bfe7e5`. Local unpushed: menu idle-shader warm before world-ready.  
> On “ship it”: ship, hard-refresh, F8 menu sit + round; then post-fall card if mid-round multi-s remains.

---

## Commands

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull
npm run captures:pull -- --list
```

---

## Agent hygiene

- After each ship: STATUS one-liner + this handoff if next action changed.  
- Report gates by number.  
- Never claim verified without pull + post-deploy served-bundle marker.  
- Behavior-changing ships need human playtest before “done.”  
- **Probe discipline:** zero-signal cards get rolled back, not left in the tree.
