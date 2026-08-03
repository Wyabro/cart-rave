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
| **AGENTS-PRIN-1** | AGENTS.md: engineering principles + small-change fast lane | ✅ code complete (from `ff0cbd2`). Principles + fast lane (**ack kept**); hook internals → [hook-enforcement.md](./guides/hook-enforcement.md). **AGENTS.md 362 → 329 lines.** Residual **HOOK-COMMENT-1** in BACKLOG. |
| LOAD-POSTER-1 | Loading screens redesigned as Fight Night posters (all three arenas) | ⏸ **waiting on Wyatt** — code complete PUSHED (`106fc50`); cqmin-sized stage + two-line title lockup + inline SVG per arena. Remaining: **deploy + Wyatt eye** — human-blocked, not agent work. |
| PLAYTEST-BATCH-0803-1 | Playtest batch 08-03 (FV-LOAD freezes + load art, quality grace, unlock toast, store decks, GET READY pulse, boot measure) | ✅ code complete, **PUSHED** (`35cf3a9`..`4f2fdde`). Remaining: deploy + 5 Wyatt retests. |
| ART-PASS-SUNDIAL-1 | Sundial art pass — all 6 waves shipped | ✅ code complete — Wave 6 pushed, **not deployed**. Remaining: playtest (**SUNDIAL-PT-1**) + deploy. Spec = [handover](./planning/art-pass-sundial-handover.md). |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **Deploy is the only thing left before retests.** Both PLAYTEST-BATCH-0803-1
   (`35cf3a9`..`4f2fdde`) and LOAD-POSTER-1 (`106fc50`) are pushed; nothing is deployed.
   Gate results are observed evidence — `npm run dashboard`, not restated here. Retest queue
   after deploy: FV-LOAD-1, UNLOCK-TOAST-1, STORE-DECK-1, CAM-READY-1, FV-BOOT-1,
   **LOAD-POSTER-1**. Deploy only on explicit "ship it".
2. **W0.1 attribution (cap-229 @ c418bd9):** Cart Rave freeze = juice path
   (`warm.render.default.play-full` ~971 ms + play-shader ~1 s); demotions overlap entry.
   Mid-round 6.5 s compile → **PROBE-WARM-RT-1** note filed (not batch scope).
3. **Playtest owed** — BACKLOG rows for retests + remaining eyes. **UNLOCK-PT-1** needs
   `?devUnlocks=off` + hard refresh.
4. **ART-PASS-SUNDIAL-1** code complete, deploy pending — not this batch.
5. **ROUND-WEDGE-1 Phase B** shipped; **cap-217** open until Wyatt playtest.

**Open High:** ROUND-WEDGE-1 (Phase B code; playtest) · UI-SCALE-1 · FIGHT-VERIFY-1 (Wyatt half) ·
RESULTS-1 · CART-MODEL-1 · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| ROUND-WEDGE-1 | Host-hide → MAX reject → podium⇄running storm | 🟡 **Phase B code shipped 08-03** — `src/utils/podiumEndLatch.js` + wire in `main.js` `endRound` / host-only `onPodiumRejected` / clear on lobby·countdown. Contract: send-side attempt count only; reject schedules `retryAtMs` (+150 ms) for one more send then hard-stop; one `round/podium-end-latched` diag on hard-stop. Phase A `d4a7718` (`pausedWallMs`). Instrumentation earlier: `cc09985` · `8063b3e`. **Do not silence** `invariants.js` `podium→running` (first rollback assert expected). **cap-217 not closed** — needs Wyatt playtest checklist. |
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| SHOOT-ANIM-2 | Rave **dressing** still frozen in captures (crowd · lasers · billboard · `fxPass.uTime`) | 📋 Medium — split out of the now-closed SHOOT-ANIM-1. Level animation captures fine; this block sits behind `frameBudgetAllow`/`crowdAnimate` gates and needs one shared helper called from both loops. Hits **Classic** hardest, where dressing is most of the visible motion. |
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 post-gate |
| BUNDLE-1 | Menu/game code-split | 🚫 blocked on MAIN-1 |
| BRAND-1 | Domain / Worker cutover | 🧊 frozen until deliberate cutover ([brand.md](./brand.md)) |

