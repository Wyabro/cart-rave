// Pure, runtime-free host_round validation extracted from the Durable Object
// (party/index.ts) so the security-critical phase machine + score/winner rules are
// unit-testable without spinning up a Workers/PartyServer runtime. index.ts delegates
// to `validateHostRound`; the logic here is byte-identical to the former private methods.
//
// Design note: these functions are the server's *only* guard on the persisted scoreboard
// and round phase. The live WebRTC simulation plane is separately host-authoritative and
// is NOT validated here.

export type RoundPhase = "lobby" | "countdown" | "running" | "podium";

export type RoundState = {
  phase: RoundPhase;
  winnerSlotIndex: number | "draw" | null;
  startedAtMs: number;
  countdownStartedAtMs: number;
  scores: Record<number, number>;
  endReason?: "timer" | "lastStanding" | null;
  isSuddenDeath?: boolean;
  /**
   * Worker-clock moment the server committed the running transition (NET-CLK-2).
   * `startedAtMs` is a HOST-local stamp (timeOrigin + performance.now()) and must
   * never be compared against server `now` — the delta bakes in the host's
   * wall-clock error plus any system-sleep pause. Optional so rounds validated
   * before this field existed still pass (falls back to startedAtMs).
   */
  runningSinceServerMs?: number;
  /**
   * ROUND-WEDGE-1 / host-hide: sum of host-domain `startedAtMs` increases committed
   * on running→running (main.js visibility compensation). Used **only** by the
   * podium MAX age check so wall time spent with the host tab hidden does not
   * permanently reject a legitimate timer podium. MIN still uses the wall latch
   * alone (`runningSinceServerMs`). Never compared to Worker `now` as an absolute
   * host stamp — only successive host-domain deltas are accumulated (NET-CLK-2).
   * Reset on countdown entry, lobby, and countdown→running.
   */
  hostHideCompMs?: number;
  /** Server stamped on every broadcast round payload clients may trust for stats. */
  validated: true;
};

import { ROUND_DURATION_MS } from '../shared/roundConstants.js';

// * Re-exported so existing consumers (index.ts, tests) keep one import site.
export { ROUND_DURATION_MS };
export const MIN_RUNNING_BEFORE_PODIUM_MS = 3_000;
export const MAX_SCORE_PER_SLOT = 500;

/**
 * Whitelist of legal round-phase edges. Any transition not listed (e.g. lobby→podium,
 * running→countdown) is rejected so a malformed or malicious host cannot skip phases.
 */
export function isAllowedPhaseTransition(from: RoundPhase, to: RoundPhase): boolean {
  if (from === to) return true;
  if (from === "lobby" && to === "countdown") return true;
  if (from === "countdown" && (to === "running" || to === "lobby")) return true;
  if (from === "running" && to === "podium") return true;
  if (from === "podium" && to === "lobby") return true;
  return false;
}

/**
 * Coerce an untrusted scores object into 4 finite, floored, clamped slot scores.
 * Non-numeric / non-finite entries keep the base value.
 */
function sanitizeScores(
  raw: unknown,
  base: Record<number, number>,
): Record<number, number> {
  const scores: Record<number, number> = { ...base };
  if (!raw || typeof raw !== "object") return scores;
  for (let i = 0; i < 4; i += 1) {
    const src = (raw as Record<string, unknown>)[i] ?? (raw as Record<string, unknown>)[String(i)];
    const n = typeof src === "number" ? src : Number(src);
    if (!Number.isFinite(n)) continue;
    scores[i] = Math.max(0, Math.min(MAX_SCORE_PER_SLOT, Math.floor(n)));
  }
  return scores;
}

/**
 * Max score across the four slots. Validation only — host owns tiebreakers
 * (client pickTimerWinner / lastScoringHitAt). Do not use this to pick a winner.
 */
function computeMaxScore(scores: Record<number, number>): number {
  let max = 0;
  for (let i = 0; i < 4; i += 1) {
    max = Math.max(max, scores[i] ?? 0);
  }
  return max;
}

/**
 * Validates a host_round payload against the previous authoritative round.
 * @param prev The server's current (already-validated) round state.
 * @param incoming Untrusted host_round payload.
 * @param now Server clock (ms) used for podium timing guards.
 * @returns A sanitized server round to commit, or null to reject the payload.
 */
