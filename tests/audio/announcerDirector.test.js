// announcerDirector.test.js — PA-QUIET-1 same-fall flavor skip.
// The director is a module singleton subscribed to gameStore; reset the registry
// per test so fall-burst / first-spill / refund maps start clean.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** @type {typeof import("../../src/announcer/announcerDirector.js")} */
let director;
/** @type {typeof import("../../src/stores/gameStore.js").gameStore} */
let gameStore;
/** @type {typeof import("../../src/stores/gameStore.js").RoundPhase} */
let RoundPhase;
/** @type {import("vitest").Mock} */
let announce;

function announcedIds() {
  return announce.mock.calls.map((call) => call[0]);
}

/**
 * @param {Partial<import("../../src/announcer/announcerDirector.js").AnnouncerDirectorFall>} fall
 */
function fall(partial) {
  director.announcerDirectorOnFall({
    victimSlotIndex: 1,
    attackerSlotIndex: 0,
    comboTier: 0,
    ...partial,
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });

  announce = vi.fn(() => ({ type: "played" }));
  ({ gameStore, RoundPhase } = await import("../../src/stores/gameStore.js"));
  director = await import("../../src/announcer/announcerDirector.js");

  gameStore.setState({ roundPhase: RoundPhase.LOBBY });
  director.initAnnouncerDirector({
    announce,
    getNetSlots: () => [{ name: "P1" }, { name: "P2" }, { name: "P3" }, { name: "P4" }],
    getLocalSlotIndex: () => 0,
    getRemainingRoundMs: () => 120000,
  });
  gameStore.setState({ roundPhase: RoundPhase.RUNNING });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("same-fall flavor skip", () => {
  it("skips critical_ko on the first attributed KO — first_spill owns the line", () => {
    fall({ wasCritical: true });
    expect(announcedIds()).toEqual(["first_spill"]);
  });

  it("fires critical_ko on an isolated later crit with no combo, refund, or pileup", () => {
    fall({ wasCritical: false });
    expect(announcedIds()).toEqual(["first_spill"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 2, wasCritical: true });
    expect(announcedIds()).toEqual(["critical_ko"]);
  });

  it("fires leader_down on an isolated later leader KO", () => {
    fall({ wasCritical: false });
    expect(announcedIds()).toEqual(["first_spill"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 2, victimWasLeader: true });
    expect(announcedIds()).toEqual(["leader_down"]);
  });

  it("skips critical_ko on a pileup fall — double_spill owns the line", () => {
    fall({ wasCritical: false });
    expect(announcedIds()).toEqual(["first_spill"]);

    announce.mockClear();
    vi.advanceTimersByTime(200);
    fall({ victimSlotIndex: 2, wasCritical: true });
    expect(announcedIds()).toEqual(["double_spill"]);
  });
});

describe("combo tier-up last-announced (PA-COMBO-1)", () => {
  it("skips combo on the first-spill KO — first_spill owns the line", () => {
    fall({ comboTier: 1 });
    expect(announcedIds()).toEqual(["first_spill"]);
  });

  it("does not re-announce rampage after a played tier-1 line", () => {
    fall({ comboTier: 0 });
    expect(announcedIds()).toEqual(["first_spill"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 2, comboTier: 1 });
    expect(announcedIds()).toEqual(["rampage"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 3, comboTier: 1 });
    expect(announcedIds()).toEqual([]);
  });

  it("retries savage when the first tier-2 announce was discarded", () => {
    fall({ comboTier: 0 });
    announce.mockClear();
    vi.advanceTimersByTime(1500);

    announce.mockImplementationOnce(() => ({ type: "discarded" }));
    fall({ victimSlotIndex: 2, comboTier: 2 });
    expect(announcedIds()).toEqual(["savage"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 3, comboTier: 2 });
    expect(announcedIds()).toEqual(["savage"]);
  });

  it("does not retry savage after a queued tier-2 line", () => {
    fall({ comboTier: 0 });
    announce.mockClear();
    vi.advanceTimersByTime(1500);

    announce.mockImplementationOnce(() => ({ type: "queued" }));
    fall({ victimSlotIndex: 2, comboTier: 2 });
    expect(announcedIds()).toEqual(["savage"]);

    announce.mockClear();
    vi.advanceTimersByTime(1500);
    fall({ victimSlotIndex: 3, comboTier: 2 });
    expect(announcedIds()).toEqual([]);
  });
});
