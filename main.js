import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
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

function renderColorPicker(availableColors) {
  // Create or get color picker container
  let container = document.getElementById('color-picker-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'color-picker-container';
    container.className = 'color-picker-container';
  }
  
  // Ensure container is in the right place (menu if it exists)
  const menu = document.getElementById('menu');
  if (menu) {
    // Menu exists - make sure container is in menu
    if (!menu.contains(container)) {
      // Container exists but not in menu - move it
      const usernameInput = menu.querySelector('input[type="text"]');
      if (usernameInput && usernameInput.parentNode) {
        usernameInput.parentNode.insertBefore(container, usernameInput);
      } else {
        // Fallback: append to menu
        menu.appendChild(container);
      }
      // Make sure it's visible
      container.style.display = '';
    }
  } else if (container.parentNode !== document.body) {
    // Menu doesn't exist yet and container is not on body - append to body temporarily
    container.style.display = 'none';
    document.body.appendChild(container);
  }
  
  // Clear existing dots
  container.innerHTML = '';
  
  // Get saved color from localStorage
  const savedColor = localStorage.getItem('cartRaveColor');
  
  // Create color dots
  PALETTE.forEach(colorId => {
    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.dataset.colorId = colorId;
    dot.style.backgroundColor = cssHexFromRgbNumber(CART_COLORS[colorId]?.hex) || colorId;
    
    // Check if color is available
    const isAvailable = availableColors.includes(colorId);
    if (!isAvailable) {
      dot.style.opacity = '0.3';
      dot.style.pointerEvents = 'none';
    }
    
    // Highlight saved color
    if (colorId === savedColor) {
      dot.style.border = '2px solid white';
      dot.classList.add('selected');
    }
    
    // Add click handler
    dot.addEventListener('click', () => {
      if (isAvailable) {
        // Save to localStorage
        localStorage.setItem('cartRaveColor', colorId);
        
        // Update visual selection
        document.querySelectorAll('.color-dot').forEach(d => {
          d.style.border = 'none';
          d.classList.remove('selected');
        });
        dot.style.border = '2px solid white';
        dot.classList.add('selected');
        
        // Send to server if socket exists and is open
        if (partySocket && partySocket.readyState === WebSocket.OPEN) {
          partySocket.send(JSON.stringify({
            type: MSG.colorPick,
            color: colorId
          }));
        }
      }
    });
    
    container.appendChild(dot);
  });
}

