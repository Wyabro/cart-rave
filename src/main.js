// === IMPORTS ===

// * Self-installing rAF shim — must be the first import so it runs before anything
// * captures requestAnimationFrame (dev+?perfPump only, no-op otherwise).
import "./utils/perfPump.js";

import {
  applyDebugBootSideEffects,
  applyDebugCameraPose,
  applyPostFxAblation,
  getDebugParams,
  isDebugCameraLocked,
} from "./utils/debugParams.js";
import { installVisualHarness, tickVisualHarnessFrame } from "./utils/visualHarness.js";
import { installNetTestHarness } from "./utils/netTestHarness.js";
import { installDiagnostics, diagUrlFlags } from "./utils/diagnostics.js";
import { installGameplayDiagnostics } from "./utils/gameplayDiagnostics.js";
import { installGameplayAnalytics } from "./analytics/gameplayAnalytics.js";
import { startBlackFrameMonitor } from "./utils/blackFrameMonitor.js";
import {
  loadPlayerCustomization,
  resolveCartNeonCss,
  resolveCartNeonHex,
  resolveCartPatternForSlot,
  resolveCartThemeForSlot,
  resolveServerColorPick,
  wireCustomizationStorageSync,
} from "./customization.js";
import { applyCartPattern } from "./cartPatterns.js";
import { getCartTheme } from "./cartThemeConfig.js";
import {
  applyThemeColorToCache,
  applyThemeLeaderGlow,
  buildCartThemeMaterialCache,
} from "./cartThemes.js";
import "./cart-rave-menu.js";
import "./ui/styles/tokens.css";
import "./ui/styles/stickers.css";
import "./cart-rave-menu.css";
import "./ui/styles/global.css";
import * as THREE from "three";
import {
  createRenderer,
  createScene,
  createComposer,
  setupSceneEnvironment,
  refreshSceneEnvironmentMaterials,
  setSceneFog,
  applyComposerQualityTier,
  setBloomPipeline,
  isComposerBypassActive,
  setComposerBypassActive,
  isSoftwareRendererActive,
  COMPILE_ASYNC_WARM_PLAY_MAX_WAIT_MS,
} from "./scene.js";
import { tickAutoQuality } from "./utils/autoQuality.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RAPIER, initRapier, getRapierBuild } from "./physics/rapierInstance.js";
import { updateCartVisuals } from "./cart.js";
import * as Visuals from "./visuals.js";
import { prefetchRaveGltf } from "./cartRaveGltf.js";
import * as Simulation from "./simulation.js";
import * as Entities from "./entities.js";
import { createCart } from "./entities.js";
import { installShatterProgramWarmup, triggerCartShatter } from "./cartShatter.js";
import * as HUD from "./hud.js";
import { STAGE_PRIORITY } from "./ui/centerStage.js";
import * as Input from "./input.js";
import * as Netcode from "./netcode.js";
import * as GameState from "./gameState.js";
import { getNpcPersonality, PERSONALITY_META } from "./npcNames.js";
import { svgIcon } from "./ui/icons.js";
import { ChallengeTracker, challengeStore, CHALLENGE_POOL } from "./stores/challengeStore.js";
import { onUnlockGranted, unlockStore } from "./stores/unlockStore.js";
import { PROGRESSION_EVENTS } from "./progression/eventIds.js";
import {
  getMatchStats,
  matchSuperlatives,
  resetMatchStats,
  setMatchStatsLocalSlot,
  snapshotMatchStats,
} from "./scoring/matchStats.js";

/** Escapes player-provided text for the innerHTML-based nametag markup. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/**
 * Builds nametag inner markup: personality icon for NPCs (expands to the
 * personality word during the countdown intro moment), host antenna for the
 * hosting human. Personality meta comes from PERSONALITY_META (npcNames.js).
 *
 * @param {string} name
 * @param {{ icon: string, color: string, label: string } | null} meta
 * @param {"intro" | "normal"} mode
 * @param {boolean} isHost
 * @returns {string}
 */
function nametagHtml(name, meta, mode, isHost) {
  const hostGlyph = isHost
    ? `<span style="opacity:.85;margin-right:5px;">${svgIcon("host", { label: "Host" })}</span>`
    : "";
  if (!meta) return `${hostGlyph}${escapeHtml(name)}`;
  const icon = `<span style="color:${meta.color};margin-right:6px;">${svgIcon(meta.icon, { label: meta.label })}</span>`;
  if (mode === "intro") {
    // * Countdown teach-moment: icon + personality word, collapses to icon-only at GO.
    return `${icon}<span style="color:${meta.color};">${meta.label}</span>`;
  }
  return `${icon}${escapeHtml(name)}`;
}
import * as AudioManager from "./audioManager.js";
import * as ArenaAmbience from "./ambience/arenaAmbience.js";
import { resolveLevelMusic } from "./music/levelMusic.js";
import * as CameraMod from "./camera.js";
import * as Effects from "./effects.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { initDirectiveEngine, getDirectiveKoRewardMultiplier, onHostSpill as directiveOnHostSpill } from "./directives/directiveEngine.js";
import { armSpillBoost, spillCountForCart } from "./cargoLoad.js";
import { loadLevel, resolveLevelId, prefetchLevelChunks, LEVEL_STORAGE_KEY, PREFETCHABLE_LEVEL_IDS } from "./levels/index.js";
import { DEV_UNLOCKS_STORAGE_KEY, LEVEL_UNLOCKS } from "./unlockConfig.js";
import { updateLevelLod } from "./utils/levelLod.js";
import { beginFrameBudget, frameBudgetAllow } from "./utils/frameBudget.js";
import { registerMirrorExclude, clearMirrorExcludes } from "./utils/cheapMirror.js";

// * testArena constants inlined (avoid static import of heavy level module at boot).
const TEST_ARENA_SKY = 0x586274;
const TEST_ARENA_FOG_DENSITY = 0.0032;
import { setContactShadowHazards } from "./contactShadows.js";
import { initSceneExtras, disposeSceneExtras } from "./sceneExtras.js";
import {
  sampleArenaReactive,
  triggerArenaKoFlash,
  resetArenaReactiveLights,
} from "./arenaReactiveLights.js";
import { initAudioSystem } from "./audioSetup.js";
import * as SfxSynth from "./sfxSynth.js";
import { hapticPulse } from "./haptics.js";
import { sideWeightsFromCartBasis } from "./utils/edgeDanger.js";
import { initAnnouncer, announce, setAnnouncerPresenter, registerAnnouncerVoicePack } from "./announcer/announcerManager.js";
import { ANNOUNCER_EVENTS } from "./announcer/announcerEvents.js";
import { expandAnnouncerVoiceKeys } from "./announcer/announcerVoiceKeys.js";
import { initAnnouncerStings } from "./announcer/announcerStings.js";
import { initAnnouncerDirector, announcerDirectorOnFall, announcerDirectorNearMissScan } from "./announcer/announcerDirector.js";
import { initAnnouncerDisplay } from "./ui/announcerDisplay.js";
import { initResultsOverlay, animateResultsPodiumShow, animateResultsDismiss, cancelResultsAnimations, spawnResultsConfetti, spawnResultsDefeatWilt } from "./ui/resultsOverlay.js";
import { installKoHitmarkerProgramWarmup, spawnKoWorldHitmarker } from "./effects/koHitmarkerFx.js";
import { installWaterFxProgramWarmup } from "./effects/waterDeathFx.js";
import { showRotatePromptIfNeeded } from "./ui/rotatePrompt.js";
import {
  dismissAllLoadingOverlays,
  dismissInitialBootSplash,
  initLoadingScreen,
  noteBootMilestone,
  revealGameCanvas,
  showQualityApplyLoading,
  whenModeEntryHidden,
  yieldForPaint,
} from "./ui/loadingScreen.js";
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
  scheduleMenuLevelPreview,
  setLevelSwapping,
  swapLoadedLevel,
} from "./levelManager.js";
import {
  enterPlayMode,
  ensureSessionCartsReady,
  ensureWorldBootstrapped,
  getLastSuccessfulHelloGen,
  initBootstrap,
  isIdleWorldWarmSuppressed,
  isWorldBootstrapped,
  resetSessionCartBootstrap,
} from "./bootstrap.js";
import { initMenuAttract, setMenuAttractRenderHold, startMenuAttract, stopMenuAttract } from "./ui/menuAttract.js";
import { animateCartBoostPulse, animateCartImpactSquash, crossfadeElement } from "./animations.js";
import {
  getIsMuted,
  getMusicVolume,
  getSfxVolume,
  initAudioControls,
  setAllAudioMuted,
  setMusicGainValue,
  setSfxSliderVolume,
  syncAllAudioUi,
  wireMenuAudioControlsOnce,
} from "./ui/audioControls.js";
import { registerGraphicsToggleHandlers } from "./ui/graphicsToggles.js";
import { createCameraFraming } from "./ui/cameraFraming.js";
import { createMenuStats } from "./ui/menuStats.js";
import { flashBoostActivate } from "./touchControls.js";
import {
  applySlowMoToDt,
  clearNpcCartCache,
  createGameLoopState,
  resetGameLoopTiming,
  runGameLoop,
  runPhysicsStep,
  updateVisualsAndEffects,
} from "./gameLoop.js";
import { updateGameFlow } from "./gameFlow.js";
import {
  cleanupSuddenDeathState,
  ensureSuddenDeathOnHostPromote,
} from "./gameFlow.js";
import { getRoundClockNowMs, getRoundRemainingMs } from "./roundClock.js";
import { ROUND_DURATION_MS } from "../shared/roundConstants.js";
import { createGameContext } from "./gameContext.js";
import {
  buildNetcodeGameBridge,
  createGameSessionController,
  createHelloGate,
  createSessionBridgeRefs,
} from "./gameSession.js";
import {
  clamp,
  isTouchDevice,
} from "./utils.js";
import { getQualityTier, setQualityTier, setSessionQualityTier } from "./utils/qualityMode.js";

// * URL level / quality boot side effects (must run before renderer creation in main()).
applyDebugBootSideEffects();
{
  const _dbgPreset = getDebugParams().preset;
  if (_dbgPreset) setSessionQualityTier(_dbgPreset);
}
import { getQualityKnobs } from "./utils/qualityTiers.js";
import { installGlobalErrorReporting } from "./utils/errorReporter.js";
import { STORAGE_KEYS, storageGet, storageSet, storageGetJson, storageSetJson, SESSION_KEYS, sessionGet, sessionSet, sessionRemove } from "./utils/storage.js";
import { CONFIG, MSG, CART_COLORS, PALETTE } from "./config.js";
import { NPC_NAME_POOL } from "./npcNames.js";
import { setUiMode as setGamepadUiMode } from "./input.js";
import { startGamepadUiNav, setGamepadNavActive } from "./ui/gamepadNav.js";

// eslint-disable-next-line no-console
console.log("%cHI :D", "font-size:32px;color:#ff2bd6;font-weight:bold;text-shadow:0 0 10px #ff2bd6");

// === UTILITY HELPERS ===

/**
 * Caches per-cart materials so recoloring doesn't traverse the mesh every update.
 * @param {THREE.Object3D} cartMesh
 */
function buildCartMaterialCache(cartMesh) {
  return buildCartThemeMaterialCache(cartMesh);
}

/**
 * Neon frame color for rendering — local human uses Customize menu; others use server slot color.
 * Wired into cart spawn, slot sync, and per-frame frame glow (see customization.js).
 *
 * @param {{ color?: string | number, kind?: string, connId?: string } | null | undefined} slot
 * @returns {number}
 */
function displayColorHexForSlot(slot) {
  return resolveCartNeonHex(slot, { youConnId: Netcode.getYouConnId() });
}

/**
 * CSS hex for HUD, name labels, and results — same rules as displayColorHexForSlot.
 * @param {{ color?: string | number, kind?: string, connId?: string } | null | undefined} slot
 * @returns {string}
 */
function displayCssColorForSlot(slot) {
  return resolveCartNeonCss(slot, { youConnId: Netcode.getYouConnId() });
}

// === CONSTANTS & CONFIG ===
// * CONFIG, MSG, CART_COLORS, PALETTE — imported from src/config.js (single source of truth).

// === NETCODE BRIDGING ===

/** Valid ?room= on first paint: show menu before PartyKit connect (friend links). */
let pendingInviteRoomFromUrl = null;

function captureInviteRoomForDeferredMenu() {
  pendingInviteRoomFromUrl = null;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  const isValid = /^[A-Za-z0-9]{2,16}$/.test(raw);
  if (!isValid) return false;
  // * Exclude well-known self-created room codes so a refresh after Quickplay or Solo
  // * does not show the JOIN ROOM button as if it were a friend invite.
  if (raw === "quickplay" || raw.toLowerCase().startsWith("solo") || raw.toLowerCase().startsWith("testdrive")) return false;
  pendingInviteRoomFromUrl = raw;
  return true;
}

/** @type {{ current: object | null }} Live bridge context wired from main(). */
const sessionBridgeCtx = { current: null };
const sessionRefs = createSessionBridgeRefs();
const helloGate = createHelloGate();

const gameSession = createGameSessionController(() => sessionBridgeCtx.current);

function bootstrapNetcodeEntryFromUrl() {
  if (typeof window === "undefined") return;

  Netcode.registerGameCallbacks(buildNetcodeGameBridge(() => sessionBridgeCtx.current, gameSession));

  if (captureInviteRoomForDeferredMenu()) {
    return;
  }
}

// === STATE & REFS ===

// --- Module-scope netcode state ---
// Replaced by Netcode.getPartySocket(), Netcode.getYouConnId(), Netcode.getIsHost()

// --- Personal Stats (localStorage) ---
function getPersonalStats() {
  const parsed = storageGetJson(STORAGE_KEYS.stats, /** @type {Record<string, unknown>} */ ({}));
  return {
    wins: Number(parsed.wins) || 0,
    matches: Number(parsed.matches) || 0,
    totalPoints: Number(parsed.totalPoints) || 0,
    soloGames: Number(parsed.soloGames) || 0,
  };
}

function savePersonalStats(stats) {
  storageSetJson(STORAGE_KEYS.stats, stats);
}

/** @returns {"quickplay" | "solo" | "testdrive" | "friends"} */
function detectGameMode() {
  const room = Netcode.resolvedPartyRoomFromUrl();
  if (room.toLowerCase().startsWith("testdrive")) return "testdrive";
  if (room.startsWith("solo")) return "solo";
  if (room === "quickplay") return "quickplay";
  return "friends";
}

function testDriveSpawnForSlot(_slotIndex, config) {
  const y = config.cart.size.y / 2 + (config.cart.collider?.localYOffset ?? 0.13) + 0.05;
  return { x: 0, y, z: 0 };
}

let isNewPersonalBest = false;



/**
 * Records end-of-round match history and local personal stats at the moment a round transitions into podium.
 * @param {number | "draw" | null} winnerSlotIndex
 * @param {Record<number, number> | null | undefined} scoresSrc
 */
function recordPodiumStats(winnerSlotIndex, scoresSrc) {
  /** @type {Record<number, number>} */
  const scores = {};
  for (let i = 0; i < 4; i += 1) {
    scores[i] = Number(scoresSrc?.[i] ?? 0);
  }

  matchHistory.push({
    endedAtMs: Date.now(),
    winnerSlotIndex: winnerSlotIndex === "draw" ? "draw" : (typeof winnerSlotIndex === "number" && Number.isFinite(winnerSlotIndex) ? winnerSlotIndex : 0),
    scores,
    mode: /** @type {any} */ (detectGameMode()),
  });
  while (matchHistory.length > 10) matchHistory.shift();

  // Update solo games counter only for rounds that count as matches.
  if (winnerSlotIndex !== "draw" && detectGameMode() === "solo") {
    let humanCount = 0;
    for (let i = 0; i < 4; i += 1) {
      const s = Netcode.getNetSlots()[i];
      if (s && s.kind === "human" && s.connId != null) humanCount += 1;
    }
    if (humanCount === 1) {
      const stats = getPersonalStats();
      stats.soloGames += 1;
      savePersonalStats(stats);
    }
  }

  // Update personal stats — only if this round had scoring (not an all-zero draw)
  if (winnerSlotIndex !== "draw") {
    const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    if (mySlotIdx >= 0) {
      const stats = getPersonalStats();
      const myScore = Number(scores[mySlotIdx] ?? 0);
      stats.matches += 1;
      stats.totalPoints += myScore;
      if (winnerSlotIndex === mySlotIdx) stats.wins += 1;
      savePersonalStats(stats);

      const storedBest = Number(storageGet(STORAGE_KEYS.bestScore, "0")) || 0;

      if (myScore > storedBest) {
        isNewPersonalBest = true;
        storageSet(STORAGE_KEYS.bestScore, String(myScore));
      }
    }
  }
}

function shuffledClientNpcNames(count) {
  const names = [...NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, count);
}

const initialNpcNames = shuffledClientNpcNames(4);

function markFirstHelloReceived() {
  helloGate.markReceived(Netcode.getNetSlots());
  void flushPendingSessionBootstrap();
}

/** Retries cart bootstrap once session bridge handlers are wired. */
async function flushPendingSessionBootstrap() {
  if (!helloGate.hasPendingBootstrap() && !helloGate.isReceived()) return;
  if (!helloGate.isReceived()) return;
  const ensureReady = sessionBridgeCtx.current?.ensureSessionReady;
  if (!ensureReady) return;
  try {
    await ensureReady();
  } catch (err) {
    console.warn("[session] cart bootstrap flush failed", err);
  } finally {
    helloGate.clearPendingBootstrap();
  }
}

function syncRoundPhase(phase) {
  GameState.setRoundPhase(phase);
}
/** @type {((msg: object) => void) | null} */
let onGameStartHandler = null;
/**
 * Monotonic generation for the deferred solo countdown. Each solo game-start bumps it and
 * captures the value; a pending whenModeEntryHidden defer only fires if its captured gen is
 * still current — so a (rare) double game-start or a quit→restart-solo race can't let a
 * stale waiter re-kick a newer game's countdown clock. (Council review follow-up.)
 */
let soloCountdownDeferGen = 0;
/** @type {(() => void) | null} */
let onHostMigratedHandler = null;
/** @type {(() => void) | null} */
let onCountdownCancelledRef = null;
/** Set to true the moment a color-dot is clicked, preventing slots-message re-renders from re-opening the picker before server confirmation arrives. */
let _localColorPicked = false;
/** @type {HTMLElement | null} */
let pendingColorChipEl = null;
/** @type {string | null} */
let pendingColorKey = null;
let menuColorPickListenerWired = false;
let customizationChangeListenerWired = false;
let menuActionListenerWired = false;
let menuNameSyncWired = false;
let quickplayAutoRejoinAttempted = false;
/** @type {boolean} */
let menuVisible = true;
/** True once the menu has been presented — later initMenu calls (returning from gameplay) skip the entrance cascade. */
let menuPresentedOnce = false;
/** @type {boolean | null} */
let lastTouchControlsVisible = null;
import { AUDIO_VOLUME_MAX, AUDIO_VOLUME_DEFAULT } from "./stores/audioStore.js";
import { settingsStore } from "./stores/settingsStore.js";

let bloomEnabled = settingsStore.getState().bloomEnabled;
let fxPassEnabled = settingsStore.getState().fxPassEnabled;
/** @type {any} */
let fxPass = null;
/** @type {null | { setLeader: (slotIndex: number|null) => void; updatePositionFromCart: (cart: any) => void; resyncVolume: () => void }} */
let leaderHum = null;

/**
 * In-memory match results for the session (resets on full page reload). Not rendered until the results overlay is wired.
 * @type {{ endedAtMs: number, winnerSlotIndex: number | "draw", scores: Record<number, number>, mode?: "solo" | "quickplay" | "testdrive" | "friends" }[]}
 */
let matchHistory = [];

/** @type {ReturnType<typeof setTimeout> | null} */
let roundPodiumTimeoutId = null;
const LAST_CART_STANDING_FLOURISH_MS = 3000;
/** @type {ReturnType<typeof setTimeout> | null} */
let autoContinuePodiumTimeoutId = null;
/** performance.now() deadline of the pending podium auto-continue (drives the button label). */
let autoContinuePodiumDeadlineMs = 0;
/** @type {string | null} */
let autoContinuePodiumKey = null;
/**
 * Non-host local estimate of the host auto-continue deadline (same 5s/10s delays).
 * Label-only — host may rematch earlier. Cleared when leaving podium.
 */
let clientPodiumAutoContinueDeadlineMs = 0;
/** Solo/testdrive ESC pause: round-clock freeze start (getRoundClockNowMs). */
let soloPauseStartedAtMs = null;
/** @type {number | null} Remaining countdown ms when ESC paused mid-countdown. */
let soloPauseCountdownRemainingMs = null;
/** Key for the active podium camera presentation (`startedAtMs:winner`). */
let podiumCameraKey = null;
/** Round key (startedAtMs) whose first-blood KO has already been escalated. */
let firstBloodRoundKey = null;
/** Sudden Death tension bed edge-latch — see the onFrame watcher. */
let sdTensionLatched = false;
/** performance.now() when the current podium camera presentation started. */
let podiumPhaseEnteredAtMs = 0;
/** True once the player pressed anything during the winner cam — results reveal immediately. */
let podiumWinnerCamSkipped = false;
/** Rising-edge tracker for the gamepad any-button podium skip poll (starts held). */
let podiumGamepadButtonHeld = true;
let podiumSkipListenersOn = false;
/** Inputs inside this window are round-end spillover (mashed boost/steer), not a skip request. */
const PODIUM_SKIP_GRACE_MS = 450;

function requestPodiumWinnerCamSkip() {
  const camElapsed = podiumPhaseEnteredAtMs > 0 ? performance.now() - podiumPhaseEnteredAtMs : 0;
  if (camElapsed < PODIUM_SKIP_GRACE_MS) return;
  podiumWinnerCamSkipped = true;
  removePodiumSkipListeners();
}

/** @param {KeyboardEvent | PointerEvent} e */
function podiumSkipInputHandler(e) {
  if (e.type === "keydown") {
    const ke = /** @type {KeyboardEvent} */ (e);
    if (ke.repeat) return; // keys still held from gameplay don't skip
    if (ke.key === "Escape") return; // Escape keeps its exit-to-menu semantics
  }
  requestPodiumWinnerCamSkip();
}

function installPodiumSkipListeners() {
  if (podiumSkipListenersOn) return;
  podiumSkipListenersOn = true;
  window.addEventListener("keydown", podiumSkipInputHandler, true);
  window.addEventListener("pointerdown", podiumSkipInputHandler, true);
}

function removePodiumSkipListeners() {
  if (!podiumSkipListenersOn) return;
  podiumSkipListenersOn = false;
  window.removeEventListener("keydown", podiumSkipInputHandler, true);
  window.removeEventListener("pointerdown", podiumSkipInputHandler, true);
}

/** Polls gamepads for a fresh any-button press during the winner cam (rising edge only). */
function pollPodiumGamepadSkip() {
  let pressed = false;
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad?.connected) continue;
    for (const b of pad.buttons) {
      if (b?.pressed) { pressed = true; break; }
    }
    if (pressed) break;
  }
  if (pressed && !podiumGamepadButtonHeld) requestPodiumWinnerCamSkip();
  podiumGamepadButtonHeld = pressed;
}

let nameLabelUpdatePending = null;

// These are assigned once main() constructs the scene / HUD / physics world.
/** @type {ReturnType<typeof HUD.init> | null} */
let hud = null;
let fpsCanvas2d = null;
let fpsCtx2d = null;
/** @type {any[] | null} */
let allCartsRef = null;
/** @type {(() => { forward: number; turn: number }) | null} */
let getAxisRef = null;
/** @type {(cart: any, nowMs: number) => void | null} */
let triggerRamBoostRef = null;
/** @type {((position: { x: number; y: number; z: number }, intensity: number, type?: string, opts?: object) => void) | null} */
let spawnTrashBurstRef = null;
/** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
let triggerLocalRamShakeRef = null;
/** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
let triggerLocalHitTakenRef = null;
/** @type {((cart: object, scene: object, neonHex: number) => void) | null} */
let triggerCartShatterRef = triggerCartShatter;
/** @type {string | null} */
let pendingMidRoundJoinRespawnConnId = null;

function teleportCartToSpawn(slotIndex) {
  if (!allCartsRef || typeof slotIndex !== "number") return;
  const cart = allCartsRef[slotIndex];
  if (!cart?.body || !cart.spawn) return;
  cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y + 1.0, z: cart.spawn.z }, true);
  cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  if (typeof cart.spawnYaw === "number") {
    const halfYaw = cart.spawnYaw / 2;
    cart.body.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
  }
  cart.body.wakeUp();
}

/**
 * Live render context for post-slots shader warm-up — wired once by main().
 * @type {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera } | null}
 */
let _slotsWarmupCtx = null;
let _slotsWarmupPending = false;

