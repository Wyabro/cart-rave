// projectHealth.test.js — the pure markdown parsers behind the generated dashboard.
// The collectors (git/fs) are exercised by running `npm run dashboard`; these tests pin
// the parsing of the two hand-maintained sources of truth (STATUS.md, BACKLOG.md) so a
// formatting drift breaks a test instead of silently emptying a dashboard section.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  extractSection,
  parseMarkdownTable,
  parseListItems,
  parseStatusOpenIssues,
  parseStatusPlaytestQueue,
  parseStatusCurrentFocus,
  queueRowState,
  compressIssueStatus,
  issueState,
  parseStatusReleasePhases,
  parseStatusDoneWhen,
  parseStatusLastUpdated,
  extractBacktickSymbols,
  deriveNextAction,
  parseHandoffBriefing,
  parseBacklogSections,
  captureTimeMs,
  captureRankMs,
  normalizeCapturedAt,
  preferCaptureLabel,
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

const STATUS_ACTIVE_QUEUE_FIXTURE = `# Cart Clash — Status

## Current focus

### Active queue (strict — one at a time)

| # | What | Status |
|---|------|--------|
| 1…2d′ | Prior combat stack | ✅ shipped |
| **P0** | **Host multi-s freezes under 2-human** (4090) | ▶️ **Menu card coded (unpushed)** |
| NET-1 | Two-human full-round smoke | after P0–P1 green |

### Next actions

1. Ship it.
`;

const HANDOFF_FIXTURE = `# Handoff — next agent window (Run 7 · P0 mid-flight)

**Date:** 2026-07-19 (P0 menu card coded — unpushed)
**Branch:** \`cart-clash\`
**Origin HEAD:** **\`5bfe7e5\`** (prod still this until ship)
**Prod:** https://cart-rave.wyabro.workers.dev
**Read order:** this file → STATUS.md → AGENTS.md

**Do not** re-triage run-1…run-6 from scratch.
**Do not** multi-lever dump — one card at a time.
**Ship only on Wyatt "ship it."**

---

## One rule

**Do not** get parsed — this is below the fold.
`;

describe("parseStatusPlaytestQueue", () => {
  it("parses the run-7 Active queue table into structured rows with states", () => {
    const q = parseStatusPlaytestQueue(STATUS_ACTIVE_QUEUE_FIXTURE);
    expect(q).toHaveLength(3);
    expect(q[1]).toEqual({
      id: "P0",
      what: "Host multi-s freezes under 2-human (4090)",
      status: "▶️ Menu card coded (unpushed)",
      state: "active",
    });
    expect(q.map((r) => r.state)).toEqual(["done", "active", "waiting"]);
  });

  it("falls back to the legacy Wyatt playtest queue list as waiting rows", () => {
    const q = parseStatusPlaytestQueue(STATUS_FIXTURE);
    expect(q[0].what).toContain("Stabilization pass");
    expect(q[0].state).toBe("waiting");
  });

  it("degrades to [] when neither heading exists", () => {
    expect(parseStatusPlaytestQueue("# empty doc")).toEqual([]);
  });
});

describe("queueRowState", () => {
  it("buckets by attention state", () => {
    expect(queueRowState("▶️ **Menu card coded**")).toBe("active");
    expect(queueRowState("✅ shipped (death spiral → skip-gap)")).toBe("done");
    expect(queueRowState("locked until P0")).toBe("locked");
    expect(queueRowState("locked / parked")).toBe("locked");
    expect(queueRowState("after P0–P1 green")).toBe("waiting");
    expect(queueRowState("")).toBe("waiting");
  });
});

describe("parseStatusCurrentFocus", () => {
  it("splits the focus line into headline + detail, stripping markup", () => {
    const md = `# S\n\n## Current focus\n\n**Run 7 — post friend playtest.** Cold handoff (priority P0→P6):\n[planning/handoff-next-window.md](./planning/handoff-next-window.md).\n\n### Active queue\n`;
    const m = parseStatusCurrentFocus(md);
    expect(m.headline).toBe("Run 7 — post friend playtest");
    expect(m.detail).toBe("Cold handoff (priority P0→P6)");
  });

  it("degrades to null without the section or a usable line", () => {
    expect(parseStatusCurrentFocus("# nothing")).toBeNull();
    expect(parseStatusCurrentFocus("## Current focus\n\n")).toBeNull();
  });
});

