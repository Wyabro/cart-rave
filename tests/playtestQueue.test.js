// playtestQueue.test.js — pure seed rules for the generated playtest console.

import { describe, it, expect } from "vitest";
import { blockedOnWyatt, extractWorkId } from "../tools/lib/projectHealth.mjs";
import {
  backlogRowOwesPlaytest,
  cardsFromStatus,
  cardsFromBacklog,
  buildPlaytestQueue,
  classifyRig,
  parseOwedCheck,
  f8LabelFor,
  multiIssueWarnings,
} from "../tools/lib/playtestQueue.mjs";

describe("blockedOnWyatt", () => {
  it("matches Owed / needs Wyatt playtest phrases", () => {
    expect(blockedOnWyatt("Owed: Wyatt playtest — PRE-PODIUM-1 — confetti")).toBe(true);
    expect(blockedOnWyatt("needs Wyatt's playtest on prod")).toBe(true);
    expect(blockedOnWyatt("playtest requested")).toBe(true);
  });

  it("does not match closed PASS rows", () => {
    expect(blockedOnWyatt("✅ CLOSED — Wyatt playtest PASS on phone")).toBe(false);
    expect(blockedOnWyatt("✅ PASS (Wyatt playtest 07-22)")).toBe(false);
  });
});

describe("extractWorkId / f8LabelFor", () => {
  it("pulls first work id", () => {
    expect(extractWorkId("PRE-PODIUM-1 — confetti missing")).toBe("PRE-PODIUM-1");
    expect(extractWorkId("no id here")).toBe(null);
  });

  it("builds f8 labels", () => {
    expect(f8LabelFor("PRE-PODIUM-1")).toBe("pt-pre-podium-1");
    expect(f8LabelFor("PRE-PODIUM-1", "run9")).toBe("pt-pre-podium-1-run9");
  });
});

describe("backlogRowOwesPlaytest", () => {
  it("requires an owed phrase in notes", () => {
    expect(backlogRowOwesPlaytest("FOO-1 — bar", "just a note")).toBe(false);
    expect(backlogRowOwesPlaytest("FOO-1 — bar", "Owed: Wyatt playtest — check confetti")).toBe(true);
  });
});

describe("classifyRig", () => {
  it("defaults to solo", () => {
    expect(classifyRig("FOO-1 — check the thing").rig).toBe("solo");
    expect(classifyRig("").via).toBe("default");
  });

  it("hints mp from two-machine phrasing", () => {
    expect(classifyRig("1. Two clients, same friends room on prod.")).toEqual({ rig: "mp", via: "hint" });
    expect(classifyRig("hard-refresh both machines").rig).toBe("mp");
    expect(classifyRig("Non-host on a clean end: normal podium").rig).toBe("mp");
  });

  it("does NOT treat bare MP as a hint", () => {
    // CAM-READY-1 ends "MP countdown unchanged"; FV-WILT-1's owed line says
    // "winnerSlotIndex on MP". Both would false-classify on a bare \bMP\b token.
    expect(classifyRig("Quit mid-hold — no stuck HUD. MP countdown unchanged.").rig).toBe("solo");
    expect(classifyRig("win/lose FX + winnerSlotIndex on MP.").rig).toBe("solo");
  });

  it("explicit tags beat the hint in both directions", () => {
    // ROUND-WEDGE-1: step 5 says "Non-host (or second client)" but the evidence
    // bar is host-side only, so the tag has to win or the card sinks.
    expect(classifyRig("ROUND-WEDGE-1 `[solo]`\n5. Non-host (or second client)")).toEqual({
      rig: "solo",
      via: "tag",
    });
    expect(classifyRig("FV-WILT-1 `[2pc]` — winnerSlotIndex on MP")).toEqual({ rig: "mp", via: "tag" });
    expect(classifyRig("FOO-1 [1pc] — two clients").rig).toBe("solo");
  });

  it("resolves a contradictory double tag toward mp", () => {
    // Authoring error; false-solo costs a sitting without the second machine.
    expect(classifyRig("FOO-1 [solo] [2pc]").rig).toBe("mp");
  });
});

