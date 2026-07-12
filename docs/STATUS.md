# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: project health, what's
done, what's blocking, what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current?** Last verified 2026-07-12 (`npm run qa` green: 285 tests /
28 files, typecheck + knip clean).

> **Rehydration protocol** (agent or human resuming cold):
> 1. Read **this file** fully.
> 2. Read root [AGENTS.md](../AGENTS.md) for standing rules and invariants (canonical).
> 3. Read [planning/project-state.md](./planning/project-state.md) for the architecture snapshot.
> 4. Read [planning/ROADMAP.md](./planning/ROADMAP.md) + [planning/BACKLOG.md](./planning/BACKLOG.md) only for open future work.
> 5. Do not re-plan from scratch; do not re-open settled decisions ([archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md)) without new evidence.
> 6. Update this file after every meaningful step — one-line decision index entries here, long rationale in the decision log.
>
> Doc map: [docs/README.md](./README.md) · Visual QA: [guides/visual-qa.md](./guides/visual-qa.md) · Naming freeze: [brand.md](./brand.md)

## Mission (1 paragraph)

Ship **Cart Clash** Version 2: a polished solo-first 4-player shopping-cart physics brawler
(Three.js + Rapier + partyserver on Cloudflare). Product name is Cart Clash; Worker/host IDs
stay `cart-rave` until domain cutover. Prefer evidence (screenshots, black-pixel samples,
two-browser smokes) over vibes for graphics and multiplayer gates.

## Project health — 2026-07-12

**Green.** All five July production passes plus the stabilization pass are implemented and
committed; gates are green (285 tests / 28 files, typecheck, knip, build — CI runs the same);
zero knip ignores. The engine-level black-frame flicker root cause is **found and fixed on
Storerooms**; the fix awaits a look-check before becoming the default everywhere. The single
biggest risk to Version 2 is unchanged: **multiplayer has never had its full two-browser
runtime smoke** — code is hardened and unit-covered, but the live gate is not closed.

| Signal | State |
|---|---|
| Gates (`npm run qa`) | ✅ 285 tests / 28 files, tsc clean, knip clean (2026-07-12) |
| Unpushed work | ⚠️ 5 commits (`b9e8fb8`..`3754949`: stabilization pass + menu backdrop) — push after playtest |
| Wyatt playtest queue | ⚠️ Large — Passes 4 & 5, stabilization pass, bloomfix A/B all await eyes-on (see below) |
| Multiplayer live smoke (NET-1) | ❌ Open — the Version 2 gate |
| Black-frame flicker (VFX-1) | 🟡 Root cause fixed on Storerooms (`98317c1`); promote-to-default pending look check |

## Major systems completed

Full record: [planning/production-passes.md](./planning/production-passes.md) and
[planning/completed-work.md](./planning/completed-work.md).

- **Core game** — host-authoritative MP + rewind-and-replay prediction; solo reuses the same path (private room + 3 NPCs); 3 elevated arenas; 2.5-min rounds + Sudden Death.
- **Presentation** — sticker-language menus/HUD/overlays, Store PA announcer, attract-mode menu, per-arena bloom, VFX/audio juice (Pass 5), distinct Defeat screen.
- **Gameplay/AI** — Pass 4 bot fixes (stall/latch), proximity aggression, Sundial rim nav + podium contest, intensity-scaled ram SFX.
- **Systems** — Living Store (cargo scoreboard + PA directives), scoring/KO event fan-out, lifetime unlocks, challenges, match stats.
- **Performance** — 3-tier quality system, arena optimizations, chunk prefetch, boot/load pass, half-res bloom, LOD, auto-quality.
- **Netcode hardening** — WebRTC P2P plane with bounds-checked binary snapshots, size gates, unit-tested host-migration handoff + `host_round` validation.
- **Tooling** — visual QA harness (`shoot`/`compare`/`blackframes`), `?rtmode=`/`?blackmon=` probes, Tweakpane debug panel, CI gate.

## Current focus

**Playtest checkpoint, then the multiplayer gate.** Implementation is ahead of validation:
three behavior-changing batches are stacked awaiting Wyatt. Nothing new should land on top
until the queue drains (taste calls may trigger tuning).

