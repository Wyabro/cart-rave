// podiumDoubleCredit.test.js — PODIUM-DOUBLE-CREDIT-1 source-read pins.
// createRoundLifecycle / the Party WS handler are too heavy to boot here
// (same constraint as sdWinCredit.test.js). Predicate behavior lives in
// tests/utils/podiumStatsCredit.test.js; these pins lock the two call sites.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const roundSrc = readFileSync(resolve(repoRoot, "src/orchestration/roundLifecycle.js"), "utf8");
const netcodeSrc = readFileSync(resolve(repoRoot, "src/netcode.js"), "utf8");

/** Slice of `src` from the first `start` marker to the first `end` marker after it. */
function between(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`start marker not found: ${start}`);
  const j = src.indexOf(end, i + start.length);
  if (j < 0) throw new Error(`end marker not found after start: ${end}`);
  return src.slice(i, j);
}

describe("PODIUM-DOUBLE-CREDIT-1 call-site pins", () => {
  it("endRound credits immediately only outside quickplay/friends", () => {
    const body = between(roundSrc, "function endRound(", "// * Wire Sudden Death win callback");
    expect(body).toMatch(
      /if \(mode !== "quickplay" && mode !== "friends"\) \{\s*recordPodiumStats/,
    );
    const creditAt = body.search(
      /if \(mode !== "quickplay" && mode !== "friends"\) \{\s*recordPodiumStats/,
    );
    const sendAt = body.indexOf("Netcode.sendHostRound()");
    expect(creditAt).toBeGreaterThanOrEqual(0);
    expect(sendAt).toBeGreaterThan(creditAt);
  });

  it("MSG.round credits through the extracted predicate, not !isHost && validated", () => {
    expect(netcodeSrc).toMatch(/shouldCreditPodiumFromRoundMsg\s*\(/);
    expect(netcodeSrc).toMatch(/hostEndedPodiumRound\s*\(/);
    expect(netcodeSrc).not.toMatch(/if\s*\(\s*!isHost\s*&&\s*r\.validated\s*===\s*true\s*\)/);
  });

  it("host echo credit is not trapped inside running→podium only", () => {
    const runningPodium = between(
      netcodeSrc,
      'prevPhase === "running" && newPhase === "podium"',
      "callbacks.onEnterPodium?.();",
    );
    expect(runningPodium).not.toMatch(/recordPodiumStats/);
    const handler = between(
      netcodeSrc,
      "if (type === MSG.round)",
      "if (type === MSG.countdownCancel)",
    );
    const creditAt = handler.indexOf("shouldCreditPodiumFromRoundMsg");
    const enterAt = handler.indexOf("callbacks.onEnterPodium?.();");
    expect(creditAt).toBeGreaterThan(enterAt);
  });
});
