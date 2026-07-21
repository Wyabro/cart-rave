// cameraFraming.js — aspect-aware camera FOV framing + viewport/pixel-ratio resize sync.
//
// * Extracted verbatim from main() (Camera, audio, post-processing section). The
// * renderer/composer/passes/camera/labelRenderer are main()-owned singletons created
// * once at boot and never reassigned, so they are captured directly; the FPS canvas
// * is created lazily by the frame-loop FPS counter, so it is read through a getter.

import { CONFIG } from "../config.js";
import { clamp } from "../utils.js";
import { updateViewport as updateSceneViewport, isSoftwareRendererActive } from "../scene.js";
import { effectivePixelRatio } from "../utils/qualityTiers.js";

/**
 * @param {{
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   composer: any,
 *   arcadePass: any,
 *   fxaaPass: any,
 *   bloomPass?: any,
 *   labelRenderer: { setSize(width: number, height: number): void },
 *   getFpsCanvas: () => (HTMLCanvasElement | null),
 * }} deps
 * @returns {{ updateCameraFraming: () => void, updateViewport: () => void }}
 */
export function createCameraFraming({
  camera,
  renderer,
  composer,
  arcadePass,
  fxaaPass,
  bloomPass = null,
  labelRenderer,
  getFpsCanvas,
}) {
  let lastW = 0;
  let lastH = 0;
  let lastPixelRatio = 0;
  /** @type {number | null} */
  let viewportRaf = null;

  function updateCameraFraming() {
    const aspect = window.innerWidth / window.innerHeight;
    const portraitBoost = (1 / Math.max(0.5, aspect)) - 1;
    const wideBoost = Math.max(0, aspect - 1.8);
    const fov =
      CONFIG.camera.fov +
      portraitBoost * 18 +
      wideBoost * 7;
    camera.fov = clamp(fov, CONFIG.camera.minFov, CONFIG.camera.maxFov);
    camera.userData.baseFov = camera.fov;
  }

  function updateViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // * Tier pixel-ratio cap must win here too — this runs at boot and on every
    // * resize, and a hardcoded min(dpr, 2) silently overrode LOW's cap of 1 on
    // * exactly the machines the tier system exists to save. renderScale (LOW 0.75,
    // * sub-native buffer) folds in for the same reason — a resize must not undo it.
    // * effectivePixelRatio also re-applies the software-rasterizer long-edge cap so a
    // * window resize on a no-GPU machine can't inflate the buffer back to megapixels.
    const pixelRatio = effectivePixelRatio(w, h, isSoftwareRendererActive());

    // * visualViewport.resize can fire many times per URL-bar animation with the
    // * same window.inner* size. Re-running setSize/composer RT rebuilds every
    // * tick hangs the main thread and can spam WebGLProgram info logs.
    if (w === lastW && h === lastH && pixelRatio === lastPixelRatio) {
      return;
    }
    lastW = w;
    lastH = h;
    lastPixelRatio = pixelRatio;

    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    updateSceneViewport(renderer, camera, composer, arcadePass, fxaaPass, bloomPass);
    labelRenderer.setSize(w, h);
    updateCameraFraming();
    const fpsCanvas = getFpsCanvas();
    if (fpsCanvas) {
      fpsCanvas.style.position = "fixed";
      fpsCanvas.style.bottom = "8px";
      fpsCanvas.style.left = "10px";
    }
  }

  function scheduleViewportUpdate() {
    if (viewportRaf != null) return;
    viewportRaf = requestAnimationFrame(() => {
      viewportRaf = null;
      updateViewport();
    });
  }

  // * Coalesce visualViewport.resize (URL bar) — never call setSize synchronously
  // * from the event (can interleave with the rAF render loop).
  try {
    window.visualViewport?.addEventListener("resize", scheduleViewportUpdate, { passive: true });
  } catch {
    /* older engines */
  }

  return { updateCameraFraming, updateViewport };
}
