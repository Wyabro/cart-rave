/**
 * archMap.mjs — the curated architecture seed (committed, hand-maintained, small).
 *
 * This is the ONE hand-authored source for the Living Architecture layer. Everything else
 * (the file lists, line counts, churn) is auto-collected from the tree and never committed.
 * Here we keep only what has no other doc home:
 *
 *   - `SYSTEMS` — the 18-system taxonomy: id / name / responsibility / entry / members / notes /
 *     edges. `members` are exact file paths OR directory prefixes ending in `/` (no glob lib;
 *     the resolver in archModel.mjs treats exact-path as beating a dir-prefix, and a file
 *     claimed twice by the same kind of claim is an error). Together the members must claim
 *     every file under src/ party/ shared/ exactly once — that total coverage is the liveness
 *     mechanism: a new unmapped file is a hard `health:check` error until it is placed here.
 *   - Curated content with no doc home: IMPORTANT_FILES, FRAGILE_SYSTEMS, PAST_AGENT_MISTAKES,
 *     CONVENTIONS, SAFE_MODIFICATION, PROJECT_IDENTITY, TESTING, BUILD_DEPLOY.
 *
 * Edge `via` enum (how modules actually reach each other — see docs/reference/control-flow.md):
 *   import · callbacks-object · deps-object · msg-wire · p2p-datachannel ·
 *   zustand-subscription · main-closure · dom-event.
 *
 * @typedef {"import"|"callbacks-object"|"deps-object"|"msg-wire"|"p2p-datachannel"|"zustand-subscription"|"main-closure"|"dom-event"} EdgeVia
 * @typedef {{ to: string, via: EdgeVia, detail: string }} SystemEdge
 * @typedef {{
 *   id: string,
 *   name: string,
 *   responsibility: string,
 *   entry: string[],
 *   members: string[],
 *   notes: string[],
 *   edges: SystemEdge[],
 * }} SystemDef
 */

/** The full edge-via vocabulary, exported so validators/tests can assert against it. */
export const EDGE_VIA = /** @type {const} */ ([
  "import",
  "callbacks-object",
  "deps-object",
  "msg-wire",
  "p2p-datachannel",
  "zustand-subscription",
  "main-closure",
  "dom-event",
]);

/**
 * The 18 systems. Tree-verified against `find src party shared -type f` — every .js/.ts/.css/.d.ts
 * file is claimed by exactly one system (run `node tools/health-check.mjs` to prove it).
 * @type {SystemDef[]}
 */
