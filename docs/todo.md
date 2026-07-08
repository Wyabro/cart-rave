# Cart Rave — Todo & Historical Record

**Last Updated:** July 8, 2026

> **Forward-looking work** is tracked in [ROADMAP.md](./ROADMAP.md).  
> This file preserves phase history, shipped features, and current status.

---

## Current Status

- **Core Game**: Fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction
- **Physics & Feel**: Major stability overhaul complete. Floor bounciness and wheel clipping on trimesh colliders fully resolved by switching to mathematically precise convex hull + primitive colliders on Record, Backrooms, and Zanzibar levels. Mobile performance significantly improved.
- **Current Phase**: Phase 4 — Multiplayer & Infrastructure (active); Phase 3 content is complete
- **Announcer System (July 8, 2026)**: Production-ready "The Store PA" announcer framework shipped — data-driven event table, single-channel arbitration engine (priority interrupts, TTL queue, kill-burst merge, cooldowns), game-state director, neon callout UI with accessibility support, and a voice-asset pipeline that drops in recordings with zero code changes. Full writeup and event catalog in [docs/announcer.md](./announcer.md).
- **Visual Polish Pass (July 8, 2026)**: Targeted AAA-style rendering pass preserving the dark-arena + punchy-neon identity — full writeup in [docs/visual-audit.md](./visual-audit.md). Global look retuned (exposure 0.40, bloom 0.34 @ 0.76); kill-confirm gains a layered FOV punch + white flash + aberration pulse via a new `uFlash` uniform on the Arcade FX shader; Zanzibar cart blob shadows nudge subliminally away from the sun; Backrooms gets one grazing steel-blue rim light; Classic pit-wall gradient eased with additive depth rings + violet horizon glow band + distance-tiered starfield; Zanzibar sky/sun-halo realigned to the retuned fog hex and islands rebuilt as fog-inheriting atmospheric silhouettes; grocery cargo now sits in the basket instead of clipping through it. Cart material system rewired: patterns moved from a coplanar duplicate `CartFramePattern` mesh to an `onBeforeCompile` shader mask on the frame material (uniform swap between patterns, no shader recompile), and the GLTF cart body `emissiveMap` is now a generated grayscale wire mask cached per source-texture uuid so wire glow tunes independent of albedo. Full customization contract (recolor caches, userData keys, respawn rebuild path) preserved.
- **Production-Readiness Pass (July 7, 2026)**: Full-codebase audit with 50 ranked improvements ([docs/audits/production-readiness-audit-2026-07.md](./audits/production-readiness-audit-2026-07.md)); top 10 shipped — Safari/iOS `.mp3` audio fallbacks (game had **zero audio on Safari**), Open Graph/Twitter link previews, fixed PWA manifest + `theme-color`, runtime error reporting with rate-limiting, centralized `localStorage` in `src/utils/storage.js`, shared touch detection in `src/utils/device.js`, all 10 knip dead exports removed, ~25 MB of dead assets/config purged. New `npm run check` gate (typecheck + tests + knip) is green.
- **Recent Technical Work**: **WebRTC signaling root-cause fix — multiplayer restored** (host now initiates the DataChannel offer to each peer via `ensureHostPeerConnections()` in the `MSG.slots` handler; previously `createOffer` was unreachable because the only callers were non-host no-ops, so no DataChannel ever opened) + Major dead code removal & protocol cleanup (~250 lines deleted: server-side collision/fall validators, `reconcilePredictedLocalCart`, `inputSendTimer`/`startInputSendLoop`, `configureP2P`/`getPeerConnections`/`getDataChannels`) + shared NPC name pool (`shared/npcNames.js`, single source of truth for client + server) + protocol MSG reorganized into WebSocket control plane vs WebRTC gameplay plane + `handleP2PMessage` rejects stale host snapshots by `fromConnId !== hostId` (cross-transport guard since WebRTC is unordered but host_migrated is WebSocket) + slots accepted verbatim from server (no local `declashNpcSlotColors` on MSG.slots, server owns slot colors) + binary decoder now uses `MSG.hostTransform` shared constant (was hardcoded literal "hostTransform" that never matched `"host_transform"`) + interpolation helpers extracted (`lerpVec3Pair`, `slerpQuatPair`) + `broadcastHostTransform` now uses binary encoder + non-host P2P dispatches all JSON types to `onStateCallback` (was filtering to hostTransform only, dropping MSG.spill) + host migration freeze now uses monotonic clock + `dispatchP2P`/`setHostIdForTest` test hooks for e2e binary-to-buffer dispatch tests + Worker ASSETS fallback + rigid body double-free guards on all levels + NaN/Infinity guards in binary decode + binary serialization + input sampling moved to physics loop + server reaper fix + server spill relay removed + deterministic physics timestamps + client-side prediction rewrite + empty slot cart body fix + scene update clock sync + monotonic clock adoption + host fall event batching + pending input buffer + WebRTC P2P DataChannel migration + server reduced to signaling relay + all prior work
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

