// hostCapability.test.js — NH-HIT lever 3 / HOST-ROLE-1 pure score math.
// No DOM required for scoreHostCapability; computeLocal uses injected deps.

import { describe, expect, it } from "vitest";
import {
  clampHostScore,
  computeLocalHostCapabilityScore,
  DEFAULT_HOST_SCORE,
  HOST_SCORE_MIGRATE_MARGIN,
  isWeakHostScore,
  scoreHostCapability,
  shouldPreferHostScore,
  shouldShowWeakHostWarning,
  WEAK_HOST_WARN_SCORE,
} from "../src/utils/hostCapability.js";
import {
  pickPreferredHostId,
  pickPreferredHostIdExcluding,
  shouldMigrateToPreferredHost,
} from "../party/hostSelection.ts";

describe("scoreHostCapability", () => {
  it("scores discrete high above iGPU low by more than the migrate margin", () => {
    const strong = scoreHostCapability({
      gpuClass: "discrete",
      qualityTier: "high",
      hardwareConcurrency: 24,
      deviceMemoryGb: 32,
    });
    const weak = scoreHostCapability({
      gpuClass: "unknown",
      qualityTier: "low",
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
    });
    expect(strong).toBeGreaterThanOrEqual(90);
    expect(weak).toBeLessThan(60);
    expect(strong - weak).toBeGreaterThanOrEqual(HOST_SCORE_MIGRATE_MARGIN);
  });

  it("does not ban software/iGPU alone — they still get a finite score", () => {
    expect(scoreHostCapability({ gpuClass: "software", qualityTier: "low" })).toBeGreaterThan(0);
    expect(scoreHostCapability({ gpuClass: "unknown", qualityTier: "medium" })).toBeGreaterThan(30);
  });

  it("clamps to 0–100", () => {
    expect(clampHostScore(999)).toBe(100);
    expect(clampHostScore(-3)).toBe(0);
    expect(clampHostScore("nope")).toBe(DEFAULT_HOST_SCORE);
  });

  it("shouldPreferHostScore requires a clear margin", () => {
    expect(shouldPreferHostScore(50, 50)).toBe(false);
    expect(shouldPreferHostScore(50, 50 + HOST_SCORE_MIGRATE_MARGIN - 1)).toBe(false);
    expect(shouldPreferHostScore(50, 50 + HOST_SCORE_MIGRATE_MARGIN)).toBe(true);
  });
});

describe("weak-host warning (HOST-CAP-1)", () => {
  it("uses strict < WEAK_HOST_WARN_SCORE (= DEFAULT_HOST_SCORE)", () => {
    expect(WEAK_HOST_WARN_SCORE).toBe(DEFAULT_HOST_SCORE);
    expect(isWeakHostScore(DEFAULT_HOST_SCORE)).toBe(false);
    expect(isWeakHostScore(DEFAULT_HOST_SCORE - 1)).toBe(true);
    expect(isWeakHostScore(0)).toBe(true);
    expect(isWeakHostScore(100)).toBe(false);
    // * Non-numbers / missing — not weak (legacy join never reported a score).
    expect(isWeakHostScore(null)).toBe(false);
    expect(isWeakHostScore(undefined)).toBe(false);
    expect(isWeakHostScore(NaN)).toBe(false);
  });

  it("shouldShowWeakHostWarning: host + weak + not latched only", () => {
    expect(shouldShowWeakHostWarning({ isHost: true, hostScore: 40, alreadyWarned: false })).toBe(true);
    expect(shouldShowWeakHostWarning({ isHost: true, hostScore: 50, alreadyWarned: false })).toBe(false);
    expect(shouldShowWeakHostWarning({ isHost: false, hostScore: 40, alreadyWarned: false })).toBe(false);
    expect(shouldShowWeakHostWarning({ isHost: true, hostScore: 40, alreadyWarned: true })).toBe(false);
  });
});

describe("computeLocalHostCapabilityScore", () => {
  it("uses injected probe + tier (happy-dom safe)", () => {
    const score = computeLocalHostCapabilityScore({
      probeGpu: () => ({ gpuClass: "discrete" }),
      getQualityTier: () => "high",
      navigatorLike: { hardwareConcurrency: 16, deviceMemory: 16 },
    });
    expect(score).toBe(
      scoreHostCapability({
        gpuClass: "discrete",
        qualityTier: "high",
        hardwareConcurrency: 16,
        deviceMemoryGb: 16,
      }),
    );
  });
});

describe("pickPreferredHostId + shouldMigrateToPreferredHost (server)", () => {
  const human = (connId) => ({ connId, kind: "human" });
  const npc = () => ({ connId: null, kind: "npc" });

  it("picks the highest score among live humans; join-order breaks ties", () => {
    const joinOrder = ["a", "b", "c"];
    const live = new Set(["a", "b", "c"]);
    const slots = [human("a"), human("b"), human("c")];
    const scores = new Map([
      ["a", 40],
      ["b", 90],
      ["c", 90],
    ]);
    // b and c both 90 — earliest join among max wins → b
    expect(pickPreferredHostId(joinOrder, live, slots, scores)).toBe("b");
  });

  it("skips NPCs and dead conns", () => {
    const joinOrder = ["ghost", "npc-host", "alive"];
    const live = new Set(["alive"]);
    const slots = [human("ghost"), npc(), human("alive")];
    const scores = new Map([["alive", 70]]);
    expect(pickPreferredHostId(joinOrder, live, slots, scores)).toBe("alive");
  });

  it("excludes the current AFK host even when it has the strongest score", () => {
    const joinOrder = ["afk", "next", "weak"];
    const live = new Set(joinOrder);
    const slots = joinOrder.map(human);
    const scores = new Map([
      ["afk", 100],
      ["next", 80],
      ["weak", 40],
    ]);

    expect(
      pickPreferredHostIdExcluding(joinOrder, live, slots, scores, "afk"),
    ).toBe("next");
    expect(
      pickPreferredHostIdExcluding(["afk"], new Set(["afk"]), [human("afk")], scores, "afk"),
    ).toBeNull();
  });

  it("migrates only when preferred beats current by margin", () => {
    const scores = new Map([
      ["intel", 54],
      ["4090", 100],
    ]);
    expect(shouldMigrateToPreferredHost("intel", "4090", scores)).toBe(true);
    expect(shouldMigrateToPreferredHost("4090", "intel", scores)).toBe(false);
    expect(shouldMigrateToPreferredHost("intel", "intel", scores)).toBe(false);
  });

  it("accepts an exact +20 return margin and rejects +19", () => {
    const exact = new Map([
      ["current", 60],
      ["returning", 80],
    ]);
    const short = new Map([
      ["current", 60],
      ["returning", 79],
    ]);

    expect(shouldMigrateToPreferredHost("current", "returning", exact)).toBe(true);
    expect(shouldMigrateToPreferredHost("current", "returning", short)).toBe(false);
  });

  it("does not thrash near-ties (two similar machines)", () => {
    const scores = new Map([
      ["a", 70],
      ["b", 78],
    ]);
    expect(shouldMigrateToPreferredHost("a", "b", scores)).toBe(false);
  });

  it("fills a null host with preferred", () => {
    const scores = new Map([["b", 40]]);
    expect(shouldMigrateToPreferredHost(null, "b", scores)).toBe(true);
  });
});
