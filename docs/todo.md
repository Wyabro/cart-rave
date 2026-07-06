# Cart Rave — Todo & Historical Record

**Last Updated:** July 6, 2026

> **Forward-looking work** is tracked in [ROADMAP.md](./ROADMAP.md).  
> This file preserves phase history, shipped features, and current status.

---

## Current Status

- **Core Game**: Fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction
- **Physics & Feel**: Major stability overhaul complete. Floor bounciness and wheel clipping on trimesh colliders fully resolved by switching to mathematically precise convex hull + primitive colliders on Record, Backrooms, and Zanzibar levels. Mobile performance significantly improved.
- **Current Phase**: Phase 4 — Multiplayer & Infrastructure (active); Phase 3 content is complete
- **Recent Technical Work**: Binary serialization for host state snapshots (hybrid ArrayBuffer + JSON tail, 52 bytes/cart replacing full JSON) + input sampling moved from setInterval to physics loop (zero-latency client prediction input capture) + server reaper fix (new connections no longer instantly reaped) + server spill relay removed (now fully P2P) + determinisic physics timestamps (all substeps share the same `now` preventing ram check drift) + client-side prediction rewrite (rewind-and-replay replacing soft reconciliation) + empty slot cart body fix (all 4 slots always exist in Rapier, hidden/disabled for empty) + scene update clock sync + monotonic clock adoption + host fall event batching + pending input buffer with ackSeq pruning + WebRTC DataChannel `ordered: false, maxRetransmits: 0` + WebRTC P2P DataChannel migration + Cloudflare Calls TURN credential minting + server reduced to signaling relay + defensive null guards + Backrooms `roundCuboid` fix + mid-round join cart teleport + cargoBay visibility sync + booth snap at countdown + non-host death shatter fix + rate limit exemption + combo decay race fix + grocery spill queue + server level sync + slot kind fix + results UI cleanup + 100% typecheck compliance pass + raw partyserver / Wrangler migration + Zanzibar sunset seascape + camera framing & viewport extraction + menu stats extraction + web font fix + self-death verb variety + results overlay responsive sizing + TEST DRIVE removal + mobile responsive CSS fixes
- **Modular Structure**: Core systems live in `src/`; `main.js` remains the thin orchestrator

---

## Active Work

Prioritized Phase 3 and Version 2 work is maintained in **[ROADMAP.md](./ROADMAP.md)** (Tier 1 through Tier 4).

**Quick snapshot of open Phase 3 items:**
- More cart customization options
- Spectator mode / chaos features (stretch)

---

## Library Adoption (Version 2)

Intentional stack improvements — full priorities and effort estimates in [ROADMAP.md](./ROADMAP.md) (Tier 1 and Tier 3).

| Library | Tier | Purpose |
|---------|------|---------|
| `nipplejs` | 1 | Virtual joystick for touch/mobile controls |
| `tweakpane` | 1 | Modern replacement for `lil-gui` |
| `zustand` | 1 | Lightweight state management (reduce global state coupling) |
| `howler.js` | 3 | Spatial audio, pooling, and volume/group management |

---

## Phase History

### Phase 2 — Polish & Balance ✅ Completed
- NPC AI improvement
- Ramming force & boosted ramming tuning
- Collision feedback (particles, screen shake)
- Boost streaks and audio polish
- Hole rim behavior (smooth tipping/sliding)
- Final boost/nitro balance pass

### Phase 3 — Content & Features ✅ Completed
- ✅ Backrooms Supermarket level shipped
- ✅ Touch controls support (joystick + Boost/Hop via nipplejs)
- ✅ Daily/Weekly Challenges system shipped
- ✅ Level 3: Zanzibar Platform (sunset ocean arena) shipped
- More cart customization options *(Planned)*
- Spectator mode / chaos features *(Stretch)*

### Phase 4 — Netcode & Technical Polish
See [ROADMAP.md](./ROADMAP.md) Tier 3 for current priorities (client prediction, lag mitigation, rave area redesign, audio upgrade, etc.).

### Phase 5 — Release Prep (Version 2)
See [ROADMAP.md](./ROADMAP.md) Tier 4 for release priorities, including:
- Menu overhaul + new name/domain
- Performance optimization pass
- Pre-submission checklist

