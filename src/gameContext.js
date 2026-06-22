// gameContext.js — central registry for game-loop modules, runtime refs, and phase deps

/**
 * Creates the shared context object used by the frame loop and its phase modules.
 *
 * `main.js` registers module namespaces and runtime closures once at init, then
 * attaches per-phase dependency bundles (`visual`, `gameFlow`, `physics`).
 * Each tick updates `frameCtx`; phase helpers read deps via `ctx.deps.*`.
 *
 * @returns {GameContext}
 */
export function createGameContext() {
  const state = {
    modules: {},
    runtime: {},
    loopState: null,
    frameCtx: null,
    slowMo: {
      active: false,
      startMs: 0,
      timeScale: 0.25,
      durationMs: 3500,
    },
    deps: {
      visual: null,
      gameFlow: null,
      physics: null,
    },
  };

  let slowMoDepsCache = null;
  let sharedGettersCache = null;

  const ctx = {
    registerModules(modules) {
      Object.assign(state.modules, modules);
      return ctx;
    },

    registerRuntime(runtime) {
      Object.assign(state.runtime, runtime);
      return ctx;
    },

    setLoopState(loopState) {
      state.loopState = loopState;
      return ctx;
    },

    attachDeps(deps) {
      Object.assign(state.deps, deps);
      return ctx;
    },

    setFrameCtx(frameCtx) {
      state.frameCtx = frameCtx;
      return ctx;
    },

    /**
     * Builds `{ now, dt, loopState }` for gameFlow / physics phase calls.
     *
     * @param {number} dt Slow-mo-adjusted frame delta (seconds).
     */
    makePhaseContext(dt) {
      return {
        now: state.frameCtx.now,
        dt,
        loopState: state.loopState,
      };
    },

    /** Getters consumed by {@link import("./gameLoop.js").applySlowMoToDt}. */
    getSlowMoDeps() {
      if (!slowMoDepsCache) {
        slowMoDepsCache = {
          isHost: () => state.modules.Netcode.getIsHost(),
          isSlowMoActive: () => state.slowMo.active,
          getSlowMoStartMs: () => state.slowMo.startMs,
          setSlowMoActive: (active) => { state.slowMo.active = active; },
          SLOW_MO_TIME_SCALE: state.slowMo.timeScale,
          SLOW_MO_DURATION_MS: state.slowMo.durationMs,
        };
      }
      return slowMoDepsCache;
    },

    /** Netcode / GameState accessors shared across visual, gameFlow, and physics deps. */
    createSharedGetters() {
      if (!sharedGettersCache) {
        sharedGettersCache = {
          getAllCarts: () => state.runtime.getAllCarts(),
          getNetSlots: () => state.modules.Netcode.getNetSlots(),
          isHost: () => state.modules.Netcode.getIsHost(),
          getRoundState: () => state.modules.GameState.getRoundState(),
          getRoundScores: () => state.modules.GameState.getRoundScores(),
          getLocalSlotIndex: () => state.modules.Netcode.strictSlotIndexForConn(
            state.modules.Netcode.getYouConnId(),
          ),
          CONFIG: state.runtime.CONFIG,
        };
      }
      return sharedGettersCache;
    },
  };

  Object.defineProperties(ctx, {
    modules: { get: () => state.modules, enumerable: true },
    runtime: { get: () => state.runtime, enumerable: true },
    loopState: { get: () => state.loopState, enumerable: true },
    frameCtx: { get: () => state.frameCtx, enumerable: true },
    slowMo: { get: () => state.slowMo, enumerable: true },
    deps: { get: () => state.deps, enumerable: true },
  });

  return ctx;
}
