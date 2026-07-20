# Handoff — next agent window (Run 7 · NH-HIT lever 1 retest)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Origin HEAD (docs tip):** **`41bcc14`** — ship code **`c07949a`**  
**Local:** may have unrelated dirty WIP (gamepadNav / BACKLOG) — **do not `git add -A`**  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-DpO_n0oI.js`** (build sha **`c07949a`**)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 without new evidence.  
**Do not** re-open combat skip-replay / phantom / hit-delay *root* as P0–P4.  
**Do not** re-add `ko_path` without new evidence.  
**Do not** re-open P0–P4 / NH-STATS / NH-BOOST without new evidence.  
**Do not** multi-lever dump — one card / one lever at a time.  
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
| Mission | Run 7 — **NH-HIT lever 1 retest** (optimistic non-host ram FX) |
| Prod | **`index-DpO_n0oI.js`** / sha **`c07949a`** |
| Gates last known | re-run after edits; lever-1 tests green at ship |
| Browser | Desktop **Cart Clash Test (Chrome Clean)** when muddy |

### Closed this arc

| Card | Verdict |
|------|---------|
| P0–P4 | ✅ |
| **NH-STATS** | ✅ PASS `b92d87f` |
| **NH-BOOST** | ✅ PASS `0be4cd5` / `index-CDlK3jio.js` |
| **NH-SMOOTH** | ✅ **partial** — visual better on v4 `6b5a9df`; residual parked |

### Active: NH-HIT — non-host hit delay ▶️

**Bar:** as **joiner**, ramming NPCs/peers **feels immediate** (crash SFX / shake / particles on contact), not a beat late. Watch for double SFX.

| Lever | Status |
|-------|--------|
| **1 — optimistic local ram FX** | **SHIPPED** `c07949a` / `index-DpO_n0oI.js` — **retest open** |
| **3 — host quality advisory/migrate** | **after** lever 1 retest (Wyatt ordered 1 then 3) |

**Code map (lever 1):** `src/simulation.js` (local rammer FX when `!isHost` live path), `src/netcode.js` (`noteOptimisticCollisionFx` + pair dedupe), `src/main.js` (callback wire), `tests/optimisticLocalHitFx.test.js`.

**Evidence seed (pre-fix):**
- Cap **87/88** — Intel host, 4090 joiner; hit delay bad  
- Cap **89/90** — **4090 host**, Intel joiner; delay **still bad** → structural (RTT + `inputJitterBufferMs` ~40 + 40Hz), not only HOST-ROLE-1  
- “Strong PC hosts” is **not** a product fix  

**NH-SMOOTH v4 note:** `s`=hasSpilled is not “dead”; hold only on shatter/`respawnAtMs` (cap-84 freeze fixed).

### Parked

- Cap-47 mid-round post-fall LT — only if multi-s freezes return  
- NH-SMOOTH residual glide polish — only if named  
- NET-PERF-2 / ko_path — no re-solve without new evidence  
- P5 / P6 — after NH-HIT or named  
- NET-1 full-round smoke — after NH-HIT  

### Diag keepers

- `?diag=1` · F8 both clients · `npm run captures:pull`  
- Same room: matching `startedAtMs` + one host / one joiner  
- Net flow o100 / reconcile err / teleports · host over33  

---

## DO THIS NOW

1. **NH-HIT lever 1 retest only** on prod `index-DpO_n0oI.js` / `c07949a`.  
2. Hard-refresh **both** clients. Confirm **same** `?room=` (not solo vs quickplay).  
3. Joiner rams NPCs hard: contact → SFX/shake/burst **now**? Double-fire?  
4. Pass → close lever 1; next = **lever 3** (host quality) or close NH-HIT if Wyatt says done.  
5. Fail → F8 joiner + host → `captures:pull` → one lever only.  

---

## Priority queue (high → low)

### P0–P4 · NH-STATS · NH-BOOST · NH-SMOOTH (partial) — CLOSED / parked

### NH-HIT — non-host hit delay ▶️

**Status:** lever 1 **shipped — retest open**  
**Prod:** `index-DpO_n0oI.js` / `c07949a`  
**Next after pass:** lever 3 host-quality (not “make strong host only”)

### NET-1 / P5 / P6

After NH-HIT.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-DpO_n0oI.js`** / sha **`c07949a`**.  
> **P0–P4 + NH-STATS + NH-BOOST CLOSED.** NH-SMOOTH partial (visual better).  
> **Active: NH-HIT lever 1 retest** (optimistic non-host ram FX). Lever 3 host-quality after.  
> First action: hard-refresh dual clients same room; joiner ram NPCs — hit feel now / double SFX? pass/fail. F8 both + pull if fail.  
> One card/lever at a time. Do not re-open closed cards / NET-PERF-2 / ko_path.  
> Ship only on “ship it.” Do not `git add -A` (other WIP may be dirty).

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
- **Room check:** dual F8 must share `startedAtMs` and opposite host flags.
