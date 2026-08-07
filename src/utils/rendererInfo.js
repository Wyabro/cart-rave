/**
 * rendererInfo.js — prod-safe renderer.info diagnostics ref (PERF-RENDERINFO-1).
 *
 * The F8 diagnostics overlay used to read renderer.info only through the DEV-gated
 * `window.__cartRavePerf.renderer`, so production bundles read null. This module keeps a
 * module-scope renderer ref set unconditionally by createRenderer (src/scene.js), so the
 * overlay reads live draw-call / triangle / program data in production too.
 *
 * Uses the stock multi-pass `info.autoReset = false` pattern: render counts accumulate
 * across every render pass of a frame and are zeroed once per frame at the visual seam
 * (resetRendererInfoFrame, called from src/frameVisuals.js). Nothing here wraps
 * renderer.render and nothing touches composer/offscreen/compile paths.
 */

/** @type {import("three").WebGLRenderer | null} */
let rendererRef = null;

/**
 * Set (or clear) the renderer the diagnostics read. Disables info.autoReset so
 * info.render.{calls,triangles} accumulate across all render passes of a frame instead of
 * resetting per pass. Never throws — a weird/missing info object cannot break the boot path.
 * @param {import("three").WebGLRenderer | null | undefined} renderer
 */
export function setRendererRef(renderer) {
  if (renderer) {
    try {
      if (renderer.info) renderer.info.autoReset = false;
    } catch {
      // * Diagnostics seam — never let a renderer-shaped object break boot.
    }
    rendererRef = renderer;
  } else {
    rendererRef = null;
  }
}

/**
 * Once-per-frame reset at the visual seam (frameVisuals). With autoReset = false this is
 * the only thing that zeroes info.render.{calls,triangles}, so they accumulate a full
 * frame across all render passes and reset here at the next frame's seam.
 */
export function resetRendererInfoFrame() {
  if (!rendererRef?.info) return;
  try {
    rendererRef.info.reset();
  } catch {
    // * Diagnostics seam — never throw from the visual path.
  }
}

/**
 * Snapshot of the live renderer.info. Null when no ref is set (production-null
 * degradation). Every field is null-guarded so fakes without render/memory/programs work.
 * @returns {{ calls: number, triangles: number, programs: number, geometries: number, textures: number } | null}
 */
export function readRendererInfo() {
  if (!rendererRef?.info) return null;
  const info = rendererRef.info;
  return {
    calls: info.render?.calls ?? 0,
    triangles: info.render?.triangles ?? 0,
    programs: Array.isArray(info.programs) ? info.programs.length : 0,
    geometries: info.memory?.geometries ?? 0,
    textures: info.memory?.textures ?? 0,
  };
}
