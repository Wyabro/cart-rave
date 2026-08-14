import { describe, expect, it } from "vitest";
import { buildKOConfirmPreview } from "../../src/scoring/koEvent.js";

function makeDeps(hit) {
  return {
    getLastHitBy: () => new Map(hit ? [[2, hit]] : []),
    CONFIG: { scoring: { hitWindowMs: 3000 } },
  };
}

describe("buildKOConfirmPreview", () => {
  it("confirms an attributed fall at the shared rim without scoring it", () => {
    expect(buildKOConfirmPreview(makeDeps({ attackerSlotIndex: 1, timestamp: 1000 }), 2, 3900))
      .toEqual({ victimSlotIndex: 2, attackerSlotIndex: 1 });
  });

  it("does not confirm a stale hit", () => {
    expect(buildKOConfirmPreview(makeDeps({ attackerSlotIndex: 1, timestamp: 1000 }), 2, 4001))
      .toBeNull();
  });

  it("does not confirm a self-fall", () => {
    expect(buildKOConfirmPreview(makeDeps(null), 2, 1000)).toBeNull();
  });
});
