/**
 * projectHealth.mjs — collect the project-health model the dashboard renders.
 *
 * One principle: the dashboard is GENERATED from artifacts the project already produces —
 * git, battery reports + per-check tallies + capture bundles (.diag-captures/),
 * analytics-summary.json (from npm run analytics:pull), perf profiles (shots/), and the
 * existing markdown sources of truth (docs/STATUS.md open issues / next actions,
 * docs/planning/BACKLOG.md). Nothing here is a new database to hand-maintain; the
 * markdown stays canonical and this module just reads it.
 *
 * Every collector degrades independently — a missing directory, unparseable table, or
 * absent git remote turns into a `null`/`error` field, never a thrown run.
 *
 * The markdown parsers are exported pure functions (unit-tested in tests/projectHealth.test.js).
 */

import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { classifyBatteryEvidence, REQUIRED_CORE_STEPS } from "./batteryPlan.mjs";

// ---------------------------------------------------------------------------
// Pure markdown helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Extract the body of a markdown section: everything after the first heading line that
 * starts with `headingPrefix`, up to the next heading of the same or higher level.
 *
 * @param {string} md
 * @param {string} headingPrefix e.g. "## Open issues" (matches "## Open issues (top)").
 * @returns {string | null}
 */
export function extractSection(md, headingPrefix) {
  const lines = String(md ?? "").split(/\r?\n/);
  const level = (headingPrefix.match(/^#+/) || ["##"])[0].length;
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(headingPrefix)) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

/**
 * Parse the first markdown pipe-table in `text` into row objects keyed by lowercased,
 * de-punctuated header names. Tolerant: skips the separator row, ignores stray pipes at
 * the edges, returns [] when no table exists.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function parseMarkdownTable(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  /** @type {string[] | null} */
  let headers = null;
  /** @type {Array<Record<string, string>>} */
  const rows = [];
  const splitRow = (line) =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());
  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) {
      if (headers && rows.length > 0) break; // table ended
      continue;
    }
    const cells = splitRow(line);
    if (!headers) {
      headers = cells.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // |---|---| separator
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => {
      row[h || `col${i}`] = cells[i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parse markdown list items (numbered or bulleted, top level only) into plain strings
 * with the marker and bold markup stripped.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseListItems(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = line.match(/^(?:\d+\.|[-*])\s+(.*)$/);
    if (m) out.push(m[1].replace(/\*\*/g, "").trim());
  }
  return out;
}

/**
 * STATUS.md "Open issues" table → normalized issue rows.
 * @param {string} statusMd
 * @returns {Array<{ id: string, issue: string, status: string }>}
 */
export function parseStatusOpenIssues(statusMd) {
  const section = extractSection(statusMd, "## Open issues");
  if (!section) return [];
  return parseMarkdownTable(section)
    .map((r) => ({ id: r.id ?? "", issue: r.issue ?? "", status: r.status ?? "" }))
    .filter((r) => r.id);
}

/**
 * Attention state of a queue row, derived from its status cell. Drives how much
 * visual weight the Command Center gives it: exactly one row should be "active";
 * "done" rows collapse; "locked" rows are explicit do-not-touch; the rest wait.
 * @param {string} status
 * @returns {"active" | "done" | "locked" | "waiting"}
 */
export function queueRowState(status) {
  const s = String(status ?? "");
  if (s.includes("▶")) return "active";
  if (/\blocked\b|\bparked\b|🚫|🧊/iu.test(s)) return "locked";
  if (/^\s*✅/u.test(s)) return "done";
  return "waiting";
}

/**
 * True when a STATUS/queue/notes cell is waiting on a human playtest (not agent work).
 * Used by BRIEFING "Waiting on Wyatt" and the generated playtest console seed.
 * Explicit contract: agents write `Owed: Wyatt playtest` (or "needs Wyatt's playtest")
 * when a change requires a human. Closed PASS/CLOSED rows with no new "owed/needs" are false.
 * @param {string} status
 */
export function blockedOnWyatt(status) {
  const s = String(status ?? "");
  if (!s) return false;
  // Explicit still-open contract wins over any PASS wording in the same cell.
  if (
    /owed:\s*wyatt\s+playtest|needs?\s+wyatt(?:'s)?\s+(?:multiplayer\s+)?playtest|playtest\s+requested/i.test(
      s,
    )
  ) {
    return true;
  }
  // Closed on playtest — not waiting (covers "PASS (Wyatt playtest …)" and "Wyatt playtest PASS").
  if (/\bwyatt\s+playtest\s+PASS\b/i.test(s)) return false;
  if (/\bPASS\b/i.test(s) && /✅|CLOSED|closed|confirmed by Wyatt/i.test(s)) return false;
  if (/confirmed by Wyatt/i.test(s) && /playtest/i.test(s)) return false;
  return /needs?\s+wyatt|wyatt'?s?\s+(playtest|paired|multiplayer)/i.test(s);
}

/**
 * Shared work-id shape: an ALL-CAPS kebab id like `PRE-PODIUM-1`. No `g` flag — callers
 * that need every match in a blob (not just the first) should build their own global
 * copy via `new RegExp(WORK_ID_RE.source, "g")` rather than mutate this one.
 */
export const WORK_ID_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/;

/**
 * Work-card id from free text (`HUD-FEED-1`, `PRE-PODIUM-1`, …). First ALL-CAPS kebab id wins.
 * @param {string} text
 * @returns {string | null}
 */
export function extractWorkId(text) {
  const m = String(text ?? "").match(WORK_ID_RE);
  return m ? m[1] : null;
}

/**
 * STATUS.md playtest/active queue → structured rows. Current format is the
 * "### Active queue" table (| # | What | Status |); the pre-run-7
 * "### Wyatt playtest queue" numbered list is kept as a fallback so an old
 * STATUS revision still renders (as state "waiting" rows).
 * @param {string} statusMd
 * @returns {Array<{ id: string, what: string, status: string, state: string }>}
 */
export function parseStatusPlaytestQueue(statusMd) {
  const table = extractSection(statusMd, "### Active queue");
  if (table) {
    const rows = parseMarkdownTable(table)
      .map((r) => {
        const cell = (v) => String(v ?? "").replace(/\*\*/g, "").trim();
        const id = cell(r.col0);
        const what = cell(r.what);
        const status = cell(r.status);
        // * The lock marker sometimes lives in the What column ("Match B … | locked / parked | |").
        return { id, what, status, state: queueRowState(`${status} ${what}`) };
      })
      .filter((r) => r.id !== "" || r.what !== "");
    if (rows.length > 0) return rows;
  }
  return parseListItems(extractSection(statusMd, "### Wyatt playtest queue") ?? "").map((text) => ({
    id: "",
    what: text,
    status: "",
    state: "waiting",
  }));
}

/**
 * STATUS.md "## Current focus" first paragraph → the mission banner.
 * "**Run 7 — post friend playtest.** Cold handoff …" → headline + detail.
 * STATUS hard-wraps prose at ~90 chars, so the paragraph is the unit — a single
 * physical line cuts the mission mid-clause.
 * @param {string} statusMd
 * @returns {{ headline: string, detail: string | null } | null}
 */
export function parseStatusCurrentFocus(statusMd) {
  const section = extractSection(statusMd, "## Current focus");
  if (!section) return null;
  const lines = section.split(/\r?\n/).map((l) => l.trim());
  const isProse = (l) => l !== "" && !l.startsWith("#") && !l.startsWith("|");
  const start = lines.findIndex(isProse);
  if (start === -1) return null;
  let end = start;
  while (end + 1 < lines.length && isProse(lines[end + 1])) end += 1;
  const line = lines.slice(start, end + 1).join(" ");
  const clean = line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .trim();
  const m = clean.match(/^(.+?[.!?])\s+(.+)$/);
  const headline = (m ? m[1] : clean).replace(/[.:\s]+$/, "");
  const detail = m ? m[2].replace(/[:\s]+$/, "") : null;
  return { headline, detail: detail || null };
}

/**
 * Compress a STATUS issue-status cell for at-a-glance reading: markdown links →
 * text, bold stripped, whitespace collapsed, truncated at a word boundary.
 * The full cell stays available in health.json — this is a view helper.
 * @param {string} status
 * @param {number} [max]
 * @returns {string}
 */
export function compressIssueStatus(status, max = 170) {
  const clean = String(status ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}…`;
}

/**
 * Bucket a STATUS issue by its leading state emoji so the Command Center can
 * foreground open work and shelve closed/frozen history.
 * @param {string} status
 * @returns {"open" | "partial" | "warn" | "closed" | "parked" | "other"}
 */
export function issueState(status) {
  const s = String(status ?? "").trim();
  if (s.startsWith("❌")) return "open";
  if (s.startsWith("🟡")) return "partial";
  if (s.startsWith("⚠️") || s.startsWith("⚠")) return "warn";
  if (s.startsWith("✅")) return "closed";
  if (/^(🚫|🧊|📋)/u.test(s)) return "parked";
  return "other";
}

/**
 * BACKLOG.md → per-discipline sections with their table rows and priority counts.
 * @param {string} backlogMd
 * @returns {Array<{ title: string, rows: Array<Record<string, string>>, counts: Record<string, number> }>}
 */
export function parseBacklogSections(backlogMd) {
  const md = String(backlogMd ?? "");
  const out = [];
  const headings = [...md.matchAll(/^## +(.+)$/gm)];
  for (const h of headings) {
    const section = extractSection(md, `## ${h[1]}`);
    if (!section) continue;
    const rows = parseMarkdownTable(section);
    if (rows.length === 0) continue;
    /** @type {Record<string, number>} */
    const counts = {};
    for (const r of rows) {
      const pri = (r.pri || r.priority || "?").replace(/[^A-Za-z?]/g, "") || "?";
      counts[pri] = (counts[pri] || 0) + 1;
    }
    out.push({ title: h[1].trim(), rows, counts });
  }
  return out;
}

/**
 * STATUS.md "### Release phases" list → the release-brain strip. Markers:
 * ✅ done · ▶ current · ⬜ todo. Anything else is ignored (prose lines).
 * @param {string} statusMd
 * @returns {Array<{ name: string, state: "done" | "current" | "todo" }>}
 */
export function parseStatusReleasePhases(statusMd) {
  const section = extractSection(statusMd, "### Release phases");
  if (!section) return [];
  const out = [];
  for (const item of parseListItems(section)) {
    const m = item.match(/^(✅|▶|⬜)\s*(.+)$/u);
    if (!m) continue;
    const state = m[1] === "✅" ? "done" : m[1] === "▶" ? "current" : "todo";
    out.push({ name: m[2].trim(), state });
  }
  return out;
}

/**
 * STATUS.md "### Done when" checkbox list → the mission's definition of done.
 * @param {string} statusMd
 * @returns {Array<{ text: string, done: boolean }>}
 */
export function parseStatusDoneWhen(statusMd) {
  const section = extractSection(statusMd, "### Done when");
  if (!section) return [];
  const out = [];
  for (const line of section.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s+(.+)$/);
    if (!m) continue;
    out.push({
      text: m[2].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").trim(),
      done: m[1].toLowerCase() === "x",
    });
  }
  return out;
}

