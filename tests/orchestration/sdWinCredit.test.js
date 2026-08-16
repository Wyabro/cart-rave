// SD-WIN-CREDIT-1 — guests got zero Sudden Death win credit online. The only
// SUDDEN_DEATH_WIN record site (updateResultsOverlay's challenge block) reads the
// module latch `lastRoundEndedInSuddenDeath`, whose sole writer was host-only
// endRound() — non-hosts reach the podium via the MSG.round phase watcher, so the
// latch stayed false forever on guests and the Clutch Winner daily (sd_win_3) plus
// the redMirror unlock never progressed for 3 of 4 players in every online match.
//
// The fix latches the guest's mirrored isSuddenDeath on first podium entry. That
// capture is load-bearing on MSG.round apply ORDER (onEnterPodium fires before the
// payload's isSuddenDeath:false lands), so these pins guard the ordering the same
// way tests/input/camera.test.js pins main.js/party ordering — roundLifecycle.js
// (camera/confetti/announcer/HUD surface) is too heavy to import in a unit test.
import { describe, it, expect } from "vitest";
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

describe("SD-WIN-CREDIT-1 guest Sudden Death credit", () => {
  it("non-hosts latch the mirrored SD flag on first podium entry", () => {
    // * Fresh-key path only — the podiumCameraKey early-return must not re-capture.
    const freshPath = between(roundSrc, "podiumCameraKey = key;", "podiumPhaseEnteredAtMs");
    expect(freshPath).toMatch(
      /if \(!Netcode\.getIsHost\(\)\) \{\s*lastRoundEndedInSuddenDeath = GameState\.getRoundState\(\)\.isSuddenDeath;\s*\}/,
    );
  });

  it("endRound keeps the host's authoritative pre-clear latch", () => {
    const body = between(roundSrc, "function endRound(", "// * Wire Sudden Death win callback");
    const latchAt = body.indexOf("lastRoundEndedInSuddenDeath = suddenDeathActive;");
    const clearAt = body.indexOf("GameState.setSuddenDeath(false);");
    expect(latchAt).toBeGreaterThanOrEqual(0);
    // * Host order matters: latch BEFORE the SD branch clears the live flag.
    expect(clearAt).toBeGreaterThan(latchAt);
  });

  it("the podium challenge block still keys SUDDEN_DEATH_WIN off the latch", () => {
    const block = between(
      roundSrc,
      "podiumChallengesRecordedKey !== challengeRoundKey",
      "const localCart = localCartForConnId();",
    );
    expect(block).toMatch(/if \(lastRoundEndedInSuddenDeath\) \{/);
    expect(block).toMatch(/ChallengeTracker\.record\(PROGRESSION_EVENTS\.SUDDEN_DEATH_WIN\);/);
  });

  it("MSG.round: onEnterPodium fires before the payload clears the guest's SD flag", () => {
    // * The running→podium watcher itself must not touch SD before the callback —
    // * a clear added inside this branch would silently revert guest credit.
    const branch = between(
      netcodeSrc,
      'prevPhase === "running" && newPhase === "podium"',
      "callbacks.onEnterPodium?.();",
    );
    expect(branch).not.toMatch(/setSuddenDeath/);
    // * And the general apply (payload's false) must come after the callback, or the
    // * capture in beginPodiumPresentation reads an already-cleared flag.
    const handler = between(
      netcodeSrc,
      'prevPhase === "running" && newPhase === "podium"',
      "if (type === MSG.countdownCancel)",
    );
    const podiumAt = handler.indexOf("callbacks.onEnterPodium?.();");
    const sdApplyAt = handler.indexOf(
      'if (typeof r.isSuddenDeath === "boolean") GameState.setSuddenDeath(r.isSuddenDeath);',
    );
    expect(podiumAt).toBeGreaterThanOrEqual(0);
    expect(sdApplyAt).toBeGreaterThan(podiumAt);
  });

  it("mid-round joiners still latch SD from the hello parity path", () => {
    // * A guest who joins during SD learns the flag from MSG.hello, not a running-phase
    // * host_round — without this path their podium capture reads false.
    expect(netcodeSrc).toMatch(
      /if \(typeof msg\.round\.isSuddenDeath === "boolean"\) \{\s*GameState\.setSuddenDeath\(msg\.round\.isSuddenDeath\);/,
    );
  });
});
