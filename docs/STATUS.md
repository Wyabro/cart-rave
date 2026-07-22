# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: declared project
phase, mission, blockers, and what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current for declarations?** Yes — this file owns phase, mission,
active card, blockers, and phase-exit checklist. **Observed evidence** (git HEAD, qa/battery
results, dirty state) lives in the generated Command Center — run **`npm run dashboard`**
(`.diag-captures/dashboard.html` + `health.json`). Do not hand-maintain gate/HEAD claims here.

> **Rehydration protocol** (agent or human resuming cold):
> 1. Run **`npm run dashboard`** and read `.diag-captures/health.json` (or the Command Center HTML).
> 2. Read **this file** for declared phase / mission / blockers / gotchas.
> 3. Read root [AGENTS.md](../AGENTS.md) for standing rules and invariants (canonical).
> 4. Read [planning/ROADMAP.md](./planning/ROADMAP.md) + [planning/BACKLOG.md](./planning/BACKLOG.md) only for open future work.
> 5. Do not re-plan from scratch; do not re-open settled decisions ([archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md)) without new evidence.
> 6. Update this file after every meaningful step — one-line decision index entries here, long rationale in the decision log.
>
> Doc map: [docs/README.md](./README.md) · Dev toolkit: [guides/dev-toolkit.md](./guides/dev-toolkit.md) · Observability: [guides/observability.md](./guides/observability.md) · Visual QA: [guides/visual-qa.md](./guides/visual-qa.md) · Netcode harness: [guides/netcode-harness.md](./guides/netcode-harness.md) · Diagnostics: [guides/diagnostics.md](./guides/diagnostics.md) · Naming freeze: [brand.md](./brand.md)

## Mission (1 paragraph)

Ship **Cart Clash** Version 2: a polished solo-first 4-player shopping-cart physics brawler
(Three.js + Rapier + partyserver on Cloudflare). Product name is Cart Clash; Worker/host IDs
stay `cart-rave` until domain cutover. Prefer evidence (screenshots, black-pixel samples,
two-browser smokes) over vibes for graphics and multiplayer gates.

### Release phases

Orientation only — **advance the ▶ marker only on Wyatt’s explicit instruction.** Agents may
report phase-exit eligibility; they must not move the marker. Command Center renders this
strip separately from observed readiness (evidence never changes declared phase).

- ✅ Foundation — engine, arenas, carts, physics
- ✅ Core gameplay — KOs, scoring, Living Store, solo AI
- ✅ Multiplayer — P2P netcode, host authority, migration
- ✅ Production systems — passes 1–5, tooling, observability
- ▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC
- ⬜ Release candidate — queue drained, exact-HEAD evidence green, tech-debt triage
- ⬜ Ship — domain cutover, external testers, wide URL

## Project health — declared (evidence is generated)

**Phase = Playtesting & stabilization** (declared). Run 7 closed; NET-1 / NET-2 / NET-MIG-3
are **completed evidence**, not phase completion. Release candidate stays todo until Wyatt
advances the marker.

| Signal | Where to look |
|---|---|
| Gates / battery / git sync | `npm run dashboard` → `health.json` (`observed`, `readiness`) |
| Prod deploy / live bundle | Ephemeral handoff + collectors — not hand-maintained here |
| Multiplayer live smoke | STATUS queue + backlog IDs (NET-1 etc.) as evidence of passes |

## Major systems completed

Full record: [planning/production-passes.md](./planning/production-passes.md) and
[planning/completed-work.md](./planning/completed-work.md).

- **Core game** — host-authoritative MP + rewind-and-replay prediction; solo reuses the same path (private room + 3 NPCs); 3 elevated arenas; 2.5-min rounds + Sudden Death.
- **Presentation** — sticker-language menus/HUD/overlays, Store PA announcer, attract-mode menu, per-arena bloom, VFX/audio juice, distinct Defeat screen.
- **Arena audio** — per-arena ambient beds + reactive crowd + SD tension + per-arena music ([ambience.md](./reference/ambience.md), [music.md](./reference/music.md)).
- **Gameplay/AI** — Pass 4 bot fixes, proximity aggression, Sundial rim nav, intensity-scaled ram SFX.
- **Systems** — Living Store, scoring/KO event fan-out, lifetime unlocks, challenges, match stats.
- **Performance** — 3-tier quality, arena opts, chunk prefetch, boot/load pass, half-res bloom, LOD, auto-quality.
- **Netcode hardening** — WebRTC P2P plane, binary snapshots, host-migration handoff + round validation.
- **Tooling** — visual QA, netcode/gameplay harnesses, `npm run battery`, CI gate, observability + Command Center.

