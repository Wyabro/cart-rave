/**
 * briefing.mjs — render docs/BRIEFING.md, the committed cold-start door.
 *
 * Every AI tool (Cursor, Antigravity, Grok, Claude) reads plain files; the Command
 * Center HTML is generated and gitignored, so it can't be the first thing a cold
 * agent sees. BRIEFING.md is the same pre-digested "what now?" view, derived ONLY
 * from docs/STATUS.md declarations (never observed evidence — that stays in
 * health.json), rendered deterministically and committed.
 *
 * Freshness contract: the embedded source digest covers STATUS-derived body **and**
 * the static template (title, boilerplate, read-order, before-you-touch). BRIEF-DIGEST-1:
 * a template-only edit must red-gate until regeneration. Git date/head/branch stay
 * outside the digest so ordinary commits do not churn the file. The Gates section
 * lives INSIDE the digested body on purpose: editing package.json's `check` chain
 * red-gates until the briefing is regenerated.
 *
 * Contract: extractBriefingDigest(renderBriefingMd(status)) === briefingSourceDigest(status).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseStatusCurrentFocus,
  parseStatusReleasePhases,
  parseStatusPlaytestQueue,
  parseStatusDoNots,
  parseStatusOpenIssues,
  parseListItems,
  extractSection,
  issueState,
  deriveNextAction,
  compressIssueStatus,
  blockedOnWyatt,
} from "./projectHealth.mjs";

const DIGEST_LINE = /^> Source digest: `([0-9a-f]{8})`/m;

/** @param {string} s */
function sha8(s) {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 8);
}

// ── Static template (shared by render + digest fingerprint — do not duplicate) ──

export const BRIEFING_TITLE = `# Cart Clash — Agent Briefing`;

export const BRIEFING_GENERATED_BOILERPLATE =
  `> **GENERATED — do not hand-edit.** Regenerate: \`npm run briefing\` (the pre-commit hook does this on every commit; \`npm run qa\` only *checks* freshness, read-only).`;

/** Fixed suffix of the Generated line (git date/head/branch are injected before this). */
export const BRIEFING_GENERATED_SUFFIX =
  `. If docs/STATUS.md's digested sections have changed since, \`npm run briefing:check\` (inside \`npm run qa\`) fails until this is regenerated.`;

export const BRIEFING_READ_ORDER =
  `**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → \`npm run dashboard\` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.`;

export const BRIEFING_BEFORE_TOUCH =
  `**Before you touch code:** (1) Plan → Wyatt ack → apply, acked **per wave** — one plan covering every lever plus its playtest checklist, one ack, then one commit per lever. BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) **Look up** the files you are touching in [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — \`Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12\`. Never read it whole; it is ~30,000 tokens. (3) During a game card, do not commit to \`tools/\` · \`.claude/hooks/\` · \`.agents/\` — file it to BACKLOG instead.`;

/**
 * Digest input for static header/template lines (no git metadata, no Source digest line).
 * Shared constants only — editing any constant changes the fingerprint.
 * @returns {string}
 */
export function briefingTemplateFingerprint() {
  return [
    BRIEFING_TITLE,
    BRIEFING_GENERATED_BOILERPLATE,
    BRIEFING_GENERATED_SUFFIX,
    BRIEFING_READ_ORDER,
    BRIEFING_BEFORE_TOUCH,
  ].join("\n");
}

// Last-resort gate chain if package.json is unreadable — keep it plausible, not precise.
const GATE_CHAIN_FALLBACK = ["status:size", "typecheck", "test", "knip", "briefing:check", "arch:check", "health:check"];

/**
 * The ordered `npm run check` step names, derived from package.json — the ONE
 * hand-written copy of the gate chain. Everything else (this briefing, AGENTS.md,
 * docs) points here instead of restating it.
 * @param {string} [pkgJsonPath] override for tests
 * @returns {string[]}
 */
export function readGateChain(pkgJsonPath) {
  try {
    const p = pkgJsonPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    const steps = String(pkg.scripts.check)
      .split("&&")
      .map((s) => s.trim().replace(/^npm run\s+/, ""))
      .filter(Boolean);
    return steps.length > 0 ? steps : GATE_CHAIN_FALLBACK;
  } catch {
    return GATE_CHAIN_FALLBACK;
  }
}

/**
 * Render the STATUS-derived briefing body (no git header — this is what gets digested).
 * @param {string} statusMd
 * @returns {string}
 */