### July 8, 2026 – Visual Polish Pass (Three.js Rendering)

Targeted AAA-style rendering pass on the existing Cart Rave presentation — no gameplay changes, no arena redesign, full customization contract preserved. Full audit + round-by-round record in [docs/visual-audit.md](./visual-audit.md). Owner steered the pass through three feedback rounds; final look is deliberately dark with restrained bloom (dark arena + punchy neon is the identity, not a "bright arcade" brief).

**Global rendering**
- Exposure retuned 0.88 → 0.62 → 0.46 → **0.40** across three "still too bright" rounds; bloom strength 0.67 → **0.34**, threshold 0.86 → **0.76**, `smoothWidth` widened to 0.14 (also fixed a latent Rec.709-luma bug where magenta neon at luma 0.29 never crossed the old 0.86 cutoff while cyan at 0.79 did).
- Fog hexes retuned in the corrected pipeline (colors now display as authored — previously rendered darker via the missing sRGB encode).

**M-tier arena/effect work**
- **Kill-confirm layered feedback (M3)**: softened FOV punch (9°/180ms; ram hits stay 8°/100ms via a `Math.max` `armFovPunch` helper so overlaps never truncate) + center-weighted white flash via a **new `uFlash` uniform on the Arcade FX shader pass** + aberration/vignette pulse. All decays run on cheap uniform writes each frame.
- **Zanzibar directional blob-shadow bias (M4)**: `CONFIG.contactShadows.directionalBias.zanzibar = { x: 0.27, z: -0.22 }` offsets cart blobs away from the sun; overhead-lit arenas keep centered blobs; footprint sampling still uses the true cart position. Level identified via the existing octagon-hazards flag (no new level-tracking path).
- **Backrooms cart-contrast rim light (M5)**: one steel-blue (`0x7a8fc0`) `DirectionalLight` @ 0.2 raking near-grazing across the play space — carts and the furniture pile pick up a faint cool edge without lifting the carpet (the initial 0.35 at a steeper angle read as "glowing carpet" per owner feedback, retuned).
- **Classic pit + backdrop dressing (M6)**: pit-wall vertex-color gradient eased `t^2.6` on 24 height segments with a violet rim band + **5 additive depth rings** at decreasing brightness down the shaft; horizon-fog cylinder color now reads from `CONFIG.postFx.fog.color` (was hardcoded to the stale pre-retune hex, would have seamed against the retuned clear color); starfield gained distance-based brightness tiers; faint violet horizon glow band added.
- **Zanzibar horizon + islands (M7)**: sky-gradient bottom stops and sun-halo color realigned to the retuned `0xff5a22` fog hex (sky and ocean now melt seamlessly instead of showing a hard waterline seam). Islands rebuilt from three flat cutouts into **two-layer atmospheric-perspective silhouettes** (3 clusters, 2 layers each, 4 hand-picked tones) that now take scene fog and inherit the exact same ember haze the ocean fades into — reads as depth in the atmosphere, not cardboard.

