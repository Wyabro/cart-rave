// playtestQueue.test.js — pure seed rules for the generated playtest console.

import { describe, it, expect } from "vitest";
import { blockedOnWyatt, extractWorkId } from "../tools/lib/projectHealth.mjs";
import {
  backlogRowOwesPlaytest,
  cardsFromStatus,
  cardsFromBacklog,
  buildPlaytestQueue,
  classifyRig,
  f8LabelFor,
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
