// roundValidation.test.js — server-authoritative host_round validation.
//
// Covers the pure logic extracted from party/index.ts (the Durable Object). This is the
// server's ONLY guard on the persisted scoreboard + round phase, and it only ever fires on
// malformed/adversarial payloads a human would never produce by playing — exactly the code
// you can't shake out by playtesting. No DOM / Workers runtime needed: default node env.

import { describe, expect, it } from "vitest";
import {
  isAllowedPhaseTransition,
  validateHostRound,
  MAX_SCORE_PER_SLOT,
  MIN_RUNNING_BEFORE_PODIUM_MS,
  ROUND_DURATION_MS,
} from "../../party/roundValidation.ts";

/** Build a previous (already-validated) server round. */
function mkPrev(overrides = {}) {
  return {
    phase: "lobby",
    winnerSlotIndex: null,
    startedAtMs: 0,
    countdownStartedAtMs: 0,
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    endReason: null,
    isSuddenDeath: false,
    validated: true,
    ...overrides,
  };
}

const ALL_PHASES = ["lobby", "countdown", "running", "podium"];

describe("isAllowedPhaseTransition", () => {
  it("permits every self-transition", () => {
    for (const p of ALL_PHASES) expect(isAllowedPhaseTransition(p, p)).toBe(true);
  });

  it("permits the legal forward edges", () => {
    expect(isAllowedPhaseTransition("lobby", "countdown")).toBe(true);
    expect(isAllowedPhaseTransition("countdown", "running")).toBe(true);
    expect(isAllowedPhaseTransition("countdown", "lobby")).toBe(true); // countdown cancel
    expect(isAllowedPhaseTransition("running", "podium")).toBe(true);
    expect(isAllowedPhaseTransition("podium", "lobby")).toBe(true); // rematch
  });

  it("rejects phase skips and illegal rewinds", () => {
    const illegal = [
      ["lobby", "running"],
      ["lobby", "podium"],
      ["countdown", "podium"],
      ["running", "lobby"],
      ["running", "countdown"],
      ["podium", "running"],
      ["podium", "countdown"],
    ];
    for (const [from, to] of illegal) {
      expect(isAllowedPhaseTransition(from, to)).toBe(false);
    }
  });
});

describe("validateHostRound — payload shape", () => {
  it("rejects non-object payloads", () => {
    const prev = mkPrev();
    expect(validateHostRound(prev, null, 1000)).toBeNull();
    expect(validateHostRound(prev, undefined, 1000)).toBeNull();
    expect(validateHostRound(prev, "podium", 1000)).toBeNull();
    expect(validateHostRound(prev, 42, 1000)).toBeNull();
  });

  it("rejects an unknown phase string", () => {
    expect(validateHostRound(mkPrev(), { phase: "halftime" }, 1000)).toBeNull();
    expect(validateHostRound(mkPrev(), { phase: "" }, 1000)).toBeNull();
  });

  it("rejects a legal-shaped payload on an illegal transition", () => {
    // lobby -> podium is not a permitted edge.
    expect(validateHostRound(mkPrev({ phase: "lobby" }), { phase: "podium" }, 1000)).toBeNull();
  });

  it("stamps validated:true on every accepted round", () => {
    const out = validateHostRound(mkPrev({ phase: "lobby" }), { phase: "countdown" }, 1000);
    expect(out).not.toBeNull();
    expect(out.validated).toBe(true);
  });
});

describe("validateHostRound — countdown", () => {
  it("zeroes scores, clears the winner, and takes the supplied countdown clock", () => {
    const prev = mkPrev({ phase: "lobby", winnerSlotIndex: 2, scores: { 0: 9, 1: 9, 2: 9, 3: 9 } });
    const out = validateHostRound(prev, { phase: "countdown", countdownStartedAtMs: 12345 }, 999);
    expect(out.phase).toBe("countdown");
    expect(out.scores).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
    expect(out.winnerSlotIndex).toBeNull();
    expect(out.startedAtMs).toBe(0);
    expect(out.countdownStartedAtMs).toBe(12345);
  });

  it("falls back to `now` when countdownStartedAtMs is missing or non-finite", () => {
    const prev = mkPrev({ phase: "lobby" });
    expect(validateHostRound(prev, { phase: "countdown" }, 777).countdownStartedAtMs).toBe(777);
    expect(
      validateHostRound(prev, { phase: "countdown", countdownStartedAtMs: Infinity }, 888)
        .countdownStartedAtMs,
    ).toBe(888);
  });
});

