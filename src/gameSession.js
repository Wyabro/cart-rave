// gameSession.js — connect → play → teardown → in-tab menu return

import * as GameState from "./gameState.js";

/**
 * Mutable callback refs shared between main(), netcode, and the game loop.
 * Survives session teardown; individual `.current` handlers are cleared on quit.
 */
export function createSessionBridgeRefs() {
  const updateNameLabelsRef = { current: null };
  const respawnLocalMidRoundJoinRef = { current: null };
  const resetSimTimingRef = { current: null };

  return {
    updateNameLabelsRef,
    respawnLocalMidRoundJoinRef,
    resetSimTimingRef,
    /** Clears per-session cart/name callbacks while keeping loop timing wired. */
    clearSessionCallbackRefs() {
      updateNameLabelsRef.current = null;
      respawnLocalMidRoundJoinRef.current = null;
    },
  };
}

/**
 * Tracks hello receipt across connect/teardown cycles so cart bootstrap can
 * await the current session's first hello without stale promise resolution.
 */
export function createHelloGate() {
  let generation = 0;
  let received = false;
  /** @type {((slots: unknown) => void) | null} */
  let resolveFirst = null;
  /** @type {Promise<unknown>} */
  let firstPromise = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  let pendingBootstrap = false;

  function reset() {
    generation += 1;
    received = false;
    resolveFirst = null;
    firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    pendingBootstrap = false;
  }

  /**
   * @param {unknown} [slots]
   * @returns {number} Active generation after marking hello.
   */
  function markReceived(slots) {
    if (!received) {
      received = true;
      resolveFirst?.(slots);
    }
    pendingBootstrap = true;
    return generation;
  }

  return {
    reset,
    markReceived,
    isReceived: () => received,
    getFirstPromise: () => firstPromise,
    getGeneration: () => generation,
    hasPendingBootstrap: () => pendingBootstrap,
    clearPendingBootstrap: () => {
      pendingBootstrap = false;
    },
  };
}

/**
 * Strips `?room=` from the URL without reloading the page.
 */
function stripRoomFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("room")) return;
  url.searchParams.delete("room");
  history.pushState({}, "", `${url.pathname}${url.search}`);
}

/**
 * Builds the callback bundle consumed by {@link import("./netcode.js").registerGameCallbacks}.
 *
 * @param {() => object | null} getContext Live main/session context (null before main() wires handlers).
 * @param {{ returnToMenu: (opts?: object) => void }} session
 */