export const SYSTEMS = [
  {
    id: "boot-and-orchestration",
    name: "Boot & orchestration",
    responsibility:
      "The wiring spine: main.js boots the game, builds the callbacks/deps bundles that connect every other system, and owns the render loop entry. gameSession authors the netcode bridge.",
    entry: ["src/main.js"],
    members: ["src/main.js", "src/bootstrap.js", "src/orchestration/", "src/config.js", "src/utils.js"],
    notes: [
      "src/main.js is the composition root — ~1,264 lines after MAIN-1's carve (08-04) and BUNDLE-1 Lever B, down from ~2,582. `async function main()` (from :283) still spans most of the file, but it now holds composition wiring rather than domain logic: the ~84 inner functions moved into src/orchestration/ (gameBoot, menuPlayEntry, levelOrchestration, cartOrchestration, roundLifecycle, loopDeps, …). What is left inside still escapes ONLY via the callbacks/deps bundles.",
      "buildNetcodeGameBridge (gameSession.js) is the authoring site for the netcode callbacks seam — the real place to learn which main.js impl backs a callbacks.* name.",
      "config.js owns CART_COLORS + the CONFIG knob table (an invariant surface — do not modify CART_COLORS or the material traverse logic).",
    ],
    edges: [
      { to: "networking-client", via: "callbacks-object", detail: "main.js `Netcode.registerGameCallbacks(buildNetcodeGameBridge(…))` merges ~40 real impls over netcode.js's default stub `callbacks` object." },
      { to: "game-loop-and-flow", via: "deps-object", detail: "main.js calls `runGameLoop(loopState, callbacks)` — every frame decision inside is deps.isHost()/deps.getRoundState()/deps.runFixedPhysicsStep()." },
      { to: "arenas-levels", via: "deps-object", detail: "main.js calls `initLevelManager(dependencies)` — the ~20-property LevelManagerDeps typedef is the contract." },
    ],
  },
  {
    id: "game-loop-and-flow",
    name: "Game loop & flow",
    responsibility:
      "The fixed-step frame loop, round phase machine, and per-round clock. Runs physics/present decisions through injected deps and schedules Living Store directives.",
    entry: ["src/gameLoop.js"],
    members: [
      "src/gameLoop.js",
      "src/gameFlow.js",
      "src/gameContext.js",
      "src/roundClock.js",
      "src/directives/",
      "src/utils/frameBudget.js",
      "src/utils/podiumEndLatch.js",
    ],
    notes: [
      "runGameLoop receives a deps bundle (GameLoopState / PhysicsStepDeps typedefs) rather than importing main.js — the call graph is main.js → runGameLoop → deps.* → back into main.js.",
      "directiveEngine subscribes to gameStore; a gameStore shape change silently changes directive scheduling.",
    ],
    edges: [
      { to: "physics-simulation", via: "deps-object", detail: "deps.runFixedPhysicsStep({…}) / deps.getSimulationCallbacks(true) drive the host sim each fixed step." },
      { to: "state-stores", via: "zustand-subscription", detail: "directives/directiveEngine.js `gameStore.subscribe` drives mid-round directive scheduling." },
    ],
  },
  {
    id: "physics-simulation",
    name: "Physics simulation",
    responsibility:
      "Host-authoritative Rapier3D world: cart bodies, colliders, the fixed-step integrate, and the single Rapier collision callback that seeds KO/fall events.",
    entry: ["src/simulation.js"],
    members: ["src/simulation.js", "src/entities.js", "src/physics/"],
    notes: [
      "Rapier is host-AUTHORITATIVE, not host-exclusive: the host is sole authority for NPCs and remote inputs, but every predicting client steps the same world locally (gameLoop.js client-prediction branch). The server never simulates — zero Rapier in party/.",
      "Bot AI lives INSIDE simulation.js and gameFlow.js — there is no separate bots module.",
      "One Rapier collision callback: eventQueue.drainCollisionEvents((h1,h2,started)=>…) in simulation.js. world.castRay reads .handle off exclude args — pass Collider/RigidBody objects, never raw handles.",
    ],
    edges: [
      { to: "scoring-progression", via: "import", detail: "collision/fall detection raises KO events consumed by src/scoring/ reactors (koEvent/koReactors)." },
      { to: "networking-client", via: "callbacks-object", detail: "host sim results flow out through the netcode callbacks bundle (kill confirm, teleport-to-spawn, material updates)." },
    ],
  },
  {
    id: "ai-bots",
    name: "AI bots (virtual)",
    responsibility:
      "Solo NPC support. Only the rubberband assist has its own module; the actual bot decision logic is embedded in simulation.js and gameFlow.js, not extracted.",
    entry: ["src/utils/soloRubberband.js", "src/aiDifficulty.js"],
    members: ["src/utils/soloRubberband.js", "src/aiDifficulty.js"],
    notes: [
      "bot logic lives inside simulation.js and gameFlow.js — there is no bots module",
      "soloRubberband is solo-gated; it must not leak into multiplayer (verified-healthy item in project-state §5).",
    ],
    edges: [
      { to: "physics-simulation", via: "import", detail: "soloRubberband is applied inside the host sim step (solo rooms only)." },
    ],
  },
  {
    id: "networking-client",
    name: "Networking (client)",
    responsibility:
      "Client netcode: partysocket control-plane, WebRTC P2P gameplay plane, host-transform interpolation, client prediction rewind-and-replay, and host-migration handoff.",
    entry: ["src/netcode.js"],
    members: [
      "src/netcode.js",
      "src/netcode/",
      "src/hostCollisionBatch.js",
      "src/utils/reconcileReplay.js",
      "src/utils/hostCapability.js",
    ],
    notes: [
      "netcode.js declares a module-scope `let callbacks = {…}` of ~40 no-op stubs, replaced once at startup via registerGameCallbacks. Every game hook is invisible to grep.",
      "The client MSG.* dispatch mirror chain lives in netcode.js as a flat run of `if (type === MSG.x)` branches; pair each with its party/index.ts twin.",
      "Real-time telemetry (hostTransform 40Hz, clientInput, spill) is P2P (netcode/p2p.js) — never route it back through the WebSocket.",
    ],
    edges: [
      { to: "networking-server", via: "msg-wire", detail: "MSG.* control-plane dispatch over the partysocket WebSocket (join/colorPick/readyToggle/hostRound/SDP/ICE)." },
      { to: "networking-server", via: "p2p-datachannel", detail: "P2P.sendToAll (host) / P2P.sendToPeer(hostId,…) (client) carry hostTransform, clientInput, spill; kill-feed rides the snapshot JSON tail." },
      { to: "boot-and-orchestration", via: "callbacks-object", detail: "internal netcode game hooks are backed by main.js impls merged in via buildNetcodeGameBridge." },
    ],
  },
  {
    id: "networking-server",
    name: "Networking (server)",
    responsibility:
      "The partyserver Durable Object: room + WebSocket lifecycle, slot management, ready-up/round lifecycle, WebRTC signaling + TURN minting, host selection, round validation, connection reaping.",
    entry: ["party/index.ts"],
    members: [
      "party/index.ts",
      "party/constants.ts",
      "party/hostSelection.ts",
      "party/roundValidation.ts",
      "party/rateLimit.ts",
      "party/connectionReaper.ts",
      "party/hostRearm.ts",
      "party/slotReconcile.ts",
    ],
    notes: [
      "The server NEVER simulates physics (invariant). CartRaveServer.onMessage (index.ts, ~500-line method) is a flat if(type===MSG.x) chain with bodies inlined.",
      "room.getConnections() returns an iterator — spread or for…of, never .map().join().",
      "Pure helpers (hostSelection, roundValidation, rateLimit, connectionReaper, hostRearm, slotReconcile) + party/constants.ts thresholds are unit-tested; A5b DO harness lives in tests/party-do/ (Workers Vitest pool).",
    ],
    edges: [
      { to: "networking-client", via: "msg-wire", detail: "server broadcasts MSG.gameStart / hostSpawn / lobby + relays SDP/ICE back to clients over the WebSocket." },
      { to: "shared-protocol", via: "import", detail: "message keys + round constants are single-sourced from shared/ (protocol.js, roundConstants.js, readiness.js)." },
    ],
  },
  {
    id: "rendering-and-postfx",
    name: "Rendering & post-FX",
    responsibility:
      "Three.js scene assembly, the EffectComposer post chain (RenderPass → OutputPass → Bloom → Arcade/VHS → FXAA on the default display pipe), contact shadows, the shared Draco loader, and the quality/LOD tier machinery.",
    entry: ["src/scene.js"],
    members: [
      "src/scene.js",
      "src/frameVisuals.js",
      "src/contactShadows.js",
      "src/loaders/",
      "src/utils/autoQuality.js",
      "src/utils/cheapMirror.js",
      "src/utils/device.js",
      "src/utils/gpuCaps.js",
      "src/utils/levelLod.js",
      "src/utils/mergeStaticMeshes.js",
      "src/utils/qualityMode.js",
      "src/utils/qualityTiers.js",
    ],
    notes: [
      "Composer path, DEFAULT (?bloompipe=display): RenderPass → OutputPass → Bloom → Arcade(VHS) → FXAA. ?bloompipe=hdr swaps to Bloom → OutputPass; OutputPass is never last in either path. toneMapping is a no-op into composer RTs without OutputPass — except on the lowest tier, which bypasses the composer entirely (composerBypass) and tone-maps natively.",
      "Half-res bloom RTs; strength compensated via bloomHalfResStrengthMul. VFX-1 closed: display-referred byte mips.",
      "material.envMapIntensity is a no-op against scene.environment — use scene.environmentIntensity.",
      "frameVisuals.js is cross-cutting (secondary owner: vfx); it lives here as the per-frame present owner.",
    ],
    edges: [
      { to: "arenas-levels", via: "import", detail: "scene/frameVisuals consume arena meshes + reactive lights built by levelManager and the level modules." },
      { to: "dev-tools", via: "import", detail: "postFxDebug / gameplayTunePane read + tweak the composer uniforms and quality tiers live." },
    ],
  },
  {
    id: "arenas-levels",
    name: "Arenas & levels",
    responsibility:
      "Level preview + hot-swap (levelManager), arena shell + reactive lights + scene extras, and the four ~3k-line level modules loaded through a dynamic importer table.",
    entry: ["src/levels/levelManager.js"],
    members: [
      "src/levels/levelManager.js",
      "src/levels/arena.js",
      "src/levels/arenaReactiveLights.js",
      "src/sceneExtras.js",
      "src/levels/",
    ],
    notes: [
      "Levels load through LEVEL_IMPORTERS in src/levels/index.js — a dynamic id→import() table, NOT a barrel. The four level modules are reachable only through it.",
      "initLevelManager consumes the ~20-property LevelManagerDeps typedef — read it before touching level swaps.",
      "arenaCatalog.js is the pure-data authoring source for labels/themes/music/ambience/unlocks (D-CONTENT-1).",
    ],
    edges: [
      { to: "boot-and-orchestration", via: "deps-object", detail: "levelManager is driven entirely through the LevelManagerDeps bundle passed from main.js (performLevelLoad, finalizeArenaForPlay, warmupAfterLevelSwap, …)." },
      { to: "audio-music-announcer", via: "import", detail: "level modules + arenaCatalog select per-arena music/ambience beds." },
    ],
  },
  {
    id: "carts-and-customization",
    name: "Carts & customization",
    responsibility:
      "Cart entity + the rave GLB rig, cosmetic pattern/theme tables, and the customization flow that applies them.",
    entry: ["src/carts/cart.js"],
    members: [
      "src/carts/",
    ],
    notes: [
      "cartRaveGltf.js is the userData state-machine hub — raveGltfPartRole/cartVisual/deathState/followState keys drive behavior with no call edges (grep the userData key, not a caller).",
      "Pattern customize UI is blocked on cartrave4 body UVs (needs a 2nd UV channel) — C1/C3 in SHIP-1.",
    ],
    edges: [
      { to: "rendering-and-postfx", via: "import", detail: "cart meshes/materials are added to the Three.js scene and post pipeline." },
      { to: "state-stores", via: "zustand-subscription", detail: "cosmetic selection flows through unlockStore / settingsStore (customization applies stored slots)." },
    ],
  },
  {
    id: "vfx",
    name: "VFX",
    responsibility:
      "Gameplay effects: grocery spill pool + definitions, KO hitmarkers, water-death FX, cart shatter, cargo load visuals, and the shared visuals helpers.",
    entry: ["src/effects.js"],
    members: [
      "src/effects.js",
      "src/effects/",
      "src/effects/index.js",
      "src/cartShatter.js",
      "src/cargoLoad.js",
    ],
    notes: [
      "MP-FX-1 (SHIP-1 A3): non-host players miss some gameplay VFX — audit host-local vs replicated effects.",
      "cargoLoad.js is the Living Cargo bay/handling reconciler (cart = scoreboard).",
    ],
    edges: [
      { to: "rendering-and-postfx", via: "import", detail: "effects instantiate meshes/particles into the scene graph." },
      { to: "scoring-progression", via: "import", detail: "KO / spill events trigger hitmarker + shatter + cargo visuals." },
    ],
  },
  {
    id: "audio-music-announcer",
    name: "Audio, music & announcer",
    responsibility:
      "Howler audio graph + SFX synth, per-arena music + ambient beds, and 'The Store PA' announcer (arbitration, events, director, lines, stings, voice keys).",
    entry: ["src/audioManager.js"],
    members: [
      "src/audioManager.js",
      "src/audioSetup.js",
      "src/sfxSynth.js",
      "src/music/",
      "src/ambience/",
      "src/announcer/",
    ],
    notes: [
      "Howler lifecycle: onload/onplay/onend in audioManager.js. audioStore has exactly one subscriber (`audioStore.subscribe` in audioManager.js).",
      "announcerDirector subscribes to gameStore (`gameStore.subscribe` in announcerDirector.js) — a gameStore shape change silently changes announcer behavior.",
      "No loudnorm on loops; SFX bus target ~-16 LUFS, music ~-13.5.",
    ],
    edges: [
      { to: "state-stores", via: "zustand-subscription", detail: "audioManager.js subscribes to audioStore; announcerDirector.js subscribes to gameStore." },
      { to: "scoring-progression", via: "import", detail: "KO/scoring events drive announcer stings + directive callouts." },
    ],
  },
  {
    id: "ui-hud-menu",
    name: "UI, HUD & menu",
    responsibility:
      "The DOM menu (index.html-driven) + its CSS, the in-game HUD + center-stage arbiter, overlays (pause/results/loading), and all src/ui/ widgets + styles.",
    entry: ["src/ui/cart-rave-menu.js"],
    members: [
      "src/ui/cart-rave-menu.js",
      "src/ui/styles/cart-rave-menu.css",
      "src/hud.js",
      "src/animations.js",
      "src/ui/",
      "src/utils/edgeDanger.js",
    ],
    notes: [
      "index.html is canonical for menu markup — cart-rave-menu.html was deleted, do not recreate it.",
      "hud.js updateStatus() owns the countdown beat display (COUNTDOWN-SYNC-1 lives here). hud.js has zero unit tests (WebGL-adjacent) — gate via visual QA.",
      "DOM custom events (cartrave:menu / level-changed / customization-changed / round-started) are a 4-name seam — no emitter class.",
      "cart-rave-menu.js keeps its own color/name state overridden by game wiring via localStorage + listeners in initMenu().",
    ],
    edges: [
      { to: "boot-and-orchestration", via: "dom-event", detail: "cartrave:menu / cartrave:round-started custom events cross between the menu DOM and main.js (~13 sites)." },
      { to: "state-stores", via: "zustand-subscription", detail: "cart-rave-menu.js subscribes to challengeStore + unlockStore for lobby UI." },
    ],
  },
  {
    id: "input-camera",
    name: "Input & camera",
    responsibility:
      "Keyboard/gamepad/touch input sampling, the analog-deflection mapping consumed by simulation, camera framing (no lerp/slerp smoothing), and haptics.",
    entry: ["src/input.js"],
    members: ["src/input.js", "src/touchControls.js", "src/camera.js", "src/haptics.js"],
    notes: [
      "No camera lerp/slerp smoothing — intentionally removed, do not reintroduce (invariant).",
      "simulation.js reads axis.turn/axis.forward as an analog deflection; keyboard eases -1/0/1 to match the stick (INPUT-KB-1, 0.07s attack / 0.05s release).",
      "camera.js getCinematicCountdownWarmupPose feeds the round-start warm-up pass (COUNTDOWN-WARM-1).",
    ],
    edges: [
      { to: "physics-simulation", via: "import", detail: "sampled input axes are read by the host sim; client input is sent P2P per 60Hz fixed-step sample." },
      { to: "input-camera", via: "import", detail: "touchControls (nipplejs) + haptics feed the same input axes on mobile." },
    ],
  },
  {
    id: "state-stores",
    name: "State stores",
    responsibility:
      "The six Zustand stores + localStorage persistence. A setState anywhere fires subscribers elsewhere with zero syntactic link.",
    entry: ["src/stores/gameStore.js"],
    members: ["src/stores/", "src/utils/storage.js"],
    notes: [
      "gameStore blast radius (grep `gameStore.subscribe`): analytics/gameplayAnalytics, announcer/announcerDirector, directives/directiveEngine, utils/gameplayDiagnostics — changing a gameStore field's meaning changes all four.",
      "STORE-1 closed: src/gameState.js deleted; named command functions live on stores/gameStore.js.",
      "settingsStore / cartTuningStore are read via getState() only — no subscribers.",
    ],
    edges: [
      { to: "diagnostics-observability", via: "zustand-subscription", detail: "gameplayAnalytics + gameplayDiagnostics subscribe to gameStore/challengeStore/unlockStore." },
      { to: "ui-hud-menu", via: "zustand-subscription", detail: "menu + HUD react to challengeStore/unlockStore setState." },
    ],
  },
  {
    id: "scoring-progression",
    name: "Scoring & progression",
    responsibility:
      "The KO event system (one fall fans out to reactors), match-stats spine, progression event ids, and lifetime cosmetic/level unlock config.",
    entry: ["src/scoring/koEvent.js"],
    members: ["src/scoring/", "src/progression/", "src/unlockConfig.js"],
    notes: [
      "One fall event fans out to reactors: match stats, challenges, kill confirm, arena VFX, feed, announcer (see scoring-event-system.md).",
      "A round that ends with no scores is a legitimate draw — neither victory nor defeat.",
    ],
    edges: [
      { to: "state-stores", via: "zustand-subscription", detail: "KO reactors update challengeStore/unlockStore; match stats persist via storage." },
      { to: "vfx", via: "import", detail: "KO events drive hitmarker + arena VFX reactors." },
    ],
  },
  {
    id: "diagnostics-observability",
    name: "Diagnostics & observability",
    responsibility:
      "The whole telemetry layer: client analytics, perf/long-task/black-frame probes, gameplay diagnostics, invariants, capture upload + error reporting, and the server-side log helpers.",
    entry: ["src/utils/diagnostics.js"],
    members: [
      "src/analytics/",
      "src/utils/aiStallWatchdog.js",
      "src/utils/blackFrameMonitor.js",
      "src/utils/bootTimeline.js",
      "src/utils/buildFreshness.js",
      "src/utils/buildInfo.js",
      "src/utils/captureUpload.js",
      "src/utils/devLog.js",
      "src/utils/diagnostics.js",
      "src/utils/errorReporter.js",
      "src/utils/gameplayDiagnostics.js",
      "src/utils/invariants.js",
      "src/utils/longTaskProbe.js",
      "src/utils/perfSpans.js",
      "src/utils/rendererInfo.js",
      "src/utils/publicUrl.js",
      "party/errorLog.ts",
      "party/analyticsLog.ts",
      "party/captureLog.ts",
      "party/logUtil.ts",
      "party/beaconLimit.ts",
      "party/adminAuth.ts",
    ],
    notes: [
      "Diagnostics globals namespace is __cc* (__ccTest / __ccDiag / __ccLoopDbg). F8 (or auto on error+assert) captures a bug bundle.",
      "adminAuth.ts is SEC-TOKEN-1 — Authorization: Bearer only for /api/errors|captures|analytics admin reads; never ?token=. requireAdminToken → Response | null (null = ok).",
      "beaconLimit.ts is the SEC-BEACON-1 per-IP cap on the three open POST beacons. Enforced INSIDE each log DO (before the INSERT) because the harm is ring eviction; the budget is per-DO, not shared. index.ts forwards cf-connecting-ip inward and propagates the DO's 429 outward — /api/log-error and /api/analytics otherwise always return 204 and the cap would be invisible.",
      "gameplayDiagnostics subscribes to gameStore/challengeStore/unlockStore — a reader, not a mutator.",
      "perfSpans attributes per-call-site render cost (warm.render.default.play-full named the PERF-WARM owner).",
    ],
    edges: [
      { to: "state-stores", via: "zustand-subscription", detail: "gameplayAnalytics + gameplayDiagnostics subscribe to gameStore/challengeStore/unlockStore to observe play." },
      { to: "networking-server", via: "msg-wire", detail: "captureUpload / errorReporter POST bundles to /api/* served by the Worker; party/*Log.ts persist them." },
    ],
  },
  {
    id: "shared-protocol",
    name: "Shared protocol",
    responsibility:
      "The client↔server single-source contract: MSG keys, round constants, readiness semantics, arena pool, WS message limits, NPC names — the only code both planes import.",
    entry: ["shared/protocol.js"],
    members: ["shared/", "src/npcNames.js"],
    notes: [
      "ROUND_DURATION_MS lives in shared/roundConstants.js (150_000); both config.js and roundValidation.ts import it — do not re-introduce a hardcoded duplicate.",
      "MIN_MATCH_DURATION_MS lives in shared/analyticsConstants.js — product match floor for analyticsLog #summary + gameplayAnalytics match_ended skip (ANLX-BULK-1).",
      "src/npcNames.js is a re-export shim over shared/npcNames.js.",
      "MSG.readyToggle without a `ready` field is a TOGGLE — programmatic ready must send { ready: true } (readiness.js is the idempotent SET, D-READY-1).",
    ],
    edges: [
      { to: "networking-client", via: "import", detail: "src/netcode.js imports MSG/round constants from shared/." },
      { to: "networking-server", via: "import", detail: "party/index.ts imports the same shared/ constants — the wire is the only cross-plane contract." },
    ],
  },
  {
    id: "dev-tools",
    name: "Dev tools",
    responsibility:
      "In-app dev panel + command registry, Tweakpane tuning surfaces (postFX / gameplay / rave GLB), global type decls, and the headless test/perf harness shims.",
    entry: ["src/dev/index.js"],
    members: [
      "src/dev/",
      "src/postFxDebug.js",
      "src/gameplayTunePane.js",
      "src/raveGltfCartTweakpane.js",
      "src/globals.d.ts",
      "src/utils/debugParams.js",
      "src/utils/netTestHarness.js",
      "src/utils/perfPump.js",
      "src/utils/visualHarness.js",
    ],
    notes: [
      "perfPump defeats hidden-tab rAF throttling (?perfPump, DEV) — shoot/harness tools pass it.",
      "netTestHarness / visualHarness expose __cc* hooks the Playwright rigs drive; not shipped behavior.",
      "globals.d.ts is the only .d.ts in src/ — ambient window.__cc* typings.",
    ],
    edges: [
      { to: "rendering-and-postfx", via: "import", detail: "postFxDebug / gameplayTunePane bind Tweakpane controls to composer + quality uniforms." },
      { to: "diagnostics-observability", via: "import", detail: "the dev panel surfaces perfSpans / diagnostics readouts." },
    ],
  },
];

