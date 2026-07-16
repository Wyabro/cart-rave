// gameFlow.js — host-authoritative fall/scoring, respawns, round transitions

import { resetCartTransientState } from "./entities.js";
import { ChallengeTracker } from "./stores/challengeStore.js";
import { UnlockTracker } from "./stores/unlockStore.js";
import { getCurrentLevelId } from "./levelManager.js";
import { buildKOEvent } from "./scoring/koEvent.js";
import { dispatchKOEvent } from "./scoring/koReactors.js";
import { getRoundClockNowMs, isRoundTimerExpired } from "./roundClock.js";

/**
 * @typedef {object} GameFlowDeps
 * @property {() => Array<object>} getAllCarts
 * @property {() => Array<object>} getNetSlots
 * @property {() => boolean} isHost
 * @property {() => { phase: string, startedAtMs: number, countdownStartedAtMs: number, winnerSlotIndex: number | string | null, endReason: "timer" | "lastStanding" | null, scores: Record<number, number>, isSuddenDeath: boolean }} getRoundState
 * @property {() => Record<number, number> | number[]} getRoundScores
 * @property {() => Map<number, object>} getLastHitBy
 * @property {object} CONFIG
 * @property {() => number} getLocalSlotIndex
 * @property {() => object | null} getLocalCart
 * @property {(cart: object, now: number) => void} scheduleRespawn
 * @property {(cart: object) => void} scheduleStuckRespawn
 * @property {(cart: object, callbacks?: object) => void} doRespawn
 * @property {(slotIndex: number, pos: object, quat: object, vel: object, cargoBay: object | null) => void} [onSpill]
 * @property {(slotIndex: number) => void} [onCartRespawn]
 * @property {(nowMs: number, npc: object) => void} maybeTriggerNpcOpportunisticRamBoost
 * @property {(nowMs: number, npc: object) => void} [maybeTriggerNpcOpportunisticHop]
 * @property {() => void} endRound
 * @property {(slotIndex: number) => void} [scheduleLastCartStandingFinish]
 * @property {() => void} [abortLastCartStandingFlourish]
 * @property {(slot: object | null | undefined) => number} colorHexForSlot
 * @property {object | null | undefined} hud
 * @property {() => void} sendHostRound
 * @property {() => object | null} getPartySocket
 * @property {(attackerSlotIndex: number, points: number, suppressSuddenDeathWin?: boolean) => boolean} addScore
 * @property {(p: { x: number, y: number, z: number }) => string | null} [classifyKillZone]
 * @property {() => boolean} isScoreTied
 * @property {(val: boolean) => void} setSuddenDeath
 * @property {(victimSlotIndex: number, comboTier: number, koEvent?: import("./scoring/koEvent.js").KOEvent) => void} [onLocalKillConfirm]
 * @property {(koEvent: import("./scoring/koEvent.js").KOEvent) => void} [onArenaKoFlash]
 * @property {() => string} [detectGameMode]
 * @property {() => THREE.Scene | null | undefined} [getScene]
 * @property {(cart: object, scene: object, neonHex: number) => void} [triggerCartShatter]
 * @property {() => string | null} [getYouConnId]
 * @property {(tier: number, multiplier: number) => void} [setLocalCombo]
 * @property {(eventData: object) => void} [queueHostFallEvent]
 * @property {(fall: { victimSlotIndex: number, attackerSlotIndex: number | null, comboTier: number, wasCritical?: boolean, victimWasLeader?: boolean }) => void} [onAnnouncerFall]
 * @property {(cart: object) => void} [onCartOutOfPlay] Stop charge SFX / clear local charge state when a
 *   cart leaves play (fall start, Sudden Death spectator park). Does not schedule respawn.
 */

/** @type {boolean} */
let _hostMissingCartWarned = false;

/**
 * Host-only idle watchdog — respawns carts wedged in geometry with no score penalty.
 *
 * @param {GameFlowDeps} deps
 * @param {number} nowMs performance.now() from the frame loop
 * @param {object} cart
 * @param {{ x: number, y: number, z: number }} pos body translation
 */
