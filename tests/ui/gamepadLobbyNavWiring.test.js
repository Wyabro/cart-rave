import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// GAMEPAD-LOBBY-1: the Friends lobby already renders focusable buttons, but
// gameBoot must mark its "lobby" phase UI-active for gamepadNav to reach them.
describe("GAMEPAD-LOBBY-1 lobby navigation wiring", () => {
  it("keeps the Friends lobby in the UI-active phase predicate", () => {
    const gameBootSrc = readFileSync(
      new URL("../../src/orchestration/gameBoot.js", import.meta.url),
      "utf8",
    );
    const marker = "const isUiActive =";
    const start = gameBootSrc.indexOf(marker);
    const end = gameBootSrc.indexOf(";", start);

    expect(start, "UI-active predicate anchor not found").toBeGreaterThan(-1);
    expect(end, "UI-active predicate terminator not found").toBeGreaterThan(start);
    expect(gameBootSrc.slice(start, end)).toMatch(/phase === "lobby"/);
  });
});
