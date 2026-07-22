/**
 * archRender.mjs — assemble docs/ARCHITECTURE.json, the committed agent-facing manifest.
 *
 * The manifest fuses three sources per the plan's field→source map:
 *   - the curated seed (archMap.mjs): identity, taxonomy, important files, conventions,
 *     safe-modification boundaries, fragile systems, past mistakes, testing/build blocks;
 *   - the live tree (archModel.expandSystems): each system's sorted `files` + `file_count`;
 *   - the live docs (projectHealth parsers): mission/phase, pitfalls, workstreams, backlog +
 *     SHIP-1 tiers, invariants/off-limits/do-nots, settled decisions, verified-healthy.
 *
 * Freshness contract (mirrors briefing.mjs): the manifest embeds `source_digest`, an sha8 over
 * the manifest MINUS the informational `generated` block and the digest field itself. CRITICAL:
 * per-file line counts and git churn are NOT part of the manifest at all — they would churn every
 * commit and break determinism; they belong only to the HTML / health.json layer. `files[]` and
 * `file_count` ARE in the manifest and IN the digest, so structural drift trips the gate.
 *
 * `npm run health:check` recomputes the digest from the live sources and fails with ARCH_STALE on
 * mismatch — a hand-edit or a skipped regeneration is a red gate, not silent drift.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SYSTEMS,
  IMPORTANT_FILES,
  FRAGILE_SYSTEMS,
  PAST_AGENT_MISTAKES,
  CONVENTIONS,
  SAFE_MODIFICATION,
  PROJECT_IDENTITY,
  TESTING,
  BUILD_DEPLOY,
  AGENT_READ_ORDER,
  REQUIRED_VALIDATION,
} from "./archMap.mjs";
import { expandSystems, symbolsToSystems } from "./archModel.mjs";
import {
  extractSection,
  parseListItems,
  extractBacktickSymbols,
  parseStatusCurrentFocus,
  parseStatusReleasePhases,
  parseStatusPlaytestQueue,
  parseStatusOpenIssues,
  parseStatusDoNots,
  parseStatusGotchas,
  parseStatusDecisionIndex,
  parseAgentsSection,
  parseBacklogSections,
  parseBacklogNotTechDebt,
  parseShip1Tiers,
  parseProjectStateHealthy,
  extractShip1Tag,
} from "./projectHealth.mjs";

export const ARCH_SCHEMA_VERSION = 1;
const DIGEST_LINE = /"source_digest"\s*:\s*"([0-9a-f]{8})"/;

/** @param {string} s */
function sha8(s) {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 8);
}

/**
 * The digest over a manifest: strip the informational `generated` block and the `source_digest`
 * field, then sha8 the deterministic JSON of what remains. Line counts / churn are never in the
 * manifest, so they cannot leak into the digest.
 * @param {Record<string, any>} manifest
 * @returns {string}
 */
export function archSourceDigest(manifest) {
  const { generated: _g, source_digest: _d, ...rest } = manifest ?? {};
  return sha8(JSON.stringify(rest));
}

/** Pull the embedded digest out of an ARCHITECTURE.json text. @param {string} archJsonText @returns {string | null} */
export function extractArchDigest(archJsonText) {
  return String(archJsonText ?? "").match(DIGEST_LINE)?.[1] ?? null;
}

/**
 * Read a doc, tolerating absence (returns "").
 * @param {string} cwd @param {string} rel
 */
async function readDoc(cwd, rel) {
  try {
    return await readFile(resolve(cwd, rel), "utf8");
  } catch {
    return "";
  }
}

/**
 * Build the manifest body (everything except the digest-exempt `generated` block and the
 * `source_digest` field). Pure w.r.t. its inputs so the digest is deterministic.
 * @param {{
 *   expansion: Awaited<ReturnType<typeof expandSystems>>,
 *   statusMd: string, agentsMd: string, backlogMd: string, ship1Md: string, projectStateMd: string,
 * }} sources
 * @returns {Record<string, any>}
 */
