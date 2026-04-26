import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { EffectComposer } from "https://esm.sh/three@0.164.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.164.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://esm.sh/three@0.164.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://esm.sh/three@0.164.1/examples/jsm/postprocessing/ShaderPass.js";
import { mergeGeometries } from "https://esm.sh/three@0.164.1/examples/jsm/utils/BufferGeometryUtils.js";
import { CSS2DObject, CSS2DRenderer } from "https://esm.sh/three@0.164.1/examples/jsm/renderers/CSS2DRenderer.js";
import { Reflector } from "https://esm.sh/three@0.164.1/examples/jsm/objects/Reflector.js";
import { RoomEnvironment } from "https://esm.sh/three@0.164.1/examples/jsm/environments/RoomEnvironment.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import PartySocket from "partysocket";
import { buildCart, resetCartVisualState, updateCartVisuals } from "./cart.js";

// * PartyKit public host after `npx partykit deploy` (partykit.dev). Local dev uses 127.0.0.1:1999.
const PARTYKIT_PUBLIC_HOST = "cart-rave.wyabro.partykit.dev";

// --- PartyKit protocol constants (must match server exactly) ---
const MSG = {
  // Client -> server
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
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
    interpBufferMs: 100,
    // * Host sends authoritative transforms at 20Hz.
    hostSendHz: 20,
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
    friction: 2.2,
    restitution: 0.0,
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
      labelDisc: {
        enabled: true,
        innerRadius: 3.7,
        outerRadius: 7.15,
        color: 0x2bd6ff,
        yOffset: 0.28,
      },
      spindleRing: {
        enabled: true,
        innerRadius: 3.3,
        outerRadius: 3.7,
        color: 0xffffff,
        yOffset: 0.3,
      },
      labelText: {
        enabled: true,
        text: "CART RAVE",
        arcRadius: 5.9,
        arcAngleDeg: 120,
        arcCenterDeg: 90,
        fontSize: 256,
        color: "#000000",
        yOffset: 0.32,
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
    friction: 1.6,
    restitution: 0.4,
    linearDamping: 2.5,
    angularDamping: 6.0,

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
        alignmentAngleDeg: 12,
        minTargetDistance: 4.0,
        maxTargetDistance: 18.0,
      },
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
    hornVolume: 0.5625,
    // * Min time between local horn key triggers (msec); prevents spam when key repeat fires.
    hornKeyMinIntervalMs: 220,
    hornRefDistance: 5,
    hornRolloffFactor: 1.5,
    musicVolume: 0.15,
    // * Sparse IR convolver on buffered horn: dry spike + soft reflections.
    hornEchoIrDurationSec: 0.16,
    hornEchoTaps: [
      { delaySec: 0.032, gain: 0.1 },
      { delaySec: 0.058, gain: 0.055 },
      { delaySec: 0.09, gain: 0.03 },
    ],
    // * Procedural horn: parallel delay tap (matches convolver feel).
    hornEchoProceduralDelaySec: 0.04,
    hornEchoProceduralDry: 0.88,
    hornEchoProceduralWet: 0.14,
    // * Chance the NPC honks when a ram into the player is registered.
    aiRamHornChance: 0.38,
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

function isPortalWebringBypassFromUrl() {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search || "").get("portal");
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
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
  if (isPortalWebringBypassFromUrl()) {
    applyPortalWebringBypassToUrl();
    window.__cartRaveSkipMenuForPortalBypass = true;
    initNetcode();
    return;
  }
  if (captureInviteRoomForDeferredMenu()) {
    return;
  }
  initNetcode();
}

// --- Module-scope netcode state (per handover spec) ---
/** @type {PartySocket | null} */
let partySocket = null;

/** @type {string | null} */
let youConnId = null;
/** @type {string | null} */
let hostId = null;
let isHost = false;

// TEMP DEBUG — message counters
const __msgCounts = { in: {}, out: {} };

// * Input bridge for non-host client_input nitro (Shift key).
let localNitroHeld = false;

function cssHexFromRgbNumber(rgb) {
  if (!Number.isFinite(rgb)) return "#888888";
  const hex = (rgb >>> 0).toString(16).padStart(6, "0");
  return `#${hex}`;
}

function getSlotColor(slotIndex) {
  const key = PALETTE[slotIndex] ?? null;
  if (!key) return "#888888";
  return cssHexFromRgbNumber(CART_COLORS[key]?.hex ?? 0x888888);
}

function getColorForSlot(slot) {
  if (!slot || !slot.color) return "#888888";
  return cssHexFromRgbNumber(CART_COLORS[slot.color]?.hex ?? 0x888888);
}

// --- Personal Stats (localStorage) ---
function getPersonalStats() {
  try {
    const raw = localStorage.getItem("cartRaveStats");
    if (!raw) return { wins: 0, matches: 0, totalPoints: 0 };
    const parsed = JSON.parse(raw);
    return {
      wins: Number(parsed.wins) || 0,
      matches: Number(parsed.matches) || 0,
      totalPoints: Number(parsed.totalPoints) || 0,
    };
  } catch {
    return { wins: 0, matches: 0, totalPoints: 0 };
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
  const room = resolvedPartyRoomFromUrl();
  if (room.startsWith("solo")) return "solo";
  if (room === "quickplay") return "quickplay";
  return "friends";
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

/** @type {{ slotId: number; kind: "human"|"npc"; connId: string|null; name: string; color: string }[]} */
let netSlots = [
  { slotId: 0, kind: "npc", connId: null, name: initialNpcNames[0], color: "pink" },
  { slotId: 1, kind: "npc", connId: null, name: initialNpcNames[1], color: "blue" },
  { slotId: 2, kind: "npc", connId: null, name: initialNpcNames[2], color: "green" },
  { slotId: 3, kind: "npc", connId: null, name: initialNpcNames[3], color: "yellow" },
];

let firstHelloReceived = false;
/** @type {((slots: typeof netSlots) => void) | null} */
let resolveFirstHello = null;
/** @type {Promise<typeof netSlots>} */
const firstHelloPromise = new Promise((resolve) => {
  resolveFirstHello = resolve;
});

function markFirstHelloReceived() {
  if (firstHelloReceived) return;
  firstHelloReceived = true;
  resolveFirstHello?.(netSlots);
}

/**
 * Last authoritative carts snapshot (host caches and non-host consumes).
 * @type {Record<string, any> | null}
 */
let lastCartsCache = null;

/**
 * Non-host interpolation buffer entries.
 * @type {{ serverNowMs: number; seq: number; carts: Record<string, any> }[]}
 */
let netStateBuffer = [];

/** @type {Map<string, { throttle: number; steer: number; nitro: boolean }>} */
let remoteInputsByConnId = new Map();
/** @type {Map<string, boolean>} */
let remoteNitroLatchedByConnId = new Map();

// Stage A scoring (host-only logic lives inside isHost blocks).
const lastHitBy = new Map(); // slotIndex -> { attackerSlotIndex, wasCritical, timestamp }

let roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };

let roundPhase = "lobby"; // "lobby" | "countdown" | "running" | "podium"
let roundStartedAtMs = 0;
let roundCountdownStartedAtMs = 0;
/** @type {null|number|"draw"} */
let roundWinnerSlotIndex = null;
let roundAutoStarted = false; // one-shot flag so lobby→countdown only fires once per load
let roundStartingHumanCount = 0;
/** @type {((msg: object) => void) | null} */
let onGameStartHandler = null;
/** @type {(() => void) | null} Set by main() once hideMenu is defined; bridges module-level renderColorPicker to the inner function. */
let hideMenuRef = null;
/** Set to true the moment a color-dot is clicked, preventing slots-message re-renders from re-opening the picker before server confirmation arrives. */
let _localColorPicked = false;
/** @type {boolean} */
let menuVisible = true; // Step 10b: menu visibility flag
/** @type {number} */
let masterGain = 0.25; // Step 10d: Volume control (0.0 to 1.0)
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

// These are assigned once main() constructs the scene / HUD / physics world.
/** @type {ReturnType<typeof initHud> | null} */
let hud = null;
/** @type {any[] | null} */
let allCartsRef = null;
/** @type {(() => { forward: number; turn: number }) | null} */
let getAxisRef = null;
/** @type {(cart: any, nowMs: number) => void | null} */
let triggerRamBoostRef = null;
/** @type {{ current: (() => void) | null }} */
const updateNameLabelsRef = { current: null };
/** @type {{ current: (() => void) | null }} */
const respawnLocalMidRoundJoinRef = { current: null };
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

    // * buildCart returns a THREE.Group, not a Mesh — traverse all child meshes to repaint.
    cart.mesh.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      // * Face meshes (sunglasses + mouth) keep their authored materials.
      if (child.userData && child.userData.isFace) return;
      const mat = child.material;
      if (child.userData.isWheel) {
        // * Chrome casters: keep dark gray, glow subtly with the cart's brand color.
        if (mat.emissive) {
          mat.emissive.setHex(finalHex);
          mat.emissiveIntensity = 0.15;
        }
        mat.metalness = 0.9;
        mat.roughness = 0.2;
        mat.envMapIntensity = 0.25;
      } else {
        mat.color.setHex(finalHex);
        if (mat.emissive) {
          mat.emissive.setHex(finalHex);
          mat.emissiveIntensity = 0.6;
        }
        mat.metalness = 0.7;
        mat.roughness = 0.3;
        mat.envMapIntensity = 0.15;
      }
    });

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
    const hexStr = `#${data.hex.toString(16).padStart(6, "0")}`;

    // Hard reset: preserve structural class, apply exactly one color class
    box.className = `hud-scoreBox ${data.css}`;

    // Force background via !important so no other rule can win
    box.style.setProperty("background-color", hexStr, "important");
    box.style.setProperty("color", "black", "important");

    // * Local player gets a white outline; all others have none
    box.style.setProperty(
      "border",
      slot.connId === youConnId ? "3px solid white" : "none",
      "important",
    );

    box.dataset.hudColor = slot.color;
  });
}

function strictSlotIndexForConn(connId) {
  if (!connId) return -1;
  return netSlots.findIndex((s) => s && s.connId === connId);
}

let _slotLookupMissWarned = false;
function localSlotIndexForConn(connId) {
  const idx = strictSlotIndexForConn(connId);
  if (idx < 0 && !_slotLookupMissWarned) {
    _slotLookupMissWarned = true;
    console.warn("[net] localSlotIndexForConn miss — connId not in netSlots", { connId, netSlots });
  }
  return idx;
}

function localCartForConnId() {
  const carts = allCartsRef || [];
  const idx = localSlotIndexForConn(youConnId);
  if (idx < 0) return null;
  return carts[idx] || null;
}

function stopHostSendLoop() {
  if (hostSendTimer) {
    clearInterval(hostSendTimer);
    hostSendTimer = null;
  }
}

function stopInputSendLoop() {
  if (inputSendTimer) {
    clearInterval(inputSendTimer);
    inputSendTimer = null;
  }
}

function stopKeepaliveLoop() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function applyCartsSnapshotToBodies(carts) {
  if (!allCartsRef) return;
  if (!carts || typeof carts !== "object") return;
  for (let slotIndex = 0; slotIndex < allCartsRef.length; slotIndex += 1) {
    const cart = allCartsRef[slotIndex];
    const snap = carts[String(slotIndex)];
    if (!cart || !snap) continue;
    const p = snap.p;
    const q = snap.q;
    const lv = snap.lv;
    const av = snap.av;
    if (Array.isArray(p) && p.length === 3) {
      cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    }
    if (Array.isArray(q) && q.length === 4) {
      cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
    }
    if (Array.isArray(lv) && lv.length === 3) {
      cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
    }
    if (Array.isArray(av) && av.length === 3) {
      cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
    }
  }
}

function bufferAuthoritativeState(serverNowMs, seq, carts) {
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(seq)) return;
  if (!carts || typeof carts !== "object") return;

  netStateBuffer.push({ serverNowMs, seq, carts });
  netStateBuffer.sort((a, b) => a.seq - b.seq);
  const maxEntries = 64;
  while (netStateBuffer.length > maxEntries) {
    netStateBuffer.shift();
  }
}

function startHostSendLoop() {
  stopHostSendLoop();
  if (!partySocket) return;
  if (!allCartsRef) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.hostSendHz));
  hostSendTimer = setInterval(() => {
    if (!partySocket || !isHost || !allCartsRef) return;
    if (roundPhase !== "running") return;

    hostSeq += 1;
    const carts = {};
    for (let slotIndex = 0; slotIndex < allCartsRef.length; slotIndex += 1) {
      const c = allCartsRef[slotIndex];
      const t = c.body.translation();
      const r = c.body.rotation();
      const lv = c.body.linvel();
      const av = c.body.angvel();
      carts[String(slotIndex)] = {
        p: [t.x, t.y, t.z],
        q: [r.x, r.y, r.z, r.w],
        lv: [lv.x, lv.y, lv.z],
        av: [av.x, av.y, av.z],
      };
    }

    lastCartsCache = carts;
    partySocket.send(
      JSON.stringify({
        type: MSG.hostTransform,
        seq: hostSeq,
        tHost: Date.now(),
        carts,
      }),
    );
    __msgCounts.out[MSG.hostTransform] = (__msgCounts.out[MSG.hostTransform] || 0) + 1;
  }, intervalMs);
}

function startInputSendLoop() {
  stopInputSendLoop();
  if (!partySocket) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.clientInputHz));
  inputSendTimer = setInterval(() => {
    if (!partySocket || isHost) return;
    if (!getAxisRef) return;

    inputSeq += 1;
    const axis = getAxisRef();
    partySocket.send(
      JSON.stringify({
        type: MSG.clientInput,
        seq: inputSeq,
        tClient: Date.now(),
        input: {
          throttle: axis.forward,
          steer: axis.turn,
          nitro: localNitroHeld,
        },
      }),
    );
    __msgCounts.out[MSG.clientInput] = (__msgCounts.out[MSG.clientInput] || 0) + 1;
  }, intervalMs);
}

// * Keepalive heartbeat. Sent regardless of role or round phase so the server
// * reaper never drops a legitimate client who's idle during lobby/countdown/
// * podium (host's host_transform loop is gated on running phase, so without
// * this a host sitting in podium > REAP_TIMEOUT_MS would be reaped).
function startKeepaliveLoop() {
  stopKeepaliveLoop();
  if (!partySocket) return;
  const intervalMs = CONFIG.net.keepaliveIntervalMs ?? 5000;
  keepaliveTimer = setInterval(() => {
    if (!partySocket) return;
    partySocket.send(
      JSON.stringify({ type: MSG.keepalive, tClient: Date.now() }),
    );
  }, intervalMs);
}

function setAuthorityMode(nextIsHost) {
  const becomingHost = Boolean(nextIsHost) && !isHost;
  const becomingClient = !nextIsHost && isHost;
  isHost = Boolean(nextIsHost);

  if (becomingHost) {
    stopInputSendLoop();
    netStateBuffer = [];
    if (lastCartsCache) {
      applyCartsSnapshotToBodies(lastCartsCache);
    }
    startHostSendLoop();
    return;
  }

  if (becomingClient) {
    stopHostSendLoop();
    startInputSendLoop();
    return;
  }

  if (isHost) {
    stopInputSendLoop();
    if (!hostSendTimer) startHostSendLoop();
  } else {
    stopHostSendLoop();
    if (!inputSendTimer) startInputSendLoop();
  }
}

