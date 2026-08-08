// @vitest-environment happy-dom
/**
 * MENU-CART-1 external pass contracts:
 * - setViewport/setScissor take CSS (logical) pixels — Three multiplies by DPR.
 * - Exposure = Customize grade / attract transmit (no CSS hole, no solid box).
 * - Depth-only clear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("../src/scene.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    applyRendererColorGrading: vi.fn(),
    setupSceneEnvironment: () => ({ dispose: vi.fn() }),
    resolveArenaExposure: () => 0.4,
  };
});

vi.mock("../src/ui/cartPreviewGltf.js", () => ({
  applyPreviewPlaceholderColor: vi.fn(),
  disposePreviewCartGltf: vi.fn(),
  isPreviewGltfCached: () => false,
  loadPreviewCartGltf: vi.fn(async () => null),
  preparePreviewCartGltf: vi.fn(),
}));

/** @type {typeof import("../src/ui/cartPreview.js")} */
let cartPreviewModule;

beforeEach(async () => {
  document.body.innerHTML = `
    <canvas id="game"></canvas>
    <div id="holder"></div>
  `;
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const holder = /** @type {HTMLElement} */ (document.getElementById("holder"));
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 1600,
    bottom: 900,
    width: 1600,
    height: 900,
    x: 0,
    y: 0,
    toJSON() {},
  });
  holder.getBoundingClientRect = () => ({
    left: 1100,
    top: 340,
    right: 1520,
    bottom: 556,
    width: 420,
    height: 216,
    x: 1100,
    y: 340,
    toJSON() {},
  });
  Object.defineProperty(holder, "clientWidth", { configurable: true, value: 420 });
  Object.defineProperty(holder, "clientHeight", { configurable: true, value: 216 });

  vi.resetModules();
  cartPreviewModule = await import("../src/ui/cartPreview.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/**
 * @returns {{
 *   renderer: import("three").WebGLRenderer,
 *   setViewport: ReturnType<typeof vi.fn>,
 *   setScissor: ReturnType<typeof vi.fn>,
 *   clearDepth: ReturnType<typeof vi.fn>,
 *   clear: ReturnType<typeof vi.fn>,
 *   exposuresDuringRender: number[],
 * }}
 */
function makeBorrowedRenderer() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const setViewport = vi.fn();
  const setScissor = vi.fn();
  const clearDepth = vi.fn();
  const clear = vi.fn();
  const viewport = new THREE.Vector4(0, 0, 1600, 900);
  const scissor = new THREE.Vector4(0, 0, 1600, 900);
  /** @type {number[]} */
  const exposuresDuringRender = [];
  let exposure = 0.528;
  const renderer = /** @type {import("three").WebGLRenderer} */ ({
    domElement: canvas,
    autoClear: true,
    get toneMappingExposure() {
      return exposure;
    },
    set toneMappingExposure(v) {
      exposure = v;
    },
    getRenderTarget: () => null,
    getDrawingBufferSize: (target) => target.set(2000, 1125),
    getViewport: (target) => target.copy(viewport),
    getScissor: (target) => target.copy(scissor),
    getScissorTest: () => false,
    setViewport: (...args) => {
      setViewport(...args);
      if (args[0] instanceof THREE.Vector4) viewport.copy(args[0]);
      else viewport.set(args[0], args[1], args[2], args[3]);
    },
    setScissor: (...args) => {
      setScissor(...args);
      if (args[0] instanceof THREE.Vector4) scissor.copy(args[0]);
      else scissor.set(args[0], args[1], args[2], args[3]);
    },
    setScissorTest: vi.fn(),
    clearDepth,
    clear,
    render: vi.fn(() => {
      exposuresDuringRender.push(exposure);
    }),
  });
  return { renderer, setViewport, setScissor, clearDepth, clear, exposuresDuringRender };
}

describe("CartPreview.renderExternal", () => {
  it("passes CSS logical pixels (not drawing-buffer scaled) to setViewport/setScissor", () => {
    const { CartPreview } = cartPreviewModule;
    const preview = new CartPreview();
    const { renderer, setViewport, setScissor } = makeBorrowedRenderer();
    const holder = /** @type {HTMLElement} */ (document.getElementById("holder"));

    preview.initExternal(renderer, holder);
    preview.cartGroup = new THREE.Group();
    preview.scene?.add(preview.cartGroup);

    const result = preview.renderExternal(renderer);
    expect(result).toBe("rendered");

    expect(setViewport).toHaveBeenCalledWith(1100, 344, 420, 216);
    expect(setScissor).toHaveBeenCalledWith(1100, 344, 420, 216);

    for (const call of setViewport.mock.calls) {
      expect(call).not.toEqual([1375, 430, 525, 270]);
    }

    preview.dispose();
  });

  it("boosts exposure for attract dim, depth-only clear, restores game exposure", () => {
    const { CartPreview } = cartPreviewModule;
    const preview = new CartPreview();
    const { renderer, clearDepth, clear, exposuresDuringRender } = makeBorrowedRenderer();
    const holder = /** @type {HTMLElement} */ (document.getElementById("holder"));

    renderer.toneMappingExposure = 0.528;
    preview.initExternal(renderer, holder);
    preview.cartGroup = new THREE.Group();
    preview.scene?.add(preview.cartGroup);

    preview.renderExternal(renderer);

    // * 0.4 / (1 - 0.42) — Customize grade through the full attract dim.
    expect(exposuresDuringRender).toHaveLength(1);
    expect(exposuresDuringRender[0]).toBeCloseTo(0.4 / 0.58, 5);
    expect(renderer.toneMappingExposure).toBe(0.528);
    expect(clearDepth).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();

    preview.dispose();
  });
});
