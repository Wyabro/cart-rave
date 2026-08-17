# SHIP-1 — Version 2 Shipping Checklist & Pre-Ship Ordering

**What is this?** The finish line, written down: what must be true to ship V2, and the
**tier ordering** for the remaining backlog on the way there. A living doc — no deadline.
The BACKLOG pointer row closed 08-17 on Wyatt's word. This file stays. V2 is not shipped.
**Why does it exist?** So stabilization has an exit condition and the polish loop terminates
by construction instead of by exhaustion.
**Who should read it?** Anyone picking work or judging "are we done?".
**Related:** [STATUS.md](../STATUS.md) (declared phase; ▶ marker is Wyatt-only),
[ROADMAP.md](./ROADMAP.md) (phase exit criteria — canonical, not duplicated here),
[BACKLOG.md](./BACKLOG.md) (item detail; rows carry `[SHIP-1 Tier X]` tags).

**Standing rule (anti-polish-trap):** every open item belongs to a tier below. A new
finding gets slotted into a tier, not jumped on. Only crash / desync / softlock class
bypasses the ordering. One item at a time, per the existing loop. Playtest runs certify
tiers as they complete — they do not generate unbounded new work.

---

## Ship gate (the actual finish line)

In order, all required:

1. **Tiers A–E below drained** (or an item explicitly moved to Post-launch by Wyatt).
2. **RC exit criteria green** — as defined in [ROADMAP.md § Release candidate](./ROADMAP.md#release-candidate--exit-criteria):
   `npm run qa` + production build on release HEAD, complete 6/6 battery on **exact** HEAD
   with provenance, STATUS RC checklist checked, deploy evidence. Aggregated via
   `npm run release:check`.
3. **External-tester pass** — strangers on the wide URL, judged with ANLX-VIEW-1 evidence
   (analytics + captures), not vibes. **Reset analytics DO first** (`DELETE /api/analytics`)
   so the window is strangers-only.
4. **BRAND-1 domain cutover ceremony** ([brand.md](../brand.md)).

Phase advancement stays manual: agents report eligibility; only Wyatt moves the ▶ marker.

---

## Tier A — Stability & reach (first; protects everything after)

| # | Item | Notes |
|---|------|-------|
| A1 | Host hitch forensics → capability-based host preference | **Closed.** Tab-out latch VALIDATED 07-21; COUNTDOWN-WARM-1 / SYNC-1 PASS 07-22; Intel-as-host PASS 07-22; HOST-ROLE-1 lobby rebalance PASS 07-20 (`80ecbf6`). **HOST-CAP-1 residual shipped 08-01:** weak-host toast when local hosts with join-time `score < 50` (once per hostship); min-spec fact accepted. Prod Version `76ebdc37` / HEAD `423008f`. |
| A2 | INPUT-KB-1 — keyboard parity | **Done, confirmed good 07-21.** Tuned ramp (0.07s attack / 0.05s release) feels right per Wyatt's playtest after the first pass (0.14s/0.09s) read as too controller-y. Root cause: `simulation.js` reads `axis.turn`/`axis.forward` as an analog deflection — gamepad's stick is continuous, keyboard was literal -1/0/1. Also landed: arrow-key menu nav (`gamepadNav.js`) and a UI-active driving-suppression parity fix. Tests: `gamepadNav.test.js` +5, `input.test.js` +7. No further action pending new feedback. |
| A3 | MP-FX-1 — non-host gameplay VFX | **PASS 07-22** — opponent charge glow + hop land dust/thud on non-host (Wyatt playtest). |
| A4 | ARENA-COL-1 — Cart Rave pit KO detection | **PASS 07-22** (Wyatt playtest) — rim entry pose (`fallEntryPos`) & round-clock timestamp (`fallEntryTimeMs`) at `FALL_ENTRY_Y = -2.0` via `{ classifyPos, creditTimeMs }` into `buildKOEvent`. |
| A5 | Server test coverage (biggest gap) | **Done 07-22** (pushed `67e6bea`): A5a `party/constants.ts` + pure helpers; A5b Workers DO harness (`vitest.party.config.js`, `tests/party-do/`) covering hello / join+seat+keepalive / onClose host migration. Vitest 707→739. |
| A6 | Reconnection / socket-lifecycle sims | ✅ Closed (Cap-200 + hostReload). |
| COUNTDOWN-ARM-1 | Play-ready-gated continuous arm | ✅ **PASS** Wyatt smoke 07-22 (`e08e5f5`) — full 3-2-1. |
| A7 | ANLX-VIEW-1 — analytics reading surface | ✅ **PASS** 07-22. Clear DO before public playtest (`DELETE /api/analytics`). |

**Rendering coverage — handled differently, not skipped.** `scene.js`, `cartRaveGltf.js`,
`hud.js`, `sceneExtras.js`, `cartShatter.js` have zero unit tests; unit tests are the wrong
tool for WebGL. Gate instead via the visual-QA pipeline: promote a **golden-screenshot
baseline per arena + HUD state** (`npm run shoot` / `compare` / `blackframes`) into the
routine gate set. Pure logic hiding in those files gets extracted and unit-tested
opportunistically when touched — no dedicated refactor pass.

## Tier B — Gameplay depth

| # | Item | Notes |
|---|------|-------|
| B1 | AI-DIFF-1 — NPC difficulty tiers (also sharpens Solo-as-tutorial) | **Shipped 07-22** (`49bfc2a`) — Easy/Med/Hard; Medium = baseline; Solo default Easy; Quickplay Medium; Friends host pick. |
| B2 | CARGO-WT-1 — grocery weight risk/reward | **Closed 07-22** (Wyatt feel accept) — life-scoped boss/glass; bay **count** ramp shipped (look → CARGO-VIS-1) |
| B3 | HIT-FEEL-1 — hit feedback (weak normals + noisy incoming) | **PASS 07-22** (Wyatt playtest) — quieter incoming + woken normals; `?tune` ramming.fx. ARENA-BAL-1 closed 07-22. |

## Tier C — Cart model → patterns (one workstream, Wyatt-led art)

| # | Item |
|---|------|
| C1 | New cart basket/model (completes the prototype-era cart design). **While in Blender: clean body UVs / 2nd UV channel** — the exact blocker on patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)). |
| C2 | CARGO-VIS-1 — basket fill + overflow look (full bay; pile overflows the rim at boss/full) |
| C3 | PATTERNS tab in customize UI — unblocked by C1 |

