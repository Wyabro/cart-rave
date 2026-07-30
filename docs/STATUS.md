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

**Playtesting and stabilization.** Tier A drained. **B1 AI-DIFF-1 shipped** (`49bfc2a`). **B2 CARGO-WT-1 closed** (Wyatt feel accept 07-22). **B3 HIT-FEEL-1 PASS** (Wyatt playtest 07-22 — quieter incoming + woken normals; `?tune` ramming.fx). **ARENA-BAL-1 closed** (Wyatt 07-22, no code). **CARGO-VIS-1** queued (full-bay + rim overflow). **Before public/external playtest: reset analytics DO** (see Gotchas).

Run 7 mission closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). Stay in this phase until Wyatt advances the marker.

**Parallel track — "Fight Night" UI redesign: complete, merged (PR #3 → `cart-clash` `56dfa61`), deployed to prod** (bundle `sha:56dfa61`, verified against the fetched asset). Every 2D surface rebuilt on one shell/slab language. **Owed: a real-browser verification pass in production** (live match, two-client friends room, cold boot per arena, touched hover/press surfaces) — signed off by DOM/computed-style only so far. See D-FIGHTNIGHT-1 + [fight-night-ui-handover.md](./planning/fight-night-ui-handover.md).

Playtest console: [playtest/console.html](./playtest/console.html).  
F8 → auto-upload; pull: `npm run captures:pull` (needs `.env.local` `ERROR_LOG_TOKEN`).

**07-30 — laptop captures analyzed (cap-205…214, two new medium-tier iGPU laptops, build `56dfa61`):**
first play of the session stalls 3.8–7.1s in the `warm:true` play-shader path, and on the slower
laptop the flyover warm pass froze **6.4s inside the countdown** (elapsed 8163ms vs 3600 — 3-2-1
never rendered). Gameplay after entry is clean on both (<0.3% frames >33ms). Queued as
**WARM-IGPU-1** — [Phase 0 acked 07-30](./planning/warm-igpu-1.md). Laptops played solo only — no new MP evidence.

**07-30 — research fold-in (QA-STATUS-1):** four phone-research docs verified against the tree
(external code review at `56dfa61` · CARGO-HUD-1 handover · responsive-scale spec · agent-loop
findings) and folded into the locked queue below. New card details live in
[BACKLOG](./planning/BACKLOG.md), not here.

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
| **A6** NET-SIM-1 | Reconnect / socket-lifecycle sims | ✅ **closed** (Cap-200 shipped + menu PASS; hostReload 13/13) |
| **COUNTDOWN-ARM-1** | Play-ready-gated continuous `game_start` | ✅ **PASS** (Wyatt smoke 07-22 on `e08e5f5` — full 3-2-1) |
| **A7** ANLX-VIEW-1 | analytics reading surface (`analytics:pull` + CC panel) | ✅ **PASS** (Wyatt smoke 07-22) |
| **B2** CARGO-WT-1 | life-scoped grocery weight (boss/glass) | ✅ **closed** (Wyatt feel accept 07-22; look → CARGO-VIS-1) |
| **B3** HIT-FEEL-1 | hit feedback — weak normals + noisy incoming | ✅ **PASS** (Wyatt playtest 07-22) |
| **ARENA-BAL-1** | Sundial + Storerooms self-KO rate | ✅ **closed** (Wyatt 07-22, no code) |
| **QA-STATUS-1** | STATUS token overage broke `qa` | ✅ closed this commit — 07-21 log archived, queue reordered |
| **HYGIENE-1** | 4-item sweep: sourcemaps off · boot-error filter · default branch · profiler `--dpr` | ✅ 07-30 — 3 branches deleted; dist has 0 `.map`; **one Wyatt step left: GitHub Settings → default branch → `cart-clash`** (classifier blocked `gh repo edit`) |
| **C2** CARGO-VIS-1 | full-bay fill + rim overflow look | ▶ session 3 pass 3 (07-30) — Wyatt 4-phase pacing: `fillPhases` **5/10/20/30**, stepped `lifeCargoVisibleCount`, GRID 30 (15 floor · 10 mid · 5 crest); all 4 phases verified live; phase-strip shots sent; **Wyatt eyes = the close** |
| **WARM-IGPU-1** | first-play warm stall swallows countdown (medium iGPUs) | 📋 [P0 acked 07-30](./planning/warm-igpu-1.md); P0b (watchdog disproof + tier telemetry) and P1 need own acks |
| **CARGO-HUD-1a** | cargo-readout mock on BOTH hosts, 3-state — Wyatt picks | 📋 after WARM P0; before WARM P1 |
| **SKYBOX-1** | restore never-built sceneExtras skybox (review C-01) | 📋 after WARM P1 — Wyatt eyes close |
| **SEC-BEACON-1 · SEC-UNLOCK-1 · SEC-ROUTE-1** | beacon rate-limit · devUnlocks URL gate · startsWith routes | 📋 before external testers — with analytics-DO reset |
| **SHEET-1** | in-match contact-sheet tool (`?room=solo` boot) | 📋 blackframes readback pre-check first |
| **FIGHT-VERIFY-1** | owed fight-night verification | 📋 agent half via SHEET-1; Wyatt half = playtest |
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

1. **Wyatt, 30s:** GitHub Settings → default branch → `cart-clash` (HYGIENE-1's last item; `gh repo edit` was permission-blocked).
2. **CARGO-VIS-1** (next, own ack — session 1 = geometry + screenshots). Locked order after (07-30): **WARM-IGPU-1 P0+0b → CARGO-HUD-1a → WARM P1 → SKYBOX-1 → SEC series → SHEET-1 → FIGHT-VERIFY-1.**
3. **Before public/external playtest:** SEC-BEACON-1/UNLOCK/ROUTE **plus** `DELETE /api/analytics?token=…` (clear DO) — see Gotchas.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).  
Closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, PLAY-1, …) live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| WARM-IGPU-1 | First-play shader warm stall on medium-tier iGPUs (countdown swallowed) | 📋 Queued — [Phase 0 acked 07-30](./planning/warm-igpu-1.md) |
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 Post-gate |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked on MAIN-1 |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**Stabilize in place** — keep Playtesting & stabilization until Wyatt advances. Completed
evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1) stays on the board as proof, not as RC entry.
When named: other residual or RC exit criteria in [ROADMAP.md](./planning/ROADMAP.md).

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

