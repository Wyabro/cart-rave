// cameraFraming.js — aspect-aware camera FOV framing + viewport/pixel-ratio resize sync.
//
// * Extracted verbatim from main() (Camera, audio, post-processing section). The
// * renderer/composer/passes/camera/labelRenderer are main()-owned singletons created
// * once at boot and never reassigned, so they are captured directly; the FPS canvas
// * is created lazily by the frame-loop FPS counter, so it is read through a getter.

import { CONFIG } from "../config.js";
import { clamp } from "../utils.js";
import { updateViewport as updateSceneViewport } from "../scene.js";

/**
 * @param {{
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   composer: any,
 *   arcadePass: any,
 *   fxaaPass: any,
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
  labelRenderer,
  getFpsCanvas,
}) {
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
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    updateSceneViewport(renderer, camera, composer, arcadePass, fxaaPass);
    labelRenderer.setSize(w, h);
    updateCameraFraming();
    const fpsCanvas = getFpsCanvas();
    if (fpsCanvas) {
      fpsCanvas.style.position = "fixed";
      fpsCanvas.style.bottom = "8px";
      fpsCanvas.style.left = "10px";
    }
  }

  return { updateCameraFraming, updateViewport };
}
