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
| PERF-PASS-1 | 60 fps at Low on the Intel box — **Cart Rave only** (Wyatt scoped it 08-03) | ⏸ **PARKED BY WYATT 08-04 for HOST-TAB-1.** Wave 4 remains deployed (`b754e12`, Worker `9b8b1fbe`); honest measured range −1.66 to −2.54 ms and includes +0.55. Card remains open at ~46 fps; every future cell needs an A-B-A bracket on a cooled box. Menu + evidence: [perf-pass-1-handover.md](./planning/perf-pass-1-handover.md). |
| BUNDLE-1 | Menu/game code-split | ⚠️ **CLOSED PARTIAL 08-05 — perf goal NOT met. Deployed `f2f90fd2`.** Warm `menu-ready` −3% vs a −15% gate. Banked: a `size:check` byte gate, `main.js` 2,582 → 1,262 lines, −22.6% off the initial set (**cold** visits only). Lever E playtested: BUNDLE-E-PT-1 PASS 6/6. [bundle-1.md §0](./planning/bundle-1.md) |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **HARNESS-NULL-1 ✅ CLOSED 08-06.** Headless `perf-profile --null` (shared-page AB+BA); pure
   `evaluateNullDelta`; ≥3 same-adapter PASSes on RTX 4090 (max \|Δ\| gpu ≈ 0.20 ms under 1.5 ms
   provisional-n3). **Does not unpark PERF-PASS-1** or replace live F8 A-B-A. Detail:
   [completed-work.md](./planning/completed-work.md). Code `8992816` + `00da0aa`.
2. **NET-LOOK-ACC-1 ⏳ SHIPPED 08-06 (`1198d26`), not closed** — owed Wyatt
   playtest in [BACKLOG.md § Playtest owed](./planning/BACKLOG.md#playtest-owed).
3. **UI-SCALE-1 Pass 2 + TOUCH-HOVER-1 ⏳ SHIPPED + DEPLOYED 08-06 (`dacca48`..`78acdb4`, 6 commits,
   prod Worker `f2b389d6`), not closed** — `hud.css`/`results.css`/`pauseOverlay.css`/`announcer.css`/
   `stickers.css`/`loadingScreen.css` base-scope clamps → rem, plus all 11 remaining `:hover`
   rules gated behind `(hover: hover)`. LOAD-SCALE-1 closed (already fixed by LOAD-POSTER-1, this
   wave only verified it). `npm run qa` 7/7, MAE identity-gated on every file, `npm run states`
   252/259 (baseline). 4 playtest cards + the deferred media-query cleanup card
   (UI-SCALE-P2-MEDIA-1) in [BACKLOG.md § Playtest owed](./planning/BACKLOG.md#playtest-owed).
4. **Hitch forensics:** cap-254–260 (build `8d96b0b`) before any PERF-PASS-1 knob.
**Open High:** NET-LOOK-ACC-1 · UI-SCALE-1 · TOUCH-HOVER-1 · ONBOARD-SLIDES-1 · RESULTS-1 · CART-MODEL-1 · PERF-PASS-1 (⏸) · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| PERF-PASS-1 | 60 fps at Low on the Intel box — **Cart Rave only** | ⏸ **PARKED 08-04.** Baseline 23.788 ms / 42.0 fps; menu: [perf-pass-1-handover.md](./planning/perf-pass-1-handover.md). |
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| CARGO-LATCH-1 | `cargoLoad.js` repeats the FIX-DIRPAUSE latch bug | 📋 same class as `e7dd92e`, out of scope by instruction. [BACKLOG § Engineering](./planning/BACKLOG.md). |
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
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. It does **not** always give a duplicate module instance, though: under Vite dev, importing the **same resolved URL** the app imported returns the **same** instance with shared state — verified 08-02 by firing `triggerArenaKoFlash` from a probe-side import and watching the app's own materials react. A duplicate is what you get from a *different* specifier for the same file. **Verify prod visually** (screenshot + build stamp), not by scene introspection.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).

## Last updated

2026-08-05 (AGENT-OS-1 tooling) — Cold-start cut: `AGENTS.md` 7.6k → ~1.6k always-on tokens;
depth in `docs/reference/agent-manual.md`. Tool routing: Grok ≡ Codex, Claude demoted. Pointers
rewritten (`GROK.md` / `CLAUDE.md` / `GEMINI.md` / `.cursorrules`). Seven David skills at
`~/.grok/skills` + `~/.codex/skills` (not vendored into repo). Left for later: `skills:sync`
still health-gates the Claude repo mirror; optional Grok config skill prune.

2026-08-05 (BUNDLE-E-PT-1 PASS) — Lever E's deferred-callback seam playtested on prod `f2f90fd2`,
6/6 incl. the two-machine friends round. That seam fails **silent**, so the human pass is the only
evidence KO effects / announcer / directives / cargo / colours survived the split — the unit test
proves key parity, nothing more. No correctness residual on BUNDLE-1's partial close. Also: Wyatt's
**one-issue-per-playtest-card** rule adopted (AGENTS.md + BACKLOG seed header; enforcement =
PT-CARD-SPLIT-1), **HUD-TOAST-Z-1** filed, fragile-tag audit rewrote `boot-and-orchestration`.

2026-08-05 (BUNDLE-1 CLOSED PARTIAL, **deployed `f2f90fd2`**) — six levers, perf goal missed, byte
hypothesis falsified; `size:check` membership re-keyed on modules. [bundle-1.md §0](./planning/bundle-1.md)

2026-08-04 (5 entries: MAIN-1 CLOSED · FX-TIME-1 / SHADOW-ORDER-1 / ARCH-DRIFT-1 · HOST-TAB-1
lever E · playtest export close · HOST-TAB-1 local wave) — archived to
[status-log-2026-08-04.md](./archive/status-log-2026-08-04.md), together with the 2026-08-03
pointer stub. Rolled on 08-05 to bring this file back under its token budget; index:
[archive/README.md](./archive/README.md).
