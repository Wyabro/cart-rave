# STATUS session log — 2026-07-20 → 2026-07-21

Rolled out of [STATUS.md](../STATUS.md) on 2026-07-21 (operational-parity pass). What stayed
live: the three newest 07-21 entries (PERF-WARM root cause · WRAP · COUNTDOWN-ABORT-1
verified). **Nothing here is current truth** — code and `git log` are authoritative.

## Entries (newest first)

2026-07-21 (FIX — COUNTDOWN-ABORT-1: quickplay is continuous, seat humans ready) — Cancel
attribution (caps 175/176) named the trigger conclusively: `round_msg_lobby` aborts with
BOTH humans `isReady:true`, correlated with slot0 NPC↔human churn as the frozen non-host
(`8a8d0b`, 22s load freeze) re-seated. Root cause: `#assignHumanToSlot` seated a (re)joining
human `isReady:false` (party/index.ts:361), and the server aborts the
armed countdown on ANY live-human-unready (party/index.ts #cancelCountdownIfNeeded).
Since **quickplay is a continuous mode with no manual ready-up**, seating unready + waiting on
a client `ready` the frozen peer can't send is the bug. Fix (server): new `shared/readiness.js`
policy — `seatReadyState()` seats continuous-mode (quickplay) humans READY by definition (the
core fix), and restores readiness for a non-continuous connId that was ready before a reseat
blip (B); `#cancelCountdownIfNeeded` now grace-debounces the abort (`COUNTDOWN_ABORT_GRACE_MS`
1500ms) instead of nuking on every roster flicker (A), with `#readyConnIds` maintained in
readyToggle / onClose / playAgain. Not the clock (SYNC-1 stays correct); not the freeze
(hardware-bound, separate). Gates: `npm run qa` **661** (+7 readiness), typecheck/knip clean.
**Needs Wyatt's paired quickplay playtest: next countdown F8s should show ZERO `countdownAbort`
events even with the non-host mid load-freeze.**

2026-07-21 (FINDING — REFRAME: countdown jank = phase-abort thrash, NOT the clock;
non-host freeze = hardware-bound) — Intel new-build countdown F8s (caps 157/160, build
`9bbfa27`, both `buildFreshness.stale:false`) overturned two prior theories:
• **Countdown "jank" is round-phase thrashing.** cap-160 round log: `lobby→countdown`
  then `countdown→lobby→countdown→lobby` (t=13028–13030), 7s in lobby, then `→countdown`
  again (t=20163) → `countdown_3` announced twice, 7.9s apart. cap-157 shows the same abort.
  The `countdown` probe math is self-consistent (digitN/elapsed/remaining line up) — **SYNC-1
  was correct; the clock was never the bug.** Non-host follows host `phase:lobby` at
  netcode.js:2650; host holds countdown on `isSessionPlayReady` (Cap-59, main.js:3729).
• **PERF-WARM-1 shader-warm theory REFUTED by its own instrumentation.** `warmupCompile`
  events: sync `compile()` = 66–145ms, `parallelCompile:true`, 167–446 programs — NOT a
  3.3s block. Freezes are focused/visible/main-thread-IDLE rAF gaps (cap-157: 2050ms,
  ltSum=0; cap-160: 10962ms, ltSum=1251) whose size does NOT track shader warm (3.4s warm→2s
  freeze; 1.1s warm→11s freeze). Intel Edge GPU report: Gen11 iGPU, **7GB RAM / 9GB commit /
  8 cores**, `Software Rendering:No`, `msaa_is_slow` workaround, HLSL compiles recurring
  through the session. Signature = OS paging / memory pressure + repeated shader compiles →
  substantially hardware-bound.
• **Unified cause:** the multi-second non-host freeze starves the network → host sees peer
  unready → aborts countdown → restart on recovery = the visible jank.
New IDs: **COUNTDOWN-ABORT-1** (make countdown resilient to a transient peer freeze — the
real shippable fix; extends the Cap-59 readiness hold) and **freeze mitigation** (secondary:
audit composer MSAA + per-round variant recompiles; hardware-bound, won't fully fix a 7GB
Gen11). Secondary lead: `hostClockOffsetMs:0` on non-host — verify it's meant to be nonzero.
**Blocked on: a HOST-side countdown F8 (same round as a non-host one) to confirm WHY the host
sends `phase:lobby` (peer-unready vs server reassert) before writing COUNTDOWN-ABORT-1.**

2026-07-21 (SHIPPED — DIAG-STALE-1 + F8 coverage gaps) — **`71185b1`→`7a0333b`** pushed
+ deployed as bundle **`index-CPME-kfx.js`** / Version **`0554247b-74b3-4522-a261-0b044248ca68`**.
Served-bytes verified in-browser: live site self-reported `sha 7a0333b`, freshness
`stale:false`. Two concerns: (1) **build-stamp banner + stale-cache guard** — boot console
+ `window.__ccBuild` + red STALE warning when a tab's loaded `index-*.js` ≠ live-deployed;
F8 stamps `buildFreshness{stale,loaded,live}` and warns at capture time. Root-caused the
07-21 AM "fixes never ran" playtest (both machines had served OLD cached bundles). (2)
**three F8 coverage gaps closed** — `countdown` probe (clock-domain inputs behind the HUD
digit math, makes SYNC-1 verifiable from one countdown-phase F8); `longframe.spans[]` named
attribution via `perfSpans.mark()` around `vfx.shatter`/`pa.sting`/`physics.step`;
`gpucontextlost`/`restored` perf events. Gates: `npm run qa` **654**, build clean.
**FINDING (post-deploy F8s, caps 149–152, both machines confirmed `stale:false` on
CPME-kfx):** non-host "bad perf" + "countdown jank" share ONE root cause →
**round-start load stall**. Non-host (Intel UHD) spends **4.87s** at play-entry→carts-ready,
**3.9s of it in `play-shader-start→end` (warm=true)**, blocking the main thread ~3.3s
(`longframe dt=3328, ltSum=3223, spans=[]` — NOT physics/shatter/pa). Host (4090) = 628ms
total / 316ms shader-warm. The non-host freeze overlaps the countdown window → uneven digit
render (3→2 gap 1969ms vs host's even 1154/1204ms). SYNC-1 clock math looks correct; the
jank is the load freeze, not the clock. New ID **PERF-WARM-1** (shader warm-up blocks round
start on weak iGPU). **Next: one COUNTDOWN-phase F8 on non-host (new build) to read the
`countdown` probe live and rule the clock in/out.**

2026-07-21 (SHIPPED — COUNTDOWN-SYNC-1 clock-domain) — **`276d123`** pushed + deployed as
bundle **`index-C1uycOJX.js`** / Version **`9276ba3f-ea8d-4feb-bd40-6718028da55a`**.
Non-host `game_start` now anchors `countdownStartedAtMs` with
`getRoundClockNowMs() - Netcode.getHostClockOffsetMs()` (host domain for HUD
`adjustedNow()`); Party `startsAtLocalMs` still gates already-past-GO. Catch-up safety
net kept. **Needs Wyatt's multiplayer playtest + countdown-phase F8.**

2026-07-21 (SHIPPED — SHIP-1 Tier A session, 4 deploys) — Full session working SHIP-1 Tier A
against Wyatt's live playtests, each pushed + deployed + served-bytes verified in order:
`c2a1b3c`→`b63788f` (INPUT-KB-1: menu nav + UI-active driving suppression, then the
digital-to-analog keyboard ease Wyatt confirmed feels right) → `5622741` (COUNTDOWN-WARM-1:
fly-over camera shader/composer warm-up) → `77969ad` bundle **`index-CIPz778_.js`**
(COUNTDOWN-SYNC-1: retroactive catch-up beat for a skipped countdown digit — the actual
root cause behind "countdown never in sync"). A1's `hiddenDuringGap` latch (07-20) was
independently validated this session: a real 6.55s tab-out was caught cleanly, confirming
the instrumentation and retroactively validating every earlier "not backgrounding" reading.
A concurrent session (Opus, unrelated SOFTGL-1 fix for a no-GPU-driver machine) pushed
`b5bcc36` mid-session — merged cleanly, no conflict, flagged in D-COUNTDOWN-SYNC-1 area.
Gates at each ship: `npm run qa` green (637→649 across the session), `npm run build` clean.
**Open:** COUNTDOWN-WARM-1 + COUNTDOWN-SYNC-1 both need Wyatt's next playtest to confirm;
A1's original chronic-host-freeze question (Intel-as-host) still has zero captures after
5 sessions — party server keeps picking the 4090 first.

2026-07-20 (SHIPPED — SHIP-1 + A1 gap-focus latch) — **`2293b57` pushed + deployed** as
bundle **`index-CDVlu6Eb.js`** / Version **`3e5a0468-520f-4c8f-adef-fa4bd363e2c8`**.
Served-bytes verified: fetched the deployed bundle, `hiddenDuringGap` present. Gates at
ship: `npm run qa` **628/65**, `npm run build` clean. **Playtest requested to exercise the
new A1 latch fields on a real focused-vs-backgrounded host freeze** — next F8 pull after
should give the first real verdict on the host-hitch hypothesis (see D-HOSTHITCH-1).

2026-07-20 (SHIP-1) — Shipping checklist + pre-ship tier ordering created
(planning/SHIP-1.md); BACKLOG rows tagged `[SHIP-1 A–E]`; new IDs
HOST-CAP-1 / SRV-TEST-1 / NET-SIM-1 / CART-MODEL-1 / ONBOARD-1.

2026-07-20 (NET-SD-1) — Sole-leader self-fall / untied wipeout crowns fallback winner.
**Unpushed** with NET-PRES-1 until ship.

2026-07-20 (NET-PRES-1) — Event-id presentation dedupe: host stamps `eid` on falls/collisions;
clients skip seen ids. Loss-on-drop residual accepted. **Unpushed** until ship.

2026-07-20 (battery) — Complete core suite **5/5 green** (`cart-clash-core-v1`, report `battery-2026-07-20T20-11-15-661Z.json`, ~10m): gameharness 41/41 · spawnlock 4/4 · mpIntegration 18/18 · hostMigration 7/7 · teardownRejoin 8/8. Ran on dirty tree (Truth Reset WIP); `ready=no` until clean exact-HEAD re-run post-push. Evidence → `npm run dashboard`.

2026-07-20 (Command Center Truth Reset — applied) — Declared phase **Playtesting & stabilization**; RC → todo. Forensic Jul 19–20 log archived. Battery provenance + health v4 (declared/observed/readiness). Challenge analytics reads `isComplete`.
