# Cart Clash — Roadmap (Updated July 2, 2026, post Phase 1 closure)

**Current Philosophy:**  
Focus on building and polishing a strong **solo experience** first. Multiplayer and netcode work is intentionally deprioritized until the core game is more complete and stable.

**Multiplayer Status (honest):** Inbound client messages are now processed after the July 2 onMessage parameter fix in party/index.ts. All netcode fixes from the July 1–2 sessions are now reachable at runtime. The two-browser runtime smoke test has been intentionally deferred to Phase 4 so we can focus entirely on solo gameplay polish. Server→client path has worked since migration.

**React/R3F Migration:** Formally removed. The imperative Three.js structure (pools, scratch buffers, direct matrix writes) is retained as a core asset for 60 fps physics performance.

**Supabase Leaderboard (future):** Treat host-asserted scores as untrusted input. The Worker must validate or maintain server-side truth to prevent fabricated high scores.

---

## Open Findings — July 2 Audit (resolved)
All findings #1–#8 from the July 2 audit have been resolved and verified in this session. Detailed resolutions are recorded in the new Completed Work entry below. Finding #9 (docs update) is addressed by this file. The active fix queue is now clear. Future audits will start a fresh table.

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
| Spilling cart contents on knockover | ✅ Verified | Client-side pooled InstancedMesh + Rapier rigidbody physics system implemented. 6 grocery types, MSG.spill netcode broadcast, cargoBay lifecycle on cart, impulse (>50)/tip (upDot < 0.3)/fall triggers, 10s lifetime + 1.5s scale-fade, explicit memory-safe dispose on level swap/respawn. Full implementation details in July 2 Completed Work. |
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
Historical record preserved. Where a later audit contradicted a claim, the original entry stands with a **[Corrected]** annotation rather than being rewritten — the log should show what was believed at the time and what turned out to be true.

### July 4, 2026 – Multiplayer Visual Sync & Mid-Round Join Polish

**1. CargoBay Visibility & Death Shatter Sync (netcode.js, main.js)** — Verified.
- `hostTransform` payload extended with `c` (cargoBay visibility boolean). Non-host clients now sync `cart.cargoBay.visible` on both interpolated remote carts and direct snapshot applies, so grocery cargo meshes correctly appear/hide across all clients.
- Non-host `triggerCartShatterRef` was initialized to `null` and never wired, so death shatter VFX silently failed on non-host clients. Now defaults to the actual `triggerCartShatter` function.
- All 4 carts are now snapped to their spawn booths (`teleportCartToSpawn(i)`) before the round countdown begins, ensuring a clean visual reset between rounds.

**2. Mid-Round Join Cart Teleport (netcode.js, gameSession.js, main.js)** — Verified.
- When a human replaces an NPC mid-round, the host detects `kind: "npc"` → `"human"` transitions in `MSG.roomState` and teleports the cart to its spawn booth via `teleportCartToSpawn()`. Physics body is reset (position +1Y, zero velocity, spawn yaw, `wakeUp()`).
- `teleportCartToSpawn` wired through `gameSession.js` netcode bridge and registered as a callback in `netcode.js`.
- Rate limiter in `party/index.ts` now exempts `MSG.clientInput` and `MSG.hostTransform` (high-frequency telemetry), preventing connection kills during normal gameplay. JSON parse moved before rate limit check so malformed messages are discarded without consuming the rate budget.

**3. Ram Streak, hasSpilled, Remote Boost & Kill Feed Sync (frameVisuals.js, main.js, netcode.js)** — Verified.
- Ram boost streak spawners (`tickRamBoostStreakSpawners`) were gated behind `isHost()`, so non-host clients never saw speed-streak VFX. Now runs on all clients during the `running` phase.
- `hasSpilled` state (`s`) added to `hostTransform` payload and synced on both interpolated remote carts and direct snapshot applies, so cargoBay hide/show logic stays consistent across clients.
- Remote boost edge-detection now passes `{ instant: true }` so non-host clients see the full-strength nitro VFX spike immediately on the first frame, matching the host's visual timing.
- Kill feed colors now properly converted from raw hex numbers to CSS hex strings (`#RRGGBB`) before rendering.
- `triggerCartShatterRef` resolved via both direct module-level ref (`setRefs`) and callback bridge fallback on non-host, eliminating null-ref silent failures.

**4. Respawn Visual Cleanup & Shatter Hex Parsing (entities.js, netcode.js)** — Verified.
- When `hasSpilled` transitions `true`→`false` (cart respawn), non-host clients now detect the edge and:
  - Call `cleanupShatter()` if the cart is in a shattering state, removing lingering debris meshes.
  - Call `rebuildCartVisualsIntoRoot()` (newly exported from `entities.js`) to restore a clean mesh.
  - Restore `cargoBay.visible = true` and `mesh.visible = true`.
  - Applied on both interpolated remote carts (`updateRemoteCartNetTargets`) and direct snapshot applies (`applyCartsSnapshotToBodies`).
- Death shatter color parsing hardened: accepts raw number, CSS hex string (`#RRGGBB`), or falls back to `0xffffff`.

### July 4, 2026 – Runtime Bug Fixes: Combo Decay, Grocery Queue, Level Sync, Results Cleanup

**1. Combo Decay Order-of-Operations Race Fix (gameFlow.js)** — Verified.
- Combo decay (5s expiry wiping `comboTier` to 0) was running inline during the per-cart loop, before higher-indexed victims' falls were scored on the same frame. A lower-indexed attacker's combo could zero out before its own KO registered.
- Moved decay to a **dedicated second pass** that runs after all fall-detection and scoring for the frame, eliminating the race condition.