---

## Completed / Shipped (Historical Record)

### July 6, 2026 – Binary Host State Serialization, Input Loop Refactor & Server Fixes

**1. Binary Host State Serialization (`src/netcode/binary.js` — new module)** — Verified.
- Introduced hybrid binary encoding for the `hostTransform` payload, the highest-frequency message in the game (~20Hz × 4 carts).
- Per-cart data packed into a fixed 52-byte layout: position (3×float32), quaternion (4×float32), linear velocity (3×float32), angular velocity X + ackSeq (2×float32), and 1 byte of bit-packed flags (boost, hop, cargoBay, hasSpilled) with 3 bytes padding.
- 12-byte header: `[unused, numCarts, padding×2, seq:uint32, tHost:float32]`.
- JSON tail appended for sparse data (collisions array, falls array) — decoded separately and merged into the final state object.
- `decodeHostStateSnapshot` reconstructs the exact same object shape (`{ type, seq, tHost, carts, collisions, falls }`) that the JSON path previously produced, making this a drop-in replacement. Host send loop now calls `encodeHostStateSnapshot` and sends the raw `ArrayBuffer`.
- Round-trip test added to `tests/netcode.test.js` with 2 carts, collisions, and falls verifying float32 precision and flag bitmask correctness.
- **Bandwidth reduction**: A typical 4-cart snapshot drops from ~600–800 bytes of JSON to ~220 bytes (header + 4×52 + JSON tail), and skips JSON parse/stringify overhead on both sides.

**2. Input Sampling Moved to Physics Loop (`src/netcode.js`, `src/gameLoop.js`, `src/main.js`)** — Verified.
- `startInputSendLoop()` (setInterval-based, 60Hz) is now a no-op. Input capture moved to synchronous `sampleLocalInputForTick()`.
- On each physics substep, the non-host client calls `sampleLocalInputForTick()` which captures the current axis state, assigns an `inputSeq`, timestamps with `tClient`, pushes to `pendingInputs`, sends to the host via P2P, and returns the input frame to the physics loop for immediate client prediction.
- This eliminates the ~50ms average latency of the old setInterval approach (timer fires independently of physics timing). Client-side prediction now uses the exact input that was active during the substep, not a stale buffer.
- `main()` now passes `netcode: Netcode` through the game loop deps so `runPhysicsStep` can call `sampleLocalInputForTick()` directly.
- All substep `now` values incremented deterministically (`stepNow += fixedTimeStep * 1000`) instead of calling `performance.now()` per substep.
- Reconciliation replay now uses `input.tClient` (the recording timestamp) for `now` instead of the wall-clock `performance.now()`, preserving temporal fidelity.

**3. Server Fixes (`party/index.ts`)** — Verified.
- **Reaper `lastSeen` default**: Changed `#lastSeenAtMs.get(id) ?? now` to `?? 0`. New connections whose timestamp write hadn't yet propagated to `#lastSeenAtMs` were defaulting to `now`, causing them to be instantly reaped on the first reaper tick.
- **Host migration message type**: `MSG.hostAssigned` → `MSG.hostMigrated` on the migration broadcast so clients use the correct handler (tears down P2P, reconnects to new host).
- **Spill relay removed**: `MSG.spill` handler deleted from server — spills are now fully P2P via `sendP2PEvent()`. Removed ~20 lines of validation + broadcast.

**4. Deterministic Physics Timestamps (`src/simulation.js`)** — Verified.
- `applyRammingImpulse` and `processCollisionEvents` now receive `nowMs` from the physics step's deterministic clock instead of calling `performance.now()` inline. This prevents drift between the `isRamBoosting` check and the `lastRamTimeMs` stamp when substeps run back-to-back.

**5. P2P ArrayBuffer Routing (`src/netcode/p2p.js`)** — Verified.
- `setupDataChannel` `onmessage` now detects `ArrayBuffer` and routes to `onStateCallback` directly (hostTransform binary blobs), bypassing JSON parse. JSON clientInput messages routed as before.
- `sendToPeer` and `sendToAll` detect `ArrayBuffer` and send raw, skipping `JSON.stringify`.

### July 6, 2026 – Empty Slot Cart Body Fix & Visual Sync Clock

