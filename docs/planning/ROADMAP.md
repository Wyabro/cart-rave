# Cart Clash — Roadmap (Forward-Looking Plan)

**Branch:** `cart-clash` · **Naming freeze:** [brand.md](../brand.md)  
**Last reviewed:** July 10, 2026

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
| **Living Cargo / Living Store** | **Shipped** | Cargo scoreboard + PA directives (Flash Sale, Double Bag, Express Lane, Spill Bonus, Rush Hour). As-built: [living-store.md](../reference/living-store.md). Spill Bonus float/feed shipped in July 10 solo polish. Deferred: two-browser smoke checklist ([living-store-test-plan.md](./living-store-test-plan.md)). |
| Solo polish (feel / bots / load) | **Mostly shipped** | Spill Bonus presentation, first-solo load, directional hit vignette, solo rubberband, hop landing, NPC rare hop. Death-cam follow killer **reverted** (regression) — optional revisit. Notes: [solo-polish-2026-07-10.md](../archive/session-notes/solo-polish-2026-07-10.md). |
| Menu overhaul + domain cutover | In progress | Product UI says **Cart Clash**. Legacy `cart-rave` Worker/host/storage IDs frozen until cutover — see [brand.md](../brand.md). Typography: Road Rage (titles), Russo One (UI), Goldman (mono), Bungee (HUD display). Small UX note from Stability Pass 1: animate the customize sunglasses-tab camera zoom (1.35× snap reads as a cart-size glitch — testers reported it as one). |
| Cosmetic Progression & Unlock Path | **Shipped (core)** | Lifetime gates for patterns (incl. Bolt), sunglasses, custom color, levels — `unlockStore` / `unlockConfig`. Move further economy/XP ideas here only if reopened. |
| Performance optimization pass | Partial / Todo | Foundations landed: boot/load, lazy music, Draco carts, self-hosted fonts, half-res bloom, prop LOD, menu preview LOD, auto-quality. Still open: level-swap cost, menu weight, profiling-driven pass. |
| Black-frame flicker triage | Todo | Environment-first plan: [plan-flicker-fix-and-classic-audit.md](./plan-flicker-fix-and-classic-audit.md). |
| Evaluate WebGPU Compute Shaders | Todo | Targeted use first (shatter VFX, particles). No physics rewrite. Re-evaluate after mobile perf is solid. |
| Subtle in-game monetization / ads | Todo | Cosmetic unlocks can support a light monetization path later. |
| V2 Shipping Checklist + Final QA | Todo | Create when closer to release. |

---

## Phase 4 — Multiplayer & Infrastructure

| Task | Status | Notes |
|------|--------|-------|
| Multiplayer runtime smoke test | Todo | Two browsers, one room: join, color pick, ready, full round, SD overtime, podium, play again, disconnect/rejoin. Also re-verify July 9 feel/HUD parity (remote boost/hop, victim shake, NEW HOST callout). **Add Stability Pass 1 checks:** un-ready player leaves lobby → countdown arms for the rest; host closes mid-Sudden-Death → new host continues SD with no fake-fall spam. |
| Stability Pass 1 — deferred edges | Todo | From the July 10 pass (`77d5a52`), documented but not fixed: (1) promotion-before-SD-sync race — a client promoted in the window before receiving the SD round message can re-fire the round timer; robust guard needs authority-state rework. (2) Rematch after host migration switches arena to the new host's local `selectedLevelId` (cosmetic, next match only). (3) Dead call site `window.__cartRaveTryStartMenuMusic` (cart-rave-menu.js) — never assigned; remove on next menu touch. (4) Solo in-game verification pending a visible tab (hidden pane freezes rAF): debug-pane **Force Sudden Death** → no feed spam / no instant end; quit mid-combo → no HUD leak over menu; gameplay track 1 → track 2 rollover. |
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