describe("validateHostRound — scores (sanitize + monotonic)", () => {
  const prevRunning = () =>
    mkPrev({ phase: "running", startedAtMs: 500, scores: { 0: 10, 1: 4, 2: 0, 3: 0 } });

  it("floors, clamps to MAX_SCORE_PER_SLOT, and drops non-finite entries", () => {
    const out = validateHostRound(
      prevRunning(),
      { phase: "running", scores: { 0: 10.9, 1: MAX_SCORE_PER_SLOT + 5000, 2: NaN, 3: -3 } },
      1000,
    );
    expect(out.scores[0]).toBe(10); // 10.9 floored
    expect(out.scores[1]).toBe(MAX_SCORE_PER_SLOT); // clamped down
    expect(out.scores[2]).toBe(0); // NaN -> keeps base (prev was 0)
    expect(out.scores[3]).toBe(0); // -3 clamped up to 0
  });

  it("never lets a score decrease below the previous authoritative value", () => {
    // Host tries to lower slot 0 from 10 -> 5; server pins it back to 10.
    const out = validateHostRound(prevRunning(), { phase: "running", scores: { 0: 5 } }, 1000);
    expect(out.scores[0]).toBe(10);
  });

  it("accepts zero on a slot the server already cleared (mid-round human seat)", () => {
    // * party #assignHumanToSlot zeros the seat score before host_round; monotonic
    // * clamp uses that prev — host echo of 0 must stick (not re-inflate NPC points).
    const prev = mkPrev({
      phase: "running",
      startedAtMs: 500,
      scores: { 0: 0, 1: 4, 2: 12, 3: 0 },
    });
    const out = validateHostRound(
      prev,
      { phase: "running", scores: { 0: 0, 1: 4, 2: 12, 3: 0 } },
      1000,
    );
    expect(out.scores[0]).toBe(0);
    expect(out.scores[2]).toBe(12);
  });

  it("accepts a legitimate increase", () => {
    const out = validateHostRound(prevRunning(), { phase: "running", scores: { 0: 25 } }, 1000);
    expect(out.scores[0]).toBe(25);
  });

  it("rejects a running payload that claims endReason:timer (timer end must go to podium)", () => {
    expect(validateHostRound(prevRunning(), { phase: "running", endReason: "timer" }, 1000)).toBeNull();
  });
});

describe("validateHostRound — podium timing guards", () => {
  const startedAtMs = 1_000_000;
  const prevRunning = (o = {}) =>
    mkPrev({ phase: "running", startedAtMs, scores: { 0: 5, 1: 3, 2: 0, 3: 0 }, ...o });

  const podium = (o = {}) => ({ phase: "podium", winnerSlotIndex: 0, endReason: "timer", ...o });

  it("accepts a well-formed podium inside the valid running window", () => {
    const out = validateHostRound(prevRunning(), podium(), startedAtMs + 10_000);
    expect(out).not.toBeNull();
    expect(out.phase).toBe("podium");
    expect(out.winnerSlotIndex).toBe(0);
  });

  it("rejects podium before the minimum running duration", () => {
    const now = startedAtMs + MIN_RUNNING_BEFORE_PODIUM_MS - 1;
    expect(validateHostRound(prevRunning(), podium(), now)).toBeNull();
  });

  it("rejects podium implausibly long after round start (non-sudden-death)", () => {
    const now = startedAtMs + ROUND_DURATION_MS + 15_001;
    expect(validateHostRound(prevRunning(), podium(), now)).toBeNull();
  });

  it("allows a late podium during sudden death (no upper time bound)", () => {
    const now = startedAtMs + ROUND_DURATION_MS + 60_000;
    const out = validateHostRound(prevRunning({ isSuddenDeath: true }), podium(), now);
    expect(out).not.toBeNull();
    expect(out.phase).toBe("podium");
  });

  it("rejects podium when the previous phase was not running", () => {
    // podium -> podium is a legal self-transition, but the podium branch requires prev=running.
    expect(validateHostRound(mkPrev({ phase: "podium", startedAtMs }), podium(), startedAtMs + 10_000)).toBeNull();
  });
});

