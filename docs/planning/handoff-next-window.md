# Handoff — next agent window (Run 7 · P0 countdown arc)

**Date:** 2026-07-19 (late)  
**Branch:** `cart-clash`  
**Origin HEAD:** **`795002a`** (docs) — fix ship **`af89f3c`**  
**Local:** clean aside from optional untracked `.claudeignore`  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-STjeavro.js`** (Version **`4e78d849`**, build sha **`af89f3c`**)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

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
Command Center: `npm run dashboard` → `.diag-captures/dashboard.html` + `health.json`.

---

## Where we landed (truth)

| | |
|--|--|
| Mission | Run 7 playtesting — P0 host freezes (countdown sub-cards) |
| Prod | **`index-STjeavro.js`** / Version **`4e78d849`** / sha **`af89f3c`** |
| Gates last known | **qa 554/57** green (countdown residual ship); re-run after edits |
| Browser tooling | Clean Chrome profile for playtests: Desktop **Cart Clash Test (Chrome Clean)**; RTX 4090 pinned High Performance for chrome/msedge |

### P0 countdown stack — what shipped this session (in order)

| Ship | Bundle / Version / sha | What |
|------|------------------------|------|
| Menu idle-shader warm | `index-CEjuO4Z7.js` / `be5c1fb1` / `67059ad` | `compileAsync` + composer prime **before** `world-ready` |
| Audio warm at play-entry | `index-BUszG7M2.js` / `6c62a3c5` / `c3f3ad0` | music + ambience + countdown SFX + announcer await under overlay |
| Abort + ~400ms start tick | `index-CRQwILqC.js` / `5a1caee0` / `03218fa` | live-only ready cancel; HUD digit reset; MP audio pre-roll; rAF-defer host `startCountdown` |
| Non-host hold until carts-ready | **`index-STjeavro.js` / `4e78d849` / `af89f3c`** | joiner does **not** surface countdown phase mid play-shader |

### F8 evidence (this session — do not re-decode from scratch)

| Caps | Build | Result |
|------|-------|--------|
| **52–54** | `67059ad` | Menu warm **PASS** — shader before WR; no multi-s LT after WR on 4090 |
| **54** | `67059ad` | Host residual: **~1.3s LT** at countdown start, missing `countdown_3` → audio-warm card |
| **56–57** | `c3f3ad0` | Multi-s **gone** (`over1000:0`, `countdown_3` present); ~407ms start stack + countdown→lobby abort |
| **58** | `03218fa` host 4090 Chrome | Wyatt: **host felt good**. Full 3-2-1 on re-arm; still one abort then clean second arm; max LT ~633ms |
| **59** | `03218fa` non-host **Intel + Firefox** low | Wyatt: **joiner rough**. Countdown applied **before** `carts-ready`; longframe **~66s**; LT observer off on Firefox |

### Older pain still authoritative for later cards

- Friend 2-human caps **31–40** (`1adef95`): multi-s host freezes ↔ friend tHost gaps; late snap o100 **117** vs host send **6** → **P1** (locked until P0 closed).  
- Cap-**47**: mid-round KO cascade ~2.3–2.5s LT — **post-fall card** after countdown path is green.  
- Cap-**41** solo 9070: rematch ~8s — **P4**.  
- Fall path is **not** the multi-s block (cap 48–51: 0 `ko_path` signal; rolled back).

### Diag that helped (keep)

- `?diag=1` → longtask + longframe (`resume` / `focused` / `hidden` / `lt[]`).  
- Boot marks: `idle-shader-*`, `play-shader-*`, `carts-ready`, `play-entry`.  
- Multi-s freezes when real: **`resume:true`**, **`focused:true`**, **`hidden:false`**, name **`unknown|window`**.

---

## DO THIS NOW

1. **Pull Wyatt’s joiner F8s** for build **`af89f3c` / `index-STjeavro.js`**:  
   `npm run captures:pull`  
2. **Judge pass criteria:**
   - Non-host: **no** `lobby→countdown` (or countdown digits) **before** `carts-ready` in boot timeline.  
   - Non-host: no multi-10s longframe **while** countdown phase is active.  
   - Host: still clean 3-2-1 (regression check).  
3. If pass → mark countdown sub-cards done in STATUS; next card is **post-fall / mid-round** (cap-47) or friend 2-human P0 closeout.  
4. If fail → one forensics card only; do not stack levers.

---

## Priority queue (high → low) — one at a time

### P0 — Host multi-second freezes under 2-human (4090) + joiner load

**Status:** Menu ✅ · audio warm ✅ · abort/400ms ✅ (host feel good on 58) · **non-host hold SHIPPED — F8 in flight**  

**Pass for this sub-card:** Joiner F8 on `STjeavro` meets criteria above.  

**After pass:**  
- Friend 2-human mid-round multi-s still open if it returns → post-fall / longtask only (no new probe until one lever).  
- Then unlock **P1**.

### P1 — Late-round P2P gap storm (friend o100 117 vs host o100 6)

Locked until P0 closed.

### P2 — Non-host `localKos: 0` in friend MP

Re-check after stream stable.

### P3 — Friend join ~58s resume hitch (NET-2 class)

Partially addressed by carts-ready hold; re-measure after joiner F8.

### P4 / P5 / P6 — Solo rematch hitch · bot feel · AI diag

After 2-human path.

### Side — Non-host wrong cart color

Parked; same-build hard-refresh first.

---

## Closed / not the bug

| Claim | Verdict |
|-------|---------|
| Menu multi-s right after `world-ready` (attract compile) | ✅ Fixed + F8 52–54 |
| Countdown 1.3s / missing `countdown_3` (cold music+ambience) | ✅ Fixed `c3f3ad0` + F8 56 |
| Fall path is the multi-s block | ❌ Cap 48–51 zero `ko_path` |
| Alt-tab only | ❌ focused + visible + longtask |
| Re-solve NET-PERF-2 | ❌ Forbidden without new evidence |
| Joiner roughness = host countdown regression | ❌ Cap 58 host good / 59 is cold-join load |

---

## Code map (for the open card)

| Concern | Where |
|---------|--------|
| Non-host countdown defer | `src/main.js` `onGameStartHandler` → `ensureSessionCartsReady` |
| Hold `host_round` countdown phase | `src/netcode.js` `holdCountdownPhase` + `isSessionPlayReady` |
| Carts-ready predicate | `src/bootstrap.js` `isSessionCartsReady` |
| Live-only ready cancel | `party/index.ts` `#cancelCountdownIfNeeded` |
| Play-entry audio warm | `src/main.js` `warmupActiveSceneShaders` + `src/audioManager.js` prefetch* |
| Menu idle shader warm | `bootstrapWorldCore` / idle warm path |

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-STjeavro.js`** / sha **`af89f3c`**.  
> **First action:** `npm run captures:pull` and score the joiner F8 for non-host countdown-after-carts-ready.  
> One card at a time. Do not re-triage run-1…6; do not re-solve NET-PERF-2; do not re-add ko_path.  
> Ship only on “ship it.”

---

## Commands

```bash
npm run dashboard               # Command Center + health.json
npm run captures:pull
npm run qa
npm run ship                    # only on Wyatt "ship it"
```

---

## Agent hygiene

- After each ship: STATUS one-liner + this handoff if next action changed.  
- Report gates by number.  
- Never claim verified without pull + post-deploy served-bundle marker.  
- Behavior-changing ships need human playtest before “done.”  
- **Probe discipline:** zero-signal cards get rolled back, not left in the tree.  
- Prefer **Desktop → Cart Clash Test (Chrome Clean)** for host playtests when “browser vs game” is muddy.