**Cart material system (R-tier, full customization contract preserved)**
- **R2 — pattern overlay → in-material shader mask (`src/cartPatterns.js`)**: replaced the coplanar `CartFramePattern` duplicate mesh (polygonOffset hack, doubled draw of the heaviest cart mesh) with an `onBeforeCompile` mask injection on the CartFrame's own `MeshPhysicalMaterial`. Uniforms: `uPatternMask`, `uPatternRepeat`, `uPatternStrength`, `uPatternTint`, `uPatternEmissive`. `material.customProgramCacheKey = "cartPattern:0|1"` — switching between two non-classic patterns swaps a texture uniform without a shader recompile; only classic↔patterned flips recompile. Injected chunks modulate (never replace) the standard color/emissive pipeline, so per-frame recolor / leader-glow / boost-pulse still work. Works for both cart pipelines (GLTF body with albedo map, procedural fallback CartFrame without).
- **R3 — dedicated emissive wire mask (`src/cartRaveGltf.js`)**: body role no longer reuses its own albedo as `emissiveMap` — a grayscale wire mask is now generated once per source-texture uuid (`buildRaveGltfWireEmissiveMask`, cached in `_wireEmissiveMaskCache`) by threshold-ramping the albedo's channel-max brightness (smoothstep 0.45 → 0.7, deliberately picked over Rec.709 luma so saturated magenta/blue wires aren't missed). Fallback to the previous albedo-reuse behavior on unsupported texture types (compressed / non-drawable / undecodable). Wire glow intensity is finally tunable independent of body albedo detail.
- **Preservation guarantees held**: `frameMats`/`frameBodyMats`/`accentMats`/`frameGlowMats` cache arrays, every `userData` gate (`isCartFrame`/`isRaveGltf`/`raveGltfPartRole`/`raveGltfAuthoredColor`/`raveGltfHasEmissiveAccent`/`preserveGltfMaps`/`isSharedGeometry`), and the `rebuildCartVisualsIntoRoot` shatter-rebuild path all still work.
- R1 (wheel decimation) and R4 (theme variety) declined by owner.

**Grocery cargo clipping fix (`src/effects/groceryPool.js`)**
- `createCargoBay` was placing items by center point only — bottoms sank through the basket floor and edge items poked through the sides. Each item now measures its bounding-sphere radius, insets the XZ spread from the walls, and sets its rest height off the floor. Fully backward-compatible when `hw`/`hl` are omitted.

**Verification**
- `npm run check` green (0 TS errors, 61/61 tests, 0 knip findings) after every stage.
- Verified in-browser on all three arenas via preview screenshots; when the hidden-tab rAF freeze prevented a live screenshot of the new shader-mask material, drove the modules directly against the live singletons (spawned a patterned cart, confirmed zero `CartFramePattern` meshes, mask uniforms present, cache key `cartPattern:1`, `emissiveMap !== map`) and rendered offscreen to confirm 3 programs compiled without diagnostics and zero GL errors.

**Delegation note:** four parallel subagents handled the initial audit + level dressing (arenas/carts/effects audits, Backrooms rim light, Zanzibar islands, R2/R3 material rewrite), with global tuning, kill-confirm shader work, blob-shadow bias, Classic pit dressing, and the grocery fix reserved for the orchestrating session. Two subagents were killed mid-flight by an API rate limit early on — those tasks (M4, M6) were finished inline rather than respawned.

### July 8, 2026 – Announcer System ("The Store PA")

Production-ready announcer framework designed and built for the Steam demo push. Creative direction: a supermarket tannoy hijacked by the rave's MC — retail-flavored callouts (FIRST SPILL, REFUND, CLEAN-UP ON AISLE, BUY ONE GET ONE) instead of generic arena-shooter vocabulary, deliberately built to avoid Halo/Rocket League/UT tropes. No AI voice clips or placeholder dialogue — polished procedural stings + visual callouts stand in until real recordings land, via a fully data-driven voice pipeline.

**Architecture** (`src/announcer/`):
- `announcerManager.js` — the single arbitration entry point (`announce(eventId, data)`). Owns every rule about whether/when an announcement plays: single channel with a 1.2s minimum gap; `sequence`-class events (countdown/GO) bypass the gap and are never queued; `critical`-class events (Sudden Death, victory/defeat) interrupt and flush the queue; other interrupts require priority ≥ active+20 on an interruptible event; a 2-slot priority queue with per-event TTL, dedupe, and eviction; `ambient`-class events (close_call) only play into silence; a 450ms kill-burst merge collapses pile-ups into one line (a wipeout swallows its double-spill and rampage); `comeback` swallows a simultaneous `new_leader`.
- `announcerEvents.js` — frozen data table (priority, cooldown, once/max-per-round, chance, callout config, voice-asset manifest) for 19 events. No engine changes needed to add an event.
- `announcerLines.js` — localization-ready subtitle lines with `{attacker}`/`{victim}`/`{leader}`/`{aisle}` token substitution, no-repeat-in-a-row variant picking, and automatic filtering of variants whose tokens aren't satisfiable by the given data.
- `announcerStings.js` — 15 procedural WebAudio stings in the existing `sfxSynth.js` `spawnTone` idiom (standalone, no dependency on it).
- `announcerDirector.js` — pure game-state observer. Subscribes to `gameStore` for round-phase transitions and score changes; derives first_spill, double/triple-KO bursts, revenge (refund), combo tier-ups (rampage/savage/carnage), self/environmental KOs (cleanup_aisle), close calls, and leader/comeback detection (with deficit tracking) — then calls `announce()`. Runs identically on host and non-host: kill events reach every client through the existing `falls[]` snapshot tail, so zero netcode changes were needed.
- `src/ui/announcerDisplay.js` + `src/ui/styles/announcer.css` — neon callout banner (kicker + skewed uppercase main line, accent-glow text-shadow) positioned below the HUD status line; punchy scale-in/fade-out entrance, `prefers-reduced-motion` fallback, and a visually-hidden `aria-live="polite"` region so every announcement reaches screen readers even with callouts or audio disabled.