describe("compressIssueStatus / issueState", () => {
  it("strips markup, collapses whitespace, truncates at a word boundary", () => {
    const long = `❌ **The V2 gate.** Code hardened + unit-covered (\`1dbb48a\`); hazard catalog: [netcode-deep-dive.md](./x.md). ${"word ".repeat(60)}`;
    const out = compressIssueStatus(long, 80);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("](");
    expect(out).not.toContain("**");
  });

  it("buckets issue states by leading emoji", () => {
    expect(issueState("❌ Open — ghost colliders")).toBe("open");
    expect(issueState("🟡 Partial")).toBe("partial");
    expect(issueState("⚠️ Run-5/6 evidence.")).toBe("warn");
    expect(issueState("✅ Fixed 2026-07-14")).toBe("closed");
    expect(issueState("🧊 Frozen until cutover")).toBe("parked");
    expect(issueState("📋 Post-gate")).toBe("parked");
    expect(issueState("whatever")).toBe("other");
  });
});

describe("parseHandoffBriefing", () => {
  it("extracts title, header facts, and do-not rules (header only)", () => {
    const b = parseHandoffBriefing(HANDOFF_FIXTURE);
    expect(b.title).toBe("Handoff — next agent window (Run 7 · P0 mid-flight)");
    expect(b.facts.find((f) => f.key === "Origin HEAD").value).toContain("5bfe7e5");
    expect(b.doNots).toEqual([
      "re-triage run-1…run-6 from scratch",
      "multi-lever dump — one card at a time",
      'Ship only on Wyatt "ship it."',
    ]);
    // below-the-fold bold "Do not" must not leak into the briefing
    expect(b.doNots.join(" ")).not.toContain("below the fold");
  });

  it("degrades to null on an empty/absent doc", () => {
    expect(parseHandoffBriefing("")).toBeNull();
    expect(parseHandoffBriefing(null)).toBeNull();
  });
});

describe("parseStatusReleasePhases", () => {
  const md = `# S\n\n### Release phases\n\nOrientation only.\n\n- ✅ Foundation — engine\n- ▶ Playtesting — Run 7\n- ⬜ Ship — cutover\n\n## Next\n`;
  it("maps markers to states and ignores prose", () => {
    expect(parseStatusReleasePhases(md)).toEqual([
      { name: "Foundation — engine", state: "done" },
      { name: "Playtesting — Run 7", state: "current" },
      { name: "Ship — cutover", state: "todo" },
    ]);
  });
  it("degrades to [] without the section", () => {
    expect(parseStatusReleasePhases("# nope")).toEqual([]);
  });
});

describe("parseStatusDoneWhen", () => {
  it("parses checkboxes with markup stripped", () => {
    const md = `### Done when (this mission)\n\nProse.\n\n- [x] Combat validated (**cap-16**)\n- [ ] NET-1 green ([smoke](./x.md))\n`;
    expect(parseStatusDoneWhen(md)).toEqual([
      { text: "Combat validated (cap-16)", done: true },
      { text: "NET-1 green (smoke)", done: false },
    ]);
  });
});

describe("parseStatusLastUpdated", () => {
  it("extracts date, label, and a compressed summary from the first entry", () => {
    const md = `## Last updated\n\n2026-07-19 (Command Center v2 — **unpushed**) — The v1 page was a status report; v2 is organized by decision frequency. More text here.\nSecond line of same paragraph.\n\n2026-07-18 (older) — ignored.\n`;
    const e = parseStatusLastUpdated(md);
    expect(e.when).toBe("2026-07-19");
    expect(e.label).toContain("Command Center v2");
    expect(e.summary).toContain("decision frequency");
    expect(e.summary).not.toContain("ignored");
  });
  it("degrades to null without the section", () => {
    expect(parseStatusLastUpdated("# none")).toBeNull();
  });
});

describe("extractBacktickSymbols", () => {
  it("dedupes across texts and caps the list", () => {
    expect(extractBacktickSymbols("warm in \`bootstrapWorldCore\`", "\`bootstrapWorldCore\` + \`index-D3QXm4Qq.js\`", null)).toEqual([
      "bootstrapWorldCore",
      "index-D3QXm4Qq.js",
    ]);
  });
});

