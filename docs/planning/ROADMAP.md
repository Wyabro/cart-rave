# Cart Clash — Roadmap

**Branch:** `cart-clash` · **Naming freeze:** [brand.md](../brand.md) · **Last reviewed:** 2026-07-12

**What is this?** The phased plan to Version 2 and beyond — what's done, what's in flight,
what blocks the release, and what waits until after. **Who should read it?** Anyone deciding
what to build next (pair it with [BACKLOG.md](./BACKLOG.md) for the full item-level list).
**Related:** health + current focus in [STATUS.md](../STATUS.md); the shipped log in
[completed-work.md](./completed-work.md); pass-by-pass record in
[production-passes.md](./production-passes.md).

**Philosophy:** Polish a strong **solo experience** first; multiplayer runtime validation is
the final gate, not the daily grind. **Multiplayer status (honest):** hardened and
unit-covered, but the live two-browser smoke has never been run — until it passes, V2 is not
ready.

---

## ✅ Completed (through 2026-07-11)

The jam shipped May 2026; June–July rebuilt it into a Version-2 candidate. Highlights — full
detail in [production-passes.md](./production-passes.md) and [completed-work.md](./completed-work.md):

- **Content & presentation:** three elevated arenas (Cart Rave / The Storerooms / Sundial Station), HUD redesign + sticker language across every screen, Store PA announcer, attract-mode menu, VFX/audio juice passes.
- **Systems:** Living Store (cargo scoreboard + PA directives), scoring/KO event fan-out, lifetime unlocks + challenges + personal bests, match stats.
- **Gameplay/AI:** Pass 4 bot fixes and aggression, Sundial podium contest, combat feel; solo rubberband; stabilization pass (wheel roll, podium size, pacing).
- **Performance:** 3-tier quality system, boot/load pass, half-res bloom, LOD, chunk prefetch, auto-quality.
- **Netcode:** WebRTC P2P gameplay plane with binary snapshots + size gates; unit-tested host migration + round validation; connection lifecycle hardening.
- **Engine health:** black-frame flicker root-caused and fixed on Storerooms (`98317c1`); knip zero-ignore; 285-test CI gate.

---

## 🔄 Current — Validation checkpoint (the next milestone)

Implementation is ahead of validation. Everything here exists in the tree and needs proving:

| Task | Status | Notes |
|------|--------|-------|
| Wyatt playtest queue (Passes 4/5, stabilization) | ⚠️ Open | Checklist in [STATUS.md](../STATUS.md); behavior-changing work is not "done" until a human plays it |
| Push stabilization commits | ⚠️ Blocked on playtest | `b9e8fb8`..`3754949` |
| Promote display-referred bloom to default | ✅ Done (07-17) | Shipped `adea4bf` — all-arena default, VFX-1 closed; HDR split is `?bloompipe=hdr`-only. Optional: real-HW `?blackmon=1` taste pass, then delete the legacy fork paths |

---

## 🚧 Version 2 release blockers

| Task | Status | Notes |
|------|--------|-------|
| **NET-1 — multiplayer two-browser runtime smoke** | ❌ The gate | Full-round + SD + rematch + disconnect/rejoin; run with [living-store-test-plan.md](./living-store-test-plan.md) and [host-migration-test-plan.md](./host-migration-test-plan.md) |
| Critical static netcode hazards | 🟢 Closed in code | NET-CLK-1/2/3, NET-MIG-1/2, NET-BUF-1 shipped — [netcode-deep-dive.md](./netcode-deep-dive.md). Still open for feel/live: **NET-MIG-3**, **NET-PRES-1**, **NET-SD-1**, **NET-2 residual hitch**. |
| High netcode hazards (NET-MIG-3, NET-2 hitch) | ❌ Open | Ghost freeze after promote; mid-round join cold-load hitch |
| VFX-1 endgame (bloom default promotion) | ✅ Closed (07-17) | Display-referred byte bloom is the all-arena default (`adea4bf`); optional real-HW `?blackmon=1` taste pass remains |
| Menu/domain cutover (BRAND-1) | 🧊 Deliberate event | One planned ceremony: domain, Worker name, storage migration — [brand.md](../brand.md) |
| V2 shipping checklist + final QA | ⬜ Create when close | |

---

## 🔮 Future (post-V2 window, pre-stretch)

Structural / product items after the multiplayer gate. Full IDs and “do not modernize”
table: [BACKLOG.md § Tech Debt](./BACKLOG.md#tech-debt).

| Task | ID | Notes |
|------|-----|-------|
| Deeper server-authoritative logic | TRUST-1 | Decide where host trust is unacceptable (final scores, outcome); prerequisite for the leaderboard — **not** server-side Rapier |
| Persistent leaderboard (Supabase) | | Host-asserted scores are untrusted input — needs TRUST-1 |
| Carve `main.js` composition seam | MAIN-1 | Prerequisite for honest menu/game code-split; shrink callback bags |
| Directive modifiers without mutating CONFIG | DIR-1 | Runtime multiplier stack for Living Store |
| Collapse gameState / gameStore dual surface | STORE-1 | One public state API |
| ~~Recorded announcer VO + ambient bed~~ | | ✅ Shipped 2026-07-16 ([announcer.md](../reference/announcer.md), [ambience.md](../reference/ambience.md), [music.md](../reference/music.md)). Remaining: SD music low-pass (audio-graph surgery, not asset-gated) |
| Pattern customize UI | | Blocked on cartrave4 re-UV ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)) |
| `structuredClone` → flat serializer (`party/index.ts`) | | Only after NET-1 + profiling shows it matters (40 Hz deep-clone on a single-threaded Worker) |
| Deeper Howler audio (spatial, pooling, groups) | | |

---

## 🌙 Stretch goals & post-launch ideas

- WebGPU compute shaders for targeted VFX (shatter, particles) — after mobile perf is proven; no physics rewrite.
- **MAIN-1 → BUNDLE-1** menu/game code-split — blocked on a real gameplay-cluster boundary (D-PERF-3); revisit post-V2 + after MAIN-1.
- **GLTF-1** drop legacy cart GLTF layout once cartrave4 is sole production asset.
- **DUAL-1 / TOOL-1** dual-path and tooling residue cleanup (only when touching those areas).
- **BRAND-1** domain + full rebrand cutover ceremony (new Worker, storage migration, asset renames) as one planned event — [brand.md](../brand.md).
- Subtle cosmetic monetization path.
- Economy/XP progression beyond lifetime unlocks — only if deliberately reopened.
- **TS-1** TypeScript on hot paths / TS 7 migration (own pass; ~849 JSDoc errors under the native compiler).
- Clutch slow-mo; death-cam follow-killer revisit (was a regression).

> **Convention:** when an item ships, move its writeup to
> [completed-work.md](./completed-work.md) and delete it here. Item-level tracking with
> priorities lives in [BACKLOG.md](./BACKLOG.md) — this doc stays phased and short.
