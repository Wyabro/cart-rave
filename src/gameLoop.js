// gameLoop.js — requestAnimationFrame timing shell (fixed-timestep accumulator)

import { captureCartsPhysicsPrevPoses } from "./entities.js";

export { updateVisualsAndEffects } from "./frameVisuals.js";

/** @type {object[] | null} */
let _npcCache = null;
/** @type {string | null} */
let _npcCacheKey = null;

/** Clears cached NPC cart refs after session teardown (bodies are removed from Rapier). */
export function clearNpcCartCache() {
  _npcCache = null;
  _npcCacheKey = null;
}

/**
 * Returns NPC carts for the current slot layout, reusing a cache when slot kinds are unchanged.
 *
 * @param {Array<object>} allCarts
 * @param {Array<{ kind?: string }>} slots
 * @returns {object[]}
 */
function resolveNpcCarts(allCarts, slots) {
  if (!Array.isArray(allCarts) || !Array.isArray(slots)) {
    _npcCache = null;
    _npcCacheKey = null;
    return [];
  }

  const key = slots.map((s) => s?.kind ?? "").join(",");
  if (key === _npcCacheKey && _npcCache) {
    // * Quit-to-menu destroys carts but slot kinds stay the same — drop stale body refs.
    const stillValid = _npcCache.every((c) => c && allCarts.includes(c));
    if (stillValid) return _npcCache;
  }

  _npcCache = allCarts.filter((c, idx) => c && slots[idx]?.kind === "npc");
  _npcCacheKey = key;
  return _npcCache;
}

/** @typedef {{ lastT: number, accumulator: number, simFrameIndex: number }} GameLoopState */

/** @typedef {{ now: number, dt: number, loopState: GameLoopState, physicsAlpha?: number | null }} FrameContext */

/**
 * @typedef {object} SlowMoDeps
 * @property {() => boolean} isHost
 * @property {() => boolean} isSlowMoActive
 * @property {() => number} getSlowMoStartMs
 * @property {(active: boolean) => void} setSlowMoActive
 * @property {number} SLOW_MO_TIME_SCALE
 * @property {number} SLOW_MO_DURATION_MS
 */

/**
 * Applies host slow-mo scaling to frame delta time at round end.
 * Used before ambient visuals and again reflected in physics-phase reconciliation dt.
 *
 * @param {SlowMoDeps} deps
 * @param {number} dt Raw frame delta (seconds).
 * @returns {number} Slow-mo-adjusted dt.
 */
export function applySlowMoToDt(deps, dt) {
  let adjusted = dt;
  if (deps.isSlowMoActive()) {
    adjusted *= deps.SLOW_MO_TIME_SCALE;
    if (performance.now() - deps.getSlowMoStartMs() > deps.SLOW_MO_DURATION_MS) {
      deps.setSlowMoActive(false);
    }
  }
  return adjusted;
}

/**
 * @typedef {object} PhysicsStepDeps
 * @property {object} CONFIG
 * @property {object} world Rapier world.
 * @property {object} eventQueue Rapier event queue.
 * @property {() => Array<object>} getAllCartsRef Host physics cart array.
 * @property {() => Array<object>} getAllCarts All slot carts (fallback path).
 * @property {() => object | null} getLocalCart
 * @property {() => Array<object>} getNetSlots
 * @property {() => number} getLocalSlotIndex
 * @property {() => boolean} isHost
 * @property {() => boolean} shouldUseClientPrediction
 * @property {() => { phase: string }} getRoundState
 * @property {() => boolean} getSkipNextPhysicsStep
 * @property {(skip: boolean) => void} setSkipNextPhysicsStep
 * @property {() => object} getRemoteInputsByConnId
 * @property {() => number} getHostMigrationFreezeUntilMs
 * @property {(localSlotIndex: number) => void} updateRemoteCartNetTargets
 * @property {(localSlotIndex: number) => void} syncRemoteCartBodiesForPrediction
 * @property {(localCart: object, localSlotIndex: number, dt: number) => void} reconcilePredictedLocalCart
 * @property {(slotIndex: number) => object | null} sampleAuthoritativeCartState
 * @property {(isHost: boolean) => object} getSimulationCallbacks
 * @property {(args: object) => void} runFixedPhysicsStep
 */

