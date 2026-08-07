import { describe, expect, it } from "vitest";
import {
  AI_LEAD_DIST_CAP_M,
  EDGE_CHASE_BONUS_MAX,
  HARD_STEER_GAIN_MAX_CAP,
  applyEdgeChaseWeights,
  applyPersonalityMods,
  clampAiLeadDisplacement,
  getAiLeadTimeS,
  getDifficultyMods,
  getEdgeChaseWeightMul,
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

  it("Medium is FEEL-DAY-1 baseline (not personality identity)", () => {
    const out = applyPersonalityMods(AGGRESSOR, "medium");
    // * humanWeightOffset +0.06, clamp 0.95 → aggressor 0.93 only gains to 0.95
    expect(out.humanWeight).toBe(0.95);
    expect(out.decisionIntervalMin).toBe(AGGRESSOR.decisionIntervalMin);
    expect(out.decisionIntervalMax).toBe(AGGRESSOR.decisionIntervalMax);
    expect(out.steerGainMin).toBe(AGGRESSOR.steerGainMin);
    expect(out.steerGainMax).toBe(AGGRESSOR.steerGainMax);
    // * npcRamCommitMul 1.18
    expect(out.npcRamCommitChance).toBeCloseTo(AGGRESSOR.npcRamCommitChance * 1.18);
    expect(getStuckWindowMs("medium")).toBe(1100);
    expect(getRandomStopChance(false, "medium")).toBeCloseTo(0.04);
    expect(getDifficultyMods("medium").npcRamCommitMul).toBe(1.18);
    expect(getDifficultyMods("medium").humanWeightOffset).toBe(0.06);
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

  // * AI-DAY-1 lever 1 — intercept lead scales Easy < Medium < Hard; planar cap protects 8 m gates.
  it("AI lead time scales Easy < Medium < Hard", () => {
    expect(getAiLeadTimeS("easy")).toBe(0.35);
    expect(getAiLeadTimeS("medium")).toBe(0.55);
    expect(getAiLeadTimeS("hard")).toBe(0.70);
    expect(getAiLeadTimeS("easy")).toBeLessThan(getAiLeadTimeS("medium"));
    expect(getAiLeadTimeS("medium")).toBeLessThan(getAiLeadTimeS("hard"));
  });

  it("AI lead displacement clamps so a 20 m/s Hard lead stays ≤ 4.5 m planar", () => {
    const t = getAiLeadTimeS("hard");
    const speed = 20;
    const raw = speed * t; // 14 m without clamp
    expect(raw).toBeGreaterThan(AI_LEAD_DIST_CAP_M);
    const c = clampAiLeadDisplacement(raw, 0);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(AI_LEAD_DIST_CAP_M);
    expect(c.x).toBeCloseTo(AI_LEAD_DIST_CAP_M);
    expect(c.z).toBe(0);
    // * Under cap: unchanged
    const soft = clampAiLeadDisplacement(1.2, 1.6);
    expect(soft.x).toBeCloseTo(1.2);
    expect(soft.z).toBeCloseTo(1.6);
  });

  // * AI-DAY-1 lever 2 — solo-effective chase weight (not multi-human d2 ranking).
  it("edge chase weight mul is Easy 0 < Medium 0.55 < Hard 1", () => {
    expect(getEdgeChaseWeightMul("easy")).toBe(0);
    expect(getEdgeChaseWeightMul("medium")).toBe(0.55);
    expect(getEdgeChaseWeightMul("hard")).toBe(1);
  });

  it("applyEdgeChaseWeights raises hunt weight on the lip; Easy mul is a no-op", () => {
    const base = { humanWeight: 0.7, patrolWeight: 0.3, edgeBias: 1, mul: 0.55 };
    const out = applyEdgeChaseWeights(base);
    // * bonus = 1 * 0.55 * 0.22 ≈ 0.121
    expect(out.humanWeight).toBeCloseTo(0.7 + 0.55 * EDGE_CHASE_BONUS_MAX);
    expect(out.humanWeight).toBeLessThanOrEqual(0.97);
    expect(out.patrolWeight).toBeLessThan(0.3);
    expect(out.patrolWeight).toBeGreaterThanOrEqual(0.04);

    const easy = applyEdgeChaseWeights({ ...base, mul: 0 });
    expect(easy.humanWeight).toBe(0.7);
    expect(easy.patrolWeight).toBe(0.3);

    const sd = applyEdgeChaseWeights({ ...base, isSuddenDeath: true });
    expect(sd.humanWeight).toBeCloseTo(0.7 + 0.55 * EDGE_CHASE_BONUS_MAX * 0.5);
  });
});
