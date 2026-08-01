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

**Playtesting and stabilization.** Tier A drained; Tier B/C, the security sweep and the
analytics gating are closed — full evidence in
[completed-work.md](./planning/completed-work.md) (**B1 AI-DIFF-1** shipped `49bfc2a`).
**ANLX-ATTRACT-1 closed 07-31** and the **analytics DO has been reset** (both
before-external-testers items are done); the ring now starts clean.

Run 7 mission closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). Stay in this phase until Wyatt advances the marker.

**Parallel track — "Fight Night" UI redesign: complete, merged (PR #3 → `cart-clash` `56dfa61`), deployed to prod** (bundle `sha:56dfa61`, verified against the fetched asset). Every 2D surface rebuilt on one shell/slab language. **Owed: a real-browser verification pass in production** (live match, two-client friends room, cold boot per arena, touched hover/press surfaces) — signed off by DOM/computed-style only so far. See D-FIGHTNIGHT-1 + [fight-night-ui-handover.md](./planning/fight-night-ui-handover.md).

Playtest console: generated — `npm run dashboard` / `npm run playtest:console` →
[.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html)
(cards from STATUS “needs Wyatt playtest” + BACKLOG `Owed: Wyatt playtest`).  
F8 → auto-upload; pull: `npm run captures:pull` (needs `.env.local` `ERROR_LOG_TOKEN`).

**07-30 — laptop captures (cap-205…214, medium-tier iGPUs):** first play stalled 3.8–7.1s in the
`warm:true` path; slower laptop froze 6.4s *inside* the countdown. Gameplay after entry clean.
Closed as WARM-IGPU-1; residual = WARM-SOLO-1 ([detail](./planning/warm-igpu-1.md)).

**07-30 — research fold-in (QA-STATUS-1):** four phone-research docs verified against the tree
and folded into the queue below; card details live in [BACKLOG](./planning/BACKLOG.md), not here.

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

Live queue = [SHIP-1.md](./planning/SHIP-1.md) tiers; Run 7 is archived evidence.

Tier-A/B/C rows closed 07-21 → 07-31 (A1–A7 · COUNTDOWN-ARM-1 · CARGO-* · SKYBOX-1 ·
WARM-IGPU-1 · HYGIENE-1 · SEC-BEACON/UNLOCK/ROUTE-1 · ANLX-ATTRACT-1) are archived with their
evidence in [completed-work.md](./planning/completed-work.md) — only live cards stay here.

| # | What | Status |
|---|------|--------|
| **ANLX-ATTRACT-1** | mid-round joins booked phantom matches | ✅ **CLOSED** 07-31 — live at `2e85f0b` / Version `4083335f`. Live two-client prod probe: 2 clients adopted `phase=running` while unseated → **0 `match_started`**; all 7 emitted starts carried `joinedMidRound` (6 `true`, 1 `false`); 0 `<3 s` draws. Counting metric could not decide it (cluster died 07-22, pre-fix) — [full acceptance](./planning/completed-work.md) |
| **ANLX-BULK-1** | short scripted `loss` bulk in analytics | ✅ **CLOSED + SHIPPED** 07-31 — L1+L2 + `MIN_MATCH_DURATION_MS=3000`; live after `a1562e3` deploy. Product metrics filtered; byName raw (P-A). |
| **SEC-TOKEN-1** | admin token out of query string | ✅ **CLOSED + SHIPPED** 07-31 — Bearer only (`party/adminAuth.ts`); `0ad8a3e` / Version `60e4718a…`. |
| **SHEET-1** | in-match contact-sheet tool (`npm run sheet`) | ✅ **BUILT + PROVEN** 07-31 — `5f3c8ab` makeClient viewport/RM passthrough · `a4c8d6b` tools/sheet.mjs + montage · `9489a8b` DEV-only `forceKillFeed`. `--all` = 9 viewports, 54/54. Per cell: solo boot → pin (asserted `ok`) → subject-is-HUD gate → full PNG + canvas/nametag-hidden chrome PNG. Caught HUD-FEED-1 on first use. [card](./planning/sheet-1.md) |
| **HUD-FEED-1 · MENU-HINT-1 · HUD-CHIPS-1** | three responsive UI defects from Wyatt's phone footage | ✅ **CLOSED** 07-31 — **Wyatt playtest PASS on all three** (phone, mid-round, post-KO, portrait + landscape), on the shipped Version `85087c10`. Seven commits `70c3887`→`ae150e0`; asset-verified (feed ceilings 400 ×2, touch-label rule, hintbar hidden, stale 320s gone). Full diagnoses + measurements in [BACKLOG](./planning/BACKLOG.md); load-bearing causes in Do-not-relearn below. Residual (cosmetic, unowned): touch chip labels sit ~20 px under natural width at 1200 even though the region (696) is inside its cap (912) |
| **HOST-CAP-1** | weak-host toast residual | ✅ **CODED 07-31** — `score < 50` once/hostship; min-spec fact accepted; deploy on ship |
| **BOOT-PERF-1** | idle warm gen-cancel | ✅ **CODED 07-31** — mid-flight retarget; no sticky wrong arena |
| **FIGHT-VERIFY-1** | owed fight-night verification | 🟡 **agent half PARTIAL** — sheet proves feed · score strip · timer · directive chip · boost bar at 12 widths (landscape added `cd73e77`; **touch pass added `0da5c4c` — `makeClient` now sets `hasTouch`/`isMobile`, 4 touch cells in `--all`**, so `#hud.hud-touch` rules are no longer invisible). Still unreachable: loading screens (`makeClient` seeds `cartRaveBootSeen`), hover/press (needs interaction), podium. Wyatt half = playtest |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

Run 7's closed evidence strip (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1) and
its superseded triage docs moved to [completed-work.md](./planning/completed-work.md) on
07-31 — all still under the standing "do not re-open without new evidence".

### Next actions

1. **No active card — Wyatt names the next residual** (or declares "wait"). High open
   agent candidates: **UI-SCALE-1**, **FIGHT-VERIFY-1** (tooling or playtest), **INPUT-KB-1**
   (confirm residual — SHIP-1 A2 already Done 07-21). Coded deploy-on-ship: HOST-CAP-1 ·
   BOOT-PERF-1. Not open: CARGO-HUD-1 · SKYBOX-1 · SEC-* · SHEET-1 · ANLX-BULK-1 · SEC-TOKEN-1.
2. **FIGHT-VERIFY-1** — residual surfaces sheet still can't reach: loading screens
   (`makeClient` seeds `cartRaveBootSeen`), hover/press, podium — tooling vs your eye.
3. **High art/you-led:** CART-MODEL-1 · bloom sign-off · RESULTS-1.

Cleared 07-31, in the required order: ANLX-ATTRACT-1 acceptance (closed on a live
two-client prod probe, not on counting — [evidence](./planning/completed-work.md)), the
analytics-DO reset (`DELETE /api/analytics` + Bearer token, 20,000 rows → 0) once the pre-reset
aggregates were filed as ANLX-BULK-1, then SHEET-1 built, HUD-FEED-1 / MENU-HINT-1 /
HUD-CHIPS-1 found and shipped **and confirmed by Wyatt's phone playtest (all three PASS,
portrait + landscape)**, the sweep's touch blind spot closed (`0da5c4c`), and **ANLX-BULK-1**
closed as tool-sourced (Wyatt client) with L1 summary floor + L2 short-end skip
(`MIN_MATCH_DURATION_MS=3000`).

