/**
 * nullDelta.mjs — HARNESS-NULL-1 null-control gate, as a pure function.
 *
 * When a measurement rig compares two arms that are supposed to be the same experiment
 * (`--null`), the measured delta must sit under a noise floor. Anything larger means the
 * rig is biased and every normal-mode A/B number it prints is contaminated rather than
 * caused.
 *
 * Stricter than soakGrowth: either arm non-finite → FAIL (soakGrowth filters non-finites
 * and only fails when fewer than two valid samples remain). A silent filter here would
 * turn a broken measure into a smaller green series.
 *
 * Floor provenance (not variance data): the default 1.5 ms used by perf-profile is borrowed
 * from the PERF-PASS-1 handover *drift-check* threshold — explicitly not a variance
 * estimate. Callers must label floorStatus provisional until a same-adapter series exists.
 */

/**
 * @typedef {{
 *   pass: boolean,
 *   delta: number | null,
 *   absDelta: number | null,
 *   floor: number,
 *   a: number | null,
 *   b: number | null,
 *   metric: string | null,
 *   detail: string,
 * }} NullDeltaVerdict
 */

/**
 * Evaluate a null-control pair: both arms identical experiment, |a − b| must be ≤ floor.
 *
 * @param {unknown} a Arm A primary metric
 * @param {unknown} b Arm B primary metric
 * @param {{ floor: number, metric?: string }} opts
 * @returns {NullDeltaVerdict}
 */
export function evaluateNullDelta(a, b, opts) {
  const floor = opts?.floor;
  const metric = typeof opts?.metric === "string" ? opts.metric : null;
  const label = metric ? `${metric}: ` : "";

  if (typeof floor !== "number" || !Number.isFinite(floor) || floor < 0) {
    return {
      pass: false,
      delta: null,
      absDelta: null,
      floor: typeof floor === "number" ? floor : NaN,
      a: null,
      b: null,
      metric,
      detail: `${label}invalid floor ${String(floor)}`,
    };
  }

  const aOk = typeof a === "number" && Number.isFinite(a);
  const bOk = typeof b === "number" && Number.isFinite(b);
  if (!aOk || !bOk) {
    return {
      pass: false,
      delta: null,
      absDelta: null,
      floor,
      a: aOk ? /** @type {number} */ (a) : null,
      b: bOk ? /** @type {number} */ (b) : null,
      metric,
      detail: `${label}incomplete — a=${String(a)} b=${String(b)} (both must be finite)`,
    };
  }

  const aN = /** @type {number} */ (a);
  const bN = /** @type {number} */ (b);
  const delta = bN - aN;
  const absDelta = Math.abs(delta);
  const pass = absDelta <= floor;

  return {
    pass,
    delta,
    absDelta,
    floor,
    a: aN,
    b: bN,
    metric,
    detail:
      `${label}a=${aN} b=${bN} Δ=${delta} |Δ|=${absDelta} floor=${floor}` +
      (pass ? " PASS" : " FAIL"),
  };
}
