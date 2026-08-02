import { describe, expect, it } from "vitest";
import {
  HARD_STEER_GAIN_MAX_CAP,
  applyPersonalityMods,
  getDifficultyMods,
  getRandomStopChance,
  getStuckWindowMs,
  normalizeDifficulty,
  resolveRoomDifficulty,
  setActiveAiDifficulty,
  getActiveAiDifficulty,
  DEFAULT_SOLO,
  QUICKPLAY_FIXED,
} from "../src/aiDifficulty.js";

const AGGRESSOR = {
  name: "aggressor",
  humanWeight: 0.93,
  patrolWeight: 0.052,
  wanderWeight: 0.031,
  decisionIntervalMin: 200,
  decisionIntervalMax: 450,
  steerGainMin: 1.3,
  steerGainMax: 1.8,
  npcRamCommitChance: 0.62,
};

const CHAOTIC = {
  name: "chaotic",
  humanWeight: 0.45,
  patrolWeight: 0.10,
  wanderWeight: 0.45,
  decisionIntervalMin: 150,
  decisionIntervalMax: 950,
  steerGainMin: 1.0,
  steerGainMax: 2.2,
  npcRamCommitChance: 0.45,
};

describe("aiDifficulty", () => {
  it("normalizes ids and defaults Solo to medium", () => {
    expect(normalizeDifficulty("HARD")).toBe("hard");
    expect(normalizeDifficulty("nope")).toBe(DEFAULT_SOLO);
    expect(DEFAULT_SOLO).toBe("medium");
  });

  it("Medium is identity on personality fields", () => {
    const out = applyPersonalityMods(AGGRESSOR, "medium");
    expect(out.humanWeight).toBe(AGGRESSOR.humanWeight);
    expect(out.decisionIntervalMin).toBe(AGGRESSOR.decisionIntervalMin);
    expect(out.decisionIntervalMax).toBe(AGGRESSOR.decisionIntervalMax);
    expect(out.steerGainMin).toBe(AGGRESSOR.steerGainMin);
    expect(out.steerGainMax).toBe(AGGRESSOR.steerGainMax);
    expect(out.npcRamCommitChance).toBe(AGGRESSOR.npcRamCommitChance);
    expect(getStuckWindowMs("medium")).toBe(1100);
    expect(getRandomStopChance(false, "medium")).toBeCloseTo(0.04);
  });

  it("Easy dials down aggression and slows decisions", () => {
    const out = applyPersonalityMods(AGGRESSOR, "easy");
    expect(out.humanWeight).toBeLessThan(AGGRESSOR.humanWeight);
    expect(out.decisionIntervalMin).toBeGreaterThan(AGGRESSOR.decisionIntervalMin);
    expect(out.npcRamCommitChance).toBeLessThan(AGGRESSOR.npcRamCommitChance);
    expect(getStuckWindowMs("easy")).toBe(1610);
    expect(getRandomStopChance(false, "easy")).toBeCloseTo(0.0692);
  });

  it("Hard dials up and caps Chaotic steerGainMax", () => {
    const out = applyPersonalityMods(CHAOTIC, "hard");
    expect(out.humanWeight).toBeGreaterThan(CHAOTIC.humanWeight);
    expect(out.decisionIntervalMin).toBeLessThan(CHAOTIC.decisionIntervalMin);
    expect(out.npcRamCommitChance).toBeGreaterThan(CHAOTIC.npcRamCommitChance);
    expect(out.steerGainMax).toBeLessThanOrEqual(HARD_STEER_GAIN_MAX_CAP);
    expect(out.steerGainMin).toBeLessThanOrEqual(out.steerGainMax);
    expect(getStuckWindowMs("hard")).toBe(565);
    expect(getRandomStopChance(false, "hard")).toBe(0);
    expect(getDifficultyMods("hard").hardTactics).toBe(true);
  });

  it("Quickplay resolves to medium without depending on store", () => {
    expect(resolveRoomDifficulty("quickplay", "easy")).toBe(QUICKPLAY_FIXED);
    expect(resolveRoomDifficulty("quickplay", "hard")).toBe("medium");
    expect(resolveRoomDifficulty("solo", "hard")).toBe("hard");
    expect(resolveRoomDifficulty("friends", null)).toBe(DEFAULT_SOLO);
  });

  it("setActiveAiDifficulty drives the brain latch", () => {
    setActiveAiDifficulty("hard");
    expect(getActiveAiDifficulty()).toBe("hard");
    setActiveAiDifficulty("easy");
    expect(getActiveAiDifficulty()).toBe("easy");
  });
});