**07-31 lesson: a verification tool only sees the branches it enters.** The contact sheet ran
portrait-only and non-touch — blind to the landscape CSS branch and every `hud-touch` rule,
both of which held real bugs Wyatt found in seconds of phone footage. It also passed two
green cells showing the wrong thing (a PAUSE overlay; an empty feed reading as "fine") before
gaining a subject-is-HUD gate. Prefer one real clip over a clean sweep when they disagree,
and add the matching cell in the same commit as any orientation- or pointer-scoped rule.

**Do-not-relearn (each produced a confident wrong answer once):** `?devUnlocks=off` is a deliberate **prod** lever — Session 2 FTUE needs it on a prod build; never gate it. Grepping `dist/` for `devUnlocks` gives a false FAIL (the `=off` path keeps the string). Vitest runs `DEV === true`, so a DEV check read *inside* a helper makes its prod branch untestable — pass `isDev` in. `/api/log-error` + `/api/analytics` swallow a DO 429 unless the Worker forwards it. `GET /api/errors` is unusable from tests (`ERROR_LOG_TOKEN` is a secret CI lacks) — read via the DO stub's `/list`. `rewindRoundClock(ms)` **sets remaining** time — `1200` ends the round. `from === COUNTDOWN` is NOT a valid "played this round" test: `shouldHoldNonHostCountdownPhase` makes `lobby→running` legitimate for a slow non-host. Worker deploys propagate per-PoP and read as *contradictory* (one route new, another old) — re-poll, don't debug. **`analytics:pull --list` caps at the newest 1000 rows** — on a quiet week that window spans ~10 days, so a "recent" cluster can be entirely stale; bucket by day before reading a trend, and prove analytics gates with a live probe (prod `?diag=1` exposes `__ccDiag.snapshot("analytics")`), not with ring counts. **Grepping deployed CSS for `min-width:` gives a false negative** — the minifier rewrites media queries to range syntax, so `@media (min-width: 900px)` ships as `@media (width>=900px)` (same trap class as the `dist/` `devUnlocks` grep). **A CSS reserve that guesses a wrapping element's height will be wrong at some width** — measure it into a custom property (`--cr-hintbar-h`, `--hud-utility-width`) and let `calc()` consume it; a hidden element then measures 0 and the reserve collapses on its own. **An absolutely-positioned child of a container that is BOTH positioned and `overflow-y:auto` scrolls with the content** — it is not chrome; `position:fixed` is. **A flex row whose children are all `flex-shrink:0` + `nowrap` cannot shrink**, so its children's ellipsis rules never engage until something caps the ROW itself.