function updateCartIdleWatch(deps, nowMs, cart, pos) {
  // * Sudden Death spectators sit at y=-50 — they should never trigger a
  // * stuck respawn because they are intentionally frozen out of the round.
  if (cart.isSuddenDeathSpectator) return;

  const stuckCfg = deps.CONFIG.fall?.stuck;
  if (!stuckCfg) return;

  // * Booth deck — players may idle before jumping; not a geometry wedge.
  if (pos.y > deps.CONFIG.booth.platformY - 1.0) {
    cart.idleAnchorX = pos.x;
    cart.idleAnchorZ = pos.z;
    cart.idleStillSinceMs = nowMs;
    return;
  }

  const lv = cart.body.linvel();
  const planarSpeed = Math.hypot(lv.x, lv.z);
  const moved = Math.hypot(pos.x - cart.idleAnchorX, pos.z - cart.idleAnchorZ);

  // * Reset the stuck timer only when the cart has meaningfully moved from its
  // * anchor position (0.45 m). Instantaneous planarSpeed alone would reset the
  // * timer on every physics micro-bounce for carts wedged against geometry.
  if (moved > stuckCfg.positionRadiusM) {
    cart.idleAnchorX = pos.x;
    cart.idleAnchorZ = pos.z;
    cart.idleStillSinceMs = nowMs;
    return;
  }

  // * Also reset if the cart clearly has sustained velocity well above the
  // * stuck threshold — guards against the edge case where a cart barely drifts
  // * without building enough net displacement.
  if (planarSpeed > 2.0) {
    cart.idleAnchorX = pos.x;
    cart.idleAnchorZ = pos.z;
    cart.idleStillSinceMs = nowMs;
    return;
  }

  // * Initialize the stuck timer on the first frame when movement stops.
  // * idleStillSinceMs starts as 0 (falsy) at cart creation and after
  // * resetCartIdleWatch sets it to -Infinity (also falsy but checked as <= 0).
  if (!cart.idleStillSinceMs || cart.idleStillSinceMs <= 0) {
    cart.idleStillSinceMs = nowMs;
  }

  if (nowMs - cart.idleStillSinceMs >= stuckCfg.respawnMs) {
    deps.scheduleStuckRespawn(cart);
  }
}

/**
 * Host fall/score handling, respawns, and round timer end.
 * Runs once per frame after ambient visuals and before physics substeps.
 *
 * @param {GameFlowDeps} deps Wiring from main — closures for mutable round/slow-mo state.
 * @param {{ now: number, dt: number, loopState: object, roundNowMs?: number }} context
 *   Frame timing from the loop. `now` is rAF/performance.now(); `roundNowMs` is the
 *   round-clock domain ({@link getRoundClockNowMs}) for timer expiry vs startedAtMs.
 */
