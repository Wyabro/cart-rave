// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/utils/storage.js";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function loadChallengeStore(payload) {
  if (payload) localStorage.setItem(STORAGE_KEYS.challenges, JSON.stringify(payload));
  return import("../src/stores/challengeStore.js");
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
    expect(state.dailyChallenges.find((c) => c.id === "last_standing_2")).toEqual({
      id: "last_standing_2", progress: 0, isComplete: false,
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
});
