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
import { installDiagnostics, diagUrlFlags, recordDiagEvent } from "./utils/diagnostics.js";
import {
  shouldAllowPodiumEnd,
  notePodiumEndSend,
  onPodiumEndRejected,
  clearPodiumEndLatch,
  consumeHardStopDiag,
} from "./utils/podiumEndLatch.js";
import { logBuildBanner, refreshBuildFreshness } from "./utils/buildFreshness.js";
import { mark } from "./utils/perfSpans.js";
import { installGameplayDiagnostics } from "./utils/gameplayDiagnostics.js";
import { installLongTaskProbe } from "./utils/longTaskProbe.js";
import { installGameplayAnalytics } from "./analytics/gameplayAnalytics.js";
import { startBlackFrameMonitor } from "./utils/blackFrameMonitor.js";
import {
  loadPlayerCustomization,
  resolveCartNeonCss,
  resolveCartNeonHex,
  resolveCartPatternForSlot,
  resolveCartThemeForSlot,
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
  isSoftwareRendererActive,
  getSoftwareRendererName,
} from "./scene.js";
import { tickAutoQuality } from "./utils/autoQuality.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RAPIER } from "./physics/rapierInstance.js";
import * as Visuals from "./visuals.js";
import { prefetchRaveGltf } from "./cartRaveGltf.js";
import * as Simulation from "./simulation.js";
import * as Entities from "./entities.js";
import { triggerCartShatter } from "./cartShatter.js";
import * as HUD from "./hud.js";
import { STAGE_PRIORITY } from "./ui/centerStage.js";
import * as Input from "./input.js";
import * as Netcode from "./netcode.js";
import * as GameState from "./gameState.js";
import { svgIcon } from "./ui/icons.js";
import { ChallengeTracker, challengeStore, CHALLENGE_POOL } from "./stores/challengeStore.js";
import { onUnlockGranted, unlockStore } from "./stores/unlockStore.js";
import { PROGRESSION_EVENTS } from "./progression/eventIds.js";
import {
  getMatchStats,
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
 * @param {boolean} [isLeader]
 * @param {{ tier: "stripped" | "stocked" | "boss", fill: number } | null} [cargoChip]
 *   CARGO-HUD-1 load chip: `tier` picks the colour band, `fill` (0–4) lights that many of
 *   the four segments — the same phases the 3D bay steps through.
 * @returns {string}
 */
function nametagHtml(name, meta, mode, isHost, isLeader = false, cargoChip = null) {
  const hostGlyph = isHost
    ? `<span style="opacity:.85;margin-right:5px;">${svgIcon("host", { label: "Host" })}</span>`
    : "";
  // * Mock 6a puts the crown on the leader's plate, same mark as the scoreboard.
  // * Who leads comes from HUD.getLeaderSlotIndex() — one rule, not two.
  const crown = isLeader
    ? `<span class="cart-nametag-crown">${svgIcon("crown", { label: "Leader" })}</span>`
    : "";
  // * CARGO-HUD-1: four-segment load chip, last on the plate. Built INTO this string on
  // * purpose — updateNameLabels caches on the produced HTML, so a tier/fill change
  // * invalidates the cache by itself and costs one innerHTML write per transition (no extra
  // * plumbing, no per-frame DOM work). Both values are derived enums/ints, never user text.
  const cargo = cargoChip
    ? `<span class="cart-nametag-cargo" data-cargo="${cargoChip.tier}" data-fill="${cargoChip.fill | 0}" aria-label="Cargo ${cargoChip.fill | 0} of 4"><i></i><i></i><i></i><i></i></span>`
    : "";
  if (!meta) return `${hostGlyph}${escapeHtml(name)}${crown}${cargo}`;
  const icon = `<span style="color:${meta.color};margin-right:6px;">${svgIcon(meta.icon, { label: meta.label })}</span>`;
  if (mode === "intro") {
    // * Countdown teach-moment: icon + personality word, collapses to icon-only at GO.
    return `${icon}<span style="color:${meta.color};">${meta.label}</span>${crown}${cargo}`;
  }
  return `${icon}${escapeHtml(name)}${crown}${cargo}`;
}
import * as AudioManager from "./audioManager.js";
import * as ArenaAmbience from "./ambience/arenaAmbience.js";
import * as CameraMod from "./camera.js";
import * as Effects from "./effects.js";
import { initDirectiveEngine, shiftDirectiveTimersBy } from "./directives/directiveEngine.js";
import { resolveLevelId, prefetchLevelChunks, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { DEV_UNLOCKS_STORAGE_KEY } from "./unlockConfig.js";
import { updateLevelLod } from "./utils/levelLod.js";
import { beginFrameBudget, frameBudgetAllow } from "./utils/frameBudget.js";
import { markBootPhase, onBootPhase } from "./utils/bootTimeline.js";

import {
  sampleArenaReactive,
  resetArenaReactiveLights,
} from "./arenaReactiveLights.js";
import { initAudioSystem } from "./audioSetup.js";
import * as SfxSynth from "./sfxSynth.js";
import { initAnnouncer, announce, setAnnouncerPresenter, registerAnnouncerVoicePack } from "./announcer/announcerManager.js";
import { ANNOUNCER_EVENTS } from "./announcer/announcerEvents.js";
import { expandAnnouncerVoiceKeys } from "./announcer/announcerVoiceKeys.js";
import { initAnnouncerStings } from "./announcer/announcerStings.js";
import { initAnnouncerDirector, announcerDirectorOnFall, announcerDirectorNearMissScan } from "./announcer/announcerDirector.js";
import { initAnnouncerDisplay } from "./ui/announcerDisplay.js";
import { initResultsOverlay, animateResultsPodiumShow, animateResultsDismiss, cancelResultsAnimations, spawnResultsConfetti, spawnResultsDefeatWilt } from "./ui/resultsOverlay.js";
import { showRotatePromptIfNeeded } from "./ui/rotatePrompt.js";
import {
  dismissAllLoadingOverlays,
  dismissInitialBootSplash,
  initLoadingScreen,
  noteBootMilestone,
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
} from "./levelManager.js";
import {
  enterPlayMode,
  ensureSessionCartsReady,
  ensureWorldBootstrapped,
  getLastSuccessfulHelloGen,
  initBootstrap,
  isIdleWorldWarmSuppressed,
  isSessionCartsReady,
  isWorldBootstrapped,
  isWorldBootstrapInFlight,
  resetSessionCartBootstrap,
} from "./bootstrap.js";
import { initMenuAttract, startMenuAttract } from "./ui/menuAttract.js";
import { animateCartBoostPulse, crossfadeElement } from "./animations.js";
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
import {
  applySlowMoToDt,
  clearNpcCartCache,
  createGameLoopState,
  resetGameLoopTiming,
  runGameLoop,
  runPhysicsStep,
  updateVisualsAndEffects,
  armRoundStartRenderProbe,
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
  buildSessionBridgeContext,
  createGameSessionController,
  createHelloGate,
  createSessionBridgeRefs,
  wireNetcodeRuntimeRefs,
} from "./gameSession.js";
import { createLevelOrchestration } from "./orchestration/levelOrchestration.js";
import {
  createRoundLifecycle,
  resolveCinematicCountdownOverrides,
} from "./orchestration/roundLifecycle.js";
import { createCartOrchestration } from "./orchestration/cartOrchestration.js";
import { createLoopDeps } from "./orchestration/loopDeps.js";
import { createMenuPlayEntry } from "./orchestration/menuPlayEntry.js";
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



/** @type {string | null} Dedupe key so host endRound + redelivered MSG.round never double-count. */
let lastPodiumStatsRoundKey = null;

/**
 * Records end-of-round match history and local personal stats at the moment a round transitions into podium.
 * @param {number | "draw" | null} winnerSlotIndex
 * @param {Record<number, number> | null | undefined} scoresSrc
 */
function recordPodiumStats(winnerSlotIndex, scoresSrc) {
  const startedAtMs = Number(GameState.getRoundState()?.startedAtMs) || 0;
  const winKey =
    winnerSlotIndex === "draw"
      ? "draw"
      : typeof winnerSlotIndex === "number" && Number.isFinite(winnerSlotIndex)
        ? String(winnerSlotIndex)
        : "0";
  // * Once per round clock — redelivered running→podium must not inflate PLAYED/WINS.
  if (startedAtMs > 0) {
    const key = `${startedAtMs}:${winKey}`;
    if (lastPodiumStatsRoundKey === key) return;
    lastPodiumStatsRoundKey = key;
  }

  /** @type {Record<number, number>} */
  const scores = {};
  for (let i = 0; i < 4; i += 1) {
    // * Wire scores sometimes arrive as string keys; coerce both.
    const raw = scoresSrc?.[i] ?? /** @type {any} */ (scoresSrc)?.[String(i)];
    scores[i] = Number(raw ?? 0);
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
  // * Countdown/running entries here are always fresh-round boundaries (host
  // * startCountdown/startRunningAt, non-host game_start apply). Clear any leftover
  // * Rampage combo: an immediate solo RESTART can land inside the previous round's
  // * 5s combo window, and the badge widget renders whenever tier>0 && !expired —
  // * it flashed over the new 3-2-1. (The store's own startCountdown()/startRunning()
  // * actions would do this, but round starts never route through them.)
  if (phase === "countdown" || phase === "running") GameState.setLocalCombo(0, 0);
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
/** Set to true the moment a color-dot is clicked, preventing slots-message re-renders from re-opening the picker before server confirmation arrives. */
let _localColorPicked = false;
/** @type {HTMLElement | null} */
let pendingColorChipEl = null;
/** @type {string | null} */
let pendingColorKey = null;
let customizationChangeListenerWired = false;
/**
 * FRIENDS-JOIN-1: true when this client reached the room by TYPING a code, which is the
 * only case where "alone in the lobby" might mean "you mistyped it". A host who created a
 * room and is waiting for friends looks identical (alone, isHost, phase lobby) and must
 * never be told to check the code. Cleared on menu return (createMenuPlayEntry).
 */
let joinedViaTypedCode = false;
/** @type {boolean} */
let menuVisible = true;
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

/** Renderer handle for the module-level idle warm (set once in main()). */
let idleWarmRenderer = null;
/** Sudden Death tension bed edge-latch — see the onFrame watcher. */
let sdTensionLatched = false;
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
  /** @type {ReturnType<typeof runGameLoop> | null} */
  let gameLoopDriver = null;

  installGlobalErrorReporting();
  // * FV-BOOT-1: HTML parse → module eval gap (bootStartTime is set inline in index.html).
  const moduleEvalMs = Math.round(performance.now());
  const htmlBootMs =
    typeof window.bootStartTime === "number"
      ? Math.round(moduleEvalMs - window.bootStartTime)
      : null;
  markBootPhase("module-eval", {
    tMs: moduleEvalMs,
    htmlToModuleMs: htmlBootMs,
  });
  // * fonts.css is render-blocking in <head> — surface its ResourceTiming if present.
  try {
    const fontEntries = performance.getEntriesByName(
      `${window.location.origin}/fonts/fonts.css`,
      "resource",
    );
    const fe = fontEntries[fontEntries.length - 1];
    if (fe && "responseEnd" in fe) {
      markBootPhase("fonts-css", {
        durationMs: Math.round(/** @type {PerformanceResourceTiming} */ (fe).duration),
        responseEndMs: Math.round(/** @type {PerformanceResourceTiming} */ (fe).responseEnd),
        transferSize: /** @type {PerformanceResourceTiming} */ (fe).transferSize ?? 0,
      });
    }
  } catch {
    /* ResourceTiming unavailable — boot continues */
  }
  initLoadingScreen();
  // * Bundle fetched + parsed — the dominant real unknown in boot time.
  noteBootMilestone(45);
  markBootPhase("milestone-45");
  // * Dismiss boot splash before scene init — initMenu() may return early on ?room= URLs.
  // * Rapier WASM is loaded lazily via dynamic import in ensureRapierPhysics, keeping
  // * the boot critical path clean.
  void dismissInitialBootSplash();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
  loadPlayerCustomization();
  wireCustomizationStorageSync();

  // * FV-BOOT-1: defer GLB prefetch until the boot splash has dismissed so the cold-boot
  // * critical path is not competing with a multi-MB Draco fetch. Carts still warm via
  // * play-entry cartPrefetch; menu idle has plenty of time after splash for the GLB.
  const startGlbPrefetch = () => {
    const glbPrefetchT0 = performance.now();
    markBootPhase("glb-prefetch-start");
    void prefetchRaveGltf()
      .then(() => {
        noteBootMilestone(75);
        markBootPhase("glb-prefetch-end", {
          durationMs: Math.round(performance.now() - glbPrefetchT0),
        });
        markBootPhase("milestone-75");
      })
      .catch((err) => {
        console.warn("[cartRaveGltf] Early prefetch failed:", err);
        markBootPhase("glb-prefetch-end", {
          durationMs: Math.round(performance.now() - glbPrefetchT0),
          failed: true,
        });
      });
  };
  {
    let glbArmed = false;
    const armGlb = () => {
      if (glbArmed) return;
      glbArmed = true;
      startGlbPrefetch();
    };
    const unsub = onBootPhase((name) => {
      if (name === "boot-splash-dismissed") {
        unsub();
        armGlb();
      }
    });
    // * Safety: if dismiss marks never fire (tests / exotic embeds), start after a beat.
    setTimeout(() => {
      unsub();
      armGlb();
    }, 8000);
  }

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

  // * Sync AudioManager to the volumes audioStore already loaded from localStorage
  // * at module scope. These are store-domain values (0..AUDIO_VOLUME_MAX); the
  // * setState-backed setters re-persist them as the same pct, so the round-trip is
  // * idempotent. Do NOT divide by AUDIO_VOLUME_MAX here — that shrank sfx/music
  // * into 0..1, and because the setters immediately saved the shrunken value back,
  // * every page load quietly decayed saved volume by ~1/AUDIO_VOLUME_MAX until the
  // * player touched a slider (trended toward silence over ~15 reloads).
  AudioManager.restoreVolumeState({
    master: getMusicVolume(),
    sfx: getSfxVolume(),
    music: getMusicVolume(),
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

  // * MAIN-1 Lever G: menu / play entry + level music + audio unlock + touch visibility.
  // * Music is per-arena (src/music/levelMusic.js); playlist warm lives in menuPlayEntry.
  // * Late getters: level drain, podium skip, refreshMenuStats — rebound below.
  /** @type {ReturnType<typeof createLevelOrchestration> | null} */
  let level = null;
  /** @type {() => void} */
  let removePodiumSkipListeners = () => {};
  /** @type {() => void} */
  let refreshMenuStats = () => {};

  const menu = createMenuPlayEntry({
    audioListener,
    soundUrl,
    getMenuVisible: () => menuVisible,
    setMenuVisible: (v) => { menuVisible = v; },
    getLabelRenderer: () => labelRenderer,
    removePodiumSkipListeners: () => removePodiumSkipListeners(),
    refreshMenuStats: () => refreshMenuStats(),
    drainPendingArenaRotation: () => { void level?.drainPendingArenaRotation?.(); },
    detectGameMode,
    captureInviteRoomForDeferredMenu,
    getPendingInviteRoomFromUrl: () => pendingInviteRoomFromUrl,
    setPendingInviteRoomFromUrl: (v) => { pendingInviteRoomFromUrl = v; },
    setJoinedViaTypedCode: (v) => { joinedViaTypedCode = v; },
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorChipEl: (v) => { pendingColorChipEl = v; },
    setPendingColorKey: (v) => { pendingColorKey = v; },
    setLocalColorPicked: (v) => { _localColorPicked = v; },
    enableModeMenuButtons,
  });
  const {
    prepareLevelMusic,
    startLevelMusic,
    updateTouchControlsVisibility,
    initMenu,
    commitMenuHiddenForGame,
  } = menu;

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

  // --- Renderer & scene ---
  const renderer = createRenderer(canvas);
  idleWarmRenderer = renderer;

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

  // * Software-WebGL notice: createRenderer already floored the session to LOW,
  // * but LOW cannot rescue a CPU rasterizer — the game will still crawl. A quiet
  // * bottom strip let frustrated playtesters miss it entirely, so this is a
  // * center-stage first-entry modal that names the cause and the *right* fix.
  // * The two software causes need opposite fixes:
  // *   - "Basic Render Driver" / WARP → Windows loaded NO GPU driver (or it's a
  // *     VM / remote desktop). Toggling browser accel does nothing; the fix is a
  // *     driver install. Multiple browsers all failing is this case.
  // *   - SwiftShader / llvmpipe → a real GPU exists but the browser has hardware
  // *     acceleration turned off (or blocklisted the GPU). Browser-setting fix.
  if (isSoftwareRendererActive()) {
    const adapter = getSoftwareRendererName();
    const noDriver = /basic render|warp\b/i.test(adapter);
    const fixHtml = noDriver
      ? "Windows isn't loading a graphics driver for your GPU, so the game is running on "
        + "the CPU and will be <strong>very slow</strong>.<br><br>"
        + "<strong>To fix:</strong> update your graphics driver — Device Manager → Display "
        + "adapters → Update driver, or grab the latest from your GPU maker (NVIDIA / AMD / "
        + "Intel). If this is a remote-desktop or cloud PC, it may have no GPU at all."
      : "Your browser is drawing without GPU acceleration, so the game is running on the "
        + "CPU and will be <strong>very slow</strong>.<br><br>"
        + "<strong>To fix:</strong> turn on hardware acceleration — Settings → System → "
        + "“Use graphics acceleration when available” — then reload. If it's already "
        + "on, updating your graphics driver usually clears it.";

    const backdrop = document.createElement("div");
    backdrop.id = "cr-softgl-notice";
    backdrop.setAttribute("role", "alertdialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:20010;display:flex;align-items:center;justify-content:center;"
      + "padding:16px;background:rgba(4,2,8,0.72);backdrop-filter:blur(2px);";

    const card = document.createElement("div");
    card.style.cssText =
      "position:relative;max-width:min(92vw,480px);padding:22px 22px 20px;border:1px solid #ff2bd6;"
      + "background:rgba(12,6,20,0.97);color:#f4eaff;font:13px/1.6 'Space Mono',monospace;"
      + "border-radius:10px;box-shadow:0 0 32px rgba(255,43,214,0.45);text-align:left;";
    card.innerHTML =
      "<div style=\"font-size:15px;letter-spacing:0.04em;color:#ff2bd6;margin-bottom:10px;\">"
      + "◆ GRAPHICS RUNNING IN SOFTWARE MODE</div>"
      + "<div>" + fixHtml + "</div>"
      + "<div style=\"margin-top:14px;font-size:10px;opacity:0.5;word-break:break-word;\">"
      + "Detected adapter: " + adapter.replace(/</g, "&lt;") + "</div>";

    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "PLAY ANYWAY";
    play.style.cssText =
      "margin-top:16px;width:100%;padding:9px 12px;border:1px solid #ff2bd6;border-radius:7px;"
      + "background:rgba(255,43,214,0.14);color:#f4eaff;font:12px 'Space Mono',monospace;"
      + "letter-spacing:0.08em;cursor:pointer;";
    play.addEventListener("click", () => backdrop.remove(), { once: true });
    card.appendChild(play);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
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


  triggerCartShatterRef = triggerCartShatter;


  // * Living Cargo spill helpers (armSpillBoost / spillCountForCart) live in
  // * cargoLoad.js — wired into gameFlow/sim deps via loopDeps.attachPhaseDeps.

  const gameCtx = createGameContext().registerModules({
    Netcode,
    GameState,
    Simulation,
    Entities,
    Input,
    HUD,
  });
  const BASE_FOV = CONFIG.camera.fov;

  // * Camera-follow scratch for the reconcile-smoothed pose (non-host prediction) — the
  // * follow camera reads body pose + _reconcileVisOffset so it never sees reconcile snaps.
  const _camReconPosScratch = { x: 0, y: 0, z: 0 };
  const _camReconRotScratch = new THREE.Quaternion();
  const _camReconYawScratch = new THREE.Quaternion();
  const _camReconYAxis = new THREE.Vector3(0, 1, 0);

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
    getAllCarts: () => allCartsRef,
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

  scene.add(audioListener);

  const { composer, bloomPass, arcadePass, fxaaPass, outputPass } = createComposer(renderer, scene, camera);
  fxPass = arcadePass;
  // * MAIN-1 Lever E: cart/juice API — assigned before roundLifecycle (arrows close over this).
  /** @type {ReturnType<typeof createCartOrchestration> | null} */
  let cart = null;
  if (!bloomEnabled && bloomPass) bloomPass.enabled = false;
  if (!fxPassEnabled && fxPass) fxPass.enabled = false;
  // * URL ablation / postmin — after user toggles so disabled flags still win for QA.
  applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });

  // * MAIN-1 Lever C: LevelManagerDeps + level-load helpers live in levelOrchestration.
  level = createLevelOrchestration({
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    arcadePass,
    fxaaPass,
    outputPass,
    canvas,
    getBloomEnabled: () => bloomEnabled,
    getFxPassEnabled: () => fxPassEnabled,
    getMenuVisible: () => menuVisible,
    getAllCartsRef: () => allCartsRef,
    getHud: () => hud,
    resolveCinematicCountdownOverrides,
    prepareLevelMusic,
    startLevelMusic,
    stopAllChargeSfx: () => cart.stopAllChargeSfx(),
  });
  const {
    rebuildForQualityChange,
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
    // * SHOOT-ANIM-1: the attract loop renders but ran no updates, so level animation
    // * was frozen at its constructor value behind the menu and in every capture. This
    // * is the game loop's cosmetic block (the rave gate + the two calls above it)
    // * driven from the only loop that is actually running here.
    onAnimationTick: (timeMs) => {
      /** @type {any} */ (level.sceneExtras)?.update?.(timeMs, camera);
      level.levelUpdate?.(timeMs);
      // * SHOOT-ANIM-2: same story one block down — Classic's crowd, stage lights and
      // * LED screen sat frozen too. Deliberately NO frameBudgetAllow here: it fails
      // * CLOSED without a preceding beginFrameBudget (stale frameStartMs → negative
      // * remaining) and its allowCache is only cleared by beginFrameBudget, so the
      // * first false would latch this bucket permanently. Calling beginFrameBudget
      // * instead would have two loops writing one set of module globals, and the
      // * budget exists to protect host physics — none of which runs at the menu.
      // * Weak machines are covered here by the attract cost feed → auto-quality,
      // * which steps the tier down and flips crowdAnimate off.
      if (raveDressingWanted()) tickRaveDressing(timeMs);
      // * LOD stays on local wall time even when ?t= pins animation — levelLod's
      // * _lastUpdateMs latch is module-global with a 250ms interval, so a small
      // * pinned t would park it in the future and suppress LOD entirely. Same
      // * local-clock reasoning as LOD-CLOCK-1 at the game-loop call site.
      updateLevelLod(camera, performance.now());
    },
    // * Weak machines land at the MENU first — feed measured attract frame cost
    // * to the same session watchdog the game loop uses so they step down to a
    // * survivable tier before ever entering a round. (Frame spacing can't be
    // * used here: the attract loop throttles to ~30fps by design.)
    onRenderCost: (frameCostSec, nowMs) => {
      // * "attract" tags the feed: this is FRAME COST — animation tick plus render, not
      // * frame delta (the attract loop throttles to ~30fps) — yet both feed the same
      // * 20.5ms bar. WARM-IGPU-1 Phase 0b.
      if (tickAutoQuality(frameCostSec, nowMs, "attract")) handleAutoQualityStepDown();
    },
  });

  let devControl = null;
  // * Run-6: control levers also attach in PROD when ?diag=1 is present — Wyatt needs
  // * forceSuddenDeath/setScores on the live site to reproduce MP-only round-end bugs
  // * (still host-gated + running-round-gated inside devControl). Trade-off accepted:
  // * a player who adds ?diag=1 as quickplay host could cheat scores; revisit before
  // * any public launch.
  if (import.meta.env.DEV || diagUrlFlags().enabled) {
    try {
      const { createDevControl } = await import("./dev/devControl.js");
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
        // * SHEET-1 forceKillFeed deps. `isDev` is passed IN, not read inside devControl:
        // * vitest runs with DEV === true, so an internal read would leave the production
        // * branch untestable. It gates that one lever off in prod ?diag=1 builds.
        // * The rest are lazy getters — hud and allCartsRef are assigned later in main().
        isDev: Boolean(import.meta.env.DEV),
        getHud: () => hud,
        getAllCarts: () => allCartsRef,
        colorHexForSlot: displayColorHexForSlot,
      });
    } catch (error) {
      console.warn("[CartClashDev] Dev control levers failed to initialize:", error);
    }
  }
  if (import.meta.env.DEV) {
    try {
      const { initPostFxDebugGui } = await import("./postFxDebug.js");
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

  // * Menu bootstrap / initMenu / commitMenuHiddenForGame live in createMenuPlayEntry (Lever G).

  ({ refreshMenuStats } = createMenuStats({ getPersonalStats }));


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
    getHostStallMs: () => Netcode.getHostStallMs(),
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
    // * CHECKOUT LINE "LEAVE ROOM" rides the same teardown as the pause menu's
    // * MAIN MENU — socket close + ?room= clear live there (no second path).
    onLeaveRoom: () => gameSession.returnToMenu({ reason: "lobby-leave" }),
    // * FRIENDS-JOIN-1: only a player who TYPED a code can be told to check it. The
    // * room's creator waiting alone is the same observable state and must not see it.
    joinedViaTypedCode: () => joinedViaTypedCode,
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
      getAllCartsRef: () => allCartsRef,
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
    getFxPass: () => fxPass,
    getHud: () => hud,
    localCartForConnId,
    displayColorHexForSlot,
    displayCssColorForSlot,
    detectGameMode,
    nametagHtml,
    ramBoostStreaks,
    getWorld: () => level.world,
    getAllCartsRef: () => allCartsRef,
    setAllCartsRef: (v) => { allCartsRef = v; },
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (v) => { pendingMidRoundJoinRespawnConnId = v; },
    helloGate,
    sessionRefs,
    gameCtx,
    rewireSessionNetcodeRefs,
    updateCartMaterialsFromSlots,
    drainPendingArenaRotation: () => drainPendingArenaRotation(),
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
    testDriveSpawnForSlot,
  });
  const {
    armFovPunch,
    triggerLocalRamShake,
    triggerLocalHitTaken,
    squashCartsOnImpact,
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
  } = cart;
  triggerLocalRamShakeRef = triggerLocalRamShake;
  triggerLocalHitTakenRef = triggerLocalHitTaken;

  // * MAIN-1 Lever F: host-tab pump + loop phase deps (attachPhaseDeps later).
  const loop = createLoopDeps({
    detectGameMode,
    getGameLoopDriver: () => gameLoopDriver,
  });

  // * MAIN-1 Lever D: countdown → running → podium → rematch lives in roundLifecycle.
  const round = createRoundLifecycle({
    camera,
    gameCtx,
    syncRoundPhase,
    detectGameMode,
    teleportCartToSpawn,
    getAllCartsRef: () => allCartsRef,
    getHud: () => hud,
    getResultsUi: () => resultsUi,
    getMatchHistory: () => matchHistory,
    getIsNewPersonalBest: () => isNewPersonalBest,
    setIsNewPersonalBest: (v) => { isNewPersonalBest = v; },
    displayCssColorForSlot,
    getPersonalStats,
    recordPodiumStats,
    localCartForConnId,
    refreshHiddenHostLifecycle: () => loop.refreshHiddenHostLifecycle(),
    updateTouchControlsVisibility: () => updateTouchControlsVisibility(),
    stopAllChargeSfx,
    stopChargeSfxForCart,
    getArenaRotationInFlight: () => level.arenaRotationInFlight,
    pickNextQuickplayArenaId: () => pickNextQuickplayArenaId(),
    rotateLoadedArenaInPlace: (id) => rotateLoadedArenaInPlace(id),
    setPendingMidRoundJoinRespawnConnId: (v) => { pendingMidRoundJoinRespawnConnId = v; },
  });
  const {
    beginRoundFlyover,
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
  removePodiumSkipListeners = removePodiumSkipFromRound;
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
    detectGameMode,
    getMenuVisible: () => menuVisible,
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
    getAllCartsRef: () => allCartsRef,
    bootstrapSessionCarts,
  });

  wireMenuAudioControlsOnce();
  syncAllAudioUi();
  initMenu();


  // --- Quickplay arena rotation gens (round lifecycle; rotation impl is in levelOrchestration) ---
  /** Invalidation token for deferred non-host countdown application (see onGameStartHandler). */
  let nonHostCountdownApplyGen = 0;
  /** Cap-200: invalidation token for deferred host-MP countdown (continuous-mode seat arm). */
  let hostMpCountdownDeferGen = 0;

  window.addEventListener("cartrave:level-changed", () => {
    scheduleMenuLevelPreview();
    // * BOOT-PERF-1: retarget in-flight idle warm when the picker moves. Pre-start
    // * (still in the 1.8s delay) does not need this — runWarm reads storage at fire.
    if (
      menuVisible
      && !isWorldBootstrapped()
      && !isIdleWorldWarmSuppressed()
      && isWorldBootstrapInFlight()
    ) {
      void ensureWorldBootstrapped(resolveLevelId(storageGet(LEVEL_STORAGE_KEY)));
    }
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
          if (Array.isArray(allCartsRef)) {
            for (let i = 0; i < allCartsRef.length; i += 1) teleportCartToSpawn(i);
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
            if (menuVisible) return;
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
          }
          if (deferGen !== hostMpCountdownDeferGen) return;
          if (menuVisible) return; // quit during wait
          const phase = GameState.getRoundState().phase;
          if (phase === "running" || phase === "countdown") return;
          const now = getRoundClockNowMs();
          if (now >= starts) {
            // * Cap-200: past-start — startRunningAt(starts) anchors host clock at absolute
            // * starts (peer of non-host syncRoundPhase("running")+setRoundStartedAtMs).
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
            if (Array.isArray(allCartsRef)) {
              for (let i = 0; i < allCartsRef.length; i += 1) teleportCartToSpawn(i);
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
              if (menuVisible) return;
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
            syncRoundPhase("countdown");
          }
          GameState.setRoundStartedAtMs(0);
        };
        const now = getRoundClockNowMs();
        if (now >= startsAtLocalMs) {
          // * Cancel while we waited left phase lobby and bumped applyGen — if gen still
          // * matches we're the live arm.
          nonHostCountdownApplyPending = false;
          stampRoundEntry();
          syncRoundPhase("running");
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
    if (!localConnId || pendingMidRoundJoinRespawnConnId !== localConnId) return;
    if (GameState.getRoundState().phase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    pendingMidRoundJoinRespawnConnId = null;
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
    detectGameMode,
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
    // * MP-FX-1: netcode applyCartState remote hop-land → same onHopLand as host sim.
    onHopLand,
    // * Non-host own-death teardown (netcode processHostFallEvent) — same helper the
    // * host-side scheduleRespawn uses, so the chargeUp loop can't outlive the cart.
    stopChargeSfxForCart: (c) => cart.stopChargeSfxForCart(c),
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
      clearPodiumEndLatch();
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
      level.pendingArenaRotationLevelId = levelId;
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
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { pendingMidRoundJoinRespawnConnId = val; },
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
    // * Teardown patch — bound methods from createRoundLifecycle (Lever D).
    clearRoundCountdownTimeout,
    clearAutoContinuePodiumTimeout,
    clearPodiumRoundTimeout,
    resetSlowMo: () => { gameCtx.slowMo.active = false; },
    resetSimTiming: () => sessionRefs.resetSimTimingRef.current?.(),
    hideResultsOverlay: () => updateResultsOverlay(),
    resetLeaderHum: () => leaderHum?.setLeader?.(null),
    resetResultsOverlayKey,
    resetPodiumSessionState,
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
    // * syncRoundPhase("countdown"), so a cancel landing mid-fly-over finds no countdown
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
      syncRoundPhase("lobby");
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
    const visibleMode = detectGameMode();
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
    isMenuVisible: () => menuVisible,
    getHud: () => hud,
    leaderHum,
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
    getArcadePass: () => fxPass,
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
    getAllCartsRef: () => allCartsRef,
    getWorld: () => level.world,
    getEventQueue: () => level.eventQueue,
    getBoothColliderHandles: () => level.boothColliderHandles,
    getRecordColliderHandles: () => level.recordColliderHandles,
    getPitWallColliderHandle: () => level.pitWallColliderHandle,
    getAiAxis,
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
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

  gameLoopDriver = runGameLoop(gameCtx.loopState, {
    shouldPumpWhileHidden: loop.shouldPumpHiddenHost,
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

    // * Must advance before the level-swap early return, or FX time stalls and jumps on swap.
    fxTimer.update(now);

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

  // * Build identity banner + stale-cache guard — UNCONDITIONAL (not ?diag-gated) so every
  // * tab prints its bundle to the console and shouts if it's running an old cached bundle
  // * while a newer one is deployed. Root cause of the 07-21 "fixes never ran" playtest.
  logBuildBanner();

  // * Gameplay diagnostics hub (?diag → window.__ccDiag). Probes + event log + optional
  // * control (host-gated; wired under ?diag=1 in DEV or prod). Read surface works in prod
  // * builds; zero cost when the flag is absent. See tools/gameharness.mjs.
  if (diagUrlFlags().enabled) {
    // * Scenario levers — each reuses an existing proven production path; never a new
    // * mutation route. Run-6: also attached in prod builds under ?diag=1 (host-gated;
    // * see the devControl creation note) so live MP round-end bugs are reproducible.
    installDiagnostics({ flags: diagUrlFlags(), control: devControl });
    // * Run-7 P0: Long Task observer so multi-second host freezes attribute to a
    // * main-thread task (or empty lt[] + focus flags) on the next friend F8.
    installLongTaskProbe();
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
          arenaRotationInFlight: level.arenaRotationInFlight,
          menuVisible,
          // * Cap-200: DOM truth next to the flag — late CartRave.show() after hide left
          // * menuVisible false while #cr-root was visible (harness false green).
          crRootDisplay: (() => {
            const el = document.getElementById("cr-root");
            if (!el) return null;
            return el.style.display || getComputedStyle(el).display;
          })(),
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
    // * copies its JSON to the clipboard, downloads a .json, AND POSTs to /api/captures so both
    // * playtest machines land in one place (pull with `npm run captures:pull` — no email hop).
    // * Read-only on the game — captureBundle() never mutates state. Safe in prod under ?diag.
    // * The harness path captures on its own; automatic error/assert captures live under
    // * __ccDiag.captures() (auto path does not upload — only the intentional F8).
    const manualCapture = async (trigger) => {
      try {
        // * Re-verify loaded-vs-deployed RIGHT NOW so this F8 carries current truth, not the
        // * boot-time snapshot. If stale, shout before capturing — a bug "reproduced" on an old
        // * cached bundle is not a bug in the deployed build (07-21 root cause).
        const fresh = await refreshBuildFreshness();
        if (fresh.ok && fresh.stale) {
          console.warn(
            `%c[diag] ⚠ STALE BUNDLE — capturing anyway%c  tab=index-${fresh.loaded}.js  deployed=index-${fresh.live}.js.\n` +
              `This F8 does NOT reflect the deployed build. Hard-reload (Ctrl+Shift+R) and re-capture.`,
            "font-weight:bold;color:#f14c4c",
            "color:inherit",
          );
        }
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

        // * Optional override: ?captureLabel=run7-A-nonhost-weak (console + playtest cards).
        const labelParam = new URLSearchParams(location.search).get("captureLabel");
        const { uploadCaptureBundle } = await import("./utils/captureUpload.js");
        const up = await uploadCaptureBundle(bundle, {
          label: labelParam || undefined,
        });
        if (up.ok) {
          // eslint-disable-next-line no-console
          console.info(`[diag] capture uploaded → /api/captures id=${up.id} (pull: npm run captures:pull)`);
        } else {
          console.warn("[diag] capture upload failed:", up.error);
        }
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
    // * ANLX-ATTRACT-1: "did I actually play this round?". A mid-round joiner adopts the
    // * room's running phase from hello/MSG.round while still on the menu with no cart, so
    // * the phase transition alone booked phantom matches. Read live (allCartsRef is a
    // * mutable closure ref) and null-guard per the standing cart-access invariant.
    // * Same shape as getNetDebug's localBodyEnabled above — keep them in step.
    getLocalCartActive: () => {
      const slot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      const cart = Array.isArray(allCartsRef) ? allCartsRef[slot] : null;
      return Boolean(cart?.body && cart.body.isEnabled());
    },
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
 * Preheats physics + **selected** arena while the player sits on the main menu.
 * No-ops if play already started, world is warm, or the tab is backgrounded.
 * BOOT-PERF-1: always passes the storage selection; mid-flight picker changes
 * retarget via cartrave:level-changed → ensureWorldBootstrapped (gen-cancel).
 */
function scheduleIdleWorldWarm() {
  /** @type {number} ms — let menu music / first paint settle before WASM + arena work. */
  const IDLE_WARM_DELAY_MS = 1800;

  const runWarm = () => {
    if (!menuVisible) return;
    if (isWorldBootstrapped()) return;
    // * Solo/Quickplay already claimed the cold-load — don't start a stale-arena warm
    // * that would race and force a second full rebuild for the selected level.
    if (isIdleWorldWarmSuppressed()) return;
    const selectedId = resolveLevelId(storageGet(LEVEL_STORAGE_KEY));
    void ensureWorldBootstrapped(selectedId)
      .then(async () => {
        // * Stale flight resolved without latching done (retargeted) — join the owner.
        if (!isWorldBootstrapped()) {
          await ensureWorldBootstrapped(resolveLevelId(storageGet(LEVEL_STORAGE_KEY)));
        }
        if (!isWorldBootstrapped() || !menuVisible) return;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[bootstrap] idle world warm done (menu still open)", selectedId);
        }
        // * Level previews only run once the world exists — nudge picker if needed.
        scheduleMenuLevelPreview();
        // * Selected arena is now warm; fetch the other arena chunks in the background
        // * so the first menu arena switch never waits on a lazy import round-trip.
        // * Run-6: after the chunks land, also pre-bake the Sundial sunset env PMREM —
        // * without it the first Zanzibar browse of a session pays the equirect→cubeUV
        // * bake inside a synchronous multi-second stall (lobby longframe captures).
        void prefetchLevelChunks().then(async () => {
          if (!menuVisible || !idleWarmRenderer) return;
          try {
            const { warmSunsetEnv } = await import("./levels/zanzibarPlatform.js");
            warmSunsetEnv(idleWarmRenderer);
          } catch { /* warm-only — play entry bakes it lazily as before */ }
        });
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