export function updateGameFlow(deps, context) {
  const { now, dt } = context;
  const allCarts = deps.getAllCarts();
  const localSlotIndexThisFrame = deps.getLocalSlotIndex();
  const roundState = deps.getRoundState();
  const isHost = deps.isHost();
  const isTestDrive = deps.detectGameMode?.() === "testdrive";

  if (isHost && roundState.phase === "running") {
    const netSlots = deps.getNetSlots();
    // * Same domain as startedAtMs writers (main startRunningAt / game_start offset).
    // * Do not use Date.now() — wall jumps would skew a 150s round; inject roundNowMs in tests.
    const roundNowMs = typeof context.roundNowMs === "number" && Number.isFinite(context.roundNowMs)
      ? context.roundNowMs
      : getRoundClockNowMs();
    const roundDurationMs = deps.CONFIG.round?.durationMs ?? 60000;

    if (
      !isTestDrive
      && !roundState.isSuddenDeath
      && isRoundTimerExpired(roundState.startedAtMs, roundDurationMs, roundNowMs)
    ) {
      if (deps.isScoreTied()) {
        const scores = deps.getRoundScores();
        let topScore = -Infinity;
        for (let i = 0; i < 4; i += 1) {
          topScore = Math.max(topScore, Number(scores[i] || 0));
        }
        // * Only enter Sudden Death if at least one tied slot is a human player.
        let hasHumanTied = false;
        for (let i = 0; i < 4; i += 1) {
          const slot = netSlots[i];
          if (Number(scores[i] || 0) === topScore && slot?.kind === "human") {
            hasHumanTied = true;
            break;
          }
        }
        if (hasHumanTied) {
          // * One-shot guard: once Sudden Death is active, skip the teleport
          // * setup so carts can actually drive without being yanked back every frame.
          if (!roundState.isSuddenDeath) {
            deps.setSuddenDeath(true);
            layoutSuddenDeathArena(
              allCarts, scores, topScore, now, deps.onCartOutOfPlay,
              (c) => deps.doRespawn(c, deps),
            );
            deps.sendHostRound();
          }
        } else {
          // * NPC-only tie — resolve normally via standard tiebreaker.
          deps.endRound();
        }
      } else {
        deps.endRound();
      }
    } else {
      for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
        // * A Sudden Death addScore inside this loop can end the round synchronously
        // * (endRound → cleanupSuddenDeathState un-parks spectators at y=-50 with their
        // * guards cleared). Stop processing the moment the round leaves "running" —
        // * later slots would be misread as fresh falls (phantom KO feed/stats/shatter
        // * on every peer via the falls[] wire).
        if (deps.getRoundState().phase !== "running") break;
        const slot = netSlots[slotIndex];
        const cart = allCarts[slotIndex];
        if (!slot || !cart?.body) continue;
        // * Skip spectator carts (frozen at y=-50 during Sudden Death) — without
        // * this guard they re-trigger the fall/KO path every frame: feed/announcer
        // * spam and premature or misattributed Sudden Death wins.
        if (cart.isSuddenDeathSpectator) continue;

        const p = cart.body.translation();

        if (p.y < deps.CONFIG.fall.yThreshold && cart.respawnAtMs === null) {
          // * Leave-play hook before SD spectator park or scheduleRespawn — SD skips
          // * scheduleRespawn, so charge wind-up would otherwise loop until round end.
          deps.onCartOutOfPlay?.(cart);

          // * Reset combo tier instantly when falling
          cart.comboTier = 0;
          cart.comboExpiryMs = 0;
          if (slotIndex === localSlotIndexThisFrame) {
            deps.setLocalCombo?.(0, 0);
          }

          // * Spilling Cart VFX — capture pose at fall moment for debris/particle trigger.
          if (!cart.hasSpilled) {
            const fallPos = cart.body.translation();
            // Spawn debris at floor level using the cart's X/Z, preventing VFX from spawning in the void.
            const spillPos = { x: fallPos.x, y: 0.5, z: fallPos.z };
            const spillQuat = cart.body.rotation();
            const spillVel = { ...cart.body.linvel(), y: 0 };
            deps.onSpill?.(cart.slotIndex, spillPos, spillQuat, spillVel, cart.cargoBay);
            cart.hasSpilled = true;
          }

          if (!isTestDrive) {
            // * roundNowMs shares startedAtMs domain (roundTimeMs = now - startedAtMs).
            const koEvent = buildKOEvent(deps, slotIndex, p, roundNowMs);

            if (koEvent.isKill) {
              // * Sudden Death multi-way tie guard: when 3+ carts are tied and one
              // * is ram-killed, the remaining tied survivors must stay in Sudden
              // * Death. Only fire the win callback if exactly 1 tied cart remains.
              let suppressSuddenDeathWin = false;
              if (roundState.isSuddenDeath && !isTestDrive) {
                const scores = deps.getRoundScores();
                let topScore = -Infinity;
                for (let si = 0; si < 4; si += 1) {
                  topScore = Math.max(topScore, Number(scores[si] || 0));
                }
                // * Count tied carts still standing (not spectator, not fallen).
                let survivingTied = 0;
                for (let si = 0; si < allCarts.length; si += 1) {
                  if (Number(scores[si] || 0) !== topScore) continue;
                  const tc = allCarts[si];
                  if (!tc?.body || tc.isSuddenDeathSpectator) continue;
                  const tpos = tc.body.translation();
                  if (tpos.y < deps.CONFIG.fall.yThreshold) continue;
                  survivingTied += 1;
                }
                // * The falling victim (slotIndex) was one of the tied carts.
                // * If more than 1 tied cart survives this kill, suppress the
                // * Sudden Death win — the round continues.
                if (survivingTied > 1) {
                  suppressSuddenDeathWin = true;
                  // * Remove the victim from the arena so physics can't interfere.
                  cart.body.setTranslation({ x: 0, y: -50, z: 0 }, true);
                  cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                  cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                  cart.body.setEnabled(false);
                  cart.isSuddenDeathSpectator = true;
                }
              }
              const suddenDeathEnded = deps.addScore(koEvent.attackerSlotIndex, koEvent.reward.total, suppressSuddenDeathWin);
              if (suddenDeathEnded) {
                koEvent.isFinalBlow = true;
              } else {
                deps.sendHostRound();
              }
              // * Challenges + kill feed + local kill-confirm + announcer are all dispatched from
              // * the KO Event in the common tail below (dispatchKOEvent) once koEvent is finalized.
            } else if (deps.getRoundState().isSuddenDeath) {
              // * Multi-way tie Sudden Death: eliminate the falling cart first, then count
              // * survivors. Only award the win (and finalize the KO Event's attacker to the
              // * survivor) when exactly one tied cart remains standing. The kill feed / announcer
              // * are rendered from koEvent in the common tail below.
              cart.body.setTranslation({ x: 0, y: -50, z: 0 }, true);
              cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
              cart.body.setEnabled(false);
              cart.isSuddenDeathSpectator = true;

              const scores = deps.getRoundScores();
              let topScore = -Infinity;
              for (let si = 0; si < 4; si += 1) {
                topScore = Math.max(topScore, Number(scores[si] || 0));
              }

              let survivingTied = 0;
              let survivorSlot = -1;
              for (let si = 0; si < 4; si += 1) {
                if (Number(scores[si] || 0) !== topScore) continue;
                const c = allCarts[si];
                if (!c?.body || c.isSuddenDeathSpectator) continue;
                const pos = c.body.translation();
                if (pos.y < deps.CONFIG.fall.yThreshold) continue;
                survivingTied += 1;
                survivorSlot = si;
              }

              if (survivingTied === 1 && survivorSlot >= 0) {
                deps.addScore(survivorSlot, 1);
                // * addScore fired _suddenDeathWinCallback → endRound().
                koEvent.attackerSlotIndex = survivorSlot;
                koEvent.isFinalBlow = true;
                // * buildKOEvent left isKill=false (self/env path). Mirror rebuildKOEvent's
                // * rule (attacker != null → kill) so host match-stats / challenges / PA
                // * agree with non-host falls[] replay. Verb stays "SUDDEN DEATH".
                koEvent.isKill = true;
              } else {
                koEvent.attackerSlotIndex = null;
                koEvent.isKill = false;
              }
              koEvent.verb = "SUDDEN DEATH";
            }

            if (typeof deps.queueHostFallEvent === "function") {
              // * Queued into the host snapshot's binary falls[] tail — no wire `type` tag;
              // * the receiver dispatches falls positionally, not by message type.
              deps.queueHostFallEvent({
                slotId: slotIndex,
                victimSlotIndex: slotIndex,
                attackerSlot: koEvent.attackerSlotIndex,
                attackerSlotIndex: koEvent.attackerSlotIndex,
                verb: koEvent.verb,
                comboTier: koEvent.comboTier ?? 0,
                comboMultiplier: koEvent.comboMultiplier ?? 1.0,
                // * Presentation context (JSON falls[] tail — no binary format change):
                // * lets non-hosts render the same score-breakdown float + announcer
                // * callouts as the host. Scores still arrive via the round sync only.
                cause: koEvent.cause,
                wasCritical: koEvent.wasCritical,
                victimWasLeader: koEvent.victimWasLeader,
                reward: koEvent.reward,
                isFinalBlow: koEvent.isFinalBlow,
                isSuddenDeath: koEvent.isSuddenDeath,
              });
            }

            // * Fan the finalized KO Event out to the presentation reactors — challenges, local
            // * kill-confirm, kill feed, and the announcer director. Host runs this directly;
            // * non-host clients run the same dispatch from the falls[] replay path (netcode.js).
            dispatchKOEvent(koEvent, {
              netSlots,
              localSlotIndex: localSlotIndexThisFrame,
              hud: deps.hud,
              colorHexForSlot: deps.colorHexForSlot,
              onAnnouncerFall: deps.onAnnouncerFall,
              onLocalKillConfirm: deps.onLocalKillConfirm,
              onArenaKoFlash: deps.onArenaKoFlash,
              recordChallenge: ChallengeTracker.record,
              getLevelId: () => getCurrentLevelId(),
              recordKillOnLevel: UnlockTracker.recordKillOnLevel,
            });

            deps.getLastHitBy().delete(slotIndex);
          }

          // * Trigger the shatter + explosion VFX on the host (non-host clients replay
          // * it from the snapshot falls[] tail so everyone sees the same pop).
          if (deps.triggerCartShatter && deps.getScene && cart.mesh) {
            const scene = deps.getScene();
            if (scene) deps.triggerCartShatter(cart, scene, deps.colorHexForSlot(slot));
          }

          // * Block respawn during Sudden Death — the falling cart stays dead
          // * and the round ends immediately via the other tied cart's score.
          if (!deps.getRoundState().isSuddenDeath) {
            deps.scheduleRespawn(cart, now);
          }
        }

        if (cart.respawnAtMs !== null && now >= cart.respawnAtMs) {
          // * doRespawn tears down the shatter VFX (cleanupShatter + visual rebuild)
          // * and resets transient state, including hasSpilled and cargoBay visibility.
          deps.doRespawn(cart, deps);
        } else if (cart.respawnAtMs === null && !isTestDrive) {
          updateCartIdleWatch(deps, now, cart, p);
        }

        if (slot.kind === "npc") {
          deps.maybeTriggerNpcOpportunisticRamBoost(now, cart);
          deps.maybeTriggerNpcOpportunisticHop?.(now, cart);
        }
      }

      // * Rampage Combo decay — runs in a dedicated second pass AFTER all fall-detection
      // * and scoring has been processed for this frame. This prevents a lower-indexed
      // * attacker slot from having its comboTier zeroed before a higher-indexed victim's
      // * fall is scored on the same frame (order-of-operations race condition).
      for (let si = 0; si < allCarts.length; si += 1) {
        const c = allCarts[si];
        if (!c?.body) continue;
        if (c.comboTier > 0 && now >= c.comboExpiryMs) {
          c.comboTier = 0;
          c.comboExpiryMs = 0;
          if (si === localSlotIndexThisFrame) {
            deps.setLocalCombo?.(0, 0);
          }
        }
      }

      // * Live phase re-check: a Sudden Death win above ends the round mid-frame; the
      // * winner would otherwise read as a sole survivor here and flip the podium's
      // * endReason to "lastStanding" (wrong title + spurious slow-mo + extra host_round).
      if (!isTestDrive && deps.getRoundState().phase === "running") {
        // * Last-cart-standing: sole cart not mid-fall/respawn wins after a flourish delay.
        // * Skip spectator carts (frozen during Sudden Death) — only tied carts count.
        let aliveOnArena = 0;
        let soleSurvivorSlot = -1;
        for (let si = 0; si < allCarts.length; si += 1) {
          const c = allCarts[si];
          if (!c?.body || c.respawnAtMs !== null || c.isSuddenDeathSpectator) continue;
          const pos = c.body.translation();
          if (pos.y < deps.CONFIG.fall.yThreshold) continue;
          aliveOnArena += 1;
          soleSurvivorSlot = si;
        }
        if (aliveOnArena === 1 && soleSurvivorSlot >= 0) {
          deps.scheduleLastCartStandingFinish?.(soleSurvivorSlot);
        } else if (aliveOnArena === 0 && deps.getRoundState().isSuddenDeath) {
          // * Simultaneous Sudden Death wipeout: the last tied carts all crossed the
          // * fall line on the SAME frame with no attacker credited, so no addScore
          // * ran and every tied cart is now a spectator. SD has no timeout, so the
          // * round would hang here forever (fall loop skips spectators; this check
          // * keeps reading 0). A mutual fall shouldn't crown anyone — re-seat the tied
          // * carts and replay the tiebreak. Self-limiting: next frame they're back on
          // * the arena (aliveOnArena >= 1) so this won't re-fire.
          deps.abortLastCartStandingFlourish?.();
          const sdScores = deps.getRoundScores();
          let sdTopScore = -Infinity;
          for (let si = 0; si < 4; si += 1) {
            sdTopScore = Math.max(sdTopScore, Number(sdScores[si] || 0));
          }
          layoutSuddenDeathArena(
            allCarts, sdScores, sdTopScore, now, deps.onCartOutOfPlay,
            (c) => deps.doRespawn(c, deps),
          );
          deps.sendHostRound();
        } else {
          deps.abortLastCartStandingFlourish?.();
        }
      }
    }
  }

  const localCart = deps.getLocalCart();
  if (deps.isHost() && roundState.phase === "running" && !localCart?.body) {
    const youConnId = deps.getYouConnId?.();
    // * Suppress warning when no carts exist yet — transient bootstrap state (solo mode, host migration).
    const allCartsArr = deps.getAllCarts();
    const anyCartReady = Array.isArray(allCartsArr) && allCartsArr.some((c) => c?.body);
    if (youConnId && anyCartReady && !_hostMissingCartWarned) {
      _hostMissingCartWarned = true;
      console.warn(
        "[gameFlow] Host is running but local cart is missing — connId/slot mismatch?",
        { youConnId, localSlot: deps.getLocalSlotIndex() },
      );
    }
  }
}

