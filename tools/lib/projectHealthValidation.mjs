/**
 * projectHealthValidation.mjs — pure strict evaluator for Command Center drift.
 *
 * Collection stays tolerant (missing files → null). This module turns a health model
 * (or raw STATUS markdown) into stable finding codes so `npm run health:check` fails
 * deterministically when docs/tools drift.
 */

import { issueState, queueRowState, parseStatusReleasePhases, parseStatusCurrentFocus, parseStatusPlaytestQueue, parseStatusOpenIssues, parseStatusDoNots, extractSection, parseListItems, flattenBacklogRows, extractWorkId, WORK_ID_RE } from "./projectHealth.mjs";
import { extractBriefingDigest, briefingSourceDigest } from "./briefing.mjs";
import { extractArchDigest } from "./archRender.mjs";
import { computeBacklogGlance, renderBacklogGlanceBlock, extractBacklogGlanceBlock } from "./backlogGlance.mjs";
import { buildPlaytestQueue } from "./playtestQueue.mjs";

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
 * IDs on the "## Closed / do-not-reopen reference" list, scanned by regex rather than
 * a comma-split — one real entry there is bold prose with internal commas spanning
 * two lines, so splitting on "," would shred it into bogus fragments.
 * @param {string} backlogMd
 * @returns {Set<string>}
 */
function closedRefIds(backlogMd) {
  const section = extractSection(backlogMd, "## Closed / do-not-reopen reference") ?? "";
  const re = new RegExp(WORK_ID_RE.source, "g");
  return new Set([...section.matchAll(re)].map((m) => m[1]));
}

/**
 * IDs the "## Work order" prose marks as closed: either struck (`~~**ID**~~`) or the
 * nearest id within 120 characters BEFORE a `✅`. The 120-char nearest-left window is
 * load-bearing, not arbitrary — attributing every id on a ✅'s line produced a real
 * false positive while this was designed (PERF-9CELL-1, named later on a line whose
 * ✅ belonged to HARNESS-NULL-1); nearest-left fixed it. Prose, not a table, hence
 * this feeds a warn-severity finding, not an error — see BACKLOG_WORKORDER_CLOSED_HAS_ROW.
 * @param {string} backlogMd
 * @returns {Set<string>}
 */
function workOrderClosedIds(backlogMd) {
  const section = extractSection(backlogMd, "## Work order") ?? "";
  const ids = new Set();
  for (const m of section.matchAll(/~~\*\*([A-Z][A-Z0-9-]+)\*\*~~/g)) ids.add(m[1]);
  const idRe = new RegExp(WORK_ID_RE.source, "g");
  for (const m of section.matchAll(/✅/g)) {
    const head = section.slice(Math.max(0, m.index - 120), m.index);
    const near = [...head.matchAll(idRe)];
    if (near.length) ids.add(near.at(-1)[1]);
  }
  return ids;
}

/**
 * Mechanical hygiene checks on docs/planning/BACKLOG.md — the 2026-08-06 audit found
 * five classes of drift in this file (glance-box counts 87 vs 92 real rows; four
 * closed cards left as stub rows instead of deleted; a duplicate-subject card filed
 * against CSS an existing card already owned; a Work-order block claiming "fully
 * drained" with two open cards under it; a row claiming "awaiting playtest" after the
 * Work order had already recorded it closed). This validator makes the mechanical
 * subset of that — arithmetic, stub rows, duplicate/reopened ids, glance freshness —
 * impossible to miss. Subject-duplicates and "is this block really drained" claims
 * are not machine-checkable and stay judgment, held by BACKLOG.md's own house rules.
 * @param {string} backlogMd
 * @returns {HealthFinding[]}
 */
