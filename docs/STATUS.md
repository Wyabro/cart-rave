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
| BUNDLE-1 | Menu/game code-split | ⚠️ **CLOSED PARTIAL 08-05 — perf goal NOT met. Deployed `f2f90fd2`.** Warm `menu-ready` −3% vs a −15% gate. Banked: a `size:check` byte gate, `main.js` 2,582 → 1,262 lines, −22.6% off the initial set (**cold** visits only). Lever E playtested: BUNDLE-E-PT-1 PASS 6/6. [bundle-1.md §0](./planning/bundle-1.md) |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **NOW:** Block 1 has no open cards — SPAWN-SUNDIAL-GAP-1 ✅ PASS 08-07 (shipped 08-06,
   `92c44f2`) and HOLE-FRICTION-COMBINE-1 ✅ PASS 08-07 (`519d905`). Next work is Block 2,
   starting with the **CART-COLOR-DEPTH-1** definition session.
2. **Open / REACHABLE:** CARGO-LATCH-1 · CHUNK-MEMBER-1 (ABORT — eager graph). Block I desk-only
   wave closed 08-07 (PERF-RENDERINFO-1 · NET-RING-1 · AUDIO-MASTER-1 · STATES-DEAD-1).
3. **Open High:** ONBOARD-ATTRACT-1 · ONBOARD-SIZE-1 · CART-MODEL-1 · bloom (unblocked by ART-*).
4. **Playtest row left:** SHARD-PT-2 (launch day, five humans). Detail for all closed work:
   [completed-work.md](./planning/completed-work.md).

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| CARGO-LATCH-1 | `cargoLoad.js` repeats the FIX-DIRPAUSE latch bug | 📋 **REACHABLE 08-07** — fix+playtest next wave. [BACKLOG § Engineering](./planning/BACKLOG.md). |
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

2026-08-07 (ONBOARD-ART-1 — HOW TO PLAY art rig landed; Block 2 pre-ship at Wyatt's call) —
The deck now takes art as a **drop-in directory**: drop `<token>.webp` (`drive` / `boost` /
`ram` / `hud` / `cargo`) into [src/assets/howto/](../src/assets/howto/README.md) and that slot
turns on at the next build; no file → the slot stays dark, so the deck reads identical to the
playtested text-only deck. Optional `<token>.still.webp` swaps in under
`prefers-reduced-motion`. AISLE 4's callouts are gated behind `data-callouts="aimed"` and stay
hidden until the real frame lands and `--x`/`--y` are re-aimed. Verified in preview: qa 7/7,
prod build, zero-art regression (all 8 slides single-column), throwaway-file positive (AISLE 1
two-column + art), phone 375×812 (art inside 30svh, copy visible) and landscape 740×360 (art
dropped). The phone sweep caught a specificity trap — rekeying the desktop `:has()` rules to
`[data-art]` raised them to (0,3,0), so the phone/landscape one-column bands had to be rekeyed
too or an art slide squeezed into `286px 0px`. **Remaining:** Wyatt's webp captures + callout
aim. Do not shoot with `npm run shoot` (SHOOT-SOFTGL-1).

2026-08-07 (SPAWN-SUNDIAL-GAP-1 PASS + BACKLOG-GATE-3) — Sundial booth gap PASS; the fix had
already shipped 08-06 (`92c44f2`) under another card's commit subject and the row survived a full
day, so **BACKLOG-GATE-3** landed alongside it: a `commit-msg` hook (one card claim per code
commit), `npm run backlog:audit` (pickaxe an open row's own lever across git), IDs on 25
prose-named rows, and three house rules. **Block 1 is now empty** → Block 2, **CART-COLOR-DEPTH-1**.

2026-08-07 (HOLE-FRICTION-COMBINE-1 PASS) — Dynamic Min friction combine while overhanging the
center hole (`519d905`); Wyatt playtest PASS.

2026-08-07 (Block H desk-only completion: 12 cards closed, one commit each) — Remaining Block H
desk-only levers + five earlier desk-only cards landed as 12 commits (`cae4a35`…`7131f40`,
pushed `8af97f4`); none player-visible. Full list:
[completed-work.md](./planning/completed-work.md).

2026-08-07 (BACKLOG Block H opened; H1 3/7 landed, unpushed to prod) — Full principal-engineering
audit (physics/netcode/perf/input/arch/security/UX/testing) filed as 15 new cards across 3
sub-batches (H1 correctness, H2 perf + gamepad, H3 polish); 3 docs-accuracy fixes applied directly.
H1's first 3 desk-only levers landed same session — `CONNSTATE-REFLIP-1`, `LASTHITBY-MUTATE-1`,
`FREEZE-TELEMETRY-1` (writeups in
[completed-work.md](./planning/completed-work.md)).

2026-08-07 (PACE-KO-1 + COMBAT-READ-1 deployed `157bf81`; player checks owed) — Attributed KOs now
show the existing KO hitmarker/sting/flash as the victim crosses the shared below-rim no-return
marker (host sends the presentation-only confirm over P2P; the later full KO remains the loss-safe
fallback if that packet drops; fall depth / shatter / score / announcer / respawn timing unchanged),
and Critical KOs amplify the existing arena flash + world hitmarker on every peer; normal/self KOs
unchanged. PACE-KO-1 targeted 60/60 with the deferred bridge test first catching then verifying the
required callback seam; COMBAT-READ-1 targeted 50/50, full QA 7/7, production build, two-client
harness 6/6 (its first verification hit a partial dependency checkout — `npm install --ignore-scripts`
restored it; local Worker tests need sandbox escape because Wrangler writes under AppData). Worker
`7ea75009-7068-44b8-b54d-4ac73f4d5cea` is live under the same production verification. Remaining:
the player-visible checks in BACKLOG.

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

Older session logs (2026-08-04 and earlier): [archive/README.md](./archive/README.md).
