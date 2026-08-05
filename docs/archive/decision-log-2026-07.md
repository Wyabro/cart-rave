# Decision log — July 2026 (archived)

Full-text decision entries moved out of [STATUS.md](../STATUS.md) during the 2026-07-12
documentation consolidation, so STATUS stays a readable dashboard. **Append-only history —
do not edit past entries.** New decisions: add a one-line entry to the STATUS decision index
and, when the rationale is long, append the full text here.

These decisions are settled. Do not re-litigate them without new evidence; when one names a
file, flag, or knob, verify it still exists in the tree before relying on it.

---

- **D-VIS-1** (2026-07-11): Borrow LAAS *process* only (STATUS, shoot/compare, ablation, bookmarks). Do not port WebGPU open-world systems.
- **D-DOC-1** (2026-07-11): `AGENTS.md` restored from branch `docs/agent-config-rewrite` (never merged to `cart-clash`). STATUS did **not** replace it — STATUS = session memory; AGENTS = standing rules.
- **D-VIS-2** (2026-07-11): Harness uses WebGL + Playwright page screenshots (not WebGPU headless recipes).
- **D-VIS-3** (2026-07-11): `?cam=` implies freeze (camera lock). Ablation reapplied after quality toggles via `reapplyAblation()`.
- **D-PERF-1** (2026-07-11): PERF-1 measured pass. Local dev "2s first level-swap" is a **Vite dev-transform artifact** (chunk on-demand compile), NOT a prod cost — proven by pre-warming chunks (→~0ms). Do not chase it. Added `?perf=1` (DEV) per-phase swap breakdown in `commitLevelLoad`.
- **D-PERF-2** (2026-07-11): Shipped `prefetchLevelChunks()` (`src/levels/index.js`) — idle-warm now prefetches the two **non-selected** arena chunks so menu arena-switching never waits on a lazy `import()`. Verified: before, only selected arena warm; after, all three. Quality-neutral.
- **D-VFX-1** (2026-07-11): VFX-1 real-hardware probes (offline `blackframes` battery runs software-GL SwiftShader and **cannot** reproduce the ANGLE/NVIDIA HalfFloat quirk — proven: 90 frames Storerooms, worst 0.0043). Shipped: (a) `?blackmon=1` live monitor (`src/utils/blackFrameMonitor.js`) — samples the canvas **synchronously post-render** in `frameVisuals` (separate-rAF reads the cleared buffer since `preserveDrawingBuffer:false`), splits **left vs right half** so a slab (L XOR R) is distinguished from full-black loading/countdown noise; `__blackMon.summary()`/`.stop()`. (b) `?rtmode=half|float|byte|bloombyte` composer/bloom RT A/B (`scene.js`) — half=default byte-identical; float=RGBA32F; byte=UnsignedByte control; bloombyte=HalfFloat composer + UnsignedByte bloom mips (half-res bloom suspect). All boot clean, no GL errors. **Confirmation still needs Wyatt's hardware + eyes** — do not thrash the look; A/B with screenshots. See handover-postfx-black-frames.md (archived).
- **D-VFX-2** (2026-07-11): **VFX-1 root cause CONFIRMED** via Wyatt playtest (`?blackmon=1`, real NVIDIA/ANGLE HW, ~2min Storerooms each): default(HalfFloat composer+bloom)=**237 slabs**/good look; `float`(RGBA32F everywhere)=**271 slabs**/good look; `byte`(UnsignedByte everywhere)=**0 slabs**/bad look; `bloombyte`(HalfFloat composer + byte bloom mips)=**0 slabs**/bad look. default vs bloombyte differ ONLY in bloom-mip type → **the flicker is the half-res *float* bloom mips, NOT the composer**. 32-bit does not dodge it (float still 271 → ANGLE quirk hits all float RTs). byte bloom kills flicker but clips HDR bloom (pre-tonemap) → plastic. Candidate fix shipped: **`?rtmode=bloomfix`** = HalfFloat composer + UnsignedByte bloom mips + bloom moved AFTER OutputPass (display-referred) + `BLOOM_DISPLAY_CONFIG` starting knobs (`scene.js`). 0-flicker guaranteed (same byte mips as bloombyte); **look needs Wyatt A/B + threshold/strength tune** before promoting to default. Do NOT change default pipeline until approved. *(Follow-up: per-arena bloom pipeline shipped as `98317c1` — display-referred byte bloom on Storerooms, HDR elsewhere; Classic/Sundial look check + promote-to-default still pending.)*
- **D-GP4-1** (2026-07-11): **Production Pass 4 — gameplay feel / combat / AI** implemented (landed as `73631e0`). Investigation (3 read-only audits) → surgical fixes, no refactor. **AI (`simulation.js`):** (A1) random-stop cut 14%→4%/7%→2%, suppressed within 9m of a human, no re-roll right after a pause — the #1 "stops for no reason" cause; (A2) fixed the `nearHazard` 60Hz thrash **latch** (branch now resets `aiLastProgressMs` + defers re-pick so `isStuck` clears); (A3) octagon-rim tangent-escape (`escapeMode:"inward"`) so wedged Sundial bots flee inward not tangent; (A4) dropped the 25% "back off when within 2.8m of target" reverse — bots press the attack; (B5) proximity aggression: human within 7m ⇒ `humanWeight≥0.9` (fixes "drives past nearby players"); (B6) `reachOuter` widens Classic chase clamp 0.88→0.92 (0.72→0.78 cautious) so bots follow edge-campers (patrol/wander insets unchanged). **Sundial (`simulation.js` + reuse of `zanzibarPlatform` podium keep-out):** (C7) `applyOctagonRimAvoidance` reactive inward push off the sole kill rim; (C8) `aiContestPodiumUntilMs` — when a human camps the podium, bots drive **onto** it (keep-out suppressed) to contest instead of fleeing — fixes the KotH camp. **Combat feel:** (D9) `playCartCrash(intensity,opts)` scales SFX volume 0.45→1.0 by hit intensity + beefier low rate on boost rams (was flat full-volume for tap==slam); (D11) ram cone `alignmentDotMin` 0.1→0.2 (~84°→~78°, cuts glance-triggered full FX); (D12) `attemptLocalHop()` grounded gate blocks human air/chain-hops (NPC/replay unchanged); (D13) local human gets only 0.4× `applySquareHoleLipAssist` so it stops fighting deliberate edge plays. **Timing (`config.js`/`announcerEvents.js`/`main.js`):** (E14) directive callout banners 5.2s→~4s (effect window still 18s); (E15) wired dead `fall.respawnDelayMs` (→1000, was hardcoded). **Deliberately NOT changed:** D10 critical-hit basis (`speed` not `closingSpeed` is documented decision D1 — left intact); solo/MP rubberband + single-target convergence (user chose to keep the intensity, bugs only); nitro duty-cycle, `driving.braking` dead knob, `maxImpulse`-vs-boost, `airControlFactor`, readability HUD adds — all documented as follow-ups. Gates at the time: `npm run qa` green (238 tests, 24 files), `npm run build` clean. Runtime smoke: Sundial solo ~90s w/ perfPump — bots scored KOs, 0 console errors, octagon/podium paths exercised. **Needs Wyatt production playtest** (behavior-changing): stall-free bots across all 3 arenas, edge-camper follow, visible podium contest, ram-SFX dynamic range, MP two-browser parity.
- **D-PERF-3** (2026-07-11): `vite.config.js` now uses `codeSplitting.groups` (not `manualChunks` hints). Fixes the misleading 650 kB "animejs" chunk — it was ~92% **Three.js core** (animejs/adapters/three drags three in; manualChunks folded it there). Now: honest `three` ~gz176 + `animejs` ~gz18. **Zero bytes saved** (no dup — index/addons import three from that chunk), naming/cache-line only. **BUNDLE-1**: real menu/game code-split is blocked — `Netcode` (132 uses, incl. `resolveCartNeonHex` at menu), `HUD` (per-frame `isEscOverlayVisible`), and even "isolated" `touchControls`/`announcer` are statically imported by menu-coupled `hud.js`/`netcode.js`. No clean seam; needs full gameplay-cluster-behind-one-dynamic-boundary refactor + NET-1 smoke before it moves any bytes.
- **D-STAB-1** (2026-07-11): **Repository stabilization pass** (bugfix + cleanup, no features). (a) **Boost bar leak fixed** — `hideGameplayElements()` now resets the mobile BOOST-ring (`updateBoostRing(null)`) and the meter caches via one `resetBoostWidget()` helper (`hud.js`); verified live on the pause-quit exit path. (b) **Wheel roll rewritten to travel-based** (`cartRaveGltf.js`): signed speed now projects corner velocity onto the wheel's live rolling direction (roll axle × up from the pivot chain) instead of the steer heading — fixes "wheels only spin while steering" + inconsistent direction; front-wheel rear-average sync deleted (it papered over the inconsistent signs). Verified live: straight cruise rolls all 4 wheels uniformly; opposite travel flips sign. (c) **Zanzibar podium +20%** — `PODIUM_BASE_R` 7.2→8.6, `PODIUM_TOP_R` 5.0→6.0; collider, AI keep-out, and scoring radius (base+0.5) all derive from the one constant; decal rings are relative offsets (follow automatically); apothem margins verified positive; geometry confirmed live in preview scene. (d) **Menu pacing** ~1060ms→~700ms entrance cascade, overlay opens 320→240ms, dismiss 180→140ms; attract reveal fade 900→600ms + framing constants hoisted. (e) **Best-effort menu music** attempt at boot-splash dismiss (autoplay-policy permitting; silent fallback to first gesture). (f) **Portrait menu hint** — CSS-only pill inside `#cr-root` for coarse-pointer short-landscape; gameplay rotate prompt untouched. (g) **Reflector**: 1024² idle upgrade now skipped on touch devices; size ladder documented (preview 128 → play 256 → idle 1024 desktop-high); kept 1024 desktop (no-visible-change rule), frame-gating stays off-limits (jitter revert). (h) **Grocery cargo**: same-layer relaxation pass kills slot-collapse interpenetration; **no GLB edits needed** — placement is fully code-driven. (i) **Cleanup**: `clamp`/`clampInt`/`lerpAngle` consolidated into `utils.js` (5 dup clamps deleted); dead `driving.braking` + `booth.neonColor1/2` config deleted; dead `src/audio.js` write-only bridge deleted; no-op `reapplyRaveGltfCartTuningOnScene` stub deleted (Tweakpane layout sliders now log the respawn-to-apply hint); knip ignores **all removed** (6 hidden dead exports fixed — knip fully clean); `fall.yThreshold` fallback literals normalized. Gates: qa green **285 tests / 28 files**, build clean, 0 console/server errors in dev smoke. **Needs Wyatt playtest**: wheel spin direction by eye, bigger podium feel/AI contest, menu pacing taste, grocery pile look.
- **D-STAB-2** (2026-07-11): **Quickplay arena rotation deferred** (user call). Ready-made seam when wanted: pick next id from `PREFETCHABLE_LEVEL_IDS` (`src/levels/index.js:22`) at the rematch seam — solo/local: `onReturnToLobby` (`src/main.js`, rematchResetWorld call sites); online: host `sendHostRound` already broadcasts `levelId` (`src/netcode.js`) — then route through the existing `commitLevelLoad`. A masked transition needs its own reveal animation (play entry currently hides behind the loading overlay).

