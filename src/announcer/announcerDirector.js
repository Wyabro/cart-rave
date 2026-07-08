// announcerDirector.js — derives "The Store PA" announcer events from live game state.
// Pure observer: wires into gameStore (round phase / scores) and the host & non-host fall
// hooks threaded through gameFlow.js / netcode.js, then calls announce() on the announcer
// manager. Never touches gameplay/scoring/physics state — read-only reporting.

import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { resetAnnouncerRound, stopAnnouncer } from "./announcerManager.js";

/**
 * @typedef {object} AnnouncerDirectorDeps
 * @property {(eventId: string, data?: object) => void} announce
 * @property {() => Array<object>} getNetSlots
 * @property {() => number} getLocalSlotIndex
 * @property {() => number | null} getRemainingRoundMs Milliseconds left in the round, or
 *   null when not in a normal countdown-driven running state (e.g. Sudden Death).
 */

/**
 * @typedef {object} AnnouncerDirectorFall
 * @property {number} victimSlotIndex
 * @property {number | null} attackerSlotIndex
 * @property {number} comboTier
 */

/** Rolling window (ms) used to chain falls into double_spill / aisle_wipeout. */
const FALL_BURST_WINDOW_MS = 1400;
/** Local-player big-hit intensity threshold that arms the close_call timer. */
const CLOSE_CALL_INTENSITY_THRESHOLD = 0.85;
/** Delay before a close_call announcement fires, assuming the local player survives it. */
const CLOSE_CALL_DELAY_MS = 2500;
/** Deficit (in kills/points) that upgrades a leader change from new_leader to comeback. */
const COMEBACK_DEFICIT_THRESHOLD = 3;
/** The finale (last_call) owns the final ten seconds — new_leader (not comeback) is suppressed then. */
const FINALE_SUPPRESS_NEW_LEADER_MS = 10000;

/** Combo tier -> announcer event id. */
const TIER_EVENT_IDS = { 1: "rampage", 2: "savage", 3: "carnage" };

/** @type {AnnouncerDirectorDeps | null} */
let _deps = null;
/** @type {(() => void) | null} */
let _unsubscribe = null;

// === Per-round tracking state ===

let _firstSpillFired = false;
/** Rolling fall-burst tracking for double_spill / aisle_wipeout. */
let _fallBurstLastMs = -Infinity;
let _fallBurstCount = 0;
/** Per-slot last-announced combo tier (0 = none announced yet this round). */
let _comboLastAnnouncedTier = [0, 0, 0, 0];
/** victimSlot -> attackerSlot of their most recent attributed death, for refund detection. */
let _lastKillerOf = new Map();
/** Pending close_call timer id, or null. */
let _closeCallTimer = null;
/** Per-slot maximum deficit-to-leader observed so far this round. */
let _maxDeficit = [0, 0, 0, 0];
/** Most recent sole-leader slot index (sticky through ties), or null. */
let _prevSoleLeaderSlot = null;

/**
 * Resolves a display name for a slot index.
 * @param {number} slotIndex
 * @returns {string}
 */
function nameForSlot(slotIndex) {
  const slots = _deps?.getNetSlots?.() ?? [];
  return slots?.[slotIndex]?.name || `P${slotIndex + 1}`;
}

/**
 * Clears all per-round director tracking state (does not touch the announcer manager).
 * @returns {void}
 */
function clearRoundTrackingState() {
  _firstSpillFired = false;
  _fallBurstLastMs = -Infinity;
  _fallBurstCount = 0;
  _comboLastAnnouncedTier = [0, 0, 0, 0];
  _lastKillerOf = new Map();
  if (_closeCallTimer) {
    clearTimeout(_closeCallTimer);
    _closeCallTimer = null;
  }
  _maxDeficit = [0, 0, 0, 0];
  _prevSoleLeaderSlot = null;
}

/**
 * @returns {boolean} True while the round is actively playing (director rules only apply then).
 */
function isRoundRunning() {
  return gameStore.getState().roundPhase === RoundPhase.RUNNING;
}