/**
 * Top score across slots 0–3.
 * @param {Record<number | string, number> | null | undefined} scores
 * @returns {number}
 */
function topRoundScore(scores) {
  let topScore = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    topScore = Math.max(topScore, Number(scores?.[i] || 0));
  }
  return topScore;
}

/**
 * True when at least two slots share the top score and that score is &gt; 0.
 * Mirrors {@link import("./gameState.js").isScoreTied} for pure inputs.
 * @param {Record<number | string, number> | null | undefined} scores
 * @returns {boolean}
 */
export function scoresAreTiedAtTop(scores) {
  const topScore = topRoundScore(scores);
  if (topScore <= 0) return false;
  let topCount = 0;
  for (let i = 0; i < 4; i += 1) {
    if (Number(scores?.[i] || 0) === topScore) topCount += 1;
  }
  return topCount > 1;
}

/**
 * True when a human slot shares the current top score (SD only starts for human ties).
 * @param {Record<number | string, number> | null | undefined} scores
 * @param {Array<{ kind?: string } | null | undefined> | null | undefined} netSlots
 * @returns {boolean}
 */
export function hasHumanTiedAtTop(scores, netSlots) {
  const topScore = topRoundScore(scores);
  if (!Number.isFinite(topScore) || topScore === -Infinity) return false;
  for (let i = 0; i < 4; i += 1) {
    if (Number(scores?.[i] || 0) !== topScore) continue;
    if (netSlots?.[i]?.kind === "human") return true;
  }
  return false;
}

