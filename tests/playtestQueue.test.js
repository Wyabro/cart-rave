// playtestQueue.test.js — pure seed rules for the generated playtest console.

import { describe, it, expect } from "vitest";
import { blockedOnWyatt, extractWorkId } from "../tools/lib/projectHealth.mjs";
import {
  backlogRowOwesPlaytest,
  cardsFromStatus,
  cardsFromBacklog,
  buildPlaytestQueue,
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

  it("empty sources → no system bookends", () => {
    const { cards } = buildPlaytestQueue({ statusMd: "# empty\n", backlogMd: "# empty\n" });
    expect(cards).toEqual([]);
  });
});