**Integration** — every hook is a purely additive observer; no gameplay, scoring, or protocol changes:
- Host fall hook in `gameFlow.js`; non-host mirror in the `falls[]` replay path in `netcode.js`; both converge on `announcerDirectorOnFall`.
- `hud.js` countdown/GO/Sudden-Death/final-10s ticks now route through `announce()` instead of calling `AudioManager.playSfx`/`sfxSynth` stings directly.
- `main.js` wires init, the presenter (`setAnnouncerPresenter(initAnnouncerDisplay())`), the local big-hit → close_call hook, and victory/defeat at the podium.
- Pause overlay gained an ◇ ANNOUNCER section (ANNOUNCER + CALLOUTS toggles, gamepad-navigable), persisted via `settingsStore` (`cartRaveAnnouncerVoice` / `cartRaveAnnouncerCallouts`).
- `sfxSynth.js`'s victory fanfare / defeat sting / Sudden Death sting were retired in favor of announcer-owned equivalents (same musical recipes, now reimplemented in `announcerStings.js`).

**Voice pipeline** (documented in [docs/announcer.md](./announcer.md)) — drop `public/sounds/announcer/<locale>/<eventId>_<NN>.ogg|.mp3`, register with Howler as `announcer_<eventId>_<NN>`, call `registerAnnouncerVoicePack({ locale, availableKeys })`. Fallback chain: voice variant → sting → silent-with-subtitle. Partial packs are fine.

