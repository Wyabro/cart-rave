/**
 * briefing.mjs — render docs/BRIEFING.md, the committed cold-start door.
 *
 * Every AI tool (Cursor, Antigravity, Grok, Claude) reads plain files; the Command
 * Center HTML is generated and gitignored, so it can't be the first thing a cold
 * agent sees. BRIEFING.md is the same pre-digested "what now?" view, derived ONLY
 * from docs/STATUS.md declarations (never observed evidence — that stays in
 * health.json), rendered deterministically and committed.
 *
 * Freshness contract: the body embeds a digest of the STATUS-derived content.
 * `npm run health:check` recomputes that digest from the live STATUS.md and fails
 * with BRIEFING_STALE on mismatch — so a hand-edit or a skipped regeneration is a
 * red gate, not silent drift. The git header (branch/HEAD/date) is informational
 * and excluded from the digest so ordinary commits don't churn the file.
 */

import { createHash } from "node:crypto";
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
} from "./projectHealth.mjs";

const DIGEST_LINE = /^> Source digest: `([0-9a-f]{8})`/m;

/** @param {string} s */
function sha8(s) {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 8);
}

/** Queue rows that are waiting on a human playtest, not on agent work. @param {string} status */
function blockedOnWyatt(status) {
  return /needs?\s+wyatt|wyatt'?s?\s+(playtest|paired|multiplayer)|playtest\s+requested/i.test(String(status ?? ""));
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
  return lines.join("\n");
}

/** Digest of the STATUS-derived briefing content. @param {string} statusMd */
export function briefingSourceDigest(statusMd) {
  return sha8(renderBriefingBody(statusMd));
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
  const body = renderBriefingBody(statusMd);
  return [
    `# Cart Clash — Agent Briefing`,
    ``,
    `> **GENERATED — do not hand-edit.** Regenerate: \`npm run briefing\` (also runs inside \`npm run qa\`).`,
    `> Generated${git.date ? ` ${git.date}` : ""}${git.head ? ` at commit \`${git.head}\`` : ""}${git.branch ? ` on \`${git.branch}\`` : ""}. If docs/STATUS.md has changed since, \`npm run health:check\` fails until this is regenerated.`,
    `> Source digest: \`${sha8(body)}\``,
    ``,
    `**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → \`npm run dashboard\` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.`,
    ``,
    body,
    ``,
    `## Gates`,
    ``,
    `\`npm run qa\` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling \`cart-clash\` and verifying HEAD.`,
    ``,
  ].join("\n");
}