describe("deriveNextAction", () => {
  it("red battery gate beats STATUS next actions", () => {
    const h = {
      battery: { latest: { results: [{ name: "netharness spawnlock", code: 1, note: "joiner froze" }] } },
      issues: { nextActions: ["Ship it."], playtestQueue: [] },
    };
    const now = deriveNextAction(h);
    expect(now.tag).toBe("RED GATE");
    expect(now.text).toContain("spawnlock");
  });
  it("prefers the active queue card over fallback next actions", () => {
    const active = { id: "P0", what: "Host freezes", status: "▶️ coded", state: "active" };
    const now = deriveNextAction({
      issues: { nextActions: ["Optional polish."], playtestQueue: [active] },
    });
    expect(now.kind).toBe("queue");
    expect(now.text).toBe("P0 — Host freezes");
  });
  it("splits next-action #1 on Expect: and strips links", () => {
    const h = {
      battery: { latest: { results: [{ name: "x", code: 0, note: "" }] } },
      issues: { nextActions: ["Ship [the card](./x.md) then retest. Expect: no multi-s longtask."], playtestQueue: [] },
    };
    const now = deriveNextAction(h);
    expect(now.text).toBe("Ship the card then retest");
    expect(now.expect).toBe("no multi-s longtask.");
  });
  it("treats wait/ask next-actions as no active card", () => {
    const now = deriveNextAction({
      issues: { nextActions: ["Wait for Wyatt to name the next card."], playtestQueue: [] },
    });
    expect(now.kind).toBe("none");
  });
  it("falls back to the active queue card, then to a pointer at STATUS", () => {
    const active = { id: "P0", what: "Host freezes", status: "▶️ coded", state: "active" };
    expect(deriveNextAction({ issues: { nextActions: [], playtestQueue: [active] } }).text).toBe("P0 — Host freezes");
    expect(deriveNextAction({ issues: { nextActions: [], playtestQueue: [] } }).kind).toBe("none");
  });
  it("an INCONCLUSIVE rig (code 3, starved environment) never fabricates a RED GATE", () => {
    const h = {
      battery: { latest: { results: [{ name: "teardownRejoin", code: 3, note: "starved" }, { name: "spawnlock", code: 0, note: "" }] } },
      issues: { nextActions: ["Retest the card."], playtestQueue: [] },
    };
    const now = deriveNextAction(h);
    expect(now.tag).toBe("DO THIS NOW");
    expect(now.text).toBe("Retest the card");
  });
});

