// === IMPORTS ===

import {
  ensurePlayerCustomizationPersisted,
  resolveCartNeonCss,
  resolveCartNeonHex,
  resolveCartPatternForSlot,
  resolveServerColorPick,
  wireCustomizationStorageSync,
} from "./customization.js";
import { applyCartPattern } from "./cartPatterns.js";
import "./cart-rave-menu.js";
import "./cart-rave-menu.css";
import * as THREE from "three";
import { createRenderer, createScene, createComposer, setupSceneEnvironment, refreshSceneEnvironmentMaterials, updateViewport as updateSceneViewport } from "./scene.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { updateCartVisuals } from "./cart.js";
import * as Simulation from "./simulation.js";
import * as Entities from "./entities.js";
import * as HUD from "./hud.js";
import * as Input from "./input.js";
import * as Netcode from "./netcode.js";
import * as GameState from "./gameState.js";
import * as GameAudio from "./audio.js";
import * as CameraMod from "./camera.js";
import * as Effects from "./effects.js";
import { loadLevel, resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
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
  withModeEntryLoading,
} from "./ui/loadingScreen.js";
import { animateCartBoostPulse, crossfadeElement, animateMuteToggle, animateVolumeTick } from "./animations.js";
import { flashBoostActivate } from "./touchControls.js";
import {
  applySlowMoToDt,
  createGameLoopState,
  resetGameLoopTiming,
  runGameLoop,
  runPhysicsStep,
  updateVisualsAndEffects,
} from "./gameLoop.js";
import { updateGameFlow } from "./gameFlow.js";
import { createGameContext } from "./gameContext.js";
import {
  buildNetcodeGameBridge,
  createGameSessionController,
  createHelloGate,
  createSessionBridgeRefs,
} from "./gameSession.js";
import {
  applyCartFrameGlow,
  clamp,
  isTouchDevice,
} from "./utils.js";
import { CONFIG, MSG, CART_COLORS, PALETTE } from "./config.js";
import { NPC_NAME_POOL } from "./npcNames.js";

// eslint-disable-next-line no-console
console.log("%cHI :D", "font-size:32px;color:#ff2bd6;font-weight:bold;text-shadow:0 0 10px #ff2bd6");

// === UTILITY HELPERS ===

/**
 * Caches per-cart materials so recoloring doesn't traverse the mesh every update.
 * @param {THREE.Object3D} cartMesh
 */
function buildCartMaterialCache(cartMesh) {
  const frameMats = [];
  const frameGlowMats = [];
  const seen = new Set();

  /**
   * @param {THREE.Material | THREE.Material[] | null | undefined} material
   * @param {(m: THREE.Material) => void} add
   */
  function forEachMaterial(material, add) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach((m) => m && add(m));
      return;
    }
    add(material);
  }

  cartMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (
      child.userData
      && (child.userData.isFace || child.userData.isHandle || child.userData.isWheel || child.userData.isCartPatternLayer)
    ) {
      return;
    }

    forEachMaterial(child.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);
      frameMats.push(mat);
      if (mat.emissive) frameGlowMats.push(mat);
    });
  });

  return { frameMats, frameGlowMats };
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
  if (raw === "quickplay" || raw.toLowerCase().startsWith("solo")) return false;
  pendingInviteRoomFromUrl = raw;
  return true;
}

/** @type {null | { playFloorImpact?: (intensity: number) => void, playEdgeImpact?: (intensity: number) => void }} */
let gameSfx = null;

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
  if (room.startsWith("solo")) return "solo";
  if (room === "quickplay") return "quickplay";
  return "friends";
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
let masterGain = AUDIO_VOLUME_DEFAULT;
/** @type {number} */
let sfxVolume = AUDIO_VOLUME_DEFAULT;
/** @type {null | { setLeader: (slotIndex: number|null) => void; updatePositionFromCart: (cart: any) => void; resyncVolume: () => void }} */
let leaderHum = null;
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

