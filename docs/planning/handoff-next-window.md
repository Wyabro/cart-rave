# Handoff — next agent window (Run 7 · **2e host hitch**)

**Date:** 2026-07-19 (2e announcer warm **live**)  
**Branch:** `cart-clash`  
**Origin HEAD:** **`716ec2f`** (await announcer pack at play-entry)  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-B1V-NCgO.js`** (Version `1dce77ac`)  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 (decode ring pool).  
**Do not** dump another prediction/reconcile knob pass unless new F8s prove combat reverse is back.

---

## One rule for this phase

**One change (or one validation / forensics card) at a time.** No multi-lever dumps.  
Playtest console: [docs/playtest/console.html](../playtest/console.html).  
F8 both machines → `npm run captures:pull` → read `.diag-captures/playtest/`.

---

## Where we are (truth)

| Item | State |
|------|--------|
| Match A smoothness (4090 hosts) | ✅ Death spiral fixed (`f0c10ba` replay cap). |
| Hit-delay order (oldest unacked) | ✅ `efdca62` |
| Combat hold + death pose | ✅ `4a9f7f8` |
| Phantom pending clear | ✅ `732e2d6` |
| TURN secrets on prod | ✅ `CF_ACCOUNT_ID` / `CF_CALLS_KEY_ID` / `CF_API_TOKEN` + `ERROR_LOG_TOKEN` (cap-10 was `snapCount:0` until secrets set). |
| Workers **Paid** + Logs | ✅ Paid; `observability` on (`601b8e8`). |
| Skip-replay only on long snap gap | ✅ **`1a2f242` / `index-Cw19iE04.js`** — not on oldest-N truncate. |
| Match A combat reverse | ✅ **Pass enough** — Wyatt feel better; cap-16 **skips=0**, localKos **2**, snapGapMax **181ms** (was 3665). |
| **Host hitch / invisible kills** | ▶️ **Announcer warm live** — `716ec2f` / `index-B1V-NCgO.js`; awaiting Match A F8 retest |
| Match B (Intel hosts) | Locked until 2e honest enough. |
| NET-PERF-2 | Done run-4. Do not re-solve. |

### Combat F8 scoreboard (do not re-decode from scratch)

| Build | Cap | Intel errMax | teleports | drops / **skips** | localKos | snapGapMax | Host longframes | Feel |
|-------|-----|--------------|-----------|-------------------|----------|------------|-----------------|------|
| `efdca62` | 6/7 | **28.6 m** | 4 | 113 / — | 0 | large | **10× (1–7s)** | Hit reverse; death where predicted |
| `4a9f7f8` | 8/9 | **4.2 m** | 1 | 40 / **6** | 1 | large | **6× (0.5–8s)** | Better hits; phantom after respawn |
| `601b8e8` no TURN | 10 | — | — | — / — | 0 | — | — | **snapCount 0** — host invisible, NPCs frozen (WS ok) |
| `601b8e8` + TURN | 12/13 | **5.3 m** | 1 | 3 / **4** | 0 | **3665** | host 7.3s shader + mid 200–300ms | Reverse hard mid-fight |
| **`1a2f242`** | **16/17** | 7.4 (1 tele) | 1 | 12 / **0** | **2** | **181** | host post-GO **303/526ms**; over33=27 | **Combat better**; residual hitch feel; **invisible kills** |

**Cap-16 combat fix proof:** `reconcileReplaySkips: 0` (was 4). Truncate still drops newest under max steps but **replays** continuous oldest-N. Steady snapHz ~full.

**Invisible kill (Wyatt):** non-host scored KO (`localKos`) but **never saw the hit**. Expected under host silence ≥~150ms: prediction holds → host resolves ram on buffered inputs → fall/kill credit arrives on next snaps without a local impact beat. Forensics target is **host main-thread / send stall**, not another reconcile order tweak — but see **confound below**.

### Host hitch forensics (2026-07-19 dig — cap-16/17 only; no newer F8s)

**Not** `document.hidden` / alt-tab. Wyatt keeps 4090 focused. Remote list still tops at #17.

#### Cap-17 (4090 host, High, classicRecord, `1a2f242`)

| t (perf ms) | Event | Notes |
|-------------|--------|--------|
| 11741 | carts-ready | shader warm only ~200ms (fine vs cap-15's 7.3s) |
| 11800 | longframe **229ms** resume=false | first frames after overlay |
| 14443 | longframe **131ms** | beside countdown_2 VO |
| 15865/15871 | running + GO | |
| 17080 | longframe **303ms** resume=true | ~1.2s after GO |
| 18806 | longframe **526ms** resume=true | ~3s after GO |
| 21130+ | first KO / PA flood | **zero** further longframes for rest of ~2 min (33 KO, 60 announcer) |

Probe: `over33=27`, `over66=3`, `resumeZeroed=2`, `maxDt=526ms`. Mid-round rAF on the 4090 is **mild** — not multi-hundred-ms storms.

#### Cap-16 (Intel non-host, Low)

- `snapGapsOver100=52` in ~94s (~**33/min**), max **181ms**, avg **25ms**, snapHz ≈ **40**
- Client loop hitchy: **`over33=444`**, `over66=16`, resume longframes at join (20s / 650ms)
- Combat: skips=0, localKos=2

#### Critical confound (do not treat snapGapsOver100 as pure host truth)

`noteSnapshotArrival` stamps **non-host main-thread wall time** when the DataChannel handler runs. An Intel client that stalls delays that stamp → **inflates** `snapGapsOver100` even when host send is healthy. Cap-16's 52 gaps vs host `over66=3` is inconsistent with "host alone caused every gap."

`holdAfterSnapGapMs: 150` / `getSnapshotSilenceMs` use the same arrival stamp — **local client hitches can false-trip prediction hold**, which feels like invisible kills even if the 4090 kept sending.

#### Early host stalls (real, focused 4090)

Post-GO **303 + 526ms** `resume:true` are genuine main-thread blocks. Strongest code lead already documented in `main.js`: announcer pack is `preload:false`; `prefetchSfxByPrefix("announcer_")` is **fire-and-forget** at play entry and may not finish before GO → first decode/load can land as multi-hundred-ms frames (comment cites 350–750ms on earliest callouts). Cap-17 longframes sit **before** the first combat PA events — consistent with background decode completing, not only on-play.

#### What we still cannot prove without a new probe

Mid-round host **send** cadence was invisible on host F8s (`snapCount:0` on host — host never receives its own snaps). Needed: host-side inter-`hostSendTick` gaps.

### Instrumentation card (**shipped**)

**One card:** host send-cadence counters in `src/netcode.js` (no gameplay change):

| Probe field | Meaning |
|-------------|---------|
| `net.flow.sendCount` | Host broadcasts accepted this window |
| `net.flow.sendGapAvgMs` / `sendGapMaxMs` | Inter-send wall gaps (after burst coalesce accepts) |
| `net.flow.sendGapsOver100` | Host send gaps >100ms |
| event `net/host_send_gap` | Rate-limited when gap >250ms (+ phase) |

Lobby/countdown silence does **not** inflate the first running gap (anchor reset when phase ≠ running).

**Live:** commit `19e5cd9`, bundle **`index-pavOdoEG.js`**, Version `28e48ede` — markers verified in served bytes (`sendGapsOver100`, `host_send_gap`, sha `19e5cd9`).

---

## Cap-23/24 decode (probe worked)

| | Host 4090 (23) | Non-host Intel (24) |
|--|----------------|---------------------|
| avg gap | **send 26.3ms** | **snap 26.2ms** |
| max | send **2047** | snap **2041** (matched) |
| >100 count | send **3** / ~86s | snap **47** / ~77s |
| combat | — | skips 3, drops 43, errMax 0.35 |

Host’s 3 send gaps = three `resume:true` longframes (2040 / 789 / 617ms). Non-host’s other ~44 snapGapsOver100 are **client inflate** (over33=742). Steady host 40Hz is fine.

## Behavior lever (**shipped** `716ec2f` / `index-B1V-NCgO.js`)

`prefetchSfxByPrefixAsync("announcer_", { maxWaitMs: 8000 })` awaited inside `warmupActiveSceneShaders` (play entry) in parallel with `compileAsync`. Idle menu still uses fire-and-forget `prefetchSfxByPrefix`.

## Next agent work (2e only)

1. Match A F8 both on **`index-B1V-NCgO.js`**, focused 4090 host.  
2. Pass: mid-round host `host_send_gap` / resume LF in the 600–2000ms band drop vs cap-23; `sendGapAvg` stays ~25–27.  
3. Do **not** stack non-host silence-hold changes until host freezes retested.  
4. If mid-round freezes remain after warm, dig non-audio main-thread (GC / first VFX) with new F8 timestamps.

**Out of scope this window unless F8s regress:** prediction order, skip-replay policy, phantom pending, Match B, P1 cards, NET-1, menu choppy (P0-2), NET-PERF-2.

---

## After 2e is honest enough

Strict queue (still one at a time):

1. Optional Match B (Intel hosts) — only if weak-host poison returns.  
2. P1 console cards: host minimize, SD 45s, music bleed, kill-confirm, Esc directive, looks, storerooms loop.  
3. NET-1 two-human full-round smoke.

Parked: menu choppy on 4090 High (P0-2); taste debt (Pass 4/5); VPS (not indicated). Background sim pump only if forensics prove tab-throttle, not main-thread block.

---

## Infra notes (agent)

- **Paid plan** required for this DO-heavy stack. Do not burn CaptureLog with useless list/pull loops.
- TURN secrets must stay set or P2P dies again (`snapCount:0`, timer still syncs via WS).
- Workers Logs ≠ F8 combat metrics. Dashboard for Worker/DO; F8 for `net.flow` / longframes.
- `tools/browser/` may be untracked local junk — do not commit unless asked.

---

## Commands

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull           # .diag-captures/playtest/
npm run captures:pull -- --list
npx wrangler secret list        # expect CF_* + ERROR_LOG_TOKEN
npx wrangler tail cart-rave     # optional live Worker/DO exceptions
```

---

## Window paste (Wyatt → new Grok)

> Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md` and `AGENTS.md`.  
> Continue Run 7 **2e host hitch forensics** only — one item at a time.  
> Do not re-triage run-1…6, do not re-solve NET-PERF-2, do not re-open combat skip-replay unless F8s show skips/reverse back.  
> Combat pass-enough on prior build. Residual: host stalls → snap gaps → invisible kills.  
> Probe **live** `index-pavOdoEG.js` (`19e5cd9`). Match A F8 both; compare host `sendGapsOver100` vs non-host `snapGapsOver100`.

---

## Agent hygiene

- After each ship: one-line STATUS update + refresh this handoff if **next action** changed.  
- Report gates by number (`npm run qa`).  
- Never claim verified without pull + (post-deploy) served-bundle marker check.  
- Behavior-changing ships need human playtest before “done.”