describe("parseOwedCheck", () => {
  const sundial =
    "**Owed: Wyatt playtest — SUNDIAL-PT-1 — Sundial Station looks and plays right.**" +
    "<br>1. Open Sundial on prod (hard-refresh). Walk the deck a bit." +
    "<br>2. Check the hologram reads like a **projection**, not a floating prop." +
    "<br>3. Drive into the gnomon/spindle — you should **hit** it (collider), not ghost through.";

  it("keeps every step — the old 200-char cut dropped instructions", () => {
    const { goal, steps } = parseOwedCheck(sundial, "SUNDIAL-PT-1");
    expect(goal).toBe("Sundial Station looks and plays right.");
    expect(steps).toHaveLength(3);
    expect(steps[2]).toContain("ghost through");
  });

  it("drops the Owed / id ceremony and inline markup", () => {
    const { goal, steps } = parseOwedCheck(sundial, "SUNDIAL-PT-1");
    expect(goal).not.toMatch(/owed|wyatt|SUNDIAL-PT-1/i);
    expect(`${goal}${steps.join("")}`).not.toMatch(/\*\*|<br>/);
  });

  it("splits trailing context off the headline sentence", () => {
    const { goal, context } = parseOwedCheck(
      "Owed: Wyatt playtest — FV-LOAD-1 — mode-entry loading per arena. Retest after Waves 1-3.<br>1. Enter Cart Rave twice.",
      "FV-LOAD-1",
    );
    expect(goal).toBe("mode-entry loading per arena.");
    expect(context).toBe("Retest after Waves 1-3.");
  });

  it("keeps closing prose after the list as a tail", () => {
    const { steps, tail } = parseOwedCheck(
      "Owed: Wyatt playtest — W-1 — no flicker.<br>1. Play a round.<br>**cap-217 stays open until you say PASS.**",
      "W-1",
    );
    expect(steps).toEqual(["Play a round."]);
    expect(tail).toBe("cap-217 stays open until you say PASS.");
  });

  it("survives a cell with no steps at all", () => {
    const { goal, steps, tail } = parseOwedCheck("Owed: Wyatt playtest — just look at it.", "X-1");
    expect(goal).toBe("just look at it.");
    expect(steps).toEqual([]);
    expect(tail).toBe("");
  });
});

describe("cardsFromStatus / cardsFromBacklog", () => {
  const status = `# Status

### Active queue

| # | What | Status |
|---|------|--------|
| **PRE-PODIUM-1** | confetti missing pre-podium | Owed: Wyatt playtest — solo + MP |
| **HUD-FEED-1** | kill feed | ✅ CLOSED — Wyatt playtest PASS |
| **LOCKED-1** | parked | 🚫 locked / parked |

## Open issues (top)

| ID | Issue | Status |
|----|--------|--------|
| CAM-OPEN-1 | camera buffer | needs Wyatt's playtest after ship |
`;

  const backlog = `# Backlog

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| High | PRE-PODIUM-1 — confetti (dup) | Owed: Wyatt playtest — should lose to STATUS |
| High | MENU-LOCK-HINT-1 — locked levels | Owed: Wyatt playtest — tap locked arena |
| Low | SKIP-1 — no playtest | just an idea |
`;

  it("seeds STATUS owed rows and skips PASS / locked", () => {
    const cards = cardsFromStatus(status);
    const ids = cards.map((c) => c.id);
    expect(ids).toContain("PRE-PODIUM-1");
    expect(ids).toContain("CAM-OPEN-1");
    expect(ids).not.toContain("HUD-FEED-1");
    expect(ids).not.toContain("LOCKED-1");
  });

  it("seeds BACKLOG owed rows", () => {
    const cards = cardsFromBacklog(backlog);
    const ids = cards.map((c) => c.id);
    expect(ids).toContain("MENU-LOCK-HINT-1");
    expect(ids).toContain("PRE-PODIUM-1");
    expect(ids).not.toContain("SKIP-1");
  });

  it("merges with STATUS winning + PREFLIGHT/EXPORT bookends", () => {
    const { cards } = buildPlaytestQueue({ statusMd: status, backlogMd: backlog });
    expect(cards[0].id).toBe("PREFLIGHT");
    expect(cards[cards.length - 1].id).toBe("EXPORT");
    const pre = cards.find((c) => c.id === "PRE-PODIUM-1");
    expect(pre?.source).toBe("status");
    expect(cards.some((c) => c.id === "MENU-LOCK-HINT-1")).toBe(true);
  });

  it("sorts solo cards before two-machine cards, alphabetical inside each group", () => {
    const statusMd = `# Status

### Active queue

| # | What | Status |
|---|------|--------|
| **ZED-1** | last alphabetically, solo | Owed: Wyatt playtest — one machine |
| **ALPHA-MP-1** | first alphabetically, two clients | Owed: Wyatt playtest — two clients on prod |
`;
    const { cards } = buildPlaytestQueue({ statusMd, backlogMd: "# empty\n" });
    const ids = cards.map((c) => c.id);
    expect(ids).toEqual(["PREFLIGHT", "ZED-1", "ALPHA-MP-1", "EXPORT"]);
    expect(cards.find((c) => c.id === "ALPHA-MP-1")?.rig).toBe("mp");
    expect(cards.find((c) => c.id === "ZED-1")?.rig).toBe("solo");
  });

  it("takes the human checklist from BACKLOG when STATUS owns the card", () => {
    // ROUND-WEDGE-1's shape: STATUS describes it in netcode internals, the
    // executable steps only exist in BACKLOG. The card must show the steps.
    const statusMd = `# Status

## Open issues (top)

| ID | Issue | Status |
|----|--------|--------|
| WEDGE-1 | podium storm | 🟡 Owed: Wyatt playtest — Phase B code shipped — src/utils/podiumEndLatch.js wire in endRound |
`;
    const backlogMd = `# Backlog

## Playtest owed

| Pri | Item | Notes |
|-----|------|-------|
| High | WEDGE-1 — no podium flicker storm | Owed: Wyatt playtest — results screen stays put.<br>1. Hard-refresh prod as host.<br>2. Play a timed round to 0:00. |
`;
    const { cards } = buildPlaytestQueue({ statusMd, backlogMd });
    const wedge = cards.find((c) => c.id === "WEDGE-1");
    expect(wedge?.source).toBe("status-issue");
    expect(wedge?.do).toBe("results screen stays put.");
    expect(wedge?.steps).toEqual(["Hard-refresh prod as host.", "Play a timed round to 0:00."]);
    expect(wedge?.do).not.toMatch(/podiumEndLatch|endRound/);
  });

  it("keeps a BACKLOG rig tag when the STATUS row wins the id merge", () => {
    // ROUND-WEDGE-1's shape: STATUS owns the card, the `[solo]` tag lives in BACKLOG.
    const statusMd = `# Status

## Open issues (top)

| ID | Issue | Status |
|----|--------|--------|
| WEDGE-1 | podium storm | Owed: Wyatt playtest — host oscillation |
`;
    const backlogMd = `# Backlog

## Playtest owed

| Pri | Item | Notes |
|-----|------|-------|
| High | WEDGE-1 — podium storm \`[solo]\` | Owed: Wyatt playtest — 5. Non-host (or second client) is a bonus |
`;
    const { cards } = buildPlaytestQueue({ statusMd, backlogMd });
    const wedge = cards.find((c) => c.id === "WEDGE-1");
    expect(wedge?.source).toBe("status-issue");
    expect(wedge?.rig).toBe("solo");
    expect(wedge?.rigVia).toBe("tag");
  });

  it("empty sources → no system bookends", () => {
    const { cards } = buildPlaytestQueue({ statusMd: "# empty\n", backlogMd: "# empty\n" });
    expect(cards).toEqual([]);
  });
});

