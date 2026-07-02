// === IMPORTS ===

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
import "./cart-rave-menu.css";
import * as THREE from "three";
import { createRenderer, createScene, createComposer, setupSceneEnvironment, refreshSceneEnvironmentMaterials, setSceneFog, applyBloomSettings, applyComposerQualityMode, updateViewport as updateSceneViewport } from "./scene.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { updateCartVisuals } from "./cart.js";
import * as Visuals from "./visuals.js";
import { prefetchRaveGltf } from "./cartRaveGltf.js";
import * as Simulation from "./simulation.js";
import * as Entities from "./entities.js";
import { triggerCartShatter } from "./cartShatter.js";
import * as HUD from "./hud.js";
import * as Input from "./input.js";
import * as Netcode from "./netcode.js";
import * as GameState from "./gameState.js";
import * as GameAudio from "./audio.js";
import * as AudioManager from "./audioManager.js";
import * as CameraMod from "./camera.js";
import * as Effects from "./effects.js";
import { loadLevel, resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
// * testArena constants inlined (avoid static import of heavy level module at boot).
const TEST_ARENA_SKY = 0x586274;
const TEST_ARENA_FOG_DENSITY = 0.0032;
import { setContactShadowHazards } from "./contactShadows.js";
import { initSceneExtras, disposeSceneExtras } from "./sceneExtras.js";
import { initAudioSystem } from "./audioSetup.js";
import { initResultsOverlay, animateResultsPodiumShow, cancelResultsAnimations } from "./ui/resultsOverlay.js";
import { showRotatePromptIfNeeded } from "./ui/rotatePrompt.js";
import {
  dismissAllLoadingOverlays,
  dismissInitialBootSplash,
  initLoadingScreen,
  revealGameCanvas,
  showQualityApplyLoading,
  yieldForPaint,
} from "./ui/loadingScreen.js";
import {
  cancelMenuPreviewTimers,
  finalizeArenaForPlayEntry,
  getCurrentLevelId,
  getLevelRebuildPromise,
  getMenuLevelPreviewPromise,
  getMenuPreviewNeedsFinalize,
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
  isWorldBootstrapped,
  resetSessionCartBootstrap,
} from "./bootstrap.js";
import { animateCartBoostPulse, crossfadeElement, animateMuteToggle, animateVolumeTick } from "./animations.js";
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
import { cleanupSuddenDeathState } from "./gameFlow.js";
import { createGameContext } from "./gameContext.js";
import {
  buildNetcodeGameBridge,
  createGameSessionController,
  createHelloGate,
  createSessionBridgeRefs,
} from "./gameSession.js";
import {
  clamp,
  isLowQualityMode,
  isTouchDevice,
} from "./utils.js";
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
  try {
    const raw = localStorage.getItem("cartRaveStats");
    if (!raw) return { wins: 0, matches: 0, totalPoints: 0, soloGames: 0 };
    const parsed = JSON.parse(raw);
    return {
      wins: Number(parsed.wins) || 0,
      matches: Number(parsed.matches) || 0,
      totalPoints: Number(parsed.totalPoints) || 0,
      soloGames: Number(parsed.soloGames) || 0,
    };
  } catch {
    return { wins: 0, matches: 0, totalPoints: 0, soloGames: 0 };
  }
}