### Wyatt playtest queue (one session can cover all of it)

1. **Stabilization pass (unpushed)** — wheel spin direction by eye, +20% Zanzibar podium feel/AI contest, menu pacing ~700ms, grocery pile look, menu backdrop gradient.
2. **Pass 4 (gameplay/AI)** — stall-free bots on all 3 arenas, edge-camper follow, visible podium contest, ram-SFX dynamic range.
3. **Pass 5 (VFX/audio)** — spill juice, debris personality, Defeat screen, first-blood escalation, victory audio; aesthetic sign-off.
4. **Bloom A/B** — per-arena pipeline (`98317c1`): confirm Storerooms look, check Classic/Sundial, then promote display-referred bloom to default (kills VFX-1 for good) or tune knobs.

### Next actions

1. Drain the playtest queue above → apply taste tuning → **push** the 5 stabilization commits.
2. Close **NET-1**: two-browser full-round smoke ([ROADMAP](./planning/ROADMAP.md) Phase 4) + [living-store-test-plan.md](./planning/living-store-test-plan.md) + [host-migration-test-plan.md](./planning/host-migration-test-plan.md).
3. Fix the two **Critical** static netcode hazards before/with the smoke: NET-CLK-1 (clock domains), NET-MIG-2 (null host) — [netcode-deep-dive.md](./planning/netcode-deep-dive.md).
4. Prefer `npm run qa` before claiming done; baseline `npm run qa:visual` when touching postFX.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).

| ID | Issue | Status |
|----|--------|--------|
| NET-1 | Two-browser full-round smoke | ❌ **The V2 gate.** Code hardened + unit-covered (`1dbb48a`, `6ee9c0b`); live checks never run. Hazard catalog: [netcode-deep-dive.md](./planning/netcode-deep-dive.md) |
| VFX-1 | Black-frame flicker | 🟡 Root cause = half-res float bloom mips (D-VFX-2). Fixed on Storerooms (`98317c1`); Classic/Sundial look check + promote to default pending |
| PLAY-1 | Playtest debt | ⚠️ Passes 4/5 + stabilization all behavior-changing and unvalidated by a human |
| NET-CLK-1 | One EWMA, three clocks | ❌ Critical static hazard (countdown snap, round end skew) |
| NET-MIG-2 | Ghost exorcism can null the host | ❌ Critical static hazard (solo refresh edge) |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked — no clean seam (D-PERF-3); revisit only after NET-1 |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**“Validated V2 candidate”** — everything implemented is proven, live:
playtest queue drained → stabilization commits pushed → bloomfix promoted (or tuned) →
NET-1 two-browser smoke green incl. host migration + Living Store checklists → the two
Critical netcode clock/migration hazards fixed. After that milestone the remaining V2 work
is scoped content/infra (domain cutover, ship checklist), not risk.

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

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
- `localStorage` keys remain `cartRave*` until brand migration.
- Playwright default headless shell can differ from full Chrome; tools request Chromium channel when available.
- Rapier WASM: standard build is the default; SIMD is opt-in only (borrow error, `8174180`).
- Concurrent agent sessions may `git add -A` — commit fast and surgically when working alongside one.
- Debug/harness surface map lives in [guides/visual-qa.md](./guides/visual-qa.md).

## Last updated

2026-07-12 — **Documentation consolidation pass**: STATUS rewritten as production dashboard; decision-log full text archived to [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md); new [BACKLOG.md](./planning/BACKLOG.md) + [production-passes.md](./planning/production-passes.md); ROADMAP restructured; project-state refreshed to the July 11 tree; flicker plan/handover + pass 2/3 plans archived. Gates re-verified: qa green 285 tests / 28 files.
2026-07-11 — Menu backdrop simplified to layered palette gradient (`3754949`). Stabilization pass D-STAB-1/2 (unpushed). Netcode deep-dive catalog landed. Pass 4 (D-GP4-1) + Pass 5 waves 1–3 + per-arena bloom (`98317c1`) + netcode test punch list (`1dbb48a`, `6ee9c0b`) landed and pushed. VFX-1 root cause confirmed (D-VFX-2).