/**
 * The ~15 files a fresh agent most often mis-reads. Curated because their role is not obvious
 * from the path and there is no other doc that carries it inline.
 * @type {Array<{ path: string, role: string }>}
 */
export const IMPORTANT_FILES = [
  { path: "src/main.js", role: "Entry point + render loop + system wiring; one ~5.3k-line main() closure holding ~84 unexported inner functions (they escape via callbacks/deps bundles, not exports)." },
  { path: "src/orchestration/gameSession.js", role: "buildNetcodeGameBridge — authors the netcode callbacks bundle; the map from callbacks.* name → real main.js impl." },
  { path: "src/netcode.js", role: "Client netcode: the module-scope `callbacks` stub object, the MSG.* mirror dispatch, prediction + host maintain." },
  { path: "src/netcode/p2p.js", role: "WebRTC peers/DataChannels, ICE grace, TURN wait — the gameplay plane. hostTransform/clientInput/spill only." },
  { path: "src/netcode/binary.js", role: "Host snapshot encode/decode, bounds-checked. 40Hz binary transforms + JSON kill-feed tail." },
  { path: "src/simulation.js", role: "Host Rapier physics + the single drainCollisionEvents callback; bot decision logic lives here too." },
  { path: "src/levels/levelManager.js", role: "Level preview + hot-swap; driven by the LevelManagerDeps typedef contract — read the typedef before touching swaps." },
  { path: "src/levels/index.js", role: "LEVEL_IMPORTERS dynamic id→import() table, a loader NOT a barrel — the only way the four level modules are reached." },
  { path: "src/carts/cartRaveGltf.js", role: "userData state-machine hub (raveGltfPartRole/cartVisual/deathState/followState) — grep the userData key, there are no call edges." },
  { path: "src/config.js", role: "CART_COLORS (invariant, do not modify) + the CONFIG knob table incl. CONFIG.round.durationMs (imports ROUND_DURATION_MS)." },
  { path: "src/hud.js", role: "In-game HUD; updateStatus() owns the countdown beat display (COUNTDOWN-SYNC-1). No unit tests — visual-QA gated." },
  { path: "src/stores/gameStore.js", role: "The highest-blast-radius store: 4 subscribers (analytics, announcer, directives, diagnostics) react to every shape change, all keyed off roundPhase. Named command functions (addScore, syncRoundPhase, pickTimerWinner) live here after STORE-1. The diagnostics subscriber is ?diag-gated, so fewer run in an ordinary session; many more modules poll getState() instead." },
  { path: "party/index.ts", role: "partyserver Durable Object CartRaveServer; onMessage flat MSG.* chain (~801). Relay/room state only — never physics. Pure helpers unit-tested (A5a); DO harness in tests/party-do/ (A5b)." },
  { path: "shared/roundConstants.js", role: "ROUND_DURATION_MS single source (150_000) imported by both config.js and roundValidation.ts." },
  { path: "shared/protocol.js", role: "MSG.* wire keys — the single cross-plane contract; the only shared function surface is these constants." },
];