**1. Empty Slot Cart Body Fix (`src/entities.js`, `src/main.js`)** — Verified.
- Previously, `initCarts()` skipped creating cart entities for `kind === "empty"` slots, leaving `null` in the all-carts array. This could cause null dereferences in physics and rendering code paths that iterate all 4 slots.
- Now always creates a cart for all 4 slots. Empty slots get `mesh.visible = false` and `body.setEnabled(false)`, keeping Rapier world and Three.js scene consistent without unnecessary performance cost.
- `updateCartMaterialsFromSlots()` in `main.js` now explicitly manages visibility and body enable/disable per slot kind: empty → hidden + disabled, human/npc → visible + enabled.

**2. Scene Update Clock Synchronization (`src/main.js`)** — Verified.
- Visual effects (stage lights, lasers, crowd, stage LED, billboard, booth neon cycle, spindle light color cycle) and level updates were all driven by raw `performance.now()`, causing each client to see effects at slightly different phases.
- All `Effects.update*` calls, `sceneExtras.update`, `levelUpdate`, spindle light cycle, and booth neon cycle now use `syncedNow` — the server-clock-corrected time (`now - serverClockOffsetMs`) — keeping visual phases synchronized across all clients in the host's clock domain.

### July 6, 2026 – Client Prediction Rewrite & Monotonic Clock

**1. Client-Side Prediction Rewrite: Rewind & Replay (`src/gameLoop.js`, `src/netcode.js`, `src/simulation.js`)** — Verified.
- Replaced the old `reconcilePredictedLocalCart` (soft lerp correction toward host authority) with a full rewind-and-replay prediction model in `runPhysicsStep()`.
- On each new authoritative snapshot: hard-snap local cart body to host state → replay all pending inputs through `runFixedPhysicsStep` with disabled side effects (no collision FX, trash bursts, ram impact) → cart ends at locally predicted position, eliminating the soft-correction pop.
- Shatter/respawn edge case handled: if cart is dead (`_shatterState`), forces `doRespawn` + applies snapshot + clears all pending inputs. If `s: true` (host says dead), only prunes ack'd inputs without replay.
- Pending input buffer (`pendingInputs[]`) introduced in `src/netcode.js` with `getPendingInputs()`, `prunePendingInputs(ackSeq)`, and `getLatestSnap()` exports. Inputs accumulate in `startInputSendLoop` and are pruned when the host acknowledges them in the snapshot's `ackSeq`.
- `runFixedPhysicsStep` now accepts an optional `localInputOverride` for replay — feeds pending input data directly bypassing the normal `getAxis()` path. Hop is triggered via `triggerHopRef` callback for replay fidelity.
- Host tracks `hostLastProcessedInputSeq` per connection and includes `ackSeq` in per-cart snapshots, enabling client-side input pruning.
- Old prediction tests in `tests/netcode.test.js` skipped (`describe.skip`) and replaced with new pending input buffer tests.

**2. Monotonic Clock Adoption (`party/index.ts`, `src/netcode.js`)** — Verified.
- Replaced `Date.now()` with `getMonotonicNow()` (`performance.timeOrigin + performance.now()`) in the server and all netcode timekeeping paths: `#serverNowMs()`, `broadcastHostTransform`, `handleRemoteHostState`, `updateServerClockOffset`, `getInterpTargetServerNowMs`.
- `Date.now()` can drift backward with NTP corrections; `performance.now()` is monotonic and ensures server clock offset math stays stable across re-sync cycles.

**3. Host Fall Event Batching (`src/gameFlow.js`, `src/netcode.js`)** — Verified.
- Fall events previously sent individually via `partySocket.send()` in the hot physics loop. Now queued via `queueHostFallEvent()` and drained in batch with the next `hostTransform` broadcast.
- Further reduces server load after the P2P migration — `MSG.hostEventFall` now travels over WebRTC DataChannel inside the `hostTransform` payload's `falls[]` array, completely bypassing the server relay.

**4. WebRTC P2P Latency Improvements (`src/netcode/p2p.js`)** — Verified.
- DataChannel now created with `{ ordered: false, maxRetransmits: 0 }` for lowest-latency unordered delivery of real-time game state (dropped packets are acceptable for 20Hz transform streams).
- `sendToAll()` handles pre-stringified payloads (`typeof data === "string"` check) to avoid double serialization when forwarding host state.
- Input handler now receives sequence number (`data.seq`) for ack tracking on the host side.

