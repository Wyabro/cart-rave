// gameLoop.js — requestAnimationFrame timing shell (fixed-timestep accumulator)

import { captureCartsPhysicsPrevPoses } from "./entities.js";
import { isShatterAnimating } from "./cartShatter.js";
import { sendErrorLogLimited } from "./utils/errorReporter.js";
import { recordDiagEvent } from "./utils/diagnostics.js";
import { tickAiStallWatchdog } from "./utils/aiStallWatchdog.js";
import { trimPendingForReconcileReplay } from "./utils/reconcileReplay.js";

export { updateVisualsAndEffects } from "./frameVisuals.js";

/** @type {object[] | null} */
let _npcCache = null;
/** @type {string | null} */
let _npcCacheKey = null;
/** @type {number} */
let lastReconciledSnapSeq = -1;
/** Rate limiter for perf/longframe diag events (ms timestamp of last record). */
let _lastLongFrameLogMs = 0;

// * ---- Reconcile visual-offset capture (run-4 "laggy-rubberbandy" fix) ----
// * Reconciliation hard-snaps the local Rapier body to host truth and replays unacked
// * inputs — correct for physics, but the mesh rendered straight off the body jerked on
// * EVERY snapshot (up to 40Hz) whenever prediction diverged at all. Instead of snapping
// * the visual too, the pre-correction ↔ post-correction pose delta accumulates into
// * cart._reconcileVisOffset, which frameVisuals applies to the mesh and decays to zero
// * at CONFIG.net.prediction.reconcilePosRate/reconcileRotRate (those knobs were dead
// * config until now). Physics stays authoritative; only the rendered pose eases.
const _reconPre = { x: 0, y: 0, z: 0, yaw: 0 };