## Tier D — Trust & leaderboard (cut from V2)

Wyatt 08-17: cut from launch. Not a ship-gate item. Later work needs new IDs.

| # | Item |
|---|------|
| D1 | TRUST-1 — DO validates host-asserted outcomes — **cut 08-17** on Wyatt's word. Never built. Closed. |
| D2 | Persistent leaderboard / player stats — **cut 08-17** on Wyatt's word. Never built. Closed as LEADERBOARD-1. |

## Tier E — Look, audio, presentation (final coat)

| # | Item |
|---|------|
| E1 | RESULTS-1 results-screen redesign · UI-FRAME-1 ✅ (absorbed by the Fight Night redesign) · ESC scoring panel ✅ (absorbed by the 7f pause re-layout — the scoring chart now lives on HOW TO PLAY AISLE 7) |
| E2 | Bloom sign-offs (Classic/Sundial) · defeat-screen art call · sunglasses materials — judged against [art-direction.md](../reference/art-direction.md) (per-arena budgets via ART-EXPO-1 / ART-FILTER-1), not a global keep-it-dark rule |
| E3 | Announcer re-records ✅ (CLOSED 08-13) · SD music low-pass · SFX slider · Howler upgrade ✅ (CLOSED 08-17 — pooling + buses shipped; spatial deferred, taste-gated) |
| E4 | ~~First-run controls card~~ — **absorbed 08-05 into ONBOARD-SLIDES-1** (ONBOARD-1 retired as a row). Solo is still the tutorial; a one-shot controls reminder is a fresh card only if slides leave a gap. |

## Post-launch (unchanged from BACKLOG)

MAIN-1 (✅ closed 08-04) → ~~BUNDLE-1~~ (✅ closed partial 08-05) → ~~CHUNK-MEMBER-1~~ (✅ membership
restore 08-08) → ~~CHUNK-DEFER-1~~ (✅ human path matrix PASS 08-09),
~~STORE-1~~ (✅ closed 08-12), DIR-1, GLTF-1, DUAL-1, TS-1, TOOL-1, monetization,
WebGPU VFX, economy/XP — see [BACKLOG.md](./BACKLOG.md) Tech Debt + Future Ideas.
**TRUST-1** / **LEADERBOARD-1** cut 08-17; a later board needs a new ID.
Backlog rows not tagged `[SHIP-1 Tier X]` and not listed above default to post-launch
unless Wyatt pulls them forward.

## Deliberately NOT pre-ship work

- **No netcode redesign / migration-model rewrite** — the guard stack is battle-tested;
  a rewrite reopens closed NET-* bugs.
- **No god-file refactors** (`main.js`, `netcode.js`, level files) before release.
- **No strict-TS migration** (TS-1 parked; TS 7 separately blocked).