export function renderBriefingBody(statusMd) {
  const phases = parseStatusReleasePhases(statusMd);
  const current = phases.find((p) => p.state === "current");
  const mission = parseStatusCurrentFocus(statusMd);
  const queue = parseStatusPlaytestQueue(statusMd);
  const nextActions = parseListItems(extractSection(statusMd, "### Next actions") ?? "");
  const doNots = parseStatusDoNots(statusMd);
  const openIssues = parseStatusOpenIssues(statusMd).filter((i) => issueState(i.status) === "open");
  // * Declared-only next action: battery evidence is deliberately absent here (it
  // * lives in health.json); the briefing must not change when a report lands.
  const now = deriveNextAction({ issues: { playtestQueue: queue, nextActions } });

  const active = queue.filter((q) => q.state === "active");
  // * "✅ fixed, needs Wyatt playtest" parses as done — for a cold agent it is NOT done,
  // * it's human-blocked, so the Wyatt bucket wins over the done state.
  const waitingOnWyatt = queue.filter((q) => q.state !== "locked" && blockedOnWyatt(q.status));
  const agentActionable = queue.filter(
    (q) => q.state !== "done" && q.state !== "locked" && q.state !== "active" && !blockedOnWyatt(q.status),
  );

  const row = (q) => `- **${q.id || "·"}** ${q.what}${q.status ? ` — ${compressIssueStatus(q.status, 110)}` : ""}`;

  const lines = [
    `## Phase (declared — Wyatt moves the marker)`,
    ``,
    `▶ ${current?.name ?? "UNPARSED — check STATUS.md ### Release phases"}`,
    ``,
    `## Mission`,
    ``,
    `${mission?.headline ?? "UNPARSED — check STATUS.md ## Current focus"}${mission?.detail ? ` — ${mission.detail}` : ""}`,
    ``,
    `## ${now.tag}`,
    ``,
    `${now.text}${now.expect ? `\nPass looks like: ${now.expect}` : ""}`,
  ];
  if (now.kind === "queue" || now.kind === "plan") {
    lines.push(``, `Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.`);
  }
  if (active.length === 0 && agentActionable.length > 0) {
    lines.push(``, `Self-directed queue (one at a time, within the declared phase):`, ...agentActionable.map(row));
  }
  if (waitingOnWyatt.length > 0) {
    lines.push(``, `## Waiting on Wyatt (not agent work)`, ``, ...waitingOnWyatt.map(row));
  }
  if (openIssues.length > 0) {
    lines.push(``, `## Open blockers`, ``, ...openIssues.map((i) => `- **${i.id}** ${i.issue}`));
  }
  lines.push(``, `## Do not`, ``, ...(doNots.length ? doNots.map((d) => `- ${d}`) : ["- (none listed — see AGENTS.md)"]));
  lines.push(
    ``,
    `## Gates`,
    ``,
    `\`npm run qa\` = ${readGateChain().join(" → ")} (the chain is defined by \`check\` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, \`npm run dashboard\`, or \`npm run refresh\`. Report results by number. CI also runs a production build. Never claim "done" without pushing and \`npm run verify:head\`.`,
  );
  return lines.join("\n");
}

/**
 * Digest of template fingerprint + STATUS-derived body.
 * Must match the value embedded as `Source digest` in {@link renderBriefingMd}.
 * @param {string} statusMd
 */
export function briefingSourceDigest(statusMd) {
  return sha8(briefingTemplateFingerprint() + "\n" + renderBriefingBody(statusMd));
}

/** Pull the embedded digest out of a BRIEFING.md. @param {string} briefingMd @returns {string | null} */
export function extractBriefingDigest(briefingMd) {
  return String(briefingMd ?? "").match(DIGEST_LINE)?.[1] ?? null;
}

/**
 * Full BRIEFING.md text: generated header + read order + STATUS-derived body.
 * @param {string} statusMd
 * @param {{ branch?: string | null, head?: string | null, date?: string | null }} [git]
 * @returns {string}
 */
export function renderBriefingMd(statusMd, git = {}) {
  const digest = briefingSourceDigest(statusMd);
  const body = renderBriefingBody(statusMd);
  return [
    BRIEFING_TITLE,
    ``,
    BRIEFING_GENERATED_BOILERPLATE,
    `> Generated${git.date ? ` ${git.date}` : ""}${git.head ? ` at commit \`${git.head}\`` : ""}${git.branch ? ` on \`${git.branch}\`` : ""}${BRIEFING_GENERATED_SUFFIX}`,
    `> Source digest: \`${digest}\``,
    ``,
    BRIEFING_READ_ORDER,
    ``,
    BRIEFING_BEFORE_TOUCH,
    ``,
    body,
    ``,
  ].join("\n");
}
