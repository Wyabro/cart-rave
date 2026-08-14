// @vitest-environment node
//
// CHUNK-MEMBER-1 L1 — FREEZE-TELEMETRY counters live in an eager leaf so
// gameplayAnalytics never static-imports gameLoop.js (that re-eagered ~25
// deferred modules into the initial download set).

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  recordMatchFrameForTelemetry,
  resetMatchFrameTelemetry,
  getMatchFrameTelemetry,
} from "../../src/analytics/matchFrameTelemetry.js";

const ROOT = process.cwd();

describe("matchFrameTelemetry leaf", () => {
  beforeEach(() => {
    resetMatchFrameTelemetry();
  });

  it("reset zeros counters", () => {
    recordMatchFrameForTelemetry(50, false);
    resetMatchFrameTelemetry();
    expect(getMatchFrameTelemetry()).toEqual({ maxFrameMs: 0, framesOver33: 0 });
  });

  it("tracks maxFrameMs and framesOver33; ignores resume frames", () => {
    recordMatchFrameForTelemetry(16, false);
    recordMatchFrameForTelemetry(40, false);
    recordMatchFrameForTelemetry(100, true); // resume — ignored
    recordMatchFrameForTelemetry(20, false);
    const t = getMatchFrameTelemetry();
    expect(t.maxFrameMs).toBe(40);
    expect(t.framesOver33).toBe(1);
  });
});

describe("CHUNK-MEMBER-1 L1 import edges (source)", () => {
  it("gameplayAnalytics has no import of gameLoop (comments allowed)", () => {
    const src = readFileSync(resolve(ROOT, "src/analytics/gameplayAnalytics.js"), "utf8");
    // * Import lines only — a comment mentioning gameLoop must not fail CI (W3).
    expect(src).not.toMatch(/^\s*import\b.*gameLoop/m);
    expect(src).toMatch(/^\s*import\b.*from\s+["']\.\/matchFrameTelemetry\.js["']/m);
  });

  it("gameLoop records via the leaf; no counters and no re-export (W2)", () => {
    const src = readFileSync(resolve(ROOT, "src/gameLoop.js"), "utf8");
    expect(src).toMatch(
      /^\s*import\s*\{[^}]*recordMatchFrameForTelemetry[^}]*\}\s*from\s+["']\.\/analytics\/matchFrameTelemetry\.js["']/m,
    );
    expect(src).not.toMatch(/let\s+_matchMaxFrameMs/);
    // * No export of the three leaf APIs — re-export would re-open the eager edge (W2).
    expect(src).not.toMatch(
      /^\s*export\b.*\b(recordMatchFrameForTelemetry|resetMatchFrameTelemetry|getMatchFrameTelemetry)\b/m,
    );
  });
});
