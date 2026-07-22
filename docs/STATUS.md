# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: declared project
phase, mission, blockers, and what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current for declarations?** Yes — this file owns phase, mission,
active card, blockers, and phase-exit checklist. **Observed evidence** (git HEAD, qa/battery
results, dirty state) lives in the generated Command Center — run **`npm run dashboard`**
(`.diag-captures/dashboard.html` + `health.json`). Do not hand-maintain gate/HEAD claims here.

> **Rehydration protocol** (agent or human resuming cold — this list is the single source; other docs link here):
> 1. Read [BRIEFING.md](./BRIEFING.md) — generated, committed, always in git: phase · the one active item · do-nots.
> 2. Read root [AGENTS.md](../AGENTS.md) for standing rules, invariants, and how work is executed (canonical).
> 3. Read **this file** for declared phase / mission / blockers / gotchas detail.
> 4. If you can run npm: **`npm run dashboard`** → `.diag-captures/health.json` / Command Center HTML for **observed evidence** (git HEAD, gates, captures). File-only tools skip this — BRIEFING.md carries the declared essentials.
> 5. Read [planning/ROADMAP.md](./planning/ROADMAP.md) + [planning/BACKLOG.md](./planning/BACKLOG.md) only for open future work.
> 6. Do not re-plan from scratch; do not re-open settled decisions ([archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md)) without new evidence.
> 7. Update this file after every meaningful step, then run `npm run briefing` — one-line decision index entries here, long rationale in the decision log.
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

**Playtesting and stabilization.** ▶ **A6 / NET-SIM-1** (reconnect / socket-lifecycle sims). A6a done (unpushed): `setReapOverrides` + party-do silent-reap + ghost-exorcism (4010). A6b done (unpushed): netharness `hostReload` (promote + rejoin-as-client + menu-not-stuck). A5 pushed (`67e6bea`). Countdown/MP-FX/ARENA-COL/Intel-as-host PASS (07-22).

Run 7 mission closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). Stay in this phase until Wyatt advances the marker.

Playtest console: [playtest/console.html](./playtest/console.html).  
F8 → auto-upload; pull: `npm run captures:pull` (needs `.env.local` `ERROR_LOG_TOKEN`).

### Do not

Standing prohibitions — fed into [BRIEFING.md](./BRIEFING.md) and the Command Center firewall.

- **Plan → Wyatt ack → apply.** BRIEFING's active-card heading names the card — it is **not** a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to [BACKLOG](./planning/BACKLOG.md), not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

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
| **A1** COUNTDOWN-WARM-1 | fly-over camera shader/composer stall | ✅ PASS (Wyatt playtest 07-22) |
| **A1** COUNTDOWN-SYNC-1 | non-host countdown clock-domain sync | ✅ PASS (Wyatt playtest 07-22; empty quickplay edge case logged to BACKLOG) |
| **A1** Intel-as-host capture | original chronic-freeze question | ✅ PASS (Wyatt confirmed 07-22) |
| **A2** INPUT-KB-1 | keyboard digital-to-analog ease + menu nav | ✅ confirmed good by Wyatt |
| **A3** MP-FX-1 | non-host gameplay VFX parity | ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host) |
| **A4** ARENA-COL-1 | Cart Rave pit KO detection & kill-zone reliability | ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → buildKOEvent) |
| **A5** SRV-TEST-1 | Direct tests for party decision cores | ✅ **done** (A5a helpers + A5b DO harness; 739 tests) |
| **A6** NET-SIM-1 | Reconnect / socket-lifecycle sims | ▶ **A6a+A6b done** (party-do silent-reap/ghost 4010 + netharness `hostReload`); waiting Wyatt ack to close A6 |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

Historical Run 7 evidence (closed):

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

1. Wait for Wyatt to name the next card (Tier A leftover: **A6** reconnect sims / **A7** ANLX-VIEW-1), or say go.
2. Pre-ship ordering lives in [planning/SHIP-1.md](./planning/SHIP-1.md) (tiers A–E; no deadline).

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

- **D-ARENA-COL-1** (07-22): Cart Rave pit KO reliability (ARENA-COL-1) PASS — rim entry `fallEntryPos` / `fallEntryTimeMs` feed `buildKOEvent` as `{ classifyPos, creditTimeMs }` so 30m shaft drift and ricochet delay no longer misclassify center_hole or expire hit credit. Wyatt playtest confirmed.
- **D-MPFX-1** (07-22): Non-host gameplay VFX parity (MP-FX-1) PASS — synced `isChargingBoost` via snapshot flag bit 16 through interp scratch; remote hop-land thud/dust via takeoff-anchored vy heuristic + bridged `onHopLand`. Wyatt 2-browser playtest confirmed opponent charge glow + hop land FX.

- **D-COUNTDOWN-1** (07-22): Countdown sync (COUNTDOWN-SYNC-1), flyover warm-up (COUNTDOWN-WARM-1), and Intel host capture confirmed PASS by Wyatt. Empty quickplay countdown edge case (COUNTDOWN-QUICKPLAY-1) documented and parked in BACKLOG.

- **D-ARCH-1** (07-21): Living architecture layer — `npm run arch` generates committed
  `docs/ARCHITECTURE.json` (agent manifest: 18-system taxonomy claiming every src/party/shared
  file exactly once, dependency edges from control-flow.md, fragile systems, pitfalls,
  `do_not_break`) + `.diag-captures/architecture.html` (human map on the Command Center).
  Taxonomy curated in `tools/lib/archMap.mjs`; stats (lines/churn) live in HTML only, never
  the digested JSON. Drift gates in health:check: `ARCH_UNMAPPED_FILE` (new unclaimed file),
  `ARCH_MISSING_FILE`, `ARCH_DUPLICATE_CLAIM`, `ARCH_STALE`. `Game_Architecture.md` demoted to
  narrative companion. Runs inside `npm run qa`.
