/**
 * batteryPlan.mjs — canonical battery suite identity + completeness helpers.
 *
 * The six core steps are the required regression suite. Opt-in steps (visual, qa)
 * never count toward "complete." Targeted runs (--only/--skip) remain valid history
 * but are classified partial and cannot be green readiness evidence.
 */

/** @typedef {{ name: string, cmd: string[], urlArg?: boolean, optIn?: string, note: string, core?: boolean }} BatteryStep */

/** Suite identity stamped into every versioned battery report. */
export const BATTERY_SUITE_ID = "cart-clash-core-v1";

/** Report schema version written by tools/battery.mjs. */
export const BATTERY_REPORT_VERSION = 2;

/**
 * Full step catalog. `core: true` steps are required for a complete suite run.
 * @type {BatteryStep[]}
 */
export const BATTERY_STEPS = [
  {
    name: "gameharness",
    cmd: ["node", "tools/gameharness.mjs"],
    urlArg: true,
    core: true,
    note: "solo gameplay: roundflow + unlockFunnel + arenas + soak",
  },
  {
    name: "spawnlock",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "spawnlock"],
    urlArg: true,
    core: true,
    note: "2-client: joiner drives off spawn (NET-2 probe)",
  },
  {
    name: "mpIntegration",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "mpIntegration"],
    urlArg: true,
    core: true,
    note: "2-client: netcode↔gameplay seam",
  },
  {
    name: "hostMigration",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "hostMigration"],
    urlArg: true,
    core: true,
    note: "2-client: clean host departure",
  },
  {
    name: "hostReload",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "hostReload"],
    urlArg: true,
    core: true,
    note: "2-client: mid-round host tab reload (A6b)",
  },
  {
    name: "teardownRejoin",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "teardownRejoin"],
    urlArg: true,
    core: true,
    note: "2-client: menu-return teardown before rejoin",
  },
  {
    name: "friendsLobby",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "friendsLobby"],
    urlArg: true,
    core: false,
    note: "2-client: friends CHECKOUT LINE lobby, ready-up, rematch (HARNESS-FRIENDS-1)",
  },
  {
    name: "hostFreeze",
    cmd: ["node", "tools/netharness.mjs", "--scenario", "hostFreeze"],
    urlArg: true,
    core: false,
    note: "2-client: host tab freezes (CDP) without dying, then thaws (HARNESS-FREEZE-1)",
  },
  {
    name: "visual",
    cmd: ["node", "tools/blackframes.mjs", "--shot", "classic", "--frames", "30"],
    optIn: "visual",
    core: false,
    note: "black-frame battery (qa:visual)",
  },
  {
    name: "qa",
    cmd: ["npm", "run", "qa"],
    optIn: "qa",
    core: false,
    note: "typecheck + vitest + knip",
  },
];

/** Required core step names, in suite order. */
export const REQUIRED_CORE_STEPS = BATTERY_STEPS.filter((s) => s.core).map((s) => s.name);

/**
 * Select steps for a run given --only / --skip / opt-in flags.
 * @param {{ only?: string[] | null, skip?: Set<string> | string[] | null, flags?: Record<string, unknown> }} opts
 * @returns {BatteryStep[]}
 */
export function selectBatterySteps(opts = {}) {
  const only = opts.only?.length ? opts.only : null;
  const skip = opts.skip instanceof Set ? opts.skip : new Set(opts.skip ?? []);
  const flags = opts.flags ?? {};
  return BATTERY_STEPS.filter((s) => {
    if (only) return only.includes(s.name);
    if (skip.has(s.name)) return false;
    if (s.optIn) return flags[s.optIn] === true;
    return true;
  });
}

/**
 * Names omitted from a run relative to the required core suite.
 * @param {string[]} selectedNames
 * @returns {string[]}
 */
export function omittedCoreSteps(selectedNames) {
  const selected = new Set(selectedNames);
  return REQUIRED_CORE_STEPS.filter((n) => !selected.has(n));
}

/**
 * A run is complete when every required core step was selected (opt-ins optional).
 * @param {string[]} selectedNames
 * @returns {boolean}
 */
export function isCompleteCoreSelection(selectedNames) {
  return omittedCoreSteps(selectedNames).length === 0;
}

/**
 * Classify a battery report for readiness evidence.
 * Values: green | red | partial | inconclusive | stale | head-mismatch | unknown
 *
 * Legacy reports without provenance remain visible but never "green".
 *
 * @param {any} report
 * @param {{ headFull?: string | null, maxAgeMs?: number, nowMs?: number }} [ctx]
 * @returns {{
 *   class: string,
 *   complete: boolean,
 *   hasProvenance: boolean,
 *   coreSelected: number,
 *   coreTotal: number,
 *   scopeLabel: string,
 *   reasons: string[],
 * }}
 */
export function classifyBatteryEvidence(report, ctx = {}) {
  const reasons = [];
  if (!report || typeof report !== "object") {
    return {
      class: "unknown",
      complete: false,
      hasProvenance: false,
      coreSelected: 0,
      coreTotal: REQUIRED_CORE_STEPS.length,
      scopeLabel: `0/${REQUIRED_CORE_STEPS.length}`,
      reasons: ["missing-report"],
    };
  }

  const results = Array.isArray(report.results) ? report.results : [];
  const selected =
    Array.isArray(report.selectedSteps) && report.selectedSteps.length
      ? report.selectedSteps.map(String)
      : results.map((r) => String(r?.name ?? "")).filter(Boolean);

  const coreSelected = REQUIRED_CORE_STEPS.filter((n) => selected.includes(n)).length;
  const coreTotal = REQUIRED_CORE_STEPS.length;
  const scopeLabel = `${coreSelected}/${coreTotal}`;
  const complete =
    report.complete === true ||
    (report.complete == null && isCompleteCoreSelection(selected) && selected.length >= coreTotal);
  const hasProvenance = Boolean(
    report.reportVersion >= 2 &&
      report.suiteId &&
      report.git &&
      (report.git.headFull || report.git.head),
  );

  if (!hasProvenance) reasons.push("legacy-no-provenance");
  if (!complete) reasons.push("partial-scope");

  const maxAgeMs = ctx.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const nowMs = ctx.nowMs ?? Date.now();
  const whenMs = report.when ? Date.parse(report.when) : NaN;
  const stale = Number.isFinite(whenMs) && nowMs - whenMs > maxAgeMs;
  if (stale) reasons.push("stale");

  const reportHead = report.git?.headFull || report.git?.head || null;
  const localHead = ctx.headFull ?? null;
  let headMismatch = false;
  if (hasProvenance && localHead && reportHead) {
    const a = String(reportHead);
    const b = String(localHead);
    headMismatch = !(a === b || a.startsWith(b) || b.startsWith(a));
    if (headMismatch) reasons.push("head-mismatch");
  }

  const failing = results.filter((r) => r.code !== 0 && r.code !== 3);
  const inconclusive = results.filter((r) => r.code === 3);

  let cls = "unknown";
  if (failing.length > 0) cls = "red";
  else if (!complete) cls = "partial";
  else if (inconclusive.length > 0) cls = "inconclusive";
  else if (stale) cls = "stale";
  else if (headMismatch) cls = "head-mismatch";
  else if (!hasProvenance) cls = "unknown"; // complete-looking legacy → never green
  else if (results.length === 0) cls = "unknown";
  else cls = "green";

  return {
    class: cls,
    complete: Boolean(complete),
    hasProvenance,
    coreSelected,
    coreTotal,
    scopeLabel,
    reasons,
  };
}
