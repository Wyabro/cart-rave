// RESTART-ROUND-1: pause RESTART ROUND is not rematch.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const roundSrc = readFileSync(
  new URL("../../src/orchestration/roundLifecycle.js", import.meta.url),
  "utf8",
);
const bootSrc = readFileSync(
  new URL("../../src/orchestration/gameBoot.js", import.meta.url),
  "utf8",
);

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("RESTART-ROUND-1 pause restart is not rematch", () => {
  it("gameBoot onRestart calls onHostRestartRoundClick, not playAgain", () => {
    expect(bootSrc).toMatch(/onRestart:\s*\(\)\s*=>\s*onHostRestartRoundClick\(\)/);
    expect(bootSrc).not.toMatch(/onRestart:\s*\(\)\s*=>\s*onHostPlayAgainClick\(\)/);
  });

  it("onHostRestartRoundClick sits outside the playAgain → clearPodiumRoundTimeout slice", () => {
    const restartAt = roundSrc.indexOf("function onHostRestartRoundClick");
    const playAgainAt = roundSrc.indexOf("function onHostPlayAgainClick");
    const clearAt = roundSrc.indexOf("function clearPodiumRoundTimeout");
    expect(restartAt).toBeGreaterThan(-1);
    expect(playAgainAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(playAgainAt);
    expect(restartAt < playAgainAt || restartAt > clearAt).toBe(true);
  });

  it("restart path does not send playAgain or rotate arenas", () => {
    const seam = sliceBetween(
      roundSrc,
      "function onHostRestartRoundClick",
      "function onHostPlayAgainClick",
    );
    expect(seam).not.toMatch(/sendPlayAgain/);
    expect(seam).not.toMatch(/pickNextQuickplayArenaId/);
    expect(seam).toMatch(/retainCurrentRound/);
    expect(seam).toMatch(/setSuddenDeath\(false\)/);
  });
});
