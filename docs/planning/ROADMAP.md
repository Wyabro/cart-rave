# Cart Clash — Roadmap

**Branch:** `cart-clash` · **Naming freeze:** [brand.md](../brand.md) · **Last reviewed:** 2026-07-20

**What is this?** Phase definitions and exit criteria toward Version 2 and beyond.
**Who should read it?** Anyone deciding what “done” means for a phase.
**Not this doc:** live mission, active card, blockers, or HEAD claims — those live only in
[STATUS.md](../STATUS.md). Item-level open work: [BACKLOG.md](./BACKLOG.md). Shipped log:
[completed-work.md](./completed-work.md).

**Philosophy:** Polish a strong **solo experience** first; multiplayer runtime validation is
a release gate, not the daily grind. **Phase advancement is manual** — agents may report
exit eligibility; only Wyatt moves the ▶ marker in STATUS.

---

## Phase definitions

| Phase | Meaning | Exit criteria (eligibility — not auto-advance) |
|-------|---------|-----------------------------------------------|
| Foundation | Engine, arenas, carts, physics | Core loop playable |
| Core gameplay | KOs, scoring, Living Store, solo AI | Solo round + scoring + directives work |
| Multiplayer | P2P netcode, host authority, migration | Unit-covered host path + migration handoff |
| Production systems | Passes 1–5, tooling, observability | Tooling + CI + observability platform shipped |
| **Playtesting & stabilization** | Human playtest debt + residual player-risk | Named playtest mission closed; player-risk residuals named and closed or explicitly parked; STATUS size/health contracts green |
| **Release candidate** | Exact-HEAD evidence + polish/tech-debt triage | Complete exact-HEAD battery + `npm run qa` + production build; STATUS exit checklist checked; deploy evidence for behavior-changing ships |
| Ship | Domain cutover, external testers, wide URL | BRAND-1 cutover ceremony + external tester pass |

---

## Current vs next (definitions only)

- **Current phase (declared in STATUS):** Playtesting & stabilization.
- **Next phase:** Release candidate — entered only when Wyatt advances the STATUS ▶ marker.
- Completed playtest/netcode cards (Run 7, NET-1, NET-2, NET-MIG-3, …) are **evidence inside
  stabilization**, not proof that RC has started.

---

## ✅ Completed foundation (through mid-July 2026)

Detail in [production-passes.md](./production-passes.md) and [completed-work.md](./completed-work.md):

- **Content & presentation:** three elevated arenas, sticker UI, Store PA, attract menu, VFX/audio.
- **Systems:** Living Store, scoring/KO fan-out, unlocks + challenges + match stats.
- **Gameplay/AI:** Pass 4 bots, Sundial podium contest, stabilization pass.
- **Performance:** 3-tier quality, boot/load, bloom, LOD, prefetch, auto-quality.
- **Netcode:** WebRTC P2P + binary snapshots; unit-tested migration + round validation.
- **Engine health:** VFX-1 bloom default; knip zero-ignore; CI gate.

---

## Playtesting & stabilization — exit criteria

Eligibility checklist (STATUS `### Done when` is the live copy):

1. Named playtest mission (e.g. Run 7) closed with human verdicts.
2. Player-risk residuals closed or explicitly parked (NET-2, NET-MIG-3 class).
3. No undeclared ▶ active card; optional polish does not force phase exit.
4. Command Center readiness may still be “not ready” (partial battery, dirty tree) without blocking the *declared* phase — readiness ≠ phase.

---

## Release candidate — exit criteria

1. `npm run qa` green on the release HEAD.
2. Production `npm run build` green.
3. **Complete** battery (all six core steps) on the **exact** release HEAD, provenance present.
4. STATUS RC `### Done when` items checked.
5. Deploy evidence for behavior-changing ships (served bundle + sha).
6. Use `npm run release:check` as the aggregated gate (battery stays out of ordinary PR CI).

---

## Post-V2 / future (not phase work)

Structural / product items after Ship. Full IDs: [BACKLOG.md § Tech Debt](./BACKLOG.md#tech-debt).

| Task | ID | Notes |
|------|-----|-------|
| Deeper server-authoritative logic | TRUST-1 | Prerequisite for trusted leaderboard |
| Persistent leaderboard | | Needs TRUST-1 |
| Carve `main.js` composition seam | MAIN-1 | Prerequisite for BUNDLE-1 |
| Directive modifiers without mutating CONFIG | DIR-1 | |
| Collapse gameState / gameStore | STORE-1 | |
| Pattern customize UI | | Blocked on cartrave4 re-UV |
| Domain / Worker cutover | BRAND-1 | Deliberate ceremony — [brand.md](../brand.md) |

---

## Stretch goals

- WebGPU compute for targeted VFX — after mobile perf; no physics rewrite.
- MAIN-1 → BUNDLE-1 menu/game code-split.
- GLTF-1 drop legacy cart layout.
- TS-1 TypeScript on hot paths.
- Clutch slow-mo; death-cam follow-killer revisit.

> **Convention:** when an item ships, move its writeup to [completed-work.md](./completed-work.md).
> This doc stays phased definitions + exit criteria — not a second STATUS.
