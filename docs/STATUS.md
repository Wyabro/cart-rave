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

| # | What | Status |
|---|------|--------|
| **Run 7** | Full playtest mission | ✅ CLOSED |
| **NET-1** | Two-browser full-round smoke | ✅ PASS (core + residual) |
| **NET-2** | Quickplay join frozen cart / slow load | ✅ PASS ~3s driveable |
| **NET-MIG-3** | Freeze / ghost colliders after host migrate | ✅ PASS + live |
| **NET-PRES-1** | Fall/collision event-id dedupe | ✅ DONE (dup face; loss residual) |
| **NET-SD-1** | SD untie / sole-leader self-fall softlock | ✅ DONE |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

No ▶ active card unless Wyatt names one. Historical Run 7 triage docs are superseded:
[playtest-triage-2026-07-17](./planning/playtest-triage-2026-07-17.md) …
[run6](./planning/playtest-triage-2026-07-18-run6.md).

### Next actions

1. Wait for Wyatt to name the next card (or phase advance → RC). Do not auto-start.

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
