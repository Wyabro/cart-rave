// game.js — thin orchestrator (modular game entry)

import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import { CONFIG, MSG } from "./config.js";
import * as Simulation from "./simulation.js";
import * as Netcode from "./netcode.js";
import * as Input from "./input.js";
import * as Visuals from "./visuals.js";
import * as GameState from "./gameState.js";

// === Internal state ===
const state = {
  allCarts: null,
  world: null,
  camera: null,
  scene: null,
  renderer: null,
  composer: null,
  hud: null,
  isRunning: false,
  lastT: performance.now(),
  accumulator: 0,
  rafId: null,
  eventQueue: null,
  getAiAxis: null,
  physicsCallbacks: {},
};

const refs = {
  get allCartsRef() {
    return state.allCarts;
  },
  getAxisRef: null,
  triggerRamBoostRef: null,
  resetSimTimingRef: { current: null },
};

Netcode.setRefs(refs);

/** @type {object[] | null} */
let _npcCache = null;
/** @type {string | null} */
let _npcCacheKey = null;

let visibilityListenerBound = false;

/**
 * @param {Array<object> | null | undefined} allCarts
 * @returns {object | null}
 */
function resolveLocalCart(allCarts) {
  if (!allCarts) return null;

  const youConnId = Netcode.getYouConnId?.();
  if (!youConnId) return null;

  const idx = Netcode.strictSlotIndexForConn(youConnId);
  if (idx < 0) return null;

  return allCarts[idx] ?? null;
}

/**
 * @param {Array<object> | null | undefined} allCarts
 * @returns {object[]}
 */
function resolveNpcs(allCarts) {
  if (!allCarts) return [];

  const slots = Netcode.getNetSlots?.() ?? [];
  const key = slots.map((s) => s?.kind ?? "").join(",");
  if (key === _npcCacheKey && _npcCache) return _npcCache;

  _npcCache = allCarts.filter((cart, idx) => cart && slots[idx]?.kind === "npc");
  _npcCacheKey = key;
  return _npcCache;
}

/**
 * @param {string | null | undefined} connId
 * @returns {object | null}
 */
function resolveCartForConn(connId) {
  const idx = Netcode.strictSlotIndexForConn(connId);
  if (idx < 0) return null;
  return state.allCarts?.[idx] ?? null;
}

/**
 * Merges extension callbacks; core simulation hooks always win over physicsCallbacks.
 * @returns {object}
 */
function buildPhysicsCallbacks() {
  const core = {
    getAxis: Input.getAxis,
    getAiAxis: state.getAiAxis,
    resolveCartForConn,
  };

  for (const key of Object.keys(state.physicsCallbacks)) {
    if (key in core) {
      console.warn(`[game] physicsCallbacks.${key} conflicts with core callback — ignored`);
    }
  }

  return { ...state.physicsCallbacks, ...core };
}

function ensureEventQueue() {
  if (!state.world) return null;
  if (!state.eventQueue) {
    if (typeof RAPIER.EventQueue !== "function") {
      console.error("[game] RAPIER not initialized — cannot create EventQueue");
      return null;
    }
    state.eventQueue = new RAPIER.EventQueue(true);
  }
  return state.eventQueue;
}

function resetSimTiming() {
  state.lastT = performance.now();
  state.accumulator = 0;
}

function onTabVisible() {
  if (!document.hidden && state.isRunning) {
    resetSimTiming();
  }
}

function bindVisibilityListener() {
  if (visibilityListenerBound) return;
  document.addEventListener("visibilitychange", onTabVisible);
  visibilityListenerBound = true;
}

function unbindVisibilityListener() {
  if (!visibilityListenerBound) return;
  document.removeEventListener("visibilitychange", onTabVisible);
  visibilityListenerBound = false;
}

refs.resetSimTimingRef.current = resetSimTiming;

// === Initialization ===
/**
 * @param {object} [options]
 */
export function initGame(options = {}) {
  console.log("[game] Initializing modular Cart Rave...");

  if (options.allCarts) {
    state.allCarts = options.allCarts;
  }
  if (options.world) {
    state.world = options.world;
    state.eventQueue = null;
  }
  if (options.camera) state.camera = options.camera;
  if (options.scene) state.scene = options.scene;
  if (options.renderer) state.renderer = options.renderer;
  if (options.composer) state.composer = options.composer;
  if (options.hud) state.hud = options.hud;
  if (typeof options.getAiAxis === "function") state.getAiAxis = options.getAiAxis;
  if (options.physicsCallbacks && typeof options.physicsCallbacks === "object") {
    state.physicsCallbacks = options.physicsCallbacks;
  }

  refs.getAxisRef = Input.getAxis;
  Netcode.setRefs(refs);

  return {
    state,
    Simulation,
    Netcode,
    Input,
    Visuals,
  };
}

// === Main Loop ===
export function gameStep(now = performance.now()) {
  if (!state.isRunning) return;

  try {
    const dt = Math.min((now - state.lastT) / 1000, 0.05);
    state.lastT = now;
    state.accumulator += dt;

    const { world, allCarts } = state;
    const isHost = Netcode.getIsHost?.() ?? false;
    const eventQueue = ensureEventQueue();
    const localCart = resolveLocalCart(allCarts);
    const remoteInputs = isHost ? Netcode.getRemoteInputsByConnId?.() ?? null : null;
    const npcs = isHost ? resolveNpcs(allCarts) : [];

    if (world && allCarts && eventQueue) {
      while (state.accumulator >= CONFIG.fixedTimeStep) {
        Simulation.runFixedPhysicsStep({
          world,
          eventQueue,
          allCarts,
          localCart,
          remoteInputs,
          npcs,
          dt: CONFIG.fixedTimeStep,
          now,
          isHost,
          callbacks: buildPhysicsCallbacks(),
        });
        state.accumulator -= CONFIG.fixedTimeStep;
      }
    }

    // Visual updates + rendering remain in main.js until full cutover.

    state.rafId = requestAnimationFrame(gameStep);
  } catch (err) {
    console.error("[game] Fatal step error:", err);
    stopGameLoop();
  }
}

export function startGameLoop() {
  if (state.isRunning) return;

  state.isRunning = true;
  resetSimTiming();
  bindVisibilityListener();
  console.log("[game] Starting game loop");
  state.rafId = requestAnimationFrame(gameStep);
}

export function stopGameLoop() {
  state.isRunning = false;
  if (state.rafId != null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

/**
 * Tears down loop state and clears module refs so initGame can run again cleanly.
 */
export function dispose() {
  stopGameLoop();
  unbindVisibilityListener();

  state.world = null;
  state.eventQueue = null;
  state.allCarts = null;
  state.camera = null;
  state.scene = null;
  state.renderer = null;
  state.composer = null;
  state.hud = null;
  state.getAiAxis = null;
  state.physicsCallbacks = {};

  _npcCache = null;
  _npcCacheKey = null;

  refs.getAxisRef = null;
  Netcode.setRefs({ getAllCartsRef: () => null });
}

export {
  Simulation,
  Netcode,
  Input,
  Visuals,
  GameState,
  CONFIG,
  MSG,
};

/**
 * Modular layout status
 *
 * Extracted modules: config, simulation, netcode, input, visuals, gameState,
 * entities, scene, audio, hud.
 *
 * main.js still owns the production render loop, scene bootstrap, and HUD wiring.
 * game.js provides a thin fixed-timestep orchestrator for gradual cutover — pass
 * world/allCarts via initGame(), optional getAiAxis + physicsCallbacks for host sim.
 */
