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
 * STATUS.md "## Current focus" first line → the mission banner.
 * "**Run 7 — post friend playtest.** Cold handoff …" → headline + detail.
 * @param {string} statusMd
 * @returns {{ headline: string, detail: string | null } | null}
 */
export function parseStatusCurrentFocus(statusMd) {
  const section = extractSection(statusMd, "## Current focus");
  if (!section) return null;
  const line = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("#") && !l.startsWith("|"));
  if (!line) return null;
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
 * gate beats everything; then STATUS next-action #1 (split on "Expect:" into the
 * pass condition); then the active queue card. Captures are deliberately NOT a
 * source — evidence, not todos. Shared by the Command Center render and the
 * health.json digest so humans and agents get the same answer.
 * @param {any} h partial health model (battery/issues at minimum)
 * @returns {{ tag: string, kind: string, text: string, expect: string | null }}
 */
export function deriveNextAction(h) {
  const stripLinks = (s) => String(s ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // * code 3 = INCONCLUSIVE (starved rig environment, no regression evidence) — it must
  // * never fabricate a RED GATE; only real failures (1/2) block shipping.
  const failing = (h.battery?.latest?.results ?? []).filter((r) => r.code !== 0 && r.code !== 3);
  if (failing.length > 0) {
    return {
      tag: "RED GATE",
      kind: "gate",
      text: `Fix the failing battery step${failing.length > 1 ? "s" : ""}: ${failing.map((r) => r.name).join(" + ")} — nothing ships over a red gate`,
      expect: failing[0].note ?? null,
    };
  }
  const next = h.issues?.nextActions?.[0];
  if (next) {
    const split = stripLinks(next).split(/\s*Expect:\s*/);
    return { tag: "DO THIS NOW", kind: "plan", text: split[0].replace(/[;.\s]+$/, ""), expect: split[1] ?? null };
  }
  const active = (h.issues?.playtestQueue ?? []).find((q) => q.state === "active");
  if (active) {
    return { tag: "DO THIS NOW", kind: "queue", text: `${active.id} — ${active.what}`, expect: active.status || null };
  }
  return { tag: "NO ACTIVE CARD", kind: "none", text: "Nothing derivable — open docs/STATUS.md § Current focus and pick the next card", expect: null };
}

/**
 * docs/planning/handoff-next-window.md → the agent-briefing block: title, the
 * `**Key:** value` fact lines from the header, and the bold "Do not" rules.
 * Tolerant of missing pieces; returns null only when the doc has none of them.
 * @param {string} handoffMd
 * @returns {{ title: string | null, facts: Array<{ key: string, value: string }>, doNots: string[] } | null}
 */
export function parseHandoffBriefing(handoffMd) {
  const md = String(handoffMd ?? "");
  if (md.trim() === "") return null;
  const title = md.match(/^# +(.+)$/m)?.[1]?.trim() ?? null;
  // * Facts and do-nots both live above the first --- rule; scoping there keeps
  // * bold labels deeper in the doc (F8 tables etc.) out of the briefing.
  const header = md.split(/^---$/m)[0];
  const facts = [];
  const doNots = [];
  for (const line of header.split(/\r?\n/)) {
    const doNot = line.match(/^\*\*Do not\*\*\s+(.*)$/i) ?? line.match(/^\*\*(Ship only[^*]*)\*\*\.?\s*$/i);
    if (doNot) {
      doNots.push(doNot[1].replace(/\*\*/g, "").replace(/\s+$/, "").replace(/\.$/, "").trim());
      continue;
    }
    const fact = line.match(/^\*\*(.+?):\*\*\s+(.*?)\s*$/);
    if (fact) {
      const value = fact[2]
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // markdown links → text
        .replace(/\*\*/g, "")
        .trim();
      facts.push({ key: fact[1].trim(), value });
    }
  }
  if (title == null && facts.length === 0 && doNots.length === 0) return null;
  return { title, facts, doNots };
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
        inconclusive: results.filter((r) => r.code === 3).length,
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
 * Assemble the full health model.
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<Record<string, any>>}
 */
export async function collectProjectHealth(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const captureDir = resolve(cwd, ".diag-captures");

  let statusMd = "";
  let backlogMd = "";
  let handoffMd = "";
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
  try {
    handoffMd = await readFile(resolve(cwd, "docs/planning/handoff-next-window.md"), "utf8");
  } catch {
    /* no handoff doc */
  }

  const [battery, captures, perf] = await Promise.all([
    collectBattery(captureDir),
    collectCaptures(captureDir),
    collectPerf(resolve(cwd, "shots")),
  ]);

  const git = collectGit(cwd);
  const mission = parseStatusCurrentFocus(statusMd);
  const issues = {
    open: parseStatusOpenIssues(statusMd),
    nextActions: parseListItems(extractSection(statusMd, "### Next actions") ?? ""),
    playtestQueue: parseStatusPlaytestQueue(statusMd),
  };
  const handoff = parseHandoffBriefing(handoffMd);
  const phases = parseStatusReleasePhases(statusMd);
  const doneWhen = parseStatusDoneWhen(statusMd);
  const lastSession = parseStatusLastUpdated(statusMd);

  // * The AI cold-start digest — everything an agent (or a returning human) needs
  // * before opening any other doc. Summarizes; STATUS.md stays the detail source.
  const activeRow = issues.playtestQueue.find((q) => q.state === "active") ?? null;
  const localFact = (handoff?.facts ?? []).find((f) => f.key.toLowerCase().startsWith("local"))?.value ?? null;
  const commits = git?.commits ?? [];
  const digest = {
    phase: phases.find((p) => p.state === "current")?.name ?? null,
    mission: mission?.headline ?? null,
    now: deriveNextAction({ battery, issues }),
    doneWhen,
    recentlyCompleted: [
      ...issues.playtestQueue.filter((q) => q.state === "done").map((q) => `${q.id} ${q.what}`.trim()),
      ...commits.slice(0, 3).map((c) => c.subject),
    ],
    inProgress: [activeRow ? `${activeRow.id} — ${activeRow.what} (${activeRow.status})` : null, localFact ? `local/unpushed: ${localFact}` : null].filter(Boolean),
    blockers: issues.open.filter((i) => issueState(i.status) === "open").map((i) => ({ id: i.id, issue: i.issue })),
    avoid: handoff?.doNots ?? [],
    symbolsInPlay: extractBacktickSymbols(
      localFact,
      activeRow ? `${activeRow.what} ${activeRow.status}` : null,
      (issues.nextActions ?? []).slice(0, 2).join(" "),
      lastSession?.summary,
    ),
    recentRegressions: commits.filter((c) => /revert|rollback|regress/i.test(c.subject)).map((c) => c.subject),
    lastSession,
  };

  return {
    healthVersion: 3,
    generatedAt: new Date().toISOString(),
    git,
    battery,
    captures,
    perf,
    mission,
    phases,
    doneWhen,
    issues,
    backlog: parseBacklogSections(backlogMd),
    handoff,
    digest,
  };
}
