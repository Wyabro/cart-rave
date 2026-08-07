import { describe, expect, it } from "vitest";
import { resolveNpcHumanBoostCommit } from "../src/utils/soloRubberband.js";

const CFG = Object.freeze({
  finisherEdgeBiasMin: 0.35,
  finisherCommitBonus: 0.25,
  safeCenterCommitMul: 0.72,
  safeCenterMinDist: 8.0,
});

describe("resolveNpcHumanBoostCommit (AI-DAY-1 lever 3 + SELFKO-1)", () => {
  it("lead band mid-arena applies safe-center thrift on Medium", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1.4,
      edgeBias: 0,
      botEdgeBias: 0,
      dist: 9,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(false);
    expect(out.safeCenter).toBe(true);
    expect(out.botLipDeny).toBe(false);
    expect(out.commit).toBeCloseTo(0.72);
  });

  it("finisher adds bonus pre-clamp so trail can still rise when bot is safe", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 0.55,
      edgeBias: 0.9,
      botEdgeBias: 0.1,
      dist: 7,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(true);
    expect(out.safeCenter).toBe(false);
    expect(out.commit).toBeCloseTo(Math.min(1, 0.55 + 0.25));
  });

  it("lead + finisher stays full commit when bot is not on lip", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1.4,
      edgeBias: 0.5,
      botEdgeBias: 0,
      dist: 6,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(true);
    expect(out.commit).toBe(1);
  });

  it("SELFKO-1: bot on lip hard-denies boost (commit 0)", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1.4,
      edgeBias: 0.9,
      botEdgeBias: 0.5,
      dist: 6,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.botLipDeny).toBe(true);
    expect(out.finisher).toBe(false);
    expect(out.commit).toBe(0);
  });

  it("SELFKO-1: human on lip but bot also near threshold denies (botEdgeBias >= min)", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1,
      edgeBias: 0.9,
      botEdgeBias: 0.35,
      dist: 5.5,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.botLipDeny).toBe(true);
    expect(out.commit).toBe(0);
  });

  it("human on lip without bot bias still finishers (default botEdgeBias 0)", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1,
      edgeBias: 0.9,
      dist: 6,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.finisher).toBe(true);
    expect(out.botLipDeny).toBe(false);
    expect(out.commit).toBe(1);
  });

  it("Easy never applies safe-center thrift", () => {
    const out = resolveNpcHumanBoostCommit({
      nitroMul: 1,
      edgeBias: 0,
      botEdgeBias: 0,
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
      botEdgeBias: 0,
      dist: 8,
      difficulty: "medium",
      cfg: CFG,
    });
    expect(out.safeCenter).toBe(false);
    expect(out.commit).toBe(1);
  });
});
