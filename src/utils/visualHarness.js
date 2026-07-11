/**
 * visualHarness.js — window.__cartRave hooks for Playwright shoot / blackframe tools.
 *
 * Active when ?harness=1 or other visual debug flags set (see debugParams.js).
 * Dev-friendly; also available in prod builds when flags are present (read-only QA).
 */

import {
  applyDebugCameraPose,
  applyPostFxAblation,
  getDebugParams,
  isDebugCameraLocked,
} from "./debugParams.js";

/**
 * @typedef {object} HarnessDeps
 * @property {() => boolean} isReady
 * @property {() => boolean} isWorldReady
 * @property {() => string | null} getError
 * @property {() => import("three").WebGLRenderer | null} getRenderer
 * @property {() => import("three").PerspectiveCamera | null} getCamera
 * @property {() => HTMLCanvasElement | null} getCanvas
 * @property {() => { bloomPass?: object | null, arcadePass?: object | null, fxaaPass?: object | null, outputPass?: object | null }} getPasses
 * @property {() => Promise<void>} [ensureWorld]
 * @property {() => void} [onSettleFrame]
 */

/** @type {HarnessDeps | null} */
let deps = null;
let frameCount = 0;
/** @type {string | null} */
let installError = null;

/**
 * @param {HarnessDeps} dependencies
 * @returns {void}
 */
export function installVisualHarness(dependencies) {
  deps = dependencies;
  frameCount = 0;
  installError = null;

  const params = getDebugParams();

  /** @type {any} */
  const api = {
    version: 1,
    get ready() {
      return Boolean(deps?.isReady());
    },
    get worldReady() {
      return Boolean(deps?.isWorldReady());
    },
    get error() {
      return installError || deps?.getError?.() || null;
    },
    get frame() {
      return frameCount;
    },
    get params() {
      return {
        ablate: [...params.ablate],
        postmin: params.postmin,
        freeze: params.freeze,
        cam: params.cam,
        level: params.level,
        preset: params.preset,
        shot: params.shot,
        harness: params.harness,
        hideHud: params.hideHud,
      };
    },
    stats() {
      const renderer = deps?.getRenderer?.() ?? null;
      const info = renderer?.info;
      return {
        frame: frameCount,
        ready: api.ready,
        worldReady: api.worldReady,
        drawCalls: info?.render?.calls ?? null,
        triangles: info?.render?.triangles ?? null,
        geometries: info?.memory?.geometries ?? null,
        textures: info?.memory?.textures ?? null,
        programs: info?.programs?.length ?? null,
        pixelRatio: renderer?.getPixelRatio?.() ?? null,
        size: renderer
          ? { w: renderer.domElement?.width ?? 0, h: renderer.domElement?.height ?? 0 }
          : null,
      };
    },
    /**
     * Advances N animation frames (waits for rAF). With ?perfPump works while hidden.
     * @param {number} [n]
     * @returns {Promise<void>}
     */
    async settle(n = 24) {
      const count = Math.max(0, Math.floor(Number(n) || 0));
      for (let i = 0; i < count; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            frameCount += 1;
            try {
              deps?.onSettleFrame?.();
            } catch {
              /* ignore per-frame hooks */
            }
            resolve(undefined);
          });
        });
      }
    },
    /**
     * Re-apply ablation after quality toggles.
     * @returns {string[]}
     */
    reapplyAblation() {
      if (!deps) return [];
      const { ablated } = applyPostFxAblation(deps.getPasses() || {});
      return ablated;
    },
    /**
     * Re-apply locked camera pose.
     * @returns {boolean}
     */
    applyCam() {
      const cam = deps?.getCamera?.();
      if (!cam) return false;
      return applyDebugCameraPose(cam);
    },
    /**
     * Sample canvas black-pixel ratio (downscaled). For flicker / black-frame triage.
     * @param {{ maxDim?: number, threshold?: number }} [opts]
     * @returns {Promise<{ ratio: number, black: number, total: number, maxRun: number, width: number, height: number }>}
     */
    async sampleBlack(opts = {}) {
      const raw = deps?.getCanvas?.() ?? document.querySelector("canvas");
      /** @type {HTMLCanvasElement | null} */
      const canvas =
        raw && "getContext" in raw ? /** @type {HTMLCanvasElement} */ (raw) : null;
      if (!canvas) {
        return { ratio: 1, black: 0, total: 0, maxRun: 0, width: 0, height: 0 };
      }
      const maxDim = opts.maxDim ?? 320;
      const threshold = opts.threshold ?? 2;
      const srcW = canvas.width || canvas.clientWidth || 1;
      const srcH = canvas.height || canvas.clientHeight || 1;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const w = Math.max(1, Math.floor(srcW * scale));
      const h = Math.max(1, Math.floor(srcH * scale));

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return { ratio: 1, black: 0, total: 0, maxRun: 0, width: w, height: h };
      }
      try {
        ctx.drawImage(canvas, 0, 0, w, h);
      } catch {
        // * WebGL security / cleared buffer — treat as unreadable.
        return { ratio: -1, black: 0, total: w * h, maxRun: 0, width: w, height: h };
      }
      const { data } = ctx.getImageData(0, 0, w, h);
      let black = 0;
      let maxRun = 0;
      let run = 0;
      const total = w * h;
      for (let i = 0; i < data.length; i += 4) {
        const isBlack =
          data[i] <= threshold && data[i + 1] <= threshold && data[i + 2] <= threshold;
        if (isBlack) {
          black += 1;
          run += 1;
          if (run > maxRun) maxRun = run;
        } else {
          run = 0;
        }
      }
      return {
        ratio: total > 0 ? black / total : 0,
        black,
        total,
        maxRun,
        width: w,
        height: h,
      };
    },
    /** @returns {boolean} */
    isCameraLocked() {
      return isDebugCameraLocked();
    },
    /**
     * Kick idle world warm if available.
     * @returns {Promise<void>}
     */
    async ensureWorld() {
      if (deps?.ensureWorld) await deps.ensureWorld();
    },
  };

  /** @type {any} */ (window).__cartRave = api;

  // * Re-pin camera once after install (composer/attract may have moved it).
  if (params.cam) {
    queueMicrotask(() => api.applyCam());
  }

  // eslint-disable-next-line no-console
  console.info(
    "[visualHarness] installed",
    `ablate=[${[...params.ablate].join(",") || "none"}]`,
    params.shot ? `shot=${params.shot}` : "",
    params.level ? `level=${params.level}` : "",
  );
}

/** Call once per rendered frame from attract or game loop when harness is live. */
export function tickVisualHarnessFrame() {
  if (!deps) return;
  frameCount += 1;
  if (isDebugCameraLocked()) {
    const cam = deps.getCamera?.();
    if (cam) applyDebugCameraPose(cam);
  }
}

/**
 * @param {string} message
 * @returns {void}
 */
export function setVisualHarnessError(message) {
  installError = message;
  if (/** @type {any} */ (window).__cartRave) {
    // * error is a getter — store is local
  }
}

/** @returns {boolean} */
export function isVisualHarnessInstalled() {
  return Boolean(deps);
}