## Current focus

**Playtesting and stabilization.** Run 7 mission closed; player-risk residuals NET-2 and
NET-MIG-3 passed live; NET-PRES-1 event-id dedupe landed (loss-on-drop residual accepted).
Stay in this phase until Wyatt advances the marker — tech-debt triage does not auto-promote
to Release candidate.

Playtest console: [playtest/console.html](./playtest/console.html).  
F8 → auto-upload; pull: `npm run captures:pull` (needs `.env.local` `ERROR_LOG_TOKEN`).

### Done when (Playtesting & stabilization)

- [x] Run 7 playtest mission closed (P0–P6 · NH · NET-1 · LS-1 · RC-1 A/B/C · CAM-1 · HUD-MENU-1)
- [x] **NET-2** quickplay/mid-join cart driveable without long freeze — Wyatt PASS (~3s to drive)
- [x] **NET-MIG-3** host-migration ghost feel — Wyatt PASS + live deploy verified
- [x] **NET-PRES-1** fall/collision event-id dedupe (duplicate face) — code landed; loss-on-drop residual accepted
- [x] **NET-SD-1** sole-leader SD self-fall / untied wipeout — crowns fallback winner
- [ ] Stabilization residual named by Wyatt (or explicit “no active card / wait”)
- [ ] Phase exit only on Wyatt instruction → Release candidate

### Active queue (strict — one at a time)

Run 7 mission (below) is historical evidence, superseded as the live queue by
[planning/SHIP-1.md](./planning/SHIP-1.md) tiers — 07-21 session worked Tier A:

| # | What | Status |
|---|------|--------|
| **A1** host hitch forensics | `hiddenDuringGap` latch shipped + validated (real 6.55s tab-out caught cleanly) | ✅ instrumentation proven |
| **A1** COUNTDOWN-WARM-1 | fly-over camera shader/composer stall | ✅ fixed, needs Wyatt playtest |
| **A1** COUNTDOWN-SYNC-1 | non-host countdown clock-domain sync | ✅ catch-up + host-domain anchor fixed; needs Wyatt playtest + F8 |
| **A1** Intel-as-host capture | original chronic-freeze question | ⏳ still 0/5 sessions — party server keeps picking the 4090 |
| **A2** INPUT-KB-1 | keyboard digital-to-analog ease + menu nav | ✅ confirmed good by Wyatt |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

No ▶ active card unless Wyatt names one — SHIP-1 items above are self-directed within the
declared phase, not a phase-exit trigger. Historical Run 7 evidence (closed):

| # | What | Status |
|---|------|--------|
| **Run 7** | Full playtest mission | ✅ CLOSED |
| **NET-1** | Two-browser full-round smoke | ✅ PASS (core + residual) |
| **NET-2** | Quickplay join frozen cart / slow load | ✅ PASS ~3s driveable |
| **NET-MIG-3** | Freeze / ghost colliders after host migrate | ✅ PASS + live |
| **NET-PRES-1** | Fall/collision event-id dedupe | ✅ DONE (dup face; loss residual) |
| **NET-SD-1** | SD untie / sole-leader self-fall softlock | ✅ DONE |

Triage docs superseded: [playtest-triage-2026-07-17](./planning/playtest-triage-2026-07-17.md) …
[run6](./planning/playtest-triage-2026-07-18-run6.md).

### Next actions

