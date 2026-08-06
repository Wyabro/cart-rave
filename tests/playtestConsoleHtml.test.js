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

describe("PT-CARD-SPLIT-1 — multi-issue warning banner", () => {
  it("stays silent when meta.warnings is empty (this BACKLOG's cards are clean)", () => {
    // "card-warn-banner" alone also matches the static CSS rule selector, which is
    // always present — the element itself is the real signal.
    const html = render();
    expect(html).not.toContain('<div class="card-warn-banner">');
  });

  it("renders a server-side banner naming the count when meta.warnings is non-empty", () => {
    const { cards, meta } = buildPlaytestQueue({ statusMd: "# empty\n", backlogMd: BACKLOG });
    const html = renderPlaytestConsoleHtml({
      cards,
      meta: { ...meta, warnings: [{ id: "SOLO-CARD-1", reason: "step-overflow", detail: "7 steps" }] },
      git: { branch: "cart-clash", head: "abc1234" },
    });
    expect(html).toContain('<div class="card-warn-banner">');
    expect(html).toContain("1 card look like more than one issue");
  });

  it("threads meta.warnings into the embedded JSON payload for the client export", () => {
    const { cards, meta } = buildPlaytestQueue({ statusMd: "# empty\n", backlogMd: BACKLOG });
    const html = renderPlaytestConsoleHtml({
      cards,
      meta: { ...meta, warnings: [{ id: "SOLO-CARD-1", reason: "multi-id", detail: "names HOST-TAB-1, DIAG-FLAKE-2" }] },
      git: { branch: "cart-clash", head: "abc1234" },
    });
    const m = html.match(/<script type="application\/json" id="pt-data">([\s\S]*?)<\/script>/);
    const data = JSON.parse(m[1]);
    expect(data.meta.warnings).toEqual([
      { id: "SOLO-CARD-1", reason: "multi-id", detail: "names HOST-TAB-1, DIAG-FLAKE-2" },
    ]);
  });
});

describe("PT-CONSOLE-READY-1 — stepless-card export reminder", () => {
  // buildMarkdown() runs client-side inside the generated page's own <script>, closed
  // over browser-only state (localStorage, DOM ids) that nothing in this suite
  // executes. The card's whole point is PLACEMENT — PERF-9CELL-1 shipped stepless
  // because the "CLOSE THESE FIRST" block that would have warned about it is silent
  // whenever closable.length is 0. So instead of running the script, prove the
  // reminder push is textually outside that conditional: it must appear between the
  // existing triage-line push and the `if (closable.length)` gate, at the same
  // statement level — never nested inside the block it needs to survive without.
  it("reminder push sits after the triage line and before the closable-only gate", () => {
    const html = render();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    expect(scriptMatch).toBeTruthy();
    const script = scriptMatch[1];

    const triageIdx = script.indexOf('lines.push("Agents: triage');
    const reminderIdx = script.indexOf("check every remaining FAIL/owed card still shows non-empty steps");
    const closableGateIdx = script.indexOf("if (closable.length) {");

    expect(triageIdx).toBeGreaterThan(-1);
    expect(reminderIdx).toBeGreaterThan(-1);
    expect(closableGateIdx).toBeGreaterThan(-1);
    // Order proves the reminder isn't nested inside the closable-only block: it comes
    // after the triage line and before the gate even opens, so no runtime state can
    // suppress it — a zero-PASS export still carries the source text unconditionally.
    expect(reminderIdx).toBeGreaterThan(triageIdx);
    expect(reminderIdx).toBeLessThan(closableGateIdx);
  });

  it("the reminder text itself is present in the rendered page", () => {
    const html = render();
    expect(html).toContain("check every remaining FAIL/owed card still shows non-empty steps");
  });
});
