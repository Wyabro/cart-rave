// === BUNDLE-1 Lever B: the game half of main() ===
// * Extracted verbatim from src/main.js. STILL STATICALLY IMPORTED — this lever is a pure
// * code move (zero behaviour change, zero byte change); Lever C is what flips the call
// * site to `await import()`. Everything main() and this module share crosses the seam
// * through the single mutable `ctx.refs` object: a reassigned module-scope `let` does not
// * survive a chunk boundary, an object property mutation does.

import * as THREE from "three";
import * as AudioManager from "../audioManager.js";
import * as ArenaAmbience from "../ambience/arenaAmbience.js";
import * as CameraMod from "../camera.js";
import * as Effects from "../effects.js";
import * as Entities from "../entities.js";
import * as GameState from "../gameState.js";
import * as HUD from "../hud.js";
import * as Input from "../input.js";
import * as Netcode from "../netcode.js";
import * as Simulation from "../simulation.js";
import * as SfxSynth from "../sfxSynth.js";
import { createGameContext } from "../gameContext.js";
import { createLevelOrchestration } from "./levelOrchestration.js";
import { registerGameTeardownHooks } from "./gameTeardownHooks.js";
import { initAudioSystem } from "../audioSetup.js";
import { initAnnouncerStings } from "../announcer/announcerStings.js";
import {
  announce,
  getAnnouncerDebugState,
  initAnnouncer,
  registerAnnouncerVoicePack,
  setAnnouncerPresenter,
  stopAnnouncer,
} from "../announcer/announcerManager.js";
import { ANNOUNCER_EVENTS } from "../announcer/announcerEvents.js";
import { expandAnnouncerVoiceKeys } from "../announcer/announcerVoiceKeys.js";
import {
  announcerDirectorNearMissScan,
  announcerDirectorOnFall,
  initAnnouncerDirector,
} from "../announcer/announcerDirector.js";
import { initAnnouncerDisplay } from "../ui/announcerDisplay.js";
import {
  clearActiveDirective,
  initDirectiveEngine,
  shiftDirectiveTimersBy,
} from "../directives/directiveEngine.js";
import { clearNpcCartCache, resetReconciliationState } from "../gameLoop.js";
import { settingsStore } from "../stores/settingsStore.js";
import { AUDIO_VOLUME_DEFAULT, AUDIO_VOLUME_MAX } from "../stores/audioStore.js";
import { CHALLENGE_POOL, challengeStore } from "../stores/challengeStore.js";
import { onUnlockGranted } from "../stores/unlockStore.js";
import { resetMatchStats, setMatchStatsLocalSlot } from "../scoring/matchStats.js";
import { STAGE_PRIORITY } from "../ui/centerStage.js";
import {
  getIsMuted,
  getMusicVolume,
  getSfxVolume,
  getVoiceVolume,
  setAllAudioMuted,
  setMusicGainValue,
  setSfxSliderVolume,
  setVoiceSliderVolume,
} from "../ui/audioControls.js";
import { animateResultsDismiss, initResultsOverlay } from "../ui/resultsOverlay.js";
import { showRotatePromptIfNeeded } from "../ui/rotatePrompt.js";
import {
  dismissAllLoadingOverlays,
  whenModeEntryHidden,
} from "../ui/loadingScreen.js";
import { setGamepadNavActive } from "../ui/gamepadNav.js";
import {
  cancelMenuPreviewTimers,
  finalizeArenaForPlayEntry,
  getCurrentLevelId,
  getLevelRebuildPromise,
  getMenuLevelPreviewPromise,
  getMenuPreviewNeedsFinalize,
  getPreviewNeedsFullRebuild,
  initLevelManager,
  isLevelSwapping,
  rebuildLevelIfNeeded,
} from "../levels/levelManager.js";
import {
  enterPlayMode,
  ensureSessionCartsReady,
  ensureWorldBootstrapped,
  initBootstrap,
  isSessionCartsReady,
  isWorldBootstrapped,
} from "../bootstrap.js";
import { animateCartBoostPulse, crossfadeElement } from "../animations.js";
import { isShatterAnimating, triggerCartShatter } from "../cartShatter.js";
// * BUNDLE-1 Lever E — these seven modules were static imports of `netcode.js` (eager),
// * which held the whole gameplay/render graph on the eager side of the gameBoot split.
// * They now arrive here and are merged into `sessionBridgeCtx.current` below.
import * as GroceryPool from "../effects/groceryPool.js";
import { dispatchKOEvent } from "../scoring/koReactors.js";
import { armSpillBoost, shiftCargoLatchBy, stripLifeCargo } from "../cargoLoad.js";
import {
  applyRemoteDirective,
  clearDirectiveOnHostMigration,
  getActiveDirective,
  getDirectiveWireState,
} from "../directives/directiveEngine.js";
import { buildSessionBridgeContext, wireNetcodeRuntimeRefs } from "../gameSession.js";
import {
  buildCartMaterialCache,
  createCartOrchestration,
} from "./cartOrchestration.js";
import { displayColorHexForSlot } from "./cartIdentity.js";
import { createLoopDeps } from "./loopDeps.js";
import { createRoundLifecycle, resolveCinematicCountdownOverrides } from "./roundLifecycle.js";
import {
  applySlowMoToDt,
  createGameLoopState,
  resetGameLoopTiming,
  runGameLoop,
  runPhysicsStep,
  updateVisualsAndEffects,
} from "../gameLoop.js";
import { cleanupSuddenDeathState, updateGameFlow } from "../gameFlow.js";
import { getRoundClockNowMs } from "../roundClock.js";
import { ROUND_DURATION_MS } from "../../shared/roundConstants.js";
import { sampleArenaReactive } from "../levels/arenaReactiveLights.js";
import { updateLevelLod } from "../utils/levelLod.js";
import { beginFrameBudget, frameBudgetAllow } from "../utils/frameBudget.js";
import {
  clearPodiumEndLatch,
  consumeHardStopDiag,
  onPodiumEndRejected,
} from "../utils/podiumEndLatch.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { applyDebugCameraPose, isDebugCameraLocked } from "../utils/debugParams.js";
import { tickVisualHarnessFrame } from "../utils/visualHarness.js";
import { menuReturnHref } from "../utils/captureUpload.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { LEVEL_STORAGE_KEY, resolveLevelId } from "../levels/index.js";
import { storageGet } from "../utils/storage.js";
import { setUiMode as setGamepadUiMode } from "../input.js";
import { CART_COLORS, CONFIG, MSG, PALETTE } from "../config.js";
import { isTouchDevice } from "../utils.js";

/**
 * Boots every in-round system: audio/announcer/directives, HUD, results overlay, cart +
 * round + loop orchestration, the level manager and play-entry bootstrap, the netcode
 * game-start handlers, the session bridge, and the simulation loop.
 *
 * Called exactly once, from main(). Reads main()-owned handles off `ctx` and publishes
 * everything the menu half needs back onto `ctx.refs`.
 *
 * @param {Record<string, any>} ctx
 */
