/**
 * projectHealth.mjs — collect the project-health model the dashboard renders.
 *
 * One principle: the dashboard is GENERATED from artifacts the project already produces —
 * git, battery reports + per-check tallies + capture bundles (.diag-captures/), perf
 * profiles (shots/), and the existing markdown sources of truth (docs/STATUS.md open
 * issues / next actions, docs/planning/BACKLOG.md). Nothing here is a new database to
 * hand-maintain; the markdown stays canonical and this module just reads it.
 *
 * Every collector degrades independently — a missing directory, unparseable table, or
 * absent git remote turns into a `null`/`error` field, never a thrown run.
 *
 * The markdown parsers are exported pure functions (unit-tested in tests/projectHealth.test.js).
 */

import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

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

/** @param {string} dir @returns {Promise<{ latest: any, history: any[] } | null>} */
async function collectBattery(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => /^battery-.*\.json$/.test(f)).sort().reverse();
  } catch {
    return null;
  }
  if (files.length === 0) return { latest: null, history: [] };
  /** @type {any[]} */
  const history = [];
  let latest = null;
  for (const f of files.slice(0, 8)) {
    try {
      const report = JSON.parse(await readFile(join(dir, f), "utf8"));
      const results = Array.isArray(report.results) ? report.results : [];
      const entry = {
        file: f,
        when: report.when ?? null,
        green: results.filter((r) => r.code === 0).length,
        total: results.length,
      };
      history.push(entry);
      if (!latest) latest = { file: f, ...report };
    } catch {
      /* unreadable report — skip */
    }
  }
  return { latest, history };
}

/** @param {string} dir Capture bundles (scenario-label-NNN.json + .png). */
async function collectCaptures(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const bundles = files.filter((f) => f.endsWith(".json") && !f.startsWith("battery-") && !f.startsWith("tally-") && f !== "health.json");
  const out = [];
  for (const f of bundles.sort().reverse().slice(0, 20)) {
    try {
      const filePath = join(dir, f);
      const raw = JSON.parse(await readFile(filePath, "utf8"));
      const png = f.replace(/\.json$/, ".png");
      const mtime = (await stat(filePath)).mtime.toISOString();
      out.push({
        file: f,
        png: files.includes(png) ? png : null,
        scenario: raw?.scenario ?? null,
        reason: raw?.reason ?? null,
        phase: raw?.phase ?? null,
        capturedAt: raw?.capturedAt ?? mtime,
        build: raw?.build ?? null,
        errorEvents: Array.isArray(raw?.events) ? raw.events.filter((e) => e.ch === "error" || e.ch === "assert").length : null,
      });
    } catch {
      /* not a bundle — skip */
    }
  }
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
 * Assemble the full health model.
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<Record<string, any>>}
 */
export async function collectProjectHealth(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const captureDir = resolve(cwd, ".diag-captures");

  let statusMd = "";
  let backlogMd = "";
  try {
    statusMd = await readFile(resolve(cwd, "docs/STATUS.md"), "utf8");
  } catch {
    /* no STATUS.md */
  }
  try {
    backlogMd = await readFile(resolve(cwd, "docs/planning/BACKLOG.md"), "utf8");
  } catch {
    /* no BACKLOG.md */
  }

  const [battery, captures, perf] = await Promise.all([
    collectBattery(captureDir),
    collectCaptures(captureDir),
    collectPerf(resolve(cwd, "shots")),
  ]);

  return {
    healthVersion: 1,
    generatedAt: new Date().toISOString(),
    git: collectGit(cwd),
    battery,
    captures,
    perf,
    issues: {
      open: parseStatusOpenIssues(statusMd),
      nextActions: parseListItems(extractSection(statusMd, "### Next actions") ?? ""),
      playtestQueue: parseListItems(extractSection(statusMd, "### Wyatt playtest queue") ?? ""),
    },
    backlog: parseBacklogSections(backlogMd),
  };
}
