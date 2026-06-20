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
  allCartsRef: null,
  getAxisRef: null,
  triggerRamBoostRef: null,
  resetSimTimingRef: { current: null },
};

Netcode.setRefs(refs);

/**
 * @param {Array<object> | null | undefined} allCarts
 * @returns {object | null}
 */
function resolveLocalCart(allCarts) {
  if (!allCarts) return null;

  const youConnId = Netcode.getYouConnId?.();
  if (!youConnId) return null;

  const idx = Netcode.localSlotIndexForConn(youConnId);
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
  return allCarts.filter((cart, idx) => cart && slots[idx]?.kind === "npc");
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

function ensureEventQueue() {
  if (!state.world) return null;
  if (!state.eventQueue) {
    state.eventQueue = new RAPIER.EventQueue(true);
  }
  return state.eventQueue;
}

function resetSimTiming() {
  state.lastT = performance.now();
  state.accumulator = 0;
}

refs.resetSimTimingRef.current = resetSimTiming;

// === Initialization ===
/**
 * @param {object} [options]
 */
export function initGame(options = {}) {
  if (!options || typeof options !== "object") {
    options = {};
  }

  console.log("[game] Initializing modular Cart Rave...");

  if (options.allCarts) {
    state.allCarts = options.allCarts;
    refs.allCartsRef = state.allCarts;
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
        callbacks: {
          getAxis: Input.getAxis,
          getAiAxis: state.getAiAxis,
          resolveCartForConn,
          ...state.physicsCallbacks,
        },
      });
      state.accumulator -= CONFIG.fixedTimeStep;
    }
  }

  // Visual updates + rendering remain in main.js until full cutover.

  state.rafId = requestAnimationFrame(gameStep);
}

export function startGameLoop() {
  if (state.isRunning) return;

  state.isRunning = true;
  resetSimTiming();
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
