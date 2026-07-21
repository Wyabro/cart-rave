# SHIP-1 — Version 2 Shipping Checklist & Pre-Ship Ordering

**What is this?** The finish line, written down: what must be true to ship V2, and the
**tier ordering** for the remaining backlog on the way there. A living doc — no deadline.
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
   `npm run qa` + production build on release HEAD, complete 5/5 battery on **exact** HEAD
   with provenance, STATUS RC checklist checked, deploy evidence. Aggregated via
   `npm run release:check`.
3. **External-tester pass** — strangers on the wide URL, judged with ANLX-VIEW-1 evidence
   (analytics + captures), not vibes.
4. **BRAND-1 domain cutover ceremony** ([brand.md](../brand.md)).

Phase advancement stays manual: agents report eligibility; only Wyatt moves the ▶ marker.

---

## Tier A — Stability & reach (first; protects everything after)

| # | Item | Notes |
|---|------|-------|
| A1 | Host hitch forensics → capability-based host preference | **In progress 07-20.** Offline analysis of existing F8 captures found the diagnostic's `hidden`/`focused` fields are sampled *after* a stall, not during — so genuine backgrounding and a real focused freeze look identical. Long Task coverage on the multi-second gaps was only 0.3–26% (idle, not busy), suggesting some of the "GPU-bound host" attribution may be backgrounded-tab noise. Fixed the instrumentation (`hiddenDuringGap`/`blurredDuringGap` latch in `longTaskProbe.js` + `gameLoop.js`) so the *next* F8 pass gives an unambiguous answer. **Do not build capability-based host preference yet** — get the retest verdict first; the fix may be much smaller than a host-selection feature (or may not be, if it confirms genuine focused stalls). |
| A2 | INPUT-KB-1 — keyboard parity | **Done 07-20, unpushed.** Two gaps closed: (1) arrow keys had zero menu-navigation effect (only native Tab) — `src/ui/gamepadNav.js` now drives the same spatial-nav engine from a keyboard listener, gated on the same `_navActive` flag as gamepad. (2) found + fixed a real bug: keyboard driving wasn't suppressed while a menu/ESC overlay is open in MP (gamepad already was) — `src/input.js getAxis()`. Verified live in dev preview + `tests/gamepadNav.test.js`/`tests/input.test.js` (+8). Needs its own playtest pass before ship (held back from deploy while A1's playtest runs on the current build). |
| A3 | MP-FX-1 — non-host gameplay VFX | Visible quality hole for 3 of 4 players. |
| A4 | ARENA-COL-1 — Cart Rave pit KO detection | Only open item that can touch progression. |
| A5 | Server test coverage (biggest gap) | `party/index.ts` (~1.6k LOC) has no direct tests. **A5a:** extract pure decision logic (reaper eviction, host re-arm, rate-limit accounting, NPC-slot reconciliation) into tested helpers — pattern proven with `hostSelection.ts` / `roundValidation.ts`. **A5b:** DO harness tests driving `onMessage`/`onClose` sequences (join→drop→reap, host crash→re-arm→migrate, malformed/oversized vs rate limits). |
| A6 | Reconnection / socket-lifecycle sims | Extend `netharness` scenarios: mid-round host reload, socket drop without close (the reaper's reason to exist), P2P zombie-peer recovery, `peerReconnectNotBeforeMs` cooldown lifecycle. |
| A7 | ANLX-VIEW-1 — analytics reading surface | Needed to judge later playtests and the external-tester pass with evidence. |

**Rendering coverage — handled differently, not skipped.** `scene.js`, `cartRaveGltf.js`,
`hud.js`, `sceneExtras.js`, `cartShatter.js` have zero unit tests; unit tests are the wrong
tool for WebGL. Gate instead via the visual-QA pipeline: promote a **golden-screenshot
baseline per arena + HUD state** (`npm run shoot` / `compare` / `blackframes`) into the
routine gate set. Pure logic hiding in those files gets extracted and unit-tested
opportunistically when touched — no dedicated refactor pass.

## Tier B — Gameplay depth

| # | Item |
|---|------|
| B1 | AI-DIFF-1 — NPC difficulty tiers (also sharpens Solo-as-tutorial) |
| B2 | CARGO-WT-1 — grocery weight risk/reward |
| B3 | HIT-FEEL-1 — hit feedback · ARENA-BAL-1 self-KO tuning as playtests dictate |

## Tier C — Cart model → patterns (one workstream, Wyatt-led art)

| # | Item |
|---|------|
| C1 | New cart basket/model (completes the prototype-era cart design). **While in Blender: clean body UVs / 2nd UV channel** — the exact blocker on patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)). |
| C2 | CARGO-VIS-1 — groceries visibly fill the (new) basket |
| C3 | PATTERNS tab in customize UI — unblocked by C1 |

## Tier D — Trust & leaderboard (biggest lift; builds on A5a's tested helpers)

| # | Item |
|---|------|
| D1 | TRUST-1 — DO validates host-asserted outcomes (round timing, score plausibility, participant verification) instead of trusting the host client blindly |
| D2 | Persistent leaderboard / player stats on TRUST-1 (SQLite DO, same infra as analytics) |

## Tier E — Look, audio, presentation (final coat)

| # | Item |
|---|------|
| E1 | RESULTS-1 results-screen redesign · UI-FRAME-1 · ESC scoring panel |
| E2 | Bloom sign-offs (Classic/Sundial) · defeat-screen art call · sunglasses materials — keep-it-dark identity holds |
| E3 | Announcer re-records · SD music low-pass · SFX slider · Howler upgrade |
| E4 | First-run controls card (minimal onboarding — Solo is the tutorial, sharpened by B1) |

## Post-launch (unchanged from BACKLOG)

MAIN-1 → BUNDLE-1, STORE-1, DIR-1, GLTF-1, DUAL-1, TS-1, TOOL-1, monetization,
WebGPU VFX, economy/XP — see [BACKLOG.md](./BACKLOG.md) Tech Debt + Future Ideas.
Backlog rows not tagged `[SHIP-1 Tier X]` and not listed above default to post-launch
unless Wyatt pulls them forward.

## Deliberately NOT pre-ship work

- **No netcode redesign / migration-model rewrite** — the guard stack is battle-tested;
  a rewrite reopens closed NET-* bugs.
- **No god-file refactors** (`main.js`, `netcode.js`, level files) before release.
- **No strict-TS migration** (TS-1 parked; TS 7 separately blocked).
