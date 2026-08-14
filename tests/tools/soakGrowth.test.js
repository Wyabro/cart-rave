/**
 * HARNESS-GEO-1: the rematch-soak leak sentinel gates on the MINIMUM per-cycle delta,
 * because the counters it reads are first-render ratchets rather than allocation counts.
 *
 * Two things must hold or the fix is worthless:
 *
 *   1. A one-time ratchet passes NO MATTER WHICH rematch it fires on. That is the whole
 *      point — the failing runs were never censused, so "it steps early" was never proven.
 *   2. A steady per-rematch leak STILL FAILS. A check that cannot fail is worse than a
 *      flaky one, and this sentinel is the only automated guard for that whole bug class.
 *
 * The residual cases below (staggered ratchet, intermittent leak) are asserted precisely so
 * the gate is not read as stronger than it is. If one of them starts biting in practice, the
 * escalation is in the tools/lib/soakGrowth.mjs header — not a tolerance bump.
 */
import { describe, it, expect } from "vitest";
import { evaluateSoakGrowth } from "../../tools/lib/soakGrowth.mjs";

/** Real geometries tolerance from gameharness's TOLERANCE table. */
const GEO_TOL = 8;

describe("evaluateSoakGrowth — a one-time ratchet passes whenever it fires", () => {
  it("passes an EARLY step (the one shape the identity census actually confirmed)", () => {
    // 442 → 448 → 448: pooled VFX first drawn during rematch 1, then flat.
    const v = evaluateSoakGrowth([442, 448, 448], GEO_TOL);
    expect(v.deltas).toEqual([6, 0]);
    expect(v.minDelta).toBe(0);
    expect(v.perCycleTol).toBe(4);
    expect(v.pass).toBe(true);
  });

  it("passes a LATE step — the case both rejected designs get wrong", () => {
    // "gate on the last two cycles" and "sample cycles 2..N" are the same check at 3
    // cycles, and both would FAIL this series. Min-delta is when-agnostic.
    const v = evaluateSoakGrowth([442, 442, 448], GEO_TOL);
    expect(v.deltas).toEqual([0, 6]);
    expect(v.minDelta).toBe(0);
    expect(v.pass).toBe(true);
  });

  it("passes both plausible shapes behind the real Δ10 failures", () => {
    // The battery report only ever kept "121 → 131", so the middle sample was lost.
    // Whichever of these it was, the gate must not fail it.
    expect(evaluateSoakGrowth([121, 121, 131], GEO_TOL).pass).toBe(true);
    expect(evaluateSoakGrowth([121, 131, 131], GEO_TOL).pass).toBe(true);
  });

  it("passes a genuinely flat run", () => {
    const v = evaluateSoakGrowth([442, 442, 442], GEO_TOL);
    expect(v.minDelta).toBe(0);
    expect(v.pass).toBe(true);
  });
});

describe("evaluateSoakGrowth — a real leak still bites", () => {
  it("fails a steady per-rematch leak", () => {
    const v = evaluateSoakGrowth([100, 110, 120], GEO_TOL);
    expect(v.deltas).toEqual([10, 10]);
    expect(v.minDelta).toBe(10);
    expect(v.pass).toBe(false);
  });

  it("fails a leak just over the per-cycle budget, passes just under", () => {
    // perCycleTol is 4 at 3 cycles: 5/rematch must fail, 4/rematch is the same border the
    // old total-Δ8 rule had.
    expect(evaluateSoakGrowth([100, 105, 110], GEO_TOL).pass).toBe(false);
    expect(evaluateSoakGrowth([100, 104, 108], GEO_TOL).pass).toBe(true);
  });

  it("fails a large leak on the 2-sample path too", () => {
    // No special branch: one delta, perCycleTol = ceil(8/1) = 8, so this IS first-vs-last.
    const v = evaluateSoakGrowth([121, 131], GEO_TOL);
    expect(v.deltas).toEqual([10]);
    expect(v.perCycleTol).toBe(GEO_TOL);
    expect(v.pass).toBe(false);
  });
});

describe("evaluateSoakGrowth — documented residuals (do NOT over-trust this gate)", () => {
  it("RESIDUAL 1: a ratchet staggered across every rematch still false-fails", () => {
    // [121,126,131] → min 5 > perCycleTol 4. Open risk at 3 cycles; the ×10 soak evidence
    // run exists to find out whether this shape actually occurs.
    const v = evaluateSoakGrowth([121, 126, 131], GEO_TOL);
    expect(v.minDelta).toBe(5);
    expect(v.pass).toBe(false);
  });

  it("RESIDUAL 2: an intermittent leak slips through", () => {
    // Real hole, not a bug in the implementation. The sentinel targets steady per-rematch
    // growth; a leak that pauses for one cycle hides behind the min.
    const v = evaluateSoakGrowth([10, 20, 20, 30], GEO_TOL);
    expect(v.minDelta).toBe(0);
    expect(v.pass).toBe(true);
  });

  it("RESIDUAL 3: a negative delta only makes the gate more permissive", () => {
    // sceneNodes/howls can move both ways; a dip on one cycle masks growth on another.
    const v = evaluateSoakGrowth([100, 90, 130], GEO_TOL);
    expect(v.minDelta).toBe(-10);
    expect(v.pass).toBe(true);
  });
});

describe("evaluateSoakGrowth — never silent", () => {
  it("fails loud on an incomplete series (PLAY AGAIN died mid-soak)", () => {
    const v = evaluateSoakGrowth([121], GEO_TOL);
    expect(v.pass).toBe(false);
    expect(v.minDelta).toBeNull();
    expect(v.detail).toMatch(/incomplete series/);
  });

  it("fails loud on an empty or junk series rather than passing vacuously", () => {
    expect(evaluateSoakGrowth([], GEO_TOL).pass).toBe(false);
    expect(evaluateSoakGrowth(/** @type {any} */ (undefined), GEO_TOL).pass).toBe(false);
    expect(evaluateSoakGrowth(/** @type {any} */ ([1, null, 3]), GEO_TOL).detail).toMatch(/incomplete|deltas/);
  });

  it("carries the full series in the detail so the battery JSON keeps the shape", () => {
    // The old gate persisted only "121 → 131". Losing the middle sample is what made
    // diagnosing this cost a whole investigation.
    const v = evaluateSoakGrowth([121, 126, 131], GEO_TOL);
    expect(v.detail).toContain("121 → 126 → 131");
    expect(v.detail).toContain("deltas [5, 5]");
  });
});