/**
 * Systems where a wrong edit fails silently or reopens a closed class of bug. Rendered with a
 * caution stripe on the architecture page.
 * @type {Array<{ system: string, why: string }>}
 */
export const FRAGILE_SYSTEMS = [
  { system: "networking-client", why: "The `callbacks` seam is THREE sites, not two: the default stub in netcode.js's callbacks literal → the registerGameCallbacks adapter → the impl in buildNetcodeGameBridge. The adapter RENAMES (bridge `onHopLand` → literal `onHopLandRef`), so literal and bridge keys do not match — only adapter↔bridge are name-coupled. Miss a site and you get a silent no-op, not an error. HALF OF THIS IS NOW GATED (re-checked 08-05): the 12 BUNDLE-1 Lever E keys in `DEFERRED_GAME_CALLBACK_KEYS` (netcode.js:434) are asserted on both sides by tests/netcodeDeferredCallbacks.test.js, which also proves each bridge lambda delegates to the same-named context key. The rename hazard is NOT in that set — `onHopLandRef` and the rest of the ~40-impl table are still unguarded, so the three-site rule below is what protects them. MSG.* is NOT hand-mirrored: shared/protocol.js is one module imported by both planes — never duplicate a key that lives there." },
  { system: "networking-server", why: "Host-authoritative + migration invariants: promote-oldest ON DISCONNECT (lobby quality rebalance can override it via pickPreferredHostId once the score margin is cleared), #lastSeq reset, P2P teardown/re-init. A rewrite reopens closed NET-* bugs (explicitly NOT pre-ship work). getConnections() is an iterator. Live example of how this fails quietly (FIX-MIG, 08-04): migration triggers 1–4 — host `onClose`, silent reap, ghost exorcism, snapshot repair — broadcast `host_migrated` with NO `reason` field, and the client toast block (netcode.js:2260) handles only `host_quality` / `host_afk` / `host_return`, so a migration that worked perfectly looks to the player like nothing happened. Migration correctness and migration *visibility* are separate surfaces here; changing one does not test the other." },
  { system: "physics-simulation", why: "Rapier is host-AUTHORITATIVE — the host is sole authority for NPCs and remote inputs, but every predicting client steps the same world locally (gameLoop.js client-prediction branch); do not assume the host is the sole peer running physics. castRay exclude wants the object not the .handle (silent exclusion disable); collision logic must not move server-side." },
  { system: "boot-and-orchestration", why: "STILL FRAGILE, NEW REASON (re-checked 08-05). The old hazard is gone — MAIN-1 carved the closure (closed 08-04) and BUNDLE-1 Lever B cut main.js 2,582 → 1,264 lines, with domain bodies now in src/orchestration/. The carve replaced it with a sharper one: those bodies reach the spine through LATE-BOUND slots. FIX-BOOST (`39939e0`) was a hoisted function turned into a `let` stub that `createCartOrchestration` assigns AFTER `HUD.init` runs — every consumer that took the reference BY VALUE before the assignment kept the stub for the whole session. Arrow call sites survived; the by-value one did not; nothing errored, the boost meter simply never showed. Hand consumers a wrapper (`() => fn()`), never the binding. Second seam, from BUNDLE-1 Levers C–E: gameBoot / menuPlayEntry / levelOrchestration / netcode+cartOrchestration are behind dynamic imports, so a missing bundle key is a silent no-op inside a lazily-loaded path — the 12 deferred netcode keys are asserted both ways by tests/netcodeDeferredCallbacks.test.js, the rest of the bundle is not." },
  { system: "rendering-and-postfx", why: "The composer pass ORDER is load-bearing (toneMapping no-ops without OutputPass; envMapIntensity no-ops against scene.environment). Ablate + shoot/blackframes before postFX rewrites." },
  { system: "state-stores", why: "A gameStore field's meaning is depended on by 4 subscribers with no syntactic link, all keyed off roundPhase — changing it silently changes announcer/directive/analytics behavior. The diagnostics subscriber is ?diag-gated, so fewer are live in an ordinary session; many more modules poll getState(), which widens the blast radius of a rename." },
];