/**
 * Server-driven slot looks (remote colors/patterns) can flip a cart body's program
 * cache key (classic vs patterned uv/uv1 bodies — cartPatterns.js) AFTER the
 * round-start warm-up compiled the default-material carts. Without this, the first
 * frame that renders the re-skinned remote cart compiles its program synchronously
 * mid-round — an MP-only hitch. Coalesced: one compileAsync per slots burst.
 */
function scheduleSlotsMaterialWarmup() {
  if (!_slotsWarmupCtx || _slotsWarmupPending) return;
  _slotsWarmupPending = true;
  setTimeout(() => {
    _slotsWarmupPending = false;
    const ctx = _slotsWarmupCtx;
    if (!ctx) return;
    ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {});
  }, 0);
}

function updateCartMaterialsFromSlots(slots) {
  if (!allCartsRef || !Array.isArray(slots)) return;

  const youConnId = Netcode.getYouConnId();

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const cart = allCartsRef[slotIndex];
    if (!slot || !cart?.mesh) continue;

    if (slot.kind === "empty") {
      cart.mesh.visible = false;
      if (cart.body) cart.body.setEnabled(false);
      continue;
    }

    if (slot.kind === "human" || slot.kind === "npc") {
      cart.mesh.visible = true;
      if (cart.body) cart.body.setEnabled(true);
    }

    const finalHex = displayColorHexForSlot(slot);
    const themeId = cart.cartThemeId
      ?? resolveCartThemeForSlot(slot, { youConnId });
    const cache = cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh));

    applyThemeColorToCache(cache, themeId, finalHex);

    const theme = getCartTheme(themeId);
    if (theme.patternPolicy !== "disable") {
      const patternId = resolveCartPatternForSlot(slot, { youConnId });
      applyCartPattern(cart.mesh, patternId, finalHex);
      // * Cached like cartColor so the shatter-respawn rebuild can restore it —
      // * no slots broadcast follows a respawn, so the entity field is the only
      // * carrier (patterns vanished after the first KO without it).
      cart.cartPatternId = patternId;
    }

    cart.cartColor = finalHex;
  }
  scheduleSlotsMaterialWarmup();
}

function updateHudColorsFromSlots(slots) {
  HUD.refreshScoreBoxGlows(slots, Netcode.getYouConnId());
}

function localCartForConnId() {
  const carts = allCartsRef || [];
  const idx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
  if (idx < 0) return null;
  return carts[idx] || null;
}

const MODE_MENU_BUTTON_IDS = ["cr-solo", "cr-quickplay", "cr-friends"];

function enableModeMenuButtons() {
  for (const id of MODE_MENU_BUTTON_IDS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.classList.remove("cr-btn--boot-pending");
    btn.disabled = false;
    btn.removeAttribute("aria-disabled");
  }
}

// === GAME LOOP ===