/**
 * STATUS.md "## Last updated" first entry → the session-continuity blurb.
 * Entries open with "2026-07-19 (label — …) — body…".
 * @param {string} statusMd
 * @returns {{ when: string | null, label: string | null, summary: string } | null}
 */
export function parseStatusLastUpdated(statusMd) {
  const section = extractSection(statusMd, "## Last updated");
  if (!section) return null;
  const lines = section.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const para = [];
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim() === "") break;
    para.push(lines[i].trim());
  }
  const text = para.join(" ");
  const head = text.match(/^(\d{4}-\d{2}-\d{2})\s*\(([^)]*)\)\s*[—-]?\s*(.*)$/);
  const when = head ? head[1] : null;
  const label = head ? head[2].replace(/\*\*/g, "").trim() : null;
  const body = (head ? head[3] : text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "");
  return { when, label, summary: compressIssueStatus(body, 240) };
}

/**
 * Backticked tokens across the given texts → deduped "symbols in play" list for
 * the AI digest (files, functions, bundles, flags mentioned by the live docs).
 * @param {...(string | null | undefined)} texts
 * @returns {string[]}
 */
export function extractBacktickSymbols(...texts) {
  const out = [];
  for (const t of texts) {
    for (const m of String(t ?? "").matchAll(/`([^`\n]{2,60})`/g)) {
      const sym = m[1].trim();
      if (sym && !out.includes(sym)) out.push(sym);
    }
  }
  return out.slice(0, 12);
}

/**
 * The ONE next action, derived from the full health model. Priority: a red battery
 * gate beats everything; then the active queue card; then STATUS next-action #1.
 * Captures and handoff titles are deliberately NOT sources — evidence, not todos.
 * @param {any} h partial health model (battery/issues at minimum)
 * @returns {{ tag: string, kind: string, text: string, expect: string | null }}
 */
export function deriveNextAction(h) {
  const stripLinks = (s) => String(s ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // * Prefer exact-HEAD complete assessment when present; fall back to latest targeted.
  const latestResults =
    h.observed?.battery?.latestTargeted?.results ??
    h.battery?.latestTargeted?.results ??
    h.battery?.latest?.results ??
    [];
  const failing = latestResults.filter((r) => r.code !== 0 && r.code !== 3);
  if (failing.length > 0) {
    return {
      tag: "RED GATE",
      kind: "gate",
      text: `Fix the failing battery step${failing.length > 1 ? "s" : ""}: ${failing.map((r) => r.name).join(" + ")} — nothing ships over a red gate`,
      expect: failing[0].note ?? null,
    };
  }
  const active = (h.issues?.playtestQueue ?? h.declared?.queue ?? []).find((q) => q.state === "active");
  if (active) {
    return { tag: "ACTIVE CARD", kind: "queue", text: `${active.id} — ${active.what}`, expect: active.status || null };
  }
  const next = h.issues?.nextActions?.[0] ?? h.declared?.nextActions?.[0];
  if (next) {
    const split = stripLinks(next).split(/\s*Expect:\s*/);
    // * Soft "wait / ask Wyatt" lines are not a fake active card.
    if (!/^\s*(wait|ask|nothing|optional)/i.test(split[0])) {
      return { tag: "ACTIVE CARD", kind: "plan", text: split[0].replace(/[;.\s]+$/, ""), expect: split[1] ?? null };
    }
  }
  return { tag: "NO ACTIVE CARD", kind: "none", text: "Nothing named — wait for Wyatt to pick the next card in docs/STATUS.md", expect: null };
}

/**
 * STATUS.md "### Do not" list → standing prohibitions for the briefing / dashboard
 * firewall. Lives in STATUS (the declared source of truth) since the retirement of
 * docs/planning/handoff-next-window.md, which carried these and went stale.
 * @param {string} statusMd
 * @returns {string[]}
 */
export function parseStatusDoNots(statusMd) {
  return parseListItems(extractSection(statusMd, "### Do not") ?? "").map((item) =>
    item.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim(),
  );
}

/**
 * STATUS.md "## Gotchas (append-only)" bullet list → the pitfalls feed. Markdown links are
 * flattened; bold markup is stripped by parseListItems. Order is preserved (append-only log).
 * @param {string} statusMd
 * @returns {string[]}
 */
export function parseStatusGotchas(statusMd) {
  return parseListItems(extractSection(statusMd, "## Gotchas") ?? "").map((item) =>
    item.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim(),
  );
}

/**
 * Generic AGENTS.md section reader: pull a heading's top-level bullet list into flat strings.
 * Used for ARCHITECTURE INVARIANTS, WHAT'S OFF-LIMITS, HOW WORK IS EXECUTED, MODEL / TOOL
 * ROUTING, STANDING BEHAVIORAL RULES — parse AGENTS.md rather than duplicating its content.
 * Links flattened, bold stripped, whitespace collapsed.
 * @param {string} md
 * @param {string} heading e.g. "## ARCHITECTURE INVARIANTS" (matches suffix text too).
 * @returns {string[]}
 */
export function parseAgentsSection(md, heading) {
  return parseListItems(extractSection(md, heading) ?? "").map((item) =>
    item
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * STATUS.md "## Decision index" bullets → structured settled-decision rows.
 * Format: `- **D-X** (MM-DD): summary text…` (summary may wrap across lines).
 * @param {string} statusMd
 * @returns {Array<{ id: string, date: string | null, text: string }>}
 */
export function parseStatusDecisionIndex(statusMd) {
  const section = extractSection(statusMd, "## Decision index");
  if (!section) return [];
  const out = [];
  for (const item of parseListItems(section)) {
    const m = item.match(/^(D-[A-Z0-9-]+)\s*(?:\(([^)]*)\))?\s*[:：-]?\s*(.*)$/);
    if (!m) continue;
    const text = m[3]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ id: m[1], date: m[2]?.trim() || null, text });
  }
  return out;
}

/**
 * Extract the `[SHIP-1 <tier>]` tag from a backlog row's text, if present.
 * Handles `[SHIP-1 A1]`, `[SHIP-1 D2]`, `[SHIP-1 Tier X]`, `[SHIP-1 A–E]`.
 * @param {string} itemText
 * @returns {string | null} the tier token (e.g. "A1", "Tier X") or null.
 */
export function extractShip1Tag(itemText) {
  const m = String(itemText ?? "").match(/\[SHIP-1 ([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

/**
 * BACKLOG.md "### Explicitly *not* tech debt" guardrail table → {topic, why} rows. This is the
 * "do not modernize these" firewall that has no other machine-readable home.
 * @param {string} backlogMd
 * @returns {Array<{ topic: string, why: string }>}
 */
export function parseBacklogNotTechDebt(backlogMd) {
  const section = extractSection(backlogMd, "### Explicitly");
  if (!section) return [];
  return parseMarkdownTable(section)
    .map((r) => ({
      topic: (r.topic ?? "").replace(/\*\*/g, "").trim(),
      why: (r.why_leave_it ?? r.why ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").trim(),
    }))
    .filter((r) => r.topic);
}

/**
 * SHIP-1.md tier sections → the pre-ship ordering. Each `## Tier X — title` heading with its
 * first table becomes { tier, title, rows }. Rows keep their raw table cells (# / item / notes).
 * @param {string} ship1Md
 * @returns {Array<{ tier: string, title: string, rows: Array<Record<string, string>> }>}
 */
export function parseShip1Tiers(ship1Md) {
  const md = String(ship1Md ?? "");
  const out = [];
  for (const h of md.matchAll(/^## +Tier +([A-Z]) +[—-] +(.+)$/gm)) {
    const section = extractSection(md, `## Tier ${h[1]}`);
    if (!section) continue;
    out.push({
      tier: h[1],
      title: h[2].replace(/\s+/g, " ").trim(),
      rows: parseMarkdownTable(section),
    });
  }
  return out;
}

/**
 * project-state.md "## 5. Verified healthy / non-issues" table → {area, verdict} rows. The list
 * of statically-cleared items future agents must not re-investigate without new evidence.
 * @param {string} projectStateMd
 * @returns {Array<{ area: string, verdict: string }>}
 */
export function parseProjectStateHealthy(projectStateMd) {
  const section = extractSection(projectStateMd, "## 5. Verified healthy");
  if (!section) return [];
  return parseMarkdownTable(section)
    .map((r) => ({
      area: (r.area ?? "").replace(/\*\*/g, "").trim(),
      verdict: (r.verdict ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").trim(),
    }))
    .filter((r) => r.area);
}

// ---------------------------------------------------------------------------
// Collectors (filesystem / git) — each degrades to null on failure
// ---------------------------------------------------------------------------

/** @param {string} cwd @param {string[]} argv @returns {string | null} */
function git(cwd, argv) {
  try {
    return execFileSync("git", argv, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** @param {string} cwd */
function collectGit(cwd) {
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch == null) return null;
  const head = git(cwd, ["rev-parse", "--short", "HEAD"]);
  const headSubject = git(cwd, ["log", "-1", "--pretty=%s"]);
  const dirtyRaw = git(cwd, ["status", "--porcelain"]);
  const counts = git(cwd, ["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`]);
  let behind = null;
  let ahead = null;
  if (counts != null) {
    const m = counts.match(/^(\d+)\s+(\d+)$/);
    if (m) {
      behind = Number(m[1]);
      ahead = Number(m[2]);
    }
  }
  const commits = (git(cwd, ["log", "-10", "--pretty=%h%x09%s"]) ?? "")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, subject] = l.split("\t");
      return { sha, subject };
    });
  return {
    branch,
    head,
    headSubject,
    dirtyFiles: dirtyRaw ? dirtyRaw.split("\n").filter(Boolean).length : 0,
    ahead,
    behind,
    commits,
  };
}

/**
 * Enrich a battery report with classification + file name.
 * @param {string} file
 * @param {any} report
 * @param {{ headFull?: string | null }} ctx
 */
function assessBatteryReport(file, report, ctx) {
  const classification = classifyBatteryEvidence(report, ctx);
  const results = Array.isArray(report.results) ? report.results : [];
  return {
    file,
    ...report,
    classification,
    green: results.filter((r) => r.code === 0).length,
    inconclusive: results.filter((r) => r.code === 3).length,
    total: results.length,
    scopeLabel: classification.scopeLabel,
  };
}

/**
 * @param {string} dir
 * @param {{ headFull?: string | null }} [ctx]
 * @returns {Promise<{
 *   latest: any,
 *   latestTargeted: any,
 *   latestComplete: any,
 *   latestCompleteExactHead: any,
 *   history: any[],
 * } | null>}
 */
async function collectBattery(dir, ctx = {}) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => /^battery-.*\.json$/.test(f)).sort().reverse();
  } catch {
    return null;
  }
  if (files.length === 0) {
    return {
      latest: null,
      latestTargeted: null,
      latestComplete: null,
      latestCompleteExactHead: null,
      history: [],
    };
  }
  /** @type {any[]} */
  const history = [];
  /** @type {any[]} */
  const assessed = [];
  for (const f of files.slice(0, 24)) {
    try {
      const report = JSON.parse(await readFile(join(dir, f), "utf8"));
      const entry = assessBatteryReport(f, report, ctx);
      assessed.push(entry);
      history.push({
        file: f,
        when: report.when ?? null,
        green: entry.green,
        inconclusive: entry.inconclusive,
        total: entry.total,
        complete: entry.classification.complete,
        class: entry.classification.class,
        scopeLabel: entry.scopeLabel,
        hasProvenance: entry.classification.hasProvenance,
      });
    } catch {
      /* unreadable report — skip */
    }
  }
  const latestTargeted = assessed[0] ?? null;
  const latestComplete = assessed.find((a) => a.classification.complete) ?? null;
  const latestCompleteExactHead =
    assessed.find(
      (a) =>
        a.classification.complete &&
        a.classification.hasProvenance &&
        !a.classification.reasons.includes("head-mismatch"),
    ) ?? null;
  // * Legacy alias: `latest` = latest targeted (may be partial).
  return {
    latest: latestTargeted,
    latestTargeted,
    latestComplete,
    latestCompleteExactHead,
    history: history.slice(0, 8),
    coreRequired: REQUIRED_CORE_STEPS,
  };
}

/**
 * Epoch ms from a capture-time field (ISO string, epoch ms, or Date).
 * @param {unknown} v
 * @returns {number | null}
 */
export function captureTimeMs(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * Rank key for dashboard top-N: prefer server/capture time over file mtime so a bulk
 * `captures:pull` (rewrites playtest/* mtimes) cannot crowd out newer real captures.
 * @param {{ received?: unknown, client_ts?: unknown } | null | undefined} meta
 * @param {Date | number} mtime
 * @returns {number}
 */
export function captureRankMs(meta, mtime) {
  const fromMeta = captureTimeMs(meta?.received) ?? captureTimeMs(meta?.client_ts);
  if (fromMeta != null) return fromMeta;
  const mt = captureTimeMs(mtime);
  return mt ?? 0;
}

/**
 * Normalize any capture-time source to ISO for stable Date.parse sorting.
 * @param {unknown} primary  bundle capturedAt
 * @param {unknown} secondary  meta.received / meta.client_ts
 * @param {Date | number} mtimeFallback
 * @returns {string}
 */
export function normalizeCapturedAt(primary, secondary, mtimeFallback) {
  const ms = captureTimeMs(primary) ?? captureTimeMs(secondary) ?? captureTimeMs(mtimeFallback) ?? Date.now();
  return new Date(ms).toISOString();
}

/**
 * Card title: F8 bundles hardcode scenario "manual"; triage identity lives on the
 * pull-captures sidecar label (?captureLabel / deriveDefaultLabel).
 * @param {unknown} scenario
 * @param {unknown} metaLabel
 * @returns {string | null}
 */
export function preferCaptureLabel(scenario, metaLabel) {
  const label = metaLabel != null && String(metaLabel).trim() !== "" ? String(metaLabel).trim() : null;
  if (label) return label;
  if (scenario == null || scenario === "") return null;
  return String(scenario);
}

/**
 * Capture bundles from BOTH surfaces: harness/local bundles at the top of `.diag-captures/`
 * (scenario-label-NNN.json + .png) and remote F8 uploads pulled into
 * `.diag-captures/playtest/` by tools/pull-captures.mjs (cap-N-label.json + cap-N-meta.json
 * server sidecars). The playtest subdir was previously invisible to the dashboard.
 * @param {string} dir
 */
async function collectCaptures(dir) {
  const isBundle = (f) =>
    f.endsWith(".json") &&
    !f.startsWith("battery-") &&
    !f.startsWith("tally-") &&
    !f.endsWith("-meta.json") &&
    f !== "health.json";

  /** @type {Map<string, any>} rel bundle path → server sidecar */
  const sidecars = new Map();
  /** @type {Array<{ rel: string, hasPng: boolean, mtime: Date, meta: any, rankMs: number }>} */
  const candidates = [];

  for (const sub of ["", "playtest"]) {
    const surface = sub ? join(dir, sub) : dir;
    let files;
    try {
      files = await readdir(surface);
    } catch {
      continue;
    }
    // * Sidecars (pull-captures writeOne) are merged into their bundle's card,
    // * never rendered as their own bundle.
    for (const f of files.filter((x) => x.endsWith("-meta.json"))) {
      try {
        const meta = JSON.parse(await readFile(join(surface, f), "utf8"));
        if (meta?.file) sidecars.set(sub ? `${sub}/${meta.file}` : meta.file, meta);
      } catch {
        /* unreadable sidecar — skip */
      }
    }
    for (const f of files.filter(isBundle)) {
      try {
        const rel = sub ? `${sub}/${f}` : f;
        const mtime = (await stat(join(surface, f))).mtime;
        const meta = sidecars.get(rel) ?? null;
        candidates.push({
          rel,
          hasPng: files.includes(f.replace(/\.json$/, ".png")),
          mtime,
          meta,
          // * Capture/server time decides membership in the top-20 — not pull mtime.
          rankMs: captureRankMs(meta, mtime),
        });
      } catch {
        /* raced delete — skip */
      }
    }
  }

  candidates.sort((a, b) => b.rankMs - a.rankMs);

  const out = [];
  for (const { rel, hasPng, mtime, meta } of candidates.slice(0, 20)) {
    try {
      const raw = JSON.parse(await readFile(join(dir, rel), "utf8"));
      out.push({
        file: rel,
        png: hasPng ? rel.replace(/\.json$/, ".png") : null,
        scenario: preferCaptureLabel(raw?.scenario, meta?.label),
        reason: raw?.reason ?? null,
        phase: raw?.phase ?? meta?.phase ?? null,
        capturedAt: normalizeCapturedAt(raw?.capturedAt, meta?.received ?? meta?.client_ts, mtime),
        build: raw?.build ?? null,
        // * The triage question is always "which build was this from?" — bundle stamp
        // * first (baked by vite define), server sidecar as fallback for F8 uploads.
        buildSha: raw?.build?.sha ?? meta?.build ?? null,
        serverId: meta?.id ?? null,
        isHost: meta?.is_host ?? null,
        qualityTier: meta?.quality_tier ?? null,
        errorEvents: Array.isArray(raw?.events) ? raw.events.filter((e) => e.ch === "error" || e.ch === "assert").length : null,
      });
    } catch {
      /* not a bundle — skip */
    }
  }
  // * Re-rank after full parse (bundle capturedAt is authoritative when present).
  out.sort((a, b) => (captureTimeMs(b.capturedAt) ?? 0) - (captureTimeMs(a.capturedAt) ?? 0));
  return out;
}

/** @param {string} shotsDir Latest perf-profile JSON summary. */
async function collectPerf(shotsDir) {
  let files;
  try {
    files = (await readdir(shotsDir)).filter((f) => /^perf-profile-.*\.json$/.test(f)).sort().reverse();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  try {
    const report = JSON.parse(await readFile(join(shotsDir, files[0]), "utf8"));
    const rows = Array.isArray(report.rows) ? report.rows : [];
    return {
      file: files[0],
      when: report.when ?? null,
      rows: rows.map((r) => ({
        level: r.level,
        preset: r.preset,
        ablate: r.ablate ?? null,
        gpuMsMedian: r.gpuMs?.median ?? null,
        frameMsMedian: r.frameMs?.median ?? null,
        drawCalls: r.renderer?.drawCalls ?? null,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Normalize / validate the analytics cache payload written by tools/pull-analytics.mjs.
 * Schema: `{ pulledAt, url, summary }` — `summary.window` may be undefined (empty DO).
 * Corrupt / partial JSON → null (dashboard empty state).
 *
 * @param {unknown} raw
 * @returns {{ pulledAt: string, url: string, summary: Record<string, unknown> } | null}
 */
export function parseAnalyticsCache(raw) {
  if (!raw || typeof raw !== "object") return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  if (typeof obj.pulledAt !== "string" || typeof obj.url !== "string") return null;
  if (!obj.summary || typeof obj.summary !== "object") return null;
  return {
    pulledAt: obj.pulledAt,
    url: obj.url,
    summary: /** @type {Record<string, unknown>} */ (obj.summary),
  };
}

/**
 * Read `.diag-captures/analytics-summary.json` if present. Degrades to null.
 * @param {string} captureDir absolute path to `.diag-captures`
 * @returns {Promise<{ pulledAt: string, url: string, summary: Record<string, unknown> } | null>}
 */
export async function collectAnalyticsSummary(captureDir) {
  try {
    const text = await readFile(join(captureDir, "analytics-summary.json"), "utf8");
    return parseAnalyticsCache(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Assemble the full health model.
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<Record<string, any>>}
 */
export async function collectProjectHealth(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const captureDir = resolve(cwd, ".diag-captures");
  /** @type {string[]} */
  const collectorErrors = [];

  let statusMd = "";
  let backlogMd = "";
  /** @type {Record<string, string | null>} */
  const sourceFreshness = {
    statusMd: null,
    backlogMd: null,
    batteryDir: null,
  };
  try {
    const p = resolve(cwd, "docs/STATUS.md");
    statusMd = await readFile(p, "utf8");
    sourceFreshness.statusMd = (await stat(p)).mtime.toISOString();
  } catch (e) {
    collectorErrors.push(`STATUS.md: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const p = resolve(cwd, "docs/planning/BACKLOG.md");
    backlogMd = await readFile(p, "utf8");
    sourceFreshness.backlogMd = (await stat(p)).mtime.toISOString();
  } catch (e) {
    collectorErrors.push(`BACKLOG.md: ${e instanceof Error ? e.message : e}`);
  }
  const git = collectGit(cwd);
  if (git) {
    try {
      git.headFull = execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      git.headFull = null;
    }
  }
  let battery = null;
  let captures = [];
  let analytics = null;
  let perf = null;
  try {
    battery = await collectBattery(captureDir, { headFull: git?.headFull ?? null });
    if (battery?.latestTargeted?.when) sourceFreshness.batteryDir = battery.latestTargeted.when;
  } catch (e) {
    collectorErrors.push(`battery: ${e instanceof Error ? e.message : e}`);
  }
  try {
    captures = await collectCaptures(captureDir);
  } catch (e) {
    collectorErrors.push(`captures: ${e instanceof Error ? e.message : e}`);
    captures = [];
  }
  try {
    analytics = await collectAnalyticsSummary(captureDir);
  } catch (e) {
    collectorErrors.push(`analytics: ${e instanceof Error ? e.message : e}`);
    analytics = null;
  }
  try {
    perf = await collectPerf(resolve(cwd, "shots"));
  } catch (e) {
    collectorErrors.push(`perf: ${e instanceof Error ? e.message : e}`);
  }

  const mission = parseStatusCurrentFocus(statusMd);
  const allIssues = parseStatusOpenIssues(statusMd);
  const openIssues = allIssues.filter((i) => {
    const st = issueState(i.status);
    return st === "open" || st === "warn" || st === "partial";
  });
  const playtestQueue = parseStatusPlaytestQueue(statusMd);
  const nextActions = parseListItems(extractSection(statusMd, "### Next actions") ?? "");
  const issues = {
    all: allIssues,
    open: openIssues,
    // * Legacy alias used by older dashboard/tests — open-only radar set.
    nextActions,
    playtestQueue,
  };
  const doNots = parseStatusDoNots(statusMd);
  const phases = parseStatusReleasePhases(statusMd);
  const doneWhen = parseStatusDoneWhen(statusMd);
  const lastSession = parseStatusLastUpdated(statusMd);
  const currentPhase = phases.find((p) => p.state === "current") ?? null;
  const activeRow = playtestQueue.find((q) => q.state === "active") ?? null;

  const declared = {
    phase: currentPhase?.name ?? null,
    phases,
    mission,
    doneWhen,
    queue: playtestQueue,
    activeCard: activeRow,
    nextActions,
    blockers: openIssues.filter((i) => issueState(i.status) === "open"),
  };

  const targetedClass = battery?.latestTargeted?.classification ?? null;
  const completeClass = battery?.latestComplete?.classification ?? null;
  const exactClass = battery?.latestCompleteExactHead?.classification ?? null;

  const observed = {
    git,
    battery: {
      latestTargeted: battery?.latestTargeted ?? null,
      latestComplete: battery?.latestComplete ?? null,
      latestCompleteExactHead: battery?.latestCompleteExactHead ?? null,
      history: battery?.history ?? [],
      coreRequired: REQUIRED_CORE_STEPS,
    },
    captures,
    analytics,
    perf,
  };

  const dirty = (git?.dirtyFiles ?? 0) > 0;
  const behind = (git?.behind ?? 0) > 0;
  const ahead = (git?.ahead ?? 0) > 0;
  const inSync = git != null && !dirty && !behind && !ahead;

  // * Release ready requires exact-HEAD complete green battery + clean tree + in sync.
  const exactGreen = exactClass?.class === "green";
  const releaseReady = Boolean(exactGreen && inSync && !dirty);

  const readiness = {
    releaseReady,
    batteryClass: targetedClass?.class ?? "unknown",
    batteryScope: targetedClass?.scopeLabel ?? "0/5",
    completeBatteryClass: completeClass?.class ?? null,
    exactHeadBatteryClass: exactClass?.class ?? null,
    inSync,
    dirty,
    reasons: [
      ...(exactGreen ? [] : ["no-exact-head-complete-green-battery"]),
      ...(inSync ? [] : ["git-not-in-sync"]),
      ...(dirty ? ["dirty-tree"] : []),
      ...(targetedClass && targetedClass.class !== "green" ? [`latest-targeted:${targetedClass.class}`] : []),
    ],
  };

  const checks = {
    collectorErrors,
    sourceFreshness,
  };

  const digest = {
    phase: declared.phase,
    mission: mission?.headline ?? null,
    now: deriveNextAction({ battery, issues, observed, declared }),
    doneWhen,
    recentlyCompleted: [
      ...playtestQueue.filter((q) => q.state === "done").map((q) => `${q.id} ${q.what}`.trim()),
      ...(git?.commits ?? []).slice(0, 3).map((c) => c.subject),
    ],
    inProgress: [
      activeRow ? `${activeRow.id} — ${activeRow.what} (${activeRow.status})` : null,
    ].filter(Boolean),
    blockers: declared.blockers.map((i) => ({ id: i.id, issue: i.issue })),
    avoid: doNots,
    symbolsInPlay: extractBacktickSymbols(
      activeRow ? `${activeRow.what} ${activeRow.status}` : null,
      nextActions.slice(0, 2).join(" "),
      lastSession?.summary,
    ),
    recentRegressions: (git?.commits ?? []).filter((c) => /revert|rollback|regress/i.test(c.subject)).map((c) => c.subject),
    lastSession,
    readiness: { releaseReady, batteryClass: readiness.batteryClass, batteryScope: readiness.batteryScope },
  };

  return {
    healthVersion: 4,
    generatedAt: new Date().toISOString(),
    declared,
    observed,
    checks,
    readiness,
    // * Back-compat surface for dashboard / older tests
    git,
    battery: {
      latest: battery?.latestTargeted ?? null,
      latestTargeted: battery?.latestTargeted ?? null,
      latestComplete: battery?.latestComplete ?? null,
      latestCompleteExactHead: battery?.latestCompleteExactHead ?? null,
      history: battery?.history ?? [],
      coreRequired: REQUIRED_CORE_STEPS,
    },
    captures,
    analytics,
    perf,
    mission,
    phases,
    doneWhen,
    issues,
    backlog: parseBacklogSections(backlogMd),
    doNots,
    digest,
  };
}
