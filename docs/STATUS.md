# Cart Clash — Session Status

Declared state: phase, current focus, the one active card, prohibitions, open issues. Observed
evidence (git HEAD, gate/battery results, captures) is generated — `npm run dashboard`. The
cold-start read order lives once, in [AGENTS.md](../AGENTS.md); do not restate it here.

History is not kept in this file. Closed work → [completed-work.md](./planning/completed-work.md).
Session logs → [archive/README.md](./archive/README.md). Decisions in full →
[archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md).

## Phase

Orientation only — **advance the ▶ marker only on Wyatt's explicit instruction.** Agents may
report phase-exit eligibility; they must not move the marker.

### Release phases

- ✅ Foundation — engine, arenas, carts, physics
- ✅ Core gameplay — KOs, scoring, Living Store, solo AI
- ✅ Multiplayer — P2P netcode, host authority, migration
- ✅ Production systems — passes 1–5, tooling, observability
- ▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC
- ⬜ Release candidate — queue drained, exact-HEAD evidence green, tech-debt triage
- ⬜ Ship — domain cutover, external testers, wide URL

## Current focus

**Playtesting and stabilization.** Tier A drained; Tier B/C, the security sweep and the
analytics gating are closed. Run 7 closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed
(loss-on-drop residual accepted). The analytics DO has been reset, so the ring starts clean for
external testers. Stay in this phase until Wyatt advances the marker.

**PROBE-WARM-RT-1** + **PERF-TIER-1** both PASS on prod 08-12. PROBE-WARM-RT-1: programs stable across first KO, no mid-round hitch. PERF-TIER-1: high-lite boots, reflector absent, quality menu shows 4 options.

**STORE-MUSIC-1** shipped 08-12. Storerooms now has two new tracks. Playtest owed: **STORE-MUSIC-PT-1**.

**MENU-MUSIC-2** / **MENU-MUSIC-PT-1** CLOSED 08-13. Wyatt playtest PASS on prod `11e5e48f`.

**PA-COMBO-1** deployed `c0a15308`. Hashed assets 0×404. Live `gameBoot-ChoyxoHG.js` carries the combo queue set + `ttlMs:8e3`. Playtest owed: **PA-COMBO-PT-1** on prod after hard-refresh.

**NPC-BOOTH-TARGET-1** deployed `2fa4b2e4`. Hashed assets 0×404. Live `gameBoot-DABEl-r1.js` carries `isOnSpawnBooth`. Playtest owed: **NPC-BOOTH-TARGET-PT-1** on prod after hard-refresh.

**NPC-TYPE-DRAW-1** deployed `7aa16db4`. Hashed assets 0×404. Live `config-BXqpJcq-.js` carries `cartRaveSoloNpcOmit`. Playtest owed: **NPC-TYPE-DRAW-PT-1** · **NPC-TYPE-DRAW-PT-2** on prod after hard-refresh.

**Closed cards keep their narrative in their own docs, not here** — Sundial
([handover](./planning/art-pass-sundial-handover.md); read its "Traps that cost time" before any
capture, and judge phase changes against a ~1.2% construction-noise floor, not zero), Fight Night
([handover](./planning/fight-night-ui-handover.md)), Cart Rave and Storerooms
([audits](./planning/art-audit-storerooms.md)). Owed human checks are BACKLOG rows under
`## Playtest owed`. Playtest console: `npm run dashboard` →
[.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html). F8 +
`npm run captures:pull`.

### Do not

Standing prohibitions — fed into [BRIEFING.md](./BRIEFING.md) and the Command Center firewall.

- **[AGENTS.md](../AGENTS.md) applies in full and is not summarised here** — plan → ack → apply per wave · one card at a time · `tools/` · `.claude/hooks/` · `.agents/` frozen during a game card · ship only on "ship it" · never `git add -A` · the ▶ phase marker is Wyatt's. Read it before editing; this list carries only the project-specific prohibitions below.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under **Verified healthy / non-issues** in [project-state.md §5](./planning/project-state.md), without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

### Done when (Playtesting & stabilization)

- [x] Run 7 playtest mission closed (P0–P6 · NH · NET-1 · LS-1 · RC-1 A/B/C · CAM-1 · HUD-MENU-1)
- [x] **NET-2** quickplay/mid-join cart driveable without long freeze — Wyatt PASS (~3s to drive)
- [x] **NET-MIG-3** host-migration ghost feel — Wyatt PASS + live deploy verified
- [x] **NET-PRES-1** fall/collision event-id dedupe — code landed; loss-on-drop residual accepted
- [x] **NET-SD-1** sole-leader SD self-fall / untied wipeout — crowns fallback winner
- [ ] Stabilization residual named by Wyatt (or explicit "no active card / wait")
- [ ] Phase exit only on Wyatt instruction → Release candidate

### Active queue (strict — one card at a time)

Live rows only. Shipped and closed cards live in
[completed-work.md](./planning/completed-work.md); the tier list is
[SHIP-1.md](./planning/SHIP-1.md).

