# Handoff — next agent window (Run 7 · NH-HIT lever 3)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod (still):** **`index-DpO_n0oI.js`** / sha **`c07949a`** (lever 1)  
**Local:** lever 3 host-quality **coded unpushed** + possible unrelated WIP — **do not `git add -A`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-open P0–P4 / NH-STATS / NH-BOOST / NET-PERF-2 / ko_path without new evidence.  
**Do not** multi-lever dump.  
**Ship only on Wyatt “ship it.”**

---

## One rule

**One change (or one forensics card) at a time.**  
Playtest: [docs/playtest/console.html](../playtest/console.html).  
F8 → `npm run captures:pull` → `.diag-captures/playtest/`.

---

## Where we landed

| | |
|--|--|
| Mission | Run 7 — **NH-HIT lever 3** (host-quality advisory/migrate) |
| Lever 1 | **FAIL** retest caps **91–94** on `c07949a` (still late on non-host) |
| Lever 3 | **Coded unpushed** — lobby rebalance toward stronger peer |

### Closed / parked

| Card | Verdict |
|------|---------|
| P0–P4 | ✅ |
| NH-STATS / NH-BOOST | ✅ |
| NH-SMOOTH | ✅ partial |
| Lever 1 optimistic FX | shipped; **FAIL** live (keep code) |

### Lever 3 design (what shipped code does)

- Client: `computeLocalHostCapabilityScore` → `hostScore` on `MSG.join`  
- Server: store scores; **lobby only** `#maybeRebalanceHostForQuality` after seat + on `playAgain`  
- Migrate if preferred score ≥ current + **20** (not a weak-host ban; ties stay first joiner)  
- `host_migrated` + `reason: "host_quality"` → toast  
- Disconnect promote still **oldest human** (`pickNextHostId`)  
- Files: `src/utils/hostCapability.js`, `party/hostSelection.ts`, `party/index.ts`, `src/netcode.js`, `tests/hostCapability.test.js`

### Evidence seed (lever 1 fail)

- Cap **91/92** — 4090 joiner / Intel host; clean o100; hit feel still bad  
- Cap **93/94** — Intel joiner only F8s; dirty snaps / pending age  

Lever 3 does **not** claim to fix structural RTT delay when a strong peer already hosts. It fixes **HOST-ROLE-1** (weak first-joiner hosts forever).

---

## DO THIS NOW

1. Wyatt **“ship it”** → commit only lever-3 files (not gamepad WIP / not `-A`) → `npm run ship`.  
2. Dual lobby retest: **Intel creates room first** → 4090 joins/seats → expect host glyph + toast move to 4090.  
3. Then joiner ram feel recheck (optional F8).  
4. Pass → partial-close HOST-ROLE-1 / note NH-HIT residual. Fail → F8 + dig one lever.

---

## Commands

```bash
npm run qa
npm run ship   # only on "ship it"
npm run captures:pull
```