**Open High:** INPUT-KB-1 · UI-SCALE-1 · FIGHT-VERIFY-1 · RESULTS-1 · CART-MODEL-1 · bloom.
HOST-CAP-1 coded 07-31 (deploy on ship).

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

- **D-BOOT-PERF-1** (07-31): Idle warm not sticky-first-wins — mid-flight picker bumps gen;
  stale flight must not latch done; newer serializes after prior. Tab/suppress unchanged.

- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50` only
  (strict `<`; neutral 50 silent); once per hostship. Min-spec = accepted fact.

- **D-ANLX-BULK-1** (07-31): Short scripted match ends (tool/diag on prod) are non-product.
  Product metrics = `matchesByArena` / mode / result with `duration_ms >= MIN_MATCH_DURATION_MS`
  (3000) and non-null; byName + window stay raw (P-A). Client skips non-null short
  `match_ended` only — do not also drop null duration in the same change. Shared constant in
  `shared/analyticsConstants.js`, not `roundConstants.js`.

- **D-SHEET-1** (07-31): A verification tool must prove its subject is present, not merely
  that it ran. `npm run sheet` twice shipped green cells that showed the wrong thing — one
  captured the PAUSE overlay (the store pin survives pausing, so all checks passed), and
  every early cell showed an empty kill feed that read as "fine" when it meant UNVERIFIED
  (`.hud-feed` is `display:none` while empty). Hence the subject-is-HUD gate and the DEV-only
  `forceKillFeed` lever. Corollary accepted: cross-run image MAE can never gate this tool —
  opponent names and the directive are randomised per run and there is no gameplay RNG seed,
  so the DOM pin is the gate and MAE is printed only.

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
- **07-11 → 07-17 (D-CONTENT-1 · D-HARDEN-1 · D-NET-CLK-MIG · D-TERM-1 · D-STAB-1/2 ·
  D-PERF-1/2/3 · D-GP4-1 · D-VFX-1/2 · D-VIS-1/2/3 · D-DOC-1)** — rolled out of this index
  07-31; full text in [decision-log-2026-07.md](./archive/decision-log-2026-07.md), which
  gained verbatim entries for the four that had none.

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
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. **Verify prod visually** (screenshot + build stamp), not by scene introspection; `__cartRave.stats()` drawCalls often reads 1 after a settle.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.
- Battery reports without provenance are visible history only — never green readiness evidence. Prefer complete exact-HEAD runs.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (same secret as `analytics:pull`; never `?token=`). Then re-pull / dashboard after the playtest window.

## Last updated

2026-07-31 (responsive UI trio CLOSED on a human playtest; board has no owed work) — Wyatt
played one round on a phone against Version `85087c10` and passed all three checks: kill-feed
row inside its receipt plate with full names, score chips named in landscape and name-less in
portrait, menu hint bar gone at narrow width. That was the last human-owed gate on
HUD-FEED-1 / MENU-HINT-1 / HUD-CHIPS-1. The sweep blind spot that let those three reach
production is closed at `0da5c4c` (`makeClient` sets `hasTouch`/`isMobile`; 4 touch cells in
`npm run sheet --all`). **No active card** — FIGHT-VERIFY-1's remaining surfaces (loading
screens, hover/press, podium) are the only live agent work, and the phase marker stays on
Playtesting & stabilization until Wyatt moves it.

2026-07-30 (seven cards closed; SKYBOX-1 open on Wyatt's eyes) — Full per-card detail:
[archive/status-log-2026-07-30.md](./archive/status-log-2026-07-30.md). **Closed:** QA-STATUS-1
(qa gate unblocked) · HYGIENE-1 (prod sourcemaps off, boot-error telemetry widened, default
branch, profiler `--dpr`) · CARGO-VIS-1 + CARGO-RACE-1 · CARGO-HUD-1a · WARM-IGPU-1 (Lever A:
an in-flight arena rotation now withholds `clientPlayReady`, so the countdown cannot arm into
that compile) · CARGO-HUD-1 (4-segment Living Cargo chip on the nameplate, live at `38d0dfc` /
Version `f8e8da1f`). · SKYBOX-1 — Classic's
991-line skybox/starfield/planet/UFO/spotlight rig builds for the first time (a truthy stub
had held its gate shut forever). **Tier-gated per Wyatt: new `skyExtras` knob, LOW never
builds it** (back to the exact 146-draw baseline; HIGH/MEDIUM pay +54). Switching it on
exposed a UFO bug nobody could have seen before — `createUfos` only positions the saucers
inside `update()`, which the menu attract loop never ticks, so two flat-grey 3m domes parked
in the KO pit for the whole attract screen; now seated at construction (verified in orbit at
100m/126m during attract, where nothing ticks). Live at `c074c2a` / Version `8e5bb259`,
verified by prod screenshot + build stamp. **Open:** WARM-SOLO-1 (cap-206's solo stall,
telemetry-gated). **Deploy gotcha:** each edge PoP
revalidates HTML independently — for ~30s a root fetch may name the old entry or alternate;
poll several times before judging a deploy failed.

> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-07-23 — [archive/status-log-2026-07-23.md](./archive/status-log-2026-07-23.md) (Fight Night UI redesign merged `56dfa61` + deployed; owed prod verification → FIGHT-VERIFY-1; MP confetti/wilt parked)
> - 2026-07-22 — [archive/status-log-2026-07-22.md](./archive/status-log-2026-07-22.md) (AI-DIFF-1 ship · ANLX-VIEW-1 · COUNTDOWN-ARM-1 · A6b false green + fix · plan→ack firewall)
> - 2026-07-21 — [archive/status-log-2026-07-21.md](./archive/status-log-2026-07-21.md) (ARCH · PARITY · PERF-WARM root cause + reverted gate · WRAP · COUNTDOWN-ABORT-1)
> - 2026-07-20 → 07-21 — [archive/status-log-2026-07-20-to-21.md](./archive/status-log-2026-07-20-to-21.md)
> - 2026-07-19 → 07-20 — [archive/status-log-2026-07-19-to-20.md](./archive/status-log-2026-07-19-to-20.md)
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