| # | What | Status |
|---|------|--------|
| BUNDLE-1 | Menu/game code-split | ⚠️ **CLOSED PARTIAL 08-05 — perf goal NOT met. Deployed `f2f90fd2`.** Warm `menu-ready` −3% vs a −15% gate. Banked: a `size:check` byte gate, `main.js` 2,582 → 1,262 lines, −22.6% off the initial set (**cold** visits only). Lever E playtested: BUNDLE-E-PT-1 PASS 6/6. [bundle-1.md §0](./planning/bundle-1.md) |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |
| CARGO-BAY-INSTANCE-1 | Per-bay InstancedMesh for cargo bays | ✅ **CLOSED 08-12** (`9e86382`). 30 Mesh → per-model InstancedMesh. Draw calls ≤120 → ~24. Single-lever wave. Playtest owed: **CARGO-BAY-INSTANCE-PT-1** (solo fill) · **CARGO-BAY-INSTANCE-PT-2** (spill/rebuild) · **CARGO-BAY-INSTANCE-PT-3** (MP parity). |
| CONN-TRACK-LEAK-1 | Release platform-dead IP tracking before the cap | ✅ **CLOSED 08-12** (`9439cd2`, deployed `5ae6f69b`). `#prunePlatformDeadTracking()` releases leaked IP counts before the cap decision; five teardown paths consolidated via `#forgetConnectionTracking()`. Playtest owed: CONN-TRACK-LEAK-PT-1 (host-leave migration), CONN-TRACK-LEAK-PT-2 (ghost exorcism). |
| PA-QUIET-1 | Quiet the Store PA | ✅ **CLOSED 08-12.** Wyatt playtest PASS. Deployed `3044ab99`. Same-fall flavor skip + busy-channel drop + `last_call` interrupts. Commits `e37bd59` + `a0ba621`. |
| STORE-MUSIC-1 | Storerooms two-track playlist | ✅ **CLOSED 08-12.** Deployed `4f8b649f`. Replaced the old Storerooms track and added a second song. Playtest owed: **STORE-MUSIC-PT-1**. |
| MENU-MUSIC-2 | Second main-menu song | ✅ **CLOSED 08-13.** Wyatt playtest PASS on prod `11e5e48f`. |
| PA-COMBO-1 | Savage/carnage PA lines play | 🔧 **DEPLOYED 08-12** `c0a15308`. Playtest owed: **PA-COMBO-PT-1**. |

### Next actions

1. **Playtest PA-COMBO-PT-1** on prod after hard-refresh.
2. **Other playtest owed:** **STORE-MUSIC-PT-1** on prod `4f8b649f`. **STORE-1-PT-1** on `npm run dev:local`. SHARD-PT-2 (skip, needs five humans). **CARGO-BAY-INSTANCE-PT-1** · **PT-2** · **PT-3**. **CONN-TRACK-LEAK-PT-1** + **CONN-TRACK-LEAK-PT-2** — prod `5ae6f69b`.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|

| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| BRAND-1 | Domain / Worker cutover | 🧊 frozen until deliberate cutover ([brand.md](./brand.md)) |

## Decision index

