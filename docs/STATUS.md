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

**ART-PASS-SUNDIAL-1 — ALL SIX WAVES SHIPPED.** Waves 1–5 deployed (`0d3d812f`); **Wave 6 pushed,
NOT deployed** (`1add44a`..`c93ebc3`). Needs only Wyatt's playtest (**SUNDIAL-PT-1**) + deploy.
**Six of eleven Wave 6 audit items were misdiagnosed** — measuring first changed the outcome each
time, twice avoiding a regression sold as a fix. DIAG-FLAKE-2 closed 08-02; residual
**DIAG-UPLOAD-GEN-1** in BACKLOG.

Sundial spec = [handover](./planning/art-pass-sundial-handover.md); read its **"Traps that cost
time"** before any capture, and judge phase changes against a ~1.2% construction-noise floor,
not zero. The [audit](./planning/art-audit-sundial.md) is `[unverified]` — verify before fixing.

Closed cards keep their narrative in their own docs, not here: Fight Night
([handover](./planning/fight-night-ui-handover.md)), Cart Rave and Storerooms
([audits](./planning/art-audit-storerooms.md)). Their owed human checks are BACKLOG rows under
`## Playtest owed`. Playtest console: `npm run dashboard` →
[.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html). F8 +
`npm run captures:pull`.

### Do not

Standing prohibitions — fed into [BRIEFING.md](./BRIEFING.md) and the Command Center firewall.

- **Plan → Wyatt ack → apply, acked per wave.** One plan covering every lever in the wave plus its playtest checklist, one ack, then one commit per lever. BRIEFING's active-card heading names the card — it is **not** a green light to edit.
- **During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` · Command Center styling.** Escape hatch + BACKLOG entry, never an inline fix.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card at a time; new ideas go to [BACKLOG](./planning/BACKLOG.md), not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
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
| **LOAD-POSTER-1** | Loading screens redesigned as Fight Night posters (all three arenas) | ▶ **ACTIVE, code complete PUSHED** (`106fc50`). Stage is the poster: cqmin-sized scene + two-line title lockup + inline SVG per arena. QA 105/1269, build ok, loadshots 121/121 at 2560×1440 / 1920×1080 / 390×844. Remaining: **deploy + Wyatt eye (LOAD-POSTER-1)**. |
| PLAYTEST-BATCH-0803-1 | Playtest batch 08-03 (FV-LOAD freezes + load art, quality grace, unlock toast, store decks, GET READY pulse, boot measure) | ✅ code complete, **PUSHED** (`35cf3a9`..`4f2fdde`) — the earlier "unpushed" label was a stale remote-tracking ref; `git ls-remote` confirms origin has it. QA 105/1269 green, build ok. Remaining: deploy + 5 Wyatt retests. |
| ART-PASS-SUNDIAL-1 | Sundial art pass — all 6 waves shipped | ✅ code complete — Wave 6 pushed, **not deployed**. Remaining: playtest (**SUNDIAL-PT-1**) + deploy. Spec = [handover](./planning/art-pass-sundial-handover.md). |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **Deploy is the only thing left before retests.** Both PLAYTEST-BATCH-0803-1
   (`35cf3a9`..`4f2fdde`) and LOAD-POSTER-1 (`106fc50`) are pushed; nothing is deployed.
   Gates on HEAD: `npm run qa` **105 files / 1269 tests** + knip/briefing/arch/health ok,
   `npm run build` ok. Retest queue after deploy: FV-LOAD-1, UNLOCK-TOAST-1, STORE-DECK-1,
   CAM-READY-1, FV-BOOT-1, **LOAD-POSTER-1**. Deploy only on explicit "ship it".
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

One line each, newest first; full text in
[archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-SUNDIAL-OQ8** (08-02): **Stylise — keep the 9.93° sun key and the 1.87° sun disc.** The key
  is what sculpts the deck; dropping it to meet the disc keeps only **18.9%** of that sculpting
  while the hemi, already **2.32:1** over the key, goes to **12.26:1**. Whole-deck frame mean is
  the **wrong instrument** here (hemi-dominated, post-exposure — it stays flat while shaping dies).
  If ever revisited, measure sun-facing vs anti-sun-facing **vertical** surfaces.
- **D-SUNDIAL-OQ6** (08-02): **Low is a shipping look.** Sundial water is authored to survive
  Low. Audit item 36 moves up out of Wave 6, and every lever ships its Low path in the same
  commit.
- **D-SUNDIAL-OQ5** (08-02, `93c3deb`): Sundial gets its **own** bloom threshold **0.68** via the
  existing `resolveDisplayBloomConfig` plumbing — frame bloom 55.6% → 18.7%, parity with Classic
  (15.8%), sun disc keeps its glow. Threshold is the **only** knob moved; Classic untouched.
- **D-ROUND-WEDGE-1-A** (08-01): Host-hide MAX cushion = server `pausedWallMs`. MAX reject only
  when `now - runningAnchor - pausedWallMs > ROUND_DURATION_MS + 15_000` (non-SD). MIN stays
  wall-only. Phase B client breaker is separate.
- **D-BOOT-PERF-1** (07-31): Idle warm is not sticky-first-wins — a mid-flight picker bumps gen;
  a stale flight must not latch done; newer serializes after prior.
- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50` only (strict
  `<`; neutral 50 silent); once per hostship. Min-spec = accepted fact.
- **D-ANLX-BULK-1** (07-31): Short scripted match ends are non-product. Product metrics require
  `duration_ms >= MIN_MATCH_DURATION_MS` (3000) and non-null; shared constant lives in
  `shared/analyticsConstants.js`.