function initNetcode(roomOverride) {
  if (typeof window === "undefined") return;
  _localColorPicked = false;
  if (partySocket) {
    partySocket.close();
    partySocket = null;
  }

  let resolvedRoom = resolvedPartyRoomFromUrl();
  if (roomOverride != null && String(roomOverride).trim() !== "") {
    const r = String(roomOverride).trim();
    if (/^[A-Za-z0-9]{2,16}$/.test(r)) resolvedRoom = r;
  }
  partySocket = new PartySocket({
    host: partyHostFromWindowLocation(),
    party: "main",
    room: resolvedRoom,
  });

  partySocket.addEventListener("open", () => {
    // eslint-disable-next-line no-console
    console.log("[net] socket open, room=" + resolvedRoom + ", sending join");
    let savedUsername = (localStorage.getItem("cartRaveUsername") || localStorage.getItem("cartRaveName") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      localStorage.setItem("cartRaveUsername", savedUsername);
      localStorage.setItem("cartRaveName", savedUsername);
    }
    partySocket?.send(JSON.stringify({ type: MSG.join, name: savedUsername }));
    __msgCounts.out[MSG.join] = (__msgCounts.out[MSG.join] || 0) + 1;
    
    startKeepaliveLoop();
  });

  partySocket.addEventListener("message", (ev) => {
    let msg = null;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    __msgCounts.in[msg.type || "unknown"] = (__msgCounts.in[msg.type || "unknown"] || 0) + 1;

    const type = msg.type;
    // eslint-disable-next-line no-console
    console.log("[net] message received", type);
    if (type === "slots") {
      console.log("[net] HARDCODED slots branch hit, MSG.slots value is:", MSG.slots);
    }
    if (type === MSG.hello) {
      // eslint-disable-next-line no-console
      console.log("[net] hello received (raw slots)", JSON.stringify(msg.slots));
      youConnId = typeof msg.youConnId === "string" ? msg.youConnId : null;
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      if (Array.isArray(msg.slots)) netSlots = msg.slots;
      if (msg.round && typeof msg.round === "object") {
        roundPhase = msg.round.phase ?? roundPhase;
        roundStartedAtMs = msg.round.startedAtMs ?? roundStartedAtMs;
        roundCountdownStartedAtMs = msg.round.countdownStartedAtMs ?? roundCountdownStartedAtMs;
        roundWinnerSlotIndex = msg.round.winnerSlotIndex ?? roundWinnerSlotIndex;
      }
      if (roundPhase === "running" && youConnId) {
        pendingMidRoundJoinRespawnConnId = youConnId;
      }
      markFirstHelloReceived();

      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
        applyCartsSnapshotToBodies(msg.carts);
      }

      setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));
      // eslint-disable-next-line no-console
      console.log("[net] hello processed, youConnId=" + youConnId);

      // * Auto-submit color picked on the menu. Only fires when the player deliberately
      // * joined (menuVisible is false because hideMenu() was called in the mode handler).
      if (!menuVisible) {
        const savedColor = localStorage.getItem('cartRaveColor');
        const colorToSend = (savedColor && PALETTE.includes(savedColor)) ? savedColor : PALETTE[0];
        if (partySocket && partySocket.readyState === WebSocket.OPEN) {
          partySocket.send(JSON.stringify({ type: MSG.colorPick, color: colorToSend }));
          __msgCounts.out[MSG.colorPick] = (__msgCounts.out[MSG.colorPick] || 0) + 1;
          if (roundPhase === "running" && youConnId) {
            pendingMidRoundJoinRespawnConnId = youConnId;
          }
        }
        hideMenuRef?.();
      }

      // Update 3D cart materials with initial colors
      updateCartMaterialsFromSlots(msg.slots);
      
      // Update HUD colors with initial colors
      updateHudColorsFromSlots(msg.slots);
      updateNameLabelsRef.current?.();
      return;
    }

    if (type === MSG.hostMigrated) {
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      const nextIsHost = Boolean(hostId && youConnId && hostId === youConnId);
      if (nextIsHost && lastCartsCache) {
        applyCartsSnapshotToBodies(lastCartsCache);
      }
      setAuthorityMode(nextIsHost);
      return;
    }

    if (type === MSG.slots) {
      console.log("[net] slots msg raw payload", JSON.stringify(msg));
      if (Array.isArray(msg.slots)) {
        netSlots = msg.slots;
        const liveConnIds = new Set(
          netSlots
            .map((s) => (s && typeof s.connId === "string" ? s.connId : null))
            .filter(Boolean),
        );
        for (const id of remoteInputsByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteInputsByConnId.delete(id);
        }
        for (const id of remoteNitroLatchedByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteNitroLatchedByConnId.delete(id);
        }
        console.log("[net] slots updated", JSON.stringify(msg.slots));
        
        // Only count other human players as taking a color; NPCs don't block the picker
        const takenColors = msg.slots
          .filter((s) => s && s.kind === "human" && s.connId !== youConnId)
          .map((s) => s.color);
        const availableColors = PALETTE.filter((c) => !takenColors.includes(c));
        renderColorPicker(availableColors);
        
        // Update 3D cart materials with new colors
        updateCartMaterialsFromSlots(msg.slots);
        
        // Update HUD colors with new colors
        updateHudColorsFromSlots(msg.slots);
        updateNameLabelsRef.current?.();
        respawnLocalMidRoundJoinRef.current?.();
      } else {
        console.warn("[net] slots msg payload has no slots array", { slotsField: msg.slots, msgKeys: Object.keys(msg) });
      }
      return;
    }

    if (type === MSG.state) {
      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
      }
      if (!isHost) {
        const serverNowMs = typeof msg.serverNowMs === "number" ? msg.serverNowMs : Date.now();
        const seq = typeof msg.seq === "number" ? msg.seq : -1;
        bufferAuthoritativeState(serverNowMs, seq, msg.carts);
      }
      return;
    }

    if (type === MSG.clientInput) {
      if (!isHost) return;
      const connId = typeof msg.connId === "string" ? msg.connId : null;
      const input = msg.input;
      if (!connId || !input || typeof input !== "object") return;

      const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
      const steer = Number.isFinite(input.steer) ? input.steer : 0;
      const nitro = Boolean(input.nitro);

      remoteInputsByConnId.set(connId, {
        throttle: clamp(throttle, -1, 1),
        steer: clamp(steer, -1, 1),
        nitro,
      });

      const was = remoteNitroLatchedByConnId.get(connId) || false;
      if (!was && nitro && allCartsRef && triggerRamBoostRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCartsRef[slotIndex];
          if (cart) triggerRamBoostRef(cart, performance.now());
        }
      }
      remoteNitroLatchedByConnId.set(connId, nitro);
      return;
    }

    if (type === MSG.round) {
      const r = msg.round;
      if (r && typeof r === "object") {
        const prevPhase = roundPhase;
        const newPhase = r.phase;
        // * Approach (a): single source of truth via MSG.round transition into podium — host and clients append the same
        // * moment without endRound() duplication or dedupe keys.
        if (typeof newPhase === "string" && prevPhase === "running" && newPhase === "podium") {
          const w = r.winnerSlotIndex;
          const winnerSlotIndex =
            w === "draw" ? "draw" : Number.isFinite(w) ? w : 0;
          const src = r.scores && typeof r.scores === "object" ? r.scores : roundScores;
          /** @type {Record<number, number>} */
          const scores = {};
          for (let i = 0; i < 4; i += 1) {
            scores[i] = Number(src[i] ?? 0);
          }
          matchHistory.push({
            endedAtMs: Date.now(),
            winnerSlotIndex,
            scores,
            mode: detectGameMode(),
          });
          while (matchHistory.length > 10) matchHistory.shift();

          // Update personal stats — only if this round had scoring (not an all-zero draw)
          if (winnerSlotIndex !== "draw") {
            const mySlotIdx = localSlotIndexForConn(youConnId);
            if (mySlotIdx >= 0) {
              const stats = getPersonalStats();
              stats.matches += 1;
              stats.totalPoints += scores[mySlotIdx] || 0;
              if (winnerSlotIndex === mySlotIdx) stats.wins += 1;
              savePersonalStats(stats);
            }
          }
        }
        if (!isHost && typeof newPhase === "string" && newPhase !== prevPhase) {
          // PRE-SUBMISSION CLEANUP
          // eslint-disable-next-line no-console
          console.log("[round] phase=" + newPhase + " (client)");
        }
        roundPhase = r.phase ?? roundPhase;
        roundStartedAtMs = r.startedAtMs ?? roundStartedAtMs;
        roundCountdownStartedAtMs = r.countdownStartedAtMs ?? roundCountdownStartedAtMs;
        roundWinnerSlotIndex = r.winnerSlotIndex ?? null;
        if (r.scores && typeof r.scores === "object") roundScores = r.scores;
      }
      return;
    }

    if (type === MSG.gameStart) {
      if (onGameStartHandler) onGameStartHandler(msg);
      return;
    }
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function yawFromQuaternion(q) {
  // Assumes Y-up.
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy);
}

function getForwardRightFromYaw(yaw) {
  // Coordinate convention for this prototype:
  // - Camera sits behind the cart at +Z.
  // - "Forward" (W) should move away from the camera, toward -Z when yaw = 0.
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  return { forward, right };
}

