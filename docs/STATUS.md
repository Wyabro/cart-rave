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

**ART-PASS-SUNDIAL-1 is the active card. Waves 1, 2 and 3 are shipped, pushed and deployed** —
ten levers plus OQ5, production Version `22837ee6`. Remaining: **Waves 4, 5 and 6**, specified
in full in [art-pass-sundial-handover.md](./planning/art-pass-sundial-handover.md), which is now
the spec — the original plan lived outside this repo. Read its **"Traps that cost time"** before
any capture: `shoot-gpu` freezes all per-frame level animation (SHOOT-ANIM-1), so anything that
pulses, drifts, spins or orbits ships on code-reading plus arithmetic and goes to the owed list.
The [audit](./planning/art-audit-sundial.md) is `[unverified]` throughout — verify each claim
before fixing it. **Owed: Wyatt playtest** — gate beacons breathe rather than step, ship glows
read as glows, ships glide on a phone, turbines read as machinery; full list in the handover.

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
| **ART-PASS-SUNDIAL-1** | Sundial art pass — Waves 5–6 remain | ▶ **ACTIVE** — Waves 1–4 shipped + a 16b/OQ8/SHADOW-TILT-1 slice; Wave 4 **not yet deployed**. Spec = [handover](./planning/art-pass-sundial-handover.md). One commit per lever, ack per wave. **Paint does not read on this deck** (plate median 2.6 vs emissive 153) — read item 18's re-scope before proposing painted detail. **Owed: Wyatt playtest** — cart shadows on turn, dust sun lobe, raking shafts breathing, the dial, gate beacons, ship glows, ships on a phone, turbines. |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. **ART-PASS-SUNDIAL-1 — Wave 4 CLOSED** (items 12–19, plus a follow-on slice: 16b dust lobe ·
   OQ8 · SHADOW-TILT-1). **Wave 5 (hologram, items 20–25) is next and needs its own plan + ack.**
   **D-SUNDIAL-OQ6 binds** — every lever ships its Low path in the same commit. Wave 4's measured
   headline, which governs Waves 5–6: **paint does not read on this deck** (plate median luminance
   2.6; painted band 16.4; emissive rim strip 153) — see item 18's re-scope in the handover before
   proposing any painted detail.
2. **Playtest owed** — BACKLOG `## Playtest owed` (08-01 and 08-02 sections), now including
   **STORE-PT-1** (Storerooms suction lip / racking steel). **UNLOCK-PT-1 needs gates ON**
   (`?devUnlocks=off` + hard refresh) or Vite hides the whole change.
3. **Wyatt's open calls:** none on Sundial — OQ3 resolved in `9a59271`, OQ5 in `93c3deb`,
   OQ6 and OQ8 recorded below.
4. **Parked, needs its own ack:** ROUND-WEDGE-1 Phase B (Phase A shipped `d4a7718`);
   **SPAWN-SUNDIAL-1** — spawn inset shipped, platform-leg colliders did not (file was frozen).

**Open High:** ROUND-WEDGE-1 · UI-SCALE-1 · FIGHT-VERIFY-1 (Wyatt half) · RESULTS-1 ·
CART-MODEL-1 · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| ROUND-WEDGE-1 | Host-hide → MAX reject → podium⇄running storm | 🟡 **UNPARKED 08-02** (Wyatt, parallel lane) — evidence pass done. **Both writers named:** `netcode.js:2915` (`MSG.round` applier, not host-gated; the podium→running rollback is *deliberate* per `:2835`) vs the host's own round-end at `gameFlow.js:149`, which re-fires `endRound()` the next frame after each rollback. **`invariants.js:24` and that rollback contradict each other** — do not silence the assert. Shipped: auto-capture upload `cc09985`, per-channel ring floor `8063b3e`. Phase A was `d4a7718`. **Phase B (the undamped re-entry) still needs its own ack.** Does not claim cap-217 closed. |
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| SHOOT-ANIM-1 | `shoot-gpu` freezes all per-frame level animation, every arena | 📋 **High** — `levelUpdate` never runs in the attract path, so every animated property sits at its constructor value in every capture. Invalidates capture-based claims about anything that moves. |
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
- **`shoot-gpu` freezes every per-frame level animation** (SHOOT-ANIM-1). Animated properties sit at constructor values in **every** capture, in every arena. Never report "the capture shows no change" for an animated knob.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server, and returns a **duplicate module instance** with its own state. **Verify prod visually** (screenshot + build stamp), not by scene introspection.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.
- **Minification breaks naive greps of deployed assets** — `0.505` becomes `.505`, hex seeds become decimal. Check the local `dist/` chunk with the same pattern before concluding anything about prod.
- Battery reports without provenance are visible history only — never green readiness evidence. Prefer complete exact-HEAD runs.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).

## Last updated

2026-08-02 (process reset — the point of it) — Measured why velocity fell: in one three-hour
window, 16 of 25 commits were the machine maintaining itself while the art pass waited, and 137
of 374 commits in a fortnight touched only `docs/`. Three rule changes in AGENTS.md: the
operating system is **frozen during a game card**, the ack unit moved from **lever to wave**
(with a mandatory playtest checklist and a mid-wave abort), and `ARCHITECTURE.json` (~30k
tokens) became a **lookup, not a read** — fixed in `tools/lib/briefing.mjs` too, since the
generated BRIEFING was the copy that actually reached every session. STATUS.md rebuilt: 293
lines → this; `hallmark` deleted (106 of 112 tracked `.agents/` files were a web-marketing
design system).

2026-08-02 (Sundial Waves 1–3 + twelve-card backlog batch) — Sundial art pass Waves 1, 2 and 3
shipped and deployed (ten levers + OQ5 bloom threshold, frame bloom 55.6% → 18.7%); Waves 4–6
spec'd in the handover. Backlog batch `af12632`..`b8e327b`, qa green before each. Four cards
where the code disagreed with the card: PIT-DEPTH-1 cannot go under 61m; PIT-COL-INSET-1's
inset is `cos(π/16)`; FX-TEXDISPOSE-1 was disposing the **shared** cart materials;
UNLOCK-ORDER-1's grandfather had to be omission, not a force-write. Also LOD-CLOCK-1,
ASSET-CACHE-1, QP-ORDER-1, DIAG-TIER-1. New gate `tests/ccStyle.test.js`.

2026-08-01 (tooling stabilization, enforcement hooks, skills, playtest console) — Gates made
read-only; tracked `tools/git-hooks/`; session-scoped Stop/GIT-INDEX guards; `verify:head`.
Three skills vendored to `.agents/skills/` (brainstorming · writing-skills ·
systematic-debugging). HOST-CAP-1 + BOOT-PERF-1 shipped (HEAD `423008f`, Worker `76ebdc37`,
battery 6/6). FIGHT-VERIFY-1 agent half closed — podium/loadshots/states rigs + focus-ring fix
(`e5efbfe`, an unscoped `!important` in `loadingScreen.css` had outranked every designed focus
state game-wide). Full text:
[archive/status-log-2026-08-01-tooling.md](./archive/status-log-2026-08-01-tooling.md) ·
[archive/status-log-2026-08-01-skills.md](./archive/status-log-2026-08-01-skills.md).

> **Older entries are archived.** Index with date ranges:
> [archive/README.md](./archive/README.md). They are history, not current truth — `git log` and
> the code are authoritative.
