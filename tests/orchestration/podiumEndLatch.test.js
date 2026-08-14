// podiumEndLatch.test.js — ROUND-WEDGE-1 Phase B pure client breaker.
// Pins: send-side attempt count only; reject schedules retryAtMs then hard-stops;
// frame-storm cannot burn attempt 2 without waiting out the time gate.

import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_END_SENDS,
  PODIUM_END_RETRY_MS,
  clearPodiumEndLatch,
  shouldAllowPodiumEnd,
  notePodiumEndSend,
  onPodiumEndRejected,
  consumeHardStopDiag,
  getPodiumEndLatchState,
  __resetPodiumEndLatchForTest,
} from "../../src/utils/podiumEndLatch.js";

const MATCH = 1_000_000;

beforeEach(() => {
  __resetPodiumEndLatchForTest();
});

describe("podiumEndLatch — constants", () => {
  it("ships MAX_END_SENDS = 2 and ~150 ms retry (hide-race budget)", () => {
    expect(MAX_END_SENDS).toBe(2);
    expect(PODIUM_END_RETRY_MS).toBe(150);
  });
});

describe("podiumEndLatch — send-side count only", () => {
  it("increments sends only on notePodiumEndSend, never on reject", () => {
    expect(shouldAllowPodiumEnd(MATCH, 0)).toBe(true);
    notePodiumEndSend(MATCH);
    expect(getPodiumEndLatchState()?.sends).toBe(1);

    const r = onPodiumEndRejected(MATCH, 10_000);
    expect(r.action).toBe("retry-scheduled");
    expect(getPodiumEndLatchState()?.sends).toBe(1); // reject must not +1
  });

  it("allows first end with empty latch", () => {
    expect(shouldAllowPodiumEnd(MATCH, 0)).toBe(true);
  });
});

describe("podiumEndLatch — time-gated retry (not attempt-only)", () => {
  it("blocks every frame after reject until retryAtMs, then allows exactly one more send", () => {
    const t0 = 50_000;
    notePodiumEndSend(MATCH); // attempt 1
    const { action, retryAtMs } = onPodiumEndRejected(MATCH, t0);
    expect(action).toBe("retry-scheduled");
    expect(retryAtMs).toBe(t0 + PODIUM_END_RETRY_MS);

    // * Without a time gate, attempts remaining would re-open the ~frame storm here.
    expect(shouldAllowPodiumEnd(MATCH, t0)).toBe(false);
    expect(shouldAllowPodiumEnd(MATCH, t0 + PODIUM_END_RETRY_MS - 1)).toBe(false);
    expect(shouldAllowPodiumEnd(MATCH, t0 + PODIUM_END_RETRY_MS)).toBe(true);

    notePodiumEndSend(MATCH); // attempt 2
    expect(getPodiumEndLatchState()?.sends).toBe(2);
    // * Budget exhausted — no third send even before second reject.
    expect(shouldAllowPodiumEnd(MATCH, t0 + PODIUM_END_RETRY_MS + 1000)).toBe(false);
  });

  it("hard-stops on reject after MAX_END_SENDS and never re-allows that startedAtMs", () => {
    notePodiumEndSend(MATCH);
    onPodiumEndRejected(MATCH, 1000);
    notePodiumEndSend(MATCH);
    const r = onPodiumEndRejected(MATCH, 1000 + PODIUM_END_RETRY_MS + 1);
    expect(r.action).toBe("hard-stop");
    expect(r.sends).toBe(2);
    expect(shouldAllowPodiumEnd(MATCH, 1e12)).toBe(false);
    expect(shouldAllowPodiumEnd(MATCH, 1e12)).toBe(false);
  });

  it("consumeHardStopDiag fires once after hard-stop", () => {
    notePodiumEndSend(MATCH);
    notePodiumEndSend(MATCH);
    onPodiumEndRejected(MATCH, 0);
    expect(consumeHardStopDiag(MATCH)).toBe(true);
    expect(consumeHardStopDiag(MATCH)).toBe(false);
    expect(consumeHardStopDiag(MATCH + 1)).toBe(false);
  });
});

describe("podiumEndLatch — clear / new match", () => {
  it("clearPodiumEndLatch re-allows ends", () => {
    notePodiumEndSend(MATCH);
    notePodiumEndSend(MATCH);
    onPodiumEndRejected(MATCH, 0);
    expect(shouldAllowPodiumEnd(MATCH, 1e9)).toBe(false);
    clearPodiumEndLatch();
    expect(shouldAllowPodiumEnd(MATCH, 1e9)).toBe(true);
  });

  it("a different startedAtMs is not blocked by a latched match", () => {
    notePodiumEndSend(MATCH);
    notePodiumEndSend(MATCH);
    onPodiumEndRejected(MATCH, 0);
    expect(shouldAllowPodiumEnd(MATCH + 99, 0)).toBe(true);
    notePodiumEndSend(MATCH + 99);
    expect(getPodiumEndLatchState()?.startedAtMs).toBe(MATCH + 99);
    expect(getPodiumEndLatchState()?.sends).toBe(1);
  });
});
