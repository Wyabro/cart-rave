// loopDeps.js — visual / gameFlow / physics deps + host-tab pump (MAIN-1 Lever F)
// Mechanical extract from main(); attachDeps behavior unchanged.

import * as Simulation from "../simulation.js";
import * as Entities from "../entities.js";
import * as Netcode from "../netcode.js";
import * as GameState from "../gameState.js";
import * as HUD from "../hud.js";
import * as Input from "../input.js";
import * as AudioManager from "../audioManager.js";
import * as GroceryPool from "../effects/groceryPool.js";
import { updateCartVisuals } from "../cart.js";
import { triggerCartShatter } from "../cartShatter.js";
import {
  getDirectiveKoRewardMultiplier,
  onHostSpill as directiveOnHostSpill,
} from "../directives/directiveEngine.js";
import { armSpillBoost, spillCountForCart, stripLifeCargo } from "../cargoLoad.js";
import { announcerDirectorOnFall } from "../announcer/announcerDirector.js";
import { MSG } from "../config.js";

/** Host-away toast delay after tab hide (HOST-TAB-1). */
const HOST_AWAY_AFTER_MS = 10_000;

/**
 * Host-tab lifecycle + game-loop phase dependency bundles for gameContext.attachDeps.
 * Call {@link createLoopDeps} early for host-tab hooks; call `attachPhaseDeps` once
 * all cart/round/level closures exist.
 *
 * @param {object} deps
 * @param {() => { refresh?: () => void, getPumpTickCount?: () => number } | null} deps.getGameLoopDriver
 */
