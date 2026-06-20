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
  /** @type {GameContext} */
  const ctx = {
    /** @type {Record<string, object>} Netcode, GameState, Simulation, etc. */
    modules: {},

    /** @type {Record<string, unknown>} Closures and handles owned by main (carts, world, CONFIG). */
    runtime: {},

    /** @type {import("./gameLoop.js").GameLoopState | null} */
    loopState: null,

    /** @type {import("./gameLoop.js").FrameContext | null} Current rAF tick payload. */
    frameCtx: null,

    /** Last-cart-standing and podium slow-mo state (shared by gameFlow + physics). */
    slowMo: {
      until: 0,
      rate: 1,
      active: false,
      startMs: 0,
      timeScale: 0.25,
      durationMs: 3500,
    },

    /** Per-phase dependency objects passed to updateGameFlow / runPhysicsStep / updateVisualsAndEffects. */
    deps: {
      visual: null,
      gameFlow: null,
      physics: null,
    },

    registerModules(modules) {
      Object.assign(ctx.modules, modules);
      return ctx;
    },

    registerRuntime(runtime) {
      Object.assign(ctx.runtime, runtime);
      return ctx;
    },

    setLoopState(loopState) {
      ctx.loopState = loopState;
      return ctx;
    },

    attachDeps(deps) {
      if (deps.visual !== undefined) ctx.deps.visual = deps.visual;
      if (deps.gameFlow !== undefined) ctx.deps.gameFlow = deps.gameFlow;
      if (deps.physics !== undefined) ctx.deps.physics = deps.physics;
      return ctx;
    },

    setFrameCtx(frameCtx) {
      ctx.frameCtx = frameCtx;
      return ctx;
    },

    /**
     * Builds `{ now, dt, loopState }` for gameFlow / physics phase calls.
     *
     * @param {number} dt Slow-mo-adjusted frame delta (seconds).
     */
    makePhaseContext(dt) {
      const fc = ctx.frameCtx;
      return {
        now: fc.now,
        dt,
        loopState: ctx.loopState,
      };
    },

    /** Getters consumed by {@link import("./gameLoop.js").applySlowMoToDt}. */
    getSlowMoDeps() {
      const { GameState, Netcode } = ctx.modules;
      return {
        getRoundState: () => GameState.getRoundState(),
        getSlowMoUntil: () => ctx.slowMo.until,
        getSlowMoRate: () => ctx.slowMo.rate,
        isHost: () => Netcode.getIsHost(),
        isSlowMoActive: () => ctx.slowMo.active,
        getSlowMoStartMs: () => ctx.slowMo.startMs,
        setSlowMoActive: (active) => { ctx.slowMo.active = active; },
        SLOW_MO_TIME_SCALE: ctx.slowMo.timeScale,
        SLOW_MO_DURATION_MS: ctx.slowMo.durationMs,
      };
    },

    /** Netcode / GameState accessors shared across visual, gameFlow, and physics deps. */
    createSharedGetters() {
      const { Netcode, GameState } = ctx.modules;
      const { runtime } = ctx;
      return {
        getAllCarts: () => runtime.getAllCarts(),
        getNetSlots: () => Netcode.getNetSlots(),
        isHost: () => Netcode.getIsHost(),
        getRoundState: () => GameState.getRoundState(),
        getRoundScores: () => GameState.getRoundScores(),
        getLocalSlotIndex: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
        CONFIG: runtime.CONFIG,
      };
    },
  };

  return ctx;
}