1. Pre-ship ordering lives in [planning/SHIP-1.md](./planning/SHIP-1.md) (tiers A–E; no deadline).
2. **A1 — history, condensed.** Rounds 1–3: a genuine 22.1s Intel-non-host freeze with
   `hiddenDuringGap:false` ruled out mislabeled backgrounding; a repeated early-round
   (t≈11-14s) Long-Task-backed stall cluster on the 4090-as-host pointed at a one-time
   boot/init cost. Round 4: **tab-out latch VALIDATED** — a real 6.55s backgrounding was
   caught cleanly (`hiddenDuringGap:true`), confirming the A1 instrumentation works and
   retroactively validating every earlier "not backgrounding" reading. Also landed
   COUNTDOWN-WARM-1 (fly-over camera shader/composer warm-up, `5622741`) targeting the
   round-start stall cluster — but see round 5 below, that wasn't the real complaint.
   All 4 sessions had the 4090 as host; still zero Intel-as-host captures.

   **Round 5 (07-21): the real bug — countdown BEAT TIMING desyncs, not frame stutter.**
   Wyatt: "countdown is still jank... just not in sync... one machine pretty much always
   skips the countdown." Real captures (host NVIDIA + non-host Intel, same round, build
   `b5bcc36`) show all 4 countdown beats (3/2/1/GO) *do* fire, but wildly unevenly spaced —
   expected ~1200ms apart (`COUNTDOWN_MS=3600`/3 digits): host measured
   [1580, 768, 1207]ms, non-host **[2582, 1201, 97]ms** — the last gap (digit "1" → GO)
   collapsing to ~90ms, twice, in two different non-host captures from two different
   rounds. Root cause in `hud.js updateStatus()`: the digit shown/announced is computed by
   **polling** `remainingMs` each frame and firing `announce("countdown_N")` only when N
   changes — but "GO" fires on an **edge-detected phase transition**
   (`countdown`→`running`), independent of the digit branch. A stall spanning the
   countdown's last ~1200ms window lets the phase flip to `running` before the polling
   loop ever gets a frame to observe `n===1` — so "1" is skipped entirely and GO fires
   immediately after whatever was last shown. Fix: `updateStatus` now detects this
   (`_lastCountdownN !== 1` at the countdown→running edge) and retroactively fires the
   missed "1" beat, staggered `MISSED_COUNTDOWN_CATCHUP_MS` (220ms) before GO — purely
   presentational (gameplay unlock is already gated on `phase === "running"`, not this
   banner, so the round's actual start timing is untouched); generation- and phase-guarded
   against a stale deferred beat firing over a newer/aborted countdown. `npm run qa`
   649/649, build clean. Verified live: a normal (unstalled) countdown still fires
   3/2/1/GO at clean ~1200ms spacing (catch-up path doesn't fire, no regression) — could
   not force a real stall to exercise the catch-up path itself headlessly; no automated
   test added (`hud.js update()` pulls in ~8 modules with zero existing test coverage —
   not proportionate to this fix). **Needs Wyatt's playtest**, specifically watching
   whether the 1→GO gap stays ≥~200ms instead of collapsing, plus fresh captures.

   Note: while pulling captures, found a **concurrent session** (co-authored Claude Opus
   4.8) had pushed `b5bcc36` (SOFTGL-1 — software-render resolution floor for a "Hawaii
   playtest" machine with no GPU driver) directly to `origin/cart-clash`, already merged
   into the local tree cleanly by the time this session noticed. Unrelated to A1; flagging
   only because two agents were active on this branch concurrently.
3. **A2 — INPUT-KB-1 done, confirmed good.** Wyatt confirmed the tuned 0.07s attack / 0.05s
   release ramp feels right after the "too controller-y" first pass (0.14s/0.09s). No further
   action unless new feedback comes in.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).  
Closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, PLAY-1, …) live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 Post-gate |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked on MAIN-1 |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**Stabilize in place** — keep Playtesting & stabilization until Wyatt advances. Completed
evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1) stays on the board as proof, not as RC entry.
When named: other residual or RC exit criteria in [ROADMAP.md](./planning/ROADMAP.md).

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

- **D-COUNTDOWN-SYNC-1-CLOCK** (07-21): The non-host `game_start` path initially
  stamped `countdownStartedAtMs` in the Party-clock domain, while HUD `adjustedNow()` uses
  the host-clock domain. It now anchors the timestamp with
  `getRoundClockNowMs() - Netcode.getHostClockOffsetMs()`; the Party-based
  `startsAtLocalMs` remains the already-past-GO gate. COUNTDOWN-SYNC-1 catch-up stays as
  the stall safety net. Needs Wyatt's multiplayer playtest + countdown-phase F8 capture.
- **D-COUNTDOWN-WARM-1** (07-21): Round-start/countdown jank root-caused — the fly-over
  camera hard-cuts to a never-before-rendered wide/high orbit right at countdown start,
  paying a real shader/composer cost the existing warm-up (from the menu/follow camera only)
  never covered. Fixed with a second, hidden warm-up pass from that framing
  (`camera.js getCinematicCountdownWarmupPose` + `main.js warmupActiveSceneShaders`)
  instead of Wyatt's proposed 2s-camera-delay — same instinct (move the cost off the
  timing-critical path), more targeted (fixes it at the source, adds no visible round-start
  delay). Tab-out latch (`hiddenDuringGap`) independently confirmed working on a real 6.55s
  backgrounding event this round — validates all prior A1 "not backgrounding" readings.
  Needs Wyatt's playtest + a countdown-phase F8 to confirm the stall is actually gone.
