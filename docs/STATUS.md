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

**Fight Night UI** merged (`56dfa61`). FIGHT-VERIFY-1 **agent half closed 08-01** — three new
on-demand rigs (`podium` · `loadshots` · `states`) now cover results, both loading screens and
every interactive state. **Wyatt half still owed**, and no tool can claim it: real-match
HUD/results *feel*, the two-client friends room (the CHECKOUT LINE lobby has never rendered
anywhere), the non-host podium branch, and the parked MP confetti/wilt bug
([handover](./planning/fight-night-ui-handover.md)).

Playtest console: `npm run dashboard` → [.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html)
(seed: STATUS needs-Wyatt + BACKLOG `Owed: Wyatt playtest`). F8 + `npm run captures:pull`.

**Warm residual:** WARM-IGPU-1 closed; solo stall = WARM-SOLO-1 ([plan](./planning/warm-igpu-1.md)).

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

Closed 07-21→07-31 (incl. ANLX-* · SEC-* · SHEET-1 · HUD-FEED/MENU-HINT/HUD-CHIPS · HOST-CAP-1 ·
BOOT-PERF-1 · Run 7 strip) → [completed-work.md](./planning/completed-work.md). Live only below.

| # | What | Status |
|---|------|--------|
| **FIGHT-VERIFY-1** | owed fight-night verification | 🟢 **agent half DONE** 08-01 — podium/loadshots/states + focus-ring. Residual = **Playtest owed** cards (BACKLOG) — console-seeded; not this parent row. |
| **HOST-CAP-1** | weak-host toast residual | ✅ **SHIPPED** 08-01 — `score < 50` once/hostship; prod Version `76ebdc37` (HEAD `423008f`) |
| **BOOT-PERF-1** | idle warm gen-cancel | ✅ **SHIPPED** 08-01 — mid-flight retarget; same deploy |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

### Next actions

1. **Playtest console** — 10 owed cards in BACKLOG `## Playtest owed (08-01 session)`
   (RESULTS-ACT-1 · FV-HUD/RESULTS/FRIENDS/REMATCH/WILT/BOOT/LOAD/SILVER · HOST-TOAST-1).
   Open `.diag-captures/playtest-console.html` via `npm run dashboard` / `playtest:console`.
2. Closed 08-01 Wyatt PASS: **PAUSE-ROW-1** · **MENU-CMD-FEEL-1** · **FOCUS-CYAN-1**
   (`8d1ee24`). Audit closed: ANLX-BIND-1 · SHEET-ESC-1 · MENU-NAME-HOVER-1 · BOOT-METER-1.
   Still open tooling: **ASSET-CACHE-1** · **HARNESS-FRIENDS-1**.
3. After coding that needs eyes: `Owed: Wyatt playtest — ID — check` → `npm run dashboard`.
4. Battery exact-HEAD green on disk (`battery-2026-08-01T03-31-21…`); refresh CC after battery.

**07-31 lesson (short):** verification tools only see branches they enter — add the matching
viewport/pointer cell in the same commit as any scoped CSS. Prefer one real clip when it
disagrees with a green sweep.

**08-01 lesson:** the focus-ring bug (`e5efbfe`) was found by *reading the cascade while
planning*, before a line of tooling existed — an unscoped `!important` in `loadingScreen.css`
had silently outranked every designed focus state game-wide. Two of the three biggest finds
this pass (that, plus MENU-CMD-FEEL-1) are rules that are *present and dead*, which geometry
sign-off cannot see. Assert the **delta**, not the declaration.

**Do-not-relearn (short):** `?devUnlocks=off` is a **prod** lever (never DEV-gate). Don’t grep
`dist/` for `devUnlocks` or minified `min-width:` (range syntax). Pass `isDev` into helpers under
test. Forward DO 429s from Worker log routes. `rewindRoundClock(ms)` **sets remaining**. Analytics
list = newest 1000 rows only — bucket by day; prove gates with live `__ccDiag.snapshot("analytics")`.
Measure wrap height into CSS vars (`--cr-hintbar-h`). Absolute children of `overflow-y:auto`
scroll with content → use `fixed` for chrome. Flex `nowrap` + all `flex-shrink:0` needs a **row**
`max-width` before ellipsis works.

**Open High:** UI-SCALE-1 · FIGHT-VERIFY-1 · RESULTS-1 · CART-MODEL-1 · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).  
Closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, PLAY-1, …) live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
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
- **D-FRIENDS-REJOIN-1** (08-01): Friends-room refresh keeps explicit **JOIN LOBBY** (no
  quickplay-style auto-rejoin). Private rooms stay opt-in; only `?room=quickplay` auto-rejoins
  when a username is saved (`main.js` ~1849–1859). Audit finding closed as accepted UX — do not
  “fix” parity without a new product call.
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

2026-08-01 (playtest console seeded) — BACKLOG `## Playtest owed (08-01 session)` carries
10 `Owed: Wyatt playtest` cards (RESULTS-ACT-1 · FV-* · HOST-TOAST-1). Regen:
`npm run playtest:console`. FIGHT-VERIFY parent no longer seeds the console.

2026-08-01 earlier (HOST-CAP-1 + BOOT-PERF-1 shipped; FIGHT-VERIFY-1 agent half closed) —
Shipped HEAD `423008f` / Worker Version `76ebdc37`. Full battery green 6/6
(`battery-2026-08-01T03-31-21-188Z.json`). Playtest console auto-seeds from STATUS/BACKLOG.
STATUS size trim; INPUT-KB-1 closed. FIGHT-VERIFY agent half: four phases
(`e5efbfe` · `533afa9` podium · `37a232a` loadshots · `9f5c9b5` states).

2026-07-31 — HUD-FEED-1 · MENU-HINT-1 · HUD-CHIPS-1 Wyatt phone PASS (Version `85087c10`);
touch sheet cells `0da5c4c`. No active card; FIGHT-VERIFY-1 residual = Wyatt real-match half.
Phase stays Playtesting until Wyatt moves it.

2026-07-30 — Seven cards closed (detail: [archive/status-log-2026-07-30.md](./archive/status-log-2026-07-30.md)):
QA-STATUS-1 · HYGIENE-1 · CARGO-VIS/RACE/HUD · WARM-IGPU-1 · SKYBOX-1 (`skyExtras` LOW-off).
Residual WARM-SOLO-1. Deploy PoP tip: re-poll HTML ~30s before calling a deploy failed.

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
