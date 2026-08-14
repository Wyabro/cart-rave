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

**Three deployed input regression checks await Wyatt retest (08-14):**
**GAMEPAD-DIRECT-ENTRY-PT-1** · **GAMEPAD-MENU-ROUTES-PT-1** ·
**PAUSE-CHARGE-SFX-PT-1**. Other solo owed cards: **STORE-PILE-PT-1** ·
**SUNGLASSES-OBSIDIAN-PT-1** — see BACKLOG `## Playtest owed`. Deferred (two machines / launch day):
**CARGO-BAY-INSTANCE-PT-3** · **CONN-TRACK-LEAK-PT-1** · **QP-ROTATE-PT-1** · **SHARD-PT-2**.
Open agent picks live in [BACKLOG.md](./planning/BACKLOG.md) Work order Blocks 4–5 / 7.

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

1. **DEEPSEC-1 landed (3 commits, not deployed).** Playtest **DEEPSEC-1-PT-1** `[2pc]` on `dev:local` or after ship. Token rotate stays on **DEEPSEC-2**.
2. **Deferred playtests (need two machines or launch-day traffic):** **DEEPSEC-1-PT-1** · **CARGO-BAY-INSTANCE-PT-3** · **CONN-TRACK-LEAK-PT-1** · **QP-ROTATE-PT-1** · **SHARD-PT-2**.
3. **SHIP-1 D-tier** — cut persistent leaderboard from launch, or schedule its own phase (Wyatt).
4. Agent quiet-window picks: BACKLOG Block 4 (WARM-SOLO-1 · PERF-WATCH-1) or Block 5 Lows — plan → ack first.

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

- **D-LOCAL-PORT-8899** (08-14, `8cf335f`): Local worker port **8787 → 8899** — Windows HNS dynamic port exclusion **8751–8850** made 8787 unbindable (EACCES; workerd aborts with `std::terminate`, killing `npm run dev:local` / the battery). Single source: `LOCAL_WORKER_PORT` in `src/config.js`; wired through netcode dial, `dev:party*`, harness, launch.json, docs. Also **HARNESS-FREEZE-1 re-ack** (`2e30d8e`): freeze lever swapped to CDP `Debugger.pause` — the lifecycle freeze never silenced a live-RTC host (bfcache eligibility), pause is a genuine JS halt (validated 08-14). Battery **8/8 green**; dashboard green.
- **D-SEO-1** (08-14): SEO pass — `rel=canonical` + og/twitter meta point at the apex cartclash.lol (www / workers.dev twins and the Glitch copy consolidate there, never index on their own); share card is a 1200×630 opaque composite of the title splat on brand bg (replaces the 512px icon; `summary_large_image` + `og:image:alt`); VideoGame JSON-LD (factual only); robots.txt + single-URL sitemap. Head-only + 2 new public files; zero gameplay/DOM change.
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

2026-08-14 (LOCAL-PORT-8899) — Local worker port 8787→8899 (HNS exclusion 8751–8850) +
HARNESS-FREEZE-1 re-ack (Debugger.pause lever); battery 8/8 green, dashboard green.
BRIEFING regenerated from this file.

Older session logs (2026-08-13 and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-13.md](./archive/status-log-2026-08-13.md)) ·
([status-log-2026-08-12.md](./archive/status-log-2026-08-12.md)) ·
([status-log-2026-08-11.md](./archive/status-log-2026-08-11.md)) ·
([status-log-2026-08-08-to-10.md](./archive/status-log-2026-08-08-to-10.md)).