- **D-COUNTDOWN-SYNC-1** (07-21): The real countdown complaint ("skips", "never in sync")
  was beat-timing desync, not the frame-stutter COUNTDOWN-WARM-1 fixed — GO fires on an
  edge-detected phase transition independent of the frame-polled digit display, so a stall
  spanning the last digit-window skips announcing "1" entirely. Fixed in `hud.js
  updateStatus()`: retroactively fires the missed beat 220ms before GO, generation/phase-
  guarded. Presentational only — round-start timing (gameplay unlock) untouched.
- **D-HOSTHITCH-1** (07-20): A1 forensics on existing captures found the "1–8s host freeze
  while focused" residual may be partly a measurement artifact — `hidden`/`focused` sample
  after the stall, not during it. Long Task coverage on the multi-second gaps is 0.3–26%
  (idle, not busy) vs 94–106% on genuine sub-second stalls. Latched `hiddenDuringGap`/
  `blurredDuringGap` added to `perf/longframe` events; verdict needs a fresh F8 capture, not
  yet available. Do not treat "GPU-bound host" as confirmed until that retest.
- **D-SHIP-1** (07-20): SHIP-1 created as a living finish line — pre-ship tiers A–E ([planning/SHIP-1.md](./planning/SHIP-1.md)); full backlog ships (no cut-down RC); new findings slot into tiers; no netcode/god-file rewrites pre-ship.
- **D-TRUTH-1** (07-20): Command Center Truth Reset — STATUS owns declared phase only; evidence never auto-advances phase; collectors own HEAD/gates; battery reports carry provenance + completeness.
- **D-READY-1** (07-20): Lobby readiness is an idempotent **SET** on the wire, not a toggle. `MSG.readyToggle` gains additive `ready: boolean`; client quickplay/solo auto-ready is a lobby-phase reconcile.
- **D-CONTENT-1** (07-17): Pure-data arena catalog is the client authoring source for labels/themes/music/ambience/unlocks.
- **D-HARDEN-1** (07-13): Pre-playtest council hardening — SD replay-tiebreak; `sd_win` latch; Rapier `castRay` exclude-object fix; quickplay rematch re-entrancy; `suddenDeathPulse` leak.
- **D-NET-CLK-MIG** (07-12): NET-CLK-1 dual clocks, NET-CLK-3 round-clock stamps, NET-MIG-1 kill-credit `attr` on promote.
- **D-TERM-1** (07-12): Terminology pass — [style-guide.md](./style-guide.md) canonical.
- **D-STAB-2** (07-11): Quickplay arena rotation deferred; rematch-seam recipe documented.
- **D-STAB-1** (07-11): Stabilization pass — wheel roll, boost-bar leak, podium +20%, menu pacing, knip zero-ignore.
- **D-PERF-3** (07-11): Honest `three`/`animejs` chunks; BUNDLE-1 blocked.
- **D-GP4-1** (07-11): Pass 4 gameplay/AI surgical fixes; critical-hit basis + rubberband intensity kept.
- **D-VFX-2** (07-11): Flicker root = half-res float bloom mips; `bloomfix` = byte mips, display-referred bloom.
- **D-VFX-1** (07-11): Offline blackframes blind to ANGLE quirk; live probes `?blackmon=1`.
- **D-PERF-1/2** (07-11): Dev level-swap cost is a Vite artifact; arena-chunk prefetch shipped.
- **D-VIS-1/2/3, D-DOC-1** (07-11): LAAS process-only; WebGL+Playwright harness; AGENTS.md restored.

## Hard rules digest

- Do not re-open items under **Verified healthy / non-issues** in [project-state.md §5](./planning/project-state.md) without new evidence.
- Naming: UI says Cart Clash; storage/Worker IDs stay `cartRave*` until deliberate migration.
- Solo polish before deep multiplayer features (ROADMAP philosophy).
- No silent pure-black WebGL frames as an accepted “look”.
- Prefer quality-preserving perf fixes; measure before and after.
- Behavior-changing work requires a human playtest before it counts as done.
- **Phase marker is manual** — agents report eligibility; Wyatt advances ▶.

## Gotchas (append-only)

