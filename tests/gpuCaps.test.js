// gpuCaps.test.js — TIER-DEFAULT-1: six-class GPU taxonomy + pure tier policy.
// No DOM/WebGL required — classifyGpuRendererString and defaultTierForCaps are
// pure string/value functions. This corpus is what makes the six-class table
// falsifiable without owning six machines (docs/playtest/README.md previously
// flagged tier boundaries as never verified on real hardware).

import { describe, expect, it } from "vitest";
import { classifyGpuRendererString, defaultTierForCaps, migrateStoredTierIfNeeded } from "../src/utils/gpuCaps.js";

describe("classifyGpuRendererString", () => {
  it("software rasterizers", () => {
    expect(classifyGpuRendererString("Google SwiftShader")).toBe("software");
    expect(classifyGpuRendererString("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe("software");
    expect(classifyGpuRendererString("Microsoft Basic Render Driver")).toBe("software");
    expect(
      classifyGpuRendererString(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      ),
    ).toBe("software");
  });

  it("igpu-basic — cap-288's exact string and siblings", () => {
    // * cap-288 (Intel UHD Gen11, prod 5983896) — the capture that filed this card.
    expect(
      classifyGpuRendererString(
        "ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("igpu-basic");
    expect(classifyGpuRendererString("ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0)")).toBe(
      "igpu-basic",
    );
    expect(
      classifyGpuRendererString("ANGLE (AMD, AMD Radeon(TM) Vega 3 Graphics (0x000015D8) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("igpu-basic");
    expect(classifyGpuRendererString("Mali-G78")).toBe("igpu-basic");
    expect(classifyGpuRendererString("Adreno (TM) 650")).toBe("igpu-basic");
  });

  it("igpu-basic — unnumbered Radeon Graphics (ordering trap: must not read as 780M's rule)", () => {
    expect(
      classifyGpuRendererString("ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("igpu-basic");
  });

  it("igpu-modern — Iris/Xe, Meteor Lake Arc iGPU, Radeon NNNM", () => {
    expect(
      classifyGpuRendererString(
        "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("igpu-modern");
    // * ordering trap: bare "Arc(TM) Graphics" (no model number) must NOT hit the
    // * discrete Arc-model rule — it's a Meteor/Lunar Lake integrated GPU.
    expect(
      classifyGpuRendererString(
        "ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("igpu-modern");
    // * ordering trap: "780M" must hit the NNNM rule before the unnumbered
    // * "Radeon … Graphics" igpu-basic rule.
    expect(
      classifyGpuRendererString("ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("igpu-modern");
  });

  it("discrete-entry — old/weak discrete, laptop M-suffix preserved", () => {
    expect(classifyGpuRendererString("ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti (0x00001C8C) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete-entry",
    );
    expect(classifyGpuRendererString("NVIDIA GeForce GTX 970M")).toBe("discrete-entry");
    expect(classifyGpuRendererString("NVIDIA GeForce MX450")).toBe("discrete-entry");
    expect(classifyGpuRendererString("ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete-entry",
    );
    expect(classifyGpuRendererString("AMD Radeon R9 380")).toBe("discrete-entry");
    expect(classifyGpuRendererString("ANGLE (AMD, AMD Radeon RX 550 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete-entry",
    );
  });

  it("discrete — ordering trap: GTX 1060 is NOT discrete-entry", () => {
    expect(classifyGpuRendererString("ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete",
    );
  });

  it("discrete — ordering trap: RX 5500 XT is NOT discrete-entry (RX 550 lookalike)", () => {
    expect(classifyGpuRendererString("ANGLE (AMD, AMD Radeon RX 5500 XT (0x00007340) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete",
    );
  });

  it("discrete — Wyatt's 4090, Arc with a real model number, Apple M-series (B1: no Apple demotion)", () => {
    expect(
      classifyGpuRendererString("ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("discrete");
    expect(classifyGpuRendererString("ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete",
    );
    // * ordering trap: bare M1 and M3 Max must BOTH land on discrete — TIER-DEFAULT-1
    // * blocker B1 reverted the rev-1 plan to demote bare M-series to igpu-modern.
    expect(classifyGpuRendererString("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)")).toBe(
      "discrete",
    );
    expect(classifyGpuRendererString("ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)")).toBe(
      "discrete",
    );
    expect(classifyGpuRendererString("ANGLE (AMD, AMD Radeon RX 6750 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(
      "discrete",
    );
  });

  it("unknown — empty, missing, unrecognized", () => {
    expect(classifyGpuRendererString("")).toBe("unknown");
    expect(classifyGpuRendererString(null)).toBe("unknown");
    expect(classifyGpuRendererString(undefined)).toBe("unknown");
    expect(classifyGpuRendererString("Some Totally Unrecognized Renderer String 9000")).toBe("unknown");
  });
});

describe("defaultTierForCaps — lever 1 (hard floors + base class)", () => {
  it("hard floors win regardless of GPU class", () => {
    expect(defaultTierForCaps({ gpuClass: "discrete", touchLike: true })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "discrete", deviceMemoryGb: 2 })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "discrete", deviceMemoryGb: 1.5 })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "software", deviceMemoryGb: 32 })).toBe("low");
  });

  it("deviceMemoryGb > 2 does not trigger the floor", () => {
    expect(defaultTierForCaps({ gpuClass: "discrete", deviceMemoryGb: 4 })).toBe("high");
  });

  it("base tier by class, no floors tripped", () => {
    expect(defaultTierForCaps({ gpuClass: "igpu-basic" })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "igpu-modern" })).toBe("medium");
    expect(defaultTierForCaps({ gpuClass: "discrete-entry" })).toBe("medium");
    expect(defaultTierForCaps({ gpuClass: "discrete" })).toBe("high");
    expect(defaultTierForCaps({ gpuClass: "unknown" })).toBe("medium");
  });

  it("cap-288's exact case: igpu-basic with no other floors tripped -> low", () => {
    const gpuClass = classifyGpuRendererString(
      "ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    );
    expect(defaultTierForCaps({ gpuClass, deviceMemoryGb: 8, touchLike: false })).toBe("low");
  });
});

describe("defaultTierForCaps — lever 4 (reduced-motion demotes one rung)", () => {
  it("steps the base tier down one rung instead of hard-pinning low", () => {
    expect(defaultTierForCaps({ gpuClass: "discrete", reducedMotion: true })).toBe("medium");
    expect(defaultTierForCaps({ gpuClass: "igpu-modern", reducedMotion: true })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "discrete-entry", reducedMotion: true })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "unknown", reducedMotion: true })).toBe("low");
  });

  it("low stays low under reduced motion (floor, not negative)", () => {
    expect(defaultTierForCaps({ gpuClass: "igpu-basic", reducedMotion: true })).toBe("low");
  });

  it("hard floors still win over the RM rung (touch, software, low memory)", () => {
    expect(defaultTierForCaps({ gpuClass: "discrete", touchLike: true, reducedMotion: true })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "software", reducedMotion: true })).toBe("low");
    expect(defaultTierForCaps({ gpuClass: "discrete", deviceMemoryGb: 2, reducedMotion: true })).toBe("low");
  });

  it("no reducedMotion (default false) leaves the base tier untouched", () => {
    expect(defaultTierForCaps({ gpuClass: "discrete" })).toBe("high");
  });
});

describe("migrateStoredTierIfNeeded — lever 2 (H1: returning visitors)", () => {
  it("rewrites a stored medium to low on igpu-basic or software (cap-288's own box)", () => {
    expect(
      migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "igpu-basic" }),
    ).toBe("low");
    expect(
      migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "software" }),
    ).toBe("low");
  });

  it("no-ops when the GPU class doesn't warrant it, even if stored is medium", () => {
    expect(migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "discrete" })).toBeNull();
    expect(
      migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "igpu-modern" }),
    ).toBeNull();
    expect(
      migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "discrete-entry" }),
    ).toBeNull();
    expect(migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: null, gpuClass: "unknown" })).toBeNull();
  });

  it("no-ops when the stored tier isn't medium", () => {
    expect(migrateStoredTierIfNeeded({ storedTier: "high", migrationDone: null, gpuClass: "igpu-basic" })).toBeNull();
    expect(migrateStoredTierIfNeeded({ storedTier: "low", migrationDone: null, gpuClass: "igpu-basic" })).toBeNull();
    expect(migrateStoredTierIfNeeded({ storedTier: null, migrationDone: null, gpuClass: "igpu-basic" })).toBeNull();
  });

  it("never re-fires once the migration key is set — the key means 'already checked', not 'was rewritten'", () => {
    expect(
      migrateStoredTierIfNeeded({ storedTier: "medium", migrationDone: "2", gpuClass: "igpu-basic" }),
    ).toBeNull();
  });
});
