# Handoff — next agent window (Run 7 · **post friend playtest**)

**Date:** 2026-07-19 (friend 2-human + friend solo F8 decode)  
**Branch:** `cart-clash`  
**Origin HEAD:** **`8f17aba`** (P0 longtask probe)  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-DGKCMA2w.js`** (Version `2729f45e`, build sha `8f17aba`)  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 (decode ring pool).  
**Do not** re-open combat skip-replay / phantom pending / hit-delay order unless new F8s prove regression.  
**Do not** multi-lever dump — one card at a time.

---

## One rule

**One change (or one forensics card) at a time.**  
Playtest console: [docs/playtest/console.html](../playtest/console.html).  
F8 both (or solo) → `npm run captures:pull` → `.diag-captures/playtest/`.

---

## What already shipped this arc (do not redo)

| Item | State |
|------|--------|
| Match A death spiral (replay cap) | ✅ `f0c10ba` |
| Hit-delay oldest unacked | ✅ `efdca62` |
| Combat hold + death pose | ✅ `4a9f7f8` |
| Phantom pending clear | ✅ `732e2d6` |
| Skip-replay only on long snap gap | ✅ `1a2f242` / combat pass-enough on Intel |
| Host send cadence probe | ✅ `19e5cd9` (`sendGapsOver100`, `host_send_gap`) |
| Await announcer pack at play-entry | ✅ `716ec2f` — dual-PC clean pair (cap-29/30) host freezes gone |
| Snap gap + silence use host **tHost** | ✅ `1adef95` — stops client wall-clock false gaps |
| P0 longtask + longframe focus stamps | ✅ `8f17aba` / live **`index-DGKCMA2w.js`** — measure only; behavior lever still open |
| TURN / Paid / Logs | ✅ secrets + Workers Paid |

**2e lab conclusion (same-room dual PC):** host send ~25ms; after warm + tHost honesty, clean pair had **0** snapGapsOver100 both sides. Residual 2e is **not** “constant host 100–500ms starve.”

---

## Friend playtest evidence (authoritative for next work)

### A) 2-human Quickplay — caps **31–40** (`1adef95`)

| Role | GPU | Caps |
|------|-----|------|
| **Host** | RTX **4090** High | 32, 35, 38 |
| **Non-host** | AMD **RX 9070 XT** High | 31, 33, 34, 36, 37, 39, 40 |

Same long round; later F8s = longer window of same session.

**End state (host #38 / friend #40):**

| | Host | Friend |
|--|------|--------|
| Cadence | send avg 26.4, o100=**6**, max **4145** | snap avg 30.5, o100=**117**, max **4145**, ~33 Hz |
| Combat | — | errMax **11.2 m**, tele **15**, skips **13**, drops **1857** |
| Local KOs | — | **localKos = 0** (localDeaths 7) |
| Pending | — | 21 inputs, oldest age **1.6 s** |

**Big freezes match 1:1 (tHost honest):**

| Host longframe / host_send_gap | Friend snap_gap via tHost |
|--------------------------------|---------------------------|
| **4127 / 4145** ms | **4145** |
| 437 | 437 |
| **2361 / 2395** | **2395** |
| + 270–480 ms band late | same band |

Host also had **1103** + **2709** ms resume longframes around countdown→GO.

**Late-round divergence:** host only **6** sendGapsOver100 total, friend ends **117** tHost gaps (many 250–800 ms in a row after ~t=225s). Not Intel wall inflate — **missed/delayed P2P snaps and/or host under-delivery under 2-human load**.

Progressive friend combat: drops 355→1857, tele 1→15, errMax 5.9→**11.2**.

No error/assert events. `connectionState: ok`. Not no-TURN (thousands of snaps).

### B) Friend solo — cap **41** (`1adef95`)

| | |
|--|--|
| GPU | AMD **9070 XT** High |
| URL | `?diag=1&room=soloqpjlik` · mode **solo** · Classic |
| Content | Full R1 (Defeat) + rematch R2; F8 mid-R2 |
| Errors | **0** |
| Loop | over33=**3**, over66=2 — GPU fine mid-round |
| AI probe | **`count:0, npcs:[]`** mid-fight while NPCs scoring — **diag blind spot** |
| Local feel | Many unforced rim/void falls; R1: 3 KOs then Defeat; R2 to F8: **0** local KOs, several deaths |
| Rematch hitch | **~8 s** resume longframe after 2nd `carts-ready` (shader only ~116 ms) |
| First entry hitch | **~4.4 s** after first carts-ready |
| Net flow empty | **Expected** solo (no peers) |

Solo does **not** show MP rubberband metrics. Separate from friend MP pain.

---

## Priority queue (high → low) — one at a time

### P0 — Host multi-second freezes under 2-human load (focused 4090)

**Why first:** Every multi-second host stall freezes authority for the friend (matched tHost gaps). Explains rubberband, reverse hits, teleports more than any non-host knob.

**Evidence:** cap-38 longframes 2709 / 4127 / 2361 + send gaps 4145 / 2395; friend #40 mirrors.

**Forensics (2026-07-19):**
- Multi-s freezes are **`resume:true` rAF gaps** (not chronic slow frames: over33=20 / over66=3 whole match).
- Freeze *starts* (end − dtMs) line up with: GO transition (~2.7s), first host KO burst (~4.1s), one NPC fall (~2.4s).
- **Counter-evidence:** second host death @ t≈156649 (bigger announcer stack) had **no** multi-s longframe → not “every death/shatter is 4s.”
- Lab dual-PC (cap-29/30) after announcer warm: maxDt ~0.27s, sendGapMax 84 — clean. Friend WAN/load path still freezes.
- No F8s newer than #41 on pull (pre-probe).

**Probe live (`8f17aba` / `index-DGKCMA2w.js`):** under `?diag=1` — `PerformanceObserver("longtask")` + longframe fields `hidden` / `vis` / `focused` / `lt[]` / `ltN`. Decode next host F8:
| longframe shape | meaning |
|---|---|
| `hidden:true` or `focused:false` | occlusion / unfocus (not “focused freeze”) |
| `lt[]` has multi-s `d` | main-thread task — name/attribution next lever |
| `lt:[]` + focused + visible | rAF starved without longtask (GPU/compositor/Chrome schedule) |

**Retest 42–47 (`8f17aba`):** 4090 host + Intel Low non-host. Multi-s freezes = focused + `lt:[{d:N,n:"unknown|window"}]` matching KO cascades. Menu also had 3–4s longtasks (less P0-critical).

**Next lever (unpushed):** `perf/ko_path` on host falls ≥32ms — `spillMs` / `scoreMs` / `dispatchMs` / `shatterMs` / `hot` / `reactors{}`. Names the slice inside the 2s longtask. Longframe `lt[]` also falls back to `performance.getEntriesByType("longtask")` (cap-47 observer race).

**Still open:** one **behavior** fix after ko_path names the hot slice.

**Pass:** Friend F8: no multi-second `snap_gap` matching host resume LF; host `sendGapMax` not multi-second mid-round; friend errMax/tele drop.

---

### P1 — Late-round P2P delivery / cadence under 2-human load

**Why second:** Host send o100 stays low while friend tHost o100 explodes late → lost or delayed DataChannel snaps (or host send not fully reflected). Pending age 1.6s, drops 1.8k.

**Evidence:** host o100=6 vs friend o100=117; late friend snap_gaps 250–800 ms via tHost every few hundred ms.

**Work:** Only after P0 or in parallel forensics if P0 freezes are rare. Check P2P send failures, channel bufferedAmount, ICE reconnect, snapshot force rate under load. Do **not** re-solve decode ring pool.

**Pass:** Friend snapHz ~40 full match; snapGapsOver100 tracks host sendGapsOver100 within noise; pending age not multi-second.

---

### P2 — Non-host combat credit / feel (`localKos: 0` in friend MP)

**Why third:** Friend `localKos: 0` entire MP session while host scores and kills fire. Feels like “hits don’t count.”

**Evidence:** cap-40 match.localKos=0, kosBySlot host-side credit exists; deaths 7.

**Work:** Trace non-host KO credit path (falls[] tail, challenges, match stats) — may improve after P0/P1 if stream was too broken to credit. Re-check after stream stable before large credit rewrites.

**Pass:** Friend localKos increments when they land KOs; kill feed matches feel.

---

### P3 — Friend join / cold-play hitch (MP)

**Evidence:** non-host longframe **58 s** resume at join (cap-31 family). Axis wired after; not permanent freeze.

**Work:** Join prewarm / don’t start round feel until joiner ready; measure `cr:*` on joiner. Related NET-2 class, different from host mid-round freeze.

---

### P4 — Solo rematch / play-entry hitch (9070 XT)

**Evidence:** cap-41 first entry ~4.4 s LF; rematch ~**8 s** LF despite warm shader ~116 ms.

**Work:** Profile solo rematch path (what runs between carts-ready and steady rAF). Lower priority than 2-human poison.

---

### P5 — Solo bot / rim death feel (taste + AI)

**Evidence:** cap-41 many SELF CHECKOUT / void falls; NPCs dominate KOs. Prior bot-suicide work was Classic routing — may need friend-machine taste or aggression tune.

**Not** a netcode bug per F8.

---

### P6 — Diag: AI probe empty mid-round

**Evidence:** cap-41 `snapshot.ai.count === 0` while NPCs active. Tooling only. Fix when touching diagnostics; don’t block gameplay P0–P2.

---

## Closed / not the bug

| Claim | Verdict |
|-------|---------|
| Constant host 100–500 ms send starve (lab) | ❌ Closed by send probe + cap-29/30 |
| Client wall-clock gap inflation | ✅ Mitigated by `1adef95` tHost gaps/silence |
| No TURN / snapCount 0 | ❌ Friend had thousands of snaps |
| Weak-host Intel only | ❌ Friend 9070 XT High still dies when host freezes |
| Solo net rubberband | ❌ Cap-41 clean net path |
| Re-solve NET-PERF-2 | ❌ Forbidden without new evidence |

---

## Suggested next window paste (Wyatt → new agent)

> Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md` and `AGENTS.md`.  
> Continue Run 7 **P0 only**: probe is **live** (`index-DGKCMA2w.js` / `8f17aba`). Pull F8s if Wyatt retested; decode host longframe `lt[]`/`focused`; one behavior lever from evidence.  
> Do not re-triage run-1…6; do not re-solve NET-PERF-2; do not re-open skip-replay/phantom; do not jump to P1 until P0 attributed.  
> Caps 31–41 already decoded.

---

## Commands

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull           # .diag-captures/playtest/
npm run captures:pull -- --list
```

---

## Agent hygiene

- After each ship: STATUS one-liner + this handoff if **next action** changed.  
- Report gates by number.  
- Never claim verified without pull + post-deploy served-bundle marker.  
- Behavior-changing ships need human playtest (ideally 2-human) before “done.”
