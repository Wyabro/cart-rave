// game.js — thin orchestrator (new main game entry)

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
};

const refs = {
  allCartsRef: null,
  getAxisRef: null,
  triggerRamBoostRef: null,
  resetSimTimingRef: { current: null },
};

Netcode.setRefs(refs);

// === Initialization ===
export function initGame(options = {}) {
  console.log("[game] Initializing modular Cart Rave...");

  // Store core Three/Rapier refs when passed in
  if (options.allCarts) state.allCarts = options.allCarts;
  if (options.world) state.world = options.world;
  if (options.camera) state.camera = options.camera;
  if (options.scene) state.scene = options.scene;

  refs.allCartsRef = state.allCarts;
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

// === Main Loop (placeholder - will be filled) ===
let lastT = performance.now();
let accumulator = 0;

export function gameStep(now = performance.now()) {
  if (!state.isRunning) return;

  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  accumulator += dt;

  // Fixed timestep physics
  while (accumulator >= CONFIG.fixedTimeStep) {
    Simulation.runFixedPhysicsStep({
      world: state.world,
      eventQueue: null, // TODO
      allCarts: state.allCarts,
      localCart: null,  // TODO: resolve local cart
      remoteInputs: null,
      npcs: null,
      dt: CONFIG.fixedTimeStep,
      now,
      isHost: Netcode.getIsHost?.() ?? false,
      callbacks: {
        getAxis: Input.getAxis,
      },
    });
    accumulator -= CONFIG.fixedTimeStep;
  }

  // Visual updates
  // Visuals + rendering will go here

  requestAnimationFrame(gameStep);
}

export function startGameLoop() {
  if (state.isRunning) return;
  state.isRunning = true;
  lastT = performance.now();
  accumulator = 0;
  console.log("[game] Starting game loop");
  requestAnimationFrame(gameStep);
}

export function stopGameLoop() {
  state.isRunning = false;
}

// Expose everything for migration
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
 * Migration Roadmap
 *
 * Phase 1 (complete):
 *   config, simulation, netcode, input, visuals extracted
 *
 * Phase 2 (current):
 *   - Move real fixed-timestep logic into gameStep()
 *   - Wire physicsSubstep from simulation.js
 *   - Begin moving cart creation & scene setup
 *
 * Phase 3:
 *   Extract gameState.js, hud.js, audio.js
 *   Full cutover from old main.js
 */