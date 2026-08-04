// gameSession.js — connect → play → teardown → in-tab menu return

import * as GameState from "./gameState.js";
import * as Netcode from "./netcode.js";
import { SESSION_KEYS, sessionRemove } from "./utils/storage.js";
import { trackEvent } from "./analytics/analytics.js";
import { invalidateActivePlayEntry } from "./bootstrap.js";

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
 * Hello → cart-bootstrap flush helpers used by the session bridge.
 * @param {ReturnType<typeof createHelloGate>} helloGate
 * @param {() => { ensureSessionReady?: () => Promise<void> } | null} getBridge
 */
export function createHelloBootstrapFlush(helloGate, getBridge) {
  async function flushPendingSessionBootstrap() {
    if (!helloGate.hasPendingBootstrap() && !helloGate.isReceived()) return;
    if (!helloGate.isReceived()) return;
    const ensureReady = getBridge()?.ensureSessionReady;
    if (!ensureReady) return;
    try {
      await ensureReady();
    } catch (err) {
      console.warn("[session] cart bootstrap flush failed", err);
    } finally {
      helloGate.clearPendingBootstrap();
    }
  }

  function markFirstHelloReceived(slots) {
    helloGate.markReceived(slots ?? Netcode.getNetSlots());
    void flushPendingSessionBootstrap();
  }

  return { flushPendingSessionBootstrap, markFirstHelloReceived };
}

/**
 * Registers netcode game callbacks and optionally defers connect for invite ?room=.
 * @param {{ current: object | null }} sessionBridgeCtx
 * @param {{ returnToMenu: (opts?: object) => void }} gameSession
 * @param {() => boolean} captureInviteRoomForDeferredMenu
 */
export function bootstrapNetcodeEntryFromUrl(sessionBridgeCtx, gameSession, captureInviteRoomForDeferredMenu) {
  if (typeof window === "undefined") return;
  Netcode.registerGameCallbacks(buildNetcodeGameBridge(() => sessionBridgeCtx.current, gameSession));
  if (captureInviteRoomForDeferredMenu()) return;
}

/**
 * Strips `?room=` from the URL without reloading the page.
 */
function stripRoomFromUrl() {
  if (typeof window === "undefined") return;
  // * Leaving the room makes any engaged-room refresh marker stale too.
  sessionRemove(SESSION_KEYS.engagedRoom);
  const url = new URL(window.location.href);
  if (!url.searchParams.has("room")) return;
  url.searchParams.delete("room");
  history.pushState({}, "", `${url.pathname}${url.search}`);
}

/**
 * Merges the netcode/gameplay bridge surface and the teardown patch into one
 * `sessionBridgeCtx.current` object. Call once after deps are bound.
 *
 * Teardown-patch keys (clearRoundCountdownTimeout, clearAutoContinuePodiumTimeout,
 * clearPodiumRoundTimeout, resetSlowMo, resetSimTiming, hideResultsOverlay,
 * resetLeaderHum, resetResultsOverlayKey, resetPodiumSessionState) arrive as deps —
 * this factory does not own round-lifecycle state (Lever D returns bound methods).
 *
 * @param {Record<string, unknown>} deps Bound handlers from main() (both former write sites).
 * @returns {Record<string, unknown>}
 */
export function buildSessionBridgeContext(deps) {
  const {
    clearRoundCountdownTimeout,
    clearAutoContinuePodiumTimeout,
    clearPodiumRoundTimeout,
    resetSlowMo,
    resetSimTiming,
    hideResultsOverlay,
    resetLeaderHum,
    resetResultsOverlayKey,
    resetPodiumSessionState,
    ...bridge
  } = deps;

  return {
    ...bridge,
    clearRoundCountdownTimeout,
    clearAutoContinuePodiumTimeout,
    clearPodiumRoundTimeout,
    resetSlowMo,
    resetSimTiming,
    hideResultsOverlay,
    resetLeaderHum,
    resetResultsOverlayKey,
    resetPodiumSessionState,
  };
}

/**
 * (Re)binds netcode runtime refs (input axis, ram/hop/shatter triggers). Must run on
 * every session cart bootstrap, not just boot: returnToMenu's clearNetcodeRuntimeRefs
 * nulls getAxisRef, and a null axis ref makes sampleLocalInputForTick a permanent no-op.
 *
 * @param {object} deps
 * @param {{ getAxis: () => { forward: number, turn: number }, isNitroHeld: () => boolean } | null | undefined} deps.input
 * @param {(refs: object) => void} deps.setRefs
 * @param {() => unknown} deps.getAllCartsRef
 * @param {{ current: unknown }} deps.resetSimTimingRef
 * @param {(cart: unknown, nowMs: number, opts?: object) => void} deps.triggerRamBoost
 * @param {(cart: unknown, nowMs: number) => void} deps.triggerHop
 * @param {Function} deps.triggerCartShatter
 * @param {Function} deps.doRespawn
 * @param {((axis: () => { forward: number, turn: number }) => void)=} deps.assignLocalAxisRef
 * @param {((fn: (cart: unknown, nowMs: number, opts?: object) => void) => void)=} deps.assignLocalRamBoostRef
 */
