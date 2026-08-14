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

**MENU-MUSIC-2** / **MENU-MUSIC-PT-1** CLOSED 08-13. Wyatt playtest PASS on prod `11e5e48f`.

**08-13 playtest export:** 9 PASS / 0 FAIL / 3 SKIP. Cargo solo fill + rebuild, same-clientId reconnect, booth-target AI, both NPC type draws, PA combo tiers, STORE-1 regression, and both Storerooms songs PASSed. Remaining deferred checks: **CARGO-BAY-INSTANCE-PT-3** · **CONN-TRACK-LEAK-PT-1** · **SHARD-PT-2**.

**RAPIER-MAJOR-1** / **RAPIER-MAJOR-PT-2** CLOSED 08-13. Wyatt PASS on prod after hard-refresh in a two-browser Friends room: host and joiner drove, the host KO'd the joiner, and both screens agreed. Deployed `524bd4db`; both packages `0.20.0` (Rust 0.35). Hashed assets 0×404. Live `rapierInstance-o_X8o-Pe.js` carries `cartRaveRapierSimd`.

**DEPS-MAJOR-1** CLOSED 08-13. Direct `sharp@0.35.3` and `@cloudflare/vitest-pool-workers@0.21.2`; party-do 45/45, full QA, production build, and Wrangler dry-run PASS. No player-visible behavior and no deploy.

**RUMBLE-STRENGTH-1** deployed 08-13 — source commit `682891e`, Worker `82e8a360-b185-403a-8a66-2757f7aba40d`. Settings persists controller rumble; Xbox, PS5, and Steam Deck use the standard Gamepad path; USB DualSense `054c:0ce6` has a narrow permission fallback only when it lacks a standard actuator. QA 7/7, build, remote-HEAD, and live root/manifest/53 referenced assets (0×404) PASS. Human hardware checks are **RUMBLE-STRENGTH-PT-1** on production.

**GAMEPAD-NAV-REPEAT-1** deployed 08-13 — source commit `34518ca`, Worker `54ce3bb3-3cfd-4d2f-9ea3-c9e671f5c7db`. Held D-pad/left-stick menu navigation acts immediately, waits 300 ms, then repeats every 100 ms; it resolves one direction, filters stick drift, resets across scope/input changes, keeps horizontal sliders single-step, and limits focus rumble to 200 ms. Focused tests 52/52, typecheck, QA 7/7, build, remote-HEAD, live root, and 25 referenced assets (0×404) PASS. Human production check is **GAMEPAD-NAV-REPEAT-PT-1**.

**BOOST-SFX-RESPAWN-1** deployed 08-13 — source commit `ef6e7c4`, Worker `32b9807a-c6d4-41b8-af69-15d89c40366c`. Charge-up SFX is no longer swept by other carts' respawns: `doRespawn` stopped calling `stopAllSfx("chargeUp")`, which cut the local player's live charge loop whenever any NPC/remote cart respawned (NPCs have played chargeUp since 08-10). Respawn cleanup is per-cart by id (`resetCartTransientState`); round-boundary sweep + rematch nuclear remain. Contract test rewritten with unique-Howler-id mock (red→green), QA 7/7, build, remote-HEAD, live root + 25 referenced assets + entities chunk (0×404, byte-identical) PASS. Owed check: **BOOST-SFX-RESPAWN-PT-1**. Non-host follow-up filed: **BOOST-SFX-NONHOST-1**.

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
| GAMEPAD-NAV-REPEAT-1 | Held controller menu navigation | 🟡 deployed `34518ca` / Worker `54ce3bb3-3cfd-4d2f-9ea3-c9e671f5c7db`; QA 7/7 + build + live assets PASS; human check seeded as GAMEPAD-NAV-REPEAT-PT-1 |
| RUMBLE-STRENGTH-1 | Controller rumble Settings control | 🟡 deployed `682891e` / Worker `82e8a360-b185-403a-8a66-2757f7aba40d`; QA 7/7 + build + live assets PASS; human target checks seeded as RUMBLE-STRENGTH-PT-1 |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **GAMEPAD-NAV-REPEAT-PT-1:** Wyatt production hardware test on Xbox, PS5 USB, or Steam Deck.
2. **RUMBLE-STRENGTH-PT-1:** Wyatt production hardware test on Xbox, PS5 USB, and Steam Deck.
3. **Deferred playtests:** **CARGO-BAY-INSTANCE-PT-3** · **CONN-TRACK-LEAK-PT-1** · **SHARD-PT-2**.

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

2026-08-13 (engineering + audit sweeps) — The ACKed Engineering Low and audit waves closed
their scoped levers: network quit retry, snapshot/spawn safety, party typing, clock-domain,
challenge rotation/menu work, and Sundial classification/reactive allocation. QA was green for
both waves; the audit also filed the remaining deferred cards. `ZAN-BOLLARD-PT-1` is seeded for
the visual check. Commits: `0333cb9` through `6cea5ad`, `182a673` through `80cb60b`.

2026-08-13 (art sweep + ship) — ART-LOW-SWEEP-1 and ART-PALETTE-1 updated arena assets and the
five cart neon colors; their visual cards remain owed. `cca8b31` deployed as CF version
`9f1d2690`; post-deploy HTML plus 25 hashed assets returned 0×404, and deployed symbols were
present. Commits: `d0c23d0` through `8178a57`, `d78e2cf`, `3f0f49b`.

2026-08-13 (MENU-MUSIC-PT-1) — Wyatt playtest PASS on prod `11e5e48f`; parent MENU-MUSIC-2
closed.

2026-08-13 (KO-DOOMED-1) — Every finalized local KO now gives a medium red edge pulse and one
center shockwave with the cart shatter. The same local-victim reactor runs on host and non-host
fall replay paths; attacker-only feedback stays unchanged. It is DOM HUD feedback, so Low quality
and post-FX-off still show it. `KO-DOOMED-PT-1` is seeded for solo visual proof. Release
maintenance also removed the stale Knip `taskkill` ignore so the required QA gate can pass.

Older session logs (2026-08-12 and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-12.md](./archive/status-log-2026-08-12.md)) ·
([status-log-2026-08-11.md](./archive/status-log-2026-08-11.md)) ·
([status-log-2026-08-08-to-10.md](./archive/status-log-2026-08-08-to-10.md)).