export function createLoopDeps(deps) {
  const { getGameLoopDriver } = deps;
  const detectGameMode = () => Netcode.detectGameMode();

  /** @type {ReturnType<typeof setTimeout> | null} */
  let hostAwayTimerId = null;

  function shouldPumpHiddenHost() {
    const phase = GameState.getRoundState().phase;
    return (
      Netcode.getIsHost()
      && detectGameMode() !== "testdrive"
      && (phase === "countdown" || phase === "running")
    );
  }

  function clearHostAwayTimer() {
    if (hostAwayTimerId == null) return;
    clearTimeout(hostAwayTimerId);
    hostAwayTimerId = null;
  }

  function armHostAwayTimerIfNeeded() {
    const mode = detectGameMode();
    if (
      !document.hidden
      || (mode !== "quickplay" && mode !== "friends")
      || !shouldPumpHiddenHost()
    ) {
      clearHostAwayTimer();
      return;
    }
    if (hostAwayTimerId != null) return;
    hostAwayTimerId = setTimeout(() => {
      hostAwayTimerId = null;
      if (document.hidden && shouldPumpHiddenHost()) Netcode.sendHostAway();
    }, HOST_AWAY_AFTER_MS);
  }

  function refreshHiddenHostLifecycle() {
    getGameLoopDriver()?.refresh();
    armHostAwayTimerIfNeeded();
  }

  /**
   * Build visual / gameFlow / physics bundles and attach them to gameContext.
   * @param {object} phase
   */
  function attachPhaseDeps(phase) {
    const {
      gameCtx,
      sharedLoopGetters,
      // visual
      netTargetPosScratch,
      cartLinvelScratch,
      cartAngvelScratch,
      onAutoQualityStepDown,
      buildCartMaterialCache,
      colorHexForSlot,
      isMuted,
      getSfxVolume,
      isMenuVisible,
      getHud,
      leaderHum,
      getMatchHistoryLength,
      updateResultsOverlay,
      positionNameLabels,
      composer,
      scene,
      camera,
      labelRenderer,
      canvas,
      BASE_FOV,
      cart,
      getArcadePass,
      fpsState,
      updateTouchControlsVisibility,
      // gameFlow / sim
      getLocalCart,
      scheduleRespawn,
      scheduleStuckRespawn,
      onCartOutOfPlay,
      maybeTriggerNpcOpportunisticRamBoost,
      maybeTriggerNpcOpportunisticHop,
      endRound,
      scheduleLastCartStandingFinish,
      abortLastCartStandingFlourish,
      onLocalKoConfirm,
      onLocalKillConfirm,
      onArenaKoFlash,
      getAllCartsRef,
      getWorld,
      getEventQueue,
      getBoothColliderHandles,
      getRecordColliderHandles,
      getPitWallColliderHandle,
      getAiAxis,
      getSpawnTrashBurstRef,
      triggerLocalRamShake,
      triggerLocalHitTaken,
      squashCartsOnImpact,
      triggerRamBoost,
      onBoostRelease,
      onBoostCancel,
      onHopLand,
      triggerSpillNetcode,
      stopChargeSfxForCart,
    } = phase;

    const visualDeps = {
      ...sharedLoopGetters,
      netTargetPosScratch,
      cartLinvelScratch,
      cartAngvelScratch,
      onAutoQualityStepDown,
      updateCartVisuals,
      buildCartMaterialCache,
      colorHexForSlot,
      isMuted,
      getSfxVolume,
      isMenuVisible,
      getAxis: Input.getAxis,
      get hud() { return getHud(); },
      leaderHum,
      HUD,
      getYouConnId: () => Netcode.getYouConnId(),
      getMatchHistoryLength,
      updateResultsOverlay,
      positionNameLabels,
      composer,
      scene,
      camera,
      labelRenderer,
      canvas,
      BASE_FOV,
      getShakeUntil: () => cart.getShakeUntil(),
      getShakeIntensity: () => cart.getShakeIntensity(),
      getFovPunchUntil: () => cart.getFovPunchUntil(),
      getFovPunchDeg: () => cart.getFovPunchDeg(),
      getKillFlash: () => cart.getKillFlash(),
      getImpactPulse: () => cart.getImpactPulse(),
      getHitStop: () => cart.getHitStop(),
      getArcadePass,
      fpsState,
      updateTouchControlsVisibility,
    };

    const gameFlowDeps = {
      ...sharedLoopGetters,
      detectGameMode,
      getLastHitBy: () => GameState.getLastHitBy(),
      // * Per-arena kill-zone classifier for buildKOEvent (Storerooms corner voids → 2×).
      classifyKillZone: Simulation.classifyLevelKillZone,
      // * Living Store directive KO-reward boost (Double Bag). Dep-injected so koEvent.js
      // * stays a leaf module; the falls[] wire carries the boosted reward to clients.
      getDirectiveKoRewardMultiplier,
      getLocalCart,
      scheduleRespawn,
      scheduleStuckRespawn,
      doRespawn: Entities.doRespawn,
      onCartOutOfPlay,
      maybeTriggerNpcOpportunisticRamBoost,
      maybeTriggerNpcOpportunisticHop,
      endRound,
      scheduleLastCartStandingFinish,
      abortLastCartStandingFlourish,
      addScore: GameState.addScore,
      isScoreTied: GameState.isScoreTied,
      setSuddenDeath: GameState.setSuddenDeath,
      setLocalCombo: GameState.setLocalCombo,
      colorHexForSlot,
      get hud() { return getHud(); },
      sendHostRound: () => Netcode.sendHostRound(),
      getPartySocket: () => Netcode.getPartySocket(),
      queueHostFallEvent: Netcode.queueHostFallEvent,
      onKoConfirmPreview: (preview) => {
        const localSlotIndex = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        if (preview.attackerSlotIndex === localSlotIndex) {
          onLocalKoConfirm(preview.victimSlotIndex);
        }
        Netcode.sendP2PEvent({ type: MSG.koConfirm, ...preview });
      },
      onLocalKillConfirm,
      onArenaKoFlash,
      onAnnouncerFall: announcerDirectorOnFall,
      getYouConnId: () => Netcode.getYouConnId(),
      getScene: () => scene,
      triggerCartShatter,
      onSpill: (slotIndex, pos, quat, vel, cargoBay) => {
        const carts = getAllCartsRef();
        const cartRef = carts?.[slotIndex];
        const spillCount = spillCountForCart(cartRef);
        GroceryPool.triggerSpill(String(slotIndex), pos, quat, vel, spillCount, cargoBay || cartRef?.cargoBay || null);
        // * Always clear every cargoBay under the cart mesh (ref can be stale after rebuild).
        GroceryPool.hideCargoBay(cartRef || cargoBay);
        stripLifeCargo(cartRef);
        armSpillBoost(cartRef);
        // * Living Store "Spill Bonus" — host awards the recent rammer while active.
        directiveOnHostSpill(slotIndex);
        triggerSpillNetcode(slotIndex, pos, quat, vel, cargoBay, spillCount);
      },
      onCartRespawn: (slotIndex) => {
        GroceryPool.releaseByCartId(String(slotIndex));
      },
      getWorld,
      getBoothColliderHandles,
    };

    const hostSimCallbacks = {
      getAxis: Input.getAxis,
      getAiAxis,
      playCollision: (intensity, opts) => AudioManager.playCartCrash(intensity, opts),
      spawnTrashBurst: getSpawnTrashBurstRef(),
      onLocalRamImpact: triggerLocalRamShake,
      onLocalHitTaken: triggerLocalHitTaken,
      onCartImpactSquash: squashCartsOnImpact,
      // * NH-HIT: prediction rams on non-host stamp collision FX dedupe (see simulation.js).
      noteOptimisticCollisionFx: (a, b, r) => Netcode.noteOptimisticCollisionFx(a, b, r),
      // * Sim re-arms charge while boostHeld after reconcile cancel (NH-BOOST).
      triggerRamBoost,
      onBoostRelease,
      onBoostCancel,
      onHopLand,
      onSpill: (spillCart) => {
        const pos = spillCart.body.translation();
        const quat = spillCart.body.rotation();
        const vel = spillCart.body.linvel();
        const cargoBay = spillCart.cargoBay;
        const spillCount = spillCountForCart(spillCart);
        GroceryPool.triggerSpill(String(spillCart.slotIndex), pos, quat, vel, spillCount, cargoBay);
        GroceryPool.hideCargoBay(spillCart);
        stripLifeCargo(spillCart);
        armSpillBoost(spillCart);
        // * Living Store "Spill Bonus" — host awards the recent rammer while active.
        directiveOnHostSpill(spillCart.slotIndex);
        triggerSpillNetcode(spillCart.slotIndex, pos, quat, vel, cargoBay, spillCount);
      },
      get partySocket() { return Netcode.getPartySocket(); },
      get recordColliderHandles() { return getRecordColliderHandles(); },
      get pitWallColliderHandle() { return getPitWallColliderHandle(); },
      get boothColliderHandles() { return getBoothColliderHandles(); },
      playFloorImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }),
      playEdgeImpact: (i = 0.5) => AudioManager.playSfx("floor", undefined, { volume: 0.45 + Math.min(Math.max(i, 0), 1) * 0.55 }),
      resolveCartForConn: (connId) => {
        const idx = Netcode.strictSlotIndexForConn(connId);
        return idx >= 0 ? getAllCartsRef()[idx] : null;
      },
    };

    const clientSimCallbacks = {
      ...hostSimCallbacks,
      getAiAxis: null,
      // * SIM-CALLBACK-FREEZE-1: the spread above invokes hostSimCallbacks' getters once and
      // * copies their results — pit/booth/record handles are still empty pre-arena-load, so a
      // * plain copy would freeze the non-host bundle on those empties and misclassify every
      // * environment contact as "floor". Re-declare the getters to keep the client bundle live.
      get partySocket() { return Netcode.getPartySocket(); },
      get recordColliderHandles() { return getRecordColliderHandles(); },
      get pitWallColliderHandle() { return getPitWallColliderHandle(); },
      get boothColliderHandles() { return getBoothColliderHandles(); },
      onSpill: (spillCart) => {
        const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        // * Non-host client only predicts tip-over spills for own local cart;
        // * remote cart & NPC spills are driven authoritatively by host MSG.spill broadcast.
        if (spillCart?.slotIndex !== localSlot) return;
        hostSimCallbacks.onSpill(spillCart);
      },
    };

    const physicsDeps = {
      ...sharedLoopGetters,
      get world() { return getWorld(); },
      get eventQueue() { return getEventQueue(); },
      getAllCartsRef,
      getLocalCart,
      shouldUseClientPrediction: () => Netcode.shouldUseClientPrediction(),
      ...gameCtx.getSlowMoDeps(),
      getSkipNextPhysicsStep: () => Netcode.getSkipNextPhysicsStep(),
      setSkipNextPhysicsStep: (skip) => Netcode.setSkipNextPhysicsStep(skip),
      getRemoteInputsByConnId: () => Netcode.getRemoteInputsByConnId(),
      getHostMigrationFreezeUntilMs: () => Netcode.getHostMigrationFreezeUntilMs(),
      updateRemoteCartNetTargets: (idx) => Netcode.updateRemoteCartNetTargets(idx),
      syncRemoteCartBodiesForPrediction: (idx) => Netcode.syncRemoteCartBodiesForPrediction(idx),
      sampleAuthoritativeCartState: (idx) => Netcode.sampleAuthoritativeCartState(idx),
      runFixedPhysicsStep: Simulation.runFixedPhysicsStep,
      getSimulationCallbacks: (isHost) => (isHost ? hostSimCallbacks : clientSimCallbacks),
      getPendingInputs: () => Netcode.getPendingInputs(),
      prunePendingInputs: (ackSeq) => Netcode.prunePendingInputs(ackSeq),
      getLatestSnap: () => Netcode.getLatestSnap(),
      applySnapshotToCartBody: (cartBody, snap) => Netcode.applySnapshotToCartBody(cartBody, snap),
      doRespawn: Entities.doRespawn,
      // * Reconcile replay ends charge without boost fanfare (SFX stop only).
      stopChargeSfxForCart: (c) => cart.stopChargeSfxForCart(c),
      netcode: Netcode,
    };

    gameCtx.attachDeps({
      visual: visualDeps,
      gameFlow: gameFlowDeps,
      physics: physicsDeps,
    });

    return { visualDeps, gameFlowDeps, physicsDeps, hostSimCallbacks, clientSimCallbacks };
  }

  return {
    shouldPumpHiddenHost,
    clearHostAwayTimer,
    armHostAwayTimerIfNeeded,
    refreshHiddenHostLifecycle,
    attachPhaseDeps,
  };
}
