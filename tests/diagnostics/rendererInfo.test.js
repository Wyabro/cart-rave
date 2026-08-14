// rendererInfo.test.js — prod-safe renderer.info diagnostics ref (PERF-RENDERINFO-1).
// Plain vitest, no DOM needed: the module only touches a module-scope ref and the renderer
// object handed to it. Covers the autoReset disable, the once-per-frame reset at the visual
// seam, the accumulated snapshot, and the prod-null degradation when no ref is set.

import { beforeEach, describe, expect, it } from "vitest";
import {
  setRendererRef,
  resetRendererInfoFrame,
  readRendererInfo,
} from "../../src/utils/rendererInfo.js";

/** Minimal WebGLRenderer.info stand-in (autoReset defaults ON, like three.js). */
function makeFakeRenderer() {
  return {
    info: {
      autoReset: true,
      render: { calls: 0, triangles: 0 },
      programs: [],
      memory: { geometries: 0, textures: 0 },
      reset() {
        this.render.calls = 0;
        this.render.triangles = 0;
      },
    },
  };
}

beforeEach(() => {
  setRendererRef(null);
});

describe("setRendererRef", () => {
  it("disables info.autoReset on the registered renderer", () => {
    const renderer = makeFakeRenderer();
    setRendererRef(renderer);
    expect(renderer.info.autoReset).toBe(false);
  });

  it("accepts null/undefined without throwing and clears the ref", () => {
    expect(() => setRendererRef(null)).not.toThrow();
    expect(() => setRendererRef(undefined)).not.toThrow();
    expect(readRendererInfo()).toBeNull();
  });

  it("never throws for a renderer missing its info object", () => {
    expect(() => setRendererRef({})).not.toThrow();
    expect(() => setRendererRef({ info: null })).not.toThrow();
  });
});

describe("resetRendererInfoFrame", () => {
  it("zeroes the accumulated render counts once per frame", () => {
    const renderer = makeFakeRenderer();
    setRendererRef(renderer);
    renderer.info.render.calls = 7;
    renderer.info.render.triangles = 99;
    resetRendererInfoFrame();
    expect(renderer.info.render.calls).toBe(0);
    expect(renderer.info.render.triangles).toBe(0);
  });

  it("is a no-op without a ref (never throws)", () => {
    expect(() => resetRendererInfoFrame()).not.toThrow();
  });
});

describe("readRendererInfo", () => {
  it("returns null before any ref is set (prod-null degradation)", () => {
    expect(readRendererInfo()).toBeNull();
  });

  it("returns null again after setRendererRef(null)", () => {
    setRendererRef(makeFakeRenderer());
    expect(readRendererInfo()).not.toBeNull();
    setRendererRef(null);
    expect(readRendererInfo()).toBeNull();
  });

  it("returns the accumulated render, programs, and memory snapshot", () => {
    const renderer = makeFakeRenderer();
    renderer.info.programs = [{}, {}, {}];
    renderer.info.memory.geometries = 5;
    renderer.info.memory.textures = 6;
    setRendererRef(renderer);
    renderer.info.render.calls = 10;
    renderer.info.render.triangles = 20;
    expect(readRendererInfo()).toEqual({
      calls: 10,
      triangles: 20,
      programs: 3,
      geometries: 5,
      textures: 6,
    });
  });

  it("snapshots frame accumulation and the post-reset zero state", () => {
    const renderer = makeFakeRenderer();
    setRendererRef(renderer);
    renderer.info.render.calls = 42;
    renderer.info.render.triangles = 404;
    expect(readRendererInfo().calls).toBe(42);
    expect(readRendererInfo().triangles).toBe(404);
    resetRendererInfoFrame();
    expect(readRendererInfo().calls).toBe(0);
    expect(readRendererInfo().triangles).toBe(0);
  });
});