describe("validateHostRound — server-domain round anchor (NET-CLK-2)", () => {
  it("latches runningSinceServerMs at the countdown→running commit", () => {
    const prev = mkPrev({ phase: "countdown", countdownStartedAtMs: 900 });
    const out = validateHostRound(prev, { phase: "running", startedAtMs: 5_555 }, 42_000);
    expect(out.runningSinceServerMs).toBe(42_000);
    expect(out.startedAtMs).toBe(5_555); // host stamp still committed verbatim for clients
  });

  it("carries the anchor through mid-round running→running updates", () => {
    const prev = mkPrev({ phase: "running", startedAtMs: 5_555, runningSinceServerMs: 42_000 });
    const out = validateHostRound(prev, { phase: "running", isSuddenDeath: true }, 60_000);
    expect(out.runningSinceServerMs).toBe(42_000);
  });

  it("uses the server anchor, not the skewed host startedAtMs, for podium age checks", () => {
    // Host page clock ~90s behind the Worker (laptop slept with the tab open):
    // startedAtMs reads as ancient in the server domain. The old check
    // (now - prev.startedAtMs > ROUND_DURATION_MS + 15s) rejected every timer
    // podium from this host, looping the round forever.
    const serverStart = 1_000_000;
    const prev = mkPrev({
      phase: "running",
      startedAtMs: serverStart - 90_000,
      runningSinceServerMs: serverStart,
      scores: { 0: 5, 1: 3, 2: 0, 3: 0 },
    });
    const podium = { phase: "podium", winnerSlotIndex: 0, endReason: "timer" };
    const out = validateHostRound(prev, podium, serverStart + ROUND_DURATION_MS + 1_000);
    expect(out).not.toBeNull();
    expect(out.phase).toBe("podium");
  });

  it("falls back to startedAtMs for rounds committed before the anchor existed", () => {
    const startedAtMs = 1_000_000;
    const prev = mkPrev({ phase: "running", startedAtMs, scores: { 0: 5, 1: 0, 2: 0, 3: 0 } });
    const podium = { phase: "podium", winnerSlotIndex: 0, endReason: "timer" };
    expect(validateHostRound(prev, podium, startedAtMs + 10_000)).not.toBeNull();
    expect(validateHostRound(prev, podium, startedAtMs + ROUND_DURATION_MS + 15_001)).toBeNull();
  });

  it("clears the anchor on lobby reset", () => {
    const prev = mkPrev({ phase: "podium", runningSinceServerMs: 42_000, winnerSlotIndex: 1 });
    const out = validateHostRound(prev, { phase: "lobby" }, 99_000);
    expect(out.runningSinceServerMs).toBe(0);
  });
});

