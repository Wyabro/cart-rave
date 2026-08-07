import { describe, expect, it } from "vitest";
import { resolveNpcHumanBoostCommit } from "../src/utils/npcBoostCommit.js";

const CFG = Object.freeze({
  finisherEdgeBiasMin: 0.35,
  finisherCommitBonus: 0.25,
  safeCenterCommitMul: 0.72,
  safeCenterMinDist: 8.0,
});

describe("resolveNpcHumanBoostCommit (AI-DAY-1 lever 3)", () => {
  it("lead band mid-arena applies safe-center thrift on Medium", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1.4,
      edgeBias: 0,
      dist: 9,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(false);
    expect(out.safeCenter).toBe(true);
    expect(out.commit).toBeCloseTo(0.72);
  });

  it("finisher adds bonus pre-clamp so trail can still rise", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 0.55,
      edgeBias: 0.9,
      dist: 7,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(true);
    expect(out.safeCenter).toBe(false);
    expect(out.commit).toBeCloseTo(Math.min(1, 0.55 + 0.25));
  });

  it("lead + finisher stays full commit", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1.4,
      edgeBias: 0.5,
      dist: 6,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(true);
    expect(out.commit).toBe(1);
  });

  it("Easy never applies safe-center thrift", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1,
      edgeBias: 0,
      dist: 10,
      difficulty: "easy",
      cfg: CFG,
    });
    expect(out.safeCenter).toBe(false);
    expect(out.commit).toBe(1);
  });

  it("dist at or under 8m is not safe-center", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1,
      edgeBias: 0,
      dist: 8,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.safeCenter).toBe(false);
    expect(out.commit).toBe(1);
  });
});