function savePersonalStats(stats) {
  try {
    localStorage.setItem("cartRaveStats", JSON.stringify(stats));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

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
    winnerSlotIndex: winnerSlotIndex === "draw" ? "draw" : Number.isFinite(winnerSlotIndex) ? winnerSlotIndex : 0,
    scores,
    mode: detectGameMode(),
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
      stats.matches += 1;
      stats.totalPoints += scores[mySlotIdx] || 0;
      if (winnerSlotIndex === mySlotIdx) stats.wins += 1;
      savePersonalStats(stats);
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
  try {
    Simulation.setRoundPhase(phase);
  } catch (e) {}
}
/** @type {((msg: object) => void) | null} */
let onGameStartHandler = null;
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
let menuAudioControlsWired = false;
let menuNameSyncWired = false;
let quickplayAutoRejoinAttempted = false;
/** @type {boolean} */
let menuVisible = true;
/** @type {boolean | null} */
let lastTouchControlsVisible = null;
let bloomEnabled = true;
try {
  const saved = localStorage.getItem("cartRaveBloom");
  if (saved === "off") bloomEnabled = false;
} catch {}
let fxPassEnabled = true;
try {
  const s = localStorage.getItem("cartRaveFx");
  if (s === "off") fxPassEnabled = false;
} catch {}
/** @type {ShaderPass | null} */
let fxPass = null;
/** @type {number} */
const AUDIO_VOLUME_MAX = 1.15;
const AUDIO_VOLUME_DEFAULT = 0.5 * AUDIO_VOLUME_MAX;
let musicVolume = AUDIO_VOLUME_DEFAULT;
/** @type {number} */
let sfxVolume = AUDIO_VOLUME_DEFAULT;
/** @type {null | { setLeader: (slotIndex: number|null) => void; updatePositionFromCart: (cart: any) => void; resyncVolume: () => void }} */
let leaderHum = null;
try {
  const savedVol = localStorage.getItem("cartRaveVolume");
  if (savedVol !== null) {
    const parsedVol = parseInt(savedVol, 10);
    musicVolume = Number.isNaN(parsedVol)
      ? AUDIO_VOLUME_DEFAULT
      : clamp((parsedVol / 100) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
  }
} catch {}
try {
  const savedSfxVol = localStorage.getItem("cartRaveSfxVol");
  if (savedSfxVol !== null) {
    const parsedSfxVol = parseInt(savedSfxVol, 10);
    sfxVolume = Number.isNaN(parsedSfxVol)
      ? AUDIO_VOLUME_DEFAULT
      : clamp((parsedSfxVol / 100) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
  }
} catch {}
/** @type {boolean} */
let isMuted = false;
try {
  if (localStorage.getItem("cartRaveMuted") === "true") isMuted = true;
} catch {}

/**
 * In-memory match results for the session (resets on full page reload). Not rendered until the results overlay is wired.
 * @type {{ endedAtMs: number, winnerSlotIndex: number | "draw", scores: Record<number, number>, mode?: "solo" | "quickplay" | "friends" }[]}
 */
let matchHistory = [];

/** @type {ReturnType<typeof setTimeout> | null} */
let roundPodiumTimeoutId = null;
const LAST_CART_STANDING_FLOURISH_MS = 3000;
/** @type {ReturnType<typeof setTimeout> | null} */
let autoContinuePodiumTimeoutId = null;
/** @type {string | null} */
let autoContinuePodiumKey = null;

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
/** @type {((position: { x: number; y: number; z: number }, intensity: number) => void) | null} */
let spawnTrashBurstRef = null;
/** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
let triggerLocalRamShakeRef = null;
/** @type {((cart: object, scene: object, neonHex: number) => void) | null} */
let triggerCartShatterRef = null;
/** @type {string | null} */
let pendingMidRoundJoinRespawnConnId = null;

function updateCartMaterialsFromSlots(slots) {
  if (!allCartsRef || !Array.isArray(slots)) return;

  const youConnId = Netcode.getYouConnId();

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const cart = allCartsRef[slotIndex];
    if (!slot || !cart?.mesh) continue;

    const finalHex = displayColorHexForSlot(slot);
    const themeId = cart.cartThemeId
      ?? resolveCartThemeForSlot(slot, { youConnId });
    const cache = cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh));

    applyThemeColorToCache(cache, themeId, finalHex);

    const theme = getCartTheme(themeId);
    if (theme.patternPolicy !== "disable") {
      applyCartPattern(
        cart.mesh,
        resolveCartPatternForSlot(slot, { youConnId }),
        finalHex,
      );
    }

    cart.cartColor = finalHex;
  }
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
  initLoadingScreen();
  // * Dismiss boot splash before scene init — initMenu() may return early on ?room= URLs.
  // * Rapier WASM init is deferred until play/arena need (see ensureRapierPhysics).
  void dismissInitialBootSplash();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
  loadPlayerCustomization();
  wireCustomizationStorageSync();

  // * Begin cartrave4.glb fetch immediately so rave carts are ready before first spawn.
  void prefetchRaveGltf().catch((err) => {
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
  // * camera.add(audioListener) happens after camera creation below.
  const audioListener = new THREE.AudioListener();

  // * Start music loading immediately via Howler — before scene/composer init blocks the main thread.
  AudioManager.initAudioManager(audioListener.context);

  // * Restore saved volume state (loaded from localStorage at module scope above).
  AudioManager.restoreVolumeState({
    master: musicVolume / AUDIO_VOLUME_MAX,
    sfx: sfxVolume / AUDIO_VOLUME_MAX,
    music: musicVolume / AUDIO_VOLUME_MAX,
    muted: isMuted,
  });

  AudioManager.loadMenuMusic(
    new URL("sounds/menu.ogg", window.location.href).toString(),
  );

  const gameMusicFiles = ["music.ogg", "song2.ogg", "song3.ogg", "song4.ogg"];
  const _gameMusicUrls = gameMusicFiles.map((f) =>
    new URL(`sounds/${f}`, window.location.href).toString(),
  );
  // Shuffle game playlist
  for (let i = _gameMusicUrls.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [_gameMusicUrls[i], _gameMusicUrls[j]] = [_gameMusicUrls[j], _gameMusicUrls[i]];
  }
  AudioManager.loadGamePlaylist(_gameMusicUrls);

  if (menuVisible) AudioManager.playMenuMusic();

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
      if (HUD.isEscOverlayVisible()) {
        HUD.hideEscOverlay();
      } else {
        HUD.showEscOverlay();
      }
    },
    () => {
      setAllAudioMuted(!isMuted);
    },
    () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      triggerHop(localCartForConnId(), performance.now());
      Input.requestHop();
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
      triggerHop(localCartForConnId(), performance.now());
      Input.requestHop();
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


  let shakeUntil = 0;
  let shakeIntensity = 0;
  let fovPunchUntil = 0;
  function triggerLocalRamShake(intensity, isBoosting = false) {
    const fx = CONFIG.ramming?.fx ?? {};
    const minI = isBoosting
      ? (fx.shakeBoostMinIntensity ?? 0.24)
      : (fx.shakeMinIntensity ?? 0.38);
    if (intensity < minI) return;
    const clampedI = Math.min(intensity, 1.2);
    const boostMul = isBoosting ? 1.3 : 1.0;
    shakeIntensity = clampedI * (fx.shakePixelScale ?? 5.5) * boostMul;
    shakeUntil = performance.now() + 150 + clampedI * 100;
    if (clampedI >= 0.45 && isBoosting) {
      fovPunchUntil = performance.now() + 100;
    }
  }
  triggerLocalRamShakeRef = triggerLocalRamShake;
  triggerCartShatterRef = triggerCartShatter;
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
    getSfxVolume: () => sfxVolume,
    getIsMuted: () => isMuted,
  });
  if (!leaderHum) leaderHum = audioSystem.leaderHum;
  GameAudio.registerAudioRefs({ leaderHum });

  // * Register all SFX via Howler (pooled, spatial-ready).
  const soundsRoot = (name) => new URL(`sounds/${name}`, window.location.href).toString();
  AudioManager.registerSfx("cartCrash", soundsRoot("cart-crash.ogg"), { pool: 4 });
  AudioManager.registerSfx("death", soundsRoot("Death.ogg"), { pool: 3 });
  AudioManager.registerSfx("boost", soundsRoot("Boost.ogg"), { pool: 3 });
  AudioManager.registerSfx("hop", soundsRoot("Hop.ogg"), { pool: 3 });
  // * Dynamic wheel loop — continuous engine sound scaled by cart speed.
  AudioManager.initWheelLoop(soundsRoot("Wheel_loop.ogg"));
  AudioManager.registerSfx("floor", soundsRoot("Floor.ogg"), { pool: 3 });
  AudioManager.registerSfx("chargeUp", soundsRoot("Charge_up.ogg"), { pool: 2, loop: true });
  AudioManager.registerSfx("countdown_3", soundsRoot("countdown_3.ogg"), { pool: 1 });
  AudioManager.registerSfx("countdown_2", soundsRoot("countdown_2.ogg"), { pool: 1 });
  AudioManager.registerSfx("countdown_1", soundsRoot("countdown_1.ogg"), { pool: 1 });
  AudioManager.registerSfx("countdown_go", soundsRoot("countdown_go.ogg"), { pool: 1 });

  camera.add(audioListener);

  const { composer, bloomPass, arcadePass, fxaaPass } = createComposer(renderer, scene, camera);
  fxPass = arcadePass;
  if (!bloomEnabled && bloomPass) bloomPass.enabled = false;
  if (!fxPassEnabled && fxPass) fxPass.enabled = false;

  if (import.meta.env.DEV) {
    import("./postFxDebug.js").then(({ initPostFxDebugGui }) => {
      initPostFxDebugGui({
        renderer, scene, bloomPass, arcadePass, fxaaPass,
        suddenDeathTest: () => {
          if (!Netcode.getIsHost()) return;
          // * Find player slot (human) and a different NPC slot.
          const slots = Netcode.getNetSlots();
          const localIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
          let npcIdx = -1;
          for (let i = 0; i < 4; i += 1) {
            if (i !== localIdx && slots[i]?.kind === "npc") {
              npcIdx = i;
              break;
            }
          }
          // * Fallback: if no NPC found (e.g. 2 humans), pick any other slot.
          if (npcIdx < 0) {
            for (let i = 0; i < 4; i += 1) {
              if (i !== localIdx) { npcIdx = i; break; }
            }
          }
          if (localIdx < 0 || npcIdx < 0) return;
          // * Set player and NPC to 2 points, everyone else to 0.
          const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
          scores[localIdx] = 2;
          scores[npcIdx] = 2;
          GameState.setRoundScores(scores);
          // * Rewind round timer so only ~10s remain.
          GameState.setRoundStartedAtMs(Date.now() - (CONFIG.round.durationMs - 10000));
          // * Do NOT set isSuddenDeath — let the 60s round timer expire naturally
          // * and trigger the gameFlow.js tie → Sudden Death flow.
          Netcode.sendHostRound();
        },
      });
    }).catch(() => {});
  }

  const fxClock = new THREE.Clock();

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "fixed";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  labelRenderer.domElement.style.zIndex = "20020";
  labelRenderer.domElement.style.display = menuVisible ? "none" : "block";
  document.body.appendChild(labelRenderer.domElement);

  CameraMod.initCameraFollow(camera, CONFIG.camera);

  const cartLinvelScratch = new THREE.Vector3();
  const cartAngvelScratch = new THREE.Vector3();
  const netTargetPosScratch = new THREE.Vector3();
  const boothNeonColor1 = new THREE.Color(CONFIG.booth.neonColor1);
  const boothNeonColor2 = new THREE.Color(CONFIG.booth.neonColor2);
  const boothNeonMixed = new THREE.Color();
  const fpsState = {
    frames: 0,
    last: performance.now(),
    get canvas() { return fpsCanvas2d; },
    set canvas(v) { fpsCanvas2d = v; },
    get ctx() { return fpsCtx2d; },
    set ctx(v) { fpsCtx2d = v; },
  };

  function updateCameraFraming() {
    const aspect = window.innerWidth / window.innerHeight;
    const portraitBoost = (1 / Math.max(0.5, aspect)) - 1;
    const wideBoost = Math.max(0, aspect - 1.8);
    const fov =
      CONFIG.camera.fov +
      portraitBoost * 18 +
      wideBoost * 7;
    camera.fov = clamp(fov, CONFIG.camera.minFov, CONFIG.camera.maxFov);
    camera.userData.baseFov = camera.fov;
  }

  function updateViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    updateSceneViewport(renderer, camera, composer, arcadePass, fxaaPass);
    labelRenderer.setSize(w, h);
    updateCameraFraming();
    if (fpsCanvas2d) {
      fpsCanvas2d.style.position = "fixed";
      fpsCanvas2d.style.bottom = "8px";
      fpsCanvas2d.style.left = "10px";
    }
  }

  updateViewport();

  // --- HUD, menu, results overlay ---
  function syncAllAudioUi() {
    const musicPct = Math.round((musicVolume / AUDIO_VOLUME_MAX) * 100);
    const sfxPct = Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100);
    window.CartRave?.syncAudioUi?.({
      muted: isMuted,
      musicPct,
      musicNorm: musicVolume / AUDIO_VOLUME_MAX,
      sfxPct,
      sfxNorm: sfxVolume / AUDIO_VOLUME_MAX,
    });
    if (hud?.syncAudioControls) hud.syncAudioControls();
    // * Keep Three.js listener gain in sync (procedural SFX uses audioListener.gain).
    if (audioListener && typeof audioListener.setMasterVolume === "function") {
      audioListener.setMasterVolume(isMuted ? 0 : sfxVolume);
    }
    try { leaderHum?.resyncVolume?.(); } catch (e) {}
  }

  function setMusicGainValue(val) {
    musicVolume = clamp(val, 0, AUDIO_VOLUME_MAX);
    AudioManager.setMusicVolume(musicVolume / AUDIO_VOLUME_MAX);
    localStorage.setItem(
      "cartRaveVolume",
      Math.round((musicVolume / AUDIO_VOLUME_MAX) * 100).toString(),
    );
    syncAllAudioUi();
  }

  function setAllAudioMuted(muted) {
    isMuted = Boolean(muted);
    AudioManager.setMuted(isMuted);
    localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false");
    syncAllAudioUi();
  }

  function setSfxSliderVolume(v) {
    sfxVolume = clamp(v, 0, AUDIO_VOLUME_MAX);
    AudioManager.setSfxVolume(sfxVolume / AUDIO_VOLUME_MAX);
    localStorage.setItem(
      "cartRaveSfxVol",
      Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100).toString(),
    );
    syncAllAudioUi();
  }

  function wireMenuAudioControlsOnce() {
    if (menuAudioControlsWired) return;
    menuAudioControlsWired = true;

    const crMuteBtn = document.getElementById("cr-mute-btn");
    const crMusicVolTrack = document.getElementById("cr-music-vol-track");
    const crMusicVolVal = document.getElementById("cr-music-vol-val");

    if (crMuteBtn) {
      crMuteBtn.addEventListener("click", () => {
        setAllAudioMuted(!isMuted);
        animateMuteToggle(crMuteBtn);
      });
    }
    if (crMusicVolTrack) {
      crMusicVolTrack.addEventListener("click", (e) => {
        const r = crMusicVolTrack.getBoundingClientRect();
        const v = clamp(((e.clientX - r.left) / r.width) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
        setMusicGainValue(v);
        if (crMusicVolVal) animateVolumeTick(crMusicVolVal);
      });
    }
  }

  /** Wired after clearAutoContinuePodiumTimeout is defined in main(). */
  const podiumAutoContinue = { clear: () => {} };

  function onMenuBootstrapError(mode, err) {
    console.error(`[menu] ${mode} bootstrap failed:`, err);
    dismissAllLoadingOverlays();
  }

  function bootstrapNetcodeFromMenu(mode, roomOverride) {
    try {
      Netcode.initNetcode(roomOverride);
    } catch (err) {
      onMenuBootstrapError(mode, err);
    }
  }

  function initMenu() {
    menuVisible = true;
    syncAllAudioUi();
    // * Always dismiss boot splash first — solo/quickplay paths return early below.
    void dismissInitialBootSplash();
    updateTouchControlsVisibility();
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) HUD.hideAudioWidget();
    if (hud) {
      if (hud.timer) hud.timer.style.display = "none";
      if (hud.scores) hud.scores.style.display = "none";
      if (hud.readyBtn) hud.readyBtn.style.display = "none";
      if (hud.status) hud.status.style.display = "none";
    }
    const feed = (hud && hud.feed) || document.querySelector(".hud-feed");
    if (feed) {
      feed.style.display = "none";
      while (feed.firstChild) feed.removeChild(feed.firstChild);
    }
    // Stop game music before menu music starts.
    try { AudioManager.stopGameMusic(); } catch (e) {}
    try { AudioManager.playMenuMusic(); } catch (e) {}
    const wrap = document.getElementById("cr-root");
    if (wrap) {
      window.CartRave?.revealShell?.();
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

    const room = Netcode.resolvedPartyRoomFromUrl();
    if (room && room.toLowerCase().startsWith("testdrive")) {
      void enterPlayMode({ gameMode: "testdrive", levelId: "testArena" })
        .then(() => {
          showRotatePromptIfNeeded();
          bootstrapNetcodeFromMenu("Test Drive");
        })
        .catch((err) => onMenuBootstrapError("Test Drive", err));
      return;
    }

    if (room && room.toLowerCase().startsWith("solo")) {
      void enterPlayMode({ gameMode: "solo" })
        .then(() => {
          showRotatePromptIfNeeded();
          bootstrapNetcodeFromMenu("Solo");
        })
        .catch((err) => onMenuBootstrapError("Solo", err));
      return;
    }

    // * Returning visitor refreshing ?room=quickplay — auto-rejoin once per page load.
    const savedUsername = (localStorage.getItem("cartRaveUsername") || "").trim();
    const roomParam = new URLSearchParams(window.location.search || "").get("room");
    if (roomParam === "quickplay" && savedUsername && !quickplayAutoRejoinAttempted) {
      quickplayAutoRejoinAttempted = true;
      void enterPlayMode({ gameMode: "quickplay", commitMenuHidden: false })
        .then(() => bootstrapNetcodeFromMenu("Quickplay"))
        .catch((err) => onMenuBootstrapError("Quickplay", err));
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
          '<span class="cr-btn-inner"><span class="cr-btn-label">JOIN ROOM</span></span>' +
          '<span class="cr-btn-corner tl"></span><span class="cr-btn-corner tr"></span>' +
          '<span class="cr-btn-corner bl"></span><span class="cr-btn-corner br"></span>';
        btnRow.insertBefore(btn, btnRow.firstChild);
        const refGlow = btnRow.querySelector('.cr-btn[data-action="quickplay"]');
        if (refGlow) {
          const g = getComputedStyle(refGlow).getPropertyValue("--glow").trim();
          if (g) btn.style.setProperty("--glow", g);
        }
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
        void enterPlayMode({ gameMode: "friends", commitMenuHidden: false })
          .then(() => bootstrapNetcodeFromMenu("Friends", room))
          .catch((err) => onMenuBootstrapError("Friends", err));
        return;
      }
      pendingInviteRoomFromUrl = null;
      document.getElementById("cr-btn-join-invite")?.remove();
      if (action === "solo") {
        const roomId = `solo${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void enterPlayMode({ gameMode: "solo" })
          .then(() => bootstrapNetcodeFromMenu("Solo"))
          .catch((err) => onMenuBootstrapError("Solo", err));
      } else if (action === "testdrive") {
        const roomId = `testdrive${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void enterPlayMode({ gameMode: "testdrive", levelId: "testArena" })
          .then(() => bootstrapNetcodeFromMenu("Test Drive"))
          .catch((err) => onMenuBootstrapError("Test Drive", err));
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        void enterPlayMode({ gameMode: "quickplay", commitMenuHidden: false })
          .then(() => bootstrapNetcodeFromMenu("Quickplay"))
          .catch((err) => onMenuBootstrapError("Quickplay", err));
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
        if (friendsScreen) friendsScreen.style.display = "flex";

        if (friendsCopy) {
          friendsCopy.onclick = () => {
            navigator.clipboard.writeText(roomLink).catch(() => {});
            friendsCopy.textContent = "COPIED!";
            setTimeout(() => { friendsCopy.textContent = "COPY"; }, 1500);
          };
        }
        if (friendsEnter) {
          friendsEnter.onclick = () => {
            friendsScreen.style.display = "none";
            void enterPlayMode({ gameMode: "friends", commitMenuHidden: false })
              .then(() => bootstrapNetcodeFromMenu("Friends"))
              .catch((err) => onMenuBootstrapError("Friends", err));
          };
        }
        if (friendsBack) {
          friendsBack.onclick = () => {
            friendsScreen.style.display = "none";
            window.CartRave?.show?.();
            refreshMenuStats();
            // Clear the room param
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("room");
            history.pushState({}, "", cleanUrl);
          };
        }
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
        const saved = localStorage.getItem("cartRaveUsername");
        if (saved) crNameText.textContent = saved;

        const nameObs = new MutationObserver(() => {
          const name = crNameText.textContent.trim();
          if (name) localStorage.setItem("cartRaveUsername", name);
        });
        nameObs.observe(crNameText, { childList: true, characterData: true, subtree: true });
      }

      const crNameInput = document.getElementById("cr-name-input");
      if (crNameInput) {
        crNameInput.addEventListener("blur", () => {
          const name = crNameInput.value.trim();
          if (name) localStorage.setItem("cartRaveUsername", name);
        });
      }
    }

    if (window.__cartRaveBootstrapped) {
      enableModeMenuButtons();
    }
  }

  function commitMenuHiddenForGame() {
    window.CartRave?.stopAnimations?.();
    window.CartRave?.hide?.();
    menuVisible = false;
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
      AudioManager.playGameMusic();
    }
  }

  function refreshMenuStats() {
    const ps = getPersonalStats();
    const winsEl = document.getElementById("stat-wins");
    const playedEl = document.getElementById("stat-played");
    const ptsEl = document.getElementById("stat-pts");
    const soloEl = document.getElementById("stat-solo");
    if (winsEl) winsEl.textContent = ps.wins;
    if (playedEl) playedEl.textContent = ps.matches;
    if (ptsEl) ptsEl.textContent = ps.totalPoints.toLocaleString();
    if (soloEl) soloEl.textContent = ps.soloGames;
  }


  /**
   * Toggles visual quality settings in-place without touching the Rapier physics world.
   * Reflector, post-processing, rave extras, and renderer pixel ratio are all toggled
   * synchronously — no WASM world teardown / rebuild required.
   * @returns {Promise<void>}
   */
  async function rebuildForQualityChange() {
    await yieldForPaint();

    const lowQuality = isLowQualityMode();

    // * Physics: update substep cap to match the new quality tier.
    CONFIG.physics.maxSubsteps = lowQuality ? 2 : 4;

    // * Post-processing: toggle bloom + arcade passes and update renderer pixel ratio.
    applyComposerQualityMode(bloomPass, arcadePass, fxaaPass, renderer, lowQuality);

    // * Arena visuals: toggle the reflective floor vs. opaque solid floor.
    if (typeof setReflectorVisible === "function") {
      setReflectorVisible(!lowQuality);
    }

    // * Rave extras: show crowd, stage, lasers, and billboard only in high quality
    // * on levels that support them (Classic Record; Backrooms hides them already).
    const wantsExtras = levelUsesRaveExtras() && !lowQuality;
    Effects.setRaveExtrasVisible(wantsExtras);

    // * Crowd size: toggle GPU draw count (800 vs 5000) without re-allocating.
    Effects.setQualityCrowdCount(lowQuality);

    // * Scene extras (skybox, planets, spotlights): always created, toggled here.
    if (sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) {
        root.visible = wantsExtras;
      }
    }
  }

  hud = HUD.init({
    getIsMuted: () => isMuted,
    setIsMuted: (val) => { setAllAudioMuted(val); },
    getMusicGain: () => musicVolume,
    setMusicGain: setMusicGainValue,
    getSfxVolume: () => sfxVolume,
    setSfxVolume: setSfxSliderVolume,
    getAudioVolumeMax: () => AUDIO_VOLUME_MAX,
    getAudioVolumeDefault: () => AUDIO_VOLUME_DEFAULT,
    getBloomEnabled: () => bloomEnabled,
    setBloomEnabled: (val) => {
      bloomEnabled = val;
      try { localStorage.setItem("cartRaveBloom", val ? "on" : "off"); } catch (e) {}
    },
    getFxPassEnabled: () => fxPassEnabled,
    setFxPassEnabled: (val) => {
      fxPassEnabled = val;
      try { localStorage.setItem("cartRaveFx", val ? "on" : "off"); } catch (e) {}
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
    getCountdownMs: () => 3000,
    getIsTouchDevice: isTouchDevice,
    onEscOverlayChange: (open) => {
      if (open) {
        Input.setTouchControlsVisible(false);
      } else {
        updateTouchControlsVisibility();
      }
    },
    onQuitToMenu: () => gameSession.returnToMenu({ reason: "esc" }),
    onLowQualityToggle: async (_next) => {
      // * Close Esc overlay first so it doesn't persist across the rebuild.
      HUD.hideEscOverlay();
      // * Show loading overlay with quality-apply copy, then rebuild in-place.
      showQualityApplyLoading();
      await yieldForPaint();
      try {
        await rebuildForQualityChange();
      } catch (err) {
        console.error("[CartRave] quality rebuild failed:", err);
      }
      dismissAllLoadingOverlays();
    },
  });
  const resultsUi = initResultsOverlay({
    onMainMenuClick: () => {
      podiumAutoContinue.clear();
      gameSession.returnToMenu({ reason: "results" });
    },
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
    crossfadeElement,
    getCanvas: () => canvas,
  });

  initBootstrap({
    detectGameMode,
    getMenuVisible: () => menuVisible,
    commitMenuHiddenForGame,
    getLoadedLevelId: getCurrentLevelId,
    getSelectedLevelId: () => resolveLevelId(localStorage.getItem(LEVEL_STORAGE_KEY)),
    cancelMenuPreviewTimers,
    getMenuLevelPreviewPromise,
    getLevelRebuildPromise,
    getMenuPreviewNeedsFinalize,
    rebuildLevelIfNeeded: (levelId, onProgress) => rebuildLevelIfNeeded(levelId, onProgress),
    finalizeArenaForPlay: finalizeArenaForPlayEntry,
    ensureRapierPhysics: () => ensureRapierPhysics(),
    bootstrapWorldCore: (levelIdOverride) => bootstrapWorldCore(levelIdOverride),
    getHelloGate: () => helloGate,
    getAllCartsRef: () => allCartsRef,
    bootstrapSessionCarts,
  });

  wireMenuAudioControlsOnce();
  syncAllAudioUi();
  initMenu();

  // --- Arena, physics — Rapier WASM + level mesh deferred until play or idle preload ---
  scene.add(new THREE.AmbientLight(0x221133, 0.15));

  let rapierInitDone = false;
  /** @type {Promise<void> | null} */
  let rapierInitPromise = null;
  /** @type {import("@dimforge/rapier3d-compat").World | null} */
  let world = null;
  /** @type {import("@dimforge/rapier3d-compat").EventQueue | null} */
  let eventQueue = null;

  /**
   * Loads Rapier WASM and creates the physics world on first need (not at menu load).
   * @returns {Promise<void>}
   */
  function ensureRapierPhysics() {
    if (rapierInitDone) return Promise.resolve();
    if (!rapierInitPromise) {
      rapierInitPromise = RAPIER.init()
        .then(() => {
          if (!world) {
            world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
            eventQueue = new RAPIER.EventQueue(true);
          }
          rapierInitDone = true;
        })
        .catch((err) => {
          rapierInitPromise = null;
          throw err;
        });
    }
    return rapierInitPromise;
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
  let raveVisualsInitialized = false;
  let sceneEnvironmentDispose = null;
  /** @type {typeof CONFIG.postFx.bloom | null} Saved bloom tuning when entering test drive. */
  let testDriveBloomSaved = null;

  function applyTestDrivePostFx() {
    if (!bloomPass || !bloomEnabled) return;
    if (!testDriveBloomSaved) {
      testDriveBloomSaved = { ...CONFIG.postFx.bloom };
    }
    applyBloomSettings(bloomPass, {
      ...CONFIG.postFx.bloom,
      strength: 0.28,
      threshold: 0.94,
    });
  }

  function restoreTestDrivePostFx() {
    if (!testDriveBloomSaved || !bloomPass) return;
    applyBloomSettings(bloomPass, testDriveBloomSaved);
    testDriveBloomSaved = null;
  }

  function levelUsesRaveExtras(levelId) {
    const id = levelId ?? getCurrentLevelId();
    return id !== "backrooms" && id !== "testArena";
  }

  function applyLoadedLevelSideEffects(levelId) {
    const resolved = levelId ?? getCurrentLevelId();
    Simulation.setLevelHazards(levelHazards ?? null);
    setContactShadowHazards(levelHazards ?? null);
    if (resolved === "testArena") {
      Effects.clearAmbientDust();
      setSceneFog(scene, renderer, { color: TEST_ARENA_SKY, density: TEST_ARENA_FOG_DENSITY });
      applyTestDrivePostFx();
    } else {
      restoreTestDrivePostFx();
      Effects.setAmbientDustStyle(
        resolved === "backrooms" ? "backrooms" : "rainbow",
        CART_COLORS,
      );
      if (resolved === "backrooms") {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.backrooms.color,
          density: CONFIG.postFx.fog.backrooms.density,
        });
      } else {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.color,
          density: CONFIG.postFx.fog.density,
        });
      }
    }
  }

  function initDeferredRaveVisuals() {
    const wantRaveExtras = levelUsesRaveExtras();
    disposeSceneExtras(sceneExtras);
    sceneExtras = initSceneExtras(scene, pitInnerRadius, { enabled: wantRaveExtras });
    // * Scene extras (skybox/planets/spotlights) always created — hide in low quality.
    const showSceneExtras = wantRaveExtras && !isLowQualityMode();
    if (sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) root.visible = showSceneExtras;
    }
    if (wantRaveExtras && !raveVisualsInitialized) {
      Effects.initCrowd(scene, CART_COLORS, pitInnerRadius);
      Effects.initStage(scene, pitInnerRadius, CART_COLORS);
      Effects.initBillboard(scene, pitInnerRadius);
      Effects.initLasers(scene, pitInnerRadius, CART_COLORS);
      raveVisualsInitialized = true;
    }
    Effects.setRaveExtrasVisible(showSceneExtras);
  }

  function scheduleReflectorUpgrade() {
    if (!upgradeRecordReflector) return;
    const run = () => {
      try { upgradeRecordReflector(); } catch (e) {}
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 8000 });
    } else {
      setTimeout(run, 2000);
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

  /**
   * Loads level meshes/colliders into the live scene (called by levelManager).
   * @param {string} selected Resolved level id.
   * @param {{ menuPreview: boolean, reflectorTextureSize: number, onProgress?: (pct: number, label: string) => void }} opts
   */
  async function commitLevelLoad(selected, opts) {
    if (typeof disposeLevel === "function") disposeLevel();
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
    } = await loadLevel(selected, scene, world, CONFIG, {
      reflectorTextureSize: opts.reflectorTextureSize,
      onProgress: opts.onProgress,
    }));

    // * Normalize: arena.js returns recordColliderHandles (compound ring); other levels return a single recordCollider.
    if (ringHandles) {
      recordColliderHandles = ringHandles;
    } else if (recordCollider) {
      recordColliderHandles = [recordCollider.handle];
    }
    applyLoadedLevelSideEffects(selected);
  }

  async function bootstrapWorldCore(levelIdOverride) {
    if (!sceneEnvironmentDispose) {
      sceneEnvironmentDispose = setupSceneEnvironment(renderer, scene);
      await yieldForPaint();
    }
    await swapLoadedLevel(
      resolveLevelId(levelIdOverride ?? localStorage.getItem(LEVEL_STORAGE_KEY)),
    );
    await yieldForPaint();
  }

  window.addEventListener("cartrave:level-changed", () => {
    scheduleMenuLevelPreview();
  });

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * Round start/countdown handlers live here; initNetcode invokes them via callbacks.
  onGameStartHandler = (msg) => {
    if (menuVisible) enterPlayMode({ skipBootstrap: true });
    showRotatePromptIfNeeded();
    if (detectGameMode() === "testdrive") {
      if (Netcode.getIsHost()) {
        startRunningAt(Date.now());
      } else {
        syncRoundPhase("running");
        GameState.setRoundStartedAtMs(Date.now());
        GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
        GameState.setRoundWinnerSlotIndex(null);
        CameraMod.endCinematicCountdown(camera);
      }
      return;
    }
    const serverStartsAtMs = Number(msg?.startsAtMs);
    const startsAtLocalMs = Number.isFinite(serverStartsAtMs)
      ? serverStartsAtMs + Netcode.getServerClockOffsetMs()
      : Date.now() + 3000;
    if (Netcode.getIsHost()) {
      startCountdown(startsAtLocalMs);
    } else if (GameState.getRoundState().phase !== "running") {
      syncRoundPhase("countdown");
      GameState.setRoundCountdownStartedAtMs(startsAtLocalMs - 3000);
      GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
      GameState.setRoundWinnerSlotIndex(null);
      GameState.setRoundStartedAtMs(0);
      CameraMod.beginCinematicCountdown(camera);
    }
  };

  let lastResultsOverlayKey = null;

  function updateResultsOverlay() {
    if (!resultsUi) return;
    const { overlay, panel, title, finalScores, history, playAgain, statsLine, mainMenuBtn } = resultsUi;
    const roundState = GameState.getRoundState();
    if (roundState.phase === "podium") {
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
      playAgain.disabled = !isHost;
      playAgain.textContent = isHost ? "PLAY AGAIN" : "WAITING FOR HOST…";

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
      for (let i = 0; i < 4; i += 1) {
        const s = scores[i] != null ? scores[i] : 0;
        const row = document.createElement("div");
        row.className = "results-score-row";
        const isWinner = winnerIdx !== "draw" && winnerIdx === i;
        if (isWinner) row.classList.add("is-winner");
        row.style.setProperty("--slot-glow", displayCssColorForSlot(Netcode.getNetSlots()[i]));

        const nameEl = document.createElement("span");
        nameEl.className = "results-score-name";
        nameEl.textContent = slotDisplayName(i);

        let winnerBadge = null;
        if (isWinner) {
          winnerBadge = document.createElement("span");
          winnerBadge.className = "results-winner-badge";
          winnerBadge.textContent = "\u{1F451}";
          winnerBadge.setAttribute("aria-hidden", "true");
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
        emptyRow.textContent = "No prior matches this session.";
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
      cancelResultsAnimations(overlay);
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
  }

  // --- Carts, labels, gameplay helpers ---
  /**
   * Stops the looping charge-up SFX and clears charge state for a cart. Called on
   * fall / stuck respawn so a charging cart does not keep playing the wind-up sound
   * through its respawn. No-op for non-local carts (only the local cart's SFX plays).
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

  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + 1000; // * respawn after shatter VFX plays out
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
  function makeNameLabel(text, color) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.padding = "6px 14px";
    el.style.borderRadius = "4px";
    el.style.background = "rgba(0, 0, 0, 0.7)";
    el.style.color = "#fff";
    el.style.fontFamily = "'Bungee', cursive";
    el.style.fontSize = "24px";
    el.style.fontWeight = "700";
    el.style.lineHeight = "1";
    el.style.whiteSpace = "nowrap";
    el.style.border = `2px solid ${color}`;
    el.style.boxShadow = `0 0 9px ${color}66, inset 0 0 8px ${color}26`;
    el.style.textShadow = `0 0 6px ${color}`;
    el.style.transform = "translate(-50%, 0)";

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

      if (nameLabels[i]) {
        if (nameLabels[i]._labelText !== name || nameLabels[i]._labelColor !== colorCSS) {
          nameLabels[i].element.textContent = name;
          nameLabels[i].element.style.borderColor = colorCSS;
          nameLabels[i].element.style.boxShadow = `0 0 12px ${colorCSS}66, inset 0 0 8px ${colorCSS}26`;
          nameLabels[i].element.style.textShadow = `0 0 6px ${colorCSS}`;
          nameLabels[i]._labelText = name;
          nameLabels[i]._labelColor = colorCSS;
        }
      } else {
        const label = makeNameLabel(name, colorCSS);
        label._labelText = name;
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
    Netcode.setRefs({ getAllCartsRef: () => allCartsRef });
    updateCartMaterialsFromSlots(Netcode.getNetSlots());
    sessionRefs.updateNameLabelsRef.current = updateNameLabels;
    updateNameLabels();
    if (Netcode.getIsHost() && !Netcode.getHostSendTimer()) Netcode.startHostSendLoop();
    if (!Netcode.getIsHost()) Netcode.startInputSendLoop();
    Netcode.setAuthorityMode(Netcode.getIsHost());
    gameCtx.registerRuntime({
      getAllCarts: () => allCarts,
      getAllCartsRef: () => allCartsRef,
    });
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
    getPlayCollisionRef: () => (_intensity, _opts) => AudioManager.playCartCrash(),
    getSfx: () => ({ playFloorImpact: () => AudioManager.playSfx("floor"), playEdgeImpact: () => AudioManager.playSfx("floor") }),
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
    getTriggerLocalRamShake: () => triggerLocalRamShakeRef,
    getTriggerCartShatterRef: () => triggerCartShatterRef,
    getScene: () => scene,
    getHud: () => hud,
    colorHexForSlot: displayColorHexForSlot,
    getPendingColorKey: () => pendingColorKey,
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorKey: (val) => { pendingColorKey = val; },
    setPendingColorChipEl: (val) => { pendingColorChipEl = val; },
    getLocalColorPicked: () => _localColorPicked,
    setLocalColorPicked: (val) => { _localColorPicked = val; },
    recordPodiumStats,
    onReturnToLobby: () => {
      Entities.rematchResetWorld();
      GameState.setRoundEndReason(null);
      cleanupSuddenDeathState(allCartsRef || []);
    },
    onEnterPodium: () => {
      HUD.clearFeed();
    },
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { pendingMidRoundJoinRespawnConnId = val; },
    ensureSessionReady: () => ensureSessionCartsReady(),
    destroySessionCarts,
    disconnectNetcode: () => Netcode.disconnectPartySession(),
    dismissLoadingOverlays: () => dismissAllLoadingOverlays(),
    initMenu,
    resetRoundState: () => {
      GameState.resetRoundToLobby();
      try { Simulation.setRoundPhase("lobby"); } catch (e) {}
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

  getAxisRef = input.getAxis;
  triggerRamBoostRef = triggerRamBoost;
  Netcode.setRefs({
    getAllCartsRef: () => allCartsRef,
    getAxisRef: input.getAxis,
    isNitroHeldRef: input.isNitroHeld,
    triggerRamBoostRef: triggerRamBoost,
    triggerHopRef: triggerHop,
    resetSimTimingRef: sessionRefs.resetSimTimingRef,
  });
  // * hello can arrive before input/cart refs exist; startInputSendLoop no-ops without getAxisRef.
  Netcode.setAuthorityMode(Netcode.getIsHost());

  const ramBoostForwardXZ = new THREE.Vector3();
  const ramBoostToTargetXZ = new THREE.Vector3();
  const ramBoostRightXZ = new THREE.Vector3();

  /**
   * @param {number} now
   * @param {ReturnType<typeof createCart>} cart
   */
  function getAiAxis(now, cart) {
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
    const isLocal = cart === localCartForConnId();
    if (isLocal) {
      AudioManager.playSfx("boost");
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
      flashBoostActivate();
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
    if (!isLocal) return;
    if (cart.chargeUpSfxId != null) {
      AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
      cart.chargeUpSfxId = null;
    }
    AudioManager.playSfx("boost");
    if (cart.mesh) animateCartBoostPulse(cart.mesh);
    flashBoostActivate();
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

  function triggerHop(cart, nowMs) {
    if (!cart?.body) return;
    if (nowMs - cart.lastHopAtMs < CONFIG.cart.hop.cooldownMs) return;
    cart.lastHopAtMs = nowMs;
    cart.body.applyImpulse({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
    if (cart === localCartForConnId()) {
      AudioManager.playSfx("hop");
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
    if (nowMs - npc.lastRamBoostTimeMs < rb.cooldownSec * 1000) return;

    // * Find nearest target (human or NPC) — humans always pass the gate; NPCs only 25%.
    const netSlots = Netcode.getNetSlots();
    let nearestTarget = null;
    let nearestD2 = Infinity;
    let nearestIsHuman = false;
    const p = npc.body.translation();
    for (let i = 0; i < allCarts.length; i += 1) {
      const o = allCarts[i];
      if (o === npc) continue;
      const op = o.body.translation();
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

    // * NPC targets: only commit to a boost 25% of the time for chaotic variety.
    if (!nearestIsHuman && Math.random() >= 0.25) return;

    const dist = Math.sqrt(nearestD2);
    if (dist < ncfg.minTargetDistance || dist > ncfg.maxTargetDistance) return;

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
    if (angleDeg > ncfg.alignmentAngleDeg) return;

    // * NPCs use the instant nitro path — keeps bot movement responsive and avoids
    // * freezing in a 1.5s charge window mid-combat.
    triggerRamBoost(npc, nowMs, { instant: true });
  }

  // --- Round flow (countdown, podium, AI) ---
  if (audioListener && typeof audioListener.setMasterVolume === "function") {
    audioListener.setMasterVolume(isMuted ? 0 : sfxVolume);
  }

  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
  });

  function startRunningAt(startedAtMs) {
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

  function startCountdown(startsAtLocalMs = Date.now() + 3000) {
    if (!Netcode.getIsHost()) return;
    if (GameState.getRoundState().phase === "running") return;
    cancelLastCartStandingFinish();
    GameState.setRoundEndReason(null);
    clearRoundCountdownTimeout();
    syncRoundPhase("countdown");
    gameCtx.slowMo.active = false;
    GameState.setRoundCountdownStartedAtMs(startsAtLocalMs - 3000);
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    GameState.setRoundStartedAtMs(0);
    Netcode.sendHostRound();
    roundCountdownTimeoutId = setTimeout(() => {
      roundCountdownTimeoutId = null;
      if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
    }, Math.max(0, startsAtLocalMs - Date.now()));
    CameraMod.beginCinematicCountdown(camera);
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
    const startsAtLocalMs = (roundState.countdownStartedAtMs || Date.now()) + 3000;
    const delayMs = Math.max(0, startsAtLocalMs - Date.now());

    if (delayMs === 0) {
      if (GameState.getRoundState().phase === "countdown") startRunningAt(Date.now());
      return;
    }

    Netcode.sendHostRound();
    roundCountdownTimeoutId = setTimeout(() => {
      roundCountdownTimeoutId = null;
      if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
    }, delayMs);
  }

  onCountdownCancelledRef = () => {
    clearRoundCountdownTimeout();
    if (GameState.getRoundState().phase === "countdown") {
      syncRoundPhase("lobby");
      GameState.setRoundCountdownStartedAtMs(0);
      GameState.setRoundStartedAtMs(0);
      CameraMod.endCinematicCountdown(camera);
      if (Netcode.getIsHost()) Netcode.sendHostRound();
    }
  };
  onHostMigratedHandler = resumeCountdownAsNewHost;

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
      lastResultsOverlayKey = null;
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
    const suddenDeathActive = GameState.getRoundState().isSuddenDeath;
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
    recordPodiumStats(GameState.getRoundState().winnerSlotIndex, GameState.getRoundScores());
    HUD.clearFeed();
    syncRoundPhase("podium");
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
  }
  podiumAutoContinue.clear = clearAutoContinuePodiumTimeout;

  function currentPodiumAutoContinueKey() {
    return `${GameState.getRoundState().startedAtMs}:${GameState.getRoundState().winnerSlotIndex}:${matchHistory.length}`;
  }

  function maybeScheduleAutoContinuePodium() {
    if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
    const mode = detectGameMode();
    if (mode !== "quickplay") return;

    const key = currentPodiumAutoContinueKey();
    if (autoContinuePodiumTimeoutId != null || autoContinuePodiumKey === key) return;

    autoContinuePodiumKey = key;
    autoContinuePodiumTimeoutId = setTimeout(() => {
      autoContinuePodiumTimeoutId = null;
      if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
      if (detectGameMode() !== "quickplay") return;
      onHostPlayAgainClick();
    }, 5000);
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
    cancelLastCartStandingFinish();
    autoContinuePodiumKey = currentPodiumAutoContinueKey();
    clearAutoContinuePodiumTimeout();
    clearRoundCountdownTimeout();
    gameCtx.slowMo.active = false;
    lastResultsOverlayKey = null;
    GameState.setRoundEndReason(null);
    Entities.rematchResetWorld();
    if (detectGameMode() === "solo") {
      startCountdown(Date.now() + 3000);
      return;
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
    updateCartVisuals,
    buildCartMaterialCache,
    colorHexForSlot: displayColorHexForSlot,
    isMuted: () => isMuted,
    getSfxVolume: () => sfxVolume,
    isMenuVisible: () => menuVisible,
    getAxis: Input.getAxis,
    hud,
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
    fpsState,
    updateTouchControlsVisibility,
  };

  const gameFlowDeps = {
    ...sharedLoopGetters,
    detectGameMode,
    getLastHitBy: () => GameState.getLastHitBy(),
    getLocalCart: localCartForConnId,
    scheduleRespawn,
    scheduleStuckRespawn,
    doRespawn: Entities.doRespawn,
    maybeTriggerNpcOpportunisticRamBoost,
    endRound,
    scheduleLastCartStandingFinish,
    abortLastCartStandingFlourish,
    addScore: GameState.addScore,
    isScoreTied: GameState.isScoreTied,
    setSuddenDeath: GameState.setSuddenDeath,
    colorHexForSlot: displayColorHexForSlot,
    hud,
    sendHostRound: () => Netcode.sendHostRound(),
    getPartySocket: () => Netcode.getPartySocket(),
    MSG,
    setFovPunchUntil: (untilMs) => { fovPunchUntil = untilMs; },
    getYouConnId: () => Netcode.getYouConnId(),
    getScene: () => scene,
    triggerCartShatter,
    getWorld: () => world,
    getBoothColliderHandles: () => boothColliderHandles,
  };

  const hostSimCallbacks = {
    getAxis: Input.getAxis,
    getAiAxis,
    playCollision: (_intensity, _opts) => AudioManager.playCartCrash(),
    spawnTrashBurst: spawnTrashBurstRef,
    onLocalRamImpact: triggerLocalRamShake,
    onBoostRelease,
    onBoostCancel,
    get partySocket() { return Netcode.getPartySocket(); },
    get recordColliderHandles() { return recordColliderHandles; },
    get pitWallColliderHandle() { return pitWallColliderHandle; },
    get boothColliderHandles() { return boothColliderHandles; },
    playFloorImpact: () => AudioManager.playSfx("floor"),
    playEdgeImpact: () => AudioManager.playSfx("floor"),
    resolveCartForConn: (connId) => {
      const idx = Netcode.strictSlotIndexForConn(connId);
      return idx >= 0 ? allCartsRef[idx] : null;
    },
  };

  const clientSimCallbacks = {
    ...hostSimCallbacks,
    getAiAxis: null,
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
    reconcilePredictedLocalCart: (cart, idx, dt) => Netcode.reconcilePredictedLocalCart(cart, idx, dt),
    sampleAuthoritativeCartState: (idx) => Netcode.sampleAuthoritativeCartState(idx),
    runFixedPhysicsStep: Simulation.runFixedPhysicsStep,
    getSimulationCallbacks: (isHost) => (isHost ? hostSimCallbacks : clientSimCallbacks),
  };

  gameCtx.attachDeps({
    visual: visualDeps,
    gameFlow: gameFlowDeps,
    physics: physicsDeps,
  });

  runGameLoop(gameCtx.loopState, {
    shouldSkipTiming: () => menuVisible,
    onFrame(frameCtx) {
    gameCtx.setFrameCtx(frameCtx);
    const isUiActive = menuVisible || HUD.isEscOverlayVisible();
    setGamepadUiMode(isUiActive);
    setGamepadNavActive(isUiActive);
    const { now, loopState } = frameCtx;
    const dt = applySlowMoToDt(gameCtx.getSlowMoDeps(), frameCtx.dt);

    if (isLevelSwapping()) {
      frameCtx.dt = dt;
      return;
    }

    if (fxPass && fxPass.uniforms && fxPass.uniforms.uTime) {
      fxPass.uniforms.uTime.value = fxClock.getElapsedTime();
    }

    if (loopState.simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
    }

    // Visual-only record rotation.
    if (recordMesh) {
      recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;
    }

    sceneExtras?.update?.(now);
    levelUpdate?.(now);

    if (raveVisualsInitialized) {
      Effects.updateStageLights(now);
      Effects.updateLasers(now);
      Effects.updateCrowd(now);
      Effects.updateStageLed(now);
      Effects.updateBillboard(now);
    }

    if (spindleLight && spindleLightColorPink && spindleLightColorCyan) {
      // * Spindle PointLight cycle: pink <-> cyan, ~8s full cycle.
      const t = (Math.sin(now * 0.001 * Math.PI * 2 / 8) + 1) / 2;
      spindleLight.color.copy(spindleLightColorPink).lerp(spindleLightColorCyan, t);
    }

    // Record label color cycle (5 colors, ~2s each, ~10s full loop).
    if (recordLabelMat) {
      const segMs = 2000;
      const idx = Math.floor(now / segMs) % recordLabelCycleColors.length;
      const nextIdx = (idx + 1) % recordLabelCycleColors.length;
      const f = (now % segMs) / segMs;
      recordLabelMat.color
        .copy(recordLabelCycleColors[idx])
        .lerp(recordLabelCycleColors[nextIdx], f);
    }

    // Booth neon RGB cycle (fuchsia <-> neon blue)
    if (boothNeonMeshes && boothNeonMeshes.length > 0) {
      const t = (Math.sin(performance.now() * 0.001 * Math.PI * 2 * CONFIG.booth.neonCycleSpeed) + 1) / 2;
      boothNeonMixed.copy(boothNeonColor1).lerp(boothNeonColor2, t);
      for (const m of boothNeonMeshes) {
        m.material.color.copy(boothNeonMixed);
        m.material.emissive.copy(boothNeonMixed);
      }
    }

    updateGameFlow(gameCtx.deps.gameFlow, gameCtx.makePhaseContext(dt));

    const physicsStep = runPhysicsStep(gameCtx.loopState, gameCtx.deps.physics, { now, dt });
    frameCtx.physicsAlpha = physicsStep.alpha;

    const localCart = localCartForConnId();

    // * Death camera takes priority — freeze at death position and pan toward the explosion.
    if (localCart?.isShattering) {
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
      const camMode = CameraMod.getCameraMode(camera);
      if (camMode === CameraMod.CameraMode.CINEMATIC_COUNTDOWN) {
        CameraMod.updateCinematicCountdown(camera, dt);
      } else {
        const playerPos = localCart.body.translation();
        const playerRot = localCart.body.rotation();
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
  });

  window.addEventListener("resize", updateViewport);
  enableModeMenuButtons();
  window.__cartRaveBootstrapped = true;
  window.__cartRaveCancelBootError?.();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
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