export function bootGameSystems(ctx) {
  const {
    refs,
    canvas,
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    arcadePass,
    fxaaPass,
    outputPass,
    audioListener,
    soundUrl,
    labelRenderer,
    input,
    BASE_FOV,
    fpsState,
    podiumAutoContinue,
    sessionBridgeCtx,
    sessionRefs,
    helloGate,
    gameSession,
    flushPendingSessionBootstrap,
    markFirstHelloReceived,
    initialNpcNames,
    prepareLevelMusic,
    startLevelMusic,
    updateTouchControlsVisibility,
    initMenu,
    commitMenuHiddenForGame,
    handleQualityTierChange,
    handleAutoQualityStepDown,
  } = ctx;

  // === BUNDLE-1 LEVER D — THE FOUR EAGER EDGES THAT MOVED IN ===
  // * All four used to run in main() ahead of initMenu(). Each one was a static import edge
  // * that kept a heavy module in the INITIAL download set no matter how much construction
  // * Lever C deferred: effects.js, cartShatter.js, simulation.js + entities.js + hud.js
  // * (via registerModules), and levelOrchestration.js (which alone pulls Simulation /
  // * Effects / Entities / CameraMod / ArenaAmbience / cartShatter / koHitmarkerFx /
  // * waterDeathFx / sceneExtras / contactShadows).
  // ! ORDER IS LOAD-BEARING: initEffects builds the FX pools that levelOrchestration's arena
  // ! build and quality-tier apply read, so it must stay first.
  const { ramBoostStreaks } = Effects.initEffects(scene, {
    ramBoost: CONFIG.cart.ramBoost,
    cartColors: CART_COLORS,
  });
  refs.spawnTrashBurstRef = Effects.spawnTrashBurst;
  refs.triggerCartShatterRef = triggerCartShatter;

  const gameCtx = createGameContext().registerModules({
    Netcode,
    GameState,
    Simulation,
    Entities,
    Input,
    HUD,
  });

  // * MAIN-1 Lever C: LevelManagerDeps + level-load helpers live in levelOrchestration.
  // * Published on `refs` because the menu half (menu attract's animation tick, the
  // * quality handlers, the arena-rotation drain, the net diag probe) still reads it —
  // * every one of those reads is `refs.level?.…`, since they can run before this boot.
  const level = createLevelOrchestration({
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    arcadePass,
    fxaaPass,
    outputPass,
    canvas,
    getBloomEnabled: () => refs.bloomEnabled,
    getFxPassEnabled: () => refs.fxPassEnabled,
    getMenuVisible: () => refs.menuVisible,
    getAllCartsRef: () => refs.allCartsRef,
    getHud: () => refs.hud,
    resolveCinematicCountdownOverrides,
    prepareLevelMusic,
    startLevelMusic,
    stopAllChargeSfx: () => refs.cart?.stopAllChargeSfx(),
    // * ART-FILTER-1: level load clears any in-flight impact pulse so its captured base
    // * cannot restore the previous arena's CRT over the freshly gated uniforms.
    getImpactPulse: () => refs.cart?.getImpactPulse(),
  });
  refs.level = level;

  // * BUNDLE-1 Lever D Edge 1 — hand the menu half real implementations for the ten hooks
  // * it has been calling as no-ops. Registered HERE, at the top of the boot, so nothing
  // * constructed below can run a teardown against a half-registered table.
  // ! Both ends of every hook are enumerated in the Lever D commit body. A hook registered
  // ! but never called (or vice versa) fails SILENTLY — gameplay HUD / announcer audio /
  // ! directives / ambience left running over the title screen. No gate catches it.
  registerGameTeardownHooks({
    hideGameplayElements: () => HUD.hideGameplayElements(),
    hideAudioWidget: () => HUD.hideAudioWidget(),
    showAudioWidget: () => HUD.showAudioWidget(),
    isEscOverlayVisible: () => HUD.isEscOverlayVisible(),
    showEscOverlay: () => HUD.showEscOverlay(),
    hideEscOverlay: () => HUD.hideEscOverlay(),
    clearActiveDirective: () => clearActiveDirective(),
    stopAnnouncer: () => stopAnnouncer(),
    startArenaAmbience: (levelId) => ArenaAmbience.startArenaAmbience(levelId),
    stopArenaAmbience: () => ArenaAmbience.stopArenaAmbience(),
    // * BUNDLE-1 Lever E, third edge — F8 diag probes, read-only.
    getAnnouncerDebugState: () => getAnnouncerDebugState(),
    getActiveDirective: () => getActiveDirective(),
  });

  const {
    ensureRapierPhysics,
    consumeRaveJuiceJustBuilt,
    raveDressingWanted,
    tickRaveDressing,
    finalizeArenaShellForMenu,
    finalizeArenaForPlay,
    warmupActiveSceneShaders,
    maskMenuPreviewSwap,
    commitLevelLoad,
    bootstrapWorldCore,
    whenArenaRotationSettled,
    drainPendingArenaRotation,
    pickNextQuickplayArenaId,
    rotateLoadedArenaInPlace,
  } = level;

  // === MOVED MODULE STATE ===
  // * These were module-scope `let`s in main.js. Every one of them is read AND written
  // * only by code that lives in this module, so they are plain locals here; the ones the
  // * menu half also touches live on `refs` instead.

  /** @type {ReturnType<typeof runGameLoop> | null} */
  let gameLoopDriver = null;
  let isNewPersonalBest = false;
  /** @type {((msg: object) => void) | null} */
  let onGameStartHandler = null;
  /**
   * Monotonic generation for the deferred solo countdown. Each solo game-start bumps it and
   * captures the value; a pending whenModeEntryHidden defer only fires if its captured gen is
   * still current — so a (rare) double game-start or a quit→restart-solo race can't let a
   * stale waiter re-kick a newer game's countdown clock. (Council review follow-up.)
   */
  let soloCountdownDeferGen = 0;
  /**
   * CAM-OPEN-1 — how long the solo opening fly-over holds the arena before the 3-2-1.
   * Not part of the countdown: `CONFIG.round.countdownMs` / `COUNTDOWN_MS` is shared with
   * the server's game_start arming timer and must not absorb this.
   */
  const SOLO_FLYOVER_PREROLL_MS = 2000;
  /** @type {(() => void) | null} */
  let onHostMigratedHandler = null;
  /** @type {(() => void) | null} */
  let onCountdownCancelledRef = null;
  /**
   * Non-host game_start is waiting on arena swap + carts-ready before applying
   * countdown. Used so a room abort (host_round lobby) while we still show lobby
   * can invalidate the waiter (Cap-59 hold — local phase never left lobby).
   */
  let nonHostCountdownApplyPending = false;
  /**
   * CAM-PT-MP-1: host-MP fly-over hold is armed (game_start received, pre-roll
   * timeout live, phase still lobby). Mirror of nonHostCountdownApplyPending so a
   * server countdownCancel landing during the hold — when there is no countdown
   * phase to clean up — still routes into onCountdownCancelled.
   */
  let hostMpHoldPending = false;
  let customizationChangeListenerWired = false;
  /**
   * In-memory match results for the session (resets on full page reload).
   * @type {{ endedAtMs: number, winnerSlotIndex: number | "draw", scores: Record<number, number>, mode?: "solo" | "quickplay" | "testdrive" | "friends" }[]}
   */
  let matchHistory = [];
  /** Sudden Death tension bed edge-latch — see the onFrame watcher. */
  let sdTensionLatched = false;
  let nameLabelUpdatePending = null;
  /** @type {(() => { forward: number; turn: number }) | null} */
  let getAxisRef = null;
  /** @type {(cart: any, nowMs: number) => void | null} */
  let triggerRamBoostRef = null;
  /** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
  let triggerLocalRamShakeRef = null;
  /** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
  let triggerLocalHitTakenRef = null;

  // * MAIN-1 Lever E: cart/juice API — assigned before roundLifecycle (arrows close over this).
  /** @type {ReturnType<typeof createCartOrchestration> | null} */
  let cart = null;
  /** @type {() => any} Late-bound from createCartOrchestration (input/HUD wire before cart factory). */
  let localCartForConnId = () => null;
  /** @type {(slotIndex: number) => void} */
  let teleportCartToSpawn = (_slotIndex) => {};
  /** @type {(slots: unknown) => void} */
  let updateCartMaterialsFromSlots = (_slots) => {};
  /** @type {(slots: unknown) => void} */
  let updateHudColorsFromSlots = (_slots) => {};
  /** @type {(ctx: { renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera }) => void} */
  let setSlotsWarmupCtx = (_ctx) => {};

  const _camReconPosScratch = { x: 0, y: 0, z: 0 };
  const _camReconRotScratch = new THREE.Quaternion();
  const _camReconYawScratch = new THREE.Quaternion();
  const _camReconYAxis = new THREE.Vector3(0, 1, 0);

  const fxTimer = new THREE.Timer();

  const cartLinvelScratch = new THREE.Vector3();
  const cartAngvelScratch = new THREE.Vector3();
  const netTargetPosScratch = new THREE.Vector3();
  // * Booth neon mats keep authored per-booth hues; pulse reuses this Set so each
  // * shared material is intensity-updated once per frame (not once per tube mesh).
  const boothNeonMatsSeen = new Set();

  const audioSystem = initAudioSystem(audioListener, {
    getSfxVolume,
    getIsMuted,
  });
  if (!refs.leaderHum) refs.leaderHum = audioSystem.leaderHum;
  // * Procedural stings (kill confirm, victory/defeat, sudden death, timer ticks,
  // * challenge complete) share the leader-chime WebAudio path and volume gates.
  SfxSynth.initSfxSynth(audioListener, { getSfxVolume, getIsMuted });

  // * "The Store PA" announcer — voice/sting playback core, then the presentation-only
  // * game-state observer that decides what to announce and when.
  initAnnouncerStings(audioListener, { getVoiceVolume, getIsMuted });
  initAnnouncer({
    getSfxVolume,
    getIsMuted,
    playSfx: (key) => AudioManager.playSfx(key),
    stopSfx: (key, id) => AudioManager.stopSfx(key, id),
    fadeOutSfx: (key, id, ms) => AudioManager.fadeOutSfx(key, id, ms),
    getSfxDurationMs: (key) => AudioManager.getSfxDurationMs(key),
    isVoiceEnabled: () => settingsStore.getState().announcerVoiceEnabled !== false,
    isCalloutsEnabled: () => settingsStore.getState().announcerCalloutsEnabled !== false,
    // * Mix: music dips under big PA moments so stings/voice cut through cleanly.
    onAnnouncementPlays: (def, voiceMs) => {
      // * Voiced events duck for the REAL clip length. Sting fallbacks keep the
      // * sting-era estimates; focus (directive) sting ducks stay capped so music
      // * doesn't sag through the whole 4s on-screen hold over a short sting.
      const duckMs = voiceMs ?? (def.focus ? Math.min(def.durationMs, 1400) : def.durationMs);
      if (def.cls === "critical") {
        AudioManager.duckMusic(0.3, duckMs + 500);
      } else if (def.cls === "high" || def.cls === "sequence") {
        AudioManager.duckMusic(0.55, duckMs + 200);
      }
    },
  });
  initAnnouncerDirector({
    announce,
    getNetSlots: () => Netcode.getNetSlots(),
    getLocalSlotIndex: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
    getRemainingRoundMs: () => {
      const rs = GameState.getRoundState();
      if (rs.phase !== "running" || rs.isSuddenDeath || !rs.startedAtMs) return null;
      const durationMs = CONFIG.round?.durationMs ?? ROUND_DURATION_MS;
      // * startedAtMs is host-stamped after countdown — use host clock offset (NET-CLK-1).
      const adjusted = getRoundClockNowMs() - Netcode.getHostClockOffsetMs();
      return durationMs - (adjusted - rs.startedAtMs);
    },
  });
  // * Visual callout banner + aria-live region for announcer subtitles.
  setAnnouncerPresenter(initAnnouncerDisplay());

  // * The Living Store — the Store PA as game-master. Host schedules short directive
  // * windows (Flash Sale, Double Bag, Express Lane, Spill Bonus), broadcasts them
  // * one-shot over the DataChannel, and every peer applies/restores the same CONFIG
  // * overrides locally. Ticked per frame from frameVisuals.
  initDirectiveEngine({
    getIsHost: () => Netcode.getIsHost(),
    sendP2PEvent: (payload) => Netcode.sendP2PEvent(payload),
    announce,
    addScore: GameState.addScore,
    getAllCarts: () => refs.allCartsRef,
    getLastHitBy: () => GameState.getLastHitBy(),
    // * Host-local presentation; non-hosts get the same path via MSG.spillBonus.
    onSpillBonusAward: (award) => cart.presentSpillBonusAward(award),
  });


  // * Register all SFX via Howler (pooled, spatial-ready). Opus is the single
  // * shipped format — universal browser support, no Safari fallback needed.
  AudioManager.registerSfx("cartCrash", [soundUrl("cart-crash.opus")], { pool: 4 });
  AudioManager.registerSfx("death", [soundUrl("Death.opus")], { pool: 3 });
  AudioManager.registerSfx("boost", [soundUrl("Boost.opus")], { pool: 3 });
  AudioManager.registerSfx("hop", [soundUrl("Hop.opus")], { pool: 3 });
  AudioManager.registerSfx("floor", [soundUrl("Floor.opus")], { pool: 3 });
  AudioManager.registerSfx("chargeUp", [soundUrl("Charge_up.opus")], { pool: 2, loop: true });
  AudioManager.registerSfx("countdown_3", [soundUrl("countdown_3.opus")], { pool: 1 });
  AudioManager.registerSfx("countdown_2", [soundUrl("countdown_2.opus")], { pool: 1 });
  AudioManager.registerSfx("countdown_1", [soundUrl("countdown_1.opus")], { pool: 1 });
  AudioManager.registerSfx("countdown_go", [soundUrl("countdown_go.opus")], { pool: 1 });
  // * Run-6: recorded hit-impact kill confirm (Wyatt-supplied). Rides the Howler bus —
  // * the synth sting applied the SFX slider twice (listener gain × recipe vol) and
  // * vanished at low sliders; file SFX apply it once.
  AudioManager.registerSfx("killConfirm", [soundUrl("kill-confirm.opus")], { pool: 2 });
  // * Optional drop-in: a recorded Sundial splash replaces the synth splash when
  // * public/sounds/water-splash.opus exists. Registered only after a served-file
  // * check — Howler has no clean "missing asset" fallback, and dev's SPA fallback
  // * answers 200 text/html for missing paths (hence the content-type guard).
  void fetch(soundUrl("water-splash.opus"), { method: "HEAD" })
    .then((r) => {
      if (r.ok && (r.headers.get("content-type") ?? "").includes("audio")) {
        AudioManager.registerSfx("waterSplash", [soundUrl("water-splash.opus")], { pool: 3 });
      }
    })
    .catch(() => {});
  // * Arena ambience beds (crowd/hum/ocean/SD tension) — registered lazily
  // * (preload:false): the loops only fetch at play entry, never during boot.
  ArenaAmbience.initArenaAmbience(soundUrl);

  // * "The Store PA" recorded voice pack (en) — Tier 1. Each key maps to
  // * public/sounds/announcer/en/<key>.opus; the announcer manager picks a random
  // * registered variant per event and falls back to stings for unrecorded events.
  // * Recording/drop-in pipeline: docs/reference/announcer-recording-script.md.
  const announcerVoiceKeysEn = expandAnnouncerVoiceKeys(ANNOUNCER_EVENTS);
  for (const key of announcerVoiceKeysEn) {
    AudioManager.registerSfx(`announcer_${key}`, [soundUrl(`announcer/en/${key}.opus`)], {
      pool: 1,
      // * 61 voice takes — skip boot fetch/decode (~1.7 MB network + large PCM) until
      // * idle warm or first play (see prefetchSfxByPrefix + playSfx load-on-demand).
      preload: false,
    });
  }
  registerAnnouncerVoicePack({ locale: "en", availableKeys: announcerVoiceKeysEn });

  refs.hud = HUD.init({
    getIsMuted,
    setIsMuted: (val) => { setAllAudioMuted(val); },
    getMusicGain: getMusicVolume,
    setMusicGain: setMusicGainValue,
    getSfxVolume,
    setSfxVolume: setSfxSliderVolume,
    getVoiceVolume,
    setVoiceVolume: setVoiceSliderVolume,
    getAudioVolumeMax: () => AUDIO_VOLUME_MAX,
    getAudioVolumeDefault: () => AUDIO_VOLUME_DEFAULT,
    getBloomEnabled: () => refs.bloomEnabled,
    setBloomEnabled: (val) => {
      refs.bloomEnabled = val;
      settingsStore.getState().setBloomEnabled(val);
    },
    getFxPassEnabled: () => refs.fxPassEnabled,
    setFxPassEnabled: (val) => {
      refs.fxPassEnabled = val;
      settingsStore.getState().setFxPassEnabled(val);
    },
    getBloomPass: () => bloomPass,
    getFxPass: () => refs.fxPass,
    getLabelRenderer: () => labelRenderer,
    getMenuVisible: () => refs.menuVisible,
    getPartySocket: () => Netcode.getPartySocket(),
    getReadyToggleMsgType: () => MSG.readyToggle,
    detectGameMode: () => Netcode.detectGameMode(),
    getCART_COLORS: () => CART_COLORS,
    getDefaultRoundMs: () => CONFIG.round.durationMs,
    getHostStallMs: () => Netcode.getHostStallMs(),
    getCountdownMs: () => CONFIG.round.countdownMs,
    // * GO! moment — camera punch-in + whoosh as the countdown orbit hands back to follow.
    onGoMoment: () => {
      armFovPunch(10, 220);
      SfxSynth.playGoWhoosh();
    },
    getLevelId: () => getCurrentLevelId(),
    getIsTouchDevice: isTouchDevice,
    // * Late-bind: createCartOrchestration assigns localCartForConnId after HUD.init, so
    // * pass a wrapper (the idiom the input handlers already use) not the stub's value.
    getLocalCart: () => localCartForConnId(),
    getBoostChargeCfg: () => CONFIG.cart.ramBoost.boostCharge,
    onEscOverlayChange: (open) => {
      if (open) {
        Input.setTouchControlsVisible(false);
      } else {
        updateTouchControlsVisibility();
      }
      // * Solo/testdrive: real pause (freeze sim + round clock). Online modes leave
      // * authority running — host can't pause everyone from one client's ESC.
      handleSoloPauseOverlay(open);
    },
    onQuitToMenu: () => gameSession.returnToMenu({ reason: "esc" }),
    // * CHECKOUT LINE "LEAVE ROOM" rides the same teardown as the pause menu's
    // * MAIN MENU — socket close + ?room= clear live there (no second path).
    onLeaveRoom: () => gameSession.returnToMenu({ reason: "lobby-leave" }),
    // * FRIENDS-JOIN-1: only a player who TYPED a code can be told to check it. The
    // * room's creator waiting alone is the same observable state and must not see it.
    joinedViaTypedCode: () => refs.joinedViaTypedCode,
    // * Pause-menu RESTART (solo/test-drive only): reuse the host solo re-entry
    // * path — reset the world and re-run the countdown, no menu round-trip.
    onRestart: () => onHostPlayAgainClick(),
    onQualityTierChange: (tier) => handleQualityTierChange(tier),
    getQualityTier,
  });
  const resultsUi = initResultsOverlay({
    onMainMenuClick: () => {
      podiumAutoContinue.clear();
      gameSession.returnToMenu({ reason: "results" });
    },
  });

  // * MAIN-1 Lever E: cart spawn/teardown, labels, boost/hop/ram, NPC, juice/FX.
  function rewireSessionNetcodeRefs() {
    wireNetcodeRuntimeRefs({
      input,
      setRefs: (refs) => Netcode.setRefs(refs),
      getAllCartsRef: () => refs.allCartsRef,
      resetSimTimingRef: sessionRefs.resetSimTimingRef,
      triggerRamBoost: (...args) => cart.triggerRamBoost(...args),
      triggerHop: (...args) => cart.triggerHop(...args),
      triggerCartShatter,
      doRespawn: Entities.doRespawn,
      assignLocalAxisRef: (axis) => { getAxisRef = axis; },
      assignLocalRamBoostRef: (fn) => { triggerRamBoostRef = fn; },
    });
  }

  cart = createCartOrchestration({
    scene,
    camera,
    getFxPass: () => refs.fxPass,
    getHud: () => refs.hud,
    ramBoostStreaks,
    getWorld: () => level.world,
    getAllCartsRef: () => refs.allCartsRef,
    setAllCartsRef: (v) => { refs.allCartsRef = v; },
    getPendingMidRoundJoinRespawnConnId: () => refs.pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (v) => { refs.pendingMidRoundJoinRespawnConnId = v; },
    helloGate,
    sessionRefs,
    gameCtx,
    rewireSessionNetcodeRefs,
    drainPendingArenaRotation: () => drainPendingArenaRotation(),
    getSpawnTrashBurstRef: () => refs.spawnTrashBurstRef,
  });
  const {
    armFovPunch,
    triggerLocalRamShake,
    triggerLocalHitTaken,
    squashCartsOnImpact,
    onLocalKoConfirm,
    onLocalKillConfirm,
    onArenaKoFlash,
    triggerSpillNetcode,
    presentSpillBonusAward,
    stopChargeSfxForCart,
    stopAllChargeSfx,
    scheduleRespawn,
    scheduleStuckRespawn,
    updateNameLabels,
    positionNameLabels,
    bootstrapSessionCarts,
    destroySessionCarts,
    getAiAxis,
    triggerRamBoost,
    onBoostRelease,
    onBoostCancel,
    attemptLocalHop,
    triggerHop,
    onHopLand,
    maybeTriggerNpcOpportunisticRamBoost,
    maybeTriggerNpcOpportunisticHop,
    localCartForConnId: localCartForConnIdBound,
    teleportCartToSpawn: teleportCartToSpawnBound,
    updateCartMaterialsFromSlots: updateCartMaterialsFromSlotsBound,
    updateHudColorsFromSlots: updateHudColorsFromSlotsBound,
    setSlotsWarmupCtx: setSlotsWarmupCtxBound,
  } = cart;
  localCartForConnId = localCartForConnIdBound;
  teleportCartToSpawn = teleportCartToSpawnBound;
  updateCartMaterialsFromSlots = updateCartMaterialsFromSlotsBound;
  updateHudColorsFromSlots = updateHudColorsFromSlotsBound;
  setSlotsWarmupCtx = setSlotsWarmupCtxBound;
  setSlotsWarmupCtx({ renderer, scene, camera });
  triggerLocalRamShakeRef = triggerLocalRamShake;
  triggerLocalHitTakenRef = triggerLocalHitTaken;
  // * Published for the menu half: main()'s input handlers and levelOrchestration reach
  // * hop / boost / charge-sfx through this handle (they closed over `cart` before Lever B).
  refs.cart = cart;

  // * MAIN-1 Lever F: host-tab pump + loop phase deps (attachPhaseDeps later).
  const loop = createLoopDeps({
    getGameLoopDriver: () => gameLoopDriver,
  });

  // * MAIN-1 Lever D: countdown → running → podium → rematch lives in roundLifecycle.
  const round = createRoundLifecycle({
    camera,
    gameCtx,
    teleportCartToSpawn,
    getAllCartsRef: () => refs.allCartsRef,
    getHud: () => refs.hud,
    getResultsUi: () => resultsUi,
    getMatchHistory: () => matchHistory,
    getIsNewPersonalBest: () => isNewPersonalBest,
    setIsNewPersonalBest: (v) => { isNewPersonalBest = v; },
    localCartForConnId,
    refreshHiddenHostLifecycle: () => loop.refreshHiddenHostLifecycle(),
    updateTouchControlsVisibility: () => updateTouchControlsVisibility(),
    stopAllChargeSfx,
    stopChargeSfxForCart,
    getArenaRotationInFlight: () => level.arenaRotationInFlight,
    pickNextQuickplayArenaId: () => pickNextQuickplayArenaId(),
    rotateLoadedArenaInPlace: (id) => rotateLoadedArenaInPlace(id),
    setPendingMidRoundJoinRespawnConnId: (v) => { refs.pendingMidRoundJoinRespawnConnId = v; },
  });
  const {
    beginRoundFlyover,
    recordPodiumStats,
    getWinnerWorldPos,
    beginPodiumPresentation,
    clearPodiumPresentation,
    updateResultsOverlay,
    startRunningAt,
    clearRoundCountdownTimeout,
    startCountdown,
    resumeCountdownAsNewHost,
    ensureSuddenDeathStateAsNewHost,
    cancelLastCartStandingFinish,
    abortLastCartStandingFlourish,
    scheduleLastCartStandingFinish,
    endRound,
    clearAutoContinuePodiumTimeout,
    handleSoloPauseOverlay,
    onHostPlayAgainClick,
    clearPodiumRoundTimeout,
    resetResultsOverlayKey,
    resetPodiumSessionState,
    getSoloPauseStartedAtMs,
    setAutoContinuePodiumKey,
    removePodiumSkipListeners: removePodiumSkipFromRound,
    wirePodiumAutoContinueClear,
  } = round;
  refs.removePodiumSkipListeners = removePodiumSkipFromRound;
  wirePodiumAutoContinueClear(podiumAutoContinue);


  // * Challenge-complete feedback — toast + sparkle the moment a challenge crosses
  // * its goal. Detects rising isComplete edges across daily + weekly lists.
  const collectCompletedChallengeIds = (state) => {
    const ids = new Set();
    for (const ch of [...(state.dailyChallenges || []), ...(state.weeklyChallenges || [])]) {
      if (ch?.isComplete) ids.add(ch.id);
    }
    return ids;
  };
  // * Mid-match unlock acknowledgment — the menu already toasts unlocks, but grants
  // * fire during play (via the KO challenge reactor) where the menu toast is
  // * invisible. Route them through the in-game HUD toast too.
  onUnlockGranted((msg) => {
    // * Unlocks are rare and precious: hold the stage 5s and outrank announcer
    // * callouts (priority 4 > 3) so the KO line that lands on the same frame queues
    // * behind the unlock instead of preempting it off-screen unread.
    if (!refs.menuVisible) refs.hud?.showChallengeToast?.(msg, "◆ UNLOCKED", { durationMs: 5000, priority: STAGE_PRIORITY.CRITICAL });
  });

  let prevCompletedChallengeIds = collectCompletedChallengeIds(challengeStore.getState());
  challengeStore.subscribe((state) => {
    const completed = collectCompletedChallengeIds(state);
    for (const id of completed) {
      if (!prevCompletedChallengeIds.has(id)) {
        const meta = CHALLENGE_POOL.find((c) => c.id === id);
        const title = meta?.title ?? "CHALLENGE";
        refs.hud?.showChallengeToast?.(title);
        SfxSynth.playChallengeComplete();
        // * The Store PA shouts it out too (callout + future voice line; no sting —
        // * the sparkle above is the completion audio).
        announce("challenge_complete", { title });
      }
    }
    prevCompletedChallengeIds = completed;
  });

  initLevelManager({
    getMenuVisible: () => refs.menuVisible,
    getAllCartsRef: () => refs.allCartsRef,
    isWorldBootstrapped,
    getWorld: () => level.world,
    ensureWorldBootstrapped,
    performLevelLoad: (selected, opts) => commitLevelLoad(selected, opts),
    onPreviewSwapComplete: (levelId) => {
      const wantsExtras = levelId !== "backrooms" && levelId !== "testArena";
      Effects.setRaveExtrasVisible(wantsExtras);
      // * Pair the re-show with the tier pass, same as the two other call sites — a bare
      // * setRaveExtrasVisible(true) re-shows everything the tier (and ?ablate=) had cut.
      if (wantsExtras) Effects.applyRaveExtrasQuality(getQualityKnobs());
    },
    finalizeArenaForPlay,
    finalizeArenaShellForMenu,
    crossfadeElement,
    getCanvas: () => canvas,
    maskMenuPreviewSwap,
    warmupAfterLevelSwap: (opts) => warmupActiveSceneShaders(opts),
  });

  initBootstrap({
    detectGameMode: () => Netcode.detectGameMode(),
    getMenuVisible: () => refs.menuVisible,
    commitMenuHiddenForGame,
    stopMenuMusicForPlay: () => AudioManager.stopMenuMusic(),
    getLoadedLevelId: getCurrentLevelId,
    getSelectedLevelId: () => resolveLevelId(storageGet(LEVEL_STORAGE_KEY)),
    cancelMenuPreviewTimers,
    getMenuLevelPreviewPromise,
    getLevelRebuildPromise,
    getMenuPreviewNeedsFinalize,
    getPreviewNeedsFullRebuild,
    rebuildLevelIfNeeded: (levelId, onProgress) => rebuildLevelIfNeeded(levelId, onProgress),
    finalizeArenaForPlay: finalizeArenaForPlayEntry,
    consumeRaveJuiceJustBuilt,
    warmupBeforeRoundStart: (opts) =>
      warmupActiveSceneShaders({
        forPlay: true,
        // * Juice-first-build overrides blanket warm: short budget assumed programs
        // * already live (false the first time lasers/billboard exist).
        warm: opts?.warm === true && opts?.juiceFresh !== true,
        juiceFresh: opts?.juiceFresh === true,
      }),
    ensureRapierPhysics: () => ensureRapierPhysics(),
    bootstrapWorldCore: (levelIdOverride) => bootstrapWorldCore(levelIdOverride),
    getHelloGate: () => /** @type {any} */ (helloGate),
    getAllCartsRef: () => refs.allCartsRef,
    bootstrapSessionCarts,
  });

  // --- Quickplay arena rotation gens (round lifecycle; rotation impl is in levelOrchestration) ---
  /** Invalidation token for deferred non-host countdown application (see onGameStartHandler). */
  let nonHostCountdownApplyGen = 0;
  /** Cap-200: invalidation token for deferred host-MP countdown (continuous-mode seat arm). */
  let hostMpCountdownDeferGen = 0;


  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * Round start/countdown handlers live here; initNetcode invokes them via callbacks.
  onGameStartHandler = (msg) => {
    window.dispatchEvent(new CustomEvent("cartrave:round-started"));
    if (refs.menuVisible) enterPlayMode({ skipBootstrap: true });
    showRotatePromptIfNeeded();
    if (Netcode.detectGameMode() === "testdrive") {
      if (Netcode.getIsHost()) {
        startRunningAt(getRoundClockNowMs());
      } else {
        GameState.syncRoundPhase("running");
        GameState.setRoundStartedAtMs(getRoundClockNowMs());
        GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
        GameState.setRoundWinnerSlotIndex(null);
        CameraMod.endCinematicCountdown(camera);
      }
      return;
    }
    const serverStartsAtMs = Number(msg?.startsAtMs);
    const partyServerNowMs = Number(msg?.serverNowMs);
    // * startsAtMs is Party/Worker time (NET-CLK-1). Prefer same-message delta so the
    // * countdown does not wait for 3 EWMA samples; fall back to Party offset EWMA.
    // * Host P2P offset is for snapshot interp / host-stamped startedAtMs only.
    let startsAtLocalMs;
    if (Number.isFinite(serverStartsAtMs) && Number.isFinite(partyServerNowMs)) {
      startsAtLocalMs = getRoundClockNowMs() + (serverStartsAtMs - partyServerNowMs);
    } else if (Number.isFinite(serverStartsAtMs)) {
      startsAtLocalMs = serverStartsAtMs + Netcode.getPartyClockOffsetMs();
    } else {
      startsAtLocalMs = getRoundClockNowMs() + CONFIG.round.countdownMs;
    }
    if (Netcode.getIsHost()) {
      if (Netcode.detectGameMode() === "solo") {
        // * Solo is offline and host-timed: the game-start fires the moment carts are
        // * ready, which is still *inside* the mode-entry loading overlay (720ms floor +
        // * fade left to run). Starting the countdown here ticks ~1s of the 3s clock and
        // * the fly-over reveal behind the loading screen. Hold until the overlay is gone
        // * so loading truly ends before the round starts. MP stays server-timed (below).
        soloCountdownDeferGen += 1;
        const deferGen = soloCountdownDeferGen;
        void whenModeEntryHidden().then(() => {
          // * Superseded by a newer solo entry (double game-start, or quit→restart before
          // * this waiter flushed) — the newer defer owns the countdown.
          if (deferGen !== soloCountdownDeferGen) return;
          // * A failed bootstrap can bounce to the menu while this defer is pending —
          // * never start a countdown behind the menu.
          if (refs.menuVisible) return;
          if (GameState.getRoundState().phase === "running") return;
          // * CAM-OPEN-1: hold the arena on screen for SOLO_FLYOVER_PREROLL_MS before the
          // * 3-2-1, so the opening orbit is a look at the place rather than a swing-past
          // * behind digits. Carts go to spawn first — a solo RESTART re-enters here with
          // * them scattered, and the fly-over should show the round's tableau.
          // * startCountdown teleports again 2s later; nothing moves in between (no input,
          // * no AI before countdown), so the second pass is a no-op, not a pop.
          // * SOLO ONLY — MP has its own pre-roll (CAM-PT-MP-1) driven by the server's
          // * absolute anchor (startsAtMs = FLYOVER_PREROLL_MS + COUNTDOWN_MS), shared by
          // * every client. Delaying one client's countdown locally would still be the
          // * reverted host-countdown gate (c8df8fd); shifting the shared anchor is not.
          if (Array.isArray(refs.allCartsRef)) {
            for (let i = 0; i < refs.allCartsRef.length; i += 1) teleportCartToSpawn(i);
          }
          beginRoundFlyover();
          // * CAM-READY-1: pulse GET READY through the 2s hold so it is not dead air.
          // * Countdown digits use stamp key count-n — handoff without double-stamp mess.
          HUD.showReadyHold();
          setTimeout(() => {
            // * Same three guards: the pre-roll widens the window in which a quit, a
            // * restart or a bootstrap bounce can land. onCountdownCancelledRef and
            // * resetRoundState both bump soloCountdownDeferGen, so either kills this.
            if (deferGen !== soloCountdownDeferGen) return;
            if (refs.menuVisible) return;
            if (GameState.getRoundState().phase === "running") return;
            // * Drop pulse class before digits; startCountdown path rebuilds the banner.
            HUD.clearReadyHold();
            startCountdown(getRoundClockNowMs() + CONFIG.round.countdownMs);
          }, SOLO_FLYOVER_PREROLL_MS);
        });
      } else {
        // * Cap-200 / Cap-59 sibling: continuous-mode arms game_start at seat while
        // * play-entry load is still up. Keep absolute startsAtLocalMs; defer apply
        // * until overlay + carts/shader warm so 3-2-1 is visible (or GO if past).
        hostMpCountdownDeferGen += 1;
        const deferGen = hostMpCountdownDeferGen;
        const starts = startsAtLocalMs;
        void (async () => {
          try {
            await whenModeEntryHidden();
            if (deferGen !== hostMpCountdownDeferGen) return;
            await ensureSessionCartsReady();
          } catch (err) {
            console.warn("[CartClash] host MP countdown gate failed:", err);
            // * Hard bootstrap failure — do not enter countdown/running with no carts.
            return;
          }
          if (deferGen !== hostMpCountdownDeferGen) return;
          if (refs.menuVisible) return; // quit during wait
          const phase = GameState.getRoundState().phase;
          if (phase === "running" || phase === "countdown") return;
          const now = getRoundClockNowMs();
          if (now >= starts) {
            // * Cap-200: past-start — startRunningAt(starts) anchors host clock at absolute
            // * starts (peer of non-host GameState.syncRoundPhase("running")+setRoundStartedAtMs).
            // * Do not call startCountdown(starts) here.
            startRunningAt(starts);
            HUD.triggerGoBeat({ resetGate: true });
          } else if (starts - now > CONFIG.round.countdownMs) {
            // * CAM-PT-MP-1: the server anchored starts at FLYOVER_PREROLL_MS + COUNTDOWN_MS,
            // * so everything before T−countdownMs is opening-orbit time. Hold the arena here
            // * exactly like solo, then hand off to the digits at T−countdownMs. The anchor is
            // * absolute and identical on every client, so this shifts nobody's GO relative to
            // * their peers — it is NOT the reverted per-client host gate (c8df8fd). A client
            // * whose load gates settle late simply lands in the `else` with a shorter (or no)
            // * hold; the countdown still starts at the same wall-clock instant.
            // * Carts to spawn first so the fly-over frames the round's tableau (solo parity);
            // * startCountdown teleports again at fire time — a no-op, nothing moves before
            // * the countdown (no input, no AI).
            if (Array.isArray(refs.allCartsRef)) {
              for (let i = 0; i < refs.allCartsRef.length; i += 1) teleportCartToSpawn(i);
            }
            beginRoundFlyover();
            HUD.showReadyHold();
            // * Phase stays lobby through the hold, so a server countdownCancel has no
            // * countdown to clean up — netcode routes on this flag instead.
            hostMpHoldPending = true;
            setTimeout(() => {
              // * Same guards as the outer gate: the pre-roll widens the window a quit,
              // * cancel or bootstrap bounce can land in. onCountdownCancelledRef and
              // * resetRoundState both bump hostMpCountdownDeferGen, so either kills this.
              if (deferGen !== hostMpCountdownDeferGen) return;
              hostMpHoldPending = false;
              if (refs.menuVisible) return;
              const holdPhase = GameState.getRoundState().phase;
              if (holdPhase === "running" || holdPhase === "countdown") return;
              HUD.clearReadyHold();
              startCountdown(starts);
            }, starts - CONFIG.round.countdownMs - now);
          } else {
            startCountdown(starts);
          }
        })();
      }
    } else if (GameState.getRoundState().phase !== "running") {
      // * Menu re-entry at a rematch can land game_start while the room's arena rotation
      // * is still pending/in flight locally (the drain no-ops behind the menu, then runs
      // * at play-entry). Applying the countdown immediately froze it mid-digits behind
      // * the swap's synchronous work and burst-replayed 1/GO seconds late (07-17 run 2
      // * "countdown was notably wonky"). Defer until the swap settles.
      // *
      // * Cap-59: also wait for ensureSessionCartsReady (carts + play-shader warm).
      // * Joiner game_start during play-entry applied countdown mid-compile → ~60s
      // * longframe on Intel/Firefox and ate the 3-2-1. If the server start time has
      // * already passed, drop straight into running — host_round(running) reconciles.
      nonHostCountdownApplyGen += 1;
      const applyGen = nonHostCountdownApplyGen;
      nonHostCountdownApplyPending = true;
      void (async () => {
        try {
          await whenArenaRotationSettled();
          if (applyGen !== nonHostCountdownApplyGen) return;
          await ensureSessionCartsReady();
        } catch (err) {
          console.warn("[CartRave] non-host countdown gate failed:", err);
          // * Hard bootstrap failure — do not enter countdown/running with no carts.
          nonHostCountdownApplyPending = false;
          return;
        }
        if (applyGen !== nonHostCountdownApplyGen) return;
        if (GameState.getRoundState().phase === "running") {
          nonHostCountdownApplyPending = false;
          return;
        }
        // * CAM-PT-MP-1: stamps happen at CALL time, so the pre-roll path below stamps the
        // * countdown anchor at T−countdownMs rather than at hold-arm — HUD digit pacing
        // * (hud.js countdownMs/3) reads the same window the host and server agreed on.
        const stampRoundEntry = () => {
          resetMatchStats();
          setMatchStatsLocalSlot(Netcode.strictSlotIndexForConn(Netcode.getYouConnId()));
          // * Stores the countdown anchor in the host clock domain used by HUD adjustedNow().
          GameState.setRoundCountdownStartedAtMs(getRoundClockNowMs() - Netcode.getHostClockOffsetMs());
          GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
          GameState.setRoundWinnerSlotIndex(null);
        };
        const enterCountdownPhase = () => {
          // * host_round may already have stamped countdown clocks while we held phase;
          // * still enter countdown now that the scene can take it.
          if (GameState.getRoundState().phase !== "countdown") {
            GameState.syncRoundPhase("countdown");
          }
          GameState.setRoundStartedAtMs(0);
        };
        const now = getRoundClockNowMs();
        if (now >= startsAtLocalMs) {
          // * Cancel while we waited left phase lobby and bumped applyGen — if gen still
          // * matches we're the live arm.
          nonHostCountdownApplyPending = false;
          stampRoundEntry();
          GameState.syncRoundPhase("running");
          GameState.setRoundStartedAtMs(startsAtLocalMs);
          CameraMod.endCinematicCountdown(camera);
          // * Server start time already passed (high-latency apply / arena-rotation
          // * defer): the HUD's countdown→running flip never happens, so without this
          // * the player gains control with no GO! flash, VO, or FOV punch.
          HUD.triggerGoBeat({ resetGate: true });
        } else if (startsAtLocalMs - now > CONFIG.round.countdownMs) {
          // * CAM-PT-MP-1: opening-orbit pre-roll (server anchored starts at
          // * FLYOVER_PREROLL_MS + COUNTDOWN_MS). Show the arena + GET READY here, hand
          // * off to the digits at T−countdownMs — the same absolute instant on every
          // * client, so this is not a per-client countdown delay (c8df8fd).
          // * nonHostCountdownApplyPending STAYS true across the hold: it is what routes a
          // * mid-hold room abort (host_round lobby→lobby, or countdownCancel) into
          // * onCountdownCancelled while our local phase is still lobby.
          beginRoundFlyover();
          HUD.showReadyHold();
          setTimeout(() => {
            if (applyGen !== nonHostCountdownApplyGen) return;
            nonHostCountdownApplyPending = false;
            HUD.clearReadyHold();
            if (GameState.getRoundState().phase === "running") return;
            stampRoundEntry();
            enterCountdownPhase();
          }, startsAtLocalMs - CONFIG.round.countdownMs - now);
        } else {
          nonHostCountdownApplyPending = false;
          stampRoundEntry();
          enterCountdownPhase();
          beginRoundFlyover();
        }
      })();
    }
  };

  // --- Carts, labels, gameplay helpers ---
  sessionRefs.respawnLocalMidRoundJoinRef.current = () => {
    const localConnId = Netcode.getYouConnId();
    if (!localConnId || refs.pendingMidRoundJoinRespawnConnId !== localConnId) return;
    if (GameState.getRoundState().phase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    refs.pendingMidRoundJoinRespawnConnId = null;
  };



  if (!customizationChangeListenerWired) {
    customizationChangeListenerWired = true;
    window.addEventListener("cartrave:customization-changed", () => {
      const slots = Netcode.getNetSlots();
      Netcode.syncLocalSlotLookHex();
      Netcode.syncCartLookToServer();
      updateCartMaterialsFromSlots(slots);
      updateHudColorsFromSlots(slots);
      sessionRefs.updateNameLabelsRef.current?.();
    });
  }

  sessionBridgeCtx.current = buildSessionBridgeContext({
    palette: PALETTE,
    initialNpcNames,
    detectGameMode: () => Netcode.detectGameMode(),
    markFirstHelloReceived,
    getOnGameStartHandler: () => onGameStartHandler,
    getOnHostMigratedHandler: () => onHostMigratedHandler,
    onCountdownCancelled: () => { onCountdownCancelledRef?.(); },
    endCinematicCountdown: () => { CameraMod.endCinematicCountdown(camera); },
    // * Cap-59: netcode holds host_round countdown phase until carts/shaders ready.
    // * WARM-IGPU-1 Lever A: an in-flight arena rotation ALSO means "not play ready". Its
    // * warm pass (`warm.render.default.play-full`, rotateLoadedArenaInPlace below) runs a
    // * full-budget compile with no loading overlay; carts already exist and no cart
    // * bootstrap is pending, so isSessionCartsReady() alone reported ready and the server
    // * could arm game_start while that compile was still running — the 07-21 forensics'
    // * countdown overlap. Withholding clientPlayReady moves the cost BEFORE the countdown
    // * arms; it never delays a countdown already armed (that was the reverted `c8df8fd`).
    // * Server-side PLAY_READY_TIMEOUT_MS (12s) remains the backstop, and the rotation's
    // * finally re-signals immediately so we never actually wait on it.
    isSessionPlayReady: () => isSessionCartsReady() && !level.arenaRotationInFlight,
    hasPendingNonHostCountdownApply: () => nonHostCountdownApplyPending,
    // * CAM-PT-MP-1: host-side peer of the above — true only during the opening-orbit hold.
    hasPendingHostMpHold: () => hostMpHoldPending,
    getMenuVisible: () => refs.menuVisible,
    invokeHideMenu: () => {
      void enterPlayMode({
        commitMenuHidden: true,
        skipBootstrap: isWorldBootstrapped(),
      });
    },
    updateCartMaterialsFromSlots,
    updateHudColorsFromSlots,
    updateNameLabelsRef: sessionRefs.updateNameLabelsRef,
    getNameLabelUpdatePending: () => nameLabelUpdatePending,
    setNameLabelUpdatePending: (val) => { nameLabelUpdatePending = val; },
    respawnLocalMidRoundJoinRef: sessionRefs.respawnLocalMidRoundJoinRef,
    getPlayCollisionRef: () => (intensity, opts) => AudioManager.playCartCrash(intensity, opts),
    getSfx: () => ({ playFloorImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }), playEdgeImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }) }),
    getSpawnTrashBurstRef: () => refs.spawnTrashBurstRef,
    getTriggerLocalRamShake: () => triggerLocalRamShakeRef,
    getTriggerLocalHitTaken: () => triggerLocalHitTakenRef,
    onRemoteNpcChargeStart: (remoteCart) => cart.startNpcChargeSfx(remoteCart),
    onRemoteBoostStart: (cart, options = {}) => {
      AudioManager.playSfx("boost", undefined, { volume: 0.45 });
      if (cart?.mesh) animateCartBoostPulse(cart.mesh);
      if (cart) {
        const charged = Boolean(options.charged);
        cart.nitroStreakCharged = charged;
        // * The host carries release mode in snapshots; remotes do not infer it from slot kind.
        cart.boostChargeMultiplier = charged ? 1 : 0;
      }
    },
    onCartImpactSquash: squashCartsOnImpact,
    // * MP-FX-1: netcode applyCartState remote hop-land → same onHopLand as host sim.
    onHopLand,
    // * Non-host own-death teardown (netcode processHostFallEvent) — same helper the
    // * host-side scheduleRespawn uses, so the chargeUp loop can't outlive the cart.
    stopChargeSfxForCart: (c) => cart.stopChargeSfxForCart(c),
    getTriggerCartShatterRef: () => refs.triggerCartShatterRef,
    getScene: () => scene,
    getSceneRef: () => scene,
    getHud: () => refs.hud,
    onLocalKoConfirm,
    onLocalKillConfirm,
    onArenaKoFlash,
    onAnnouncerFall: announcerDirectorOnFall,
    onSpillBonusPresentation: presentSpillBonusAward,
    colorHexForSlot: displayColorHexForSlot,
    getPendingColorKey: () => refs.pendingColorKey,
    getPendingColorChipEl: () => refs.pendingColorChipEl,
    setPendingColorKey: (val) => { refs.pendingColorKey = val; },
    setPendingColorChipEl: (val) => { refs.pendingColorChipEl = val; },
    getLocalColorPicked: () => refs._localColorPicked,
    setLocalColorPicked: (val) => { refs._localColorPicked = val; },
    recordPodiumStats,
    onReturnToLobby: () => {
      clearPodiumPresentation();
      // * Mid-round exits can reach lobby without passing endRound/onEnterPodium; stop
      // * charge loops before rematchResetWorld nulls chargeUpSfxId (orphaning the sound).
      stopAllChargeSfx();
      clearPodiumEndLatch();
      Netcode.resetClientPredictionState();
      Entities.rematchResetWorld();
      GameState.setRoundEndReason(null);
      cleanupSuddenDeathState(refs.allCartsRef || []);
    },
    onEnterPodium: () => {
      // * Non-host clients end the round via this phase watcher, not endRound() —
      // * stop a held charge loop here too or it plays through the podium.
      stopAllChargeSfx();
      HUD.clearFeed();
      beginPodiumPresentation();
    },
    // * Room level changed mid-session (Quickplay rotation) or landed on hello during
    // * a joiner's play-entry. If rotateLoadedArenaInPlace can't run yet (menu still
    // * visible, world not bootstrapped, or carts not built) we latch the target and
    // * drainPendingArenaRotation retries once bootstrapSessionCarts finishes — without
    // * that latch a joiner would strand on their own local menu pick while the room
    // * plays a different arena.
    onLevelIdChanged: (levelId) => {
      level.pendingArenaRotationLevelId = levelId;
      recordDiagEvent("arena", "rotation_queued", {
        levelId,
        loaded: getCurrentLevelId(),
        menuVisible: refs.menuVisible,
        carts: refs.allCartsRef?.length ?? 0,
      });
      void drainPendingArenaRotation();
    },
    onPodiumRejected: () => {
      // * Server nack'd host_round (or reasserted running). Undo optimistic podium UI.
      clearPodiumPresentation();
      resetResultsOverlayKey();
      if (resultsUi?.overlay) {
        animateResultsDismiss(resultsUi.overlay, resultsUi.panel);
      }
      cancelLastCartStandingFinish?.();
      setAutoContinuePodiumKey(null);
      clearAutoContinuePodiumTimeout?.();
      // * ROUND-WEDGE-1 Phase B: host-only arm. Joiners must not own latch state;
      // * netcode fires this callback without an isHost gate.
      if (Netcode.getIsHost()) {
        const startedAtMs = GameState.getRoundState().startedAtMs;
        const nowMs = getRoundClockNowMs();
        const result = onPodiumEndRejected(startedAtMs, nowMs);
        if (result.action === "hard-stop" && consumeHardStopDiag(startedAtMs)) {
          recordDiagEvent("round", "podium-end-latched", {
            startedAtMs,
            sends: result.sends ?? null,
          });
        }
      }
    },
    teleportCartToSpawn,
    getPendingMidRoundJoinRespawnConnId: () => refs.pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { refs.pendingMidRoundJoinRespawnConnId = val; },
    ensureSessionReady: () => ensureSessionCartsReady(),
    destroySessionCarts,
    disconnectNetcode: () => Netcode.disconnectPartySession(),
    dismissLoadingOverlays: () => dismissAllLoadingOverlays(),
    initMenu,
    resetRoundState: () => {
      GameState.resetRoundToLobby();
      clearPodiumEndLatch();
      clearPodiumPresentation();
      CameraMod.endCinematicCountdown(camera);
      // * CAM-OPEN-1: this is the quit funnel (returnToMenu → teardownGameSession →
      // * here). It already ended the cinematic; what it never did was invalidate a
      // * pending solo defer, which now owns a 2s pre-roll timeout that would otherwise
      // * start a countdown after the player is back on the menu.
      soloCountdownDeferGen += 1;
      // * CAM-PT-MP-1: the MP pre-roll holds are pre-phase timeouts too — quit mid-hold
      // * must not start a countdown behind the menu. Cancel alone does not cover quit.
      hostMpCountdownDeferGen += 1;
      hostMpHoldPending = false;
      nonHostCountdownApplyGen += 1;
      nonHostCountdownApplyPending = false;
      // * CAM-READY-1: no stuck GET READY after quit mid-hold.
      HUD.clearReadyHold();
    },
    hideEscOverlay: () => HUD.hideEscOverlay(),
    resetSessionPickState: () => {
      refs._localColorPicked = false;
      refs.pendingColorKey = null;
      refs.pendingColorChipEl?.classList.remove("color-pending");
      refs.pendingColorChipEl = null;
      refs.pendingMidRoundJoinRespawnConnId = null;
    },
    resetSessionHelloGate: () => helloGate.reset(),
    resetNameLabelBridge: () => sessionRefs.clearSessionCallbackRefs(),
    cancelNameLabelUpdatePending: () => {
      if (nameLabelUpdatePending != null) {
        cancelAnimationFrame(nameLabelUpdatePending);
        nameLabelUpdatePending = null;
      }
    },
    clearNetcodeRuntimeRefs: () => {
      getAxisRef = null;
      Netcode.setRefs({
        getAllCartsRef: () => refs.allCartsRef,
        getAxisRef: null,
        triggerRamBoostRef: null,
        triggerHopRef: null,
        resetSimTimingRef: sessionRefs.resetSimTimingRef,
      });
    },
    // * Teardown patch — bound methods from createRoundLifecycle (Lever D).
    clearRoundCountdownTimeout,
    clearAutoContinuePodiumTimeout,
    clearPodiumRoundTimeout,
    resetSlowMo: () => { gameCtx.slowMo.active = false; },
    resetSimTiming: () => sessionRefs.resetSimTimingRef.current?.(),
    hideResultsOverlay: () => updateResultsOverlay(),
    resetLeaderHum: () => refs.leaderHum?.setLeader?.(null),
    resetResultsOverlayKey,
    resetPodiumSessionState,

    // * BUNDLE-1 Lever E — the deferred graph netcode.js used to import statically. Key
    // * names match Netcode.DEFERRED_GAME_CALLBACK_KEYS and the buildNetcodeGameBridge
    // * lambdas exactly; the bridge live-reads this object, so nothing re-registers.
    clearNpcCartCache,
    resetReconciliationState,
    hideCargoBay: (cart) => GroceryPool.hideCargoBay(cart),
    triggerGrocerySpill: (slotKey, pos, quat, vel, count, cargoBay) => {
      GroceryPool.triggerSpill(slotKey, pos, quat, vel, count, cargoBay);
    },
    isShatterAnimating: (cart, nowMs) => isShatterAnimating(cart, nowMs),
    dispatchKOEvent: (koEvent, koCtx) => dispatchKOEvent(koEvent, koCtx),
    announce: (key, opts) => announce(key, opts),
    applyRemoteDirective: (data) => applyRemoteDirective(data),
    clearDirectiveOnHostMigration: () => clearDirectiveOnHostMigration(),
    getDirectiveWireState: () => getDirectiveWireState(),
    armSpillBoost: (cart) => armSpillBoost(cart),
    stripLifeCargo: (cart) => stripLifeCargo(cart),
    // ⚠ Adding a key here without adding it to DEFERRED_GAME_CALLBACK_KEYS + the bridge
    // is a SILENT no-op in a live session. tests/netcodeDeferredCallbacks.test.js gates it.
  });

  void flushPendingSessionBootstrap();

  // * Non-blocking — game loop must start even before first hello (menu landing).
  void ensureSessionCartsReady().catch((err) => {
    console.warn("[session] cart bootstrap failed", err);
  });

  rewireSessionNetcodeRefs();
  // * hello can arrive before input/cart refs exist; non-host input is sampled inline by the
  // * physics loop (sampleLocalInputForTick), which no-ops safely until getAxisRef is wired.
  Netcode.setAuthorityMode(Netcode.getIsHost());


  // --- Round flow (countdown, podium, AI) ---
  // * Mute gate only — synth recipes carry the slider themselves (see audioControls).
  if (audioListener && typeof audioListener.setMasterVolume === "function") {
    audioListener.setMasterVolume(getIsMuted() ? 0 : 1);
  }

  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
  });

  onCountdownCancelledRef = () => {
    // * Invalidate any rotation/carts-ready deferred non-host countdown apply — a
    // * cancel between game_start and the gate settling must not resurrect a dead countdown.
    nonHostCountdownApplyGen += 1;
    nonHostCountdownApplyPending = false;
    // * Cap-200: same for deferred host-MP countdown apply.
    hostMpCountdownDeferGen += 1;
    // * CAM-PT-MP-1: and the host-MP fly-over hold (phase never left lobby, so the
    // * countdown cleanup at the bottom of this handler would not have killed it).
    hostMpHoldPending = false;
    // * CAM-OPEN-1: and for the solo defer. Its pre-roll window sits BEFORE
    // * GameState.syncRoundPhase("countdown"), so a cancel landing mid-fly-over finds no countdown
    // * phase to clean up and previously left the pending timeout free to start one.
    soloCountdownDeferGen += 1;
    // * CAM-READY-1: quit mid-hold must not leave a stuck GET READY banner.
    HUD.clearReadyHold();
    clearRoundCountdownTimeout();
    // * Unconditional, for the same reason: during the pre-roll the camera is already in
    // * cinematic mode while the phase is still pre-countdown, so gating this on
    // * phase === "countdown" would leave the orbit latched after a cancel.
    CameraMod.endCinematicCountdown(camera);
    if (GameState.getRoundState().phase === "countdown") {
      GameState.syncRoundPhase("lobby");
      clearPodiumEndLatch();
      GameState.setRoundCountdownStartedAtMs(0);
      GameState.setRoundStartedAtMs(0);
      if (Netcode.getIsHost()) Netcode.sendHostRound();
    }
  };
  onHostMigratedHandler = () => {
    resumeCountdownAsNewHost();
    ensureSuddenDeathStateAsNewHost();
    loop.clearHostAwayTimer();
    loop.refreshHiddenHostLifecycle();
  };

  // * Wire Sudden Death win callback — addScore fires this on first score during SD.
  GameState.setSuddenDeathWinCallback((scoringSlot) => {
    endRound(scoringSlot);
  });

  let hostHiddenAtMs = null;
  let hostPumpTickCountAtHide = 0;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const st = GameState.getRoundState();
      loop.refreshHiddenHostLifecycle();
      hostPumpTickCountAtHide = gameLoopDriver?.getPumpTickCount() ?? 0;
      if (
        hostHiddenAtMs == null
        && getSoloPauseStartedAtMs() == null // Esc pause already owns the compensation
        && Netcode.getIsHost()
        && (st.phase === "running" || st.phase === "countdown")
      ) {
        hostHiddenAtMs = getRoundClockNowMs();
      }
      return;
    }
    loop.clearHostAwayTimer();
    const visiblePhase = GameState.getRoundState().phase;
    const visibleMode = Netcode.detectGameMode();
    if (
      (visibleMode === "quickplay" || visibleMode === "friends")
      && (visiblePhase === "countdown" || visiblePhase === "running")
    ) {
      Netcode.sendHostPresent();
    }
    if (hostHiddenAtMs == null) return;
    const delta = getRoundClockNowMs() - hostHiddenAtMs;
    const pumpRan = (gameLoopDriver?.getPumpTickCount() ?? 0) > hostPumpTickCountAtHide;
    hostHiddenAtMs = null;
    if (pumpRan) return;
    if (!(delta > 0) || !Netcode.getIsHost()) return;
    const state = GameState.getRoundState();
    if (state.phase === "running" && state.startedAtMs > 0) {
      GameState.setRoundStartedAtMs(state.startedAtMs + delta);
      shiftDirectiveTimersBy(delta);
      shiftCargoLatchBy(delta);
      Netcode.sendHostRound();
    }
    if (state.phase === "countdown" && state.countdownStartedAtMs > 0) {
      GameState.setRoundCountdownStartedAtMs(state.countdownStartedAtMs + delta);
      resumeCountdownAsNewHost();
    }
  });


  resultsUi.playAgain.addEventListener("click", onHostPlayAgainClick);


  // --- Simulation loop (fixed timestep) ---
  const loopState = createGameLoopState();
  gameCtx.setLoopState(loopState);
  gameCtx.registerRuntime({
    getAllCarts: () => cart.getAllCarts(),
    getAllCartsRef: () => refs.allCartsRef,
    CONFIG,
  });

  let recordVersusPlayerFrame30Logged = false;
  const recordLabelCycleColors = [
    new THREE.Color(CART_COLORS.pink.hex),
    new THREE.Color(CART_COLORS.blue.hex),
    new THREE.Color(CART_COLORS.green.hex),
    new THREE.Color(CART_COLORS.yellow.hex),
    new THREE.Color(CART_COLORS.neonOrange.hex),
  ];
  sessionRefs.resetSimTimingRef.current = () => resetGameLoopTiming(gameCtx.loopState);

  const sharedLoopGetters = gameCtx.createSharedGetters();

  loop.attachPhaseDeps({
    gameCtx,
    sharedLoopGetters,
    netTargetPosScratch,
    cartLinvelScratch,
    cartAngvelScratch,
    onAutoQualityStepDown: handleAutoQualityStepDown,
    buildCartMaterialCache,
    colorHexForSlot: displayColorHexForSlot,
    isMuted: getIsMuted,
    getSfxVolume,
    isMenuVisible: () => refs.menuVisible,
    getHud: () => refs.hud,
    leaderHum: refs.leaderHum,
    getMatchHistoryLength: () => (matchHistory ? matchHistory.length : 0),
    updateResultsOverlay,
    positionNameLabels,
    composer,
    scene,
    camera,
    labelRenderer,
    canvas,
    BASE_FOV,
    cart,
    getArcadePass: () => refs.fxPass,
    fpsState,
    updateTouchControlsVisibility,
    getLocalCart: localCartForConnId,
    scheduleRespawn,
    scheduleStuckRespawn,
    onCartOutOfPlay: stopChargeSfxForCart,
    maybeTriggerNpcOpportunisticRamBoost,
    maybeTriggerNpcOpportunisticHop,
    endRound,
    scheduleLastCartStandingFinish,
    abortLastCartStandingFlourish,
    onLocalKillConfirm,
    onArenaKoFlash,
    getAllCartsRef: () => refs.allCartsRef,
    getWorld: () => level.world,
    getEventQueue: () => level.eventQueue,
    getBoothColliderHandles: () => level.boothColliderHandles,
    getRecordColliderHandles: () => level.recordColliderHandles,
    getPitWallColliderHandle: () => level.pitWallColliderHandle,
    getAiAxis,
    getSpawnTrashBurstRef: () => refs.spawnTrashBurstRef,
    triggerLocalRamShake,
    triggerLocalHitTaken,
    squashCartsOnImpact,
    triggerRamBoost,
    onBoostRelease,
    onBoostCancel,
    onHopLand,
    triggerSpillNetcode,
    stopChargeSfxForCart,
  });

  // * BUNDLE-1 Lever C: initMenu() now runs BEFORE this boot (that is the whole point of
  // * the dynamic import), so its HUD.hideGameplayElements() / hideAudioWidget() calls
  // * landed on an un-inited HUD and its updateTouchControlsVisibility() on a null cart.
  // * HUD.init above builds a fresh #hud from scratch — re-apply the menu state here or a
  // * freshly-built gameplay HUD paints over the title screen the moment the latch
  // * resolves (idle warm at ~1.8 s, with the player still on the menu).
  if (refs.menuVisible) {
    HUD.hideGameplayElements();
    HUD.hideAudioWidget();
    updateTouchControlsVisibility();
  }

  gameLoopDriver = runGameLoop(gameCtx.loopState, {
    shouldPumpWhileHidden: loop.shouldPumpHiddenHost,
    shouldSkipTiming: () => {
      if (refs.menuVisible) return true;
      // * Solo/testdrive ESC freezes physics + frame timing (real pause).
      if (HUD.isEscOverlayVisible()) {
        const mode = Netcode.detectGameMode();
        if (mode === "solo" || mode === "testdrive") return true;
      }
      return false;
    },
    // * HOST-SNAP-PUMP-1: host 40Hz snaps ride rAF + hidden MessageChannel pump, not setInterval.
    onAfterSim() {
      Netcode.tickHostSendFromFrame();
    },
    onFrame(frameCtx) {
    gameCtx.setFrameCtx(frameCtx);
    // * Sudden Death tension bed — edge-latched here because this runs on EVERY client
    // * (host flips isSuddenDeath locally; remotes learn it via host_round). Rising edge
    // * also spikes the Classic crowd; falling edge (round end / SD win) fades it out.
    {
      const rs = GameState.getRoundState();
      const sdNow = rs.phase === "running" && rs.isSuddenDeath === true;
      if (sdNow !== sdTensionLatched) {
        sdTensionLatched = sdNow;
        ArenaAmbience.setSuddenDeathTension(sdNow);
        // * SD-MUSIC-LPF-1: music muffles for the whole Sudden Death phase (same
        // * edge — the volume duck is per-announcement and unrelated). No-op on
        // * platforms that cannot route music into the graph.
        AudioManager.setMusicLowPass(sdNow);
        if (sdNow) ArenaAmbience.bumpCrowdExcitement(0.9);
      }
    }
    const isUiActive = refs.menuVisible || HUD.isEscOverlayVisible() || GameState.getRoundState().phase === "podium" || GameState.getRoundState().phase === "lobby";
    setGamepadUiMode(isUiActive);
    setGamepadNavActive(isUiActive);
    const { now, loopState } = frameCtx;
    const dt = applySlowMoToDt(gameCtx.getSlowMoDeps(), frameCtx.dt);

    // * Must advance before the level-swap early return, or FX time stalls and jumps on swap.
    fxTimer.update(now);

    // * Soft frame budget for optional cosmetics (physics/render always run).
    beginFrameBudget(now, frameCtx.dt);

    if (isLevelSwapping()) {
      frameCtx.dt = dt;
      return;
    }

    if (refs.fxPass && refs.fxPass.uniforms && refs.fxPass.uniforms.uTime) {
      refs.fxPass.uniforms.uTime.value = fxTimer.getElapsed();
    }

    if (loopState.simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
    }

    // Visual-only record rotation.
    if (level.recordMesh) {
      level.recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;
    }

    const offset = Netcode.getHostClockOffsetMs();
    const syncedNow = (offset && !Number.isNaN(offset)) ? (now - offset) : now;

    /** @type {any} */ (level.sceneExtras)?.update?.(syncedNow, camera);
    level.levelUpdate?.(syncedNow);
    // * LOD throttle is local wall time — syncedNow can jump backward on a host-clock
    // * correction and park _lastUpdateMs in the future (LOD-CLOCK-1).
    if (frameBudgetAllow("level_lod", now)) {
      updateLevelLod(camera, now);
    }

    // * Rave dressing animation: skip entirely when the level hides it (Storerooms/
    // * test arena kept extras allocated but this math used to run anyway) and on
    // * tiers with crowdAnimate off (Low renders the stands frozen). Yield under
    // * frame pressure so host physics keeps the full budget.
    if (raveDressingWanted() && frameBudgetAllow("rave_anim", now)) {
      tickRaveDressing(syncedNow);
    }

    // * Spindle/rims driven by arenaReactiveLights inside Classic Record levelUpdate.

    // Record label color cycle (5 colors, ~2s each, ~10s full loop).
    // * Sole leader leans the vinyl label toward their color (crown-jewel read).
    if (level.recordLabelMat) {
      const segMs = 2000;
      const idx = Math.floor(now / segMs) % recordLabelCycleColors.length;
      const nextIdx = (idx + 1) % recordLabelCycleColors.length;
      const f = (now % segMs) / segMs;
      level.recordLabelMat.color
        .copy(recordLabelCycleColors[idx])
        .lerp(recordLabelCycleColors[nextIdx], f);
      const reactive = sampleArenaReactive(syncedNow);
      if (reactive.hasLeader || reactive.koT > 0) {
        level.recordLabelMat.color.lerp(reactive.accentColor, reactive.hasLeader ? 0.55 : 0.35 * reactive.koT);
      }
    }

    // * Booth neon pulse — intensity only. Hue stays on the per-booth materials so
    // * pink/green/cyan/orange spawn corners stay readable as four distinct booths.
    if (level.boothNeonMeshes && level.boothNeonMeshes.length > 0 && frameBudgetAllow("booth_pulse", now)) {
      boothNeonMatsSeen.clear();
      const pulseHz = CONFIG.booth.neonCycleSpeed;
      const nowSec = syncedNow * 0.001;
      for (const mesh of level.boothNeonMeshes) {
        const mat = mesh.material;
        if (!mat || boothNeonMatsSeen.has(mat)) continue;
        boothNeonMatsSeen.add(mat);
        const base = typeof mat.userData?.baseEmissiveIntensity === "number"
          ? mat.userData.baseEmissiveIntensity
          : (typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : 1.5);
        const phase = typeof mat.userData?.neonPulsePhase === "number"
          ? mat.userData.neonPulsePhase
          : 0;
        // * ~0.72× → 1.28× of base — readable breathe without washing the floor.
        const wave = Math.sin(nowSec * Math.PI * 2 * pulseHz + phase);
        if (typeof mat.emissiveIntensity === "number") {
          mat.emissiveIntensity = base * (1 + 0.28 * wave);
        }
      }
    }

    updateGameFlow(gameCtx.deps.gameFlow, {
      ...gameCtx.makePhaseContext(dt),
      roundNowMs: getRoundClockNowMs(),
    });

    const physicsStep = runPhysicsStep(gameCtx.loopState, gameCtx.deps.physics, { now, dt });
    frameCtx.physicsAlpha = physicsStep.alpha;

    const localCart = localCartForConnId();

    // * True near-miss detection — a boosting opponent whooshing past without contact
    // * earns the local player a close_call. Cheap: three distance checks per frame.
    if (frameBudgetAllow("near_miss", now)) {
      announcerDirectorNearMissScan(
        refs.allCartsRef || [],
        Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
        performance.now(),
      );
    }

    // * Visual QA: ?cam= / ?freeze= pin the camera (skip chase / cinematic / death).
    if (isDebugCameraLocked()) {
      applyDebugCameraPose(camera);
      tickVisualHarnessFrame();
      frameCtx.dt = dt;
      return;
    }

    // * Cinematic modes always win over death/follow. Countdown used to be nested
    // * under `localCart?.body`, so pregame fly-overs silently failed when the local
    // * cart was missing or still mid-shatter. Podium is the same exclusivity rule.
    const camMode = CameraMod.getCameraMode(camera);
    if (camMode === CameraMod.CameraMode.CINEMATIC_PODIUM) {
      CameraMod.setCinematicPodiumTarget(camera, getWinnerWorldPos());
      CameraMod.updateCinematicPodium(camera, dt);
    } else if (camMode === CameraMod.CameraMode.CINEMATIC_COUNTDOWN) {
      CameraMod.updateCinematicCountdown(camera, dt);
    } else if (localCart?.isShattering) {
      if (CameraMod.getCameraMode(camera) !== CameraMod.CameraMode.DEATH) {
        const deathPos = localCart._shatterDeathPos;
        if (deathPos) {
          CameraMod.beginDeathCamera(camera, deathPos);
        }
      }
      CameraMod.updateDeathCamera(camera, dt);
    } else if (localCart?.isSuddenDeathSpectator) {
      // * Spectator camera: local cart was knocked out during Sudden Death.
      // * Follow a tied cart (prefer human if available) so the player can watch the 1v1.
      if (CameraMod.getCameraMode(camera) === CameraMod.CameraMode.DEATH) {
        CameraMod.endDeathCamera(camera);
      }
      const allCartsArr = refs.allCartsRef || [];
      let spectatorTarget = null;
      for (const c of allCartsArr) {
        if (c?.body && !c.isSuddenDeathSpectator && !c.isShattering) {
          spectatorTarget = c;
          break;
        }
      }
      if (spectatorTarget) {
        const playerPos = spectatorTarget.body.translation();
        const playerRot = spectatorTarget.body.rotation();
        CameraMod.updateCamera(camera, spectatorTarget, dt, playerPos, playerRot, level.world);
      }
    } else if (localCart?.body) {
      if (CameraMod.getCameraMode(camera) === CameraMod.CameraMode.DEATH) {
        CameraMod.endDeathCamera(camera);
      }
      // * KO hit-stop: hold the follow camera exactly where it is for the stop window
      // * (frameVisuals holds the cart poses; a moving camera would betray the freeze).
      const inHitStop = performance.now() < cart.getHitStop().until
        && GameState.getRoundState().phase === "running";
      if (!inHitStop) {
        let playerPos = localCart.body.translation();
        let playerRot = localCart.body.rotation();
        // * NH-SMOOTH v3: non-host only — follow the display pose (low-passed mesh) so the
        // * camera does not re-broadcast 40Hz body hard-snaps. frameVisuals only *updates*
        // * `_displayPos` for non-host local; if we still read it after host promote (or
        // * any stale flag), the camera freezes while the body drives on (cart moves,
        // * view stuck). Host always tracks the live body (+ optional reconcile offset).
        const useDisplayPose = !Netcode.getIsHost()
          && localCart._displayReady
          && localCart._displayPos
          && localCart._displayQuat;
        if (useDisplayPose) {
          _camReconPosScratch.x = localCart._displayPos.x;
          _camReconPosScratch.y = localCart._displayPos.y - (CONFIG.cart?.visualOffset ?? 0);
          _camReconPosScratch.z = localCart._displayPos.z;
          playerPos = _camReconPosScratch;
          playerRot = localCart._displayQuat;
        } else {
          // * Host promote / respawn: drop stale non-host display so a later demote reseeds.
          if (Netcode.getIsHost() && localCart._displayReady) {
            localCart._displayReady = false;
          }
          const ro = localCart._reconcileVisOffset;
          if (ro && (ro.x !== 0 || ro.y !== 0 || ro.z !== 0)) {
            _camReconPosScratch.x = playerPos.x + ro.x;
            _camReconPosScratch.y = playerPos.y + ro.y;
            _camReconPosScratch.z = playerPos.z + ro.z;
            playerPos = _camReconPosScratch;
          }
          if (ro && ro.yaw !== 0) {
            _camReconYawScratch.setFromAxisAngle(_camReconYAxis, ro.yaw);
            _camReconRotScratch.set(playerRot.x, playerRot.y, playerRot.z, playerRot.w)
              .premultiply(_camReconYawScratch);
            playerRot = _camReconRotScratch;
          }
        }
        CameraMod.updateCamera(
          camera,
          localCart,
          dt,
          playerPos,
          playerRot,
          level.world,
        );
      }
    }

    frameCtx.dt = dt;
    },
    onVisualUpdate(frameCtx) {
      // * Skip visual update during level swap / quality rebuild — carts are
      // * being torn down and rebuilt; touching null bodies would crash.
      if (isLevelSwapping()) return;
      gameCtx.setFrameCtx(frameCtx);
      updateVisualsAndEffects(gameCtx.deps.visual, gameCtx.frameCtx);
    },
    onFatalError(err) {
      // * The game loop hit an unrecoverable physics/wasm fault and stopped stepping the
      // * sim. Bail to the menu so the tab isn't stuck on a dead world; returnToMenu tears
      // * the session down and page-reloads as a last resort if re-init also fails.
      console.error("[main] Fatal sim error — returning to menu", err);
      try {
        gameSession.returnToMenu({ reason: "simError" });
      } catch (recoveryErr) {
        console.error("[main] returnToMenu after fatal sim error failed; reloading", recoveryErr);
        if (typeof window !== "undefined") {
          // * Carry ?diag (never `room`) so F8 stays armed after the recovery reload.
          window.location.href = menuReturnHref(window.location.href);
        }
      }
    },
  });
}