/**
 * True if any cart already looks parked out of the arena (mid–Sudden Death geometry).
 * Used on host promote to avoid re-teleporting everyone when only the SD flag was missed.
 * @param {Array<object | null | undefined> | null | undefined} allCarts
 * @param {number} [fallYThreshold=-10]
 * @returns {boolean}
 */
export function anyCartLooksSuddenDeathOutOfPlay(allCarts, fallYThreshold = -10) {
  const yCut = Number.isFinite(fallYThreshold) ? fallYThreshold : -10;
  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const cart = allCarts[i];
    if (!cart?.body) continue;
    if (cart.isSuddenDeathSpectator) return true;
    const p = typeof cart.body.translation === "function" ? cart.body.translation() : null;
    if (p && Number.isFinite(p.y) && p.y < yCut) return true;
    if (typeof cart.body.isEnabled === "function" && !cart.body.isEnabled()) return true;
  }
  return false;
}

/**
 * Teleport layout for Sudden Death entry: tied → spawn drop-in; others → y=-50 spectators.
 * Shared by the normal timer path and host-promote inference.
 *
 * @param {Array<object | null | undefined>} allCarts
 * @param {Record<number | string, number> | ArrayLike<number> | null | undefined} scores
 * @param {number} topScore
 * @param {number} nowMs performance.now() for idle-watch anchors
 * @param {(cart: object) => void} [onCartOutOfPlay]
 * @param {(cart: object) => void} [doRespawn] Entities.doRespawn-style teardown for mid-shatter carts
 */
