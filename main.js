// === IMPORTS ===

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { EffectComposer } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/ShaderPass.js";
import { CSS2DObject, CSS2DRenderer } from "https://unpkg.com/three@0.164.1/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "https://unpkg.com/three@0.164.1/examples/jsm/environments/RoomEnvironment.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import { updateCartVisuals } from "./cart.js";
import * as Simulation from "./src/simulation.js";
import * as Entities from "./src/entities.js";
import * as HUD from "./src/hud.js";
import * as Input from "./src/input.js";
import * as Netcode from "./src/netcode.js";
import * as GameState from "./src/gameState.js";
import * as GameAudio from "./src/audio.js";
import * as CameraMod from "./src/camera.js";
import * as Effects from "./src/effects.js";
import { initArena } from "./src/arena.js";
import { initSceneExtras } from "./src/sceneSetup.js";
import { initAudioSystem } from "./src/audioSetup.js";
import { initResultsOverlay } from "./src/ui/resultsOverlay.js";
import {
  applySlowMoToDt,
  createGameLoopState,
  resetGameLoopTiming,
  runGameLoop,
  runPhysicsStep,
  updateVisualsAndEffects,
} from "./src/gameLoop.js";
import { updateGameFlow } from "./src/gameFlow.js";
import { createGameContext } from "./src/gameContext.js";
import {
  clamp,
  colorHexForSlot,
  getColorForSlot,
} from "./src/utils.js";

// eslint-disable-next-line no-console
console.log("%cHI :D", "font-size:32px;color:#ff2bd6;font-weight:bold;text-shadow:0 0 10px #ff2bd6");

// === UTILITY HELPERS ===

/**
 * Caches per-cart materials so recoloring doesn't traverse the mesh every update.
 * @param {THREE.Object3D} cartMesh
 */
function buildCartMaterialCache(cartMesh) {
  const frameMats = [];
  const wheelGlowMats = [];
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
    if (child.userData && (child.userData.isFace || child.userData.isHandle)) return;

    const isWheel = Boolean(child.userData && child.userData.isWheel);
    forEachMaterial(child.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);

      if (isWheel) {
        if (mat.emissive) wheelGlowMats.push(mat);
      } else {
        frameMats.push(mat);
        if (mat.emissive) frameGlowMats.push(mat);
      }
    });
  });

  return { frameMats, wheelGlowMats, frameGlowMats };
}

// === CONSTANTS & CONFIG ===

// * PartyKit public host lives in netcode.js (`partyHostFromWindowLocation`).

// --- PartyKit protocol constants (must match server exactly) ---
const MSG = {
  // Client -> server
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventCollision: "host_event_collision",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",
  keepalive: "keepalive",
  colorPick: "color_pick",
  readyToggle: "ready_toggle",
  playAgain: "play_again",

  // Server -> client
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
};

const CART_COLORS = {
  pink:       { hex: 0xff00ff, css: "bg-pink" },
  blue:       { hex: 0x00ffff, css: "bg-blue" },
  green:      { hex: 0x00ff00, css: "bg-green" },
  yellow:     { hex: 0xffff00, css: "bg-yellow" },
  neonOrange: { hex: 0xff6600, css: "bg-neonOrange" },
};
const PALETTE = Object.keys(CART_COLORS);

// * Menu color picker (cart-rave-menu.js) is the only color selection UI.
// * Color is auto-submitted on hello receipt using localStorage cartRaveColor.
// eslint-disable-next-line no-unused-vars
function renderColorPicker(_availableColors) {}