- **D-CARGO-VIS-1** (07-30): The CARGO-WT-1-era "pile stays under the rim" invariant is
  reversed — a boss/full bay is SUPPOSED to crest the rim. Layer-2 grid slots solve against
  bay-local `rimY` (from `box.max.y`, minus bay parent offset); do not "fix" the pile back
  under the rim.
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
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated: `DELETE https://cart-rave.wyabro.workers.dev/api/analytics?token=<ERROR_LOG_TOKEN>` (same secret as `analytics:pull`). Then re-pull / dashboard after the playtest window.

## Last updated

2026-07-30 (CARGO-VIS-1 session 3 — fill retune pass 1, Wyatt-acked levers) — Wyatt annotated
the session-2 "full" shot: pile occupied ~⅓ of the true cavity (the 0.48/0.42 insets were
never-rendered guesses). Three levers: rave cavity insets 0.48/0.42 → **0.68/0.60**
(entities.js), **cargoScale 0.52 → 0.60**, crest float-guard **1.4 → 2.2·halfY**
(groceryPool.js). Pass-1 reshoot: pile reaches the right wall + front edge, crest breaks the
rear rim in profile and at gameplay distance (boss-wide; bay1 orange fully tops the rim); left
third still read open → Wyatt flagged the GRID lever. **Pass 2:** GRID 18→25 + `maxItems` 25.
**Pass 3 (Wyatt: 4 phases, 5>10>20>30):** `CONFIG.cargo.fillPhases` [5,10,20,30] + stepped
`lifeCargoVisibleCount` (quarter-split over fullScore: life 1–2 / 3–4 / 5–7 / 8; weight01
stays continuous — only the LOOK steps), GRID → 30 (15 floor · 10 mid · 5 crest), baseItems
10 / maxItems 30. All 4 phases verified live (fill 5/10/20/30 on every cart, rig reloads at
life 2/3/6/8); phase-strip shots sent. qa 773/773 each pass. Wyatt eyes = the close.

2026-07-30 (CARGO-VIS-1 session 2 — CartFrame fix; real-dims bays proven live) —
`getBasketCargoParams` (entities.js) matches `CartFrame` (instance rename of authored
`tripo_part_0`), so live rave carts hit the measured-bounds path (probe ×4: origin computed,
itemYTop 0.80). qa 773/773. Superseded by Wyatt's red-line review → session 3 above.

2026-07-30 (CARGO-VIS-1 session 1c — hi-res rig + root cause; 1b look-claims superseded) —
Rig recipe (reusable for SHEET-1): hardware-GPU headless (`--enable-gpu --ignore-gpu-blocklist
--use-gl=angle` — kills SwiftShader blur + software-mode modal); warm reload for real rave carts
(cold boots spawn the procedural fallback, entities.js:162 — clear `sessionStorage
cartRaveEngagedRoom` first or main.js:1794 strips `?room=solo`); boss fill via in-page
`import("/src/config.js")` → `cargo.baselinePoints = fullScore` before the first cargo frame.
Found: every rave bay built from getBasketCargoParams' conservative fallback (bay y −0.1 on all
4 live bays) — cartRaveGltf.js renames `tripo_part_0` → `CartFrame` at prep, the entities.js
name match never hit → boss-18 low + tight, no crest. 1b's "cresting" read (900×600 SwiftShader,
cold-boot carts) superseded by this measured pass. Fix → session 2 above.

