# Cart Clash — Session Status

Declared state: phase, current focus, the one active card, prohibitions, open issues. Observed
evidence (git HEAD, gate/battery results, captures) is generated — `npm run dashboard`. The
cold-start read order lives once, in [AGENTS.md](../AGENTS.md); do not restate it here.

History is not kept in this file. Closed work → [completed-work.md](./planning/completed-work.md).
Session logs → [archive/README.md](./archive/README.md). Decisions in full →
[archive/decision-log-2026-08-03-to-16.md](./archive/decision-log-2026-08-03-to-16.md).

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

**Playtesting and stabilization.** Tier A drained; Tier B/C, security sweep, and analytics gating
are closed. Run 7 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 closed. Analytics DO reset for
external testers. Stay in this phase until Wyatt advances the marker.

Live PT: **NPC-ABORT-BURST-PT-1** · **LAST-STANDING-DEAD-PT-1** · **COUNTDOWN-HOST-STAMP-PT-1**
on `npm run dev` until ship. **SPILL-RAM-CREDIT-PT-1** `[2pc]` on `npm run dev` until ship
(no `?perfPump` on the non-host). **CART-HUE-RED-PT-1** `[solo]` on `npm run dev` until ship
(Lever A `0xff2233` landed 08-17). **REMOTE-INPUT-STALE-PT-1** after ship (`[2pc]`, no `?perfPump` on
the non-host). Parent **WARM-QP-ROTATE-1** stays (cap-364). Deferred launch day: **SHARD-PT-2**.
Closed PASSes and parents: [completed-work.md](./planning/completed-work.md). Do not reopen
GAMEPAD-LOBBY-1.

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
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. Playtest **NPC-ABORT-BURST-PT-1** · **LAST-STANDING-DEAD-PT-1** · **COUNTDOWN-HOST-STAMP-PT-1** on `npm run dev` until ship. **SPILL-RAM-CREDIT-PT-1** `[2pc]`, no `?perfPump` on the non-host. **CART-HUE-RED-PT-1** `[solo]` on `npm run dev` until ship. **REMOTE-INPUT-STALE-PT-1** after ship (`[2pc]`, no `?perfPump` on the non-host). Deferred: **SHARD-PT-2** (launch day).

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| BRAND-1 | Domain / Worker cutover | 🧊 frozen until deliberate cutover ([brand.md](./brand.md)) |

## Decision index

**One line each, newest first.** In-flight only. Closed 08-03 → 08-16:
[decision-log-2026-08-03-to-16.md](./archive/decision-log-2026-08-03-to-16.md). Full text 07-31
→ 08-02: [decision-log-2026-08.md](./archive/decision-log-2026-08.md). 07-11 → 07-23:
[decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-SPILL-RAM-CREDIT-1** (08-17): SPILL credit = real spill (tip-over / massive-ram / void fall) attributed to `lastHitBy` + 3s window. Rams on upright victims count 0. Playtest **SPILL-RAM-CREDIT-PT-1**.
- **D-HOWLER-UPGRADE-1** (08-17): pooling + volume buses already shipped. Spatial deferred, taste-gated. Card closed. New ID if playtest asks for 3D SFX.
- **D-COUNTDOWN-HOST-STAMP-1** (08-16): first non-host 3-2-1 adopts `host_round` start while `hostClock.samples === 0` (caps 367 / 368). Not a THOST-CEILING fail. Candidate: skip that stamp until the host clock has samples.
- **D-REMOTE-INPUT-STALE-1** (08-17): host zeros stale remote input after `remoteInputStaleMs` (300) of apply-silence; nitro latch kept; ackSeq untouched. Playtest **REMOTE-INPUT-STALE-PT-1**.
- **D-LAST-STANDING-DEAD-1** (08-16): delete Last Cart Standing. Bolt → 5 SD wins. lastStanding wire accepted; non-max rejected. Playtest **LAST-STANDING-DEAD-PT-1**.
- **D-NPC-ABORT-BURST-1** (08-16): abort hard-cancels unless the locked target is live on the floor and cart-yaw runway is clear. Open-floor close ram still bursts. Playtest **NPC-ABORT-BURST-PT-1**.

## Gotchas (append-only)

The hot set — what a current session is likely to hit. Deep-domain and narrow entries live in
**[reference/gotchas.md](./reference/gotchas.md)** — grep it *before* debugging physics
(combine rules · `castRay` filters · no RNG seed), audio (Howler `_playLock` · volume buses),
the dev loop (dev probes lie in prod · edge propagation · frozen `rAF` · HNS ports · hostFreeze),
or a suspected blocker (TS 7 · `cartrave4` UVs).

- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Level animation IS capturable** — SHOOT-ANIM-1 closed (`6b27283`); pin with `--t <ms>` and compare two. Judge against the arena's null floor, not zero: **Sundial ~1.2%, Classic ~15.9%**. Rave **dressing** is still frozen — SHOOT-ANIM-2.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **The in-app Browser pane does not composite while hidden**, so rAF never fires there: loaders sit at 4% forever. Verify rendered behavior on prod or in tests.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- **Before any public / external-tester playtest: reset the analytics DO.** Token-gated: `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).
- Local worker port is **8899** (`LOCAL_WORKER_PORT` in `src/config.js`). If it goes EACCES, re-check Windows HNS exclusions and move the port there.

## Last updated

2026-08-16 (STATUS trim) — archived 08-16 PASS dump + closed Decision index to
[status-log-2026-08-16.md](./archive/status-log-2026-08-16.md) and
[decision-log-2026-08-03-to-16.md](./archive/decision-log-2026-08-03-to-16.md). Live PT:
**NPC-ABORT-BURST-PT-1** · **LAST-STANDING-DEAD-PT-1** · **COUNTDOWN-HOST-STAMP-PT-1** on
`npm run dev` until ship; **REMOTE-INPUT-STALE-PT-1** after ship.

Older session logs (2026-08-16 detail and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-16.md](./archive/status-log-2026-08-16.md)) ·
([status-log-2026-08-15.md](./archive/status-log-2026-08-15.md)).
