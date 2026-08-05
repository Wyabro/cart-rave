/**
 * gameplayAnalytics.js — wires gameplay to the analytics core (the emission layer).
 *
 * The analytics sibling of gameplayDiagnostics.js, deliberately the same shape: subscribe
 * to the Zustand stores for transitions they already broadcast synchronously (zero store
 * edits), read ids/modes via injected deps, and emit a SMALL set of high-value events:
 *
 *   session_start        once per page load — device tier context
 *   match_started        phase → running — { arena, mode }
 *   match_ended          running → podium — duration, end reason, local result, KO totals
 *   unlock_earned        any unlock grant (levels + cosmetics, via onUnlockGranted)
 *   challenge_completed  a daily/weekly challenge finished — { id }
 *   player_quit          returnToMenu (reason) or page close mid-round (see gameSession.js
 *                        + the onPageHide hook) — { reason, phase }
 *   client_error         rate-limited error beacons (emitted in errorReporter.js)
 *   session_end          pagehide — session duration + matches played
 *   quickplay_shard_assigned  first quickplay match of a page load — { shard, hops }.
 *                        QUICKPLAY-SHARD-1's evidence: `hops > 0` over all of these is the
 *                        overflow rate, and deep chains are the signal that the sequential
 *                        hop needs replacing with an occupancy registry.
 *
 * Nothing here is per-frame; store subscriptions fire only on transitions. When analytics
 * are opted out, initAnalytics() declines and every subscription callback exits on the
 * trackEvent() null check.
 *
 * If ?diag is active, an `analytics` probe exposes the queue/sink internals through
 * __ccDiag.snapshot("analytics") — the observability systems observe each other.
 */

import { MIN_MATCH_DURATION_MS } from "../../shared/analyticsConstants.js";
import { ROUND_DURATION_MS } from "../../shared/roundConstants.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { onUnlockGranted } from "../stores/unlockStore.js";
import { challengeStore } from "../stores/challengeStore.js";
import { snapshotMatchStats } from "../scoring/matchStats.js";
import { settingsStore } from "../stores/settingsStore.js";
import { registerDiagProbe } from "../utils/diagnostics.js";
import { getAutoQualityStepLog } from "../utils/autoQuality.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { probeGpu } from "../utils/gpuCaps.js";
import { initAnalytics, trackEvent, getAnalyticsDebugState } from "./analytics.js";

/**
 * @typedef {object} GameplayAnalyticsDeps
 * @property {() => string} [getMode]           detectGameMode() ("solo"|"quickplay"|…).
 * @property {() => string | null} [getLevelId] Current arena id.
 * @property {() => number} [getLocalSlot]      Local player's slot index (-1 if unseated).
 * @property {() => boolean} [getLocalCartActive] True when the local player has a live,
 *   enabled cart body — i.e. is actually IN this round. Absent ⇒ treated as true, so a
 *   caller that does not wire it keeps the old behaviour.
 * @property {() => number} [getQuickplayHops] Overflow shards walked before this seat
 *   (QUICKPLAY-SHARD-1). Absent ⇒ 0.
 */

/**
 * Install analytics wiring. Called once from main() — unconditionally (production-safe);
 * opt-out and DEV routing are the core's concern.
 *
 * @param {GameplayAnalyticsDeps} deps
 * @returns {void}
 */