describe("validateHostRound — host-hide MAX cushion (ROUND-WEDGE-1)", () => {
  // * Host tab-hide advances client startedAtMs (main.js visibility compensation) and
  // * sendHostRound. Server accumulates host-domain deltas into hostHideCompMs for the
  // * podium MAX check only. MIN stays pure wall from runningSinceServerMs.
  // * MAX reject when: now - runningAnchor - hostHideCompMs > ROUND_DURATION_MS + 15_000
  const serverStart = 1_000_000;
  const hostStart = 5_000_000;
  const scores = { 0: 5, 1: 3, 2: 0, 3: 0 };
  const podium = { phase: "podium", winnerSlotIndex: 0, endReason: "timer" };

  function runningPrev(o = {}) {
    return mkPrev({
      phase: "running",
      startedAtMs: hostStart,
      runningSinceServerMs: serverStart,
      hostHideCompMs: 0,
      scores,
      ...o,
    });
  }

  it("accumulates host-domain startedAtMs increases into hostHideCompMs on running→running", () => {
    const hideMs = 60_000;
    const out = validateHostRound(
      runningPrev(),
      { phase: "running", startedAtMs: hostStart + hideMs, scores },
      serverStart + 30_000,
    );
    expect(out).not.toBeNull();
    expect(out.runningSinceServerMs).toBe(serverStart); // wall latch frozen
    expect(out.startedAtMs).toBe(hostStart + hideMs);
    expect(out.hostHideCompMs).toBe(hideMs);
  });

  it("carries hostHideCompMs unchanged when startedAtMs does not increase", () => {
    const prev = runningPrev({ hostHideCompMs: 45_000, startedAtMs: hostStart + 45_000 });
    const out = validateHostRound(
      prev,
      { phase: "running", startedAtMs: hostStart + 45_000, isSuddenDeath: true, scores },
      serverStart + 50_000,
    );
    expect(out.hostHideCompMs).toBe(45_000);
    expect(out.runningSinceServerMs).toBe(serverStart);
  });

  it("does not rewind hostHideCompMs when host startedAtMs decreases", () => {
    const prev = runningPrev({ hostHideCompMs: 30_000, startedAtMs: hostStart + 30_000 });
    const out = validateHostRound(
      prev,
      { phase: "running", startedAtMs: hostStart + 10_000, scores },
      serverStart + 40_000,
    );
    expect(out.hostHideCompMs).toBe(30_000);
    expect(out.startedAtMs).toBe(hostStart + 10_000); // host stamp still committed
  });

  it("accepts timer podium after host-hide once hostHideCompMs covers the wall overage", () => {
    // Wall age = ROUND + 15s + 1 without pause term → MAX reject.
    // With hostHideCompMs = 60s, effective age drops under the gate → accept.
    const hideMs = 60_000;
    const now = serverStart + ROUND_DURATION_MS + 15_000 + 1;
    const without = runningPrev({ hostHideCompMs: 0 });
    expect(validateHostRound(without, podium, now)).toBeNull();

    const withHide = runningPrev({
      hostHideCompMs: hideMs,
      startedAtMs: hostStart + hideMs,
    });
    const out = validateHostRound(withHide, podium, now);
    expect(out).not.toBeNull();
    expect(out.phase).toBe("podium");
  });

  it("still rejects MAX when hide accounting is insufficient", () => {
    // Wall overage 20s past ROUND+15s; only 5s hide accounted → still over the gate.
    const now = serverStart + ROUND_DURATION_MS + 15_000 + 20_000;
    const prev = runningPrev({ hostHideCompMs: 5_000 });
    expect(validateHostRound(prev, podium, now)).toBeNull();
  });

  it("does not shorten MIN via hostHideCompMs (hide must not allow early podium)", () => {
    // Wall age still under MIN; large hostHideCompMs must not help MIN (no pause term).
    const now = serverStart + MIN_RUNNING_BEFORE_PODIUM_MS - 1;
    const prev = runningPrev({ hostHideCompMs: 120_000 });
    expect(validateHostRound(prev, podium, now)).toBeNull();
  });

  it("long early hide still leaves lastStanding blocked by wall MIN", () => {
    const hideMs = 60_000;
    // Host advanced startedAtMs; server accumulated pause; wall age still 1s.
    const mid = validateHostRound(
      runningPrev(),
      { phase: "running", startedAtMs: hostStart + hideMs, scores },
      serverStart + 1_000,
    );
    expect(mid.hostHideCompMs).toBe(hideMs);
    expect(mid.runningSinceServerMs).toBe(serverStart);
    const lastStanding = {
      phase: "podium",
      winnerSlotIndex: 0,
      endReason: "lastStanding",
      scores,
    };
    expect(validateHostRound(mid, lastStanding, serverStart + 1_000)).toBeNull();
    // After real wall MIN, lastStanding is allowed even with large hostHideCompMs.
    const afterMin = validateHostRound(
      mid,
      lastStanding,
      serverStart + MIN_RUNNING_BEFORE_PODIUM_MS,
    );
    expect(afterMin).not.toBeNull();
    expect(afterMin.phase).toBe("podium");
  });

  it("clears hostHideCompMs on countdown and lobby (same lifecycle as running anchor)", () => {
    // running→lobby is illegal; podium→lobby then lobby→countdown→running
    const onPodium = mkPrev({
      phase: "podium",
      winnerSlotIndex: 0,
      runningSinceServerMs: serverStart,
      hostHideCompMs: 99_000,
    });
    const lobby = validateHostRound(onPodium, { phase: "lobby" }, serverStart + 1);
    expect(lobby.hostHideCompMs).toBe(0);
    expect(lobby.runningSinceServerMs).toBe(0);

    const countdown = validateHostRound(lobby, { phase: "countdown" }, serverStart + 2);
    expect(countdown.hostHideCompMs).toBe(0);

    const running = validateHostRound(
      countdown,
      { phase: "running", startedAtMs: hostStart },
      serverStart + 3,
    );
    expect(running.hostHideCompMs).toBe(0);
    expect(running.runningSinceServerMs).toBe(serverStart + 3);
  });

  it("stacks successive host-hide deltas", () => {
    const first = validateHostRound(
      runningPrev(),
      { phase: "running", startedAtMs: hostStart + 20_000, scores },
      serverStart + 10_000,
    );
    expect(first.hostHideCompMs).toBe(20_000);
    const second = validateHostRound(
      first,
      { phase: "running", startedAtMs: hostStart + 20_000 + 40_000, scores },
      serverStart + 50_000,
    );
    expect(second.hostHideCompMs).toBe(60_000);
    expect(second.runningSinceServerMs).toBe(serverStart);
  });
});