function vec3ToRapier(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function rapierToVec3(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function getBodyMass(body) {
  if (body && typeof body.mass === "function") return body.mass();
  return 1;
}

function planarSpeed(v) {
  return Math.hypot(v.x, v.z);
}

function vec3PlanarDirection(v) {
  const d = new THREE.Vector3(v.x, 0, v.z);
  const len = d.length();
  if (len <= 1e-6) return null;
  return d.multiplyScalar(1 / len);
}

/**
 * @param {number} mass
 * @param {number} hx
 * @param {number} hy
 * @param {number} hz
 * @param {{ x: number; y: number; z: number }} comOffsetFromColliderCenter
 * @returns {{ ix: number; iy: number; iz: number }}
 */
function principalInertiaForTranslatedBox(mass, hx, hy, hz, comOffsetFromColliderCenter) {
  // * Solid cuboid inertia about its geometric center (principal axes align with the box).
  const ix0 = (mass / 12) * (4 * hy * hy + 4 * hz * hz);
  const iy0 = (mass / 12) * (4 * hx * hx + 4 * hz * hz);
  const iz0 = (mass / 12) * (4 * hx * hx + 4 * hy * hy);

  // * Parallel axis theorem: shift inertia to a new body origin given an explicit center of mass.
  const x = comOffsetFromColliderCenter.x;
  const y = comOffsetFromColliderCenter.y;
  const z = comOffsetFromColliderCenter.z;
  const r2 = x * x + y * y + z * z;
  const ix = ix0 + mass * (r2 - x * x);
  const iy = iy0 + mass * (r2 - y * y);
  const iz = iz0 + mass * (r2 - z * z);

  return { ix, iy, iz };
}

/**
 * @param {any} body
 * @param {any} collider
 * @param {{ label: string; hx: number; hy: number; hz: number; colliderLocalY: number }}
 */
function applyCartMassPropertiesOverride(body, collider, { label, hx, hy, hz, colliderLocalY }) {
  // * Capture Rapier's default mass from the cuboid collider, then move mass to the collider without contributing mass.
  let baseMass =
    collider && typeof collider.mass === "function"
      ? collider.mass()
      : typeof body.mass === "function"
        ? body.mass()
        : 1;
  if (!Number.isFinite(baseMass) || baseMass <= 0) {
    baseMass = 1;
  }

  if (typeof collider.setDensity === "function") {
    collider.setDensity(0);
  }

  // * Baseline localCoM; tuning notes: CONFIG.cart and deferred/cart-feel-tuning.md
  const targetCom = new RAPIER.Vector3(0, -0.55, 0);

  const comOffsetFromColliderCenter = {
    x: 0,
    y: -0.55 - colliderLocalY,
    z: 0,
  };
  const { ix, iy, iz } = principalInertiaForTranslatedBox(
    baseMass,
    hx,
    hy,
    hz,
    comOffsetFromColliderCenter,
  );

  body.setAdditionalMassProperties(
    baseMass,
    targetCom,
    new RAPIER.Vector3(ix, iy, iz),
    RAPIER.RotationOps.identity(),
    true,
  );

  if (typeof body.recomputeMassPropertiesFromColliders === "function") {
    body.recomputeMassPropertiesFromColliders(true);
  }

  const com = body.localCom();
  const inertia = body.principalInertia();
  // eslint-disable-next-line no-console
  console.log(`[cart:${label}] massProperties`, {
    mass: body.mass(),
    localCom: { x: com.x, y: com.y, z: com.z },
    principalInertia: { x: inertia.x, y: inertia.y, z: inertia.z },
  });
}

function wrapAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// * Mono IR: direct impulse plus sparse taps for subtle echo via ConvolverNode.
function buildSparseEchoImpulseResponse(audioContext) {
  const rate = audioContext.sampleRate;
  const dur = CONFIG.audio.hornEchoIrDurationSec;
  const len = Math.max(1, Math.ceil(dur * rate));
  const buffer = audioContext.createBuffer(1, len, rate);
  const ch0 = buffer.getChannelData(0);
  ch0[0] = 1;
  for (const tap of CONFIG.audio.hornEchoTaps) {
    const i = Math.min(len - 1, Math.round(tap.delaySec * rate));
    ch0[i] += tap.gain;
  }
  return buffer;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("[boot] main() start", { href: window.location.href });
  await RAPIER.init();

  let menuMusicEl = null;
  let startMenuMusic = () => {};
  let stopMenuMusic = () => {};
  let musicEl = null;
  let musicStarted = false;
  let musicUnavailable = false;
  let tryStartAmbientMusic = () => {};
  let labelRenderer = null;

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

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0520, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0520, 0.006);

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

  function initHud() {
    const existing = document.getElementById("hud");
    if (existing) existing.remove();
    const existingStyle = document.getElementById("hud-style");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = "hud-style";
    style.textContent = `
      #hud {
        --hud-display: "Bungee", "Archivo Black", cursive, sans-serif;
        --hud-mono: "Space Mono", ui-monospace, monospace;
        --hud-glow: #22e6ff;
        position: fixed;
        inset: 0;
        z-index: 20000;
        pointer-events: none;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        color: #ffffff;
        text-shadow: 0 2px 12px rgba(0,0,0,0.85);
      }

      #hud .hud-status {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        font-family: var(--hud-display);
        font-size: 2.4rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        padding: 10px 14px;
        color: #ff2bd6;
        text-shadow:
          4px 4px 0 #22e6ff,
          0 0 24px #ff2bd6,
          0 0 42px #ff2bd6;
        display: none;
        white-space: nowrap;
      }

      #hud .hud-timer {
        position: absolute;
        top: 18px;
        left: 18px;
        font-family: var(--hud-display);
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        padding: 10px 12px;
        border: 2px solid var(--hud-glow);
        border-radius: 6px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.05) inset,
          0 0 12px var(--hud-glow),
          0 0 28px color-mix(in oklab, var(--hud-glow), transparent 60%);
        color: #ffffff;
        text-shadow: 0 0 8px var(--hud-glow);
        display: none;
        min-width: 72px;
        text-align: right;
      }

      #hud .hud-scores {
        position: absolute;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        display: none;
        gap: 10px;
        align-items: stretch;
        justify-content: center;
      }

      #hud .hud-scoreBox {
        --hud-glow: #22e6ff;
        position: relative;
        min-width: 80px;
        max-width: 160px;
        padding: 10px 14px 9px;
        border-radius: 6px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.05) inset,
          0 0 12px var(--hud-glow),
          0 0 28px color-mix(in oklab, var(--hud-glow), transparent 60%);
        color: #ffffff;
        line-height: 1.05;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--hud-glow);
        overflow: hidden;
        text-shadow: 0 0 8px var(--hud-glow);
      }

      #hud .hud-scoreBox[data-hud-color="pink"] { --hud-glow: #ff00ff; }
      #hud .hud-scoreBox[data-hud-color="blue"] { --hud-glow: #00ffff; }
      #hud .hud-scoreBox[data-hud-color="green"] { --hud-glow: #00ff00; }
      #hud .hud-scoreBox[data-hud-color="yellow"] { --hud-glow: #ffff00; }
      #hud .hud-scoreBox[data-hud-color="neonOrange"] { --hud-glow: #ff6600; }

      #hud .hud-scoreBox::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--hud-glow), transparent 75%), transparent);
        transform: translateX(-100%);
        animation: hudScoreSweep 3.8s ease-in-out infinite;
        pointer-events: none;
      }

      #hud .hud-scoreBox::after {
        content: "";
        position: absolute;
        inset: -2px;
        border: 2px solid var(--hud-glow);
        border-radius: 6px;
        filter: drop-shadow(0 0 6px var(--hud-glow));
        pointer-events: none;
      }

      @keyframes hudScoreSweep {
        0%, 48% { transform: translateX(-100%); }
        62%, 100% { transform: translateX(100%); }
      }

      #hud .hud-scoreLabel {
        position: relative;
        z-index: 1;
        font-family: var(--hud-display);
        font-size: 0.85rem;
        font-weight: 800;
        opacity: 0.95;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 130px;
        color: var(--hud-glow);
        text-shadow: 0 0 12px var(--hud-glow), 0 0 28px var(--hud-glow);
      }

      #hud .hud-scoreValue {
        position: relative;
        z-index: 1;
        font-family: var(--hud-mono);
        font-size: 1.35rem;
        font-weight: 700;
        margin-top: 4px;
        color: #ffffff;
        text-shadow: 0 0 10px currentColor;
      }

      #hud .hud-scoreBox.isLocal {
        border-color: rgba(255,255,255,1);
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.1) inset,
          0 0 12px #ffffff,
          0 0 24px var(--hud-glow),
          0 0 44px var(--hud-glow);
      }

      #hud .hud-scoreBox.isLocal::after {
        border-color: #ffffff;
        filter:
          drop-shadow(0 0 8px #ffffff)
          drop-shadow(0 0 14px var(--hud-glow));
      }

      #hud .hud-scoreBox.isLocal .hud-scoreLabel,
      #hud .hud-scoreBox.isLocal .hud-scoreValue {
        font-weight: 900;
      }

      #hud .hud-ready-btn {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        font-family: 'Bungee', cursive, system-ui, sans-serif;
        font-size: 1.6rem;
        letter-spacing: 0.1em;
        padding: 14px 40px;
        background: transparent;
        color: #2bd6ff;
        border: 2px solid #2bd6ff;
        border-radius: 0;
        cursor: pointer;
        pointer-events: auto;
        text-transform: uppercase;
        display: none;
        white-space: nowrap;
        transition: color 0.2s ease, border-color 0.2s ease;
        animation: readyPulse 2s ease-in-out infinite;
      }

      #hud .hud-ready-btn.is-ready {
        color: #8dff2b;
        border-color: #8dff2b;
        animation: readyPulse 1.2s ease-in-out infinite;
      }

      @keyframes readyPulse {
        0%, 100% { box-shadow: 0 0 8px currentColor; }
        50%       { box-shadow: 0 0 22px currentColor, 0 0 44px currentColor; }
      }

      #hud .hud-audio {
        position: absolute;
        top: 18px;
        right: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(34, 230, 255, 0.25);
        border-radius: 10px;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 0 12px rgba(34, 230, 255, 0.3), 0 0 28px rgba(34, 230, 255, 0.15);
        pointer-events: auto;
        z-index: 20001;
      }
      #hud .hud-mute-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(0, 0, 0, 0.4);
        color: #22e6ff;
        cursor: pointer;
        font-size: 14px;
        transition: transform 150ms, background 150ms;
      }
      #hud .hud-mute-btn:hover {
        transform: scale(1.08);
        background: rgba(255, 255, 255, 0.08);
      }
      #hud .hud-mute-btn.muted {
        color: #888;
        border-color: rgba(255, 80, 80, 0.3);
      }
      #hud .hud-vol-track {
        width: 80px;
        height: 5px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        cursor: pointer;
        overflow: hidden;
      }
      #hud .hud-vol-fill {
        height: 100%;
        border-radius: 3px;
        background: linear-gradient(90deg, #22e6ff, #ff2bd6);
        box-shadow: 0 0 6px #ff2bd6;
        transition: width 100ms ease;
      }
      #hud .hud-vol-val {
        font-family: 'Space Mono', monospace;
        font-size: 10px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.6);
        min-width: 22px;
        text-align: right;
        letter-spacing: 0.05em;
      }

      #esc-overlay {
        --esc-display: "Bungee", "Archivo Black", sans-serif;
        --esc-mono: "Space Mono", ui-monospace, monospace;
        position: fixed;
        inset: 0;
        z-index: 26000;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        font-family: var(--esc-mono);
        color: #fff;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      #esc-overlay .esc-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(5, 5, 20, 0.7);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }

      #esc-overlay .esc-panel {
        position: relative;
        z-index: 1;
        pointer-events: auto;
        min-width: min(420px, 92vw);
        max-width: 460px;
        width: 90%;
        padding: 22px 22px 18px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 40px rgba(43, 255, 122, 0.08), 0 16px 48px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
      }

      #esc-overlay .esc-title {
        font-family: var(--esc-display);
        font-size: clamp(20px, 4vw, 28px);
        font-weight: 400;
        letter-spacing: 0.06em;
        margin: 0 0 12px;
        min-height: 1.2em;
        text-align: center;
        line-height: 1.15;
        color: #22e6ff;
        text-shadow: 0 0 12px #22e6ff, 0 0 28px color-mix(in oklab, #22e6ff, transparent 50%);
      }

      #esc-overlay .esc-controls {
        display: grid;
        grid-template-columns: minmax(104px, auto) 1fr;
        gap: 6px;
        margin-bottom: 10px;
      }

      #esc-overlay .esc-control-row {
        display: contents;
      }

      #esc-overlay .esc-keycap,
      #esc-overlay .esc-control-label {
        padding: 8px 12px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-family: var(--esc-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        color: rgba(255, 255, 255, 0.88);
        min-width: 0;
      }

      #esc-overlay .esc-keycap {
        color: #22e6ff;
        text-shadow: 0 0 10px #22e6ff;
        text-align: center;
      }

      #esc-overlay .esc-control-label {
        text-transform: uppercase;
      }

      #esc-overlay .esc-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }

      #esc-overlay .esc-btn {
        width: 100%;
        padding: 10px 18px;
        border-radius: 6px;
        font-family: var(--esc-display);
        font-size: 14px;
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

      #esc-overlay .esc-btn:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        background: rgba(255, 255, 255, 0.05);
      }

      #esc-overlay .esc-btn--quit {
        --btn-glow: #22e6ff;
      }
    `.trim();
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "hud";

    const status = document.createElement("div");
    status.className = "hud-status";

    const timer = document.createElement("div");
    timer.className = "hud-timer";

    const scores = document.createElement("div");
    scores.className = "hud-scores";

    const hudGlowByColor = {
      pink: "#ff00ff",
      blue: "#00ffff",
      green: "#00ff00",
      yellow: "#ffff00",
      neonOrange: "#ff6600",
    };

    /** @type {{ root: HTMLDivElement; box: HTMLDivElement; label: HTMLDivElement; value: HTMLDivElement }[]} */
    const scoreBoxes = [];
    let scoreBoxStyleObserver = null;
    const applyScoreBoxMenuStyle = (box) => {
      const glow = hudGlowByColor[box.dataset.hudColor] || "#22e6ff";
      const borderColor = box.classList.contains("isLocal") ? "#ffffff" : glow;
      const boxShadow = box.classList.contains("isLocal")
        ? `0 0 0 1px rgba(255,255,255,0.1) inset, 0 0 12px #ffffff, 0 0 24px ${glow}, 0 0 44px ${glow}`
        : `0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 12px ${glow}, 0 0 28px ${glow}`;

      box.style.setProperty("--hud-glow", glow);
      box.style.setProperty("background-color", "rgba(0,0,0,0.55)", "important");
      box.style.setProperty("border", `2px solid ${borderColor}`, "important");
      box.style.setProperty("box-shadow", boxShadow, "important");
      box.style.setProperty("color", "#ffffff", "important");
    };
    const syncScoreBoxMenuStyles = () => {
      if (scoreBoxStyleObserver) scoreBoxStyleObserver.disconnect();
      scoreBoxes.forEach(({ box }) => {
        applyScoreBoxMenuStyle(box);
        if (scoreBoxStyleObserver) {
          scoreBoxStyleObserver.observe(box, {
            attributes: true,
            attributeFilter: ["class", "data-hud-color", "style"],
          });
        }
      });
    };

    for (let i = 0; i < 4; i += 1) {
      const box = document.createElement("div");
      box.className = "hud-scoreBox";
      // * Initial color class is set when slots are received.
      
      const label = document.createElement("div");
      label.className = "hud-scoreLabel";
      label.textContent = `P${i + 1}`;

      const value = document.createElement("div");
      value.className = "hud-scoreValue";
      value.textContent = "0";

      box.appendChild(label);
      box.appendChild(value);
      scores.appendChild(box);
      scoreBoxes.push({ root, box, label, value });
    }
    scoreBoxStyleObserver = new MutationObserver(syncScoreBoxMenuStyles);
    syncScoreBoxMenuStyles();

    const readyBtn = document.createElement("button");
    readyBtn.id = "ready-button";
    readyBtn.className = "hud-ready-btn";
    readyBtn.textContent = "CLICK TO READY";
    readyBtn.addEventListener("click", () => {
      if (partySocket) {
        partySocket.send(JSON.stringify({ type: MSG.readyToggle }));
      }
    });

    root.appendChild(status);
    root.appendChild(timer);
    root.appendChild(scores);
    root.appendChild(readyBtn);

    // In-game audio widget
    const audioWidget = document.createElement("div");
    audioWidget.className = "hud-audio";

    const hudMuteBtn = document.createElement("button");
    hudMuteBtn.className = "hud-mute-btn";
    hudMuteBtn.innerHTML = isMuted ? "✕" : "♪";
    if (isMuted) hudMuteBtn.classList.add("muted");
    hudMuteBtn.addEventListener("click", () => {
      isMuted = !isMuted;
      localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false");
      if (!isMuted && masterGain === 0) {
        masterGain = 0.25;
        localStorage.setItem("cartRaveVolume", "25");
      }
      try { applyAudioVolume(); } catch (e) {}
      syncAudioControls();
    });

    const hudVolTrack = document.createElement("div");
    hudVolTrack.className = "hud-vol-track";
    const hudVolFill = document.createElement("div");
    hudVolFill.className = "hud-vol-fill";
    hudVolFill.style.width = (isMuted ? 0 : masterGain * 100) + "%";
    hudVolTrack.appendChild(hudVolFill);
    hudVolTrack.addEventListener("click", (e) => {
      const r = hudVolTrack.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      masterGain = v;
      localStorage.setItem("cartRaveVolume", Math.round(v * 100).toString());
      if (v > 0 && isMuted) { isMuted = false; localStorage.removeItem("cartRaveMuted"); }
      if (v === 0) { isMuted = true; localStorage.setItem("cartRaveMuted", "true"); }
      try { applyAudioVolume(); } catch (e) {}
      syncAudioControls();
    });

    const hudVolVal = document.createElement("span");
    hudVolVal.className = "hud-vol-val";
    hudVolVal.textContent = isMuted ? "OFF" : Math.round(masterGain * 100);

    audioWidget.appendChild(hudMuteBtn);
    audioWidget.appendChild(hudVolTrack);
    audioWidget.appendChild(hudVolVal);
    root.appendChild(audioWidget);
    document.body.appendChild(root);

    const escOverlay = document.createElement("div");
    escOverlay.id = "esc-overlay";
    escOverlay.setAttribute("role", "dialog");
    escOverlay.setAttribute("aria-label", "Settings");
    escOverlay.style.display = "none";

    const escBackdrop = document.createElement("div");
    escBackdrop.className = "esc-backdrop";

    const escPanel = document.createElement("div");
    escPanel.className = "esc-panel";

    const escTitle = document.createElement("h2");
    escTitle.className = "esc-title";
    escTitle.textContent = "MENU";

    const controls = document.createElement("div");
    controls.className = "esc-controls";
    [
      ["WASD / Arrows", "drive"],
      ["Shift", "nitro"],
      ["Space", "horn"],
      ["M", "mute"],
      ["Esc", "close"],
    ].forEach(([key, labelText]) => {
      const row = document.createElement("div");
      row.className = "esc-control-row";
      const keycap = document.createElement("span");
      keycap.className = "esc-keycap";
      keycap.textContent = key;
      const label = document.createElement("span");
      label.className = "esc-control-label";
      label.textContent = labelText;
      row.appendChild(keycap);
      row.appendChild(label);
      controls.appendChild(row);
    });

    const actions = document.createElement("div");
    actions.className = "esc-actions";

    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className = "esc-btn";
    resumeBtn.textContent = "RESUME";

    const quitBtn = document.createElement("button");
    quitBtn.type = "button";
    quitBtn.className = "esc-btn esc-btn--quit";
    quitBtn.textContent = "QUIT TO MENU";

    actions.appendChild(resumeBtn);
    actions.appendChild(quitBtn);
    escPanel.appendChild(escTitle);
    escPanel.appendChild(controls);
    escPanel.appendChild(actions);
    escOverlay.appendChild(escBackdrop);
    escOverlay.appendChild(escPanel);
    document.body.appendChild(escOverlay);

    function syncAudioControls() {
      const percent = Math.round(masterGain * 100);
      hudMuteBtn.innerHTML = isMuted ? "✕" : "♪";
      hudMuteBtn.classList.toggle("muted", isMuted);
      hudVolFill.style.width = (isMuted ? 0 : masterGain * 100) + "%";
      hudVolVal.textContent = isMuted ? "OFF" : percent;
    }

    function hideEscOverlay() {
      escOverlay.style.display = "none";
      if (labelRenderer) labelRenderer.domElement.style.display = menuVisible ? "none" : "block";
    }

    function showEscOverlay() {
      escOverlay.style.display = "flex";
      if (labelRenderer) labelRenderer.domElement.style.display = "none";
      keys.clear();
      localNitroHeld = false;
      syncAudioControls();
      resumeBtn.focus();
    }

    function isEscOverlayVisible() {
      return getComputedStyle(escOverlay).display !== "none";
    }

    resumeBtn.addEventListener("click", hideEscOverlay);
    quitBtn.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("portal");
      window.location.href = url.pathname;
    });
    syncAudioControls();

    return {
      root,
      status,
      timer,
      scores,
      scoreBoxes,
      readyBtn,
      escOverlay,
      syncAudioControls,
      showEscOverlay,
      hideEscOverlay,
      isEscOverlayVisible,
    };
  }

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
    exitPortal.href = "https://vibej.am/portal/2026";
    exitPortal.textContent = "VIBE JAM PORTAL";
    exitPortal.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "https://vibej.am/portal/2026";
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
    // Fade out game music, fade in menu music
    try {
      if (musicEl && !musicEl.paused) {
        const fadeOut = setInterval(() => {
          if (musicEl.volume > 0.015) {
            musicEl.volume = Math.max(0, musicEl.volume - 0.015);
          } else {
            clearInterval(fadeOut);
            musicEl.pause();
            musicEl.currentTime = 0;
          }
        }, 30);
      }
    } catch (e) {}
    try { startMenuMusic(); } catch (e) {}
    const wrap = document.getElementById("cr-root");
    if (wrap) {
      wrap.style.display = "";
      wrap.style.opacity = "1";
      wrap.style.pointerEvents = "";
    }

    if (typeof window !== "undefined" && window.__cartRaveSkipMenuForPortalBypass) {
      window.__cartRaveSkipMenuForPortalBypass = false;
      hideMenu();
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
        initNetcode(room);
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
        initNetcode();
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        hideMenu();
        initNetcode();
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
            initNetcode();
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
        const ref = encodeURIComponent(`${window.location.origin}${window.location.pathname}`);
        portal.href = `https://vibej.am/portal/2026?ref=${ref}`;
      } catch {
        portal.href = "https://vibej.am/portal/2026";
      }
    }

    refreshMenuStats();

    // Wire new menu audio controls to game audio
    const crMuteBtn = document.getElementById("cr-mute-btn");
    const crVolTrack = document.getElementById("cr-vol-track");
    const crVolFill = document.getElementById("cr-vol-fill");
    const crVolVal = document.getElementById("cr-vol-val");

    function syncMenuVolume() {
      const vol = isMuted ? 0 : masterGain;
      if (crVolFill) crVolFill.style.width = (vol * 100) + "%";
      if (crVolVal) crVolVal.textContent = isMuted ? "OFF" : Math.round(masterGain * 100);
      if (hud && hud.syncAudioControls) hud.syncAudioControls();
    }

    if (crMuteBtn) {
      crMuteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        localStorage.setItem("cartRaveMuted", isMuted ? "true" : "false");
        if (!isMuted && masterGain === 0) {
          masterGain = 0.5;
          localStorage.setItem("cartRaveVolume", "50");
        }
        try { applyAudioVolume(); } catch(e) {}
        syncMenuVolume();
      });
    }

    if (crVolTrack) {
      crVolTrack.addEventListener("click", (e) => {
        const r = crVolTrack.getBoundingClientRect();
        const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        masterGain = v;
        localStorage.setItem("cartRaveVolume", Math.round(v * 100).toString());
        if (v > 0 && isMuted) {
          isMuted = false;
          localStorage.removeItem("cartRaveMuted");
        }
        if (v === 0) {
          isMuted = true;
          localStorage.setItem("cartRaveMuted", "true");
        }
        try { applyAudioVolume(); } catch(e) {}
        syncMenuVolume();
      });
    }

    // Set initial state from saved values
    const savedVol = localStorage.getItem("cartRaveVolume");
    if (savedVol !== null) {
      const parsed = parseInt(savedVol, 10);
      masterGain = Number.isNaN(parsed) ? 0.25 : Math.max(0, Math.min(1, parsed / 100));
    }
    const savedMute = localStorage.getItem("cartRaveMuted");
    if (savedMute === "true") isMuted = true;
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
    if (labelRenderer) labelRenderer.domElement.style.display = "block";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) hudAudio.style.display = "flex";
    // Crossfade: fade out menu music, fade in game music
    if (menuMusicEl) {
      const fadeOut = setInterval(() => {
        if (menuMusicEl.volume > 0.015) {
          menuMusicEl.volume = Math.max(0, menuMusicEl.volume - 0.015);
        } else {
          clearInterval(fadeOut);
          menuMusicEl.pause();
          menuMusicEl.currentTime = 0;
        }
      }, 30);
    }
    // Start game music with fade in once the game audio element exists.
    if (musicEl) {
      musicEl.volume = 0;
      musicEl.muted = isMuted;
      tryStartAmbientMusic();
      const targetVol = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
      const fadeIn = setInterval(() => {
        if (!musicEl) {
          clearInterval(fadeIn);
          return;
        }
        if (musicEl.volume < targetVol - 0.015) {
          musicEl.volume = Math.min(targetVol, musicEl.volume + 0.015);
        } else {
          musicEl.volume = targetVol;
          clearInterval(fadeIn);
        }
      }, 30);
    }
  }

  function refreshMenuStats() {
    const ps = getPersonalStats();
    const winsEl = document.getElementById("stat-wins");
    const playedEl = document.getElementById("stat-played");
    const ptsEl = document.getElementById("stat-pts");
    if (winsEl) winsEl.textContent = ps.wins;
    if (playedEl) playedEl.textContent = ps.matches;
    if (ptsEl) ptsEl.textContent = ps.totalPoints.toLocaleString();
  }


  hud = initHud();
  const resultsUi = initResultsOverlay();
  initMenu(); // Step 10b: Add menu initialization
  hideMenuRef = hideMenu;

  // * Bridges the server-driven game-start signal into main()'s nested functions.
  // * initNetcode() is top-level and cannot call hideMenu/startCountdown directly.
  onGameStartHandler = (msg) => {
    if (menuVisible) hideMenu();
    if (isHost) startCountdown();
  };

  function clampInt(value, min, max) {
    const v = Math.round(value);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function updateHud() {
    if (!hud) return;

    // --- Status line ---
    if (roundPhase === "running" && lastCartStandingTimeoutId !== null) {
      hud.status.style.display = "block";
      hud.status.style.color = "#ffffff";
      hud.status.textContent = "LAST CART STANDING!";
    } else if (roundPhase === "countdown") {
      const elapsedMs = Date.now() - (roundCountdownStartedAtMs || 0);
      const remainingMs = 3000 - elapsedMs;
      const n = clampInt(Math.ceil(remainingMs / 1000), 1, 3);
      hud.status.style.display = "block";
      hud.status.style.color = "#ffffff";
      hud.status.textContent = `GET READY  ${n}`;
    } else if (roundPhase === "podium") {
      // * Winner line lives on the results overlay; keep top HUD clear during podium.
      hud.status.style.display = "none";
      hud.status.textContent = "";
    } else {
      hud.status.style.display = "none";
      hud.status.textContent = "";
    }

    // --- Timer ---
    if (roundPhase === "running") {
      const elapsedMs = Date.now() - (roundStartedAtMs || 0);
      const remainingMs = 60000 - elapsedMs;
      const seconds = clampInt(Math.ceil(remainingMs / 1000), 0, 60);
      const text =
        seconds >= 60
          ? "1:00"
          : `:${String(seconds).padStart(2, "0")}`;
      hud.timer.style.display = "block";
      hud.timer.textContent = text;
    } else {
      hud.timer.style.display = "none";
      hud.timer.textContent = "";
    }

    // --- Score row ---
    if (roundPhase === "running") {
      hud.scores.style.display = "flex";
      const localIdx = localSlotIndexForConn(youConnId);
      if (updateHud._lastLocalIdx !== localIdx) {
        // PRE-SUBMISSION CLEANUP
        // eslint-disable-next-line no-console
        console.log("local slot:", localIdx);
        updateHud._lastLocalIdx = localIdx;
      }
      for (let i = 0; i < 4; i += 1) {
        const entry = hud.scoreBoxes[i];
        const score = roundScores && roundScores[i] != null ? roundScores[i] : 0;
        entry.value.textContent = String(score);
        const slotName = netSlots[i]?.name || `P${i + 1}`;
        entry.label.textContent = slotName;
        entry.box.classList.toggle("isLocal", i === localIdx);
      }
    } else {
      hud.scores.style.display = "none";
      for (let i = 0; i < 4; i += 1) {
        const entry = hud.scoreBoxes[i];
        entry.box.classList.remove("isLocal");
        entry.value.textContent = "";
      }
    }

    // --- Ready button ---
    if (hud.readyBtn) {
      const localSlot = netSlots.find((s) => s && s.connId === youConnId);
      const isLocalReady = localSlot ? Boolean(localSlot.isReady) : false;
      if (roundPhase === "lobby" && !menuVisible) {
        autoReadyConnId = null;
        hud.readyBtn.style.display = "block";
        hud.readyBtn.textContent = isLocalReady ? "READY!" : "CLICK TO READY";
        hud.readyBtn.classList.toggle("is-ready", isLocalReady);
      } else {
        hud.readyBtn.style.display = "none";
        hud.readyBtn.classList.remove("is-ready");
        if (
          detectGameMode() === "quickplay" &&
          !menuVisible &&
          youConnId &&
          localSlot?.kind === "human" &&
          !isLocalReady &&
          autoReadyConnId !== youConnId &&
          partySocket &&
          partySocket.readyState === WebSocket.OPEN
        ) {
          partySocket.send(JSON.stringify({ type: MSG.readyToggle }));
          __msgCounts.out[MSG.readyToggle] = (__msgCounts.out[MSG.readyToggle] || 0) + 1;
          autoReadyConnId = youConnId;
        }
      }
    }

    updateResultsOverlay();
  }

  function updateResultsOverlay() {
    if (!resultsUi) return;
    const { overlay, title, finalScores, history, playAgain, exitPortal, statsLine } = resultsUi;
    if (roundPhase === "podium") {
      overlay.style.display = "flex";
      overlay.style.pointerEvents = "auto";
      playAgain.disabled = !isHost;
      playAgain.textContent = isHost ? "PLAY AGAIN" : "WAITING FOR HOST…";

      const slotDisplayName = (slotIndex) => netSlots[slotIndex]?.name || `P${slotIndex + 1}`;

      if (roundWinnerSlotIndex === "draw") {
        title.textContent = "DRAW";
        title.style.setProperty("--title-glow", "#ffe53d");
      } else {
        const idx = Number.isFinite(roundWinnerSlotIndex) ? roundWinnerSlotIndex : null;
        if (idx != null) {
          const score = roundScores && roundScores[idx] != null ? roundScores[idx] : 0;
          title.textContent = `${slotDisplayName(idx)} wins — ${score} pts`;
          title.style.setProperty("--title-glow", getColorForSlot(netSlots[idx]));
        } else {
          title.textContent = "ROUND COMPLETE";
          title.style.setProperty("--title-glow", "#ffffff");
        }
      }

      finalScores.replaceChildren();
      for (let i = 0; i < 4; i += 1) {
        const s = roundScores && roundScores[i] != null ? roundScores[i] : 0;
        const row = document.createElement("div");
        row.className = "results-score-row";
        const isWinner = roundWinnerSlotIndex !== "draw" && roundWinnerSlotIndex === i;
        if (isWinner) row.classList.add("is-winner");
        row.style.setProperty("--slot-glow", getColorForSlot(netSlots[i]));

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
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    updateCameraFraming();
    camera.updateProjectionMatrix();
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
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, visualRecordY, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

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

  (function buildRecordSurfaceVinylLabel(parentMesh) {
    const surf = CONFIG.record.surface;
    const th = visualRecordThickness;
    const yBase = th / 2;

    const spindle = surf.spindleRing;
    if (spindle.enabled) {
      const spindleGeo = new THREE.RingGeometry(
        CONFIG.record.innerRadius,
        Math.max(spindle.outerRadius, CONFIG.record.innerRadius + 0.18),
        96,
      );
      const spindleMat = new THREE.MeshBasicMaterial({
        color: spindle.color,
        depthWrite: false,
      });
      const spindleMesh = new THREE.Mesh(spindleGeo, spindleMat);
      spindleMesh.userData.recordSurfacePart = "spindleRing";
      spindleMesh.rotation.x = -Math.PI / 2;
      spindleMesh.position.y = yBase + spindle.yOffset;
      parentMesh.add(spindleMesh);
    }

    const disc = surf.labelDisc;
    if (disc.enabled) {
      const discGeo = new THREE.RingGeometry(CONFIG.record.innerRadius, disc.outerRadius, 96);
      const discMat = new THREE.MeshBasicMaterial({
        color: disc.color,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.userData.recordSurfacePart = "labelDisc";
      discMesh.rotation.x = -Math.PI / 2;
      discMesh.position.y = yBase + disc.yOffset + 0.01;
      discMesh.renderOrder = 2;
      parentMesh.add(discMesh);
    }

    const lt = surf.labelText;
    if (!lt.enabled) return;

    const canvasSize = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const labelOuterWorld = disc.enabled ? disc.outerRadius : 6.5;
    const labelOuterPx = canvasSize * 0.5 - 16;
    const labelInnerPx = (CONFIG.record.innerRadius / labelOuterWorld) * (canvasSize / 2);
    const labelColors = [
      "#ff00ff",
      "#00ffff",
      "#00ff00",
      "#ffff00",
      "#ff6600",
    ];

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const textRadius = labelOuterWorld - 0.04;
    const textGeo = new THREE.RingGeometry(CONFIG.record.innerRadius, textRadius, 96);
    const textMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.userData.recordSurfacePart = "labelText";
    textMesh.renderOrder = 3;
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.y = yBase + lt.yOffset + 0.02;
    parentMesh.add(textMesh);

    // * Defer drawing until Bungee is available so canvas glyphs render with the correct face.
    document.fonts.load('88px "Bungee"').then(() => {
      ctx.clearRect(0, 0, canvasSize, canvasSize);

      ctx.save();
      const labelImage = ctx.createImageData(canvasSize, canvasSize);
      const palette = labelColors.map((color) => new THREE.Color(color));
      for (let y = 0; y < canvasSize; y += 1) {
        for (let x = 0; x < canvasSize; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          const radius = Math.hypot(dx, dy);
          if (radius < labelInnerPx || radius > labelOuterPx) continue;

          const angle = Math.atan2(dy, dx);
          const spiral = ((angle + Math.PI) / (Math.PI * 2) + radius / labelOuterPx * 0.75) * palette.length;
          const colorIndex = Math.floor(spiral) % palette.length;
          const nextColorIndex = (colorIndex + 1) % palette.length;
          const blend = spiral - Math.floor(spiral);
          const smoothBlend = blend * blend * (3 - 2 * blend);
          const color = palette[colorIndex].clone().lerp(palette[nextColorIndex], smoothBlend);
          const alpha = 0.92 - (radius / labelOuterPx) * 0.12;
          const pixel = (y * canvasSize + x) * 4;

          labelImage.data[pixel] = Math.round(color.r * 255);
          labelImage.data[pixel + 1] = Math.round(color.g * 255);
          labelImage.data[pixel + 2] = Math.round(color.b * 255);
          labelImage.data[pixel + 3] = Math.round(alpha * 255);
        }
      }
      ctx.putImageData(labelImage, 0, 0);

      // * Subtle vignette: transparent center -> rgba(0,0,0,0.3) at the outer label edge for added depth.
      const vignette = ctx.createRadialGradient(cx, cy, labelInnerPx, cx, cy, labelOuterPx);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.3)");
      ctx.fillStyle = vignette;
      ctx.beginPath();
      ctx.arc(cx, cy, labelOuterPx, 0, Math.PI * 2);
      ctx.fill();
      // * Punch the spindle hole back out so the center stays clean.
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx, cy, labelInnerPx * 0.98, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // * Sample the swirl at a given polar position to pick the dominant color underneath.
      function nearestSwirlColor(angleRad, radiusPx) {
        const spiral = ((angleRad + Math.PI) / (Math.PI * 2) + (radiusPx / labelOuterPx) * 0.75) * labelColors.length;
        const idx = ((Math.floor(spiral) % labelColors.length) + labelColors.length) % labelColors.length;
        return labelColors[idx];
      }

      function drawCartIconOnLabel(x, y, scale, strokeColor, fillColor, shadowColor, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(-72, -34);
        ctx.lineTo(-40, -34);
        ctx.lineTo(-22, 26);
        ctx.moveTo(-36, -10);
        ctx.lineTo(74, -10);
        ctx.lineTo(58, 34);
        ctx.lineTo(-14, 34);
        ctx.closePath();
        ctx.moveTo(-20, 10);
        ctx.lineTo(68, 10);
        ctx.moveTo(8, -10);
        ctx.lineTo(2, 34);
        ctx.moveTo(38, -10);
        ctx.lineTo(42, 34);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-4, 58, 13, 0, Math.PI * 2);
        ctx.arc(54, 58, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // * 8 evenly-spaced cart icons, each shadowed with the swirl color directly beneath it.
      const iconCount = 8;
      const iconRadius = labelOuterPx * 0.66;
      for (let i = 0; i < iconCount; i += 1) {
        const angle = -Math.PI / 2 + (i / iconCount) * Math.PI * 2;
        drawCartIconOnLabel(
          cx + Math.cos(angle) * iconRadius,
          cy + Math.sin(angle) * iconRadius,
          0.85,
          "rgba(255, 255, 255, 0.4)",
          "rgba(0, 0, 0, 0.25)",
          nearestSwirlColor(angle, iconRadius),
          angle + Math.PI / 2,
        );
      }

      // --- Arc text helper: draws text along a circular path ---
      function drawArcText(ctx, text, centerX, centerY, radius, startAngle, charSpacing, outward) {
        ctx.save();
        ctx.font = '88px "Bungee", sans-serif';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const totalAngle = charSpacing * (text.length - 1);
        let angle = startAngle - totalAngle / 2;

        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);

          ctx.save();
          ctx.translate(x, y);

          if (outward) {
            ctx.rotate(angle + Math.PI / 2);
          } else {
            ctx.rotate(angle - Math.PI / 2);
          }

          // * Per-character white-to-pink shimmer for a metallic/holographic record-label feel.
          const grad = ctx.createLinearGradient(0, -10, 0, 10);
          grad.addColorStop(0.0, '#cccccc');
          grad.addColorStop(0.5, '#cc99bb');
          grad.addColorStop(1.0, '#bb44aa');
          ctx.fillStyle = grad;

          ctx.strokeText(ch, 0, 0);
          ctx.fillText(ch, 0, 0);
          ctx.restore();

          angle += charSpacing;
        }

        ctx.restore();
      }

      // Draw CART RAVE on top half (12 o'clock, reading left-to-right)
      drawArcText(ctx, 'CART RAVE', 512, 512, 378, -Math.PI / 2, 0.18, true);

      // Draw CART RAVE on bottom half (6 o'clock, reading left-to-right)
      drawArcText(ctx, 'CART RAVE', 512, 512, 378, Math.PI / 2, -0.18, false);

      tex.needsUpdate = true;
    });
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

  if (CONFIG.debug.arenaTrimesh) {
    const vCount = recordPhysicsGeo.attributes.position.count;
    const iCount = recordPhysicsGeo.index ? recordPhysicsGeo.index.count : vCount;
    // eslint-disable-next-line no-console
    console.log("[arena] record ring trimesh", {
      vertices: vCount,
      indices: iCount,
      triangles: Math.floor(iCount / 3),
    });
  }

  // ========================================================================
  // Step 15 — DJ Spawn Booths (4x, N/S/E/W)
  // ========================================================================
  const boothNeonMeshes = []; // collect for RGB cycling in game loop

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
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(B.platformWidth / 2, B.platformThickness / 2, B.platformDepth / 2)
          .setFriction(B.friction)
          .setRestitution(B.restitution),
        platBody,
      );


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
  // eslint-disable-next-line no-console
  console.log("[arena] dancefloor outer radius", {
    radius: CONFIG.record.radius,
    pitInnerRadius,
  });
  // eslint-disable-next-line no-console
  console.log("[debug] death threshold Y:", CONFIG.fall.yThreshold);

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
  const pitWallMat = new THREE.MeshStandardMaterial({
    color: 0x08081a,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.BackSide,
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
  world.createCollider(RAPIER.ColliderDesc.trimesh(pitWallVerts, pitWallIndices), pitWallBody);

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
  const crowdMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });
  const crowdCarts = new THREE.InstancedMesh(mergedGeo, crowdMat, 5000);
  const crowdPalette = Object.values(CART_COLORS).map((entry) => entry.hex);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5000; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = pitInnerRadius + 0.5 + Math.random() * 80;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const scale = 0.25 + Math.random() * 0.2;

    dummy.position.set(x, -2.5, z);
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

  /** @type {{ target: THREE.Object3D, cone: THREE.Mesh, index: number }[]} */
  const crowdSearchlightEntries = [];
  const crowdSearchlightColors = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00];
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
    crowdSearchlightEntries.push({ target, cone, index: i });
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

  function yawToCenter(spawn) {
    // Our yaw convention yields forward = (-sin(yaw), 0, -cos(yaw)).
    // Facing the center means forward should point from spawn -> (0,0).
    return Math.atan2(spawn.x, spawn.z);
  }

  function quatFromYaw(yaw) {
    const half = yaw / 2;
    return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  }

  function createCart({ color, spawn, spawnYaw, label, slotIndex }) {
    const mesh = buildCart(color);
    scene.add(mesh);

    const spawnFrozen = { x: spawn.x, y: spawn.y, z: spawn.z };

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnFrozen.x, spawnFrozen.y, spawnFrozen.z)
        .setLinearDamping(CONFIG.cart.linearDamping)
        .setAngularDamping(CONFIG.cart.angularDamping),
    );
    body.setRotation(quatFromYaw(spawnYaw), true);
    // Keep the cart responsive; some Rapier builds may sleep bodies aggressively.
    if (typeof body.setCanSleep === "function") {
      body.setCanSleep(false);
    }

    const hx = CONFIG.cart.size.x / 2;
    const hy = CONFIG.cart.size.y / 2;
    const hz = CONFIG.cart.size.z / 2;
    const colliderLocalY = -0.12;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(0, colliderLocalY, 0)
      .setFriction(CONFIG.cart.friction)
      .setRestitution(CONFIG.cart.restitution);
    if (typeof colliderDesc.setActiveEvents === "function") {
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }
    const collider = world.createCollider(colliderDesc, body);

    applyCartMassPropertiesOverride(body, collider, {
      label,
      hx,
      hy,
      hz,
      colliderLocalY,
    });

    return {
      mesh,
      body,
      collider,
      spawn: spawnFrozen,
      spawnYaw,
      slotIndex,
      label,
      cartColor: color,
      lastRamBoostTimeMs: Number.NEGATIVE_INFINITY,
      ramBoostActiveUntilMs: 0,
      ramBoostStreakCarry: 0,
      respawnAtMs: null,
      pendingRam: null,
      aiNextDecisionMs: 0,
      aiTarget: { x: 0, z: 0 },
    };
  }

  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + CONFIG.fall.respawnDelayMs;
  }

  function doRespawn(cart) {
    cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
    cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
    cart.respawnAtMs = null;
    cart.pendingRam = null;
    cart.ramBoostActiveUntilMs = 0;
    cart.ramBoostStreakCarry = 0;
    resetCartVisualState(cart.mesh);
  }

  respawnLocalMidRoundJoinRef.current = () => {
    if (!youConnId || pendingMidRoundJoinRespawnConnId !== youConnId) return;
    if (roundPhase !== "running") return;
    // * Mid-round joins take over NPC in place. DO NOT call doRespawn().
    pendingMidRoundJoinRespawnConnId = null;
  };

  /**
   * @param {number} nowMs
   */
  function applyArcadeControls(cart, axis, dtFixed, nowMs) {
    const pos = cart.body.translation();
    const rot = cart.body.rotation();
    const linvel = cart.body.linvel();
    const mass = getBodyMass(cart.body);

    // Cheap ground check: if vertical velocity is near zero and the cart isn't
    // well below the arena, treat as grounded. Works on booths and arena alike.
    const vertVel = Math.abs(linvel.y);
    const onGround = vertVel < 2.0 && pos.y > CONFIG.fall.yThreshold;
    const controlFactor = onGround ? 1 : CONFIG.driving.airControlFactor;

    const yaw = yawFromQuaternion(rot);
    const { forward, right } = getForwardRightFromYaw(yaw);

    const v = rapierToVec3(linvel);
    const vForward = forward.dot(v);
    const vRight = right.dot(v);

    if (axis.forward !== 0 || axis.turn !== 0) {
      cart.body.wakeUp();
    }

    const grip =
      axis.turn !== 0
        ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
        : CONFIG.driving.lateralGrip;
    const dvRight = (-vRight) * grip * dtFixed;
    const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
    cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);

    if (axis.forward !== 0) {
      const rb = CONFIG.cart.ramBoost;
      const nitroForward =
        rb.enabled && nowMs <= cart.ramBoostActiveUntilMs && axis.forward > 0;
      let targetSpeed =
        axis.forward > 0 ? CONFIG.driving.maxSpeed : -CONFIG.driving.reverseMaxSpeed;
      if (nitroForward) {
        targetSpeed = rb.boostedMaxSpeed;
      }
      const accelRate =
        nitroForward && rb.boostedAccel != null ? rb.boostedAccel : CONFIG.driving.accel;
      const speedError = targetSpeed - vForward;
      const maxDeltaV = accelRate * controlFactor * dtFixed;
      const dvForward = clamp(speedError, -maxDeltaV, maxDeltaV);
      if (Math.abs(dvForward) > 1e-4) {
        const driveImpulse = forward.clone().multiplyScalar(mass * dvForward);
        cart.body.applyImpulse(vec3ToRapier(driveImpulse), true);
      }
    }

    if (axis.turn !== 0) {
      const av = cart.body.angvel();
      const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
      const yawError = desiredYawRate - av.y;
      const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
      cart.body.applyTorqueImpulse({ x: 0, y: torqueImpulseY, z: 0 }, true);

      const speedForDrift = Math.abs(vForward);
      if (speedForDrift > 0.25) {
        const driftDir = right.clone().multiplyScalar(axis.turn * Math.sign(vForward || 1));
        const driftMag =
          speedForDrift *
          CONFIG.driving.driftImpulseStrength *
          controlFactor *
          mass *
          dtFixed;
        cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
      }
    }

    const av = cart.body.angvel();
    const maxPitchRoll = 1.5;
    if (Math.abs(av.x) > maxPitchRoll || Math.abs(av.z) > maxPitchRoll) {
      cart.body.setAngvel({
        x: clamp(av.x, -maxPitchRoll, maxPitchRoll),
        y: av.y,
        z: clamp(av.z, -maxPitchRoll, maxPitchRoll),
      }, true);
    }
  }

  function spawnOnRingForSlot(slotIndex) {
    const ringR = CONFIG.cart.spawnRingRadius;
    const angle = (slotIndex * Math.PI) / 2;
    return {
      x: ringR * Math.cos(angle),
      y: CONFIG.cart.spawnHeight,
      z: ringR * Math.sin(angle),
    };
  }

  await firstHelloPromise;

  /** @type {ReturnType<typeof createCart>[]} */
  const cartsBySlotId = [];
  for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
    const spawn = spawnOnRingForSlot(slotIndex);
    const slot = netSlots[slotIndex];
    const cart = createCart({
      color: slot?.connId === youConnId && CART_COLORS[localStorage.getItem("cartRaveColor")] ? CART_COLORS[localStorage.getItem("cartRaveColor")].hex : colorHexForSlot(slot),
      spawn,
      spawnYaw: yawToCenter(spawn),
      label: slot?.name ?? `slot-${slotIndex}`,
      slotIndex,
    });
    cartsBySlotId[slotIndex] = cart;
    if (
      pendingMidRoundJoinRespawnConnId === youConnId &&
      slot?.connId === youConnId
    ) {
      doRespawn(cart);
      pendingMidRoundJoinRespawnConnId = null;
    }
  }

  const colliderHandleToCart = new Map();
  for (const c of cartsBySlotId) {
    colliderHandleToCart.set(c.collider.handle, c);
  }

  const allCarts = cartsBySlotId;

  // Expose carts + input + nitro for netcode helpers (module-scope).
  allCartsRef = allCarts;

  // --- Floating name labels above carts ---
  const nameLabels = [];
  function makeNameLabel(text, color) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.padding = "6px 20px";
    el.style.borderRadius = "8px";
    el.style.background = "rgba(0, 0, 0, 0.55)";
    el.style.color = color;
    el.style.font = "bold 32px monospace";
    el.style.lineHeight = "1";
    el.style.whiteSpace = "nowrap";
    el.style.textShadow = `0 0 8px ${color}`;
    el.style.transform = "translate(-50%, 0)";

    const label = new CSS2DObject(el);
    label.center.set(0.5, 0);
    return label;
  }

  function updateNameLabels() {
    for (let i = 0; i < allCarts.length; i++) {
      const slot = netSlots[i];
      const cart = allCarts[i];
      if (!slot || !cart || !cart.mesh) continue;

      const name = slot.name || `P${i + 1}`;
      const colorHex = CART_COLORS[slot.color]?.hex;
      const colorCSS = colorHex ? "#" + colorHex.toString(16).padStart(6, "0") : "#ffffff";

      if (nameLabels[i]) {
        if (nameLabels[i]._labelText !== name || nameLabels[i]._labelColor !== colorCSS) {
          scene.remove(nameLabels[i]);
          const label = makeNameLabel(name, colorCSS);
          label._labelText = name;
          label._labelColor = colorCSS;
          scene.add(label);
          nameLabels[i] = label;
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
      const pos = cart.body.translation();
      label.position.set(pos.x, pos.y + 3.0, pos.z);
      const distance = Math.max(0.001, camera.position.distanceTo(label.position));
      const scale = clamp(18 / distance, 0.65, 1.2);
      label.element.style.fontSize = `${32 * scale}px`;
      label.element.style.padding = `${6 * scale}px ${20 * scale}px`;
      label.element.style.textShadow = `0 0 ${8 * scale}px ${label._labelColor}`;
    }
  }

  updateNameLabelsRef.current = updateNameLabels;
  updateNameLabels();

  getAxisRef = getAxis;
  triggerRamBoostRef = triggerRamBoost;

  /** @type {{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; birthMs: number; durationMs: number }[]} */
  const ramBoostStreaks = [];
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
    const yaw = yawFromQuaternion(rot);
    const { forward, right } = getForwardRightFromYaw(yaw);
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
    cart.ramBoostStreakCarry = 0;

    if (!nitroFirstBoostDiagnosticLogged) {
      const rot = cart.body.rotation();
      const yaw = yawFromQuaternion(rot);
      const { forward } = getForwardRightFromYaw(yaw);
      const lv = cart.body.linvel();
      const vForward = forward.x * lv.x + forward.y * lv.y + forward.z * lv.z;
      // eslint-disable-next-line no-console
      console.log("[diagnostic] nitro first boost", {
        id: cart.label,
        cartColor: cart.cartColor,
        boostDurationSec: rb.durationSec,
        targetMaxSpeedWhileNitro: rb.boostedMaxSpeed,
        forwardSpeedAtTrigger: vForward,
      });
      nitroFirstBoostDiagnosticLogged = true;
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
    const yaw = yawFromQuaternion(rot);
    const { forward } = getForwardRightFromYaw(yaw);
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
        s.material.opacity = 1 - t;
      }
    }
  }

  function rematchResetWorld() {
    for (let i = ramBoostStreaks.length - 1; i >= 0; i -= 1) {
      const s = ramBoostStreaks[i];
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.material.dispose();
      ramBoostStreaks.splice(i, 1);
    }
    lastHitBy.clear();
    for (const cart of allCarts) {
      cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
      cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
      cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      cart.respawnAtMs = null;
      cart.pendingRam = null;
      cart.ramBoostActiveUntilMs = 0;
      cart.ramBoostStreakCarry = 0;
      cart.lastRamBoostTimeMs = Number.NEGATIVE_INFINITY;
      cart.aiNextDecisionMs = 0;
      cart.aiTarget = { x: 0, z: 0 };
      resetCartVisualState(cart.mesh);
    }
    const carts = {};
    for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
      const c = allCarts[slotIndex];
      const t = c.body.translation();
      const r = c.body.rotation();
      const lv = c.body.linvel();
      const av = c.body.angvel();
      carts[String(slotIndex)] = {
        p: [t.x, t.y, t.z],
        q: [r.x, r.y, r.z, r.w],
        lv: [lv.x, lv.y, lv.z],
        av: [av.x, av.y, av.z],
      };
    }
    lastCartsCache = carts;
  }

  function pickAiTarget(fromPos) {
    const dist = Math.hypot(fromPos.x, fromPos.z);
    const edgeBiasStart = CONFIG.record.radius * 0.78;
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
      cart.aiNextDecisionMs = now + (2000 + Math.random() * 2000);
    }

    const toTarget = new THREE.Vector3(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    if (toTarget.lengthSq() < 0.25) {
      cart.aiTarget = pickAiTarget(p);
      cart.aiNextDecisionMs = now + (2000 + Math.random() * 2000);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    }
    toTarget.normalize();

    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    const currentYaw = yawFromQuaternion(cart.body.rotation());
    const yawDiff = wrapAngleRad(desiredYaw - currentYaw);

    const turn = clamp(yawDiff * 1.4, -1, 1);
    const forward = Math.abs(yawDiff) > 2.2 ? -0.5 : 1;
    return { forward, turn };
  }

  // --- Input ---
  const keys = new Set();
  const handledCodes = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]);

  // --- Horn (positional at player cart) & ambient music ---
  const hornUrlWav = new URL("sounds/horn.wav", window.location.href).toString();
  const hornUrlMp3 = new URL("sounds/horn.mp3", window.location.href).toString();

  const hornEchoIRBuffer = buildSparseEchoImpulseResponse(audioListener.context);

  const playerCartHorn = new THREE.PositionalAudio(audioListener);
  localCartForConnId().mesh.add(playerCartHorn);
  playerCartHorn.setRefDistance(CONFIG.audio.hornRefDistance);
  playerCartHorn.setRolloffFactor(CONFIG.audio.hornRolloffFactor);
  playerCartHorn.setVolume(CONFIG.audio.hornVolume);
  const playerHornEchoConvolver = audioListener.context.createConvolver();
  playerHornEchoConvolver.buffer = hornEchoIRBuffer;
  playerHornEchoConvolver.normalize = false;
  playerCartHorn.setFilter(playerHornEchoConvolver);

  /** @type {{ horn: THREE.PositionalAudio; cart: ReturnType<typeof createCart> }[]} */
  const npcHornEntries = [];
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    const slot = netSlots[slotIndex];
    const c = allCarts[slotIndex];
    if (!slot || slot.kind !== "npc") continue;
    const horn = new THREE.PositionalAudio(audioListener);
    c.mesh.add(horn);
    horn.setRefDistance(CONFIG.audio.hornRefDistance);
    horn.setRolloffFactor(CONFIG.audio.hornRolloffFactor);
    horn.setVolume(CONFIG.audio.hornVolume);
    const conv = audioListener.context.createConvolver();
    conv.buffer = hornEchoIRBuffer;
    conv.normalize = false;
    horn.setFilter(conv);
    npcHornEntries.push({ horn, cart: c });
  }

  const hornLoader = new THREE.AudioLoader();
  let hornBufferReady = false;

  function loadHornFromMp3() {
    hornLoader.load(
      hornUrlMp3,
      (buffer) => {
        playerCartHorn.setBuffer(buffer);
        for (const { horn } of npcHornEntries) {
          horn.setBuffer(buffer);
        }
        hornBufferReady = true;
      },
      undefined,
      () => {
        // * Horn samples unavailable; procedural horn is used instead.
      },
    );
  }

  hornLoader.load(
    hornUrlWav,
    (buffer) => {
      playerCartHorn.setBuffer(buffer);
      for (const { horn } of npcHornEntries) {
        horn.setBuffer(buffer);
      }
      hornBufferReady = true;
    },
    undefined,
    () => {
      loadHornFromMp3();
    },
  );

  const musicUrl = new URL("sounds/music.mp3", window.location.href).toString();
  musicEl = new Audio();
  musicEl.loop = true;
  musicEl.volume = CONFIG.audio.musicVolume * masterGain;
  musicEl.preload = "auto";
  musicEl.src = musicUrl;
  musicEl.addEventListener("error", () => {
    musicUnavailable = true;
  });
  musicEl.load();

  // Menu music — plays on page load, stops when game starts
  const menuMusicUrl = new URL("sounds/menu.mp3", window.location.href).toString();
  menuMusicEl = new Audio();
  menuMusicEl.loop = true;
  menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
  menuMusicEl.preload = "auto";
  menuMusicEl.src = menuMusicUrl;
  let menuMusicStarted = false;
  menuMusicEl.addEventListener("error", () => {
    console.warn("[audio] menu music not found");
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
  tryStartMenuMusic();
  // Also try on first user interaction
  window.addEventListener("pointerdown", tryStartMenuMusic, { passive: true });
  window.addEventListener("keydown", tryStartMenuMusic, { once: true });

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

  // Step 10d: Apply audio volume to engine
  function applyAudioVolume() {
    // Apply master gain to Three.js AudioListener
    if (audioListener && typeof audioListener.setMasterVolume === 'function') {
      audioListener.setMasterVolume(isMuted ? 0 : masterGain);
    }
    // Apply mute state to HTML audio element
    if (musicEl) musicEl.muted = isMuted;
    if (menuMusicEl) {
      menuMusicEl.volume = CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain);
      menuMusicEl.muted = isMuted;
    }
  }

  // Initialize audio with saved settings
  applyAudioVolume();

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

  function unlockAudioAndMaybeStartMusic() {
    void audioListener.context.resume();
    tryStartAmbientMusic();
  }

  canvas.addEventListener("pointerdown", () => {
    void audioListener.context.resume();
    if (!menuVisible) tryStartAmbientMusic();
    canvas.focus();
  });
  window.addEventListener("pointerdown", () => {
    void audioListener.context.resume();
    if (!menuVisible) tryStartAmbientMusic();
  }, { passive: true });

  function playProceduralHornAtCart(cart, volumeScale = 1) {
    const ctx = audioListener.context;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 0.24;

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + duration * 0.55);
    osc.frequency.exponentialRampToValueAtTime(620, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(7, now);

    const gain = ctx.createGain();
    const peak = 0.22 * volumeScale;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const panner = ctx.createPannerNode();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = CONFIG.audio.hornRefDistance;
    panner.rolloffFactor = CONFIG.audio.hornRolloffFactor;
    const p = cart.body.translation();
    if (panner.positionX) {
      panner.positionX.setValueAtTime(p.x, now);
      panner.positionY.setValueAtTime(p.y, now);
      panner.positionZ.setValueAtTime(p.z, now);
    } else {
      panner.setPosition(p.x, p.y, p.z);
    }

    const echoDry = ctx.createGain();
    echoDry.gain.value = CONFIG.audio.hornEchoProceduralDry;
    const echoWet = ctx.createGain();
    echoWet.gain.value = CONFIG.audio.hornEchoProceduralWet;
    const echoDelay = ctx.createDelay(0.25);
    echoDelay.delayTime.value = CONFIG.audio.hornEchoProceduralDelaySec;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(echoDry);
    gain.connect(echoDelay);
    echoDelay.connect(echoWet);
    echoDry.connect(panner);
    echoWet.connect(panner);
    panner.connect(audioListener.gain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playBufferHorn(hornPositional, cartForProcedural, volumeScale = 1) {
    void audioListener.context.resume();
    const baseVol = CONFIG.audio.hornVolume;
    if (volumeScale !== 1) {
      hornPositional.setVolume(baseVol * volumeScale);
    }
    if (hornBufferReady) {
      if (hornPositional.isPlaying) {
        hornPositional.stop();
      }
      try {
        hornPositional.play();
        if (volumeScale !== 1 && hornPositional.source) {
          const s = hornPositional.source;
          const was = s.onended;
          s.onended = function onLocalHornEnded() {
            hornPositional.setVolume(baseVol);
            if (typeof was === "function") was();
          };
        }
      } catch {
        if (volumeScale !== 1) {
          hornPositional.setVolume(baseVol);
        }
        playProceduralHornAtCart(cartForProcedural, volumeScale);
      }
      return;
    }
    if (volumeScale !== 1) {
      hornPositional.setVolume(baseVol);
    }
    playProceduralHornAtCart(cartForProcedural, volumeScale);
  }

  function maybePlayAiRamHornOnPlayerHit(rammerCart) {
    if (Math.random() >= CONFIG.audio.aiRamHornChance) return;
    const entry = npcHornEntries.find((e) => e.cart === rammerCart);
    if (!entry) return;
    playBufferHorn(entry.horn, rammerCart);
  }

  function applyRammingImpulse(rammer, victim) {
    const rv = rammer.body.linvel();
    const speed = planarSpeed(rv);
    const vv = victim.body.linvel();
    if (speed < CONFIG.ramming.minSpeed) return;

    const dir = vec3PlanarDirection(rv);
    if (!dir) return;
    const closingSpeed = Math.max(speed, speed + (-(vv.x * dir.x + vv.z * dir.z)));

    const rp = rammer.body.translation();
    const vp = victim.body.translation();
    const toVictim = new THREE.Vector3(vp.x - rp.x, 0, vp.z - rp.z);
    if (toVictim.lengthSq() < 1e-6) return;
    toVictim.normalize();

    // Only count as a "ram" if moving roughly toward the other cart.
    if (dir.dot(toVictim) < 0.1) return;

    const localCart = localCartForConnId();
    if (localCart && victim === localCart) {
      const rammerSlot = netSlots[rammer.slotIndex];
      if (rammerSlot && rammerSlot.kind === "npc") {
        maybePlayAiRamHornOnPlayerHit(rammer);
      }
    }

    const impulseMag = clamp(
      CONFIG.ramming.strength * closingSpeed * getBodyMass(victim.body),
      0,
      CONFIG.ramming.maxImpulse,
    );
    const impulse = { x: dir.x * impulseMag, y: 0, z: dir.z * impulseMag };

    // Spread impact over a few physics steps to reduce jitter spikes.
    const steps = 3;
    if (!victim.pendingRam) {
      victim.pendingRam = { impulse, remainingSteps: steps };

      // Stage A: record last hit for scoring attribution (host only).
      const carts = allCartsRef || [];
      const attackerSlotIndex = carts.indexOf(rammer) >= 0 ? carts.indexOf(rammer) : rammer.slotIndex;
      const victimSlotIndex = carts.indexOf(victim) >= 0 ? carts.indexOf(victim) : victim.slotIndex;
      if (Number.isFinite(attackerSlotIndex) && Number.isFinite(victimSlotIndex)) {
        const wasCritical = speed >= CONFIG.scoring.criticalVelocityThreshold;
        lastHitBy.set(victimSlotIndex, { attackerSlotIndex, wasCritical, timestamp: Date.now() });
      }

      return;
    }
    victim.pendingRam.impulse.x += impulse.x;
    victim.pendingRam.impulse.y += impulse.y;
    victim.pendingRam.impulse.z += impulse.z;
    victim.pendingRam.remainingSteps = Math.max(victim.pendingRam.remainingSteps, steps);

    // Stage A: record last hit for scoring attribution (host only).
    const carts = allCartsRef || [];
    const attackerSlotIndex = carts.indexOf(rammer) >= 0 ? carts.indexOf(rammer) : rammer.slotIndex;
    const victimSlotIndex = carts.indexOf(victim) >= 0 ? carts.indexOf(victim) : victim.slotIndex;
    if (Number.isFinite(attackerSlotIndex) && Number.isFinite(victimSlotIndex)) {
      const wasCritical = speed >= CONFIG.scoring.criticalVelocityThreshold;
      lastHitBy.set(victimSlotIndex, { attackerSlotIndex, wasCritical, timestamp: Date.now() });
    }
  }

  function sendHostRound() {
    if (!partySocket) return;
    partySocket.send(
      JSON.stringify({
        type: MSG.hostRound,
        round: {
          phase: roundPhase,
          startedAtMs: roundStartedAtMs,
          countdownStartedAtMs: roundCountdownStartedAtMs,
          winnerSlotIndex: roundWinnerSlotIndex,
          scores: roundScores,
        },
      }),
    );
  }

  function startRunning() {
    roundPhase = "running";
    console.log("[round] phase=" + roundPhase);
    roundStartedAtMs = Date.now();
    roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    roundWinnerSlotIndex = null;
    roundStartingHumanCount = 0;
    for (let i = 0; i < 4; i += 1) {
      const s = netSlots[i];
      if (s && s.kind === "human" && s.connId != null) roundStartingHumanCount += 1;
    }
    if (lastCartStandingTimeoutId != null) {
      clearTimeout(lastCartStandingTimeoutId);
      lastCartStandingTimeoutId = null;
    }
    lastCartStandingWinnerSlotIndex = null;
    sendHostRound();
  }

  function startCountdown() {
    roundPhase = "countdown";
    console.log("[round] phase=" + roundPhase);
    roundCountdownStartedAtMs = Date.now();
    roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    roundWinnerSlotIndex = null;
    roundStartedAtMs = 0;
    if (lastCartStandingTimeoutId != null) {
      clearTimeout(lastCartStandingTimeoutId);
      lastCartStandingTimeoutId = null;
    }
    lastCartStandingWinnerSlotIndex = null;
    sendHostRound();
    setTimeout(() => {
      if (roundPhase === "countdown") startRunning();
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
      roundPhase = "podium";
      console.log("[round] phase=" + roundPhase + " (last-cart-standing)");
      roundWinnerSlotIndex = lastCartStandingWinnerSlotIndex;
      lastCartStandingWinnerSlotIndex = null;
      sendHostRound();
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
    for (let i = 0; i < 4; i++) {
      if ((roundScores[i] || 0) > winnerScore) {
        winnerScore = roundScores[i] || 0;
        winnerSlotIndex = i;
      }
    }
    let tieAtTop = 0;
    for (let i = 0; i < 4; i++) {
      if ((roundScores[i] || 0) === winnerScore) tieAtTop += 1;
    }
    roundPhase = "podium";
    console.log("[round] phase=" + roundPhase);
    if (winnerScore === 0 && tieAtTop >= 2) {
      roundWinnerSlotIndex = "draw";
      console.log("[round] draw — no winner");
    } else {
      roundWinnerSlotIndex = winnerSlotIndex;
    }
    sendHostRound();
  }

  function clearAutoContinuePodiumTimeout() {
    if (autoContinuePodiumTimeoutId != null) {
      clearTimeout(autoContinuePodiumTimeoutId);
      autoContinuePodiumTimeoutId = null;
    }
  }

  function currentPodiumAutoContinueKey() {
    return `${roundStartedAtMs}:${roundWinnerSlotIndex}:${matchHistory.length}`;
  }

  function maybeScheduleAutoContinuePodium() {
    if (!isHost || roundPhase !== "podium") return;
    const mode = detectGameMode();
    if (mode !== "quickplay") return;

    const key = currentPodiumAutoContinueKey();
    if (autoContinuePodiumTimeoutId != null || autoContinuePodiumKey === key) return;

    autoContinuePodiumKey = key;
    autoContinuePodiumTimeoutId = setTimeout(() => {
      autoContinuePodiumTimeoutId = null;
      if (!isHost || roundPhase !== "podium") return;
      if (detectGameMode() !== "quickplay") return;
      onHostPlayAgainClick();
    }, 5000);
  }

  function onHostPlayAgainClick() {
    if (!isHost) return;
    autoContinuePodiumKey = currentPodiumAutoContinueKey();
    clearAutoContinuePodiumTimeout();
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
    rematchResetWorld();
    if (partySocket && partySocket.readyState === 1 && lastCartsCache) {
      hostSeq += 1;
      partySocket.send(
        JSON.stringify({
          type: MSG.hostTransform,
          seq: hostSeq,
          tHost: Date.now(),
          carts: lastCartsCache,
        }),
      );
      __msgCounts.out[MSG.hostTransform] = (__msgCounts.out[MSG.hostTransform] || 0) + 1;
    }
    if (partySocket && partySocket.readyState === 1) {
      partySocket.send(JSON.stringify({ type: MSG.playAgain }));
    }
  }

  resultsUi.playAgain.addEventListener("click", onHostPlayAgainClick);

  // * Throttle for Space horn (keydown repeat + rapid taps); aligns with one-shot sample length.
  let lastLocalHornKeyAtMs = 0;

  function onKeyDown(e) {
    if (e.code === "Escape") {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      if (hud && hud.isEscOverlayVisible && hud.isEscOverlayVisible()) {
        hud.hideEscOverlay();
      } else if (!menuVisible && hud && hud.showEscOverlay) {
        hud.showEscOverlay();
      }
      return;
    }

    if (hud && hud.isEscOverlayVisible && hud.isEscOverlayVisible()) {
      if (
        handledCodes.has(e.code) ||
        e.code === "Space" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight"
      ) {
        e.preventDefault();
        return;
      }
    }

    // Allow typing in input fields without triggering game controls
    if (e.target.tagName === 'INPUT') return;
    
    unlockAudioAndMaybeStartMusic();
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (e.repeat) return;
      e.preventDefault();
      localNitroHeld = true;
      triggerRamBoost(localCartForConnId(), performance.now());
      return;
    }
    if (e.code === "KeyM") {
      if (e.repeat) return;
      e.preventDefault();
      // Toggle mute using new volume system
      isMuted = !isMuted;
      localStorage.setItem('cartRaveMuted', isMuted ? 'true' : 'false');
      applyAudioVolume();
      if (hud && hud.syncAudioControls) hud.syncAudioControls();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      const tKey = performance.now();
      if (tKey - lastLocalHornKeyAtMs < CONFIG.audio.hornKeyMinIntervalMs) return;
      lastLocalHornKeyAtMs = tKey;
      const mySlot = localSlotIndexForConn(youConnId);
      const localCartBySlot =
        mySlot >= 0 && allCarts[mySlot] ? allCarts[mySlot] : localCartForConnId();
      if (playerCartHorn.parent !== localCartBySlot.mesh) {
        localCartBySlot.mesh.add(playerCartHorn);
      }
      playBufferHorn(playerCartHorn, localCartBySlot, 1.6);
      return;
    }
    if (handledCodes.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (CONFIG.debug.input && handledCodes.has(e.code)) {
      // eslint-disable-next-line no-console
      console.log("[input] keydown", e.code);
    }
  }
  function onKeyUp(e) {
    // Allow typing in input fields without triggering game controls
    if (e.target.tagName === 'INPUT') return;
    
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      localNitroHeld = false;
    }
    if (handledCodes.has(e.code)) e.preventDefault();
    keys.delete(e.code);
  }
  // Attach to both window and canvas so input works regardless of focus quirks.
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  canvas.addEventListener("keydown", onKeyDown, { passive: false });
  canvas.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", () => keys.clear());

  function getAxis() {
    const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
      (keys.has("KeyS") || keys.has("ArrowDown") ? -1 : 0);
    const turn =
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
      (keys.has("KeyD") || keys.has("ArrowRight") ? -1 : 0);
    return { forward: clamp(forward, -1, 1), turn: clamp(turn, -1, 1) };
  }

  // --- Simulation loop (fixed timestep) ---
  let lastT = performance.now();
  let accumulator = 0;
  let lastDebugMs = 0;
  let simFrameIndex = 0;
  let recordVersusPlayerFrame30Logged = false;
  // * One-shot per page load; full reload (or HMR re-entry into main()) resets for re-measure.
  let playerColliderVisualOvershootSimFrame10Logged = false;
  let dancefloorSurfaceVisualDiagSimFrame10Logged = false;
  let dancefloorSurfaceDeepDiagSimFrame15Logged = false;
  /** @type {ReadonlySet<number>} */
  const NPC_INWARD_DRIFT_LOG_FRAMES = new Set([1, 5, 15, 30]);

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    accumulator += dt;

    simFrameIndex += 1;
    if (simFrameIndex === 60) {
      console.log('[void-debug]', {
        isHost,
        youConnId,
        hostId,
        localSlotIndex: localSlotIndexForConn(youConnId),
        sceneChildren: scene.children.length,
        recordInScene: scene.children.includes(recordMesh),
        rimInScene: scene.children.includes(rimMesh),
        cart0Pos: allCarts[0].body.translation(),
        cart1Pos: allCarts[1].body.translation(),
        cart0InScene: scene.children.includes(allCarts[0].mesh),
        netStateBufferLen: netStateBuffer.length,
        lastCartsCacheKeys: lastCartsCache ? Object.keys(lastCartsCache) : null,
        cameraPos: [camera.position.x, camera.position.y, camera.position.z],
        cameraLookingAt: [cameraState.pos.x, cameraState.pos.y, cameraState.pos.z],
      });
    }

    if (simFrameIndex === 10 && !playerColliderVisualOvershootSimFrame10Logged) {
      playerColliderVisualOvershootSimFrame10Logged = true;
      const hx = CONFIG.cart.size.x / 2;
      const hy = CONFIG.cart.size.y / 2;
      const hz = CONFIG.cart.size.z / 2;
      const colliderFull = { x: 2 * hx, y: 2 * hy, z: 2 * hz };

      const cartVisualRoot = localCartForConnId().mesh;
      const prevPos = cartVisualRoot.position.clone();
      const prevQuat = cartVisualRoot.quaternion.clone();
      cartVisualRoot.position.set(0, 0, 0);
      cartVisualRoot.quaternion.identity();
      cartVisualRoot.updateMatrixWorld(true);
      const visualBox = new THREE.Box3().setFromObject(cartVisualRoot);
      cartVisualRoot.position.copy(prevPos);
      cartVisualRoot.quaternion.copy(prevQuat);
      cartVisualRoot.updateMatrixWorld(true);

      const visualMin = visualBox.min.clone();
      const visualMax = visualBox.max.clone();
      const visualSize = new THREE.Vector3().subVectors(visualMax, visualMin);

      const pct = (colliderLen, visLen) =>
        visLen > 1e-10 ? ((colliderLen - visLen) / visLen) * 100 : null;

      // eslint-disable-next-line no-console
      console.log("[diagnostic] player collider vs visual mesh @ sim frame 10", {
        simFrameIndex,
        colliderCuboidHalfExtents: { hx, hy, hz },
        visualBoundingBoxAtIdentityRotation: {
          min: { x: visualMin.x, y: visualMin.y, z: visualMin.z },
          max: { x: visualMax.x, y: visualMax.y, z: visualMax.z },
          size: { x: visualSize.x, y: visualSize.y, z: visualSize.z },
        },
        comparison: {
          x: {
            colliderFullExtent: colliderFull.x,
            visualSize: visualSize.x,
            overshootPercent: pct(colliderFull.x, visualSize.x),
          },
          y: {
            colliderFullExtent: colliderFull.y,
            visualSize: visualSize.y,
            overshootPercent: pct(colliderFull.y, visualSize.y),
          },
          z: {
            colliderFullExtent: colliderFull.z,
            visualSize: visualSize.z,
            overshootPercent: pct(colliderFull.z, visualSize.z),
          },
        },
      });
    }

    if (simFrameIndex === 10 && !dancefloorSurfaceVisualDiagSimFrame10Logged) {
      dancefloorSurfaceVisualDiagSimFrame10Logged = true;
      const scratchWorldPos = new THREE.Vector3();
      const scratchBox = new THREE.Box3();
      let diagError = null;
      /** @type {unknown[]} */
      const childRows = [];
      try {
        const recordInSceneRoot = scene.children.includes(recordMesh);
        for (let i = 0; i < recordMesh.children.length; i += 1) {
          const ch = recordMesh.children[i];
          if (!(ch instanceof THREE.Mesh)) {
            childRows.push({ index: i, kind: "non-mesh", type: ch.type });
            // eslint-disable-next-line no-continue
            continue;
          }
          ch.updateMatrixWorld(true);
          ch.getWorldPosition(scratchWorldPos);
          scratchBox.setFromObject(ch);
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          const matSummaries = mats.map((m) => ({
            type: m.type,
            visible: m.visible,
            opacity: m.opacity,
            transparent: m.transparent,
          }));
          childRows.push({
            index: i,
            geometryType: ch.geometry?.type,
            inRecordMeshChildren: true,
            worldPosition: {
              x: scratchWorldPos.x,
              y: scratchWorldPos.y,
              z: scratchWorldPos.z,
            },
            worldBoundingBox: {
              min: { x: scratchBox.min.x, y: scratchBox.min.y, z: scratchBox.min.z },
              max: { x: scratchBox.max.x, y: scratchBox.max.y, z: scratchBox.max.z },
              size: {
                x: scratchBox.max.x - scratchBox.min.x,
                y: scratchBox.max.y - scratchBox.min.y,
                z: scratchBox.max.z - scratchBox.min.z,
              },
            },
            materials: matSummaries,
            rotation: { x: ch.rotation.x, y: ch.rotation.y, z: ch.rotation.z },
          });
        }
      } catch (err) {
        diagError = err instanceof Error ? err.message : String(err);
      }

      const ringMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.geometry?.type === "RingGeometry",
      );
      const grooveRingMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.userData.recordSurfacePart === "groove",
      );
      const spokeMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.geometry?.type === "BoxGeometry",
      );
      const labelTextMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.userData.recordSurfacePart === "labelText",
      );
      const lt = CONFIG.record.surface.labelText;
      /** @type {Record<string, unknown>} */
      const labelDiag = {
        labelTextMeshCount: labelTextMeshes.length,
        configText: lt.text,
        configArcRadius: lt.arcRadius,
        meshes: labelTextMeshes.map((lm, idx) => {
          if (!(lm instanceof THREE.Mesh)) return { index: idx };
          lm.updateMatrixWorld(true);
          lm.getWorldPosition(scratchWorldPos);
          scratchBox.setFromObject(lm);
          const pg = lm.geometry;
          const params =
            pg && "parameters" in pg ? /** @type {{ radius?: number }} */ (pg).parameters : {};
          return {
            index: idx,
            circleGeometryRadius: params.radius,
            localPosition: { x: lm.position.x, y: lm.position.y, z: lm.position.z },
            worldPosition: {
              x: scratchWorldPos.x,
              y: scratchWorldPos.y,
              z: scratchWorldPos.z,
            },
            rotation: { x: lm.rotation.x, y: lm.rotation.y, z: lm.rotation.z },
            worldBoundingBox: {
              min: { x: scratchBox.min.x, y: scratchBox.min.y, z: scratchBox.min.z },
              max: { x: scratchBox.max.x, y: scratchBox.max.y, z: scratchBox.max.z },
              size: {
                x: scratchBox.max.x - scratchBox.min.x,
                y: scratchBox.max.y - scratchBox.min.y,
                z: scratchBox.max.z - scratchBox.min.z,
              },
            },
          };
        }),
      };

      // eslint-disable-next-line no-console
      console.log("[diagnostic] dancefloor surface visuals @ sim frame 10", {
        simFrameIndex,
        implementationNote:
          "Hairline groove rings in buildRecordSurfaceGrooves; spindle ring, cyan label disc, and curved canvas label text in buildRecordSurfaceVinylLabel.",
        recordMeshInSceneChildren: scene.children.includes(recordMesh),
        recordMeshChildCount: recordMesh.children.length,
        ringGeometryMeshCount: ringMeshes.length,
        grooveRingMeshCount: grooveRingMeshes.length,
        boxGeometryMeshCount: spokeMeshes.length,
        perChild: childRows,
        labelText: labelDiag,
        scanError: diagError,
      });
    }

    if (simFrameIndex === 15 && !dancefloorSurfaceDeepDiagSimFrame15Logged) {
      dancefloorSurfaceDeepDiagSimFrame15Logged = true;
      const scratchWp = new THREE.Vector3();
      const scratchB = new THREE.Box3();
      const clearCol = new THREE.Color();

      /** @param {number} side */
      const sideString = (side) =>
        side === THREE.FrontSide
          ? "FrontSide"
          : side === THREE.DoubleSide
            ? "DoubleSide"
            : side === THREE.BackSide
              ? "BackSide"
              : String(side);

      /**
       * @param {THREE.Material} m
       */
      const summarizeMaterial = (m) => ({
        colorHex: m.color && typeof m.color.getHex === "function" ? m.color.getHex() : null,
        transparent: m.transparent,
        opacity: m.opacity,
        depthWrite: m.depthWrite,
        depthTest: m.depthTest,
        side: m.side,
        sideString: sideString(m.side),
        visible: m.visible,
      });

      recordMesh.updateMatrixWorld(true);
      recordMesh.getWorldPosition(scratchWp);
      scratchB.setFromObject(recordMesh);
      const recordWorldPos = { x: scratchWp.x, y: scratchWp.y, z: scratchWp.z };
      const recordWorldBbox = {
        min: { x: scratchB.min.x, y: scratchB.min.y, z: scratchB.min.z },
        max: { x: scratchB.max.x, y: scratchB.max.y, z: scratchB.max.z },
        size: {
          x: scratchB.max.x - scratchB.min.x,
          y: scratchB.max.y - scratchB.min.y,
          z: scratchB.max.z - scratchB.min.z,
        },
      };
      const recMatRaw = recordMesh.material;
      const recMat = Array.isArray(recMatRaw) ? recMatRaw[0] : recMatRaw;

      const ringMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.geometry?.type === "RingGeometry",
      );
      const grooveRingMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.userData.recordSurfacePart === "groove",
      );
      const labelTextMeshes = recordMesh.children.filter(
        (c) => c instanceof THREE.Mesh && c.userData.recordSurfacePart === "labelText",
      );

      /** @type {Record<string, unknown> | null} */
      let firstRingReport = null;
      const firstRing = grooveRingMeshes[0] ?? ringMeshes[0];
      if (firstRing instanceof THREE.Mesh) {
        firstRing.updateMatrixWorld(true);
        firstRing.getWorldPosition(scratchWp);
        const g = firstRing.geometry;
        g.computeBoundingBox();
        scratchB.setFromObject(firstRing);
        const m = Array.isArray(firstRing.material) ? firstRing.material[0] : firstRing.material;
        const p = /** @type {{ innerRadius?: number; outerRadius?: number; thetaSegments?: number }} */ (
          g.parameters || {}
        );
        firstRingReport = {
          geometryParameters: {
            innerRadius: p.innerRadius,
            outerRadius: p.outerRadius,
            thetaSegments: p.thetaSegments,
          },
          material: summarizeMaterial(m),
          worldPosition: { x: scratchWp.x, y: scratchWp.y, z: scratchWp.z },
          worldBoundingBox: {
            min: { x: scratchB.min.x, y: scratchB.min.y, z: scratchB.min.z },
            max: { x: scratchB.max.x, y: scratchB.max.y, z: scratchB.max.z },
            size: {
              x: scratchB.max.x - scratchB.min.x,
              y: scratchB.max.y - scratchB.min.y,
              z: scratchB.max.z - scratchB.min.z,
            },
          },
          geometryBoundingBox: g.boundingBox
            ? {
                min: { x: g.boundingBox.min.x, y: g.boundingBox.min.y, z: g.boundingBox.min.z },
                max: { x: g.boundingBox.max.x, y: g.boundingBox.max.y, z: g.boundingBox.max.z },
              }
            : null,
        };
      }

      /** @type {Record<string, unknown> | null} */
      const firstSpokeReport = null;

      /** @type {Record<string, unknown> | null} */
      let firstLabelTextReport = null;
      const firstLabelText = labelTextMeshes[0];
      if (firstLabelText instanceof THREE.Mesh) {
        firstLabelText.updateMatrixWorld(true);
        firstLabelText.getWorldPosition(scratchWp);
        const g = firstLabelText.geometry;
        g.computeBoundingBox();
        scratchB.setFromObject(firstLabelText);
        const m = Array.isArray(firstLabelText.material) ? firstLabelText.material[0] : firstLabelText.material;
        const map = /** @type {THREE.MeshBasicMaterial} */ (m).map;
        const texOk =
          map != null &&
          map.image != null &&
          typeof map.image.width === "number" &&
          map.image.width > 0;
        const lp = /** @type {{ radius?: number }} */ (g.parameters || {});
        firstLabelTextReport = {
          geometryParameters: { radius: lp.radius },
          material: summarizeMaterial(m),
          textureOk: texOk,
          textureImageWidth: map && map.image ? map.image.width : null,
          textureImageHeight: map && map.image ? map.image.height : null,
          worldPosition: { x: scratchWp.x, y: scratchWp.y, z: scratchWp.z },
          worldBoundingBox: {
            min: { x: scratchB.min.x, y: scratchB.min.y, z: scratchB.min.z },
            max: { x: scratchB.max.x, y: scratchB.max.y, z: scratchB.max.z },
            size: {
              x: scratchB.max.x - scratchB.min.x,
              y: scratchB.max.y - scratchB.min.y,
              z: scratchB.max.z - scratchB.min.z,
            },
          },
          geometryBoundingBox: g.boundingBox
            ? {
                min: { x: g.boundingBox.min.x, y: g.boundingBox.min.y, z: g.boundingBox.min.z },
                max: { x: g.boundingBox.max.x, y: g.boundingBox.max.y, z: g.boundingBox.max.z },
              }
            : null,
        };
      }

      renderer.getClearColor(clearCol);
      // eslint-disable-next-line no-console
      console.log("[diagnostic] dancefloor surface deep render @ sim frame 15", {
        simFrameIndex,
        recordMesh: {
          material: summarizeMaterial(recMat),
          worldPosition: recordWorldPos,
          worldBoundingBox: recordWorldBbox,
        },
        firstRingMesh: firstRingReport,
        firstSpokeMesh: firstSpokeReport,
        firstLabelTextMesh: firstLabelTextReport,
        renderer: {
          sortObjects: renderer.sortObjects,
          clearColorHex: clearCol.getHex(),
          clearAlpha: renderer.getClearAlpha(),
        },
      });
    }

    if (simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
      const playerT = localCartForConnId().body.translation();
      const ringR = CONFIG.cart.spawnRingRadius;
      const spawnSlotAxisTol = 0.01;
      const cartRows = allCarts.map((cart) => {
        const t = cart.body.translation();
        const s = cart.spawn;
        const expectedSpawn = spawnOnRingForSlot(cart.slotIndex);
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
      console.log("[diagnostic] spawn layout @ sim frame 30", {
        layoutConstants: {
          spawnRingRadius: ringR,
          spawnHeight: CONFIG.cart.spawnHeight,
          npcCount: netSlots.filter((s) => s && s.kind === "npc").length,
        },
        verification: {
          spawnRecordsMatchSlotPositionsWithin001: spawnRecordsMatchSlotPositions,
          spawnSlotAxisTolerance: spawnSlotAxisTol,
          allPlanarOriginDistancesWithinToleranceOfRing: planarOk,
          planarRingTolerance,
          expectedAdjacentChord: expectedAdjacent,
          expectedOppositeChord: expectedOpposite,
          chordTolerance,
          fromPlayerChordChecks: playerDistChecks,
        },
        carts: cartRows,
      });
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
        const angle = nowSec * 0.3 + entry.index * Math.PI * 0.5;
        entry.target.position.x = Math.cos(angle) * crowdSearchlightTargetRadius;
        entry.target.position.y = -3;
        entry.target.position.z = Math.sin(angle) * crowdSearchlightTargetRadius;
        entry.target.updateMatrixWorld();
        entry.cone.lookAt(entry.target.position);
        entry.cone.rotateX(-Math.PI / 2);
      }
    }

    if (crowdPointLightEntries.length > 0) {
      const nowSec = now * 0.001;
      for (const entry of crowdPointLightEntries) {
        entry.light.intensity = 6 + Math.sin(nowSec * 1.5 + entry.index * 0.8) * 3;
      }
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
        const bounce = Math.abs(Math.sin(nowSec * 3 + i * 0.7)) * 0.3;
        _dm.position.y = -2.5 + bounce;
        _dm.updateMatrix();
        crowdCarts.setMatrixAt(i, _dm.matrix);
      }
      crowdCarts.instanceMatrix.needsUpdate = true;
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

    // LED screen text pulse
    {
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

    // Portal swirl animation
    {
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
    }

    const playerAxis = getAxis();
    if (simFrameIndex === 1 || simFrameIndex === 30) {
      // eslint-disable-next-line no-console
      console.log("[boot] sim tick", {
        simFrameIndex,
        axis: playerAxis,
        localSlotIndex: localSlotIndexForConn(youConnId),
        youConnId,
      });
    }

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
        window.location.href = 'https://vibej.am/portal/2026';
      }
    }

    if (isHost && roundPhase === "running") {
      // Fall detection / respawn (host-authoritative).
      for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
        const slot = netSlots[slotIndex];
        const c = allCarts[slotIndex];
        if (!slot) continue;
        const p = c.body.translation();
        if (p.y < CONFIG.fall.yThreshold) {
          // Stage A scoring: credit last hit if recent.
          // Only score once per fall event.
          if (c.respawnAtMs === null) {
            const hit = lastHitBy.get(slotIndex) || null;
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
                const s = Number(roundScores[i] || 0);
                if (s > leaderScore) {
                  leaderScore = s;
                  leaderSlotIndex = i;
                }
              }
              if (slotIndex === leaderSlotIndex) points += 1; // target bonus

              if (roundScores[hit.attackerSlotIndex] == null) {
                roundScores[hit.attackerSlotIndex] = 0;
              }
              roundScores[hit.attackerSlotIndex] += points;
              // eslint-disable-next-line no-console
              console.log("[score] hit credited", {
                attacker: hit.attackerSlotIndex,
                victim: slotIndex,
                points,
                roundScores,
              });
              sendHostRound(); // broadcast score update to non-host clients
            }
            lastHitBy.delete(slotIndex);
          }

          scheduleRespawn(c, now);
          let aliveHumanCount = 0;
          let lastStandingSlotIndex = -1;
          for (let j = 0; j < 4; j += 1) {
            const sj = netSlots[j];
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
            roundStartedAtMs > 0 &&
            Date.now() - roundStartedAtMs >= 30000 &&
            (roundScores[lastStandingSlotIndex] || 0) >= 1
          ) {
            lastCartStandingWinnerSlotIndex = lastStandingSlotIndex;
            lastCartStandingTimeoutId = setTimeout(() => {
              lastCartStandingTimeoutId = null;
              if (isHost && roundPhase === "running") endRound();
            }, 3000);
          }
          // If the override is already armed and the survivor has now also fallen,
          // cancel — let normal score-based / DRAW logic crown the winner.
          if (
            lastCartStandingTimeoutId != null &&
            aliveHumanCount === 0
          ) {
            clearTimeout(lastCartStandingTimeoutId);
            lastCartStandingTimeoutId = null;
            lastCartStandingWinnerSlotIndex = null;
            console.log("[round] last-cart-standing canceled — survivor fell");
          }
        }
        if (c.respawnAtMs !== null && now >= c.respawnAtMs) {
          doRespawn(c);
        }
        if (slot.kind === "npc") maybeTriggerNpcOpportunisticRamBoost(now, c);
      }
      tickRamBoostStreakSpawners(now, dt);
    }

    // Round phase transitions (host only)
    if (isHost) {
      // running → end when timer expires
      if (
        roundPhase === "running" &&
        roundStartedAtMs > 0 &&
        Date.now() - roundStartedAtMs >= 60000 &&
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

    // Debug: print velocity while input is held (throttled).
    if (
      CONFIG.debug.velocity &&
      (playerAxis.forward !== 0 || playerAxis.turn !== 0) &&
      now - lastDebugMs >= 100
    ) {
      const lv = localCart.body.linvel();
      const sleeping =
        typeof localCart.body.isSleeping === "function"
          ? localCart.body.isSleeping()
          : "unknown";
      // eslint-disable-next-line no-console
      console.log(
        "[debug] linvel",
        { x: lv.x.toFixed(3), y: lv.y.toFixed(3), z: lv.z.toFixed(3) },
        "sleeping=",
        sleeping,
      );
      lastDebugMs = now;
    }

    // Fixed substeps for stability/consistency (host only).
    let substeps = 0;
    /** @type {Map<object, { forward: number; turn: number }>} */
    const npcDiagLastAiByCart = new Map();

    if (isHost) {
      if (roundPhase === "running") {
        while (accumulator >= CONFIG.fixedTimeStep && substeps < CONFIG.maxSubsteps) {
          applyArcadeControls(localCart, playerAxis, CONFIG.fixedTimeStep, now);

          // Apply remote human inputs on host.
          for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
            const slot = netSlots[slotIndex];
            const c = allCarts[slotIndex];
            if (!slot || !c) continue;
            if (slot.kind !== "human") continue;
            if (!slot.connId) continue;
            if (slot.connId === youConnId) continue;

            const ri = remoteInputsByConnId.get(slot.connId) || {
              throttle: 0,
              steer: 0,
              nitro: false,
            };
            applyArcadeControls(
              c,
              { forward: clamp(ri.throttle, -1, 1), turn: clamp(ri.steer, -1, 1) },
              CONFIG.fixedTimeStep,
              now,
            );
          }

          // NPC AI on host.
          for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
            const slot = netSlots[slotIndex];
            const c = allCarts[slotIndex];
            if (!slot || slot.kind !== "npc") continue;
            const aiAxis = getAiAxis(now, c);
            npcDiagLastAiByCart.set(c, aiAxis);
            applyArcadeControls(c, aiAxis, CONFIG.fixedTimeStep, now);
          }

          // Apply any pending ramming impulses over multiple physics steps.
          for (const cart of allCarts) {
            if (!cart.pendingRam) continue;
            const { impulse, remainingSteps } = cart.pendingRam;
            const denom = Math.max(1, remainingSteps);
            cart.body.applyImpulse(
              { x: impulse.x / denom, y: impulse.y / denom, z: impulse.z / denom },
              true,
            );
            cart.pendingRam.remainingSteps -= 1;
            if (cart.pendingRam.remainingSteps <= 0) cart.pendingRam = null;
          }

          world.step(eventQueue);
          eventQueue.drainCollisionEvents((h1, h2, started) => {
            if (!started) return;
            const c1 = colliderHandleToCart.get(h1);
            const c2 = colliderHandleToCart.get(h2);
            if (!c1 || !c2 || c1 === c2) return;
            applyRammingImpulse(c1, c2);
            applyRammingImpulse(c2, c1);
          });
          accumulator -= CONFIG.fixedTimeStep;
          substeps += 1;
        }
      } else {
        accumulator = 0;
      }
    } else {
      // Non-host: do not step physics. Apply transforms from buffer ~100ms behind.
      const targetServerNowMs = Date.now() - CONFIG.net.interpBufferMs;
      let chosen = null;
      for (let i = netStateBuffer.length - 1; i >= 0; i -= 1) {
        const e = netStateBuffer[i];
        if (e.serverNowMs <= targetServerNowMs) {
          chosen = e;
          break;
        }
      }
      if (!chosen && netStateBuffer.length > 0) {
        chosen = netStateBuffer[0];
      }
      if (chosen) {
        applyCartsSnapshotToBodies(chosen.carts);
      } else if (lastCartsCache) {
        applyCartsSnapshotToBodies(lastCartsCache);
      }
    }

    updateRamBoostStreaks(now);

    if (NPC_INWARD_DRIFT_LOG_FRAMES.has(simFrameIndex)) {
      for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
        const slot = netSlots[slotIndex];
        const c = allCarts[slotIndex];
        if (!slot || slot.kind !== "npc") continue;
        const t = c.body.translation();
        const lv = c.body.linvel();
        const av = c.body.angvel();
        const s = c.spawn;
        const aiAxis = npcDiagLastAiByCart.get(c) ?? { forward: 0, turn: 0 };
        // eslint-disable-next-line no-console
        console.log("[diagnostic] npc inward drift on spawn", {
          simFrameIndex,
          label: c.label,
          slotIndex: c.slotIndex,
          linvel: { x: lv.x, y: lv.y, z: lv.z },
          angvel: { x: av.x, y: av.y, z: av.z },
          positionDeltaFromSpawnAtCreation: {
            x: t.x - s.x,
            y: t.y - s.y,
            z: t.z - s.z,
          },
          distanceToWorldOriginXZ: Math.hypot(t.x, t.z),
          aiAxisAppliedLastSubstep: aiAxis,
          aiTarget: c.aiTarget ? { x: c.aiTarget.x, z: c.aiTarget.z } : null,
        });
      }
    }

    // Sync render meshes from physics.
    for (const c of allCarts) {
      const p = c.body.translation();
      const r = c.body.rotation();
      c.mesh.position.set(p.x, p.y, p.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      c.mesh.updateMatrixWorld(true);
      const lv = c.body.linvel();
      cartLinvelScratch.set(lv.x, lv.y, lv.z);
      updateCartVisuals(c.mesh, cartLinvelScratch, dt, now);
    }

    updateHud();
    positionNameLabels();
    updateAmbientParticles(dt, now);
    composer.render();
    labelRenderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", updateViewport);

  requestAnimationFrame(step);
}

bootstrapNetcodeEntryFromUrl();

main();

// TEMP DEBUG — remove before jam submission (session 9 multiplayer debug)
window.__debug = () => {
  try {
    return {
      youConnId,
      localSlotIndex: localSlotIndexForConn(youConnId),
      isHost,
      hostId,
      partyHost: partySocket?.host,
      readyState: partySocket?.readyState,
      __msgCounts
    };
  } catch (e) {
    return { error: String(e) };
  }
};

// TEMP DEBUG — phone-to-server log bridge
window.__log = (label, payload) => {
  if (!partySocket || partySocket.readyState !== 1) {
    console.warn("partySocket not ready");
    return;
  }
  partySocket.send(JSON.stringify({
    type: "debug_log",
    label: String(label ?? ""),
    payload: payload ?? null
  }));
};