/**
 * Concrete mistakes prior agents made on this codebase — the fastest way to teach a new agent
 * what looks-right-but-isn't.
 * @type {string[]}
 */
export const PAST_AGENT_MISTAKES = [
  "Concluded a function was dead because grep found no importers — it was an inner main() function reached via the callbacks/deps bundle. Check control-flow.md § Invisible edges first.",
  "Added a netcode hook to the callbacks literal but forgot to wire it in buildNetcodeGameBridge → silent no-op that 'landed' but did nothing.",
  "Passed a raw Rapier .handle to castRay's exclude args (wants the Collider/RigidBody object) → exclusion silently disabled.",
  "Sent MSG.readyToggle with no `ready` field expecting a set → it TOGGLED (programmatic ready must send { ready: true }).",
  "Gated the host MP countdown on whenArenaRotationSettled (c8df8fd) → regressed first-join (ready-up screen returned / no countdown). Reverted. Do not re-try; the lever is pre-warming arena programs, not delaying the countdown.",
  "Turned perf knobs before instrumenting (PERF-WARM) → reverted. Spans named the owner; guessing at levers did not.",
  "Set material.envMapIntensity to scale IBL against scene.environment → no-op in this three version; use scene.environmentIntensity.",
  "Trusted a local grep as 'verified' — the remote is authoritative; pull cart-clash and confirm HEAD before claiming done.",
];

