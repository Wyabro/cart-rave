# Cart Clash — Backlog (open work only)

**What is this?** Every known **open** item, deduplicated — grouped by discipline, prioritized.
**Why does it exist?** So open work lives in one place instead of scattered tables.
**Who should read it?** Whoever is picking the next piece of work.
**Related:** [STATUS.md](../STATUS.md) (declared phase + focus), [ROADMAP.md](./ROADMAP.md)
(phase definitions), [completed-work.md](./completed-work.md) (shipped),
[netcode-deep-dive.md](./netcode-deep-dive.md) (hazard writeups).

Priorities: **Critical** = blocks Version 2 · **High** = should land before V2 ·
**Medium** = V2-window polish · **Low** = post-launch / opportunistic.

Completed rows are **not** kept here — move them to [completed-work.md](./completed-work.md).
Do not re-add closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, NET-CLK-*, NET-BUF-1, …)
without new evidence.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

**SHIP-1 tiers (07-20):** pre-ship ordering now lives in [SHIP-1.md](./SHIP-1.md).
Rows tagged `[SHIP-1 A–E]` are pre-ship, drained tier by tier; untagged rows default to
post-launch unless Wyatt pulls them forward.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Medium | BOOT-PERF-1 — pre-warm the selected arena during menu idle | Remaining first-load cost wants idle warm of SELECTED arena shaders. Gate on tab-visible. |
| Done | COUNTDOWN-SYNC-1 — countdown beat desync / "skips" `[SHIP-1 A1]` | Fixed (07-21): retroactively fire missed "1" beat, staggered 220ms before GO + host-domain clock sync. Confirmed good by Wyatt in playtest (07-22). |
| Low | COUNTDOWN-QUICKPLAY-1 — empty quickplay countdown connect-wait edge case | In empty quickplay games, countdown either waits for player connection before starting or skips part of it. Documented from F8 captures (184–196); parked in backlog per Wyatt (07-22). |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Medium | Host-reload mid-round live confirm | Reload HOST tab mid-round once in a live smoke. |
| Medium | ANLX-VIEW-1 — player-analytics view `[SHIP-1 A7]` | Capture harness shipped; missing reading surface (`npm run analytics` and/or Command Center panel). |
| High | MP-FX-1 — non-host players miss gameplay VFX `[SHIP-1 A3]` | Audit host-local vs replicated effects. |
| Medium | Customize screen performance pass *(pre-ship 07-19)* | Measure before tuning. |
| Medium | ARENA-COL-1 — Cart Rave pit/kill-zone reliability `[SHIP-1 A4]` | Center-hole KO detection inconsistent. |
| Low | Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| High | HOST-CAP-1 — capability-based host preference `[SHIP-1 A1]` | After host-hitch forensics: strongest machine wins host (`party/hostSelection.ts` + hostCapability); weak-host warning; residual = min-spec fact. |
| High | SRV-TEST-1 — direct tests for `party/index.ts` `[SHIP-1 A5]` | Extract reaper/re-arm/rate-limit/NPC-slot logic into tested helpers, then DO harness tests over `onMessage`/`onClose` sequences. |
| Medium | NET-SIM-1 — socket-lifecycle netharness scenarios `[SHIP-1 A6]` | Mid-round host reload; drop-without-close; P2P zombie recovery; reconnect-cooldown lifecycle. |
| Medium | Deeper server-authoritative logic (TRUST-1) `[SHIP-1 D1]` | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | Quickplay rotation live 2-browser check | Feature shipped; still wants a live multi-client confirm. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) `[SHIP-1 E2]` | Art half of closed VFX-1 — dark arenas + punchy neon must survive display-referred bloom. |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" `[SHIP-1 E2]` | Needs art-direction call before code. |
| High | CART-MODEL-1 — new cart basket/model `[SHIP-1 C1]` | Wyatt-led Blender work completing the prototype-era cart design. While in Blender: clean body UVs / 2nd UV channel — unblocks patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)). |
| Medium | Pattern customize UI `[SHIP-1 C3]` | Unblocked by CART-MODEL-1's re-UV. |
| Medium | CARGO-VIS-1 — groceries visibly fill the basket `[SHIP-1 C2]` | Visual half of CARGO-WT-1; follows the new basket. |
| Low | Sunglasses finish materials broken `[SHIP-1 E2]` | |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Announcer re-records (Wyatt) `[SHIP-1 E3]` | Shorter directive takes + odd lines. Pipeline drop-in. |
| Medium | Sudden Death music low-pass `[SHIP-1 E3]` | Audio-graph surgery (shared Howler bus). |
| Low | Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated. |
| Low | Turntable swirl force revive | Scoped prototype via DIR-1 — taste-gated. |
| Low | KO "doomed" presentational cue | Idea stage. |
| Low | Death-cam "follow killer" revisit | Previously reverted. |
| Low | Animate the customize sunglasses-tab camera zoom | |
| Low | Subtle monetization path | Idea stage only. |
| High | CARGO-WT-1 — grocery weight as risk/reward `[SHIP-1 B2]` | Host-side physics; evaluate rubberband + MP balance. |
| High | AI-DIFF-1 — NPC difficulty modes `[SHIP-1 B1]` | Re-baseline after cautious-phase fix before tiers. Also sharpens Solo-as-tutorial. |
| High | HIT-FEEL-1 — hit feedback `[SHIP-1 B3]` | Weak normals + noisy incoming. |
| High | INPUT-KB-1 — keyboard parity with controller `[SHIP-1 A2]` | |
| Medium | ARENA-BAL-1 — self-KO rate on Sundial + Storerooms `[SHIP-1 B3]` | |
| Low | Controller vibration strength *(pre-ship 07-19)* | |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| High | RESULTS-1 — results screen layout redesign `[SHIP-1 E1]` | |
| Medium | Controller menu navigation polish *(pre-ship 07-19)* | Modal-scoping shipped 07-20; remaining = polish + pad-in-hand validation. |
| Medium | UI-FRAME-1 — premium frame/panel styling pass `[SHIP-1 E1]` | |
| Medium | ESC scoring panel refresh `[SHIP-1 E1]` | |
| Low | Main-menu SFX slider `[SHIP-1 E3]` | |
| Medium | ONBOARD-1 — first-run controls card `[SHIP-1 E4]` | Minimal onboarding; Solo is the tutorial (AI-DIFF-1 sharpens it). Not a tutorial system. |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | MAIN-1 | Carve `main.js` composition seam | Prerequisite for BUNDLE-1. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for leaderboard. `[SHIP-1 D1]` |
| Low | BUNDLE-1 | Menu/game code-split | Blocked on MAIN-1 (D-PERF-3). |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
| Low | Vite 500 kB chunk-size hint | Cosmetic. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Frozen — [brand.md](../brand.md). |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-only Rapier on a client | Architecture invariant — [AGENTS.md](../../AGENTS.md). |
| Zustand + KO event reactors | Current and coherent. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct. |
| Big `config.js` knob table | Fine if knobs stay centralized; DIR-1 stops mid-round mutation. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX — after mobile perf; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover (BRAND-1).
- MAIN-1 → BUNDLE-1 after V2.
- DIR-1 runtime modifier stack if Living Store grows mutators.
- GLTF-1 legacy layout deletion after cartrave4-only sign-off.
