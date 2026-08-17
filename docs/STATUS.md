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

**Playtesting and stabilization.** Tier A drained; Tier B/C, security sweep, and analytics gating
are closed. Run 7 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 closed. Analytics DO reset for
external testers. Stay in this phase until Wyatt advances the marker.

**08-16 playtest PASSes:** **GAMEPAD-FREEZE-PT-1** · **ZOMBIE-HOST-PICK-PT-1** ·
**WARM-QP-ROTATE-PT-1** · **INPUT-LOCK-PT-1** · **INPUT-LOCK-PT-2** ·
**SD-SCORE-STALE-PT-1** · **SD-WIN-CREDIT-PT-1** · **PATTERNS-FOIL-PT-1** ·
**MENU-CMD-SKEW-PT-1** · **NAME-NPC-VARIETY-PT-1** · **NAME-PLAYER-VARIETY-PT-1** ·
**PATTERNS-UI-5-PT-1** · **STOREROOMS-NPC-SELFKO-PT-1** ·
**STOREROOMS-NPC-SELFKO-PT-2**. Parents **GAMEPAD-FREEZE-1** · **INPUT-LOCK-1** ·
**SD-SCORE-STALE-1** · **SD-WIN-CREDIT-1** · **PATTERNS-FOIL-1** · **MENU-CMD-SKEW-1** ·
**NAME-VARIETY-1** · **PATTERNS-UI-5** · **STOREROOMS-NPC-SELFKO-2** closed.
**ZOMBIE-HOST-PICK-1** already closed. Do not reopen GAMEPAD-LOBBY-1.
Deferred launch day: **SHARD-PT-2**. Parent **WARM-QP-ROTATE-1** stays (cap-364).
**THOST-CEILING-PT-1** Wyatt PASS 08-16 (caps 367 / 368). First-countdown hang
filed as **COUNTDOWN-HOST-STAMP-1**. Medium **NPC-ABORT-BURST-1** landed (PT owed).
08-15 and earlier PASSes: [completed-work.md](./planning/completed-work.md).

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

1. Playtest **NPC-ABORT-BURST-PT-1** · **LAST-STANDING-DEAD-PT-1** on `npm run dev` until ship. **REMOTE-INPUT-STALE-PT-1** after ship (`[2pc]`, no `?perfPump` on the non-host). Deferred: **SHARD-PT-2** (launch day). New engineering: **COUNTDOWN-HOST-STAMP-1**.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| BRAND-1 | Domain / Worker cutover | 🧊 frozen until deliberate cutover ([brand.md](./brand.md)) |

## Decision index

