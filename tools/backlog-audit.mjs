#!/usr/bin/env node
/**
 * backlog-audit.mjs — BACKLOG-GATE-3 lever 2. Asks git whether an open BACKLOG row has
 * already shipped.
 *
 *   npm run backlog:audit
 *
 * A REPORT, deliberately not a gate. Measured on 08-07: of 41 open rows carrying an id,
 * 18 had that id in some code commit and exactly ONE was really done. A check with that
 * precision inside `npm run qa` would be ignored inside a week, and `health:check` would
 * stop meaning anything. Read this at wave end and adjudicate the handful it lists.
 *
 * Two signals, because the id alone is not enough:
 *
 *   ID   — the row's id appears in a commit message that also touched non-docs files.
 *          Cheap, noisy: an id gets named in passing all the time ("AI-DAY-1 lever 3 …
 *          (NPC-BOOST-1 frequency carve-out)" names a card it did not close).
 *
 *   LEVER — the row's own cited lever (a backticked `object.knob` / `functionName`, or a
 *          linked src file) shows up in a commit diff whose subject never names the row.
 *          This is the one that matters. SPAWN-SUNDIAL-GAP-1's fix landed in `92c44f2`,
 *          titled "AI-DAY-SELFKO-1: deny NPC boost on bot lip" — no id, no grep hit, row
 *          left open, and Wyatt hit the same card twice. `git log -G booth.gapDistanceByLevel`
 *          finds it in one call.
 *
 * Note -G, not -S: `-S` counts occurrences, so a value edit (3.0 → 3.75) does not
 * register. That is exactly the shape of a one-number card. Do not "optimize" it to -S.
 *
 * Flags:
 *   --since=<git date>  history window (default: the row's "Filed MM-DD", else 60 days)
 *   --json              machine-readable output
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { flattenBacklogRows } from "./lib/projectHealth.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKLOG = path.join(ROOT, "docs/planning/BACKLOG.md");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const sinceFlag = argv.find((a) => a.startsWith("--since="))?.slice(8) ?? null;

/** @param {string[]} args @returns {string} */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

/** Files that are not documentation — the only kind that can constitute "it shipped". */
const isCode = (f) => f && !f.startsWith("docs/") && !f.endsWith(".md");

/** @param {string} sha @returns {string[]} */
const filesOf = (sha) => git(["show", "--name-only", "--format=", sha]).split("\n").filter(Boolean);

/**
 * The lever tokens a row names about itself: backticked `a.b` / `camelCase` identifiers
 * and linked source paths. These are what the row claims still needs changing — so a
 * commit that touched one is a commit that may have already done it.
 * @param {string} text
 * @returns {{ tokens: string[], files: string[] }}
 */