## Decision index

**One line each, newest first.** Full text: 07-31 → 08-02 in
[decision-log-2026-08.md](./archive/decision-log-2026-08.md), 07-11 → 07-23 in
[decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-SUNDIAL-OQ8** (08-02): Stylise — keep the 9.93° sun key *and* the 1.87° disc; judge sun-facing vs anti-sun **vertical** surfaces, never whole-deck frame mean.
- **D-SUNDIAL-OQ6** (08-02): Low is a shipping look — every lever ships its Low path in the same commit.
- **D-SUNDIAL-OQ5** (08-02, `93c3deb`): Sundial gets its own bloom threshold 0.68; that knob only, Classic untouched.
- **D-ROUND-WEDGE-1-A** (08-01): Host-hide MAX cushion = server `pausedWallMs` (non-SD); MIN stays wall-only.
- **D-BOOT-PERF-1** (07-31): Idle warm is not sticky-first-wins — a mid-flight picker bumps gen.
- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50`, once per hostship.
- **D-ANLX-BULK-1** (07-31): Product metrics require `duration_ms >= MIN_MATCH_DURATION_MS` (3000), non-null.

## Gotchas (append-only)

The hot set — what a current session is likely to hit. Deep-domain and narrow entries move to
[reference/gotchas.md](./reference/gotchas.md); grep there when a subsystem surprises you.

- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Level animation IS capturable** — SHOOT-ANIM-1 closed (`6b27283`); free-running it lands on a random phase, so pin one with `--t <ms>` and compare two. Judge against the arena's null floor, not zero: **Sundial ~1.2%, Classic ~15.9%** (construction randomness, not animation). Rave **dressing** is still frozen — SHOOT-ANIM-2.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. It does **not** always give a duplicate module instance, though: under Vite dev, importing the **same resolved URL** the app imported returns the **same** instance with shared state — verified 08-02 by firing `triggerArenaKoFlash` from a probe-side import and watching the app's own materials react. A duplicate is what you get from a *different* specifier for the same file. **Verify prod visually** (screenshot + build stamp), not by scene introspection.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).

## Last updated

2026-08-03 (AGENTS-PRIN-1) — AGENTS.md governed behaviour *around* the code and said nothing
about the code; that gap is why fixes accrete flags, shims and "temporary" paths. Six falsifiable
rules now live in `## ENGINEERING PRINCIPLES` (principle 1 needs its three carve-outs or it fights
the naming freeze). A mechanically-qualified **fast lane** drops the wave doc, playtest checklist
and per-lever STATUS edit — **ack deliberately kept**; DoD amended to match. Its auto-DQ list
means most gameplay fixes still pay full tax: **the principles are the lever, not the gear
change.** Paid for by moving ~62 lines of hook internals to
[guides/hook-enforcement.md](./guides/hook-enforcement.md). **Two limits:** `archRender` reads
only four AGENTS sections, so the principles reach neither ARCHITECTURE.json nor BRIEFING; and
`parseListItems` is line-based, so every `execution_loop` bullet is truncated to its first source
line (the fast lane's was written to survive that).

2026-08-03 (ROUND-WEDGE-1 Phase B code) — Client breaker for undamped podium⇄running re-entry:
`podiumEndLatch` (MAX_END_SENDS=2, PODIUM_END_RETRY_MS=150), host-only reject arm, clear on
lobby/countdown/rematch. Unit: `tests/podiumEndLatch.test.js` (8). **cap-217 still open** until
playtest. Gates: see commit message.

2026-08-03 (TOOL-HYGIENE-1) — HOOK-INDEX-1: post-commit clears staged generated docs when
index blob ≠ HEAD (before dashboard). BRIEF-DIGEST-1: template fingerprint in digest + embed.
STOP-DIRT-1 BACKLOG row retired (code already session-scoped). All three rows closed.

> **Older entries are archived** — 08-02 in
> [status-log-2026-08-02.md](./archive/status-log-2026-08-02.md), earlier windows indexed in
> [archive/README.md](./archive/README.md).
> History, not current truth — `git log` and the code are authoritative.
