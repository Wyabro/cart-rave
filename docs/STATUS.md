# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: project health, what's
done, what's blocking, what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current?** The health table is refreshed per-session but can still
lag HEAD — prefer `git log` + `npm run qa` for the last word. For the live, auto-generated
view of everything at once — gates, open captures, active queue, agent briefing, what to
work on next — run **`npm run dashboard`** (the **Command Center**,
`.diag-captures/dashboard.html` + `health.json` for agents). This file stays canonical;
the Command Center is the generated first-stop view of it.

> **Rehydration protocol** (agent or human resuming cold):
> 1. Read **this file** fully.
> 2. Read root [AGENTS.md](../AGENTS.md) for standing rules and invariants (canonical).
> 3. Read [planning/project-state.md](./planning/project-state.md) for the architecture snapshot.
> 4. Read [planning/ROADMAP.md](./planning/ROADMAP.md) + [planning/BACKLOG.md](./planning/BACKLOG.md) only for open future work.
> 5. Do not re-plan from scratch; do not re-open settled decisions ([archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md)) without new evidence.
> 6. Update this file after every meaningful step — one-line decision index entries here, long rationale in the decision log.
>
> Doc map: [docs/README.md](./README.md) · Dev toolkit (umbrella): [guides/dev-toolkit.md](./guides/dev-toolkit.md) · Observability (capture · analytics · dashboard): [guides/observability.md](./guides/observability.md) · Visual QA: [guides/visual-qa.md](./guides/visual-qa.md) · Netcode harness: [guides/netcode-harness.md](./guides/netcode-harness.md) · Diagnostics: [guides/diagnostics.md](./guides/diagnostics.md) · Naming freeze: [brand.md](./brand.md)

## Mission (1 paragraph)

Ship **Cart Clash** Version 2: a polished solo-first 4-player shopping-cart physics brawler
(Three.js + Rapier + partyserver on Cloudflare). Product name is Cart Clash; Worker/host IDs
stay `cart-rave` until domain cutover. Prefer evidence (screenshots, black-pixel samples,
two-browser smokes) over vibes for graphics and multiplayer gates.

### Release phases

Orientation only — advance the ▶ marker when a phase's exit condition is met (Command
Center renders this strip; one ▶ at a time).

- ✅ Foundation — engine, arenas, carts, physics
- ✅ Core gameplay — KOs, scoring, Living Store, solo AI
- ✅ Multiplayer — P2P netcode, host authority, migration
- ✅ Production systems — passes 1–5, tooling, observability
- ▶ Playtesting & stabilization — Run 7, one card at a time
- ⬜ Release candidate — queue drained, NET-1 green, tech-debt triage
- ⬜ Ship — domain cutover, external testers, wide URL

## Project health — 2026-07-19 (code-first; re-verify with `npm run qa` / `npm run dashboard`)