- EffectComposer path: RenderPass → Bloom → OutputPass → Arcade(VHS) → FXAA. `renderer.toneMapping` is a no-op into composer RTs without OutputPass.
- VHS is level-gated via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform without killing arcade CRT.
- Half-res bloom RTs: strength compensated via `bloomHalfResStrengthMul`.
- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Joining quickplay mid-round runs a cold world bootstrap that blocks the main thread;** resume-guard (`dt>0.25s → accumulator=0`) can starve input sampling → cart frozen at spawn until clear. This is NET-2 class — harness documents it ([guides/netcode-harness.md](./guides/netcode-harness.md)).
- **Netcode 2-client rig:** two clients MUST be separate `chromium.launch()` processes; add per-page focus + `?perfPump`. Prefer persistent `npm run dev:local` via `--url`.
- `localStorage` keys remain `cartRave*` until brand migration.
- Rapier WASM: standard build default; SIMD opt-in only (borrow error).
- Concurrent agent sessions may `git add -A` — commit surgically when working alongside one.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.
- Battery reports without provenance are visible history only — never green readiness evidence. Prefer complete exact-HEAD runs.

## Last updated

2026-07-21 (WRAP — PERF-WARM play-entry freeze parked, handover written) — Two-turn chase
concluded. Ruled OUT (with span evidence, build `af0c936`): shader compile (`warm.compile`
4–23ms, `parallelCompile:true`), VFX anchors (all idempotent, `warm.anchors` <4ms), audio
kickoff (`warm.audioKickoff` <4ms). The residual host freeze is variable/cache-dependent
(cap-189: 400ms AFTER `carts-ready`, i.e. the first live round-start render, not the warm
block) and the non-host's is hardware-bound (7GB Gen11). LOW priority — countdown unaffected.
Attribution spans left in place (cheap, useful). Full context + next steps + capture recipe:
**[planning/PERF-WARM-handover.md](planning/PERF-WARM-handover.md)**.

2026-07-21 (VERIFIED — COUNTDOWN-ABORT-1 fixed) — Fresh quickplay countdown F8s on `cbb0c7f`
(caps 180/181 connecting, 184/185 after-round, both machines): **ZERO `countdownAbort`
events**, no countdown→lobby thrash (only legitimate next-round starts). Digit cadence clean —
non-host EVEN (1369/1198/1310ms) despite still hitting a 22s load freeze; host 2→1→GO even
(1200/1205). Held with both peers mid load-freeze — the exact flap condition. Countdown jank
CLOSED across 5 sessions. Residual (cosmetic, NOT the abort): a round-start load freeze
(cap-184 host: 1426ms main-thread at play-shader, ltSum=1403) can compress the first 3→2 gap
(209ms) — that's PERF-WARM (hardware-bound), tracked separately, no restart.

2026-07-21 (FIX — COUNTDOWN-ABORT-1: quickplay is continuous, seat humans ready) — Cancel
attribution (caps 175/176) named the trigger conclusively: `round_msg_lobby` aborts with
BOTH humans `isReady:true`, correlated with slot0 NPC↔human churn as the frozen non-host
(`8a8d0b`, 22s load freeze) re-seated. Root cause: `#assignHumanToSlot` seated a (re)joining
human `isReady:false` ([party/index.ts:361](../party/index.ts)), and the server aborts the
armed countdown on ANY live-human-unready ([party/index.ts #cancelCountdownIfNeeded](../party/index.ts)).
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
([planning/SHIP-1.md](./planning/SHIP-1.md)); BACKLOG rows tagged `[SHIP-1 A–E]`; new IDs
HOST-CAP-1 / SRV-TEST-1 / NET-SIM-1 / CART-MODEL-1 / ONBOARD-1.

2026-07-20 (NET-SD-1) — Sole-leader self-fall / untied wipeout crowns fallback winner.
**Unpushed** with NET-PRES-1 until ship.

2026-07-20 (NET-PRES-1) — Event-id presentation dedupe: host stamps `eid` on falls/collisions;
clients skip seen ids. Loss-on-drop residual accepted. **Unpushed** until ship.

2026-07-20 (battery) — Complete core suite **5/5 green** (`cart-clash-core-v1`, report `battery-2026-07-20T20-11-15-661Z.json`, ~10m): gameharness 41/41 · spawnlock 4/4 · mpIntegration 18/18 · hostMigration 7/7 · teardownRejoin 8/8. Ran on dirty tree (Truth Reset WIP); `ready=no` until clean exact-HEAD re-run post-push. Evidence → `npm run dashboard`.

2026-07-20 (Command Center Truth Reset — applied) — Declared phase **Playtesting & stabilization**; RC → todo. Forensic Jul 19–20 log archived. Battery provenance + health v4 (declared/observed/readiness). Challenge analytics reads `isComplete`.

> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-07-19 → 07-20 — [archive/status-log-2026-07-19-to-20.md](./archive/status-log-2026-07-19-to-20.md)
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