function layoutSuddenDeathArena(allCarts, scores, topScore, nowMs, onCartOutOfPlay, doRespawn) {
  const tiedSlots = [];
  for (let i = 0; i < 4; i += 1) {
    if (Number(scores?.[i] || 0) === topScore) tiedSlots.push(i);
  }
  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const cart = allCarts[i];
    if (!cart?.body) continue;
    // * Stop charge wind-up before reset nulls chargeUpSfxId (tied) or parks
    // * non-tied spectators without going through scheduleRespawn.
    onCartOutOfPlay?.(cart);
    if (tiedSlots.includes(i)) {
      cart.isSuddenDeathSpectator = false;
      // * A tied cart mid-shatter at SD entry (fell just before the timer expired) still
      // * has its visual parts detached into the scene. respawnAtMs is nulled below and
      // * SD blocks scheduleRespawn, so without this teardown cleanupShatter never runs
      // * and the cart fights Sudden Death invisible.
      if (doRespawn && (cart.isShattering || cart._shatterState)) doRespawn(cart);
      cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y + 1.0, z: cart.spawn.z }, true);
      const halfYaw = (cart.spawnYaw || 0) / 2;
      cart.body.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
      cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      cart.body.wakeUp?.();
      if (cart.body.setEnabled) cart.body.setEnabled(true);
      cart.respawnAtMs = null;
      cart.idleAnchorX = cart.spawn.x;
      cart.idleAnchorZ = cart.spawn.z;
      cart.idleStillSinceMs = nowMs;
      if (cart.mesh) cart.mesh.visible = true;
      if (cart.collider) cart.collider.setEnabled(true);
      resetCartTransientState(cart);
    } else {
      cart.body.setTranslation({ x: 0, y: -50, z: 0 }, true);
      cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      cart.body.setEnabled(false);
      cart.isSuddenDeathSpectator = true;
    }
  }
}

