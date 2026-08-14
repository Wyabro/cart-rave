// backlogGlance.test.js — the generator behind `npm run backlog`. computeBacklogGlance
// recomputes the "Status at a glance" Department table straight from the real rows;
// renderBacklogGlanceBlock is the ONE place that formats it, shared by the generator
// (writes it) and the hygiene validator (byte-compares it) so the two can't drift
// from each other independently. See docs/planning/BACKLOG.md's GENERATED marker.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  GLANCE_BEGIN_MARKER,
  GLANCE_END_MARKER,
  computeBacklogGlance,
  renderBacklogGlanceBlock,
  extractBacklogGlanceBlock,
  replaceBacklogGlanceBlock,
} from "../../tools/lib/backlogGlance.mjs";

const FIXTURE = `# Backlog

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| High | ALPHA-1 — thing | n |
| Medium | BETA-1 — thing | n |
| Low | GAMMA-1 — thing | n |
| 🟡 Partial | DELTA-1 — thing | n |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Low | EPS-1 — thing | n |

## Tech Debt

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | ZED-1 | thing | n |
`;

const CRITICAL_FIXTURE = `# Backlog

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Critical | ALPHA-1 — thing | n |
`;

describe("computeBacklogGlance", () => {
  it("recomputes department rows, priority splits, and total straight from the tables", () => {
    const g = computeBacklogGlance(FIXTURE);
    expect(g.ok).toBe(true);
    expect(g.total).toBe(6);
    expect(g.departments).toEqual([
      { title: "Engineering", open: 4, high: 1, medium: 1, low: 1, partial: 1 },
      { title: "Design / Gameplay", open: 1, high: 0, medium: 0, low: 1, partial: 0 },
      { title: "Tech Debt", open: 1, high: 0, medium: 1, low: 0, partial: 0 },
    ]);
  });

  it("fails closed on a priority the table has no column for, naming the row", () => {
    const g = computeBacklogGlance(CRITICAL_FIXTURE);
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("ALPHA-1");
    expect(g.reason).toContain("Critical");
  });

  it("degrades to zero departments on a table-free doc rather than throwing", () => {
    expect(computeBacklogGlance("# empty")).toEqual({ ok: true, departments: [], total: 0 });
  });
});

describe("renderBacklogGlanceBlock", () => {
  it("renders markers, the table, a (+N partial) suffix, and the short total line", () => {
    const block = renderBacklogGlanceBlock(computeBacklogGlance(FIXTURE));
    const lines = block.split("\n");
    expect(lines[0]).toBe(GLANCE_BEGIN_MARKER);
    expect(lines.at(-1)).toBe(GLANCE_END_MARKER);
    expect(block).toContain("| [Engineering](#engineering) | 4 | 1 | 1 | 1 (+1 partial) |");
    expect(block).toContain("| [Design / Gameplay](#design--gameplay) | 1 | 0 | 0 | 1 |");
    expect(block).toContain("**6 open rows total.**");
  });

  it("decorates Playtest owed with the 🟢 prefix outside the link", () => {
    const g = { departments: [{ title: "Playtest owed", open: 1, high: 0, medium: 0, low: 1, partial: 0 }], total: 1 };
    expect(renderBacklogGlanceBlock(g)).toContain("| 🟢 [Playtest owed](#playtest-owed) | 1 | 0 | 0 | 1 |");
  });

  it("omits the partial suffix when there is none", () => {
    const g = { departments: [{ title: "Art", open: 1, high: 0, medium: 0, low: 1, partial: 0 }], total: 1 };
    expect(renderBacklogGlanceBlock(g)).toContain("| [Art](#art) | 1 | 0 | 0 | 1 |");
  });
});

describe("extractBacklogGlanceBlock / replaceBacklogGlanceBlock", () => {
  it("round-trips: extract(replace(md, X)) === X", () => {
    const md = `before\n${GLANCE_BEGIN_MARKER}\nold\n${GLANCE_END_MARKER}\nafter`;
    const block = renderBacklogGlanceBlock(computeBacklogGlance(FIXTURE));
    const replaced = replaceBacklogGlanceBlock(md, block);
    expect(extractBacklogGlanceBlock(replaced)).toBe(block);
    expect(replaced).toContain("before");
    expect(replaced).toContain("after");
    expect(replaced).not.toContain("old");
  });

  it("extract returns null when either marker is missing", () => {
    expect(extractBacklogGlanceBlock("no markers here")).toBeNull();
    expect(extractBacklogGlanceBlock(`${GLANCE_BEGIN_MARKER}\nno end`)).toBeNull();
  });

  it("replace throws when markers are missing — first-time setup is a deliberate one-time hand-edit", () => {
    expect(() => replaceBacklogGlanceBlock("no markers", "x")).toThrow(/missing the GENERATED counts markers/);
  });
});

describe("live docs/planning/BACKLOG.md", () => {
  const read = () => readFileSync(new URL("../../docs/planning/BACKLOG.md", import.meta.url), "utf8");

  it("computes ok:true with no unrecognized priority", () => {
    expect(computeBacklogGlance(read()).ok).toBe(true);
  });

  it("carries the GENERATED markers and is fresh (this is what `npm run backlog --check` also asserts)", () => {
    const md = read();
    const g = computeBacklogGlance(md);
    expect(extractBacklogGlanceBlock(md)).toBe(renderBacklogGlanceBlock(g));
  });
});
