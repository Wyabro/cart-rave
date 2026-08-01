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
  parseStatusDoNots,
  parseBacklogSections,
  captureTimeMs,
  captureRankMs,
  normalizeCapturedAt,
  preferCaptureLabel,
  parseStatusGotchas,
  parseAgentsSection,
  parseStatusDecisionIndex,
  extractShip1Tag,
  parseBacklogNotTechDebt,
  parseShip1Tiers,
  parseProjectStateHealthy,
  parseAnalyticsCache,
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
  it("splits the focus paragraph into headline + detail, stripping markup", () => {
    const md = `# S\n\n## Current focus\n\n**Run 7 — post friend playtest.** Cold handoff (priority P0→P6):\n[planning/handoff-next-window.md](./planning/handoff-next-window.md).\n\n### Active queue\n`;
    const m = parseStatusCurrentFocus(md);
    expect(m.headline).toBe("Run 7 — post friend playtest");
    // The wrapped second line is part of the same paragraph — it must not be dropped.
    expect(m.detail).toBe("Cold handoff (priority P0→P6): planning/handoff-next-window.md.");
  });

  it("joins a hard-wrapped paragraph instead of truncating at the first physical line", () => {
    const md = `# S\n\n## Current focus\n\nPlaytesting and stabilization — Tier A drained; Tier B/C, the security sweep and the\nanalytics gating are closed. Residual = playtest cards.\n\n### Active queue\n`;
    const m = parseStatusCurrentFocus(md);
    expect(m.headline).toBe(
      "Playtesting and stabilization — Tier A drained; Tier B/C, the security sweep and the analytics gating are closed",
    );
    expect(m.detail).toBe("Residual = playtest cards.");
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

describe("parseStatusDoNots", () => {
  it("extracts the ### Do not list with links flattened, scoped to its section", () => {
    const md = `## Current focus\n\n### Do not\n\nProse intro.\n\n- Ship only on Wyatt's "ship it" — never \`git add -A\`.\n- One card at a time; ideas go to [BACKLOG](./planning/BACKLOG.md).\n\n### Done when\n\n- [ ] not a do-not\n`;
    expect(parseStatusDoNots(md)).toEqual([
      `Ship only on Wyatt's "ship it" — never \`git add -A\`.`,
      "One card at a time; ideas go to BACKLOG.",
    ]);
  });

  it("degrades to [] without the section", () => {
    expect(parseStatusDoNots("# empty doc")).toEqual([]);
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
    expect(now.tag).toBe("ACTIVE CARD");
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

  it("STATUS.md ### Do not list parses non-empty (feeds BRIEFING.md + dashboard firewall)", () => {
    expect(parseStatusDoNots(read("docs/STATUS.md")).length).toBeGreaterThan(0);
  });

  it("docs/BRIEFING.md exists and carries a source digest (freshness is health:check's job)", async () => {
    const { extractBriefingDigest } = await import("../tools/lib/briefing.mjs");
    expect(extractBriefingDigest(read("docs/BRIEFING.md"))).toMatch(/^[0-9a-f]{8}$/);
  });

  it("STATUS.md ## Gotchas parses non-empty (feeds ARCHITECTURE.json pitfalls)", () => {
    expect(parseStatusGotchas(read("docs/STATUS.md")).length).toBeGreaterThan(0);
  });

  it("STATUS.md ## Decision index parses D-* rows non-empty", () => {
    const d = parseStatusDecisionIndex(read("docs/STATUS.md"));
    expect(d.length).toBeGreaterThan(0);
    expect(d[0].id).toMatch(/^D-/);
  });

  it("AGENTS.md invariants / off-limits / execution / routing sections all parse non-empty", () => {
    const md = read("AGENTS.md");
    expect(parseAgentsSection(md, "## ARCHITECTURE INVARIANTS").length).toBeGreaterThan(0);
    expect(parseAgentsSection(md, "## WHAT'S OFF-LIMITS").length).toBeGreaterThan(0);
    expect(parseAgentsSection(md, "## HOW WORK IS EXECUTED").length).toBeGreaterThan(0);
    expect(parseAgentsSection(md, "## MODEL / TOOL ROUTING").length).toBeGreaterThan(0);
  });

  it("BACKLOG.md guardrail table + at least one [SHIP-1 X] tag still parse", () => {
    const md = read("docs/planning/BACKLOG.md");
    expect(parseBacklogNotTechDebt(md).length).toBeGreaterThan(0);
    const tagged = parseBacklogSections(md)
      .flatMap((s) => s.rows)
      .some((r) => extractShip1Tag(`${r.item ?? ""} ${r.notes ?? ""}`));
    expect(tagged).toBe(true);
  });

  it("SHIP-1.md tiers parse into A–E with rows", () => {
    const tiers = parseShip1Tiers(read("docs/planning/SHIP-1.md"));
    expect(tiers.map((t) => t.tier)).toEqual(["A", "B", "C", "D", "E"]);
    expect(tiers.every((t) => t.rows.length > 0)).toBe(true);
  });

  it("project-state.md §5 verified-healthy table parses non-empty", () => {
    expect(parseProjectStateHealthy(read("docs/planning/project-state.md")).length).toBeGreaterThan(0);
  });
});

describe("STATUS semantic contracts (Truth Reset)", () => {
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

  it("phase order is done → current → todo with ≤1 active card and open-only issues", async () => {
    const { evaluateProjectHealth } = await import("../tools/lib/projectHealthValidation.mjs");
    const statusMd = read("docs/STATUS.md");
    const result = evaluateProjectHealth({ statusMd });
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.map((e) => e.code)).toEqual([]);
    const phases = parseStatusReleasePhases(statusMd);
    expect(phases.filter((p) => p.state === "current")[0].name).toMatch(/Playtesting/i);
    expect(parseStatusPlaytestQueue(statusMd).filter((q) => q.state === "active").length).toBeLessThanOrEqual(1);
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

describe("briefing render + freshness contract", () => {
  const STATUS = `# S\n\n### Release phases\n\n- ✅ Foundation — engine\n- ▶ Playtesting — stabilize\n- ⬜ Ship\n\n## Current focus\n\n**Stabilize.** One card at a time.\n\n### Do not\n\n- Ship only on "ship it".\n\n### Active queue\n\n| # | What | Status |\n|---|------|--------|\n| A1 | Countdown fix | ✅ needs Wyatt playtest |\n| A2 | Forensics | ⏳ capture pending |\n\n### Next actions\n\n1. Wait for Wyatt.\n`;

  it("renders a briefing whose digest round-trips through the rendered markdown", async () => {
    const { renderBriefingMd, renderBriefingBody, briefingSourceDigest, extractBriefingDigest } = await import("../tools/lib/briefing.mjs");
    const md = renderBriefingMd(STATUS, { branch: "cart-clash", head: "abc1234", date: "2026-07-21" });
    expect(extractBriefingDigest(md)).toBe(briefingSourceDigest(STATUS));
    expect(md).toContain("▶ Playtesting — stabilize");
    expect(md).toContain("Stabilize");
    expect(md).toContain('Ship only on "ship it".');
    // A1 waits on a human; A2 is agent-side — the split must be visible
    expect(renderBriefingBody(STATUS)).toContain("Waiting on Wyatt");
  });

  it("digest changes when STATUS declarations change, not when the git header does", async () => {
    const { renderBriefingMd, briefingSourceDigest, extractBriefingDigest } = await import("../tools/lib/briefing.mjs");
    const a = renderBriefingMd(STATUS, { head: "abc1234" });
    const b = renderBriefingMd(STATUS, { head: "fff9999" });
    expect(extractBriefingDigest(a)).toBe(extractBriefingDigest(b));
    expect(briefingSourceDigest(STATUS.replace("Stabilize.", "Ship RC."))).not.toBe(briefingSourceDigest(STATUS));
  });

  it("evaluateProjectHealth errors on a missing or stale briefing, passes on a fresh one", async () => {
    const { evaluateProjectHealth } = await import("../tools/lib/projectHealthValidation.mjs");
    const { renderBriefingMd } = await import("../tools/lib/briefing.mjs");
    const codes = (r) => r.findings.filter((f) => f.severity === "error").map((f) => f.code);
    expect(codes(evaluateProjectHealth({ statusMd: STATUS, briefingMd: "" }))).toContain("BRIEFING_MISSING");
    const stale = renderBriefingMd(STATUS.replace("Stabilize.", "Old mission."), {});
    expect(codes(evaluateProjectHealth({ statusMd: STATUS, briefingMd: stale }))).toContain("BRIEFING_STALE");
    const fresh = renderBriefingMd(STATUS, {});
    expect(codes(evaluateProjectHealth({ statusMd: STATUS, briefingMd: fresh }))).toEqual([]);
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

describe("parseStatusGotchas", () => {
  it("pulls the append-only gotchas list, flattening links", () => {
    const md = `# S\n\n## Gotchas (append-only)\n\n- EffectComposer path: RenderPass → Bloom → OutputPass.\n- Levels load via [LEVEL_IMPORTERS](./x.md), not a barrel.\n\n## Last updated\n\n- not a gotcha\n`;
    expect(parseStatusGotchas(md)).toEqual([
      "EffectComposer path: RenderPass → Bloom → OutputPass.",
      "Levels load via LEVEL_IMPORTERS, not a barrel.",
    ]);
  });
  it("degrades to [] without the section", () => {
    expect(parseStatusGotchas("# empty")).toEqual([]);
  });
});

describe("parseAgentsSection", () => {
  const md = `# AGENTS\n\n## ARCHITECTURE INVARIANTS\n\n- **Host-authoritative.** The first client runs Rapier.\n- The server never simulates physics — see [x](./x.md).\n\n## WHAT'S OFF-LIMITS\n\n- Do not recreate deleted files.\n`;
  it("reads a heading's bullets generically, links flattened + bold stripped", () => {
    expect(parseAgentsSection(md, "## ARCHITECTURE INVARIANTS")).toEqual([
      "Host-authoritative. The first client runs Rapier.",
      "The server never simulates physics — see x.",
    ]);
    expect(parseAgentsSection(md, "## WHAT'S OFF-LIMITS")).toEqual(["Do not recreate deleted files."]);
  });
  it("degrades to [] on an absent heading", () => {
    expect(parseAgentsSection(md, "## NOPE")).toEqual([]);
  });
});

describe("parseStatusDecisionIndex", () => {
  it("parses `- **D-X** (MM-DD): text` rows into id/date/text", () => {
    const md = `# S\n\n## Decision index\n\nNewest first.\n\n- **D-PARITY-1** (07-21): Operational parity across [tools](./x.md).\n- **D-SHIP-1** (07-20): SHIP-1 living finish line.\n\n## Hard rules\n`;
    const d = parseStatusDecisionIndex(md);
    expect(d).toHaveLength(2);
    expect(d[0]).toEqual({ id: "D-PARITY-1", date: "07-21", text: "Operational parity across tools." });
    expect(d[1].id).toBe("D-SHIP-1");
  });
  it("degrades to [] without the section", () => {
    expect(parseStatusDecisionIndex("# none")).toEqual([]);
  });
});

describe("extractShip1Tag", () => {
  it("returns the tier token or null", () => {
    expect(extractShip1Tag("MP-FX-1 — non-host VFX `[SHIP-1 A3]`")).toBe("A3");
    expect(extractShip1Tag("TRUST-1 [SHIP-1 D1]")).toBe("D1");
    expect(extractShip1Tag("untagged row")).toBeNull();
  });
});

describe("parseBacklogNotTechDebt", () => {
  it("parses the guardrail table into topic/why rows", () => {
    const md = `# B\n\n### Explicitly *not* tech debt (do not "modernize" these)\n\n| Topic | Why leave it |\n|-------|----------------|\n| Host-only Rapier | Architecture invariant — [AGENTS.md](../x.md). |\n| Zustand + KO reactors | Current and coherent. |\n\n## Future\n`;
    expect(parseBacklogNotTechDebt(md)).toEqual([
      { topic: "Host-only Rapier", why: "Architecture invariant — AGENTS.md." },
      { topic: "Zustand + KO reactors", why: "Current and coherent." },
    ]);
  });
  it("degrades to [] without the section", () => {
    expect(parseBacklogNotTechDebt("# none")).toEqual([]);
  });
});

describe("parseShip1Tiers", () => {
  it("collects each `## Tier X — title` heading with its first table", () => {
    const md = `# SHIP-1\n\n## Tier A — Stability & reach\n\n| # | Item | Notes |\n|---|------|-------|\n| A1 | Host hitch | forensics |\n| A2 | INPUT-KB-1 | keyboard |\n\n## Tier B — Depth\n\n| # | Item |\n|---|------|\n| B1 | AI-DIFF-1 |\n\n## Post-launch\n`;
    const tiers = parseShip1Tiers(md);
    expect(tiers.map((t) => t.tier)).toEqual(["A", "B"]);
    expect(tiers[0].title).toBe("Stability & reach");
    expect(tiers[0].rows).toHaveLength(2);
    expect(tiers[0].rows[0].item).toBe("Host hitch");
    expect(tiers[1].rows[0].item).toBe("AI-DIFF-1");
  });
  it("degrades to [] without tier headings", () => {
    expect(parseShip1Tiers("# no tiers")).toEqual([]);
  });
});

describe("parseProjectStateHealthy", () => {
  it("parses the §5 verified-healthy table into area/verdict", () => {
    const md = `# PS\n\n## 5. Verified healthy / non-issues\n\nProse.\n\n| Area | Verdict |\n|------|---------|\n| SD spectator KO spam | Fixed; regression tests cover it |\n| Solo AI rubberband in MP | Safe — solo-gated |\n\n## 6. Dev workflow\n`;
    expect(parseProjectStateHealthy(md)).toEqual([
      { area: "SD spectator KO spam", verdict: "Fixed; regression tests cover it" },
      { area: "Solo AI rubberband in MP", verdict: "Safe — solo-gated" },
    ]);
  });
  it("degrades to [] without the section", () => {
    expect(parseProjectStateHealthy("# none")).toEqual([]);
  });
});

describe("parseAnalyticsCache", () => {
  it("accepts schema with optional window", () => {
    const raw = {
      pulledAt: "2026-07-22T00:00:00.000Z",
      url: "https://example.test",
      summary: { sessions: 0, clients: 0 },
    };
    expect(parseAnalyticsCache(raw)).toEqual(raw);
    expect(parseAnalyticsCache(raw)?.summary.window).toBeUndefined();
  });

  it("rejects corrupt cache", () => {
    expect(parseAnalyticsCache({ pulledAt: "x", url: "y", summary: null })).toBeNull();
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