/**
 * Host-promote Sudden Death recovery (route 2: infer from clock + human tie).
 *
 * When the previous host's SD `host_round` never arrived, a newly promoted host
 * would still see phase=running + isSuddenDeath=false and could end the round on
 * the timer. Instead: if the clock is past duration and scores are a human-involved
 * top-score tie, arm SD immediately.
 *
 * - Already mid-SD geometry (bodies below fall line / disabled): flag + reconstruct
 *   only — do **not** re-teleport (would yank fighters mid-overtime).
 * - Fresh timer expiry (everyone still on the arena): full SD layout like the
 *   normal timer path.
 * - Already isSuddenDeath: reconstruct spectators only.
 *
 * @param {object} opts
 * @param {string} opts.phase
 * @param {boolean} opts.isSuddenDeath
 * @param {number} opts.startedAtMs
 * @param {number} opts.nowMs Round clock now ({@link getRoundClockNowMs}; matches gameFlow timer)
 * @param {number} opts.durationMs
 * @param {Record<number | string, number> | null | undefined} opts.scores
 * @param {Array<{ kind?: string } | null | undefined> | null | undefined} opts.netSlots
 * @param {Array<object | null | undefined> | null | undefined} opts.allCarts
 * @param {number} [opts.fallYThreshold]
 * @param {number} [opts.nowPerfMs] performance.now() for idle anchors on full layout
 * @param {(val: boolean) => void} opts.setSuddenDeath
 * @param {() => void} [opts.sendHostRound]
 * @param {(cart: object) => void} [opts.onCartOutOfPlay]
 * @param {(cart: object) => void} [opts.doRespawn] Shatter teardown for tied carts entering SD mid-death
 * @returns {"none" | "reconstruct" | "infer_mid" | "infer_enter"}
 */
