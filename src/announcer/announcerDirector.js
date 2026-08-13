// announcerDirector.js — derives "The Store PA" announcer events from live game state.
// Pure observer: wires into gameStore (round phase / scores) and the host & non-host fall
// hooks threaded through gameFlow.js / netcode.js, then calls announce() on the announcer
// manager. Never touches gameplay/scoring/physics state — read-only reporting.

import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { resetAnnouncerRound, stopAnnouncer } from "./announcerManager.js";

/**
 * @typedef {object} AnnouncerDirectorDeps
 * @property {(eventId: string, data?: object) => { type: string } | void} announce
 *   Returns played/queued/discarded from the manager. Void/unknown is treated as discarded
 *   so a dropped combo line does not burn the tier (PA-COMBO-1).
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
 * @property {boolean} [wasCritical] Crediting ram was a critical (fast) hit.
 * @property {boolean} [victimWasLeader] Victim held the sole score lead at fall time.
 */

/** Rolling window (ms) used to chain falls into double_spill / aisle_wipeout. */
const FALL_BURST_WINDOW_MS = 1400;
/** Near-miss: a boosting opponent must pass within this XZ distance (meters). */
const NEAR_MISS_DIST_M = 2.6;
/** Near-miss: the passing opponent's planar speed floor (m/s) — slow drifts don't count. */
const NEAR_MISS_SPEED_MPS = 9;
/** A ram on either cart within this window voids the dodge (it was a hit, not a miss). */
const NEAR_MISS_RECENT_RAM_MS = 400;
/** Confirmation delay before close_call fires — the pass must end without contact. */
const CLOSE_CALL_DELAY_MS = 350;
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
 * @returns {boolean} True when this fall announced a pileup line.
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
    return true;
  }
  if (_fallBurstCount === 3) {
    _deps.announce("aisle_wipeout");
    return true;
  }
  return false;
}

/**
 * True when the manager accepted the line (playing now or waiting). A discarded
 * upgrade must not advance last-announced, or the next KO at that tier stays silent.
 * @param {{ type: string } | void} outcome
 * @returns {boolean}
 */
function isAnnounceAccepted(outcome) {
  const type = outcome && outcome.type;
  return type === "played" || type === "queued";
}

/**
 * Handles rampage/savage/carnage tier-up announcements for an attributed kill.
 * @param {number} attackerSlotIndex
 * @param {number} comboTier
 * @returns {boolean} True when this fall announced a combo line.
 */
function trackComboTierUp(attackerSlotIndex, comboTier) {
  if (comboTier <= 0) return false;
  const lastAnnounced = _comboLastAnnouncedTier[attackerSlotIndex] ?? 0;
  if (comboTier <= lastAnnounced) return false;
  const eventId = TIER_EVENT_IDS[comboTier];
  if (!eventId) return false;
  const outcome = _deps.announce(eventId, { attacker: nameForSlot(attackerSlotIndex) });
  if (!isAnnounceAccepted(outcome)) return false;
  _comboLastAnnouncedTier[attackerSlotIndex] = comboTier;
  return true;
}

/**
 * Handles refund (revenge) detection/bookkeeping for an attributed kill.
 * @param {number} attackerSlotIndex
 * @param {number} victimSlotIndex
 * @returns {boolean} True when this fall announced a refund line.
 */
