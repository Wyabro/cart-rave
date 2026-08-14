// soloRubberband.test.js — solo-only AI difficulty curve from score lead/trail.

import { describe, it, expect } from "vitest";
import {
  computeSoloRubberband,
  bestNpcScore,
  firstHumanScore,
  SOLO_RUBBERBAND_NEUTRAL,
} from "../../src/utils/soloRubberband.js";

const slots = [
  { kind: "human", connId: "local-solo-player" },
  { kind: "npc", connId: null },
  { kind: "npc", connId: null },
  { kind: "npc", connId: null },
];

describe("firstHumanScore / bestNpcScore", () => {
  it("reads the human and best NPC scores", () => {
    const scores = { 0: 5, 1: 2, 2: 7, 3: 1 };
    expect(firstHumanScore(scores, slots)).toEqual({ slotIndex: 0, score: 5 });
    expect(bestNpcScore(scores, slots)).toBe(7);
  });
});

describe("computeSoloRubberband", () => {
  it("is neutral when scores are close", () => {
    const f = computeSoloRubberband({ 0: 3, 1: 2, 2: 1, 3: 0 }, slots, {
      trailBy: 2,
      leadBy: 3,
    });
    expect(f.band).toBe("even");
    expect(f.chaseMul).toBe(1);
    expect(f.nitroMul).toBe(1);
    expect(f.distanceMul).toBe(1);
  });

  it("eases off when the human trails by 2+", () => {
    const f = computeSoloRubberband({ 0: 1, 1: 4, 2: 2, 3: 0 }, slots, {
      trailBy: 2,
      leadBy: 3,
      trailChaseMul: 0.72,
      trailNitroMul: 0.55,
      trailDistanceMul: 1.28,
      trailAimSlackDeg: 10,
    });
    expect(f.band).toBe("trail");
    expect(f.humanLead).toBe(1 - 4);
    expect(f.chaseMul).toBe(0.72);
    expect(f.nitroMul).toBe(0.55);
    expect(f.distanceMul).toBe(1.28);
    expect(f.aimSlackDeg).toBe(10);
  });

  it("hunts harder when the human leads by 3+", () => {
    const f = computeSoloRubberband({ 0: 8, 1: 2, 2: 3, 3: 1 }, slots, {
      trailBy: 2,
      leadBy: 3,
      leadChaseMul: 1.22,
      leadNitroMul: 1.28,
      leadDistanceMul: 0.72,
      leadAimSlackDeg: -6,
    });
    expect(f.band).toBe("lead");
    expect(f.humanLead).toBe(5);
    expect(f.chaseMul).toBe(1.22);
    expect(f.nitroMul).toBe(1.28);
    expect(f.distanceMul).toBe(0.72);
    expect(f.aimSlackDeg).toBe(-6);
  });

  it("returns neutral with no human slot", () => {
    const f = computeSoloRubberband({ 0: 9 }, [{ kind: "npc" }], {});
    expect(f).toEqual(SOLO_RUBBERBAND_NEUTRAL);
  });
});