/**
 * Handles the double_spill / aisle_wipeout rolling-window fall chain. Any fall (attributed
 * or not) counts toward the chain.
 * @param {number} nowMs
 * @returns {void}
 */
function trackFallBurst(nowMs) {
  if (nowMs - _fallBurstLastMs <= FALL_BURST_WINDOW_MS) {
    _fallBurstCount += 1;
  } else {
    _fallBurstCount = 1;
  }
  _fallBurstLastMs = nowMs;

  if (_fallBurstCount === 2) {
    _deps.announce("double_spill");
  } else if (_fallBurstCount === 3) {
    _deps.announce("aisle_wipeout");
  }
}

/**
 * Handles rampage/savage/carnage tier-up announcements for an attributed kill.
 * @param {number} attackerSlotIndex
 * @param {number} comboTier
 * @returns {void}
 */
function trackComboTierUp(attackerSlotIndex, comboTier) {
  if (comboTier <= 0) return;
  const lastAnnounced = _comboLastAnnouncedTier[attackerSlotIndex] ?? 0;
  if (comboTier <= lastAnnounced) return;
  _comboLastAnnouncedTier[attackerSlotIndex] = comboTier;
  const eventId = TIER_EVENT_IDS[comboTier];
  if (eventId) {
    _deps.announce(eventId, { attacker: nameForSlot(attackerSlotIndex) });
  }
}

/**
 * Handles refund (revenge) detection/bookkeeping for an attributed kill.
 * @param {number} attackerSlotIndex
 * @param {number} victimSlotIndex
 * @returns {void}
 */
function trackRefund(attackerSlotIndex, victimSlotIndex) {
  if (_lastKillerOf.get(attackerSlotIndex) === victimSlotIndex) {
    _deps.announce("refund", { attacker: nameForSlot(attackerSlotIndex) });
    _lastKillerOf.delete(attackerSlotIndex);
  }
  // * Recorded AFTER the revenge check so this kill becomes the new lookup entry for
  // * the victim's own eventual payback.
  _lastKillerOf.set(victimSlotIndex, attackerSlotIndex);
}

/**
 * Reports a fall (host-authoritative, replayed identically on every client). Call once
 * per fall on the machine that observes it — see gameFlow.js (host) and netcode.js
 * (non-host falls[] replay).
 * @param {AnnouncerDirectorFall} fall
 * @returns {void}
 */
export function announcerDirectorOnFall(fall) {
  if (!_deps || !isRoundRunning()) return;
  const { victimSlotIndex, attackerSlotIndex, comboTier } = fall;

  // * Cancel a pending close_call if the local player is the one who just fell.
  if (_closeCallTimer !== null && victimSlotIndex === _deps.getLocalSlotIndex()) {
    clearTimeout(_closeCallTimer);
    _closeCallTimer = null;
  }

  trackFallBurst(performance.now());

  if (attackerSlotIndex != null) {
    if (!_firstSpillFired) {
      _firstSpillFired = true;
      _deps.announce("first_spill", { attacker: nameForSlot(attackerSlotIndex) });
    }
    trackComboTierUp(attackerSlotIndex, comboTier ?? 0);
    trackRefund(attackerSlotIndex, victimSlotIndex);
  } else {
    _deps.announce("cleanup_aisle", {
      victim: nameForSlot(victimSlotIndex),
      aisle: 1 + Math.floor(Math.random() * 9),
    });
  }

  // * A fall always clears the victim's own streak tracking, win or lose.
  _comboLastAnnouncedTier[victimSlotIndex] = 0;
}

/**
 * Reports a local camera-shake-worthy hit. Arms a close_call announcement if the hit was
 * big enough and the local player survives the next couple seconds.
 * @param {number} intensity Clamped ram-shake intensity (see main.js triggerLocalRamShake).
 * @returns {void}
 */
