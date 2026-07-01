// gameFlow.js — host-authoritative fall/scoring, respawns, round transitions

import { resetCartTransientState } from "./entities.js";

/**
 * @typedef {object} GameFlowDeps
 * @property {() => Array<object>} getAllCarts
 * @property {() => Array<object>} getNetSlots
 * @property {() => boolean} isHost
 * @property {() => { phase: string, startedAtMs: number }} getRoundState
 * @property {() => number[]} getRoundScores
 * @property {() => Map<number, object>} getLastHitBy
 * @property {object} CONFIG
 * @property {() => number} getLocalSlotIndex
 * @property {() => object | null} getLocalCart
 * @property {(cart: object, now: number) => void} scheduleRespawn
 * @property {(cart: object) => void} scheduleStuckRespawn
 * @property {(cart: object) => void} doRespawn
 * @property {(nowMs: number, npc: object) => void} maybeTriggerNpcOpportunisticRamBoost
 * @property {() => void} endRound
 * @property {(slotIndex: number) => void} [scheduleLastCartStandingFinish]
 * @property {() => void} [abortLastCartStandingFlourish]
 * @property {(slot: object | null | undefined) => number} colorHexForSlot
 * @property {object | null | undefined} hud
 * @property {() => void} sendHostRound
 * @property {() => object | null} getPartySocket
 * @property {{ hostEventFall: string }} MSG
 * @property {(attackerSlotIndex: number, points: number) => boolean} addScore
 * @property {() => boolean} isScoreTied
 * @property {(val: boolean) => void} setSuddenDeath
 * @property {(untilMs: number) => void} setFovPunchUntil
 * @property {() => string} [detectGameMode]
 * @property {() => THREE.Scene | null | undefined} [getScene]
 * @property {(cart: object, scene: object, neonHex: number) => void} [triggerCartShatter]
 */

/** @type {boolean} */
let _hostMissingCartWarned = false;

/**
 * Helper to calculate score and determine if a hit qualifies for a kill.
 * Extracted to keep the main loop clean.
 */
