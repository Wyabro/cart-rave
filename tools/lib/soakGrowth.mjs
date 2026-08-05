/**
 * soakGrowth.mjs — the rematch-soak leak gate, as a pure function.
 *
 * HARNESS-GEO-1. The old gate compared the FIRST podium sample against the LAST and failed
 * when the difference exceeded a tolerance. That is the wrong shape for what it reads:
 * `renderer.info.memory.geometries` is a **monotone first-render ratchet**, not an
 * allocation count — three.js increments it in `WebGLGeometries.get()` the first time a
 * geometry is actually *drawn*, and only ever decrements on `dispose()`. So pooled VFX
 * geometry that merely becomes *visible* for the first time on a later cycle reads as
 * growth, and whether that happens depends on where the NPCs died that round. It produced a
 * false "Lever E leaked memory" blocker (writeup: docs/planning/bundle-1.md §12).
 *
 * The discriminator is SHAPE, not total:
 *
 *   - a one-time ratchet steps once and then stops   → at least one per-cycle delta is ~0
 *   - a real leak adds k objects EVERY rematch       → every per-cycle delta is ~k
 *
 * So gate on `min(deltas) <= perCycleTol`. This is *when-agnostic*: it does not care whether
 * the ratchet fires on the first rematch or the last, which matters because that was never
 * established for the runs that actually failed — only for one early-stepping Δ5 run.
 *
 * Rejected: "compare the last two cycles" and "sample cycles 2..N". At the default
 * `soakCycles: 3` those are the SAME check, and both assume the ratchet fires early.
 *
 * Three residuals, deliberately documented rather than hidden (all asserted in
 * tests/soakGrowth.test.js so the next reader cannot over-trust this gate):
 *
 *   1. A ratchet STAGGERED across every rematch still false-fails — e.g. [121,126,131] gives
 *      min 5 against perCycleTol 4. Open risk at 3 cycles. If ×10 soak evidence shows that
 *      shape is common, escalate to "drop the single largest delta, then re-check" — which is
 *      identical to min-delta at 3 cycles and only diverges at `--soakCycles 4`+.
 *   2. An INTERMITTENT leak slips through: [10, 0, 10] gives min 0 and passes. Unlikely for
 *      the steady per-rematch class this sentinel exists to catch, but it is a real hole.
 *   3. NEGATIVE deltas only make the gate more permissive. Fine for the monotone counters
 *      (geometries, textures); `sceneNodes` / `howls` can move both ways, so a dip on one
 *      cycle can mask growth on another. Not worth extra machinery for a sentinel.
 *
 * Sensitivity vs the old gate (geometries, tol 8, 3 cycles → perCycleTol 4): a one-shot
 * ratchet of Δ9–10 now passes (intended); a steady ≥5/rematch leak still fails; a steady
 * 4/rematch leak still passes, the same border the old total-Δ8 rule had.
 */

/**
 * @typedef {{
 *   pass: boolean,
 *   deltas: number[],
 *   minDelta: number | null,
 *   perCycleTol: number | null,
 *   detail: string,
 * }} SoakGrowthVerdict
 */

/**
 * Evaluate one metric's per-cycle sample series against a whole-run tolerance.
 *
 * `perCycleTol` is derived from `tol` and the series length so the per-rematch sensitivity
 * matches what the whole-run tolerance always implied: tol 8 across 2 rematches means a
 * budget of 4 per rematch. Length comes from `series` — never pass a cycle count alongside
 * it, that only invites the two drifting apart.
 *
 * @param {number[]} series Per-cycle samples of one metric, oldest first.
 * @param {number} tol Whole-run tolerance (the historical `TOLERANCE[metric]` value).
 * @returns {SoakGrowthVerdict}
 */
export function evaluateSoakGrowth(series, tol) {
  const samples = Array.isArray(series) ? series.filter((n) => typeof n === "number" && Number.isFinite(n)) : [];

  // * Fewer than two samples is a broken run (PLAY AGAIN died mid-soak), not a clean one.
  // * Fail loud — a sentinel that silently skips is worse than one that is merely flaky.
  if (samples.length < 2) {
    return {
      pass: false,
      deltas: [],
      minDelta: null,
      perCycleTol: null,
      detail: `incomplete series [${samples.join(", ")}] — need >=2 samples, got ${samples.length}`,
    };
  }

  const deltas = samples.slice(1).map((v, i) => v - samples[i]);
  const minDelta = Math.min(...deltas);
  // * ceil so a tolerance that does not divide evenly rounds in the permissive direction.
  // * At --soakCycles 2 this is ceil(tol/1) === tol and min-delta IS first-vs-last: same
  // * formula, no special case.
  const perCycleTol = Math.ceil(tol / deltas.length);
  const pass = minDelta <= perCycleTol;

  return {
    pass,
    deltas,
    minDelta,
    perCycleTol,
    detail:
      `[${samples.join(" → ")}] deltas [${deltas.join(", ")}] ` +
      `minΔ ${minDelta} (per-cycle tol ${perCycleTol}, run tol ${tol})`,
  };
}