export function ensureSuddenDeathOnHostPromote(opts) {
  const {
    phase,
    isSuddenDeath,
    startedAtMs,
    nowMs,
    durationMs,
    scores,
    netSlots,
    allCarts,
    fallYThreshold = -10,
    nowPerfMs = 0,
    setSuddenDeath,
    sendHostRound,
    onCartOutOfPlay,
    doRespawn,
  } = opts;

  if (phase !== "running") return "none";

  if (isSuddenDeath) {
    reconstructSuddenDeathSpectators(allCarts, scores, fallYThreshold);
    return "reconstruct";
  }

  const duration = Number.isFinite(durationMs) ? durationMs : 60000;
  if (!(startedAtMs > 0 && nowMs - startedAtMs >= duration)) {
    return "none";
  }

  // * Same gates as the timer path: human-involved top-score tie only.
  // * Untied / NPC-only ties fall through to normal gameFlow endRound next frame.
  if (!scoresAreTiedAtTop(scores) || !hasHumanTiedAtTop(scores, netSlots)) {
    return "none";
  }

  setSuddenDeath(true);

  if (anyCartLooksSuddenDeathOutOfPlay(allCarts, fallYThreshold)) {
    // * Mid-SD: old host already parked people; we only missed the boolean.
    reconstructSuddenDeathSpectators(allCarts, scores, fallYThreshold);
    sendHostRound?.();
    return "infer_mid";
  }

  // * Timer expired, never entered SD layout — same teleports as normal entry.
  const topScore = topRoundScore(scores);
  layoutSuddenDeathArena(allCarts, scores, topScore, nowPerfMs, onCartOutOfPlay, doRespawn);
  sendHostRound?.();
  return "infer_enter";
}

/**
 * Clears Sudden Death spectator state on all carts.
 * Call when Sudden Death ends or a new round begins.
 *
 * @param {Array<object>} allCarts
 */
export function cleanupSuddenDeathState(allCarts) {
  for (const cart of allCarts || []) {
    if (!cart) continue;
    cart.isSuddenDeathSpectator = false;
    if (cart.mesh) cart.mesh.visible = true;
    if (cart.collider) cart.collider.setEnabled(true);
    if (cart.body) cart.body.setEnabled(true);
    cart.respawnAtMs = null;
  }
}

/**
 * Re-derive `isSuddenDeathSpectator` after host promotion.
 *
 * The flag is host-local and never synced. Score-only reconstruction (non-top =
 * spectator) is enough for SD entry non-tied parks, but **misses multi-way SD
 * victims who still share the top score** after elimination — they sit at y=-50
 * with bodies disabled, and without the flag the fall loop re-fires fake KOs.
 *
 * Flag-only: positions/bodies already match host snapshots; the fall-loop guard
 * only needs the boolean to treat them as inert.
 *
 * @param {Array<object | null | undefined> | null | undefined} allCarts
 * @param {Record<number | string, number> | null | undefined} scores
 * @param {number} [fallYThreshold=-10]
 */
export function reconstructSuddenDeathSpectators(
  allCarts,
  scores,
  fallYThreshold = -10,
) {
  if (!allCarts?.length) return;

  let topScore = -Infinity;
  for (let si = 0; si < 4; si += 1) {
    topScore = Math.max(topScore, Number(scores?.[si] || 0));
  }

  const yCut = Number.isFinite(fallYThreshold) ? fallYThreshold : -10;

  for (let si = 0; si < allCarts.length; si += 1) {
    const cart = allCarts[si];
    if (!cart) continue;

    const notTied = Number(scores?.[si] || 0) !== topScore;
    let outOfPlay = false;
    const body = cart.body;
    if (body) {
      const p = typeof body.translation === "function" ? body.translation() : null;
      if (p && Number.isFinite(p.y) && p.y < yCut) outOfPlay = true;
      if (typeof body.isEnabled === "function") {
        if (!body.isEnabled()) outOfPlay = true;
      }
    }

    // * Standing tied survivors must be explicitly cleared — a stale true from a
    // * prior frame/client path would leave a live cart out of the fall loop.
    cart.isSuddenDeathSpectator = notTied || outOfPlay;
  }
}
