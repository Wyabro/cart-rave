// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderPath = vi.hoisted(() => ({ bypass: false }));
const diagnostics = vi.hoisted(() => ({ active: false, record: vi.fn() }));

vi.mock("../../src/scene.js", () => ({
  isComposerBypassActive: () => renderPath.bypass,
}));
vi.mock("../../src/utils/debugParams.js", () => ({
  applyDebugCameraPose: vi.fn(),
  getDebugAnimTimeMs: () => null,
  isDebugCameraLocked: () => false,
}));
vi.mock("../../src/utils/diagnostics.js", () => ({
  isDiagActive: () => diagnostics.active,
  recordDiagEvent: diagnostics.record,
}));
vi.mock("../../src/utils/qualityMode.js", () => ({ getQualityTier: () => "high" }));
vi.mock("../../src/utils/qualityTiers.js", () => ({ getSessionRenderScaleMul: () => 1 }));
vi.mock("../../src/utils/visualHarness.js", () => ({ tickVisualHarnessFrame: vi.fn() }));

/** @type {Array<(now: number) => void>} */
let scheduled;
/** @type {typeof import("../../src/ui/menuAttract.js")} */
let attract;

function tick(now) {
  const callback = scheduled.shift();
  expect(callback).toBeTypeOf("function");
  callback(now);
}

function makeCamera() {
  return {
    position: { set: vi.fn() },
    lookAt: vi.fn(),
  };
}

function init(overrides = {}) {
  attract.initMenuAttract({
    camera: makeCamera(),
    scene: {},
    renderer: { render: vi.fn() },
    composer: { render: vi.fn() },
    isWorldBootstrapped: () => true,
    getMenuVisible: () => true,
    getArenaRadius: () => 12,
    ...overrides,
  });
}

beforeEach(async () => {
  scheduled = [];
  diagnostics.active = false;
  diagnostics.record.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    scheduled.push(callback);
    return scheduled.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  document.body.className = "";
  vi.resetModules();
  attract = await import("../../src/ui/menuAttract.js");
});

afterEach(() => {
  attract?.stopMenuAttract();
  vi.unstubAllGlobals();
  document.body.className = "";
});

describe("menu attract overlay pass", () => {
  it("runs after the final arena pass and inside the measured frame", () => {
    const order = [];
    const composer = { render: vi.fn(() => order.push("arena")) };
    init({
      composer,
      onAnimationTick: () => order.push("animation"),
      onOverlayRender: () => order.push("overlay"),
      onRenderCost: () => order.push("cost"),
    });

    attract.startMenuAttract();
    tick(100);

    expect(order).toEqual(["animation", "arena", "overlay", "cost"]);
  });

  it("fails closed when an overlay throws while the attract frame keeps running", () => {
    const overlay = vi.fn(() => {
      throw new Error("preview render failed");
    });
    const onRenderCost = vi.fn();
    init({ onOverlayRender: overlay, onRenderCost });

    attract.startMenuAttract();
    tick(100);
    tick(200);

    expect(overlay).toHaveBeenCalledTimes(1);
    expect(onRenderCost).toHaveBeenCalledTimes(2);
    expect(diagnostics.record).toHaveBeenCalledWith("attract", "overlayRenderFailed", {
      message: "preview render failed",
    });
  });
});