export function announcerDirectorOnLocalBigHit(intensity) {
  if (!_deps || !isRoundRunning()) return;
  if (intensity < CLOSE_CALL_INTENSITY_THRESHOLD) return;
  if (_closeCallTimer !== null) return;

  _closeCallTimer = setTimeout(() => {
    _closeCallTimer = null;
    if (!_deps || !isRoundRunning()) return;
    _deps.announce("close_call");
  }, CLOSE_CALL_DELAY_MS);
}

/**
 * Recomputes the sole round leader from current scores and announces new_leader/comeback
 * when it changes. Also tracks per-slot max deficit-to-leader for the comeback threshold.
 * @returns {void}
 */
function evaluateLeaderChange() {
  const scores = gameStore.getState().roundScores;
  let topScore = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    topScore = Math.max(topScore, Number(scores[i] || 0));
  }

  let leaderCount = 0;
  let soleLeader = -1;
  for (let i = 0; i < 4; i += 1) {
    const score = Number(scores[i] || 0);
    if (score === topScore) {
      leaderCount += 1;
      soleLeader = i;
    }
    const deficit = topScore - score;
    if (deficit > (_maxDeficit[i] ?? 0)) _maxDeficit[i] = deficit;
  }
  const currentSoleLeader = topScore > 0 && leaderCount === 1 ? soleLeader : null;

  if (currentSoleLeader === null || currentSoleLeader === _prevSoleLeaderSlot) return;

  const leaderDeficit = _maxDeficit[currentSoleLeader] ?? 0;
  const leaderName = nameForSlot(currentSoleLeader);
  if (leaderDeficit >= COMEBACK_DEFICIT_THRESHOLD) {
    _deps.announce("comeback", { leader: leaderName });
  } else {
    const remainingMs = _deps.getRemainingRoundMs();
    const inFinale = remainingMs != null && remainingMs < FINALE_SUPPRESS_NEW_LEADER_MS;
    if (!inFinale) _deps.announce("new_leader", { leader: leaderName });
  }
  _prevSoleLeaderSlot = currentSoleLeader;
}

/**
 * Handles a gameStore change: round-phase transitions and (while running) leaderboard shifts.
 * @param {ReturnType<typeof gameStore.getState>} state
 * @param {ReturnType<typeof gameStore.getState>} prevState
 * @returns {void}
 */
function handleStoreChange(state, prevState) {
  if (!_deps) return;

  if (state.roundPhase !== prevState.roundPhase) {
    const enteringActive =
      (state.roundPhase === RoundPhase.COUNTDOWN || state.roundPhase === RoundPhase.RUNNING)
      && prevState.roundPhase !== RoundPhase.COUNTDOWN
      && prevState.roundPhase !== RoundPhase.RUNNING;
    if (enteringActive) {
      resetAnnouncerDirectorRound();
    } else if (state.roundPhase === RoundPhase.LOBBY) {
      stopAnnouncer();
    }
  }

  if (state.roundPhase === RoundPhase.RUNNING && state.roundScores !== prevState.roundScores) {
    evaluateLeaderChange();
  }
}

/**
 * Initializes the announcer director. Safe to call once from main; subscribes to gameStore
 * for the lifetime of the page (no teardown hook — mirrors the announcer manager singleton).
 * @param {AnnouncerDirectorDeps} deps
 * @returns {void}
 */
export function initAnnouncerDirector(deps) {
  _deps = deps;
  clearRoundTrackingState();
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = gameStore.subscribe(handleStoreChange);
}

/**
 * Clears all per-round director tracking (combo streaks, fall-burst chain, revenge map,
 * pending close_call timer, leader/deficit tracking). Does not affect gameplay state.
 *
 * Also resets the announcer manager's own round-scoped state (cooldowns/oncePerRound/queue)
 * via resetAnnouncerRound() (imported directly from announcerManager.js) — call sites don't
 * need to call it separately. Driven internally by the gameStore phase subscription.
 * @returns {void}
 */
function resetAnnouncerDirectorRound() {
  clearRoundTrackingState();
  resetAnnouncerRound();
}