/**
 * Repo-wide coding conventions, curated (they have no single doc home; scattered across AGENTS.md
 * + control-flow.md + practice).
 * @type {string[]}
 */
export const CONVENTIONS = [
  "Free functions, not OO — ~679 `export function`, 5 classes. Modules are stateful singletons consumed via `import * as X`.",
  "Types are JSDoc, not TypeScript, in src/ (allowJs/checkJs, strict:false, noEmit). Only party/*.ts is real TypeScript. Stay on TS 6.x.",
  "All imports are relative — no tsconfig path aliases (prod-only Vite aliases + a test-time Rapier stub are the sole exceptions).",
  "Names are long + domain-prefixed (updateRaveGltfCasterRollPivot, disposeSceneExtras) — only ~5% of exports collide on a bare name; grep the full symbol.",
  "PowerShell environment: Select-String not grep; single-line commit messages; git add surgically (never -A — concurrent agent sessions).",
  "Round length single-sourced as ROUND_DURATION_MS in shared/roundConstants.js — never hardcode 150000.",
  "Diagnostics globals live under the __cc* namespace (__ccTest / __ccDiag / __ccLoopDbg).",
  "Storage/Worker/cartRave* IDs are naming-frozen until a deliberate brand cutover (brand.md); UI copy says Cart Clash.",
];