const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,
  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
  },
  net: {
    // * Non-host renders 150ms behind latest packet for smoothness.
    interpBufferMs: 150,
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
    innerRadius: 3.3,
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
        count: 24,
        lineWidth: 0.04,
        color: 0x444444,
        yOffset: 0.3,
        innerRadius: 7.0,
        outerRadius: 25.9,
      },
      labelDisc: {
        enabled: true,
        innerRadius: 3.7,
        outerRadius: 6.5,
        color: 0x2bd6ff,
        yOffset: 0.3,
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
        arcRadius: 5.3,
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
    restitution: 0.0,
    linearDamping: 2.5,
    angularDamping: 2.0,

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
    maxImpulse: 120.0,
  },

  fall: {
    yThreshold: -6,
    respawnDelayMs: 600,
  },

  camera: {
    fov: 55,
    minFov: 50,
    maxFov: 75,
    followBack: 7.6,
    followUp: 3.54,
    lookAhead: 5.0,
    lookUp: 1.2,
    positionDamping: 10.0,
    rotationDamping: 12.0,
    snapDistance: 40.0,
  },

  audio: {
    hornVolume: 0.45,
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

CONFIG.cart.spawnRingRadius = CONFIG.record.radius * 0.7;

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

/** @type {{ slotId: number; kind: "human"|"npc"; connId: string|null; name: string; color: string }[]} */
let netSlots = [
  { slotId: 0, kind: "npc", connId: null, name: "CartGPT", color: "pink" },
  { slotId: 1, kind: "npc", connId: null, name: "RollBot", color: "blue" },
  { slotId: 2, kind: "npc", connId: null, name: "WheelE", color: "green" },
  { slotId: 3, kind: "npc", connId: null, name: "PushPop", color: "yellow" },
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
/** @type {boolean} */
let menuVisible = true; // Step 10b: menu visibility flag
/** @type {number} */
let masterGain = 1.0; // Step 10d: Volume control (0.0 to 1.0)
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
      child.material.color.setHex(finalHex);
      if (child.material.emissive) {
        child.material.emissive.setHex(finalHex);
        child.material.emissiveIntensity = 1;
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
  if (netStateBuffer.length > maxEntries) {
    netStateBuffer = netStateBuffer.slice(netStateBuffer.length - maxEntries);
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

function initNetcode() {
  if (typeof window === "undefined") return;
  if (partySocket) {
    partySocket.close();
    partySocket = null;
  }

  const resolvedRoom = resolvedPartyRoomFromUrl();
  partySocket = new PartySocket({
    host: partyHostFromWindowLocation(),
    party: "main",
    room: resolvedRoom,
  });

  partySocket.addEventListener("open", () => {
    // eslint-disable-next-line no-console
    console.log("[net] socket open, room=" + resolvedRoom + ", sending join");
    partySocket?.send(JSON.stringify({ type: MSG.join }));
    __msgCounts.out[MSG.join] = (__msgCounts.out[MSG.join] || 0) + 1;
    
    // Send saved color if available
    const savedColor = localStorage.getItem('cartRaveColor');
    if (savedColor && PALETTE.includes(savedColor)) {
      partySocket?.send(JSON.stringify({
        type: MSG.colorPick,
        color: savedColor
      }));
      __msgCounts.out[MSG.colorPick] = (__msgCounts.out[MSG.colorPick] || 0) + 1;
    }
    
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
      markFirstHelloReceived();

      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
        applyCartsSnapshotToBodies(msg.carts);
      }

      setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));
      // eslint-disable-next-line no-console
      console.log("[net] hello processed, youConnId=" + youConnId);
      
      // Only count other human players as taking a color; NPCs don't block the picker
      if (Array.isArray(msg.slots)) {
        const takenColors = msg.slots
          .filter((s) => s && s.kind === "human" && s.connId !== youConnId)
          .map((s) => s.color);
        const availableColors = PALETTE.filter((c) => !takenColors.includes(c));
        renderColorPicker(availableColors);
      }
      
      // Update 3D cart materials with initial colors
      updateCartMaterialsFromSlots(msg.slots);
      
      // Update HUD colors with initial colors
      updateHudColorsFromSlots(msg.slots);
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
        if (typeof newPhase === "string" && prevPhase !== "podium" && newPhase === "podium") {
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

function buildRecordRingGeometry({ outerRadius, innerRadius, thickness, curveSegments }) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
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
  renderer.setClearColor(CONFIG.backgroundColor, 1);

  const scene = new THREE.Scene();

  function initHud() {
    const existing = document.getElementById("hud");
    if (existing) existing.remove();
    const existingStyle = document.getElementById("hud-style");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = "hud-style";
    style.textContent = `
      #hud {
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
        font-size: 2.4rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        padding: 10px 14px;
        border-radius: 14px;
        background: rgba(7, 0, 16, 0.35);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
        display: none;
        white-space: nowrap;
      }

      #hud .hud-timer {
        position: absolute;
        top: 18px;
        right: 18px;
        font-size: 1.8rem;
        font-weight: 800;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(7, 0, 16, 0.35);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
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
        width: 88px;
        padding: 10px 10px 9px;
        border-radius: 14px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.35);
        color: #ffffff;
        line-height: 1.05;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px solid rgba(255,255,255,0.0);
      }

      #hud .hud-scoreLabel {
        font-size: 1.05rem;
        font-weight: 800;
        opacity: 0.95;
      }

      #hud .hud-scoreValue {
        font-size: 1.35rem;
        font-weight: 800;
        margin-top: 4px;
      }

      #hud .hud-scoreBox.isLocal {
        border-color: rgba(255,255,255,1);
        box-shadow: 0 12px 28px rgba(0,0,0,0.35), 0 0 12px rgba(255,255,255,0.6);
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

    /** @type {{ root: HTMLDivElement; box: HTMLDivElement; label: HTMLDivElement; value: HTMLDivElement }[]} */
    const scoreBoxes = [];
    for (let i = 0; i < 4; i += 1) {
      const box = document.createElement("div");
      box.className = "hud-scoreBox";
      // Initial color class will be set when slots are received
      
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
    document.body.appendChild(root);

    return { root, status, timer, scores, scoreBoxes, readyBtn };
  }

  function initResultsOverlay() {
    const existing = document.getElementById("results-overlay");
    if (existing) existing.remove();
    const existingStyle = document.getElementById("results-overlay-style");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = "results-overlay-style";
    style.textContent = `
      #results-overlay {
        position: fixed;
        inset: 0;
        z-index: 25000;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        color: #ffffff;
        text-shadow: 0 2px 12px rgba(0,0,0,0.85);
        background: rgba(7, 0, 16, 0.55);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      #results-overlay .results-panel {
        pointer-events: auto;
        min-width: min(420px, 92vw);
        max-width: 520px;
        padding: 22px 24px 20px;
        border-radius: 18px;
        background: rgba(12, 4, 28, 0.92);
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.12);
      }

      #results-overlay .results-title {
        font-size: 1.65rem;
        font-weight: 900;
        letter-spacing: 0.04em;
        margin: 0 0 14px;
        min-height: 1.3em;
      }

      #results-overlay .results-final {
        min-height: 3.5rem;
        margin-bottom: 12px;
        font-size: 1rem;
        line-height: 1.45;
        opacity: 0.95;
      }

      #results-overlay .results-history {
        min-height: 72px;
        max-height: 160px;
        overflow: auto;
        margin-bottom: 16px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.25);
        font-size: 0.9rem;
        line-height: 1.4;
      }

      #results-overlay .results-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
      }

      #results-overlay .results-actions button,
      #results-overlay .results-actions a {
        font: inherit;
        font-weight: 800;
        font-size: 0.95rem;
        padding: 10px 16px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.2);
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
        text-align: center;
      }

      #results-overlay .results-playAgain {
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
      }

      #results-overlay .results-playAgain:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      #results-overlay .results-exitPortal {
        background: #ffffff;
        color: #070010;
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
    playAgain.className = "results-playAgain";
    playAgain.textContent = "Play Again";
    playAgain.disabled = false;

    const exitPortal = document.createElement("a");
    exitPortal.className = "results-exitPortal";
    exitPortal.href = "https://vibej.am/portal/2026";
    exitPortal.target = "_blank";
    exitPortal.rel = "noopener noreferrer";
    exitPortal.textContent = "Vibe Jam portal";

    const mainMenuBtn = document.createElement("button");
    mainMenuBtn.type = "button";
    mainMenuBtn.className = "results-playAgain";
    mainMenuBtn.textContent = "Main Menu";
    mainMenuBtn.addEventListener("click", () => {
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
    statsLine.style.cssText = `
      color: #aaa;
      font-size: 0.8rem;
      text-align: center;
      margin-top: 0.5rem;
      letter-spacing: 0.05em;
    `;

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
    // Create menu container
    const menu = document.createElement("div");
    menu.id = "menu";
    
    // Create animated SVG background
    const svgBg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgBg.id = "menu-bg";
    svgBg.setAttribute("viewBox", "0 0 100 100");
    svgBg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    
    // Add animated circles to SVG
    const circles = [];
    for (let i = 0; i < 8; i++) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const radius = 2 + Math.random() * 4;
      const cx = 10 + Math.random() * 80;
      const cy = 10 + Math.random() * 80;
      const color = i % 4 === 0 ? "#ff2bd6" : i % 4 === 1 ? "#2bd6ff" : i % 4 === 2 ? "#8dff2b" : "#ffee00";
      
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", radius);
      circle.setAttribute("fill", color);
      circle.setAttribute("opacity", "0.3");
      
      // Add animation
      const animate = document.createElementNS("http://www.w3.org/2000/svg", "animate");
      animate.setAttribute("attributeName", "r");
      animate.setAttribute("values", `${radius};${radius * 1.5};${radius}`);
      animate.setAttribute("dur", `${3 + Math.random() * 4}s`);
      animate.setAttribute("repeatCount", "indefinite");
      circle.appendChild(animate);
      
      svgBg.appendChild(circle);
      circles.push(circle);
    }
    
    menu.appendChild(svgBg);
    
    // Create title
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "CART RAVE";
    menu.appendChild(title);
    
    const subtitle = document.createElement("div");
    subtitle.className = "menu-subtitle";
    subtitle.textContent = "SHOPPING CART ARENA";
    menu.appendChild(subtitle);
    
    // Color picker container - reuse existing if already created by renderColorPicker
    let colorPickerContainer = document.getElementById("color-picker-container");
    if (!colorPickerContainer) {
      colorPickerContainer = document.createElement("div");
      colorPickerContainer.id = "color-picker-container";
      colorPickerContainer.className = "color-picker-container";
    }
    // Make sure it's in the menu (renderColorPicker might have put it on body)
    if (!menu.contains(colorPickerContainer)) {
      menu.appendChild(colorPickerContainer);
    }
    
    // Step 10c: Username field
    const usernameInput = document.createElement("input");
    usernameInput.type = "text";
    usernameInput.placeholder = "ENTER USERNAME";
    usernameInput.style.cssText = `
      background: transparent;
      border: 2px solid #8dff2b;
      color: white;
      text-align: center;
      text-transform: uppercase;
      font-family: system-ui, sans-serif;
      padding: 1rem;
      margin-bottom: 1rem;
      width: 300px;
      outline: none;
      font-size: 1rem;
      letter-spacing: 0.1em;
    `;
    
    // Load saved username from localStorage
    const savedName = localStorage.getItem('cartRaveUsername');
    if (savedName) {
      usernameInput.value = savedName;
    }
    
    // Save username to localStorage on input
    usernameInput.addEventListener('input', () => {
      localStorage.setItem('cartRaveUsername', usernameInput.value.trim());
    });
    
    menu.appendChild(usernameInput);
    
    // Create button container
    const buttons = document.createElement("div");
    buttons.className = "menu-buttons";
    
    // Solo button
    const soloBtn = document.createElement("button");
    soloBtn.className = "menu-button menu-button-solo";
    soloBtn.textContent = "Solo";
    soloBtn.addEventListener("click", () => {
      console.log("Clicked Solo");
      const roomId = `solo-${Math.random().toString(36).substring(2, 8)}`;
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      history.pushState({}, '', url);
      hideMenu();
      initNetcode();
    });
    buttons.appendChild(soloBtn);
    
    // Quickplay button
    const quickplayBtn = document.createElement("button");
    quickplayBtn.className = "menu-button menu-button-quickplay";
    quickplayBtn.textContent = "Quickplay";
    quickplayBtn.addEventListener("click", () => {
      console.log("Clicked Quickplay");
      const url = new URL(window.location.href);
      url.searchParams.set('room', 'quickplay');
      history.pushState({}, '', url);
      hideMenu();
      initNetcode();
    });
    buttons.appendChild(quickplayBtn);
    
    // Friends button
    const friendsBtn = document.createElement("button");
    friendsBtn.className = "menu-button menu-button-friends";
    friendsBtn.textContent = "Friends";
    friendsBtn.addEventListener("click", async () => {
      console.log("Clicked Friends");
      const roomId = `party-${Math.random().toString(36).substring(2, 8)}`;
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      history.pushState({}, '', url);
      
      // Copy link to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // Show temporary "LINK COPIED" feedback
        const originalText = friendsBtn.textContent;
        friendsBtn.textContent = "LINK COPIED!";
        friendsBtn.style.color = "#8dff2b";
        friendsBtn.style.borderColor = "#8dff2b";
        
        setTimeout(() => {
          friendsBtn.textContent = originalText;
          friendsBtn.style.color = "";
          friendsBtn.style.borderColor = "";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
      
      hideMenu();
      initNetcode();
    });
    buttons.appendChild(friendsBtn);
    
    // Vibe Jam button
    const vibejamBtn = document.createElement("button");
    vibejamBtn.className = "menu-button menu-button-vibejam";
    vibejamBtn.textContent = "Vibe Jam 2026";
    vibejamBtn.addEventListener("click", () => {
      window.open("https://vibej.am/2026", "_blank");
    });
    buttons.appendChild(vibejamBtn);
    
    menu.appendChild(buttons);
    
    // Step 10d: Volume and Mute Controls
    const settingsContainer = document.createElement("div");
    settingsContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 2rem;
      margin-bottom: 1rem;
      position: relative;
      z-index: 1;
    `;
    
    // Volume slider
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "100";
    volumeSlider.style.cssText = `
      width: 150px;
      background: transparent;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      border-radius: 2px;
      background: #444;
      outline: none;
    `;
    
    // Custom slider thumb
    volumeSlider.style.setProperty('--thumb-size', '16px');
    volumeSlider.style.setProperty('--track-color', '#444');
    volumeSlider.style.setProperty('--thumb-color', '#2bd6ff');
    
    // Load saved volume from localStorage (default 50)
    const savedVolume = localStorage.getItem('cartRaveVolume');
    const initialVolume = savedVolume ? parseInt(savedVolume, 10) : 50;
    volumeSlider.value = initialVolume;
    masterGain = initialVolume / 100;
    
    // Volume slider event listener
    volumeSlider.addEventListener('input', () => {
      const volume = parseInt(volumeSlider.value, 10);
      masterGain = volume / 100;
      localStorage.setItem('cartRaveVolume', volume.toString());
      
      // Update mute state if volume is 0
      if (volume === 0 && !isMuted) {
        isMuted = true;
        localStorage.setItem('cartRaveMuted', 'true');
        muteBtn.textContent = 'UNMUTE';
      } else if (volume > 0 && isMuted) {
        isMuted = false;
        localStorage.removeItem('cartRaveMuted');
        muteBtn.textContent = 'MUTE';
      }
      
      // Apply volume to audio engine
      applyAudioVolume();
    });
    
    // Prevent game key events on slider
    volumeSlider.addEventListener('keydown', (e) => e.stopPropagation());
    volumeSlider.addEventListener('keyup', (e) => e.stopPropagation());
    
    settingsContainer.appendChild(volumeSlider);
    
    // Mute button
    const muteBtn = document.createElement("button");
    muteBtn.style.cssText = `
      background: transparent;
      border: 1px solid #2bd6ff;
      color: #2bd6ff;
      font-family: system-ui, sans-serif;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      outline: none;
    `;
    
    // Load saved mute state from localStorage (default false)
    const savedMuted = localStorage.getItem('cartRaveMuted');
    isMuted = savedMuted === 'true';
    muteBtn.textContent = isMuted ? 'UNMUTE' : 'MUTE';
    
    // Mute button event listener
    muteBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      
      if (isMuted) {
        localStorage.setItem('cartRaveMuted', 'true');
        muteBtn.textContent = 'UNMUTE';
        // Store current volume before muting
        const currentVolume = parseInt(volumeSlider.value, 10);
        if (currentVolume > 0) {
          localStorage.setItem('cartRaveVolumeBeforeMute', currentVolume.toString());
        }
        volumeSlider.value = 0;
        masterGain = 0;
      } else {
        localStorage.removeItem('cartRaveMuted');
        muteBtn.textContent = 'MUTE';
        // Restore previous volume
        const savedVolumeBeforeMute = localStorage.getItem('cartRaveVolumeBeforeMute');
        const restoreVolume = savedVolumeBeforeMute ? parseInt(savedVolumeBeforeMute, 10) : 50;
        volumeSlider.value = restoreVolume;
        masterGain = restoreVolume / 100;
        localStorage.setItem('cartRaveVolume', restoreVolume.toString());
      }
      
      // Apply volume to audio engine
      applyAudioVolume();
    });
    
    // Prevent game key events on mute button
    muteBtn.addEventListener('keydown', (e) => e.stopPropagation());
    muteBtn.addEventListener('keyup', (e) => e.stopPropagation());
    
    settingsContainer.appendChild(muteBtn);
    menu.appendChild(settingsContainer);
    
    // Personal stats display
    const statsDisplay = document.createElement("div");
    statsDisplay.id = "menu-stats";
    statsDisplay.style.cssText = `
      color: #aaa;
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
      text-align: center;
      margin-top: 1.5rem;
      position: relative;
      z-index: 1;
      letter-spacing: 0.05em;
    `;
    const ps = getPersonalStats();
    statsDisplay.textContent = `${ps.wins}W / ${ps.matches} played / ${ps.totalPoints} pts`;
    menu.appendChild(statsDisplay);

    // Footer
    const footer = document.createElement("div");
    footer.className = "menu-footer";
    footer.textContent = "4-PLAYER PHYSICS · PARTYKIT · THREE.JS · RAPIER3D";
    menu.appendChild(footer);
    
    document.body.appendChild(menu);
    refreshMenuStats();
    
    // Render color picker immediately with full palette
    renderColorPicker(PALETTE);
  }

  // Step 10b: Hide menu function
  function hideMenu() {
    const menu = document.getElementById("menu");
    if (menu) {
      menu.style.opacity = "0";
      menu.style.pointerEvents = "none";
      setTimeout(() => {
        if (menu.parentNode) {
          menu.parentNode.removeChild(menu);
        }
      }, 300);
    }
    menuVisible = false;
  }

  function refreshMenuStats() {
    const el = document.getElementById("menu-stats");
    if (!el) return;
    const ps = getPersonalStats();
    el.textContent = `${ps.wins}W / ${ps.matches} played / ${ps.totalPoints} pts`;
  }


  hud = initHud();
  const resultsUi = initResultsOverlay();
  initMenu(); // Step 10b: Add menu initialization

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
      if (roundPhase === "lobby" && !menuVisible) {
        const localSlot = netSlots.find((s) => s && s.connId === youConnId);
        const isLocalReady = localSlot ? Boolean(localSlot.isReady) : false;
        hud.readyBtn.style.display = "block";
        hud.readyBtn.textContent = isLocalReady ? "READY!" : "CLICK TO READY";
        hud.readyBtn.classList.toggle("is-ready", isLocalReady);
      } else {
        hud.readyBtn.style.display = "none";
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

      if (roundWinnerSlotIndex === "draw") {
        title.textContent = "DRAW";
        title.style.color = "#ffffff";
      } else {
        const idx = Number.isFinite(roundWinnerSlotIndex) ? roundWinnerSlotIndex : null;
        if (idx != null) {
          const score = roundScores && roundScores[idx] != null ? roundScores[idx] : 0;
          title.textContent = `P${idx + 1} wins — ${score} pts`;
          title.style.color = getColorForSlot(netSlots[idx]);
        } else {
          title.textContent = "Round complete";
          title.style.color = "#ffffff";
        }
      }

      const scoreLines = [];
      for (let i = 0; i < 4; i += 1) {
        const s = roundScores && roundScores[i] != null ? roundScores[i] : 0;
        scoreLines.push(`P${i + 1}: ${s} pts`);
      }
      finalScores.textContent = scoreLines.join("\n");

      history.replaceChildren();
      if (matchHistory.length === 0) {
        const emptyRow = document.createElement("div");
        emptyRow.textContent = "No prior matches this session.";
        history.appendChild(emptyRow);
      } else {
        for (let i = matchHistory.length - 1; i >= 0; i -= 1) {
          const m = matchHistory[i];
          const row = document.createElement("div");
          row.style.marginBottom = "6px";
          const parts = [0, 1, 2, 3].map((j) => m.scores[j] ?? 0).join(", ");
          row.textContent =
            m.winnerSlotIndex === "draw"
              ? `DRAW — ${parts} (t=${new Date(m.endedAtMs).toLocaleTimeString()})`
              : `P${m.winnerSlotIndex + 1} won — ${parts} (t=${new Date(m.endedAtMs).toLocaleTimeString()})`;
          history.appendChild(row);
        }
      }

      try {
        const ref = encodeURIComponent(`${window.location.origin}${window.location.pathname}`);
        exitPortal.href = `https://vibej.am/portal/2026?ref=${ref}`;
      } catch {
        exitPortal.href = "https://vibej.am/portal/2026";
      }

      // Update personal stats display
      if (statsLine) {
        const ps = getPersonalStats();
        statsLine.textContent = `${ps.wins}W / ${ps.matches} played / ${ps.totalPoints} pts`;
      }
    } else {
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
  }

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);

  const audioListener = new THREE.AudioListener();
  camera.add(audioListener);

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
    camera.aspect = w / h;
    updateCameraFraming();
    camera.updateProjectionMatrix();
  }

  updateViewport();

  // Minimal ambient + a few colored spotlights for "neon" vibe.
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;

  function addSpotlightWithCone({ color, position, intensity, target }) {
    const light = new THREE.SpotLight(color, intensity, 60, Math.PI / 5.4, 0.75, 1.1);
    light.position.copy(position);
    light.target.position.set(target.x, platformTopY, target.z);
    scene.add(light);
    scene.add(light.target);

    // Fake a visible light cone without fog (simple transparent cone mesh).
    const coneTarget = new THREE.Vector3(target.x, platformTopY, target.z);
    const height = Math.max(0.01, position.y - platformTopY);
    const radius = Math.tan(light.angle) * height;
    const coneGeo = new THREE.ConeGeometry(radius, height, 18, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    const mid = position.clone().add(coneTarget).multiplyScalar(0.5);
    coneMesh.position.copy(mid);
    coneMesh.lookAt(coneTarget);
    coneMesh.rotateX(Math.PI / 2); // orient cone axis along -Z
    scene.add(coneMesh);

    return { light, coneMesh };
  }

  addSpotlightWithCone({
    color: 0xff2bd6,
    position: new THREE.Vector3(-16, 20, 12),
    intensity: 110,
    target: new THREE.Vector3(-12, 0, 9),
  });
  addSpotlightWithCone({
    color: 0x2bd6ff,
    position: new THREE.Vector3(16, 20, 12),
    intensity: 110,
    target: new THREE.Vector3(12, 0, 9),
  });
  addSpotlightWithCone({
    color: 0x8dff2b,
    position: new THREE.Vector3(0, 20, -18),
    intensity: 95,
    target: new THREE.Vector3(0, 0, -13),
  });

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  // --- Record platform (visual rotates, physics stays fixed for day 1) ---
  const recordGeo = buildRecordRingGeometry({
    outerRadius: CONFIG.record.radius,
    innerRadius: CONFIG.record.innerRadius,
    thickness: CONFIG.record.thickness,
    curveSegments: 64,
  });
  const recordMat = new THREE.MeshStandardMaterial({
    color: CONFIG.record.color,
    roughness: 0.95,
    metalness: 0.15,
  });
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, CONFIG.record.y, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  (function buildRecordSurfaceGrooves(parentMesh) {
    const surf = CONFIG.record.surface;
    const th = CONFIG.record.thickness;
    const yBase = th / 2;

    const rings = surf.concentricRings;
    const rMin = rings.innerRadius;
    const rMax = rings.outerRadius;
    const ringMat = new THREE.MeshBasicMaterial({
      color: rings.color,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
    });

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
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.userData.recordSurfacePart = "groove";
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = yBase + rings.yOffset;
      parentMesh.add(ringMesh);
    }
  })(recordMesh);

  (function buildRecordSurfaceVinylLabel(parentMesh) {
    const surf = CONFIG.record.surface;
    const th = CONFIG.record.thickness;
    const yBase = th / 2;

    const spindle = surf.spindleRing;
    if (spindle.enabled) {
      const spindleGeo = new THREE.RingGeometry(spindle.innerRadius, spindle.outerRadius, 96);
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
      const discGeo = new THREE.RingGeometry(disc.innerRadius, disc.outerRadius, 96);
      const discMat = new THREE.MeshBasicMaterial({
        color: disc.color,
        depthWrite: false,
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.userData.recordSurfacePart = "labelDisc";
      discMesh.rotation.x = -Math.PI / 2;
      discMesh.position.y = yBase + disc.yOffset;
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

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const labelOuterWorld = disc.enabled ? disc.outerRadius : 6.5;
    const arcRadiusPx = (lt.arcRadius / labelOuterWorld) * (canvasSize / 2);
    const fontSpec = `900 ${lt.fontSize}px Arial Black, Impact, sans-serif`;

    drawArcTextOnCanvas(ctx, lt.text, cx, cy, arcRadiusPx, lt.arcCenterDeg, lt.arcAngleDeg, fontSpec, lt.color);
    drawArcTextOnCanvas(ctx, lt.text, cx, cy, arcRadiusPx, 270, lt.arcAngleDeg, fontSpec, lt.color);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;

    const textRadius = Math.min(labelOuterWorld - 0.04, 6.45);
    const textGeo = new THREE.CircleGeometry(textRadius, 96);
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
    textMesh.renderOrder = 2;
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.y = yBase + lt.yOffset;
    parentMesh.add(textMesh);
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

  // Inner neon rim (visual only): sells the hole edge.
  const innerRimGeo = new THREE.TorusGeometry(CONFIG.record.innerRadius * 1.02, 0.12, 10, 72);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, rimMat);
  innerRimMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.03, 0);
  innerRimMesh.rotation.x = Math.PI / 2;
  scene.add(innerRimMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, CONFIG.record.y, 0),
  );

  const recordVerts = /** @type {Float32Array} */ (recordGeo.attributes.position.array);
  const recordIndices = recordGeo.index
    ? Uint32Array.from(recordGeo.index.array)
    : Uint32Array.from(
        Array.from({ length: recordGeo.attributes.position.count }, (_, i) => i),
      );
  const recordColliderDesc = RAPIER.ColliderDesc.trimesh(recordVerts, recordIndices)
    .setFriction(CONFIG.record.friction)
    .setRestitution(CONFIG.record.restitution);
  const recordCollider = world.createCollider(recordColliderDesc, recordBody);
  void recordCollider;

  if (CONFIG.debug.arenaTrimesh) {
    const vCount = recordGeo.attributes.position.count;
    const iCount = recordGeo.index ? recordGeo.index.count : vCount;
    // eslint-disable-next-line no-console
    console.log("[arena] record ring trimesh", {
      vertices: vCount,
      indices: iCount,
      triangles: Math.floor(iCount / 3),
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

  /**
   * @param {number} nowMs
   */
  function applyArcadeControls(cart, axis, dtFixed, nowMs) {
    const pos = cart.body.translation();
    const rot = cart.body.rotation();
    const linvel = cart.body.linvel();
    const mass = getBodyMass(cart.body);

    const onGround = pos.y <= 1.25; // cheap heuristic good enough for day 1
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
      color: colorHexForSlot(slot),
      spawn,
      spawnYaw: yawToCenter(spawn),
      label: slot?.name ?? `slot-${slotIndex}`,
      slotIndex,
    });
    cartsBySlotId[slotIndex] = cart;
  }

  const colliderHandleToCart = new Map();
  for (const c of cartsBySlotId) {
    colliderHandleToCart.set(c.collider.handle, c);
  }

  const allCarts = cartsBySlotId;

  // Expose carts + input + nitro for netcode helpers (module-scope).
  allCartsRef = allCarts;
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
    if (dist > edgeBiasStart) return { x: 0, z: 0 };

    const r = Math.sqrt(Math.random()) * (CONFIG.record.radius * 0.85);
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
  const musicEl = new Audio();
  musicEl.loop = true;
  musicEl.volume = CONFIG.audio.musicVolume;
  musicEl.preload = "auto";
  musicEl.src = musicUrl;
  let musicStarted = false;
  let musicUnavailable = false;
  musicEl.addEventListener("error", () => {
    musicUnavailable = true;
  });
  musicEl.load();

  // Step 10d: Apply audio volume to engine
  function applyAudioVolume() {
    // Apply master gain to Three.js AudioListener
    if (audioListener && typeof audioListener.setMasterVolume === 'function') {
      audioListener.setMasterVolume(isMuted ? 0 : masterGain);
    }
    // Apply mute state to HTML audio element
    musicEl.muted = isMuted;
  }

  // Initialize audio with saved settings
  applyAudioVolume();

  function tryStartAmbientMusic() {
    if (musicStarted || musicUnavailable) return;
    void musicEl.play().then(
      () => {
        musicStarted = true;
      },
      () => {
        // * Autoplay may block until a gesture; missing file sets musicUnavailable.
      },
    );
  }

  function unlockAudioAndMaybeStartMusic() {
    void audioListener.context.resume();
    tryStartAmbientMusic();
  }

  canvas.addEventListener("pointerdown", () => {
    unlockAudioAndMaybeStartMusic();
    canvas.focus();
  });
  window.addEventListener("pointerdown", unlockAudioAndMaybeStartMusic, { passive: true });

  function playProceduralHornAtCart(cart) {
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
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
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

  function playBufferHorn(hornPositional, cartForProcedural) {
    void audioListener.context.resume();
    if (hornBufferReady) {
      if (hornPositional.isPlaying) {
        hornPositional.stop();
      }
      try {
        hornPositional.play();
      } catch {
        playProceduralHornAtCart(cartForProcedural);
      }
      return;
    }
    playProceduralHornAtCart(cartForProcedural);
  }

  function playHorn() {
    const localCart = localCartForConnId();
    // Ensure horn follows local cart even if slot assignment changes.
    if (playerCartHorn.parent !== localCart.mesh) {
      localCart.mesh.add(playerCartHorn);
    }
    playBufferHorn(playerCartHorn, localCart);
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
    if (speed < CONFIG.ramming.minSpeed) return;

    const dir = vec3PlanarDirection(rv);
    if (!dir) return;

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
      CONFIG.ramming.strength * speed * getBodyMass(victim.body),
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

  function onHostPlayAgainClick() {
    if (!isHost) return;
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

  function onKeyDown(e) {
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
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      playHorn();
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
    const playerPos = localCart.body.translation();

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
      // Non-host: do not step physics. Apply transforms from buffer ~150ms behind.
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
    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", updateViewport);

  requestAnimationFrame(step);
}

initNetcode();

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