### July 5, 2026 – Web Fonts, Kill Feed Variety & UI Polish
- **Web font fix** (`index.html`): Added Bungee and Space Mono to the Google Fonts `<link>` (both primary `media="print" onload` pattern and `<noscript>` fallback). These fonts were referenced in CSS but not loaded, causing fallback to Comic Sans / Courier on the boot splash title, HUD score/rank elements, ready button, volume readout, FPS canvas, and rotate prompt.
- **Self-death verb variety** (`src/hud.js`, `src/gameFlow.js`, `party/index.ts`): `pickSelfDeathVerb()` exports randomized verbs ("ATE PAVEMENT", "TAPPED OUT", "SELF-DESTRUCTED", "NOPED OUT", "RAGE QUIT") replacing uniform "FELL OFF" for self-death kill feed messages. Server `ALLOWED_FALL_VERBS` updated to match. Wired through `gameFlow.js` fall-detection code paths.
- **Results overlay responsive sizing** (`src/ui/resultsOverlay.js`): Score name and value fonts now use `clamp()`-based responsive sizing. Match history section overflow changed from `hidden` to `auto` to allow scrolling.
- **TEST DRIVE removal** (`index.html`, `src/cart-rave-menu.css`, `src/main.js`): Removed unused TEST DRIVE button from menu markup, styles, and JS click handler.

### July 5, 2026 – Mobile Responsive CSS Fixes
Diagnosed and fixed 7 mobile layout issues from phone screenshots (~390×844 portrait, ~844×390 landscape).
- **Results history void** (`src/ui/resultsOverlay.js`): Touch portrait query caps `.results-history` at `flex: 0 1 auto; max-height: 30vh`, fixing the ~60% blank space when only one history entry exists.
- **FPS z-index overlap** (`src/frameVisuals.js`): FPS canvas `z-index` lowered from `99999` to `100`, fixing visual overlap over results overlay buttons and stats.
- **Level card overflow** (`src/cart-rave-menu.css`): Level card grid switches to 2 columns at ≤480px portrait, giving "THE STOREROOMS" and "ZANZIBAR PLATFORM" enough width. `overflow-wrap: anywhere` → `break-word`.
- **Challenges panel top clip** (`src/cart-rave-menu.css`): Added `scroll-padding-top` to `.cr-content` and `scroll-margin-top` to `.cr-challenges-panel`.
- **Kill feed landscape overlap** — diagnosed but not yet fixed: feed rows at ≤900px get near-full-width `max-width` with `flex-shrink: 0` on all children, causing self-death callouts to render as stacked full-width text. The `pickSelfDeathVerb` addition did not affect layout — same DOM path as all kill feed entries.
- **Pause menu landscape collision** — diagnosed but not yet fixed: AUDIO section overlaps CONTROLS in landscape because both sections have `min-height: 0` + default `flex-shrink: 1` in a 164px column budget vs ~348px content need.
- **Level button padding & font (cart-rave-menu.css):** Added tighter padding (`10px 8px`) and `clamp()`-based font-size + letter-spacing for `.cr-level-btn-label` and `.cr-level-btn-sub` inside the ≤480px portrait media query.
- **Results history font-size/line-height (resultsOverlay.js):** Added `clamp(12px, 3.4vw, 14px)` font-size and `line-height: 1.55` to `.results-history` in the touch portrait media query for improved readability.

### July 5, 2026 – Camera Framing & Menu Stats Extraction
- **Camera framing & viewport extraction** (`src/ui/cameraFraming.js`, `src/main.js`): Extracted `updateCameraFraming()` (FOV math: portrait/wide boost) and `updateViewport()` (pixel ratio, composer size, label renderer, FPS canvas positioning) from `main.js` into new module. Exposed via `createCameraFraming()` factory receiving camera, renderer, composer, passes, and FPS canvas getter. Removed `updateSceneViewport` import from `main.js`.
- **Menu stats extraction** (`src/ui/menuStats.js`, `src/main.js`): Extracted `refreshMenuStats()` (~10 lines: DOM writes for wins, matches, points, solo stats) from `main.js` into new module. Exposed via `createMenuStats({ getPersonalStats })` factory returning `{ refreshMenuStats }`.

