// devControl.js — shared mutation API for the debug panel and __ccDiag.control.
// Created from main when DEV || ?diag=1 (prod included under ?diag=1). Most levers require
// host + running phase; forceKillFeed is the exception (DEV-only via deps.isDev).

import { commandFail, commandOk } from "./commandRegistry.js";
import { rebuildKOEvent } from "../scoring/koEvent.js";
import { killFeedReactor } from "../scoring/koReactors.js";

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
 * @property {(reason?: string) => void} [returnToMenu]  Non-host session teardown → menu (07-17 freeze repro).
 * @property {boolean} [isDev]  True only in a Vite DEV build. Passed IN rather than read from
 *   `import.meta.env` here, because vitest runs with DEV === true and an internal read would
 *   make the production branch untestable. Gates `forceKillFeed` alone.
 * @property {() => object | null | undefined} [getHud]  Live HUD facade (addKillFeedEntry, colorHexToCss).
 * @property {(slot: object | null | undefined) => number | string} [colorHexForSlot]
 * @property {() => Array<object> | null | undefined} [getAllCarts]
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

  const control = {
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

    /**
     * Drives the real returnToMenu teardown so a 2-client harness can reproduce the 07-17
     * non-host input freeze: teardown runs clearNetcodeRuntimeRefs (nulls netcode's getAxisRef),
     * and only re-entering a session (ensureSessionCartsReady → wireNetcodeRuntimeRefs) re-wires
     * it. Unlike the round levers this is deliberately NOT host-gated — the freeze only bit
     * non-host clients, so the repro must run on the joiner. See tools/netharness.mjs
     * (scenario teardownRejoin).
     * @param {string} [reason]
     */
    returnToMenu(reason = "esc") {
      if (typeof deps.returnToMenu !== "function") {
        return commandFail("unknown", "returnToMenu is not wired in this build.");
      }
      deps.returnToMenu(String(reason));
      return commandOk(`Returned to menu (reason: ${reason}).`);
    },
  };

  // * SHEET-1: render one kill-feed row on demand. The contact sheet captures a few seconds
  // * into a round, before any NPC has scored, and `.hud-feed` keeps its `is-empty` class
  // * (display:none, hud.css:690) until a row exists — so the redesigned feed plates were
  // * invisible to the sweep and therefore UNVERIFIED.
  //
  // * Deliberately narrow. It reuses the two real functions the non-host path already uses —
  // * rebuildKOEvent (the wire-message KO builder, netcode.js:17) then killFeedReactor
  // * (koReactors.js:57) — so the row is the product's own markup, verb, colors and combo
  // * pip. It does NOT run dispatchKOEvent: that fan-out also drives matchStats, the
  // * challenge counters and the per-level unlock funnel, and a screenshot tool must not
  // * write progression. No score or physics mutation either (reactors are pure consumers).
  //
  // * DEV-only by `isDev`, unlike every other lever here: devControl attaches in PROD under
  // * ?diag=1 (main.js:1577), and a lever that injects kill-feed rows on the live site would
  // * let anyone fake a KO in a screenshot. The others gate on host+running; this one simply
  // * does not exist outside a Vite DEV build.
  if (!deps.isDev) return control;

  /**
   * @param {{ victimSlotIndex?: number, attackerSlotIndex?: number | null, verb?: string,
   *   comboTier?: number, comboMultiplier?: number }} [opts]
   */
  const forceKillFeed = (opts = {}) => {
    const hud = deps.getHud?.();
    if (!hud?.addKillFeedEntry) {
      // * "unknown" per the closed CommandFailureReason union — same shape returnToMenu
      // * uses for "not wired in this build".
      return commandFail("unknown", "HUD is not mounted — enter a round first.");
    }
    const netSlots = deps.getNetSlots() || [];
    const victimSlotIndex = Number.isInteger(opts.victimSlotIndex) ? Number(opts.victimSlotIndex) : 1;
    const attackerSlotIndex =
      opts.attackerSlotIndex === null
        ? null
        : Number.isInteger(opts.attackerSlotIndex)
          ? Number(opts.attackerSlotIndex)
          : deps.getLocalSlotIndex(deps.getYouConnId());
    if (victimSlotIndex < 0 || victimSlotIndex > 3) {
      return commandFail("bad-args", "victimSlotIndex must be 0-3.");
    }
    if (attackerSlotIndex != null && (attackerSlotIndex < 0 || attackerSlotIndex > 3)) {
      return commandFail("bad-args", "attackerSlotIndex must be 0-3 or null.");
    }
    if (attackerSlotIndex === victimSlotIndex) {
      return commandFail("bad-args", "attacker and victim cannot be the same slot.");
    }

    const koEvent = rebuildKOEvent(
      {
        victimSlotIndex,
        attackerSlotIndex,
        verb: opts.verb || (attackerSlotIndex == null ? "FELL OFF" : "RAMMED"),
        comboTier: opts.comboTier ?? 0,
        comboMultiplier: opts.comboMultiplier ?? 1.0,
      },
      { getNetSlots: () => netSlots, getAllCarts: () => deps.getAllCarts?.() || [] },
    );
    killFeedReactor(koEvent, {
      netSlots,
      localSlotIndex: deps.getLocalSlotIndex(deps.getYouConnId()),
      hud,
      colorHexForSlot: deps.colorHexForSlot || (() => 0xffffff),
    });
    const who = attackerSlotIndex == null ? "environment" : `slot ${attackerSlotIndex}`;
    return commandOk(`Kill-feed row rendered: ${who} → slot ${victimSlotIndex} (${koEvent.verb}).`);
  };

  return { ...control, forceKillFeed };
}
