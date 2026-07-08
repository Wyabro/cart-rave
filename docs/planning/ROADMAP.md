# Cart Clash — Roadmap (Forward-Looking Plan)

**Branch:** `cart-clash` · **Naming freeze:** [brand.md](../brand.md)

> **This doc = the future** — open and planned work only. For what works *today* see
> [project-state.md](./project-state.md); for the log of what already shipped see
> [completed-work.md](./completed-work.md). **When a roadmap item ships, move its writeup
> into completed-work.md** rather than leaving it here.

**Status:** Phases 1–3 complete; **Phase 4 (Multiplayer & Infrastructure) active.**

**Current philosophy:** Polish a strong **solo experience** first. Multiplayer/netcode is
intentionally deprioritized until the core game is more complete and stable.

**Multiplayer status (honest):** Inbound client messages process correctly since the July 2
`onMessage` parameter fix (`party/index.ts`); all July 1–2 netcode fixes are live and reachable.
The two-browser runtime smoke test is intentionally deferred within Phase 4. The server→client
path has worked since migration.

---

## Phase 3 — Content & Major Polish (open items)

| Task | Status | Notes |
|------|--------|-------|
| Menu overhaul + domain cutover | In progress | Product UI says **Cart Clash**. Legacy `cart-rave` Worker/host/storage IDs frozen until cutover — see [brand.md](../brand.md). Typography: Road Rage (titles), Russo One (UI), Goldman (mono), Michroma (timer). |
| Cosmetic Progression & Unlock Path | Todo | Unlock cart variants through play milestones. Builds on the stabilized customization system. |
| Performance optimization pass | Todo | Especially level swapping + menu. |
| Evaluate WebGPU Compute Shaders | Todo | Targeted use first (shatter VFX, particles). No physics rewrite. Re-evaluate after mobile perf is solid. |
| Subtle in-game monetization / ads | Todo | Cosmetic unlocks can support a light monetization path later. |
| V2 Shipping Checklist + Final QA | Todo | Create when closer to release. |

---

## Phase 4 — Multiplayer & Infrastructure (active)

**Sequence:** all July 1–2 netcode fixes are live; the runtime smoke test is the next gate. Only
after it passes do the code-complete items below graduate from "pending" to "working".

| Task | Status | Notes |
|------|--------|-------|
| Multiplayer runtime smoke test | Todo | Two browsers, one room: join, color pick, ready, full round, SD round >15s overtime, podium, play again, disconnect/rejoin. Also verifies tie-handling (Sudden Death `lastStanding` draw override, currently code-complete but runtime-unverified). |
| Netcode audit follow-through | Code-complete, pending smoke test | Host transform message type, round duration (150s both sides), SD server timeout, remote boost, slot resurrection, ram FX dedup, `isSuddenDeath` propagation, clock-offset timer correction. All statically verified. |
| Evaluate partyworks | Todo | github.com/Partywork/partyworks — potential source of netcode patterns; not yet used. Caution: PartyKit-ecosystem origin of the original `onMessage` signature bug. Verify every ported pattern against the partyserver API. |
| Revisit server-authoritative options | Todo | Evaluate deeper authoritative logic. |
| Spectator mode / chaos features | Todo | Stretch content. |
| Persistent leaderboard (Supabase) | Todo | **Security:** a host can fabricate final scores — treat host-asserted scores as untrusted input; the Worker must validate or hold server-side truth. |

---

## Future Modernization (deferred)

| Task | Effort | Notes |
|------|--------|-------|
| Audio upgrade via `howler.js` | Medium | Spatial audio, pooling, and volume/group management. (The other Version-2 libraries — `nipplejs`, `tweakpane`, `zustand` — have already shipped.) |
| Consider `shadcn/ui` (only if a React path is ever taken) | Medium | React/R3F is formally removed; the imperative Three.js structure (pools, scratch buffers, direct matrix writes) is retained as a core asset for 60 fps physics. |

---

## Phase 5 — Optimization Candidates (deferred)

**`structuredClone` performance risk (`party/index.ts`)** — the server deep-clones state before
every broadcast. At 40 Hz with 4–8 carts (each carrying position, quaternion, and velocity
arrays) this can become a measurable CPU cost on single-threaded Cloudflare Workers under load.
It is used deliberately to prevent mutation bugs where the host modifies state while the broadcast
loop is reading it.

**Future fix:** replace `structuredClone` with a manual, pre-allocated flat-array serializer that
copies primitive numbers directly into a `Uint8Array` (or a compact JSON string), bypassing V8
deep-clone overhead while preserving safety. Do not implement until after the multiplayer smoke
test is complete and performance profiling data exists.

---

## Dropped

- Crazy Carts mode (solo 8 NPCs)
- General pre-submission checklist
