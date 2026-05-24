import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { EffectComposer } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/ShaderPass.js";
import { mergeGeometries } from "https://unpkg.com/three@0.164.1/examples/jsm/utils/BufferGeometryUtils.js";
import { CSS2DObject, CSS2DRenderer } from "https://unpkg.com/three@0.164.1/examples/jsm/renderers/CSS2DRenderer.js";
import { Reflector } from "https://unpkg.com/three@0.164.1/examples/jsm/objects/Reflector.js";
import { RoomEnvironment } from "https://unpkg.com/three@0.164.1/examples/jsm/environments/RoomEnvironment.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import PartySocket from "partysocket";
import { buildCart, resetCartVisualState, updateCartVisuals } from "./cart.js";
import * as Simulation from "./src/simulation.js";
import * as Entities from "./src/entities.js";
import * as HUD from "./src/hud.js";
import * as Input from "./src/input.js";
import * as Netcode from "./src/netcode.js";
import * as GameState from "./src/gameState.js";
import * as GameAudio from "./src/audio.js";
import * as SceneMod from "./src/scene.js";
import * as Effects from "./src/visuals.js";



// eslint-disable-next-line no-console
console.log("%cHI :D", "font-size:32px;color:#ff2bd6;font-weight:bold;text-shadow:0 0 10px #ff2bd6");

/**
 * Safely disposes a Three.js subtree (geometries + materials).
 * Skips disposing geometry for meshes tagged with `userData.isSharedGeometry`.
 * @param {THREE.Object3D | null | undefined} root
 */
function disposeObject3D(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);

  /**
   * @param {THREE.Material | THREE.Material[]} material
   */
  function disposeMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach((m) => m && typeof m.dispose === "function" && m.dispose());
      return;
    }
    if (material && typeof material.dispose === "function") material.dispose();
  }

  root.traverse((child) => {
    // Dispose any materials found on renderables.
    if (child.material) disposeMaterial(child.material);

    // Dispose geometries unless explicitly marked as shared.
    const isShared = Boolean(child.userData && child.userData.isSharedGeometry);
    if (!isShared && child.geometry && typeof child.geometry.dispose === "function") {
      child.geometry.dispose();
    }
  });
}

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

// * PartyKit public host after `npx partykit deploy` (partykit.dev). Local dev uses 127.0.0.1:1999.
const PARTYKIT_PUBLIC_HOST = "cart-rave.wyabro.partykit.dev";

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
    friction: 2.6,
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
  },

  cart: {
    size: {
      x: 1.31,
      y: 1.35, // y undersized vs visual by ~11%; entangled with wheel/spawn-height, deferred
      z: 2.26,
    },
    // * World y for all start slots; xz come from spawnRingRadius + slot angle (see main()).
    spawnHeight: 1.077,
    friction: 1.8,
    restitution: 0.3,
    linearDamping: 2.5,
    angularDamping: 8.25,
    maxPitchRoll: 0.99,
    visualOffset: 0.45,

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
    strength: 8.0,
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

function partyHostFromWindowLocation() {
  const hostname = window.location.hostname;
  const isLocalHostname =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  if (isLocalHostname) {
    return `${hostname}:1999`;
  }
  const publicHost = PARTYKIT_PUBLIC_HOST.trim();
  return publicHost ? publicHost : `${hostname}:1999`;
}

function resolvedPartyRoomFromUrl() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  const isValid = /^[A-Za-z0-9]{2,16}$/.test(raw);
  return isValid ? raw : "quickplay";
}

/** Valid ?room= on first paint: show menu before PartyKit connect (friend links). */
let pendingInviteRoomFromUrl = null;
let skipMenuForPortalBypass = false;

function isPortalWebringBypassFromUrl() {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search || "").get("portal");
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function getPortalQueryParams() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search || "");
  if (!isPortalWebringBypassFromUrl()) return null;
  return {
    username: p.get("username") || null,
    color: p.get("color") || null,
    speed: p.get("speed") || null,
    ref: p.get("ref") || null,
    avatar_url: p.get("avatar_url") || null,
    team: p.get("team") || null,
    hp: p.get("hp") || null,
  };
}

const incomingPortalParams = getPortalQueryParams();

let returnPortalTriggered = false;
let returnPortalArmedAtMs = 0;
const returnPortalWorldPositions = [];

function buildExitPortalUrl() {
  if (typeof window === "undefined") return "https://vibej.am/portal/2026";
  const url = new URL("https://vibej.am/portal/2026");
  url.searchParams.set("ref", window.location.origin + window.location.pathname);
  const mySlot = Netcode.getNetSlots()?.find((s) => s && s.connId === Netcode.getYouConnId());
  if (mySlot?.name) url.searchParams.set("username", mySlot.name);
  if (mySlot?.color) url.searchParams.set("color", mySlot.color);
  return url.toString();
}

function applyPortalWebringBypassToUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", "quickplay");
  history.replaceState({}, "", url);
}

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

function bootstrapNetcodeEntryFromUrl() {
  if (typeof window === "undefined") return;

  Netcode.registerCallbacks({
    detectGameMode: () => detectGameMode(),
    getIncomingPortalParams: () => incomingPortalParams,
    getPALETTE: () => PALETTE,
    getInitialNpcNames: () => initialNpcNames,
    markFirstHelloReceived: () => markFirstHelloReceived(),
    getOnGameStartHandler: () => onGameStartHandler,
    getMenuVisible: () => menuVisible,
    hideMenuRef: () => { if (hideMenuRef) hideMenuRef(); },
    updateCartMaterialsFromSlots: (slots) => updateCartMaterialsFromSlots(slots),
    updateHudColorsFromSlots: (slots) => updateHudColorsFromSlots(slots),
    scheduleNameLabelUpdate: () => {
      if (nameLabelUpdatePending) cancelAnimationFrame(nameLabelUpdatePending);
      nameLabelUpdatePending = requestAnimationFrame(() => {
        nameLabelUpdatePending = null;
        if (updateNameLabelsRef.current) updateNameLabelsRef.current();
      });
    },
    respawnLocalMidRoundJoinRef: () => { if (respawnLocalMidRoundJoinRef.current) respawnLocalMidRoundJoinRef.current(); },
    playCollisionRef: (intensity) => playCollisionRef?.(intensity),
    playFloorImpactRef: (intensity) => sfx?.playFloorImpact?.(intensity),
    playEdgeImpactRef: (intensity) => sfx?.playEdgeImpact?.(intensity),
    spawnTrashBurstRef: (mp, intensity, type) => { if (spawnTrashBurstRef) spawnTrashBurstRef(mp, intensity, type); },
    addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor) => {
      if (hud && hud.addKillFeedEntry) hud.addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor);
    },
    colorHexForSlot: (slot) => colorHexForSlot(slot),
    getPendingColorKey: () => pendingColorKey,
    getPendingColorChipEl: () => pendingColorChipEl,
    setPendingColorKey: (val) => { pendingColorKey = val; },
    setPendingColorChipEl: (val) => { pendingColorChipEl = val; },
    getLocalColorPicked: () => _localColorPicked,
    setLocalColorPicked: (val) => { _localColorPicked = val; },
    renderColorPicker: (colors) => renderColorPicker(colors),
    recordPodiumStats: (winner, scores) => recordPodiumStats(winner, scores),
    bumpCrowd: () => { crowd?.bump?.(); },
    getPendingMidRoundJoinRespawnConnId: () => pendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId: (val) => { pendingMidRoundJoinRespawnConnId = val; }
  });

  if (isPortalWebringBypassFromUrl()) {
    applyPortalWebringBypassToUrl();
    skipMenuForPortalBypass = true;
    Netcode.initNetcode();
    return;
  }
  if (captureInviteRoomForDeferredMenu()) {
    return;
  }
}

// --- Module-scope netcode state ---
// Replaced by Netcode.getPartySocket(), Netcode.getYouConnId(), Netcode.getIsHost()

// * Input bridge for non-host client_input nitro (Shift key).
let localNitroHeld = false;

function cssHexFromRgbNumber(rgb) {
  if (!Number.isFinite(rgb)) return "#888888";
  const hex = Math.floor(rgb).toString(16).padStart(6, "0");
  return `#${hex}`;
}

function getColorForSlot(slot) {
  if (!slot || !slot.color) return "#888888";
  return cssHexFromRgbNumber(CART_COLORS[slot.color]?.hex ?? 0x888888);
}

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

  // Update solo games counter (1 human player match end)
  if (detectGameMode() === "solo") {
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
    let mySlotIdx = Netcode.localSlotIndexForConn(Netcode.getYouConnId());
    if (mySlotIdx < 0) {
      mySlotIdx = Netcode.getNetSlots().findIndex((s) => s && s.kind === "human" && s.connId);
    }
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
let roundAutoStarted = false; // one-shot flag so lobby→countdown only fires once per load
let roundStartingHumanCount = 0;
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
/** @type {ReturnType<typeof setTimeout> | null} */
let lastCartStandingTimeoutId = null;
/** @type {null|number} */
let lastCartStandingWinnerSlotIndex = null;

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
/** @type {string | null} */
let autoReadyConnId = null;

/** @type {ReturnType<typeof setInterval> | null} */
let hostSendTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let inputSendTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let keepaliveTimer = null;

let hostSeq = 0;
let inputSeq = 0;

let hostEpoch = 0;

let serverClockOffsetMs = 0;
let serverClockOffsetSamples = 0;

let lastSlotsJson = "";
let nameLabelUpdatePending = null;

let hostMigrationFreezeUntilMs = 0;

let skipNextPhysicsStep = false;

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

function colorHexForSlot(slot) {
  if (!slot) return 0x888888;
  const c = slot.color;
  if (typeof c === "number") return c;
  return CART_COLORS[c]?.hex ?? 0x888888;
}

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
  const idx = Netcode.localSlotIndexForConn(Netcode.getYouConnId());
  if (idx < 0) return null;
  return carts[idx] || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function initCrowdSfx(audioListener) {
  /** @type {null | { ctx: AudioContext; src: AudioBufferSourceNode; lp: BiquadFilterNode; bp: BiquadFilterNode; g: GainNode }} */
  let nodes = null;
  let started = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let bumpTimeoutId = null;

  const ensureNodes = () => {
    const ctx = audioListener.context;
    if (ctx.state !== "running") return null;
    if (nodes) return nodes;

    const len = 1.0;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.4;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 320;
    bp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    src.connect(lp);
    lp.connect(bp);
    bp.connect(g);
    g.connect(audioListener.gain);

    nodes = { ctx, src, lp, bp, g };
    return nodes;
  };

  const applyAmbient = () => {
    const n = ensureNodes();
    if (!n) return;
    const { ctx, lp, bp, g } = n;
    const now = ctx.currentTime;
    const base = 0.012 * 1.2 * sfxVolume;
    const target = isMuted ? 0.0001 : base;
    g.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.25);
    lp.frequency.setTargetAtTime(900, now, 0.25);
    bp.frequency.setTargetAtTime(320, now, 0.25);
    bp.Q.setTargetAtTime(0.7, now, 0.25);
  };

  const ensureStarted = () => {
    if (started) return;
    const n = ensureNodes();
    if (!n) return;
    try { n.src.start(); } catch {}
    started = true;
    applyAmbient();
  };

  const bump = () => {
    ensureStarted();
    if (isMuted || sfxVolume <= 0) return;
    const n = ensureNodes();
    if (!n) return;
    const { ctx, lp, bp, g } = n;
    const now = ctx.currentTime;
    const ambient = 0.012 * 1.2 * sfxVolume;
    const peak = 0.028 * 1.2 * sfxVolume;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(Math.max(0.0001, peak), now, 0.04);
    lp.frequency.setTargetAtTime(1400, now, 0.05);
    bp.frequency.setTargetAtTime(520, now, 0.05);
    bp.Q.setTargetAtTime(1.2, now, 0.05);

    if (bumpTimeoutId) clearTimeout(bumpTimeoutId);
    bumpTimeoutId = setTimeout(() => {
      bumpTimeoutId = null;
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(Math.max(0.0001, ambient), t, 0.35);
      lp.frequency.setTargetAtTime(900, t, 0.35);
      bp.frequency.setTargetAtTime(320, t, 0.35);
      bp.Q.setTargetAtTime(0.7, t, 0.35);
    }, 1500);
  };

  return { ensureStarted, applyAmbient, bump };
}