function calculateFallScore(deps, slotIndex, p, nowMs) {
  const hit = deps.getLastHitBy().get(slotIndex);
  const hitWindowMs = deps.CONFIG.scoring?.hitWindowMs ?? 2500;

  if (!hit || (nowMs - hit.timestamp > hitWindowMs)) {
    return { isKill: false, points: 0, attackerSlot: null, verb: "FELL OFF" };
  }

  const distOriginXZ = Math.hypot(p.x, p.z);
  const isCenterHole = distOriginXZ < deps.CONFIG.record.innerRadius + 2;
  let points = isCenterHole ? 2 : 1;

  if (hit.wasCritical) points += 1;

  const scores = deps.getRoundScores();
  let leaderSlotIndex = -1;
  let leaderScore = 0;
  let leaderTied = false;

  for (let i = 0; i < 4; i += 1) {
    const s = Number(scores[i] || 0);
    if (s > leaderScore) {
      leaderScore = s;
      leaderSlotIndex = i;
      leaderTied = false;
    } else if (s === leaderScore && s > 0) {
      leaderTied = true;
    }
  }

  if (!leaderTied && leaderSlotIndex >= 0 && slotIndex === leaderSlotIndex) {
    points += 1;
  }

  const verb = deps.hud?.pickKillFeedVerb ? deps.hud.pickKillFeedVerb(hit) : "RAMMED";
  return { isKill: true, points, attackerSlot: hit.attackerSlotIndex, verb };
}

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

  if (planarSpeed > stuckCfg.maxPlanarSpeedMps || moved > stuckCfg.positionRadiusM) {
    cart.idleAnchorX = pos.x;
    cart.idleAnchorZ = pos.z;
    cart.idleStillSinceMs = nowMs;
    return;
  }

  if (!cart.idleStillSinceMs) {
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
 * @param {{ now: number, dt: number, loopState: object }} context Frame timing from the loop.
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
    const nowMs = Date.now();
    const roundDurationMs = deps.CONFIG.round?.durationMs ?? 60000;

    if (
      !isTestDrive
      && !roundState.isSuddenDeath
      && roundState.startedAtMs > 0
      && nowMs - roundState.startedAtMs >= roundDurationMs
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

            // * Sudden Death: tied carts teleport back to their spawn platforms with a
            // * 1m Y offset so they drop cleanly past the ramp — no geometry intersection.
            // * Rotation is reset via spawnYaw (faces arena center). Phase is already
            // * "running" so driving is unlocked — carts can drive/jump off immediately.
            // * Non-tied carts are dropped far below as spectators.
            const tiedSlots = [];
            for (let i = 0; i < 4; i += 1) {
              if (Number(scores[i] || 0) === topScore) tiedSlots.push(i);
            }
            for (let i = 0; i < allCarts.length; i += 1) {
              const cart = allCarts[i];
              if (!cart?.body) continue;
              if (tiedSlots.includes(i)) {
                cart.isSuddenDeathSpectator = false;
                cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y + 1.0, z: cart.spawn.z }, true);
                // * Face the arena center so the cart can drive out, not into the back wall.
                const halfYaw = cart.spawnYaw / 2;
                cart.body.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
                cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                cart.body.wakeUp();
                cart.respawnAtMs = null;
                cart.idleAnchorX = cart.spawn.x;
                cart.idleAnchorZ = cart.spawn.z;
                cart.idleStillSinceMs = now;
                if (cart.mesh) cart.mesh.visible = true;
                if (cart.collider) cart.collider.setEnabled(true);
                // * Reset transient combat/boost state so tied carts start Sudden Death
                // * with a clean physics slate (no stale isChargingBoost, pendingRam, etc.).
                resetCartTransientState(cart);
              } else {
                cart.body.setTranslation({ x: 0, y: -50, z: 0 }, true);
                cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                cart.body.setEnabled(false);
                cart.isSuddenDeathSpectator = true;
              }
            }

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
        const slot = netSlots[slotIndex];
        const cart = allCarts[slotIndex];
        if (!slot || !cart?.body) continue;

        const p = cart.body.translation();

        if (p.y < deps.CONFIG.fall.yThreshold && cart.respawnAtMs === null) {
          if (!isTestDrive) {
            const scoreData = calculateFallScore(deps, slotIndex, p, nowMs);

            if (scoreData.isKill) {
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
              const suddenDeathEnded = deps.addScore(scoreData.attackerSlot, scoreData.points, suppressSuddenDeathWin);
              if (!suddenDeathEnded) {
                deps.sendHostRound();
              }

              if (scoreData.attackerSlot === localSlotIndexThisFrame) {
                deps.setFovPunchUntil(performance.now() + 200);
              }

              const attackerSlot = netSlots[scoreData.attackerSlot];
              const victimSlot = netSlots[slotIndex];
              const actorName = attackerSlot?.name || `P${scoreData.attackerSlot + 1}`;
              const targetName = victimSlot?.name || `P${slotIndex + 1}`;
              const actorColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(attackerSlot)) : null;
              const targetColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(victimSlot)) : null;

              deps.hud?.addKillFeedEntry?.(actorName, actorColor, scoreData.verb, targetName, targetColor);
            } else {
              const isSuddenDeath = deps.getRoundState().isSuddenDeath;
              if (isSuddenDeath) {
                // * Multi-way tie Sudden Death: eliminate the falling cart first,
                // * then count survivors. Only award the win when exactly one
                // * tied cart remains standing.
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
                }

                const victimSlot = netSlots[slotIndex];
                const targetName = victimSlot?.name || `P${slotIndex + 1}`;
                const targetColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(victimSlot)) : null;

                if (survivingTied === 1 && survivorSlot >= 0) {
                  scoreData.attackerSlot = survivorSlot;
                  scoreData.verb = "SUDDEN DEATH";
                  const attackerSlot = netSlots[survivorSlot];
                  const actorName = attackerSlot?.name || `P${survivorSlot + 1}`;
                  const actorColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(attackerSlot)) : null;
                  deps.hud?.addKillFeedEntry?.(actorName, actorColor, "SUDDEN DEATH", targetName, targetColor);
                } else {
                  scoreData.attackerSlot = null;
                  scoreData.verb = "SUDDEN DEATH";
                  deps.hud?.addKillFeedEntry?.(null, null, "FELL OFF", targetName, targetColor);
                }
              } else {
                const victimSlot = netSlots[slotIndex];
                const targetName = victimSlot?.name || `P${slotIndex + 1}`;
                const targetColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(victimSlot)) : null;

                deps.hud?.addKillFeedEntry?.(null, null, "FELL OFF", targetName, targetColor);
              }
            }

            const partySocket = deps.getPartySocket();
            if (partySocket) {
              partySocket.send(JSON.stringify({
                type: deps.MSG.hostEventFall,
                slotId: slotIndex,
                victimSlotIndex: slotIndex,
                attackerSlot: scoreData.attackerSlot,
                attackerSlotIndex: scoreData.attackerSlot,
                verb: scoreData.verb,
              }));
            }

            deps.getLastHitBy().delete(slotIndex);
          }

          // * Trigger the shatter + explosion VFX on the host (non-host clients replay
          // * it from the host_event_fall broadcast so everyone sees the same pop).
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
          deps.doRespawn(cart);
        } else if (cart.respawnAtMs === null && !isTestDrive) {
          updateCartIdleWatch(deps, now, cart, p);
        }

        if (slot.kind === "npc") {
          deps.maybeTriggerNpcOpportunisticRamBoost(now, cart);
        }
      }

      if (!isTestDrive) {
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