- **D-PARITY-1** (07-21): Operational parity across AI tools — new generated+committed
  `docs/BRIEFING.md` (from STATUS.md, `npm run briefing`, digest-gated by `health:check`)
  replaces the retired `handoff-next-window.md` as the cold-start door every tool can read;
  do-nots moved into STATUS `### Do not`; per-tool pointers (CLAUDE/GEMINI/GROK/.cursorrules/
  `.cursor/rules/cart-clash.mdc`) thinned to defer to AGENTS.md; AGENTS.md gains
  "How work is executed" (one card · ~45-min/3-attempt timebox · escalation ladder) + a
  paste-able session opener; status-size budget 8k + per-date-window density check.
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

2026-07-22 (process — plan→ack→apply firewall) — Cold-start docs made the A6b skip
impossible to miss: BRIEFING tag **ACTIVE CARD** (was DO THIS NOW) + explicit
"not permission to edit"; STATUS Do-not #1; AGENTS HOW WORK step 0; paste-able opener.
Lesson: buried STANDING bullets lose to a loud "do this now" heading.

2026-07-22 (A6b — netharness `hostReload`) — Mid-round host tab reload scenario:
survivor promotes, reloaded tab rejoins as non-host (sole-host), menu not stuck over game
(`menuVisible`/`axisWired`), both drive, zero sim errors. **13/13 live.** Wired into battery
core (now 6/6). Blocker fixed en route: COUNTDOWN-ABORT-1 seated quickplay `isReady:true`
but `colorPick` never called `#checkAllReady()` → forever lobby (client auto-ready no-ops);
party-do covers continuous-mode `game_start`. A6a+A6b unpushed; A6 waiting Wyatt ack to close.

2026-07-21 (ARCH — living architecture intelligence layer) — Extends the Command Center with a
generated codebase map, both machine- and human-facing. New `npm run arch` (in `qa` + dashboard
chains) builds committed `docs/ARCHITECTURE.json` (agent manifest) + `.diag-captures/architecture.html`
(interactive map: SVG flow graph with typed edges, per-system telemetry cards, file→system lookup,
risk/debt + priorities panels). 18-system taxonomy in `tools/lib/archMap.mjs` claims all 163
src/party/shared files exactly once — a new unclaimed file red-gates `health:check`
(`ARCH_UNMAPPED_FILE`), so the map stays live. Digest excludes line/churn stats (HTML-only) so the
committed JSON doesn't churn every commit. `qa` 705 green. See D-ARCH-1.

2026-07-21 (PARITY — unified cold-start across AI tools) — Root cause of "every tool behaves
differently": each entered through a different, differently-stale door (gitignored dashboard,
418-line STATUS, 07-20 handoff doc, drifted per-tool files). Fix (D-PARITY-1): committed
generated `docs/BRIEFING.md` + digest freshness gate in `health:check`; handoff doc retired
to archive; STATUS log dieted (07-20→21 entries → [archive/status-log-2026-07-20-to-21.md](./archive/status-log-2026-07-20-to-21.md));
`status-size` budget 8k + dense-window check; pointer files thinned (+`GROK.md`,
`.cursor/rules/cart-clash.mdc`); AGENTS.md "How work is executed" + paste-able opener.

2026-07-21 (PERF-WARM — root cause CONFIRMED; host-countdown-gate fix TRIED & REVERTED) —
The round-start freeze that eats the 3-2-1 is now attributed with certainty, and the
"first live fly-over render" theory from the prior WRAP entry is **wrong** (that probe,
`render.roundStart`, is 5.6ms — exonerated). New per-call-site render spans (build `936477a`)
name the owner: **`warm.render.default.play-full`** — a **quickplay arena-rotation warmup**
(`warmupActiveSceneShaders({forPlay:true})`, full compile budget, no `warm` flag, no loading
overlay; [main.js ~2901](../src/main.js) `rotateLoadedArenaInPlace` + [levelManager.js:276/285](../src/levelManager.js)).
Its first `composer.render()` (**128ms warm 4090 → 1921ms cold**, cap-190/196) runs a
main-thread block that **overlaps the already-running countdown** (cap-196: `lobby→countdown`
at t=25920, block at t=27126, between `countdown_2` and `countdown_1`; `countdown_3` dropped).
Trigger: the room's arena differs from the local play-entry pick, so a rotation drains right
after `carts-ready` — concurrent with the countdown. Non-host case stays hardware-bound (Gen11,
34–38s, mostly non-JS paging).
**Fix attempted (`04c714e`) and REVERTED (`c8df8fd`):** gating the host MP countdown on
`whenArenaRotationSettled()` (mirroring the non-host apply path). It **regressed first-join** —
brought back the ready-up screen (which is meant to be gone) and/or the round starting with no
countdown at all. **DO NOT re-try the host-countdown gate.** Net code state now = session start
(`2a927b9`) **+ diagnostics only** (behavior-identical; verified by diff). Live spans added:
`render.roundStart`, `warm.render.default{.play-warm|.play-full|.menu}`, `warm.render.flyover{…}`.
If a future fix is wanted, the lever is **pre-warming the room's arena programs before the
countdown** (so the rotation render is cheap), NOT delaying countdown start. Deployed `c8df8fd`.

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

> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-07-20 → 07-21 — [archive/status-log-2026-07-20-to-21.md](./archive/status-log-2026-07-20-to-21.md)
> - 2026-07-19 → 07-20 — [archive/status-log-2026-07-19-to-20.md](./archive/status-log-2026-07-19-to-20.md)
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
