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
| HOST-TAB-1 | Hidden-tab host pump + AFK promote + strongest-host return | ▶ **ACTIVE — DEPLOYED 08-04** (lever E shipped `c3e4589`; still live in current deploy `91b39aa`, Worker `d47d4dd3`). **Owed: Wyatt playtest — HOST-TAB-1** — retest §10, esp. second migrate same match. |
| FX-TIME-1 | fxTimer never driven — VHS layer frozen | ✅ **DEPLOYED 08-04** (`e87c795` in `91b39aa`, Worker `d47d4dd3`). `fxTimer.update(now)` runs in `onFrame` before the level-swap early return. **Owed: Wyatt playtest — FX-TIME-1** — confirm the VHS layer animates.<br>1. Load Storerooms; grain and tracking band should drift, not sit still.<br>2. If you reach Sudden Death, check the SD pulse breathes.<br>A real look change, not a restore — grain, tears, wobble and glow pulse animate for the first time, so don't blame later visual A/B diffs on it. `?t=` pinning is a separate follow-up. |
| SHADOW-ORDER-1 | Storerooms booth contact shadows silently dropped | ✅ **DEPLOYED 08-04** (`6560552` in `91b39aa`, Worker `d47d4dd3`). Booths at 31.15 m were built against the 26.4 m circular fallback, so all four blobs were skipped; the level now passes its own square-floor hazards to both clusters. **Owed: Wyatt playtest — SHADOW-ORDER-1** — confirm the booth blobs are back.<br>1. Cold-load Storerooms; count booth shadows — expect 4.<br>2. Warm-swap Classic Record → Storerooms; still 4 (this path used to inherit the previous arena's shape).<br>3. Furniture pile shadow should look unchanged. |
| ARCH-DRIFT-1 | control-flow.md line refs stale → symbol anchors | ✅ **SHIPPED 08-04** (`91b39aa`). Docs + test only — no playtest owed. 26 citations are now symbol anchors; two tests resolve them and reject any line-number citation in the doc or `archMap.mjs`. |
| PERF-PASS-1 | 60 fps at Low on the Intel box — **Cart Rave only** (Wyatt scoped it 08-03) | ⏸ **PARKED BY WYATT 08-04 for HOST-TAB-1.** Wave 4 remains deployed (`b754e12`, Worker `9b8b1fbe`); honest measured range −1.66 to −2.54 ms and includes +0.55. Card remains open at ~46 fps; every future cell needs an A-B-A bracket on a cooled box. Menu + evidence: [perf-pass-1-handover.md](./planning/perf-pass-1-handover.md). |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **Run 8 (08-03) is in: 15 PASS · 4 FAIL · 1 skip.** All 15 passing rows were **deleted**
   from BACKLOG the same session — see [completed-work.md](./planning/completed-work.md).
   Closed by Wyatt's eye: **cap-217 / ROUND-WEDGE-1**, LOAD-POSTER-1, SUNDIAL-PT-1 (and with it
   ART-PASS-SUNDIAL-1), SHADOW-TILT-1, and 4 of the 5 PLAYTEST-BATCH-0803 retests.
2. **A PASS must close its row in the same session it is reported.** Before Run 8 nothing wrote
   verdicts back, so passed cards reseeded the console on every regeneration and were re-run by
   hand. The export now emits a `CLOSE THESE FIRST` block; do that block before any FAIL.
3. **STORE-DECK-1 shipped and DEPLOYED 08-03** (`6eff2df`, Worker `01f8a745`) — bay letter cut,
   plate and stripe untouched; prod chunk fetched and checked. **`release:check` reports
   `no-exact-head-complete-green-battery`** — that is the RC-phase gate and no exact-HEAD battery
   has been run at this commit; the deploy went out via `npm run ship` as every stabilization
   deploy has. Run the battery before any RC claim.