export function buildNetcodeGameBridge(getContext, session) {
  return {
    detectGameMode: () => getContext()?.detectGameMode?.() ?? "quickplay",
    getPalette: () => getContext()?.palette ?? [],
    getInitialNpcNames: () => getContext()?.initialNpcNames ?? [],
    markFirstHelloReceived: () => getContext()?.markFirstHelloReceived?.(),
    getOnGameStartHandler: () => getContext()?.getOnGameStartHandler?.() ?? null,
    getOnHostMigratedHandler: () => getContext()?.getOnHostMigratedHandler?.() ?? null,
    onCountdownCancelled: () => getContext()?.onCountdownCancelled?.(),
    getMenuVisible: () => getContext()?.getMenuVisible?.() ?? true,
    invokeHideMenu: () => getContext()?.invokeHideMenu?.(),
    onJoinRejected: () => session.returnToMenu({ reason: "joinRejected" }),
    updateCartMaterialsFromSlots: (slots) => getContext()?.updateCartMaterialsFromSlots?.(slots),
    updateHudColorsFromSlots: (slots) => getContext()?.updateHudColorsFromSlots?.(slots),
    getUpdateNameLabelsRef: () => getContext()?.updateNameLabelsRef ?? { current: null },
    getNameLabelUpdatePending: () => getContext()?.getNameLabelUpdatePending?.() ?? null,
    setNameLabelUpdatePending: (val) => getContext()?.setNameLabelUpdatePending?.(val),
    getRespawnLocalMidRoundJoinRef: () => getContext()?.respawnLocalMidRoundJoinRef ?? { current: null },
    getPlayCollisionRef: () => getContext()?.getPlayCollisionRef?.() ?? null,
    getSfx: () => getContext()?.getSfx?.() ?? null,
    getSpawnTrashBurstRef: () => getContext()?.getSpawnTrashBurstRef?.() ?? null,
    getTriggerLocalRamShake: () => getContext()?.getTriggerLocalRamShake?.() ?? null,
    getHud: () => getContext()?.getHud?.() ?? null,
    colorHexForSlot: (slot) => getContext()?.colorHexForSlot?.(slot) ?? 0x888888,
    getPendingColorKey: () => getContext()?.getPendingColorKey?.() ?? null,
    getPendingColorChipEl: () => getContext()?.getPendingColorChipEl?.() ?? null,
    setPendingColorKey: (val) => getContext()?.setPendingColorKey?.(val),
    setPendingColorChipEl: (val) => getContext()?.setPendingColorChipEl?.(val),
    getLocalColorPicked: () => getContext()?.getLocalColorPicked?.() ?? false,
    setLocalColorPicked: (val) => getContext()?.setLocalColorPicked?.(val),
    recordPodiumStats: (winner, scores) => getContext()?.recordPodiumStats?.(winner, scores),
    onReturnToLobby: () => getContext()?.onReturnToLobby?.(),
    onEnterPodium: () => getContext()?.onEnterPodium?.(),
    getPendingMidRoundJoinRespawnConnId: () => getContext()?.getPendingMidRoundJoinRespawnConnId?.() ?? null,
    setPendingMidRoundJoinRespawnConnId: (val) => getContext()?.setPendingMidRoundJoinRespawnConnId?.(val),
    ensureSessionReady: () => getContext()?.ensureSessionReady?.(),
    endCinematicCountdown: () => getContext()?.endCinematicCountdown?.(),
  };
}

/**
 * Creates the game-session controller used for teardown and in-tab menu return.
 *
 * @param {() => object | null} getContext Supplies live handlers and module state from main().
 */
export function createGameSessionController(getContext) {
  let tearingDown = false;

  /**
   * Tears down an active multiplayer/solo session while keeping the Three.js world alive.
   */
  function teardownGameSession() {
    if (tearingDown) return;
    tearingDown = true;

    const ctx = getContext();
    try {
      // * Timers and round UX first — avoid callbacks firing after disconnect.
      ctx?.clearRoundCountdownTimeout?.();
      ctx?.clearAutoContinuePodiumTimeout?.();
      ctx?.clearPodiumRoundTimeout?.();
      ctx?.cancelNameLabelUpdatePending?.();
      ctx?.resetPodiumSessionState?.();
      ctx?.resetSlowMo?.();
      ctx?.resetSimTiming?.();

      ctx?.resetRoundState?.() ?? GameState.resetRoundToLobby();

      ctx?.disconnectNetcode?.();
      ctx?.destroySessionCarts?.();

      ctx?.resetSessionPickState?.();
      ctx?.resetSessionHelloGate?.();
      ctx?.resetNameLabelBridge?.();
      ctx?.clearNetcodeRuntimeRefs?.();

      ctx?.hideEscOverlay?.();
      ctx?.hideResultsOverlay?.();
      ctx?.resetLeaderHum?.();
      ctx?.resetResultsOverlayKey?.();
      ctx?.dismissLoadingOverlays?.();
    } finally {
      tearingDown = false;
    }
  }

  /**
   * Ends the current session and returns to the menu without a full page reload.
   *
   * @param {{ reason?: string }} [opts]
   */
  function returnToMenu(opts = {}) {
    teardownGameSession();
    stripRoomFromUrl();

    const ctx = getContext();
    try {
      ctx?.initMenu?.();
    } catch (err) {
      // ! Last-resort fallback if in-tab return fails — same behavior as legacy quit paths.
      console.warn("[gameSession] returnToMenu initMenu failed, reloading", opts.reason, err);
      if (typeof window !== "undefined") {
        window.location.href = new URL(window.location.href).pathname;
      }
    }
  }

  return { teardownGameSession, returnToMenu };
}