**Green gates, deployed, ready for the playtest checkpoint.** Implementation is ahead of
validation. Single biggest V2 risk: **NET-1 two-browser full-round smoke never closed by a
human** (the automated `mpIntegration`/`hostMigration` rigs pass, but they aren't that gate).

| Signal | State |
|---|---|
| Gates (`npm run qa`) | ✅ typecheck + tests + knip clean — **554/57** last known at countdown residual ship — re-run `npm run qa` if claiming green after edits |
| Automated rigs (`npm run battery`) | ✅ **5/5 green** last full run 2026-07-19 combat stack (report `.diag-captures/battery-2026-07-19T03-48-42-410Z.json`) |
| Origin HEAD | Local ↔ origin/cart-clash at **`60d773e`** — wire isSessionPlayReady (cap-63) |
| Prod deploy (2026-07-19 night, hold actually wired) | ✅ Live — **bundle `index-BQhnh1Z_.js`**, sha **`60d773e`** (served: index.html → new bundle; sha + `isSessionPlayReady` present). Cap-63: bridge now forwards ready gate so countdown hold runs. **Joiner F8 retest = open gate.** |
| Prior deploys (07-17 → 07-19) | ✅ superseded — incl. `index-CRQwILqC.js`/`5a1caee0`/`03218fa`; dated log + [archive/](./archive/README.md). Only the row above is current truth. |
| Wyatt playtest queue | ⚠️ Behavior-changing batches still need eyes-on (see queue below) — resuming 2026-07-18 |
| Multiplayer live smoke (NET-1) | ❌ Open — the Version 2 gate (two real humans, full round) |
| Black-frame flicker (VFX-1) | ✅ Display-referred byte bloom is the all-arena default (`adea4bf`); blackframes classic+sundial pass (07-17). Optional real-HW `?blackmon=1` taste pass |

## Major systems completed

Full record: [planning/production-passes.md](./planning/production-passes.md) and
[planning/completed-work.md](./planning/completed-work.md).

- **Core game** — host-authoritative MP + rewind-and-replay prediction; solo reuses the same path (private room + 3 NPCs); 3 elevated arenas; 2.5-min rounds + Sudden Death.
- **Presentation** — sticker-language menus/HUD/overlays, Store PA announcer (full 61-take recorded voice pack, 07-16), attract-mode menu, per-arena bloom, VFX/audio juice (Pass 5), distinct Defeat screen.
- **Arena audio** — per-arena ambient beds + reactive Cart Rave crowd (excitement meter) + Sudden Death tension layer ([ambience.md](./reference/ambience.md)); per-arena music, multi-song-per-level, loudness-matched set ([music.md](./reference/music.md)). Both data-driven (07-16).
- **Gameplay/AI** — Pass 4 bot fixes (stall/latch), proximity aggression, Sundial rim nav + podium contest, intensity-scaled ram SFX.
- **Systems** — Living Store (cargo scoreboard + PA directives), scoring/KO event fan-out, lifetime unlocks, challenges, match stats.
- **Performance** — 3-tier quality system, arena optimizations, chunk prefetch, boot/load pass, half-res bloom, LOD, auto-quality.
- **Netcode hardening** — WebRTC P2P plane with bounds-checked binary snapshots, size gates, unit-tested host-migration handoff + `host_round` validation.
- **Tooling** — visual QA harness (`shoot`/`compare`/`blackframes`), `?bloompipe=`/`?blackmon=` probes, Tweakpane debug panel, netcode 2-client rig (`netharness` — `spawnlock` + `mpIntegration` + `hostMigration`), gameplay diagnostics framework (`?diag` → `__ccDiag` + `gameharness` — `roundflow`/`unlockFunnel`/`arenas`/`soak`), bug-capture bundles (`captureBundle` / F8 / auto-capture on error+assert / `.diag-captures/`), dev-only AI stall watchdog, `cr:*` boot timeline, `resources` leak probe, phase-invariant watchdog, **`npm run battery` one-command sweep** ([guides/dev-toolkit.md](./guides/dev-toolkit.md)), CI gate, **observability platform** — production gameplay analytics (`src/analytics/` → `/api/analytics` DO) + **`npm run dashboard`** generated health view ([guides/observability.md](./guides/observability.md)).

## Current focus

**Run 7 — NH-HIT** (non-host hit delay; lever 1 optimistic FX). Cold handoff:
[planning/handoff-next-window.md](./planning/handoff-next-window.md).

Playtest console: [playtest/console.html](./playtest/console.html).  
F8 → auto-upload; pull: `npm run captures:pull` (needs `.env.local` `ERROR_LOG_TOKEN`).

### Done when (this mission)

Run 7 closes — and the Release-candidate phase starts — when every box checks:

- [x] Combat stack validated live (cap-16 retest: skips 0, hits land, localKos > 0)
- [x] P0 menu freezes: idle-shader warm + F8 caps 52–54
- [x] P0 countdown host path: audio warm + abort/400ms stack shipped; host F8 58 felt good
- [x] P0 non-host countdown hold: shipped `60d773e` / `index-BQhnh1Z_.js` — **PASS F8 64–67** (countdown only after `carts-ready`; full 3-2-1 both sides; 0 LF during countdown)
- [x] P1 late-round gap storm re-scoped (F8 **68–71** / `60d773e`: receive ≈ send; no o100 117 storm)
- [x] P2 non-host localKos:0 closed (Wyatt: can get kills; F8 69/71 localKos≥1) — other non-host feel issues stay separate cards
- [x] P3 friend join resume hitch closed (Wyatt N — not felt on `60d773e`)
- [x] P4 solo rematch hitch closed (Wyatt “pretty good” + F8 72–74: no rematch 8s LF; seed was cap-41 8s)
- [x] **NH-STATS** non-host "my stats" broken in MP — shipped `b92d87f` / `index-BgZqxXtu.js`, Wyatt **PASS**
- [x] **NH-BOOST** non-host boost bar/fire/trails/SFX — v3 `0be4cd5` / `index-CDlK3jio.js`, Wyatt **PASS**
- [x] **NH-SMOOTH** non-host driven cart glides — v4 partial (visual better); residual parked
- [x] **NH-HIT lever 3** host-quality lobby rebalance — **PASS** on `80ecbf6` / `index-DWDp_cX_.js` (HOST-ROLE-1)
- [x] **NH-HIT** — lever 3 PASS (HOST-ROLE-1); lever 1 kept; residual hit-feel **parked** (Wyatt not 100% happy — revisit only if named)
- [ ] P5/P6 taste — later
- [ ] RC behavior-changing fixes human-validated in MP (AI cautious-phase #1, host-reap #6, READY-SET)
- [ ] NET-1 two-human full-round smoke green (the V2 gate) — **near last**, after churn stops

### Active queue (strict — one at a time)

| # | What | Status |
|---|------|--------|
| 1…2d′ | Prior combat stack | ✅ shipped (death spiral → skip-gap) |
| 2e lab | Host hitch + tHost honesty | ✅ lab pass |
| **P0–P4** | countdown · gap storm · localKos · join hitch · rematch | ✅ **CLOSED** |
| **NH-STATS** | **Non-host "my stats" broken in MP** | ✅ **PASS** `b92d87f` / `index-BgZqxXtu.js` |
| **NH-BOOST** | **Non-host boosts / bar / SFX** | ✅ **PASS** `0be4cd5` / `index-CDlK3jio.js` |
| **NH-SMOOTH** | **Non-host driven-cart glide** | ✅ **partial** v4 (visual better) — residual parked |
| **NH-HIT** | **Non-host hit delay (ram FX late)** | lever 3 **PASS**; residual **parked** (not 100% — no more levers unless named) |
| **NET-1** | **Two-human full-round smoke** | ▶️ **active** — Wyatt chose now; core loop on prod first |
| P5 | Solo bot/rim death feel | after NET-1 or named |
| P6 | AI diag probe empty mid-round | tooling only |

Historical: [playtest-triage-2026-07-17.md](./planning/playtest-triage-2026-07-17.md) … [run6](./planning/playtest-triage-2026-07-18-run6.md).

### Next actions

1. **NET-1 Match A decoded** (4090 host / Intel joiner, `80ecbf6`, caps 95–100). Soft-pass feel; **S1:** rematch non-host spawn-off-edge (cap-100 fall ~1.5s after GO). **Next human step: Match B** (Intel hosts) before any code.
2. Cap-47 LT / NH-HIT residual parked.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).

| ID | Issue | Status |
|----|--------|--------|
| HOST-ROLE-1 | Weak host poisons every peer | ✅ **Lever 3 PASS** `80ecbf6` / `index-DWDp_cX_.js` — lobby migrates to stronger machine (not network). |
| NET-1 | Two-browser full-round smoke | ❌ **The V2 gate.** Code hardened + unit-covered (`1dbb48a`, `6ee9c0b`); live checks never run. Hazard catalog: [netcode-deep-dive.md](./planning/netcode-deep-dive.md). Now has an automated 2-client complement: [netcode-harness.md](./guides/netcode-harness.md) |
| NET-2 | Quickplay join = frozen cart + slow load | 🟡 **Partial + warm Solo fix (pushed `e25d555`):** Wyatt `cr:*` marks showed world warm ~0.6s but play-entry→carts-ready ~9.8s (shader `compileAsync` up to 8s). Warm same-level path now caps compile poll at **1.5s**; default cap **4s**; fine marks `play-arena-done` / `play-cart-glb-done` / `play-carts-spawned` / `play-shader-start|end`. Still needs live feel + cold/quickplay check. |
| VFX-1 | Black-frame flicker | ✅ **Closed (07-17)** — display-referred byte bloom is the all-arena default (`adea4bf`, since 07-13); the flickery half-res float path is `?bloompipe=hdr`-only. `blackframes` classic+sundial pass. Optional real-HW `?blackmon=1` taste pass |
| PLAY-1 | Playtest debt | ⚠️ Passes 4/5 + stabilization all behavior-changing and unvalidated by a human |
| NET-MIG-2 | Ghost exorcism can null the host | ✅ Fixed 2026-07-14 + residual 2026-07-16 (promote reconnecting conn post-exorcism) |
| NET-CLK-1 / CLK-2 / CLK-3 / MIG-1 / BUF-1 | Clocks, kill credit, spawn buffer domain | ✅ Closed in code (see netcode-deep-dive) |
| NET-MIG-3 | Freeze ends before new host DataChannel | ❌ Open — ghost colliders / rubber-band feel |
| NET-PRES-1 | Fall/collision tail not event-deduped | 🟡 Partial — falls[] 600ms per-victim dedupe + collision FX 250ms pair-key dedupe shipped (07-16 audits); proper event-id dedupe still open |
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 Post-gate — [BACKLOG Tech Debt](./planning/BACKLOG.md#tech-debt) |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked on MAIN-1 + NET-1 (D-PERF-3) |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**“Validated V2 candidate”** — everything implemented is proven, live:
playtest queue drained → bloom fix promoted (or tuned) → NET-1 two-browser smoke green
incl. host migration + Living Store checklists. Static Critical hazards (NET-MIG-2 etc.)
are closed in code; remaining risk is live proof + NET-MIG-3 feel. After that milestone
the remaining V2 work is scoped content/infra (domain cutover, ship checklist), not risk.
Structural modernizations (MAIN-1, DIR-1, GLTF-1, TS-1) wait until this gate is green —
see [BACKLOG Tech Debt](./planning/BACKLOG.md#tech-debt).

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

- **D-READY-1** (07-20): Lobby readiness is an idempotent **SET** on the wire, not a toggle. `MSG.readyToggle` gains additive `ready: boolean` (absent = legacy toggle for the friends READY button); server no-ops a SET matching current state. Client quickplay/solo auto-ready is a lobby-phase reconcile (hello/slots/round/countdownCancel hooks, own-slot-unready guard, 1200ms cooldown) replacing the per-connection one-shot. Root cause of the mpIntegration rematch stall: a reconnect re-seats un-ready after `playAgain`'s ready-all with no client resend path, and toggle semantics let any client auto-ready crossing the server's ready-all flip the sender back to un-ready.
- **D-CONTENT-1** (07-17): Pure-data arena catalog is the client authoring source for labels/themes/music/ambience/unlocks; explicit Vite importers, Worker arena IDs, menu markup, presentation tuning, and hazards remain in their existing ownership boundaries and are guarded by contract tests.
- **D-HARDEN-1** (07-13): Pre-playtest council hardening (`b307402`) — SD same-frame-double-fall wedge resolved by replay-tiebreak (not draw/deterministic-winner); `sd_win` latch before `endRound` clears SD; Rapier `castRay` exclude-object fix in `isCartGrounded` + camera occlusion; quickplay rematch re-entrancy gate; `suddenDeathPulse` countdown leak. Hidden-tab crossfade `setLevelSwapping` hold deferred.
- **D-NET-CLK-MIG** (07-12): NET-CLK-1 dual Party/host clocks, NET-CLK-3 round-clock hit/directive stamps, NET-MIG-1 kill-credit `attr` on promote (`a0475d6`). Remaining structural suggestions cataloged in BACKLOG Tech Debt (MAIN-1, DIR-1, GLTF-1, …).
- **D-TERM-1** (07-12): Terminology pass — [style-guide.md](./style-guide.md) is canonical for all wording (Arena/Round/Boost/KO/Lobby/Quickplay rulings + rationale); player copy aligned; `combo_t2` unlock hint mislabel (RAMPAGE→SAVAGE) fixed.
- **D-STAB-2** (07-11): Quickplay arena rotation deferred; rematch-seam recipe documented.
- **D-STAB-1** (07-11): Stabilization pass — wheel roll travel-based, boost-bar leak, podium +20%, menu pacing, dead-code purge; knip zero-ignore.
- **D-PERF-3** (07-11): Honest `three`/`animejs` chunks via `codeSplitting.groups`; BUNDLE-1 declared blocked.
- **D-GP4-1** (07-11): Pass 4 gameplay/AI surgical fixes; critical-hit basis + rubberband intensity deliberately kept.
- **D-VFX-2** (07-11): Flicker root cause = half-res **float bloom mips** (Wyatt HW A/B); `bloomfix` = byte mips, display-referred bloom.
- **D-VFX-1** (07-11): Offline blackframes battery is blind to the ANGLE quirk (software GL); live probes `?blackmon=1` + `?rtmode=` shipped.
- **D-PERF-1/2** (07-11): Dev level-swap cost is a Vite artifact — do not chase; arena-chunk prefetch shipped.
- **D-VIS-1/2/3, D-DOC-1** (07-11): LAAS process-only borrow; WebGL+Playwright harness; `?cam=` implies freeze; AGENTS.md restored (STATUS ≠ AGENTS).
- *Unlogged-at-the-time (reconstructed):* Pass 5 waves 1–3; netcode test punch list closed; Rapier SIMD made opt-in after borrow error; per-arena bloom; menu backdrop gradient — see the [decision log](./archive/decision-log-2026-07.md#decisions-that-were-made-but-never-logged-in-status-reconstructed-2026-07-12).

## Hard rules digest

- Do not re-open items under **Verified healthy / non-issues** in [project-state.md §5](./planning/project-state.md) without new evidence.
- Naming: UI says Cart Clash; storage/Worker IDs stay `cartRave*` until deliberate migration.
- Solo polish before deep multiplayer features (ROADMAP philosophy).
- No silent pure-black WebGL frames as an accepted “look”.
- Prefer quality-preserving perf fixes; measure before and after.
- Behavior-changing work requires a human playtest before it counts as done.

## Gotchas (append-only)

- EffectComposer path: RenderPass → Bloom → OutputPass → Arcade(VHS) → FXAA. `renderer.toneMapping` is a no-op into composer RTs without OutputPass. (Storerooms now runs display-referred byte bloom after OutputPass — `98317c1`.)
- VHS is level-gated via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform without killing arcade CRT.
- Half-res bloom RTs: strength compensated via `bloomHalfResStrengthMul`.
- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it; `visibilityState: hidden` freezes the sim even with perfPump.
- **Joining quickplay mid-round runs a cold world bootstrap (Rapier + arena + shader compile) that blocks the main thread; while blocked the rAF loop is starved and the resume-guard (`gameLoop.js`, `dt>0.25s → accumulator=0`) zeroes the physics accumulator every slow frame, so the joiner never samples/sends input → cart frozen at spawn until it clears.** This is NET-2 (the "stuck cart" report), NOT a netcode bug — verified by the 2-client harness ([guides/netcode-harness.md](./guides/netcode-harness.md)). The joiner (unlike the menu path) skips the idle world-warm. The ~15s figure the harness reports is inflated by headless SwiftShader (no parallel shader compile); real hardware is faster but the freeze window is real.
- **Netcode 2-client rig:** two clients MUST be separate `chromium.launch()` processes (not two contexts) — Chromium throttles the non-foreground page to ~3fps and starves its sim loop. Also add per-page focus emulation + `?perfPump`. Run against a persistent `npm run dev:local` via `--url`; auto-start churn leaves zombie `workerd` on :8787. See [guides/netcode-harness.md](./guides/netcode-harness.md).
- `localStorage` keys remain `cartRave*` until brand migration.
- Playwright default headless shell can differ from full Chrome; tools request Chromium channel when available.
- Rapier WASM: standard build is the default; SIMD is opt-in only (borrow error, `8174180`).
- Concurrent agent sessions may `git add -A` — commit fast and surgically when working alongside one.
- Debug/harness surface map lives in [guides/visual-qa.md](./guides/visual-qa.md). General gameplay diagnostics: `?diag=1` → `window.__ccDiag` ([guides/diagnostics.md](./guides/diagnostics.md)).
- **Diagnostics globals namespace is `__cc*`** (`__ccTest` netcode, `__ccDiag` gameplay, `__ccLoopDbg` loop). `__cartRave*` is the visual-QA harness; `__cartClash*`/`CartClash*` are older one-off handles. New diagnostics belong under `__ccDiag` (probe + event log) unless they're netcode-specific.
- A round that ends with **no scores is a legitimate draw** → fires neither `victory` nor `defeat` (only `new_leader`/`go`/countdown in the PA log). A rig asserting a result callout must **score a winner first** (`__ccDiag.control.setScores`) — an un-scored fast-end is not a bug (bit the gameharness roundflow scenario on first run).
- Rapier `world.castRay(...)` reads `.handle` **off the exclude args itself** (`filterExcludeCollider ? filterExcludeCollider.handle : null`) — pass the **Collider/RigidBody objects**, never `collider.handle`/`body.handle`. A raw handle number is truthy, so `(number).handle` → `undefined` → exclusion silently disabled; with `solid=true` the ray then self-hits at toi 0. Bit `isCartGrounded` (grounded=true always) and the camera occlusion ray (`b307402`). Our carts type collider/body as only `{ handle }`, so the object pass needs an `any` cast at the call.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — never auto-send the bare form from client logic, only from the human friends-lobby button. Any programmatic ready must send `{ ready: true }` (idempotent SET, server no-ops repeats). A bare toggle crossing `playAgain`'s server-side ready-all flips the sender back to un-ready and the quickplay lobby stalls at `#checkAllReady` with no re-check event (the room goes broadcast-silent). Bit the mpIntegration rematch seam 07-20; the 1-in-6 flavor was a WS reconnect re-seating a client un-ready (`#assignHumanToSlot`) after the ready-all pass, with the old one-shot `didAutoReadyOnOpen` never re-sending.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-OWNED `envMap` reference actually scales IBL. `CONFIG.postFx.environment.materialEnvMapIntensity` / `refreshSceneEnvironmentMaterials` (scene.js) are silently inert as a result. Found while fixing the green-booth floor reflection (`arena.js clampFloorEnv` — floor mats get their own `envMap` at 0.25× to work around it); the rest of the scene still rides the dead per-material knob.

## Last updated

2026-07-20 (NET-1 Match A decode) — Caps **95–100** / `80ecbf6`. 4090 host felt great; Intel joiner playable-not-great. Countdown abort once then OK. **Anomaly:** rematch round 3 classic — joiner SELF CHECKOUT/TOOK A SHORTCUT ~1.5s after GO (cap-100 t≈366482; prior snap_gap 4148ms in countdown). Host send clean. Match B not run. **No code until Match B** (console rule). One S1 candidate: rematch spawn pose.

2026-07-20 (NET-1 active) — Wyatt chose NET-1. Prod `index-DWDp_cX_.js` / `80ecbf6`.

2026-07-20 (NH-HIT residual parked) — Wyatt not 100% on non-host hit feel; move on. No more NH-HIT levers unless named.

2026-07-20 (PASS NH-HIT lever 3 / HOST-ROLE-1) — Wyatt **pass** on prod `index-DWDp_cX_.js` / `80ecbf6` (Intel creates → 4090 steals host).

2026-07-20 (READY-SET fix — closes the rematch-seam card from the crown-race entry below) — mpIntegration quickplay rematch stall (1-in-6, lobby held ~48s) root-caused + fixed: idempotent ready SET (D-READY-1). `party/index.ts` readyToggle SET semantics + `src/netcode.js` lobby ready-reconcile. Verified: 5× battery mpIntegration 18/18 green (a toggle-based v1 failed 3/3 — the toggle race is real, not theoretical); qa 568/568. **Behavior-changing (quickplay/solo ready path) → needs the standard human MP playtest + prod deploy.**

2026-07-20 (SHIPPED — NH-HIT lever 3) — **`80ecbf6` / `index-DWDp_cX_.js`**. Served sha + `hostScore` + `host_quality` verified. Also pushed gamepad-nav `1f0ce58`.

2026-07-20 (NH-HIT lever 3 coded) — Host-quality lobby rebalance (HOST-ROLE-1).

2026-07-20 (NH-HIT lever 1 FAIL retest) — Caps **91–94** / `c07949a`: Match A 4090 joiner+Intel host clean net still bad hit feel; Match B Intel joiner dirty snaps. Structural residual.

2026-07-20 (handoff → NH-HIT lever 1 retest) — Command Center + handoff refreshed for next Grok. Prod **`index-DpO_n0oI.js` / `c07949a`**. Active: joiner ram FX feel retest; then lever 3 host-quality.

2026-07-20 (gamepad nav modal scoping — **unpushed**, separate Claude session, solo/UI only, zero netcode) — Closes the RC-hunt reported-not-fixed pair (BACKLOG UI/UX controller-nav row): `ui/gamepadNav.js` focusables + B-button back query now scope to the topmost open overlay (`#esc-overlay` > `#results-overlay` > howto/challenges/settings > customize/friends > document; open = inline `display:flex`, same contract as `closeActiveOverlay`) — a pad can no longer click PLAY behind an open overlay; idle-frame focus re-yank removed (focus is reclaimed only on an actual press, press 1 reveals / press 2 acts — name-edit input no longer loses its caret while a pad is connected); dead `.cr-esc-resume` B selector → real `.esc-btn--resume` (B on pause now clicks RESUME instead of falling through to Escape) + hidden-back-button guard (B on main menu no longer clicks the invisible customize back). New `tests/gamepadNav.test.js` (12 tests, rAF-stepped happy-dom harness, first mock of `src/input.js`; 10/12 red on pre-fix code). **Behavior-changing UI → needs Wyatt's pad-in-hand check** (menu/customize/settings/pause/podium); deliberate feel change: focus ring appears on first press after connect, and podium's first A-press seeds focus (second activates) since results never auto-focuses. Gates: qa green **1151/118** (typecheck + knip clean; count includes concurrent-session test files in the tree), build OK.

2026-07-20 (SHIPPED — NH-HIT lever 1) — **`c07949a` / `index-DpO_n0oI.js`**. Served sha verified. Optimistic non-host ram FX + collision dedupe. **Retest open.**

2026-07-20 (NH-HIT lever 1 coded) — Optimistic local ram FX (cap-89/90 delay).

2026-07-20 (mpIntegration crown race FIXED — rig-only) — closes the 19:41-report chip (NPC out-scored CROWN_SCORE=60 mid-window; host+joiner AGREED, only the rig's pre-picked winner slot was wrong). `tools/netharness.mjs`: crown re-applied atomically with `rewindRoundClock` (NPC scoring window 15s → 1.2s) + podium now asserts the INVARIANT — same winner on both clients, winner = top scorer of the final synced scores, full score-map equality (sync checks strengthened, not weakened) — + PA expectation follows the actual winner. 6 live runs vs dev:local: winner/score/PA checks **6/6** (run 1 caught an NPC scoring 3 pts INSIDE the 1.2s window — race is real, now absorbed); qa **568/58** green. Code landed in `a7b6992` alongside the INCONCLUSIVE-verdict card. Residual seen once (run 2, separate class): post-podium quickplay auto-continue stalled ~48s in lobby → "rematch works" FAIL — pre-existing rematch-seam flake, spun off as its own card.

2026-07-20 (SHIPPED — NH-SMOOTH v4) — **`6b5a9df` / `index-CM5S_sme.js`**. holdPrediction not keyed off hasSpilled `s`. Visual smoother (partial).

2026-07-20 (NH-SMOOTH v4 coded) — v3 FAIL cap-84: s=hasSpilled froze non-host drive.

2026-07-20 (battery INCONCLUSIVE verdict — tools/tests/docs only, no runtime; separate Claude session, the "harness WIP" the NH-SMOOTH entry saw unstaged) — `f5ab8db`'s readiness poll did NOT kill the `0.00m` flake (kept roaming across rigs, reports 19:29–20:30); the missing half was the **verdict**. 2-client rigs now retry once after starvation then exit **3 = INCONCLUSIVE** (new contract in `resolveExitCode`, tally `inconclusive` field; battery/Command Center render it warn — `deriveNextAction` can no longer fabricate a RED GATE from it). Split: input **never sampled** = environment (NET-2 class) → inconclusive; **sampled-but-frozen** = spawn-lock signature → stays red. hostMigration deliberately keeps the plain drive (promoted host consumes own input; pendingInputs 0 by design — sampled-poll was a live-verified 25s no-op there, rolled back). Gates **568/58** green (+7 contract tests); live sweep 4/4 (`battery-2026-07-20T05-05-48-661Z.json`) + hostMigration re-run 7/7. Exit-3 path pinned by unit tests (not yet observed live — next starved run is the live proof). Docs: netcode-harness/dev-toolkit/diagnostics exit contract + the reliability block above. Residual separate flake: mpIntegration crown race still alive post-CROWN_SCORE=60 (19:41 report — NPC out-scored 60; filed as background-task chip, unfixed).

2026-07-20 (SHIPPED — NH-SMOOTH v3) — **`8c3ba22` / `index-wn0Z0cFw.js`**. Served sha verified. Display-pose low-pass mesh+camera. **Retest open.** Claude harness WIP left unstaged.

2026-07-20 (NH-SMOOTH v3 coded) — v2 FAIL cap-83 (snapGapMax 3478ms, errMax 14.6m). Display chase lever.

2026-07-20 (SHIPPED — NH-SMOOTH v2) — **`af011cc` / `index-Czk-Iu0n.js`**. Soft visual debt. **FAIL** retest.

2026-07-20 (NH-SMOOTH v2 coded) — Cap-82 still janky: errMax 12.3m, 2 teleports. Soft debt lever.

2026-07-20 (NH-SMOOTH v2 coded) — Cap-82 still janky: errMax 12.3m, 2 teleports. Soft debt lever.

2026-07-20 (SHIPPED — NH-SMOOTH v1) — **`34b240d` / `index-CaoV7WsD.js`**. Prev-pose snap + rates 3.2/2.5. Partial — still janky.

2026-07-20 (NH-SMOOTH coded) — Joiner drive “slop” on clean net (cap-78/79). Lever: after reconcile, snap physics prev pose to body + slower vis settle rates 8/6→3.2/2.5.

2026-07-20 (PASS NH-BOOST) — Wyatt **pass** on prod `index-CDlK3jio.js` / `0be4cd5` (joiner bar / fire / trails / SFX consistent). Card closed.

2026-07-20 (handoff → NH-BOOST retest) — Command Center + handoff refreshed for next Grok. Prod **`index-CDlK3jio.js` / `0be4cd5`**. Active: joiner boost consistency retest. P0–P4 + NH-STATS closed.

2026-07-20 (SHIPPED — NH-BOOST v3) — **`0be4cd5` / `index-CDlK3jio.js`**. Served sha verified. Local snap.b + no replay cancel + host nitro OR.

2026-07-20 (NH-BOOST consistency coded) — Cap-77 flaky fire. v3 fixes above.

2026-07-20 (SHIPPED — NH-BOOST v2) — **`917af54` / `index-Xu1vuW5T.js`**. Works but not consistent (cap-77).

2026-07-20 (NH-BOOST retest fail) — F8 75/76 on `5cf2a5e`: still broken. Root 2: reconcile cancel never re-arms.

2026-07-20 (SHIPPED — NH-BOOST v1) — **`5cf2a5e` / `index-wTIBrAQX.js`**. **FAIL** live retest.

2026-07-20 (NH-BOOST fix coded) — Non-host boosts invisible / bar dead / charge SFX loop.

2026-07-20 (PASS NH-STATS) — Wyatt **pass** on prod `index-BgZqxXtu.js` / `b92d87f`. Card closed. Next: NET-1 · P5 · or named residual.

2026-07-20 (SHIPPED — NH-STATS) — **`b92d87f` pushed + deployed** as **`index-BgZqxXtu.js`**. Served-bytes verified: sha `b92d87f`. Local-only superlatives + non-host podium lifetime path. Gates **560/57**.

2026-07-20 (NH-STATS active) — Wyatt residual non-host: **“my stats” broken in MP**. P0–P4 stay closed. Dig: results YOUR STATS lifetime + superlatives global bleed + incomplete non-host falls.

2026-07-20 (P4 closed) — Solo rematch F8 **72–74** / `60d773e`: Wyatt felt good. Cap-72 rematch clean. **P0–P4 closed.**

2026-07-20 (P3 closed → P4) — Wyatt **N**: friend join resume hitch not felt. P3 closed.

2026-07-20 (P2 closed → P3) — Wyatt: non-host can get kills; P2 localKos:0 closed (F8 69/71 localKos≥1). Residual non-host issues stay separate.

2026-07-20 (P1 closed → P2) — F8 **68–71** / `60d773e`: P1 gap storm **not reproduced** (pair A 4090-host snap/send o100 0; pair B Intel-host send o100 5 ≈ joiner snap 6). Re-scoped closed.

2026-07-19 (handoff → P1) — Command Center + handoff refreshed. **P0 countdown CLOSED** (F8 64–67). **Active card: P1** late-round P2P gap storm. Mid-round/post-fall parked. Next Grok: fresh dual F8 late-round on `60d773e`, score o100 host vs joiner.

2026-07-19 (PASS F8 — cap-63 hold wired) — Caps **64–67** on `60d773e` / `index-BQhnh1Z_.js`: joiner + host **countdown only after `carts-ready`**; full **3-2-1→GO**; **0 longframes during countdown**; LT over1000:0. Joiner had 126s resume LF at carts-ready (menu sit ~2m — not mid-countdown). **Countdown sub-card closed.**

2026-07-19 (SHIPPED — cap-63 hold wired) — **`60d773e` pushed + deployed** as bundle **`index-BQhnh1Z_.js`**. Served-bytes verified: sha `60d773e` + `isSessionPlayReady`. Root: bridge never forwarded ready gate (hold always true). Gates **559/57**.

2026-07-19 (SHIPPED — cap-61 hello hold) — **`17b6d53` pushed + deployed** as bundle **`index-B2klJ-qK.js`** (sha `17b6d53`). Served-bytes verified: index.html → new bundle, build sha + `shouldHoldNonHostCountdownPhase`. Cap-60/61: host PASS; joiner failed on unguarded hello phase — fixed. Gates **557/57**. **Joiner F8 retest open.**

2026-07-19 (handoff + Command Center refresh) — Wyatt retesting joiner on `index-STjeavro.js`. Handoff rewritten for next Grok (`docs/planning/handoff-next-window.md`); `npm run dashboard` regenerated. **Next agent: pull F8s, score non-host countdown-after-carts-ready, then one card only.**

2026-07-19 (SHIPPED — non-host countdown hold) — **`af89f3c` pushed + deployed** as bundle **`index-STjeavro.js`** / Version **`4e78d849`**. Served-bytes verified: new bundle in index.html, sha `af89f3c`, warn `non-host countdown gate failed`. Cap-59: joiner waits for carts-ready before countdown phase. Gates at prior qa **554/57**. **Joiner F8 retest in flight.**

2026-07-19 (SHIPPED — P0 countdown residual) — **`03218fa` pushed + deployed** as bundle **`index-CRQwILqC.js`** / Version **`5a1caee0`**. Cap-56 follow-up live. Cap-58 host felt good; cap-59 non-host still rough (above).

2026-07-19 (P0 countdown residual — coded then shipped above) — Cap-56 after audio-warm: multi-s gone; residual ~407ms start-tick stack + countdown abort + skipped “3” on re-arm.

2026-07-19 (SHIPPED — P0 countdown audio warm) — **`c3f3ad0` pushed + deployed** as bundle **`index-BUszG7M2.js`** / Version **`6c62a3c5`**. Served-bytes verified: new bundle in index.html, warn string `play-entry audio warm failed`, sha `c3f3ad0`, `idle-shader-start`. Cap-54 root cause fixed: play-entry awaits music+ambience+countdown SFX warm (with announcer) so first countdown decode is not a host LT. Gates at ship: qa **554/57**.

2026-07-19 (P0 countdown audio warm — coded, then shipped above) — Cap-54 forensics: menu warm OK; only ≥1s host LT was **1286ms** after countdown phase (missing `countdown_3`). Root cause: MP hide-menu starts music+ambience cold on the same tick as countdown. Fix in `c3f3ad0`.

2026-07-19 (SHIPPED — P0 menu warm + RC stack + Command Center v3) — **`67059ad` pushed to origin/cart-clash; deployed as bundle `index-CEjuO4Z7.js` / Version `be5c1fb1`.** Served-bytes verified: new bundle in index.html, `idle-shader-start` marker + `67059ad` stamp present. This deploy takes live everything that was waiting: P0 menu idle-shader warm (`ebf4c9d`), RC bug-hunt fixes incl. the 3 behavior-changing ones (`7dba78d` — AI cautious-phase, RESTART, host-reap; **human MP validation still owed**), pre-release polish (`2cbc7d2`), Command Center v3 + backlog merge (`67059ad`, no runtime effect). Gates at ship: qa **549/57** green. **Menu F8 retest (caps 52–54): PASS.**

2026-07-19 (analytics-view + leaderboard re-flag — docs only, additive to the merge below) — Wyatt asked whether player analytics + Supabase leaderboard were noted. Analytics harness is **already shipped/live** (observability §2); gap = no reading surface → new **ANLX-VIEW-1** (Medium: `npm run analytics` CLI and/or Command Center panel). Leaderboard was filed Low/post-launch in 4 docs → bumped **Medium** with the TRUST-1 chain intact; **scope call open for Wyatt** (ship-with vs launch-follow-up); `match_ended` analytics noted as the stats starting point.

2026-07-19 (personal pre-ship backlog merged — docs only, **unpushed**) — Wyatt's 18-item gameplay/UX/polish list merged into [BACKLOG.md](./planning/BACKLOG.md) with his High/Med/Low tiers, tagged *(pre-ship 07-19)*; new **UI / UX** section. Highlights: CARGO-WT-1 grocery weight risk/reward (+ CARGO-VIS-1 basket visuals), AI-DIFF-1 difficulty modes (promotes the existing proposal), HIT-FEEL-1, INPUT-KB-1 keyboard parity, RESULTS-1, MP-FX-1 non-host VFX (folds into queue P2 evidence). Deduped against existing rows — controller-nav row absorbs the RC-hunt gamepad modal-scoping bug; ESC-panel row notes the 07-19 partial refresh. **Parked, not queued** — Run 7 mission unchanged; pickup is the Release-candidate phase.

2026-07-19 (Command Center v3 — daily-OS workflow pass, same arc as v1/v2 below, tools + docs only, **unpushed**, no runtime changes; **final redesign** — no further iterations unless real usage exposes problems) — Release brain: STATUS gains canonical **### Release phases** (✅/▶/⬜ strip; Playtesting current) + **### Done when** mission checklist (1/5 checked — combat validated; P0 retest, P1, MP validation of RC fixes, NET-1 open); Command Center renders both (phase strip + DONE WHEN beside the mission). Session continuity: **Last session / Resume** bar (parsed from this section's newest entry + active queue card + console state). Playtest panel → **control room**: 8-step flow strip (mission → launch prod `?diag=1` → console cards → F8 → pull → review → fix one lever → retest). **Not Today** panel (parked/locked + "recording an idea ≠ changing priorities" → BACKLOG). View-time **staleness banner** (>12h old page warns to regenerate). `health.json` gains **`digest`** (phase, mission, now, done-when, recently-completed, in-progress, blockers, avoid, symbols-in-play, regressions, last-session) — `healthVersion` 3; AGENTS rehydration unchanged (dashboard/health.json first). New parsers + tests: phases, done-when, last-updated, symbols, shared `deriveNextAction` (render + digest give identical answers); live-doc canaries pin the new STATUS sections (exactly one ▶ phase enforced). Gates: **qa 549/57 green**, typecheck + knip clean.

2026-07-19 (Command Center v2 — attention-first redesign, same session as the consolidation below, tools + docs only, **unpushed**, no runtime changes) — The v1 page was a status report; v2 is organized by decision frequency, not data source. Top: **mission banner** (STATUS § Current focus, huge), **the ONE next action** (red battery gate > STATUS next-action #1 > active queue card — captures deliberately removed as a todo source; they're evidence, not work), **do-not / parked firewall** (handoff do-nots + locked queue rows + 🚫🧊📋 issues). Middle: queue (done collapsed / active glowing / waiting dim), **playtest panel** — reads the console's localStorage at VIEW time in the browser (same-browser, no generate-time copy; console stays the single source), bugs radar (✅/parked rows shelved, status cells compressed), build health, recent commits. Bottom: everything else in collapsed `<details>` (captures, perf with a SwiftShader caveat, battery history with a flake warning, backlog, agent briefing, links). New parsers `parseStatusCurrentFocus`/`queueRowState`/`compressIssueStatus`/`issueState`; `healthVersion` 2 (queue rows now structured objects). Console got a ⌂ Command Center pill; AGENTS.md rehydration now starts at `npm run dashboard`/health.json. Gates: **qa 537/57 green**, typecheck + knip clean.

2026-07-19 (Command Center consolidation, separate Claude session — tools + docs only, **unpushed**, no runtime changes) — `npm run dashboard` output promoted to the **Command Center**: new **Agent briefing** section (facts + do-not list + read order parsed from `handoff-next-window.md`), **Recent commits**, links row to every tool/doc, and the **Active queue** section un-broken (parser still read the pre-run-7 `### Wyatt playtest queue` heading → section was silently empty; now parses the Active-queue table with legacy fallback). New **live-doc canary tests** pin the real STATUS/BACKLOG/handoff against the parsers so heading drift breaks `npm run qa` instead of silently emptying sections. This file: ~15 superseded deploy rows collapsed to one (dated entries below remain the per-ship record; size gate now ~9.5k/12k). Deleted `scripts/dev-next-level.mjs` (deprecated shim, zero references). Pointers updated: AGENTS.md, docs/README.md, dev-toolkit.md, observability.md. Playtest console + all rigs untouched. Gates: **qa 531/57 green** (adds 9 parser/canary tests), typecheck + knip clean.

2026-07-19 (RC bug-hunt pass, separate Claude session — **unpushed**, additive to the polish pass + P0 menu card below; those hunks untouched) — Systematic break-the-game sweep (7 subsystem sub-agents + manual trace/verify). **7 confirmed bugs fixed** (every finding re-verified against the code by hand before edit; gates: **qa 522/57 green, typecheck + knip clean**; battery re-run pending). ⚠️ **3 of the 7 are behavior-changing → need a human playtest before "done" / ship.**
1. **[High] AI stuck in "cautious phase" the entire match** (`simulation.js` `isAiCautiousPhase`) — clock-domain mismatch: bots got `performance.now()` (page-load ms) compared against `startedAtMs` in `getRoundClockNowMs()` (timeOrigin+now, ~1.75e12), so `now-startedAtMs ≈ -1.75e12 < 8000` **always** → cautious forever. Two shipped tuning passes (reachOuter 0.82→0.95, booth OR→AND) never ran. Fixed to read the round clock in its own domain. **Behavior-changing** (bots now reach rim-campers, less mid-disc huddling).
2. **[Medium] NPC personality read a field that's never set** (`simulation.js` — `cart.name` → `cart.label`) — carts carry the bot name on `.label`; `cart.name` was always undefined → every bot fell back to `slotIndex%4` behavior while the HUD/nametag badge resolved personality from the name (badge lied; solo never had an aggressor). **Behavior-changing** (behavior now matches the shown badge).
3. **[High] Pause-menu RESTART mid-round silently fails in solo/testdrive** (`main.js onHostPlayAgainClick`) — solo pause keeps `phase==="running"`; `startCountdown()` bails on the running guard, so `rematchResetWorld()` snapped carts to spawn but no countdown, no score reset, stale round kept ticking. Now drops the abandoned round to lobby first. **Behavior-changing** (RESTART actually restarts).
4. **[High] Saved volume decayed ~13% every page load** (`main.js` audio restore) — boot passed `getSfxVolume()/AUDIO_VOLUME_MAX` (store domain ÷ 1.15 → 0..1) back into setters whose domain is 0..1.15, which re-persisted the shrunk value; trended toward silence over ~15 reloads until a slider was touched. `_masterVol` (only consumer of the `master` leg) is write-only/dead. Now passes raw store values (idempotent). Pure correctness — safe.
5. **[Low-Med] Stale "FIRST BLOOD" callout could fire over the podium** (`announcerManager.js` critical branch) — cleared `_queue` but not `_burstHold`/`_drainTimer` (unlike `stopAnnouncer`); a KO on the round-ending frame could replay a burst callout ~1.7s into victory/defeat. Now mirrors `stopAnnouncer`. Defensive — safe.
6. **[High] HOST-REAP-1 — stale pending-picker host leaves the room permanently hostless** (`party/index.ts` `#reapSilentConnections`) — onConnect's empty-room fallback assigns `#hostId` to a connection that hasn't seated yet, and a later joiner can't displace it (`#hostId` non-null → seat-time promote skipped). When the 30s picker sweep reaps that host, pending pickers are excluded from `reapedIds`, so the function returned **before** the `#ensureLiveHost()` repair — `#hostId` left dangling at a closed socket, seated humans stranded with no physics authority until someone new connects. `#reapStalePendingPickers` now reports whether it reaped, and the early-return path repairs the host first. Server-side; griefable by withholding `color_pick`, also reachable by an honest host idling ~30s pre-seat.
7. **[Low-Med] Phantom nitro boost from a dead cart** (`main.js maybeTriggerNpcOpportunisticRamBoost`) — the host fall loop calls this every frame for KO'd NPC slots; the target scan rejects *other* dead carts but there was no self-guard, and range is planar (dx/dz), so a bot tumbling 10-15m below the arena still "reached" a live cart and fired a boost whoosh + mesh pulse from a corpse mid-shatter, right on the death beat. Added the `respawnAtMs`/spectator/null-body self-guard the sibling hop function already had. **Found independently by two sub-agents.** Safe.

**Battery (A/B'd against a stashed baseline — do not skip this context):** with fixes **3/5**; clean baseline (fixes stashed, same machine/session) **4/5**. Diff analysis:
- `teardownRejoin` FAILS on **baseline too**, identical assertions (`peak displacement 0.00m`, `pendingInputs 0`) → **pre-existing, not caused by this pass**. It is the flake the harness itself documents at `tools/netharness.mjs:406-409` ("can declare 'settled' while the rAF loop is still too starved to sample input — the false `peak 0.00m` flake"), same starvation mechanism as the NET-2 gotcha. **The "battery 5/5" line elsewhere in this file is stale/environment-dependent for this rig.**
- `mpIntegration` passes baseline, fails 14/16 with fixes — **caused by AI fix #1, and it is a signal, not a defect.** Failing checks: `winner slot host=2 joiner=2 expected=0` (both clients *agreed* — result sync is fine; an **NPC won**) and the joiner's PA firing `defeat`. The scenario sets scores deterministically (`control.setScores` → joiner=3, others 0) then lets the round run to `rewindRoundClock`; it silently assumed **nothing else scores in that window**. With bots no longer pinned in cautious phase, slot 2 racked up enough KOs to overtake 3 points — the joiner's PA tail went from baseline `[…new_leader,victory]` to `[cleanup_aisle,spill_rush,spill_rush,first_spill,rampage,defeat]`. **Deliberately NOT papered over** by editing the rig — the assertion is doing its job.
- ⚠️ **Implication for the RC:** the non-cautious AI tuning constants (aggressor `humanWeight` 0.93, `reachOuter` 0.95) had **never been exercised in play by anyone** — they were authored behind a condition that was always false. Fix #1 turns them all on at once, and the battery showed bots going from passive to multi-KO rampages.
  - ✅ **Wyatt solo playtest 2026-07-19: "solo seems good, keep the changes."** The 3 behavior-changing fixes (#1 AI cautious, #2 personality, #3 RESTART) are **accepted for solo**. Still unvalidated by a human: **bot feel in multiplayer**, and **#6 (party host-reap) which solo never exercises** — that one needs a 2-client check.
  - Follow-up: `mpIntegration`'s crown lever was raised 3 → `CROWN_SCORE` 60 (`tools/netharness.mjs`) because the old value quietly depended on passive bots; the winner-sync assertion is unchanged and now also cross-checks host score === joiner score exactly. **The rig was fixed to match reality, not to hide the AI change.** ✅ **Verified green 16/16** via `npm run battery -- --only mpIntegration` (`host=0 joiner=0 expected=0`, scores sync at 60).

**⚠️ BATTERY RELIABILITY (new finding — read before trusting a red/green result).** The four 2-client rigs share ONE flaky failure mode — `peak displacement 0.00m` / `pendingInputs 0`, i.e. the joiner's cold bootstrap starving the rAF loop (`dt>0.25s` → accumulator zeroed → input never sampled). **It lands on a different rig every run:**

| Rig | run A (fixes) | run B (baseline) | run C (fixes+rig fix) | run D (--only) |
|---|---|---|---|---|
| `spawnlock` | PASS | PASS | **FAIL 0.00m** | — |
| `mpIntegration` | FAIL (winner slot — real, AI-caused) | PASS | **FAIL 0.00m** (upstream) | **PASS 16/16** |
| `teardownRejoin` | **FAIL 0.00m** | **FAIL 0.00m** | PASS 18.48m | — |

Consequences: a 5/5 proves less than it looks, and a red rig is not evidence of a regression — the only way I could separate a real AI-caused failure from noise was A/B-ing against a **stashed baseline**. `gameharness` + `hostMigration` were stable across all runs. This is the *same* mechanism as the tracked NET-2 gotcha, so it may be the rigs honestly reporting a real product weakness rather than pure test flake — decide which before trusting the gate. **RESOLVED in two steps:** `f5ab8db` shipped the readiness poll (`waitForInputSampled`) — post-`f5ab8db` reports proved it insufficient (the `0.00m` red kept roaming, runs 19:29–20:30 on 07-19); the 2026-07-20 INCONCLUSIVE-verdict pass (see dated entry) shipped the missing half: retry once, then report **exit 3 / INCONCLUSIVE** instead of FAIL when the loop never samples, so **red = regression** (sampled-but-frozen stays red; starved = inconclusive). **Do any parallelization only AFTER trusting this** (`--only`/`--skip` already exist; full sweep ≈10.2 min, `gameharness` alone is 45%).

Sub-agent coverage: match-flow (truncated by session limit — its lead became #3, manually traced), player-state, netcode-client, party-server, UI/FX, AI, audio. **Validation done:** qa green (522/57, typecheck + knip) after each fix batch; battery A/B as above. **Validation pending:** human playtest of the 3 behavior-changing fixes (esp. #1 difficulty). **Reported but NOT fixed:** gamepad nav not modal-scoped (controller can activate buttons behind an open overlay, incl. PLAY — `ui/gamepadNav.js getFocusables` is document-wide) + per-frame focus re-yank when a pad is connected; host trusts a silent peer's last input forever (no staleness timeout on `remoteInputsByConnId`); unbounded client ICE buffer for a never-negotiating peer; degenerate zero quaternion reaching Rapier `setRotation`; fall path non-idempotent if a KO reactor throws (latent, no reachable throw found); in-flight VFX freeze into the attract backdrop when quitting within ~1s of a KO.

2026-07-19 (pre-release polish pass, separate Claude session — **unpushed**, additive to and distinct from the P0 menu card below; P0 hunks in `main.js`/`bootTimeline.js` untouched) — Quality sweep before public showing. Logic: same-frame KO at timer expiry now scores + presents before `endRound` (gameFlow fall-pass/expiry reorder; `tests/gameFlowTimerExpiry.test.js`); stale Rampage badge cleared at countdown/running entry (solo RESTART flash); draw podium hard-silences in-flight PA callout; late non-host `game_start` apply fires the GO! beat (`HUD.triggerGoBeat`); gameLoop's private yaw/wrap copies deduped into `simulation.headingYawFromQuat`/`wrapAngleRad` — **behavior preserved**: the x² cos form is the exact ground-projected heading matching the visual pipeline's YXZ yaw; it must NOT be merged with steering's z² `yawFromQuaternion` (`tests/yawExtraction.test.js` pins both). Copy (style guide): "KOS THIS ROUND", "JOIN LOBBY", lobby/round menu-return notices, Esc scoring table renamed to match HOW TO PLAY + missing High ground row, player-appropriate boot-error copy (dev recipe → console), sentence-case aria-labels/tooltips, `QUALITY: HIGH` placeholder, ellipsis normalization. Hygiene: netcode/p2p/gamepad lifecycle logs DEV-gated; **15 dead config keys deleted** (verified zero readers; incl. `net.clientInputHz` — AGENTS.md §invariants corrected: client input sends ride the 60Hz fixed-step sample, no Hz knob); party log DOs share new `party/logUtil.ts`. Deliberately not changed: eruda CDN load on LAN hostnames (audit #34 — workflow call), non-host ":00" hold (inherent to host authority), cartThemes non-rave dead branches (post-gate), `connectionState:"ok"` before first socket (diag cosmetic). Gates: **qa 522/57 green**, knip clean, build OK, **battery 5/5** (report `.diag-captures/battery-2026-07-19T09-42-14-826Z.json`), blackframes classic PASS (worst 0.52).

2026-07-19 (Run-7 P0 menu card — **unpushed**) — Caps 45–51: multi-s longtasks start ~5ms after `world-ready` (attract un-gates; first `composer.render` compiles). Fix: `bootstrapWorldCore` awaits `warmupActiveSceneShaders({ forPlay:false })` + always prime composer; boot marks `idle-shader-start/end`. Gates: **514/55** green. **Not shipped** — wait for “ship it.” Still open: post-ready chunk/`warmSunsetEnv` multi-s, mid-round KO freezes (P0 remainder).

2026-07-19 (session end — **landed + shipped**) — **`5bfe7e5` / bundle `index-D3QXm4Qq.js` / Version `f94266c2`**. ko_path removed; longtask/`lt[]` kept (served verified). Handoff rewritten for next chat: [planning/handoff-next-window.md](./planning/handoff-next-window.md).

2026-07-19 (P0 ko_path rolled back then shipped) — Cap 48–51: 30 KOs → 0 `ko_path`; fall path not multi-s. Was temporarily live as `index-BwzBNELn.js` / `be8eba3`.

2026-07-19 (P0 longtask probe **shipped**) — **`8f17aba` / bundle `index-DGKCMA2w.js` / Version `2729f45e`**. Served bytes: sha `8f17aba`, `longtask`, `ltN`, `focused`, `PerformanceObserver`.

2026-07-19 (friend playtest decode + handoff) — 2-human caps **31–40** (4090 host / 9070 XT non-host): multi-s host freezes = friend tHost gaps; late friend snap o100 **117** vs host send o100 **6**; combat errMax **11.2 m**, tele **15**, localKos **0**. Solo cap-**41**: no net desync; rematch ~8s hitch; AI probe empty. Handoff **P0→P6**: [planning/handoff-next-window.md](./planning/handoff-next-window.md).

2026-07-19 (dashboard capture triage, separate Claude session — tools only) — `npm run dashboard` now sees remote F8 pulls: `collectCaptures` scans `.diag-captures/playtest/`, merges `cap-N-meta.json` sidecars, mtime order, build chip vs newest capture.

2026-07-19 (2e tHost arrival **shipped**) — **`1adef95` / `index-CHXFyLNA.js` / Version `2c88c7d9`**. Lab dual-PC pass; friend 2-human still fails (entry above).

2026-07-19 (2e announcer warm **shipped**) — **`716ec2f` / `index-B1V-NCgO.js` / Version `1dce77ac`**. Cap-25/26: host mid-round freezes gone; combat drops 43→0.

2026-07-19 (test coverage, separate Claude session — tests only, no runtime changes) — Two new suites (+35 tests): `tests/debugParams.test.js` (URL flag parsing — defaults, bookmarks/aliases, implied harness/freeze, `?bloompipe` + live-tune, retired-`?rtmode`-stays-retired guard, boot side effects) and `tests/cargoLoad.test.js` (Living Cargo — score→fullness, spill-count lerp, comeback window, restock timing, cart_overflow/spill_rush once-per-round edges; grocery/announcer/simulation mocked, real CONFIG+gameStore). Gates: **qa 494/53 green**, knip clean.

2026-07-19 (2e host-send probe **shipped**) — **`19e5cd9`** / live **`index-pavOdoEG.js`** / Version `28e48ede`. Cap-23/24 retest → announcer warm lever above.

2026-07-19 (VFX-1 fork-path cleanup, separate Claude session) — Deleted the legacy `?rtmode` A/B machinery (`resolveRtModeTypes` + float/byte composer-RT branch in scene.js, debugParams parsing, Tweakpane Composer/RT folder, main.js `rtmodeExplicit` guard). `?bloompipe=display|hdr` is the one remaining pipeline lever; `?bloomthr/str/rad/smooth` live-tune keeps working. Behavior-identical by construction (default and hdr paths resolve to the same types as before). Also made the inert-IBL-knob situation honest in comments (config.js/scene.js): `materialEnvMapIntensity` only drives owned-envMap materials (floor, lens); call-site scales kept as design intent. Gates: **qa 459/51 green**, build clean, blackframes classic **PASS** (0 black) + sundial **PASS** (0 black; first run hit the stale vite-dep-cache trap, cleared `.vite` and green). Committed as `67b3cf5` when the host-send probe ship baked it into the client bundle.

2026-07-19 (2e forensics dig) — Cap list still tops at #17 (no newer F8). Cap-17 host: early post-GO **303/526ms** only, then clean mid-round (`over33=27`/`over66=3`). Cap-16 non-host `snapGapsOver100=52` is **confounded** by Intel `over33=444` (arrival measured on client main thread). Host send probe card → shipped as entry above.

2026-07-19 (doc staleness sweep, separate Claude session — no code changes) — Fixed stale docs repo-wide: VFX-1/bloom-promotion marked closed in ROADMAP/BACKLOG/project-state/playtest docs (`?rtmode=bloomfix` A/B retired; toggle is `?bloompipe`); local worker port 1999→8787 in preview-dev/deploy-urls; `/parties/main/`→`/parties/cart-rave-server/`; CREDITS `src/audio.js`→real modules + dropped Michroma/Space Grotesk font rows; living-store cargo 2→12 → 7→18; `.cursorrules` version pins; this file's duplicate gates/deploy rows consolidated. `handoff-next-window.md` untouched.

2026-07-19 (2e handoff) — Combat pass-enough (cap-16 skips=0, localKos=2). Residual: host hitches + invisible non-host kills. Handoff rewritten for **2e only**: [planning/handoff-next-window.md](./planning/handoff-next-window.md).

2026-07-19 (combat skip-gap **shipped**) — **`1a2f242` / bundle `index-Cw19iE04.js` / Version `4b585641`**. Cap-16 retest: skips 0, combat better; host hitch next.

2026-07-19 (combat path) — Cap-12/13: P2P OK after TURN secrets; reverse hard = **skip-replay on any oldest-N truncate**. Lever implemented then shipped as entry above.

2026-07-19 (gate re-verify, next window) — Full automated suite re-run on the combat stack: **qa 458/51 green** + **battery 5/5 green** (first battery since `f0c10ba..732e2d6` touched gameLoop — all 2-client rigs pass with the replay cap/silence hold/phantom clear live; teardownRejoin now in the sweep). Dashboard regenerated. Capture server checked: **no F8s newer than `4a9f7f8`** — the Match A combat/phantom retest on `index-C560wli8.js` remains the pending gate. No code changes this entry.

2026-07-19 (session handoff) — Full cold handoff rewritten: [planning/handoff-next-window.md](./planning/handoff-next-window.md). Stack: combat `732e2d6` + observability `601b8e8` / live **`index-C560wli8.js`**. Workers **Paid** on; captures pull green again. Soft phantom retest only (no F8). **Next window:** Match A F8 retest then host hitch forensics if freezes still dominate.

2026-07-19 (Workers Logs) — **`601b8e8`**: `observability.enabled` + logs + invocation_logs, sample 1.0. Version `9dc41a2f`, bundle `index-C560wli8.js`.

2026-07-19 (DO free-tier wall → Paid) — Hit 5M SQL row reads/day; CaptureLog + quickplay DO threw. Wyatt upgraded Workers Paid; pull works. Historical, not re-open free-tier chasing.

2026-07-19 (phantom-pending **shipped**) — **`732e2d6` / was `index-t3FG6KVX.js`**. Host freezes while focused still open (not alt-tab).

2026-07-19 (combat-hold retest → phantom pending) — F8 cap-8/9 `4a9f7f8`: errMax 28→4.2m, localKos 1; phantom after respawn. Fix shipped as entry above.

2026-07-19 (combat-hold **shipped**) — **`4a9f7f8` / bundle `index-iKVEUst7.js` / Version `4f795c70`** live. Hold on silence/dead; skip-replay overload; death pose snap. Retest → entry above.

2026-07-19 (Match A combat FAIL → combat-hold) — Wyatt retest on `efdca62` / `index-XByafoNI.js`: better on Intel but not much; hit feedback then reverses; NPC kill invisible then death anim where predicted. F8 **cap-6/7 build efdca62**: Intel `snapGapMaxMs=4746`, `reconcileErrMaxM=28.6m`, drops 113; **4090 host 10× resume longframes 1–7s**. Fix shipped as entry above.

2026-07-19 (hit-delay + window handoff) — **Shipped `efdca62` / bundle `index-XByafoNI.js` / Version `11e93226`:** reconcile trim keeps **oldest** unacked (continuous after host ack), drops newest; `reconcileReplayMaxSteps` 8→12. Cap had fixed smoothness but wrong drop order made combat feel ~1s late. Combat retest → FAIL partial (entry above).

2026-07-19 (Run 7 Match A decode → one fix) — **Match A FAILED with 4090 host.** Death spiral = unbounded Rapier replay. **Shipped `f0c10ba`:** pending max 120→24 + replay step cap. Retest: smoothness **much better**; combat still late → hit-delay fix above.


> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