**One line each, newest first.** Full text: 07-31 → 08-02 in
[decision-log-2026-08.md](./archive/decision-log-2026-08.md), 07-11 → 07-23 in
[decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-AGENT-OS-1** (08-05): Slim always-on `AGENTS.md` (~1.6k tok; depth → `docs/reference/agent-manual.md`). **Grok + Codex equal** heavy-lift defaults; Cursor IDE/backup; Claude demoted. Shared authority = AGENTS + git hooks + `verify:head` (not Claude PreToolUse). David Ondrej skills cherry-picked user-level (Grok+Codex).
- **D-BUNDLE-1-CLOSE** (08-05): BUNDLE-1 PARTIAL — bytes moved, warm menu-ready did not. **Warm cache ⇒ byte cuts are near-worthless; measure parse-vs-construction first.** Supersedes D-PERF-3.
- **D-SUNDIAL-OQ8** (08-02): Stylise — keep the 9.93° sun key *and* the 1.87° disc; judge sun-facing vs anti-sun **vertical** surfaces, never whole-deck frame mean.
- **D-SUNDIAL-OQ6** (08-02): Low is a shipping look — every lever ships its Low path in the same commit.
- **D-SUNDIAL-OQ5** (08-02, `93c3deb`): Sundial gets its own bloom threshold 0.68; that knob only, Classic untouched.
- **D-ROUND-WEDGE-1-A** (08-01): Host-hide MAX cushion = server `pausedWallMs` (non-SD); MIN stays wall-only.
- **D-BOOT-PERF-1** (07-31): Idle warm is not sticky-first-wins — a mid-flight picker bumps gen.
- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50`, once per hostship.
- **D-ANLX-BULK-1** (07-31): Product metrics require `duration_ms >= MIN_MATCH_DURATION_MS` (3000), non-null.

## Gotchas (append-only)

The hot set — what a current session is likely to hit. Deep-domain and narrow entries live in
**[reference/gotchas.md](./reference/gotchas.md)** — grep it *before* debugging physics
(combine rules · `castRay` filters · no RNG seed), audio (Howler `_playLock` · volume buses),
the dev loop (dev probes lie in prod · edge propagation · frozen `rAF`), or a suspected blocker
(TS 7 · `cartrave4` UVs). Several of those cost a session each to learn the first time.

- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Level animation IS capturable** — SHOOT-ANIM-1 closed (`6b27283`); free-running it lands on a random phase, so pin one with `--t <ms>` and compare two. Judge against the arena's null floor, not zero: **Sundial ~1.2%, Classic ~15.9%** (construction randomness, not animation). Rave **dressing** is still frozen — SHOOT-ANIM-2.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **F8 uploads were silently size-capped until `e7e64e4`** (`keepalive: true` → Chrome's ~64 KiB body limit, rejection swallowed into a `console.warn`). Measured 08-04 over the 251-capture ring: max body **54,786 chars ≈ 65,179 wire bytes, 357 under 65,536** — clipped exactly at the ceiling. `?diag` was also dropped by quit-to-menu, killing F8 for the rest of the session. **Any ring pulled before that commit under-represents the heaviest KO/announcer-dense frames — the ones a hitch hunt wants — and it holds zero `pt-main-1` bundles**, so the MAIN-1 hitch reports have no server-side evidence yet.
- **The in-app Browser pane does not composite while hidden**, so rAF never fires there: loaders sit at 4% forever and live HUD checks stall. Not a game bug — verify rendered behavior on prod or in tests.
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:664-667`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. It does **not** always give a duplicate module instance, though: under Vite dev, importing the **same resolved URL** the app imported returns the **same** instance with shared state — verified 08-02 by firing `triggerArenaKoFlash` from a probe-side import and watching the app's own materials react. A duplicate is what you get from a *different* specifier for the same file. **Verify prod visually** (screenshot + build stamp), not by scene introspection.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).

## Last updated

2026-08-13 (MENU-MUSIC-PT-1) — Wyatt playtest PASS on prod `11e5e48f`.
Parent MENU-MUSIC-2 closed.

2026-08-12 (STORE-MUSIC-1) — Storerooms playlist is two new tracks. Playtest owed:
**STORE-MUSIC-PT-1**.

2026-08-12 (PLAYTEST-SEED-1) — Playtest seed is now fail-closed. `health:check` fails
`PLAYTEST_STEPLESS` and `PLAYTEST_PARENT_UNSEEDED`. Pull/checkout/rebase refresh the
gitignored console. CARGO-BAY-INSTANCE-PT-1/2/3 seeded. STATUS prose is not a seed.

2026-08-12 (STORE-1) — Deleted `src/gameState.js`. Round-state commands live on
`src/stores/gameStore.js`. Unused store lifecycle methods removed. Playtest owed on
`npm run dev:local` (solo KO, quit, rematch, combo badge). Not pushed.

2026-08-11 (NIGHT-SHIFT-CITY-1 closed for now) — Wyatt judged the local visual result
unsuccessful and directed us to stop. The card is retired as an accepted temporary baseline,
not a visual PASS. It keeps the approved blockout, city, fixed facade lights, telecom mast,
subtle mast life, and roof dressing. Focused 11/11, typecheck, and build were green at handoff;
full QA reached 1,883 passed / 1 known unrelated backlog-canary failure. Not pushed, deployed,
shipped, or renamed.

2026-08-11 (NIGHT-SHIFT-CITY-1 facade lights) — Root cause: city lights used a radial shell
that ignored each building's yaw and upper setback. `282c7e2` selects the rotated facade that
faces the arena and places every window/sign from that facade's true width, normal, and final Y.
Regression proof: 1,385 detached extended windows before → 0 windows and 0 signs after; focused
5/5 and production build green. Full QA reached 1,880 passed / 1 unrelated failure: concurrent
`48e4364` reduced BACKLOG to exactly 50 rows while its existing canary requires more than 50.
Fixed capture: `.diag-captures/night-shift-lights-fixed.png`. Wyatt visual PASS 08-11. Closure
waits on the unrelated global QA canary. Not pushed, deployed, closed, or renamed.

2026-08-11 (NPC-BOOST-2-PT-1 PASS · NPC cluster closed) — NPC-BOOST-2-PT-1 all four
steps PASS. NPC-BOOST-1, NPC-BOOST-2, AI-EASY-SOFTEN-1 all closed. Proportional
early-release (`dec9a66`) deployed `e917da49`: `minTargetDistance` 3.0,
`finisherEdgeBiasMin` 0.35, NPC charges release instead of cancelling.

Older session logs (2026-08-10 and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-08-to-10.md](./archive/status-log-2026-08-08-to-10.md)).