4. **ACTIVE: HOST-TAB-1 lever E** — implemented locally; ship then retest §10 (esp. second migrate).
5. **Still owed to Wyatt:** the 9-cell PERF sweep (his box, ~25 min — he cannot be replaced here);
   HOST-TAB-1 retest §10; plus the two eyeball checks from the 08-04 small-card wave
   (FX-TIME-1 VHS motion, SHADOW-ORDER-1 booth blobs) — all three now live at `91b39aa`.

**Open High:** PERF-PASS-1 · HOST-TAB-1 · UI-SCALE-1 · RESULTS-1 · CART-MODEL-1 · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| HOST-TAB-1 | Hidden-tab host authority | ▶ **DEPLOYED** Worker `507a8c36` — **Owed: Wyatt playtest — HOST-TAB-1** (retest second migrate). |
| PERF-PASS-1 | 60 fps at Low on the Intel box — **Cart Rave only** | ⏸ **PARKED 08-04.** Baseline 23.788 ms / 42.0 fps; menu: [perf-pass-1-handover.md](./planning/perf-pass-1-handover.md). |
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
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

2026-08-04 (FX-TIME-1 · SHADOW-ORDER-1 · ARCH-DRIFT-1 wave) — Three small cards, one commit each,
DEPLOYED together at `91b39aa` (Worker `d47d4dd3`; prod bundle fetched, SHA confirmed).
`fxTimer` was never updated, pinning `uTime` at 0 — the VHS layer rendered static.
`setContactShadowHazards` runs *after* `loadLevel()` builds geometry, so Storerooms' booths
(31.15 m) tested against the 26.4 m circular fallback and all four blobs were dropped; fixed by
passing the level's own square-floor hazards (Zanzibar template). Hoisting hazard publication in
`commitLevelLoad` is the structural fix and is deliberately deferred — it touches the seam MAIN-1
will split. control-flow.md line refs had all drifted (the card's own replacements were stale
again), so they are banned in favour of symbol anchors, enforced by two new tests. 109 files /
1,350 tests, qa green. HOST-TAB-1 was parked for the wave, now ACTIVE.

2026-08-04 (HOST-TAB-1 lever E) — Second-migrate freeze: demoted in-flight initiate could still
send `sdpOffer`; new host built a zombie PC and skipped its own offer. Fix: host ignores inbound
offers; `isHost` + session-gen abort after awaits in initiate/answerer; heal stays in maintain.
Automated: 109 files / 1,347 tests. Unpushed — ship then retest §10 step 4.

2026-08-04 (playtest export close) — Closed four PASSes same session: FV-RESULTS-1 · STORE-DECK-1 ·
STORE-PT-1 · FV-WILT-1. HOST-TAB-1 FAIL residual → lever E above.

2026-08-04 (HOST-TAB-1 local wave) — Wyatt parked PERF-PASS-1 and acked levers A–D.
Prod host frames now use a loop-owned scoped MessageChannel with one driver; clock compensation applies
only when that pump never ticks. At 10s hidden, a multiplayer host asks the DO to migrate to the
best other live human; foreground humans trigger a margin-20 preferred-host check. Both mid-round
paths share a 5s room cooldown and the existing `host_migrated` handoff.

2026-08-03 (STATUS-TRIM-1) — STATUS.md was at 4,197 of a 4,200 budget, so every card paid a
shaving tax before it could write anything down. **The reporter's "blind spot" is in its advice,
not its measurement** — `status-size.mjs` counts the whole file; it just can only ever suggest
cutting *dated* blocks, which is why it said "nothing safe to archive" while 82% of the weight sat
in undated sections. Measured first, then cut where the weight was: 08-02 dated window archived,
five deep-domain gotchas moved to [reference/gotchas.md](./reference/gotchas.md), Decision index
compressed to true one-liners, duplicated Sundial narrative dropped, and five `### Do not` bullets
that restated AGENTS.md replaced by one pointer. **4,197 → 3,215 tokens.** **Two near-misses:** the
Decision index's "full text in the 07 log" was false — that log ends 07-23 and STATUS was the only
copy of all seven live entries; and the "six of eleven Wave 6 items were misdiagnosed" warning
existed nowhere else. Both archived before cutting. **A pointer claiming content is archived is not
evidence that it is.**

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