export function installGameplayAnalytics(deps) {
  let matchesThisSession = 0;
  /** QUICKPLAY-SHARD-1: one shard-assignment datapoint per page load, not per rematch. */
  let shardAssignedEmitted = false;
  let matchStartedPerfMs = 0;
  let sawSuddenDeath = false;

  const mode = () => (deps.getMode ? deps.getMode() : null);
  const arena = () => (deps.getLevelId ? deps.getLevelId() : null);

  const enabled = initAnalytics({
    onPageHide: () => {
      // * Final events ride the pagehide beacon: a close mid-round is a quit signal the
      // * regular quit path never sees, and every session gets a duration bookend.
      const phase = gameStore.getState().roundPhase;
      if (phase === RoundPhase.RUNNING || phase === RoundPhase.COUNTDOWN) {
        trackEvent("player_quit", { reason: "pagehide", phase, arena: arena(), mode: mode() });
      }
      // * WARM-IGPU-1 Phase 0b: the tier a session ENDED on, plus every auto step-down.
      // * `tier` at session_start is the stored preference; the watchdog can silently
      // * demote it (irreversibly — there is no step-up path) and nothing reported that.
      // * `steps` > 0 with `firstStepSource: "attract"` means players are being demoted
      // * by menu shader-compile stalls before gameplay is ever measured.
      const steps = getAutoQualityStepLog();
      trackEvent("session_end", {
        durationMs: Math.round(performance.now()),
        matches: matchesThisSession,
        tier: safeCall(() => getQualityTier()) ?? null,
        steps: steps.length,
        firstStepSource: steps[0]?.source ?? null,
        firstStepAtMs: steps[0]?.tMs ?? null,
        firstStepP95: steps[0]?.p95 ?? null,
      });
    },
  });
  if (!enabled) return;

  trackEvent("session_start", {
    mode: mode(),
    tier: safeCall(() => settingsStore.getState().qualityTier) ?? null,
    // * Pairs with session_end's `tier`/`steps`: gpuClass is what CHOSE the starting tier
    // * (discrete → high, unknown/iGPU → medium), so a demotion pattern can be read per
    // * hardware class instead of per anecdote. WARM-IGPU-1 Phase 0b.
    gpuClass: safeCall(() => probeGpu().gpuClass) ?? null,
    dpr: typeof window !== "undefined" ? Math.round((window.devicePixelRatio ?? 1) * 100) / 100 : null,
    touch: typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) > 0 : null,
    menuReadyMs: readMenuReadyMs(),
  });

  // — Match lifecycle (gameStore): running = match_started, running→podium = match_ended —
  //
  // * ANLX-ATTRACT-1: a phase transition is NOT proof you played. A mid-round joiner adopts
  // * the room's `running` phase from hello/MSG.round (netcode.js:2548/:2843) while still on
  // * the menu with no cart, which booked phantom matches — 162 of 212 recent match_ended
  // * rows were <3s all-draw quickplay phantoms. So the gate is participation: a live cart
  // * body. `from === COUNTDOWN` is NOT usable — shouldHoldNonHostCountdownPhase makes
  // * lobby→running legitimate for a slow non-host, so it would drop real matches.
  const hasLocalCart = () =>
    typeof deps.getLocalCartActive === "function" ? Boolean(deps.getLocalCartActive()) : true;

  // * A joiner qualifies moments AFTER the transition, and this module has no tick of its
  // * own (it only runs on phase changes), so the latch needs its own wake-up. One timeout
  // * chain, rescheduled only while still pending and still running, cleared on emit / on
  // * leaving RUNNING / at the cap. setTimeout not rAF: rAF is frozen in a hidden tab and a
  // * backgrounded joiner must still be able to qualify.
  const PARTICIPATION_POLL_MS = 250;
  let pendingStart = false;
  let startedEmitted = false;
  let pendingSinceMs = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pollHandle = null;

  const stopPoll = () => {
    if (pollHandle != null) {
      clearTimeout(pollHandle);
      pollHandle = null;
    }
  };

  const emitStarted = (joinedMidRound) => {
    matchStartedPerfMs = performance.now();
    sawSuddenDeath = false;
    startedEmitted = true;
    pendingStart = false;
    stopPoll();
    trackEvent("match_started", { arena: arena(), mode: mode(), joinedMidRound });
    maybeEmitShardAssigned();
  };

  // * QUICKPLAY-SHARD-1. Fires on a SUCCESSFUL seat (not on a reject), once per page load, and
  // * only for quickplay — so hops:0 is the denominator and `hops > 0` over all of them is the
  // * overflow rate. This is the evidence that decides whether the sequential hop chain ever
  // * needs replacing with an occupancy registry: the hop costs one connect round-trip per full
  // * shard, which only bites at high concurrency, and guessing at that in advance would have
  // * meant building a registry DO nobody may need. Deep or frequent chains here are the signal.
  const maybeEmitShardAssigned = () => {
    if (shardAssignedEmitted) return;
    if (mode() !== "quickplay") return;
    shardAssignedEmitted = true;
    let shard = null;
    try {
      shard = new URLSearchParams(window.location.search || "").get("room") || "quickplay";
    } catch { /* non-browser */ }
    trackEvent("quickplay_shard_assigned", {
      shard,
      hops: typeof deps.getQuickplayHops === "function" ? deps.getQuickplayHops() : 0,
    });
  };

  const pollParticipation = () => {
    pollHandle = null;
    if (!pendingStart) return;
    if (gameStore.getState().roundPhase !== RoundPhase.RUNNING) {
      pendingStart = false;
      return;
    }
    if (hasLocalCart()) {
      emitStarted(true);
      return;
    }
    // * Cap on the single-sourced round length — a round cannot outlive it, so neither
    // * should the poll.
    if (performance.now() - pendingSinceMs >= ROUND_DURATION_MS) {
      pendingStart = false;
      return;
    }
    pollHandle = setTimeout(pollParticipation, PARTICIPATION_POLL_MS);
  };

  let prevPhase = gameStore.getState().roundPhase;
  gameStore.subscribe((state) => {
    const phase = state.roundPhase;
    if (phase === prevPhase) {
      if (state.isSuddenDeath) sawSuddenDeath = true;
      return;
    }
    const from = prevPhase;
    prevPhase = phase;

    if (phase !== RoundPhase.RUNNING) {
      // * Left RUNNING without ever qualifying — drop the latch so a spectated round
      // * cannot fire into the next one.
      pendingStart = false;
      stopPoll();
    }

    if (phase === RoundPhase.RUNNING) {
      startedEmitted = false;
      if (hasLocalCart()) {
        emitStarted(false);
      } else {
        pendingStart = true;
        pendingSinceMs = performance.now();
        stopPoll();
        pollHandle = setTimeout(pollParticipation, PARTICIPATION_POLL_MS);
      }
    } else if (phase === RoundPhase.PODIUM && from === RoundPhase.RUNNING && startedEmitted) {
      // * Pair closes here. Deliberately NOT re-testing the cart: bodies get disabled
      // * mid-round (empty-slot path main.js:716-718, KO/respawn toggles), so a body check
      // * at podium would drop the match of whoever happened to be down at the end.
      startedEmitted = false;
      matchesThisSession += 1;
      const sdLatch = sawSuddenDeath;
      // * Deferred one microtask: non-host clients apply MSG.round via SEPARATE setters —
      // * phase first, THEN winner/endReason/scores (netcode.js) — so reading synchronously
      // * here would see the previous round's results. After the current task, every setter
      // * in the message handler has landed. (Host order is already safe; deferral is harmless.)
      queueMicrotask(() => {
        const s = gameStore.getState();
        const stats = snapshotMatchStats();
        const winner = s.roundWinnerSlotIndex;
        const localSlot = deps.getLocalSlot ? deps.getLocalSlot() : -1;
        const durationMs =
          matchStartedPerfMs > 0 ? Math.round(performance.now() - matchStartedPerfMs) : null;
        // * ANLX-BULK-1 L2: skip only when durationMs is a finite value below the shared
        // * floor (scripted/tool 4–12 ms ends). Do NOT also drop null here — null still
        // * emits; L1 summary excludes null-duration ends. Out of scope for this PR.
        if (durationMs != null && durationMs < MIN_MATCH_DURATION_MS) return;
        trackEvent("match_ended", {
          arena: arena(),
          mode: mode(),
          durationMs,
          endReason: s.roundEndReason,
          result: winner === "draw" || winner == null ? "draw" : winner === localSlot ? "win" : "loss",
          suddenDeath: sdLatch || s.isSuddenDeath,
          kos: stats.kos,
          localKos: stats.localKos,
          localDeaths: stats.localDeaths,
          maxComboTier: stats.maxComboTier,
        });
      });
    }
    if (state.isSuddenDeath) sawSuddenDeath = true;
  });

  // — Unlocks: every grant (levels + cosmetics) already funnels through one notifier —
  onUnlockGranted((msg) => trackEvent("unlock_earned", { unlock: msg }));

  // — Challenge completions: diff completed ids on store change —
  let prevDone = completedChallengeIds(challengeStore.getState());
  challengeStore.subscribe((state) => {
    const done = completedChallengeIds(state);
    for (const id of done) {
      if (!prevDone.has(id)) trackEvent("challenge_completed", { id });
    }
    prevDone = done;
  });

  // — Observability of the observer: expose internals as a diag probe (?diag only) —
  registerDiagProbe("analytics", getAnalyticsDebugState);
}

/** @param {any} state @returns {Set<string>} */
function completedChallengeIds(state) {
  /** @type {Set<string>} */
  const done = new Set();
  for (const list of [state?.dailyChallenges, state?.weeklyChallenges]) {
    if (!Array.isArray(list)) continue;
    // * Canonical field from challengeStore is `isComplete` (not `completed`).
    for (const c of list) if (c?.isComplete && c.id) done.add(String(c.id));
  }
  return done;
}

/** Menu-ready boot mark in ms; null before the menu is up (same read as gameplayDiagnostics). */
function readMenuReadyMs() {
  try {
    const e = performance.getEntriesByName("cr:menu-ready")[0];
    return e ? Math.round(e.startTime) : null;
  } catch {
    return null;
  }
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