describe("multiIssueWarnings (PT-CARD-SPLIT-1)", () => {
  /** @param {object} over */
  const card = (over) => ({ id: "CARD-1", source: "backlog", steps: [], tail: "", context: "", ...over });

  it("warns on step overflow — cap 5, MAIN-1 had 7", () => {
    const warnings = multiIssueWarnings([
      card({ steps: Array.from({ length: 7 }, (_, i) => `step ${i}`) }),
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({ id: "CARD-1", reason: "step-overflow" }),
    ]);
  });

  it("does not warn at or under the cap — current queue max is 4", () => {
    expect(multiIssueWarnings([card({ steps: ["a", "b", "c", "d"] })])).toEqual([]);
    expect(multiIssueWarnings([card({ steps: ["a", "b", "c", "d", "e"] })])).toEqual([]);
  });

  it("does not warn on a single foreign id in steps — an ordinary cross-ref", () => {
    // UI-P2-PAUSE-PT-1's real steps cite TOUCH-HOVER-1; that must stay clean.
    const warnings = multiIssueWarnings([
      card({ id: "UI-P2-PAUSE-PT-1", steps: ["Confirm hover paint is gated after TOUCH-HOVER-1."] }),
    ]);
    expect(warnings).toEqual([]);
  });

  it("warns when two distinct foreign ids appear across separate steps", () => {
    const warnings = multiIssueWarnings([
      card({ steps: ["Retest after HOST-TAB-1 lands.", "Also confirm the DIAG-FLAKE-2 residual is gone."] }),
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({ id: "CARD-1", reason: "multi-id" }),
    ]);
  });

  it("warns when one step alone names two foreign ids — the matchAll case", () => {
    // extractWorkId is first-match-only, so a single-step scan built on it would
    // false-negative this: the second id in the same step would never be seen.
    const warnings = multiIssueWarnings([
      card({ steps: ["Regression window is after HOST-TAB-1 and before DIAG-FLAKE-2."] }),
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({ id: "CARD-1", reason: "multi-id" }),
    ]);
  });

  it("ignores foreign ids in context/do — steps + tail only", () => {
    // NET-LOOK-ACC-1's goal sentence names NET-AUDIT-SLOTS-LOOK-1; SHARD-PT-2's
    // names SHARD-PT-1. Scanning context/do would false-positive both today.
    const warnings = multiIssueWarnings([
      card({
        id: "NET-LOOK-ACC-1",
        context: "Related to NET-AUDIT-SLOTS-LOOK-1 and SHARD-PT-1, but not itself.",
        steps: ["Play one round.", "Confirm camera look accel feels the same."],
      }),
    ]);
    expect(warnings).toEqual([]);
  });

  it("never warns on system cards regardless of step count", () => {
    const warnings = multiIssueWarnings([
      card({ id: "PREFLIGHT", source: "system", steps: Array.from({ length: 9 }, (_, i) => `s${i}`) }),
    ]);
    expect(warnings).toEqual([]);
  });

  it("clean queue produces no warnings", () => {
    expect(multiIssueWarnings([])).toEqual([]);
    expect(multiIssueWarnings([card({ steps: ["one", "two"] })])).toEqual([]);
  });
});
