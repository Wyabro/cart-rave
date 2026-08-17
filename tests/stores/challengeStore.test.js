// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../src/utils/storage.js";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function loadChallengeStore(payload) {
  if (payload) localStorage.setItem(STORAGE_KEYS.challenges, JSON.stringify(payload));
  return import("../../src/stores/challengeStore.js");
}

describe("challengeStore active capacity and migration", () => {
  it("starts with four daily and two weekly entries", async () => {
    const { challengeStore, CHALLENGE_ACTIVE_COUNTS } = await loadChallengeStore();
    const state = challengeStore.getState();
    expect(state.dailyChallenges).toHaveLength(CHALLENGE_ACTIVE_COUNTS.daily);
    expect(state.weeklyChallenges).toHaveLength(CHALLENGE_ACTIVE_COUNTS.weekly);
    expect(new Set(state.dailyChallenges.map((c) => c.id)).size).toBe(4);
    expect(new Set(state.weeklyChallenges.map((c) => c.id)).size).toBe(2);
  });

  it("migrates a saved two-plus-one state without losing valid progress", async () => {
    const before = Date.now() - 1000;
    const { challengeStore } = await loadChallengeStore({
      dailyChallenges: [
        { id: "spill_15", progress: 7, isComplete: false },
        { id: "spill_15", progress: 99, isComplete: true },
      ],
      weeklyChallenges: [{ id: "ko_npc_20", progress: 4, isComplete: false }],
      lastDailyReset: before,
      lastWeeklyReset: before,
    });
    const state = challengeStore.getState();
    expect(state.dailyChallenges).toHaveLength(4);
    expect(state.weeklyChallenges).toHaveLength(2);
    expect(state.dailyChallenges.find((c) => c.id === "spill_15")).toEqual({
      id: "spill_15", progress: 7, isComplete: false,
    });
    expect(new Set(state.dailyChallenges.map((c) => c.id)).size).toBe(4);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.challenges)).dailyChallenges).toHaveLength(4);
  });

  it("drops wrong-cadence and invalid entries, clamps progress, and derives completion", async () => {
    const { challengeStore } = await loadChallengeStore({
      dailyChallenges: [
        { id: "spill_50", progress: 10, isComplete: false },
        { id: "ko_void_3", progress: 99, isComplete: false },
        { id: "last_standing_2", progress: "bad", isComplete: true },
        { id: "round_win_1", progress: "bad", isComplete: true },
      ],
      weeklyChallenges: [{ id: "combo_t3_10", progress: 99, isComplete: false }],
      lastDailyReset: Date.now() + 100000,
      lastWeeklyReset: "bad",
    });
    const state = challengeStore.getState();
    expect(state.dailyChallenges.some((c) => c.id === "spill_50")).toBe(false);
    expect(state.dailyChallenges.find((c) => c.id === "ko_void_3")).toEqual({
      id: "ko_void_3", progress: 3, isComplete: true,
    });
    expect(state.dailyChallenges.some((c) => c.id === "last_standing_2")).toBe(false);
    expect(state.dailyChallenges.find((c) => c.id === "round_win_1")).toEqual({
      id: "round_win_1", progress: 0, isComplete: false,
    });
    expect(state.weeklyChallenges.find((c) => c.id === "combo_t3_10")).toEqual({
      id: "combo_t3_10", progress: 10, isComplete: true,
    });
    expect(state.lastDailyReset).toBeLessThanOrEqual(Date.now());
    expect(state.lastWeeklyReset).toBeLessThanOrEqual(Date.now());
  });

  it("updates every matching active challenge and caps at the goal", async () => {
    const { challengeStore } = await loadChallengeStore();
    challengeStore.setState({
      dailyChallenges: [{ id: "spill_15", progress: 14, isComplete: false }],
      weeklyChallenges: [{ id: "spill_50", progress: 49, isComplete: false }],
    });
    challengeStore.getState().record("spill", 3);
    expect(challengeStore.getState().dailyChallenges[0]).toEqual({ id: "spill_15", progress: 15, isComplete: true });
    expect(challengeStore.getState().weeklyChallenges[0]).toEqual({ id: "spill_50", progress: 50, isComplete: true });
  });

  it("rotates an expired daily set before crediting a record (CHAL-ROTATE-RECORD-1)", async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.parse("2026-08-01T00:00:00Z");
      vi.setSystemTime(t0);
      const { challengeStore } = await loadChallengeStore({
        dailyChallenges: [{ id: "spill_15", progress: 14, isComplete: false }],
        weeklyChallenges: [],
        lastDailyReset: t0,
        lastWeeklyReset: t0,
      });
      // * A session that crosses the daily boundary mid-game: progress has been
      // * building in-flight and the next record() lands after the reset stamp.
      vi.setSystemTime(t0 + 2 * 24 * 60 * 60 * 1000);
      challengeStore.getState().record("spill", 1);
      const after = challengeStore.getState();
      // * Rotation ran inside record() — the reset stamp advanced to now.
      expect(after.lastDailyReset).toBe(t0 + 2 * 24 * 60 * 60 * 1000);
      // * The fresh post-rotation set holds only the credited +1; the stale 14/15
      // * progress is provably gone (a re-picked spill_15 starts fresh at 0).
      expect(after.dailyChallenges.every((c) => c.progress <= 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not rotate when no window has expired (CHAL-ROTATE-RECORD-1 no-op)", async () => {
    const { challengeStore } = await loadChallengeStore();
    const before = challengeStore.getState();
    challengeStore.getState().record("spill", 1);
    const after = challengeStore.getState();
    expect(after.lastDailyReset).toBe(before.lastDailyReset);
    expect(after.lastWeeklyReset).toBe(before.lastWeeklyReset);
    expect(after.dailyChallenges.map((c) => c.id)).toEqual(before.dailyChallenges.map((c) => c.id));
  });

  it("never re-picks the outgoing sets on rotation (CHAL-ROTATE-REPEAT-1)", async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.parse("2026-08-01T00:00:00Z");
      vi.setSystemTime(t0);
      const { challengeStore } = await loadChallengeStore();
      const outgoingDaily = [
        { id: "spill_15", progress: 0, isComplete: false },
        { id: "combo_t2_5", progress: 0, isComplete: false },
        { id: "ko_void_3", progress: 0, isComplete: false },
        { id: "round_win_1", progress: 0, isComplete: false },
      ];
      const outgoingWeekly = [
        { id: "spill_50", progress: 0, isComplete: false },
        { id: "combo_t3_10", progress: 0, isComplete: false },
      ];
      challengeStore.setState({
        dailyChallenges: outgoingDaily,
        weeklyChallenges: outgoingWeekly,
        lastDailyReset: t0,
        lastWeeklyReset: t0,
      });
      // * Past both windows (8 days > 7-day weekly period) — both shelves rotate.
      vi.setSystemTime(t0 + 8 * 24 * 60 * 60 * 1000);
      challengeStore.getState().checkRotations();
      const after = challengeStore.getState();
      expect(after.lastDailyReset).toBe(t0 + 8 * 24 * 60 * 60 * 1000);
      expect(after.lastWeeklyReset).toBe(t0 + 8 * 24 * 60 * 60 * 1000);
      for (const c of after.dailyChallenges) {
        expect(outgoingDaily.some((p) => p.id === c.id)).toBe(false);
      }
      for (const c of after.weeklyChallenges) {
        expect(outgoingWeekly.some((p) => p.id === c.id)).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
