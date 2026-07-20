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
Do not re-add closed IDs (NET-1, NET-2, NET-MIG-3, HOST-ROLE-1, VFX-1, NET-CLK-*, NET-BUF-1, …)
without new evidence.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Medium | NET-PRES-1 — unreliable falls/collisions: loss and duplicate fan-out | Partial: falls[] 600ms victim dedupe; collisions[] 250ms pair FX dedupe. Proper event-id dedupe still open. |
| Medium | NET-SD-1 — SD can untie on score while the flag stays true | |
| High | BOOT-PERF-1 — pre-warm the selected arena during menu idle | Remaining first-load cost wants idle warm of SELECTED arena shaders. Gate on tab-visible. |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Medium | Host-reload mid-round live confirm | Reload HOST tab mid-round once in a live smoke. |
| Medium | ANLX-VIEW-1 — player-analytics view *(pre-ship 07-19)* | Capture harness shipped; missing reading surface (`npm run analytics` and/or Command Center panel). |
| High | MP-FX-1 — non-host players miss gameplay VFX *(pre-ship 07-19)* | Audit host-local vs replicated effects. |
| Medium | Customize screen performance pass *(pre-ship 07-19)* | Measure before tuning. |
| Medium | ARENA-COL-1 — Cart Rave pit/kill-zone reliability *(pre-ship 07-19)* | Center-hole KO detection inconsistent. |
| Low | Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| Medium | Deeper server-authoritative logic (TRUST-1) | Prerequisite for trusted leaderboard. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | Persistent leaderboard / player stats *(re-flagged 07-19)* | Needs TRUST-1. Scope: ship-with vs launch-follow-up. |
| Low | Quickplay rotation live 2-browser check | Feature shipped; still wants a live multi-client confirm. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) | Art half of closed VFX-1 — dark arenas + punchy neon must survive display-referred bloom. |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" | Needs art-direction call before code. |
| Medium | Pattern customize UI — blocked on cartrave4 body UVs | Plan: [cart-pattern-reuv.md](../guides/cart-pattern-reuv.md). |
| Medium | CARGO-VIS-1 — groceries visibly fill the basket *(pre-ship 07-19)* | Visual half of CARGO-WT-1. |
| Low | Sunglasses finish materials broken *(pre-ship 07-19)* | |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Announcer re-records (Wyatt) | Shorter directive takes + odd lines. Pipeline drop-in. |
| Medium | Sudden Death music low-pass | Audio-graph surgery (shared Howler bus). |
| Low | Deeper Howler upgrade | Spatial, pooling, volume groups. |

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
| High | CARGO-WT-1 — grocery weight as risk/reward *(pre-ship 07-19)* | Host-side physics; evaluate rubberband + MP balance. |
| High | AI-DIFF-1 — NPC difficulty modes *(pre-ship 07-19)* | Re-baseline after cautious-phase fix before tiers. |
| High | HIT-FEEL-1 — hit feedback *(pre-ship 07-19)* | Weak normals + noisy incoming. |
| High | INPUT-KB-1 — keyboard parity with controller *(pre-ship 07-19)* | |
| Medium | ARENA-BAL-1 — self-KO rate on Sundial + Storerooms *(pre-ship 07-19)* | |
| Low | Controller vibration strength *(pre-ship 07-19)* | |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| High | RESULTS-1 — results screen layout redesign *(pre-ship 07-19)* | |
| Medium | Controller menu navigation polish *(pre-ship 07-19)* | Modal-scoping shipped 07-20; remaining = polish + pad-in-hand validation. |
| Medium | UI-FRAME-1 — premium frame/panel styling pass *(pre-ship 07-19)* | |
| Medium | ESC scoring panel refresh *(pre-ship 07-19)* | |
| Low | Main-menu SFX slider *(pre-ship 07-19)* | |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | Create when the milestone is in sight. |
| Medium | MAIN-1 | Carve `main.js` composition seam | Prerequisite for BUNDLE-1. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for leaderboard. |
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