Older entries (07-11 → 08-01, incl. D-FIGHTNIGHT-1 · D-HIT-FEEL-1 · D-ARCH-1 · D-PARITY-1 ·
D-COUNTDOWN-\* · D-SHIP-1 · D-TRUTH-1 · D-CARGO-VIS-1 · D-SHEET-1 · D-FRIENDS-REJOIN-1) are
preserved verbatim in the decision log.

## Gotchas (append-only)

The hot set — what a current session is likely to hit. Deep-domain and narrow entries move to
[reference/gotchas.md](./reference/gotchas.md); grep there when a subsystem surprises you.

- EffectComposer path, DEFAULT (`?bloompipe=display`): RenderPass → OutputPass → Bloom → Arcade(VHS) → FXAA. `?bloompipe=hdr` swaps to Bloom → OutputPass; OutputPass is never last in either. `renderer.toneMapping` is a no-op into composer RTs without OutputPass — except on the lowest tier, which bypasses the composer entirely (`composerBypass`) and tone-maps natively.
- Half-res bloom RTs: strength compensated via `bloomHalfResStrengthMul`.
- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Level animation IS capturable** — SHOOT-ANIM-1 closed (`6b27283`); free-running it lands on a random phase, so pin one with `--t <ms>` and compare two. Judge against the arena's null floor, not zero: **Sundial ~1.2%, Classic ~15.9%** (construction randomness, not animation). Rave **dressing** is still frozen — SHOOT-ANIM-2.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. It does **not** always give a duplicate module instance, though: under Vite dev, importing the **same resolved URL** the app imported returns the **same** instance with shared state — verified 08-02 by firing `triggerArenaKoFlash` from a probe-side import and watching the app's own materials react. A duplicate is what you get from a *different* specifier for the same file. **Verify prod visually** (screenshot + build stamp), not by scene introspection.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.
- **Minification breaks naive greps of deployed assets** — `0.505` becomes `.505`, hex seeds become decimal. Check the local `dist/` chunk with the same pattern before concluding anything about prod.
- Battery reports without provenance are visible history only — never green readiness evidence. Prefer complete exact-HEAD runs.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).

## Last updated

2026-08-03 (ROUND-WEDGE-1 Phase B code) — Client breaker for undamped podium⇄running re-entry:
`podiumEndLatch` (MAX_END_SENDS=2, PODIUM_END_RETRY_MS=150), host-only reject arm, clear on
lobby/countdown/rematch. Unit: `tests/podiumEndLatch.test.js` (8). **cap-217 still open** until
playtest. Gates: see commit message.

2026-08-03 (TOOL-HYGIENE-1) — HOOK-INDEX-1: post-commit clears staged generated docs when
index blob ≠ HEAD (before dashboard). BRIEF-DIGEST-1: template fingerprint in digest + embed.
STOP-DIRT-1 BACKLOG row retired (code already session-scoped). All three rows closed.

2026-08-02 (DIAG-FLAKE-2 closed — the drain was a guess, 5–20× too short) — Took the card slot
off Sundial, fixed, gave it back. **Reproduced first** (~1-in-10 full runs): `posts an
auto-captured bundle to the same endpoint F8 uses`, `expected [] to have a length of 1 but got
+0`. **Attributed by measurement against a green control arm**, not by adjacency:
`import("./captureUpload.js")` took **21ms vs 4ms** on the failing event, while `flush()` was
eight `setTimeout(0)` turns ≈ 8–16ms; chain-minus-import was 1–2ms every sample, ruling out the
fetch tail. Fix = a real completion signal (`__drainAutoCapturesForTest`), not a longer drain.
**Two defects in my own fix were caught by its own new test** — a stuck chain cascaded 0→8
failures, and `Promise.race` overshot the deadline, making the timeout a lie. **Trap worth
remembering:** adding `clearTimeout` to the test reset would have made DIAG-FLAKE-1's regression
test pass with `be350b4`'s guard deleted; it now re-installs without a reset instead. Verified
30 consecutive full runs, 0 red. Sundial's owed playtest lives in BACKLOG as **SUNDIAL-PT-1**;
residual as **DIAG-UPLOAD-GEN-1**.

2026-08-02 (process reset — the point of it) — Measured why velocity fell: in one three-hour
window, 16 of 25 commits were the machine maintaining itself while the art pass waited, and 137
of 374 commits in a fortnight touched only `docs/`. Three rule changes in AGENTS.md: the
operating system is **frozen during a game card**, the ack unit moved from **lever to wave**
(with a mandatory playtest checklist and a mid-wave abort), and `ARCHITECTURE.json` (~30k
tokens) became a **lookup, not a read** — fixed in `tools/lib/briefing.mjs` too, since the
generated BRIEFING was the copy that actually reached every session. STATUS.md rebuilt: 293
lines → this; `hallmark` deleted (106 of 112 tracked `.agents/` files were a web-marketing
design system).

2026-08-02 (Sundial Waves 1–3 + twelve-card backlog batch) — Waves 1–3 shipped and deployed
(ten levers + OQ5, frame bloom 55.6% → 18.7%); backlog batch `af12632`..`b8e327b`. Per-card
detail + four code-disagreed-with-card notes in [completed-work.md](./planning/completed-work.md).

> **Older entries are archived** (incl. 08-01 tooling/skills): [archive/README.md](./archive/README.md).
> History, not current truth — `git log` and the code are authoritative.