const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,
  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
  },
  net: {
    // * Non-host renders 100ms behind latest packet for smoothness.
    interpBufferMs: 75,
    // * Host sends authoritative transforms at 20Hz.
    hostSendHz: 40,
    // * Non-host sends client_input at 60Hz.
    clientInputHz: 60,
    // * Keepalive ping interval (ms). Kept well below the server-side reap
    // * timeout (20s) so hosts idle during podium/lobby stay alive.
    keepaliveIntervalMs: 5000,
  },

  gravity: -24,
  fixedTimeStep: 1 / 60,
  maxSubsteps: 4,

  record: {
    radius: 26.4,
    innerRadius: 3.63,
    thickness: 0.6,
    y: -0.3,
    rotationSpeedRadPerSec: 0.35,
    physicsSpinRadPerSec: 0.08,
    friction: 0.8,    // Was 1.95 — high friction catches on trimesh seams
    restitution: 0.05,
    color: 0x050006,
    rimColor: 0xff2bd6,
    surface: {
      concentricRings: {
        count: 96,
        lineWidth: 0.018,
        color: 0x2a2a32,
        yOffset: 0.3,
        innerRadius: 7.15,
        outerRadius: 25.9,
      },
      spindleRing: {
        enabled: true,
        innerRadius: 3.3,
        outerRadius: 3.7,
        color: 0xffffff,
        yOffset: 0.3,
      },
    },
    // Physics-only hole clearance (visual mesh unchanged). Tuned to reduce center-hole
    // sticking and random hopping while keeping a protective expanded collision hole.
    physics: {
      chamferWidth: 0.35,
      holeClearance: 0.45,
      outerBevel: 0.12,
      segments: 72,
    },
    holeAssist: {
      lowFrictionBandM: 1.5,
      lowFriction: 0.05,
      approachDownAccel: 5.0,
      fallThroughAccel: 16.0,
      unstickAccel: 32.0,
    },
  },

  cart: {
    size: {
      x: 1.31,
      y: 1.35, // y undersized vs visual by ~11%; entangled with wheel/spawn-height, deferred
      z: 2.26,
    },
    // * World y for all start slots; xz come from spawnRingRadius + slot angle (see main()).
    spawnHeight: 1.077,
    friction: 1.1,
    restitution: 0.3,
    linearDamping: 0.6,
    angularDamping: 1.2,
    maxPitchRoll: 4.5,
    visualOffset: 0.82,

    ramBoost: {
      enabled: true,
      durationSec: 1.5,
      cooldownSec: 3.0,
      boostedMaxSpeed: 26,
      boostedAccel: null,
      streakDurationSec: 0.4,
      streakSpawnRatePerSec: 12,
      streakLengthMeters: 2.0,
      npc: {
        enabled: true,
        alignmentAngleDeg: 13.2,
        minTargetDistance: 3.6,
        maxTargetDistance: 19.8,
      },
    },

    hop: {
      impulse: 25,           // upward impulse magnitude
      cooldownMs: 500,     // min time between hops
    },

    // NOTE: CoM tuning deferred. Baseline -0.55 is stable-but-boring.
    // Tried y=-0.4 (tippy) and y=-0.45 with z=-0.2 rearward (caused front-flips under acceleration).
    // Next attempt should be small, single-axis changes with angular damping co-tuned:
    //   1. Try y=-0.5 alone, adjust angularDamping 1.5 -> 2.0-2.5 if tippy
    //   2. If that's stable, try y=-0.475
    //   3. Do NOT shift CoM in z until pitch stability is confirmed at target y
    //   4. Revisit only after ram boost and other feel work lands — need full context
    // * Rigid-body localCoM is applied in applyCartMassPropertiesOverride (not this object).
  },

  driving: {
    maxSpeed: 17.0,
    reverseMaxSpeed: 8.0,
    accel: 150.0,
    braking: 35.0,
    steeringTorque: 110.0,
    tankYawRate: 5.6, // rad/s at full input (in-place rotation)
    yawResponsiveness: 22.0, // higher = snaps to desired yaw rate faster
    lateralGrip: 16.0,
    driftGripFactor: 0.35, // lower = more sideways slide while turning
    driftImpulseStrength: 0.55, // sideways push while turning at speed
    airControlFactor: 0.15,
  },

  scoring: {
    // * Critical bonus triggers on committed rams. Threshold 11.0 is now
    // * well below maxSpeed=17, meaning most committed driving will crit.
    // * Intentionally generous after playtest feedback. Ram-boosted rams
    // * (boostedMaxSpeed=26) always crit.
    criticalVelocityThreshold: 11.0,
  },

  ramming: {
    minSpeed: 0.8,
    strength: 2.64, // 8.0 × 0.33
    maxImpulse: 200.0,
  },

  fall: {
    yThreshold: -10,
    respawnDelayMs: 600,
  },

  booth: {
    // Platform
    platformY: 4.0,            // top-surface Y of the raised booth
    platformWidth: 7.0,        // X-extent (side to side)
    platformDepth: 5.0,        // Z-extent (front to back, not counting ramp)
    platformThickness: 0.6,    // slab height

    // Ramp (slopes from platform front edge down toward arena)
    rampLength: 0,             // how far the ramp extends toward the arena
    rampWidth: 5.0,            // slightly narrower than platform
    rampEndY: 0.1,             // bottom of ramp — almost flush with record surface, not touching
    rampThickness: 0.3,

    // Gap — distance from ramp bottom edge to arena outer rim
    gapDistance: 1.5,

    // Railings
    railHeight: 1.8,
    railThickness: 0.12,

    // DJ gear (behind cart spawn)
    gearEnabled: true,

    // Neon color cycling
    neonColor1: 0xff2bd6,       // fuchsia
    neonColor2: 0x2bd6ff,       // neon blue
    neonCycleSpeed: 0.4,        // cycles per second

    // Physics
    friction: 2.0,
    restitution: 0.0,
  },

  camera: {
    fov: 55,
    minFov: 50,
    maxFov: 75,
    followBack: 8.36,
    followUp: 3.894,
    lookAhead: 5.0,
    lookUp: 1.2,
    positionDamping: 10.0,
    rotationDamping: 12.0,
    snapDistance: 80.0,
  },

  audio: {
    musicVolume: 0.1725,
  },
};

// Spawn ring radius: place carts on booths, which sit beyond the arena edge + gap + ramp
// Booth center distance = record.radius + booth.gapDistance + booth.rampLength + booth.platformDepth/2
CONFIG.cart.spawnRingRadius = CONFIG.record.radius + CONFIG.booth.gapDistance + CONFIG.booth.rampLength + CONFIG.booth.platformDepth / 2;
// Spawn height: on top of the booth platform
CONFIG.cart.spawnHeight = CONFIG.booth.platformY + CONFIG.booth.platformThickness / 2 + CONFIG.cart.size.y / 2 + 0.05;

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

