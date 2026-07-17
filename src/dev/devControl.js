// devControl.js — one DEV-only mutation API shared by the panel and diagnostics.

import { commandFail, commandOk } from "./commandRegistry.js";

/**
 * @typedef {object} DevControlDeps
 * @property {() => boolean} getIsHost
 * @property {() => { phase: string }} getRoundState
 * @property {() => Array<{ kind?: string } | null | undefined>} getNetSlots
 * @property {() => string | null | undefined} getYouConnId
 * @property {(connId: string | null | undefined) => number} getLocalSlotIndex
 * @property {(scores: Record<number, number>) => void} setRoundScores
 * @property {(startedAtMs: number) => void} setRoundStartedAtMs
 * @property {() => number} getRoundClockNowMs
 * @property {() => void} sendHostRound
 * @property {(level: string, n: number) => void} grantKos
 * @property {number} roundDurationMs
 */

/**
 * Creates the sole developer mutation surface for round and progression controls.
 * @param {DevControlDeps} deps
 */
export function createDevControl(deps) {
  const requireHostRunningRound = () => {
    if (!deps.getIsHost()) {
      return commandFail("host-required", "Host control required.");
    }
    if (deps.getRoundState().phase !== "running") {
      return commandFail("round-not-running", "Start a round before using this control.");
    }
    return null;
  };

  return {
    /**
     * @param {number} [remainMs]
     */
    rewindRoundClock(remainMs = 1500) {
      const blocked = requireHostRunningRound();
      if (blocked) return blocked;
      const remaining = Number(remainMs);
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > deps.roundDurationMs) {
        return commandFail(
          "bad-args",
          `Remaining time must be between 1 and ${deps.roundDurationMs} ms.`,
        );
      }
      deps.setRoundStartedAtMs(
        deps.getRoundClockNowMs() - (deps.roundDurationMs - remaining),
      );
      deps.sendHostRound();
      return commandOk(`Round clock rewound to ${Math.round(remaining)} ms remaining.`);
    },

    /**
     * @param {Record<number, number>} scores
     */
    setScores(scores) {
      const blocked = requireHostRunningRound();
      if (blocked) return blocked;
      const normalized = /** @type {Record<number, number>} */ ({});
      for (let slot = 0; slot < 4; slot += 1) {
        const score = Number(scores?.[slot]);
        if (!Number.isInteger(score) || score < 0) {
          return commandFail("bad-args", "Scores must be four non-negative integers.");
        }
        normalized[slot] = score;
      }
      deps.setRoundScores(normalized);
      deps.sendHostRound();
      return commandOk(`Scores set to ${Object.values(normalized).join("–")}.`);
    },

    /**
     * @param {string} level
     * @param {number} n
     */
    grantKos(level, n) {
      const amount = Number(n);
      if (!level || !Number.isInteger(amount) || amount <= 0) {
        return commandFail("bad-args", "KO grant requires a level and a positive integer.");
      }
      deps.grantKos(level, amount);
      return commandOk(`Granted ${amount} KOs on ${level}.`);
    },

    forceSuddenDeath() {
      const blocked = requireHostRunningRound();
      if (blocked) return blocked;

      const slots = deps.getNetSlots();
      const localIdx = deps.getLocalSlotIndex(deps.getYouConnId());
      let rivalIdx = -1;
      for (let slot = 0; slot < 4; slot += 1) {
        if (slot !== localIdx && slots[slot]?.kind === "npc") {
          rivalIdx = slot;
          break;
        }
      }
      if (rivalIdx < 0) {
        for (let slot = 0; slot < 4; slot += 1) {
          if (slot !== localIdx) {
            rivalIdx = slot;
            break;
          }
        }
      }
      if (localIdx < 0 || rivalIdx < 0) {
        return commandFail("unknown", "Could not identify two active score slots.");
      }

      const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      scores[localIdx] = 2;
      scores[rivalIdx] = 2;
      deps.setRoundScores(scores);
      deps.setRoundStartedAtMs(
        deps.getRoundClockNowMs() - (deps.roundDurationMs - 10_000),
      );
      // * The normal timer-expiry path enters Sudden Death; this never sets the flag directly.
      deps.sendHostRound();
      return commandOk("Sudden Death setup armed: tied leaders with about 10 seconds left.");
    },
  };
}