async function main() {
  installGlobalErrorReporting();
  initLoadingScreen();
  // * Bundle fetched + parsed — the dominant real unknown in boot time.
  noteBootMilestone(45);
  // * Dismiss boot splash before scene init — initMenu() may return early on ?room= URLs.
  // * Rapier WASM is loaded lazily via dynamic import in ensureRapierPhysics, keeping
  // * the boot critical path clean.
  void dismissInitialBootSplash();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
  loadPlayerCustomization();
  wireCustomizationStorageSync();

  // * Begin cartrave4-draco.glb fetch immediately so rave carts are ready before first spawn.
  void prefetchRaveGltf()
    .then(() => noteBootMilestone(75))
    .catch((err) => {
      console.warn("[cartRaveGltf] Early prefetch failed:", err);
    });

  let labelRenderer = null;
  let input = null;

  // --- Canvas & input ---
  const canvas = document.getElementById(CONFIG.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas element '#${CONFIG.canvasId}' not found.`);
  }

  // * Create AudioListener early so Howler can share its AudioContext before any Howl loads.
  // * Attached to scene (not camera) to prevent Reflector from cloning it every frame.
  const audioListener = new THREE.AudioListener();

  // * Audio UI pushes volume/mute changes into main()-owned objects; hud/leaderHum
  // * are assigned later in main(), so getters resolve lazily (null until then).
  initAudioControls({
    getHud: () => hud,
    getAudioListener: () => audioListener,
    getLeaderHum: () => leaderHum,
  });

  // * Start music loading immediately via Howler — before scene/composer init blocks the main thread.
  // * Page-visibility guard pauses/silences audio in background tabs (user mute unchanged).
  AudioManager.initAudioManager(audioListener.context, {
    getAudioListener: () => audioListener,
  });

  // * Restore saved volume state (loaded from localStorage by audioControls at module scope).
  AudioManager.restoreVolumeState({
    master: getMusicVolume() / AUDIO_VOLUME_MAX,
    sfx: getSfxVolume() / AUDIO_VOLUME_MAX,
    music: getMusicVolume() / AUDIO_VOLUME_MAX,
    muted: getIsMuted(),
  });

  // * Opus has universal browser support (Chrome, Firefox, Safari, Edge).
  // * No fallback array needed — pass a single URL to Howler.
  const soundUrl = (name) =>
    new URL(`sounds/${name}`, window.location.href).toString();

  // * Menu music is eager (preload + play request) so it can start as soon as the menu is up.
  // * Game playlist is URL-only until enter-play — avoids ~10 MB competing with menu.opus.
  AudioManager.loadMenuMusic(soundUrl("menu.opus"));
  if (menuVisible) AudioManager.playMenuMusic();
  // * Menu HTML loads before main; first gesture calls this to start menu music
  // * once Howler is wired (see cart-rave-menu.js pointerdown bridge). Also
  // * invoked best-effort at boot-splash dismiss — the resume() only succeeds
  // * where autoplay policy allows, and rejections are swallowed.
  window.__cartRaveTryStartMenuMusic = () => {
    try {
      // * Only while the menu is actually up. Boot-splash dismiss and the menu
      // * shell's first-pointerdown hook can fire AFTER Solo/Quickplay already
      // * started level music — without this guard they called playMenuMusic()
      // * and the menu track bled into (or stole) the arena playlist.
      if (!menuVisible) return;
      if (AudioManager.isGameMusicPlaying()) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      AudioManager.playMenuMusic();
    } catch {
      /* ignore */
    }
  };

  // * Music is per-arena now (src/music/levelMusic.js): each arena's own track list
  // * is set as the playlist at play entry / arena swap. Multi-song levels shuffle +
  // * advance; single-song levels loop. setGamePlaylist is URL-only (preload:false)
  // * so nothing fetches until the first playGameMusic at game entry.
  function startLevelMusic(levelId) {
    const files = resolveLevelMusic(levelId);
    // * Shuffle a multi-song level so the same track doesn't always open. Single-song
    // * levels are unaffected. RNG lives here (main), not the resolvable/testable module.
    for (let i = files.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }
    AudioManager.setGamePlaylist(files.map((f) => [soundUrl(f)]));
    AudioManager.playGameMusic();
  }

  // * Autoplay policy: unlock AudioContext on the first user gesture anywhere on the page.
  // * Registered early (before initMenu) with capture so it fires before other handlers.
  let didUnlockAudio = false;
  function unlockAudio() {
    if (didUnlockAudio) return;
    didUnlockAudio = true;
    const ctx = audioListener.context;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    if (menuVisible) AudioManager.playMenuMusic();
    if (!menuVisible) AudioManager.playGameMusic();
  }
  window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
  window.addEventListener("keydown", unlockAudio, { capture: true, once: true });

  // Make canvas able to receive keyboard focus.
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  // Try to focus immediately on load (some browsers require a user gesture;
  // pointerdown above covers that).
  setTimeout(() => canvas.focus(), 0);

  input = Input.setupInput(
    canvas,
    () => {
      // * On the results/podium screen, Escape (and gamepad B, which dispatches
      // * Escape) backs out to the MAIN MENU instead of opening the pause overlay
      // * on top of the podium — matches the MAIN MENU button's behavior.
      if (GameState.getRoundState().phase === "podium") {
        podiumAutoContinue.clear();
        gameSession.returnToMenu({ reason: "results" });
        return;
      }
      if (HUD.isEscOverlayVisible()) {
        HUD.hideEscOverlay();
      } else {
        HUD.showEscOverlay();
      }
    },
    () => {
      setAllAudioMuted(!getIsMuted());
    },
    () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      attemptLocalHop();
    },
    () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      const cart = localCartForConnId();
      if (!cart) return;
      triggerRamBoost(cart, performance.now());
    }
  );

  Input.setupTouchControls({
    onHop: () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      attemptLocalHop();
    },
    onBoost: () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      const cart = localCartForConnId();
      if (!cart) return;
      triggerRamBoost(cart, performance.now());
    },
  });

  startGamepadUiNav();

  function updateTouchControlsVisibility() {
    const roundPhase = GameState.getRoundState().phase;
    const show =
      isTouchDevice() &&
      !menuVisible &&
      roundPhase !== "podium" &&
      !HUD.isEscOverlayVisible();
    if (show === lastTouchControlsVisible) return;
    lastTouchControlsVisible = show;
    Input.setTouchControlsVisible(show);
  }

  // --- Renderer & scene ---
  const renderer = createRenderer(canvas);

  // * WebGL context loss (iOS Safari reclaims contexts aggressively under memory
  // * pressure/backgrounding; previously the game just froze with no recovery path).
  // * preventDefault permits restoration; a full reload is the only state-safe
  // * recovery for the whole app (composer RTs, instanced buffers, WASM-side refs).
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn("[CartRave] WebGL context lost");
  });
  let contextLossReloaded = false;
  canvas.addEventListener("webglcontextrestored", () => {
    if (contextLossReloaded) return;
    contextLossReloaded = true;
    console.warn("[CartRave] WebGL context restored — reloading for a clean GPU state");
    window.location.reload();
  });

  // * Software-WebGL notice: createRenderer already floored the session to LOW;
  // * tell the player why it looks reduced and how to fix it. Dismissible, one
  // * per session, styled to sit under the menu without blocking anything.
  if (isSoftwareRendererActive()) {
    const notice = document.createElement("div");
    notice.id = "cr-softgl-notice";
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:20010;"
      + "max-width:min(92vw,560px);padding:10px 40px 10px 14px;border:1px solid #ff2bd6;"
      + "background:rgba(12,6,20,0.92);color:#f4eaff;font:12px/1.5 'Space Mono',monospace;"
      + "border-radius:8px;box-shadow:0 0 18px rgba(255,43,214,0.35);";
    notice.innerHTML =
      "<strong>◆ COMPATIBILITY MODE</strong><br>"
      + "Your browser is drawing without GPU acceleration, so graphics are set to LOW. "
      + "For the full experience, enable hardware acceleration (Settings → System) and reload.";
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "✕";
    close.style.cssText =
      "position:absolute;top:6px;right:8px;background:none;border:none;color:#f4eaff;"
      + "font:14px 'Space Mono',monospace;cursor:pointer;padding:2px 6px;";
    close.addEventListener("click", () => notice.remove(), { once: true });
    notice.appendChild(close);
    document.body.appendChild(notice);
  }

  const scene = createScene();

  const { ramBoostStreaks } = Effects.initEffects(scene, { ramBoost: CONFIG.cart.ramBoost, cartColors: CART_COLORS });
  spawnTrashBurstRef = Effects.spawnTrashBurst;

  // * IBL PMREM bake deferred until after the menu is shown (see bootstrapWorldCore).

  // --- Camera, audio, post-processing ---
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    600,
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);
  _slotsWarmupCtx = { renderer, scene, camera };


  let shakeUntil = 0;
  let shakeIntensity = 0;
  let fovPunchUntil = 0;
  // * Punch amplitude in degrees — ram hits use the base 8°, kill confirms hit harder.
  let fovPunchDeg = 8;
  // * Kill-confirm white flash + radial shockwave on the arcade pass (uFlash / uShock).
  // * Slightly longer than a pure white pop so the expanding Shadertoy-style ring can read.
  const killFlash = { until: 0, durationMs: 200, strength: 0 };
  // * KO hit-stop — presentation-only: rendered cart poses + the follow camera hold for
  // * ~80ms while physics/prediction/reconciliation run untouched, then blend back over
  // * ~120ms (frameVisuals consumes this). Never touches dt or the physics accumulator.
  const hitStop = { until: 0, blendUntil: 0 };
  // * Camera-follow scratch for the reconcile-smoothed pose (non-host prediction) — the
  // * follow camera reads body pose + _reconcileVisOffset so it never sees reconcile snaps.
  const _camReconPosScratch = { x: 0, y: 0, z: 0 };
  const _camReconRotScratch = new THREE.Quaternion();
  const _camReconYawScratch = new THREE.Quaternion();
  const _camReconYAxis = new THREE.Vector3(0, 1, 0);
  // * Post-FX impact pulse — vignette/aberration kick when the local cart takes a big hit.
  // * Baselines are captured from the live uniforms at trigger time so the pulse never
  // * fights the dev Tweakpane or config changes; frameVisuals decays and restores them.
  const impactPulse = { until: 0, durationMs: 170, strength: 0, baseVignette: null, baseAberration: null };
  function triggerImpactPulse(strength) {
    const pass = fxPass;
    if (!pass?.enabled || !pass.uniforms) return;
    const now = performance.now();
    if (now >= impactPulse.until) {
      impactPulse.baseVignette = pass.uniforms.uVignette.value;
      impactPulse.baseAberration = pass.uniforms.uAberration.value;
    }
    impactPulse.strength = Math.min(strength, 0.9);
    impactPulse.until = now + impactPulse.durationMs;
  }
  // * max-of on both duration and amplitude — overlapping punches never truncate or
  // * soften each other (a ram punch landing mid kill-punch keeps the kill's 12°).
  function armFovPunch(deg, durationMs) {
    const now = performance.now();
    fovPunchDeg = now < fovPunchUntil ? Math.max(fovPunchDeg, deg) : deg;
    fovPunchUntil = Math.max(fovPunchUntil, now + durationMs);
  }
  function triggerLocalRamShake(intensity, isBoosting = false) {
    const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
    const minI = isBoosting
      ? (fx.shakeBoostMinIntensity ?? 0.24)
      : (fx.shakeMinIntensity ?? 0.38);
    if (intensity < minI) return;
    const clampedI = Math.min(intensity, 1.2);
    const boostMul = isBoosting ? 1.3 : 1.0;
    shakeIntensity = clampedI * (fx.shakePixelScale ?? 5.5) * boostMul;
    shakeUntil = performance.now() + 150 + clampedI * 100;
    // * Attacker-side pulse runs softer than victim-side — you need to keep aiming
    // * through your own hit feedback (playtest 07-17: "flash too disorienting").
    triggerImpactPulse(clampedI * 0.7);
    hapticPulse(clampedI * 0.7, clampedI * 0.4, 60 + clampedI * 60);
    if (clampedI >= 0.45 && isBoosting) {
      armFovPunch(8, 100);
    }
  }
  // * Victim-side ram feedback — shake/post-FX only on hard hits; directional DOM
  // * vignette arms on lighter rams too (most impulses sit below shakeMinIntensity).
  /**
   * @param {number} intensity
   * @param {boolean} [isBoosting]
   * @param {number} [hitFromX] World-XZ direction the blow came from (attacker relative to you)
   * @param {number} [hitFromZ]
   */
  function triggerLocalHitTaken(intensity, isBoosting = false, hitFromX = 0, hitFromZ = 0) {
    const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
    const clampedI = Math.min(Math.max(Number(intensity) || 0, 0), 1.35);

    // * Directional hit cue first — lower floor than shake so everyday rams still read.
    // * fxIntensity is impulse/maxImpulse; typical non-boost rams often land ~0.1–0.35.
    const vignetteMin = fx.hitDirMinIntensity ?? 0.08;
    if (clampedI >= vignetteMin) {
      pulseLocalHitDirectionVignette(clampedI, hitFromX, hitFromZ);
    }

    const minI = isBoosting
      ? (fx.shakeBoostMinIntensity ?? 0.24)
      : (fx.shakeMinIntensity ?? 0.38);
    if (clampedI < minI) return;
    const boostMul = isBoosting ? 1.3 : 1.0;
    shakeIntensity = clampedI * (fx.shakePixelScale ?? 5.5) * boostMul;
    shakeUntil = performance.now() + 150 + clampedI * 100;
    triggerImpactPulse(Math.min(clampedI * 1.15, 1.2));
    hapticPulse(clampedI * 0.85, clampedI * 0.5, 70 + clampedI * 70);
  }

  /** Scratch for hit-direction → cart-local side mapping (no per-hit allocs). */
  const _hitDirFwd = new THREE.Vector3();
  const _hitDirRight = new THREE.Vector3();
  const _hitDirUp = new THREE.Vector3(0, 1, 0);
  const _hitDirQuat = new THREE.Quaternion();

  /**
   * @param {number} clampedI Raw collision intensity (often << 1 for normal rams).
   * @param {number} hitFromX
   * @param {number} hitFromZ
   */
  function pulseLocalHitDirectionVignette(clampedI, hitFromX, hitFromZ) {
    const cart = localCartForConnId();
    if (!cart?.body || typeof HUD.pulseHitDirection !== "function") return;

    // * Remap low impulse intensities into a readable display range (tuned +25% then +10%).
    // * sqrt eases mid-hits up without washing out boost rams.
    const displayI = Math.min(1, 0.46 + Math.sqrt(Math.min(clampedI, 1.2)) * 0.79);

    const len = Math.hypot(hitFromX, hitFromZ);
    let top = 0;
    let right = 0;
    let bottom = 0;
    let left = 0;
    if (len > 1e-4) {
      const nx = hitFromX / len;
      const nz = hitFromZ / len;
      const rot = cart.body.rotation();
      _hitDirQuat.set(rot.x, rot.y, rot.z, rot.w);
      _hitDirFwd.set(0, 0, -1).applyQuaternion(_hitDirQuat);
      _hitDirFwd.y = 0;
      if (_hitDirFwd.lengthSq() > 1e-6) _hitDirFwd.normalize();
      else _hitDirFwd.set(0, 0, -1);
      _hitDirRight.crossVectors(_hitDirFwd, _hitDirUp).normalize();
      const sides = sideWeightsFromCartBasis(
        displayI,
        nx,
        nz,
        _hitDirFwd.x,
        _hitDirFwd.z,
        _hitDirRight.x,
        _hitDirRight.z,
      );
      top = sides.top;
      right = sides.right;
      bottom = sides.bottom;
      left = sides.left;
    } else {
      const u = displayI * 0.45;
      top = right = bottom = left = u;
    }

    const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    const slot = Netcode.getNetSlots()?.[localSlot];
    const colorCss = hud?.colorHexToCss?.(displayColorHexForSlot(slot))
      || _playerAccentFromHud()
      || "#22e6ff";

    HUD.pulseHitDirection({
      intensity: displayI,
      top,
      right,
      bottom,
      left,
      colorCss,
      durationMs: 420 + displayI * 220,
    });
  }

  /** @returns {string | null} */
  function _playerAccentFromHud() {
    try {
      return getComputedStyle(document.getElementById("hud") || document.documentElement)
        .getPropertyValue("--hud-player-accent")
        .trim() || null;
    } catch {
      return null;
    }
  }
  // * Squash-and-stretch on impact — the victim compresses hard, the rammer flexes
  // * lightly. Fired for every collision on the host and replayed for non-hosts, so
  // * hits read as physical on every cart, not just the local one.
  function squashCartsOnImpact(rammerCart, victimCart, intensity) {
    if (victimCart?.mesh) animateCartImpactSquash(victimCart.mesh, Math.min(intensity * 1.1, 1.2));
    if (rammerCart?.mesh) animateCartImpactSquash(rammerCart.mesh, intensity * 0.6);
  }
  // * Attacker-side KO payoff — confirm sting + hitmarker + harder FOV punch + white
  // * flash + aberration kick + reward-breakdown float. Fired by gameFlow on the host
  // * and by the falls[] replay path on non-host clients (the wire fall record carries
  // * the reward context). Purely presentational — never touches physics dt.
  function onLocalKillConfirm(_victimSlotIndex, _comboTier, koEvent) {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!reducedMotion) {
      // * max-of on chained KOs so a double-kill can't truncate the first stop.
      const nowMs = performance.now();
      hitStop.until = Math.max(hitStop.until, nowMs + 80);
      hitStop.blendUntil = hitStop.until + 120;
    }
    armFovPunch(9, 180);
    killFlash.strength = 0.45;
    killFlash.until = performance.now() + killFlash.durationMs;
    triggerImpactPulse(0.4);
    hapticPulse(0.9, 0.6, 120);
    AudioManager.duckMusic(0.45, 600);
    SfxSynth.playKillConfirm();
    hud?.showKillConfirm?.();
    if (koEvent?.reward) hud?.showScoreFloat?.(koEvent.reward, koEvent.cause);
  }

  /**
   * Arena-wide KO light flash — every peer sees the club react (not just the scorer).
   * @param {import("./scoring/koEvent.js").KOEvent} koEvent
   */
  function onArenaKoFlash(koEvent) {
    const slots = Netcode.getNetSlots();
    const colorSlotIndex = koEvent.attackerSlotIndex != null
      ? koEvent.attackerSlotIndex
      : koEvent.victimSlotIndex;
    const slot = slots?.[colorSlotIndex];
    const hex = displayColorHexForSlot(slot);
    // * First blood: the match's first KO gets a bigger flash + hitmarker so the opening
    // * elimination reads as an event, not just another KO. Keyed by round so it re-arms
    // * each round; fires for every peer (this reactor runs on all clients).
    const roundKey = GameState.getRoundState()?.startedAtMs ?? 0;
    const isFirstBlood = koEvent.isKill && firstBloodRoundKey !== roundKey;
    if (isFirstBlood) firstBloodRoundKey = roundKey;
    const fbFlashMul = isFirstBlood ? 1.45 : 1;
    // * Reduced strengths vs the original reactive mode — a punch accent, not a recolor.
    triggerArenaKoFlash(hex, {
      strength: (koEvent.isKill ? 0.6 : 0.35) * fbFlashMul,
      durationMs: (koEvent.isKill ? 340 : 240) * (isFirstBlood ? 1.3 : 1),
    });
    // * World hitmarker at the victim — every peer sees where the KO landed.
    const victim = allCarts?.[koEvent.victimSlotIndex];
    if (scene && victim) {
      let px = 0;
      let py = 1;
      let pz = 0;
      if (victim.body) {
        const t = victim.body.translation();
        px = t.x;
        py = t.y + 0.55;
        pz = t.z;
      } else if (victim.mesh) {
        px = victim.mesh.position.x;
        py = victim.mesh.position.y + 0.35;
        pz = victim.mesh.position.z;
      }
      spawnKoWorldHitmarker(
        scene,
        px,
        py,
        pz,
        hex,
        (koEvent.isKill ? 1.05 : 0.6) * fbFlashMul,
      );
    }
    // * Scoreboard rampage pips ride this reactor because it fires for every fall on
    // * every client: refresh the attacker's streak, clear the fallen victim's.
    if (koEvent.attackerSlotIndex != null && (koEvent.comboTier ?? 0) > 0) {
      hud?.noteComboPip?.(koEvent.attackerSlotIndex, koEvent.comboTier, koEvent.comboMultiplier ?? 1);
    }
    hud?.noteComboPip?.(koEvent.victimSlotIndex, 0);
    // * Crowd cheer on kills — Classic Record only (the one arena with a visible crowd;
    // * a cheering audience in the Storerooms would break the liminal theme).
    if (koEvent.isKill && getCurrentLevelId() === "classicRecord") {
      SfxSynth.playCrowdCheer(0.55 + Math.min(koEvent.comboTier ?? 0, 3) * 0.12);
    }
    // * The crowd bed reacts too (Classic hype layer; no-op elsewhere): kills swell it,
    // * combos and first blood push it toward a roar, plain falls nudge it.
    ArenaAmbience.bumpCrowdExcitement(
      (koEvent.isKill ? 0.4 + Math.min(koEvent.comboTier ?? 0, 3) * 0.12 : 0.16)
        * (isFirstBlood ? 1.35 : 1),
    );
  }
  triggerLocalRamShakeRef = triggerLocalRamShake;
  triggerLocalHitTakenRef = triggerLocalHitTaken;
  triggerCartShatterRef = triggerCartShatter;

  function triggerSpillNetcode(slotIndex, pos, quat, vel, cargoBay, count) {
    if (!Netcode.getIsHost()) return;
    // Send over WebRTC DataChannel instead of WebSocket
    // The host broadcasts this to all non-host peers
    Netcode.sendP2PEvent({
      type: MSG.spill,
      slotId: slotIndex,
      pos,
      quat,
      vel,
      cargoBay: !!cargoBay,
      count,
    });
  }

  // * Living Cargo spill helpers (armSpillBoost / spillCountForCart) live in
  // * cargoLoad.js — one source shared by the host sim, gameFlow fall, and netcode
  // * MSG.spill paths.

  const gameCtx = createGameContext().registerModules({
    Netcode,
    GameState,
    Simulation,
    Entities,
    Input,
    HUD,
  });
  const BASE_FOV = CONFIG.camera.fov;

  const audioSystem = initAudioSystem(audioListener, {
    getSfxVolume,
    getIsMuted,
  });
  if (!leaderHum) leaderHum = audioSystem.leaderHum;
  // * Procedural stings (kill confirm, victory/defeat, sudden death, timer ticks,
  // * challenge complete) share the leader-chime WebAudio path and volume gates.
  SfxSynth.initSfxSynth(audioListener, { getSfxVolume, getIsMuted });

  // * "The Store PA" announcer — voice/sting playback core, then the presentation-only
  // * game-state observer that decides what to announce and when.
  initAnnouncerStings(audioListener, { getSfxVolume, getIsMuted });
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
    getLastHitBy: () => GameState.getLastHitBy(),
    // * Host-local presentation; non-hosts get the same path via MSG.spillBonus.
    onSpillBonusAward: (award) => presentSpillBonusAward(award),
  });

  /**
   * Spill Bonus feed + (local attacker only) score float / light confirm.
   * Host: onSpillBonusAward. Clients: netcode MSG.spillBonus (scores still via round).
   * @param {{ attackerSlotIndex?: number, victimSlotIndex?: number, points?: number }} award
   */
  function presentSpillBonusAward(award) {
    if (!award) return;
    const attackerSlotIndex = Number(award.attackerSlotIndex);
    const victimSlotIndex = Number(award.victimSlotIndex);
    const points = Math.max(0, Number(award.points) || 0);
    if (!Number.isFinite(attackerSlotIndex) || !Number.isFinite(victimSlotIndex) || points <= 0) {
      return;
    }
    const slots = Netcode.getNetSlots();
    const attacker = slots?.[attackerSlotIndex];
    const victim = slots?.[victimSlotIndex];
    const actorName = attacker?.name || `P${attackerSlotIndex + 1}`;
    const targetName = victim?.name || `P${victimSlotIndex + 1}`;
    const actorColor = hud?.colorHexToCss?.(displayColorHexForSlot(attacker)) ?? null;
    const targetColor = hud?.colorHexToCss?.(displayColorHexForSlot(victim)) ?? null;
    hud?.addKillFeedEntry?.(actorName, actorColor, "SPILLED", targetName, targetColor, 0, 1);

    const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    if (attackerSlotIndex !== localSlot) return;

    hud?.showScoreFloat?.(
      {
        base: points,
        critical: 0,
        leader: 0,
        highGround: 0,
        multiplier: 1,
        total: points,
      },
      "spill_bonus",
    );
    // * Lighter than a full KO confirm — just enough for the +1 to land.
    hapticPulse(0.35, 0.25, 45);
    SfxSynth.playKillConfirm();
  }

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

  scene.add(audioListener);

  const { composer, bloomPass, arcadePass, fxaaPass, outputPass } = createComposer(renderer, scene, camera);
  fxPass = arcadePass;
  if (!bloomEnabled && bloomPass) bloomPass.enabled = false;
  if (!fxPassEnabled && fxPass) fxPass.enabled = false;
  // * URL ablation / postmin — after user toggles so disabled flags still win for QA.
  applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });
  if (getDebugParams().cam) applyDebugCameraPose(camera);

  if (import.meta.env.DEV) {
    // * Dev-only perf probe (see createRenderer): scene/camera/composer for console-driven profiling.
    const probe = /** @type {any} */ (window);
    probe.__cartRavePerf = { ...probe.__cartRavePerf, scene, camera, composer };
  }

  // * Attract-mode arena backdrop: renders the idle-warmed arena behind the
  // * menu on its own throttled loop (the game loop skips while menuVisible).
  initMenuAttract({
    camera,
    scene,
    renderer,
    composer,
    isWorldBootstrapped,
    getMenuVisible: () => menuVisible,
    getArenaRadius: () => CONFIG.record.radius,
    getLevelId: getCurrentLevelId,
    // * Weak machines land at the MENU first — feed measured attract render cost
    // * to the same session watchdog the game loop uses so they step down to a
    // * survivable tier before ever entering a round. (Frame spacing can't be
    // * used here: the attract loop throttles to ~30fps by design.)
    onRenderCost: (renderCostSec, nowMs) => {
      if (tickAutoQuality(renderCostSec, nowMs)) handleAutoQualityStepDown();
    },
  });

  let devControl = null;
  if (import.meta.env.DEV) {
    try {
      const [{ initPostFxDebugGui }, { createDevControl }] = await Promise.all([
        import("./postFxDebug.js"),
        import("./dev/devControl.js"),
      ]);
      devControl = createDevControl({
        getIsHost: () => Netcode.getIsHost(),
        getRoundState: () => GameState.getRoundState(),
        getNetSlots: () => Netcode.getNetSlots(),
        getYouConnId: () => Netcode.getYouConnId(),
        getLocalSlotIndex: (connId) => Netcode.strictSlotIndexForConn(connId),
        setRoundScores: (scores) => GameState.setRoundScores(scores),
        setRoundStartedAtMs: (startedAtMs) => GameState.setRoundStartedAtMs(startedAtMs),
        getRoundClockNowMs,
        sendHostRound: () => Netcode.sendHostRound(),
        grantKos: (level, n) => unlockStore.getState().recordKillOnLevel(level, n),
        roundDurationMs: CONFIG.round.durationMs,
        // * Non-host session teardown lever — drives the real menu-return path so the
        // * netharness teardownRejoin scenario can reproduce the 07-17 axis-unwire freeze.
        returnToMenu: (reason) => gameSession.returnToMenu({ reason }),
      });
      const getDevStatus = () => {
        const state = GameState.getRoundState();
        const adjustedNow = getRoundClockNowMs() - Netcode.getHostClockOffsetMs();
        let unlockOverride = null;
        try {
          unlockOverride = localStorage.getItem(DEV_UNLOCKS_STORAGE_KEY);
        } catch {
          // * Privacy modes report the default rather than blocking the panel.
        }
        return {
          isHost: Netcode.getIsHost(),
          phase: state.phase,
          remainMs: state.phase === "running" && !state.isSuddenDeath
            ? getRoundRemainingMs(state.startedAtMs, CONFIG.round.durationMs, adjustedNow)
            : null,
          unlockOverride,
        };
      };
      initPostFxDebugGui({
        renderer, scene, camera, bloomPass, arcadePass, fxaaPass,
        control: devControl,
        getStatus: getDevStatus,
      });
    } catch (error) {
      console.warn("[CartClashDev] Developer panel failed to initialize:", error);
    }
  }

  const fxTimer = new THREE.Timer();

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "fixed";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  // * World-anchored labels sit UNDER all screen UI: below touch controls
  // * (19990) and the HUD (20000) — countdown/SUDDEN DEATH banners, chips, and
  // * feed plates must never draw behind a nametag.
  labelRenderer.domElement.style.zIndex = "19985";
  labelRenderer.domElement.style.display = menuVisible ? "none" : "block";
  document.body.appendChild(labelRenderer.domElement);

  CameraMod.initCameraFollow(camera, CONFIG.camera);

  const cartLinvelScratch = new THREE.Vector3();
  const cartAngvelScratch = new THREE.Vector3();
  const netTargetPosScratch = new THREE.Vector3();
  // * Booth neon mats keep authored per-booth hues; pulse reuses this Set so each
  // * shared material is intensity-updated once per frame (not once per tube mesh).
  const boothNeonMatsSeen = new Set();
  const fpsState = {
    frames: 0,
    last: performance.now(),
    get canvas() { return fpsCanvas2d; },
    set canvas(v) { fpsCanvas2d = v; },
    get ctx() { return fpsCtx2d; },
    set ctx(v) { fpsCtx2d = v; },
  };

  const { updateViewport } = createCameraFraming({
    camera,
    renderer,
    composer,
    arcadePass,
    fxaaPass,
    bloomPass,
    labelRenderer,
    getFpsCanvas: () => fpsCanvas2d,
  });

  updateViewport();

  // --- HUD, menu, results overlay ---
  // * Audio state + menu audio wiring live in ui/audioControls.js (initAudioControls above).

  /** Wired after clearAutoContinuePodiumTimeout is defined in main(). */
  const podiumAutoContinue = { clear: () => {} };

  function onMenuBootstrapError(mode, err) {
    console.error(`[menu] ${mode} bootstrap failed:`, err);
    dismissAllLoadingOverlays();
    // * The player is dropped back at the menu — say why instead of failing silently.
    window.CartRave?.showToast?.("Couldn't start the game — check your connection and try again.", 6000);
  }

  /** @returns {boolean} true when initNetcode was invoked without throwing. */
  function bootstrapNetcodeFromMenu(mode, roomOverride) {
    try {
      Netcode.initNetcode(roomOverride);
      return true;
    } catch (err) {
      onMenuBootstrapError(mode, err);
      return false;
    }
  }

  /**
   * Solo/test-drive arena-ready hook for enterPlayMode: kicks netcode under the
   * loading overlay and holds the overlay until carts exist and shader warm-up is
   * done (ensureSessionCartsReady resolves post-warmup; the solo game start fires
   * off that same promise — so the countdown can't begin before loading completes).
   * @param {string} modeLabel
   * @returns {(report: (pct: number, label: string) => void) => Promise<void>}
   */
  function makeSoloArenaReadyHook(modeLabel) {
    return async (report) => {
      report?.(96, "Rolling out carts…");
      if (!bootstrapNetcodeFromMenu(modeLabel)) return;
      await ensureSessionCartsReady();
    };
  }

  /**
   * Multiplayer (quickplay/friends) arena-ready hook — same cold-load gate as solo:
   * keep mode-entry overlay until netcode hello + carts + shader warm finish (NET-2).
   * @param {string} modeLabel
   * @param {string} [roomOverride]
   * @returns {(report: (pct: number, label: string) => void) => Promise<void>}
   */
  function makeMultiplayerArenaReadyHook(modeLabel, roomOverride) {
    return async (report) => {
      report?.(94, "Connecting…");
      if (!bootstrapNetcodeFromMenu(modeLabel, roomOverride)) return;
      report?.(97, "Rolling out carts…");
      await ensureSessionCartsReady();
      Netcode.reapplyCachedCartsSnapshot?.();
    };
  }

  function initMenu() {
    noteBootMilestone(90);
    menuVisible = true;
    removePodiumSkipListeners();
    setGamepadNavActive(true);
    startMenuAttract();
    syncAllAudioUi();
    // * Always dismiss boot splash first — solo/quickplay paths return early below.
    void dismissInitialBootSplash();
    updateTouchControlsVisibility();
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) HUD.hideAudioWidget();
    // * Single canonical gameplay-HUD hide (timer/scores/ready/status/feed plus
    // * combo badge, boost meter, and reconnect pill — internals main.js can't reach).
    HUD.hideGameplayElements();
    // Stop game music before menu music starts.
    try { AudioManager.stopGameMusic(); } catch (e) {}
    try { ArenaAmbience.stopArenaAmbience(); } catch (e) {}
    try { AudioManager.playMenuMusic(); } catch (e) {}
    const wrap = document.getElementById("cr-root");
    if (wrap) {
      // * First presentation gets the full entrance cascade; same-session returns
      // * from gameplay reveal instantly — replaying the ~1s stagger read as lag.
      if (menuPresentedOnce) window.CartRave?.revealShell?.();
      else window.CartRave?.show?.();
      menuPresentedOnce = true;
    }

    // Cosmetic: mark color chip as pending until server confirms slots.
    if (!menuColorPickListenerWired) {
      menuColorPickListenerWired = true;
      const customizeColorRow = document.getElementById("cr-customize-color-row");
      if (customizeColorRow) {
        customizeColorRow.addEventListener("click", (e) => {
          const chip = e.target && e.target.closest ? e.target.closest(".cr-color-chip") : null;
          if (!chip) return;
          pendingColorChipEl?.classList.remove("color-pending");
          pendingColorChipEl = chip;
          pendingColorChipEl.classList.add("color-pending");
          _localColorPicked = true;
          const colorToSend = resolveServerColorPick();
          pendingColorKey = colorToSend && PALETTE.includes(colorToSend) ? colorToSend : null;
          if (pendingColorKey && Netcode.getPartySocket() && Netcode.getPartySocket().readyState === WebSocket.OPEN) {
            Netcode.sendColorPick(pendingColorKey);
          }
        });
      }
    }

    let room = Netcode.resolvedPartyRoomFromUrl();

    // * Mid-round refresh recovery: a solo/testdrive ?room= this tab already
    // * entered gameplay in is a stale leftover, not a deep link. Strip it and
    // * present a clean menu (harness/deep-link boots have no sessionStorage
    // * marker, so their auto-enter below still works).
    if (
      room
      && /^(solo|testdrive)/i.test(room)
      && sessionGet(SESSION_KEYS.engagedRoom) === room
    ) {
      sessionRemove(SESSION_KEYS.engagedRoom);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("room");
      history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}`);
      room = null;
    }

    if (room && room.toLowerCase().startsWith("testdrive")) {
      void enterPlayMode({
        gameMode: "testdrive",
        levelId: "testArena",
        onArenaReady: makeSoloArenaReadyHook("Test Drive"),
      })
        .then(() => showRotatePromptIfNeeded())
        .catch((err) => onMenuBootstrapError("Test Drive", err));
      return;
    }

    if (room && room.toLowerCase().startsWith("solo")) {
      void enterPlayMode({
        gameMode: "solo",
        onArenaReady: makeSoloArenaReadyHook("Solo"),
      })
        .then(() => showRotatePromptIfNeeded())
        .catch((err) => onMenuBootstrapError("Solo", err));
      return;
    }

    // * Returning visitor refreshing ?room=quickplay — auto-rejoin once per page load.
    const savedUsername = (storageGet(STORAGE_KEYS.username) || "").trim();
    const roomParam = new URLSearchParams(window.location.search || "").get("room");
    if (roomParam === "quickplay" && savedUsername && !quickplayAutoRejoinAttempted) {
      quickplayAutoRejoinAttempted = true;
      void enterPlayMode({
        gameMode: "quickplay",
        commitMenuHidden: false,
        onArenaReady: makeMultiplayerArenaReadyHook("Quickplay"),
      }).catch((err) => onMenuBootstrapError("Quickplay", err));
      return;
    }

    document.getElementById("cr-btn-join-invite")?.remove();
    if (pendingInviteRoomFromUrl) {
      const btnRow = document.querySelector(".cr-buttons");
      if (btnRow) {
        const btn = document.createElement("button");
        btn.id = "cr-btn-join-invite";
        btn.type = "button";
        btn.className = "cr-btn";
        btn.dataset.action = "joinroom";
        btn.dataset.colorkey = "secondary";
        btn.innerHTML =
          '<span class="cr-btn-inner"><span class="cr-btn-label">JOIN ROOM</span></span>';
        btnRow.insertBefore(btn, btnRow.firstChild);
        btn.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("cartrave:menu", { detail: { action: "joinroom" } }));
        });
        window.CartRave?.wireMenuButton?.(btn, { delay: 0, duration: 340, y: 18 });
      }
    }

    // Wire new menu button events (once — initMenu may run again after failed joins).
    if (!menuActionListenerWired) {
      menuActionListenerWired = true;
      window.addEventListener("cartrave:menu", (e) => {
      const action = e.detail.action;
      if (action === "solo" || action === "quickplay" || action === "friends" || action === "testdrive") {
        if (!window.__cartRaveBootstrapped) return;
      }
      if (action === "joinroom") {
        const room = pendingInviteRoomFromUrl;
        if (!room) return;
        pendingInviteRoomFromUrl = null;
        document.getElementById("cr-btn-join-invite")?.remove();
        void enterPlayMode({
          gameMode: "friends",
          commitMenuHidden: false,
          onArenaReady: makeMultiplayerArenaReadyHook("Friends", room),
        }).catch((err) => onMenuBootstrapError("Friends", err));
        return;
      }
      pendingInviteRoomFromUrl = null;
      document.getElementById("cr-btn-join-invite")?.remove();
      if (action === "solo") {
        const roomId = `solo${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void enterPlayMode({
          gameMode: "solo",
          onArenaReady: makeSoloArenaReadyHook("Solo"),
        })
          .catch((err) => onMenuBootstrapError("Solo", err));
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        void enterPlayMode({
          gameMode: "quickplay",
          commitMenuHidden: false,
          onArenaReady: makeMultiplayerArenaReadyHook("Quickplay"),
        }).catch((err) => onMenuBootstrapError("Quickplay", err));
      } else if (action === "friends") {
        const roomId = `party${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        const cleanLink = new URL(window.location.origin + window.location.pathname);
        cleanLink.searchParams.set("room", roomId);
        const roomLink = cleanLink.toString();
        navigator.clipboard.writeText(roomLink).catch(() => {});

        // Show friends screen
        const friendsScreen = document.getElementById("cr-friends-screen");
        const friendsLink = document.getElementById("cr-friends-link");
        const friendsCopy = document.getElementById("cr-friends-copy");
        const friendsEnter = document.getElementById("cr-friends-enter");
        const friendsBack = document.getElementById("cr-friends-back");
        const menuRoot = document.getElementById("cr-root");

        if (friendsLink) friendsLink.value = roomLink;
        window.CartRave?.stopAnimations?.();
        if (menuRoot) menuRoot.style.display = "none";
        if (friendsScreen) {
          friendsScreen.style.display = "flex";
          friendsScreen.setAttribute("aria-hidden", "false");
        }
        // * Autofocus the primary action (ENTER GAME), matching how the other
        // * overlay screens focus their primary button on open.
        if (friendsEnter) setTimeout(() => friendsEnter.focus(), 0);

        // * Bring Friends into the shared overlay contract: Escape closes it and
        // * focus returns to the FRIENDS button that opened it. (This screen lives
        // * in main.js, outside the menu's closeActiveOverlay set, so it needs its
        // * own dedicated handler.) The keydown listener is removed on every exit
        // * so repeated open/close never stacks listeners.
        const onFriendsKeydown = (e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          closeFriendsScreen();
        };
        const closeFriendsScreen = () => {
          document.removeEventListener("keydown", onFriendsKeydown);
          if (friendsScreen) {
            friendsScreen.style.display = "none";
            friendsScreen.setAttribute("aria-hidden", "true");
          }
          window.CartRave?.show?.();
          refreshMenuStats();
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("room");
          history.pushState({}, "", cleanUrl);
          document.getElementById("cr-friends")?.focus();
        };
        document.addEventListener("keydown", onFriendsKeydown);

        if (friendsCopy) {
          friendsCopy.onclick = () => {
            navigator.clipboard.writeText(roomLink).catch(() => {});
            friendsCopy.textContent = "COPIED!";
            setTimeout(() => { friendsCopy.textContent = "COPY"; }, 1500);
          };
        }
        if (friendsEnter) {
          friendsEnter.onclick = () => {
            document.removeEventListener("keydown", onFriendsKeydown);
            friendsScreen.style.display = "none";
            friendsScreen.setAttribute("aria-hidden", "true");
            void enterPlayMode({
              gameMode: "friends",
              commitMenuHidden: false,
              onArenaReady: makeMultiplayerArenaReadyHook("Friends"),
            }).catch((err) => onMenuBootstrapError("Friends", err));
          };
        }
        if (friendsBack) friendsBack.onclick = closeFriendsScreen;
      }
    });
    }

    refreshMenuStats();

    if (getCurrentLevelId() === "testArena") {
      scheduleMenuLevelPreview();
    }

    // Sync new menu name to localStorage for join message (once per page load).
    if (!menuNameSyncWired) {
      menuNameSyncWired = true;
      const crNameText = document.getElementById("cr-name-text");
      if (crNameText) {
        const saved = storageGet(STORAGE_KEYS.username);
        if (saved) crNameText.textContent = saved;

        const nameObs = new MutationObserver(() => {
          const name = crNameText.textContent.trim();
          if (name) storageSet(STORAGE_KEYS.username, name);
        });
        nameObs.observe(crNameText, { childList: true, characterData: true, subtree: true });
      }

      const crNameInput = document.getElementById("cr-name-input");
      if (crNameInput) {
        crNameInput.addEventListener("blur", () => {
          const name = crNameInput.value.trim();
          if (name) storageSet(STORAGE_KEYS.username, name);
        });
      }
    }

    if (window.__cartRaveBootstrapped) {
      enableModeMenuButtons();
    }
  }

  // * Room-authoritative levelId that arrived while rotateLoadedArenaInPlace could not
  // * yet run (menu still visible, world not bootstrapped, or carts not created — the
  // * "joiner-lands-mid-play-entry" race). Drained from bootstrapSessionCarts once the
  // * world+carts are ready so the joiner reconciles to the room arena instead of
  // * silently staying on their local menu pick.
  // * Declared BEFORE commitMenuHiddenForGame: that function drains it and can run
  // * during boot for ?room= URLs, before main() reaches this point (TDZ otherwise).
  /** @type {string | null} */
  let pendingArenaRotationLevelId = null;

  function commitMenuHiddenForGame() {
    window.CartRave?.stopAnimations?.();
    window.CartRave?.hide?.();
    menuVisible = false;
    stopMenuAttract();
    setGamepadNavActive(false);
    revealGameCanvas();
    const isTestDrive = detectGameMode() === "testdrive";
    if (labelRenderer) {
      labelRenderer.domElement.style.display = isTestDrive ? "none" : "block";
    }
    HUD.showAudioWidget();
    if (isTestDrive) {
      HUD.hideGameplayElements();
    }
    updateTouchControlsVisibility();
    AudioManager.stopMenuMusic();
    if (!isTestDrive) {
      startLevelMusic(getCurrentLevelId());
    }
    // * Arena atmosphere rides along in every mode (test drive included — it is the
    // * world's sound, not the match's). Unknown arenas (testArena) stay silent.
    ArenaAmbience.startArenaAmbience(getCurrentLevelId());
    // * Mark solo/testdrive rooms as "engaged" so a mid-round refresh recovers to
    // * the menu instead of auto-restarting the room from the stale ?room= URL.
    // * (Quickplay refresh deliberately auto-rejoins — see initMenu.)
    const engagedRoom = Netcode.resolvedPartyRoomFromUrl();
    if (engagedRoom && /^(solo|testdrive)/i.test(engagedRoom)) {
      sessionSet(SESSION_KEYS.engagedRoom, engagedRoom);
    }
    // * A room levelId that arrived during play-entry parks in
    // * pendingArenaRotationLevelId, but the drain no-ops while menuVisible — and
    // * every pre-hide retry (bootstrapSessionCarts) runs before finishHelloEnter
    // * gets here. Without this kick the joiner stays on their local menu arena
    // * until the next round broadcast (07-17 playtest: quickplay joiner loaded
    // * the wrong level on first join).
    void drainPendingArenaRotation();
  }

  const { refreshMenuStats } = createMenuStats({ getPersonalStats });


  /**
   * Toggles visual quality settings in-place without touching the Rapier physics world.
   * Reflector, post-processing, rave extras, and renderer pixel ratio are all toggled
   * synchronously — no WASM world teardown / rebuild required.
   * @returns {Promise<void>}
   */
  async function rebuildForQualityChange() {
    const knobs = getQualityKnobs();

    // * Physics substep cap + streak budget for the new tier (mirrors config.js boot logic).
    CONFIG.physics.maxSubsteps = knobs.maxSubsteps;
    CONFIG.physics.cart.ramBoost.streakMaxActive = knobs.streakCap;

    // * Post-processing: apply tier passes + renderer pixel ratio + FBO size
    // * (the user's separate Post-FX toggle still gates bloom/arcade).
    applyComposerQualityTier(bloomPass, arcadePass, fxaaPass, renderer, getQualityTier(), composer, {
      bloomEnabled,
      fxPassEnabled,
    });
    // * URL ablation wins over tier/user Post-FX re-enables (visual QA).
    applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });

    // * Arena visuals: reflective floor is a full second scene render — high tier only.
    if (typeof setReflectorVisible === "function") {
      setReflectorVisible(knobs.reflector);
      // * Tier raised to high mid-session: make sure the RT upgrade (256²→1024²) runs.
      if (knobs.reflector) scheduleReflectorUpgrade();
    }

    // * Rave dressing on levels that support it (Classic Record): every tier keeps the
    // * crowd/stage/skybox silhouette so Low still reads as Cart Clash; the tier knobs
    // * decide crowd budget, lasers, and dynamic lights.
    const levelWantsExtras = levelUsesRaveExtras();
    Effects.setRaveExtrasVisible(levelWantsExtras);
    if (levelWantsExtras) Effects.applyRaveExtrasQuality(knobs);

    // * Scene extras (skybox, planets, spotlights): visible at every tier on levels
    // * that build them; sceneRoots is empty elsewhere, so this loop is a no-op there.
    if (sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) {
        root.visible = levelWantsExtras;
      }
    }

    // * Level-specific tier knobs (e.g. Storerooms ceiling SpotLight budget).
    if (typeof levelApplyQualityTier === "function") {
      levelApplyQualityTier(knobs);
    }

    // * Render-path flip (composer ↔ direct-to-canvas) changes the program cache key
    // * (tone mapping moves in/out of shaders) — every scene program recompiles on the
    // * first frame of the new path. Warm the target path here, behind the loading
    // * overlay, before latching the flag the frame loop reads. compileAsync uses
    // * KHR_parallel_shader_compile so even this warm-up avoids one giant stall.
    if (knobs.composerBypass !== isComposerBypassActive()) {
      try {
        if (knobs.composerBypass) {
          await renderer.compileAsync(scene, camera);
          renderer.render(scene, camera);
        } else {
          composer.render();
        }
      } catch (err) {
        console.warn("[CartRave] render-path warm-up failed:", err);
      }
      setComposerBypassActive(knobs.composerBypass);
    }
  }

  let qualityRebuildInProgress = false;
  const handleQualityTierChange = async (tier, { persist = true } = {}) => {
    if (qualityRebuildInProgress) return;
    qualityRebuildInProgress = true;
    // * Close Esc overlay first so it doesn't persist across the rebuild.
    HUD.hideEscOverlay();
    if (persist) setQualityTier(tier);
    // * setQualityTier clears the session override so user choices beat the auto-quality
    // * watchdog — but the SwiftShader hard floor rides that same override. Re-clamp:
    // * picking HIGH on software WebGL rebuilds the DPR×2 HalfFloat RT chain in system
    // * RAM, the exact tab-OOM the floor exists to prevent. The pref still persists, so
    // * a future hardware-accelerated session gets the user's choice.
    if (isSoftwareRendererActive() && tier !== "low") setSessionQualityTier("low");
    // * Show loading overlay with quality-apply copy, then rebuild in-place.
    showQualityApplyLoading();
    await yieldForPaint();
    try {
      await rebuildForQualityChange();
    } catch (err) {
      console.error("[CartRave] quality rebuild failed:", err);
    } finally {
      qualityRebuildInProgress = false;
      dismissAllLoadingOverlays();
    }
  };

  // * Auto-quality watchdog fired (session tier already stepped down) — apply live,
  // * without the loading overlay: mid-round the swap is quick knob flips.
  const handleAutoQualityStepDown = () => {
    rebuildForQualityChange().catch((err) => {
      console.error("[CartRave] auto-quality rebuild failed:", err);
    });
  };

  hud = HUD.init({
    getIsMuted,
    setIsMuted: (val) => { setAllAudioMuted(val); },
    getMusicGain: getMusicVolume,
    setMusicGain: setMusicGainValue,
    getSfxVolume,
    setSfxVolume: setSfxSliderVolume,
    getAudioVolumeMax: () => AUDIO_VOLUME_MAX,
    getAudioVolumeDefault: () => AUDIO_VOLUME_DEFAULT,
    getBloomEnabled: () => bloomEnabled,
    setBloomEnabled: (val) => {
      bloomEnabled = val;
      settingsStore.getState().setBloomEnabled(val);
    },
    getFxPassEnabled: () => fxPassEnabled,
    setFxPassEnabled: (val) => {
      fxPassEnabled = val;
      settingsStore.getState().setFxPassEnabled(val);
    },
    getBloomPass: () => bloomPass,
    getFxPass: () => fxPass,
    getLabelRenderer: () => labelRenderer,
    getMenuVisible: () => menuVisible,
    getPartySocket: () => Netcode.getPartySocket(),
    getReadyToggleMsgType: () => MSG.readyToggle,
    detectGameMode,
    getCART_COLORS: () => CART_COLORS,
    getDefaultRoundMs: () => CONFIG.round.durationMs,
    getCountdownMs: () => CONFIG.round.countdownMs,
    // * GO! moment — camera punch-in + whoosh as the countdown orbit hands back to follow.
    onGoMoment: () => {
      armFovPunch(10, 220);
      SfxSynth.playGoWhoosh();
    },
    getLevelId: () => getCurrentLevelId(),
    getIsTouchDevice: isTouchDevice,
    getLocalCart: localCartForConnId,
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
    if (!menuVisible) hud?.showChallengeToast?.(msg, "◆ UNLOCKED", { durationMs: 5000, priority: STAGE_PRIORITY.CRITICAL });
  });

  let prevCompletedChallengeIds = collectCompletedChallengeIds(challengeStore.getState());
  challengeStore.subscribe((state) => {
    const completed = collectCompletedChallengeIds(state);
    for (const id of completed) {
      if (!prevCompletedChallengeIds.has(id)) {
        const meta = CHALLENGE_POOL.find((c) => c.id === id);
        const title = meta?.title ?? "CHALLENGE";
        hud?.showChallengeToast?.(title);
        SfxSynth.playChallengeComplete();
        // * The Store PA shouts it out too (callout + future voice line; no sting —
        // * the sparkle above is the completion audio).
        announce("challenge_complete", { title });
      }
    }
    prevCompletedChallengeIds = completed;
  });

  initLevelManager({
    getMenuVisible: () => menuVisible,
    getAllCartsRef: () => allCartsRef,
    isWorldBootstrapped,
    getWorld: () => world,
    ensureWorldBootstrapped,
    performLevelLoad: (selected, opts) => commitLevelLoad(selected, opts),
    onPreviewSwapComplete: (levelId) => {
      Effects.setRaveExtrasVisible(levelId !== "backrooms" && levelId !== "testArena");
    },
    finalizeArenaForPlay,
    finalizeArenaShellForMenu,
    crossfadeElement,
    getCanvas: () => canvas,
    maskMenuPreviewSwap,
    warmupAfterLevelSwap: (opts) => warmupActiveSceneShaders(opts),
  });

  initBootstrap({
    detectGameMode,
    getMenuVisible: () => menuVisible,
    commitMenuHiddenForGame,
    getLoadedLevelId: getCurrentLevelId,
    getSelectedLevelId: () => resolveLevelId(storageGet(LEVEL_STORAGE_KEY)),
    cancelMenuPreviewTimers,
    getMenuLevelPreviewPromise,
    getLevelRebuildPromise,
    getMenuPreviewNeedsFinalize,
    getPreviewNeedsFullRebuild,
    rebuildLevelIfNeeded: (levelId, onProgress) => rebuildLevelIfNeeded(levelId, onProgress),
    finalizeArenaForPlay: finalizeArenaForPlayEntry,
    warmupBeforeRoundStart: (opts) =>
      warmupActiveSceneShaders({ forPlay: true, warm: opts?.warm === true }),
    ensureRapierPhysics: () => ensureRapierPhysics(),
    bootstrapWorldCore: (levelIdOverride) => bootstrapWorldCore(levelIdOverride),
    getHelloGate: () => /** @type {any} */ (helloGate),
    getAllCartsRef: () => allCartsRef,
    bootstrapSessionCarts,
  });

  wireMenuAudioControlsOnce();
  syncAllAudioUi();
  initMenu();

  // --- Arena, physics — Rapier WASM + level mesh deferred until play or idle preload ---
  scene.add(new THREE.AmbientLight(0x221133, 0.15));

  /** @type {import("@dimforge/rapier3d").World | null} */
  let world = null;
  /** @type {import("@dimforge/rapier3d").EventQueue | null} */
  let eventQueue = null;

  /**
   * Creates the Rapier physics world on first need.
   * WASM is loaded lazily via initRapier() dynamic import — defers
   * the ~1.5 MB WASM fetch/compile off the boot critical path.
   * @returns {Promise<void>}
   */
  async function ensureRapierPhysics() {
    if (!world) {
      await initRapier();
      // * Dev breadcrumb for A/B: simd vs standard (see getRapierBuild).
      if (import.meta.env?.DEV) {
        console.info(`[rapier] loaded build: ${getRapierBuild()}`);
      }
      world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
      eventQueue = new RAPIER.EventQueue(true);
    }
  }

  let recordMesh = null;
  let recordCollider;
  let ringHandles;
  let recordColliderHandles = [];
  let pitWallColliderHandle;
  let boothColliderHandles = [];
  let boothNeonMeshes = [];
  let spindleLight = null;
  let spindleLightColorPink;
  let spindleLightColorCyan;
  let pitInnerRadius = CONFIG.record.innerRadius;
  let recordLabelMat = null;
  let levelHazards;
  let disposeLevel;
  let levelUpdate;
  let sceneExtras = {
    scene,
    sceneRoots: [],
    disposables: [],
    update: () => {},
    disposed: false,
  };
  let upgradeRecordReflector = null;
  let setReflectorVisible = null;
  /** @type {((knobs: import("./utils/qualityTiers.js").QualityKnobs) => void) | null} */
  let levelApplyQualityTier = null;
  /** Stadium bowl + stage + crowd instances (Classic attract needs this). */
  let raveShellInitialized = false;
  /** Lasers + billboard (play juice — skip on menu attract to keep swaps light). */
  let raveJuiceInitialized = false;
  let sceneEnvironmentDispose = null;

  function levelUsesRaveExtras(levelId) {
    const id = levelId ?? getCurrentLevelId();
    return id === "classicRecord";
  }

  /**
   * Pre-round camera fly-over, sized to the active arena. The default 28 m orbit was
   * authored for the 26.4 m Classic deck; Sundial Station's enlarged octagon (deck
   * circumradius ≈ radius / cos 22.5°) needs a wider, slightly higher orbit or the
   * camera would sweep inside the deck edge.
   */
  function beginRoundFlyover() {
    let overrides;
    if (getCurrentLevelId() === "zanzibar") {
      const circumR = CONFIG.record.radius / Math.cos(Math.PI / 8);
      overrides = { radius: circumR + 4, height: 16 };
    }
    CameraMod.beginCinematicCountdown(camera, overrides);
  }

  function applyLoadedLevelSideEffects(levelId) {
    const resolved = levelId ?? getCurrentLevelId();
    Simulation.setLevelHazards(levelHazards ?? null);
    setContactShadowHazards(levelHazards ?? null);
    // * Per-arena exposure ride on the global grade (scene.js applyRendererColorGrading
    // * stays the base). Same tone-map curve everywhere — only the exposure scalar moves,
    // * so no program-cache rebuild on arena swap.
    renderer.toneMappingExposure =
      (CONFIG.postFx.toneMappingExposure ?? 1.0) *
      (CONFIG.postFx.arenaExposureMul?.[resolved] ?? 1);
    // * VHS/security-cam layer rides the arcade pass; only The Storerooms turns it on.
    if (fxPass?.uniforms?.uVhsAmount) {
      const vhsCfg = CONFIG.postFx.vhs;
      fxPass.uniforms.uVhsAmount.value = resolved === "backrooms" ? vhsCfg.amount : 0;
      fxPass.uniforms.uVhsNoise.value = vhsCfg.noise;
      fxPass.uniforms.uVhsTrackPeriod.value = vhsCfg.trackPeriodSec;
    }
    // * Bloom pipeline: default ?bloompipe=display keeps UnsignedByte + post-tonemap
    // * bloom on every level (no float↔byte mip rebuild when swapping into Storerooms).
    // * ?bloompipe=hdr restores the old split (Classic/Sundial HDR, Storerooms display).
    // * ?rtmode still forces a global mode for VFX-1 A/B.
    if (!getDebugParams().rtmodeExplicit) {
      const pipe = getDebugParams().bloomPipe;
      const mode =
        pipe === "display" || resolved === "backrooms" ? "display" : "hdr";
      setBloomPipeline({ composer, bloomPass, outputPass }, mode, { levelId: resolved });
    }
    // * ?ablate=vhs / postmin must still win after level VHS turn-on.
    applyPostFxAblation({ bloomPass, arcadePass: fxPass, fxaaPass, outputPass });
    // * Test Drive bloom rides resolveDisplayBloomConfig (BLOOM_DISPLAY_TESTDRIVE)
    // * through the setBloomPipeline call above — the old HDR-space save/restore
    // * override is gone (it read as no bloom under the display pipeline on entry,
    // * and its restore stomped the next arena's knobs with HDR values on exit).
    if (resolved === "testArena") {
      Effects.clearAmbientDust();
      setSceneFog(scene, renderer, { color: TEST_ARENA_SKY, density: TEST_ARENA_FOG_DENSITY });
    } else {
      Effects.setAmbientDustStyle(
        resolved === "backrooms" ? "backrooms" : resolved === "zanzibar" ? "sunset" : "rainbow",
        CART_COLORS,
      );
      if (resolved === "backrooms") {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.backrooms.color,
          density: CONFIG.postFx.fog.backrooms.density,
        });
      } else if (resolved === "zanzibar") {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.zanzibar.color,
          density: CONFIG.postFx.fog.zanzibar.density,
        });
      } else {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.color,
          density: CONFIG.postFx.fog.density,
        });
      }
    }
  }

  function disposeSceneExtras(extras) {
    if (!extras || extras.disposed) return;
    try {
      if (Array.isArray(extras.sceneRoots) && extras.scene) {
        for (const root of extras.sceneRoots) extras.scene.remove(root);
      }
      if (extras.disposables && Array.isArray(extras.disposables)) {
        for (const d of extras.disposables) {
          d?.dispose?.();
        }
      }
    } catch {} finally {
      extras.disposed = true;
    }
  }

  /**
   * Classic attract shell: space skybox + stadium bowl + stage. Stadium geometry is
   * built inside initCrowd (not a separate mesh). Lasers/billboard = play juice only.
   * @param {{ includeJuice?: boolean }} [opts]
   */
  function ensureRaveAttractShell(opts = {}) {
    const includeJuice = opts.includeJuice === true;
    const wantRaveExtras = levelUsesRaveExtras();

    // * Rebuild sky only when missing — avoid thrashing extras every picker swap.
    if (!sceneExtras || sceneExtras.disposed) {
      sceneExtras = /** @type {any} */ (
        initSceneExtras(scene, pitInnerRadius, { enabled: wantRaveExtras })
      );
    } else if (Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) root.visible = wantRaveExtras;
    }

    if (wantRaveExtras && !raveShellInitialized) {
      clearMirrorExcludes();
      Effects.initCrowd(scene, CART_COLORS, pitInnerRadius);
      Effects.initStage(scene, pitInnerRadius, CART_COLORS);
      raveShellInitialized = true;
    }

    if (wantRaveExtras && includeJuice && !raveJuiceInitialized) {
      Effects.initBillboard(scene, pitInnerRadius);
      Effects.initLasers(scene, pitInnerRadius, CART_COLORS);
      raveJuiceInitialized = true;
    }

    if (wantRaveExtras && sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) {
        root.visible = true;
        registerMirrorExclude(root);
      }
    }

    Effects.setRaveExtrasVisible(wantRaveExtras);
    if (wantRaveExtras) Effects.applyRaveExtrasQuality(getQualityKnobs());
  }

  function initDeferredRaveVisuals() {
    ensureRaveAttractShell({ includeJuice: true });
  }

  function scheduleReflectorUpgrade() {
    if (!upgradeRecordReflector) return;
    // * Only the high tier renders the reflector — skip the 1024² RT upgrade elsewhere.
    if (!getQualityKnobs().reflector) return;
    // * Touch devices that opted into high tier keep the 256² play-entry RT —
    // * the mirror re-renders the whole scene per frame and the res jump is
    // * invisible on phone-sized screens.
    if (isTouchDevice()) return;
    const run = () => {
      try { upgradeRecordReflector(); } catch (e) {}
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 8000 });
    } else {
      setTimeout(run, 2000);
    }
  }

  /**
   * Menu Classic attract: sky + stadium + stage. Idempotent after first build —
   * later picker swaps only toggle visibility (no second multi-second forest build).
   */
  function finalizeArenaShellForMenu() {
    refreshSceneEnvironmentMaterials(scene);
    ensureRaveAttractShell({ includeJuice: false });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] menu attract shell (sky + stadium, no lasers)");
    }
  }

  function finalizeArenaForPlay() {
    refreshSceneEnvironmentMaterials(scene);
    initDeferredRaveVisuals();
    scheduleReflectorUpgrade();
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] arena finalize (extras + materials)");
    }
  }

  /** True after VFX program anchors are parked in the scene (once per session). */
  let vfxProgramAnchorsInstalled = false;

  /**
   * Warm-compiles programs for the live scene.
   * @param {{ forPlay?: boolean, warm?: boolean, maxWaitMs?: number }} [opts]
   *   forPlay true (default): ensure VFX anchors exist, then compileAsync — used at
   *   play entry / round start so KO/splash never sync-recompiles mid-round.
   *   forPlay false: menu attract path — compile current arena only; skip re-installing
   *   anchors every picker swap (they are not needed until combat).
   *   warm true: short compileAsync budget — arena already compiled during idle warm /
   *   menu attract; only carts + VFX anchors are new (avoids ~8s mode-entry hang).
   */
  async function warmupActiveSceneShaders(opts = {}) {
    const forPlay = opts.forPlay !== false;
    try {
      if (forPlay || !vfxProgramAnchorsInstalled) {
        installShatterProgramWarmup(scene);
        installKoHitmarkerProgramWarmup(scene);
        installWaterFxProgramWarmup(scene);
        Effects.installRamStreakProgramWarmup(scene);
        vfxProgramAnchorsInstalled = true;
      }
      if (forPlay) {
        // * Announcer warm-up anchor (mirrors the VFX anchors above). The 61 voice takes
        // * register preload:false, so each one fetches + decodes on its FIRST play. The
        // * menu idle-warm prefetch (scheduleIdleWorldWarm) is suppressed once play claims
        // * the cold-load — i.e. it never runs for Solo/Quickplay — so those first plays
        // * land mid-round as ~350-750ms longframes clustering on the earliest callouts
        // * (spill_rush / cleanup_aisle / new_leader — 07-17 run-3 solo F8 captures).
        // * Kicked here, under the loading overlay and before the countdown, the decodes
        // * finish during warm-up + countdown so no announcer clip decodes mid-round.
        // * Fire-and-forget: prefetchSfxByPrefix only starts async loads — never blocks
        // * play entry — and is idempotent (skips already-loaded/loading Howls).
        AudioManager.prefetchSfxByPrefix("announcer_");
      }
      // * Menu path: still compileAsync so the first attract frame after a swap does not
      // * hitch. compileAsync uses KHR_parallel_shader_compile when available.
      // * Optional maxWaitMs / warm cap the readiness poll (scene.js patchSafeCompileAsync).
      const maxWaitMs =
        typeof opts.maxWaitMs === "number"
          ? opts.maxWaitMs
          : opts.warm
            ? COMPILE_ASYNC_WARM_PLAY_MAX_WAIT_MS
            : undefined;
      if (maxWaitMs != null) {
        // * 4th-arg opts is our patchSafeCompileAsync extension (not in three's types).
        await /** @type {(s: typeof scene, c: typeof camera, t?: unknown, o?: { maxWaitMs?: number }) => Promise<typeof scene>} */ (
          renderer.compileAsync
        )(scene, camera, null, { maxWaitMs });
      } else {
        await renderer.compileAsync(scene, camera);
      }
      // * compileAsync covers SCENE programs only. The composer passes (bloom
      // * bright/blur, arcade, FXAA, output) and their render targets initialize on
      // * the first composer.render() — which, without this, is the first visible
      // * frame after the overlay lifts, i.e. a hitch that lands exactly on the
      // * round-start flyover (07-17 run-2: "round start hitch that happens often").
      // * One throwaway render here absorbs it behind the loading overlay. Play-entry
      // * only: the menu attract path renders through the composer continuously.
      if (forPlay) {
        if (isComposerBypassActive()) renderer.render(scene, camera);
        else composer.render();
      }
    } catch (err) {
      // * Warm-up is an optimization — never let it block play entry.
      console.warn("[CartRave] scene shader warm-up failed:", err);
    }
  }

  /**
   * Simple opacity tween for the game canvas, driven by rAF with a hard setTimeout
   * fallback — WAAPI/compositor animations never finish in hidden tabs, and a hung
   * fade here would wedge menuLevelPreviewPromise (and with it, play entry) forever.
   * Instant when reduced motion is preferred.
   * @param {number} to 0..1
   * @param {number} ms
   */
  function fadeGameCanvasTo(to, ms) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      canvas.style.opacity = String(to);
      return Promise.resolve();
    }
    const from = parseFloat(canvas.style.opacity || "1");
    const start = performance.now();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        canvas.style.opacity = String(to);
        resolve();
      };
      const step = (now) => {
        if (done) return;
        const t = Math.min(1, (now - start) / ms);
        const eased = 1 - (1 - t) * (1 - t);
        canvas.style.opacity = String(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(step);
        else finish();
      };
      requestAnimationFrame(step);
      // * Hidden-tab safety: rAF may stall; never leave the fade promise pending.
      window.setTimeout(finish, ms + 600);
    });
  }

  /**
   * Menu arena-swap mask: hold attract rendering (last frame stays on canvas),
   * optionally fade the canvas down to the menu gradient, run the swap + shader
   * warm-up, render one fresh frame while transparent, then fade back in.
   * Keeps the picker responsive — the swap never runs under a visible render.
   * @param {() => Promise<void>} runSwap
   * @param {{ fade?: boolean }} [opts]
   */
  async function maskMenuPreviewSwap(runSwap, opts = {}) {
    const fade = opts.fade !== false;
    setMenuAttractRenderHold(true);
    try {
      // * Slightly longer fades than 180/260 — geometry + compile run under the
      // * opaque gradient so the work reads as a transition, not a frozen UI.
      if (fade) await fadeGameCanvasTo(0, 220);
      await runSwap();
      if (fade) {
        // * Release with the canvas still transparent — the attract loop draws the
        // * new arena (programs already warm), then the fade-in reveals it.
        setMenuAttractRenderHold(false);
        await yieldForPaint();
        await fadeGameCanvasTo(1, 300);
      }
    } finally {
      setMenuAttractRenderHold(false);
      if (fade) canvas.style.opacity = "1";
    }
  }

  /**
   * Loads level meshes/colliders into the live scene (called by levelManager).
   * @param {string} selected Resolved level id.
   * @param {{ menuPreview: boolean, reflectorTextureSize: number, onProgress?: (pct: number, label: string) => void }} opts
   */
  async function commitLevelLoad(selected, opts) {
    // * ?perf=1 (DEV): per-phase swap breakdown. loadLevel is the mesh/collider build;
    // * rebuildForQualityChange re-applies the active tier after the legacy low/high split.
    const perfOn = import.meta.env.DEV && typeof location !== "undefined"
      && /(?:^|[?&])perf=1(?:&|$)/.test(location.search || "");
    const pnow = () => (typeof performance !== "undefined" ? performance.now() : 0);
    /** @type {Record<string, number>} */
    const perfPhase = {};
    let pMark = pnow();
    const lap = (name) => { if (perfOn) { const t = pnow(); perfPhase[name] = +(t - pMark).toFixed(1); pMark = t; } };

    if (typeof disposeLevel === "function") disposeLevel();
    lap("dispose");
    // * Let the menu UI / attract hold paint once after dispose so the main thread
    // * is not one continuous multi-hundred-ms block through loadLevel.
    await yieldForPaint();
    // * Grocery pool stays warm across level swaps — init() clears active spills only
    // * after the first load (no re-fetch of ~2.9 MB grocery GLBs per arena change).
    ({
      recordMesh,
      recordCollider,
      recordColliderHandles: ringHandles,
      pitWallColliderHandle,
      boothColliderHandles,
      boothNeonMeshes,
      spindleLight,
      spindleLightColorPink,
      spindleLightColorCyan,
      pitInnerRadius,
      recordLabelMat,
      aiHazards: levelHazards,
      update: levelUpdate,
      dispose: disposeLevel,
      upgradeRecordReflector,
      setReflectorVisible,
      applyQualityTier: levelApplyQualityTier = null,
    } = await loadLevel(selected, scene, world, CONFIG, {
      menuPreview: opts.menuPreview === true,
      reflectorTextureSize: opts.reflectorTextureSize,
      onProgress: opts.onProgress,
    }));
    lap("loadLevel");

    // * Normalize: arena.js returns recordColliderHandles (compound ring); other levels return a single recordCollider.
    if (ringHandles) {
      recordColliderHandles = ringHandles;
    } else if (recordCollider) {
      recordColliderHandles = [recordCollider.handle];
    }
    // * Groceries are cosmetic and unneeded until the first hit — don't block the level
    // * swap on their ~3 MB of GLBs. init() is idempotent and pool consumers no-op
    // * until it resolves.
    const groceryReady = GroceryPool.init(scene, world);
    if (import.meta.env.DEV) groceryReady.catch((err) => console.warn("[GroceryPool] init failed:", err));
    applyLoadedLevelSideEffects(selected);
    lap("sideEffects");
    // * Levels build for the legacy low/high split internally; re-apply the active
    // * tier so medium lands correctly (reflector off, budgets right) on first load.
    await rebuildForQualityChange();
    lap("qualityRebuild");
    if (perfOn) {
      const total = +Object.values(perfPhase).reduce((a, b) => a + b, 0).toFixed(1);
      // eslint-disable-next-line no-console
      console.log(`[perf] commitLevelLoad ${selected} menuPreview=${opts.menuPreview === true} total=${total}ms`, perfPhase);
    }
  }

  async function bootstrapWorldCore(levelIdOverride) {
    if (!sceneEnvironmentDispose) {
      sceneEnvironmentDispose = setupSceneEnvironment(renderer, scene);
      await yieldForPaint();
    }
    await swapLoadedLevel(
      resolveLevelId(levelIdOverride ?? storageGet(LEVEL_STORAGE_KEY)),
    );
    await yieldForPaint();
  }

  // --- Quickplay arena rotation (D-STAB-2 seam recipe) ---
  let arenaRotationInFlight = false;
  /** Invalidation token for deferred non-host countdown application (see onGameStartHandler). */
  let nonHostCountdownApplyGen = 0;

  /**
   * Resolves once no arena rotation is pending or in flight (bounded poll — during the
   * swap's long synchronous chunks timers can't fire anyway, so the poll wakes right
   * after the blocking work ends). Used to keep the non-host countdown from starting
   * under a level swap that will freeze its frame-driven digits.
   */
  async function whenArenaRotationSettled(maxWaitMs = 10000) {
    const deadlineMs = performance.now() + maxWaitMs;
    while (
      (arenaRotationInFlight || pendingArenaRotationLevelId != null) &&
      performance.now() < deadlineMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  async function drainPendingArenaRotation() {
    if (pendingArenaRotationLevelId == null) return;
    if (menuVisible || !isWorldBootstrapped() || !world) return;
    if (!Array.isArray(allCartsRef) || allCartsRef.length === 0) return;
    if (arenaRotationInFlight) return;
    const next = resolveLevelId(pendingArenaRotationLevelId);
    pendingArenaRotationLevelId = null;
    if (next === getCurrentLevelId()) return;
    await rotateLoadedArenaInPlace(next);
  }

  /** Random next arena for Quickplay rotation — always different from the loaded one. */
  function pickNextQuickplayArenaId() {
    const current = getCurrentLevelId();
    const pool = PREFETCHABLE_LEVEL_IDS.filter((id) => id !== current);
    return pool[Math.floor(Math.random() * pool.length)] || current;
  }

  /**
   * Mid-session arena swap for Quickplay rotation, masked by a slow canvas crossfade
   * with a "NEXT ARENA" toast. Physics is gated (setLevelSwapping) while colliders
   * rebuild, then cart spawn points are refreshed for the new ring radius. The host
   * re-seats every cart via rematchResetWorld (which broadcasts the new poses);
   * non-host clients take poses from that broadcast.
   *
   * Pre-session (menu / bootstrap in flight) this is a no-op — the play-entry
   * rebuild path owns the load there.
   *
   * @param {string} nextLevelIdRaw
   */
  async function rotateLoadedArenaInPlace(nextLevelIdRaw) {
    const nextLevelId = resolveLevelId(nextLevelIdRaw);
    if (arenaRotationInFlight) return;
    if (menuVisible || !isWorldBootstrapped() || !world) return;
    if (!Array.isArray(allCartsRef) || allCartsRef.length === 0) return;
    if (nextLevelId === getCurrentLevelId()) return;
    arenaRotationInFlight = true;
    setLevelSwapping(true);
    // * Old arena's beds fade out under the canvas crossfade; the new arena's start
    // * in the finally below (getCurrentLevelId() — correct even if the swap failed).
    ArenaAmbience.stopArenaAmbience();
    try {
      const label = (LEVEL_UNLOCKS[nextLevelId]?.label || nextLevelId).toUpperCase();
      hud?.showChallengeToast?.(label, "◆ NEXT ARENA", { durationMs: 4500, priority: STAGE_PRIORITY.CRITICAL });
      /** @type {Promise<void>} */
      let swapPromise = Promise.resolve();
      const runSwap = () => {
        swapPromise = swapLoadedLevel(nextLevelId, { menuPreview: false });
      };
      // * Slower than the play-entry crossfade on purpose — the reveal is the transition.
      await crossfadeElement(canvas, runSwap, { fadeOutMs: 380, fadeInMs: 520 });
      await swapPromise;
      // * Compile the rotated arena's programs before the host re-seats carts —
      // * otherwise the first post-rotation frame stalls on shader compiles mid-MP.
      await warmupActiveSceneShaders({ forPlay: true });
      Entities.refreshCartSpawnPositions();
      if (Netcode.getIsHost()) Entities.rematchResetWorld();
    } catch (err) {
      console.error("[arena-rotation] in-place swap failed:", err);
    } finally {
      setLevelSwapping(false);
      arenaRotationInFlight = false;
      // * menuVisible guard: a disconnect mid-swap returns to the menu (which stops
      // * ambience + music) — don't restart a bed/track under the menu music.
      if (!menuVisible) {
        ArenaAmbience.startArenaAmbience(getCurrentLevelId());
        // * Music is per-arena — swap to the rotated arena's playlist. stopGameMusic
        // * first so the new playlist starts from its own track 0 (startLevelMusic →
        // * setGamePlaylist → playGameMusic, which no-ops if not stopped).
        AudioManager.stopGameMusic();
        startLevelMusic(getCurrentLevelId());
      }
    }
  }

  window.addEventListener("cartrave:level-changed", () => {
    scheduleMenuLevelPreview();
  });

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * Round start/countdown handlers live here; initNetcode invokes them via callbacks.
  onGameStartHandler = (msg) => {
    window.dispatchEvent(new CustomEvent("cartrave:round-started"));
    if (menuVisible) enterPlayMode({ skipBootstrap: true });
    showRotatePromptIfNeeded();
    if (detectGameMode() === "testdrive") {
      if (Netcode.getIsHost()) {
        startRunningAt(getRoundClockNowMs());
      } else {
        syncRoundPhase("running");
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
      if (detectGameMode() === "solo") {
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
          if (menuVisible) return;
          if (GameState.getRoundState().phase === "running") return;
          startCountdown(getRoundClockNowMs() + CONFIG.round.countdownMs);
        });
      } else {
        startCountdown(startsAtLocalMs);
      }
    } else if (GameState.getRoundState().phase !== "running") {
      // * Menu re-entry at a rematch can land game_start while the room's arena rotation
      // * is still pending/in flight locally (the drain no-ops behind the menu, then runs
      // * at play-entry). Applying the countdown immediately froze it mid-digits behind
      // * the swap's synchronous work and burst-replayed 1/GO seconds late (07-17 run 2
      // * "countdown was notably wonky"). Defer until the swap settles; if the server
      // * start time has already passed, drop straight into running — the host's
      // * host_round(running) broadcast reconciles the authoritative startedAtMs.
      nonHostCountdownApplyGen += 1;
      const applyGen = nonHostCountdownApplyGen;
      void whenArenaRotationSettled().then(() => {
        if (applyGen !== nonHostCountdownApplyGen) return;
        if (GameState.getRoundState().phase === "running") return;
        resetMatchStats();
        setMatchStatsLocalSlot(Netcode.strictSlotIndexForConn(Netcode.getYouConnId()));
        GameState.setRoundCountdownStartedAtMs(startsAtLocalMs - CONFIG.round.countdownMs);
        GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
        GameState.setRoundWinnerSlotIndex(null);
        if (getRoundClockNowMs() >= startsAtLocalMs) {
          syncRoundPhase("running");
          GameState.setRoundStartedAtMs(startsAtLocalMs);
          CameraMod.endCinematicCountdown(camera);
        } else {
          syncRoundPhase("countdown");
          GameState.setRoundStartedAtMs(0);
          beginRoundFlyover();
        }
      });
    }
  };

  let lastResultsOverlayKey = null;
  /** Round startedAtMs of the last podium celebration — one sting/confetti per match. */
  let lastPodiumCelebratedRound = null;
  /** True after confetti has fired for the current podium presentation. */
  let podiumConfettiFiredKey = null;
  /** Round key of the last podium challenge credit — records must not re-fire on overlay re-render. */
  let podiumChallengesRecordedKey = null;
  /**
   * Whether the round that just ended was in Sudden Death at endRound time. Captured
   * before endRound clears roundState.isSuddenDeath, so the podium's once-per-round
   * challenge block can still credit `sd_win` (the live flag is already false by then).
   */
  let lastRoundEndedInSuddenDeath = false;

  /**
   * World position of the winning cart (arena center fallback for draws / missing bodies).
   * @returns {{ x: number, y: number, z: number }}
   */
  function getWinnerWorldPos() {
    const winnerIdx = GameState.getRoundState().winnerSlotIndex;
    if (winnerIdx === "draw" || !Number.isFinite(winnerIdx)) return { x: 0, y: 0, z: 0 };
    const winnerCart = allCartsRef?.[winnerIdx];
    if (winnerCart?.body) {
      const t = winnerCart.body.translation();
      return { x: t.x, y: t.y, z: t.z };
    }
    if (winnerCart?.mesh) {
      const p = winnerCart.mesh.position;
      return { x: p.x, y: p.y, z: p.z };
    }
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Starts the post-game winner camera once per match and fires victory/defeat VO.
   * Idempotent for a given `startedAtMs:winner` key.
   */
  function beginPodiumPresentation() {
    const rs = GameState.getRoundState();
    const key = `${rs.startedAtMs}:${rs.winnerSlotIndex}`;
    if (podiumCameraKey === key) {
      // * Mode may have been cleared — re-arm without resetting the 5s timer.
      if (CameraMod.getCameraMode(camera) !== CameraMod.CameraMode.CINEMATIC_PODIUM) {
        CameraMod.beginCinematicPodium(camera, getWinnerWorldPos());
      } else {
        CameraMod.setCinematicPodiumTarget(camera, getWinnerWorldPos());
      }
      return;
    }
    podiumCameraKey = key;
    podiumPhaseEnteredAtMs = performance.now();
    podiumConfettiFiredKey = null;
    // * Any-input skip: fresh presses (not held-from-gameplay inputs) jump straight
    // * to the results panel; the celebration VO/confetti already fired and play out.
    podiumWinnerCamSkipped = false;
    podiumGamepadButtonHeld = true;
    installPodiumSkipListeners();
    CameraMod.beginCinematicPodium(camera, getWinnerWorldPos());

    // * Voice + a first confetti burst play over the pure winner cam, so the orbit frames
    // * a celebrated cart; a second burst fires when the results panel lands.
    if (lastPodiumCelebratedRound !== rs.startedAtMs) {
      lastPodiumCelebratedRound = rs.startedAtMs;
      const celebrationWinner = rs.winnerSlotIndex;
      if (celebrationWinner !== "draw" && typeof celebrationWinner === "number") {
        const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        const isLocalWinner = mySlotIdx >= 0 && celebrationWinner === mySlotIdx;
        // * Participated but didn't win — defeat is its own quieter beat: no winner-confetti,
        // * no crowd roar. Spectators (mySlotIdx < 0) still see the full celebration.
        const isLocalLoser = mySlotIdx >= 0 && !isLocalWinner;
        if (isLocalWinner) {
          announce("victory");
        } else if (isLocalLoser) {
          announce("defeat");
        }
        if (!isLocalLoser) {
          if (hud?.root) {
            const winnerCss = displayCssColorForSlot(Netcode.getNetSlots()[celebrationWinner]);
            spawnResultsConfetti(hud.root, [winnerCss, "#ff2bd6", "#22e6ff", "#ffe53d", "#ffffff"]);
          }
          // * Victory roar on the match's single peak beat — every arena. (The frequent
          // * KO-time cheer stays Classic-only in onLocalKillConfirm/onArenaKoFlash.)
          SfxSynth.playCrowdCheer(1);
          ArenaAmbience.bumpCrowdExcitement(1);
        }
      }
    }
  }

  function clearPodiumPresentation() {
    podiumCameraKey = null;
    podiumPhaseEnteredAtMs = 0;
    podiumConfettiFiredKey = null;
    podiumWinnerCamSkipped = false;
    removePodiumSkipListeners();
    if (CameraMod.getCameraMode(camera) === CameraMod.CameraMode.CINEMATIC_PODIUM) {
      CameraMod.endCinematicCountdown(camera);
    }
  }

  function updateResultsOverlay() {
    if (!resultsUi) return;
    const { overlay, panel, title, finalScores, history, playAgain, statsLine, mainMenuBtn } = resultsUi;
    const roundState = GameState.getRoundState();
    if (roundState.phase === "podium") {
      // * Ensure host + all clients share the same winner-cam presentation path.
      beginPodiumPresentation();

      // * Hold the opaque results UI until the pure winner camera shot finishes —
      // * or the player skips it with any fresh input (keyboard/mouse/touch via
      // * listeners, gamepad via the per-frame rising-edge poll below).
      const camElapsed = podiumPhaseEnteredAtMs > 0
        ? performance.now() - podiumPhaseEnteredAtMs
        : 0;
      if (camElapsed < CameraMod.PODIUM_WINNER_CAM_MS && !podiumWinnerCamSkipped) {
        pollPodiumGamepadSkip();
      }
      if (camElapsed < CameraMod.PODIUM_WINNER_CAM_MS && !podiumWinnerCamSkipped) {
        if (overlay.style.display !== "none") {
          cancelResultsAnimations(overlay);
          overlay.style.display = "none";
          overlay.style.pointerEvents = "none";
        }
        return;
      }
      removePodiumSkipListeners();

      overlay.style.display = "flex";
      overlay.style.pointerEvents = "auto";
      const isHost = Netcode.getIsHost();
      const scores = GameState.getRoundScores() || {};
      const stats = getPersonalStats();
      if (
        lastResultsOverlayKey?.winner === roundState.winnerSlotIndex
        && lastResultsOverlayKey?.s0 === (scores[0] ?? 0)
        && lastResultsOverlayKey?.s1 === (scores[1] ?? 0)
        && lastResultsOverlayKey?.s2 === (scores[2] ?? 0)
        && lastResultsOverlayKey?.s3 === (scores[3] ?? 0)
        && lastResultsOverlayKey?.hist === matchHistory.length
        && lastResultsOverlayKey?.host === isHost
        && lastResultsOverlayKey?.matches === stats.matches
        && lastResultsOverlayKey?.wins === stats.wins
        && lastResultsOverlayKey?.totalPoints === stats.totalPoints
        && lastResultsOverlayKey?.solo === (stats.soloGames ?? 0)
        && lastResultsOverlayKey?.endReason === roundState.endReason
      ) {
        maybeScheduleAutoContinuePodium();
        updatePlayAgainCountdownLabel(playAgain);
        return;
      }
      lastResultsOverlayKey = {
        winner: roundState.winnerSlotIndex,
        s0: scores[0] ?? 0,
        s1: scores[1] ?? 0,
        s2: scores[2] ?? 0,
        s3: scores[3] ?? 0,
        hist: matchHistory.length,
        host: isHost,
        matches: stats.matches,
        wins: stats.wins,
        totalPoints: stats.totalPoints,
        solo: stats.soloGames ?? 0,
        endReason: roundState.endReason ?? null,
      };

      const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      const isLocalWinner = mySlotIdx >= 0 && roundState.winnerSlotIndex === mySlotIdx;
      // * Once per podium — the overlay re-renders whenever a key field changes (late stat
      // * write, host flip), and challenge credit must not double-count on a re-render.
      const challengeRoundKey = `${roundState.startedAtMs}:${roundState.winnerSlotIndex}`;
      if (isLocalWinner && podiumChallengesRecordedKey !== challengeRoundKey) {
        podiumChallengesRecordedKey = challengeRoundKey;
        if (roundState.endReason === "lastStanding") {
          ChallengeTracker.record(PROGRESSION_EVENTS.LAST_STANDING);
        }
        if (lastRoundEndedInSuddenDeath) {
          ChallengeTracker.record(PROGRESSION_EVENTS.SUDDEN_DEATH_WIN);
        }
        const localCart = localCartForConnId();
        // * "Win without spilling": hasSpilled is per-life (reset on respawn), so a fall
        // * mid-round must also disqualify — localDeaths accumulates for the whole round.
        if (localCart && !localCart.hasSpilled && getMatchStats().localDeaths === 0) {
          ChallengeTracker.record(PROGRESSION_EVENTS.UNTOUCHABLE);
        }
      }

      // * Local-outcome treatment: a defeat gets a desaturated, un-celebrated panel; a win
      // * keeps the bright party. Classes drive results.css; spectators (mySlotIdx < 0) get
      // * neither and see the normal winner celebration.
      const isLocalLoser = mySlotIdx >= 0
        && typeof roundState.winnerSlotIndex === "number"
        && roundState.winnerSlotIndex !== mySlotIdx;
      overlay.classList.toggle("results-defeat", isLocalLoser);
      overlay.classList.toggle("results-victory", isLocalWinner);

      // * Once per podium presentation, when the results panel actually appears: the
      // * winner gets neon confetti; the local loser gets the "opposite of confetti" —
      // * a field of spoiled groceries that sag and deflate (ART-3). A draw gets neither.
      const confettiKey = `${roundState.startedAtMs}:${roundState.winnerSlotIndex}`;
      if (podiumConfettiFiredKey !== confettiKey) {
        podiumConfettiFiredKey = confettiKey;
        const celebrationWinner = roundState.winnerSlotIndex;
        if (isLocalLoser) {
          spawnResultsDefeatWilt(overlay);
        } else if (celebrationWinner !== "draw" && typeof celebrationWinner === "number") {
          const winnerCss = displayCssColorForSlot(Netcode.getNetSlots()[celebrationWinner]);
          spawnResultsConfetti(overlay, [winnerCss, "#ff2bd6", "#22e6ff", "#ffe53d", "#ffffff"]);
        }
      }

      playAgain.disabled = !isHost;
      if (isHost) {
        playAgain.textContent = "PLAY AGAIN";
      } else {
        // * Arm a local auto-continue estimate so non-hosts see a countdown, not a
        // * dead "WAITING FOR HOST…" with no sense of when the next round starts.
        const mode = detectGameMode();
        if (
          (mode === "quickplay" || mode === "friends")
          && !clientPodiumAutoContinueDeadlineMs
        ) {
          const delayMs = mode === "friends" ? 10000 : 5000;
          clientPodiumAutoContinueDeadlineMs = performance.now() + delayMs;
        }
        playAgain.innerHTML = `<span style="opacity:.8;margin-right:6px;">${svgIcon("host", { label: "Host" })}</span>WAITING FOR HOST…`;
      }

      const slotDisplayName = (slotIndex) => Netcode.getNetSlots()[slotIndex]?.name || `P${slotIndex + 1}`;

      const winnerIdx = roundState.winnerSlotIndex;
      if (winnerIdx === "draw") {
        title.textContent = "DRAW";
        title.style.setProperty("--title-glow", "#ffe53d");
      } else {
        const idx = Number.isFinite(winnerIdx) ? winnerIdx : null;
        if (idx != null) {
          const score = scores[idx] != null ? scores[idx] : 0;
          let maxScore = 0;
          let tiedAtTop = 0;
          for (let ti = 0; ti < 4; ti += 1) {
            const ts = Number(scores[ti] ?? 0);
            if (ts > maxScore) maxScore = ts;
          }
          for (let ti = 0; ti < 4; ti += 1) {
            if (Number(scores[ti] ?? 0) === maxScore) tiedAtTop += 1;
          }
          const tieSuffix = tiedAtTop > 1 ? " (TIEBREAK)" : "";
          if (roundState.endReason === "lastStanding") {
            title.textContent = `${slotDisplayName(idx)} wins — LAST CART STANDING`;
          } else {
            title.textContent = `${slotDisplayName(idx)} wins — ${score} pts${tieSuffix}`;
          }
          title.style.setProperty("--title-glow", displayCssColorForSlot(Netcode.getNetSlots()[idx]));
        } else {
          title.textContent = "ROUND COMPLETE";
          title.style.setProperty("--title-glow", "#ffffff");
        }
      }

      finalScores.replaceChildren();
      /** @type {Array<{ row: HTMLElement, valEl: HTMLElement, score: number, isWinner: boolean, badge: HTMLElement | null }>} */
      const scoreRows = [];
      // * Winner pinned first explicitly — under lastStanding/Sudden Death they can
      // * hold a lower score than a fallen rival, so score-desc alone isn't enough.
      const rankedSlots = [0, 1, 2, 3].sort((a, b) => {
        const aWin = winnerIdx !== "draw" && winnerIdx === a;
        const bWin = winnerIdx !== "draw" && winnerIdx === b;
        if (aWin !== bWin) return aWin ? -1 : 1;
        const byScore = Number(scores[b] ?? 0) - Number(scores[a] ?? 0);
        return byScore !== 0 ? byScore : a - b;
      });
      for (const i of rankedSlots) {
        const s = scores[i] != null ? scores[i] : 0;
        const row = document.createElement("div");
        row.className = "results-score-row";
        const isWinner = winnerIdx !== "draw" && winnerIdx === i;
        if (isWinner) row.classList.add("is-winner");
        row.style.setProperty("--slot-glow", displayCssColorForSlot(Netcode.getNetSlots()[i]));

        const nameEl = document.createElement("span");
        nameEl.className = "results-score-name";
        nameEl.textContent = slotDisplayName(i);

        const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        if (i === mySlotIdx && isNewPersonalBest) {
          const pbBadge = document.createElement("span");
          pbBadge.className = "pb-badge";
          pbBadge.textContent = "NEW PB!";
          nameEl.appendChild(pbBadge);
        }

        let winnerBadge = null;
        if (isWinner) {
          winnerBadge = document.createElement("span");
          winnerBadge.className = "results-winner-badge";
          // * Purpose-built sticker crown (icons.js), not the OS emoji — matches
          // * the HUD leader pip and colors to gold via .results-winner-badge CSS.
          winnerBadge.innerHTML = svgIcon("crown", { label: "Winner", size: "1.15em" });
          nameEl.prepend(winnerBadge);
        }

        const valEl = document.createElement("span");
        valEl.className = "results-score-val";
        valEl.textContent = `${s} pts`;

        row.appendChild(nameEl);
        row.appendChild(valEl);
        finalScores.appendChild(row);
        scoreRows.push({ row, valEl, score: s, isWinner, badge: winnerBadge });
      }

      history.replaceChildren();
      const historyLimit = isTouchDevice() ? 2 : matchHistory.length;
      if (matchHistory.length === 0) {
        const emptyRow = document.createElement("div");
        emptyRow.textContent = "No prior rounds this session.";
        history.appendChild(emptyRow);
      } else {
        const startIdx = Math.max(0, matchHistory.length - historyLimit);
        for (let i = matchHistory.length - 1; i >= startIdx; i -= 1) {
          const m = matchHistory[i];
          const row = document.createElement("div");
          row.className = "results-history-row";
          const parts = [0, 1, 2, 3]
            .map((j) => `${slotDisplayName(j)} ${m.scores[j] ?? 0}`)
            .join(" · ");
          row.textContent =
            m.winnerSlotIndex === "draw"
              ? `DRAW — ${parts} · ${new Date(m.endedAtMs).toLocaleTimeString()}`
              : `${slotDisplayName(m.winnerSlotIndex)} won — ${parts} · ${new Date(m.endedAtMs).toLocaleTimeString()}`;
          history.appendChild(row);
        }
      }

      // Update personal stats display
      if (statsLine) {
        const ps = getPersonalStats();
        statsLine.replaceChildren();

        const tag = document.createElement("div");
        tag.className = "results-stats-tag";
        const pulse = document.createElement("i");
        pulse.style.cssText =
          "display:inline-block;width:5px;height:5px;border-radius:50%;" +
          "background:#ff00ff;box-shadow:0 0 4px #ff00ff;flex-shrink:0";
        tag.appendChild(pulse);
        tag.appendChild(document.createTextNode("\u00a0YOUR STATS"));
        statsLine.appendChild(tag);

        const statDefs = [
          { num: String(ps.wins), lbl: "WINS" },
          { num: String(ps.matches), lbl: "PLAYED" },
          { num: ps.totalPoints.toLocaleString(), lbl: "POINTS" },
          { num: String(ps.soloGames || 0), lbl: "SOLO" },
        ];
        statDefs.forEach((def, idx) => {
          if (idx > 0) {
            const sep = document.createElement("div");
            sep.className = "results-stats-div";
            statsLine.appendChild(sep);
          }
          const item = document.createElement("div");
          item.className = "results-stats-item";
          const numEl = document.createElement("span");
          numEl.className = "results-stats-num";
          numEl.textContent = def.num;
          const lblEl = document.createElement("span");
          lblEl.className = "results-stats-lbl";
          lblEl.textContent = def.lbl;
          item.appendChild(numEl);
          item.appendChild(lblEl);
          statsLine.appendChild(item);
        });

        // * This-match superlatives (matchStats spine) — local-focused solo retention beat.
        const matchSnap = snapshotMatchStats();
        const supers = matchSuperlatives(matchSnap);
        if (supers.length > 0) {
          let superLine = statsLine.parentElement?.querySelector?.(".results-superlatives") ?? null;
          if (!superLine) {
            superLine = document.createElement("div");
            superLine.className = "results-superlatives";
            statsLine.insertAdjacentElement("afterend", superLine);
          }
          superLine.replaceChildren();
          for (const line of supers) {
            const chip = document.createElement("span");
            chip.className = "results-superlative";
            chip.textContent = line;
            superLine.appendChild(chip);
          }
        }

        // * Challenge progress — the results screen is the reward moment, so daily/
        // * weekly progress earned this match finally shows up right here.
        let challengesLine = statsLine.parentElement?.querySelector?.(".results-challenges") ?? null;
        if (!challengesLine) {
          challengesLine = document.createElement("div");
          challengesLine.className = "results-challenges";
          statsLine.insertAdjacentElement("afterend", challengesLine);
        }
        challengesLine.replaceChildren();
        const chState = challengeStore.getState();
        const challengeRows = [...(chState.dailyChallenges || []), ...(chState.weeklyChallenges || [])];
        for (const ch of challengeRows) {
          const meta = CHALLENGE_POOL.find((c) => c.id === ch.id);
          if (!meta) continue;
          const row = document.createElement("div");
          row.className = `results-challenge-row${ch.isComplete ? " complete" : ""}`;
          const nameEl2 = document.createElement("span");
          nameEl2.className = "results-challenge-name";
          nameEl2.textContent = meta.title;
          const progEl = document.createElement("span");
          progEl.className = "results-challenge-prog";
          progEl.textContent = ch.isComplete
            ? "✓ DONE"
            : `${Math.min(ch.progress ?? 0, meta.goal)}/${meta.goal}`;
          row.appendChild(nameEl2);
          row.appendChild(progEl);
          challengesLine.appendChild(row);
        }
      }

      animateResultsPodiumShow({
        overlay,
        panel,
        title,
        scoreRows,
        statsLine,
        history,
        playAgain,
        mainMenuBtn,
      });

      maybeScheduleAutoContinuePodium();
    } else {
      clearAutoContinuePodiumTimeout();
      autoContinuePodiumKey = null;
      lastResultsOverlayKey = null;
      clearPodiumPresentation();
      cancelResultsAnimations(overlay);
      animateResultsDismiss(overlay, panel);
    }
  }

  // --- Carts, labels, gameplay helpers ---
  /**
   * Stops the looping charge-up SFX and clears charge state for a cart. Called on
   * fall start (incl. Sudden Death — which skips scheduleRespawn), stuck respawn,
   * and SD entry. Safe to call repeatedly; only local carts ever set chargeUpSfxId.
   * @param {ReturnType<typeof createCart> | null | undefined} cart
   */
  function stopChargeSfxForCart(cart) {
    if (!cart) return;
    if (cart.chargeUpSfxId != null) {
      AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
      cart.chargeUpSfxId = null;
    }
    cart.isChargingBoost = false;
    cart.boostChargeStartedAtMs = 0;
  }

  /**
   * Round-boundary sweep: stops any looping charge-up SFX on every cart. Charging
   * through the running→podium transition otherwise leaks the loop forever —
   * resetCartTransientState nulls chargeUpSfxId without stopping the sound, so the
   * loop must be stopped BEFORE any transient reset runs.
   */
  function stopAllChargeSfx() {
    for (const cart of allCartsRef || []) stopChargeSfxForCart(cart);
  }

  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + (CONFIG.fall?.respawnDelayMs ?? 1000); // * respawn after shatter VFX plays out
    // * Charge SFX already stopped via gameFlow onCartOutOfPlay at fall start.
    if (cart === localCartForConnId()) {
      stopChargeSfxForCart(cart);
      AudioManager.playSfx("death");
    }
  }

  function scheduleStuckRespawn(cart) {
    if (!cart?.body || cart.respawnAtMs !== null) return;
    stopChargeSfxForCart(cart);
    Entities.doRespawn(cart);
    Entities.resetCartIdleWatch(cart);
  }

  sessionRefs.respawnLocalMidRoundJoinRef.current = () => {
    const localConnId = Netcode.getYouConnId();
    if (!localConnId || pendingMidRoundJoinRespawnConnId !== localConnId) return;
    if (GameState.getRoundState().phase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    pendingMidRoundJoinRespawnConnId = null;
  };

  // --- Floating name labels above carts ---
  const nameLabels = [];
  function makeNameLabel(contentHtml, color) {
    const el = document.createElement("div");
    el.className = "cart-nametag";
    el.innerHTML = contentHtml;
    // * Layout/size live in hud.css (fluid + mobile/coarse). Only the cart-color
    // * edge is dynamic — do not set padding/fontSize here or media queries lose.
    el.style.borderColor = color;

    const label = new CSS2DObject(el);
    label.center.set(0.5, 0);
    return label;
  }

  let allCarts = [];

  function updateNameLabels() {
    for (let i = 0; i < allCarts.length; i++) {
      const slot = Netcode.getNetSlots()[i];
      const cart = allCarts[i];
      if (!slot || !cart || !cart.mesh) continue;

      const name = slot.name || `P${i + 1}`;
      const colorCSS = displayCssColorForSlot(slot);

      const personality = cart.aiPersonality || (slot.kind === "npc" ? getNpcPersonality(name) : null);
      const meta = personality ? (PERSONALITY_META[personality.name] || null) : null;
      const introMode = meta && GameState.getRoundState().phase === "countdown" ? "intro" : "normal";
      // * Host glyph only means something online — solo/testdrive is always "host".
      const mode = detectGameMode();
      const hostGlyphEligible = mode !== "solo" && mode !== "testdrive";
      const isHostSlot = hostGlyphEligible && Boolean(slot.connId && slot.connId === Netcode.getHostId());
      const contentHtml = nametagHtml(name, meta, introMode, isHostSlot);

      if (nameLabels[i]) {
        if (
          nameLabels[i]._labelHtml !== contentHtml ||
          nameLabels[i]._labelColor !== colorCSS
        ) {
          nameLabels[i].element.innerHTML = contentHtml;
          nameLabels[i].element.style.borderColor = colorCSS;
          nameLabels[i]._labelHtml = contentHtml;
          nameLabels[i]._labelColor = colorCSS;
        }
      } else {
        const label = makeNameLabel(contentHtml, colorCSS);
        label._labelHtml = contentHtml;
        label._labelColor = colorCSS;
        scene.add(label);
        nameLabels[i] = label;
      }
    }
    while (nameLabels.length > allCarts.length) {
      const removedLabel = nameLabels.pop();
      if (!removedLabel) continue;
      scene.remove(removedLabel);
      if (removedLabel.element?.parentNode) {
        removedLabel.element.parentNode.removeChild(removedLabel.element);
      }
    }
  }

  // Position name labels each frame (called in game loop)
  function positionNameLabels() {
    // * Content refresh is diff-gated (innerHTML only on change), so running it per
    // * frame is cheap and keeps phase-driven states live (countdown personality
    // * intro collapsing at GO, host glyph moving on migration).
    updateNameLabels();
    for (let i = 0; i < nameLabels.length; i++) {
      const label = nameLabels[i];
      const cart = allCarts[i];
      if (!label || !cart || !cart.body) continue;
      const pos = cart.mesh.position;
      label.position.set(pos.x, pos.y + 3.0, pos.z);
      const distance = Math.max(0.001, camera.position.distanceTo(label.position));
      const scale = clamp(18 / distance, 0.65, 1.2);
      label.element.style.transform = `translate(-50%, 0) scale(${scale})`;
    }
  }

  function bootstrapSessionCarts(expectedGen) {
    if (allCartsRef?.length && getLastSuccessfulHelloGen() === expectedGen) {
      return allCartsRef;
    }

    if (expectedGen != null && expectedGen !== helloGate.getGeneration()) {
      return null;
    }
    destroySessionCarts();

    const { allCarts: carts, nextPendingMidRoundJoinRespawnConnId } = Entities.initCarts({
      scene,
      world,
      ramBoostStreaks,
      netSlots: Netcode.getNetSlots(),
      youConnId: Netcode.getYouConnId(),
      CART_COLORS,
      colorHexForSlot: displayColorHexForSlot,
      themeForSlot: (slot) => resolveCartThemeForSlot(slot, { youConnId: Netcode.getYouConnId() }),
      pendingMidRoundJoinRespawnConnId,
      ...(detectGameMode() === "testdrive"
        ? {
          spawnForSlot: () => testDriveSpawnForSlot(0, CONFIG),
          spawnYawForSlot: () => 0,
        }
        : {}),
    });
    if (expectedGen != null && expectedGen !== helloGate.getGeneration()) {
      Entities.destroyCarts({ scene, nameLabels });
      return null;
    }
    pendingMidRoundJoinRespawnConnId = nextPendingMidRoundJoinRespawnConnId;
    allCarts = carts;
    allCartsRef = carts;
    // * Full ref re-wire (not just getAllCartsRef): a prior returnToMenu cleared the
    // * input-axis/trigger refs, and re-entering a session must restore them or the
    // * non-host predicts with null input forever (07-17 spawn-platform freeze).
    wireNetcodeRuntimeRefs();
    Netcode.setRefs({ getAllCartsRef: () => allCartsRef });
    // * Slot colors are authoritative: server-provided in multiplayer (accepted verbatim),
    // * and declashed once at init for solo/testdrive. No re-derivation here.
    updateCartMaterialsFromSlots(Netcode.getNetSlots());
    sessionRefs.updateNameLabelsRef.current = updateNameLabels;
    updateNameLabels();
    if (Netcode.getIsHost() && !Netcode.getHostSendTimer()) Netcode.startHostSendLoop();
    Netcode.setAuthorityMode(Netcode.getIsHost());
    gameCtx.registerRuntime({
      getAllCarts: () => allCarts,
      getAllCartsRef: () => allCartsRef,
    });
    // * Joiner-desync drain: a room-authoritative levelId that arrived on hello (or
    // * an early MSG.round) while the play-entry was still tearing down the menu is
    // * latched in pendingArenaRotationLevelId. Now that carts exist and the world is
    // * live, retry the swap so the joiner ends up on the room's arena, not their
    // * own menu pick.
    void drainPendingArenaRotation();
    // * NET-2: hello may have cached a spawn snapshot before bodies existed.
    Netcode.reapplyCachedCartsSnapshot?.();
    return carts;
  }

  function destroySessionCarts() {
    Entities.destroyCarts({ scene, nameLabels });
    clearNpcCartCache();
    allCarts = [];
    allCartsRef = null;
    resetSessionCartBootstrap();
    sessionRefs.clearSessionCallbackRefs();
  }

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

  sessionBridgeCtx.current = {
    palette: PALETTE,
    initialNpcNames,
    detectGameMode,
    markFirstHelloReceived,
    getOnGameStartHandler: () => onGameStartHandler,
    getOnHostMigratedHandler: () => onHostMigratedHandler,
    onCountdownCancelled: () => { onCountdownCancelledRef?.(); },
    endCinematicCountdown: () => { CameraMod.endCinematicCountdown(camera); },
    getMenuVisible: () => menuVisible,
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
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
    getTriggerLocalRamShake: () => triggerLocalRamShakeRef,
    getTriggerLocalHitTaken: () => triggerLocalHitTakenRef,
    onRemoteBoostStart: (cart) => {
      AudioManager.playSfx("boost", undefined, { volume: 0.45 });
      if (cart?.mesh) animateCartBoostPulse(cart.mesh);
      // * Humans use charge-release (gold energy); NPCs use instant (simple cart trail).
      const kind = Netcode.getNetSlots()?.[cart?.slotIndex]?.kind;
      if (cart) {
        const charged = kind !== "npc";
        cart.nitroStreakCharged = charged;
        // * Remotes don't carry chargeMul — full charged look for human peers.
        cart.boostChargeMultiplier = charged ? 1 : 0;
      }
    },
    onCartImpactSquash: squashCartsOnImpact,
    getTriggerCartShatterRef: () => triggerCartShatterRef,
    getScene: () => scene,
    getSceneRef: () => scene,
    getHud: () => hud,
    onLocalKillConfirm,
    onArenaKoFlash,
    onAnnouncerFall: announcerDirectorOnFall,
    onSpillBonusPresentation: presentSpillBonusAward,
    colorHexForSlot: displayColorHexForSlot,
    getPendingColorKey: () => pendingColorKey,
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorKey: (val) => { pendingColorKey = val; },
    setPendingColorChipEl: (val) => { pendingColorChipEl = val; },
    getLocalColorPicked: () => _localColorPicked,
    setLocalColorPicked: (val) => { _localColorPicked = val; },
    recordPodiumStats,
    onReturnToLobby: () => {
      clearPodiumPresentation();
      // * Mid-round exits can reach lobby without passing endRound/onEnterPodium; stop
      // * charge loops before rematchResetWorld nulls chargeUpSfxId (orphaning the sound).
      stopAllChargeSfx();
      Netcode.resetClientPredictionState();
      Entities.rematchResetWorld();
      GameState.setRoundEndReason(null);
      cleanupSuddenDeathState(allCartsRef || []);
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
      pendingArenaRotationLevelId = levelId;
      void drainPendingArenaRotation();
    },
    onPodiumRejected: () => {
      // * Server nack'd host_round (or reasserted running). Undo optimistic podium UI.
      clearPodiumPresentation();
      lastResultsOverlayKey = null;
      if (resultsUi?.overlay) {
        animateResultsDismiss(resultsUi.overlay, resultsUi.panel);
      }
      cancelLastCartStandingFinish?.();
      autoContinuePodiumKey = null;
      clearAutoContinuePodiumTimeout?.();
    },
    teleportCartToSpawn,
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { pendingMidRoundJoinRespawnConnId = val; },
    ensureSessionReady: () => ensureSessionCartsReady(),
    destroySessionCarts,
    disconnectNetcode: () => Netcode.disconnectPartySession(),
    dismissLoadingOverlays: () => dismissAllLoadingOverlays(),
    initMenu,
    resetRoundState: () => {
      GameState.resetRoundToLobby();
      clearPodiumPresentation();
      CameraMod.endCinematicCountdown(camera);
    },
    hideEscOverlay: () => HUD.hideEscOverlay(),
    resetSessionPickState: () => {
      _localColorPicked = false;
      pendingColorKey = null;
      pendingColorChipEl?.classList.remove("color-pending");
      pendingColorChipEl = null;
      pendingMidRoundJoinRespawnConnId = null;
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
        getAllCartsRef: () => allCartsRef,
        getAxisRef: null,
        triggerRamBoostRef: null,
        triggerHopRef: null,
        resetSimTimingRef: sessionRefs.resetSimTimingRef,
      });
    },
  };

  void flushPendingSessionBootstrap();

  // * Non-blocking — game loop must start even before first hello (menu landing).
  void ensureSessionCartsReady().catch((err) => {
    console.warn("[session] cart bootstrap failed", err);
  });

  /**
   * (Re)binds the netcode runtime refs (input axis, ram/hop/shatter triggers). Must run on
   * every session cart bootstrap, not just boot: returnToMenu's clearNetcodeRuntimeRefs nulls
   * getAxisRef, and a null axis ref makes sampleLocalInputForTick a permanent no-op — the
   * 07-17 "non-host can't leave spawn" freeze (solo → menu → join quickplay left every
   * later MP session with pendingInputs 0 / ackSeq 0). Host was immune (host sim reads
   * input directly), which is why solo/host and URL-join harness runs never caught it.
   */
  function wireNetcodeRuntimeRefs() {
    if (!input) return;
    getAxisRef = input.getAxis;
    triggerRamBoostRef = triggerRamBoost;
    Netcode.setRefs({
      getAllCartsRef: () => allCartsRef,
      getAxisRef: input.getAxis,
      isNitroHeldRef: input.isNitroHeld,
      triggerRamBoostRef: triggerRamBoost,
      triggerHopRef: triggerHop,
      triggerCartShatterRef: triggerCartShatter,
      resetSimTimingRef: sessionRefs.resetSimTimingRef,
      doRespawnRef: Entities.doRespawn,
    });
  }
  wireNetcodeRuntimeRefs();
  // * hello can arrive before input/cart refs exist; non-host input is sampled inline by the
  // * physics loop (sampleLocalInputForTick), which no-ops safely until getAxisRef is wired.
  Netcode.setAuthorityMode(Netcode.getIsHost());

  const ramBoostForwardXZ = new THREE.Vector3();
  const ramBoostToTargetXZ = new THREE.Vector3();
  const ramBoostRightXZ = new THREE.Vector3();

  /**
   * @param {number} now
   * @param {ReturnType<typeof createCart>} cart
   */
  function getAiAxis(now, cart) {
    // * Solo rubberband is host-local AI only — never arm it for multiplayer rooms.
    Simulation.setSoloRubberbandActive(detectGameMode() === "solo");
    return Simulation.getAiAxis(now, cart, allCarts, Netcode.getNetSlots());
  }

  /**
   * Starts an Auto-Charge Boost for a human cart, or fires an instant nitro for NPCs.
   *
   * Human path (default): sets `isChargingBoost` + records the start time + plays the
   * looping charge-up SFX locally. The actual burst is auto-released by
   * `applyArcadeControls` once `boostChargeTimeMs` elapses, which then fires
   * `onBoostRelease` to swap the SFX and trigger the visual pulse.
   *
   * NPC path (`{ instant: true }`): preserves the legacy instant nitro window so bots
   * do not freeze for 1.5s while charging in unsafe positions.
   *
   * @param {ReturnType<typeof createCart>} cart
   * @param {number} nowMs
   * @param {{ instant?: boolean }} [opts]
   */
  function triggerRamBoost(cart, nowMs, opts = {}) {
    if (!cart?.body) return;
    const rb = CONFIG.cart.ramBoost;
    if (!rb.enabled) return;
    if (nowMs <= cart.ramBoostActiveUntilMs) return;
    if (cart.isChargingBoost) return;

    const chargeCfg = rb.boostCharge;
    const useCharge = !opts.instant && chargeCfg?.enabled;

    if (useCharge) {
      // * Cooldown gate — block re-charging until boostCooldownMs passes after the last burst.
      if (nowMs < cart.boostCooldownUntilMs) return;
      cart.isChargingBoost = true;
      cart.boostChargeStartedAtMs = nowMs;
      cart.boostChargeMultiplier = chargeCfg.boostMaxMultiplier;
      // * Trail style is only "charged" after release — not while holding charge.
      cart.nitroStreakCharged = false;
      const isLocal = cart === localCartForConnId();
      if (isLocal) {
        // * Looping charge-up SFX; stopped on release / interrupt via onBoostRelease or respawn.
        cart.chargeUpSfxId = AudioManager.playSfx("chargeUp");
      }
      return;
    }

    // * Instant path (NPCs, or when the charge mechanic is disabled): legacy behavior.
    if (nowMs - cart.lastRamBoostTimeMs < rb.cooldownSec * 1000) return;
    cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1000;
    cart.lastRamBoostTimeMs = nowMs;
    // * Instant nitro = simple cart-color trail (charge release sets gold energy style).
    cart.nitroStreakCharged = false;
    cart.boostChargeMultiplier = 0;
    const isLocal = cart === localCartForConnId();
    if (isLocal) {
      AudioManager.playSfx("boost");
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
      flashBoostActivate();
    } else {
      // * NPC / remote-human boosts are audible + pulsed for everyone (attenuated;
      // * the screen flash stays owner-only).
      AudioManager.playSfx("boost", undefined, { volume: 0.45 });
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
    }
    cart.ramBoostStreakCarry = 0;
  }

  /**
   * Auto-Charge Boost release callback — invoked by `applyArcadeControls` (via the sim
   * callbacks) when a charging cart hits `boostChargeTimeMs` or early-releases after 100ms.
   * Stops the looping charge SFX and fires the boost/nitro SFX + visual pulse for the
   * local cart. Remote-cart releases on the host are silent here (the owning client plays
   * its own SFX locally).
   *
   * @param {ReturnType<typeof createCart>} cart
   */
  function onBoostRelease(cart) {
    const isLocal = cart === localCartForConnId();
    if (cart.chargeUpSfxId != null) {
      AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
      cart.chargeUpSfxId = null;
    }
    if (isLocal) {
      AudioManager.playSfx("boost");
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
      flashBoostActivate();
      hapticPulse(0.4, 0.7, 60);
    } else {
      // * Host-side releases for remote humans: audible + pulsed, no screen flash.
      AudioManager.playSfx("boost", undefined, { volume: 0.45 });
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
    }
  }

  /**
   * Auto-Charge Boost cancel callback — invoked by `applyArcadeControls` when the
   * player releases the boost button before 100ms of charging. Stops the looping
   * charge-up SFX silently (no boost sound, no visual pulse).
   *
   * @param {ReturnType<typeof createCart>} cart
   */
  function onBoostCancel(cart) {
    const isLocal = cart === localCartForConnId();
    if (!isLocal) return;
    if (cart.chargeUpSfxId != null) {
      AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
      cart.chargeUpSfxId = null;
    }
  }

  // * Local-input hop with a grounded gate: blocks air-hops / chain-hops (the human path
  // * previously gated on cooldown only — 2 hops/s each +25 N·s up). NPC and remote-replay
  // * hops keep going through triggerHop directly and are unaffected.
  /** @type {any} Reused Rapier ray for the hop grounded check (allocated on first hop). */
  let _hopGroundRay = null;

  // * Grounded = static/kinematic-or-any surface within reach straight below the cart
  // * center. Replaces the old `|lv.y| > 2.2` velocity gate, which ate legitimate hop
  // * presses whenever vertical velocity spiked without leaving the ground — driving the
  // * Sundial podium ramp at speed (~11° slope ⇒ lv.y ≈ 2.3+), trimesh seam micro-hops,
  // * post-landing rebound. Do NOT exclude kinematic bodies: the Classic Record floor is
  // * kinematicVelocityBased.
  function isCartGrounded(cart) {
    if (!world || !RAPIER || !cart?.body) return true; // no physics yet — don't eat input
    const p = cart.body.translation();
    if (!_hopGroundRay) _hopGroundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    _hopGroundRay.origin.x = p.x;
    _hopGroundRay.origin.y = p.y;
    _hopGroundRay.origin.z = p.z;
    const maxToi = CONFIG.cart.size.y / 2 + 0.55; // resting clearance + slope/seam tolerance
    const hit = world.castRay(
      _hopGroundRay,
      maxToi,
      true,
      undefined,
      undefined,
      // * Pass the Collider / RigidBody OBJECTS — Rapier's castRay reads `.handle` off
      // * them internally (`filterExcludeCollider ? filterExcludeCollider.handle : null`).
      // * Passing raw handle numbers makes the exclusion inert ((number).handle is
      // * undefined), so with solid=true the ray hits the cart's OWN collider at toi 0
      // * and this returns true unconditionally — defeating the anti-air-hop gate.
      cart.collider ?? undefined,
      cart.body ?? undefined,
    );
    return hit != null;
  }

  function attemptLocalHop() {
    const cart = localCartForConnId();
    if (!cart?.body) return;
    const p = cart.body.translation();
    if (p.y > (CONFIG.booth?.platformY ?? 6) - 0.5) return; // still on the spawn booth
    if (!isCartGrounded(cart)) return; // mid-air — no air-hops / chain-hops
    triggerHop(cart, performance.now());
    Input.requestHop();
  }

  function triggerHop(cart, nowMs) {
    if (!cart?.body) return;
    if (nowMs - cart.lastHopAtMs < CONFIG.cart.hop.cooldownMs) return;
    cart.lastHopAtMs = nowMs;
    // * Arm one-shot landing feedback (rising-edge floor contact in simulation).
    cart.hopAwaitingLand = true;
    cart.hopAirborne = false;
    cart.body.applyImpulse({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
    if (cart === localCartForConnId()) {
      AudioManager.playSfx("hop");
    } else {
      // * Remote humans and NPCs hop audibly too (covers host-side sim hops AND the
      // * non-host snap.h replay, which routes through this same function).
      AudioManager.playSfx("hop", undefined, { volume: 0.45 });
    }
  }

  /**
   * Hop landing thud + light dust. Fired once per hop on rising-edge floor contact
   * (simulation sets hopAwaitingLand / hopAirborne). Distinct from takeoff "hop" SFX.
   *
   * @param {ReturnType<typeof createCart>} cart
   * @param {number} intensity 0–1-ish from fall speed
   */
  function onHopLand(cart, intensity) {
    if (!cart) return;
    const i = Math.max(0, Math.min(1, Number(intensity) || 0.3));
    const isLocal = cart === localCartForConnId();
    if (isLocal) {
      // * Floor sample as a softer/lower "thud" so it reads differently from takeoff hop.
      AudioManager.playSfx("floor", undefined, {
        volume: 0.5 + i * 0.4,
        rate: 0.78 + Math.random() * 0.08,
      });
      hapticPulse(0.18, 0.35, 28);
    } else {
      // * Remote / NPC: attenuated like boost so the field stays readable without spam.
      AudioManager.playSfx("floor", undefined, {
        volume: 0.22 + i * 0.12,
        rate: 0.82,
      });
    }
    // * Light dust — reuse floor trash profile at low intensity (cheap pool particles).
    if (spawnTrashBurstRef && cart.body && GameState.getRoundState().phase === "running") {
      const p = cart.body.translation();
      spawnTrashBurstRef(
        { x: p.x, y: p.y - 0.35, z: p.z },
        Math.min(0.42, 0.18 + i * 0.35),
        "floor",
      );
    }
  }

  /**
   * @param {number} nowMs
   * @param {ReturnType<typeof createCart>} npc
   */
  function maybeTriggerNpcOpportunisticRamBoost(nowMs, npc) {
    const rb = CONFIG.cart.ramBoost;
    const ncfg = rb.npc;
    if (!rb.enabled || !ncfg.enabled) return;
    if (nowMs <= npc.ramBoostActiveUntilMs) return;
    const roundState = GameState.getRoundState();
    const cooldownMs = roundState?.isSuddenDeath ? (rb.cooldownSec * 500) : (rb.cooldownSec * 1000);
    if (nowMs - npc.lastRamBoostTimeMs < cooldownMs) return;

    // * Find nearest target (human or NPC) — humans always pass the gate; NPCs only 25%.
    const netSlots = Netcode.getNetSlots();
    let nearestTarget = null;
    let nearestD2 = Infinity;
    let nearestIsHuman = false;
    const p = npc.body.translation();
    const fallYThreshold = CONFIG.fall.yThreshold;
    for (let i = 0; i < allCarts.length; i += 1) {
      const o = allCarts[i];
      if (o === npc) continue;
      if (!o?.body || o.respawnAtMs != null || o.isSuddenDeathSpectator) continue;
      const op = o.body.translation();
      if (op.y < fallYThreshold) continue;
      const dx = op.x - p.x;
      const dz = op.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearestTarget = o;
        const s = netSlots?.[i];
        nearestIsHuman = s?.kind === "human" && !!s?.connId;
      }
    }
    if (!nearestTarget) return;
    const op = nearestTarget.body.translation();

    // * NPC-vs-NPC: personality commit chance. NPC-vs-human: always commit (legacy),
    // * except solo rubberband can throttle when the human is far behind.
    let aimSlackDeg = 0;
    if (!nearestIsHuman) {
      const commitChance = npc.aiPersonality?.npcRamCommitChance ?? 0.25;
      if (Math.random() >= commitChance) return;
    } else if (detectGameMode() === "solo") {
      const solo = Simulation.getSoloRubberbandFactors(netSlots);
      aimSlackDeg = solo.aimSlackDeg;
      // * nitroMul is absolute vs human (base was 1.0). Trail ~0.55; lead stays 1.0.
      const humanCommit = Math.min(1, Math.max(0.05, solo.nitroMul >= 1 ? 1 : solo.nitroMul));
      if (Math.random() >= humanCommit) return;
    }

    const dist = Math.sqrt(nearestD2);
    if (dist < ncfg.minTargetDistance || dist > ncfg.maxTargetDistance) return;

    // * Backrooms corner-void safety gate — abort boost if the line crosses a square hole.
    if (Simulation.findBlockingSquareHole(p.x, p.z, op.x, op.z, 0.4)) {
      return;
    }

    // * Classic Record center-hole safety gate — abort nitro if the boost line
    // * passes too close to the hole. Prevents NPCs from nitro-suiciding across the pit.
    if (CONFIG.record.centerHole?.enabled !== false) {
      const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
      const safetyMargin = 1.5;
      const minClear = holeLip + safetyMargin;

      const ax = p.x;
      const az = p.z;
      const bx = op.x;
      const bz = op.z;
      const abX = bx - ax;
      const abZ = bz - az;
      const abLenSq = abX * abX + abZ * abZ;

      if (abLenSq > 1e-8) {
        // * Project origin onto the segment AB, clamped to [0, 1].
        const t = clamp((-ax * abX - az * abZ) / abLenSq, 0, 1);
        const closestX = ax + t * abX;
        const closestZ = az + t * abZ;
        const closestDist = Math.hypot(closestX, closestZ);

        if (closestDist < minClear) return;
      } else {
        // * Degenerate segment — NPC and target are on the same point; check position.
        if (Math.hypot(ax, az) < minClear) return;
      }
    }

    const rot = npc.body.rotation();
    const yaw = Simulation.yawFromQuaternion(rot);
    Simulation.setForwardRightFromYaw(yaw, ramBoostForwardXZ, ramBoostRightXZ);
    ramBoostToTargetXZ.set(op.x - p.x, 0, op.z - p.z);
    if (ramBoostToTargetXZ.lengthSq() < 1e-8) return;
    ramBoostToTargetXZ.normalize();
    if (ramBoostForwardXZ.lengthSq() < 1e-8) return;
    ramBoostForwardXZ.normalize();
    const dot = clamp(ramBoostForwardXZ.dot(ramBoostToTargetXZ), -1, 1);
    const angleDeg = Math.acos(dot) * (180 / Math.PI);
    // * Solo trailing: looser cone → fewer boosts line up; leading: tighter cone.
    const aimLimit = Math.max(12, (ncfg.alignmentAngleDeg ?? 40) + aimSlackDeg);
    if (angleDeg > aimLimit) return;

    // * NPCs use the instant nitro path — keeps bot movement responsive and avoids
    // * freezing in a 1.5s charge window mid-combat.
    triggerRamBoost(npc, nowMs, { instant: true });
  }

  /**
   * Host-only rare NPC hop: dodge an approaching rammer, or juke near a void edge.
   * Mirrors maybeTriggerNpcOpportunisticRamBoost safety (no hop-suicide into holes).
   *
   * @param {number} nowMs
   * @param {ReturnType<typeof createCart>} npc
   */
  function maybeTriggerNpcOpportunisticHop(nowMs, npc) {
    const hopCfg = CONFIG.cart.hop;
    const ncfg = hopCfg?.npc;
    if (!hopCfg || !ncfg?.enabled) return;
    if (!npc?.body || npc.respawnAtMs != null || npc.isSuddenDeathSpectator) return;
    if (GameState.getRoundState().phase !== "running") return;

    const cooldownMs = ncfg.cooldownMs ?? hopCfg.cooldownMs * 5;
    if (nowMs - (npc.lastHopAtMs || 0) < cooldownMs) return;

    const p = npc.body.translation();
    const lv = npc.body.linvel();
    const fallYThreshold = CONFIG.fall.yThreshold;
    // * Grounded-ish only — never hop while already falling / mid-air / on booth.
    if (p.y < fallYThreshold + 3) return;
    if (p.y > (CONFIG.booth?.platformY ?? 6) - 0.5) return;
    if (Math.abs(lv.y) > 2.2) return;

    // * Near-hazard band (edge-save). Reuse the same keep-outs as nitro / reverse gates.
    let nearHazard = false;
    const edgeProx = ncfg.edgeProximityM ?? 3.2;
    nearHazard = Simulation.isNpcNearHazardEdge(p.x, p.z, edgeProx);
    // * Classic outer rim (not in hazard helper — only center hole / level voids).
    if (!nearHazard && CONFIG.record?.radius != null) {
      const outer = CONFIG.record.radius - edgeProx;
      if (Math.hypot(p.x, p.z) > outer) nearHazard = true;
    }

    // * Don't hop when the forward path already crosses a square void (Backrooms).
    // * Pure-Y hop won't change XZ, but airborne carts steer less and can coast in.
    const yaw = Simulation.yawFromQuaternion(npc.body.rotation());
    Simulation.setForwardRightFromYaw(yaw, ramBoostForwardXZ, ramBoostRightXZ);
    if (ramBoostForwardXZ.lengthSq() > 1e-8) {
      ramBoostForwardXZ.normalize();
      const lookX = p.x + ramBoostForwardXZ.x * 4;
      const lookZ = p.z + ramBoostForwardXZ.z * 4;
      if (Simulation.findBlockingSquareHole(p.x, p.z, lookX, lookZ, 0.35)) {
        return;
      }
    }

    const netSlots = Netcode.getNetSlots();
    const minD = ncfg.minThreatDistance ?? 2.4;
    const maxD = ncfg.maxThreatDistance ?? 7.5;
    const minD2 = minD * minD;
    const maxD2 = maxD * maxD;
    const alignMin = ncfg.alignmentDotMin ?? 0.35;
    const minThreatSpeed = ncfg.minThreatSpeed ?? 6;

    let threatened = false;
    for (let i = 0; i < allCarts.length; i += 1) {
      const o = allCarts[i];
      if (o === npc || !o?.body || o.respawnAtMs != null || o.isSuddenDeathSpectator) continue;
      const op = o.body.translation();
      if (op.y < fallYThreshold) continue;
      const dx = p.x - op.x;
      const dz = p.z - op.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2 || d2 > maxD2) continue;
      const ov = o.body.linvel();
      const spd = Math.hypot(ov.x, ov.z);
      if (spd < minThreatSpeed) continue;
      // * Threat velocity points roughly toward us.
      const invDist = 1 / Math.sqrt(d2);
      const toNpcX = dx * invDist;
      const toNpcZ = dz * invDist;
      const vLen = spd || 1;
      const vDot = (ov.x / vLen) * toNpcX + (ov.z / vLen) * toNpcZ;
      if (vDot < alignMin) continue;
      threatened = true;
      break;
    }

    if (!threatened) return;

    const baseChance = ncfg.chance ?? 0.11;
    const edgeChance = ncfg.edgeSaveChance ?? 0.18;
    const roll = Math.random();
    if (roll >= (nearHazard ? edgeChance : baseChance)) return;

    triggerHop(npc, nowMs);
  }

  // --- Round flow (countdown, podium, AI) ---
  if (audioListener && typeof audioListener.setMasterVolume === "function") {
    audioListener.setMasterVolume(getIsMuted() ? 0 : getSfxVolume());
  }

  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
  });

  function startRunningAt(startedAtMs) {
    isNewPersonalBest = false;
    cancelLastCartStandingFinish();
    GameState.setRoundEndReason(null);
    syncRoundPhase("running");
    gameCtx.slowMo.active = false;
    GameState.setRoundStartedAtMs(startedAtMs);
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    Netcode.sendHostRound();
    updateTouchControlsVisibility();
    CameraMod.endCinematicCountdown(camera);
  }

  let roundCountdownTimeoutId = null;

  function clearRoundCountdownTimeout() {
    if (roundCountdownTimeoutId != null) {
      clearTimeout(roundCountdownTimeoutId);
      roundCountdownTimeoutId = null;
    }
  }

  function startCountdown(startsAtLocalMs = getRoundClockNowMs() + CONFIG.round.countdownMs) {
    if (!Netcode.getIsHost()) return;
    if (GameState.getRoundState().phase === "running") return;
    isNewPersonalBest = false;
    cancelLastCartStandingFinish();
    GameState.setRoundEndReason(null);
    clearRoundCountdownTimeout();
    // * Fresh match-stat spine for superlatives / challenges this round.
    resetMatchStats();
    setMatchStatsLocalSlot(Netcode.strictSlotIndexForConn(Netcode.getYouConnId()));
    syncRoundPhase("countdown");
    gameCtx.slowMo.active = false;
    GameState.setRoundCountdownStartedAtMs(startsAtLocalMs - CONFIG.round.countdownMs);
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    GameState.setRoundStartedAtMs(0);

    if (Array.isArray(allCartsRef)) {
      for (let i = 0; i < allCartsRef.length; i += 1) {
        teleportCartToSpawn(i);
      }
    }

    Netcode.sendHostRound();
    roundCountdownTimeoutId = setTimeout(() => {
      roundCountdownTimeoutId = null;
      if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
    }, Math.max(0, startsAtLocalMs - getRoundClockNowMs()));
    beginRoundFlyover();
  }

  /**
   * * Fallback when promoted to host mid-countdown (e.g. prior host disconnected).
   * * Completes the in-flight countdown window; server reset + game_start is preferred
   * * when deployed but this keeps older servers and message-order races un-stuck.
   */
  function resumeCountdownAsNewHost() {
    if (!Netcode.getIsHost()) return;
    const roundState = GameState.getRoundState();
    if (roundState.phase !== "countdown") return;

    clearRoundCountdownTimeout();
    const startsAtLocalMs = (roundState.countdownStartedAtMs || getRoundClockNowMs()) + CONFIG.round.countdownMs;
    const delayMs = Math.max(0, startsAtLocalMs - getRoundClockNowMs());

    if (delayMs === 0) {
      if (GameState.getRoundState().phase === "countdown") startRunningAt(getRoundClockNowMs());
      return;
    }

    // * Re-arm pregame fly-over if host migration interrupted the prior client's cam.
    beginRoundFlyover();
    Netcode.sendHostRound();
    roundCountdownTimeoutId = setTimeout(() => {
      roundCountdownTimeoutId = null;
      if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
    }, delayMs);
  }

  onCountdownCancelledRef = () => {
    // * Invalidate any rotation-deferred non-host countdown apply — a cancel between
    // * game_start and the swap settling must not resurrect a dead countdown.
    nonHostCountdownApplyGen += 1;
    clearRoundCountdownTimeout();
    if (GameState.getRoundState().phase === "countdown") {
      syncRoundPhase("lobby");
      GameState.setRoundCountdownStartedAtMs(0);
      GameState.setRoundStartedAtMs(0);
      CameraMod.endCinematicCountdown(camera);
      if (Netcode.getIsHost()) Netcode.sendHostRound();
    }
  };
  /**
   * Host promote mid-round: recover Sudden Death without waiting for a lost
   * host_round (route 2 — infer from clock + human top-score tie). Also
   * re-derives spectator flags when already in SD. See ensureSuddenDeathOnHostPromote.
   */
  function ensureSuddenDeathStateAsNewHost() {
    if (!Netcode.getIsHost()) return;
    const roundState = GameState.getRoundState();
    ensureSuddenDeathOnHostPromote({
      phase: roundState.phase,
      isSuddenDeath: roundState.isSuddenDeath,
      startedAtMs: roundState.startedAtMs,
      nowMs: getRoundClockNowMs(),
      durationMs: CONFIG.round?.durationMs ?? ROUND_DURATION_MS,
      scores: GameState.getRoundScores() || {},
      netSlots: Netcode.getNetSlots(),
      allCarts: allCartsRef,
      fallYThreshold: CONFIG.fall.yThreshold,
      nowPerfMs: performance.now(),
      setSuddenDeath: GameState.setSuddenDeath,
      sendHostRound: () => Netcode.sendHostRound(),
      onCartOutOfPlay: stopChargeSfxForCart,
      // * Match the in-round SD entry path (updateGameFlow deps): release the torn-down
      // * cart's spilled groceries too, or the promoted host keeps them on the floor.
      doRespawn: (c) => Entities.doRespawn(c, {
        onCartRespawn: (slotIndex) => GroceryPool.releaseByCartId(String(slotIndex)),
      }),
    });
  }

  onHostMigratedHandler = () => {
    resumeCountdownAsNewHost();
    ensureSuddenDeathStateAsNewHost();
  };

  Object.assign(sessionBridgeCtx.current, {
    clearRoundCountdownTimeout,
    clearAutoContinuePodiumTimeout,
    clearPodiumRoundTimeout: () => {
      if (roundPodiumTimeoutId != null) {
        clearTimeout(roundPodiumTimeoutId);
        roundPodiumTimeoutId = null;
      }
    },
    resetSlowMo: () => { gameCtx.slowMo.active = false; },
    resetSimTiming: () => sessionRefs.resetSimTimingRef.current?.(),
    hideResultsOverlay: () => updateResultsOverlay(),
    resetLeaderHum: () => leaderHum?.setLeader?.(null),
    resetResultsOverlayKey: () => { lastResultsOverlayKey = null; },
    resetPodiumSessionState: () => {
      autoContinuePodiumKey = null;
      clientPodiumAutoContinueDeadlineMs = 0;
      lastResultsOverlayKey = null;
      clearPodiumPresentation();
    },
  });

  function cancelLastCartStandingFinish() {
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    gameCtx.slowMo.active = false;
  }

  function abortLastCartStandingFlourish() {
    const hadFlourish = GameState.getRoundState().endReason === "lastStanding";
    cancelLastCartStandingFinish();
    if (hadFlourish && Netcode.getIsHost()) {
      GameState.setRoundEndReason(null);
      Netcode.sendHostRound();
    }
  }

  function scheduleLastCartStandingFinish(soleSurvivorSlot) {
    if (!Netcode.getIsHost()) return;
    if (roundPodiumTimeoutId != null) return;
    if (!gameCtx.slowMo.active) {
      gameCtx.slowMo.active = true;
      gameCtx.slowMo.startMs = performance.now();
    }
    if (GameState.getRoundState().endReason !== "lastStanding") {
      GameState.setRoundEndReason("lastStanding");
      Netcode.sendHostRound();
    }
    roundPodiumTimeoutId = setTimeout(() => {
      roundPodiumTimeoutId = null;
      if (GameState.getRoundState().phase !== "running") return;
      endRound(soleSurvivorSlot);
    }, LAST_CART_STANDING_FLOURISH_MS);
  }

  function endRound(lastStandingWinnerSlot = null) {
    if (GameState.getRoundState().phase !== "running") return;
    cancelLastCartStandingFinish();
    clearRoundCountdownTimeout();
    pendingMidRoundJoinRespawnConnId = null;
    resetArenaReactiveLights();
    // * A charge held across the round-end boundary must stop looping here, before
    // * anything downstream (cleanupSuddenDeathState/rematch resets) nulls the SFX id.
    stopAllChargeSfx();
    const suddenDeathActive = GameState.getRoundState().isSuddenDeath;
    // * Latch SD-at-end for the podium challenge block — endRound clears the live flag
    // * below (SD branch), so `sd_win` would otherwise never be creditable.
    lastRoundEndedInSuddenDeath = suddenDeathActive;
    if (suddenDeathActive && lastStandingWinnerSlot != null && Number.isFinite(lastStandingWinnerSlot)) {
      // * Sudden Death winner — first to score wins instantly.
      GameState.setRoundEndReason("timer");
      GameState.setRoundWinnerSlotIndex(lastStandingWinnerSlot);
      GameState.setSuddenDeath(false);
      cleanupSuddenDeathState(allCartsRef || []);
    } else if (lastStandingWinnerSlot != null && Number.isFinite(lastStandingWinnerSlot)) {
      GameState.setRoundEndReason("lastStanding");
      GameState.setRoundWinnerSlotIndex(lastStandingWinnerSlot);
    } else {
      GameState.setRoundEndReason("timer");
      const scores = GameState.getRoundScores();
      GameState.setRoundWinnerSlotIndex(GameState.pickTimerWinner(scores));
    }
    recordPodiumStats(/** @type {any} */ (GameState.getRoundState().winnerSlotIndex), GameState.getRoundScores());
    HUD.clearFeed();
    syncRoundPhase("podium");
    beginPodiumPresentation();
    Netcode.sendHostRound();
  }

  // * Wire Sudden Death win callback — addScore fires this on first score during SD.
  GameState.setSuddenDeathWinCallback((scoringSlot) => {
    endRound(scoringSlot);
  });

  function clearAutoContinuePodiumTimeout() {
    if (autoContinuePodiumTimeoutId != null) {
      clearTimeout(autoContinuePodiumTimeoutId);
      autoContinuePodiumTimeoutId = null;
    }
    clientPodiumAutoContinueDeadlineMs = 0;
  }
  podiumAutoContinue.clear = clearAutoContinuePodiumTimeout;

  function currentPodiumAutoContinueKey() {
    return `${GameState.getRoundState().startedAtMs}:${GameState.getRoundState().winnerSlotIndex}:${matchHistory.length}`;
  }

  function maybeScheduleAutoContinuePodium() {
    if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
    const mode = detectGameMode();
    // * Friends parties get the auto-advance too (longer window — the host can still
    // * bail to the menu or change arenas before it fires). Kills post-match limbo.
    if (mode !== "quickplay" && mode !== "friends") return;
    const delayMs = mode === "friends" ? 10000 : 5000;

    const key = currentPodiumAutoContinueKey();
    if (autoContinuePodiumTimeoutId != null || autoContinuePodiumKey === key) return;

    autoContinuePodiumKey = key;
    autoContinuePodiumDeadlineMs = performance.now() + delayMs;
    autoContinuePodiumTimeoutId = setTimeout(() => {
      autoContinuePodiumTimeoutId = null;
      if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
      const modeNow = detectGameMode();
      if (modeNow !== "quickplay" && modeNow !== "friends") return;
      onHostPlayAgainClick();
    }, delayMs);
  }

  /**
   * Ticks rematch labels while auto-continue is armed:
   * host → "PLAY AGAIN (n)"; non-host → "STARTING IN (n)…" (local estimate).
   */
  function updatePlayAgainCountdownLabel(playAgain) {
    if (!playAgain) return;
    if (Netcode.getIsHost()) {
      if (autoContinuePodiumTimeoutId == null || !autoContinuePodiumDeadlineMs) return;
      const secs = Math.max(0, Math.ceil((autoContinuePodiumDeadlineMs - performance.now()) / 1000));
      const next = `PLAY AGAIN (${secs})`;
      if (playAgain.textContent !== next) playAgain.textContent = next;
      return;
    }
    if (!clientPodiumAutoContinueDeadlineMs) return;
    const secs = Math.max(0, Math.ceil((clientPodiumAutoContinueDeadlineMs - performance.now()) / 1000));
    const next = `STARTING IN (${secs})…`;
    if (playAgain.textContent !== next) playAgain.textContent = next;
  }

  /**
   * Solo/testdrive ESC: freeze round clock + countdown timeout so pause is real.
   * @param {boolean} open
   */
  function handleSoloPauseOverlay(open) {
    const mode = detectGameMode();
    if (mode !== "solo" && mode !== "testdrive") return;
    if (open) {
      if (soloPauseStartedAtMs != null) return;
      soloPauseStartedAtMs = getRoundClockNowMs();
      if (roundCountdownTimeoutId != null) {
        const state = GameState.getRoundState();
        const startsAt = (state.countdownStartedAtMs || 0) + CONFIG.round.countdownMs;
        soloPauseCountdownRemainingMs = Math.max(0, startsAt - getRoundClockNowMs());
        clearRoundCountdownTimeout();
      }
      return;
    }
    if (soloPauseStartedAtMs != null) {
      const delta = getRoundClockNowMs() - soloPauseStartedAtMs;
      soloPauseStartedAtMs = null;
      if (delta > 0) {
        const state = GameState.getRoundState();
        if (state.phase === "running" && state.startedAtMs > 0) {
          GameState.setRoundStartedAtMs(state.startedAtMs + delta);
        }
        if (state.phase === "countdown" && state.countdownStartedAtMs > 0) {
          GameState.setRoundCountdownStartedAtMs(state.countdownStartedAtMs + delta);
        }
      }
    }
    if (soloPauseCountdownRemainingMs != null) {
      const remaining = soloPauseCountdownRemainingMs;
      soloPauseCountdownRemainingMs = null;
      if (GameState.getRoundState().phase === "countdown" && Netcode.getIsHost()) {
        const startsAtLocalMs = getRoundClockNowMs() + remaining;
        roundCountdownTimeoutId = setTimeout(() => {
          roundCountdownTimeoutId = null;
          if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
        }, remaining);
      }
    }
  }

  function currentCartSnapshot() {
    const carts = [];
    const round3 = (v) => Math.round(v * 1000) / 1000;
    for (let i = 0; i < allCarts.length; i += 1) {
      const c = allCarts[i];
      if (!c?.body) continue;
      const t = c.body.translation();
      const r = c.body.rotation();
      const lv = c.body.linvel();
      const av = c.body.angvel();
      carts[i] = {
        p: [round3(t.x), round3(t.y), round3(t.z)],
        q: [round3(r.x), round3(r.y), round3(r.z), round3(r.w)],
        lv: [round3(lv.x), round3(lv.y), round3(lv.z)],
        av: [round3(av.x), round3(av.y), round3(av.z)],
      };
    }
    return carts;
  }

  function onHostPlayAgainClick() {
    if (!Netcode.getIsHost()) return;
    // * Re-entrancy guard (quickplay): a double-fire (button + auto-continue race, or
    // * a fast double-click) would adopt+broadcast a SECOND random arena while its
    // * rotateLoadedArenaInPlace no-ops on the in-flight flag — host on arena A,
    // * everyone else on arena B. Checked BEFORE the world-reset side effects below:
    // * the suppressed call must not re-run rematchResetWorld mid-collider-rebuild
    // * (it would broadcast spawn poses computed against the outgoing arena's ring).
    if (detectGameMode() === "quickplay" && arenaRotationInFlight) return;
    cancelLastCartStandingFinish();
    autoContinuePodiumKey = currentPodiumAutoContinueKey();
    clearAutoContinuePodiumTimeout();
    clearRoundCountdownTimeout();
    gameCtx.slowMo.active = false;
    lastResultsOverlayKey = null;
    clearPodiumPresentation();
    GameState.setRoundEndReason(null);
    Netcode.resetClientPredictionState();
    Entities.rematchResetWorld();
    if (detectGameMode() === "solo" || detectGameMode() === "testdrive") {
      startCountdown(getRoundClockNowMs() + CONFIG.round.countdownMs);
      return;
    }
    // * Quickplay arena rotation (D-STAB-2 seam): pick a fresh random arena at the
    // * rematch boundary. Latch it BEFORE sendHostRound below so the round broadcast
    // * carries the new levelId (server latches + rebroadcasts; non-host clients rotate
    // * via onLevelIdChanged). Friends lobbies keep the host's deliberate arena choice.
    if (detectGameMode() === "quickplay") {
      const nextArenaId = pickNextQuickplayArenaId();
      Netcode.adoptRoomLevelAsHost(nextArenaId);
      void rotateLoadedArenaInPlace(nextArenaId);
    }
    syncRoundPhase("lobby");
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    GameState.setRoundStartedAtMs(0);
    GameState.setRoundCountdownStartedAtMs(0);
    Netcode.sendHostRound();
    Netcode.sendPlayAgain();
  }

  resultsUi.playAgain.addEventListener("click", onHostPlayAgainClick);


  // --- Simulation loop (fixed timestep) ---
  const loopState = createGameLoopState();
  gameCtx.setLoopState(loopState);
  gameCtx.registerRuntime({
    getAllCarts: () => allCarts,
    getAllCartsRef: () => allCartsRef,
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

  const visualDeps = {
    ...sharedLoopGetters,
    netTargetPosScratch,
    cartLinvelScratch,
    cartAngvelScratch,
    onAutoQualityStepDown: handleAutoQualityStepDown,
    updateCartVisuals,
    buildCartMaterialCache,
    colorHexForSlot: displayColorHexForSlot,
    isMuted: getIsMuted,
    getSfxVolume,
    isMenuVisible: () => menuVisible,
    getAxis: Input.getAxis,
    get hud() { return hud; },
    leaderHum,
    HUD,
    getYouConnId: () => Netcode.getYouConnId(),
    getMatchHistoryLength: () => (matchHistory ? matchHistory.length : 0),
    updateResultsOverlay,
    positionNameLabels,
    composer,
    scene,
    camera,
    labelRenderer,
    canvas,
    BASE_FOV,
    getShakeUntil: () => shakeUntil,
    getShakeIntensity: () => shakeIntensity,
    getFovPunchUntil: () => fovPunchUntil,
    getFovPunchDeg: () => fovPunchDeg,
    getKillFlash: () => killFlash,
    getImpactPulse: () => impactPulse,
    getHitStop: () => hitStop,
    getArcadePass: () => fxPass,
    fpsState,
    updateTouchControlsVisibility,
  };

  const gameFlowDeps = {
    ...sharedLoopGetters,
    detectGameMode,
    getLastHitBy: () => GameState.getLastHitBy(),
    // * Per-arena kill-zone classifier for buildKOEvent (Storerooms corner voids → 2×).
    classifyKillZone: Simulation.classifyLevelKillZone,
    // * Living Store directive KO-reward boost (Double Bag). Dep-injected so koEvent.js
    // * stays a leaf module; the falls[] wire carries the boosted reward to clients.
    getDirectiveKoRewardMultiplier,
    getLocalCart: localCartForConnId,
    scheduleRespawn,
    scheduleStuckRespawn,
    doRespawn: Entities.doRespawn,
    onCartOutOfPlay: stopChargeSfxForCart,
    maybeTriggerNpcOpportunisticRamBoost,
    maybeTriggerNpcOpportunisticHop,
    endRound,
    scheduleLastCartStandingFinish,
    abortLastCartStandingFlourish,
    addScore: GameState.addScore,
    isScoreTied: GameState.isScoreTied,
    setSuddenDeath: GameState.setSuddenDeath,
    setLocalCombo: GameState.setLocalCombo,
    colorHexForSlot: displayColorHexForSlot,
    get hud() { return hud; },
    sendHostRound: () => Netcode.sendHostRound(),
    getPartySocket: () => Netcode.getPartySocket(),
    queueHostFallEvent: Netcode.queueHostFallEvent,
    onLocalKillConfirm,
    onArenaKoFlash,
    onAnnouncerFall: announcerDirectorOnFall,
    getYouConnId: () => Netcode.getYouConnId(),
    getScene: () => scene,
    triggerCartShatter,
    onSpill: (slotIndex, pos, quat, vel, cargoBay) => {
      const cart = allCartsRef?.[slotIndex];
      const spillCount = spillCountForCart(cart);
      GroceryPool.triggerSpill(String(slotIndex), pos, quat, vel, spillCount, cargoBay || cart?.cargoBay || null);
      // * Always clear every cargoBay under the cart mesh (ref can be stale after rebuild).
      GroceryPool.hideCargoBay(cart || cargoBay);
      armSpillBoost(cart);
      // * Living Store "Spill Bonus" — host awards the recent rammer while active.
      directiveOnHostSpill(slotIndex);
      triggerSpillNetcode(slotIndex, pos, quat, vel, cargoBay, spillCount);
    },
    onCartRespawn: (slotIndex) => {
      GroceryPool.releaseByCartId(String(slotIndex));
    },
    getWorld: () => world,
    getBoothColliderHandles: () => boothColliderHandles,
  };

  const hostSimCallbacks = {
    getAxis: Input.getAxis,
    getAiAxis,
    playCollision: (intensity, opts) => AudioManager.playCartCrash(intensity, opts),
    spawnTrashBurst: spawnTrashBurstRef,
    onLocalRamImpact: triggerLocalRamShake,
    onLocalHitTaken: triggerLocalHitTaken,
    onCartImpactSquash: squashCartsOnImpact,
    onBoostRelease,
    onBoostCancel,
    onHopLand,
    onSpill: (cart) => {
      const pos = cart.body.translation();
      const quat = cart.body.rotation();
      const vel = cart.body.linvel();
      const cargoBay = cart.cargoBay;
      const spillCount = spillCountForCart(cart);
      GroceryPool.triggerSpill(String(cart.slotIndex), pos, quat, vel, spillCount, cargoBay);
      GroceryPool.hideCargoBay(cart);
      armSpillBoost(cart);
      // * Living Store "Spill Bonus" — host awards the recent rammer while active.
      directiveOnHostSpill(cart.slotIndex);
      triggerSpillNetcode(cart.slotIndex, pos, quat, vel, cargoBay, spillCount);
    },
    get partySocket() { return Netcode.getPartySocket(); },
    get recordColliderHandles() { return recordColliderHandles; },
    get pitWallColliderHandle() { return pitWallColliderHandle; },
    get boothColliderHandles() { return boothColliderHandles; },
    playFloorImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }),
    playEdgeImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }),
    resolveCartForConn: (connId) => {
      const idx = Netcode.strictSlotIndexForConn(connId);
      return idx >= 0 ? allCartsRef[idx] : null;
    },
  };

  const clientSimCallbacks = {
    ...hostSimCallbacks,
    getAiAxis: null,
    onSpill: (cart) => {
      const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      // * Non-host client only predicts tip-over spills for own local cart;
      // * remote cart & NPC spills are driven authoritatively by host MSG.spill broadcast.
      if (cart?.slotIndex !== localSlot) return;
      hostSimCallbacks.onSpill(cart);
    },
  };

  const physicsDeps = {
    ...sharedLoopGetters,
    get world() { return world; },
    get eventQueue() { return eventQueue; },
    getAllCartsRef: () => allCartsRef,
    getLocalCart: localCartForConnId,
    shouldUseClientPrediction: () => Netcode.shouldUseClientPrediction(),
    ...gameCtx.getSlowMoDeps(),
    getSkipNextPhysicsStep: () => Netcode.getSkipNextPhysicsStep(),
    setSkipNextPhysicsStep: (skip) => Netcode.setSkipNextPhysicsStep(skip),
    getRemoteInputsByConnId: () => Netcode.getRemoteInputsByConnId(),
    getHostMigrationFreezeUntilMs: () => Netcode.getHostMigrationFreezeUntilMs(),
    updateRemoteCartNetTargets: (idx) => Netcode.updateRemoteCartNetTargets(idx),
    syncRemoteCartBodiesForPrediction: (idx) => Netcode.syncRemoteCartBodiesForPrediction(idx),
    sampleAuthoritativeCartState: (idx) => Netcode.sampleAuthoritativeCartState(idx),
    runFixedPhysicsStep: Simulation.runFixedPhysicsStep,
    getSimulationCallbacks: (isHost) => (isHost ? hostSimCallbacks : clientSimCallbacks),
    getPendingInputs: () => Netcode.getPendingInputs(),
    prunePendingInputs: (ackSeq) => Netcode.prunePendingInputs(ackSeq),
    getLatestSnap: () => Netcode.getLatestSnap(),
    applySnapshotToCartBody: (cart, snap) => Netcode.applySnapshotToCartBody(cart, snap),
    doRespawn: Entities.doRespawn,
    netcode: Netcode,
  };

  gameCtx.attachDeps({
    visual: visualDeps,
    gameFlow: gameFlowDeps,
    physics: physicsDeps,
  });

  runGameLoop(gameCtx.loopState, {
    shouldSkipTiming: () => {
      if (menuVisible) return true;
      // * Solo/testdrive ESC freezes physics + frame timing (real pause).
      if (HUD.isEscOverlayVisible()) {
        const mode = detectGameMode();
        if (mode === "solo" || mode === "testdrive") return true;
      }
      return false;
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
        if (sdNow) ArenaAmbience.bumpCrowdExcitement(0.9);
      }
    }
    const isUiActive = menuVisible || HUD.isEscOverlayVisible() || GameState.getRoundState().phase === "podium";
    setGamepadUiMode(isUiActive);
    setGamepadNavActive(isUiActive);
    const { now, loopState } = frameCtx;
    const dt = applySlowMoToDt(gameCtx.getSlowMoDeps(), frameCtx.dt);

    // * Soft frame budget for optional cosmetics (physics/render always run).
    beginFrameBudget(now, frameCtx.dt);

    if (isLevelSwapping()) {
      frameCtx.dt = dt;
      return;
    }

    if (fxPass && fxPass.uniforms && fxPass.uniforms.uTime) {
      fxPass.uniforms.uTime.value = fxTimer.getElapsed();
    }

    if (loopState.simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
    }

    // Visual-only record rotation.
    if (recordMesh) {
      recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;
    }

    const offset = Netcode.getHostClockOffsetMs();
    const syncedNow = (offset && !Number.isNaN(offset)) ? (now - offset) : now;

    /** @type {any} */ (sceneExtras)?.update?.(syncedNow, camera);
    levelUpdate?.(syncedNow);
    if (frameBudgetAllow("level_lod", now)) {
      updateLevelLod(camera, syncedNow);
    }

    // * Rave dressing animation: skip entirely when the level hides it (Storerooms/
    // * test arena kept extras allocated but this math used to run anyway) and on
    // * tiers with crowdAnimate off (Low renders the stands frozen). Yield under
    // * frame pressure so host physics keeps the full budget.
    if (
      raveShellInitialized
      && levelUsesRaveExtras()
      && getQualityKnobs().crowdAnimate
      && frameBudgetAllow("rave_anim", now)
    ) {
      Effects.updateStageLights(syncedNow);
      Effects.updateCrowd(syncedNow);
      Effects.updateStageLed(syncedNow);
      if (raveJuiceInitialized) {
        Effects.updateLasers(syncedNow);
        Effects.updateBillboard(syncedNow);
      }
    }

    // * Spindle/rims driven by arenaReactiveLights inside Classic Record levelUpdate.

    // Record label color cycle (5 colors, ~2s each, ~10s full loop).
    // * Sole leader leans the vinyl label toward their color (crown-jewel read).
    if (recordLabelMat) {
      const segMs = 2000;
      const idx = Math.floor(now / segMs) % recordLabelCycleColors.length;
      const nextIdx = (idx + 1) % recordLabelCycleColors.length;
      const f = (now % segMs) / segMs;
      recordLabelMat.color
        .copy(recordLabelCycleColors[idx])
        .lerp(recordLabelCycleColors[nextIdx], f);
      const reactive = sampleArenaReactive(syncedNow);
      if (reactive.hasLeader || reactive.koT > 0) {
        recordLabelMat.color.lerp(reactive.accentColor, reactive.hasLeader ? 0.55 : 0.35 * reactive.koT);
      }
    }

    // * Booth neon pulse — intensity only. Hue stays on the per-booth materials so
    // * pink/green/cyan/orange spawn corners stay readable as four distinct booths.
    if (boothNeonMeshes && boothNeonMeshes.length > 0 && frameBudgetAllow("booth_pulse", now)) {
      boothNeonMatsSeen.clear();
      const pulseHz = CONFIG.booth.neonCycleSpeed;
      const nowSec = syncedNow * 0.001;
      for (const mesh of boothNeonMeshes) {
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
        allCartsRef || [],
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
      const allCartsArr = allCartsRef || [];
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
        CameraMod.updateCamera(camera, spectatorTarget, dt, playerPos, playerRot, world);
      }
    } else if (localCart?.body) {
      if (CameraMod.getCameraMode(camera) === CameraMod.CameraMode.DEATH) {
        CameraMod.endDeathCamera(camera);
      }
      // * KO hit-stop: hold the follow camera exactly where it is for the stop window
      // * (frameVisuals holds the cart poses; a moving camera would betray the freeze).
      const inHitStop = performance.now() < hitStop.until
        && GameState.getRoundState().phase === "running";
      if (!inHitStop) {
        let playerPos = localCart.body.translation();
        let playerRot = localCart.body.rotation();
        // * Follow the reconcile-smoothed visual pose, not the raw body: reconciliation
        // * hard-snaps the body to host truth (up to 40Hz), and this camera is rigid by
        // * design — feeding it the raw body re-broadcasts every snap as a full-screen
        // * jerk. _reconcileVisOffset is the eased remainder frameVisuals renders the
        // * cart at (always zero for host/solo), so camera and cart stay glued together.
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
        CameraMod.updateCamera(
          camera,
          localCart,
          dt,
          playerPos,
          playerRot,
          world,
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
          window.location.href = new URL(window.location.href).pathname;
        }
      }
    },
  });

  // * Register bridge functions for cart-rave-menu.js to toggle GFX/quality live.
  registerGraphicsToggleHandlers({
    togglePostFx: (next) => {
      bloomEnabled = next;
      fxPassEnabled = next;
      settingsStore.getState().setBloomEnabled(next);
      settingsStore.getState().setFxPassEnabled(next);
      if (bloomPass) bloomPass.enabled = next;
      if (arcadePass) arcadePass.enabled = next;
      if (fxPass) fxPass.enabled = next;
      // * Keep URL ablation in force after menu Post-FX toggle.
      applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });
    },
    applyQualityTier: (tier) => handleQualityTierChange(tier),
  });

  window.addEventListener("resize", updateViewport);
  enableModeMenuButtons();
  window.__cartRaveMainReady = true;
  window.__cartRaveBootstrapped = true;
  // * Boot telemetry — time-to-menu-interactive from navigation start (ms). Read via
  // * performance.getEntriesByName("cr:menu-ready")[0].startTime or the DevTools timeline.
  // * The app had no boot marks, so load-time regressions were invisible to profiling.
  if (typeof performance !== "undefined" && performance.mark) {
    performance.mark("cr:menu-ready");
  }
  window.__cartRaveCancelBootError?.();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");

  // * Visual QA harness (Playwright shoot / blackframes) when URL flags request it.
  const dbg = getDebugParams();
  if (dbg.harness || dbg.freeze || dbg.cam || dbg.ablate.size || dbg.hideHud) {
    installVisualHarness({
      isReady: () => Boolean(window.__cartRaveMainReady),
      isWorldReady: () => isWorldBootstrapped(),
      getError: () => null,
      getRenderer: () => renderer,
      getCamera: () => camera,
      getCanvas: () => canvas,
      getPasses: () => ({ bloomPass, arcadePass, fxaaPass, outputPass }),
      ensureWorld: () => ensureWorldBootstrapped(),
      onSettleFrame: () => {
        if (isDebugCameraLocked()) applyDebugCameraPose(camera);
      },
    });
  }

  // * Netcode E2E harness (2-client rig / tools/netharness.mjs) when ?nettest=1. Read-only
  // * snapshot of phase + per-cart pose so an external driver can assert cross-client sync.
  // * Input is driven by real keydown events, not this hook. Zero cost when the flag is absent.
  if (new URLSearchParams(window.location.search || "").has("nettest")) {
    window.__ccNetTest = true;
    Netcode.setNetTestActive(true);
    installNetTestHarness({
      isReady: () => Boolean(window.__cartRaveMainReady),
      getPhase: () => GameState.getRoundState()?.phase ?? "unknown",
      getYouConnId: () => Netcode.getYouConnId(),
      getHostId: () => Netcode.getHostId(),
      getIsHost: () => Netcode.getIsHost(),
      getLocalSlotIndex: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
      getCarts: () => allCartsRef,
      getNetSlots: () => Netcode.getNetSlots(),
      getLatestSnap: () => Netcode.getLatestSnap(),
      getAxis: () => Input.getAxis(),
      getPendingInputCount: () => Netcode.getPendingInputs().length,
      getPendingMidJoinConnId: () => pendingMidRoundJoinRespawnConnId,
      getInputCounters: () => Netcode.__netcodeTestHooks.getInputCounters(),
      getShouldPredict: () => Netcode.shouldUseClientPrediction(),
      getMode: () => detectGameMode(),
      getMigFreezeRemMs: () =>
        Netcode.getHostMigrationFreezeUntilMs() - (performance.timeOrigin + performance.now()),
      getHostInputDebug: (connId) => {
        const h = Netcode.__netcodeTestHooks;
        return {
          queueLen: h.getRemoteInputQueueLength(connId),
          lastAckSeq: h.getHostLastProcessedInputSeq(connId),
        };
      },
    });
  }

  // * Gameplay diagnostics hub (?diag → window.__ccDiag, read-only). General complement to
  // * the netcode + visual harnesses: probes for round/score/announcer/ai/camera/boot/unlocks/
  // * challenges + a bounded event log. Read surface works in prod builds (QA); the scenario
  // * control levers are DEV-only. Zero cost when the flag is absent. See tools/gameharness.mjs.
  if (diagUrlFlags().enabled) {
    // * DEV-only scenario levers — each reuses an existing proven production path; never a new
    // * mutation route, and never attached in a production build (players can't reach them).
    installDiagnostics({ flags: diagUrlFlags(), control: devControl });
    installGameplayDiagnostics({
      getCarts: () => allCartsRef,
      getNetSlots: () => Netcode.getNetSlots(),
      getCamera: () => camera,
      getMode: () => detectGameMode(),
      getLevelId: () => getCurrentLevelId(),
      getLocalSlot: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
      // * Spawn-lock triage (07-17 run 2): main-closure state the "net" probe can't
      // * reach — an F8 during "can't leave spawn" must show whether inputs are being
      // * sampled at all, and whether an arena swap gate is still up.
      getNetDebug: () => {
        const slot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        const localCart = Array.isArray(allCartsRef) ? allCartsRef[slot] : null;
        return {
          arenaRotationInFlight,
          menuVisible,
          localShatterState: Boolean(localCart?._shatterState),
          localBodyEnabled: localCart?.body ? localCart.body.isEnabled() : null,
          // * The two client-freeze gates the 07-17 captures could NOT see: an unwired
          // * axis ref (input sampling no-op) and a live host-migration freeze window.
          axisWired: Netcode.isInputAxisWired(),
          migFreezeRemMs: Math.max(
            0,
            Math.round(Netcode.getHostMigrationFreezeUntilMs() - (performance.timeOrigin + performance.now())),
          ),
        };
      },
    });

    // * Bug-capture hotkeys (F8, or legacy Ctrl+Shift+D): assemble a __ccDiag capture bundle for
    // * the moment a bug is on screen — "player reports it, dev presses the key". Logs the bundle,
    // * copies its JSON to the clipboard, AND downloads it as a .json file (clipboard alone
    // * truncates in some consoles and gets clobbered; the file is durable and drops straight into
    // * .diag-captures/ style triage). Read-only — captureBundle() runs the probes and copies the
    // * event log, it never mutates game state — so it's safe to ship in prod builds; the ?diag
    // * flag is the gate (a normal player without it never installs this listener). Works during
    // * live prod playtests, which is where "press F8 when you see it" is most useful. The harness
    // * path captures on its own; automatic error/assert captures live under __ccDiag.captures().
    const manualCapture = (trigger) => {
      try {
        const bundle = /** @type {any} */ (window).__ccDiag.captureBundle({
          scenario: "manual",
          reason: `hotkey ${trigger}`,
        });
        const json = JSON.stringify(bundle, null, 2);
        // eslint-disable-next-line no-console
        console.info(`[diag] capture bundle (phase=${bundle.phase}, ${bundle.events.length} events):`, bundle);
        navigator.clipboard?.writeText?.(json).then(
          () => console.info("[diag] capture bundle copied to clipboard"),
          () => {},
        );
        const blob = new Blob([json], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cc-capture-${bundle.phase ?? "nophase"}-${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      } catch (err) {
        console.warn("[diag] capture bundle failed:", err);
      }
    };
    window.addEventListener("keydown", (e) => {
      const isF8 = e.code === "F8" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const isLegacy = e.ctrlKey && e.shiftKey && e.code === "KeyD";
      if (!isF8 && !isLegacy) return;
      e.preventDefault();
      manualCapture(isF8 ? "F8" : "Ctrl+Shift+D");
    });
  }

  // * Gameplay analytics (production-safe, event-level only — see src/analytics/). Installed
  // * unconditionally: opt-out (?analytics=off / localStorage) and DEV console routing are the
  // * core's concern. Emits match/unlock/challenge/quit/session events via store subscriptions;
  // * nothing per-frame. Runs AFTER the diagnostics block so its `analytics` probe can register
  // * with an installed hub (registerDiagProbe is a no-op before installDiagnostics).
  installGameplayAnalytics({
    getMode: () => detectGameMode(),
    getLevelId: () => getCurrentLevelId(),
    getLocalSlot: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
  });

  // * VFX-1: live black-frame flicker monitor on real hardware (?blackmon=1). Opt-in,
  // * self-scheduling; logs left/right slab events + shows a counter. Zero cost otherwise.
  if (dbg.blackmon) {
    startBlackFrameMonitor({ getCanvas: () => canvas });
  }

  // * Idle warm: after menu is up, load Rapier + selected level in the background so
  // * first Solo/Quickplay skips the cold arena stack. Idempotent with enterPlayMode.
  // * Delay so menu music + cart Draco keep first dibs on bandwidth; skip when tab hidden.
  // * Harness path warms immediately so shoot tools do not wait on the idle delay.
  if (dbg.harness || dbg.hideHud) {
    void ensureWorldBootstrapped().then(() => {
      if (getDebugParams().cam) applyDebugCameraPose(camera);
      if (getDebugParams().hideHud) {
        const root = document.getElementById("cr-root");
        if (root) {
          root.style.visibility = "hidden";
          root.style.pointerEvents = "none";
        }
        // * Attract only runs while menu is "visible" — keep menuVisible true, hide DOM.
        startMenuAttract();
      } else {
        startMenuAttract();
      }
    }).catch((err) => {
      console.warn("[harness] world warm failed", err);
    });
  } else {
    scheduleIdleWorldWarm();
  }
}

/**
 * Preheats physics + default arena while the player sits on the main menu.
 * No-ops if play already started, world is warm, or the tab is backgrounded.
 */
function scheduleIdleWorldWarm() {
  /** @type {number} ms — let menu music / first paint settle before WASM + arena work. */
  const IDLE_WARM_DELAY_MS = 1800;

  const runWarm = () => {
    if (!menuVisible) return;
    if (isWorldBootstrapped()) return;
    // * Solo/Quickplay already claimed the cold-load — don't start a default-arena warm
    // * that would race and force a second full rebuild for the selected level.
    if (isIdleWorldWarmSuppressed()) return;
    void ensureWorldBootstrapped()
      .then(() => {
        if (import.meta.env.DEV && menuVisible) {
          // eslint-disable-next-line no-console
          console.log("[bootstrap] idle world warm done (menu still open)");
        }
        // * Level previews only run once the world exists — nudge picker if needed.
        if (menuVisible) scheduleMenuLevelPreview();
        // * Selected arena is now warm; fetch the other arena chunks in the background
        // * so the first menu arena switch never waits on a lazy import round-trip.
        void prefetchLevelChunks();
        // * Warm announcer voice clips in the background while the menu is idle —
        // * avoids ~1.7 MB network + tens of MB decoded PCM at boot (preload:false).
        AudioManager.prefetchSfxByPrefix("announcer_");
      })
      .catch((err) => {
        console.warn("[bootstrap] idle world warm failed:", err);
      });
  };

  const kick = () => {
    if (document.hidden) {
      document.addEventListener(
        "visibilitychange",
        () => {
          if (!document.hidden) scheduleIdleWorldWarm();
        },
        { once: true },
      );
      return;
    }
    const start = () => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(runWarm, { timeout: 4000 });
      } else {
        setTimeout(runWarm, 0);
      }
    };
    setTimeout(start, IDLE_WARM_DELAY_MS);
  };

  kick();
}

bootstrapNetcodeEntryFromUrl();
main().catch((err) => {
  console.error("[CartRave] bootstrap failed:", err);
  dismissAllLoadingOverlays();
  if (typeof window.__cartRaveShowBootError === "function") {
    window.__cartRaveCancelBootError?.();
    window.__cartRaveShowBootError(
      err && err.message ? err.message : "Game bootstrap failed. Hard refresh or restart dev server.",
    );
  }
});
