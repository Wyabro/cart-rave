# Cart Clash — Backlog (open work only)

**What is this?** Every known **open** item, deduplicated — grouped by discipline, prioritized.
**Why does it exist?** So open work lives in one place instead of scattered tables.
**Who should read it?** Whoever is picking the next piece of work.
**Related:** [STATUS.md](../STATUS.md) (declared phase + focus), [ROADMAP.md](./ROADMAP.md)
(phase definitions), [completed-work.md](./completed-work.md) (shipped),
[netcode-deep-dive.md](./netcode-deep-dive.md) (hazard writeups).

Priorities: **Critical** = blocks Version 2 · **High** = should land before V2 ·
**Medium** = V2-window polish · **Low** = post-launch / opportunistic.

Completed rows are **not** kept here — move them to [completed-work.md](./completed-work.md).
Do not re-add closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, NET-CLK-*, NET-BUF-1, …)
without new evidence.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

**SHIP-1 tiers (07-20):** pre-ship ordering now lives in [SHIP-1.md](./SHIP-1.md).
Rows tagged `[SHIP-1 A–E]` are pre-ship, drained tier by tier; untagged rows default to
post-launch unless Wyatt pulls them forward.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Done | BOOT-PERF-1 — pre-warm the selected arena during menu idle | ✅ **CODED 07-31** — idle warm already existed; gap was sticky first-wins. `ensureWorldBootstrapped(selected)` + gen-cancel retarget mid-flight (`cartrave:level-changed` while in-flight); stale flight never latches `worldBootstrapDone`. Tab/suppress unchanged. Tests: `bootstrapIdleWarm.test.js`. Deploy on ship. |
| Done | COUNTDOWN-SYNC-1 — countdown beat desync / "skips" `[SHIP-1 A1]` | Fixed (07-21): retroactively fire missed "1" beat, staggered 220ms before GO + host-domain clock sync. Confirmed good by Wyatt in playtest (07-22). |
| Done | HUD-FEED-1 — kill-feed row overflows its plate below ~768 px | ✅ **SHIPPED 07-31, four commits** — final at `0b5369d` / Version `4cca79ca`, verified in the fetched `assets/index-C8-3B4kh.css` (portrait `min(78vw,320px)` ×1, landscape `min(42vw,320px)` ×1, stale `min(42vw,240px)` 0, base row cap ×1). **Portrait leg verified by Wyatt's prod footage; landscape leg owed a playtest.** The landscape leg (`0b5369d`) was found *by* that footage: at 900×390 the row was correctly inside its plate — containment carried because `max-width:100%` sits on the BASE rule — but names read `BA… PUNTED 1.5X FRE…`, because the portrait work is scoped to `max-width:768px` and 900w never matched it. Landscape kept its own `min(42vw,240px)`, whose 240 ceiling bound on every common landscape phone (42vw = 378 at 900w). Same two levers applied: ceiling → 320, gap → 6px. Measured after: 900×390 and 812×375 render BOTH names in full; 667×375 gives readable stubs. Earlier legs below, verified against `assets/index-ClpcX_lJ.css` (`min(78vw,320px)` ×1, `.hud-feed-row{…max-width:100%}` ×1, ellipsis ×3, stale `min(48vw`/`min(68vw` both 0). **Owed: Wyatt playtest on prod.** Three commits: `70c3887` containment, `bac31b8` gap 10→6px, `50e8944` cap → `min(78vw,320px)`. Net at 390×844: row went from overflowing the plate by 138px to 250px fully inside it, names 0 → 116px (`SHEET…` / `AISLEDRI…`). Root cause was two-part — the `max-width:768px` cap of `min(48vw,280px)` was narrower than the row's own rigid parts (icon 14 + verb 59 + pip 37 + gaps 40 = 150px vs 133px usable), and the shrink/ellipsis rules already existed but were scoped only to the landscape/short block, never to portrait. Neither fixed it alone: nothing constrained the ROW, so as a flex item under `align-items:flex-end` it sized to max-content and spilled, and while it spilled the children's `flex-shrink` could never engage — hence `max-width:100%` in the base rule. Original report below. **Found by `npm run sheet --all` 07-31** (the FIGHT-VERIFY agent half; first sweep that could render the feed at all). The `— TRANSACTION LOG —` plate does not grow to contain its row: the actor pip, name and verb paint OUTSIDE the plate's dark background, on transparent canvas. Scales with the gap between row content and plate width — at 768×1024 the star + `SHEETBOT` sit just past the left edge; at 390×844 and 380×800 the pip, name and `RAMMED` are all outside it, roughly half the row unbacked. Correct at 1920×1080 (plate wraps the full row). Repro: `npm run sheet -- --viewports 390x844` then open `.diag-captures/sheet/classicRecord-390x844-hud.png` (chrome-only shot, canvas hidden, so the overflow is unambiguous). Suspect the plate is right-anchored/fixed-width while `.hud-feed-row` lays out from its own content — start at `#hud .hud-feed` / `.hud-feed-inner` / `.hud-feed-rows` (`hud.css:677-713`), noting `.hud-feed-inner` carries `transform: skewX(8deg)`. Fight-night surface, so it belongs to FIGHT-VERIFY-1's owed pass. |
| Done | MENU-HINT-1 — menu hint bar scrolls over the settings content | ✅ **SHIPPED 07-31** — live at `7d2b840` / Version `a438b567`, asset-verified (`var(--cr-hintbar-h)` ×1, `cr-hintbar{position:fixed` ×1, stale flat `24px 16px 92px` 0, stale 90% bar bg 0). **Owed: Wyatt playtest** — narrow width, menu scrolled to the bottom. Reported from Wyatt's screen recording at 576×900 (hints strip painting over the cart-name card; at taller windows over STORE PREFERENCES instead). Root cause was NOT the reserve: `.cr-hintbar` is `position:absolute` inside `.cr-content`, which is **both positioned and `overflow-y:auto`** below 1024px — so the bar anchored to the scroll container's padding box and **scrolled with the content**, drifting up into the middle of the panel instead of staying chrome. Three parts: (1) `position:fixed` in the ≤1024 branch so it pins to the viewport (desktop keeps `absolute` — there `.cr-content` is `overflow:hidden` and never scrolls); (2) the bottom reserve was a hardcoded `92px` while the bar WRAPS with width — measured 52px @768w, 75px @576w, 106px @390w, 137px @380w, so 390/380 were 14/45px short — now `calc(var(--cr-hintbar-h, 92px) + 16px)`, with `--cr-hintbar-h` measured live in `cart-rave-menu.js` (`measureHintBar()` on `updateHintBar` + a `ResizeObserver`, mirroring hud.js's `--hud-utility-width`); (3) bar background `rgba(9,7,13,.9)` → opaque, since content scrolling behind it ghosted through and read as broken. Verified at 5 widths: clearance is now exactly 16px everywhere. **Owed: Wyatt playtest** — pre-existing, not a regression from the HUD-FEED-1 work (that was all inside `#hud`). |
| Done | DIAG-DOC-1 — docs claimed `__ccDiag.control` DEV-only / null in prod | ✅ **CLOSED** — comment/JSDoc + guides only. Truth: control object created `DEV \|\| ?diag=1`; `__ccDiag.control` non-null only when hub installed (`?diag=1`) and create succeeded; host + running-round gates stay; `forceKillFeed` remains DEV-only. Fixed: `diagnostics.js` ×3, `globals.d.ts`, `devControl.js` banner, `main.js` install comment, `docs/guides/diagnostics.md`, `docs/guides/dev-toolkit.md`. Do not re-gate control to DEV (undoes Run-6). |
| Low | COUNTDOWN-QUICKPLAY-1 — empty quickplay countdown connect-wait edge case | In empty quickplay games, countdown either waits for player connection before starting or skips part of it. Documented from F8 captures (184–196); parked in backlog per Wyatt (07-22). |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Medium | Host-reload mid-round live confirm | Automated half: netharness `hostReload` (A6b). Optional: one live HOST-tab reload smoke for feel. |
| Done | ANLX-VIEW-1 — player-analytics view `[SHIP-1 A7]` | ✅ PASS 07-22 — `npm run analytics:pull` + CC Analytics panel. Admin clear is Bearer (SEC-TOKEN-1), not `?token=`. |
| Done | ANLX-ATTRACT-1 — mid-round joins counted as real matches | ✅ **CLOSED 07-31** — live at `2e85f0b` / Version `4083335f`; accepted on a live two-client prod probe (2 unseated clients adopted `phase=running` → 0 `match_started`; all 7 emitted starts carried `joinedMidRound`), not on ring counts. [Full acceptance](./completed-work.md). Diagnosis record below. **Do this BEFORE the pre-tester `DELETE /api/analytics`, or the reset buys nothing.** Prod DO (07-30) holds 20,000 rows — at ring cap, already evicting — of which `match_started=9721` / `match_ended=9548` come from only **263 sessions / 8 clients**. Newest 1000 events: 212 `match_ended`, **bimodal** — 162 at `<3 s` (100 % `draw`, empty `endReason`, quickplay only, never `classicRecord`) vs 48 at `≥120 s` (real 150 s rounds, win/loss/solo/all arenas). **ID kept for traceability (`9f52597`); title and mechanism corrected — the original attract-mode claim was DISPROVEN (`src/ui/menuAttract.js` never touches `gameStore`).** Real mechanism, from a two-client probe: `?room=quickplay` auto-rejoins (`main.js:1843`), `MSG.hello`/`MSG.round` adopt the room's `running` phase (`netcode.js:2548`, `:2843`), and `gameplayAnalytics.js:109` fires on **any** →RUNNING. Probe caught the false row with the joiner still on the menu — `from: lobby→running`, `menuVisible: true`, `crRootDisplay: block`, `localSlot: -1`, `localBodyEnabled: null`, `sawCountdown: false` — against a control round showing the exact inverse on all six. Consequence: `avgKos`, `matchesByArena`, result split and quit funnel are all meaningless today. Fix: gate the emit on local participation (live cart body), with a latch so a mid-round joiner still counts once its cart exists. **Caveat — two populations:** the full ring reports `loss=9330 / win=9` but the recent window is draw-dominated, so an older second source plausibly exists; this card owns the recent cluster only → split out as ANLX-BULK-1. |
| Done | ANLX-BULK-1 — short `loss` bulk poisoned product analytics | ✅ **CLOSED** 07-31 — tool-sourced / intentional-on-your-machine, not a player-path bug. Phase A: post-reset ring had **306** `match_ended` at **4–12 ms**, `loss` · classic · quickplay · `endReason=timer` · `kos=24`, one client `23dd1d07-…` (Wyatt `cartRaveClientId`) / session `8cc39f49-…` / build `2e85f0b`; start/end ~309/308; avgMs≈5842 was outlier-poisoned. Fix **L1+L2** · P-A · `MIN_MATCH_DURATION_MS=3000` in `shared/analyticsConstants.js`: L1 `#summary` filters arena/mode/result (`duration_ms IS NOT NULL AND >= floor`); **byName/window stay raw**; L2 client skips non-null short `match_ended` (null still emits, summary drops it). List unchanged for forensics. Tests: `analyticsGating` + `analyticsSummaryFloor`. Post-ship: dirty byName until ring ages is not L1 failure. Pre-reset ~9327-loss snapshot remains signature-only. |
| Done | MP-FX-1 — non-host players miss gameplay VFX `[SHIP-1 A3]` | PASS (07-22 Wyatt playtest): charge glow via `ch` bit 16 + remote hop land thud/dust; collision/shatter already on snapshot tail. |
| Medium | Customize screen performance pass *(pre-ship 07-19)* | Measure before tuning. |
| Done | ARENA-COL-1 — Cart Rave pit/kill-zone reliability `[SHIP-1 A4]` | PASS (07-22 Wyatt playtest): rim entry pose (`fallEntryPos`) & round-clock timestamp (`fallEntryTimeMs`) → `buildKOEvent` via `{ classifyPos, creditTimeMs }`. Tests: `scoringEvent.test.js` +2. |
| Low | Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| Done | HOST-CAP-1 — capability-based host preference `[SHIP-1 A1]` | ✅ **CODED 07-31** — HOST-ROLE-1 preferred strongest host in lobby (`80ecbf6` PASS). Residual: weak-host toast once per hostship when local is host **and** join-time `score < WEAK_HOST_WARN_SCORE` (50); neutral 50 never warns. Min-spec fact accepted (no ban). Pure + wire tests. Deploy still needs "ship it". |
| Done | SRV-TEST-1 — direct tests for `party/index.ts` `[SHIP-1 A5]` | ✅ Done (A5a pure helpers + A5b DO harness). Further scenarios → NET-SIM-1 / A6. |
| Medium | NET-SIM-1 — socket-lifecycle netharness scenarios `[SHIP-1 A6]` | A6a (party-do silent-reap + ghost 4010) + A6b (netharness `hostReload`) landed; extend as needed. P2P zombie + reconnect cooldown already unit-covered. (Drop stale "unpushed" wording — verify against tree if reopening.) |
| Done | HYGIENE-1 — acked fixed-list sweep (07-30 review fold-in) | ✅ closed 07-30 — (1) sourcemap:false · (2) boot-error filter · (3) remotes deleted + **Wyatt set GitHub default branch → `cart-clash`** · (4) profiler `--dpr`/`--gpu`. |
| Done | SKYBOX-1 — restore never-built `sceneExtras` (review C-01) | ✅ closed 07-30 — live at `c074c2a` / Version `8e5bb259`; LOW tier-gated (`skyExtras` knob); UFO-in-pit fixed. [completed-work](./completed-work.md). |
| Done | SEC-BEACON-1 — harden open POST beacons | ✅ CLOSED 07-30 — live at `65dea12` / Version `255d6284`. Per-IP 30/60s inside each log DO. [completed-work](./completed-work.md). |
| Done | SEC-UNLOCK-1 — DEV-gate `?devUnlocks=all` | ✅ CLOSED 07-30 — live at `64eff60` / Version `56439ef4`. `=off` stays all builds. [completed-work](./completed-work.md). |
| Done | SEC-ROUTE-1 — Worker routes `includes()` → exact `===` | ✅ Done 07-30 (`8da2575` / Version `268f6ff2`). Exact `===` on /api/*; `/parties/` stays prefix. |
| Done | SEC-TOKEN-1 — admin tokens out of query params | ✅ **CLOSED** — `Authorization: Bearer` only via `party/adminAuth.ts` (`requireAdminToken` → Response \| null; timing-safe equal). Query `?token=` rejected. Tools `pull-analytics` / `pull-captures` send Bearer. Docs + tests updated. |
| Done | CARGO-RACE-1 — bay built empty if grocery GLTFs lose the load race | ✅ 07-30 — bays self-heal on init resolve: `createCargoBay()` queues pre-init bays, `buildPool()` populates still-parented ones (mirrors pendingSpills replay). Cold-solo probe: `[0,0,0,0]` → `[18,18,18,18]` PASS. Unblocked CARGO-VIS-1 evidence. |
| Medium | WARM-SOLO-1 — solo post-`carts-ready` stall (WARM-IGPU-1 residual) | Laptop A cap-206 (**solo**) took a 6.4s longtask ~1.9s after `carts-ready`, inside the countdown. WARM-IGPU-1's Lever A does **not** cover it: arena rotation is quickplay-only, and solo's flyover warm already runs inside `ensureSessionCartsReady`. Proxy evidence says the residual is driver-side first-draw cost (a 13.1s menu-warm frame carried only 235ms of attributed span time), so raising budgets will not help. Candidate mechanism worth checking first: scene content added *after* the warm pass (CSS2D nametags, cargo bays — CARGO-RACE-1's self-heal adds 18–30 meshes per cart, announcer/VFX) introduces new materials whose programs link at the first live countdown draw. **Work only on real telemetry** (`warmupSettle` / longframe spans from a weak-GPU playtester), never on speculation — no iGPU hardware available to reproduce. |
| Medium | HARNESS-NULL-1 — no measurement rig has a null-control arm | Process/tooling, not behavior. Every A/B number this repo produces is currently unfalsifiable: no rig can demonstrate it reports ~0 when nothing changed, so warm-up order, run ordering and accumulated state are indistinguishable from a real effect. We have already been burned — run-4's "GC metronome" attribution was wrong. The pattern: add a `--null` mode that runs **both** arms with the variable disabled, making the two runs byte-for-byte the same experiment; the measured delta must then be ~0, and anything else means the rig is biased and every number it prints in normal mode is contaminated rather than caused. Candidates in rough order of value: `perf-profile.mjs`, `battery.mjs` timing steps, `gameharness.mjs --scenario soak`. Prerequisite for trusting PROBE-WARM-RT-1's program-count deltas and for any future unattended tuning loop (an overnight loop compounds instrument error across every run). Source: `ryancampbell/kart-royale` `tools/drift-bench.mjs --null`; loop framing from `karpathy/autoresearch` `program.md`. |
| Medium | PROBE-WARM-RT-1 — VFX program anchors may be holding the wrong program key | Instrument-first; **no behavior claim until measured**. `outputColorSpace` and `toneMapping` are both pushed into three's program cache key (`getProgramCacheKeyParameters`) and both switch on `renderer.getRenderTarget() === null` — `outputColorSpace` unconditionally, not just for `toneMapped` materials. `compileAsync` (`main.js:2664`) binds no RT, so the anchors compile the **default-framebuffer** variant; the `composer.render()` prime (`:2679`) builds correct RT-variant keys only for what it actually *draws*, and the anchors are `visible=false` at `y=-500` (`koHitmarkerFx.js:259`, `cartShatter.js:1062` — both comments say "render skips them"). If that holds, the anchors' stated job (next KO is a cache hit) is defeated and the first shatter/KO/water/ram spawn links synchronously mid-round. **Measure first:** `renderer.info.programs.length` across the first KO. Fix only if it climbs — bind any non-XR RT around the anchor compile (1×1 scratch is enough; only `=== null` is tested). Making the anchors visible does *not* work: they are off-camera and cull. Pairs with WARM-SOLO-1 — same symptom class, different mechanism (that one is new content added after the warm; this one is the right content under the wrong key). Source: `ryancampbell/kart-royale` `src/core/Prewarm.ts`. |
| Medium | NET-RING-1 — decode-ring reject counters (review C-03) | Instrument-first. Rejects (dup/ooo seq etc.) burn ring slots AFTER decode; `netStateBuffer` retains ring-owned cart arrays by reference (`netcode.js:1422→1434`); true margin = 96−rejects, not 32, and only bites when consumption stalls. Count rejects-since-oldest-buffered; the copy-into-pooled-record fix only if counters show real traffic. |
| Medium | PERF-WATCH-1 — auto-quality step-up path | Watchdog demotion is irreversible per session (no step-up anywhere; DEV-only warn; 2 tier steps + 2 renderScale steps; attract render-cost and game frame-delta both judged against one 20.5ms bar). Decide after WARM-IGPU-1 P0b telemetry shows how often it bites. |
| Medium | PERF-TIER-1 — `high-lite` tier rung | `DISCRETE_GPU_RE` puts a 1660 Ti in the same discrete→High bucket as a 4090; High→Medium cuts 4 knobs at once (DPR 2→1.25, reflector off, crowd, lasers). Blocked on HYGIENE-1's `--dpr` profiling — tier table may be tuned against an inverted ranking (512px reflector is DPR-invariant; full-screen cost ×4 at DPR 2). |
| Done | SHEET-1 — in-match contact-sheet tool | ✅ **BUILT + PROVEN** 07-31 — `npm run sheet` / `--all`; subject-is-HUD gate; touch pass `0da5c4c`. Residual gaps are FIGHT-VERIFY-1 (loading / hover / podium). [sheet-1.md](./sheet-1.md). |
| Medium | Deeper server-authoritative logic (TRUST-1) `[SHIP-1 D1]` | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | Quickplay rotation live 2-browser check | Feature shipped; still wants a live multi-client confirm. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) `[SHIP-1 E2]` | Art half of closed VFX-1 — dark arenas + punchy neon must survive display-referred bloom. |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" `[SHIP-1 E2]` | Needs art-direction call before code. |
| High | CART-MODEL-1 — new cart basket/model `[SHIP-1 C1]` | Wyatt-led Blender work completing the prototype-era cart design. While in Blender: clean body UVs / 2nd UV channel — unblocks patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)). |
| Medium | Pattern customize UI `[SHIP-1 C3]` | Unblocked by CART-MODEL-1's re-UV. |
| Done | CARGO-VIS-1 — basket fill + overflow look `[SHIP-1 C2]` | ✅ closed 07-30 — Wyatt prod playtest PASS on `b13bafb`. [completed-work](./completed-work.md). |
| Low | Sunglasses finish materials broken `[SHIP-1 E2]` | |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Announcer re-records (Wyatt) `[SHIP-1 E3]` | Shorter directive takes + odd lines. Pipeline drop-in. |
| Medium | Sudden Death music low-pass `[SHIP-1 E3]` | Audio-graph surgery (shared Howler bus). |
| Low | Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated. |
| Low | Turntable swirl force revive | Scoped prototype via DIR-1 — taste-gated. |
| Low | KO "doomed" presentational cue | Idea stage. |
| Low | Death-cam "follow killer" revisit | Previously reverted. |
| Low | Animate the customize sunglasses-tab camera zoom | |
| Low | Subtle monetization path | Idea stage only. |
| Done | CARGO-WT-1 — grocery weight as risk/reward `[SHIP-1 B2]` | Closed 07-22 (Wyatt feel accept) — life-scoped boss/glass; bay count ramp; look → CARGO-VIS-1. |
| Done | AI-DIFF-1 — NPC difficulty modes `[SHIP-1 B1]` | Shipped 07-22 (`49bfc2a`). Medium = baseline; Solo Easy default + menu; Quickplay Medium; Friends host pick. |
| Done | HIT-FEEL-1 — hit feedback `[SHIP-1 B3]` | PASS 07-22 (Wyatt) — quieter incoming + woken normals; `?tune` ramming.fx. |
| High | INPUT-KB-1 — keyboard parity with controller `[SHIP-1 A2]` | |
| Done | ARENA-BAL-1 — self-KO rate on Sundial + Storerooms `[SHIP-1 B3]` | Closed 07-22 (Wyatt, no code). |
| Medium | SOLO-DIFF-1 — `DEFAULT_SOLO` easy→medium | `src/aiDifficulty.js:14` is `"easy"`; quickplay already pins medium. The default hides shipped AI-DIFF-1 work. Trivial flip — Wyatt call. |
| Low | Controller vibration strength *(pre-ship 07-19)* | |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| High | RESULTS-1 — results screen layout redesign `[SHIP-1 E1]` | |
| Medium | Controller menu navigation polish *(pre-ship 07-19)* | Modal-scoping shipped 07-20; remaining = polish + pad-in-hand validation. |
| Medium | UI-FRAME-1 — premium frame/panel styling pass `[SHIP-1 E1]` | |
| Medium | ESC scoring panel refresh `[SHIP-1 E1]` | |
| Low | Main-menu SFX slider `[SHIP-1 E3]` | |
| Medium | ONBOARD-1 — first-run controls card `[SHIP-1 E4]` | Minimal onboarding; Solo is the tutorial (AI-DIFF-1 sharpens it). Not a tutorial system. |
| High | FIGHT-VERIFY-1 — owed fight-night verification | 8 items at [fight-night-ui-handover.md:252+](./fight-night-ui-handover.md). Agent half via SHEET-1: responsive sweep 1025/1024/768/380, reduced-motion, cold-boot loading screens per arena, die-cut hover/press surfaces. Wyatt half (cannot be agent-closed): real-match HUD/results feel, two-client friends room (CHECKOUT LINE has never rendered). |
| Done | CARGO-HUD-1a — cargo-readout mock on BOTH hosts | ✅ 07-30 — injected mocks (no repo change) of nameplate vs score-strip, 3 states + matching baskets in one frame. **Wyatt picked nameplate placement with the score-strip chip treatment.** |
| Done | CARGO-HUD-1 — opponent cargo readout (nameplate) | ✅ PASS Wyatt 07-30 — live at `38d0dfc` / Version `f8e8da1f`. [cargo-hud-1.md](./cargo-hud-1.md) · [completed-work](./completed-work.md). |
| High | RESULTS-ACT-1 — PLAY AGAIN / MAIN MENU render below the fold in the short-window branch | **Found 07-31 by `npm run podium`** (FIGHT-VERIFY-1 Phase A), reproduced on two consecutive runs, both outcomes. `results.css:81` (`@media (max-height:640px) and (min-width:769px) and (pointer:fine)`) stacks the panel and sets `overflow-y:auto`, but nothing keeps the actions row inside the viewport — so the reward decision is entirely off screen and only reachable by scrolling a panel that gives no scroll affordance. Measured: **900×390** `.results-actions` top 610.6 / bottom 685.6 vs viewport 390 (**295px below the fold**, panel scrollHeight 686 vs clientHeight 390); **1025×600** top 727.3 / bottom 805.6 vs viewport 600 (**205px below**, scrollHeight 804 vs clientHeight 600). Both are `pointer:fine` squat windows — a resized desktop browser or a landscape laptop — exactly the case the CSS comment says it was written for ("a landscape 812x375, a squat laptop window"). Coarse-pointer phones take the `:538` full-bleed branch instead and are fine (390×844 passes). Evidence: `.diag-captures/podium/classicRecord-{victory,defeat}-{900x390,1025x600}-chrome.png` + the `actions are on screen` check row. Belongs to FIGHT-VERIFY-1's owed pass. |
| Medium | HUD-BOOST-PODIUM-1 — BOOST slab stays on screen through the whole podium and lands on MAIN MENU | **Found 07-31 by `npm run podium`.** The keyboard/gamepad boost meter (`.hud-boost`, "BOOST … 100") is still painted over the results overlay at every non-touch viewport. Visible bottom-centre at 1920×1080; at **390×844 it sits directly on top of the MAIN MENU button**. Two independent causes, both needed for a fix: (1) `hud.js:1997-2002` — `update()` early-returns on `suppressHud` (which is `escOpen \|\| roundPhase === "podium"`, `:1975`) **before** reaching `updateBoostWidget(roundState)` at `:2013`, so the widget never gets to hide itself even though its own `show` condition is `phase === "running"` (`:2043`); the slab keeps the inline `display:flex` written at `:2075` during the round. (2) `hud.css:1208-1216`'s `#hud.hud-suppressed` list covers `.hud-timer/.hud-scores/.hud-status/.hud-ready-btn/.hud-audio/.hud-menu-btn/.hud-conn/.hud-feed` but **not** `.hud-boost`, so CSS does not catch it either. `.hud-combo` is likewise absent from that list and worth checking in the same pass. Evidence: `.diag-captures/podium/classicRecord-defeat-390x844-chrome.png` (canvas hidden, so the slab is unambiguous). |
| Low | RESULTS-TOAST-1 — unlock toast collides with the results headline in short windows | **Observed 07-31 by `npm run podium`.** The `◆ UNLOCKED` challenge toast (`main.js:2281`, `showChallengeToast`, 5000ms) is a HUD element that is not covered by `hud-suppressed` either, and it paints over `#results-overlay`. At 1920×1080 it lands in empty space under the verdict and reads as intentional; at **1025×600 it is painted straight through `THE STORE IS NOW CLOSED` and the `PODIUMBOT WINS — 20 PTS` verdict line**. Non-deterministic (only fires when a round actually grants an unlock), so it is deliberately NOT a check row in `tools/podium.mjs` — it will simply appear in some montage cells and not others. Evidence: `.diag-captures/podium/classicRecord-victory-1025x600-chrome.png`. Same root family as HUD-BOOST-PODIUM-1: the podium suppression list is an allow-list that has fallen behind the HUD. |
| High | UI-SCALE-1 — responsive root-scale migration | Two passes per [responsive-scale-migration.md](./responsive-scale-migration.md): fluid root + rem clamps; media queries stay px. **Pass 1 also does ≤768 reflow — phone = fewer elements.** SHEET-1 unblocked (tool exists). Sequential single-owner. Safety: ≥1920 pixel-identical pre/post. |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | MAIN-1 | Carve `main.js` composition seam | Prerequisite for BUNDLE-1. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for leaderboard. `[SHIP-1 D1]` |
| Low | BUNDLE-1 | Menu/game code-split | Blocked on MAIN-1 (D-PERF-3). |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
| Low | Vite 500 kB chunk-size hint | Cosmetic. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Frozen — [brand.md](../brand.md). |
| Medium | SHEET-ESC-1 | `tools/sheet.mjs`'s pause-overlay gate is dead code | **Found 07-31 while building `tools/podium.mjs`.** `sheet.mjs:126` computes `escVisible` as `esc.offsetParent !== null`, but `#esc-overlay` is `position: fixed` (`pauseOverlay.css:12`) and per CSSOM-View `offsetParent` is **null for every fixed-position element**, shown or hidden. Measured live on two runs: `#esc-overlay offsetParent===null → true` with the pause overlay closed. So `escVisible` is permanently `false` — the `subject is the in-match HUD` check's `esc=false` clause is vacuous, and the pause-recovery branch (`sheet.mjs:256-267`, the one the comment credits with catching a cell that captured the PAUSE overlay and still passed 4/4) can never fire again. Fix: use computed style, as `tools/podium.mjs`'s `readSubject` does — `display !== "none" && visibility !== "hidden" && opacity > 0.01` — and keep the `offsetParent` reading only as printed evidence. Low blast radius, tools-only. |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-only Rapier on a client | Architecture invariant — [AGENTS.md](../../AGENTS.md). |
| Zustand + KO event reactors | Current and coherent. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct. |
| Big `config.js` knob table | Fine if knobs stay centralized; DIR-1 stops mid-round mutation. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX — after mobile perf; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover (BRAND-1).
- MAIN-1 → BUNDLE-1 after V2.
- DIR-1 runtime modifier stack if Living Store grows mutators.
- GLTF-1 legacy layout deletion after cartrave4-only sign-off.