function citedLevers(text) {
  const tokens = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const t = m[1].trim().replace(/\(\)$/, "");
    // Reject anything that is not a specific enough needle. A generic token (`gameState`,
    // `toneMapping`, `.cr-howto-*`) matches half the history and buries the real hit —
    // the first cut of this tool reported 11 lever matches, 10 of them noise from exactly
    // these. Keep two shapes only: a dotted config path, or a long camelCase symbol.
    if (/[\s:/*]/.test(t)) continue;
    const dotted = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9.]{4,}$/.test(t);
    const longCamel = /^[a-z][A-Za-z0-9]{15,}$/.test(t) && /[a-z][A-Z]/.test(t);
    if (!dotted && !longCamel) continue;
    tokens.add(t);
    // A dotted path is how a row NAMES a knob, not how source spells it:
    // SPAWN-SUNDIAL-GAP-1 cites `booth.gapDistanceByLevel`, but config.js only ever
    // writes `gapDistanceByLevel:` inside a `booth:` block — so the full path matched
    // nothing and the card's own fix commit stayed invisible. Search the tail too; the
    // frequency filter below throws it out if it turns out to be a common word.
    const tail = dotted ? t.split(".").pop() : "";
    if (tail.length >= 8 && /[a-z][A-Z]/.test(tail)) tokens.add(tail);
  }
  const files = new Set();
  for (const m of text.matchAll(/\((?:\.\.\/)+((?:src|party|tools)\/[^)\s#]+?\.\w+)(?::\d+)?\)/g)) files.add(m[1]);
  return { tokens: [...tokens].slice(0, 6), files: [...files].slice(0, 3) };
}

/** "Filed 08-06" → an ISO date git understands. Rows are same-year by construction. */
function filedSince(text) {
  const m = text.match(/\bFiled\s+(\d{2})-(\d{2})\b/);
  if (!m) return null;
  const year = new Date().getFullYear();
  return `${year}-${m[1]}-${m[2]}`;
}

const md = fs.readFileSync(BACKLOG, "utf8");
const closedStart = md.indexOf("## Closed / do-not-reopen");
const rows = flattenBacklogRows(closedStart > 0 ? md.slice(0, closedStart) : md).filter((r) => r.id);

const findings = [];
for (const r of rows) {
  const blob = `${r.item} ${r.notes}`;
  const since = sinceFlag ?? filedSince(blob) ?? "60 days ago";
  const window = ["--since", since];

  /** @type {Map<string, { subject: string, why: string[] }>} */
  const hits = new Map();
  const note = (sha, subject, why) => {
    const e = hits.get(sha) ?? { subject, why: [] };
    if (!e.why.includes(why)) e.why.push(why);
    hits.set(sha, e);
  };

  for (const line of git(["log", "--format=%h\t%s", "--grep", r.id, ...window]).split("\n").filter(Boolean)) {
    const [sha, ...rest] = line.split("\t");
    if (filesOf(sha).some(isCode)) note(sha, rest.join("\t"), "ID");
  }

  const { tokens, files } = citedLevers(blob);
  for (const tok of tokens) {
    // -n 25, not a handful: the SPAWN-SUNDIAL-GAP-1 fix sat 7 commits deep behind the
    // docs commits that merely mention the same knob, and a tight cap hid it.
    const raw = git(["log", "--format=%h\t%s", "-G", tok, "-n", "25", ...window]).split("\n").filter(Boolean);
    // Frequency filter — a token the window touches a dozen times is a word, not a lever
    // (`composer.render` alone returned 18 and buried every real hit under it).
    if (raw.length >= 12) continue;
    for (const line of raw) {
      const [sha, ...rest] = line.split("\t");
      const subject = rest.join("\t");
      if (subject.includes(r.id)) continue; // already attributed to this card
      if (!filesOf(sha).some(isCode)) continue;
      note(sha, subject, `LEVER \`${tok}\``);
    }
  }

  if (!hits.size) continue;
  const lever = [...hits.values()].some((h) => h.why.some((w) => w.startsWith("LEVER")));
  findings.push({
    id: r.id,
    section: r.section,
    pri: r.pri,
    since,
    files,
    rank: lever ? 0 : 1,
    commits: [...hits.entries()].map(([sha, h]) => ({ sha, subject: h.subject, why: h.why })),
  });
}

findings.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

if (asJson) {
  console.log(JSON.stringify({ rows: rows.length, findings }, null, 2));
  process.exit(0);
}

const strong = findings.filter((f) => f.rank === 0);
console.log(`\n[backlog:audit] ${rows.length} open rows with an id — ${findings.length} have git activity.\n`);
if (strong.length) {
  console.log(`LEVER MATCH (${strong.length}) — a commit touched the lever this row names, under another card's name.`);
  console.log(`These are the ones worth reading. Close the row, or write down why the commit did not close it.\n`);
}
for (const f of findings) {
  console.log(`${f.rank === 0 ? "▲" : " "} ${f.id}  [${f.pri}] ${f.section}  (since ${f.since})`);
  for (const c of f.commits.slice(0, 6)) console.log(`     ${c.sha}  ${c.why.join(" + ")}  ${c.subject.slice(0, 88)}`);
  if (f.commits.length > 6) console.log(`     … ${f.commits.length - 6} more (--json for all)`);
}
console.log(`\nAdjudicate by hand — an id named in passing is normal; a LEVER match usually is not.`);