/** Y-axis (heading) angle of a Rapier rotation quaternion. */
function yawFromQuat(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

/** Wraps an angle to [-PI, PI]. */
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clearReconcileVisOffset(cart) {
  const off = cart?._reconcileVisOffset;
  if (off) { off.x = 0; off.y = 0; off.z = 0; off.yaw = 0; }
}

function captureReconcilePrePose(cart) {
  const t = cart?.body?.translation?.();
  const r = cart?.body?.rotation?.();
  if (!t || !r) return false;
  _reconPre.x = t.x; _reconPre.y = t.y; _reconPre.z = t.z;
  _reconPre.yaw = yawFromQuat(r);
  return true;
}

/** Folds the post-correction pose delta into the cart's visual offset (see block comment). */
function accumulateReconcileVisOffset(cart, pcfg, noteReconcileError) {
  const t = cart?.body?.translation?.();
  const r = cart?.body?.rotation?.();
  if (!t || !r || !pcfg) return;
  const dx = _reconPre.x - t.x;
  const dy = _reconPre.y - t.y;
  const dz = _reconPre.z - t.z;
  const errM = Math.hypot(dx, dy, dz);
  const maxM = pcfg.maxCorrectionM ?? 4.0;
  const off = cart._reconcileVisOffset || (cart._reconcileVisOffset = { x: 0, y: 0, z: 0, yaw: 0 });
  if (errM >= maxM) {
    // * Teleport-scale correction (respawn, hard desync): snap the visual too.
    off.x = 0; off.y = 0; off.z = 0; off.yaw = 0;
    noteReconcileError?.(errM, true);
    return;
  }
  off.x += dx; off.y += dy; off.z += dz;
  if (Math.hypot(off.x, off.y, off.z) > maxM) {
    // * Accumulated debt exceeds the teleport threshold — stop hiding it.
    off.x = 0; off.y = 0; off.z = 0; off.yaw = 0;
  } else {
    off.yaw = wrapAngle(off.yaw + wrapAngle(_reconPre.yaw - yawFromQuat(r)));
    // * A heading offset past ~86° means prediction and host disagree about which way
    // * the cart faces — easing that reads as drunk steering; snap heading instead.
    if (Math.abs(off.yaw) > 1.5) off.yaw = 0;
  }
  noteReconcileError?.(errM, false);
}

/**
 * Resets the client reconciliation sequence gate.
 * Must run on host migration and rematch so a new hostSeq (or continued play after
 * a long round) cannot leave `seq > lastReconciledSnapSeq` permanently false.
 */
export function resetReconciliationState() {
  lastReconciledSnapSeq = -1;
}

/** Clears cached NPC cart refs after session teardown (bodies are removed from Rapier). */
export function clearNpcCartCache() {
  _npcCache = null;
  _npcCacheKey = null;
  resetReconciliationState();
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

/** Dev-only: last time we logged a substep-cap warning (ms). */
let _lastSubstepCapWarnMs = 0;
const SUBSTEP_CAP_WARN_INTERVAL_MS = 4000;

/**
 * After the fixed-step while-loop: clamp spiral-of-death debt and (in DEV)
 * rate-limit the "substep cap hit" console warning so eruda isn't flooded when
 * Low-tier maxSubsteps=2 and the device is chronically under 60fps.
 *
 * When the cap is hit with ≥1 full step still queued, drop whole leftover steps
 * and keep only the fractional remainder for visual interpolation — otherwise
 * every subsequent frame re-hits the cap with ~17ms "unprocessed" forever.
 *
 * @param {GameLoopState} loopState
 * @param {number} substeps
 * @param {{ fixedTimeStep: number, maxSubsteps: number }} config
 */
function settlePhysicsDebt(loopState, substeps, config) {
  const dt = config.fixedTimeStep;
  const maxDebt = dt * config.maxSubsteps;

  if (substeps >= config.maxSubsteps && loopState.accumulator >= dt) {
    if (import.meta.env.DEV) {
      const now = performance.now();
      if (now - _lastSubstepCapWarnMs >= SUBSTEP_CAP_WARN_INTERVAL_MS) {
        _lastSubstepCapWarnMs = now;
        console.warn(
          `[gameLoop] Physics substep cap hit with remaining debt: ${substeps} substeps, ` +
            `${(loopState.accumulator * 1000).toFixed(1)}ms unprocessed ` +
            `(rate-limited; device behind fixed step — debt fractionalized)`,
        );
      }
    }
    // * Keep fraction only — stops permanent catch-up thrash at the cap.
    loopState.accumulator = loopState.accumulator % dt;
    return;
  }

  if (loopState.accumulator > maxDebt) {
    loopState.accumulator = maxDebt;
  }
}

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
 * @property {(slotIndex: number) => object | null} sampleAuthoritativeCartState
 * @property {(isHost: boolean) => object} getSimulationCallbacks
 * @property {(args: object) => void} runFixedPhysicsStep
 * @property {() => Array<object>} [getPendingInputs]
 * @property {(ackSeq: number) => void} [prunePendingInputs]
 * @property {() => object | null} [getLatestSnap]
 * @property {(cart: object, snap: object) => void} [applySnapshotToCartBody]
 * @property {(cart: object) => void} [doRespawn]
 * @property {object} netcode Netcode module.
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
    // * Step physics during lobby/countdown so carts settle under gravity at spawn
    // * (prevents host cart appearing visually frozen after color pick). Driving
    // * input and NPC AI are gated on phase==="running" inside runFixedPhysicsStep.
    if (deps.getRoundState().phase !== "podium") {
      const allCarts = deps.getAllCartsRef();
      if (Array.isArray(allCarts)) {
        const npcCartsForFrame = resolveNpcCarts(allCarts, netSlotsForFrame);

        let stepNow = performance.now();
        while (loopState.accumulator >= deps.CONFIG.fixedTimeStep && substeps < deps.CONFIG.maxSubsteps) {
          if (deps.getSkipNextPhysicsStep()) {
            deps.setSkipNextPhysicsStep(false);
            loopState.accumulator -= deps.CONFIG.fixedTimeStep;
            substeps += 1;
            stepNow += deps.CONFIG.fixedTimeStep * 1000;
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
            now: stepNow,
            isHost: deps.isHost(),
            callbacks: deps.getSimulationCallbacks(true),
          });
          loopState.accumulator -= deps.CONFIG.fixedTimeStep;
          substeps += 1;
          stepNow += deps.CONFIG.fixedTimeStep * 1000;
        }
        settlePhysicsDebt(loopState, substeps, deps.CONFIG);
        alpha = loopState.accumulator / deps.CONFIG.fixedTimeStep;

        // * Dev-only AI stall watchdog (host-gated by this branch). One guarded call per frame;
        // * the property read is the only cost when ?diag is absent. Only assess a live round so
        // * carts settling at spawn during countdown don't read as stalls.
        if (
          typeof window !== "undefined" &&
          /** @type {any} */ (window).__ccDiagActive &&
          deps.getRoundState().phase === "running"
        ) {
          tickAiStallWatchdog(npcCartsForFrame, stepNow);
        }
      } else {
        loopState.accumulator = 0;
      }
    } else {
      loopState.accumulator = 0;
    }
  } else if (deps.shouldUseClientPrediction()) {
    // * Multiplayer client: prediction + reconciliation (solo never enters this branch).
    const localSlotIndex = localSlotIndexThisFrame;

    if (performance.timeOrigin + performance.now() < deps.getHostMigrationFreezeUntilMs()) {
      // * Hold positions until a new host's snapshots arrive after migration.
      // * Monotonic clock (matches netcode's getMonotonicNow that sets the freeze deadline).
      // * Drain accumulator debt so the freeze window does not pile up ~300ms of
      // * catch-up substeps (and "Physics substep cap hit" warnings) when it ends.
      // * Do NOT touch lastT — the outer rAF loop owns frame timing.
      loopState.accumulator = 0;
    } else {
      // 1. Interpolate remote players from the host snapshot buffer (not the local cart).
      deps.updateRemoteCartNetTargets(localSlotIndex);
      // 2. Align remote physics bodies so prediction collides against current net poses.
      deps.syncRemoteCartBodiesForPrediction(localSlotIndex);

      // * Hold live prediction when the host is silent or already reports us dead.
      // * Run-7 efdca62 retest: multi-second host freezes left Intel driving a ghost
      // * arena (hit feedback then reverse; death shatter at the predicted "still here"
      // * pose). Silence threshold = prediction.holdAfterSnapGapMs (default 150).
      const predCfg = deps.CONFIG.net?.prediction;
      const holdGapMs = predCfg?.holdAfterSnapGapMs ?? 150;
      const silenceMs = typeof deps.netcode?.getSnapshotSilenceMs === "function"
        ? deps.netcode.getSnapshotSilenceMs()
        : 0;
      const peekSnap = deps.getLatestSnap ? deps.getLatestSnap() : null;
      const peekLocal = (peekSnap?.carts && localSlotIndex >= 0)
        ? peekSnap.carts[localSlotIndex]
        : null;
      const hostSaysDead = peekLocal?.s === true
        || Boolean(localCart?.hasSpilled)
        || Boolean(localCart?._shatterState);
      const holdPrediction = hostSaysDead || (holdGapMs > 0 && silenceMs > holdGapMs);

      // 3. Prediction: step Rapier locally with the player's input (instant feel).
      if (deps.getRoundState().phase === "running" && !holdPrediction) {
        const allCarts = deps.getAllCartsRef();
        if (Array.isArray(allCarts)) {
          let stepNow = performance.now();
          while (loopState.accumulator >= deps.CONFIG.fixedTimeStep && substeps < deps.CONFIG.maxSubsteps) {
            captureCartsPhysicsPrevPoses(allCarts);
            const currentInput = deps.netcode.sampleLocalInputForTick();
            deps.runFixedPhysicsStep({
              world: deps.world,
              eventQueue: deps.eventQueue,
              allCarts,
              localCart,
              remoteInputs: null,
              npcs: [],
              dt: deps.CONFIG.fixedTimeStep,
              now: stepNow,
              isHost: false,
              callbacks: deps.getSimulationCallbacks(false),
              localInputOverride: currentInput,
            });
            loopState.accumulator -= deps.CONFIG.fixedTimeStep;
            substeps += 1;
            stepNow += deps.CONFIG.fixedTimeStep * 1000;
          }
          settlePhysicsDebt(loopState, substeps, deps.CONFIG);
          alpha = loopState.accumulator / deps.CONFIG.fixedTimeStep;
        } else {
          loopState.accumulator = 0;
        }
      } else {
        // * Drain debt so a long hold does not burst-catch-up when snaps resume.
        loopState.accumulator = 0;
        // * Still sample+send axes while held (host needs continuous input). Skip when
        // * host already reports us dead — no authority work left for this body.
        if (deps.getRoundState().phase === "running" && !hostSaysDead) {
          deps.netcode.sampleLocalInputForTick?.();
        }
      }

      // 4. Reconciliation: client-side rewind and replay prediction.
      const latestSnap = deps.getLatestSnap ? deps.getLatestSnap() : null;
      if (latestSnap && latestSnap.seq > lastReconciledSnapSeq) {
        lastReconciledSnapSeq = latestSnap.seq;
        const cartSnap = (latestSnap.carts && localSlotIndex >= 0) ? latestSnap.carts[localSlotIndex] : null;
        if (cartSnap && Array.isArray(cartSnap.p) && cartSnap.p.length === 3) {
          if (localCart._shatterState && deps.doRespawn) {
            // * Mirror the remote-cart rule (netcode.js applyCartState): the shatter's
            // * own lifetime decides when the VFX ends, not the next snapshot. The host
            // * still reports s:true (dead) on the reconcile right after the fall event
            // * fires — respawning here killed the local player's death shatter one
            // * frame after it spawned (07-17 playtest: "non host deaths have no
            // * shatter effect"). Hold until the host reports alive AND the animation
            // * has run out.
            if (!cartSnap.s && !isShatterAnimating(localCart, performance.now())) {
              deps.doRespawn(localCart);
              deps.applySnapshotToCartBody(localCart, cartSnap);
              clearReconcileVisOffset(localCart); // Respawn teleports clean — no eased correction
              deps.prunePendingInputs(99999999); // Clear all inputs on respawn
            } else {
              const ackSeq = cartSnap.ackSeq || 0;
              deps.prunePendingInputs(ackSeq);
              // * Keep death pose glued to host while shatter plays (prediction is held).
              if (cartSnap.s === true) {
                deps.applySnapshotToCartBody(localCart, cartSnap);
                clearReconcileVisOffset(localCart);
              }
            }
          } else if (cartSnap.s === true) {
            const ackSeq = cartSnap.ackSeq || 0;
            deps.prunePendingInputs(ackSeq);
            // * Host says dead: hard-snap body so the next fall shatter (or residual
            // * mesh) is at host death pose, not the last predicted drive-through.
            deps.applySnapshotToCartBody(localCart, cartSnap);
            clearReconcileVisOffset(localCart);
          } else {
            const ackSeq = cartSnap.ackSeq || 0;
            deps.prunePendingInputs(ackSeq);

            // * Remember the predicted pose so the visual can ease across the correction
            // * instead of jerking with the body snap below (run-4 rubberbanding).
            const havePrePose = captureReconcilePrePose(localCart);

            // Hard-snap local cart body to host authoritative state
            deps.applySnapshotToCartBody(localCart, cartSnap);

            // Replay outstanding inputs in sequence (bounded — see trimPendingForReconcileReplay).
            const pendingInputs = deps.getPendingInputs ? deps.getPendingInputs() : [];
            const replayMax = predCfg?.reconcileReplayMaxSteps ?? 8;
            const dropped = trimPendingForReconcileReplay(pendingInputs, replayMax);
            if (dropped > 0 && deps.netcode?.noteReconcileReplayTruncate) {
              deps.netcode.noteReconcileReplayTruncate(dropped);
            }
            // * Skip-replay-on-overload (run-7 combat): when the step cap drops inputs, or
            // * the snap that just arrived crossed a multi-tick host silence (≥500ms),
            // * replaying a truncated/stale stream reconstructs the wrong fight. Host
            // * pose alone is more honest; live prediction restarts next frames.
            const arrivalGapMs = typeof deps.netcode?.getLastSnapshotArrivalGapMs === "function"
              ? deps.netcode.getLastSnapshotArrivalGapMs()
              : 0;
            const skipReplay = dropped > 0 || arrivalGapMs >= 500;
            if (skipReplay) {
              deps.netcode?.noteReconcileReplaySkip?.();
              // * Record pre→host error for F8 probes, then clear visual offset so a
              // * multi-meter post-stall correction does not ease-slide across the arena.
              if (havePrePose) {
                accumulateReconcileVisOffset(
                  localCart,
                  predCfg,
                  deps.netcode?.noteReconcileError,
                );
              }
              clearReconcileVisOffset(localCart);
            } else {
              const allCarts = deps.getAllCartsRef();
              const replayCallbacks = {
                ...deps.getSimulationCallbacks(false),
                // * Suppress combo tier + ChallengeTracker side effects — live prediction
                // * already counted them; replaying unacked inputs must not inflate combo_t2
                // * / spill challenge progress on every reconcile.
                isReconcileReplay: true,
                playCollision: null,
                spawnTrashBurst: null,
                onLocalRamImpact: null,
                onLocalHitTaken: null,
                onCartImpactSquash: null,
                onBoostRelease: null,
                onBoostCancel: null,
                onSpill: null,
                onHopLand: null,
                triggerHopRef: (cart) => {
                  if (!cart?.body) return;
                  // * Replay hops bypass the wall-clock cooldown: each press produces exactly
                  // * one hop:true input frame (one-shot consume in sampleLocalInputForTick),
                  // * and every reconcile pass rewinds to pre-hop host state first — the
                  // * impulse must re-apply or the predicted hop dies on the next snapshot.
                  // * lastHopAtMs is NOT restamped (it belongs to the live press-time cooldown).
                  // * Prediction-only hop: impulse + landing-edge flags, no SFX/VFX
                  // * (onHopLand is null in this replay callback set).
                  cart.hopAwaitingLand = true;
                  cart.hopAirborne = false;
                  cart.body.applyImpulse({ x: 0, y: deps.CONFIG.cart.hop.impulse, z: 0 }, true);
                },
              };

              for (let i = 0; i < pendingInputs.length; i++) {
                const input = pendingInputs[i];
                deps.runFixedPhysicsStep({
                  world: deps.world,
                  eventQueue: deps.eventQueue,
                  allCarts,
                  localCart,
                  remoteInputs: null,
                  npcs: [],
                  dt: deps.CONFIG.fixedTimeStep,
                  now: input.tClient,
                  isHost: false,
                  callbacks: replayCallbacks,
                  localInputOverride: input.input,
                });
              }

              // * Post-replay: fold the correction delta into the eased visual offset.
              if (havePrePose) {
                accumulateReconcileVisOffset(
                  localCart,
                  predCfg,
                  deps.netcode?.noteReconcileError,
                );
              }
            }
          }
        }
      }
    }
  } else {
    // Non-host without prediction (defensive fallback): interpolate all carts from buffer.
    if (performance.timeOrigin + performance.now() < deps.getHostMigrationFreezeUntilMs()) {
      // hold (monotonic clock — matches netcode's freeze deadline)
      loopState.accumulator = 0;
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
  resetReconciliationState();
}

/**
 * @typedef {object} GameLoopCallbacks
 * @property {() => boolean} [shouldSkipTiming] When true, skips dt/accumulator updates and
 *   both frame phases for this tick but keeps the loop running (menu overlay).
 * @property {(ctx: FrameContext) => void} onFrame Simulation + game logic: physics substeps,
 *   netcode, host fall detection, camera follow, etc.
 * @property {(ctx: FrameContext) => void} [onVisualUpdate] Post-physics phase: mesh sync,
 *   effects, HUD, and render. Typically delegates to {@link updateVisualsAndEffects}.
 * @property {(err: unknown) => void} [onStepError] Invoked when a frame throws a
 *   *recoverable* fault. The rAF loop continues (a transient bad frame should not freeze
 *   the tab).
 * @property {(err: unknown) => void} [onFatalError] Invoked once when a frame throws an
 *   *unrecoverable* wasm/physics fault (see {@link isUnrecoverableSimError}) or throws
 *   continuously past {@link MAX_STEP_ERROR_STREAK}. The sim has stopped stepping; the
 *   handler should bail to a safe state (e.g. return to menu). The outer rAF stays alive.
 */

/**
 * Wasm/Rapier faults that poison the physics world for the rest of the session: once
 * thrown, the same body/world access re-throws on every subsequent frame. Blindly
 * rescheduling into that dead world (the old behavior) turns a single fault into an
 * unkillable death-loop that beacon-floods the error reporter — worse UX than a clean stop.
 */
const UNRECOVERABLE_SIM_ERROR_PATTERNS = [
  "recursive use of an object",
  "unsafe aliasing",
  "null pointer passed to rust",
  "already borrowed",
  "unreachable",
];

/**
 * @param {unknown} err
 * @returns {boolean} True when the error indicates an unrecoverable wasm/physics fault.
 */
function isUnrecoverableSimError(err) {
  if (typeof WebAssembly !== "undefined" && err instanceof WebAssembly.RuntimeError) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  return UNRECOVERABLE_SIM_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** A frame that throws this many times in a row is treated as unrecoverable (~1s at 60fps). */
const MAX_STEP_ERROR_STREAK = 60;

/**
 * Inter-frame gap (seconds) above which the loop treats the frame as a *resume* from a
 * pause/throttle rather than a slow frame. rAF is paused or throttled when the tab is
 * hidden, the window is occluded/unfocused, or during a long GC — and only the tab
 * hide/show case fires visibilitychange. Replaying that whole gap as physics catch-up is
 * the "hard stutter on refocus" from the playtest; above this threshold we drop the debt
 * and resume cleanly instead. 250ms is well past any legitimately slow frame (even Low
 * tier ~15fps = 66ms) so real gameplay hitches are unaffected.
 *
 * A genuine resume is ONE over-gap frame. When *every* frame is over the gap the device
 * is chronically slow (SwiftShader compat mode, an overloaded machine, the quickplay
 * join cold-load), not resuming — and zeroing the accumulator each frame would mean no
 * physics substep ever runs. For a non-host client, input is sampled inside the
 * prediction substep loop, so that failure mode is a cart permanently welded to spawn
 * (the NET-2 "stuck joiner" mechanism). Only the FIRST over-gap frame gets resume
 * treatment; consecutive ones step the sim with the normal clamped dt.
 */
const RESUME_GAP_S = 0.25;

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
  const { onFrame, onVisualUpdate, shouldSkipTiming, onStepError, onFatalError } = callbacks;

  // * Unrecoverable-error tripwire. Reset on any menu/overlay frame and after any fully
  // * successful frame, so a fresh session starts with a clean slate.
  let stepErrorStreak = 0;
  let fatalHandled = false;
  // * Consecutive over-RESUME_GAP frames. 0→1 is a genuine resume (drop debt); ≥2 means
  // * the device is chronically slow and the sim must keep stepping (see RESUME_GAP_S).
  let overGapStreak = 0;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resetGameLoopTiming(loopState);
    }
  });

  function step(now) {
    if (shouldSkipTiming?.()) {
      // * Menu/overlay frame — no sim ran this tick, so clear the tripwire (a bail-to-menu
      // * recovery lands here, and the next real session must be able to trip fresh).
      stepErrorStreak = 0;
      fatalHandled = false;
      // * The next game frame's large dt (time spent in the menu) is a fresh resume.
      overGapStreak = 0;
      requestAnimationFrame(step);
      return;
    }

    try {
      let dt = (now - loopState.lastT) / 1000;
      loopState.lastT = now;
      // * Netcode-harness loop-liveness counters (tools/netharness.mjs) — lets the rig tell a
      // * starved/throttled joiner loop from a real netcode stall. Off unless ?nettest set the
      // * flag; the guard is a single property read per frame in normal play.
      const overGap = dt > RESUME_GAP_S;
      overGapStreak = overGap ? overGapStreak + 1 : 0;
      const isResume = overGap && overGapStreak === 1;
      if (typeof window !== "undefined" && (window.__ccNetTest || window.__ccDiagActive)) {
        const d = (window.__ccLoopDbg =
          window.__ccLoopDbg || { frames: 0, resumeZeroed: 0, chronicSlow: 0, maxDt: 0, lastDt: 0, over33: 0, over66: 0 });
        d.frames += 1;
        d.lastDt = dt;
        if (dt > d.maxDt) d.maxDt = dt;
        if (isResume) d.resumeZeroed += 1;
        else if (overGap) d.chronicSlow = (d.chronicSlow || 0) + 1;
        // * Sub-longframe hitch counters (run-4): the non-host video showed ~67ms stalls
        // * every ~1.1s — under the 100ms event threshold, so bundles carried no trace.
        // * Counters are cheap and make "how hitchy was this round" a probe read.
        if (dt > 0.033 && !isResume) {
          d.over33 = (d.over33 || 0) + 1;
          if (dt > 0.066) d.over66 = (d.over66 || 0) + 1;
        }
        // * Hitch forensics: individual long frames land in the diag event ring with
        // * timestamps, so an F8 bundle shows WHEN the hitches hit relative to KOs,
        // * announcer lines, and boot phases — maxDt alone can't. Rate-limited so a
        // * hitch storm can't flush the ring.
        if (dt > 0.1 && now - _lastLongFrameLogMs > 500) {
          _lastLongFrameLogMs = now;
          recordDiagEvent("perf", "longframe", { dtMs: Math.round(dt * 1000), resume: isResume });
        }
      }
      if (isResume) {
        // * Resume from a pause/throttle (tab hidden, window occluded/unfocused, long GC).
        // * Don't replay the gap as a physics catch-up burst — that's the hard hitch on
        // * refocus. Drop the accumulated debt and render one fresh, motionless frame; the
        // * next frame resumes at normal cadence. Complements the visibilitychange reset
        // * (which only fires for true tab hide/show, not occlusion/defocus throttling).
        loopState.accumulator = 0;
        dt = 0;
      } else {
        // * Normal frame — or a chronically slow device where every frame is over the gap
        // * (overGapStreak ≥ 2): clamp and keep stepping so input sampling and physics
        // * still run (slow, not frozen). A real resume never has two over-gap frames in
        // * a row, so the refocus-stutter fix is unaffected.
        dt = Math.min(dt, 0.05);
      }
      loopState.accumulator += dt;
      loopState.simFrameIndex += 1;

      const frameCtx = { now, dt, loopState };
      onFrame(frameCtx);
      onVisualUpdate?.(frameCtx);

      // * Full frame succeeded — clear the unrecoverable-error tripwire.
      stepErrorStreak = 0;
      fatalHandled = false;

      requestAnimationFrame(step);
    } catch (err) {
      stepErrorStreak += 1;
      const unrecoverable = isUnrecoverableSimError(err) || stepErrorStreak >= MAX_STEP_ERROR_STREAK;

      if (unrecoverable) {
        // * A poisoned wasm world re-throws on every body access, so the old "always
        // * reschedule" path beacon-flooded the reporter and buried the first (diagnostic)
        // * stack. Log it once, hand off to recovery (bail to menu), and keep the outer
        // * rAF alive so the menu still animates — once menuVisible flips true, the
        // * shouldSkipTiming branch above stops running onFrame against the dead world.
        if (!fatalHandled) {
          fatalHandled = true;
          console.error("[gameLoop] Unrecoverable sim error — bailing to menu:", err);
          sendErrorLogLimited(err, { context: "gameLoopFatal", streak: stepErrorStreak });
          recordDiagEvent("error", "fatal", {
            message: err instanceof Error ? err.message : String(err),
            streak: stepErrorStreak,
          });
          try {
            onFatalError?.(err);
          } catch (recoveryErr) {
            console.error("[gameLoop] onFatalError handler threw:", recoveryErr);
          }
        }
        requestAnimationFrame(step);
        return;
      }

      console.error("[gameLoop] Step error:", err);
      sendErrorLogLimited(err, { context: "gameLoop" });
      recordDiagEvent("error", "step", {
        message: err instanceof Error ? err.message : String(err),
        streak: stepErrorStreak,
      });
      onStepError?.(err);
      // * Transient fault — recovering next frame beats a frozen tab.
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
