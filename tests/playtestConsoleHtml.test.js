// playtestConsoleHtml.test.js — the renderer had no test at all, so a module-level
// syntax error in it sailed through the whole `npm run qa` chain (typecheck, 1298
// tests, knip, briefing, arch, health) and only surfaced when the generator was run
// by hand. Importing the module is most of the value here: it is the step that fails
// on bad syntax. The assertions cover the contract the console depends on.

import { describe, it, expect } from "vitest";
import { renderPlaytestConsoleHtml } from "../tools/lib/playtestConsoleHtml.mjs";
import { buildPlaytestQueue } from "../tools/lib/playtestQueue.mjs";

const BACKLOG = `# Backlog

## Playtest owed

| Pri | Item | Notes |
|-----|------|-------|
| High | SOLO-CARD-1 — a solo check | Owed: Wyatt playtest — SOLO-CARD-1 — one machine is enough.<br>1. Open prod.<br>2. Look at the thing. |
| High | MP-CARD-1 — a two-machine check \`[2pc]\` | Owed: Wyatt playtest — MP-CARD-1 — needs both boxes.<br>1. Two clients on prod. |
`;

function render() {
  const { cards, meta } = buildPlaytestQueue({ statusMd: "# empty\n", backlogMd: BACKLOG });
  return renderPlaytestConsoleHtml({ cards, meta, git: { branch: "cart-clash", head: "abc1234" } });
}

describe("renderPlaytestConsoleHtml", () => {
  it("renders without throwing and embeds the queue", () => {
    const html = render();
    expect(html).toContain("SOLO-CARD-1");
    expect(html).toContain("MP-CARD-1");
    expect(html).toContain("one machine is enough.");
  });

  it("carries the steps as data, not as a mashed string", () => {
    const html = render();
    expect(html).toContain("Look at the thing.");
    // The old renderer escaped the raw cell, so "<br>" reached the page as text.
    expect(html).not.toContain("&lt;br&gt;");
  });

  it("ships the two-machine badge markup and the close-these instruction", () => {
    const html = render();
    expect(html).toContain("2 PC");
    expect(html).toContain("CLOSE THESE FIRST");
  });

  it("embeds parseable JSON for the page script", () => {
    const html = render();
    const m = html.match(/<script type="application\/json" id="pt-data">([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const data = JSON.parse(m[1]);
    expect(data.cards.map((c) => c.id)).toContain("SOLO-CARD-1");
    // Solo-first ordering survives serialization.
    const ids = data.cards.map((c) => c.id);
    expect(ids.indexOf("SOLO-CARD-1")).toBeLessThan(ids.indexOf("MP-CARD-1"));
  });
});
