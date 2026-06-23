// gameFlow.js — host-authoritative fall/scoring, respawns, round transitions, camera follow

import * as CameraMod from "./camera.js";

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
 * @property {(cart: object) => void} doRespawn
 * @property {(nowMs: number, npc: object) => void} maybeTriggerNpcOpportunisticRamBoost
 * @property {() => void} endRound
 * @property {(slot: object | null | undefined) => number} colorHexForSlot
 * @property {object | null | undefined} hud
 * @property {() => void} sendHostRound
 * @property {() => object | null} getPartySocket
 * @property {{ hostEventFall: string }} MSG
 * @property {(attackerSlotIndex: number, points: number) => void} addScore
 * @property {(untilMs: number) => void} setFovPunchUntil
 * @property {import("three").PerspectiveCamera} camera
 * @property {() => import("@dimforge/rapier3d-compat").World | null} getPhysicsWorld
 * @property {() => string | null} [getYouConnId]
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
 * Host fall/score handling, respawns, round timer end, and camera follow.
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

  if (isHost && roundState.phase === "running") {
    const netSlots = deps.getNetSlots();
    const nowMs = Date.now();
    const roundDurationMs = deps.CONFIG.round?.durationMs ?? 60000;

    if (roundState.startedAtMs > 0 && nowMs - roundState.startedAtMs >= roundDurationMs) {
      deps.endRound();
    } else {
      for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
        const slot = netSlots[slotIndex];
        const cart = allCarts[slotIndex];
        if (!slot || !cart?.body) continue;

        const p = cart.body.translation();

        if (p.y < deps.CONFIG.fall.yThreshold && cart.respawnAtMs === null) {
          const scoreData = calculateFallScore(deps, slotIndex, p, nowMs);

          if (scoreData.isKill) {
            deps.addScore(scoreData.attackerSlot, scoreData.points);
            deps.sendHostRound();

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
            const victimSlot = netSlots[slotIndex];
            const targetName = victimSlot?.name || `P${slotIndex + 1}`;
            const targetColor = deps.hud?.colorHexToCss ? deps.hud.colorHexToCss(deps.colorHexForSlot(victimSlot)) : null;

            deps.hud?.addKillFeedEntry?.(null, null, "FELL OFF", targetName, targetColor);
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
          deps.scheduleRespawn(cart, now);
        }

        if (cart.respawnAtMs !== null && now >= cart.respawnAtMs) {
          deps.doRespawn(cart);
        }

        if (slot.kind === "npc") {
          deps.maybeTriggerNpcOpportunisticRamBoost(now, cart);
        }
      }
    }
  }

  const localCart = deps.getLocalCart();
  if (deps.isHost() && roundState.phase === "running" && !localCart?.body) {
    const youConnId = deps.getYouConnId?.();
    if (youConnId && !_hostMissingCartWarned) {
      _hostMissingCartWarned = true;
      console.warn(
        "[gameFlow] Host is running but local cart is missing — connId/slot mismatch?",
        { youConnId, localSlot: deps.getLocalSlotIndex() },
      );
    }
  }
  if (localCart?.body) {
    const playerPos = localCart.body.translation();
    const playerRot = localCart.body.rotation();
    CameraMod.updateCamera(
      deps.camera,
      localCart,
      dt,
      playerPos,
      playerRot,
      deps.getPhysicsWorld?.() ?? null,
    );
  }
}