- **D-BUNDLE-1-CLOSE** (2026-08-05): **Supersedes the BUNDLE-1 half of D-PERF-3.** D-PERF-3 predicted that a real menu/game code-split was blocked behind a full "gameplay cluster behind one dynamic boundary" refactor, and that nothing would move bytes until that refactor happened. **The refactor happened, and the byte prediction was right: the perf prediction it implied was wrong.** BUNDLE-1 cut all four named edges (`main.js` top level, `levelOrchestration`, `menuPlayEntry`, netcode's 7 game imports plus two more found by walking the graph), moved `bootGameSystems` behind `await import()`, and took **−351,503 B (−22.6%)** off the initial download set — 1,554,863 → 1,203,360 B, with `effects`/`simulation`/`hud`/`cartShatter`/`waterDeathFx`/`koReactors`/`cartOrchestration` all verifiably out of the preload set. **The bytes moved. The warm-target perf did not.** On the locked target (Intel UHD, warm repeat visit, prod) `menu-ready` went **988 → 958 ms, −3%**, against a −15% gate, and `module-eval` went **472 → 502**, i.e. *worse* than pre-card — so Lever E's own falsifiable hypothesis ("−351 kB cuts parse clearly below 472") is dead. **Mechanism: on a warm cache the bytes are already local**, so deferring them saves parse+eval only, while the extra chunk boundaries cost requests and lost cross-chunk optimization — roughly cancelling the saving. Cold was deliberately not measured; the bytes are kept regardless, and a cold first-time visitor does get all 351 kB of it. **Standing lesson: measure the target profile's parse-vs-construction split BEFORE choosing levers.** BUNDLE-1's lever order was built on a cold n=1 profile (87% bytes / 13% construction) while the locked target was warm (48/52) — the plan was pointed at the wrong half for its first four levers. **Banked regardless:** the repo's first bundle-size gate (`npm run size:check`, byte ceiling **and** module-level membership; `release:check --require-dist`), and `main.js` 2,582 → 1,262 lines. Closed **PARTIAL**, not done. Full record: [planning/bundle-1.md §0](../planning/bundle-1.md).

---

## Decisions that were made but never logged in STATUS (reconstructed 2026-07-12)

Concurrent July 11 sessions shipped without STATUS entries; recorded here from commit
messages so the log is complete:

- **Production Pass 5 (VFX / audio / production value)** — waves 1–3 landed as `043e793`,
  `7146d71`, `eb924af`: grocery-spill burst + clatter SFX, collision debris personality,
  cargo emissive readability, sunglasses neon envMap, comeback callout, menu UI clicks,
  distinct Defeat screen, first-blood escalation, floor/edge + victory audio. Deferred
  (asset-gated or taste-gated): clutch slow-mo, Sudden Death music, ambient bed, recorded VO.
- **Netcode test punch list closed** — `1dbb48a` extracted `party/roundValidation.ts`
  (host_round validation) + `party/hostSelection.ts` (promote-oldest) + `applyHostMigration`
  client handoff, all unit-tested; `6ee9c0b` added the P2P DataChannel size gate
  (`src/netcode/p2pLimits.js`). Static hazards in
  [netcode-deep-dive.md](../planning/netcode-deep-dive.md) remain open; live 2-client checks
  remain ([host-migration-test-plan.md](../planning/host-migration-test-plan.md)).
- **Physics WASM: SIMD opt-in** — `9d8a69e` preferred Rapier SIMD, then `8174180` reverted to
  standard Rapier by default after a game-breaking borrow error; SIMD is opt-in only.
- **Per-arena bloom pipeline** — `98317c1` shipped the D-VFX-2 candidate as per-arena:
  display-referred byte bloom on Storerooms (flicker-free), HDR bloom elsewhere pending the
  look check.
- **Menu backdrop simplification** — `3754949` replaced the faux DOM backdrop (floor grid /
  spotlights / particles / scanlines) with a palette-tinted layered gradient on
  `.cr-root::before` (`--menu-glow1/2` from arena ambience).

## Rolled from the STATUS decision index — 2026-07-31 archive pass

These four one-liners had no full-text entry here, so they are preserved verbatim rather
than dropped when STATUS's index was trimmed. Same rule as above: settled, append-only.

- **D-CONTENT-1** (07-17): Pure-data arena catalog is the client authoring source for labels/themes/music/ambience/unlocks.
- **D-HARDEN-1** (07-13): Pre-playtest council hardening — SD replay-tiebreak; `sd_win` latch; Rapier `castRay` exclude-object fix; quickplay rematch re-entrancy; `suddenDeathPulse` leak.
- **D-NET-CLK-MIG** (07-12): NET-CLK-1 dual clocks, NET-CLK-3 round-clock stamps, NET-MIG-1 kill-credit `attr` on promote.
- **D-TERM-1** (07-12): Terminology pass — [style-guide.md](../style-guide.md) canonical.

## Rolled from the STATUS decision index — 2026-08-01 archive pass

Fifteen 07-20 → 07-23 entries whose full text lived only in STATUS's index — preserved
verbatim here when the index was trimmed for the 8k STATUS budget. Same rule as above:
settled, append-only.

- **D-FIGHTNIGHT-1** (07-23): "Fight Night" UI redesign complete — every 2D surface (3a menu, 6a HUD, 7a–7g, both loading screens) on one shell/slab language; decision 2 die-cut sweep closed + one Customize chip recipe. Merged (PR #3 → `cart-clash` `56dfa61`) and deployed to prod for full verification. Signed off by DOM/computed-style only (7a/7c/3a by eye); confetti/defeat-wilt-in-MP parked. Log: [fight-night-ui-handover.md](./planning/fight-night-ui-handover.md).
- **D-HIT-FEEL-1** (07-22): HIT-FEEL-1 PASS — quieter incoming (vignette remap + `crashVolumeFloor` 0.22 + `hitDirMin` 0.14) and woken normals (`shakeMinIntensity` 0.22 / boost 0.16); `?tune` exposes `ramming.fx.*`. Wyatt playtest confirmed.
- **D-HIT-FEEL-QUEUE-1** (07-22): Closed B2 CARGO-WT-1 (feel accept) + ARENA-BAL-1 (no code). Active card → HIT-FEEL-1; Round 1 = vignette remap + `CONFIG.ramming.fx.crashVolumeFloor` (volume floor, not gate); Round 2 = shake gate + expose `ramming.fx.*` in gameplayTunePane.
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