export function validateHostRound(
  prev: RoundState,
  incoming: unknown,
  now: number,
): RoundState | null {
  if (!incoming || typeof incoming !== "object") return null;
  const phase = (incoming as { phase?: unknown }).phase;
  if (phase !== "lobby" && phase !== "countdown" && phase !== "running" && phase !== "podium") {
    return null;
  }
  const nextPhase = phase as RoundPhase;

  if (!isAllowedPhaseTransition(prev.phase, nextPhase)) {
    return null;
  }

  const startedAtMsRaw = (incoming as { startedAtMs?: unknown }).startedAtMs;
  const countdownStartedAtMsRaw = (incoming as { countdownStartedAtMs?: unknown }).countdownStartedAtMs;
  const winnerRaw = (incoming as { winnerSlotIndex?: unknown }).winnerSlotIndex;
  const endReasonRaw = (incoming as { endReason?: unknown }).endReason;

  let startedAtMs = prev.startedAtMs;
  let countdownStartedAtMs = prev.countdownStartedAtMs;
  let scores = { ...prev.scores };
  let winnerSlotIndex: number | "draw" | null = prev.winnerSlotIndex;
  let endReason: "timer" | "lastStanding" | null = prev.endReason ?? null;
  let runningSinceServerMs = prev.runningSinceServerMs ?? 0;
  let hostHideCompMs = prev.hostHideCompMs ?? 0;

  if (nextPhase === "countdown") {
    countdownStartedAtMs =
      typeof countdownStartedAtMsRaw === "number" && Number.isFinite(countdownStartedAtMsRaw)
        ? countdownStartedAtMsRaw
        : now;
    startedAtMs = 0;
    runningSinceServerMs = 0;
    hostHideCompMs = 0;
    winnerSlotIndex = null;
    scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    endReason = null;
  }

  if (nextPhase === "running") {
    if (prev.phase !== "countdown" && prev.phase !== "running") return null;
    startedAtMs =
      typeof startedAtMsRaw === "number" && Number.isFinite(startedAtMsRaw) && startedAtMsRaw > 0
        ? startedAtMsRaw
        : (prev.phase === "running" && prev.startedAtMs > 0 ? prev.startedAtMs : now);
    // * Latch the server-clock round anchor on the countdown→running commit; carry it
    // * through mid-round running→running updates (Sudden Death flag flips, score syncs).
    // * Host-hide (ROUND-WEDGE-1): when the host advances startedAtMs (visibility
    // * compensation), accumulate the host-domain delta into hostHideCompMs for MAX only.
    // * Do not touch runningSinceServerMs — MIN stays pure wall time since running commit.
    if (prev.phase !== "running") {
      runningSinceServerMs = now;
      hostHideCompMs = 0;
    } else {
      runningSinceServerMs = prev.runningSinceServerMs || now;
      const prevStart = prev.startedAtMs;
      if (prevStart > 0 && startedAtMs > prevStart) {
        const hideDelta = startedAtMs - prevStart;
        if (Number.isFinite(hideDelta) && hideDelta > 0) {
          hostHideCompMs = (prev.hostHideCompMs ?? 0) + hideDelta;
        } else {
          hostHideCompMs = prev.hostHideCompMs ?? 0;
        }
      } else {
        hostHideCompMs = prev.hostHideCompMs ?? 0;
      }
    }
    winnerSlotIndex = null;
    if (prev.phase !== "running") {
      scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      endReason = null;
    } else if (endReasonRaw === "lastStanding") {
      endReason = "lastStanding";
    } else if (endReasonRaw === null || endReasonRaw === undefined) {
      endReason = null;
    } else if (endReasonRaw === "timer") {
      return null;
    }
  }

  if (nextPhase === "running" || nextPhase === "podium") {
    scores = sanitizeScores((incoming as { scores?: unknown }).scores, scores);
    for (let i = 0; i < 4; i += 1) {
      const prevScore = prev.scores[i] ?? 0;
      if ((scores[i] ?? 0) < prevScore) scores[i] = prevScore;
    }
  }

  if (nextPhase === "podium") {
    if (prev.phase !== "running") return null;
    // * Age checks must stay in the SERVER clock domain (NET-CLK-2): comparing
    // * Worker `now` against the host-local startedAtMs meant a host whose page
    // * clock ran >15s behind (wrong system clock, or a laptop sleep while the tab
    // * was open — performance.now() freezes during sleep) had EVERY timer podium
    // * rejected, and the client's rejection rollback → endRound retry looped
    // * forever. startedAtMs fallback covers rounds validated before the anchor
    // * field existed.
    // *
    // * ROUND-WEDGE-1 MAX (non-SD only), reads prev.* only.
    // * Clock domains: `now` and `runningAnchor` are SERVER domain (Worker-stamped
    // * runningSinceServerMs / startedAtMs); `hostHideCompMs` is a host-domain DELTA
    // * (accumulated startedAtMs increases, ROUND-CLOCKDOMAIN-1) — a duration, so
    // * subtracting it from a server-domain wall age is domain-safe.
    // *   reject when now - runningAnchor - hostHideCompMs > ROUND_DURATION_MS + 15_000
    // * MIN (no hide term):
    // *   reject when now - runningAnchor < MIN_RUNNING_BEFORE_PODIUM_MS
    const runningAnchor = prev.runningSinceServerMs || prev.startedAtMs;
    const hostHide = prev.hostHideCompMs ?? 0;
    if (!prev.startedAtMs || !runningAnchor || now - runningAnchor < MIN_RUNNING_BEFORE_PODIUM_MS) return null;
    if (!prev.isSuddenDeath && now - runningAnchor - hostHide > ROUND_DURATION_MS + 15_000) return null;

    const lastStanding =
      endReasonRaw === "lastStanding"
      || (typeof endReasonRaw === "string" && endReasonRaw.trim() === "lastStanding");
    if (lastStanding) {
      endReason = "lastStanding";
    } else if (endReasonRaw === "timer" || endReasonRaw === null || endReasonRaw === undefined) {
      endReason = endReasonRaw === "timer" ? "timer" : null;
    } else {
      return null;
    }

    const maxScore = computeMaxScore(scores);
    // * Draw: all scores zero (or host+server agree there is no scorer).
    // * Previously `winnerRaw === "draw"` was unconditionally rejected when
    // * endReason was lastStanding — and even valid 0-0 timer draws cleared
    // * endReason. That produced host-local podium + client softlock.
    // * Host may pick any max-score slot on ties; server only checks max, not slot index.
    if (winnerRaw === "draw" || maxScore === 0) {
      if (maxScore !== 0) {
        // * Host claimed draw but at least one slot has points — reject.
        return null;
      }
      // * lastStanding with zero scores: the host-authoritative winner slot is preserved
      // * (e.g. sole survivor in a pure-SD eliminator where nobody scored beforehand).
      // * Timer/null rounds with zero scores remain a draw — no scorer, no winner.
      if (lastStanding) {
        const w = typeof winnerRaw === "number" ? winnerRaw : Number(winnerRaw);
        if (Number.isInteger(w) && w >= 0 && w <= 3) {
          winnerSlotIndex = w;
        } else {
          // * Host did not name a slot (sent "draw" or null) — allow draw for this
          // * unusual case rather than blocking the round from ending.
          winnerSlotIndex = "draw";
        }
      } else {
        winnerSlotIndex = "draw";
      }
      if (endReason !== "timer" && endReason !== "lastStanding") {
        endReason = null;
      }
    } else {
      const w = typeof winnerRaw === "number" ? winnerRaw : Number(winnerRaw);
      if (!Number.isInteger(w) || w < 0 || w > 3) return null;
      if (!lastStanding && (scores[w] ?? 0) < maxScore) {
        return null;
      }
      winnerSlotIndex = w;
      if (!lastStanding && endReason !== "timer") {
        endReason = "timer";
      }
    }
  }

  if (nextPhase === "lobby") {
    startedAtMs = 0;
    countdownStartedAtMs = 0;
    runningSinceServerMs = 0;
    hostHideCompMs = 0;
    winnerSlotIndex = null;
    scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    endReason = null;
  }

  const isSuddenDeath =
    typeof (incoming as { isSuddenDeath?: unknown }).isSuddenDeath === "boolean"
      ? (incoming as { isSuddenDeath?: boolean }).isSuddenDeath
      : prev.isSuddenDeath ?? false;

  return {
    phase: nextPhase,
    winnerSlotIndex,
    startedAtMs,
    countdownStartedAtMs,
    runningSinceServerMs,
    hostHideCompMs,
    scores,
    endReason,
    isSuddenDeath,
    validated: true,
  };
}
