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
| Wyatt playtest queue (Passes 4/5, stabilization, bloom A/B) | ⚠️ Open | Checklist in [STATUS.md](../STATUS.md); behavior-changing work is not "done" until a human plays it |
| Push stabilization commits | ⚠️ Blocked on playtest | `b9e8fb8`..`3754949` |
| Promote display-referred bloom to default | 🟡 After look check | Kills VFX-1 everywhere; then remove `?rtmode` fork paths |

---

## 🚧 Version 2 release blockers

| Task | Status | Notes |
|------|--------|-------|
| **NET-1 — multiplayer two-browser runtime smoke** | ❌ The gate | Full-round + SD + rematch + disconnect/rejoin; run with [living-store-test-plan.md](./living-store-test-plan.md) and [host-migration-test-plan.md](./host-migration-test-plan.md) |
| Critical static netcode hazards (NET-CLK-1, NET-MIG-2) | ❌ Open | Fix before/with the smoke — [netcode-deep-dive.md](./netcode-deep-dive.md) |
| High netcode hazards (NET-CLK-2, NET-MIG-1/3, NET-BUF-1) | ❌ Open | Same doc; order documented there |
| VFX-1 endgame (bloom default promotion) | 🟡 In flight | See Current |
| Menu/domain cutover (BRAND-1) | 🧊 Deliberate event | One planned ceremony: domain, Worker name, storage migration — [brand.md](../brand.md) |
| V2 shipping checklist + final QA | ⬜ Create when close | |

---

## 🔮 Future (post-V2 window, pre-stretch)

| Task | Notes |
|------|-------|
| Deeper server-authoritative logic | Decide where host trust is unacceptable (final scores, outcome); prerequisite for the leaderboard |
| Persistent leaderboard (Supabase) | Host-asserted scores are untrusted input — server must validate |
| Recorded announcer VO + SD music + ambient bed | Asset-gated; pipeline ready ([announcer.md](../reference/announcer.md)) |
| Pattern customize UI | Blocked on cartrave4 re-UV ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)) |
| Quickplay arena rotation | Deferred (D-STAB-2); seam recipe in the [decision log](../archive/decision-log-2026-07.md) |
| `structuredClone` → flat serializer (`party/index.ts`) | Only after NET-1 + profiling shows it matters (40 Hz deep-clone on a single-threaded Worker) |
| Deeper Howler audio (spatial, pooling, groups) | |

---

## 🌙 Stretch goals & post-launch ideas

- WebGPU compute shaders for targeted VFX (shatter, particles) — after mobile perf is proven; no physics rewrite.
- BUNDLE-1 menu/game code-split — blocked on a real gameplay-cluster boundary refactor (D-PERF-3); revisit post-V2.
- Subtle cosmetic monetization path.
- Economy/XP progression beyond lifetime unlocks — only if deliberately reopened.
- TypeScript 7 migration (own migration pass; ~849 JSDoc errors under the native compiler).
- Clutch slow-mo; death-cam follow-killer revisit (was a regression).

> **Convention:** when an item ships, move its writeup to
> [completed-work.md](./completed-work.md) and delete it here. Item-level tracking with
> priorities lives in [BACKLOG.md](./BACKLOG.md) — this doc stays phased and short.