export function validateBacklogHygiene(backlogMd) {
  /** @type {HealthFinding[]} */
  const findings = [];
  const rows = flattenBacklogRows(backlogMd);

  for (const r of rows) {
    if (/✅/.test(r.pri) || /\bCLOSED\b/.test(r.pri) || /✅/.test(r.item) || /\bCLOSED\b/.test(r.item)) {
      findings.push({
        code: "BACKLOG_CLOSED_STUB_ROW",
        severity: "error",
        message: `${r.section} row "${r.id ?? r.item.slice(0, 60)}" reads closed but is still a row — delete it and move the writeup to completed-work.md`,
      });
    }
  }

  const byId = new Map();
  for (const r of rows) {
    if (!r.id) continue;
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  for (const [id, group] of byId) {
    if (group.length > 1) {
      findings.push({
        code: "BACKLOG_DUPLICATE_ROW_ID",
        severity: "error",
        message: `${id} heads ${group.length} rows (${group.map((r) => r.section).join(", ")}) — one card = one row`,
      });
    }
  }

  const closed = closedRefIds(backlogMd);
  for (const id of byId.keys()) {
    if (closed.has(id)) {
      findings.push({
        code: "BACKLOG_CLOSED_ID_HAS_ROW",
        severity: "error",
        message: `${id} is on the closed do-not-reopen list and is also an open row — new evidence needed to re-file it, or the list entry is stale`,
      });
    }
  }

  const closedSection = extractSection(backlogMd, "## Closed / do-not-reopen reference") ?? "";
  if (/…\s*$/.test(closedSection.trim()) || /\.\.\.\s*$/.test(closedSection.trim())) {
    findings.push({
      code: "BACKLOG_CLOSED_LIST_TRUNCATED",
      severity: "error",
      message: "the closed do-not-reopen list still ends in an ellipsis — finish it so BACKLOG_CLOSED_ID_HAS_ROW isn't checking against a known-incomplete list",
    });
  }

  const glance = computeBacklogGlance(backlogMd);
  if (!glance.ok) {
    findings.push({ code: "BACKLOG_GLANCE_UNPARSED", severity: "error", message: glance.reason });
  } else {
    const current = extractBacklogGlanceBlock(backlogMd);
    if (current === null) {
      findings.push({
        code: "BACKLOG_GLANCE_UNPARSED",
        severity: "error",
        message: "docs/planning/BACKLOG.md is missing the GENERATED counts markers — run `npm run backlog` after inserting them once by hand",
      });
    } else {
      const expected = renderBacklogGlanceBlock(glance);
      if (current !== expected) {
        findings.push({
          code: "BACKLOG_GLANCE_STALE",
          severity: "error",
          message: "docs/planning/BACKLOG.md's glance box lags the real rows — run `npm run backlog`",
        });
      }
    }
  }

  const woClosedIds = workOrderClosedIds(backlogMd);
  for (const id of byId.keys()) {
    if (woClosedIds.has(id)) {
      findings.push({
        code: "BACKLOG_WORKORDER_CLOSED_HAS_ROW",
        severity: "warn",
        message: `${id} reads closed in the Work order but is still an open row`,
      });
    }
  }

  return findings;
}

const STATUS_PLAYTEST_OWED_RE =
  /playtest\s+owed|owed:\s*wyatt\s+playtest|needs?\s+wyatt(?:'s)?\s+(?:multiplayer\s+)?playtest/i;

/**
 * True when `id` already has a seeded console card, or a child `ID-PT-N` /
 * `PARENT-PT-N` (STORE-1-PT-1 keeps the trailing number; CONN-TRACK-LEAK-PT-1 drops it).
 * @param {string} id
 * @param {Set<string>} queueIds
 */
export function playtestCoveredBy(id, queueIds) {
  if (!id || !queueIds) return false;
  if (queueIds.has(id)) return true;
  for (const q of queueIds) {
    if (q.startsWith(`${id}-PT-`)) return true;
  }
  const stripped = id.replace(/-\d+$/, "");
  if (stripped !== id) {
    for (const q of queueIds) {
      if (q.startsWith(`${stripped}-PT-`)) return true;
    }
  }
  return false;
}

/**
 * Fail closed when a playtest is owed but the generated console cannot run it.
 *
 * PLAYTEST_STEPLESS — an owed card seeded with no numbered `<br>N.` steps (PERF-9CELL-1).
 * PLAYTEST_PARENT_UNSEEDED — a ✅ CLOSED STATUS row that still says playtest is owed,
 * but no BACKLOG `Owed: Wyatt playtest` card covers it (CARGO-BAY-INSTANCE-1).
 *
 * STATUS "Playtest owed:" prose is not a seed. The console only reads the exact owed
 * phrase plus numbered steps.
 *
 * @param {string} statusMd
 * @param {string} backlogMd
 * @returns {HealthFinding[]}
 */
export function validatePlaytestSeed(statusMd, backlogMd) {
  /** @type {HealthFinding[]} */
  const findings = [];
  const { cards } = buildPlaytestQueue({ statusMd: statusMd || "", backlogMd: backlogMd || "" });
  const owed = (cards || []).filter((c) => c && c.source !== "system");
  const queueIds = new Set(owed.map((c) => c.id));

  for (const c of owed) {
    if (!c.steps || c.steps.length === 0) {
      findings.push({
        code: "PLAYTEST_STEPLESS",
        severity: "error",
        message: `${c.id} is owed in the playtest console but has no numbered steps — add <br>1. / <br>2. to the BACKLOG ## Playtest owed Notes`,
      });
    }
  }

  const namedRe = new RegExp(WORK_ID_RE.source, "g");
  for (const q of parseStatusPlaytestQueue(statusMd || "")) {
    if (q.state !== "done") continue;
    const blob = `${q.what || ""} ${q.status || ""}`;
    if (!STATUS_PLAYTEST_OWED_RE.test(blob)) continue;
    if (/\bwyatt\s+playtest\s+PASS\b/i.test(blob)) continue;

    const named = [...String(q.status || "").matchAll(namedRe)].map((m) => m[1]);
    const parent = extractWorkId(q.id) || extractWorkId(q.what);
    const required = named.length ? named : parent ? [parent] : [];
    for (const id of required) {
      if (playtestCoveredBy(id, queueIds)) continue;
      findings.push({
        code: "PLAYTEST_PARENT_UNSEEDED",
        severity: "error",
        message: `${parent || id} says playtest is owed but ${id} is not a seeded console card — add a BACKLOG ## Playtest owed row: Owed: Wyatt playtest — ${id} — one-line check + <br>1. steps`,
      });
    }
  }

  return findings;
}

/**
 * Validate that Claude Code's local skills mirror matches the committed one.
 *
 * Skills are committed to `.agents/skills/` (the cross-runtime alias every non-Claude tool
 * reads) while Claude Code reads `.claude/skills/`, which .gitignore excludes. A fresh clone
 * therefore has zero Claude-side skills and gives no signal — the skill just never fires.
 * This is the signal. Same contract as the other opt-in gates: the caller passes the plan
 * only when it intends the check (health:check does, except in CI where the mirror can never
 * exist).
 * @param {{ name: string, status: "created" | "updated" | "unchanged" }[]} plan
 *   the result of skills-sync.planSync — "created" means absent, "updated" means stale.
 * @returns {HealthFinding[]}
 */
export function validateSkillsMirror(plan) {
  const drifted = (plan ?? []).filter((s) => s.status !== "unchanged");
  if (!drifted.length) return [];
  const detail = drifted.map((s) => `${s.name} (${s.status === "created" ? "missing" : "stale"})`);
  return [{
    code: "SKILLS_UNSYNCED",
    severity: "error",
    message: `${drifted.length} skill(s) not mirrored into .claude/skills/ — run \`npm run skills:sync\`: ${detail.join(", ")}`,
    detail: drifted,
  }];
}

/**
 * Run all validators. Exit-worthy errors are severity === "error".
 * @param {{
 *   statusMd: string,
 *   briefingMd?: string,
 *   health?: any,
 *   archInput?: { expansion?: any, archJsonText?: string, liveDigest?: string },
 *   skillsPlan?: { name: string, status: "created" | "updated" | "unchanged" }[],
 *   backlogMd?: string,
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
    ...(input.skillsPlan !== undefined ? validateSkillsMirror(input.skillsPlan) : []),
    ...(input.backlogMd !== undefined ? validateBacklogHygiene(input.backlogMd) : []),
    ...(input.backlogMd !== undefined ? validatePlaytestSeed(input.statusMd, input.backlogMd) : []),
  ];
  return {
    ok: findings.every((f) => f.severity !== "error"),
    findings,
  };
}
