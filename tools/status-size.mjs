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
 * Known blind spot: this reporter only sees **dated entries**. Growth in the undated sections
 * (Gotchas, Decision index, Current focus narrative) is invisible to it, which is how the file
 * reached 7,589 tokens in 2026-08 while still passing an 8,000 budget. If the token count is
 * high and there is "nothing safe to archive", the undated sections are the place to look.
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

/**
 * Over this, STATUS.md is costing more than it earns on a cold read.
 *
 * Lowered 8_000 → 4_200 on 2026-08-02. The old budget could not bite: the file sat at 7,589
 * and *passed* while roughly 60% of it was duplication, history, or append-only knowledge this
 * reporter cannot see (it only counts dated entries). The rework cut it to 3,504; 4,200 is
 * ~20% headroom — a handful of wave entries before it asks for a trim, rather than a ceiling
 * the file can double under.
 */
export const BUDGET_TOKENS = 4_200;

/**
 * A single date window with more entries than this is a log regrowing inside the
 * snapshot (2026-07-21 hit 11 entries while staying under the token budget —
 * condense or archive; the keep-recent rule alone never catches a busy day).
 */
export const MAX_ENTRIES_PER_DATE = 6;

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
  const denseDates = dates.filter((d) => entries.filter((e) => e.date === d).length > MAX_ENTRIES_PER_DATE);

  return {
    tokens,
    budget: BUDGET_TOKENS,
    overBudget: tokens > BUDGET_TOKENS || denseDates.length > 0,
    lines: lines.length,
    entryCount: entries.length,
    liveDates: keep,
    archivableDates: archivable,
    denseDates,
    maxEntriesPerDate: MAX_ENTRIES_PER_DATE,
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

  if (r.tokens > r.budget) log(`STATUS.md ~${r.tokens.toLocaleString()} tokens — over the ${r.budget.toLocaleString()} budget.`);
  for (const d of r.denseDates) {
    log(`STATUS.md date window ${d} has more than ${r.maxEntriesPerDate} entries — the session log is regrowing inside the snapshot. Condense the window to a few entries, or roll it to docs/archive/ (procedure: docs/archive/README.md).`);
  }
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
