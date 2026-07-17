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
 *
 * Nothing here is per-frame; store subscriptions fire only on transitions. When analytics
 * are opted out, initAnalytics() declines and every subscription callback exits on the
 * trackEvent() null check.
 *
 * If ?diag is active, an `analytics` probe exposes the queue/sink internals through
 * __ccDiag.snapshot("analytics") — the observability systems observe each other.
 */

import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { onUnlockGranted } from "../stores/unlockStore.js";
import { challengeStore } from "../stores/challengeStore.js";
import { snapshotMatchStats } from "../scoring/matchStats.js";
import { settingsStore } from "../stores/settingsStore.js";
import { registerDiagProbe } from "../utils/diagnostics.js";
import { initAnalytics, trackEvent, getAnalyticsDebugState } from "./analytics.js";

/**
 * @typedef {object} GameplayAnalyticsDeps
 * @property {() => string} [getMode]           detectGameMode() ("solo"|"quickplay"|…).
 * @property {() => string | null} [getLevelId] Current arena id.
 * @property {() => number} [getLocalSlot]      Local player's slot index (-1 if unseated).
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
      trackEvent("session_end", {
        durationMs: Math.round(performance.now()),
        matches: matchesThisSession,
      });
    },
  });
  if (!enabled) return;

  trackEvent("session_start", {
    mode: mode(),
    tier: safeCall(() => settingsStore.getState().qualityTier) ?? null,
    dpr: typeof window !== "undefined" ? Math.round((window.devicePixelRatio ?? 1) * 100) / 100 : null,
    touch: typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) > 0 : null,
    menuReadyMs: readMenuReadyMs(),
  });

  // — Match lifecycle (gameStore): running = match_started, running→podium = match_ended —
  let prevPhase = gameStore.getState().roundPhase;
  gameStore.subscribe((state) => {
    const phase = state.roundPhase;
    if (phase === prevPhase) {
      if (state.isSuddenDeath) sawSuddenDeath = true;
      return;
    }
    const from = prevPhase;
    prevPhase = phase;

    if (phase === RoundPhase.RUNNING) {
      matchStartedPerfMs = performance.now();
      sawSuddenDeath = false;
      trackEvent("match_started", { arena: arena(), mode: mode() });
    } else if (phase === RoundPhase.PODIUM && from === RoundPhase.RUNNING) {
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
        trackEvent("match_ended", {
          arena: arena(),
          mode: mode(),
          durationMs: matchStartedPerfMs > 0 ? Math.round(performance.now() - matchStartedPerfMs) : null,
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
    for (const c of list) if (c?.completed && c.id) done.add(String(c.id));
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
