# Cart Clash — Roadmap (Updated July 2, 2026, post Phase 1 closure)

**Current Philosophy:**  
Focus on building and polishing a strong **solo experience** first. Multiplayer and netcode work is intentionally deprioritized until the core game is more complete and stable.

**Multiplayer Status (honest):** Inbound client messages are now processed after the July 2 onMessage parameter fix in party/index.ts. All netcode fixes from the July 1–2 sessions are now reachable at runtime. The two-browser runtime smoke test has been intentionally deferred to Phase 4 so we can focus entirely on solo gameplay polish. Server→client path has worked since migration.

**React/R3F Migration:** Formally removed. The imperative Three.js structure (pools, scratch buffers, direct matrix writes) is retained as a core asset for 60 fps physics performance.

**Supabase Leaderboard (future):** Treat host-asserted scores as untrusted input. The Worker must validate or maintain server-side truth to prevent fabricated high scores.

> **Historical/completed work lives in [completed-work.md](./completed-work.md).** When a roadmap item ships, move its writeup there.

---

## Open Findings — July 2 Audit (resolved)
All findings #1–#8 from the July 2 audit have been resolved and verified. Detailed resolutions are recorded in [completed-work.md](./completed-work.md). The active fix queue is now clear. Future audits will start a fresh table.

---

## Phase 1 – Core Stability & Polish (✅ Complete)
All High Priority items completed. Remaining Medium items:

| Task | Status | Notes |
|------|--------|-------|
| Color selection gating improvements | ✅ Verified | Color/pattern chip clicks and custom hue inputs are now blocked during "countdown" and "running" phases. Added declashNpcSlotColors to re-roll NPC colors that clash with human players. |
| Deliberate font selection | ✅ Verified | Cohesive arcade font hierarchy implemented across all UI layers. |
| Main-menu graphics toggles: live apply | **Verified** | Finding #4 resolved. Post-FX and Low Quality buttons now apply instantly via window bridges to live scene vars and rebuild path. |

---

## Phase 2 – Solo Gameplay Polish (✅ Complete)

| Task | Status | Notes |
|------|--------|-------|
| Spilling cart contents on knockover | ✅ Verified | Client-side pooled InstancedMesh + Rapier rigidbody physics system implemented. 6 grocery types, MSG.spill netcode broadcast, cargoBay lifecycle on cart, impulse (>50)/tip (upDot < 0.3)/fall triggers, 10s lifetime + 1.5s scale-fade, explicit memory-safe dispose on level swap/respawn. |
| In-Round Combo / Multiplier System | ✅ Verified | Host-authoritative multiplier math (1.0x, 1.5x RAMPAGE, 2.0x SAVAGE, 3.0x CARNAGE). 5s decay timer. Client-side prediction updates HUD instantly via Zustand. Tier transmitted via MSG.hostEventFall for killfeed sync. |
| Rounds / results polish | ✅ Verified | The end-screen polish covered this. |
| "One More Round" End-Screen Polish + Quick Rematch | ✅ Verified | CINEMATIC_PODIUM low-angle victory lap camera. LocalStorage personal best tracking with neon "NEW PB!" badge. Rematch / Next Level / Main Menu buttons with full gamepad nav. |
| Tie-handling correctness | Code-complete, runtime-unverified | Sudden Death lastStanding draw override verified in server logic by static audit; pending runtime smoke test. |

---

## Phase 3 – Content & Major Polish (Current Focus)

