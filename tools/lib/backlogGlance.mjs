/**
 * backlogGlance.mjs — compute + render the "Status at a glance" Department table in
 * docs/planning/BACKLOG.md, and the marker contract that keeps it from drifting.
 *
 * The box used to be hand-maintained and drifted (87 claimed vs 92 real rows, and a
 * department missing a High count entirely — see the 2026-08-06 BACKLOG audit). It is
 * now GENERATED between two HTML-comment markers by `npm run backlog`, the same
 * pattern docs/BRIEFING.md and docs/ARCHITECTURE.json use — except BACKLOG.md itself
 * stays hand-authored everywhere else, so only the marked block is ever rewritten.
 *
 * Single source of truth for the block's exact text: renderBacklogGlanceBlock() is
 * called by both the generator (tools/backlog.mjs, which writes it) and the validator
 * (validateBacklogHygiene, which byte-compares it against what is on disk) — so the
 * two can never independently drift from each other.
 */

import { flattenBacklogRows } from "./projectHealth.mjs";

export const GLANCE_BEGIN_MARKER = "<!-- BEGIN GENERATED counts — npm run backlog. Do not hand-edit. -->";
export const GLANCE_END_MARKER = "<!-- END GENERATED counts -->";

/** Departments whose glance-table label carries a decoration the section title doesn't. */
const LABEL_PREFIX = { "Playtest owed": "🟢 " };

/**
 * GitHub's markdown-heading anchor slug: lowercase, strip everything but word
 * chars/spaces/hyphens, then turn every leftover space into a hyphen — "Design /
 * Gameplay" → "design--gameplay" (the slash leaves two spaces behind, which each
 * become their own hyphen; this file's own headings rely on exactly that).
 * @param {string} title
 * @returns {string}
 */
function githubSlug(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

/**
 * Recompute the glance table's numbers directly from the department tables — the
 * live truth this box mirrors. Fails closed on a priority value the table has no
 * column for (e.g. the first `Critical` row) rather than silently dropping it from
 * the sum, since Open must always equal High+Medium+Low for every department.
 * @param {string} backlogMd
 * @returns {{ ok: true, departments: Array<{ title: string, open: number, high: number, medium: number, low: number, partial: number }>, total: number } | { ok: false, reason: string }}
 */
export function computeBacklogGlance(backlogMd) {
  /** @type {Map<string, { title: string, open: number, high: number, medium: number, low: number, partial: number }>} */
  const bySection = new Map();
  /** @type {string[]} */
  const order = [];
  for (const r of flattenBacklogRows(backlogMd)) {
    if (!bySection.has(r.section)) {
      bySection.set(r.section, { title: r.section, open: 0, high: 0, medium: 0, low: 0, partial: 0 });
      order.push(r.section);
    }
    const d = bySection.get(r.section);
    const pri = r.pri.replace(/[^A-Za-z]/g, "");
    d.open += 1;
    if (pri === "High") d.high += 1;
    else if (pri === "Medium") d.medium += 1;
    else if (pri === "Low") d.low += 1;
    else if (pri === "Partial") d.partial += 1;
    else {
      return {
        ok: false,
        reason: `${r.section} row "${r.id ?? r.item.slice(0, 40)}" has priority "${r.pri}" — the glance table has no column for it (known: High/Medium/Low/Partial)`,
      };
    }
  }
  const departments = order.map((t) => bySection.get(t));
  const total = departments.reduce((n, d) => n + d.open, 0);
  return { ok: true, departments, total };
}

/**
 * Render the exact marked block text (markers included) from a glance computation.
 * @param {{ departments: Array<{ title: string, open: number, high: number, medium: number, low: number, partial: number }>, total: number }} glance
 * @returns {string}
 */
export function renderBacklogGlanceBlock(glance) {
  const lines = [
    GLANCE_BEGIN_MARKER,
    `| Department | Open | High | Medium | Low |`,
    `|---|---:|---:|---:|---:|`,
    ...glance.departments.map((d) => {
      const label = `${LABEL_PREFIX[d.title] ?? ""}[${d.title}](#${githubSlug(d.title)})`;
      const low = d.partial > 0 ? `${d.low} (+${d.partial} partial)` : String(d.low);
      return `| ${label} | ${d.open} | ${d.high} | ${d.medium} | ${low} |`;
    }),
    ``,
    `**${glance.total} open rows total.**`,
    GLANCE_END_MARKER,
  ];
  return lines.join("\n");
}

/**
 * Current text between the markers, markers included, for a single clean byte
 * compare against {@link renderBacklogGlanceBlock}'s output. Null when either
 * marker is missing.
 * @param {string} backlogMd
 * @returns {string | null}
 */
export function extractBacklogGlanceBlock(backlogMd) {
  const md = String(backlogMd ?? "");
  const start = md.indexOf(GLANCE_BEGIN_MARKER);
  const end = md.indexOf(GLANCE_END_MARKER);
  if (start < 0 || end < 0 || end < start) return null;
  return md.slice(start, end + GLANCE_END_MARKER.length);
}

/**
 * Replace the marked block in place, preserving every hand-authored line outside it.
 * Throws if either marker is missing — first-time setup inserts them by hand once.
 * @param {string} backlogMd
 * @param {string} newBlock rendered via {@link renderBacklogGlanceBlock}
 * @returns {string}
 */
export function replaceBacklogGlanceBlock(backlogMd, newBlock) {
  const md = String(backlogMd ?? "");
  const start = md.indexOf(GLANCE_BEGIN_MARKER);
  const end = md.indexOf(GLANCE_END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(
      "docs/planning/BACKLOG.md is missing the GENERATED counts markers — insert them once by hand around the Department table, then re-run.",
    );
  }
  return md.slice(0, start) + newBlock + md.slice(end + GLANCE_END_MARKER.length);
}
