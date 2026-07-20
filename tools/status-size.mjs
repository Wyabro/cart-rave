/**
 * status-size.mjs — warn when docs/STATUS.md has bloated, and suggest where to cut.
 *
 *   npm run status:size               # report size; warn + suggest a boundary over budget
 *   npm run status:size -- --json     # machine-readable (agents / CI consumers)
 *
 * STATUS.md is session memory: agents read it on every cold start, so its size is a tax
 * on every session in the project. It bloats through the dated `## Last updated` log,
 * which is append-only by design. On 2026-07-19 it had reached ~21.6k tokens — a third
 * of a session's entire system-prompt floor, in one file.
 *
 * This is a REPORTER, not a gate, and deliberately does not archive anything itself.
 * Choosing the cut needs judgment about which date window is still active work: the
 * newest entries are usually in-flight (unpushed stacks, pending retests) and must stay
 * live. So this suggests a boundary and prints the command; a human or agent decides.
 *
 * Archiving procedure: docs/archive/README.md.
 *
 * Exit codes: 0 under budget · 1 over budget (enforced in `npm run qa`) · 2 setup error.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("status-size");

/** Rough tokens-from-chars. Good to ~±10% on English prose, which is all this needs. */
const CHARS_PER_TOKEN = 4;

/** Over this, STATUS.md is costing more than it earns on a cold read. */
export const BUDGET_TOKENS = 12_000;

/** Never suggest cutting into the most recent N date windows — that's live work. */
const KEEP_RECENT_DATES = 2;

const STATUS_PATH = resolve("docs/STATUS.md");

/** Lines that open a dated session-log entry, e.g. `2026-07-19 (run 7) — ...`. */
const DATE_ENTRY = /^(\d{4}-\d{2}-\d{2})\b/;

export function analyzeStatus(text) {
  const lines = text.split("\n");
  const tokens = Math.round(text.length / CHARS_PER_TOKEN);

  const entries = [];
  lines.forEach((line, i) => {
    const m = DATE_ENTRY.exec(line);
    if (m) entries.push({ date: m[1], line: i + 1 });
  });

  const dates = [...new Set(entries.map((e) => e.date))];
  const keep = dates.slice(0, KEEP_RECENT_DATES);
  const archivable = dates.slice(KEEP_RECENT_DATES);
  const firstArchivable = entries.find((e) => archivable.includes(e.date));

  return {
    tokens,
    budget: BUDGET_TOKENS,
    overBudget: tokens > BUDGET_TOKENS,
    lines: lines.length,
    entryCount: entries.length,
    liveDates: keep,
    archivableDates: archivable,
    cutFromLine: firstArchivable ? firstArchivable.line : null,
  };
}

const isMain = process.argv[1] && /status-size\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  let text;
  try {
    text = readFileSync(STATUS_PATH, "utf8");
  } catch {
    log(`skipped — ${STATUS_PATH} not found`);
    process.exit(0);
  }

  const r = analyzeStatus(text);

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.overBudget ? 1 : 0);
  }

  if (!r.overBudget) {
    log(`STATUS.md ~${r.tokens.toLocaleString()} tokens (budget ${r.budget.toLocaleString()}) — ok`);
    process.exit(0);
  }

  log(`STATUS.md ~${r.tokens.toLocaleString()} tokens — over the ${r.budget.toLocaleString()} budget.`);
  log(`  ${r.entryCount} dated entries across ${r.liveDates.length + r.archivableDates.length} date windows.`);
  log(`  live (keep):  ${r.liveDates.join(", ") || "(none)"}`);

  if (!r.archivableDates.length) {
    log("  nothing safe to archive yet — all entries are in the current windows.");
    log("  If it keeps growing, the entries themselves are too long, not too many.");
  } else {
    log(`  archivable:   ${r.archivableDates.join(", ")}`);
    log(`  suggested cut: line ${r.cutFromLine} to the end of the session log.`);
    log("  Procedure + index to update: docs/archive/README.md");
  }
  process.exit(1);
}
