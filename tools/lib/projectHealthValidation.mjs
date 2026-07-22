/**
 * projectHealthValidation.mjs — pure strict evaluator for Command Center drift.
 *
 * Collection stays tolerant (missing files → null). This module turns a health model
 * (or raw STATUS markdown) into stable finding codes so `npm run health:check` fails
 * deterministically when docs/tools drift.
 */

import { issueState, queueRowState, parseStatusReleasePhases, parseStatusCurrentFocus, parseStatusPlaytestQueue, parseStatusOpenIssues, parseStatusDoNots, extractSection, parseListItems } from "./projectHealth.mjs";
import { extractBriefingDigest, briefingSourceDigest } from "./briefing.mjs";
import { extractArchDigest } from "./archRender.mjs";

/** Canonical phase order (STATUS ### Release phases). */
export const PHASE_ORDER = [
  "Foundation",
  "Core gameplay",
  "Multiplayer",
  "Production systems",
  "Playtesting & stabilization",
  "Release candidate",
  "Ship",
];

/**
 * Normalize a phase name for comparison (strip em-dash suffixes / case).
 * @param {string} name
 */
export function normalizePhaseName(name) {
  return String(name ?? "")
    .split("—")[0]
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @typedef {{ code: string, severity: "error" | "warn", message: string, detail?: unknown }} HealthFinding
 */

/**
 * Validate declared STATUS semantics (phase ordering, active card, open-only issues, …).
 * @param {string} statusMd
 * @returns {HealthFinding[]}
 */
export function validateStatusSemantics(statusMd) {
  /** @type {HealthFinding[]} */
  const findings = [];
  const phases = parseStatusReleasePhases(statusMd);
  const current = phases.filter((p) => p.state === "current");
  if (current.length !== 1) {
    findings.push({
      code: "PHASE_MARKER_COUNT",
      severity: "error",
      message: `Expected exactly one ▶ phase marker, found ${current.length}`,
      detail: current.map((p) => p.name),
    });
  }

  // Phase order: done → current → todo, and names follow PHASE_ORDER prefixes.
  let sawCurrent = false;
  let sawTodo = false;
  for (const p of phases) {
    if (p.state === "done" && (sawCurrent || sawTodo)) {
      findings.push({
        code: "PHASE_ORDER_INVALID",
        severity: "error",
        message: `Done phase after current/todo: ${p.name}`,
      });
    }
    if (p.state === "current") {
      if (sawTodo) {
        findings.push({
          code: "PHASE_ORDER_INVALID",
          severity: "error",
          message: `Current phase after a todo: ${p.name}`,
        });
      }
      sawCurrent = true;
    }
    if (p.state === "todo") sawTodo = true;
  }

  const known = PHASE_ORDER.map(normalizePhaseName);
  for (const p of phases) {
    const n = normalizePhaseName(p.name);
    if (!known.some((k) => n.startsWith(k) || k.startsWith(n))) {
      findings.push({
        code: "PHASE_UNKNOWN",
        severity: "warn",
        message: `Unrecognized phase name: ${p.name}`,
      });
    }
  }

  const queue = parseStatusPlaytestQueue(statusMd);
  const active = queue.filter((q) => q.state === "active" || queueRowState(q.status) === "active");
  if (active.length > 1) {
    findings.push({
      code: "ACTIVE_CARD_COUNT",
      severity: "error",
      message: `Expected ≤1 active queue card, found ${active.length}`,
      detail: active.map((a) => a.id),
    });
  }

  const mission = parseStatusCurrentFocus(statusMd);
  const currentName = current[0]?.name ?? "";
  if (mission?.headline && currentName) {
    const m = normalizePhaseName(mission.headline);
    const c = normalizePhaseName(currentName);
    // Mission should mention stabilization while that phase is current (or RC / Ship).
    const stab = normalizePhaseName("Playtesting & stabilization");
    const rc = normalizePhaseName("Release candidate");
    if (c.startsWith(stab) && /release\s*candidate|\brc\b/i.test(mission.headline) && !/stabil/i.test(mission.headline)) {
      findings.push({
        code: "MISSION_PHASE_MISMATCH",
        severity: "error",
        message: "Current focus claims Release candidate while ▶ is Playtesting & stabilization",
      });
    }
    if (c.startsWith(rc) && /stabil/i.test(mission.headline) && !/release\s*candidate|\brc\b/i.test(mission.headline)) {
      findings.push({
        code: "MISSION_PHASE_MISMATCH",
        severity: "warn",
        message: "Current focus still says stabilization while ▶ is Release candidate",
      });
    }
    void m;
  }

  const issues = parseStatusOpenIssues(statusMd);
  for (const i of issues) {
    const st = issueState(i.status);
    if (st === "closed") {
      findings.push({
        code: "STATUS_CLOSED_ISSUE",
        severity: "error",
        message: `STATUS Open issues still lists closed id ${i.id}`,
      });
    }
  }

  // No hand-maintained computed HEAD / qa green claims in the health table region.
  const healthSection = extractSection(statusMd, "## Project health") ?? "";
  if (/\borigin\/cart-clash\b.*`[0-9a-f]{7,}`/i.test(healthSection) || /\bGates\s*\(`npm run qa`\)\s*\|\s*✅/i.test(healthSection)) {
    findings.push({
      code: "STATUS_COMPUTED_CLAIM",
      severity: "error",
      message: "STATUS Project health hand-claims HEAD or qa green — use collectors instead",
    });
  }

  if (parseStatusDoNots(statusMd).length === 0) {
    findings.push({
      code: "STATUS_DONOTS_MISSING",
      severity: "warn",
      message: "STATUS.md has no ### Do not list — briefing/dashboard firewall renders empty",
    });
  }

  // Next-actions list may exist; empty is fine.
  void parseListItems(extractSection(statusMd, "### Next actions") ?? "");

  return findings;
}

/**
 * Validate readiness layer: never "ready" when evidence is partial/stale/dirty/etc.
 * @param {any} health
 * @returns {HealthFinding[]}
 */
export function validateReadinessSemantics(health) {
  /** @type {HealthFinding[]} */
  const findings = [];
  const ready = health?.readiness?.releaseReady === true;
  const cls = health?.observed?.battery?.latestTargeted?.classification?.class
    ?? health?.battery?.latestAssessment?.class;
  const dirty = (health?.git?.dirtyFiles ?? 0) > 0 || (health?.observed?.git?.dirtyFiles ?? 0) > 0;
  const bad = new Set(["partial", "stale", "inconclusive", "head-mismatch", "red", "unknown"]);
  if (ready && (bad.has(cls) || dirty)) {
    findings.push({
      code: "READINESS_FALSE_GREEN",
      severity: "error",
      message: `readiness.releaseReady=true with battery class=${cls ?? "?"} dirty=${dirty}`,
    });
  }
  return findings;
}

/**
 * Validate the committed cold-start briefing (docs/BRIEFING.md) against STATUS.md.
 * Pass `briefingMd` only when the caller intends the contract (health:check does);
 * omitting it skips the check so pure-STATUS callers stay usable.
 * @param {string} statusMd
 * @param {string} briefingMd
 * @returns {HealthFinding[]}
 */
export function validateBriefingFreshness(statusMd, briefingMd) {
  if (String(briefingMd ?? "").trim() === "") {
    return [{
      code: "BRIEFING_MISSING",
      severity: "error",
      message: "docs/BRIEFING.md missing — run `npm run briefing` (it is the committed cold-start door)",
    }];
  }
  const embedded = extractBriefingDigest(briefingMd);
  const expected = briefingSourceDigest(statusMd);
  if (embedded !== expected) {
    return [{
      code: "BRIEFING_STALE",
      severity: "error",
      message: `docs/BRIEFING.md digest ${embedded ?? "(none)"} lags STATUS.md (${expected}) — run \`npm run briefing\``,
    }];
  }
  return [];
}

/**
 * Validate the taxonomy's coverage of the real tree (the Living Architecture liveness mechanism).
 * An unmapped file is a hard error — it is the whole point: a new file forces a taxonomy update.
 * @param {{ unmapped?: string[], missing?: string[], duplicates?: Array<{ file: string, systems: string[] }> }} expansion
 *   the result of archModel.expandSystems.
 * @returns {HealthFinding[]}
 */
export function validateArchitectureMap(expansion) {
  /** @type {HealthFinding[]} */
  const findings = [];
  const unmapped = expansion?.unmapped ?? [];
  const missing = expansion?.missing ?? [];
  const duplicates = expansion?.duplicates ?? [];
  if (unmapped.length > 0) {
    findings.push({
      code: "ARCH_UNMAPPED_FILE",
      severity: "error",
      message: `${unmapped.length} file(s) under src/ party/ shared/ claimed by no system — add to tools/lib/archMap.mjs: ${unmapped.join(", ")}`,
      detail: unmapped,
    });
  }
  if (missing.length > 0) {
    findings.push({
      code: "ARCH_MISSING_FILE",
      severity: "error",
      message: `tools/lib/archMap.mjs references ${missing.length} path(s) that no longer exist — remove or fix: ${missing.join(", ")}`,
      detail: missing,
    });
  }
  if (duplicates.length > 0) {
    findings.push({
      code: "ARCH_DUPLICATE_CLAIM",
      severity: "error",
      message: `${duplicates.length} file(s) claimed by more than one system in tools/lib/archMap.mjs: ${duplicates.map((d) => `${d.file} (${d.systems.join(" + ")})`).join(", ")}`,
      detail: duplicates,
    });
  }
  return findings;
}

/**
 * Validate the committed architecture manifest (docs/ARCHITECTURE.json) against the live digest.
 * Same contract as validateBriefingFreshness. Pass `archJsonText` only when the caller intends
 * the check (health:check does); omitting archInput skips it entirely.
 * @param {string} archJsonText  the committed docs/ARCHITECTURE.json ("" if absent)
 * @param {string} liveDigest    archRender.archSourceDigest of a freshly built manifest body
 * @returns {HealthFinding[]}
 */
export function validateArchitectureFreshness(archJsonText, liveDigest) {
  if (String(archJsonText ?? "").trim() === "") {
    return [{
      code: "ARCH_MISSING",
      severity: "error",
      message: "docs/ARCHITECTURE.json missing — run `npm run arch` (the committed agent-facing architecture map)",
    }];
  }
  const embedded = extractArchDigest(archJsonText);
  if (embedded !== liveDigest) {
    return [{
      code: "ARCH_STALE",
      severity: "error",
      message: `docs/ARCHITECTURE.json digest ${embedded ?? "(none)"} lags the tree/docs (${liveDigest}) — run \`npm run arch\``,
    }];
  }
  return [];
}

/**
 * Run all validators. Exit-worthy errors are severity === "error".
 * @param {{
 *   statusMd: string,
 *   briefingMd?: string,
 *   health?: any,
 *   archInput?: { expansion?: any, archJsonText?: string, liveDigest?: string },
 * }} input
 */
export function evaluateProjectHealth(input) {
  const arch = input.archInput;
  const findings = [
    ...validateStatusSemantics(input.statusMd),
    ...(input.briefingMd !== undefined ? validateBriefingFreshness(input.statusMd, input.briefingMd) : []),
    ...(input.health ? validateReadinessSemantics(input.health) : []),
    ...(arch?.expansion ? validateArchitectureMap(arch.expansion) : []),
    ...(arch?.liveDigest !== undefined ? validateArchitectureFreshness(arch.archJsonText ?? "", arch.liveDigest) : []),
  ];
  return {
    ok: findings.every((f) => f.severity !== "error"),
    findings,
  };
}