/**
 * Fixed-timestep physics phase: host authority, client prediction, or net fallback.
 * Mutates `loopState.accumulator`; returns interpolation alpha and substep count.
 *
 * @param {GameLoopState} loopState
 * @param {PhysicsStepDeps} deps
 * @param {{ now: number, dt: number }} context Slow-mo-adjusted frame dt for reconciliation.
 * @returns {{ substeps: number, alpha: number | null, dt: number }}
 */
export function runPhysicsStep(loopState, deps, context) {
  const { dt } = context;
  const netSlotsForFrame = deps.getNetSlots();
  const localSlotIndexThisFrame = deps.getLocalSlotIndex();
  const localCart = deps.getLocalCart();

  let substeps = 0;
  let alpha = null;

  if (deps.isHost()) {
    if (deps.getRoundState().phase === "running") {
      const allCarts = deps.getAllCartsRef();
      if (Array.isArray(allCarts)) {
        const npcCartsForFrame = resolveNpcCarts(allCarts, netSlotsForFrame);

        while (loopState.accumulator >= deps.CONFIG.fixedTimeStep && substeps < deps.CONFIG.maxSubsteps) {
          if (deps.getSkipNextPhysicsStep()) {
            deps.setSkipNextPhysicsStep(false);
            loopState.accumulator -= deps.CONFIG.fixedTimeStep;
            substeps += 1;
            continue;
          }

          captureCartsPhysicsPrevPoses(allCarts);
          deps.runFixedPhysicsStep({
            world: deps.world,
            eventQueue: deps.eventQueue,
            allCarts,
            localCart,
            remoteInputs: deps.getRemoteInputsByConnId(),
            npcs: npcCartsForFrame,
            dt: deps.CONFIG.fixedTimeStep,
            now: performance.now(),
            isHost: deps.isHost(),
            callbacks: deps.getSimulationCallbacks(true),
          });
          loopState.accumulator -= deps.CONFIG.fixedTimeStep;
          substeps += 1;
        }
        const maxDebt = deps.CONFIG.fixedTimeStep * deps.CONFIG.maxSubsteps;
        if (loopState.accumulator > maxDebt) {
          loopState.accumulator = maxDebt;
        }
        if (
          import.meta.env.DEV &&
          substeps >= deps.CONFIG.maxSubsteps &&
          loopState.accumulator >= deps.CONFIG.fixedTimeStep
        ) {
          console.warn(
            `[gameLoop] Physics substep cap hit with remaining debt: ${substeps} substeps, ` +
              `${(loopState.accumulator * 1000).toFixed(1)}ms unprocessed`
          );
        }
        alpha = loopState.accumulator / deps.CONFIG.fixedTimeStep;
      } else {
        loopState.accumulator = 0;
      }
    } else {
      loopState.accumulator = 0;
    }
  } else if (deps.shouldUseClientPrediction()) {
    // * Multiplayer client: prediction + reconciliation (solo never enters this branch).
    const localSlotIndex = localSlotIndexThisFrame;

    if (Date.now() < deps.getHostMigrationFreezeUntilMs()) {
      // * Hold positions until a new host's snapshots arrive after migration.
    } else {
      // 1. Interpolate remote players from the host snapshot buffer (not the local cart).
      deps.updateRemoteCartNetTargets(localSlotIndex);
      // 2. Align remote physics bodies so prediction collides against current net poses.
      deps.syncRemoteCartBodiesForPrediction(localSlotIndex);

      // 3. Prediction: step Rapier locally with the player's input (instant feel).
      if (deps.getRoundState().phase === "running") {
        const allCarts = deps.getAllCartsRef();
        if (Array.isArray(allCarts)) {
          while (loopState.accumulator >= deps.CONFIG.fixedTimeStep && substeps < deps.CONFIG.maxSubsteps) {
            captureCartsPhysicsPrevPoses(allCarts);
            deps.runFixedPhysicsStep({
              world: deps.world,
              eventQueue: deps.eventQueue,
              allCarts,
              localCart,
              remoteInputs: null,
              npcs: [],
              dt: deps.CONFIG.fixedTimeStep,
              now: performance.now(),
              isHost: false,
              callbacks: deps.getSimulationCallbacks(false),
            });
            loopState.accumulator -= deps.CONFIG.fixedTimeStep;
            substeps += 1;
          }
          const maxDebt = deps.CONFIG.fixedTimeStep * deps.CONFIG.maxSubsteps;
          if (loopState.accumulator > maxDebt) {
            loopState.accumulator = maxDebt;
          }
          if (
            import.meta.env.DEV &&
            substeps >= deps.CONFIG.maxSubsteps &&
            loopState.accumulator >= deps.CONFIG.fixedTimeStep
          ) {
            console.warn(
              `[gameLoop] Physics substep cap hit with remaining debt: ${substeps} substeps, ` +
                `${(loopState.accumulator * 1000).toFixed(1)}ms unprocessed`
            );
          }
          alpha = loopState.accumulator / deps.CONFIG.fixedTimeStep;
        } else {
          loopState.accumulator = 0;
        }
      } else {
        loopState.accumulator = 0;
      }

      // 4. Reconciliation: softly correct predicted pose toward host authority.
      deps.reconcilePredictedLocalCart(localCart, localSlotIndex, dt);
    }
  } else {
    // Non-host without prediction (defensive fallback): interpolate all carts from buffer.
    if (Date.now() < deps.getHostMigrationFreezeUntilMs()) {
      // hold
    } else {
      const localSlotIndex = localSlotIndexThisFrame;
      deps.updateRemoteCartNetTargets(-1);
      const localSnap = deps.sampleAuthoritativeCartState(localSlotIndex);
      const fallbackCart = localSlotIndex >= 0 ? deps.getAllCarts()[localSlotIndex] : null;
      if (fallbackCart && localSnap) {
        const { p, q, lv, av } = localSnap;
        if (Array.isArray(p) && p.length === 3) {
          fallbackCart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
        }
        if (Array.isArray(q) && q.length === 4) {
          fallbackCart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
        }
        if (Array.isArray(lv) && lv.length === 3) {
          fallbackCart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
        }
        if (Array.isArray(av) && av.length === 3) {
          fallbackCart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
        }
      }
    }
  }

  return { substeps, alpha, dt };
}

