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
 * @property {() => ReturnType<typeof setTimeout> | null} getLastCartStandingTimeoutId
 * @property {(id: ReturnType<typeof setTimeout> | null) => void} setLastCartStandingTimeoutId
 * @property {() => number | string | null} getLastCartStandingWinnerSlotIndex
 * @property {(idx: number | string | null) => void} setLastCartStandingWinnerSlotIndex
 * @property {(untilMs: number) => void} setSlowMoUntil
 * @property {(rate: number) => void} setSlowMoRate
 * @property {import("three").PerspectiveCamera} camera
 * @property {() => import("@dimforge/rapier3d-compat").World | null} getPhysicsWorld
 */

/**
 * Host fall/score handling, respawns, last-cart-standing, round timer end, and camera follow.
 * Runs once per frame after ambient visuals and before physics substeps.
 *
 * @param {GameFlowDeps} deps Wiring from main — closures for mutable round/slow-mo state.
 * @param {{ now: number, dt: number, loopState: object }} context Frame timing from the loop.
 */
export function updateGameFlow(deps, context) {
  const { now, dt } = context;
  const allCarts = deps.getAllCarts();
  const localSlotIndexThisFrame = deps.getLocalSlotIndex();

  if (deps.isHost() && deps.getRoundState().phase === "running") {
    // Fall detection / respawn (host-authoritative).
    for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
      const slot = deps.getNetSlots()[slotIndex];
      const c = allCarts[slotIndex];
      if (!slot) continue;
      const p = c.body.translation();
      if (p.y < deps.CONFIG.fall.yThreshold) {
        // Stage A scoring: credit last hit if recent.
        // Only score once per fall event.
        if (c.respawnAtMs === null) {
          const hit = deps.getLastHitBy().get(slotIndex) || null;
          let fallEventAttackerSlot = null;
          let fallEventVerb = "FELL OFF";
          // 2500ms window: covers slow slide-offs and falls; long enough
          // to avoid "ghost kills" where rammer gets no credit despite
          // clearly causing the fall.
          if (hit && Date.now() - hit.timestamp <= 2500) {
            const distOriginXZ = Math.hypot(p.x, p.z);
            const isCenterHole = distOriginXZ < deps.CONFIG.record.innerRadius + 2;
            let points = isCenterHole ? 2 : 1;

            if (hit.wasCritical) points += 1; // critical bonus

            // Leader lookup (before applying this score).
            let leaderSlotIndex = -1;
            let leaderScore = 0;
            let leaderTied = false;
            for (let i = 0; i < 4; i += 1) {
              const s = Number(deps.getRoundScores()[i] || 0);
              if (s > leaderScore) {
                leaderScore = s;
                leaderSlotIndex = i;
                leaderTied = false;
              } else if (s === leaderScore && s > 0) {
                leaderTied = true;
              }
            }
            if (!leaderTied && leaderSlotIndex >= 0 && slotIndex === leaderSlotIndex) points += 1; // target bonus

            // GameState.addScore is accessed via deps in main — use callback
            deps.addScore(hit.attackerSlotIndex, points);

            {
              const attackerSlot = deps.getNetSlots()[hit.attackerSlotIndex];
              const victimSlot = deps.getNetSlots()[slotIndex];
              const actorName = attackerSlot?.name || `P${hit.attackerSlotIndex + 1}`;
              const targetName = victimSlot?.name || `P${slotIndex + 1}`;
              const hud = deps.hud;
              const actorColor = hud?.colorHexToCss ? hud.colorHexToCss(deps.colorHexForSlot(attackerSlot)) : null;
              const targetColor = hud?.colorHexToCss ? hud.colorHexToCss(deps.colorHexForSlot(victimSlot)) : null;
              const verb = hud?.pickKillFeedVerb ? hud.pickKillFeedVerb(hit) : "RAMMED";
              hud?.addKillFeedEntry?.(actorName, actorColor, verb, targetName, targetColor);
              fallEventAttackerSlot = hit.attackerSlotIndex;
              fallEventVerb = verb;
            }
            if (deps.getRoundState().phase === "running") {
              if (hit.attackerSlotIndex === localSlotIndexThisFrame) {
                deps.setFovPunchUntil(performance.now() + 200);
              }
            }

            deps.sendHostRound(); // broadcast score update to non-host clients
          } else {
            const victimSlot = deps.getNetSlots()[slotIndex];
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
              attackerSlot: fallEventAttackerSlot,
              attackerSlotIndex: fallEventAttackerSlot,
              verb: fallEventVerb,
            }));
          }
          deps.getLastHitBy().delete(slotIndex);
        }

        deps.scheduleRespawn(c, now);
        let aliveCartCount = 0;
        let lastStandingSlotIndex = -1;
        for (let j = 0; j < 4; j += 1) {
          const cj = allCarts[j];
          if (!cj) continue;
          if (cj.respawnAtMs === null) {
            aliveCartCount += 1;
            lastStandingSlotIndex = j;
          }
        }
        if (
          aliveCartCount === 1 &&
          deps.getLastCartStandingTimeoutId() == null &&
          deps.getRoundState().startedAtMs > 0
        ) {
          deps.setLastCartStandingWinnerSlotIndex(lastStandingSlotIndex);
          deps.setSlowMoUntil(performance.now() + 3000);
          deps.setSlowMoRate(0.35);
          deps.setLastCartStandingTimeoutId(setTimeout(() => {
            deps.setLastCartStandingTimeoutId(null);
            if (deps.isHost() && deps.getRoundState().phase === "running") deps.endRound();
          }, 3000));
        }
        // If the override is already armed and the survivor has now also fallen,
        // end immediately using the already-chosen last-standing winner.
        if (
          deps.getLastCartStandingTimeoutId() != null &&
          aliveCartCount === 0
        ) {
          clearTimeout(deps.getLastCartStandingTimeoutId());
          deps.setLastCartStandingTimeoutId(null);
          if (deps.getLastCartStandingWinnerSlotIndex() === null) {
            deps.setLastCartStandingWinnerSlotIndex("draw");
          }
          if (deps.isHost() && deps.getRoundState().phase === "running") deps.endRound();
        }
      }
      if (c.respawnAtMs !== null && now >= c.respawnAtMs) {
        deps.doRespawn(c);
      }
      if (slot.kind === "npc") deps.maybeTriggerNpcOpportunisticRamBoost(now, c);
    }
  }

  // Round phase transitions (host only)
  if (deps.isHost()) {
    // running → end when timer expires
    if (
      deps.getRoundState().phase === "running" &&
      deps.getRoundState().startedAtMs > 0 &&
      Date.now() - deps.getRoundState().startedAtMs >= 95000 &&
      deps.getLastCartStandingTimeoutId() === null
    ) {
      deps.endRound();
    }
  }

  // Third-person follow camera (behind the cart).
  const localCart = deps.getLocalCart();
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