| Task | Status | Notes |
|------|--------|-------|
| Daily/Weekly Challenges | ✅ Verified | Implemented local challenge tracker (challengeStore.js) with 24h/7d rotation. 10 challenges tracking spills, combos, KOs, and wins. Challenge UI panel added to main menu with reactive progress bars. |
| Cosmetic Progression & Unlock Path | Todo | Unlock cart variants through play milestones. Builds on stabilized customization system. |
| Evaluate WebGPU Compute Shaders | Todo | Targeted use first (shatter VFX, particles). No physics rewrite. Re-evaluate after mobile perf is solid. |
| Level 3: Zanzibar Platform | ✅ Verified | Fully floating octagonal steel sundeck arena. Strict convex hulls only (no trimeshes). Custom aiHazards model with octagonal bounds + circular keep-outs. Dynamic sunset seascape (sky dome, water, animated sun glint, islands). Enhanced contact shadows for octagonal bounds. Zanzibar level select + animated sunset loading screen. |
| Menu overhaul + new name/domain | Todo | Rebrand to "CART CLASH" live. Typography hierarchy implemented: Road Rage (titles), Russo One (UI), Goldman (mono), Michroma (timer). |
| Performance optimization pass | Todo | Especially level swapping + menu. |
| V2 Shipping Checklist + Final QA | Todo | Create when closer to release. |
| Subtle in-game monetization / ads | Todo | Cosmetic unlocks can support a light monetization path later. |

---

## Phase 4 – Multiplayer & Infrastructure
**Status note:** Netcode transport bug (finding #1) resolved July 2. All prior fixes from July 1–2 audits are now live and reachable. Sequence complete: fix #1 → runtime smoke test next. Only after smoke test do items below graduate from "code-complete" / "pending smoke test" to "working".

| Task | Status | Notes |
|------|--------|-------|
| PartyKit → partyserver migration | Deployed, inbound now functional | Cloudflare free tier, DO-based, V2 live at cart-rave.wyabro.workers.dev. onMessage signature now correct. |
| Netcode audit + major fixes | Code-complete, pending smoke test | Host transform message type, round duration (150s both sides), SD server timeout, remote boost, slot resurrection, ram FX dedup, isSuddenDeath propagation, clock-offset timer correction. All statically verified. |
| Multiplayer runtime smoke test | Todo | Two browsers, one room: join, color pick, ready, full round, SD round >15s overtime, podium, play again, disconnect/rejoin. Deferred from Phase 1 to focus on solo polish. |
| Evaluate partyworks | Todo | github.com/Partywork/partyworks — planned as source of netcode patterns; not yet used. Caution: PartyKit-ecosystem origin of the original onMessage signature bug. Verify every ported pattern against partyserver API. |
| Error reporting endpoint | **Verified** | Finding #2 resolved. /api/log-error route added to Worker fetch handler (executes before routePartykitRequest). Parses JSON, console.logs for Wrangler tail, returns 204 No Content. Client forwarder now fully end-to-end. |
| Revisit server-authoritative options | Todo | Evaluate deeper authoritative logic. |
| Spectator mode / chaos features | Todo | Stretch content. |
| Persistent leaderboard (Supabase) | Todo | **Security:** host can fabricate final scores; treat as untrusted input. |

---

## Future Modernization (Deferred)

| Task | Effort | Notes |
|------|--------|-------|
| Consider `shadcn/ui` (only if a React path is ever taken) | Medium | React/R3F itself is formally removed. |

---

## Phase 5 Optimization Candidates (Deferred)

**structuredClone Performance Risk (party/index.ts)**  
Server currently uses `structuredClone` before every broadcast. At 40 Hz with 4–8 carts (each carrying position, quaternion, and velocity arrays), this deep clone can become a measurable CPU bottleneck on single-threaded Cloudflare Workers under load.

**Context & Trade-off:**  
`structuredClone` is used deliberately to prevent mutation bugs where the host modifies state while the broadcast loop is reading it.

**Recommended Future Fix (Phase 5):**  
Replace `structuredClone` with a manual, pre-allocated flat-array serializer that copies primitive numbers directly into a `Uint8Array` (or a compact JSON string). This bypasses V8 deep-clone overhead while preserving safety. Do not implement until after the multiplayer smoke test is complete and performance profiling data exists.

---

## Dropped Items
- Crazy Carts mode (solo 8 NPCs)
- General pre-submission checklist

---

## Completed Work

Historical record has been consolidated into **[completed-work.md](./completed-work.md)**. That doc holds the full dated log of shipped work back to June 29, 2026 (and the pre-June 2026 foundation list), including the `[Corrected]` annotations preserved verbatim from prior audits.

**When a roadmap item ships:** move its writeup into completed-work.md rather than adding it back here.