export function wireNetcodeRuntimeRefs(deps) {
  const {
    input,
    setRefs,
    getAllCartsRef,
    resetSimTimingRef,
    triggerRamBoost,
    triggerHop,
    triggerCartShatter,
    doRespawn,
    assignLocalAxisRef,
    assignLocalRamBoostRef,
  } = deps;
  if (!input) return;
  assignLocalAxisRef?.(input.getAxis);
  assignLocalRamBoostRef?.(triggerRamBoost);
  setRefs({
    getAllCartsRef,
    getAxisRef: input.getAxis,
    isNitroHeldRef: input.isNitroHeld,
    triggerRamBoostRef: triggerRamBoost,
    triggerHopRef: triggerHop,
    triggerCartShatterRef: triggerCartShatter,
    resetSimTimingRef,
    doRespawnRef: doRespawn,
  });
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
    getTriggerLocalHitTaken: () => getContext()?.getTriggerLocalHitTaken?.() ?? null,
    onRemoteBoostStart: (cart) => getContext()?.onRemoteBoostStart?.(cart),
    stopChargeSfxForCart: (cart) => getContext()?.stopChargeSfxForCart?.(cart),
    // * MP-FX-1: non-host remote hop land thud/dust — registerGameCallbacks reads deps.onHopLand.
    onHopLand: (cart, intensity) => getContext()?.onHopLand?.(cart, intensity),
    onCartImpactSquash: (rammerCart, victimCart, intensity) => {
      getContext()?.onCartImpactSquash?.(rammerCart, victimCart, intensity);
    },
    getTriggerCartShatterRef: () => getContext()?.getTriggerCartShatterRef?.() ?? null,
    getSceneRef: () => getContext()?.getSceneRef?.() ?? null,
    getHud: () => getContext()?.getHud?.() ?? null,
    onLocalKillConfirm: (victimSlotIndex, comboTier, koEvent) => {
      getContext()?.onLocalKillConfirm?.(victimSlotIndex, comboTier, koEvent);
    },
    onArenaKoFlash: (koEvent) => getContext()?.onArenaKoFlash?.(koEvent),
    onAnnouncerFall: (fall) => getContext()?.onAnnouncerFall?.(fall),
    onSpillBonusPresentation: (msg) => getContext()?.onSpillBonusPresentation?.(msg),
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
    onLevelIdChanged: (levelId) => getContext()?.onLevelIdChanged?.(levelId),
    onPodiumRejected: () => getContext()?.onPodiumRejected?.(),
    getPendingMidRoundJoinRespawnConnId: () => getContext()?.getPendingMidRoundJoinRespawnConnId?.() ?? null,
    setPendingMidRoundJoinRespawnConnId: (val) => getContext()?.setPendingMidRoundJoinRespawnConnId?.(val),
    ensureSessionReady: () => getContext()?.ensureSessionReady?.(),
    endCinematicCountdown: () => getContext()?.endCinematicCountdown?.(),
    teleportCartToSpawn: (slotIndex) => getContext()?.teleportCartToSpawn?.(slotIndex),
    // * Cap-63: these were never forwarded — registerGameCallbacks fell through to
    // * `?? true` / `?? false`, so non-host countdown hold never engaged (hello +
    // * host_round stamped countdown before carts-ready). Fail closed when ctx missing.
    isSessionPlayReady: () => {
      const ctx = getContext();
      if (ctx && typeof ctx.isSessionPlayReady === "function") return ctx.isSessionPlayReady();
      return false;
    },
    hasPendingNonHostCountdownApply: () => {
      const ctx = getContext();
      if (ctx && typeof ctx.hasPendingNonHostCountdownApply === "function") {
        return ctx.hasPendingNonHostCountdownApply();
      }
      return false;
    },
    // * CAM-PT-MP-1: host-side pre-roll hold, same fail-closed forwarding.
    hasPendingHostMpHold: () => {
      const ctx = getContext();
      if (ctx && typeof ctx.hasPendingHostMpHold === "function") {
        return ctx.hasPendingHostMpHold();
      }
      return false;
    },
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

    // * First: a play entry still warming up must not re-hide the menu after this
    // * teardown's initMenu (host-reload mid-round left the menu drawn over the game).
    invalidateActivePlayEntry();

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

  // * Player-facing copy for non-user-initiated menu returns; user-initiated
  // * reasons ("esc", "results") stay silent — the player chose to leave.
  const MENU_RETURN_NOTICES = {
    joinRejected: "Couldn't join that lobby — it's full or the connection timed out.",
    simError: "The round hit a physics glitch and had to stop. You're back at the menu.",
  };

  /**
   * Ends the current session and returns to the menu without a full page reload.
   *
   * @param {{ reason?: string }} [opts]
   */
  function returnToMenu(opts = {}) {
    // * Quit-location analytics: stamp the phase BEFORE teardown resets it to lobby.
    // * "esc"/"results" are chosen exits; "simError"/"joinRejected" are forced ones.
    trackEvent("player_quit", {
      reason: opts.reason ?? "menu",
      phase: GameState.getRoundState()?.phase ?? null,
    });
    teardownGameSession();
    stripRoomFromUrl();

    const ctx = getContext();
    try {
      ctx?.initMenu?.();
      const notice = MENU_RETURN_NOTICES[opts.reason ?? ""];
      if (notice) window.CartRave?.showToast?.(notice, 6000);
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