**2. Grocery Spill Pending Queue (effects/groceryPool.js)** — Verified.
- `triggerSpill()` bailed out if `init()` hadn't finished loading GLTF models yet (`instancedMeshes.length === 0`). Spills arriving during the async load window were silently dropped.
- Added a `pendingSpills` queue. Early calls are queued and replayed verbatim once `init()` resolves, ensuring no VFX is lost during async model loading.

**3. Server-Authoritative Level Sync via MSG.round (party/index.ts, netcode.js)** — Verified.
- Server now broadcasts `levelId` in every `MSG.round`. Non-host clients detect the authoritative level ID and update their `settingsStore`, keeping level selection in sync across rematches without requiring a fresh `MSG.hello`.
- `sendHostRound()` switched from raw `localStorage` to Zustand `settingsStore` for level reads.
- Non-host cinematic camera now released on `MSG.round` countdown→running transition via `endCinematicCountdown()`.

**4. Results UI Cleanup (main.js, ui/resultsOverlay.js)** — Verified.
- Removed "NEXT LEVEL" button and all related wiring (creation, DOM append, click handler, `wireResultsButtonFeedback`). The level-cycling button was removed as part of streamlining the end-screen to a single "PLAY AGAIN" action; level changes happen at the menu instead.
- "REMATCH" button renamed to "PLAY AGAIN".

**5. Slot Kind Fallback Fix (hud.js)** — Verified.
- Scoreboard meta string used `slot?.kind || "npc"`, which treated falsy `""` (explicit empty string on human slots) as missing and incorrectly labeled humans as NPCs.
- Changed to `slot?.kind ?? ""` (nullish coalescing) so only `null`/`undefined` falls back, preserving explicit empty strings.

### July 4, 2026 – Repository-Wide TypeScript Audit & 100% Type Resolution
**1. Direct Code Audit via `qwythos:latest` Model** — Verified.
- Ran direct code audit using local model `qwythos:latest` via Ollama to cross-examine Phase 3–4 roadmap claims against live source code.
- Identified discrepancy where `docs/ROADMAP.md` claimed zero type errors, while `npx tsc --noEmit` produced ~90 type errors across `.js` files due to `checkJs: true` enforcement in `tsconfig.json`.