/** Live refs from main.js for Netcode.registerGameCallbacks. */
function createNetcodeCallbackDeps() {
  return {
    detectGameMode,
    palette: PALETTE,
    initialNpcNames,
    markFirstHelloReceived,
    getOnGameStartHandler: () => onGameStartHandler,
    getMenuVisible: () => menuVisible,
    invokeHideMenu: () => { if (hideMenuRef) hideMenuRef(); },
    updateCartMaterialsFromSlots,
    updateHudColorsFromSlots,
    updateNameLabelsRef,
    getNameLabelUpdatePending: () => nameLabelUpdatePending,
    setNameLabelUpdatePending: (val) => { nameLabelUpdatePending = val; },
    respawnLocalMidRoundJoinRef,
    getPlayCollisionRef: () => playCollisionRef,
    getSfx: () => gameSfx,
    getSpawnTrashBurstRef: () => spawnTrashBurstRef,
    getHud: () => hud,
    colorHexForSlot,
    getPendingColorKey: () => pendingColorKey,
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorKey: (val) => { pendingColorKey = val; },
    setPendingColorChipEl: (val) => { pendingColorChipEl = val; },
    getLocalColorPicked: () => _localColorPicked,
    setLocalColorPicked: (val) => { _localColorPicked = val; },
    renderColorPicker,
    recordPodiumStats,
    getCrowd: () => crowd,
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { pendingMidRoundJoinRespawnConnId = val; },
  };
}

function bootstrapNetcodeEntryFromUrl() {
  if (typeof window === "undefined") return;

  Netcode.registerGameCallbacks(createNetcodeCallbackDeps());

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

const CLIENT_NPC_NAME_POOL = [
  "CartNapper",
  "WheelSnipe",
  "BuggyBrawler",
  "TrolleyTerror",
  "AisleDrifter",
  "CartJacker",
  "PushNPray",
  "WobbleBot",
  "RimRattler",
  "BasketCase",
  "SkidMark",
  "BumperDumper",
  "RollCage",
  "HotWheelz",
  "CurbStomp",
  "CartBlanche",
  "DriftWood",
  "NitroNancy",
  "TurboTuesday",
  "WipeOut",
  "SendIt",
  "FullSend",
  "YeetCart",
  "NoBrakes",
  "CartGod",
  "Spinout",
  "ParkingPal",
  "LaneCrasher",
  "CartWheel",
  "RampRat",
];

function shuffledClientNpcNames(count) {
  const names = [...CLIENT_NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, count);
}

const initialNpcNames = shuffledClientNpcNames(4);

let firstHelloReceived = false;
let resolveFirstHello = null;
const firstHelloPromise = new Promise((resolve) => {
  resolveFirstHello = resolve;
});

function markFirstHelloReceived() {
  if (firstHelloReceived) return;
  firstHelloReceived = true;
  resolveFirstHello?.(Netcode.getNetSlots());
}

function syncRoundPhase(phase) {
  GameState.setRoundPhase(phase);
  try {
    Simulation.setRoundPhase(phase);
  } catch (e) {}
}
/** @type {((msg: object) => void) | null} */
let onGameStartHandler = null;
/** @type {(() => void) | null} Set by main() once hideMenu is defined; bridges module-level renderColorPicker to the inner function. */
let hideMenuRef = null;
/** Set to true the moment a color-dot is clicked, preventing slots-message re-renders from re-opening the picker before server confirmation arrives. */
let _localColorPicked = false;
/** @type {HTMLElement | null} */
let pendingColorChipEl = null;
/** @type {string | null} */
let pendingColorKey = null;
let menuColorPickListenerWired = false;
/** @type {boolean} */
let menuVisible = true; // Step 10b: menu visibility flag
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
let masterGain = AUDIO_VOLUME_DEFAULT; // Step 10d: Volume control (0.0 to AUDIO_VOLUME_MAX)
/** @type {number} */
let sfxVolume = AUDIO_VOLUME_DEFAULT;
/** @type {null | { ensureStarted: () => void; applyAmbient: () => void; bump: () => void }} */
let crowd = null;
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
let isMuted = false; // Step 10d: Mute state

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
/** @type {{ current: (() => void) | null }} */
const updateNameLabelsRef = { current: null };
/** @type {{ current: (() => void) | null }} */
const respawnLocalMidRoundJoinRef = { current: null };
/** @type {{ current: (() => void) | null }} */
const resetSimTimingRef = { current: null };
/** @type {string | null} */
let pendingMidRoundJoinRespawnConnId = null;

function updateCartMaterialsFromSlots(slots) {
  if (!allCartsRef || !Array.isArray(slots)) return;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const cart = allCartsRef[slotIndex];
    if (!slot || !cart?.mesh) continue;

    const colorData = CART_COLORS[slot.color];
    const finalHex = colorData ? colorData.hex : 0x888888;
    if (finalHex === cart.cartColor) continue;

    const cache = cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh));

    // Wheels: keep dark chrome, only update subtle emissive tint.
    for (const mat of cache.wheelGlowMats) {
      mat.emissive.setHex(finalHex);
      mat.emissiveIntensity = 0.15;
    }

    // Frame: recolor and update emissive glow.
    for (const mat of cache.frameMats) {
      if (mat.color) mat.color.setHex(finalHex);
      if (mat.emissive) {
        mat.emissive.setHex(finalHex);
        mat.emissiveIntensity = 0.6;
      }
      if (typeof mat.metalness === "number") mat.metalness = 0.7;
      if (typeof mat.roughness === "number") mat.roughness = 0.3;
      if (typeof mat.envMapIntensity === "number") mat.envMapIntensity = 0.15;
    }

    // Keep the cached hex in sync so respawn rebuilds use the right color
    cart.cartColor = finalHex;
  }
}