/**
 * Creates fresh timing state for the fixed-timestep game loop.
 *
 * @returns {GameLoopState}
 */
export function createGameLoopState() {
  return {
    lastT: performance.now(),
    accumulator: 0,
    simFrameIndex: 0,
  };
}

/**
 * Resets frame delta and accumulator (e.g. after host migration).
 *
 * @param {GameLoopState} loopState
 */
export function resetGameLoopTiming(loopState) {
  loopState.lastT = performance.now();
  loopState.accumulator = 0;
}

/**
 * @typedef {object} GameLoopCallbacks
 * @property {() => boolean} [shouldSkipTiming] When true, skips dt/accumulator updates and
 *   both frame phases for this tick but keeps the loop running (menu overlay).
 * @property {(ctx: FrameContext) => void} onFrame Simulation + game logic: physics substeps,
 *   netcode, host fall detection, camera follow, etc.
 * @property {(ctx: FrameContext) => void} [onVisualUpdate] Post-physics phase: mesh sync,
 *   effects, HUD, and render. Typically delegates to {@link updateVisualsAndEffects}.
 * @property {(err: unknown) => void} [onFatalError] Invoked when a frame throws; loop stops.
 */

/**
 * Starts the requestAnimationFrame loop and manages outer timing / accumulator bookkeeping.
 *
 * Each tick runs three logical phases when not skipped:
 * 1. `onFrame` — slow-mo dt, ambient visuals, {@link updateGameFlow}, {@link runPhysicsStep}
 * 2. `onVisualUpdate` — mesh sync, effects, HUD, render ({@link updateVisualsAndEffects})
 *
 * @param {GameLoopState} loopState Mutable timing state from {@link createGameLoopState}.
 * @param {GameLoopCallbacks} callbacks
 */
export function runGameLoop(loopState, callbacks) {
  const { onFrame, onVisualUpdate, shouldSkipTiming, onFatalError } = callbacks;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resetGameLoopTiming(loopState);
    }
  });

  function step(now) {
    if (shouldSkipTiming?.()) {
      requestAnimationFrame(step);
      return;
    }

    try {
      let dt = (now - loopState.lastT) / 1000;
      dt = Math.min(dt, 0.05);
      loopState.lastT = now;
      loopState.accumulator += dt;
      loopState.simFrameIndex += 1;

      const frameCtx = { now, dt, loopState };
      onFrame(frameCtx);
      onVisualUpdate?.(frameCtx);

      requestAnimationFrame(step);
    } catch (err) {
      console.error("[gameLoop] Fatal step error:", err);
      onFatalError?.(err);
    }
  }

  requestAnimationFrame(step);
}