**2. 100% `npx tsc --noEmit` Compliance (0 Errors, Exit Code 0)** — Verified.
- Augmented global module declarations in [`src/globals.d.ts`](file:///c:/Users/wyatt/cart-rave/src/globals.d.ts) for `EventTarget`, `HTMLElement`, `THREE.Object3D`, `Pass`, `ShaderPass`, `UnrealBloomPass`, `RoomEnvironment`, and `RigidBody.setCanSleep`.
- Aligned JSDoc parameter and return types across [`src/simulation.js`](file:///c:/Users/wyatt/cart-rave/src/simulation.js), [`src/gameContext.js`](file:///c:/Users/wyatt/cart-rave/src/gameContext.js), [`src/gameFlow.js`](file:///c:/Users/wyatt/cart-rave/src/gameFlow.js), [`src/input.js`](file:///c:/Users/wyatt/cart-rave/src/input.js), [`src/levels/index.js`](file:///c:/Users/wyatt/cart-rave/src/levels/index.js), [`src/effects/groceryPool.js`](file:///c:/Users/wyatt/cart-rave/src/effects/groceryPool.js), [`src/hud.js`](file:///c:/Users/wyatt/cart-rave/src/hud.js), [`src/main.js`](file:///c:/Users/wyatt/cart-rave/src/main.js), [`src/scene.js`](file:///c:/Users/wyatt/cart-rave/src/scene.js), [`src/effects.js`](file:///c:/Users/wyatt/cart-rave/src/effects.js), and [`src/netcode.js`](file:///c:/Users/wyatt/cart-rave/src/netcode.js).
- Cleaned up obsolete `@ts-expect-error` directives in [`src/cartPatterns.js`](file:///c:/Users/wyatt/cart-rave/src/cartPatterns.js), [`src/cartRaveGltf.js`](file:///c:/Users/wyatt/cart-rave/src/cartRaveGltf.js), [`src/cartThemes.js`](file:///c:/Users/wyatt/cart-rave/src/cartThemes.js), [`src/entities.js`](file:///c:/Users/wyatt/cart-rave/src/entities.js), [`src/ui/resultsOverlay.js`](file:///c:/Users/wyatt/cart-rave/src/ui/resultsOverlay.js), and [`src/animations.js`](file:///c:/Users/wyatt/cart-rave/src/animations.js).
- Hardened server connection mapping in [`party/index.ts`](file:///c:/Users/wyatt/cart-rave/party/index.ts) broadcast call.
- Validated that `npx tsc --noEmit` now completes with 0 errors (exit code 0), `npm test` passes 21/21 Vitest unit tests, and `npm run build` generates production bundle in 1.69s.

### July 4, 2026 – Phase 4 Live Smoke Test & Server Hardening
**1. Server Stability & Crash Prevention (Critical)** — Verified.
- Connection Race Condition Fix (1006 Crashes): Hardened PartyServer `onMessage` handler against out-of-order packets. Clients sending `MSG.clientInput` before `MSG.colorPick` was processed no longer cause unhandled TypeErrors and WebSocket crashes.
- Defensive Server Guards: Wrapped all downstream message handling in top-level try/catch. Removed all 14 non-null assertions on `#slots` array, replaced with safe optional chaining and early-exit guards.
- Silent Reaper Hardening: Pending pickers are now excluded from the silent connection reaper. Missing timestamps default safely to prevent newly connected sockets from being instantly closed.

**2. Server-Side Level Authority & State Sync** — Verified.
- Level Desync Resolution: Server now maintains authoritative `#currentLevelId` and broadcasts it via `MSG.hello`. Late-joining or refreshing clients read this ID, update localStorage, and load the correct arena geometry before bootstrapping physics.
- Mid-Game UI Overlap Fix: `enterPlayMode` now immediately hides menu DOM. `HUD.updateScoreboard` guards against rendering until `isWorldBootstrapped()` returns true, eliminating menu + HUD overlap on refresh.

**3. Non-Host VFX & HUD Synchronization** — Verified.
- Hop/Boost VFX Sync: Expanded `MSG.hostTransform` payload with `b` (boosting) and `h` (hopping) booleans. Non-host clients use edge detection on `_prevRemoteBoosting`/`_prevRemoteHopping` to instantly trigger local particle VFX.
- Kill Feed Combo Metadata: Fixed truncated callback arguments in netcode bridge. Non-host kill feeds now correctly receive `comboTier` and `comboMultiplier` and display proper combo badges.
- Cinematic Camera Release: Non-host clients no longer get stuck in orbiting countdown camera. `MSG.round` handler now explicitly calls `endCinematicCountdown()` on phase transition to "running".
- Grocery Spill Crash Protection: Added defensive fallbacks for `msg.vel`, `msg.pos`, and `msg.quat` in `MSG.spill` handler. `triggerSpill()` inputs are sanitized before applying Rapier velocities.

**4. Codebase Hygiene & Bundle Optimization** — Verified.
- Knip Audit Cleanup: Removed orphaned `customizationStore.js` relic. De-exported 12 unused internal animation functions and dead `PERSONALITY_PROFILES` export. Guarded `disposeComposer` utility to prevent future WebGL VRAM leaks.
- Zero Type Suppressions: **[Corrected July 4, 2026]** The earlier July 4 claim of zero typecheck errors was recorded prior to running `npx tsc --noEmit` across all JavaScript files, which yielded ~90 errors under `tsconfig.json`'s `checkJs: true`. A systematic type resolution pass updated `src/globals.d.ts` declarations, fixed JSDoc parameter/return signatures across 15 core source modules, removed stale `@ts-expect-error` comments, and resolved all type mismatches. As of July 4, 2026, `npx tsc --noEmit` passes cleanly with **0 errors (exit code 0)** across the entire repository.

### July 4, 2026 – Customization Polish & Netcode Math Hardening
**1. Customization System Performance & Cleanup** — Verified.
- Slider Debouncing: Custom hue slider now delivers real-time visual feedback (3D paint, SVG, CSS vars) on every input event. Expensive `saveCustomization()` localStorage write is deferred until the `change` event (mouse/touch release), eliminating write thrashing.
- Dead Code Removal: Removed legacy `customHex` fallback block from `normalizeCustomization()` in customization.js while preserving backward compatibility in the stored payload.
- Scope Discipline: Identified and fully reverted an over-engineered "Pattern Selection UI" feature. Customization menu remains strictly focused on the intended player options with no unused UI clutter.

**2. Netcode Math Hardening & Test Coverage (Phase 4 Prep)** — Verified.
- Test Infrastructure: Expanded `tests/netcode.test.js` with 5 new extreme edge-case tests (total now 21/21 passing).
- Buffer Flood Simulation: Verified that receiving 15 out-of-order or duplicate snapshots in a single frame does not produce NaN/negative interpolation deltas, and that `pruneConsumedSnapshots()` correctly bounds the buffer to `stateBufferMaxSize` (64).
- Clock Drift Resync Verification: Simulated 500ms drift over 30 seconds. Confirmed the 3-sample median calculation correctly applies the 20% blend, arresting drift without aggressive timeline snapping.
- Test Seams: Exposed minimal test-only hooks (`pruneConsumedSnapshots`, `updateServerClockOffset`, etc.) under `__netcodeTestHooks` in `src/netcode.js` for headless math validation without requiring a live WebSocket.

### July 4, 2026 – Phase 3 Major Systems: Zanzibar, Netcode Hardening & Tooling
**1. Level 3: Zanzibar Platform (New Arena)** — Verified.
- Fully floating octagonal steel sundeck arena built with strict convex hull colliders only (no trimeshes). Added 8 cylindrical corner bollards and a central drivable podium.
- Custom `aiHazards` model with octagonal bounds and circular keep-outs, fully decoupling Zanzibar AI from Classic Record logic.
- Dynamic sunset seascape (sky dome, water plane, animated sun-path glint, island silhouettes). Fog color matched to horizon.
- Zanzibar level select button + dynamic level cycling in post-round UI. Custom animated sunset loading screen with bespoke CSS.
- `contactShadows.js` enhanced to calculate octagonal bounds up to circumradius so shadows do not bleed into water at corners.

**2. Netcode & Server Hardening (Phase 4 Prep)** — Verified.
- Yaw-only reconciliation solved "suspension pop": client prediction now only corrects heading during normal driving. Full slerp fallback only when genuinely flipped (up-vector dot < 0.6). Local physics owns pitch/roll.
- Server validation hardened in `hostEventFall` handler: strict integer validation for slotId/attackerSlot (0–3) + clamping/sanitization of comboTier and comboMultiplier.
- Clock drift resync: 3-sample median re-bootstrap every 30s, blended 20% into running offset.
- Nitro edge detection: input send loop now fires immediately on press and release (fixes phantom charge from heartbeat delay).
- Memory/state hygiene: `pruneConsumedSnapshots()` helper extracted. Snapshot target lockstep enforced after host migration. Dead `reconcileSlotSnapshots` code removed.

**3. Engine & Core Stability** — Verified.
- WebGL memory leak fixed: Reflector material properly torn down in `arena.js`. `window.recordMesh` references cleared on cleanup. Stale `menuEntranceTimeoutId` cleared on quit-to-menu.
- Physics debug geometry in `arena.js` now lazily allocated (only when `config.debug.arenaTrimesh === true`).
- Stricter type safety: replaced lazy `any` casts and `child.isMesh` checks with proper `instanceof` guards in `simulation.js`, `input.js`, and `groceryPool.js`.

**4. Testing & Tooling Infrastructure** — Verified.
- Created Vitest Rapier stub (2-line) + Vite alias to bypass WASM resolution in Node test environment.
- New test suite `tests/netcode.test.js` with 16 tests (5 describe blocks) running headless via happy-dom. Covers buffer pruning, interpolation, yaw-only reconcile math, and NPC slot declashing (currently 19/19 passing).
- Gamepad listeners wrapped in `typeof window !== "undefined"` guards for full test-environment compatibility.

### July 3, 2026 – Phase 2 Closure, Typography Rebrand & Progression Foundations
1. Typography Rebrand & UI Polish — Verified. Completely replaced the game's font stack for a cohesive arcade aesthetic.

* Fonts: "Road Rage" for mega-titles/announcers, "Russo One" for UI headers/buttons, "Goldman" for mono/body text, "Michroma" for the HUD clock/timer, and "Space Grotesk" for labels.

* Rebrand: Main menu title changed from "CART RAVE" to "CART CLASH". Title font-size increased by ~44% with widened letter-spacing.

* Color Gating: Color/pattern chip clicks and custom hue inputs are now blocked during "countdown" and "running" phases.

2. Rampage Combo System — Verified. Implemented a host-authoritative combo multiplier system to reward aggressive, chained attacks.

* Tiers: 3 escalating tiers (1.5x RAMPAGE, 2.0x SAVAGE, 3.0x CARNAGE) with a 5-second decay timer. Falling off the arena instantly resets the combo.

* Integration: Multiplier applied in calculateFallScore(). Attacker combo state tracked on the cart entity to avoid GC churn. Local prediction sim updates the Zustand gameStore instantly for zero-latency HUD feedback.

* Netcode: Combo tier and multiplier synced to non-host clients via MSG.hostEventFall payload for killfeed annotations (e.g., RAMMED [2.0x SAVAGE]).

3. End-Screen Polish & Personal Bests — Verified.

* Cinematic Podium: Added CameraMode.CINEMATIC_PODIUM that executes a low-angle (1.8m height, 6m radius) victory lap orbit around the winning cart.

* Quick Rematch: Results screen "Play Again" button renamed to "REMATCH". Added "NEXT LEVEL" button which toggles selectedLevelId (classicRecord ↔ backrooms) and restarts the match.

* Personal Bests: Local player's highest score tracked in localStorage (cartRaveBestScore). "NEW PB!" neon badge dynamically injected into the results scoreboard.

4. Daily/Weekly Challenges & NPC Badges — Verified. Laid the foundation for the Phase 3 progression system.

* Challenge Tracker: Created src/stores/challengeStore.js (vanilla Zustand + localStorage). Tracks 10 distinct challenges (spills, KOs, combos, wins) with 24h daily and 7d weekly rotation.

* UI: Main menu "Challenges" panel added with reactive progress bars driven by the store. Spill attribution correctly hooked to the attacker in simulation.js rather than the victim.

* Personality Badges: NPC AI personalities are now visible to the player. Colored letter badges appended to 3D floating name tags and the HUD scoreboard: [A] Aggressor (Red), [L] Lurker (Purple), [S] Scavenger (Green), [C] Chaotic (Orange).

* Color De-clash: Added declashNpcSlotColors() in netcode.js to automatically re-roll NPC colors if they clash with human players in the lobby.

### July 3, 2026 – Deep Audit Resolution, Zustand Architecture & UI/Input Overhaul
1. Spilling VFX & Netcode Audit Resolution — Verified. A comprehensive static audit identified five critical runtime bugs in the newly implemented Spilling Cart VFX. All were surgically resolved:

* Collision Group Semantics: Groceries were physically shoving authoritative cart physics due to mismatched Rapier collision masks. Fixed by assigning carts to CART_COLLISION_GROUPS = (0x0001 << 16) | 0xFFFFFFFD and groceries to (0x0002 << 16) | 0xFFFFFFFE. Carts and groceries now cleanly ignore each other while groceries still collide with the floor and each other.

* Spill Echo Double-Fire & Cargo Bay Desync: In multiplayer, the host received its own MSG.spill echo (double-firing VFX for NPCs), and remote clients never hid the cargoBay because the server stripped the flag. Fixed by updating #broadcastJson in party/index.ts to accept a without parameter (excluding the sender) and explicitly passing cargoBay in the relay payload.

* Grocery Visual/Collider Misalignment: Hardcoded collider half-extents caused items to visually sink into the floor. Fixed by recomputing the bounding box after uniform scaling and dynamically generating primitive collider descriptors (Cuboid, Cylinder, Ball) from the normalized geometry's actual half-extents.

* Fall-Elimination VFX Voiding: Spill triggers fired deep in the pit (y < -10), making VFX invisible. Fixed by clamping the spill y position to 0.5 (arena floor) and zeroing out the inherited downward Y-velocity so debris doesn't immediately fall back into the void.

* Texture VRAM Leak: material.dispose() does not cascade to textures. Updated groceryPool.js dispose() to explicitly iterate material properties and call .dispose() on any isTexture references.

* Explosion Y-Clamp Revert: The fall-elimination Y-clamp was initially applied to cartShatter.js, causing explosions to pop at the arena surface while the cart fell into the pit. Reverted the clamp in cartShatter.js so the explosion correctly originates at the cart's exact death position.

2. Zustand Store Migration & Type Safety — Verified. Migrated scattered module-level mutable variables and inline localStorage reads into a centralized, reactive vanilla Zustand store architecture.

* New Stores: Created audioStore.js, customizationStore.js, gameStore.js, and settingsStore.js.

* Single Source of Truth: audioManager.js, gameState.js, main.js, utils.js, levelManager.js, and cartTuningStore.js were refactored to delegate to these stores.

* Tweakpane Compatibility: Redesigned cartTuningStore.js to use a mutable proxy object for high-frequency Tweakpane reads/writes, preventing Zustand immutability contract violations.

* Type Safety: Updated GameFlowDeps JSDoc typedefs to perfectly match the getRoundState() return shape. TypeScript baseline error count dropped from 221 to 208 (0 errors in new store files).

3. Boot Splash Visual Overhaul — Verified. Completely rewrote the initial boot splash animation.

* Replaced DOM divs with inline SVG shopping carts (pink + cyan) featuring knobby wheels, shades, and baskets.

* Implemented a 4-phase master timeline (anticipation → charge → impact → recoil) driven entirely by a single --boot-loop CSS variable.

* Added prefers-reduced-motion static tableau fallback for accessibility.

* Updated preconnect URL to the correct Cloudflare workers.dev domain.

4. Animation System & UI Refactor — Verified.

* Eager-loaded animations.js across all consumers to eliminate Vite dual-import warnings. Added SPRING_BOUNCE/SPRING_SNAP presets and wireHoverFeedback for desktop micro-interactions.

* Refactored resultsOverlay.js to replace setTimeout chains with declarative createTimeline() sequencing.

* Boot splash dismissInitialBootSplash() now guards against double-dismiss, clears message timers, and forces progress bar to 100% with ARIA updates before fading.

5. Input System: Multi-Mode Controls & Gamepad Polish — Verified.

* Dynamic Controls Panel: updateControlsPanelUI() now renders 3 distinct layouts (Keyboard, Gamepad, Touch) into #cr-controls based on active input mode.

* Analog Steering: Replaced per-axis deadzones with a true smooth radial deadzone (0.15) rescaled to [0,1], eliminating diagonal speedup bugs.

* Mapping Fixes: Corrected Boost to LT/A and Hop to RT/B.

* Ghost Input Prevention: setUiMode(false) now snapshot all button states to prevent ghost rising-edge callbacks when exiting menus.

6. Quality & Lifecycle Robustness — Verified.

* Concurrency Guard: Added qualityRebuildInProgress mutex in main.js to prevent race conditions from rapid UI quality-toggle clicks.

* FBO Sync: applyComposerQualityMode() now accepts the composer and calls composer.setSize() on pixel ratio changes, preventing stretched post-processing framebuffers.

* Auto-Detection: Integrated touch-device and prefers-reduced-motion heuristics directly into settingsStore.js for robust default low-quality detection.

7. NPC AI Personality Profiles & Tactics — Verified.

* Implemented 4 distinct AI behavior profiles (Aggressor, Lurker, Scavenger, Chaotic) mapped to all 43 NPC names via npcNames.js.

* AI now evaluates targets using profile-based weights (Human Chase vs. Patrol vs. Wander).

* Added score rubberbanding (leader appears 35% closer, trailing player 30% farther) and Sudden Death bloodhound overrides (human chase weight floors at 0.88).

* Added Backrooms square-hole safety gate for NPC ram boosts (aborts if trajectory crosses a corner void).

* Reverted: Experimental grocery collection mechanic was rolled back to keep groceries purely cosmetic, avoiding GC churn and multiplayer visual desync.

8. Backrooms Level Polish — Verified.

* Fixed a memory leak/crash vector where dispose() reassigning a local spotlightUpdateFn variable didn't update the returned object property. The update property now delegates via a wrapper function.

* Fixed non-deterministic shelf layout: Replaced Math.random() with a deterministic hash ((lvl * 7 + Math.round(a) * 13 + side * 41) % 10) < 3 so all multiplayer clients render identical half-empty shelves.

### July 2, 2026 – Audit Sweep Resolution & Phase 2 VFX Launch
1. Critical Audit Findings Resolved (Findings #1–#8) — Verified.

* Critical Netcode Transport (#1): Fixed the reversed onMessage parameter order in party/index.ts. The signature now correctly matches the partyserver base class: onMessage(connection, message). Removed the mechanical @ts-expect-error that originally silenced the compiler and masked this bug. All prior netcode fixes are now reachable at runtime, pending the two-browser smoke test.

* Error Forwarder Endpoint (#2): Added a /api/log-error route to the Worker's fetch handler in party/index.ts, executing before routePartykitRequest. The endpoint parses the JSON payload, console.logs it for Wrangler tail visibility, and returns a 204 No Content.

* Restored Rapier WASM Deferral (#3): Reverted the eager top-level await load. Created src/physics/rapierInstance.js as a shared singleton that dynamically import()s @dimforge/rapier3d only when initRapier() is called. Updated all 7 files that previously had static top-level imports. Boot critical path is clean again; ES2022 TLA requirement reverted.

* Live Graphics Toggles (#4): Main menu Post-FX and Low Quality buttons now apply instantly to the running scene via window.__cartRave_toggle* bridges in main.js, triggering the live setters and rebuildForQualityChange() instead of just writing to localStorage.

* Podium Gamepad Navigation (#5): The per-frame isUiActive check in main.js now includes GameState.getRoundState().phase === "podium". setGamepadNavActive(true) is now properly called during the results screen, allowing gamepad users to focus and click the "Play Again" button.

* Boot Splash Slow-Connection Guard (#6): Added window.__cartRaveMainReady flag. The 3.5s setTimeout fallback in index.html now checks this flag. If the main bundle hasn't finished executing, the splash persists and updates the status text to "Taking longer than expected..." instead of revealing a disabled menu.

* TS Suppression Cleanup (#7): Removed the misapplied @ts-expect-error in effects.js (config read, not THREE access). Fixed gamepadNav.js by casting querySelectorAll results to HTMLElement[] and casting document.activeElement before .click(), removing the need for suppressions.

* VFX & UI Nits (#8): Fixed dust particle first-frame scale snap in effects.js (spawn scale now factors in the 0.5x dust multiplier). Fixed _resizeTo in cartPreview.js to call frameCartInCamera after updating the aspect ratio, preventing the cart from cropping on mid-customize viewport resizes.

2. Spilling Cart Contents VFX (Phase 2) — Verified. Implemented a fully client-side, netcode-safe cosmetic physics system for spilling groceries.

* Pooling & Rendering: Pre-allocates 64 Rapier rigidbodies across 6 separate THREE.InstancedMesh pools (11 slots each) for 6 custom low-poly GLTF models (milk, cereal, soda, soup, orange, baguette). 6 draw calls total. frustumCulled = false to prevent disappearing groceries. Scratch Matrix4/Vector3 objects used in the physics loop to eliminate GC churn.

* Colliders: Strictly primitive Rapier colliders (Cuboids, Cylinders, Ball) matched to visual silhouettes. Collision groups filter out carts (Group 1) to prevent driving on spilled items.

* Netcode: Server broadcasts a single MSG.spill event. Each client simulates the chaos independently. Host asserts slotId and basic payload validity before relaying.

* Visual Lifecycle: A cargoBay group is parented to the cart mesh, populated with 6 random grocery meshes, perfectly scaled and constrained to sit inside the basket (visualOffset + 0.1). cargoBay.visible is toggled off on spill and restored on respawn.

* Triggers: Spills occur on high-impulse ram impacts (> 50 magnitude), continuous tip-overs (upDot < 0.3 for > 500ms), and pit fall-eliminations. Spill origin captures the cart's world translation + rotation + velocity, inheriting 80% of cart velocity plus a random scatter.

* Cleanup & Memory: 10-second lifetime with a 1.5s scale-fade. Items are immediately faded out if the owning cart respawns (releaseByCartId). loadedGeometries and loadedMaterials arrays (cloned from GLTF) are explicitly disposed in dispose() alongside the InstancedMeshes and Rapier bodies, preventing memory leaks across level swaps.

### July 2, 2026 – Audit Findings Resolution & Phase 1 Closure
**1. Critical Netcode Transport Fix (Finding #1)** — Verified. Fixed the reversed onMessage parameter order in party/index.ts. The signature now correctly matches the partyserver base class: onMessage(connection: Connection, message: WSMessage). Removed the mechanical @ts-expect-error that originally silenced the compiler and masked this bug. All internal references (rate limiter, reaper, JSON parsing) updated to use the correct parameter. All prior netcode fixes are now reachable at runtime, pending the two-browser smoke test.

**2. Error Forwarder Endpoint (Finding #2)** — Verified. Added a /api/log-error route to the Worker's fetch handler in party/index.ts, executing before routePartykitRequest. The endpoint parses the JSON payload, console.logs it for Wrangler tail visibility, and returns a 204 No Content. The client-side forwarder is now fully end-to-end.

**3. Restored Rapier WASM Deferral (Finding #3)** — Verified. Reverted the eager top-level await load. Created src/physics/rapierInstance.js as a shared singleton that dynamically import()s @dimforge/rapier3d only when initRapier() is called. Updated all 7 files that previously had static top-level imports to use this shared instance. ensureRapierPhysics in main.js now awaits this import before constructing the World. Boot critical path is clean again; ES2022 TLA requirement reverted.

**4. Live Graphics Toggles (Finding #4)** — Verified. Main menu Post-FX and Low Quality buttons now apply instantly to the running scene. Added window.__cartRave_togglePostFx and window.__cartRave_toggleLowQuality bridges in main.js. cart-rave-menu.js calls these live setters instead of just writing to localStorage and updating labels.

**5. Podium Gamepad Navigation (Finding #5)** — Verified. The per-frame isUiActive check in main.js now includes GameState.getRoundState().phase === "podium". setGamepadNavActive(true) is now properly called during the results screen, allowing gamepad users to focus and click the "Play Again" button.

**6. Boot Splash Slow-Connection Guard (Finding #6)** — Verified. Added window.__cartRaveMainReady flag. The 3.5s setTimeout fallback in index.html now checks this flag. If the main bundle hasn't finished executing, the splash persists and updates the status text to "Taking longer than expected..." instead of revealing a disabled menu. main.js sets the flag to true at the end of its execution.

**7. Mechanical TS Suppression Cleanup (Finding #7)** — Verified partial. Removed the misapplied @ts-expect-error in effects.js (config read, not THREE access). Fixed gamepadNav.js by casting querySelectorAll results to HTMLElement[] and casting document.activeElement before .click(), removing the need for suppressions. The remaining ~115 blanket suppressions in cartRaveGltf.js are logged as tech debt to burn down opportunistically.

**8. VFX & UI Nits (Finding #8)** — Verified. Fixed dust particle first-frame scale snap in effects.js (spawn scale now factors in the 0.5x dust multiplier). Fixed _resizeTo in cartPreview.js to call frameCartInCamera after updating the aspect ratio, preventing the cart from cropping on mid-customize viewport resizes.

### July 2, 2026 – Architectural Safety Nets & Perf Spike
**1. Shared MSG Protocol** — Verified. Duplicated MSG constants extracted from `src/config.js` and `party/index.ts` into `shared/protocol.js`, re-exported from config.js. Single source of truth; the class of drift that killed host transforms (MSG.state vs host_transform) is structurally closed.

**2. TypeScript checkJs Baseline** — Verified with a major caveat. `tsconfig.json` with checkJs, `typecheck` script, `@types/three`, `globals.d.ts`. Baseline: exactly 210 errors. Real bugs caught and fixed: missing `createCart` export, dead `reapplyRaveGltfCartTuning` call, erroneous `readonly ["rave"]` JSDoc. **[Corrected]:** The pass also added 118 `@ts-expect-error` suppressions. One of them (party/index.ts:957) silenced the compiler error exposing the `onMessage` parameter swap — the single most important thing the type checker found. See open finding #1/#7 (now resolved).

**3. Vitest Unit Testing** — Verified. `tests/gameState.test.js`, 3 passing tests on `pickTimerWinner`. Pipeline ready for pure-logic regression tests (`validateHostRound`, pendingRam math, `sanitizeScores` are natural next targets).

**4. Production Error Forwarder** — **[Corrected]: client-side only.** `src/utils/errorReporter.js` (sendBeacon + keepalive fetch) wired into the gameLoop catch and index.html boot listeners — all verified. But no `/api/log-error` route exists in the Worker; `routePartykitRequest` returns null for the path. No payload has anywhere to land. **Resolved July 2** (see above).

**5. Rapier WASM Standard Package Spike** — Numbers corrected. Swapped `@dimforge/rapier3d-compat` → `@dimforge/rapier3d` with `vite-plugin-wasm`. WASM now a separate 1,570 kB file (587 kB gzip); rapier JS chunk shrank 2,235 kB → 180 kB. Rapier payload gzip: ~830 kB → ~617 kB (the original log's "total gzipped footprint" figure described this payload, not the total; actual total shipped gzip is ~956 kB, down from ~1,195 kB). **[Corrected]:** This change removed the June 30 "Defer Rapier WASM Loading" feature — WASM now loads via top-level await at module evaluation, on the boot critical path. Also raises the browser floor to ES2022 (top-level await). **Resolved July 2** by restoring deferral via dynamic import (see above).

### July 2, 2026 – Phase 1 Medium Polish & Customization Audit
**1. Customization Code Audit & Preview Fixes** — Verified. Camera framing decoupled from `_resizeTo()`; `setAutoRotate()` freezes the cart facing the player on the Sunglasses tab (actual angle: `Math.PI + 0.37`, not the "π − 0.2" originally logged); color-revert fixed (redundant `customization-changed` rebuild removed, `_applyNeonColor()` forced post-await); mirror finish roughness 0.02 + envMapIntensity 1.5 across all six styles; zoom now camera-distance based (÷1.35); 3x2 grid compaction. Residual (finding #8, now resolved): `_resizeTo` no longer reframes at all, so a mid-customize viewport resize can crop the cart until the next tab switch.

**2. Wheel Audio Removal** — Verified complete, zero dangling references (~115 lines across audioManager.js, frameVisuals.js, main.js, postFxDebug.js). **[Corrected — naming]:** What was removed is the *wheel loop* (the "Dynamic wheel audio (volume + pitch based on speed)" feature shipped June 30), not a separate "screech" subsystem. The June 30 entry below is annotated accordingly.

**3. Main Menu Graphics Toggles** — **[Corrected]: partial.** Buttons exist, share the Esc menu's localStorage keys (`cartRaveBloom`, `cartRaveFx`, `cartRaveLowQuality`), and persist correctly — but they don't apply to the running session. Post-FX never touches the live variables; LQ skips the Esc path's `rebuildForQualityChange()`. **Resolved July 2** (see above).

**4. Mid-Round Customization Gating** — Verified. Phase guard in `openCustomizeScreen()` (running/countdown), `cartrave:round-started` dispatched from main.js and auto-closes the overlay.

### July 2, 2026 – Audit Regressions & Sweep Fixes (7 findings)
All seven verified fixed:
- **Gamepad main-menu navigation** — `setGamepadNavActive` hooked into `initMenu()` / `commitMenuHiddenForGame()` (and `returnToMenu()` re-runs initMenu, so all return paths re-enable nav); `_navActive` defaults true. **[Residual]:** the podium/results screen is a third state neither hook covers — gamepad can't reach Play Again. **Resolved July 2** (see above).
- **Boot splash minimum duration** — DOMContentLoaded shed converted to a 3,500 ms setTimeout; `dismissInitialBootSplash` reliably wins on normal connections. **[Residual]:** the fallback fires unconditionally, so slow connections shed the splash mid-download. **Resolved July 2** (see above).
- **Round timer/countdown clock-drift fix** — `adjustedNow()` applies `serverClockOffsetMs` (median-of-3, sign verified: `sample = local − host`, so `Date.now() − offset` lands in the host's clock domain; degrades to `Date.now()` for host/solo). Code-correct; runtime-unverified behind finding #1 (now resolved).
- **Camera ray GC churn** — module-level cached `RAPIER.Ray`, origin/dir mutated in place.
- **Shared material disposal** — `userData.isSharedMaterial` tags on the three module-level cart materials; `cleanupShatter` skips them.
- **Trash particle sizing/freeze** — spawn-time `baseScale` preserved, mangled `(0.5 + 0.5)` ternary fixed, podium freeze replaced with 3× lifetime acceleration. Residual: dust half-size snap on first update frame (finding #8, now resolved).
- **Boost pulse scale ratchet** — pulses read `mesh.userData.baseScale`, captured at mesh creation and shatter rebuild (rebuild capture traced safe: 220 ms pulse always settles before the 1,000 ms respawn).

### July 1, 2026 – Phase 1 High Priority Clearance, Physics Overhaul, UI Rebrand, Audit Resolution, Gamepad Support
**1. Physics & Collision Overhaul** — Verified (seam math and cuboid coverage independently checked).
- Classic Record: 72-segment trimesh ring → 16 convexHull compound, exact edge-to-edge trapezoidal vertex math (zero overlaps/gaps).
- Backrooms: 5,776-polygon grid trimesh → 9-cuboid slice compound with exact void mapping for the 4 corner holes.
- Visual alignment: visualOffset 0.82, visualRecordY −0.42.

**2. UI / UX & "Cart Clash" Rebrand** — HUD overlap fix (alerts to 20vh); boot splash cart-smash animation; 20-segment Neon Tube loading bar; rotating level-specific messages; storerooms junk-pile visual; inline-script boot init.

**3. Audio State Management** — Mute persistence fixed (removed `_isMuted` block-gates in music playback; tracks play at volume 0 when muted).

**4. Gamepad / Steam Deck Support** — Driving inputs (stick + D-Pad, RT/A boost, LT/B hop) merged with keyboard/touch; gamepadNav roving tabindex; setUiMode gating. **[Corrected]:** the initial implementation shipped with inverted steering, no gameplay gate on nav (A-button clicked HUD elements mid-round), and Start unable to close the Esc overlay — all found by audit and fixed in the July 2 fix pass, which itself left main-menu nav dead until the third pass. "Fully functional" was not true until July 2, and the podium screen is still uncovered (finding #5, now resolved).

**5. Codebase Hygiene & Audit Resolution** — Two Knip passes (31 dead exports / 8 files). Audit sweep resolving 20 findings: SD spectator crash (CameraMod prefix), hole-assist radius, screen shake, FOV framing, host transform message type, SD server timeout, round duration 150s, remote boost, slot resurrection, SD sync, ram FX dedup, pendingRam math (fresh + merge), camera occlusion origin, mobile 4003 unblock, lastStanding draw override, reaper socket close, hello scores, dead config, boot splash CSS conflicts, rAF re-arm in the loop catch, cartPreview doubling guard. **[Corrected]:** "All 20 findings closed" held for the solo-side fixes; the July 2 regression audit found 2 regressions (gamepad menu nav, boot splash bypass) plus the incomplete FOV-punch interplay, all fixed July 2. All netcode-side fixes in this list remain runtime-unverified behind open finding #1 (now resolved).

### July 1, 2026 – Physics Overhaul + Polish Session (Prior Pass)
- Record: 16 convex hull colliders. Backrooms: 9 cuboid primitives. Wheel clipping fixed (visualOffset 0.82, visualRecordY −0.42).
- HUD overlap fix (20vh); music mute persistence fix.
- Knip: 27 unused exports removed across 8 files. Clean zero-warning build + Cloudflare deploy.

### June 30, 2026
**Infrastructure & Deployment** — Migrated PartyKit → raw partyserver on Cloudflare free tier. V2 live at cart-rave.wyabro.workers.dev. **[Corrected]:** the migration carried PartyKit's `onMessage(message, connection)` signature into partyserver, which dispatches `(connection, message)`. Inbound message handling has been non-functional since this date (finding #1, now resolved). Server→client (connect, hello, slot assignment) works, which masked the break.

**Match Pacing & Sudden Death** — 2.5-minute rounds; Sudden Death (first score wins on tie); multi-way tie support + spectator mode.

**Death & Respawn Polish** — Cinematic death camera with momentum carry; 1,000 ms respawn.

**Audio Tightening Pass** — Dynamic wheel audio (volume + pitch by speed) **[removed July 2 — see Wheel Audio Removal]**; charge-up SFX scaling; countdown SFX; menu music autoplay race fix.

**Mobile Performance & Low Quality Mode** — Auto low-quality mode; WASM crash fix (no mid-match Rapier world destroy); dynamic physics substeps.

**Defer Rapier WASM Loading** — deferred `RAPIER.init()` to first play. **[Removed July 2 by the @dimforge/rapier3d swap — resolved July 2 by restoring via dynamic import.]**

**Phase 2 work** — lobby/ready-up stabilization, non-host lifecycle edges, client prediction, caster/fork visual polish (partial), lag mitigation. **[All netcode items runtime-unverified behind finding #1 (now resolved).]**

**NPC AI Behavior Overhaul** — 80% hunting cycles, predictive ramming, improved nitro logic + suicide prevention, spawn lock + Backrooms pathing.

**Physics & Collision Fixes** — CCD on RigidBodyDesc; spawn booth friction; deeper Classic Record void (−30); position-based stuck-cart respawn.

**Other Polish** — Charge Boost early release + burst power; FFmpeg loudness normalization; entity/state cleanup.

### June 29, 2026
**Engine & Performance** — WebGL memory leaks patched; GC micro-stutter eliminated (Rapier scratch cache); arcade feel improvements.

**V2 Architecture** — GLB cart compressed (Draco + WebP); themed carts removed; Sunglasses + Mirror Finish customization.

**Gameplay** — Auto-Charge Boost; Cinematic Countdown Camera; Cart Shatter + Explosion Death VFX.