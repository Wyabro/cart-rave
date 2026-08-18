// visBucketWiring.test.js — PERF-CLASSIC-IGPU-1 wave B.
// The F8 loopRound vis*MeanMs fields only name an owner if frameVisuals wraps
// the four slices. A silent drop of one call leaves that mean at 0 and the
// remainder in visOther — a polluted cell dressed as "HUD is free".

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../src/frameVisuals.js", import.meta.url), "utf8");

describe("PERF-CLASSIC-IGPU-1 vis buckets — frameVisuals wiring", () => {
  it("imports timeLoopMs", () => {
    expect(src).toMatch(/import\s*\{[^}]*\btimeLoopMs\b[^}]*\}\s*from\s*["']\.\/utils\/perfSpans\.js["']/);
  });

  it("wraps all four vis buckets", () => {
    for (const key of ["visFxMs", "visSyncMs", "visHudMs", "visRenderMs"]) {
      expect(src).toMatch(new RegExp(`timeLoopMs\\("${key}"`));
    }
  });

  it("times the WebGL submit inside visRenderMs", () => {
    const renderAt = src.indexOf('timeLoopMs("visRenderMs"');
    expect(renderAt).toBeGreaterThan(-1);
    const body = src.slice(renderAt, src.indexOf("});", src.indexOf("labelRenderer.render", renderAt)) + 3);
    expect(body).toMatch(/composer\.renderer\.render|composer\.render/);
    expect(body).toMatch(/labelRenderer\.render/);
  });
});
