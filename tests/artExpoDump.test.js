// @vitest-environment happy-dom
// artExpoDump.test.js — ART-EXPO-DUMP-1: the "[Graphics Debug] Copy into src/config.js"
// snippet must emit the current arena's exposure under the post-ART-EXPO-1 key
// `arenaExposure` (per-arena budget in CONFIG.postFx) and never the retired global
// `toneMappingExposure` key, whose round-trip was a silent no-op.

import { describe, it, expect } from "vitest";
import { buildPostFxDump } from "../src/postFxDebug.js";

/** Minimal live snapshot of the panel's params object — same shape the real pane holds. */
function params() {
  return {
    exposure: 0.528,
    toneMapping: "ACESFilmic",
    environmentIntensity: 0.6,
    materialEnvMapIntensity: 0.4,
    fogEnabled: true,
    fogDensity: 0.02,
    bloomEnabled: true,
    strength: 1.2,
    radius: 0.5,
    threshold: 1.0,
    smoothWidth: 0.055,
    arcadeEnabled: false,
    aberration: 0.01,
    scanlineDensity: 1.5,
    vignette: 0.4,
    fxaaEnabled: true,
    shadowsEnabled: true,
    shadowSoftness: 0.5,
    shadowCartOpacity: 0.4,
    shadowFootprintX: 2,
    shadowFootprintZ: 2,
    shadowStaticOpacity: 0.6,
  };
}

describe("postFxDebug config dump (ART-EXPO-DUMP-1)", () => {
  it("emits arenaExposure keyed by the current arena with the live value", () => {
    const payload = buildPostFxDump(params(), "zanzibar", { r: 0.1, g: 0.2, b: 0.3 });
    const json = JSON.stringify(payload, null, 2);

    expect(json).toContain('"arenaExposure"');
    expect(json).toContain('"zanzibar": 0.528');
  });

  it("does NOT contain the retired toneMappingExposure key anywhere in the snippet", () => {
    const payload = buildPostFxDump(params(), "classicRecord", { r: 0.1, g: 0.2, b: 0.3 });
    const json = JSON.stringify(payload, null, 2);

    expect(json).not.toContain("toneMappingExposure");
  });

  it("any arena id round-trips (no hard-coded arena in the dump)", () => {
    const payload = buildPostFxDump(params(), "backrooms", { r: 0.1, g: 0.2, b: 0.3 });
    expect(JSON.stringify(payload)).toContain('"backrooms":0.528');
  });
});