/**
 * Per-system 'where is the boundary you must not cross' notes. Keyed by system id. read_first
 * points every agent at the control-flow map before a cross-module change.
 * @type {{ read_first: string[], systems: Record<string, string> }}
 */
export const SAFE_MODIFICATION = {
  read_first: [
    "docs/reference/control-flow.md — the invisible edges (callbacks/deps/MSG/zustand/main-closure); read before ANY cross-module change.",
    "AGENTS.md § Architecture Invariants — host-authoritative, no server physics, no camera smoothing, CART_COLORS frozen, rounds start only via MSG.gameStart.",
  ],
  systems: {
    "boot-and-orchestration": "Adding a hook that main() should provide means adding it to the callbacks/deps bundle too, or it never escapes the closure. main.js IS carved now (MAIN-1 closed 08-04, ~1,264 lines): put new domain bodies in src/orchestration/, not back in main.js. Hand consumers a wrapper (`() => fn()`) rather than a late-bound binding, or they freeze the stub forever and fail silently (FIX-BOOST).",
    "networking-client": "Add a netcode hook in THREE places (netcode.js callbacks literal → registerGameCallbacks adapter → buildNetcodeGameBridge); the adapter renames, so literal and bridge keys differ. MSG.* lives once in shared/protocol.js — never duplicate it. Never route hostTransform/clientInput/spill through the WebSocket.",
    "networking-server": "Relay + validation + lifecycle only — never simulate physics. Iterate getConnections() with for…of. No migration-model rewrite pre-ship.",
    "physics-simulation": "Host-authoritative — clients predict with the same world; the host owns NPCs + remote inputs. castRay exclude takes the object not .handle. Do not move collision logic server-side. Bot logic edits live here (no bots module).",
    "arenas-levels": "Change level swaps only through the LevelManagerDeps contract; add levels to LEVEL_IMPORTERS (not a barrel import). Arena content is data in arenaCatalog.js.",
    "rendering-and-postfx": "Preserve composer pass order (OutputPass before Arcade; toneMapping depends on it). Bloom's position varies by ?bloompipe — after OutputPass on the default display pipe, before it under hdr. Ablate + shoot/blackframes before large postFX changes. The look is governed by docs/reference/art-direction.md — per-arena exposure/bloom budgets, no global 'keep it dark' number; screen filters are Storerooms-only.",
    "state-stores": "Treat a gameStore field's meaning as a public contract — its 4 subscribers (all keyed off roundPhase; the diagnostics one is ?diag-gated) are the blast radius, and more modules poll getState() on top. Import round-state commands from stores/gameStore.js only (STORE-1 closed).",
    "audio-music-announcer": "No loudnorm on loops; respect the per-bus loudness targets. Announcer voice assets are data-driven drop-ins. SD music low-pass is shared-Howler-bus surgery.",
    "ui-hud-menu": "index.html is canonical menu markup — never recreate cart-rave-menu.html. hud.js countdown display is presentational; gameplay unlock is gated on phase, not the banner.",
    "input-camera": "No lerp/slerp camera smoothing. Keyboard axis easing must match the analog stick deflection simulation.js reads.",
    "scoring-progression": "One fall = one KO event fanned to reactors — add a reactor, don't fork the event. A no-score round is a legitimate draw.",
    "shared-protocol": "This is the only cross-plane contract — a change here is a change to BOTH client and server. Never duplicate a constant that lives here.",
    "diagnostics-observability": "Read-only observers of stores/perf — never mutate game state from here. Keep the __cc* namespace.",
    "dev-tools": "Not shipped behavior — safe to iterate, but don't let a harness hook become a runtime dependency of the game.",
    "vfx": "Effects are largely host-local today (MP-FX-1) — replicate deliberately, and pool/dispose (shatter size + boost-bar leaks were real bugs).",
    "carts-and-customization": "CART_COLORS + the material traverse are the 'Original Rave' invariant (only ART-PALETTE-1 may unfreeze). Pattern UI is blocked on cartrave4 re-UV. New cart surfaces follow the material contract in docs/reference/art-direction.md — no untextured hero material.",
    "game-loop-and-flow": "Rounds start only via MSG.gameStart — no tick-level auto-starts in update(). Directive modifiers must not mutate CONFIG mid-round (DIR-1).",
    "ai-bots": "Solo rubberband is solo-gated — must not leak into multiplayer. Real bot logic is in simulation.js/gameFlow.js.",
  },
};