export function assembleManifestBody(sources) {
  const { expansion, statusMd, agentsMd, backlogMd, ship1Md, projectStateMd } = sources;
  const mission = parseStatusCurrentFocus(statusMd);
  const phases = parseStatusReleasePhases(statusMd);
  const currentPhase = phases.find((p) => p.state === "current") ?? null;

  const systems = SYSTEMS.map((s) => {
    const files = expansion.bySystem.get(s.id) ?? [];
    return {
      id: s.id,
      name: s.name,
      responsibility: s.responsibility,
      entry: s.entry,
      files,
      file_count: files.length,
      edges: s.edges,
      notes: s.notes,
    };
  });

  // * touches_systems: resolve the file-shaped tokens a queue card names (backticked or bare
  // * *.js/.ts/.css) to their owning systems — the what-to-do → what-not-to-break hop. Derived
  // * only from the card text + the taxonomy (both already digest inputs), so it stays deterministic.
  const fileTokens = (text) => {
    const bare = String(text ?? "").match(/[A-Za-z0-9_./-]+\.(?:js|ts|css)\b/g) ?? [];
    return [...new Set([...extractBacktickSymbols(text), ...bare])];
  };
  const queue = parseStatusPlaytestQueue(statusMd).map((q) => {
    const touches = symbolsToSystems(fileTokens(`${q.what} ${q.status}`), expansion.bySystem, SYSTEMS);
    return touches.length ? { ...q, touches_systems: touches } : q;
  });

  const backlogSections = parseBacklogSections(backlogMd).map((sec) => ({
    title: sec.title,
    counts: sec.counts,
    rows: sec.rows.map((r) => ({ ...r, ship1: extractShip1Tag(`${r.item ?? ""} ${r.notes ?? ""}`) })),
  }));

  return {
    schema_version: ARCH_SCHEMA_VERSION,
    project: {
      name: PROJECT_IDENTITY.name,
      one_liner: PROJECT_IDENTITY.one_liner,
      production_url: PROJECT_IDENTITY.production_url,
      mission: mission ? `${mission.headline}${mission.detail ? ` — ${mission.detail}` : ""}` : null,
      phase: currentPhase?.name ?? null,
      phases,
    },
    systems,
    important_files: IMPORTANT_FILES,
    conventions: CONVENTIONS,
    safe_modification: SAFE_MODIFICATION,
    pitfalls: parseStatusGotchas(statusMd),
    workstreams: {
      queue,
      next_actions: parseListItems(extractSection(statusMd, "### Next actions") ?? ""),
      open_issues: parseStatusOpenIssues(statusMd),
    },
    backlog: {
      sections: backlogSections,
      ship1_tiers: parseShip1Tiers(ship1Md),
      explicitly_not_tech_debt: parseBacklogNotTechDebt(backlogMd),
    },
    testing: TESTING,
    build_deploy: BUILD_DEPLOY,
    agent_instructions: {
      read_order: AGENT_READ_ORDER,
      execution_loop: parseAgentsSection(agentsMd, "## HOW WORK IS EXECUTED"),
      routing: parseAgentsSection(agentsMd, "## MODEL / TOOL ROUTING"),
    },
    do_not_break: {
      invariants: parseAgentsSection(agentsMd, "## ARCHITECTURE INVARIANTS"),
      off_limits: parseAgentsSection(agentsMd, "## WHAT'S OFF-LIMITS"),
      do_nots: parseStatusDoNots(statusMd),
      fragile_systems: FRAGILE_SYSTEMS,
      past_agent_mistakes: PAST_AGENT_MISTAKES,
      required_validation: REQUIRED_VALIDATION,
      settled_decisions: parseStatusDecisionIndex(statusMd),
      verified_healthy: parseProjectStateHealthy(projectStateMd),
    },
  };
}

/**
 * Assemble the full committed manifest object: body + digest-exempt `generated` header +
 * embedded `source_digest`.
 * @param {string} cwd
 * @param {{ generatedBy?: string, at?: string, commit?: string | null }} [meta]
 * @returns {Promise<Record<string, any>>}
 */
export async function buildArchManifest(cwd, meta = {}) {
  const [statusMd, agentsMd, backlogMd, ship1Md, projectStateMd] = await Promise.all([
    readDoc(cwd, "docs/STATUS.md"),
    readDoc(cwd, "AGENTS.md"),
    readDoc(cwd, "docs/planning/BACKLOG.md"),
    readDoc(cwd, "docs/planning/SHIP-1.md"),
    readDoc(cwd, "docs/planning/project-state.md"),
  ]);
  const expansion = await expandSystems(cwd, SYSTEMS);
  const body = assembleManifestBody({ expansion, statusMd, agentsMd, backlogMd, ship1Md, projectStateMd });
  const source_digest = archSourceDigest(body);
  return {
    schema_version: body.schema_version,
    generated: {
      by: meta.generatedBy ?? "tools/architecture.mjs",
      at: meta.at ?? new Date().toISOString(),
      commit: meta.commit ?? null,
    },
    source_digest,
    ...body,
  };
}