function trackRefund(attackerSlotIndex, victimSlotIndex) {
  let announced = false;
  if (_lastKillerOf.get(attackerSlotIndex) === victimSlotIndex) {
    _deps.announce("refund", { attacker: nameForSlot(attackerSlotIndex) });
    _lastKillerOf.delete(attackerSlotIndex);
    announced = true;
  }
  // * Recorded AFTER the revenge check so this kill becomes the new lookup entry for
  // * the victim's own eventual payback.
  _lastKillerOf.set(victimSlotIndex, attackerSlotIndex);
  return announced;
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

  const pileupThisFall = trackFallBurst(performance.now());

  if (attackerSlotIndex != null) {
    let streakThisFall = pileupThisFall;
    if (!_firstSpillFired) {
      _firstSpillFired = true;
      _deps.announce("first_spill", { attacker: nameForSlot(attackerSlotIndex) });
      streakThisFall = true;
      // * First-spill owns this KO. Combo left the kill-burst (PA-COMBO-1), so
      // * skip the tier-up here or RAMPAGE would start under FIRST SPILL.
    } else if (trackComboTierUp(attackerSlotIndex, comboTier ?? 0)) {
      streakThisFall = true;
    }
    if (trackRefund(attackerSlotIndex, victimSlotIndex)) streakThisFall = true;
    // * Same-fall flavor skip (PA-QUIET-1): one KO = one spoken line. Isolated
    // * leader_down / critical_ko still fire when this fall has no streak line.
    if (!streakThisFall) {
      if (fall.victimWasLeader) {
        _deps.announce("leader_down", {
          attacker: nameForSlot(attackerSlotIndex),
          victim: nameForSlot(victimSlotIndex),
        });
      } else if (fall.wasCritical) {
        _deps.announce("critical_ko", { attacker: nameForSlot(attackerSlotIndex) });
      }
    }
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
 * True near-miss detection: per-frame proximity scan of the local cart against every
 * opponent. A boosting opponent passing within NEAR_MISS_DIST_M at speed — without a
 * ram registering on either cart around the pass — arms a short confirmation timer,
 * then fires close_call ("you dodged that"). Edge-detected per opponent so one pass
 * fires at most once; the close_call event's own cooldown/maxPerRound caps spam.
 *
 * @param {Array<object>} allCarts Slot carts (entries may be null).
 * @param {number} localSlotIndex Local player's slot, or -1.
 * @param {number} nowMs performance.now().
 * @returns {void}
 */
export function announcerDirectorNearMissScan(allCarts, localSlotIndex, nowMs) {
  if (!_deps || !isRoundRunning()) return;
  if (localSlotIndex < 0) return;
  const local = allCarts?.[localSlotIndex];
  if (!local?.body || local.respawnAtMs != null || local.isShattering) return;
  // * Recently rammed → that pass connected; not a dodge.
  if (nowMs - (local.lastRamTimeMs || 0) < NEAR_MISS_RECENT_RAM_MS) return;

  const lp = local.body.translation();
  for (let i = 0; i < allCarts.length; i += 1) {
    if (i === localSlotIndex) continue;
    const c = allCarts[i];
    if (!c?.body) continue;
    const boosting = Boolean(c.isRamBoosting) || (c.ramBoostActiveUntilMs || 0) > nowMs;
    if (!boosting) {
      c._nearMissClose = false;
      continue;
    }
    const p = c.body.translation();
    const dx = p.x - lp.x;
    const dz = p.z - lp.z;
    if (dx * dx + dz * dz > NEAR_MISS_DIST_M * NEAR_MISS_DIST_M) {
      c._nearMissClose = false;
      continue;
    }
    if (nowMs - (c.lastRamTimeMs || 0) < NEAR_MISS_RECENT_RAM_MS) continue;
    const v = c.body.linvel();
    if (Math.hypot(v.x, v.z) < NEAR_MISS_SPEED_MPS) continue;
    if (!c._nearMissClose) {
      c._nearMissClose = true;
      armCloseCall(local);
    }
  }
}

/**
 * Confirmation timer: the dodge only counts if no ram lands on the local cart
 * before it expires.
 * @param {object} localCart
 */
function armCloseCall(localCart) {
  if (_closeCallTimer !== null) return;
  const armedAtMs = performance.now();
  _closeCallTimer = setTimeout(() => {
    _closeCallTimer = null;
    if (!_deps || !isRoundRunning()) return;
    if ((localCart.lastRamTimeMs || 0) > armedAtMs - NEAR_MISS_RECENT_RAM_MS) return;
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