describe("validateHostRound — winner verification", () => {
  const startedAtMs = 1_000_000;
  const now = startedAtMs + 10_000;
  const prevRunning = (scores) => mkPrev({ phase: "running", startedAtMs, scores });

  it("rejects a claimed winner that does not hold the max score (timer end)", () => {
    // slot 1 has 3, slot 0 has 5 -> claiming 1 is illegal on a timer finish.
    const prev = prevRunning({ 0: 5, 1: 3, 2: 0, 3: 0 });
    const out = validateHostRound(prev, { phase: "podium", winnerSlotIndex: 1, endReason: "timer" }, now);
    expect(out).toBeNull();
  });

  it("accepts the true max-score winner", () => {
    const prev = prevRunning({ 0: 5, 1: 3, 2: 0, 3: 0 });
    const out = validateHostRound(prev, { phase: "podium", winnerSlotIndex: 0, endReason: "timer" }, now);
    expect(out.winnerSlotIndex).toBe(0);
  });

  it("rejects an out-of-range or non-integer winner slot", () => {
    const prev = prevRunning({ 0: 5, 1: 3, 2: 0, 3: 0 });
    for (const bad of [-1, 4, 7, 1.5]) {
      expect(
        validateHostRound(prev, { phase: "podium", winnerSlotIndex: bad, endReason: "timer" }, now),
      ).toBeNull();
    }
  });

  it("records a true 0-0 draw", () => {
    const prev = prevRunning({ 0: 0, 1: 0, 2: 0, 3: 0 });
    const out = validateHostRound(prev, { phase: "podium", winnerSlotIndex: "draw", endReason: "timer" }, now);
    expect(out.winnerSlotIndex).toBe("draw");
  });

  it("rejects a 'draw' claim when a slot actually has points", () => {
    const prev = prevRunning({ 0: 5, 1: 0, 2: 0, 3: 0 });
    const out = validateHostRound(prev, { phase: "podium", winnerSlotIndex: "draw", endReason: "timer" }, now);
    expect(out).toBeNull();
  });

  // * Documented trust boundary: on a lastStanding finish the server does NOT require the
  // * claimed winner to hold the max score — the last cart standing wins even if it scored
  // * fewer points. A compromised host can therefore crown any slot in a lastStanding round.
  // * This is intentional for a casual party game; pinning it here so the decision is explicit.
  it("trusts the host's winner pick on a lastStanding finish (non-max slot allowed)", () => {
    const prev = prevRunning({ 0: 5, 1: 3, 2: 0, 3: 0 });
    const out = validateHostRound(
      prev,
      { phase: "podium", winnerSlotIndex: 2, endReason: "lastStanding" },
      now,
    );
    expect(out).not.toBeNull();
    expect(out.winnerSlotIndex).toBe(2); // slot 2 scored 0 yet is accepted
    expect(out.endReason).toBe("lastStanding");
  });
});

describe("validateHostRound — lobby reset (rematch)", () => {
  it("clears scores, winner, and clocks when returning to lobby", () => {
    const prev = mkPrev({
      phase: "podium",
      winnerSlotIndex: 1,
      startedAtMs: 1_000_000,
      countdownStartedAtMs: 999_000,
      scores: { 0: 5, 1: 9, 2: 1, 3: 0 },
      endReason: "timer",
    });
    const out = validateHostRound(prev, { phase: "lobby" }, 2_000_000);
    expect(out.phase).toBe("lobby");
    expect(out.scores).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
    expect(out.winnerSlotIndex).toBeNull();
    expect(out.startedAtMs).toBe(0);
    expect(out.countdownStartedAtMs).toBe(0);
    expect(out.endReason).toBeNull();
  });
});
