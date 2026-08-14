// readiness.test.js — COUNTDOWN-ABORT-1 seat-readiness policy (pure; no Workers runtime).
import { describe, expect, it } from "vitest";
import { COUNTDOWN_ABORT_GRACE_MS, isContinuousModeRoom, seatReadyState } from "../../shared/readiness.js";

describe("isContinuousModeRoom", () => {
  it("treats quickplay as continuous (no manual ready-up)", () => {
    expect(isContinuousModeRoom("quickplay")).toBe(true);
  });
  it("treats quickplay__* harness rooms as continuous (isolated DO)", () => {
    expect(isContinuousModeRoom("quickplay__seat-arm-abc")).toBe(true);
  });
  it("treats private/friends rooms as ready-up modes", () => {
    expect(isContinuousModeRoom("A1B2C3")).toBe(false);
    expect(isContinuousModeRoom("")).toBe(false);
    expect(isContinuousModeRoom(undefined)).toBe(false);
  });
});

describe("seatReadyState", () => {
  it("continuous mode: a seated human is ready by definition (the core fix)", () => {
    // A frozen/reconnecting quickplay peer that never sent `ready` must still seat ready,
    // so the server never aborts the armed countdown on its roster blip.
    expect(seatReadyState({ continuousMode: true, connId: "peer1", readyConnIds: new Set() })).toBe(true);
    expect(seatReadyState({ continuousMode: true, connId: null, readyConnIds: null })).toBe(true);
  });

  it("ready-up mode: seats UNREADY for a first-time join (existing gate preserved)", () => {
    expect(seatReadyState({ continuousMode: false, connId: "new", readyConnIds: new Set() })).toBe(false);
  });

  it("ready-up mode (B): restores readiness for a connId that was ready before a reseat blip", () => {
    const readyConnIds = new Set(["peer1"]);
    expect(seatReadyState({ continuousMode: false, connId: "peer1", readyConnIds })).toBe(true);
    expect(seatReadyState({ continuousMode: false, connId: "peer2", readyConnIds })).toBe(false);
  });

  it("ready-up mode: null/missing connId or set is unready, never throws", () => {
    expect(seatReadyState({ continuousMode: false, connId: null, readyConnIds: new Set(["x"]) })).toBe(false);
    expect(seatReadyState({ continuousMode: false, connId: "x", readyConnIds: null })).toBe(false);
  });
});

describe("COUNTDOWN_ABORT_GRACE_MS", () => {
  it("is a sane positive grace window", () => {
    expect(COUNTDOWN_ABORT_GRACE_MS).toBeGreaterThan(0);
    expect(COUNTDOWN_ABORT_GRACE_MS).toBeLessThanOrEqual(3000);
  });
});