/**
 * In-memory match results for the session (resets on full page reload). Not rendered until the results overlay is wired.
 * @type {{ endedAtMs: number, winnerSlotIndex: number | "draw", scores: Record<number, number>, mode?: "solo" | "quickplay" | "friends" }[]}
 */
let matchHistory = [];

/** @type {ReturnType<typeof setTimeout> | null} */
let roundPodiumTimeoutId = null;
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
/** @type {((intensity: number) => void) | null} */
let playCollisionRef = null;
/** @type {((position: { x: number; y: number; z: number }, intensity: number) => void) | null} */
let spawnTrashBurstRef = null;
/** @type {((intensity: number, isBoosting?: boolean) => void) | null} */
let triggerLocalRamShakeRef = null;
/** @type {string | null} */
let pendingMidRoundJoinRespawnConnId = null;

function updateCartMaterialsFromSlots(slots) {
  if (!allCartsRef || !Array.isArray(slots)) return;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const cart = allCartsRef[slotIndex];
    if (!slot || !cart?.mesh) continue;

    const finalHex = displayColorHexForSlot(slot);
    const cache = cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh));

    // Frame: recolor and update emissive glow (always sync — hello fires before carts exist).
    for (const mat of cache.frameMats) {
      applyCartFrameGlow(mat, finalHex);
    }

    // Wireframe pattern mask (local human only until networked).
    applyCartPattern(
      cart.mesh,
      resolveCartPatternForSlot(slot, { youConnId: Netcode.getYouConnId() }),
      finalHex,
    );

    // Keep the cached hex in sync so ram-boost streaks and respawns use the right color.
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
  // * Dismiss boot splash before Rapier/scene init — initMenu() may return early on ?room= URLs.
  void dismissInitialBootSplash();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
  ensurePlayerCustomizationPersisted();
  wireCustomizationStorageSync();

  await RAPIER.init();

  let sfx = null;
  let labelRenderer = null;
  let input = null;

  // --- Canvas & input ---
  const canvas = document.getElementById(CONFIG.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas element '#${CONFIG.canvasId}' not found.`);
  }

  // * Start menu music fetch immediately — before RAPIER/scene init blocks the main thread.
  GameAudio.initMusic({
    getMasterGain: () => masterGain,
    getIsMuted: () => isMuted,
    getMenuVisible: () => menuVisible,
    startMenuOnInit: menuVisible,
  });

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
      if (hud && hud.syncAudioControls) hud.syncAudioControls();
    },
    () => {
      if (menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      triggerHop(localCartForConnId(), performance.now());
      Input.requestHop();
    },
    () => {
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
      const cart = localCartForConnId();
      if (!cart) return;
      triggerRamBoost(cart, performance.now());
    },
  });

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

  const audioListener = new THREE.AudioListener();
  const savedSfxVol = localStorage.getItem("cartRaveSfxVol");
  if (savedSfxVol !== null) {
    const parsedSfxVol = parseInt(savedSfxVol, 10);
    sfxVolume = Number.isNaN(parsedSfxVol)
      ? AUDIO_VOLUME_DEFAULT
      : clamp((parsedSfxVol / 100) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
  }

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
  const gameCtx = createGameContext().registerModules({
    Netcode,
    GameState,
    Simulation,
    Entities,
    Input,
    HUD,
  });
  const BASE_FOV = CONFIG.camera.fov;

  let ensureCartCrashBufferLoaded = () => {};
  const audioSystem = initAudioSystem(audioListener, {
    getSfxVolume: () => sfxVolume,
    getIsMuted: () => isMuted,
  });
  sfx = audioSystem.sfx;
  if (!leaderHum) leaderHum = audioSystem.leaderHum;
  ensureCartCrashBufferLoaded = audioSystem.ensureCartCrashBufferLoaded;
  playCollisionRef = sfx.playCollision;
  gameSfx = sfx;
  GameAudio.registerMusicVolumeDeps({
    audioListener,
    getSfxVolume: () => sfxVolume,
  });
  GameAudio.registerAudioRefs({ sfx, leaderHum });
  GameAudio.applyAudioVolume();
  camera.add(audioListener);

  const { composer, bloomPass, arcadePass, fxaaPass } = createComposer(renderer, scene, camera);
  fxPass = arcadePass;
  if (!bloomEnabled && bloomPass) bloomPass.enabled = false;
  if (!fxPassEnabled && fxPass) fxPass.enabled = false;

  if (import.meta.env.DEV) {
    import("./postFxDebug.js").then(({ initPostFxDebugGui }) => {
      initPostFxDebugGui({ renderer, scene, bloomPass, arcadePass, fxaaPass });
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
  function setAllAudioMuted(muted) {
    GameAudio.setMuted(muted, (val) => {
      isMuted = val;
      localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false");
      if (sfx) {
        sfx._muted = isMuted;
      }
    });
  }

  function setSfxSliderVolume(v) {
    sfxVolume = clamp(v, 0, AUDIO_VOLUME_MAX);
    localStorage.setItem(
      "cartRaveSfxVol",
      Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100).toString(),
    );
    try { GameAudio.applyAudioVolume(); } catch (e) {}
  }

  /** Wired after clearAutoContinuePodiumTimeout is defined in main(). */
  const podiumAutoContinue = { clear: () => {} };

  function initMenu() {
    menuVisible = true;
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
    try {
      GameAudio.stopGameMusic();
    } catch (e) {}
    try { GameAudio.startMenuMusic(); } catch (e) {}
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
    if (room && room.toLowerCase().startsWith("solo")) {
      void hideMenu({ gameMode: "solo" }).then(() => {
        showRotatePromptIfNeeded();
        Netcode.initNetcode();
      });
      return;
    }

    // * Returning visitor refreshing ?room=quickplay — auto-rejoin once per page load.
    const savedUsername = (localStorage.getItem("cartRaveUsername") || "").trim();
    const roomParam = new URLSearchParams(window.location.search || "").get("room");
    if (roomParam === "quickplay" && savedUsername && !quickplayAutoRejoinAttempted) {
      quickplayAutoRejoinAttempted = true;
      Netcode.initNetcode();
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
      if (action === "solo" || action === "quickplay" || action === "friends") {
        if (!window.__cartRaveBootstrapped) return;
      }
      if (action === "joinroom") {
        const room = pendingInviteRoomFromUrl;
        if (!room) return;
        pendingInviteRoomFromUrl = null;
        document.getElementById("cr-btn-join-invite")?.remove();
        void rebuildLevelIfNeeded();
        Netcode.initNetcode(room);
        return;
      }
      pendingInviteRoomFromUrl = null;
      document.getElementById("cr-btn-join-invite")?.remove();
      if (action === "solo") {
        const roomId = `solo${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void hideMenu({ gameMode: "solo" }).then(() => Netcode.initNetcode());
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        void rebuildLevelIfNeeded();
        Netcode.initNetcode();
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
            void rebuildLevelIfNeeded();
            Netcode.initNetcode();
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

    // Wire new menu audio controls to game audio
    const crMuteBtn = document.getElementById("cr-mute-btn");
    const crMusicVolTrack = document.getElementById("cr-music-vol-track");
    const crMusicVolFill = document.getElementById("cr-music-vol-fill");
    const crMusicVolVal = document.getElementById("cr-music-vol-val");

    function syncMenuVolume() {
      if (crMusicVolFill) crMusicVolFill.style.setProperty("--vol-scale", String(isMuted ? 0 : masterGain / AUDIO_VOLUME_MAX));
      if (crMusicVolVal) crMusicVolVal.textContent = isMuted ? "OFF" : Math.round((masterGain / AUDIO_VOLUME_MAX) * 100);
      if (crMuteBtn) crMuteBtn.classList.toggle("muted", isMuted);
      if (hud && hud.syncAudioControls) hud.syncAudioControls();
    }

    if (!menuAudioControlsWired) {
      menuAudioControlsWired = true;
      if (crMuteBtn) {
        crMuteBtn.addEventListener("click", () => {
          setAllAudioMuted(!isMuted);
          animateMuteToggle(crMuteBtn);
          syncMenuVolume();
        });
      }
      if (crMusicVolTrack) {
        crMusicVolTrack.addEventListener("click", (e) => {
          const r = crMusicVolTrack.getBoundingClientRect();
          const v = clamp(((e.clientX - r.left) / r.width) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
          masterGain = v;
          localStorage.setItem("cartRaveVolume", Math.round((v / AUDIO_VOLUME_MAX) * 100).toString());
          try { GameAudio.applyAudioVolume(); } catch(e) {}
          if (crMusicVolVal) animateVolumeTick(crMusicVolVal);
          syncMenuVolume();
        });
      }
    }

    // Set initial state from saved values
    const savedVol = localStorage.getItem("cartRaveVolume");
    if (savedVol !== null) {
      const parsed = parseInt(savedVol, 10);
      masterGain = Number.isNaN(parsed)
        ? AUDIO_VOLUME_DEFAULT
        : clamp((parsed / 100) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
    }
    const savedSfxVol = localStorage.getItem("cartRaveSfxVol");
    if (savedSfxVol !== null) {
      const parsed = parseInt(savedSfxVol, 10);
      sfxVolume = Number.isNaN(parsed)
        ? AUDIO_VOLUME_DEFAULT
        : clamp((parsed / 100) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
    }
    const savedMute = localStorage.getItem("cartRaveMuted");
    if (savedMute === "true") setAllAudioMuted(true);
    try { GameAudio.applyAudioVolume(); } catch(e) {}
    syncMenuVolume();

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
    if (labelRenderer) labelRenderer.domElement.style.display = "block";
    HUD.showAudioWidget();
    updateTouchControlsVisibility();
    GameAudio.fadeOutMenuMusic();
    GameAudio.fadeInGameMusic();
  }

  /**
   * Hides the menu after arena bootstrap completes. Shows a mode-aware loading overlay
   * while deferred world init and any pending level rebuild run.
   *
   * @param {{ gameMode?: string | null }} [opts]
   * @returns {Promise<void>}
   */
  function hideMenu(opts = {}) {
    const gameMode = opts.gameMode ?? detectGameMode();
    const levelId = resolveLevelId(localStorage.getItem(LEVEL_STORAGE_KEY));

    return withModeEntryLoading(async () => {
      await rebuildLevelIfNeeded();
      await ensureWorldBootstrapped();
      // * Hide menu while loading overlay still covers the screen (no menu flash).
      commitMenuHiddenForGame();
    }, { gameMode, levelId });
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


  hud = HUD.init({
    getIsMuted: () => isMuted,
    setIsMuted: (val) => { setAllAudioMuted(val); },
    getMasterGain: () => masterGain,
    setMasterGain: (val) => {
      masterGain = val;
      localStorage.setItem("cartRaveVolume", Math.round((val / AUDIO_VOLUME_MAX) * 100).toString());
      try { GameAudio.applyAudioVolume(); } catch (e) {}
    },
    getSfxVolume: () => sfxVolume,
    setSfxVolume: (val) => { setSfxSliderVolume(val); },
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
  });
  const resultsUi = initResultsOverlay({
    onMainMenuClick: () => {
      podiumAutoContinue.clear();
      gameSession.returnToMenu({ reason: "results" });
    },
  });

  // --- Arena, physics — level mesh + rave dressing load deferred after menu is shown ---
  scene.add(new THREE.AmbientLight(0x221133, 0.15));

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  initMenu();

  let recordMesh = null;
  let recordCollider;
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
  let loadedLevelId = resolveLevelId(localStorage.getItem(LEVEL_STORAGE_KEY));
  let sceneExtras = {
    scene,
    sceneRoots: [],
    disposables: [],
    update: () => {},
    disposed: false,
  };
  let upgradeRecordReflector = null;
  let worldBootstrapDone = false;
  let worldBootstrapPromise = null;
  let raveVisualsInitialized = false;
  let sceneEnvironmentDispose = null;

  function applyLoadedLevelSideEffects() {
    Simulation.setLevelHazards(levelHazards ?? null);
    setContactShadowHazards(levelHazards ?? null);
    Effects.setAmbientDustStyle(
      loadedLevelId === "backrooms" ? "backrooms" : "rainbow",
      CART_COLORS,
    );
  }

  function initDeferredRaveVisuals() {
    const wantRaveExtras = loadedLevelId !== "backrooms";
    disposeSceneExtras(sceneExtras);
    sceneExtras = initSceneExtras(scene, pitInnerRadius, { enabled: wantRaveExtras });
    if (wantRaveExtras && !raveVisualsInitialized) {
      Effects.initCrowd(scene, CART_COLORS, pitInnerRadius);
      Effects.initStage(scene, pitInnerRadius, CART_COLORS);
      Effects.initBillboard(scene, pitInnerRadius);
      Effects.initLasers(scene, pitInnerRadius, CART_COLORS);
      raveVisualsInitialized = true;
    }
    Effects.setRaveExtrasVisible(wantRaveExtras);
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

  function bootstrapWorldCore(levelIdOverride) {
    if (!sceneEnvironmentDispose) {
      sceneEnvironmentDispose = setupSceneEnvironment(renderer, scene);
    }
    ({
      recordMesh,
      recordCollider,
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
    } = loadLevel(levelIdOverride, scene, world, CONFIG, {
      reflectorTextureSize: 256,
    }));
    loadedLevelId = resolveLevelId(
      levelIdOverride ?? localStorage.getItem(LEVEL_STORAGE_KEY),
    );
    refreshSceneEnvironmentMaterials(scene);
    applyLoadedLevelSideEffects();
    initDeferredRaveVisuals();
    scheduleReflectorUpgrade();
  }

  function ensureWorldBootstrapped() {
    if (worldBootstrapDone) return Promise.resolve();
    if (!worldBootstrapPromise) {
      worldBootstrapPromise = Promise.resolve().then(() => {
        if (!worldBootstrapDone) {
          bootstrapWorldCore(undefined);
          worldBootstrapDone = true;
        }
      }).catch((err) => {
        worldBootstrapPromise = null;
        throw err;
      });
    }
    return worldBootstrapPromise;
  }

  function scheduleDeferredWorldBootstrap() {
    const run = () => { void ensureWorldBootstrapped(); };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      setTimeout(run, 400);
    }
  }

  let levelRebuildInFlight = false;

  /** Level dispose is unsafe once slot carts exist — menu-only, pre-join. */
  function canSafelyRebuildLevel() {
    return menuVisible && (!allCartsRef || allCartsRef.length === 0);
  }

  /**
   * Rebuilds the arena and its space-skybox scene extras in place if the menu-selected
   * level differs from the one currently loaded. Safe to call only before a room is joined
   * (no carts exist yet). Scene extras are torn down and re-created against the new level's
   * pitInnerRadius so the ground ring and horizon fit the new arena. (The Effects crowd /
   * stage / billboard / lasers still keep their startup placement — occluded / neutral.)
   */
  async function rebuildLevelIfNeeded() {
    if (!canSafelyRebuildLevel()) return;
    await ensureWorldBootstrapped();
    const selected = resolveLevelId(localStorage.getItem(LEVEL_STORAGE_KEY));
    if (selected === loadedLevelId || levelRebuildInFlight) return;
    levelRebuildInFlight = true;

    try {
      await crossfadeElement(canvas, () => {
        if (typeof disposeLevel === "function") disposeLevel();
        ({
          recordMesh,
          recordCollider,
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
        } = loadLevel(selected, scene, world, CONFIG, {
          reflectorTextureSize: 256,
        }));
        refreshSceneEnvironmentMaterials(scene);
        loadedLevelId = selected;
        applyLoadedLevelSideEffects();
        initDeferredRaveVisuals();
        scheduleReflectorUpgrade();
      });
    } finally {
      levelRebuildInFlight = false;
      const stillNeeded = resolveLevelId(localStorage.getItem(LEVEL_STORAGE_KEY));
      if (stillNeeded !== loadedLevelId) {
        void rebuildLevelIfNeeded();
      }
    }
  }

  window.addEventListener("cartrave:level-changed", () => {
    if (!canSafelyRebuildLevel()) return;
    void rebuildLevelIfNeeded();
  });

  scheduleDeferredWorldBootstrap();

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * Round start/countdown handlers live here; initNetcode invokes them via callbacks.
  onGameStartHandler = (msg) => {
    if (menuVisible) hideMenu();
    showRotatePromptIfNeeded();
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
      const renderKey = `${roundState.winnerSlotIndex}-${scores[0] ?? 0}-${scores[1] ?? 0}-${scores[2] ?? 0}-${scores[3] ?? 0}-${matchHistory.length}-${isHost}-${stats.matches}-${stats.wins}-${stats.totalPoints}-${stats.soloGames ?? 0}`;
      if (renderKey === lastResultsOverlayKey) {
        maybeScheduleAutoContinuePodium();
        return;
      }
      lastResultsOverlayKey = renderKey;
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
          title.textContent = `${slotDisplayName(idx)} wins — ${score} pts`;
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
  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + CONFIG.fall.respawnDelayMs;
    if (cart === localCartForConnId()) {
      sfx.playFallOff();
    }
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
  /** @type {Promise<Array<object>> | null} */
  let sessionCartBootstrapPromise = null;

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
    if (allCartsRef?.length) return allCartsRef;
    if (expectedGen != null && expectedGen !== helloGate.getGeneration()) return null;

    const { allCarts: carts, nextPendingMidRoundJoinRespawnConnId } = Entities.initCarts({
      scene,
      world,
      ramBoostStreaks,
      netSlots: Netcode.getNetSlots(),
      youConnId: Netcode.getYouConnId(),
      CART_COLORS,
      colorHexForSlot: displayColorHexForSlot,
      pendingMidRoundJoinRespawnConnId,
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
    Netcode.setAuthorityMode(Netcode.getIsHost());
    gameCtx.registerRuntime({
      getAllCarts: () => allCarts,
      getAllCartsRef: () => allCartsRef,
    });
    return carts;
  }

  async function ensureSessionCartsReady() {
    if (allCartsRef?.length) return allCartsRef;

    const bootstrapGen = helloGate.getGeneration();
    if (!sessionCartBootstrapPromise) {
      sessionCartBootstrapPromise = (async () => {
        if (!helloGate.isReceived()) {
          await helloGate.getFirstPromise();
        }
        if (bootstrapGen !== helloGate.getGeneration()) return null;
        if (allCartsRef?.length) return allCartsRef;
        await ensureWorldBootstrapped();
        return bootstrapSessionCarts(bootstrapGen);
      })().finally(() => {
        if (bootstrapGen === helloGate.getGeneration()) {
          sessionCartBootstrapPromise = null;
        }
      });
    }
    return sessionCartBootstrapPromise;
  }

  function destroySessionCarts() {
    Entities.destroyCarts({ scene, nameLabels });
    allCarts = [];
    allCartsRef = null;
    sessionCartBootstrapPromise = null;
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
    invokeHideMenu: () => { void hideMenu(); },
    updateCartMaterialsFromSlots,
    updateHudColorsFromSlots,
    updateNameLabelsRef: sessionRefs.updateNameLabelsRef,
    getNameLabelUpdatePending: () => nameLabelUpdatePending,
    setNameLabelUpdatePending: (val) => { nameLabelUpdatePending = val; },
    respawnLocalMidRoundJoinRef: sessionRefs.respawnLocalMidRoundJoinRef,
    getPlayCollisionRef: () => playCollisionRef,
    getSfx: () => gameSfx,
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
    getTriggerLocalRamShake: () => triggerLocalRamShakeRef,
    getHud: () => hud,
    colorHexForSlot: displayColorHexForSlot,
    getPendingColorKey: () => pendingColorKey,
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorKey: (val) => { pendingColorKey = val; },
    setPendingColorChipEl: (val) => { pendingColorChipEl = val; },
    getLocalColorPicked: () => _localColorPicked,
    setLocalColorPicked: (val) => { _localColorPicked = val; },
    recordPodiumStats,
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
    dismissLoadingOverlays: () => dismissAllLoadingOverlays(),
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
   * @param {ReturnType<typeof createCart>} cart
   * @param {number} nowMs
   */
  function triggerRamBoost(cart, nowMs) {
    if (!cart?.body) return;
    const rb = CONFIG.cart.ramBoost;
    if (!rb.enabled) return;
    if (nowMs <= cart.ramBoostActiveUntilMs) return;
    if (nowMs - cart.lastRamBoostTimeMs < rb.cooldownSec * 1000) return;
    cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1000;
    cart.lastRamBoostTimeMs = nowMs;
    const isLocal = cart === localCartForConnId();
    if (isLocal) {
      sfx.playNitro();
      if (cart.mesh) animateCartBoostPulse(cart.mesh);
      flashBoostActivate();
    }
    cart.ramBoostStreakCarry = 0;
  }

  function triggerHop(cart, nowMs) {
    if (!cart?.body) return;
    if (nowMs - cart.lastHopAtMs < CONFIG.cart.hop.cooldownMs) return;
    cart.lastHopAtMs = nowMs;
    cart.body.applyImpulse({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
    if (cart === localCartForConnId()) {
      sfx.playHop();
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

    let nearestOther = null;
    let nearestD2 = Infinity;
    const p = npc.body.translation();
    for (const o of allCarts) {
      if (o === npc) continue;
      const op = o.body.translation();
      const dx = op.x - p.x;
      const dz = op.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearestOther = o;
      }
    }
    if (!nearestOther) return;
    const dist = Math.sqrt(nearestD2);
    if (dist < ncfg.minTargetDistance || dist > ncfg.maxTargetDistance) return;

    const rot = npc.body.rotation();
    const yaw = Simulation.yawFromQuaternion(rot);
    Simulation.setForwardRightFromYaw(yaw, ramBoostForwardXZ, ramBoostRightXZ);
    const op = nearestOther.body.translation();
    ramBoostToTargetXZ.set(op.x - p.x, 0, op.z - p.z);
    if (ramBoostToTargetXZ.lengthSq() < 1e-8) return;
    ramBoostToTargetXZ.normalize();
    if (ramBoostForwardXZ.lengthSq() < 1e-8) return;
    ramBoostForwardXZ.normalize();
    const dot = clamp(ramBoostForwardXZ.dot(ramBoostToTargetXZ), -1, 1);
    const angleDeg = Math.acos(dot) * (180 / Math.PI);
    if (angleDeg > ncfg.alignmentAngleDeg) return;

    triggerRamBoost(npc, nowMs);
  }

  // --- Round flow (countdown, podium, AI) ---
  GameAudio.applyAudioVolume();

  function unlockAudio() {
    const ctx = audioListener.context;
    const onUnlocked = () => {
      ensureCartCrashBufferLoaded();
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(onUnlocked, () => {});
    } else {
      onUnlocked();
    }
    if (!menuVisible) GameAudio.startGameMusic();
  }

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
  });

  function startRunningAt(startedAtMs) {
    syncRoundPhase("running");
    gameCtx.slowMo.active = false;
    GameState.setRoundStartedAtMs(startedAtMs);
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    Netcode.sendHostRound();
    updateTouchControlsVisibility();
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

  onCountdownCancelledRef = clearRoundCountdownTimeout;
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

  function endRound() {
    clearRoundCountdownTimeout();
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    // * Find highest score and how many slots share it (lowest index wins on non-zero ties only).
    let winnerSlotIndex = 0;
    let winnerScore = -Infinity;
    const scores = GameState.getRoundScores();
    for (let i = 0; i < 4; i++) {
      if ((scores[i] || 0) > winnerScore) {
        winnerScore = scores[i] || 0;
        winnerSlotIndex = i;
      }
    }
    let tieAtTop = 0;
    for (let i = 0; i < 4; i++) {
      if ((scores[i] || 0) === winnerScore) tieAtTop += 1;
    }
    pendingMidRoundJoinRespawnConnId = null;
    if (winnerScore === 0 && tieAtTop >= 2) {
      GameState.setRoundWinnerSlotIndex("draw");
    } else {
      GameState.setRoundWinnerSlotIndex(winnerSlotIndex);
    }
    recordPodiumStats(GameState.getRoundState().winnerSlotIndex, GameState.getRoundScores());
    syncRoundPhase("podium");
    if (!gameCtx.slowMo.active) {
      gameCtx.slowMo.active = true;
      gameCtx.slowMo.startMs = performance.now();
    }
    Netcode.sendHostRound();
  }

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
    autoContinuePodiumKey = currentPodiumAutoContinueKey();
    clearAutoContinuePodiumTimeout();
    clearRoundCountdownTimeout();
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    gameCtx.slowMo.active = false;
    lastResultsOverlayKey = null;
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
    updateCartVisuals,
    buildCartMaterialCache,
    colorHexForSlot: displayColorHexForSlot,
    isMuted: () => isMuted,
    getSfxVolume: () => sfxVolume,
    sfx,
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
    getLastHitBy: () => GameState.getLastHitBy(),
    getLocalCart: localCartForConnId,
    scheduleRespawn,
    doRespawn: Entities.doRespawn,
    maybeTriggerNpcOpportunisticRamBoost,
    endRound,
    addScore: GameState.addScore,
    colorHexForSlot: displayColorHexForSlot,
    hud,
    sendHostRound: () => Netcode.sendHostRound(),
    getPartySocket: () => Netcode.getPartySocket(),
    MSG,
    setFovPunchUntil: (untilMs) => { fovPunchUntil = untilMs; },
    getYouConnId: () => Netcode.getYouConnId(),
  };

  const physicsDeps = {
    ...sharedLoopGetters,
    world,
    eventQueue,
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
    getSimulationCallbacks: (isHost) => (isHost ? {
      getAxis: Input.getAxis,
      getAiAxis: getAiAxis,
      playCollision: playCollisionRef,
      spawnTrashBurst: spawnTrashBurstRef,
      onLocalRamImpact: triggerLocalRamShake,
      partySocket: Netcode.getPartySocket(),
      recordColliderHandle: recordCollider?.handle,
      pitWallColliderHandle: pitWallColliderHandle,
      boothColliderHandles: boothColliderHandles,
      playFloorImpact: (intensity) => sfx?.playFloorImpact?.(intensity),
      playEdgeImpact: (intensity) => sfx?.playEdgeImpact?.(intensity),
      resolveCartForConn: (connId) => {
        const idx = Netcode.strictSlotIndexForConn(connId);
        return idx >= 0 ? allCartsRef[idx] : null;
      },
    } : {
      getAxis: Input.getAxis,
      getAiAxis: null,
      playCollision: playCollisionRef,
      spawnTrashBurst: spawnTrashBurstRef,
      onLocalRamImpact: triggerLocalRamShake,
      partySocket: Netcode.getPartySocket(),
      recordColliderHandle: recordCollider?.handle,
      pitWallColliderHandle: pitWallColliderHandle,
      boothColliderHandles: boothColliderHandles,
      playFloorImpact: (intensity) => sfx?.playFloorImpact?.(intensity),
      playEdgeImpact: (intensity) => sfx?.playEdgeImpact?.(intensity),
    }),
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
    const { now, loopState } = frameCtx;
    const dt = applySlowMoToDt(gameCtx.getSlowMoDeps(), frameCtx.dt);

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
    if (localCart?.body) {
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

    frameCtx.dt = dt;
    },
    onVisualUpdate(frameCtx) {
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