**Validation** — `npm run check` green (0 TS errors, 61/61 tests including 29 new arbitration tests, 0 knip findings). Verified end-to-end in-browser by driving the live initialized singletons (the preview tab's hidden `visibilityState` freezes `requestAnimationFrame`, so a full physics playtest was not possible in-session): first_spill, double/triple-KO merge, rampage/savage/carnage, refund, cleanup_aisle, new_leader, comeback, the critical Sudden Death interrupt, victory, and lobby teardown all produced correct callouts, subtitle text, accent colors, and `aria-live` announcements, with cooldowns correctly suppressing repeat spam.

**Delegation note:** implemented via three parallel Sonnet subagent workstreams (core arbitration engine + tests, gameplay/director wiring, callout UI + settings), with creative direction, priority tuning, and integration review reserved for the orchestrating session — per the session's explicit orchestration request.

### July 7, 2026 – Production Value Pass (Top-10 Player-Experience Improvements)

Creative-direction review of every player-facing surface; full 100-item ranked report in [docs/audits/production-value-pass-2026-07.md](./audits/production-value-pass-2026-07.md). Constraint: no multiplayer-architecture or core-gameplay changes. The 10 highest-impact items shipped:

1. **Attacker kill-confirm feedback** — procedural confirm sting + center-screen hitmarker + FOV punch on every KO, via a new presentation-only `onLocalKillConfirm` callback fired from `gameFlow.js` (host) and the `falls[]` replay path in `netcode.js` (non-host — which previously got *no* attacker feedback at all, not even the FOV punch).
2. **Victory presentation** — procedural victory fanfare (local winner) / defeat sting (everyone else) + winner-colored canvas confetti burst at the podium (`spawnResultsConfetti` in `resultsOverlay.js`), one celebration per match.
3. **Final-10-seconds urgency** — timer turns red and pulses with a per-second procedural tick (pitch rises in the last 3s); suppressed during Sudden Death.
4. **Sudden Death entry sting** — dissonant drone+stab cue on the rising edge, on all clients.
5. **Boost charge meter** — bottom-center HUD bar for keyboard/gamepad (touch keeps its button flash): charging (yellow) → charged (white pulse) → cooldown (dim magenta) → ready (cyan), driven by the locally simulated cart each frame.
6. **Damage-taken impact pulse** — vignette + chromatic-aberration kick on hard local hits via the arcade post-FX pass; baselines captured at trigger time so it never fights the dev Tweakpane.
7. **First-run HOW TO PLAY overlay** — auto-opens once (storage-gated, skipped when joining via invite link), input-mode-aware controls copy, accurate scoring strip, plus a permanent HOW TO PLAY menu button.
8. **Brand cohesion** — rotate prompt no longer calls the game "Cart Rave" (the classic arena keeps CART RAVE as its diegetic venue name; loading-screen level titles and in-world stage billboards are intentional).
9. **Mobile landscape fixes** — kill feed no longer collides with the audio panel (repositioned + ellipsized rows under short-landscape media query); pause overlay AUDIO/CONTROLS sections now scroll instead of overlapping.
10. **Challenges feedback loop** — overlay copy no longer promises nonexistent XP; in-match "CHALLENGE COMPLETE" HUD toast + sparkle sting on goal completion; "✓N" completed-count chip on the menu CHALLENGES button. Plus: Settings/Challenges bottom buttons renamed DONE (matches Customize), gamepad B-button now targets `.cr-overlay-back` directly, dead menu CSS removed.

New module `src/sfxSynth.js` (procedural sting synthesizer in the `spawnTone` idiom — no audio assets added). **Validation:** `npm run check` green (0 TS errors, 32/32 tests, knip clean); production build passes; full runtime loop verified in-browser (boot → first-run overlay → solo → boost charge/cooldown meter live → last-10s urgency at :01 → Sudden Death theme+sting → podium with confetti → PLAY AGAIN → second full round) with zero console errors. Note for automated testing: mode entry awaits `requestAnimationFrame`, which never fires in hidden tabs — verification requires a visible tab or an rAF shim.

### July 7, 2026 – WebRTC Signaling Root-Cause Fix (Multiplayer Restored)

**Root cause of "multiplayer broken after the WebRTC migration"** — Verified (runtime + tests).
- After the P2P migration, lobby/join/host-election (all WebSocket) kept working, but **no WebRTC DataChannel ever opened**: remote carts never moved, host authority was invisible, and non-host collisions never reached the host. The binary snapshot path — correctly wired at the dispatch layer by the July 6 fixes — carried no data because the transport itself never came up.
- **The bug:** `createOffer()` was statically unreachable. The only offer/DataChannel creator, `initiateP2PConnection()` (`src/netcode/p2p.js`), is host-gated (`if (!isHost) return`). But its only two call sites — the `MSG.hello` and `MSG.hostMigrated` handlers — are **non-host-guarded** (`youConnId !== hostId`, `!nextIsHost`), so a non-host calling it hits the host guard and returns immediately. The host had **no call site at all**. Net result: no SDP offer was ever created → the peer's `ondatachannel` never fired → the `"physics"` channel never opened.
- **Intended design (per `docs/ROADMAP.md`): the host is the offerer** ("Host creates a DataChannel per non-host peer"); non-hosts answer via `ondatachannel`. The implementation simply never invoked the host-side initiation.

**The fix (`src/netcode.js`)** — smallest correct change; no signaling/authority/PartyKit redesign.
- Added `ensureHostPeerConnections()`: host-only helper that iterates `netSlots` and calls `P2P.initiateP2PConnection(connId)` for every human peer whose `connId !== youConnId`. `initiateP2PConnection` is idempotent (skips existing peers), so repeated calls are safe; non-hosts return early.
- Invoked once, from the `MSG.slots` handler (after `netSlots = merged`). The server rebroadcasts `MSG.slots` on every join (`party/index.ts`) **and** after host departure (following `MSG.hostMigrated`), so this single call site covers both new-peer connection **and** the new host connecting to all survivors after migration.
- The pre-existing non-host `initiateP2PConnection` calls are left as harmless no-ops (the non-host answers offers; it does not initiate).

**Validation** — Verified.
- **Runtime (real app):** with the app running as host, a peer joined the room → the app created and sent an `sdp_offer` → ICE `connected` → `[p2p] DataChannel open with <peer>` → the host streamed **426 binary snapshots (248 bytes each, ≈40 Hz)** to the peer. Also confirmed a full host-offers handshake end-to-end through the real party server (DataChannel OPEN both sides, binary round-trip).
- **Tests (`tests/p2p-signaling.test.js`, mock `RTCPeerConnection`):** host reaches `createOffer` + emits `sdp_offer`; non-host answers with `sdp_answer` + wires `ondatachannel`; DataChannel open → binary `onmessage` → dispatch → `netStateBuffer`; and `ensureHostPeerConnections` offers to exactly the non-self human peers (idempotently). New `setHostStateForTest` / `ensureHostPeerConnections` test-hook seams.

### July 7, 2026 – Production-Readiness Audit & Top-10 Fixes

Full-codebase audit; report with all 50 ranked improvements lives in [docs/audits/production-readiness-audit-2026-07.md](./audits/production-readiness-audit-2026-07.md). Constraint: no gameplay/physics/scoring changes and no networking (`netcode*`, `shared/protocol.js`, `party/index.ts`) touched. The 10 highest-impact, safe items were implemented:

1. **Safari/iOS audio fix (highest player impact)** — every sound loaded as `.ogg` only, which Safari cannot decode, so the game was **silent on all Safari/iOS devices**. `audioManager.js` `loadMenuMusic` / `loadGamePlaylist` / `registerSfx` now accept `[ogg, mp3]` arrays and Howler picks the first decodable format. Generated `.mp3` fallbacks for the 10 referenced SFX via ffmpeg (~385 KB); the 5 music `.mp3`s already existed but were unused. `index.html` menu preload now feature-detects Ogg support.
2. **Dead audio purged (~6 MB)** — removed `.wav` masters (Death.wav alone was 3.8 MB) and the unreferenced `Wheel.ogg` / `Wheel.wav` / `Wheel_loop.ogg` trio. `public/sounds/` 32 MB → 26 MB.
3. **TypeScript baseline restored** — 2 `Element.blur` errors in `cart-rave-menu.js` fixed (README's "0 errors" claim is true again).
4. **PWA manifest fixed** — `site.webmanifest` had empty `name`/`short_name` and white theme colors; now "Cart Clash" with the dark neon palette. Added `<meta name="theme-color">`.
5. **Social link previews** — invite links (the core share loop) unfurled blank; added Open Graph + Twitter Card tags to `index.html`.
6. **Runtime error reporting** — the inline `index.html` handlers bailed once boot finished, so post-boot errors were invisible. `errorReporter.js` now installs global `error` / `unhandledrejection` handlers with per-message dedupe and a 20-report session cap; wired via `installGlobalErrorReporting()` in `main()`. Verified end-to-end (synthetic throw → `POST /api/log-error` beacon).
7. **Centralized storage** — new `src/utils/storage.js` with a `STORAGE_KEYS` registry (all 14 `cartRave*` keys) and safe get/set/JSON helpers. Migrated `main.js`, all three stores, `customization.js`, `cart-rave-menu.js`, `levels/index.js`, `bootstrap.js`, `levelManager.js`, `loadingScreen.js`. (`netcode.js` left untouched per constraint.) `"cartRaveLevel"` had been independently redefined in three files.
8. **Dead exports removed** — all 10 knip-flagged unused exports across `audioManager.js`, `gameState.js`, `entities.js`, `input.js` unexported/removed. knip is now fully clean.
9. **Shared device detection** — new `src/utils/device.js` (`isTouchLikeDevice`) removes the copy-pasted touch check that `settingsStore.js` duplicated from `utils.js` due to an import cycle.
10. **Repo hygiene + tooling** — removed stale `vercel.json`, `dev-server.py`, `partykit*.json` (pre-partyserver), git-tracked `.tmp-gltf-imgs/`, and root-level icon duplicates (Vite serves `public/`). Added `npm run check` (typecheck + test + knip). `dist/` 59 MB → 53 MB.

**Validation** — `npm run check` green (0 TS errors, 32/32 tests, 0 knip findings); production build succeeds; booted in-browser with zero console errors and confirmed the new storage/audio/meta paths live.

### July 6, 2026 – Dead Code Removal, Protocol Cleanup & Cross-Transport Safety

**1. Major Dead Code Removal (~250 lines)** — Verified.
- **Server validators** (`party/index.ts`, ~183 lines removed): Removed the dead `MSG.hostEventCollision` / `MSG.hostEventFall` relay handlers and their now-unused helpers — `validateCollisionSlot`, `validateCollisionMidpoint`, `sanitizeCollisionBatch`, the `CollisionFxEvent` type, and the `ALLOWED_FALL_VERBS` whitelist. These guarded relays that have been bypassed since the P2P migration — collisions and falls now travel in the binary snapshot's JSON tail, authored by the host and replayed on non-host clients, never touching the server.
- **`reconcilePredictedLocalCart`** (`src/netcode.js`): Full removal of the old soft-lerp reconciliation function, its 8 scratch quaternions/vectors, JSDoc, and the 5 `describe.skip` test cases in `tests/netcode.test.js`. Reconciliation is now fully rewind-and-replay inline in `gameLoop.js`.
- **`inputSendTimer` / `startInputSendLoop` / `stopInputSendLoop`** (`src/netcode.js`): Removed the setInterval-based input send loop and all its start/stop call sites across 6 locations. Non-host input is now sampled synchronously in the physics loop via `sampleLocalInputForTick()`.
- **`configureP2P` / `getPeerConnections` / `getDataChannels`** (`src/netcode/p2p.js`): Removed unused re-exports and the `configureP2P` intermediate.

**2. Shared NPC Name Pool (`shared/npcNames.js` — new module)** — Verified.
- Extracted the 40-name NPC list from both `party/index.ts` and `src/npcNames.js` into `shared/npcNames.js` — single source of truth imported by both client and server.
- `src/npcNames.js` now re-exports `{ NPC_NAME_POOL }` for backward compatibility with all existing importers.

**3. Protocol MSG Reorganization (`shared/protocol.js`)** — Verified.
- Message constants reorganized into three labeled sections: Client→Server (WebSocket control plane), Host↔Client (WebRTC DataChannel gameplay plane), Server→Client (WebSocket control plane).
- `hostTransform`, `clientInput`, and `spill` moved to the P2P section. `hostAssigned` and `state` removed entirely — migration always uses `hostMigrated`, and there is no longer a `state` relay message (host state now travels as the binary `hostTransform` over the DataChannel). `spill` is no longer a server→client relay — spills travel fully peer-to-peer.

**4. Cross-Transport Stale-Host Packet Guard (`src/netcode.js`, `src/netcode/p2p.js`)** — Verified.
- `handleP2PMessage` now accepts a `fromConnId` parameter and rejects snapshots where `fromConnId !== hostId`. WebRTC DataChannels are unordered/unreliable, while `MSG.hostMigrated` arrives on the ordered WebSocket — a pre-migration snapshot can fire on the event loop after the epoch/epoch buffer clear has already happened. Rejecting by source connId prevents this race from poisoning the freshly-cleared snapshot buffer.
- `P2P.onStateCallback` now passes the connId through to `handleP2PMessage` for both binary and JSON frames.
- Test: stale-host rejection + current-host acceptance verified in `tests/netcode.test.js`.

**5. Slots Accepted Verbatim from Server (`src/netcode.js`, `src/main.js`)** — Verified.
- Server owns slot colors (displaces NPCs on human color-pick, guaranteeing distinct preset colors for every slot). Clients now accept `MSG.slots` verbatim instead of calling `declashNpcSlotColors` locally. The declash function is retained for solo/testdrive only (where the client is its own slot authority).
- The `main()` session bootstrap (after `Netcode.setRefs`) no longer calls `declashNpcSlotColors` on the server-provided slots — an inline comment explains the authoritative server ownership.

**6. Binary Decoder Protocol Constant Fix (`src/netcode/binary.js`)** — Verified.
- `decodeHostStateSnapshot` was stamping the hardcoded string `"hostTransform"`, which does not equal `MSG.hostTransform` (`"host_transform"`). The dispatcher in `handleRemoteP2PMessage` checks `data.type === MSG.hostTransform`, so **every binary snapshot was silently dropped** — the `netStateBuffer` never received a single frame from the binary path since it was introduced. Now imports and stamps `MSG.hostTransform` from the shared protocol.
- Test: explicit regression test verifies that the string literal `"hostTransform"` is rejected while `MSG.hostTransform` routes correctly.

**7. Interpolation Helper Extraction (`src/netcode.js`)** — Verified.
- Extracted `lerpVec3Pair(b, a, alpha)` and `slerpQuatPair(b, a, alpha)` from the inline lerp/slerp blocks in `sampleCartSnapshotFromPair` and `writeInterpolatedRemoteTargets`. Both helpers return `null` unless both arrays are valid, giving callers a single-signal null check for the fallback path. Eliminates ~40 lines of duplicated lerp/slerp logic.

**8. `broadcastHostTransform` Binary Encoding (`src/netcode.js`)** — Verified.
- `broadcastHostTransform` (one-shot broadcast used during rematch reset) now uses `encodeHostStateSnapshot` instead of `JSON.stringify` → `P2P.sendToAll`. Matches the 40Hz send loop's wire format. Collision/fall tails are empty for this one-shot, which is correct (no combat during rematch reset).

**9. Non-Host JSON Dispatch Fix (`src/netcode/p2p.js`)** — Verified.
- Non-host `onmessage` was filtering JSON frames to `MSG.hostTransform` only, silently dropping `MSG.spill` events (grocery spills). Now forwards every host-authored JSON event to `onStateCallback` and lets the netcode dispatcher route by `data.type`. The dispatcher is the single point that decides handling.

**10. Monotonic Clock Consistency (`src/netcode.js`, `src/gameLoop.js`)** — Verified.
- Host migration freeze deadline now uses `getMonotonicNow()` instead of `Date.now()`. Keepalive `tClient` now uses `getMonotonicNow()`. `gameLoop.js` freeze check reads `performance.timeOrigin + performance.now()` to match.

**11. End-to-End Binary Dispatch Tests (`tests/netcode.test.js`)** — Verified.
- New test hook `dispatchP2P(data, fromConnId)` drives the exact runtime path: `ArrayBuffer → decodeHostStateSnapshot → handleRemoteP2PMessage → handleRemoteHostState → bufferAuthoritativeState`. No live DataChannel needed.
- Tests: single snapshot buffer fill, monotonic sequence accumulation, stale-host rejection, and the literal `"hostTransform"` regression. `setHostIdForTest` hook added.

### July 6, 2026 – Worker ASSETS Fallback & Rigid Body Double-Free Guards

**1. Worker ASSETS Fallback (`party/index.ts`)** — Verified.
- The Worker's `fetch` handler now falls through to `env.ASSETS.fetch(request)` for non-PartyKit URLs. This allows a single Cloudflare Worker to serve both Durable Object traffic (game server) and static assets (Vite `dist/` output), eliminating the need for a separate CDN origin.
- Detection logic: `url.pathname.startsWith("/parties/")`, `"/party/"`, or `Upgrade: websocket` header → route to PartyKit. Otherwise, try ASSETS first, return if 404 is not hit.
- `env` type broadened from `Record<string, unknown>` to `Record<string, any>` to satisfy the ASSETS binding type.

**2. Rigid Body Double-Free Guards (`src/arena.js`, `src/levels/backroomsSupermarket.js`, `src/levels/testArena.js`, `src/levels/zanzibarPlatform.js`)** — Verified.
- All `world.removeRigidBody(body)` calls across 4 level files now guarded with `world.getRigidBody(body.handle)` before removal. This prevents Rapier panics when `dispose()` is called on a world where bodies were already cleaned up (e.g., rapid level swap or quit-to-menu during physics cleanup).
- Guard pattern applied to: recordBody, pitWallBody, boothBodies (arena.js), floorBody, wallBodies, ceiling.body, booth bodies, furniturePile.bodies (backrooms), floorBody, wallBodies (testArena), deck.body, booth bodies (zanzibar).

### July 6, 2026 – NaN/Infinity Guards for Binary Serialization & applyCartState

**1. Binary Decode Safety (`src/netcode/binary.js`)** — Verified.
- Added `getSafeFloat32(view, offset, littleEndian)` helper that returns `val` if `Number.isFinite(val)`, otherwise `0`.
- All 14 `view.getFloat32()` calls in `decodeHostStateSnapshot` (tHost, 3× position, 4× quaternion, 3× linear velocity, avX, ackSeq) now use `getSafeFloat32`, preventing NaN/Infinity from corrupt binary data propagating into the physics engine.
- Test added: non-finite values (NaN, Infinity, -Infinity) injected into a valid binary buffer at key offsets. Decoder correctly replaces them with 0 while preserving adjacent valid values.

**2. `applyCartState` Bounds Validation (`src/netcode.js`)** — Verified.
- All body writes (`setTranslation`, `setRotation`, `setLinvel`, `setAngvel`) and net-target writes (`_netTargetPos`, `_netTargetQuat`, `_lastNetLinvel`) now gate on `Number.isFinite()` for every float component.
- A corrupt snapshot with NaN/Infinity values leaves the Rapier body and interpolation targets completely untouched — the cart stays at its last-known-good state rather than teleporting to infinity.
- Test added: mock cart with known-good body state receives a `snap` full of NaN/Infinity — body translation, rotation, linvel, angvel all remain unchanged. Follow-up with a fully valid snap confirms normal updates still work.

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

**Last Updated:** July 8, 2026