/**
 * The cold-start read order every tool should follow. Curated (mirrors AGENTS.md rehydration,
 * with ARCHITECTURE.json added as the shared codebase-understanding layer).
 * @type {string[]}
 */
export const AGENT_READ_ORDER = [
  "docs/BRIEFING.md — generated + committed cold-start door (phase · the one active item · do-nots).",
  "AGENTS.md — canonical rules, invariants, and how work is executed.",
  "docs/STATUS.md — declared phase / mission / blockers / gotchas.",
  "docs/ARCHITECTURE.json — this manifest: system map, important files, safe-modification boundaries.",
  "npm run dashboard — observed evidence (git HEAD, gates, captures) when you can run npm.",
];

/**
 * The validation an agent MUST run before claiming done — curated (it is the AGENTS.md
 * definition-of-done, restated here as machine-readable steps for the manifest).
 * @type {string[]}
 */
export const REQUIRED_VALIDATION = [
  "npm run qa — report results BY NUMBER (never hardcode stale totals); it self-heals BRIEFING + fails on doc/arch drift.",
  "npm run build when the change touches the client bundle.",
  "Pull cart-clash and confirm the change is in origin HEAD before saying 'done' — a local grep is not proof.",
  "Behavior-changing work needs a human playtest on production after deploy. Seed a BACKLOG ## Playtest owed row (Owed: Wyatt playtest — ID — check + <br>1. steps) and run npm run playtest:console before Wyatt's turn. STATUS prose is not a seed.",
  "Cross-module change? Read docs/reference/control-flow.md first — most edges are not imports.",
];

/** Project identity constants — curated, stable. */
export const PROJECT_IDENTITY = {
  name: "Cart Clash",
  one_liner:
    "Browser-based 4-player shopping-cart physics sumo — neon carts ram opponents off arena edges or into voids to score; 150-second rounds, Sudden Death on ties.",
  production_url: "https://www.cartclash.lol/",
};

/**
 * Testing posture — curated from AGENTS.md § Commands (stable facts, not observed evidence).
 */
export const TESTING = {
  gate: "npm run qa",
  gate_expands_to: "status:size + typecheck + test + knip + briefing + health:check",
  commands: [
    "npm run qa — full gate (same as CI); report results by number, never hardcode stale totals",
    "npm test — Vitest suite (count drifts)",
    "npm run typecheck — tsc --noEmit (JSDoc-checked JS + party/*.ts)",
    "npm run battery — headless regression sweep (gameplay + netcode rigs), JSON report in .diag-captures/",
    "npm run release:check — exact-HEAD complete-battery release gate (out of ordinary PR CI)",
  ],
  notes: [
    "WebGL-adjacent files (scene.js, cartRaveGltf.js, hud.js, sceneExtras.js, cartShatter.js) are gated by the visual-QA pipeline (shoot/compare/blackframes), not unit tests.",
    "Behavior-changing work needs a human playtest on production after deploy before it counts as done. Seed the BACKLOG Playtest owed row and run npm run playtest:console first.",
  ],
};

/** Build + deploy posture — curated from AGENTS.md § Commands / STACK. */
export const BUILD_DEPLOY = {
  build: "npm run build (Vite → dist/)",
  deploy: "npm run ship = vite build && npx wrangler deploy",
  dev: "npm run dev:local (Vite :4000 + Wrangler :8899; aliases dev:cart-clash / dev:next-level)",
  hosting: "Cloudflare Workers + Durable Objects (DO class CartRaveServer); the Worker serves the client from dist/ ASSETS and hosts the room — no separate static host, not the PartyKit hosted platform.",
  branch: "cart-clash (active) → main (production mirror); CI runs qa + production build on push/PR.",
};