### July 4, 2026 – Multiplayer Visual Sync & Mid-Round Join Polish
- **CargoBay visibility sync** (`src/netcode.js`): `hostTransform` payload extended with `c` (cargoBay visible) boolean. Non-host clients now sync `cargoBay.visible` on both interpolated remote carts and direct snapshot applies.
- **Non-host death shatter fix** (`src/main.js`): `triggerCartShatterRef` was initialized to `null` and never wired, so death shatter VFX silently failed on non-host clients. Now defaults to the actual function.
- **Booth snap at countdown** (`src/main.js`): All 4 carts are now teleported to their spawn booths before the round countdown begins, ensuring a clean visual reset between rounds.
- **Mid-round join cart teleport** (`src/netcode.js`, `src/gameSession.js`, `src/main.js`): Host detects NPC→human slot transitions and teleports the cart to its spawn booth, resetting position, velocity, and yaw.
- **Rate limit exemption** (`party/index.ts`): `MSG.clientInput` and `MSG.hostTransform` now bypass rate limiting (they're high-frequency telemetry). JSON parse moved before rate check so malformed messages don't consume budget.
- **Ram streak VFX on non-host** (`src/frameVisuals.js`): `tickRamBoostStreakSpawners` was gated behind `isHost()`, so non-host clients never saw speed-streak VFX. Now runs on all clients during the `running` phase.
- **hasSpilled state sync** (`src/netcode.js`): `hostTransform` payload extended with `s` (hasSpilled) boolean. Non-host clients sync `cart.hasSpilled` on both interpolated remote carts and direct snapshot applies.
- **Remote boost instant flag** (`src/netcode.js`): Remote boost edge-detection now passes `{ instant: true }` so non-host clients see the full-strength nitro VFX spike immediately, matching host timing.
- **Kill feed color hex fix** (`src/netcode.js`): Raw hex numbers now properly converted to CSS hex strings (`#RRGGBB`) before rendering kill feed entries.
- **Shatter ref dual-path resolution** (`src/main.js`, `src/netcode.js`): `triggerCartShatterRef` now wired through both `setRefs()` module-level ref and callback bridge fallback, eliminating null-ref silent failures on non-host.
- **Respawn visual cleanup** (`src/entities.js`, `src/netcode.js`): When `hasSpilled` transitions `true`→`false` (cart respawn), non-host clients now cleanup lingering shatter debris and rebuild cart visuals via `cleanupShatter()` + `rebuildCartVisualsIntoRoot()` (newly exported). Applied on both interpolated remote carts and direct snapshot applies.
- **Death shatter hex parsing** (`src/netcode.js`): Color parsing hardened to accept raw numbers, CSS hex strings (`#RRGGBB`), or fall back to `0xffffff`.
- **Host respawn state** (`src/gameFlow.js`): Host now resets `cart.hasSpilled = false` and `cart.cargoBay.visible = true` at respawn, keeping host-side state consistent with non-host sync.
- **cargoBay lookup by name** (`src/effects/groceryPool.js`, `src/entities.js`): `createCargoBay()` tags the group with `name = "cargoBay"`. `rebuildCartVisualsIntoRoot()` retrieves it via `getObjectByName()` with a console.warn fallback.
- **Scene bridge wiring** (`src/gameSession.js`, `src/main.js`, `src/netcode.js`): `getTriggerCartShatterRef`, `getSceneRef`, and `getScene` added to context bridge. Non-host `getSceneRef` now falls through `getSceneRef` → `getScene` → `null`. Shatter hex values clamped with `& 0xffffff` mask.
- **Respawn cleanup simplified** (`src/netcode.js`): Removed `rebuildCartVisualsIntoRoot` import. Both remote cart and snapshot apply paths now use a single `cleanupShatter()` call. Trigger condition broadened to `!snap.s && (wasSpilled || cart.isShattering || cart._shatterState)`.
- **Netcode DRY refactor** (`src/netcode.js`, `src/gameSession.js`): Extracted `applyCartState()` and `serializeCartToWire()` shared functions, eliminating duplicated VFX/cargoBay/hasSpilled logic across interpolated and direct snap paths. Net reduction: 54 lines.
- **Pause/Esc overlay extraction** (`src/hud.js`, `src/ui/pauseOverlay.js`): Extracted ~550 lines of Esc overlay UI into new `pauseOverlay.js`. `hud.js` now delegates through thin wrapper functions.
- **@ts-expect-error cleanup** (`src/cartRaveGltf.js`, `src/cartThemes.js`): Removed remaining ~20 stale suppressions, replaced with proper `THREE.Mesh`/`THREE.MeshStandardMaterial` type casts. Refined JSDoc typedefs.
- **Level select Zustand sync** (`src/cart-rave-menu.js`, `src/levelManager.js`): Level picker now updates `settingsStore` Zustand state. Level resolution checks `localStorage` first, then falls back to store.
- **Force-clear shatter state on respawn** (`src/netcode.js`): Respawn now force-clears `isShattering`, `_shatterState`, `_shatterDeathPos`, and restores `contactShadow.visible`.
- **hud getter to avoid stale ref** (`src/main.js`): Two `hud` references in context object changed to getter syntax so they always resolve at access time rather than capture-time (could be `undefined` during initialization).
- **Null cart guard in updateRemoteCartNetTargets** (`src/netcode.js`): Added `if (!cart) continue;` before `applyCartState` to prevent null dereference during slot transitions.
- **Boost state force-sync from wire** (`src/netcode.js`): `applyCartState` now writes `snap.b` to `cart.isRamBoosting` and `cart.isBoosting`, so non-host clients maintain correct boost visual state (ram streaks, wheel rate) between host transform updates instead of only on edge detection.
- **Slot 1 debug logging** (`src/netcode.js`): Temporary console logs in `applyCartState` (receive) and `serializeCartToWire` (send) to monitor hasSpilled, cargoBay, boost, and position sync at runtime. **[Removed July 4 — superseded by self-contained shatter VFX lifecycle.]**
- **applyCartState explicit slotIndex param** (`src/netcode.js`): Changed from `cart.slotIndex` (undefined on remote carts) to explicit `slotIndex = -1` parameter threaded through all 7 call sites. Debug log updated accordingly. **[Removed July 4 — debug logs removed in cleanup.]**
- **Stuck-shatter guard in frameVisuals** (`src/frameVisuals.js`): `isShattering` guard split into two conditions — `isShattering && hasSpilled` freezes mesh (valid shatter), `isShattering && !hasSpilled` force-clears stuck flag so mesh can lerp from death position to spawn booth. **[Removed July 4 — replaced by isShatterAnimating().]**
- **Host respawn force-clears shatter** (`src/gameFlow.js`): Host-side respawn now clears `isShattering`/`_shatterState`/`_shatterDeathPos`, restores all visibility flags, and calls `cleanupShatter()` (imported from `cartShatter.js`) before `doRespawn`. **[Removed July 4 — delegated to doRespawn.]**
- **Spilled-flag reconciliation** (`src/netcode.js`): `reconcilePredictedLocalCart` extracts `auth.s` and respects it — `s: true` returns early (host says dead, no pit-dragging). `s: false` force-snaps once on respawn transition (`wasSpilled || isShattering`), clears all shatter flags, then falls through to normal smooth reconciliation on subsequent frames. **[Removed July 4 — replaced by isShatterAnimating() + doRespawnRef.]**
- **Slot 1 trace logs** (`src/netcode.js`): Temporary console logs at `MSG.state` parse and in all three `updateRemoteCartNetTargets` loop branches to verify slot-1 data reaches the interpolation path. **[Removed July 4 — debug logs removed in cleanup.]**
- **Self-contained shatter VFX lifecycle** (`src/cartShatter.js`, `src/frameVisuals.js`, `src/gameFlow.js`, `src/main.js`, `src/netcode.js`): Introduced `isShatterAnimating()` (explosion duration clock) as the single source of truth for death VFX lifetime. `frameVisuals.js` gates on animation clock instead of network flags. `applyCartState` and `reconcilePredictedLocalCart` ignore `s:false` while VFX plays, then call `doRespawnRef` (unified respawn on all clients). `gameFlow.js` host respawn delegates to `doRespawn`. All debug logs removed. Net reduction: 2 lines.
- **Audio controls extraction** (`src/ui/audioControls.js`, `src/main.js`): Extracted volume/mute state and menu/HUD audio UI wiring (~90 lines) from `main.js` into new module. Injects HUD/AudioListener/leaderHum lazily via getters. Removed `menuAudioControlsWired` flag and module-level `musicVolume`/`sfxVolume`/`isMuted` from `main.js`.
- **Graphics toggles extraction** (`src/ui/graphicsToggles.js`, `src/cart-rave-menu.js`, `src/main.js`, `src/globals.d.ts`): Replaced `window.__cartRave_togglePostFx`/`window.__cartRave_toggleLowQuality` globals with proper module imports. Removed stale declarations from `globals.d.ts`.

### July 4, 2026 – Runtime Bug Fixes
- **Combo decay race fix** (`src/gameFlow.js`): Moved rampage combo decay to a dedicated second pass after all fall-detection scoring, preventing a low-indexed attacker's combo from expiring before a higher-indexed victim's KO was scored on the same frame.
- **Grocery spill pending queue** (`src/effects/groceryPool.js`): Spills that arrive before GLTF models finish loading are now queued and replayed once `init()` resolves, preventing silently dropped VFX.
- **Server-authoritative level sync** (`party/index.ts`, `src/netcode.js`): `MSG.round` now broadcasts the server's `levelId`. Non-host clients sync their `settingsStore` on receipt. `sendHostRound()` reads from `settingsStore` instead of raw `localStorage`.
- **Results UI cleanup** (`src/main.js`, `src/ui/resultsOverlay.js`): Removed "NEXT LEVEL" button and all related wiring. "REMATCH" renamed to "PLAY AGAIN".
- **Slot kind fallback fix** (`src/hud.js`): Changed `slot?.kind || "npc"` to `slot?.kind ?? ""` (nullish coalescing) so explicit empty strings on human slots are not incorrectly labeled as NPC.

### July 4, 2026 – TypeScript Audit & 100% Typecheck Compliance
- Systematic pass achieved **0 errors under `npx tsc --noEmit`** with `checkJs: true` enabled.
- Augmented global module declarations in `src/globals.d.ts` for DOM, THREE, and Rapier3D.
- Standardized JSDoc type signatures and eliminated all 30+ stale `@ts-expect-error` directives.
- Hardened server-to-client broadcast connection mapping in `party/index.ts`.
- Validated with 21/21 passing Vitest unit tests and 1.63s clean production build.

### July 1, 2026 – Physics Overhaul + Polish
- Full replacement of problematic trimesh colliders on Record level (72-segment ring → 16 edge-to-edge convexHull colliders using precise `tan(halfAngle)` math)
- Full replacement of heavy trimesh on Backrooms level (5,776 polygons → 9 clean primitive cuboids)
- Wheel clipping bug fixed globally by restoring correct `visualOffset` + visual mesh tuning
- HUD overlap fix (moved `.hud-status` to 20vh)
- Audio mute state persistence fix (removed early `_isMuted` return guards in music playback functions)
- Major dead code removal via Knip (27 unused exports cleaned across 8 files)
- Successful zero-warning Vite build + Cloudflare production deploy

### June 30, 2026
**Infrastructure & Deployment**
- Migrated from PartyKit to raw partyserver on Cloudflare free tier
- V2 deployed live at https://cart-rave.wyabro.workers.dev

**Match Pacing & Sudden Death**
- Standard round length set to 2.5 minutes
- Sudden Death implemented (first to score wins on tie)
- Multi-way tie support + spectator mode

**Death & Respawn Polish**
- Cinematic death camera with momentum carry + pan to explosion
- Respawn delay tuned to 1000ms

**Audio Tightening Pass**
- Dynamic wheel audio (volume + pitch based on speed)
- Charge-up SFX now scales with hold time
- Countdown SFX wired correctly
- Menu music autoplay race condition fixed

**Mobile Performance & Low Quality Mode**
- Auto low-quality mode with visual + post-FX scaling
- WASM crash fix (avoided destroying Rapier world mid-match)
- Dynamic physics substeps based on quality mode

**Phase 2 Completed Work**
- Match Pacing & Sudden Death
- Death & Respawn Polish
- Audio Tightening Pass
- Mobile Performance (Cart Rave level)
- Stabilize lobby / ready-up flows
- Non-host lifecycle edge cases
- Client prediction improvements
- Caster/fork system visual polish (partial)
- Lag mitigation tuning

**NPC AI Behavior Overhaul**
- Aggression increased to 80% hunting cycles
- Predictive ramming (velocity lead targeting)
- Improved nitro logic + suicide prevention
- Spawn lock during countdown + Backrooms pathing fixes

**Physics & Collision Fixes**
- CCD properly enabled on RigidBodyDesc (fixed tunneling)
- Spawn booth friction lowered (no more snagging)
- Deeper void on Classic Record (-30 threshold)
- Stuck cart respawn fixed (position-based tracking instead of speed)

**Other Polish**
- Charge Boost early release + increased burst power
- FFmpeg loudness normalization across all SFX
- Various entity and state cleanup fixes

### June 29, 2026
**Engine & Performance**
- WebGL memory leaks patched
- GC micro-stutter eliminated (Rapier scratch cache)
- Arcade feel improvements

**V2 Architecture**
- GLB cart heavily compressed (Draco + WebP)
- Themed carts fully removed
- New Sunglasses + Mirror Finish customization system

**Gameplay Features**
- Auto-Charge Boost
- Cinematic Countdown Camera
- Cart Shatter + Explosion Death VFX

**Bug Fixes**
- NPC respawn suicide loop fixed

### Core Multiplayer & Foundation
- Full modular refactor (`main.js` as thin orchestrator + `src/` modules)
- PartyKit server + client handshake + host migration
- Multiplayer sync for human carts (host-authoritative)
- NPC fill for empty slots + slot sync
- Username system + color picker
- Round structure + HUD (countdown / running / podium)
- Results screen + Play Again + exit portal
- Main menu shell + mode routing (Solo / Quickplay / Friends)
- Friend flow + personal stats
- Portal system (exit + return portals)
- Ready-Up system

### Visuals & Environment
- Procedural cart models with caster wheels
- Spawn booths redesign
- Ground plane, pit wall, crowd silhouettes, main stage
- Skybox (stars, nebula, UFOs, planets, horizon fog)
- Crowd lighting + searchlights + point lights
- Stage lasers, fog, ambient light, spindle light
- Record label, void wall gradient, leader glow
- Vibe Jam billboard + in-world exit portal
- Esc overlay + menu integration

### Physics & Gameplay Feel
- Physics tuning (restitution, angularDamping, maxPitchRoll)
- Version 1 driving core restored + tipping behavior
- Ramming system + boosted ramming
- Collision particles, screen shake, trash bursts
- Nitro boost system + visual/audio feedback
- Wheel screech, hop, fall-off, nitro SFX
- Real cart crash sound sample

### Polish & Quality of Life
- Touch controls (in-game) + rotate prompt for mobile
- Mobile detection (replaces old desktop-only blocking)
- Audio system (separate music/SFX volume, procedural SFX)
- Kill feed, score bar, HUD overhaul
- Stats tracking + match history
- Performance fixes (menu perf, refresh stutter, etc.)
- Bug fixes across many sessions (ghost carts, host migration, etc.)
- Console log cleanup + dead code removal
- `bootstrap.js` and `levelManager.js` extracted from `main.js` (June 2026)

### Recent Technical Improvements (June 2026)
- Major dead code + unused export cleanup (Knip)
- `bootstrap.js` extraction (menu → play flow)
- `levelManager.js` extraction (level preview + swapping)

### Stretch / Deferred Ideas
Tracked in [ROADMAP.md](./ROADMAP.md) and [post-jam-ideas.md](./post-jam-ideas.md) — e.g. Crazy Carts mode, Supabase leaderboard, cart faces, audio-reactive crowd.

---

## Notes

- Phase 2 is complete. Phase 3 is complete. Phase 4 is active.
- Session handovers archived under [handovers/](./handovers/).
- For the current prioritized roadmap and next steps, use **[ROADMAP.md](./ROADMAP.md)**.
- This file is maintained as a historical record and status snapshot.

---

**Last Updated:** July 6, 2026