function initLeaderHumSfx(audioListener) {
  /** @type {null|number} */
  let currentLeaderSlot = null;

  const playLeadChime = () => {
    if (isMuted || sfxVolume <= 0) return;
    const ctx = audioListener.context;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;

    const out = ctx.createGain();
    const g = 0.15 * sfxVolume;
    out.gain.setValueAtTime(Math.max(0.0001, g), now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    out.connect(audioListener.gain);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(660, now);
    o1.connect(out);
    o1.start(now);
    o1.stop(now + 0.075);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(880, now + 0.075);
    o2.connect(out);
    o2.start(now + 0.075);
    o2.stop(now + 0.15);

    o2.onended = () => {
      try { o1.disconnect(); } catch {}
      try { o2.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
  };

  const setLeader = (slotIndex) => {
    const wants = Number.isFinite(slotIndex) ? slotIndex : null;
    if (wants === currentLeaderSlot) return;

    const localIdx = Netcode.localSlotIndexForConn(Netcode.getYouConnId());
    const wasLocalLeader = currentLeaderSlot !== null && currentLeaderSlot === localIdx;
    const isLocalLeader = wants !== null && wants === localIdx;

    currentLeaderSlot = wants;
    if (!wasLocalLeader && isLocalLeader) {
      playLeadChime();
    }
  };

  const updatePositionFromCart = (cart) => {
    // Non-spatial: no-op.
    void cart;
  };

  const resyncVolume = () => {
    // One-shot: no continuous volume to resync.
  };

  return { setLeader, updatePositionFromCart, resyncVolume };
}

function buildRecordRingGeometry({
  outerRadius,
  innerRadius,
  thickness,
  curveSegments,
  bevelThickness = 0.15,
  bevelSize = 0.15,
}) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
  });

  // ExtrudeGeometry extrudes along +Z; center it and rotate so thickness becomes Y (floor height).
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * * Draws one string along a circular arc on a 2D canvas (vinyl label typography).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {number} arcRadiusPx
 * @param {number} arcCenterDeg
 * @param {number} arcAngleDeg
 * @param {string} fontSpec
 * @param {string} fillStyle
 */
function drawArcTextOnCanvas(ctx, text, cx, cy, arcRadiusPx, arcCenterDeg, arcAngleDeg, fontSpec, fillStyle) {
  const n = text.length;
  if (n === 0) return;
  ctx.save();
  ctx.font = fontSpec;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const span = arcAngleDeg;
  const startDeg = arcCenterDeg - span / 2;
  for (let i = 0; i < n; i += 1) {
    const char = text[i];
    const angleDeg = n === 1 ? arcCenterDeg : startDeg + (i / (n - 1)) * span;
    const angleRad = (angleDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.translate(0, -arcRadiusPx);
    ctx.rotate(angleRad + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// (Physics helper functions removed - using modular Simulation equivalents)

async function main() {
  await RAPIER.init();

  let sfx = null;
  let menuMusicEl = null;
  let startMenuMusic = () => {};
  let stopMenuMusic = () => {};
  let musicEl = null;
  let musicStarted = false;
  let musicUnavailable = false;
  let tryStartAmbientMusic = () => {};
  let labelRenderer = null;
  let gameMusicFadeOutInterval = null;
  let menuMusicFadeOutInterval = null;
  let gameMusicFadeInInterval = null;
  let input = null;
  const ramBoostStreaks = [];

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
      const mySlot = Netcode.localSlotIndexForConn(Netcode.getYouConnId());
      const cart = mySlot >= 0 && allCarts[mySlot] ? allCarts[mySlot] : localCartForConnId();
      triggerHop(cart, performance.now());
    },
    () => {
      triggerRamBoost(localCartForConnId(), performance.now());
    }
  );

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0520, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0520, 0.006);

  const trashPool = [];
  const TRASH_POOL_SIZE = 40;
  const trashGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  const trashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  const TRASH_NEON_COLORS = [0xff00ff, 0x00ffff, 0xffff00, 0xff3300];
  for (let i = 0; i < TRASH_POOL_SIZE; i++) {
    const m = new THREE.Mesh(trashGeo, trashMat.clone());
    m.visible = false;
    m.userData.vel = new THREE.Vector3();
    m.userData.life = 0;
    m.userData.maxLife = 0;
    scene.add(m);
    trashPool.push(m);
  }

  function spawnTrashBurst(position, intensity, type = "cart") {
    const count = type === "floor" 
      ? Math.floor(4 + intensity * 4) 
      : Math.floor(6 + intensity * 8);
    let spawned = 0;
    for (let i = 0; i < trashPool.length && spawned < count; i++) {
      const p = trashPool[i];
      if (p.visible) continue;
      p.position.set(position.x, position.y + (type === "floor" ? 0.05 : 0.5), position.z);
      p.scale.setScalar((0.8 + intensity * 0.8) * (type === "floor" ? 0.65 : 1.0));
      if (type === "floor") {
        const colors = [0x551a8b, 0xff00ff, 0x333333];
        p.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      } else if (type === "edge") {
        const colors = [0xff00ff, 0x00ffff, 0xffffff];
        p.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      } else {
        p.material.color.setHex(TRASH_NEON_COLORS[Math.floor(Math.random() * TRASH_NEON_COLORS.length)]);
      }
      p.material.opacity = 1;
      p.visible = true;
      if (type === "floor") {
        const angle = Math.random() * Math.PI * 2;
        const sp = (3 + Math.random() * 5) * intensity;
        p.userData.vel.set(
          Math.cos(angle) * sp,
          1.5 + Math.random() * 2.5,
          Math.sin(angle) * sp
        );
      } else if (type === "edge") {
        const toCenter = new THREE.Vector3(-position.x, 0, -position.z).normalize();
        const spreadX = (Math.random() - 0.5) * 3;
        const spreadZ = (Math.random() - 0.5) * 3;
        p.userData.vel.set(
          toCenter.x * (6 + Math.random() * 6) * intensity + spreadX,
          2 + Math.random() * 4 * intensity,
          toCenter.z * (6 + Math.random() * 6) * intensity + spreadZ
        );
      } else {
        p.userData.vel.set(
          (Math.random() - 0.5) * 10 * intensity,
          4 + Math.random() * 5 * intensity,
          (Math.random() - 0.5) * 10 * intensity
        );
      }
      p.userData.life = 0;
      p.userData.maxLife = type === "floor" ? 0.35 + Math.random() * 0.15 : 0.4 + Math.random() * 0.2;
      spawned++;
    }
  }
  spawnTrashBurstRef = spawnTrashBurst;

  // --- Starfield + Nebula Skybox ---
  // Stars - bigger, brighter, more of them
  const starCount = 4000;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 150 + Math.random() * 80;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)); // bias upward
    starPositions[i * 3 + 2] = r * Math.cos(phi);
    const tint = Math.random();
    if (tint < 0.15) {
      starColors[i * 3] = 1;
      starColors[i * 3 + 1] = 0.2;
      starColors[i * 3 + 2] = 0.85;
    } else if (tint < 0.3) {
      starColors[i * 3] = 0.15;
      starColors[i * 3 + 1] = 0.9;
      starColors[i * 3 + 2] = 1;
    } else if (tint < 0.38) {
      starColors[i * 3] = 1;
      starColors[i * 3 + 1] = 1;
      starColors[i * 3 + 2] = 0.4;
    } else {
      const b = 0.8 + Math.random() * 0.2;
      starColors[i * 3] = b;
      starColors[i * 3 + 1] = b;
      starColors[i * 3 + 2] = b;
    }
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starCanvas = document.createElement("canvas");
  starCanvas.width = 32;
  starCanvas.height = 32;
  const starCtx = starCanvas.getContext("2d");
  const starGrad = starCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  starGrad.addColorStop(0, "rgba(255,255,255,1)");
  starGrad.addColorStop(0.15, "rgba(255,255,255,0.8)");
  starGrad.addColorStop(0.4, "rgba(255,255,255,0.15)");
  starGrad.addColorStop(1, "rgba(255,255,255,0)");
  starCtx.fillStyle = starGrad;
  starCtx.fillRect(0, 0, 32, 32);
  const starTexture = new THREE.CanvasTexture(starCanvas);
  const starMat = new THREE.PointsMaterial({
    size: 1.5,
    map: starTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // Nebula clouds - large additive spheres with low opacity
  const nebulaColors = [0x6600aa, 0xaa0066, 0x003366, 0x220044, 0x660033];
  for (let i = 0; i < 8; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.3 + Math.random() * 1.0; // upper hemisphere bias
    const r = 120 + Math.random() * 50;
    const nebula = new THREE.Mesh(
      new THREE.SphereGeometry(20 + Math.random() * 30, 16, 16),
      new THREE.MeshBasicMaterial({
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.06 + Math.random() * 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    nebula.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    scene.add(nebula);
  }

  // Planets
  const planetConfigs = [
    { radius: 8, color: 0x993366, pos: [100, 70, -80], ring: true, ringColor: 0xcc6699 },
    { radius: 5, color: 0x334488, pos: [-120, 55, -60], ring: false },
    { radius: 3, color: 0x886633, pos: [60, 90, 100], ring: false },
  ];
  for (const p of planetConfigs) {
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, 24, 24),
      new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.5 }),
    );
    planet.position.set(p.pos[0], p.pos[1], p.pos[2]);
    scene.add(planet);
    if (p.ring) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(p.radius * 1.6, 0.4, 8, 48),
        new THREE.MeshBasicMaterial({
          color: p.ringColor, transparent: true, opacity: 0.35,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI * 0.35;
      ring.position.set(p.pos[0], p.pos[1], p.pos[2]);
      scene.add(ring);
    }
  }

  // Distant galaxies (flat discs with glow)
  const galaxyConfigs = [
    { pos: [-80, 100, -130], color: 0x6644aa, size: 12 },
    { pos: [130, 85, -100], color: 0xaa4466, size: 8 },
  ];
  for (const g of galaxyConfigs) {
    const gCanvas = document.createElement("canvas");
    gCanvas.width = 64; gCanvas.height = 64;
    const gCtx = gCanvas.getContext("2d");
    const gGrad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gGrad.addColorStop(0, "rgba(255,255,255,0.6)");
    gGrad.addColorStop(0.3, "rgba(180,120,220,0.3)");
    gGrad.addColorStop(1, "rgba(0,0,0,0)");
    gCtx.fillStyle = gGrad;
    gCtx.beginPath();
    gCtx.ellipse(32, 32, 30, 15, 0, 0, Math.PI * 2);
    gCtx.fill();
    const gTex = new THREE.CanvasTexture(gCanvas);
    const galaxy = new THREE.Sprite(new THREE.SpriteMaterial({
      map: gTex, color: g.color, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    galaxy.scale.set(g.size, g.size * 0.5, 1);
    galaxy.position.set(g.pos[0], g.pos[1], g.pos[2]);
    scene.add(galaxy);
  }

  // UFOs - small glowing discs that orbit slowly
  const ufoEntries = [];
  for (let i = 0; i < 3; i++) {
    const ufoGroup = new THREE.Group();
    // Saucer body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    ufoGroup.add(body);
    // Dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 }),
    );
    dome.position.y = 0.3;
    ufoGroup.add(dome);
    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.15, 8, 24),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ff88 : i === 1 ? 0xff00ff : 0x00ffff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ufoGroup.add(ring);

    const orbitRadius = 100 + i * 20;
    const orbitSpeed = 0.03 + i * 0.01;
    const orbitHeight = 15 + i * 8;
    const phaseOffset = i * Math.PI * 0.66;
    ufoGroup.scale.set(2, 2, 2);
    scene.add(ufoGroup);
    ufoEntries.push({ group: ufoGroup, orbitRadius, orbitSpeed, orbitHeight, phaseOffset });
  }

  // * Environment map for IBL: gives metallic materials something to reflect.
  // * No scene.background is set so the void stays pure black.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  pmremGenerator.dispose();

  const ambientParticleCount = 260;
  const ambientParticleRadius = 35;
  const ambientParticleHeight = 30;
  const ambientParticlePositions = new Float32Array(ambientParticleCount * 3);
  const ambientParticleColors = new Float32Array(ambientParticleCount * 3);
  const ambientParticleDrift = new Float32Array(ambientParticleCount * 4);
  const ambientParticlePalette = [
    CART_COLORS.pink.hex,
    CART_COLORS.blue.hex,
    CART_COLORS.green.hex,
    CART_COLORS.yellow.hex,
    CART_COLORS.neonOrange.hex,
  ];
  const ambientParticleColor = new THREE.Color();

  for (let i = 0; i < ambientParticleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * ambientParticleRadius;
    const p = i * 3;
    const d = i * 4;

    ambientParticlePositions[p] = Math.cos(angle) * radius;
    ambientParticlePositions[p + 1] = Math.random() * ambientParticleHeight;
    ambientParticlePositions[p + 2] = Math.sin(angle) * radius;

    ambientParticleColor.setHex(
      ambientParticlePalette[Math.floor(Math.random() * ambientParticlePalette.length)],
    );
    ambientParticleColors[p] = ambientParticleColor.r;
    ambientParticleColors[p + 1] = ambientParticleColor.g;
    ambientParticleColors[p + 2] = ambientParticleColor.b;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = 0.08 + Math.random() * 0.1;
    ambientParticleDrift[d] = Math.cos(driftAngle) * driftSpeed;
    ambientParticleDrift[d + 1] = 0.015 + Math.random() * 0.035;
    ambientParticleDrift[d + 2] = Math.sin(driftAngle) * driftSpeed;
    ambientParticleDrift[d + 3] = Math.random() * Math.PI * 2;
  }

  const ambientParticleGeometry = new THREE.BufferGeometry();
  ambientParticleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(ambientParticlePositions, 3),
  );
  ambientParticleGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(ambientParticleColors, 3),
  );
  const ambientParticleTextureCanvas = document.createElement("canvas");
  ambientParticleTextureCanvas.width = 64;
  ambientParticleTextureCanvas.height = 64;
  const ambientParticleTextureCtx = ambientParticleTextureCanvas.getContext("2d");
  const ambientParticleGradient = ambientParticleTextureCtx.createRadialGradient(
    32,
    32,
    0,
    32,
    32,
    32,
  );
  ambientParticleGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  ambientParticleGradient.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
  ambientParticleGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ambientParticleTextureCtx.fillStyle = ambientParticleGradient;
  ambientParticleTextureCtx.fillRect(0, 0, 64, 64);
  const ambientParticleTexture = new THREE.CanvasTexture(ambientParticleTextureCanvas);
  ambientParticleTexture.needsUpdate = true;
  const ambientParticles = new THREE.Points(
    ambientParticleGeometry,
    new THREE.PointsMaterial({
      map: ambientParticleTexture,
      size: 0.25,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(ambientParticles);

  function updateAmbientParticles(dt, nowMs) {
    const nowSec = nowMs * 0.001;
    const positions = ambientParticleGeometry.attributes.position.array;

    for (let i = 0; i < ambientParticleCount; i++) {
      const p = i * 3;
      const d = i * 4;
      const wave = Math.sin(nowSec * 0.55 + ambientParticleDrift[d + 3]) * 0.04;

      positions[p] += (ambientParticleDrift[d] + wave) * dt;
      positions[p + 1] += ambientParticleDrift[d + 1] * dt;
      positions[p + 2] += (ambientParticleDrift[d + 2] - wave) * dt;

      const x = positions[p];
      const z = positions[p + 2];
      const r = Math.hypot(x, z);
      if (r > ambientParticleRadius) {
        const wrapScale = -ambientParticleRadius / r;
        positions[p] = x * wrapScale;
        positions[p + 2] = z * wrapScale;
      }
      if (positions[p + 1] > ambientParticleHeight) positions[p + 1] = 0;
      if (positions[p + 1] < 0) positions[p + 1] = ambientParticleHeight;
    }

    ambientParticleGeometry.attributes.position.needsUpdate = true;
  }

  function setAllAudioMuted(muted) {
    isMuted = muted;
    localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false");
    if (sfx) {
      sfx._muted = isMuted;
    }
    try { applyAudioVolume(); } catch (e) {}
  }

  function setSfxSliderVolume(v) {
    sfxVolume = clamp(v, 0, AUDIO_VOLUME_MAX);
    localStorage.setItem(
      "cartRaveSfxVol",
      Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100).toString(),
    );
    try { applyAudioVolume(); } catch (e) {}
  }

  // (Legacy initHud removed)

  function initResultsOverlay() {
    const existing = document.getElementById("results-overlay");
    if (existing) existing.remove();
    const existingStyle = document.getElementById("results-overlay-style");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = "results-overlay-style";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bungee&family=Space+Mono:wght@400;700&family=Archivo+Black&display=swap');

      #results-overlay {
        --results-mono: "Space Mono", ui-monospace, monospace;
        --results-display: "Bungee", "Archivo Black", sans-serif;
        position: fixed;
        inset: 0;
        z-index: 25000;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        font-family: var(--results-mono);
        color: #fff;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        background: radial-gradient(ellipse at center, #0a0014 0%, #000 90%);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #results-overlay .results-panel {
        pointer-events: auto;
        min-width: min(420px, 92vw);
        max-width: 520px;
        width: 90%;
        padding: 36px 32px 28px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 40px rgba(43, 255, 122, 0.08), 0 16px 48px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #results-overlay .results-title {
        font-family: var(--results-display);
        font-size: clamp(22px, 5vw, 32px);
        font-weight: 400;
        letter-spacing: 0.06em;
        margin: 0 0 18px;
        min-height: 1.2em;
        text-align: center;
        line-height: 1.15;
        color: var(--title-glow, #ffe53d);
        text-shadow: 0 0 12px var(--title-glow, #ffe53d), 0 0 28px color-mix(in oklab, var(--title-glow, #ffe53d), transparent 50%);
      }

      #results-overlay .results-final {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }

      #results-overlay .results-score-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: box-shadow 180ms ease, border-color 180ms ease;
      }

      #results-overlay .results-score-row.is-winner {
        border-color: var(--slot-glow, #2bff7a);
        box-shadow: 0 0 12px var(--slot-glow, #2bff7a), 0 0 28px color-mix(in oklab, var(--slot-glow, #2bff7a), transparent 55%);
      }

      #results-overlay .results-score-name {
        font-family: var(--results-mono);
        font-size: 13px;
        letter-spacing: 0.04em;
        color: rgba(255, 255, 255, 0.88);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1;
      }

      #results-overlay .results-score-val {
        font-family: var(--results-display);
        font-size: 18px;
        letter-spacing: 0.04em;
        color: var(--slot-glow, #22e6ff);
        text-shadow: 0 0 10px var(--slot-glow, #22e6ff);
        flex-shrink: 0;
      }

      #results-overlay .results-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 43, 214, 0.22);
        border-radius: 12px;
        margin: 0 0 14px;
        position: relative;
      }

      #results-overlay .results-stats-tag {
        position: absolute;
        top: -8px; left: 14px;
        display: inline-flex; align-items: center; gap: 5px;
        padding: 1px 8px;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-family: var(--results-mono);
        font-size: 8px;
        letter-spacing: 0.22em;
        color: rgba(255, 255, 255, 0.6);
      }

      #results-overlay .results-stats-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        flex: 1;
      }

      #results-overlay .results-stats-num {
        font-family: var(--results-display);
        font-size: 22px;
        line-height: 1;
        color: #ff2bd6;
        text-shadow: 0 0 10px #ff2bd6;
        letter-spacing: 0.02em;
      }

      #results-overlay .results-stats-lbl {
        font-family: var(--results-mono);
        font-size: 8px;
        letter-spacing: 0.18em;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
      }

      #results-overlay .results-stats-div {
        width: 1px;
        height: 24px;
        background: rgba(255, 255, 255, 0.12);
        flex-shrink: 0;
      }

      #results-overlay .results-history {
        min-height: 72px;
        max-height: 160px;
        overflow: auto;
        margin-bottom: 18px;
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-family: var(--results-mono);
        font-size: 11px;
        line-height: 1.65;
        letter-spacing: 0.03em;
        color: rgba(255, 255, 255, 0.65);
      }

      #results-overlay .results-history-row {
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
      }

      #results-overlay .results-history-row:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      #results-overlay .results-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }

      #results-overlay .results-btn {
        width: 100%;
        padding: 14px 22px;
        border-radius: 6px;
        font-family: var(--results-display);
        font-size: 16px;
        letter-spacing: 0.06em;
        cursor: pointer;
        text-decoration: none;
        text-align: center;
        display: block;
        border: 2px solid var(--btn-glow, #ff2bd6);
        background: rgba(0, 0, 0, 0.55);
        color: var(--btn-glow, #ff2bd6);
        text-shadow: 0 0 10px var(--btn-glow, #ff2bd6);
        box-shadow: 0 0 12px var(--btn-glow, #ff2bd6), 0 0 28px color-mix(in oklab, var(--btn-glow, #ff2bd6), transparent 60%);
        transition: transform 120ms ease, box-shadow 180ms ease, background 180ms ease;
      }

      #results-overlay .results-btn:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        background: rgba(0, 0, 0, 0.35);
        box-shadow: 0 0 20px var(--btn-glow, #ff2bd6), 0 0 44px var(--btn-glow, #ff2bd6);
      }

      #results-overlay .results-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: 0 0 8px color-mix(in oklab, var(--btn-glow, #ff2bd6), transparent 70%);
      }

      #results-overlay .results-btn--play {
        --btn-glow: #ff2bd6;
      }

      #results-overlay .results-btn--menu {
        --btn-glow: #22e6ff;
      }

      #results-overlay .results-btn--portal {
        --btn-glow: #2bff7a;
      }
    `.trim();
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "results-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Round results");

    const panel = document.createElement("div");
    panel.className = "results-panel";

    const title = document.createElement("h2");
    title.className = "results-title";

    const finalScores = document.createElement("div");
    finalScores.className = "results-final";

    const history = document.createElement("div");
    history.className = "results-history";

    const actions = document.createElement("div");
    actions.className = "results-actions";

    const playAgain = document.createElement("button");
    playAgain.type = "button";
    playAgain.className = "results-btn results-btn--play";
    playAgain.textContent = "PLAY AGAIN";
    playAgain.disabled = false;

    const exitPortal = document.createElement("a");
    exitPortal.className = "results-btn results-btn--portal";
    exitPortal.href = buildExitPortalUrl();
    exitPortal.textContent = "VIBE JAM PORTAL";
    exitPortal.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = buildExitPortalUrl();
    });

    const mainMenuBtn = document.createElement("button");
    mainMenuBtn.type = "button";
    mainMenuBtn.className = "results-btn results-btn--menu";
    mainMenuBtn.textContent = "MAIN MENU";
    mainMenuBtn.addEventListener("click", () => {
      clearAutoContinuePodiumTimeout();
      // Strip room param and go to plain cartrave.lol
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("portal");
      window.location.href = url.pathname;
    });

    actions.appendChild(playAgain);
    actions.appendChild(mainMenuBtn);
    actions.appendChild(exitPortal);

    const statsLine = document.createElement("div");
    statsLine.className = "results-stats";

    panel.appendChild(title);
    panel.appendChild(finalScores);
    panel.appendChild(statsLine);
    panel.appendChild(history);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    return { overlay, panel, title, finalScores, history, playAgain, exitPortal, statsLine, mainMenuBtn };
  }

  // Step 10b: Menu initialization
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
      if (musicEl) {
        if (gameMusicFadeOutInterval !== null) clearInterval(gameMusicFadeOutInterval);
        gameMusicFadeOutInterval = null;
        if (gameMusicFadeInInterval !== null) clearInterval(gameMusicFadeInInterval);
        gameMusicFadeInInterval = null;
        musicEl.pause();
        musicEl.currentTime = 0;
      }
      musicStarted = false;
    } catch (e) {}
    try { startMenuMusic(); } catch (e) {}
    const wrap = document.getElementById("cr-root");
    if (wrap) {
      wrap.style.display = "";
      wrap.style.opacity = "1";
      wrap.style.pointerEvents = "";
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

    if (skipMenuForPortalBypass) {
      skipMenuForPortalBypass = false;
      hideMenu();
    }

    const room = resolvedPartyRoomFromUrl();
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
            if (menuRoot) { menuRoot.style.display = ""; menuRoot.style.opacity = "1"; menuRoot.style.pointerEvents = ""; }
            refreshMenuStats();
            // Clear the room param
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("room");
            history.pushState({}, "", cleanUrl);
          };
        }
      }
    });

    // Set portal href with referral
    const portal = document.getElementById("cr-portal");
    if (portal) {
      try {
        const url = new URL("https://vibej.am/portal/2026");
        url.searchParams.set("ref", window.location.origin + window.location.pathname);
        portal.href = url.toString();
      } catch {
        portal.href = "https://vibej.am/portal/2026";
      }
    }

    refreshMenuStats();

    // Wire new menu audio controls to game audio
    const crMuteBtn = document.getElementById("cr-mute-btn");
    const crMusicVolTrack = document.getElementById("cr-music-vol-track");
    const crMusicVolFill = document.getElementById("cr-music-vol-fill");
    const crMusicVolVal = document.getElementById("cr-music-vol-val");

    function syncMenuVolume() {
      if (crMusicVolFill) crMusicVolFill.style.width = ((isMuted ? 0 : (masterGain / AUDIO_VOLUME_MAX)) * 100) + "%";
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
        try { applyAudioVolume(); } catch(e) {}
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
    try { applyAudioVolume(); } catch(e) {}
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

  // Step 10b: Hide menu function
  function hideMenu() {
    const wrap = document.getElementById("cr-root");
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
    // Crossfade: fade out menu music
    if (menuMusicEl) {
      if (menuMusicFadeOutInterval !== null) clearInterval(menuMusicFadeOutInterval);
      menuMusicFadeOutInterval = setInterval(() => {
        if (menuMusicEl.volume > 0.0075) {
          menuMusicEl.volume = Math.max(0, menuMusicEl.volume - 0.0075);
        } else {
          clearInterval(menuMusicFadeOutInterval);
          menuMusicFadeOutInterval = null;
          menuMusicEl.pause();
          menuMusicEl.currentTime = 0;
        }
      }, 30);
    }
    // Start game music with fade in once the game audio element exists.
    if (musicEl) {
      if (gameMusicFadeOutInterval !== null) {
        clearInterval(gameMusicFadeOutInterval);
        gameMusicFadeOutInterval = null;
      }
      musicEl.volume = 0;
      musicEl.muted = isMuted;
      tryStartAmbientMusic();
      const targetVol = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
      if (gameMusicFadeInInterval !== null) clearInterval(gameMusicFadeInInterval);
      gameMusicFadeInInterval = setInterval(() => {
        if (!musicEl) {
          clearInterval(gameMusicFadeInInterval);
          gameMusicFadeInInterval = null;
          return;
        }
        if (musicEl.volume < targetVol - 0.0075) {
          musicEl.volume = Math.min(targetVol, musicEl.volume + 0.0075);
        } else {
          musicEl.volume = targetVol;
          clearInterval(gameMusicFadeInInterval);
          gameMusicFadeInInterval = null;
        }
      }, 30);
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


  hud = HUD.init({
    getIsMuted: () => isMuted,
    setIsMuted: (val) => { setAllAudioMuted(val); },
    getMasterGain: () => masterGain,
    setMasterGain: (val) => {
      masterGain = val;
      localStorage.setItem("cartRaveVolume", Math.round((val / AUDIO_VOLUME_MAX) * 100).toString());
      try { applyAudioVolume(); } catch (e) {}
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
    getCART_COLORS: () => CART_COLORS
  });
  const resultsUi = initResultsOverlay();
  initMenu(); // Step 10b: Add menu initialization
  hideMenuRef = hideMenu;

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * initNetcode() is top-level and cannot call hideMenu/startCountdown directly.
  onGameStartHandler = (msg) => {
    if (menuVisible) hideMenu();
    if (Netcode.getIsHost()) startCountdown();
  };

  function clampInt(value, min, max) {
    const v = Math.round(value);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  // (Legacy updateHud removed)

  function updateResultsOverlay() {
    if (!resultsUi) return;
    const { overlay, title, finalScores, history, playAgain, exitPortal, statsLine } = resultsUi;
    if (GameState.getRoundState().phase === "podium") {
      overlay.style.display = "flex";
      overlay.style.pointerEvents = "auto";
      playAgain.disabled = !Netcode.getIsHost();
      playAgain.textContent = Netcode.getIsHost() ? "PLAY AGAIN" : "WAITING FOR HOST…";

      const slotDisplayName = (slotIndex) => Netcode.getNetSlots()[slotIndex]?.name || `P${slotIndex + 1}`;

      const winnerIdx = GameState.getRoundState().winnerSlotIndex;
      if (winnerIdx === "draw") {
        title.textContent = "DRAW";
        title.style.setProperty("--title-glow", "#ffe53d");
      } else {
        const idx = Number.isFinite(winnerIdx) ? winnerIdx : null;
        if (idx != null) {
          const score = GameState.getRoundScores() && GameState.getRoundScores()[idx] != null ? GameState.getRoundScores()[idx] : 0;
          title.textContent = `${slotDisplayName(idx)} wins — ${score} pts`;
          title.style.setProperty("--title-glow", getColorForSlot(Netcode.getNetSlots()[idx]));
        } else {
          title.textContent = "ROUND COMPLETE";
          title.style.setProperty("--title-glow", "#ffffff");
        }
      }

      finalScores.replaceChildren();
      for (let i = 0; i < 4; i += 1) {
        const s = GameState.getRoundScores() && GameState.getRoundScores()[i] != null ? GameState.getRoundScores()[i] : 0;
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
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
  }

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

  if (!crowd) crowd = initCrowdSfx(audioListener);
  if (!leaderHum) leaderHum = initLeaderHumSfx(audioListener);

  // Limits to prevent infinite stacking of short transient impact SFX.
  /** @type {{ intensity: number; stop: () => void }[]} */
  const activeImpactSfx = [];
  const MAX_ACTIVE_IMPACTS = 3;
  /** @type {AudioBuffer | null} */
  let cartCrashBuffer = null;
  let cartCrashBufferLoadInFlight = false;
  let shakeUntil = 0;
  let shakeIntensity = 0;
  let slowMoUntil = 0;
  let slowMoRate = 1;
let slowMoActive = false;
let slowMoStartMs = 0;
const SLOW_MO_DURATION_MS = 3500;
const SLOW_MO_TIME_SCALE = 0.25; // quarter speed
  let fovPunchUntil = 0;
  const BASE_FOV = CONFIG.camera.fov;

  const ensureCartCrashBufferLoaded = () => {
    const ctx = audioListener.context;
    if (ctx.state !== "running") return;
    if (cartCrashBuffer || cartCrashBufferLoadInFlight) return;
    cartCrashBufferLoadInFlight = true;

    const url = new URL("sounds/cart-crash.wav", window.location.href).toString();
    void fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then(
        (buf) => {
          cartCrashBuffer = buf;
          cartCrashBufferLoadInFlight = false;
        },
        () => {
          cartCrashBufferLoadInFlight = false;
        },
      );
  };
  sfx = {
    _muted: isMuted,
    playFloorImpact(intensity) {
      const i = clamp(intensity, 0, 1);
      if (i <= 0.05) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(85 + Math.random() * 15, now);
      thump.frequency.exponentialRampToValueAtTime(40, now + 0.2);

      const len = 0.18;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j += 1) {
        d[j] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(180, now);

      const gainThump = ctx.createGain();
      const gThump = 0.45 * i * sfxVolume;
      gainThump.gain.setValueAtTime(Math.max(0.0001, isMuted ? 0.0001 : gThump), now);
      gainThump.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      const gainNoise = ctx.createGain();
      const gNoise = 0.3 * i * sfxVolume;
      gainNoise.gain.setValueAtTime(Math.max(0.0001, isMuted ? 0.0001 : gNoise), now);
      gainNoise.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      thump.connect(gainThump);
      gainThump.connect(audioListener.gain);

      noise.connect(lp);
      lp.connect(gainNoise);
      gainNoise.connect(audioListener.gain);

      try {
        thump.start(now);
        thump.stop(now + 0.2);
        noise.start(now);
        noise.stop(now + 0.18);
      } catch {}
    },
    playEdgeImpact(intensity) {
      const i = clamp(intensity, 0, 1);
      if (i <= 0.05) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      const ring = ctx.createOscillator();
      ring.type = "triangle";
      ring.frequency.setValueAtTime(400 + Math.random() * 100, now);
      ring.frequency.exponentialRampToValueAtTime(200, now + 0.25);

      const len = 0.1;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j += 1) {
        d[j] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(900, now);

      const gainRing = ctx.createGain();
      const gRing = 0.4 * i * sfxVolume;
      gainRing.gain.setValueAtTime(Math.max(0.0001, isMuted ? 0.0001 : gRing), now);
      gainRing.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      const gainNoise = ctx.createGain();
      const gNoise = 0.25 * i * sfxVolume;
      gainNoise.gain.setValueAtTime(Math.max(0.0001, isMuted ? 0.0001 : gNoise), now);
      gainNoise.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      ring.connect(gainRing);
      gainRing.connect(audioListener.gain);

      noise.connect(hp);
      hp.connect(gainNoise);
      gainNoise.connect(audioListener.gain);

      try {
        ring.start(now);
        ring.stop(now + 0.25);
        noise.start(now);
        noise.stop(now + 0.1);
      } catch {}
    },
    playCollision(intensity) {
      const i = clamp(intensity, 0, 1);
      if (i <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Drop the quietest active impact if too many overlap.
      if (activeImpactSfx.length >= MAX_ACTIVE_IMPACTS) {
        let quietestIdx = 0;
        let quietestI = activeImpactSfx[0]?.intensity ?? Infinity;
        for (let k = 1; k < activeImpactSfx.length; k += 1) {
          const ki = activeImpactSfx[k]?.intensity ?? Infinity;
          if (ki < quietestI) { quietestI = ki; quietestIdx = k; }
        }
        try { activeImpactSfx[quietestIdx]?.stop?.(); } catch {}
        activeImpactSfx.splice(quietestIdx, 1);
      }

      ensureCartCrashBufferLoaded();
      if (!cartCrashBuffer) return;

      const src = ctx.createBufferSource();
      src.buffer = cartCrashBuffer;
      src.playbackRate.setValueAtTime(0.6 + Math.random() * 0.4 + i * 0.5, now);

      const out = ctx.createGain();
      const g = (0.2 + i * 0.8) * sfxVolume * 0.85;
      out.gain.setValueAtTime(Math.max(0.0001, isMuted ? 0.0001 : g), now);

      src.connect(out);
      out.connect(audioListener.gain);

      const entry = {
        intensity: i,
        stop: () => {
          const t = ctx.currentTime;
          try { out.gain.setTargetAtTime(0.0001, t, 0.01); } catch {}
          try { src.stop(t + 0.01); } catch {}
          try { src.disconnect(); } catch {}
          try { out.disconnect(); } catch {}
        },
      };
      src.onended = () => {
        const idx = activeImpactSfx.indexOf(entry);
        if (idx >= 0) activeImpactSfx.splice(idx, 1);
        try { src.disconnect(); } catch {}
        try { out.disconnect(); } catch {}
      };

      activeImpactSfx.push(entry);
      try { src.start(0); } catch {}

      if (GameState.getRoundState().phase === "running" && i > 0.2) {
        shakeIntensity = i * 8 * 2; // max ~16px offset
        shakeUntil = performance.now() + 225 + i * 150; // ~50% longer than before
      }
    },
    playNitro() {
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // * Aggressive nitro burst: wide whoosh + saw accent + low thump.
      const len = 0.25;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j += 1) {
        d[j] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(400, now);
      bp.frequency.exponentialRampToValueAtTime(4000, now + len);
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5 * sfxVolume, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + len);
      src.connect(bp);
      bp.connect(g);
      g.connect(audioListener.gain);
      src.start(now);
      src.stop(now + len);

      // * Pitch accent: sawtooth sweep for extra bite.
      const accent = ctx.createOscillator();
      accent.type = "sawtooth";
      accent.frequency.setValueAtTime(200, now);
      accent.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.25 * sfxVolume, now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      accent.connect(ag);
      ag.connect(audioListener.gain);
      accent.start(now);
      accent.stop(now + 0.15);

      // * Low-end thump: quick chest-punch.
      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(80, now);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.3 * sfxVolume, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      thump.connect(tg);
      tg.connect(audioListener.gain);
      thump.start(now);
      thump.stop(now + 0.15);
    },
    playHop() {
      if (isMuted || sfxVolume <= 0) return;
      const ctx = audioListener.context;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3 * sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioListener.gain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    },
    playFallOff() {
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;

      // * Quick low drop, keeping the fall cue short and grounded.
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(g);
      g.connect(audioListener.gain);
      osc.start(now);
      osc.stop(now + 0.18);
    },
    playWheelScreech(intensity) {
      if (isMuted || sfxVolume <= 0) return;
      const i = clamp(intensity, 0, 1);
      if (i <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;

      // * Rubber-on-glass squeak via high-Q resonant bandpass noise (no oscillators/LFOs).
      const len = 0.12;
      const attackSec = 0.005;

      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j += 1) {
        d[j] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      // Center freq: 2800–3800 Hz (higher pitch = squeakier).
      const centerHz = 2800 + Math.random() * 1000;
      bp.frequency.setValueAtTime(centerHz, now);
      // High resonance makes the filter ring/squeal; add small per-trigger Q variation.
      const baseQ = 15 + Math.random() * 5; // 15–20
      const qJitter = (Math.random() - 0.5) * 6; // ±3
      bp.Q.value = Math.max(1, baseQ + qJitter);

      const g = ctx.createGain();
      const base = 0.25 * sfxVolume;
      const peak = base * (0.35 + i * 0.65);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + attackSec);
      g.gain.exponentialRampToValueAtTime(0.001, now + len);

      src.connect(bp);
      bp.connect(g);
      g.connect(audioListener.gain);
      src.start(now);
      src.stop(now + len);
    },
  };
  playCollisionRef = sfx.playCollision;
  applyAudioVolume();
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

  const cameraState = {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
  };

  const cartLinvelScratch = new THREE.Vector3();
  const netTargetPosScratch = new THREE.Vector3();
  const interpPrevQuat = new THREE.Quaternion();
  const interpCurrQuat = new THREE.Quaternion();
  let fpsFrames = 0;
  let fpsLast = performance.now();

  function dampFactor(lambda, dt) {
    return 1 - Math.exp(-lambda * dt);
  }

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

  // Minimal ambient + a few colored spotlights for "neon" vibe.
  scene.add(new THREE.AmbientLight(0x221133, 0.15));

  const visualRecordThickness = 0.28;
  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;
  const recordSurfaceGlowY =
    platformTopY + CONFIG.record.surface.concentricRings.yOffset + 0.018;
  const spotlightBeamAxisY = new THREE.Vector3(0, 1, 0);
  const spotlightPoolTextureCanvas = document.createElement("canvas");
  spotlightPoolTextureCanvas.width = 128;
  spotlightPoolTextureCanvas.height = 128;
  const spotlightPoolTextureCtx = spotlightPoolTextureCanvas.getContext("2d");
  const spotlightPoolGradient = spotlightPoolTextureCtx.createRadialGradient(
    64,
    64,
    0,
    64,
    64,
    64,
  );
  spotlightPoolGradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  spotlightPoolGradient.addColorStop(0.45, "rgba(255, 255, 255, 0.28)");
  spotlightPoolGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  spotlightPoolTextureCtx.fillStyle = spotlightPoolGradient;
  spotlightPoolTextureCtx.fillRect(0, 0, 128, 128);
  const spotlightPoolTexture = new THREE.CanvasTexture(spotlightPoolTextureCanvas);
  spotlightPoolTexture.needsUpdate = true;

  function positionSpotlightBeam(beamGroup, source, target) {
    beamGroup.position.copy(source.clone().add(target).multiplyScalar(0.5));
    beamGroup.quaternion.setFromUnitVectors(
      spotlightBeamAxisY,
      source.clone().sub(target).normalize(),
    );
  }

  function addSpotlightWithBeam({ color, position, intensity, target }) {
    const light = new THREE.SpotLight(color, intensity, 60, Math.PI / 8.75, 0.2, 1.1);
    light.position.copy(position);
    light.target.position.set(target.x, platformTopY, target.z);
    scene.add(light);
    scene.add(light.target);

    const beamTarget = new THREE.Vector3(target.x, platformTopY, target.z);
    const height = Math.max(0.01, position.y - platformTopY);
    const beamGroup = new THREE.Group();
    const beamLayers = [
      { sourceRadius: 0.45, floorRadius: 1.2, opacity: 0.1 },
      { sourceRadius: 0.65, floorRadius: 1.8, opacity: 0.055 },
      { sourceRadius: 0.9, floorRadius: 2.6, opacity: 0.025 },
    ];

    for (const layer of beamLayers) {
      const beamGeo = new THREE.CylinderGeometry(
        layer.sourceRadius,
        layer.floorRadius,
        height,
        24,
        1,
        true,
      );
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      beamGroup.add(new THREE.Mesh(beamGeo, beamMat));
    }

    positionSpotlightBeam(beamGroup, position, beamTarget);
    scene.add(beamGroup);

    const glowGeo = new THREE.CircleGeometry(5.25, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      map: spotlightPoolTexture,
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(beamTarget.x, recordSurfaceGlowY, beamTarget.z);
    glowMesh.renderOrder = 2;
    scene.add(glowMesh);

    return { light, beamGroup, glowMesh };
  }

  const spotlightEntries = [];
  const spotlightPositionRadius = CONFIG.record.radius * 0.7;
  const spotlightHeight = 25;
  const spotlightIntensity = 12;
  const spotlightDriftAmplitudeRad = (18 * Math.PI) / 180;
  const spotlightConfigs = [
    { color: CART_COLORS.pink.hex, angleDeg: -90, driftSpeed: 0.056, phase: 0.0 },
    { color: CART_COLORS.blue.hex, angleDeg: -18, driftSpeed: 0.0455, phase: 1.4 },
    { color: CART_COLORS.green.hex, angleDeg: 54, driftSpeed: 0.0525, phase: 2.8 },
    { color: CART_COLORS.yellow.hex, angleDeg: 126, driftSpeed: 0.0385, phase: 4.2 },
    { color: CART_COLORS.neonOrange.hex, angleDeg: 198, driftSpeed: 0.049, phase: 5.6 },
  ];

  for (const cfg of spotlightConfigs) {
    const baseAngleRad = (cfg.angleDeg * Math.PI) / 180;
    const position = new THREE.Vector3(
      Math.cos(baseAngleRad) * spotlightPositionRadius,
      spotlightHeight,
      Math.sin(baseAngleRad) * spotlightPositionRadius,
    );
    const target = new THREE.Vector3(position.x, 0, position.z);
    const entry = addSpotlightWithBeam({
      color: cfg.color,
      position,
      intensity: spotlightIntensity,
      target,
    });
    spotlightEntries.push({
      ...entry,
      baseAngleRad,
      color: cfg.color,
      driftSpeed: cfg.driftSpeed,
      phase: cfg.phase,
    });
  }

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  // --- Record platform (visual rotates, physics stays fixed for day 1) ---
  const visualRecordY = CONFIG.record.y + (CONFIG.record.thickness - visualRecordThickness) / 2;
  const recordGeo = buildRecordRingGeometry({
    outerRadius: CONFIG.record.radius,
    innerRadius: CONFIG.record.innerRadius,
    thickness: visualRecordThickness,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    curveSegments: 64,
  });
  const recordMat = new THREE.MeshStandardMaterial({
    color: CONFIG.record.color,
    roughness: 0.72,
    metalness: 0.35,
    transparent: true,
    opacity: 0.7,
  });
  recordMat.depthWrite = false;
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, visualRecordY, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  // * Spindle accent light: slowly cycles pink <-> cyan in the render loop.
  const spindleLight = new THREE.PointLight(0xff2bd6, 80, 30, 2);
  const spindleLightColorPink = new THREE.Color(0xff2bd6);
  const spindleLightColorCyan = new THREE.Color(0x2bd6ff);
  spindleLight.position.set(0, 1.5, 0);
  scene.add(spindleLight);

  const visualRecordTopY = visualRecordThickness / 2;
  const recordReflectorGeo = new THREE.RingGeometry(
    CONFIG.record.innerRadius,
    CONFIG.record.radius,
    128,
    1,
  );
  const recordReflector = new Reflector(recordReflectorGeo, {
    clipBias: 0.003,
    textureWidth: Math.floor(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2)),
    textureHeight: Math.floor(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)),
    color: 0x111111,
  });
  recordReflector.rotation.x = -Math.PI / 2;
  recordReflector.position.y = visualRecordTopY + CONFIG.record.surface.concentricRings.yOffset + 0.001;
  recordReflector.renderOrder = 0;
  recordMesh.add(recordReflector);

  // --- Record center label (stars) ---
  const recordLabelCanvas = document.createElement("canvas");
  recordLabelCanvas.width = 512;
  recordLabelCanvas.height = 512;
  const recordLabelCtx = recordLabelCanvas.getContext("2d");
  recordLabelCtx.clearRect(0, 0, 512, 512);

  const labelCx = 256;
  const labelCy = 256;
  const labelR = 256;

  // Label background disc (white; tint comes from material.color)
  recordLabelCtx.fillStyle = "#ffffff";
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR, 0, Math.PI * 2);
  recordLabelCtx.fill();

  // 5-point star path helper.
  const drawStar = (cx, cy, outerR, innerR, rotationRad) => {
    recordLabelCtx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = rotationRad + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) recordLabelCtx.moveTo(x, y);
      else recordLabelCtx.lineTo(x, y);
    }
    recordLabelCtx.closePath();
    recordLabelCtx.fill();
  };

  // Three stars, 120° apart.
  recordLabelCtx.fillStyle = "#ffffff";
  const starOrbit = labelR * 0.6;
  const starOuter = labelR * 0.32;
  const starInner = starOuter * 0.45;
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    const sx = labelCx + Math.cos(a) * starOrbit;
    const sy = labelCy + Math.sin(a) * starOrbit;
    drawStar(sx, sy, starOuter, starInner, a);
  }

  // Transparent center hole.
  recordLabelCtx.globalCompositeOperation = "destination-out";
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR * 0.27, 0, Math.PI * 2);
  recordLabelCtx.fill();
  recordLabelCtx.globalCompositeOperation = "source-over";

  const recordLabelTex = new THREE.CanvasTexture(recordLabelCanvas);
  recordLabelTex.needsUpdate = true;
  const recordLabelGeo = new THREE.RingGeometry(3.7, 7.0, 96);
  const recordLabelMat = new THREE.MeshBasicMaterial({
    map: recordLabelTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.495,
    blending: THREE.NormalBlending,
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  recordLabelMat.depthTest = true;
  const recordLabelMesh = new THREE.Mesh(recordLabelGeo, recordLabelMat);
  recordLabelMesh.rotation.x = -Math.PI / 2;
  recordLabelMesh.position.y = visualRecordTopY + CONFIG.record.surface.concentricRings.yOffset + 0.012;
  recordLabelMesh.renderOrder = -1;
  recordMesh.add(recordLabelMesh);

  (function buildRecordSurfaceGrooves(parentMesh) {
    const surf = CONFIG.record.surface;
    const th = visualRecordThickness;
    const yBase = th / 2;

    const rings = surf.concentricRings;
    const rMin = rings.innerRadius;
    const rMax = rings.outerRadius;

    for (let i = 0; i < rings.count; i += 1) {
      const t = (i + 0.5) / rings.count;
      const rCenter = rMin + (rMax - rMin) * t;
      const halfW = rings.lineWidth / 2;
      let inner = rCenter - halfW;
      let outer = rCenter + halfW;
      inner = Math.max(inner, rMin + 0.001);
      outer = Math.min(outer, rMax - 0.001);
      if (outer - inner < 0.002) continue;
      const ringGeo = new THREE.RingGeometry(inner, outer, 96);
      const glint = i % 3 === 0 ? 0.13 : 0.06;
      const ringMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? rings.color : 0x111118,
        roughness: i % 2 === 0 ? 0.38 : 0.86,
        metalness: 0.55,
        depthWrite: false,
        transparent: true,
        opacity: 0.52 + glint,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.userData.recordSurfacePart = "groove";
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = yBase + rings.yOffset + 0.006;
      ringMesh.renderOrder = 1;
      parentMesh.add(ringMesh);
    }
  })(recordMesh);

  // Neon rim (visual only).
  const rimMat = new THREE.MeshStandardMaterial({
    color: CONFIG.record.rimColor,
    emissive: CONFIG.record.rimColor,
    emissiveIntensity: 2.2,
    roughness: 0.5,
    metalness: 0.0,
    depthWrite: false,
  });
  // * Beveled ExtrudeGeometry extends past nominal outerRadius — inset torus (0.985*r) sits inside the floor mesh and
  // * disappears; place slightly outside the nominal edge (mirrors inner rim * 1.015) so the neon ring stays visible.
  const rimGeo = new THREE.TorusGeometry(CONFIG.record.radius * 1.015, 0.12, 10, 72);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.02, 0);
  rimMesh.rotation.x = Math.PI / 2;
  scene.add(rimMesh);

  const edgeRingGeo = new THREE.TorusGeometry(CONFIG.record.radius * 1.015, 0.05, 10, 96);
  const edgeRingMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const edgeRingMesh = new THREE.Mesh(edgeRingGeo, edgeRingMat);
  edgeRingMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.02, 0);
  edgeRingMesh.rotation.x = Math.PI / 2;
  scene.add(edgeRingMesh);

  // Inner neon rim (visual only): sells the hole edge.
  const innerRimGeo = new THREE.TorusGeometry(CONFIG.record.innerRadius * 1.02, 0.12, 10, 72);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, rimMat);
  innerRimMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.03, 0);
  innerRimMesh.rotation.x = Math.PI / 2;
  scene.add(innerRimMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, CONFIG.record.y, 0),
  );

  const recordPhysicsGeo = buildRecordRingGeometry({
    outerRadius: CONFIG.record.radius,
    innerRadius: CONFIG.record.innerRadius,
    thickness: CONFIG.record.thickness,
    curveSegments: 64,
    bevelThickness: 0.20, // moderately thicker/smoother bevel slope (no clipping)
    bevelSize: 0.20,      // moderately wider bevel slope (no clipping)
  });
  const recordVerts = /** @type {Float32Array} */ (recordPhysicsGeo.attributes.position.array);
  const recordIndices = recordPhysicsGeo.index
    ? Uint32Array.from(recordPhysicsGeo.index.array)
    : Uint32Array.from(
        Array.from({ length: recordPhysicsGeo.attributes.position.count }, (_, i) => i),
      );
  const recordColliderDesc = RAPIER.ColliderDesc.trimesh(recordVerts, recordIndices)
    .setFriction(CONFIG.record.friction)
    .setRestitution(CONFIG.record.restitution);
  const recordCollider = world.createCollider(recordColliderDesc, recordBody);
  void recordCollider;

  // Diagnostics removed for submission.

  // ========================================================================
  // Step 15 — DJ Spawn Booths (4x, N/S/E/W)
  // ========================================================================
  const boothNeonMeshes = []; // collect for RGB cycling in game loop
  const boothColliderHandles = [];

  (function buildBooths() {
    const B = CONFIG.booth;
    const arenaR = CONFIG.record.radius;

    // Distance from world origin to the center of each booth platform
    const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;

    // Cardinal angles: slot 0 = +X, slot 1 = +Z, slot 2 = -X, slot 3 = -Z
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

    // Per-booth accent colors (saturated, matching reference image)
    const boothColors = [
      0xff2bd6, // fuchsia/pink
      0x2bff6e, // neon green
      0x2bd6ff, // neon cyan
      0xff6b2b, // neon orange
    ];

    // --- Helper: neon tube between two local-space points ---
    function makeNeonTube(p1, p2, radius, color) {
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.3,
        metalness: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mesh.position.copy(mid);
      const axis = new THREE.Vector3(0, 1, 0);
      const target = dir.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(axis, target);
      mesh.quaternion.copy(quat);
      return mesh;
    }

    // --- Helper: truss tower (lattice of thin boxes) ---
    function makeTruss(height, baseY, color) {
      const trussGroup = new THREE.Group();
      const legW = 0.12;
      const trussW = 0.45;
      const legMat = new THREE.MeshStandardMaterial({
        color: 0x888899, roughness: 0.5, metalness: 0.7,
      });
      const crossMat = new THREE.MeshStandardMaterial({
        color: 0x666677, roughness: 0.5, metalness: 0.6,
      });

      const offsets = [
        [-trussW / 2, -trussW / 2],
        [trussW / 2, -trussW / 2],
        [-trussW / 2, trussW / 2],
        [trussW / 2, trussW / 2],
      ];
      for (const [ox, oz] of offsets) {
        const legGeo = new THREE.BoxGeometry(legW, height, legW);
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(ox, baseY + height / 2, oz);
        trussGroup.add(leg);
      }

      const braceH = 0.08;
      const braceCount = Math.floor(height / 2);
      for (let b = 0; b <= braceCount; b++) {
        const by = baseY + b * 2;
        const xGeo = new THREE.BoxGeometry(trussW, braceH, braceH);
        const xf = new THREE.Mesh(xGeo, crossMat);
        xf.position.set(0, by, -trussW / 2);
        trussGroup.add(xf);
        const xb = new THREE.Mesh(xGeo, crossMat);
        xb.position.set(0, by, trussW / 2);
        trussGroup.add(xb);
        const zGeo = new THREE.BoxGeometry(braceH, braceH, trussW);
        const zl = new THREE.Mesh(zGeo, crossMat);
        zl.position.set(-trussW / 2, by, 0);
        trussGroup.add(zl);
        const zr = new THREE.Mesh(zGeo, crossMat);
        zr.position.set(trussW / 2, by, 0);
        trussGroup.add(zr);
      }

      const lightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
      const lightMat = new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: 2.0,
        roughness: 0.3, metalness: 0.5,
      });
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(0, baseY + height + 0.2, 0);
      trussGroup.add(light);

      return trussGroup;
    }

    // --- Helper: canvas text texture ---
    function makeTextTexture(text, color) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = "#" + new THREE.Color(color).getHexString();
      ctx.font = "bold 64px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    // Spawn platform fog particles
    const fogPuffCount = 40;
    const fogPuffCanvas = document.createElement("canvas");
    fogPuffCanvas.width = 64;
    fogPuffCanvas.height = 64;
    const fogPuffCtx = fogPuffCanvas.getContext("2d");
    const fogPuffGrad = fogPuffCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    fogPuffGrad.addColorStop(0, "rgba(255,255,255,0.3)");
    fogPuffGrad.addColorStop(0.5, "rgba(255,255,255,0.08)");
    fogPuffGrad.addColorStop(1, "rgba(255,255,255,0)");
    fogPuffCtx.fillStyle = fogPuffGrad;
    fogPuffCtx.fillRect(0, 0, 64, 64);
    const fogPuffTex = new THREE.CanvasTexture(fogPuffCanvas);

    for (let i = 0; i < 4; i += 1) {
      const angle = angles[i];
      const accentColor = boothColors[i];

      const cx = boothCenterDist * Math.cos(angle);
      const cz = boothCenterDist * Math.sin(angle);
      const topY = B.platformY;

      const yaw = Math.PI / 2 - angle;

      const boothGroup = new THREE.Group();
      boothGroup.position.set(cx, 0, cz);
      boothGroup.rotation.y = yaw;

      // ===== PLATFORM SLAB =====
      const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
      const platMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        roughness: 0.7,
        metalness: 0.3,
        emissive: accentColor,
        emissiveIntensity: 0.15,
      });
      const platMesh = new THREE.Mesh(platGeo, platMat);
      platMesh.position.set(0, topY, 0);
      boothGroup.add(platMesh);

      // Platform collider (world space)
      const platBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cx, topY, cz),
      );
      const halfYaw = yaw / 2;
      platBody.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
      const boothCollider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(B.platformWidth / 2, B.platformThickness / 2, B.platformDepth / 2)
          .setFriction(B.friction)
          .setRestitution(B.restitution),
        platBody,
      );
      boothColliderHandles.push(boothCollider.handle);


      // ===== NEON EDGE STRIPS (platform perimeter) =====
      const pw = B.platformWidth / 2;
      const pd = B.platformDepth / 2;
      const edgeY = topY + B.platformThickness / 2 + 0.02;
      const edgeR = 0.035;

      const platformEdges = [
        [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, -pd)],
        [new THREE.Vector3(-pw, edgeY, pd), new THREE.Vector3(pw, edgeY, pd)],
        [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(-pw, edgeY, pd)],
        [new THREE.Vector3(pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, pd)],
      ];
      for (const [a, b] of platformEdges) {
        const tube = makeNeonTube(a, b, edgeR, accentColor);
        boothGroup.add(tube);
        boothNeonMeshes.push(tube);
      }


      // ===== SIDE RAILINGS (platform only) =====
      const rh = B.railHeight;
      const railBaseY = topY + B.platformThickness / 2;
      const railTopY = railBaseY + rh;
      const tubeR = B.railThickness / 2;

      for (const ry of [railBaseY, railTopY]) {
        const t = makeNeonTube(
          new THREE.Vector3(-pw, ry, pd),
          new THREE.Vector3(pw, ry, pd),
          tubeR, accentColor,
        );
        boothGroup.add(t);
        boothNeonMeshes.push(t);
      }

      for (const sz of [-pd, pd]) {
        const t = makeNeonTube(
          new THREE.Vector3(-pw, railBaseY, sz),
          new THREE.Vector3(-pw, railTopY, sz),
          tubeR, accentColor,
        );
        boothGroup.add(t);
        boothNeonMeshes.push(t);
      }
      const ltop = makeNeonTube(
        new THREE.Vector3(-pw, railTopY, -pd),
        new THREE.Vector3(-pw, railTopY, pd),
        tubeR, accentColor,
      );
      boothGroup.add(ltop);
      boothNeonMeshes.push(ltop);

      for (const sz of [-pd, pd]) {
        const t = makeNeonTube(
          new THREE.Vector3(pw, railBaseY, sz),
          new THREE.Vector3(pw, railTopY, sz),
          tubeR, accentColor,
        );
        boothGroup.add(t);
        boothNeonMeshes.push(t);
      }
      const rtop = makeNeonTube(
        new THREE.Vector3(pw, railTopY, -pd),
        new THREE.Vector3(pw, railTopY, pd),
        tubeR, accentColor,
      );
      boothGroup.add(rtop);
      boothNeonMeshes.push(rtop);

      // ===== TRUSS TOWERS (4 corners of platform) =====
      const trussHeight = 6;
      const trussBaseY = railBaseY;
      const trussOffsets = [
        [-pw + 0.5, -pd + 0.5],
        [pw - 0.5, -pd + 0.5],
        [-pw + 0.5, pd - 0.5],
        [pw - 0.5, pd - 0.5],
      ];
      for (const [tx, tz] of trussOffsets) {
        const truss = makeTruss(trussHeight, trussBaseY, accentColor);
        truss.position.set(tx, 0, tz);
        boothGroup.add(truss);
      }

      // ===== DECORATIVE SIDE PANELS =====
      const sidePanelMat = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const sidePanelGeo = new THREE.PlaneGeometry(B.platformDepth * 0.8, 1.0);
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(sidePanelGeo, sidePanelMat);
        panel.position.set(side * (pw + 0.02), topY + 1.5, 0);
        panel.rotation.y = side * Math.PI / 2;
        boothGroup.add(panel);

        // Horizontal neon strips on side panels
        for (let s = 0; s < 3; s++) {
          const stripY = topY + 0.8 + s * 0.6;
          const strip = makeNeonTube(
            new THREE.Vector3(side * (pw + 0.03), stripY, -pd * 0.35),
            new THREE.Vector3(side * (pw + 0.03), stripY, pd * 0.35),
            0.02, accentColor
          );
          boothGroup.add(strip);
          boothNeonMeshes.push(strip);
        }
      }

      // Diamond accent on each side
      for (const side of [-1, 1]) {
        const diamondShape = new THREE.BufferGeometry();
        const dh = 0.4;
        const dw = 0.25;
        const verts = new Float32Array([
          0, dh, 0, -dw, 0, 0, 0, -dh, 0,
          0, dh, 0, 0, -dh, 0, dw, 0, 0,
        ]);
        diamondShape.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        const diamond = new THREE.Mesh(diamondShape, new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }));
        diamond.position.set(side * (pw + 0.04), topY + 1.5, 0);
        diamond.rotation.y = side * Math.PI / 2;
        boothGroup.add(diamond);
      }

      // ===== DJ GEAR (behind cart spawn, local +Z = away from arena) =====
      if (B.gearEnabled) {
        const gearGroup = new THREE.Group();
        gearGroup.position.set(0, topY + B.platformThickness / 2, pd - 0.6);

        const mixerGeo = new THREE.BoxGeometry(3.0, 0.5, 1.2);
        const mixerMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a2e, roughness: 0.6, metalness: 0.4,
        });
        const mixer = new THREE.Mesh(mixerGeo, mixerMat);
        mixer.position.set(0, 0.25, 0);
        gearGroup.add(mixer);

        const panelGeo = new THREE.BoxGeometry(2.6, 0.06, 0.8);
        const panelMat = new THREE.MeshStandardMaterial({
          color: 0x333355, roughness: 0.4, metalness: 0.6,
          emissive: accentColor, emissiveIntensity: 0.15,
        });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 0.52, 0);
        gearGroup.add(panel);

        const deckGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16);
        const deckMat = new THREE.MeshStandardMaterial({
          color: 0x0d0d0d, roughness: 0.3, metalness: 0.7,
        });
        const ld = new THREE.Mesh(deckGeo, deckMat);
        ld.position.set(-0.9, 0.55, 0);
        gearGroup.add(ld);
        const rd = new THREE.Mesh(deckGeo, deckMat);
        rd.position.set(0.9, 0.55, 0);
        gearGroup.add(rd);

        const spkGeo = new THREE.BoxGeometry(0.9, 1.6, 0.9);
        const spkMat = new THREE.MeshStandardMaterial({
          color: 0x0e0e1a, roughness: 0.7, metalness: 0.3,
        });
        const ls = new THREE.Mesh(spkGeo, spkMat);
        ls.position.set(-2.2, 0.8, 0.2);
        gearGroup.add(ls);
        const rs = new THREE.Mesh(spkGeo, spkMat);
        rs.position.set(2.2, 0.8, 0.2);
        gearGroup.add(rs);

        const coneGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12);
        const coneMat = new THREE.MeshStandardMaterial({
          color: 0x222233, roughness: 0.9, metalness: 0.1,
        });
        const lc = new THREE.Mesh(coneGeo, coneMat);
        lc.rotation.x = Math.PI / 2;
        lc.position.set(-2.2, 0.9, -0.25);
        gearGroup.add(lc);
        const rc = new THREE.Mesh(coneGeo, coneMat);
        rc.rotation.x = Math.PI / 2;
        rc.position.set(2.2, 0.9, -0.25);
        gearGroup.add(rc);

        // Speaker neon trim
        for (const sx of [-2.2, 2.2]) {
          const spkEdges = [
            [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 0.0, -0.25)],
            [new THREE.Vector3(sx - 0.45, 1.6, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
            [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx - 0.45, 1.6, -0.25)],
            [new THREE.Vector3(sx + 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
          ];
          for (const [a, b] of spkEdges) {
            const edge = makeNeonTube(a, b, 0.015, accentColor);
            gearGroup.add(edge);
            boothNeonMeshes.push(edge);
          }
          // Second speaker cone (woofer)
          const woofer = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12),
            coneMat
          );
          woofer.rotation.x = Math.PI / 2;
          woofer.position.set(sx, 0.4, -0.25);
          gearGroup.add(woofer);
        }

        // Turntable platters (spinning disc on each deck)
        const platterMat = new THREE.MeshStandardMaterial({
          color: 0x222222, roughness: 0.15, metalness: 0.85,
        });
        for (const dx of [-0.9, 0.9]) {
          const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), platterMat);
          platter.position.set(dx, 0.6, 0);
          gearGroup.add(platter);
          // Label dot
          const dot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.025, 12),
            new THREE.MeshBasicMaterial({ color: accentColor })
          );
          dot.position.set(dx, 0.62, 0);
          gearGroup.add(dot);
        }

        // Fader knobs on mixer panel
        const knobMat = new THREE.MeshStandardMaterial({
          color: 0xcccccc, roughness: 0.2, metalness: 0.8,
        });
        for (let k = 0; k < 5; k++) {
          const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), knobMat);
          knob.position.set(-0.5 + k * 0.25, 0.56, 0);
          gearGroup.add(knob);
        }

        // LED strip on mixer front edge
        const ledStrip = makeNeonTube(
          new THREE.Vector3(-1.3, 0.3, -0.6),
          new THREE.Vector3(1.3, 0.3, -0.6),
          0.025, accentColor
        );
        gearGroup.add(ledStrip);
        boothNeonMeshes.push(ledStrip);

        boothGroup.add(gearGroup);
      }

      scene.add(boothGroup);

      for (let f = 0; f < fogPuffCount; f++) {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({
          map: fogPuffTex,
          color: accentColor,
          transparent: true,
          opacity: 0.25 + Math.random() * 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        const spread = B.platformWidth * 1.5;
        const puffScale = 4 + Math.random() * 4;
        puff.scale.set(puffScale, puffScale * 0.3, 1);
        puff.position.set(
          cx + (Math.random() - 0.5) * spread,
          B.platformY + 0.05 + Math.random() * 0.3,
          cz + (Math.random() - 0.5) * spread,
        );
        scene.add(puff);
      }
    }
  })();

  const pitInnerRadius = (CONFIG.record.radius + 2) * 1.30 * 1.20;
  // Diagnostics removed for submission.

  const groundDiscGeo = new THREE.RingGeometry(pitInnerRadius, 150, 64);
  const groundDiscMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3a,
    metalness: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const groundDisc = new THREE.Mesh(groundDiscGeo, groundDiscMat);
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -3;
  scene.add(groundDisc);

  const pitWallDepth = 600;
  const pitWallTopY = -3;
  const pitWallCenterY = pitWallTopY - pitWallDepth / 2;
  const pitWallGeo = new THREE.CylinderGeometry(
    pitInnerRadius,
    pitInnerRadius,
    pitWallDepth,
    64,
    1,
    true,
  );
  {
    const pos = pitWallGeo.attributes.position;
    const pitWallColorArray = new Float32Array(pos.count * 3);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const t = yMax > yMin
        ? Math.max(0, Math.min(1, (y - yMin) / (yMax - yMin)))
        : 0;
      // * Bottom: black. Top: purple in linear components (0.25, 0.03, 0.41).
      pitWallColorArray[i * 3] = 0.25 * t;
      pitWallColorArray[i * 3 + 1] = 0.03 * t;
      pitWallColorArray[i * 3 + 2] = 0.41 * t;
    }
    pitWallGeo.setAttribute("color", new THREE.BufferAttribute(pitWallColorArray, 3));
  }
  const pitWallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.BackSide,
    vertexColors: true,
  });
  const pitWall = new THREE.Mesh(pitWallGeo, pitWallMat);
  pitWall.position.y = pitWallCenterY;
  scene.add(pitWall);
  const pitWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, pitWallCenterY, 0),
  );
  const pitWallVerts = /** @type {Float32Array} */ (pitWallGeo.attributes.position.array);
  const pitWallIndices = pitWallGeo.index
    ? Uint32Array.from(pitWallGeo.index.array)
    : Uint32Array.from(Array.from({ length: pitWallGeo.attributes.position.count }, (_, i) => i));
  const pitWallCollider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(pitWallVerts, pitWallIndices)
      .setFriction(0.2)
      .setRestitution(0.8),
    pitWallBody
  );
  const pitWallColliderHandle = pitWallCollider.handle;

  const groundGridGeo = new THREE.RingGeometry(pitInnerRadius, 150, 64);
  const groundGridMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a5a,
    wireframe: true,
    opacity: 0.25,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const groundGrid = new THREE.Mesh(groundGridGeo, groundGridMat);
  groundGrid.rotation.x = -Math.PI / 2;
  groundGrid.position.y = -2.99;
  scene.add(groundGrid);

  const crowdSourceCart = buildCart("white");
  crowdSourceCart.updateMatrixWorld(true);
  const crowdCartParts = [];
  crowdSourceCart.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    crowdCartParts.push(child.geometry.clone().applyMatrix4(child.matrixWorld));
  });
  const mergedGeo = mergeGeometries(crowdCartParts);
  for (const g of crowdCartParts) g.dispose();
  disposeObject3D(crowdSourceCart);
  const crowdMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });
  const crowdCarts = new THREE.InstancedMesh(mergedGeo, crowdMat, 5000);
  const crowdPalette = Object.values(CART_COLORS).map((entry) => entry.hex);
  const dummy = new THREE.Object3D();
  const crowdWiggleAxisY = new THREE.Vector3(0, 1, 0);
  const crowdWiggleQuat = new THREE.Quaternion();
  for (let i = 0; i < 5000; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = pitInnerRadius + 0.5 + Math.random() * 80;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const scale = 0.25 + Math.random() * 0.2;

    dummy.position.set(x, -2.9, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    dummy.updateMatrix();
    crowdCarts.setMatrixAt(i, dummy.matrix);
    const baseColor = new THREE.Color(crowdPalette[Math.floor(Math.random() * crowdPalette.length)]);
    baseColor.multiplyScalar(0.5);
    crowdCarts.setColorAt(i, baseColor);
  }
  crowdCarts.instanceMatrix.needsUpdate = true;
  if (crowdCarts.instanceColor) crowdCarts.instanceColor.needsUpdate = true;
  scene.add(crowdCarts);

  const crowdGlowGeo = new THREE.RingGeometry(pitInnerRadius, pitInnerRadius + 80, 64);
  const crowdGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const crowdGlow = new THREE.Mesh(crowdGlowGeo, crowdGlowMat);
  crowdGlow.rotation.x = -Math.PI / 2;
  crowdGlow.position.y = -2.95;
  scene.add(crowdGlow);

  const horizonFogGeo = new THREE.CylinderGeometry(150, 150, 40, 64, 8, true);
  const horizonFogMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uColor: { value: new THREE.Color(0x0a0520) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vY;
      void main() {
        float fade = smoothstep(20.0, -10.0, vY);
        gl_FragColor = vec4(uColor, fade * 0.5);
      }
    `,
  });
  const horizonFog = new THREE.Mesh(horizonFogGeo, horizonFogMat);
  horizonFog.position.y = -3;
  scene.add(horizonFog);

  /** @type {{ target: THREE.Object3D, cone: THREE.Mesh, light: THREE.SpotLight, index: number }[]} */
  const crowdSearchlightEntries = [];
  const crowdSearchlightColors = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00];
  const crowdSearchlightSpeeds = [0.2, 0.35, 0.5, 0.25];
  const crowdSearchlightSourceRadius = pitInnerRadius + 30;
  const crowdSearchlightTargetRadius = pitInnerRadius + 35;
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5;
    const target = new THREE.Object3D();
    target.position.set(
      Math.cos(angle) * crowdSearchlightTargetRadius,
      -3,
      Math.sin(angle) * crowdSearchlightTargetRadius,
    );
    scene.add(target);

    const searchlight = new THREE.SpotLight(
      crowdSearchlightColors[i],
      30,
      200,
      Math.PI * 0.35,
      0.8,
      1.5,
    );
    searchlight.position.set(
      Math.cos(angle) * crowdSearchlightSourceRadius,
      25,
      Math.sin(angle) * crowdSearchlightSourceRadius,
    );
    searchlight.target = target;
    scene.add(searchlight);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(12, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: crowdSearchlightColors[i],
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    cone.position.copy(searchlight.position);
    cone.lookAt(target.position);
    cone.rotateX(-Math.PI / 2);
    scene.add(cone);
    crowdSearchlightEntries.push({ target, cone, light: searchlight, index: i });
  }

  /** @type {{ light: THREE.PointLight, index: number }[]} */
  const crowdPointLightEntries = [];
  const crowdPointLightRadiusMin = pitInnerRadius + 10;
  const crowdPointLightRadiusRange = 35;
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    const radius = crowdPointLightRadiusMin + Math.random() * crowdPointLightRadiusRange;
    const light = new THREE.PointLight(crowdPalette[i % crowdPalette.length], 4, 50, 2);
    light.position.set(
      Math.cos(angle) * radius,
      1 + Math.random() * 6,
      Math.sin(angle) * radius,
    );
    scene.add(light);
    const lightBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({
        color: crowdPalette[i % crowdPalette.length],
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    lightBulb.position.copy(light.position);
    scene.add(lightBulb);
    crowdPointLightEntries.push({ light, index: i });
  }

  const stageAngle = 0;
  const stageRadius = pitInnerRadius + 15;
  const stageX = Math.cos(stageAngle) * stageRadius;
  const stageZ = Math.sin(stageAngle) * stageRadius;
  const stageY = -3;
  const stageGroup = new THREE.Group();
  const stageBaseMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a1a,
    metalness: 0.8,
    roughness: 0.3,
  });
  const stageMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    metalness: 0.8,
    roughness: 0.4,
  });
  const stageSpeakerMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a12,
    metalness: 0.7,
    roughness: 0.3,
  });
  const stageSpeakerFaceMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const stageLedMat = new THREE.MeshBasicMaterial({ color: 0x1100aa });
  const stageFrameMat = new THREE.MeshBasicMaterial({ color: 0x0a0a1a });
  const neonMagentaMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const stageLightPalette = Object.values(CART_COLORS).map((entry) => entry.hex);
  /** @type {{ target: THREE.Object3D, baseX: number, index: number }[]} */
  const stageLightEntries = [];
  /** @type {{ mesh: THREE.Mesh, index: number, speed: number, phaseStep: number, amplitude: number, baseZ: number }[]} */
  const laserEntries = [];

  function addLaserBeam({
    position,
    color,
    radius,
    length,
    opacity,
    tiltX,
    index,
    speed,
    phaseStep,
    amplitude,
    baseQuaternion,
    faceCenter = false,
  }) {
    const laserGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
    laserGeo.translate(0, length / 2, 0);
    const laserMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.copy(position);
    if (baseQuaternion) {
      laser.quaternion.copy(baseQuaternion);
    } else if (faceCenter) {
      laser.lookAt(0, 0, 0);
    }
    laser.rotateX(tiltX);
    scene.add(laser);
    laserEntries.push({
      mesh: laser,
      index,
      speed,
      phaseStep,
      amplitude,
      baseZ: laser.rotation.z,
    });
  }

  stageGroup.clear();

  // --- Base platform ---
  const stageBase = new THREE.Mesh(new THREE.BoxGeometry(24, 1.5, 10), stageBaseMat);
  stageBase.position.y = 0.75;
  stageGroup.add(stageBase);

  // --- Two outer truss towers (left and right) ---
  const towerXs = [-11, 11];
  for (const towerX of towerXs) {
    for (const ox of [-0.5, 0.5]) {
      for (const oz of [-0.5, 0.5]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 18, 8),
          stageMetalMat,
        );
        pole.position.set(towerX + ox, 9, oz);
        stageGroup.add(pole);
      }
    }

    for (let b = 0; b < 6; b += 1) {
      const braceY = 1.5 + b * 3;
      const braceX = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), stageMetalMat);
      braceX.position.set(towerX, braceY, 0);
      stageGroup.add(braceX);
      const braceZ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
      braceZ.position.set(towerX, braceY, 0);
      stageGroup.add(braceZ);
    }
  }

  // --- Top horizontal truss spanning between towers ---
  for (const z of [-0.5, 0.5]) {
    const topPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 22, 8),
      stageMetalMat,
    );
    topPole.rotation.z = Math.PI / 2;
    topPole.position.set(0, 18, z);
    stageGroup.add(topPole);
  }
  for (let x = -10; x <= 10; x += 2) {
    const spanBrace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
    spanBrace.position.set(x, 18, 0);
    stageGroup.add(spanBrace);
  }

  // --- LED screen (center back wall) ---
  const ledCanvas = document.createElement('canvas');
  ledCanvas.width = 512;
  ledCanvas.height = 256;
  const ledCtx = ledCanvas.getContext('2d');
  // Background gradient
  const ledGrad = ledCtx.createLinearGradient(0, 0, 512, 256);
  ledGrad.addColorStop(0, '#0a0020');
  ledGrad.addColorStop(0.5, '#1a0040');
  ledGrad.addColorStop(1, '#0a0020');
  ledCtx.fillStyle = ledGrad;
  ledCtx.fillRect(0, 0, 512, 256);
  // "CART" text
  ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
  ledCtx.textAlign = 'center';
  ledCtx.textBaseline = 'middle';
  ledCtx.fillStyle = '#ff2bd6';
  ledCtx.shadowColor = '#ff2bd6';
  ledCtx.shadowBlur = 20;
  ledCtx.fillText('CART', 256, 100);
  // "RAVE" text
  ledCtx.fillStyle = '#ffe53d';
  ledCtx.shadowColor = '#ffe53d';
  ledCtx.shadowBlur = 20;
  ledCtx.fillText('RAVE', 256, 185);
  // Scanline overlay
  ledCtx.shadowBlur = 0;
  for (let y = 0; y < 256; y += 4) {
    ledCtx.fillStyle = 'rgba(0,0,0,0.15)';
    ledCtx.fillRect(0, y, 512, 2);
  }
  const ledTex = new THREE.CanvasTexture(ledCanvas);
  const ledScreenMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const ledScreen = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.3), ledScreenMat);
  ledScreen.position.set(0, 9, -4);
  stageGroup.add(ledScreen);
  const ledFrame = new THREE.Mesh(new THREE.BoxGeometry(16.5, 8.5, 0.2), stageFrameMat);
  ledFrame.position.set(0, 9, -4.3);
  stageGroup.add(ledFrame);

  // --- Speaker stacks (two per side) ---
  const speakerXs = [-9, -7, 7, 9];
  const speakerYs = [1.5, 3.5, 5.5];
  for (const sx of speakerXs) {
    for (const sy of speakerYs) {
      const speaker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), stageSpeakerMat);
      speaker.position.set(sx, sy, 0);
      stageGroup.add(speaker);
      const speakerFace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16),
        stageSpeakerFaceMat,
      );
      speakerFace.rotation.x = Math.PI / 2;
      speakerFace.position.set(sx, sy, 1.01);
      stageGroup.add(speakerFace);
    }
  }

  // --- Neon trim ---
  const neonTop = new THREE.Mesh(new THREE.BoxGeometry(22, 0.08, 0.08), neonMagentaMat);
  neonTop.position.set(0, 18, 0);
  stageGroup.add(neonTop);
  for (const towerX of towerXs) {
    const towerTopNeon = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), neonCyanMat);
    towerTopNeon.position.set(towerX, 18, 0);
    stageGroup.add(towerTopNeon);
  }
  const neonBaseFront = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.08), neonMagentaMat);
  neonBaseFront.position.set(0, 1.54, 5);
  stageGroup.add(neonBaseFront);

  // --- Stage lights (mounted on top truss, sweeping targets over stage base) ---
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    const color = stageLightPalette[i % stageLightPalette.length];
    const light = new THREE.SpotLight(color, 3, 30, Math.PI / 6, 0.5);
    light.position.set(lx, 18, 0);
    stageGroup.add(light);
    const target = new THREE.Object3D();
    target.position.set(lx, 0, 0);
    stageGroup.add(target);
    light.target = target;
    stageLightEntries.push({ target, baseX: lx, index: i });
  }

  stageGroup.position.set(stageX, stageY, stageZ);
  stageGroup.lookAt(0, stageGroup.position.y, 0);
  scene.add(stageGroup);
  stageGroup.updateMatrixWorld(true);

  // ===== CURSOR VIBE JAM 2026 BILLBOARD =====
  // Hoisted so the render loop can animate them
  let bbSmallCtx;
  let bbTex;
  let slTex;
  let bbLastRedraw = 0;
  {
    const bbAngle = Math.PI;
    const bbRadius = pitInnerRadius + 25;

    // Pixel-art canvas texture
    const bbSmallCanvas = document.createElement('canvas');
    bbSmallCanvas.width = 256;
    bbSmallCanvas.height = 64;
    bbSmallCtx = bbSmallCanvas.getContext('2d');
    bbSmallCtx.imageSmoothingEnabled = false;
    bbSmallCtx.fillStyle = '#000000';
    bbSmallCtx.fillRect(0, 0, 256, 64);
    bbSmallCtx.fillStyle = '#ffffff';
    bbSmallCtx.font = '14px monospace';
    bbSmallCtx.textAlign = 'center';
    bbSmallCtx.textBaseline = 'middle';
    bbSmallCtx.fillText('CURSOR VIBE JAM 2026', 128, 32);
    bbTex = new THREE.CanvasTexture(bbSmallCanvas);
    bbTex.magFilter = THREE.NearestFilter;
    bbTex.minFilter = THREE.NearestFilter;
    bbTex.colorSpace = THREE.SRGBColorSpace;

    // Scanline overlay canvas with RepeatWrapping for UV scroll
    const slCanvas = document.createElement('canvas');
    slCanvas.width = 128;
    slCanvas.height = 256;
    const slCtx = slCanvas.getContext('2d');
    for (let y = 0; y < 256; y += 2) {
      slCtx.fillStyle = 'rgba(0,0,0,0.3)';
      slCtx.fillRect(0, y + 1, 128, 1);
    }
    slTex = new THREE.CanvasTexture(slCanvas);
    slTex.wrapS = THREE.RepeatWrapping;
    slTex.wrapT = THREE.RepeatWrapping;

    const bbPoleMat = new THREE.MeshStandardMaterial({
      color: 0x333344, metalness: 0.8, roughness: 0.3,
    });
    const bbNeonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const bbNeonMagentaMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const billboardGroup = new THREE.Group();

    // Screen
    const bbScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: bbTex })
    );
    billboardGroup.add(bbScreen);

    // Scanline overlay
    const bbScanlines = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({
        map: slTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    bbScanlines.position.z = 0.01;
    billboardGroup.add(bbScanlines);

    // Neon frame bars — cyan front layer + magenta halo behind
    const bbFrameParts = [
      { w: 12.3, h: 0.15, d: 0.15, x: 0,      y:  1.575, z: 0 },
      { w: 12.3, h: 0.15, d: 0.15, x: 0,      y: -1.575, z: 0 },
      { w: 0.15, h: 3.3,  d: 0.15, x: -6.075, y:  0,     z: 0 },
      { w: 0.15, h: 3.3,  d: 0.15, x:  6.075, y:  0,     z: 0 },
    ];
    for (const { w, h, d, x, y } of bbFrameParts) {
      const cyanBar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bbNeonCyanMat);
      cyanBar.position.set(x, y, 0);
      billboardGroup.add(cyanBar);
      const haloBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1), bbNeonMagentaMat);
      haloBar.position.set(x, y, -0.05);
      billboardGroup.add(haloBar);
    }

    // Support poles
    for (const sx of [-5.5, 5.5]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 5, 8),
        bbPoleMat
      );
      pole.position.set(sx, -1.5 - 2.5, 0);
      billboardGroup.add(pole);
    }

    // Accent point lights — cyan left, magenta right
    const bbLightL = new THREE.PointLight(0x00ffff, 2, 8);
    bbLightL.position.set(-6.5, 0, 0.5);
    billboardGroup.add(bbLightL);
    const bbLightR = new THREE.PointLight(0xff00ff, 2, 8);
    bbLightR.position.set(6.5, 0, 0.5);
    billboardGroup.add(bbLightR);

    billboardGroup.position.set(
      Math.cos(bbAngle) * bbRadius,
      0,
      Math.sin(bbAngle) * bbRadius
    );
    billboardGroup.lookAt(0, -3, 0);
    scene.add(billboardGroup);
  }

  // ===== EXIT PORTAL =====
  // Hoisted so render loop can animate and check proximity
  let portalCtx;
  let portalTex;
  let portalTriggered = false;
  const portalWorldPos = new THREE.Vector3();
  let returnPortalCtx = null;
  let returnPortalTex = null;
  let hasReturnPortals = false;
  {
    const bbAngle = Math.PI;
    const portalRadius = pitInnerRadius - 2;
    const px = Math.cos(bbAngle) * portalRadius;
    const py = -9.5;
    const pz = Math.sin(bbAngle) * portalRadius;
    portalWorldPos.set(px, py, pz);

    const portalCanvas = document.createElement('canvas');
    portalCanvas.width = 128;
    portalCanvas.height = 128;
    portalCtx = portalCanvas.getContext('2d');
    portalTex = new THREE.CanvasTexture(portalCanvas);
    portalTex.magFilter = THREE.NearestFilter;
    portalTex.minFilter = THREE.NearestFilter;

    const portalGroup = new THREE.Group();

    // Portal face
    const portalMesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 32),
      new THREE.MeshBasicMaterial({ map: portalTex, side: THREE.DoubleSide })
    );
    portalGroup.add(portalMesh);

    // Glow ring
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.7, 0.15, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00ff66,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    portalGroup.add(glowRing);

    // Ambient green glow on nearby crowd/wall
    const portalLight = new THREE.PointLight(0x00ff44, 3, 10);
    portalGroup.add(portalLight);

    // CSS2D floating label
    // 3D canvas label — occluded naturally by scene geometry
    const plLabelCanvas = document.createElement('canvas');
    plLabelCanvas.width = 256;
    plLabelCanvas.height = 48;
    const plLabelCtx = plLabelCanvas.getContext('2d');
    plLabelCtx.clearRect(0, 0, 256, 48);
    plLabelCtx.font = 'bold 22px "Bungee", monospace';
    plLabelCtx.textAlign = 'center';
    plLabelCtx.textBaseline = 'middle';
    plLabelCtx.shadowColor = '#00ff44';
    plLabelCtx.shadowBlur = 10;
    plLabelCtx.fillStyle = '#00ff66';
    plLabelCtx.fillText('EXIT PORTAL', 128, 24);
    const plLabelTex = new THREE.CanvasTexture(plLabelCanvas);
    const plLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 0.65),
      new THREE.MeshBasicMaterial({
        map: plLabelTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    plLabel.position.set(0, 3.0, 0);
    portalGroup.add(plLabel);

    portalGroup.position.set(px, py, pz);
    portalGroup.lookAt(0, py, 0);
    scene.add(portalGroup);
  }

  // ===== RETURN PORTAL (only when arriving via portal with ?ref=) =====
  if (incomingPortalParams?.ref) {
    const portalCanvas = document.createElement("canvas");
    portalCanvas.width = 128;
    portalCanvas.height = 128;
    returnPortalCtx = portalCanvas.getContext("2d");
    returnPortalTex = new THREE.CanvasTexture(portalCanvas);
    returnPortalTex.magFilter = THREE.NearestFilter;
    returnPortalTex.minFilter = THREE.NearestFilter;

    const plLabelCanvas = document.createElement("canvas");
    plLabelCanvas.width = 256;
    plLabelCanvas.height = 48;
    const plLabelCtx = plLabelCanvas.getContext("2d");
    plLabelCtx.clearRect(0, 0, 256, 48);
    plLabelCtx.font = 'bold 22px "Bungee", monospace';
    plLabelCtx.textAlign = "center";
    plLabelCtx.textBaseline = "middle";
    plLabelCtx.shadowColor = "#00ccff";
    plLabelCtx.shadowBlur = 10;
    plLabelCtx.fillStyle = "#00ccff";
    plLabelCtx.fillText("RETURN PORTAL", 128, 24);
    const plLabelTex = new THREE.CanvasTexture(plLabelCanvas);
    const plLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 0.65),
      new THREE.MeshBasicMaterial({
        map: plLabelTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    plLabel.position.set(0, 3.0, 0);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const dist = CONFIG.cart.spawnRingRadius + CONFIG.booth.platformDepth / 2 + 1.0;
      const rpx = dist * Math.cos(angle);
      const rpz = dist * Math.sin(angle);
      const rpy = CONFIG.booth.platformY + CONFIG.booth.platformThickness / 2 + 2.5;
      returnPortalWorldPositions.push(new THREE.Vector3(rpx, rpy, rpz));

      const portalGroup = new THREE.Group();

      const portalMesh = new THREE.Mesh(
        new THREE.CircleGeometry(2.5, 32),
        new THREE.MeshBasicMaterial({ map: returnPortalTex, side: THREE.DoubleSide })
      );
      portalGroup.add(portalMesh);

      const glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.7, 0.15, 8, 32),
        new THREE.MeshBasicMaterial({
          color: 0x00ccff,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      portalGroup.add(glowRing);

      const portalLight = new THREE.PointLight(0x00ccff, 3, 10);
      portalGroup.add(portalLight);

      portalGroup.add(plLabel.clone());

      portalGroup.position.set(rpx, rpy, rpz);
      portalGroup.lookAt(0, rpy, 0);
      scene.add(portalGroup);
    }

    hasReturnPortals = returnPortalWorldPositions.length > 0;
  }

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    addLaserBeam({
      position: stageGroup.localToWorld(new THREE.Vector3(lx, 18, 0)),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.15,
      length: 80,
      opacity: 0.6,
      tiltX: -Math.PI * 0.3,
      index: i,
      speed: 0.5,
      phaseStep: 1.05,
      amplitude: 0.6,
      baseQuaternion: stageGroup.quaternion,
    });
  }

  const arenaLaserRadius = pitInnerRadius + 5;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    addLaserBeam({
      position: new THREE.Vector3(
        Math.cos(angle) * arenaLaserRadius,
        -3,
        Math.sin(angle) * arenaLaserRadius,
      ),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.12,
      length: 80,
      opacity: 0.5,
      tiltX: -Math.PI * 0.35,
      index: i,
      speed: 0.4,
      phaseStep: 0.52,
      amplitude: 0.5,
      faceCenter: true,
    });
  }

  const skyLaserRadius = pitInnerRadius + 50;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    addLaserBeam({
      position: new THREE.Vector3(
        Math.cos(angle) * skyLaserRadius,
        -3,
        Math.sin(angle) * skyLaserRadius,
      ),
      color: i % 2 === 0 ? 0xff00ff : 0x00ffff,
      radius: 0.18,
      length: 120,
      opacity: 0.45,
      tiltX: -Math.PI * 0.4,
      index: i,
      speed: 0.3,
      phaseStep: 0.79,
      amplitude: 0.7,
      faceCenter: true,
    });
  }

  // (yawToCenter, quatFromYaw, and createCart removed - using modular Entities equivalents)

  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + CONFIG.fall.respawnDelayMs;
    if (cart === localCartForConnId()) {
      sfx.playFallOff();
    }
  }

  // (doRespawn removed - using modular Entities version)

  respawnLocalMidRoundJoinRef.current = () => {
    const localConnId = Netcode.getYouConnId();
    if (!localConnId || pendingMidRoundJoinRespawnConnId !== localConnId) return;
    if (GameState.getRoundState().phase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    pendingMidRoundJoinRespawnConnId = null;
  };

  // (applyArcadeControls and spawnOnRingForSlot removed - using modular equivalents)

  // Menu music — plays on page load, stops when game starts
  const menuMusicUrl = new URL("sounds/menu.mp3", window.location.href).toString();
  menuMusicEl = new Audio();
  menuMusicEl.loop = true;
  menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
  menuMusicEl.preload = "auto";
  menuMusicEl.src = menuMusicUrl;
  let menuMusicStarted = false;
  menuMusicEl.addEventListener("error", () => {
  });
  menuMusicEl.load();

  // Try to autoplay menu music immediately (will need user gesture on most browsers)
  function tryStartMenuMusic() {
    if (!menuMusicEl || menuMusicStarted || isMuted) return;
    menuMusicEl.volume = CONFIG.audio.musicVolume * masterGain;
    void menuMusicEl.play().then(
      () => {
        menuMusicStarted = true;
      },
      () => {},
    );
  }
  window.__cartRaveTryStartMenuMusic = tryStartMenuMusic;
  tryStartMenuMusic();

  stopMenuMusic = function () {
    if (!menuMusicEl) return;
    menuMusicEl.pause();
    menuMusicEl.currentTime = 0;
    menuMusicStarted = false;
  };

  startMenuMusic = function () {
    if (!menuMusicEl) return;
    menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
    menuMusicStarted = false;
    tryStartMenuMusic();
  };

  if (menuVisible) {
    try {
      startMenuMusic();
    } catch (e) {}
  }

  const gameMusicFiles = ["music.mp3", "song2.mp3", "song3.mp3", "song4.mp3"];
  const gameMusicUrls = gameMusicFiles.map((f) =>
    new URL(`sounds/${f}`, window.location.href).toString(),
  );
  for (let i = gameMusicUrls.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = gameMusicUrls[i];
    gameMusicUrls[i] = gameMusicUrls[j];
    gameMusicUrls[j] = tmp;
  }
  let gameMusicIndex = 0;

  /** @type {HTMLAudioElement[]|null} */
  let lazyGameMusicPreloads = null;

  function preloadExtraGameMusicTracks() {
    if (lazyGameMusicPreloads) return;
    lazyGameMusicPreloads = [];
    for (let i = 1; i < gameMusicUrls.length; i += 1) {
      const a = new Audio();
      a.preload = "auto";
      a.src = gameMusicUrls[i];
      try { a.load(); } catch {}
      lazyGameMusicPreloads.push(a);
    }
  }

  // Lazy-fetch extra game tracks after menu renders (avoids extra network on first paint).
  // This is scheduled after ambient music state initializes to avoid TDZ/hoisting issues.
  setTimeout(preloadExtraGameMusicTracks, 0);

  function advanceGameMusicTrack() {
    if (!musicEl || gameMusicUrls.length === 0) return;
    try {
      musicEl.pause();
      musicEl.currentTime = 0;
    } catch {}
    gameMusicIndex = (gameMusicIndex + 1) % gameMusicUrls.length;
    musicEl.src = gameMusicUrls[gameMusicIndex];
    try { musicEl.load(); } catch {}
    try { applyAudioVolume(); } catch {}
    if (!menuVisible) {
      void musicEl.play().catch(() => {});
    }
  }

  const musicUrl = gameMusicUrls[gameMusicIndex];
  musicEl = new Audio();
  musicEl.loop = false;
  musicEl.volume = CONFIG.audio.musicVolume * masterGain;
  musicEl.preload = "auto";
  musicEl.src = musicUrl;
  musicEl.addEventListener("ended", () => {
    if (menuVisible) return;
    advanceGameMusicTrack();
  });
  musicEl.addEventListener("error", () => {
    if (gameMusicUrls.length > 1) {
      advanceGameMusicTrack();
      return;
    }
    musicUnavailable = true;
  });
  musicEl.load();

  tryStartAmbientMusic = function () {
    if (!musicEl || musicStarted || musicUnavailable) return;
    void musicEl.play().then(
      () => {
        musicStarted = true;
      },
      () => {
        // * Autoplay may block until a gesture; missing file sets musicUnavailable.
      },
    );
  };

  await firstHelloPromise;
  returnPortalArmedAtMs = Date.now() + 3000;

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
    el.style.padding = "4px 10px";
    el.style.borderRadius = "4px";
    el.style.background = "rgba(0, 0, 0, 0.7)";
    el.style.color = "#fff";
    el.style.fontFamily = "'Bungee', cursive";
    el.style.fontSize = "18px";
    el.style.fontWeight = "700";
    el.style.lineHeight = "1";
    el.style.whiteSpace = "nowrap";
    el.style.border = `2px solid ${color}`;
    el.style.boxShadow = `0 0 9px ${color}66, inset 0 0 8px ${color}26`;
    el.style.textShadow = `0 0 4px ${color}`;
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
      label.element.style.fontSize = `${24 * scale}px`;
      label.element.style.padding = `${6 * scale}px ${14 * scale}px`;
      label.element.style.textShadow = `0 0 ${6 * scale}px ${label._labelColor}`;
    }
  }

  updateNameLabelsRef.current = updateNameLabels;
  updateNameLabels();

  getAxisRef = input.getAxis;
  triggerRamBoostRef = triggerRamBoost;
  Netcode.setRefs({
    getAxisRef: input.getAxis,
    triggerRamBoostRef: triggerRamBoost,
    resetSimTimingRef,
  });

  /** @type {{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; birthMs: number; durationMs: number; cart: ReturnType<typeof createCart> }[]} */
  let nitroFirstBoostDiagnosticLogged = false;
  const ramBoostStreakAlignQuat = new THREE.Quaternion();
  const ramBoostCylinderAxisY = new THREE.Vector3(0, 1, 0);
  const ramBoostStreakScratchOrigin = new THREE.Vector3();
  const ramBoostStreakScratchPos = new THREE.Vector3();
  const ramBoostForwardXZ = new THREE.Vector3();
  const ramBoostToTargetXZ = new THREE.Vector3();

  /**
   * @param {ReturnType<typeof createCart>} cart
   * @param {number} birthMs
   */
  function spawnRamBoostStreakForCart(cart, birthMs) {
    const rb = CONFIG.cart.ramBoost;
    const rot = cart.body.rotation();
    const yaw = Simulation.yawFromQuaternion(rot);
    const { forward, right } = Simulation.getForwardRightFromYaw(yaw);
    const fwd = forward.clone().normalize();
    const rgt = right.clone().normalize();
    ramBoostStreakAlignQuat.setFromUnitVectors(ramBoostCylinderAxisY, fwd);
    const t = cart.body.translation();
    ramBoostStreakScratchOrigin.set(t.x, t.y, t.z);
    const back = Math.random() * 1.0;
    const lat = (Math.random() * 2 - 1) * 0.5;
    ramBoostStreakScratchPos
      .copy(ramBoostStreakScratchOrigin)
      .addScaledVector(fwd, -back)
      .addScaledVector(rgt, lat);
    const geo = new THREE.CylinderGeometry(0.03, 0.03, rb.streakLengthMeters, 8, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: cart.cartColor,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(ramBoostStreakScratchPos);
    mesh.quaternion.copy(ramBoostStreakAlignQuat);
    scene.add(mesh);
    ramBoostStreaks.push({
      mesh,
      material: mat,
      birthMs,
      durationMs: rb.streakDurationSec * 1000,
      cart,
    });
  }

  /**
   * @param {ReturnType<typeof createCart>} cart
   * @param {number} nowMs
   */
  function triggerRamBoost(cart, nowMs) {
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

    nitroFirstBoostDiagnosticLogged = true;
  }

  function triggerHop(cart, nowMs) {
    if (nowMs - cart.lastHopAtMs < CONFIG.cart.hop.cooldownMs) return;
    if (!cart.body) return;
    cart.lastHopAtMs = nowMs;
    cart.body.applyImpulse({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
    if (cart === localCartForConnId()) {
      sfx.playHop();
    }
  }

  /**
   * @param {number} nowMs
   * @param {number} dtSec
   */
  function tickRamBoostStreakSpawners(nowMs, dtSec) {
    const rb = CONFIG.cart.ramBoost;
    if (!rb.enabled || dtSec <= 0) return;
    for (const cart of allCarts) {
      if (nowMs > cart.ramBoostActiveUntilMs) continue;
      cart.ramBoostStreakCarry += rb.streakSpawnRatePerSec * dtSec;
      while (cart.ramBoostStreakCarry >= 1) {
        cart.ramBoostStreakCarry -= 1;
        spawnRamBoostStreakForCart(cart, nowMs);
      }
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

  /**
   * @param {number} nowMs
   */
  function updateRamBoostStreaks(nowMs) {
    for (let i = ramBoostStreaks.length - 1; i >= 0; i -= 1) {
      const s = ramBoostStreaks[i];
      const t = (nowMs - s.birthMs) / s.durationMs;
      if (t >= 1) {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.material.dispose();
        ramBoostStreaks.splice(i, 1);
      } else {
        const baseOpacity = 1 - t;
        if (GameState.getRoundState().phase === "running" && s.cart && s.cart.ramBoostActiveUntilMs > performance.now()) {
          const pulse = 1.2 + 0.4 * Math.sin(performance.now() * 0.02);
          s.material.opacity = clamp(baseOpacity * (pulse / 1.2), 0, 1);
        } else {
          s.material.opacity = baseOpacity;
        }
      }
    }
  }

  // (rematchResetWorld removed - using modular Entities version)

  function pickAiTarget(fromPos) {
    const dist = Math.hypot(fromPos.x, fromPos.z);
    const edgeBiasStart = CONFIG.record.radius * 0.78;

    // * 45% chance: target nearest human cart position with a small offset.
    if (Math.random() < 0.495) {
      let nearestHuman = null;
      let nearestD2 = Infinity;
      for (let i = 0; i < allCarts.length; i += 1) {
        const s = Netcode.getNetSlots()[i];
        if (!s || s.kind !== "human" || !s.connId) continue;
        const hp = allCarts[i].body.translation();
        const dx = hp.x - fromPos.x;
        const dz = hp.z - fromPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearestHuman = allCarts[i];
        }
      }
      if (nearestHuman) {
        const hp = nearestHuman.body.translation();
        const jitter = 1.8;
        return { x: hp.x + (Math.random() - 0.5) * jitter, z: hp.z + (Math.random() - 0.5) * jitter };
      }
    }

    if (dist > edgeBiasStart) {
      const a = Math.random() * Math.PI * 2;
      const r = CONFIG.record.radius * 0.45;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }

    const minR = CONFIG.record.innerRadius * 2.0;
    const maxR = CONFIG.record.radius * 0.85;
    const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /**
   * @param {number} now
   * @param {{ body: any; aiNextDecisionMs: number; aiTarget: { x: number; z: number } }} cart
   */
  function getAiAxis(now, cart) {
    const p = cart.body.translation();
    if (now >= cart.aiNextDecisionMs) {
      cart.aiTarget = pickAiTarget(p);
      cart.aiNextDecisionMs = now + (720 + Math.random() * 900);
    }

    const toTarget = new THREE.Vector3(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    if (toTarget.lengthSq() < 0.25) {
      cart.aiTarget = pickAiTarget(p);
      cart.aiNextDecisionMs = now + (720 + Math.random() * 900);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    }
    toTarget.normalize();

    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    const currentYaw = Simulation.yawFromQuaternion(cart.body.rotation());
    const yawDiff = Simulation.wrapAngleRad(desiredYaw - currentYaw);

    const turn = clamp(yawDiff * 2.2, -1, 1);
    const forward = Math.abs(yawDiff) > 1.8 ? -0.7 : 1;
    return { forward, turn };
  }

  // --- Input ---

  // --- Ambient music ---

  // Step 10d: Apply audio volume to engine
  function applyAudioVolume() {
    if (audioListener && typeof audioListener.setMasterVolume === 'function') {
      audioListener.setMasterVolume(isMuted ? 0 : sfxVolume);
    }
    if (musicEl) {
      musicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
      musicEl.muted = isMuted;
    }
    if (menuMusicEl) {
      menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
      menuMusicEl.muted = isMuted;
    }

    // Keep procedural P2 SFX in sync with mute/volume changes.
    try { crowd?.applyAmbient?.(); } catch {}
    try { leaderHum?.resyncVolume?.(); } catch {}
  }

  // Initialize audio with saved settings
  applyAudioVolume();

  let didResumeAudioContext = false;
  let audioContextResumeInFlight = false;
  function unlockAudioAndMaybeStartMusic() {
    if (!didResumeAudioContext && !audioContextResumeInFlight) {
      audioContextResumeInFlight = true;
      void audioListener.context.resume().then(
        () => {
          didResumeAudioContext = true;
          audioContextResumeInFlight = false;
          ensureCartCrashBufferLoaded();
        },
        () => {
          audioContextResumeInFlight = false;
        },
      );
    }
    tryStartAmbientMusic();
  }

  canvas.addEventListener("pointerdown", () => {
    void audioListener.context.resume().then(
      () => { ensureCartCrashBufferLoaded(); },
      () => {},
    );
    if (!menuVisible) tryStartAmbientMusic();
    canvas.focus();
  });
  window.addEventListener("pointerdown", () => {
    void audioListener.context.resume().then(
      () => { ensureCartCrashBufferLoaded(); },
      () => {},
    );
    if (!menuVisible) tryStartAmbientMusic();
  }, { passive: true });

  // (applyRammingImpulse removed - using modular Simulation version)



  function startRunning() {
    syncRoundPhase("running");
    slowMoActive = false;
    GameState.setRoundStartedAtMs(Date.now());
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    roundStartingHumanCount = 0;
    for (let i = 0; i < 4; i += 1) {
      const s = Netcode.getNetSlots()[i];
      if (s && s.kind === "human" && s.connId != null) roundStartingHumanCount += 1;
    }
    if (lastCartStandingTimeoutId != null) {
      clearTimeout(lastCartStandingTimeoutId);
      lastCartStandingTimeoutId = null;
    }
    lastCartStandingWinnerSlotIndex = null;
    Netcode.sendHostRound();
  }

  function startCountdown() {
    if (!Netcode.getIsHost()) return;
    syncRoundPhase("countdown");
    slowMoActive = false;
    GameState.setRoundCountdownStartedAtMs(Date.now());
    GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
    GameState.setRoundWinnerSlotIndex(null);
    GameState.setRoundStartedAtMs(0);
    if (lastCartStandingTimeoutId != null) {
      clearTimeout(lastCartStandingTimeoutId);
      lastCartStandingTimeoutId = null;
    }
    lastCartStandingWinnerSlotIndex = null;
    Netcode.sendHostRound();
    setTimeout(() => {
      if (GameState.getRoundState().phase === "countdown") startRunning();
    }, 3000);
  }

  function endRound() {
    if (lastCartStandingWinnerSlotIndex !== null) {
      if (roundPodiumTimeoutId != null) {
        clearTimeout(roundPodiumTimeoutId);
        roundPodiumTimeoutId = null;
      }
      if (lastCartStandingTimeoutId != null) {
        clearTimeout(lastCartStandingTimeoutId);
        lastCartStandingTimeoutId = null;
      }
      pendingMidRoundJoinRespawnConnId = null;
      GameState.setRoundWinnerSlotIndex(lastCartStandingWinnerSlotIndex);
      recordPodiumStats(GameState.getRoundState().winnerSlotIndex, GameState.getRoundScores());
      syncRoundPhase("podium");
      lastCartStandingWinnerSlotIndex = null;
      if (!slowMoActive) {
        slowMoActive = true;
        slowMoStartMs = performance.now();
      }
      Netcode.sendHostRound();
      return;
    }
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    if (lastCartStandingTimeoutId != null) {
      clearTimeout(lastCartStandingTimeoutId);
      lastCartStandingTimeoutId = null;
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
    if (!slowMoActive) {
      slowMoActive = true;
      slowMoStartMs = performance.now();
    }
    Netcode.sendHostRound();
  }

  function clearAutoContinuePodiumTimeout() {
    if (autoContinuePodiumTimeoutId != null) {
      clearTimeout(autoContinuePodiumTimeoutId);
      autoContinuePodiumTimeoutId = null;
    }
  }

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

  function onHostPlayAgainClick() {
    if (!Netcode.getIsHost()) return;
    autoContinuePodiumKey = currentPodiumAutoContinueKey();
    clearAutoContinuePodiumTimeout();
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    Entities.rematchResetWorld();
    const cache = Netcode.getLastCartsCache();
    if (cache) {
      Netcode.broadcastHostTransform(cache);
    }
    Netcode.sendPlayAgain();

    // Skip re-ready flow: host immediately starts the next round.
    setTimeout(() => startCountdown(), 3000);
  }

  resultsUi.playAgain.addEventListener("click", onHostPlayAgainClick);



  // --- Simulation loop (fixed timestep) ---
  let lastT = performance.now();
  let accumulator = 0;
  let lastDebugMs = 0;
  let simFrameIndex = 0;
  let recordVersusPlayerFrame30Logged = false;
  let lastLedUpdate = 0;
  let lastPortalUpdate = 0;
  const recordLabelCycleColors = [
    new THREE.Color(CART_COLORS.pink.hex),
    new THREE.Color(CART_COLORS.blue.hex),
    new THREE.Color(CART_COLORS.green.hex),
    new THREE.Color(CART_COLORS.yellow.hex),
    new THREE.Color(CART_COLORS.neonOrange.hex),
  ];
  /** @type {ReadonlySet<number>} */
  const NPC_INWARD_DRIFT_LOG_FRAMES = new Set([1, 5, 15, 30]);

  resetSimTimingRef.current = () => {
    lastT = performance.now();
    accumulator = 0;
  };


  function step(now) {
    if (menuVisible) {
      requestAnimationFrame(step);
      return;
    }
    let dt = (now - lastT) / 1000;
    dt = Math.min(dt, 0.05);
    lastT = now;
    accumulator += dt;
    if (GameState.getRoundState().phase === "running" && performance.now() < slowMoUntil) {
      dt *= slowMoRate;
    }
    if (Netcode.getIsHost() && slowMoActive) {
      dt *= SLOW_MO_TIME_SCALE;
      if (performance.now() - slowMoStartMs > SLOW_MO_DURATION_MS) {
        slowMoActive = false;
      }
    }

    if (fxPass && fxPass.uniforms && fxPass.uniforms.uTime) {
      fxPass.uniforms.uTime.value = fxClock.getElapsedTime();
    }

    simFrameIndex += 1;

    if (simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
      const playerT = localCartForConnId().body.translation();
      const ringR = CONFIG.cart.spawnRingRadius;
      const spawnSlotAxisTol = 0.01;
      const cartRows = allCarts.map((cart) => {
        const t = cart.body.translation();
        const s = cart.spawn;
        const expectedSpawn = Entities.spawnOnRingForSlot(cart.slotIndex);
        const distPlayer = Math.hypot(t.x - playerT.x, t.y - playerT.y, t.z - playerT.z);
        const distOrigin = Math.hypot(t.x, t.y, t.z);
        const distOriginXZ = Math.hypot(t.x, t.z);
        const id = `slot-${cart.slotIndex}`;
        return {
          id,
          slotIndex: cart.slotIndex,
          translation: { x: t.x, y: t.y, z: t.z },
          spawnAtCreation: { x: s.x, y: s.y, z: s.z },
          expectedSpawnForSlot: { x: expectedSpawn.x, y: expectedSpawn.y, z: expectedSpawn.z },
          spawnRecordDeltaFromSlot: {
            x: s.x - expectedSpawn.x,
            y: s.y - expectedSpawn.y,
            z: s.z - expectedSpawn.z,
          },
          distanceToPlayer: distPlayer,
          distanceToWorldOrigin: distOrigin,
          distanceToWorldOriginXZ: distOriginXZ,
        };
      });
      const expectedAdjacent = ringR * Math.SQRT2;
      const expectedOpposite = 2 * ringR;
      const planarRingTolerance = 0.1;
      const chordTolerance = 0.5;
      const planarOk = cartRows.every(
        (row) => Math.abs(row.distanceToWorldOriginXZ - ringR) <= planarRingTolerance,
      );
      const spawnRecordsMatchSlotPositions = cartRows.every((row) => {
        const d = row.spawnRecordDeltaFromSlot;
        return (
          Math.abs(d.x) <= spawnSlotAxisTol &&
          Math.abs(d.y) <= spawnSlotAxisTol &&
          Math.abs(d.z) <= spawnSlotAxisTol
        );
      });
      const playerDistChecks = cartRows
        .filter((row) => row.id !== "player")
        .map((row, j) => {
          const slotDelta = j + 1;
          const expectedChord =
            slotDelta === 2 ? expectedOpposite : expectedAdjacent;
          return {
            toId: row.id,
            distanceToPlayer: row.distanceToPlayer,
            expectedChord,
            matchesExpected:
              Math.abs(row.distanceToPlayer - expectedChord) <= chordTolerance,
          };
        });
      // eslint-disable-next-line no-console
      // Diagnostics removed for submission.
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
        const lightPos = new THREE.Vector3(
          Math.cos(angle) * spotlightPositionRadius,
          spotlightHeight,
          Math.sin(angle) * spotlightPositionRadius,
        );
        const beamTarget = new THREE.Vector3(lightPos.x, platformTopY, lightPos.z);
        entry.light.position.copy(lightPos);
        entry.light.target.position.copy(beamTarget);
        entry.light.target.updateMatrixWorld();
        positionSpotlightBeam(entry.beamGroup, lightPos, beamTarget);
        entry.glowMesh.position.set(beamTarget.x, recordSurfaceGlowY, beamTarget.z);
      }
    }

    if (stageLightEntries.length > 0) {
      const nowSec = now * 0.001;
      for (const entry of stageLightEntries) {
        entry.target.position.x = entry.baseX + Math.sin(nowSec * 0.5 + entry.index) * 5;
        entry.target.position.y = 0;
        entry.target.position.z = 0;
        entry.target.updateMatrixWorld();
      }
    }

    if (laserEntries.length > 0) {
      const nowSec = now * 0.001;
      for (const entry of laserEntries) {
        entry.mesh.rotation.z =
          entry.baseZ +
          Math.sin(nowSec * entry.speed + entry.index * entry.phaseStep) *
            entry.amplitude;
      }
    }

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

    if (crowdSearchlightEntries.length > 0) {
      const nowSec = now * 0.001;
      for (const entry of crowdSearchlightEntries) {
        const speed = crowdSearchlightSpeeds[entry.index % crowdSearchlightSpeeds.length] || 0.3;
        const angle = nowSec * speed + entry.index * Math.PI * 0.5;
        entry.target.position.x = Math.cos(angle) * crowdSearchlightTargetRadius;
        entry.target.position.y = -3;
        entry.target.position.z = Math.sin(angle) * crowdSearchlightTargetRadius;
        entry.target.updateMatrixWorld();
        entry.cone.lookAt(entry.target.position);
        entry.cone.rotateX(-Math.PI / 2);
        entry.light.intensity = 20 + Math.sin(nowSec * 1.1 + entry.index) * 15;
      }
    }

    if (crowdPointLightEntries.length > 0) {
      const nowSec = now * 0.001;
      for (const entry of crowdPointLightEntries) {
        entry.light.intensity = 5 + Math.sin(nowSec * 1.5 + entry.index * 0.8) * 5;
      }
    }

    // Crowd glow ring pulse (subtle)
    if (crowdGlowMat) {
      const nowSec = now * 0.001;
      crowdGlowMat.opacity = 0.09 + Math.sin(nowSec * 0.35) * 0.03;
    }

    if (crowdCarts) {
      const nowSec = now * 0.001;
      const batchSize = 200;
      const offset = Math.floor(nowSec * 4) % Math.ceil(5000 / batchSize);
      const start = offset * batchSize;
      const end = Math.min(start + batchSize, 5000);
      const _dm = new THREE.Object3D();
      for (let i = start; i < end; i++) {
        crowdCarts.getMatrixAt(i, _dm.matrix);
        _dm.matrix.decompose(_dm.position, _dm.quaternion, _dm.scale);

        // CROWD VARIATION: seeded per-cart "energy" (0..1) from index
        const energy = ((i * 7919) % 100) / 100;
        const baseFreq = 3;
        const baseAmp = 0.3;

        let bounce = 0;
        let wiggleYaw = 0;
        if (energy > 0.7) {
          bounce = Math.abs(Math.sin(nowSec * baseFreq * 1.5 + i * 0.7)) * (baseAmp * 1.8);
          wiggleYaw = Math.sin(nowSec * 6.0 + i * 0.9) * (0.18 * ((energy - 0.7) / 0.3));
        } else if (energy < 0.3) {
          bounce = Math.sin(nowSec * baseFreq * 0.5 + i * 0.45) * (baseAmp * 0.12);
          wiggleYaw = Math.sin(nowSec * 0.8 + i * 0.6) * 0.04;
        } else {
          bounce = Math.abs(Math.sin(nowSec * baseFreq + i * 0.7)) * baseAmp;
        }

        _dm.position.y = -2.9 + bounce;
        if (wiggleYaw !== 0) {
          crowdWiggleQuat.setFromAxisAngle(crowdWiggleAxisY, wiggleYaw);
          _dm.quaternion.multiply(crowdWiggleQuat);
        }
        _dm.updateMatrix();
        crowdCarts.setMatrixAt(i, _dm.matrix);
      }
      crowdCarts.instanceMatrix.needsUpdate = true;
    }

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
      const c1 = new THREE.Color(CONFIG.booth.neonColor1);
      const c2 = new THREE.Color(CONFIG.booth.neonColor2);
      const mixed = c1.clone().lerp(c2, t);
      for (const m of boothNeonMeshes) {
        m.material.color.copy(mixed);
        m.material.emissive.copy(mixed);
      }
    }

    // LED screen text pulse (throttled)
    if (now - lastLedUpdate > 150) {
      const pulse = 0.6 + Math.sin(now * 0.002) * 0.4;
      const pulse2 = 0.6 + Math.sin(now * 0.002 + 1.5) * 0.4;
      const ledGradAnim = ledCtx.createLinearGradient(0, 0, 512, 256);
      ledGradAnim.addColorStop(0, '#0a0020');
      ledGradAnim.addColorStop(0.5, '#1a0040');
      ledGradAnim.addColorStop(1, '#0a0020');
      ledCtx.fillStyle = ledGradAnim;
      ledCtx.fillRect(0, 0, 512, 256);
      ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
      ledCtx.textAlign = 'center';
      ledCtx.textBaseline = 'middle';
      ledCtx.fillStyle = `rgba(255, 43, 214, ${pulse})`;
      ledCtx.shadowColor = '#ff2bd6';
      ledCtx.shadowBlur = 20 + pulse * 15;
      ledCtx.fillText('CART', 256, 100);
      ledCtx.fillStyle = `rgba(255, 229, 61, ${pulse2})`;
      ledCtx.shadowColor = '#ffe53d';
      ledCtx.shadowBlur = 20 + pulse2 * 15;
      ledCtx.fillText('RAVE', 256, 185);
      ledCtx.shadowBlur = 0;
      for (let y = 0; y < 256; y += 4) {
        ledCtx.fillStyle = 'rgba(0,0,0,0.15)';
        ledCtx.fillRect(0, y, 512, 2);
      }
      ledTex.needsUpdate = true;
      lastLedUpdate = now;
    }

    // Billboard text glow + scanline UV scroll
    {
      if (now - bbLastRedraw > 100) {
        bbLastRedraw = now;
        const t = (Math.sin(now * 0.003) + 1) / 2;
        // Lerp white (255,255,255) → cyan (0,255,255)
        const r = Math.round(255 * (1 - t));
        bbSmallCtx.imageSmoothingEnabled = false;
        bbSmallCtx.fillStyle = '#000000';
        bbSmallCtx.fillRect(0, 0, 256, 64);
        bbSmallCtx.font = '14px monospace';
        bbSmallCtx.textAlign = 'center';
        bbSmallCtx.textBaseline = 'middle';
        bbSmallCtx.shadowColor = '#ff00ff';
        bbSmallCtx.shadowBlur = 4 + Math.sin(now * 0.005) * 3;
        bbSmallCtx.fillStyle = `rgb(${r}, 255, 255)`;
        bbSmallCtx.fillText('CURSOR VIBE JAM 2026', 128, 32);
        bbSmallCtx.shadowBlur = 0;
        bbTex.needsUpdate = true;
      }
      slTex.offset.y = (now * 0.0005) % 1;
    }

    // Portal swirl animation (throttled)
    if (now - lastPortalUpdate > 150) {
      const imgData = portalCtx.createImageData(128, 128);
      const d = imgData.data;
      const swirlT = now * 0.002;
      for (let row = 0; row < 128; row++) {
        for (let col = 0; col < 128; col++) {
          const nx = (col - 64) / 64;
          const ny = (row - 64) / 64;
          const dist = Math.sqrt(nx * nx + ny * ny);
          const idx = (row * 128 + col) * 4;
          if (dist < 1.0) {
            const angle = Math.atan2(ny, nx);
            const spiral = ((angle / (Math.PI * 2) + dist * 3 - swirlT) % 1 + 1) % 1;
            const brightness = 0.5 + 0.5 * Math.sin(spiral * Math.PI * 2);
            const centerGlow = Math.max(0, 1 - dist * 1.8);
            d[idx]     = Math.round(brightness * 80  + centerGlow * 255);
            d[idx + 1] = Math.round(brightness * 255 + centerGlow * 255);
            d[idx + 2] = Math.round(brightness * 100 + centerGlow * 200);
            d[idx + 3] = 255;
          } else {
            d[idx + 3] = 0;
          }
        }
      }
      portalCtx.putImageData(imgData, 0, 0);
      portalTex.needsUpdate = true;
      if (returnPortalCtx && returnPortalTex) {
        const imgData2 = returnPortalCtx.createImageData(128, 128);
        const d2 = imgData2.data;
        for (let row = 0; row < 128; row++) {
          for (let col = 0; col < 128; col++) {
            const nx = (col - 64) / 64;
            const ny = (row - 64) / 64;
            const dist = Math.sqrt(nx * nx + ny * ny);
            const idx = (row * 128 + col) * 4;
            if (dist < 1.0) {
              const angle = Math.atan2(ny, nx);
              const spiral = ((angle / (Math.PI * 2) + dist * 3 - swirlT) % 1 + 1) % 1;
              const brightness = 0.5 + 0.5 * Math.sin(spiral * Math.PI * 2);
              const centerGlow = Math.max(0, 1 - dist * 1.8);
              d2[idx] = Math.round(brightness * 80 + centerGlow * 0);
              d2[idx + 1] = Math.round(brightness * 210 + centerGlow * 255);
              d2[idx + 2] = Math.round(brightness * 255 + centerGlow * 255);
              d2[idx + 3] = 255;
            } else {
              d2[idx + 3] = 0;
            }
          }
        }
        returnPortalCtx.putImageData(imgData2, 0, 0);
        returnPortalTex.needsUpdate = true;
      }
      lastPortalUpdate = now;
    }

    const playerAxis = Input.getAxis();
    // Diagnostics removed for submission.

    const localCart = localCartForConnId();
    if (!localCart || !localCart.body) return;
    const playerPos = localCart.body.translation();

    // Portal proximity trigger (single-fire)
    if (!portalTriggered) {
      const dx = playerPos.x - portalWorldPos.x;
      const dy = playerPos.y - portalWorldPos.y;
      const dz = playerPos.z - portalWorldPos.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 3) {
        portalTriggered = true;
        window.location.href = buildExitPortalUrl();
      }
    }

    if (!returnPortalTriggered && incomingPortalParams?.ref && hasReturnPortals && Date.now() > returnPortalArmedAtMs) {
      for (const pos of returnPortalWorldPositions) {
        const dx = playerPos.x - pos.x;
        const dy = playerPos.y - pos.y;
        const dz = playerPos.z - pos.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 3) {
          returnPortalTriggered = true;

          const rawRef = String(incomingPortalParams.ref || "").trim();
          const returnUrl = new URL(rawRef.startsWith("http") ? rawRef : `https://${rawRef}`);
          returnUrl.searchParams.set("portal", "true");
          returnUrl.searchParams.set("ref", window.location.origin + window.location.pathname);
          if (incomingPortalParams.username) returnUrl.searchParams.set("username", incomingPortalParams.username);
          if (incomingPortalParams.color) returnUrl.searchParams.set("color", incomingPortalParams.color);
          if (incomingPortalParams.speed) returnUrl.searchParams.set("speed", incomingPortalParams.speed);
          if (incomingPortalParams.avatar_url) returnUrl.searchParams.set("avatar_url", incomingPortalParams.avatar_url);
          if (incomingPortalParams.team) returnUrl.searchParams.set("team", incomingPortalParams.team);
          if (incomingPortalParams.hp) returnUrl.searchParams.set("hp", incomingPortalParams.hp);
          window.location.href = returnUrl.toString();
          break;
        }
      }
    }

    if (Netcode.getIsHost() && GameState.getRoundState().phase === "running") {
      // Fall detection / respawn (host-authoritative).
      for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
        const slot = Netcode.getNetSlots()[slotIndex];
        const c = allCarts[slotIndex];
        if (!slot) continue;
        const p = c.body.translation();
        if (p.y < CONFIG.fall.yThreshold) {
          // Stage A scoring: credit last hit if recent.
          // Only score once per fall event.
          if (c.respawnAtMs === null) {
            const hit = GameState.getLastHitBy().get(slotIndex) || null;
            let fallEventAttackerSlot = null;
            let fallEventVerb = "FELL OFF";
            // 2500ms window: covers slow slide-offs and falls; long enough
            // to avoid "ghost kills" where rammer gets no credit despite
            // clearly causing the fall.
            if (hit && Date.now() - hit.timestamp <= 2500) {
              const distOriginXZ = Math.hypot(p.x, p.z);
              const isCenterHole = distOriginXZ < CONFIG.record.innerRadius + 2;
              let points = isCenterHole ? 2 : 1;

              if (hit.wasCritical) points += 1; // critical bonus

              // Leader lookup (before applying this score).
              let leaderSlotIndex = 0;
              let leaderScore = -Infinity;
              for (let i = 0; i < 4; i += 1) {
                const s = Number(GameState.getRoundScores()[i] || 0);
                if (s > leaderScore) {
                  leaderScore = s;
                  leaderSlotIndex = i;
                }
              }
              if (slotIndex === leaderSlotIndex) points += 1; // target bonus

              GameState.addScore(hit.attackerSlotIndex, points);

              {
                const attackerSlot = Netcode.getNetSlots()[hit.attackerSlotIndex];
                const victimSlot = Netcode.getNetSlots()[slotIndex];
                const actorName = attackerSlot?.name || `P${hit.attackerSlotIndex + 1}`;
                const targetName = victimSlot?.name || `P${slotIndex + 1}`;
                const actorColor = hud?.colorHexToCss ? hud.colorHexToCss(colorHexForSlot(attackerSlot)) : null;
                const targetColor = hud?.colorHexToCss ? hud.colorHexToCss(colorHexForSlot(victimSlot)) : null;
                const verb = hud?.pickKillFeedVerb ? hud.pickKillFeedVerb(hit) : "RAMMED";
                hud?.addKillFeedEntry?.(actorName, actorColor, verb, targetName, targetColor);
                fallEventAttackerSlot = hit.attackerSlotIndex;
                fallEventVerb = verb;
              }
              if (GameState.getRoundState().phase === "running") {
                const localIdx = Netcode.localSlotIndexForConn(Netcode.getYouConnId());
                if (hit.attackerSlotIndex === localIdx) {
                  fovPunchUntil = performance.now() + 200;
                }
              }

              Netcode.sendHostRound(); // broadcast score update to non-host clients
            } else {
              const victimSlot = Netcode.getNetSlots()[slotIndex];
              const targetName = victimSlot?.name || `P${slotIndex + 1}`;
              const targetColor = hud?.colorHexToCss ? hud.colorHexToCss(colorHexForSlot(victimSlot)) : null;
              hud?.addKillFeedEntry?.(null, null, "FELL OFF", targetName, targetColor);
            }
            if (Netcode.getPartySocket()) {
              Netcode.getPartySocket().send(JSON.stringify({
                type: MSG.hostEventFall,
                slotId: slotIndex,
                victimSlotIndex: slotIndex,
                attackerSlot: fallEventAttackerSlot,
                attackerSlotIndex: fallEventAttackerSlot,
                verb: fallEventVerb,
              }));
            }
            GameState.getLastHitBy().delete(slotIndex);
          }

          scheduleRespawn(c, now);
          let aliveHumanCount = 0;
          let lastStandingSlotIndex = -1;
          for (let j = 0; j < 4; j += 1) {
            const sj = Netcode.getNetSlots()[j];
            const cj = allCarts[j];
            if (!sj || sj.kind !== "human" || sj.connId == null || !cj) continue;
            if (cj.respawnAtMs === null) {
              aliveHumanCount += 1;
              lastStandingSlotIndex = j;
            }
          }
          if (
            aliveHumanCount === 1 &&
            roundStartingHumanCount >= 2 &&
            lastCartStandingTimeoutId == null &&
            GameState.getRoundState().startedAtMs > 0 &&
            Date.now() - GameState.getRoundState().startedAtMs >= 30000 &&
            (GameState.getRoundScores()[lastStandingSlotIndex] || 0) >= 1
          ) {
            lastCartStandingWinnerSlotIndex = lastStandingSlotIndex;
            slowMoUntil = performance.now() + 3000;
            slowMoRate = 0.35;
            lastCartStandingTimeoutId = setTimeout(() => {
              lastCartStandingTimeoutId = null;
              if (Netcode.getIsHost() && GameState.getRoundState().phase === "running") endRound();
            }, 3000);
          }
          // If the override is already armed and the survivor has now also fallen,
          // end immediately using the already-chosen last-standing winner.
          if (
            lastCartStandingTimeoutId != null &&
            aliveHumanCount === 0
          ) {
            clearTimeout(lastCartStandingTimeoutId);
            lastCartStandingTimeoutId = null;
            if (lastCartStandingWinnerSlotIndex === null) lastCartStandingWinnerSlotIndex = "draw";
            if (Netcode.getIsHost() && GameState.getRoundState().phase === "running") endRound();
          }
        }
        if (c.respawnAtMs !== null && now >= c.respawnAtMs) {
          Entities.doRespawn(c);
        }
        if (slot.kind === "npc") maybeTriggerNpcOpportunisticRamBoost(now, c);
      }
      tickRamBoostStreakSpawners(now, dt);
    }

    // Round phase transitions (host only)
    if (Netcode.getIsHost()) {
      // running → end when timer expires
      if (
        GameState.getRoundState().phase === "running" &&
        GameState.getRoundState().startedAtMs > 0 &&
        Date.now() - GameState.getRoundState().startedAtMs >= 95000 &&
        lastCartStandingTimeoutId === null
      ) {
        endRound();
      }
    }

    // Third-person follow camera (behind the cart), smoothed.
    const playerRot = localCart.body.rotation();
    const playerQuat = new THREE.Quaternion(
      playerRot.x,
      playerRot.y,
      playerRot.z,
      playerRot.w,
    );
    const playerPosition = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    const forwardWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat);

    const desiredPos = playerPosition
      .clone()
      .addScaledVector(forwardWorld, -CONFIG.camera.followBack)
      .add(new THREE.Vector3(0, CONFIG.camera.followUp, 0));

    const desiredLook = playerPosition
      .clone()
      .addScaledVector(forwardWorld, CONFIG.camera.lookAhead)
      .add(new THREE.Vector3(0, CONFIG.camera.lookUp, 0));

    // Desired camera rotation from look direction.
    const lookMat = new THREE.Matrix4().lookAt(
      desiredPos,
      desiredLook,
      new THREE.Vector3(0, 1, 0),
    );
    const desiredQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);

    if (cameraState.pos.distanceTo(desiredPos) > CONFIG.camera.snapDistance) {
      cameraState.pos.copy(desiredPos);
      cameraState.quat.copy(desiredQuat);
    } else {
      const posAlpha = dampFactor(CONFIG.camera.positionDamping, dt);
      const rotAlpha = dampFactor(CONFIG.camera.rotationDamping, dt);
      cameraState.pos.lerp(desiredPos, posAlpha);
      cameraState.quat.slerp(desiredQuat, rotAlpha);
    }

    camera.position.copy(cameraState.pos);
    camera.quaternion.copy(cameraState.quat);

    // Diagnostics removed for submission.

    // Fixed substeps for stability/consistency (host only).
    let substeps = 0;
    let alpha = null;
    if (Netcode.getIsHost()) {
      if (GameState.getRoundState().phase === "running") {
        for (const c of allCarts) {
          if (c && c.body) {
            c.prevPosition = c.body.translation();
            c.prevRotation = c.body.rotation();
          }
        }

        while (accumulator >= CONFIG.fixedTimeStep && substeps < CONFIG.maxSubsteps) {
          Simulation.runFixedPhysicsStep({
            world,
            eventQueue,
            allCarts: allCartsRef,
            localCart: localCartForConnId(),
            remoteInputs: Netcode.getRemoteInputsByConnId(),
            npcs: allCartsRef.filter((c, idx) => Netcode.getNetSlots()[idx] && Netcode.getNetSlots()[idx].kind === "npc"),
            dt: CONFIG.fixedTimeStep,
            now: performance.now(),
            isHost: Netcode.getIsHost(),
            callbacks: {
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
            }
          });
          accumulator -= CONFIG.fixedTimeStep;
          substeps += 1;
        }
        alpha = accumulator / CONFIG.fixedTimeStep;
      } else {
        accumulator = 0;
      }
    } else {
      // Non-host: do not step physics. Render from buffer ~100ms behind with interpolation.
      if (Date.now() < hostMigrationFreezeUntilMs) {
        // * Hold remote carts at last rendered position until fresh host state arrives.
      } else {
      const targetServerNowMs = Date.now() - serverClockOffsetMs - CONFIG.net.interpBufferMs;
      const localSlotIndex = Netcode.getNetSlots().findIndex((s) => s && s.connId === Netcode.getYouConnId());

      for (let i = netStateBuffer.length - 1; i >= 0; i -= 1) {
        const e = netStateBuffer[i];
        if (!e || e.epoch !== hostEpoch) netStateBuffer.splice(i, 1);
      }

      // Find surrounding snapshots.
      let afterIndex = -1;
      for (let i = 0; i < netStateBuffer.length; i += 1) {
        const e = netStateBuffer[i];
        if (e.serverNowMs > targetServerNowMs) {
          afterIndex = i;
          break;
        }
      }
      const beforeIndex = afterIndex > 0 ? afterIndex - 1 : (afterIndex === 0 ? -1 : netStateBuffer.length - 1);
      const before = beforeIndex >= 0 ? netStateBuffer[beforeIndex] : null;
      const after = afterIndex >= 0 ? netStateBuffer[afterIndex] : null;

      if (before && after && before.carts && after.carts) {
        const denom = (after.serverNowMs - before.serverNowMs) || 1;
        const alpha = clamp((targetServerNowMs - before.serverNowMs) / denom, 0, 1);

        const outQ = [0, 0, 0, 1];
        for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
          const cart = allCarts[slotIndex];
          if (!cart) continue;

          const b = before.carts[String(slotIndex)];
          const a = after.carts[String(slotIndex)];
          if (!b || !a) continue;

          // Never interpolate local player's cart; snap to the buffered value.
          if (slotIndex === localSlotIndex) {
            const bp = b.p;
            const bq = b.q;
            const blv = b.lv;
            const bav = b.av;
            if (Array.isArray(bp) && bp.length === 3) {
              cart.body.setTranslation({ x: bp[0], y: bp[1], z: bp[2] }, true);
            }
            if (Array.isArray(bq) && bq.length === 4) {
              cart.body.setRotation({ x: bq[0], y: bq[1], z: bq[2], w: bq[3] }, true);
            }
            if (Array.isArray(blv) && blv.length === 3) {
              cart.body.setLinvel({ x: blv[0], y: blv[1], z: blv[2] }, true);
            }
            if (Array.isArray(bav) && bav.length === 3) {
              cart.body.setAngvel({ x: bav[0], y: bav[1], z: bav[2] }, true);
            }
            // eslint-disable-next-line no-continue
            continue;
          }

          const bp = b.p;
          const ap = a.p;
          if (Array.isArray(bp) && bp.length === 3 && Array.isArray(ap) && ap.length === 3) {
            const x = bp[0] + (ap[0] - bp[0]) * alpha;
            const y = bp[1] + (ap[1] - bp[1]) * alpha;
            const z = bp[2] + (ap[2] - bp[2]) * alpha;
            cart._netTargetPos.set(x, y, z);
          }

          const bq = b.q;
          const aq = a.q;
          if (Array.isArray(bq) && bq.length === 4 && Array.isArray(aq) && aq.length === 4) {
            THREE.Quaternion.slerpFlat(outQ, 0, bq, 0, aq, 0, alpha);
            cart._netTargetQuat.set(outQ[0], outQ[1], outQ[2], outQ[3]);
          }

          // Use "after" velocities so direction stays correct between frames.
          const alv = a.lv;
          const aav = a.av;
          if (Array.isArray(alv) && alv.length === 3) {
            cart._lastNetLinvel.x = alv[0];
            cart._lastNetLinvel.y = alv[1];
            cart._lastNetLinvel.z = alv[2];
          }
          if (Array.isArray(aav) && aav.length === 3) {
            cart.body.setAngvel({ x: aav[0], y: aav[1], z: aav[2] }, true);
          }
        }
      } else if (before && before.carts) {
        const extrapMs = targetServerNowMs - before.serverNowMs;
        const extrapS = Math.min(extrapMs, 50) / 1000;

        for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
          const cart = allCarts[slotIndex];
          if (!cart) continue;

          const b = before.carts[String(slotIndex)];
          if (!b) continue;

          const bp = b.p;
          const bq = b.q;
          const blv = b.lv;
          const bav = b.av;

          // Never extrapolate local player's cart; snap to the buffered value.
          if (slotIndex === localSlotIndex) {
            if (Array.isArray(bp) && bp.length === 3) {
              cart.body.setTranslation({ x: bp[0], y: bp[1], z: bp[2] }, true);
            }
          } else if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
            cart._netTargetPos.set(
              bp[0] + blv[0] * extrapS,
              bp[1] + blv[1] * extrapS,
              bp[2] + blv[2] * extrapS,
            );
          } else if (Array.isArray(bp) && bp.length === 3) {
            cart._netTargetPos.set(bp[0], bp[1], bp[2]);
          }

          // Do not extrapolate rotation; snap it.
          if (Array.isArray(bq) && bq.length === 4) {
            if (slotIndex === localSlotIndex) {
              cart.body.setRotation({ x: bq[0], y: bq[1], z: bq[2], w: bq[3] }, true);
            } else {
              cart._netTargetQuat.set(bq[0], bq[1], bq[2], bq[3]);
            }
          }
          if (Array.isArray(blv) && blv.length === 3) {
            cart._lastNetLinvel.x = blv[0];
            cart._lastNetLinvel.y = blv[1];
            cart._lastNetLinvel.z = blv[2];
            if (slotIndex === localSlotIndex) cart.body.setLinvel({ x: blv[0], y: blv[1], z: blv[2] }, true);
          }
          if (Array.isArray(bav) && bav.length === 3) {
            cart.body.setAngvel({ x: bav[0], y: bav[1], z: bav[2] }, true);
          }
        }
      } else if (after && after.carts) {
        // Snap remote carts to "after" snapshot; keep local cart bound to Rapier.
        const carts = after.carts;
        const localSnap = carts[String(localSlotIndex)];
        if (localSlotIndex >= 0 && localSnap) {
          applyCartsSnapshotToBodies({ [String(localSlotIndex)]: localSnap });
        }
        for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
          if (slotIndex === localSlotIndex) continue;
          const cart = allCarts[slotIndex];
          const snap = carts[String(slotIndex)];
          if (!cart || !snap) continue;
          const p = snap.p;
          const q = snap.q;
          const lv = snap.lv;
          if (Array.isArray(p) && p.length === 3) cart._netTargetPos.set(p[0], p[1], p[2]);
          if (Array.isArray(q) && q.length === 4) cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
          if (Array.isArray(lv) && lv.length === 3) {
            cart._lastNetLinvel.x = lv[0];
            cart._lastNetLinvel.y = lv[1];
            cart._lastNetLinvel.z = lv[2];
          }
        }
      } else if (lastCartsCache) {
        const carts = lastCartsCache;
        const localSnap = carts[String(localSlotIndex)];
        if (localSlotIndex >= 0 && localSnap) {
          applyCartsSnapshotToBodies({ [String(localSlotIndex)]: localSnap });
        }
        for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
          if (slotIndex === localSlotIndex) continue;
          const cart = allCarts[slotIndex];
          const snap = carts[String(slotIndex)];
          if (!cart || !snap) continue;
          const p = snap.p;
          const q = snap.q;
          const lv = snap.lv;
          if (Array.isArray(p) && p.length === 3) cart._netTargetPos.set(p[0], p[1], p[2]);
          if (Array.isArray(q) && q.length === 4) cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
          if (Array.isArray(lv) && lv.length === 3) {
            cart._lastNetLinvel.x = lv[0];
            cart._lastNetLinvel.y = lv[1];
            cart._lastNetLinvel.z = lv[2];
          }
        }
      }

      const pruneIdx = before ? netStateBuffer.indexOf(before) : -1;
      if (pruneIdx > 0) netStateBuffer.splice(0, pruneIdx);
      }
    }
    updateRamBoostStreaks(now);

    // Sync render meshes from physics (or from net targets for remote non-host carts).
    const localSlotIndexForFrame = Netcode.getNetSlots().findIndex((s) => s && s.connId === Netcode.getYouConnId());
    for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
      const c = allCarts[slotIndex];
      if (!c || !c.mesh) continue;

      if (!Netcode.getIsHost() && slotIndex !== localSlotIndexForFrame) {
        if (c._netTargetPos) {
          netTargetPosScratch.copy(c._netTargetPos);
          netTargetPosScratch.y += CONFIG.cart.visualOffset;
          c.mesh.position.lerp(netTargetPosScratch, 0.75);
        }
        if (c._netTargetQuat) c.mesh.quaternion.slerp(c._netTargetQuat, 0.75);
        c.mesh.updateMatrixWorld(true);
        const lv = c._lastNetLinvel || { x: 0, y: 0, z: 0 };
        cartLinvelScratch.set(lv.x || 0, lv.y || 0, lv.z || 0);
        updateCartVisuals(c.mesh, cartLinvelScratch, dt, now);
        // eslint-disable-next-line no-continue
        continue;
      }

      const p = c.body.translation();
      const r = c.body.rotation();
      c.mesh.position.set(p.x, p.y + CONFIG.cart.visualOffset, p.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      c.mesh.updateMatrixWorld(true);
      const lv = c.body.linvel();
      cartLinvelScratch.set(lv.x, lv.y, lv.z);
      updateCartVisuals(c.mesh, cartLinvelScratch, dt, now);
    }

    // Subtle wheel screech: short noise bursts on sharp steering, local cart only.
    // * Uses steering input magnitude (not physics yaw rate) so it remains consistent across hosts/clients.
    if (!isMuted && sfxVolume > 0 && sfx && typeof sfx.playWheelScreech === "function") {
      if (!menuVisible && GameState.getRoundState().phase === "running") {
        const localSlotIndexForFrame = Netcode.getNetSlots().findIndex((s) => s && s.connId === Netcode.getYouConnId());
        const c = localSlotIndexForFrame >= 0 ? allCarts[localSlotIndexForFrame] : null;
        if (c && c.body) {
          const lv = c.body.linvel();
          const speed = Math.hypot(lv.x, lv.z);
          if (speed >= 4.0) {
            const axis = Input.getAxis();
            const steerMag = Math.abs(axis.turn || 0);
            const steerThreshold = 0.55;
            if (steerMag >= steerThreshold) {
              if (now - (c.lastWheelScreechAtMs || 0) >= 120) {
                c.lastWheelScreechAtMs = now;
                const steerFactor = clamp((steerMag - steerThreshold) / (1 - steerThreshold), 0, 1);
                const speedFactor = clamp((speed - 4.0) / 10.0, 0, 1);
                sfx.playWheelScreech(steerFactor * speedFactor);
              }
            }
          }
        }
      }
    }

    // Leader glow: pulsing inverted-color emissive on the current score leader.
    {
      let leaderSlot = -1;
      let leaderScore = 0;
      let isTied = false;
      if (GameState.getRoundState().phase === "running") {
        const scores = GameState.getRoundScores();
        for (let i = 0; i < 4; i += 1) {
          const s = Number(scores[i] || 0);
          if (s > leaderScore) { leaderScore = s; leaderSlot = i; isTied = false; }
          else if (s === leaderScore && s > 0) { isTied = true; }
        }
        if (isTied) leaderSlot = -1;
      }

      // Leader hum: subtle spatial drone on the current leader.
      if (!menuVisible && GameState.getRoundState().phase === "running" && leaderSlot >= 0 && allCarts[leaderSlot]) {
        leaderHum?.setLeader?.(leaderSlot);
        leaderHum?.updatePositionFromCart?.(allCarts[leaderSlot]);
      } else {
        leaderHum?.setLeader?.(null);
      }

      // * 1 Hz = one full cycle per second.
      const glowPulse = (Math.sin(now * 0.001 * Math.PI * 2 * 1.0) + 1) / 2;
      // * emissiveIntensity pulses 0.5 → 2.0 for strong bloom at peak.
      const glowIntensity = 0.5 + glowPulse * 1.5;
      for (let i = 0; i < allCarts.length; i += 1) {
        const cart = allCarts[i];
        if (!cart || !cart.mesh) continue;
        const isLeader = i === leaderSlot;
        cart.mesh.traverse((child) => {
          if (!child.isMesh || !child.material || !child.material.emissive) return;
          if (child.userData.isFace || child.userData.isWheel || child.userData.isHandle) return;
          if (isLeader) {
            // * White emissive — intensity carries the pulse.
            child.material.emissive.setRGB(1, 1, 1);
            child.material.emissiveIntensity = glowIntensity;
          } else if (GameState.getRoundState().phase === "running" && cart.ramBoostActiveUntilMs > performance.now()) {
            child.material.emissive.setHex(colorHexForSlot(Netcode.getNetSlots()[i]));
            child.material.emissiveIntensity = 1.2 + 0.4 * Math.sin(performance.now() * 0.02);
          } else {
            // * Restore standard emissive (cart's own color at normal intensity).
            const baseHex = colorHexForSlot(Netcode.getNetSlots()[i]);
            child.material.emissive.setHex(baseHex);
            child.material.emissiveIntensity = 0.6;
          }
        });
      }
    }

    HUD.update({
      youConnId: Netcode.getYouConnId(),
      netSlots: Netcode.getNetSlots(),
      roundState: GameState.getRoundState(),
      matchHistoryLength: matchHistory ? matchHistory.length : 0,
      isLastCartStandingActive: lastCartStandingTimeoutId !== null,
      menuVisible
    });
    updateResultsOverlay();
    positionNameLabels();

    updateAmbientParticles(dt, now);

    composer.render();

    labelRenderer.render(scene, camera);

    fpsFrames++;
    const fpsNow = performance.now();
    if (fpsNow - fpsLast >= 500) {
      const fpsVal = Math.round((fpsFrames * 1000) / (fpsNow - fpsLast));
      if (!fpsCanvas2d) {
        fpsCanvas2d = document.createElement("canvas");
        fpsCanvas2d.width = 90;
        fpsCanvas2d.height = 24;
        fpsCanvas2d.style.cssText = "position:fixed;bottom:8px;left:10px;z-index:99999;pointer-events:none;";
        document.body.appendChild(fpsCanvas2d);
        fpsCtx2d = fpsCanvas2d.getContext("2d");
      }
      fpsCtx2d.clearRect(0, 0, 90, 24);
      if (!menuVisible) {
        fpsCtx2d.font = "11px 'Space Mono', monospace";
        fpsCtx2d.fillStyle = "rgba(255,255,255,0.35)";
        fpsCtx2d.textAlign = "right";
        fpsCtx2d.fillText(fpsVal + " FPS", 86, 16);
      }
      fpsFrames = 0;
      fpsLast = fpsNow;
    }

    if (GameState.getRoundState().phase === "running" && performance.now() < shakeUntil) {
      const t = (shakeUntil - performance.now()) / 250;
      const ox = (Math.random() - 0.5) * 2 * shakeIntensity * t;
      const oy = (Math.random() - 0.5) * 2 * shakeIntensity * t;
      canvas.style.transform = `translate(${ox}px, ${oy}px)`;
    } else {
      canvas.style.transform = "";
    }

    if (GameState.getRoundState().phase === "running" && performance.now() < fovPunchUntil) {
      const t = (fovPunchUntil - performance.now()) / 200;
      camera.fov = BASE_FOV - 8 * t; // narrow punch
      camera.updateProjectionMatrix();
    } else if (camera.fov !== BASE_FOV) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }

    if (GameState.getRoundState().phase === "running") {
      for (let i = 0; i < trashPool.length; i++) {
        const p = trashPool[i];
        if (!p.visible) continue;
        p.userData.life += dt;
        if (p.userData.life >= p.userData.maxLife) {
          p.visible = false;
          continue;
        }
        const t = p.userData.life / p.userData.maxLife;
        p.position.x += p.userData.vel.x * dt;
        p.position.y += p.userData.vel.y * dt;
        p.position.z += p.userData.vel.z * dt;
        p.userData.vel.y -= 9.8 * dt; // gravity
        p.scale.setScalar((1 - t) * (0.5 + 0.5));
        p.material.opacity = 1 - t;
      }
    }
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", updateViewport);

  requestAnimationFrame(step);
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
    if (crMusicVolFill) crMusicVolFill.style.width = `${(isMuted ? 0 : (masterGain / AUDIO_VOLUME_MAX)) * 100}%`;
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
      if (menuRoot) menuRoot.style.display = "";
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