// * Anti-drift canaries: the fixtures above pin parser BEHAVIOR; these pin the REAL
// * docs against the parsers, so a heading rename in STATUS.md/handoff breaks the gate
// * instead of silently emptying a Command Center section (exactly what happened when
// * "### Wyatt playtest queue" became "### Active queue").
describe("live-doc canaries (real docs/ vs parsers)", () => {
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

  it("STATUS.md open issues + next actions still parse non-empty", () => {
    const md = read("docs/STATUS.md");
    expect(parseStatusOpenIssues(md).length).toBeGreaterThan(0);
    expect(parseListItems(extractSection(md, "### Next actions") ?? "").length).toBeGreaterThan(0);
  });

  it("STATUS.md queue heading, when present, yields rows", () => {
    const md = read("docs/STATUS.md");
    const hasHeading = /^### (Active queue|Wyatt playtest queue)/m.test(md);
    if (hasHeading) expect(parseStatusPlaytestQueue(md).length).toBeGreaterThan(0);
  });

  it("STATUS.md Current focus still yields a mission headline", () => {
    const m = parseStatusCurrentFocus(read("docs/STATUS.md"));
    expect(m).not.toBeNull();
    expect(m.headline.length).toBeGreaterThan(3);
  });

  it("STATUS.md release phases parse with exactly one ▶ current", () => {
    const phases = parseStatusReleasePhases(read("docs/STATUS.md"));
    expect(phases.length).toBeGreaterThanOrEqual(3);
    expect(phases.filter((p) => p.state === "current")).toHaveLength(1);
  });

  it("STATUS.md done-when checklist parses non-empty", () => {
    expect(parseStatusDoneWhen(read("docs/STATUS.md")).length).toBeGreaterThan(0);
  });

  it("STATUS.md last-updated entry parses with a date", () => {
    const e = parseStatusLastUpdated(read("docs/STATUS.md"));
    expect(e).not.toBeNull();
    expect(e.when).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("BACKLOG.md still parses into discipline sections", () => {
    expect(parseBacklogSections(read("docs/planning/BACKLOG.md")).length).toBeGreaterThan(0);
  });

  it("handoff-next-window.md still yields a briefing", () => {
    const b = parseHandoffBriefing(read("docs/planning/handoff-next-window.md"));
    expect(b).not.toBeNull();
    expect(b.facts.length).toBeGreaterThan(0);
  });
});

describe("STATUS semantic contracts (Truth Reset)", () => {
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

  it("phase order is done → current → todo with ≤1 active card and open-only issues", async () => {
    const { evaluateProjectHealth } = await import("../tools/lib/projectHealthValidation.mjs");
    const statusMd = read("docs/STATUS.md");
    const handoffMd = read("docs/planning/handoff-next-window.md");
    const result = evaluateProjectHealth({ statusMd, handoffMd });
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.map((e) => e.code)).toEqual([]);
    const phases = parseStatusReleasePhases(statusMd);
    expect(phases.filter((p) => p.state === "current")[0].name).toMatch(/Playtesting/i);
    expect(parseStatusPlaytestQueue(statusMd).filter((q) => q.state === "active")).toHaveLength(0);
    for (const i of parseStatusOpenIssues(statusMd)) {
      expect(issueState(i.status)).not.toBe("closed");
    }
  });

  it("STATUS Project health does not hand-claim origin HEAD or qa green", () => {
    const md = read("docs/STATUS.md");
    const health = extractSection(md, "## Project health") ?? "";
    expect(health).not.toMatch(/Gates\s*\(`npm run qa`\)\s*\|\s*✅/i);
    expect(health).not.toMatch(/origin\/cart-clash\b.*`[0-9a-f]{7,}`/i);
  });

  it("mission agrees with Playtesting phase (not RC)", () => {
    const md = read("docs/STATUS.md");
    const mission = parseStatusCurrentFocus(md);
    expect(mission?.headline).toMatch(/stabil/i);
    expect(mission?.headline).not.toMatch(/^Release candidate/i);
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

describe("capture triage helpers (F1/F2)", () => {
  it("captureTimeMs accepts epoch ms and ISO", () => {
    expect(captureTimeMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(captureTimeMs("2026-07-18T12:00:00.000Z")).toBe(Date.parse("2026-07-18T12:00:00.000Z"));
    expect(captureTimeMs(null)).toBeNull();
    expect(captureTimeMs("not-a-date")).toBeNull();
  });

  it("captureRankMs prefers sidecar received over mtime (bulk pull safety)", () => {
    const pullMtime = new Date("2026-07-19T23:00:00.000Z");
    const olderReceived = Date.parse("2026-07-10T12:00:00.000Z");
    expect(captureRankMs({ received: olderReceived }, pullMtime)).toBe(olderReceived);
    expect(captureRankMs(null, pullMtime)).toBe(pullMtime.getTime());
    expect(captureRankMs({ client_ts: olderReceived }, pullMtime)).toBe(olderReceived);
  });

  it("normalizeCapturedAt never leaves a bare epoch number for sorting", () => {
    const iso = normalizeCapturedAt(null, 1_700_000_000_000, new Date("2020-01-01T00:00:00.000Z"));
    expect(iso).toBe(new Date(1_700_000_000_000).toISOString());
    expect(Date.parse(iso)).toBe(1_700_000_000_000);
  });

  it("preferCaptureLabel uses meta label over F8 scenario manual", () => {
    expect(preferCaptureLabel("manual", "running-host-high")).toBe("running-host-high");
    expect(preferCaptureLabel("roundflow", null)).toBe("roundflow");
    expect(preferCaptureLabel("manual", "  ")).toBe("manual");
    expect(preferCaptureLabel(null, null)).toBeNull();
  });

  it("rank-then-slice prefers true capture time over fresher mtime", () => {
    // * Simulates: bulk pull rewrote 20 old F8 mtimes; one local harness is older on disk
    // * but newer by capture time (and has no sidecar → rank = mtime of harness).
    // * Old F8s keep low rankMs via received even if mtime is "now".
    const now = Date.parse("2026-07-19T20:00:00.000Z");
    const rows = [
      { id: "old-f8", rankMs: captureRankMs({ received: now - 86_400_000 }, new Date(now)) },
      { id: "local", rankMs: captureRankMs(null, new Date(now - 60_000)) },
      { id: "new-f8", rankMs: captureRankMs({ received: now - 10_000 }, new Date(now)) },
    ];
    rows.sort((a, b) => b.rankMs - a.rankMs);
    expect(rows.map((r) => r.id)).toEqual(["new-f8", "local", "old-f8"]);
  });
});