**One line each, newest first.** Full text: 07-31 → 08-02 in
[decision-log-2026-08.md](./archive/decision-log-2026-08.md), 07-11 → 07-23 in
[decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-COUNTDOWN-HOST-STAMP-1** (08-16): first non-host 3-2-1 adopts `host_round` start while `hostClock.samples === 0` (caps 367 / 368). Not a THOST-CEILING fail. Candidate: skip that stamp until the host clock has samples.
- **D-REMOTE-INPUT-STALE-1** (08-17): host zeros stale remote input after `remoteInputStaleMs` (300) of apply-silence; nitro latch kept; ackSeq untouched. Playtest **REMOTE-INPUT-STALE-PT-1**.
- **D-LAST-STANDING-DEAD-1** (08-16): delete Last Cart Standing. Bolt → 5 SD wins. lastStanding wire accepted; non-max rejected. Playtest **LAST-STANDING-DEAD-PT-1**.
- **D-NPC-ABORT-BURST-1** (08-16): abort hard-cancels unless the locked target is live on the floor and cart-yaw runway is clear. Open-floor close ram still bursts. Playtest **NPC-ABORT-BURST-PT-1**.
- **D-GAMEPAD-FREEZE-1** (08-16, `9935f10d`): `blur` + tab-hide now reset all held input incl. the previously-frozen gamepad axis/boost; held boost is suppressed until release on return. **GAMEPAD-FREEZE-PT-1** Wyatt PASS 08-16.
- **D-ZOMBIE-HOST-PICK-1** (08-16): host-away / host-repair pick from `#platformLiveConnIds()`, not `#connections.keys()` — platform-dead peers cannot become host. **ZOMBIE-HOST-PICK-PT-1** Wyatt PASS 08-16.
- **D-THOST-CEILING-1** (08-16): `tHost` gate is `|tHost − now| ≤ 60s` (replaces DEEPSEC-1's `1e12` abs cap). **THOST-CEILING-PT-1** Wyatt PASS 08-16.
- **D-SD-SCORE-STALE-1** (08-16): `addScore` now commits before the SD-win callback so podium `host_round` carries the final point. Announcer leader lines skip SD. **SD-SCORE-STALE-PT-1** Wyatt PASS 08-16.
- **D-MENU-CMD-SKEW-1** (08-15): Menu entrance wrote `translateY`/`scale` on `.cr-cmd` and wiped `skewX(-8deg)`; leftover label `skewX(8deg)` leaned SOLO–SETTINGS left. Entrance now `fadeIn` only. **MENU-CMD-SKEW-PT-1** Wyatt PASS 08-16.
- **D-CONN-TOASTS-1** (08-15): Friends join/leave toasts from `MSG.slots` human-connId diff + reap broadcast. **CONN-TOASTS-1** Wyatt PASS 08-15.
- **D-AGENT-OS-2** (08-15): Slim `AGENTS.md` (plan B). Keep invariants + ack/lever/freeze/fast-lane. Define done/ship/playtest once. Routing, `loop:`, and post-ship poll become pointers (manual § routing, `self-improving-loop.mdc`, `deploy-urls.md`). Not a 40–60 line cut.
- **D-EFFECTS-SPLIT-1** (08-15): `src/effects.js` split into domain modules behind a composition root. No behavior change; no playtest owed.
- **D-LOCAL-PORT-8899** (08-14, `8cf335f`): Local worker port **8787 → 8899** — Windows HNS dynamic port exclusion **8751–8850** made 8787 unbindable (EACCES; workerd aborts with `std::terminate`, killing `npm run dev:local` / the battery). Single source: `LOCAL_WORKER_PORT` in `src/config.js`; wired through netcode dial, `dev:party*`, harness, launch.json, docs. Also **HARNESS-FREEZE-1 re-ack** (`2e30d8e`): freeze lever swapped to CDP `Debugger.pause` — the lifecycle freeze never silenced a live-RTC host (bfcache eligibility), pause is a genuine JS halt (validated 08-14). Battery **8/8 green**; dashboard green.
- **D-SEO-1** (08-14): SEO pass — `rel=canonical` + og/twitter meta point at the apex cartclash.lol (www / workers.dev twins and the Glitch copy consolidate there, never index on their own); share card is a 1200×630 opaque composite of the title splat on brand bg (replaces the 512px icon; `summary_large_image` + `og:image:alt`); VideoGame JSON-LD (factual only); robots.txt + single-URL sitemap. Head-only + 2 new public files; zero gameplay/DOM change.
- **D-STORE-PILE-2** (08-14): Head-on pile contact never entered STORE-PILE-1's 0.9 m origin pad (nose-on origin ~4.45 m vs pad end 4.3 m). Pad is now cart `hz + 0.3` press; apply strips this-frame inward drive only, walk-out 17 m/s², Δv cap 4 m/s. Probe: 0 wedged / longest 0.2 s. **STORE-PILE-PT-1** Wyatt PASS 08-14.
- **D-STORE-PILE-1** (08-14, `0fd9c64`): Storerooms furniture-pile wedge — avoidance blends a tangential go-around term (the old radial-only repulsion provably produced zero lateral steer at every approach angle), plus a new wall keep-out bounce (`computeWallKeepOutBounce`) that shoves carts back off the pile, ramping with impact speed and freeing motionless carts. Sundial's drivable podium untouched (`wall` flag). 22 regression tests. Playtest owed: **STORE-PILE-PT-1**.
- **D-ORGANIZE-1** (08-14): Codebase organization pass — safe same-system moves (`gameSession.js` → `orchestration/`, `visuals.js` → `effects/`), consolidated 7 cart files into `src/carts/`, and organized ~160 root test files in `tests/` into domain subdirectories. Effects split deferred to **EFFECTS-SPLIT-1**.
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
- **Windows HNS dynamic port exclusions can swallow the local worker port** (`netsh interface ipv4 show excludedportrange protocol=tcp`; common block 8751–8850 from Hyper-V/WSL even with no distro installed). Symptom: wrangler binds fine on other ports but 8787-era dev dies with `workerd std::terminate()` + a libuv assert in the parent — looks like a crash, is EACCES on the bind. Local worker port is now **8899** (`src/config.js` `LOCAL_WORKER_PORT`); if it ever goes EACCES again, re-check the exclusion table and move it there.
- **hostFreeze's freeze lever is CDP `Debugger.pause`** (HARNESS-FREEZE-1 re-ack, `2e30d8e`) — `Page.setWebLifecycleState({state:"frozen"})` resolves but never silences a page holding a live RTCPeerConnection (bfcache eligibility), and perfPump/focus-emulation defeat CPU-throttle fallbacks. Pause = genuine JS halt; the scenario waits a bounded grace for silence (in-flight sends land first) before measuring the 3s window. If it ever goes INCONCLUSIVE again, the halt didn't land — that's an environment regression, not netcode.

## Last updated

2026-08-16 (THOST-CEILING-PT-1) — Wyatt PASS (caps 367 / 368 snap gaps). Filed **COUNTDOWN-HOST-STAMP-1** for the first-countdown hang.

2026-08-16 (NPC-ABORT-BURST-1 · GAMEPAD-FREEZE-1 · ZOMBIE-HOST-PICK-1 · THOST-CEILING-1) — landed; PT owed. Closed PASS: INPUT-LOCK-1 · SD-SCORE-STALE-1 · SD-WIN-CREDIT-1 · PATTERNS-FOIL-1.

Older session logs (2026-08-15 and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-15.md](./archive/status-log-2026-08-15.md)) ·
([status-log-2026-08-13.md](./archive/status-log-2026-08-13.md)).
