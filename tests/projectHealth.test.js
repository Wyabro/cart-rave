// projectHealth.test.js — the pure markdown parsers behind the generated dashboard.
// The collectors (git/fs) are exercised by running `npm run dashboard`; these tests pin
// the parsing of the two hand-maintained sources of truth (STATUS.md, BACKLOG.md) so a
// formatting drift breaks a test instead of silently emptying a dashboard section.

import { describe, it, expect } from "vitest";
import {
  extractSection,
  parseMarkdownTable,
  parseListItems,
  parseStatusOpenIssues,
  parseBacklogSections,
} from "../tools/lib/projectHealth.mjs";

const STATUS_FIXTURE = `# Cart Clash — Status

## Current focus

Some prose.

### Wyatt playtest queue (one session can cover all of it)

1. **Stabilization pass (pushed)** — wheel spin direction by eye.
2. **Pass 4 (gameplay/AI)** — stall-free bots.

### Next actions

1. Drain the playtest queue above → apply taste tuning.
2. Close **NET-1**: two-browser full-round smoke.

## Open issues (top)

Full categorized backlog: [BACKLOG](./planning/BACKLOG.md).

| ID | Issue | Status |
|----|--------|--------|
| NET-1 | Two-browser full-round smoke | ❌ **The V2 gate.** |
| VFX-1 | Black-frame flicker | 🟡 Root cause found |

## Recommended next milestone

More prose.
`;

const BACKLOG_FIXTURE = `# Backlog

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Critical | Fix the thing | soon |
| Low | Polish the other thing | later |

## Tech Debt

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | MAIN-1 | Carve main.js seam | post-gate |
`;

describe("extractSection", () => {
  it("returns the body up to the next same-level heading", () => {
    const s = extractSection(STATUS_FIXTURE, "## Open issues");
    expect(s).toContain("| NET-1 |");
    expect(s).not.toContain("Recommended next milestone");
  });

  it("matches heading prefixes (suffix text tolerated) and returns null when absent", () => {
    expect(extractSection(STATUS_FIXTURE, "### Wyatt playtest queue")).toContain("Stabilization");
    expect(extractSection(STATUS_FIXTURE, "## Nope")).toBeNull();
  });

  it("### sections end at the next ## heading", () => {
    const s = extractSection(STATUS_FIXTURE, "### Next actions");
    expect(s).toContain("NET-1");
    expect(s).not.toContain("| NET-1 |"); // the table lives in the next ## section
  });
});

describe("parseMarkdownTable", () => {
  it("parses rows keyed by normalized headers, skipping the separator", () => {
    const rows = parseMarkdownTable(extractSection(STATUS_FIXTURE, "## Open issues"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "NET-1", issue: "Two-browser full-round smoke", status: "❌ **The V2 gate.**" });
  });

  it("returns [] when there is no table", () => {
    expect(parseMarkdownTable("just prose\nmore prose")).toEqual([]);
  });
});

describe("parseListItems", () => {
  it("parses numbered and bulleted items, stripping bold markup", () => {
    expect(parseListItems(extractSection(STATUS_FIXTURE, "### Next actions"))).toEqual([
      "Drain the playtest queue above → apply taste tuning.",
      "Close NET-1: two-browser full-round smoke.",
    ]);
    expect(parseListItems("- alpha\n* beta\nprose")).toEqual(["alpha", "beta"]);
  });
});

describe("parseStatusOpenIssues", () => {
  it("normalizes the open-issues table", () => {
    const issues = parseStatusOpenIssues(STATUS_FIXTURE);
    expect(issues.map((i) => i.id)).toEqual(["NET-1", "VFX-1"]);
    expect(issues[1].status).toContain("🟡");
  });

  it("degrades to [] on a STATUS without the section", () => {
    expect(parseStatusOpenIssues("# empty doc")).toEqual([]);
  });
});

describe("parseBacklogSections", () => {
  it("collects each discipline's rows and priority counts", () => {
    const sections = parseBacklogSections(BACKLOG_FIXTURE);
    expect(sections.map((s) => s.title)).toEqual(["Engineering", "Tech Debt"]);
    expect(sections[0].counts).toEqual({ Critical: 1, Low: 1 });
    expect(sections[1].rows[0].id).toBe("MAIN-1");
  });
});
