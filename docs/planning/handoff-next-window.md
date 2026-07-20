# Handoff — next agent window (Run 7 · P1 late-round gap storm)

**Date:** 2026-07-19 (end)  
**Branch:** `cart-clash`  
**Origin HEAD:** **`09f5653`** (docs F8 pass) — ship **`60d773e`**  
**Local:** clean aside from optional untracked `.claudeignore`  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-BQhnh1Z_.js`** (build sha **`60d773e`**)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 (decode ring pool) without new evidence.  
**Do not** re-open combat skip-replay / phantom / hit-delay order unless new F8s prove regression.  
**Do not** re-add `ko_path` fall-path timing without new evidence (rolled back: 0 signal).  
**Do not** re-open P0 countdown / hello hold / bridge wire — **PASS F8 64–67**.  
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
| Mission | Run 7 playtesting — **P1 late-round P2P gap storm** |
| Prod | **`index-BQhnh1Z_.js`** / sha **`60d773e`** |
| Gates last known | **qa 559/57** green (hold-wired ship); re-run after edits |
| Browser tooling | Desktop **Cart Clash Test (Chrome Clean)**; RTX 4090 High Performance for chrome/msedge |

### P0 countdown arc — **CLOSED** (do not re-open)

| Ship | Bundle / sha | What |
|------|----------------|------|
| Menu idle-shader warm | `67059ad` | compile before world-ready |
| Audio warm | `c3f3ad0` | music+ambience+countdown at play-entry |
| Abort + 400ms start | `03218fa` | live cancel + rAF defer |
| Hold logic | `af89f3c` → `17b6d53` | host_round + hello hold |
| **Hold wired** | **`60d773e` / `index-BQhnh1Z_.js`** | bridge forwards `isSessionPlayReady` (was always true) |

**F8 64–67 (`60d773e`):** joiner + host — countdown **only after** `carts-ready`; full 3-2-1→GO; **0** LFs during countdown; LT over1000:0.  
(Joiner 126s resume LF at carts-ready = ~2 min menu sit — not a fail.)

### Older pain still authoritative

- Friend 2-human caps **31–40** (`1adef95`): multi-s host freezes ↔ friend tHost gaps; late snap **o100 117** vs host send **o100 6** → **P1** (active).  
- Cap-**47**: mid-round KO cascade ~2.3–2.5s LT — **parked** (post-fall). Re-open only if friend multi-s freezes return mid-round.  
- Cap-**41** solo 9070: rematch ~8s — **P4**.  
- Fall path is **not** the multi-s block (cap 48–51: 0 `ko_path`; rolled back).

### Diag that helped (keep)

- `?diag=1` → longtask + longframe (`resume` / `focused` / `hidden` / `lt[]`).  
- Boot marks: `idle-shader-*`, `play-shader-*`, `carts-ready`, `play-entry`.  
- Net flow: `snapGapsOver100` / `sendGapsOver100` / `snapGapMaxMs` on both sides.  
- Multi-s freezes when real: **`resume:true`**, **`focused:true`**, **`hidden:false`**, name **`unknown|window`**.

---

## DO THIS NOW

1. **P1 card only:** late-round P2P gap storm (friend snap o100 ≫ host send o100).  
2. Fresh evidence on current prod (`60d773e`): 2-human full-ish round, F8 **both** sides near end of round or when stream feels wrong.  
3. Pull + compare host vs non-host:
   - `net.flow.snapGapsOver100` / `sendGapsOver100` / gap max  
   - reconcile err / teleports / replay skips  
   - longtask/longframe (host vs joiner)  
4. One forensics lever from that evidence — do not stack.  
5. Mid-round freezes (cap-47 class): **parked** unless new F8s show multi-s during KO cascade.

---

## Priority queue (high → low) — one at a time

### P0 — Host multi-second freezes + joiner countdown load

**Status:** ✅ **CLOSED** (countdown path PASS F8 64–67). Mid-round parked if it returns.

### P1 — Late-round P2P gap storm (friend o100 117 vs host send o100 6) ▶️

**Status:** **UNLOCKED — active card**  
**Evidence seed:** caps 31–40 (`1adef95`) — stale build; need fresh F8s on `60d773e`.  
**Pass:** non-host late-round snap gaps no longer storm relative to host send (or re-scoped with honest metrics + one fix validated).  
**Likely code map (verify, don't assume):** `src/netcode/p2p.js`, `src/netcode.js` snapshot buffer / `noteSnapshotArrival`, host send loop Hz, prediction prune / ackSeq.

### P2 — Non-host `localKos: 0` in friend MP

Re-check after stream stable (P1).

### P3 — Friend join ~58s resume hitch (NET-2 class)

Partially addressed by carts-ready hold + wire; re-measure if still felt.

### P4 / P5 / P6 — Solo rematch hitch · bot feel · AI diag

After 2-human path.

### Side — Non-host wrong cart color

Parked; same-build hard-refresh first.

### Parked — post-fall mid-round LT (cap-47)

Only if friend multi-s freezes return mid-round.

---

## Closed / not the bug

| Claim | Verdict |
|-------|---------|
| Menu multi-s after world-ready | ✅ Fixed F8 52–54 |
| Countdown 1.3s / missing countdown_3 | ✅ Fixed F8 56 |
| Joiner countdown before carts-ready | ✅ Fixed F8 64–67 (hold was unwired) |
| Fall path is the multi-s block | ❌ Cap 48–51 zero `ko_path` |
| Re-solve NET-PERF-2 | ❌ Forbidden without new evidence |

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BQhnh1Z_.js`** / sha **`60d773e`**.  
> **P0 countdown CLOSED** (F8 64–67). **Active card: P1** late-round P2P gap storm.  
> First action: fresh 2-human F8s late-round on current build, pull, compare host vs joiner `snapGapsOver100` / send gaps.  
> One card at a time. Do not re-open countdown hold; do not re-solve NET-PERF-2; do not re-add ko_path.  
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