function updateHudColorsFromSlots(slots) {
  if (!hud || !hud.scoreBoxes || !Array.isArray(slots)) return;

  slots.forEach((slot, i) => {
    const scoreBox = hud.scoreBoxes[i];
    if (!scoreBox || !scoreBox.box) return;
    if (!slot || !slot.color) return;

    const data = CART_COLORS[slot.color];
    if (!data) return;

    const box = scoreBox.box;
    box.className = "hud-scoreBox";
    box.dataset.hudColor = slot.color;
  });
}

function localCartForConnId() {
  const carts = allCartsRef || [];
  const idx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
  if (idx < 0) return null;
  return carts[idx] || null;
}

// === GAME LOOP ===

async function main() {
  await RAPIER.init();

  let sfx = null;
  let labelRenderer = null;
  let input = null;

  // --- Canvas & input ---
  const canvas = document.getElementById(CONFIG.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas element '#${CONFIG.canvasId}' not found.`);
  }
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
      const mySlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      const cart = mySlot >= 0 && allCarts[mySlot] ? allCarts[mySlot] : localCartForConnId();
      triggerHop(cart, performance.now());
    },
    () => {
      const cart = localCartForConnId();
      if (!cart) return;
      triggerRamBoost(cart, performance.now());
    }
  );

  // --- Renderer & scene ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0520, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0520, 0.006);

  const { ramBoostStreaks } = Effects.initEffects(scene, { ramBoost: CONFIG.cart.ramBoost, cartColors: CART_COLORS });
  spawnTrashBurstRef = Effects.spawnTrashBurst;

  // * Environment map for IBL: gives metallic materials something to reflect.
  // * No scene.background is set so the void stays pure black.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  pmremGenerator.dispose();

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
  const gameCtx = createGameContext().registerModules({
    Netcode,
    GameState,
    Simulation,
    Entities,
    Input,
    HUD,
  });
  let fovPunchUntil = 0;
  const BASE_FOV = CONFIG.camera.fov;

  let ensureCartCrashBufferLoaded = () => {};
  const audioSystem = initAudioSystem(audioListener, {
    getSfxVolume: () => sfxVolume,
    getIsMuted: () => isMuted,
    onCollisionShake: (i) => {
      shakeIntensity = i * 8 * 2; // max ~16px offset
      shakeUntil = performance.now() + 225 + i * 150; // ~50% longer than before
    },
  });
  sfx = audioSystem.sfx;
  if (!crowd) crowd = audioSystem.crowd;
  if (!leaderHum) leaderHum = audioSystem.leaderHum;
  ensureCartCrashBufferLoaded = audioSystem.ensureCartCrashBufferLoaded;
  playCollisionRef = sfx.playCollision;
  gameSfx = sfx;
  GameAudio.registerMusicVolumeDeps({
    audioListener,
    getSfxVolume: () => sfxVolume,
  });
  GameAudio.registerAudioRefs({ sfx, crowd, leaderHum });
  GameAudio.applyAudioVolume();
  camera.add(audioListener);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0.35,
    0.3,
  );
  composer.addPass(bloomPass);
  if (!bloomEnabled && bloomPass) bloomPass.enabled = false;
  const fxClock = new THREE.Clock();
  const VignetteShader = {
    uniforms: {
      tDiffuse: { value: null },
      darkness: { value: 0.15 },
      offset: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float darkness;
      uniform float offset;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float dist = distance(vUv, vec2(0.5));
        float vig = smoothstep(0.8, offset * 0.5, dist * (darkness + offset));
        color.rgb *= vig;
        gl_FragColor = color;
      }
    `,
  };
  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  const FxShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0.0 },
      uChromaStrength: { value: 0.003 },
      uGrainStrength: { value: 0.04 },
      uScanlineStrength: { value: 0.03 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uChromaStrength;
      uniform float uGrainStrength;
      uniform float uScanlineStrength;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 fromCenter = vUv - center;
        float dist = length(fromCenter);
        vec2 dir = dist > 0.00001 ? (fromCenter / dist) : vec2(0.0);
        vec2 off = dir * dist * uChromaStrength;

        vec4 cR = texture2D(tDiffuse, vUv + off);
        vec4 cG = texture2D(tDiffuse, vUv);
        vec4 cB = texture2D(tDiffuse, vUv - off);
        vec4 color = vec4(cR.r, cG.g, cB.b, cG.a);

        float n = rand(gl_FragCoord.xy + vec2(uTime * 123.45, uTime * 67.89));
        color.rgb += (n - 0.5) * uGrainStrength;

        float scanline = sin(gl_FragCoord.y * 1.5) * 0.5 + 0.5;
        color.rgb -= (1.0 - scanline) * uScanlineStrength;

        gl_FragColor = color;
      }
    `,
  };
  fxPass = new ShaderPass(FxShader);
  composer.addPass(fxPass);
  if (!fxPassEnabled) fxPass.enabled = false;

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.setSize(w, h);
    if (fxPass && fxPass.uniforms && fxPass.uniforms.uResolution) {
      fxPass.uniforms.uResolution.value.set(w, h);
    }
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    updateCameraFraming();
    camera.updateProjectionMatrix();
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
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) hudAudio.style.display = "none";
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
      window.CartRave?.show?.();
    }

    // Cosmetic: mark color chip as pending until server confirms slots.
    if (!menuColorPickListenerWired) {
      menuColorPickListenerWired = true;
      const colorRow = document.getElementById("cr-color-row");
      if (colorRow) {
        colorRow.addEventListener("click", (e) => {
          const chip = e.target && e.target.closest ? e.target.closest(".cr-color-chip") : null;
          if (!chip) return;
          pendingColorChipEl?.classList.remove("color-pending");
          pendingColorChipEl = chip;
          pendingColorChipEl.classList.add("color-pending");
          _localColorPicked = true;
          const colorToSend = localStorage.getItem("cartRaveColor");
          pendingColorKey = colorToSend && PALETTE.includes(colorToSend) ? colorToSend : null;
          if (pendingColorKey && Netcode.getPartySocket() && Netcode.getPartySocket().readyState === WebSocket.OPEN) {
            Netcode.getPartySocket().send(JSON.stringify({ type: MSG.colorPick, color: pendingColorKey }));
          }
        });
      }
    }

    const room = Netcode.resolvedPartyRoomFromUrl();
    if (room && room.toLowerCase().startsWith("solo")) {
      hideMenu();
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
      }
    }

    // Wire new menu button events
    window.addEventListener("cartrave:menu", (e) => {
      const action = e.detail.action;
      if (action === "joinroom") {
        const room = pendingInviteRoomFromUrl;
        if (!room) return;
        pendingInviteRoomFromUrl = null;
        document.getElementById("cr-btn-join-invite")?.remove();
        hideMenu();
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
        hideMenu();
        Netcode.initNetcode();
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        hideMenu();
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
            hideMenu();
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

    if (crMuteBtn) {
      crMuteBtn.addEventListener("click", () => {
        setAllAudioMuted(!isMuted);
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
        syncMenuVolume();
      });
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

    // Sync new menu name to localStorage for join message
    const crNameText = document.getElementById("cr-name-text");
    if (crNameText) {
      // Set initial value from localStorage
      const saved = localStorage.getItem("cartRaveUsername");
      if (saved) crNameText.textContent = saved;

      // Watch for changes via MutationObserver
      const nameObs = new MutationObserver(() => {
        const name = crNameText.textContent.trim();
        if (name) localStorage.setItem("cartRaveUsername", name);
      });
      nameObs.observe(crNameText, { childList: true, characterData: true, subtree: true });
    }

    // Also sync the menu JS state
    const crNameInput = document.getElementById("cr-name-input");
    if (crNameInput) {
      crNameInput.addEventListener("blur", () => {
        const name = crNameInput.value.trim();
        if (name) localStorage.setItem("cartRaveUsername", name);
      });
    }
  }

  function hideMenu() {
    const wrap = document.getElementById("cr-root");
    window.CartRave?.stopAnimations?.();
    if (wrap) {
      wrap.style.opacity = "0";
      wrap.style.pointerEvents = "none";
      setTimeout(() => {
        wrap.style.display = "none";
      }, 300);
    }
    menuVisible = false;
    try { crowd?.ensureStarted?.(); } catch {}
    if (labelRenderer) labelRenderer.domElement.style.display = "block";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) hudAudio.style.display = "flex";
    // Crossfade: fade out menu music, fade in game music.
    GameAudio.fadeOutMenuMusic();
    GameAudio.fadeInGameMusic();
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
    getDefaultRoundMs: () => 95000,
    getCountdownMs: () => 3000,
  });
  const resultsUi = initResultsOverlay({
    onMainMenuClick: () => podiumAutoContinue.clear(),
  });
  initMenu();
  hideMenuRef = hideMenu;

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * initNetcode() is top-level and cannot call hideMenu/startCountdown directly.
  onGameStartHandler = (msg) => {
    if (menuVisible) hideMenu();
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
    const { overlay, title, finalScores, history, playAgain, statsLine } = resultsUi;
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
          title.style.setProperty("--title-glow", getColorForSlot(Netcode.getNetSlots()[idx]));
        } else {
          title.textContent = "ROUND COMPLETE";
          title.style.setProperty("--title-glow", "#ffffff");
        }
      }

      finalScores.replaceChildren();
      for (let i = 0; i < 4; i += 1) {
        const s = scores[i] != null ? scores[i] : 0;
        const row = document.createElement("div");
        row.className = "results-score-row";
        const isWinner = winnerIdx !== "draw" && winnerIdx === i;
        if (isWinner) row.classList.add("is-winner");
        row.style.setProperty("--slot-glow", getColorForSlot(Netcode.getNetSlots()[i]));

        const nameEl = document.createElement("span");
        nameEl.className = "results-score-name";
        nameEl.textContent = slotDisplayName(i);

        const valEl = document.createElement("span");
        valEl.className = "results-score-val";
        valEl.textContent = `${s} pts`;

        row.appendChild(nameEl);
        row.appendChild(valEl);
        finalScores.appendChild(row);
      }

      history.replaceChildren();
      if (matchHistory.length === 0) {
        const emptyRow = document.createElement("div");
        emptyRow.textContent = "No prior matches this session.";
        history.appendChild(emptyRow);
      } else {
        for (let i = matchHistory.length - 1; i >= 0; i -= 1) {
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

      maybeScheduleAutoContinuePodium();
    } else {
      clearAutoContinuePodiumTimeout();
      autoContinuePodiumKey = null;
      lastResultsOverlayKey = null;
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
  }


  // --- Arena, physics, world visuals ---
  // Minimal ambient + a few colored spotlights for "neon" vibe.
  scene.add(new THREE.AmbientLight(0x221133, 0.15));

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  const {
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
  } = initArena(scene, world, CONFIG);

  const sceneExtras = initSceneExtras(scene, pitInnerRadius);
  const {
    ufoEntries,
    spotlightEntries,
    spotlightPositionRadius,
    spotlightHeight,
    spotlightDriftAmplitudeRad,
    platformTopY,
    recordSurfaceGlowY,
    spotlightLightPosScratch,
    spotlightTargetScratch,
    positionSpotlightBeam,
  } = sceneExtras;

  Effects.initCrowd(scene, CART_COLORS, pitInnerRadius);

  Effects.initStage(scene, pitInnerRadius, CART_COLORS);
  Effects.initBillboard(scene, pitInnerRadius);
  Effects.initLasers(scene, pitInnerRadius, CART_COLORS);

  // --- Carts, labels, gameplay helpers ---
  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + CONFIG.fall.respawnDelayMs;
    if (cart === localCartForConnId()) {
      sfx.playFallOff();
    }
  }

  respawnLocalMidRoundJoinRef.current = () => {
    const localConnId = Netcode.getYouConnId();
    if (!localConnId || pendingMidRoundJoinRespawnConnId !== localConnId) return;
    if (GameState.getRoundState().phase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    pendingMidRoundJoinRespawnConnId = null;
  };

  GameAudio.initMusic({
    getMasterGain: () => masterGain,
    getIsMuted: () => isMuted,
    getMenuVisible: () => menuVisible,
    startMenuOnInit: menuVisible,
  });

  await firstHelloPromise;

  const { allCarts, colliderHandleToCart, nextPendingMidRoundJoinRespawnConnId } = Entities.initCarts({
    scene,
    world,
    ramBoostStreaks,
    netSlots: Netcode.getNetSlots(),
    youConnId: Netcode.getYouConnId(),
    CART_COLORS,
    colorHexForSlot,
    pendingMidRoundJoinRespawnConnId,
  });
  pendingMidRoundJoinRespawnConnId = nextPendingMidRoundJoinRespawnConnId;

  // Expose carts to netcode.
  allCartsRef = allCarts;
  Netcode.setRefs({ allCartsRef: allCarts });
  if (Netcode.getIsHost() && !Netcode.getHostSendTimer()) Netcode.startHostSendLoop();

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

  function updateNameLabels() {
    for (let i = 0; i < allCarts.length; i++) {
      const slot = Netcode.getNetSlots()[i];
      const cart = allCarts[i];
      if (!slot || !cart || !cart.mesh) continue;

      const name = slot.name || `P${i + 1}`;
      const colorHex = CART_COLORS[slot.color]?.hex;
      const colorCSS = colorHex ? "#" + colorHex.toString(16).padStart(6, "0") : "#ffffff";

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

  updateNameLabelsRef.current = updateNameLabels;
  updateNameLabels();

  getAxisRef = input.getAxis;
  triggerRamBoostRef = triggerRamBoost;
  Netcode.setRefs({
    getAxisRef: input.getAxis,
    isNitroHeldRef: input.isNitroHeld,
    triggerRamBoostRef: triggerRamBoost,
    resetSimTimingRef,
  });

  const ramBoostForwardXZ = new THREE.Vector3();
  const ramBoostToTargetXZ = new THREE.Vector3();

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
    if (cart === localCartForConnId()) {
      sfx.playNitro();
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
    const { forward } = Simulation.getForwardRightFromYaw(yaw);
    const op = nearestOther.body.translation();
    ramBoostToTargetXZ.set(op.x - p.x, 0, op.z - p.z);
    if (ramBoostToTargetXZ.lengthSq() < 1e-8) return;
    ramBoostToTargetXZ.normalize();
    ramBoostForwardXZ.set(forward.x, 0, forward.z);
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
    if (ctx.state === "suspended") {
      void ctx.resume().then(
        () => { ensureCartCrashBufferLoaded(); },
        () => {},
      );
    } else {
      ensureCartCrashBufferLoaded();
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
    if (GameState.getRoundState().phase === "countdown" || GameState.getRoundState().phase === "running") return;
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
  resetSimTimingRef.current = () => resetGameLoopTiming(gameCtx.loopState);

  const sharedLoopGetters = gameCtx.createSharedGetters();

  const visualDeps = {
    ...sharedLoopGetters,
    netTargetPosScratch,
    cartLinvelScratch,
    updateCartVisuals,
    buildCartMaterialCache,
    colorHexForSlot,
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
    shakeIntensity,
    getFovPunchUntil: () => fovPunchUntil,
    fpsState,
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
    colorHexForSlot,
    hud,
    sendHostRound: () => Netcode.sendHostRound(),
    getPartySocket: () => Netcode.getPartySocket(),
    MSG,
    setFovPunchUntil: (untilMs) => { fovPunchUntil = untilMs; },
    camera,
    getPhysicsWorld: () => world,
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
      partySocket: Netcode.getPartySocket(),
      recordColliderHandle: recordCollider.handle,
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
      partySocket: Netcode.getPartySocket(),
      recordColliderHandle: recordCollider.handle,
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
    recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;

    if (spotlightEntries.length > 0) {
      const nowSec = performance.now() * 0.001;
      for (const entry of spotlightEntries) {
        const drift =
          Math.sin(nowSec * entry.driftSpeed * Math.PI * 2 + entry.phase) *
          spotlightDriftAmplitudeRad;
        const angle = entry.baseAngleRad + drift;
        spotlightLightPosScratch.set(
          Math.cos(angle) * spotlightPositionRadius,
          spotlightHeight,
          Math.sin(angle) * spotlightPositionRadius,
        );
        spotlightTargetScratch.set(spotlightLightPosScratch.x, platformTopY, spotlightLightPosScratch.z);
        entry.light.position.copy(spotlightLightPosScratch);
        entry.light.target.position.copy(spotlightTargetScratch);
        entry.light.target.updateMatrix();
        positionSpotlightBeam(entry.beamGroup, spotlightLightPosScratch, spotlightTargetScratch);
        entry.glowMesh.position.set(spotlightTargetScratch.x, recordSurfaceGlowY, spotlightTargetScratch.z);
      }
    }

    Effects.updateStageLights(now);
    Effects.updateLasers(now);

    // UFO orbit
    for (const ufo of ufoEntries) {
      const angle = now * 0.001 * ufo.orbitSpeed + ufo.phaseOffset;
      ufo.group.position.set(
        Math.cos(angle) * ufo.orbitRadius,
        ufo.orbitHeight + Math.sin(angle * 2) * 10,
        Math.sin(angle) * ufo.orbitRadius,
      );
      ufo.group.rotation.y = angle + Math.PI;
    }

    Effects.updateCrowd(now);

    {
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
    if (boothNeonMeshes.length > 0) {
      const t = (Math.sin(performance.now() * 0.001 * Math.PI * 2 * CONFIG.booth.neonCycleSpeed) + 1) / 2;
      boothNeonMixed.copy(boothNeonColor1).lerp(boothNeonColor2, t);
      for (const m of boothNeonMeshes) {
        m.material.color.copy(boothNeonMixed);
        m.material.emissive.copy(boothNeonMixed);
      }
    }

    Effects.updateStageLed(now);
    Effects.updateBillboard(now);

    updateGameFlow(gameCtx.deps.gameFlow, gameCtx.makePhaseContext(dt));

    runPhysicsStep(gameCtx.loopState, gameCtx.deps.physics, { now, dt });
    frameCtx.dt = dt;
    },
    onVisualUpdate(frameCtx) {
      gameCtx.setFrameCtx(frameCtx);
      updateVisualsAndEffects(gameCtx.deps.visual, gameCtx.frameCtx);
    },
  });

  window.addEventListener("resize", updateViewport);
}

function isMobileGameplayBlocked() {
  try {
    return (
      typeof window !== "undefined" &&
      ("ontouchstart" in window) &&
      (navigator.maxTouchPoints || 0) > 1 &&
      (window.innerWidth || 0) < 1024
    );
  } catch {
    return false;
  }
}

let __kbmToastHideTimer = null;
function showKbmRequiredToast() {
  const el = document.getElementById("cr-kbm-toast");
  if (!el) return;

  if (__kbmToastHideTimer) {
    clearTimeout(__kbmToastHideTimer);
    __kbmToastHideTimer = null;
  }

  el.style.display = "inline-flex";
  el.style.opacity = "1";
  el.style.pointerEvents = "auto";

  __kbmToastHideTimer = setTimeout(() => {
    el.style.display = "none";
    __kbmToastHideTimer = null;
  }, 3000);
}

function initMobileMenuAudioOnly() {
  const menuMusicUrl = new URL("sounds/menu.mp3", window.location.href).toString();
  const menuMusicEl = new Audio();
  menuMusicEl.loop = true;
  menuMusicEl.preload = "auto";
  menuMusicEl.src = menuMusicUrl;
  try { menuMusicEl.load(); } catch {}

  const applyMenuMusicVolume = () => {
    menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
    menuMusicEl.muted = isMuted;
  };

  let started = false;
  const tryStartMenuMusic = () => {
    if (started || isMuted) return;
    applyMenuMusicVolume();
    void menuMusicEl.play().then(
      () => { started = true; },
      () => {},
    );
  };

  tryStartMenuMusic();
  window.addEventListener("pointerdown", tryStartMenuMusic, { passive: true });
  window.addEventListener("keydown", tryStartMenuMusic, { once: true });

  // Wire menu audio UI (mute + volume slider) without Three/WebAudio.
  const crMuteBtn = document.getElementById("cr-mute-btn");
  const crMusicVolTrack = document.getElementById("cr-music-vol-track");
  const crMusicVolFill = document.getElementById("cr-music-vol-fill");
  const crMusicVolVal = document.getElementById("cr-music-vol-val");

  const syncMenuVolumeUi = () => {
    if (crMusicVolFill) crMusicVolFill.style.setProperty("--vol-scale", String(isMuted ? 0 : masterGain / AUDIO_VOLUME_MAX));
    if (crMusicVolVal) crMusicVolVal.textContent = isMuted ? "OFF" : String(Math.round((masterGain / AUDIO_VOLUME_MAX) * 100));
    if (crMuteBtn) crMuteBtn.classList.toggle("muted", isMuted);
  };

  const setAllAudioMuted = (muted) => {
    isMuted = Boolean(muted);
    try { localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false"); } catch {}
    applyMenuMusicVolume();
    syncMenuVolumeUi();
  };

  const setMasterGain = (v) => {
    masterGain = clamp(v, 0, AUDIO_VOLUME_MAX);
    try { localStorage.setItem("cartRaveVolume", String(Math.round((masterGain / AUDIO_VOLUME_MAX) * 100))); } catch {}
    applyMenuMusicVolume();
    syncMenuVolumeUi();
  };

  try {
    const savedVol = localStorage.getItem("cartRaveVolume");
    if (savedVol !== null) {
      const parsed = parseInt(savedVol, 10);
      if (!Number.isNaN(parsed)) {
        setMasterGain((parsed / 100) * AUDIO_VOLUME_MAX);
      }
    }
  } catch {}
  try {
    const savedMute = localStorage.getItem("cartRaveMuted");
    if (savedMute !== null) setAllAudioMuted(savedMute === "true");
  } catch {}
  syncMenuVolumeUi();

  if (crMuteBtn) {
    crMuteBtn.addEventListener("click", () => setAllAudioMuted(!isMuted));
  }
  if (crMusicVolTrack) {
    crMusicVolTrack.addEventListener("pointerdown", (e) => {
      const rect = crMusicVolTrack.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      setMasterGain(x * AUDIO_VOLUME_MAX);
    });
  }
}

function initMobileGameplayBlock() {
  const toast = document.getElementById("cr-kbm-toast");
  const toastClose = document.getElementById("cr-kbm-toast-close");
  if (toast) {
    toast.addEventListener("click", () => { toast.style.display = "none"; });
  }
  if (toastClose) {
    toastClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toast.style.display = "none";
    });
  }

  const friendsScreen = document.getElementById("cr-friends-screen");
  const friendsLink = document.getElementById("cr-friends-link");
  const friendsCopy = document.getElementById("cr-friends-copy");
  const friendsEnter = document.getElementById("cr-friends-enter");
  const friendsBack = document.getElementById("cr-friends-back");
  const menuRoot = document.getElementById("cr-root");

  const showFriendsScreen = () => {
    const roomId = `party${Math.random().toString(36).substring(2, 8)}`;
    const cleanLink = new URL(window.location.origin + window.location.pathname);
    cleanLink.searchParams.set("room", roomId);
    const roomLink = cleanLink.toString();
    if (friendsLink) friendsLink.value = roomLink;
    window.CartRave?.stopAnimations?.();
    if (menuRoot) menuRoot.style.display = "none";
    if (friendsScreen) friendsScreen.style.display = "flex";
    if (friendsCopy) friendsCopy.textContent = "COPY";
  };

  if (friendsCopy) {
    friendsCopy.onclick = () => {
      const value = friendsLink?.value || "";
      navigator.clipboard.writeText(value).catch(() => {});
      friendsCopy.textContent = "COPIED!";
      setTimeout(() => { friendsCopy.textContent = "COPY"; }, 1500);
    };
  }
  if (friendsEnter) {
    friendsEnter.onclick = () => {
      showKbmRequiredToast();
    };
  }
  if (friendsBack) {
    friendsBack.onclick = () => {
      if (friendsScreen) friendsScreen.style.display = "none";
      window.CartRave?.show?.();
    };
  }

  window.addEventListener("cartrave:menu", (e) => {
    const action = e?.detail?.action;
    if (action === "friends") {
      showFriendsScreen();
      return;
    }
    showKbmRequiredToast();
  });
}

if (isMobileGameplayBlocked()) {
  initMobileMenuAudioOnly();
  initMobileGameplayBlock();
} else {
  bootstrapNetcodeEntryFromUrl();
  main();
}
