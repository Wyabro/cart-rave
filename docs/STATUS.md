# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: project health, what's
done, what's blocking, what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current?** Last verified 2026-07-12 (`npm run qa` green: 287 tests /
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
committed; gates are green (287 tests / 28 files, typecheck, knip, build — CI runs the same);
zero knip ignores. NET-CLK-1 / NET-CLK-3 / NET-MIG-1 landed 2026-07-12 (clock split, round-clock
hit windows, kill-credit on host promote). The engine-level black-frame flicker root cause is
**found and fixed on Storerooms**; the fix awaits a look-check before becoming the default
everywhere. The single biggest risk to Version 2 is unchanged: **multiplayer has never had
its full two-browser runtime smoke** — code is hardened and unit-covered, but the live gate
is not closed.

| Signal | State |
|---|---|
| Gates (`npm run qa`) | ✅ 287 tests / 28 files, tsc clean, knip clean (2026-07-12, post-audit) |
| Unpushed work | ✅ None — pre-playtest audit fixes pushed as `91e17a0` (see Last updated). |
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
3. ~~Fix remaining **Critical** static netcode hazard~~ NET-MIG-2 fixed in the audit pass (uncommitted); verify live during the NET-1 smoke. NET-CLK-1 / NET-CLK-3 / NET-MIG-1 shipped (`a0475d6`). Remaining structural netcode items: NET-MIG-3, NET-CLK-2 — [netcode-deep-dive.md](./planning/netcode-deep-dive.md).
4. Prefer `npm run qa` before claiming done; baseline `npm run qa:visual` when touching postFX.
5. Structural debt (MAIN-1, DIR-1, GLTF-1, BRAND-1, …) is cataloged under [BACKLOG Tech Debt](./planning/BACKLOG.md#tech-debt) — **after** the validation gate, not instead of it.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).

| ID | Issue | Status |
|----|--------|--------|
| NET-1 | Two-browser full-round smoke | ❌ **The V2 gate.** Code hardened + unit-covered (`1dbb48a`, `6ee9c0b`); live checks never run. Hazard catalog: [netcode-deep-dive.md](./planning/netcode-deep-dive.md) |
| VFX-1 | Black-frame flicker | 🟡 Root cause = half-res float bloom mips (D-VFX-2). Fixed on Storerooms (`98317c1`); Classic/Sundial look check + promote to default pending |
| PLAY-1 | Playtest debt | ⚠️ Passes 4/5 + stabilization all behavior-changing and unvalidated by a human |
| NET-MIG-2 | Ghost exorcism can null the host | ✅ Fixed 2026-07-12 (pre-playtest audit, uncommitted): `#ensureLiveHost()` after exorcism |
| NET-CLK-1 / CLK-3 / MIG-1 | Dual clocks, round-clock hits, kill credit on promote | ✅ Shipped `a0475d6` |
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 Post-gate — [BACKLOG Tech Debt](./planning/BACKLOG.md#tech-debt) |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked on MAIN-1 + NET-1 (D-PERF-3) |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**“Validated V2 candidate”** — everything implemented is proven, live:
playtest queue drained → stabilization commits pushed → bloom fix promoted (or tuned) →
NET-1 two-browser smoke green incl. host migration + Living Store checklists → remaining
Critical hazard **NET-MIG-2** fixed. After that milestone the remaining V2 work is scoped
content/infra (domain cutover, ship checklist), not risk. Structural modernizations
(MAIN-1, DIR-1, GLTF-1, TS-1) wait until this gate is green — see
[BACKLOG Tech Debt](./planning/BACKLOG.md#tech-debt).

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

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
- `localStorage` keys remain `cartRave*` until brand migration.
- Playwright default headless shell can differ from full Chrome; tools request Chromium channel when available.
- Rapier WASM: standard build is the default; SIMD is opt-in only (borrow error, `8174180`).
- Concurrent agent sessions may `git add -A` — commit fast and surgically when working alongside one.
- Debug/harness surface map lives in [guides/visual-qa.md](./guides/visual-qa.md).
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-OWNED `envMap` reference actually scales IBL. `CONFIG.postFx.environment.materialEnvMapIntensity` / `refreshSceneEnvironmentMaterials` (scene.js) are silently inert as a result. Found while fixing the green-booth floor reflection (`arena.js clampFloorEnv` — floor mats get their own `envMap` at 0.25× to work around it); the rest of the scene still rides the dead per-material knob.

## Last updated

2026-07-12 — **Playtest-blockers pass** (P1 bugs + P2 polish + AI proposal). All UNCOMMITTED (sits on top of the also-uncommitted asset-audit changes). Gates green: 287 tests / 28 files, tsc + knip clean, build OK; solo boot smoke clean (61 FPS, 0 console errors).
- **Hop (MP)**: root cause — reconciliation replay swallowed the hop impulse via its own wall-clock cooldown (`gameLoop.js` replay `triggerHopRef`); every reconcile hard-snapped to pre-hop host state and never re-applied → non-host hops died within one snapshot. Replay now always re-applies (one hop:true frame per press by construction). Host-side: `attemptLocalHop`'s `|lv.y|>2.2` gate ate presses on slopes/seams (Sundial ramp ≈2.3 at speed) — replaced with a downward Rapier raycast grounded check (`main.js isCartGrounded`; record floor is kinematic — not excluded).
- **SD invisible carts**: tied cart mid-shatter at SD entry never got `cleanupShatter` (respawnAtMs nulled + SD blocks scheduleRespawn) → fought SD invisible. `layoutSuddenDeathArena` now runs a doRespawn teardown for shattered tied carts; wired through both entry routes (timer + `ensureSuddenDeathOnHostPromote`).
- **Charge SFX loop**: stopped at every round boundary (`endRound`, `onEnterPodium`, `onReturnToLobby` sweeps) — `resetCartTransientState` nulls `chargeUpSfxId` without stopping the sound, so the loop had to be stopped before any reset path.
- **Unlock toasts**: now 5s at stage priority 4 (above announcer 3 — the same-KO callout used to preempt them instantly); menu unlock toast 5s.
- **Quickplay arena rotation shipped** (D-STAB-2 recipe): host picks a random different arena at the rematch seam (`onHostPlayAgainClick`), latches via new `Netcode.adoptRoomLevelAsHost`, broadcast rides host_round levelId; clients rotate in place via the previously-dead `onLevelIdChanged` callback (now wired). Masked swap: slow canvas crossfade + "NEXT ARENA" toast + `setLevelSwapping` physics gate + `Entities.refreshCartSpawnPositions()` (spawn ring radius changes per arena). **Needs live 2-browser check** (NET-1 adjacent).
- **Sunglasses**: one-piece visor GLB integrated at source load (`cartRaveGltf.js integrateOnePieceSunglasses`; master `art/models/sunglasses-visor.glb`, runtime 4.7 KB draco). Placement baked on the mesh (body-scale reparents face meshes by position); mirror styles/lens envMap/face policy unchanged. Verified in customize preview. **Wyatt-corrected same day**: `tripo_part_7` is the cart's SMILE, not a glasses accent — it now stays authored; the visor replaces only frame 8 + lenses 9/11, width-fit to their box with its TOP edge on the box top (the basket body has a hole behind the glasses footprint — `tripo_part_0` re-mesh is the eventual long-term fill, tracked nowhere yet because the visor fully covers it).
- **Green-booth white floor pool — root cause found + fixed**: NOT a lamp (all 25 lights zeroed → unchanged) and NOT bloom; it's the RoomEnvironment probe's bright window at world +Z reflected by the Classic floor clearcoat stack at grazing angles. **Gotcha: `material.envMapIntensity` is a NO-OP against `scene.environment` in this three version — only `scene.environmentIntensity` or a material-OWNED envMap works.** Fix: floor mats (record body + vinyl detail) get `scene.environment` as their own envMap at 0.25× scale (`arena.js clampFloorEnv`). Reflector mirror untouched. ⚠️ Follow-up: the whole `CONFIG.postFx.environment.intensity`/`materialEnvMapIntensity` system is silently inert — needs a deliberate look-check before wiring to `scene.environmentIntensity`.
- **Attract mode**: 4-shot list with hard cuts + per-shot drift (wide orbit / low dolly / high sweep / close push) + per-arena camera height clamp — Storerooms ceiling is y=14.5, old orbit floated at ~16.4 above it (now ≤11.5). Verified in browser.
- **Collision debris**: wire-basket fragments (wireframe box) + additive neon tri-shards + escaping-grocery tints on hard cart hits — same 52-slot pool, zero extra budget.
- **Groceries**: `GROCERY_SCALES` table in groceryPool.js (per-model sizeM + cargoMul + global cargoScale, current values documented); DEV `window.CartClashGrocery.sizes()` prints real effective dimensions. Values unchanged pending joint tuning.
- **NPC looks**: deterministic per-name pattern + mirror-style rolls (all peers agree, zero net traffic); slot colors shuffled per room (server + solo). ⚠️ Patterns ride the known cartrave4 UV fragmentation risk — looked fine in smoke; revert = `NPC_PATTERN_POOL` → `["classic"]`.
- **Names**: +20 NPC names (shared/npcNames.js, personality-mapped), +10 player names, reroll handle parts Clash-flavored; menu NPC-name exclusion now imports the shared pool instead of a stale copy.
- **AI difficulty**: proposal only (as requested) — [planning/ai-difficulty-proposal.md](./planning/ai-difficulty-proposal.md).

2026-07-12 — **Pre-playtest production audit** (multi-agent: gameplay/netcode/UI/perf/debris + integration trace). Fixes applied and pushed (`91e17a0`, gates green 287 tests / 28 files, tsc + knip + build OK; solo boot smoke clean):
- `gameFlow.js` — SD win no longer un-parks spectators into phantom falls mid-loop (live-phase break in fall loop); last-cart-standing scheduler gated on live running phase (SD podium no longer relabeled "LAST CART STANDING" with stray slow-mo).
- `party/index.ts` — **NET-MIG-2 fixed**: `#ensureLiveHost()` after ghost exorcism (sole-human refresh no longer strands the room hostless for ~5–10s).
- `netcode.js` — NET-BUF-1: reliable hostSpawn snapshot now buffered in host `tHost` domain (was Party `serverNowMs` — mispaired interp at GO/rematch); `.catch` on fire-and-forget P2P offers.
- `netcode/p2p.js` — `dc.send` guarded (channel closing between readyState check and send no longer aborts the host broadcast tick).
- `main.js` — podium challenge records once-per-round guarded (overlay re-render could double-count `last_standing`/`sd_win`/`untouchable`); `untouchable` now also requires zero falls (was per-life `hasSpilled`, credited nearly every win).
- `cart-rave-menu.js` — reroll handle pool `KILLER`→`BRUISER` (style-guide KO rule).
- `bootstrap.js` — 5 cart-bootstrap logs DEV-gated.
Open recommendations (not fixed — behavior/structural): last-cart-standing flourish unreachable in timed rounds (3s flourish vs 1s respawn — needs a taste call), NET-MIG-3 migration freeze vs re-handshake, NET-CLK-2 roundValidation cross-domain age check, SD has no timeout, podium-reject retry loop (rare), challenge daily/weekly rotation only checked at boot.

2026-07-12 — **Terminology & consistency pass** (D-TERM-1): new [style-guide.md](./style-guide.md) writing standard; player-copy fixes (pause-overlay Nitro→Boost, KILL STREAK→COMBO kicker, challenge/unlock copy KO-standardized + combo-tier-name bug fix, menu LEVELS→ARENAS, Friends invite copy, host tooltip); linked from AGENTS.md/READMEs. Unpushed. Gates green: 287 tests / 28 files, tsc + knip clean, build OK; menu copy verified live in browser.
2026-07-12 — **Documentation consolidation pass**: STATUS rewritten as production dashboard; decision-log full text archived to [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md); new [BACKLOG.md](./planning/BACKLOG.md) + [production-passes.md](./planning/production-passes.md); ROADMAP restructured; project-state refreshed to the July 11 tree; flicker plan/handover + pass 2/3 plans archived. Gates re-verified: qa green 285 tests / 28 files.
2026-07-11 — Menu backdrop simplified to layered palette gradient (`3754949`). Stabilization pass D-STAB-1/2 (unpushed). Netcode deep-dive catalog landed. Pass 4 (D-GP4-1) + Pass 5 waves 1–3 + per-arena bloom (`98317c1`) + netcode test punch list (`1dbb48a`, `6ee9c0b`) landed and pushed. VFX-1 root cause confirmed (D-VFX-2).
