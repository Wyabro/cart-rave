# Cart Clash — Roadmap (Forward-Looking Plan)

**Branch:** `cart-clash` · **Naming freeze:** [brand.md](../brand.md)

> **This doc = the future** — open and planned work only. For what works *today* see
> [project-state.md](./project-state.md); for the log of what already shipped see
> [completed-work.md](./completed-work.md). **When a roadmap item ships, move its writeup
> into completed-work.md** rather than leaving it here.

**Current philosophy:** Polish a strong **solo experience** first. Multiplayer/netcode is
intentionally deprioritized until the core game is more complete and stable.

**Multiplayer status (honest):** Mostly working, but needs polish and fixes before it is
production-ready. The two-browser runtime smoke test remains the Phase 4 gate.

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

## Phase 4 — Multiplayer & Infrastructure

| Task | Status | Notes |
|------|--------|-------|
| Multiplayer runtime smoke test | Todo | Two browsers, one room: join, color pick, ready, full round, SD overtime, podium, play again, disconnect/rejoin. |
| Netcode audit follow-through | Code-complete, pending smoke | Host transform, round duration, SD timeout, remote boost, slot resurrection, ram FX dedup, `isSuddenDeath`, clock-offset timer — statically verified. |
| Deeper server-authoritative logic | Todo | Evaluate where host trust is a problem (final scores, match outcome). |
| Persistent leaderboard (Supabase) | Todo | **Security:** a host can fabricate final scores — treat host-asserted scores as untrusted input; the Worker must validate or hold server-side truth. |

---

## Future Modernization

| Task | Effort | Notes |
|------|--------|-------|
| Improve audio via `howler.js` | Medium | Spatial audio, pooling, and volume/group management. (Howler is already in-tree for music/SFX; this is the deeper upgrade.) |

---

## Phase 5 — Optimization Candidates

**`structuredClone` performance risk (`party/index.ts`)** — the server deep-clones state before
every broadcast. At 40 Hz with 4–8 carts (each carrying position, quaternion, and velocity
arrays) this can become a measurable CPU cost on single-threaded Cloudflare Workers under load.
It is used deliberately to prevent mutation bugs where the host modifies state while the broadcast
loop is reading it.

**Future fix:** replace `structuredClone` with a manual, pre-allocated flat-array serializer that
copies primitive numbers directly into a `Uint8Array` (or a compact JSON string), bypassing V8
deep-clone overhead while preserving safety. Do not implement until after the multiplayer smoke
test is complete and performance profiling data exists.