2026-07-30 (CARGO-VIS-1 session 1b) — first rig pass off the CARGO-RACE-1 self-heal: 3-state
shots (`.diag-captures/cargo-vis-1/`, SwiftShader 900×600, cold-boot carts). Look-claims
superseded by 1c / 2 / 3 above.

2026-07-30 (CARGO-RACE-1 fixed — cold-boot empty cargo bays now self-heal) — `createCargoBay()`
queues bays built before `GroceryPool.init` resolves (`pendingBays`, mirrors the pendingSpills
replay); `buildPool()` re-runs the item build for still-parented, still-empty bays after
`ready = true` and before the spill replay, so a bay hidden by a queued spill stays hidden.
One file (`src/effects/groceryPool.js`), no signature/caller changes. qa 773/773. Probe
(cold headless `?room=solo`, scratch Playwright rig on the harness lib): bays first seen
`[0,0,0,0]` — the exact pre-fix condition — healed to `[18,18,18,18]` by phase=running, PASS.
**Unblocks the CARGO-VIS-1 screenshot rig** (session-1 evidence lever).

2026-07-30 (CARGO-VIS-1 session 1 — geometry landed; evidence rig blocked, timeboxed out) —
Bay-local `rimY` plumbed `getBasketCargoParams` → `createCargoBay` (all 3 cart paths, both
call sites), GRID widened to ±1.0, layer-2 crest solves against rimY with a float guard for
deep baskets; the old under-rim comment REVERSED (D-CARGO-VIS-1). qa 773/773. **Screenshot
evidence blocked:** `createCargoBay()` builds its item list once, `GroceryPool.init` is
deliberately non-blocking (main.js:2826) — cold `?room=solo` headless boots lose the race
every time → empty bays (probe: itemCount 0 on all 4). Same race can hit a real cold-cache
fast play entry until the next KO rebuild → **CARGO-RACE-1** logged in BACKLOG. Next rig
lever: gameharness `holdKey` drive-into-pit → KO respawn rebuilds bays with loaded models; or
Wyatt real-window look. Proven for SHEET-1: `freeze=1` + manual camera pose gives clean
into-basket framing in a live round.

2026-07-23 (UI — fight-night redesign MERGED + DEPLOYED to production) — PR #3 merged into
`cart-clash` (merge commit `56dfa61`), then shipped via `npm run ship`. Live prod bundle carries
`sha:56dfa61` (**verified against the fetched asset**, not the upload log), entry
`index-ekljSWqj.js`, Worker Version `3f681e27-68e0-4992-ba9c-53d3c9ff08df` at
https://cart-rave.wyabro.workers.dev — supersedes the AI-DIFF-1 bundle `index-Dxyw7U08.js`. Cache
note: HTML is edge-cached (`CF-Cache-Status: HIT`, `max-age=0 must-revalidate`) — a stale first
paint resolves on reload, not a failed deploy. The redesign rebuilds **every 2D surface** onto one
"Fight Night" language: 3a main menu, 6a HUD, 7a–7g sub-screens/ESC/results, both loading screens,
a game-wide die-cut→slab sweep (locked decision 2 closed, audited against a live DOM), and one
unified Customize chip recipe. **Verified by DOM geometry + computed styles only — never by eye
except 7a/7c/3a.** Merge is deliberately for **full verification IN PRODUCTION** (Wyatt): still
unseen — a live match (HUD + results on a finished round), a two-client friends room (the CHECKOUT
LINE lobby has never rendered anywhere), a cold boot into each arena (both loading screens unseen
in their real moment), and every hover/press surface the sweep + chip cut touched. **PARKED:**
victory confetti + defeat wilt are missing in multiplayer — investigation, leading hypothesis and
the one-line two-client test that settles it are in the handover under "Known-but-parked". Full
progress log: [planning/fight-night-ui-handover.md](./planning/fight-night-ui-handover.md).

> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-07-22 — [archive/status-log-2026-07-22.md](./archive/status-log-2026-07-22.md) (AI-DIFF-1 ship · ANLX-VIEW-1 · COUNTDOWN-ARM-1 · A6b false green + fix · plan→ack firewall)
> - 2026-07-21 — [archive/status-log-2026-07-21.md](./archive/status-log-2026-07-21.md) (ARCH · PARITY · PERF-WARM root cause + reverted gate · WRAP · COUNTDOWN-ABORT-1)
> - 2026-07-20 → 07-21 — [archive/status-log-2026-07-20-to-21.md](./archive/status-log-2026-07-20-to-21.md)
> - 2026-07-19 → 07-20 — [archive/status-log-2026-07-19-to-20.md](./archive/status-log-2026-07-19-to-20.md)
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
