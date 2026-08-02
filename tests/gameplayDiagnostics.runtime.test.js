// @vitest-environment happy-dom
// DIAG-TIER-1 — exercises the real installGameplayDiagnostics "runtime" probe
// (not a mocked registerDiagProbe stub in diagnostics.test.js).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installDiagnostics, __resetDiagnosticsForTest } from "../src/utils/diagnostics.js";
import { installGameplayDiagnostics } from "../src/utils/gameplayDiagnostics.js";
import {
  setMenuPreviewVisualLod,
  setQualityTier,
  setSessionQualityTier,
} from "../src/utils/qualityMode.js";

const STUB_DEPS = {
  getCarts: () => null,
  getNetSlots: () => null,
  getCamera: () => null,
};

function runtimeQuality() {
  const runtime = window.__ccDiag.snapshot("runtime");
  expect(runtime).toBeTruthy();
  expect(runtime.error).toBeUndefined();
  return {
    qualityTier: runtime.qualityTier,
    qualityTierStored: runtime.qualityTierStored,
    qualityTierOverride: runtime.qualityTierOverride,
  };
}

beforeAll(() => {
  __resetDiagnosticsForTest();
  installDiagnostics({ flags: { enabled: true } });
  installGameplayDiagnostics(STUB_DEPS);
});

beforeEach(() => {
  // * Reset qualityMode module state + persisted store tier between cases.
  setMenuPreviewVisualLod(false);
  setSessionQualityTier(null);
  setQualityTier("medium");
});

describe("DIAG-TIER-1 — gameplayDiagnostics runtime quality fields", () => {
  it("reports effective low after a session demotion while stored stays medium", () => {
    setQualityTier("medium");
    setSessionQualityTier("low");

    expect(runtimeQuality()).toEqual({
      qualityTier: "low",
      qualityTierStored: "medium",
      qualityTierOverride: "low",
    });
  });

  it("effective equals stored only when session override and menu-preview LOD are both off", () => {
    setQualityTier("medium");
    setMenuPreviewVisualLod(false);
    setSessionQualityTier(null);

    expect(runtimeQuality()).toEqual({
      qualityTier: "medium",
      qualityTierStored: "medium",
      qualityTierOverride: null,
    });
  });

  it("menu-preview LOD forces effective low without writing an override", () => {
    setQualityTier("medium");
    setMenuPreviewVisualLod(true);

    expect(runtimeQuality()).toEqual({
      qualityTier: "low",
      qualityTierStored: "medium",
      qualityTierOverride: null,
    });
  });
});
