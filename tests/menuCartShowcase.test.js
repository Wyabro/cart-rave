// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  quality: "high",
  renderResult: "rendered",
  instances: [],
  record: vi.fn(),
}));

vi.mock("../src/customization.js", () => ({
  loadPlayerCustomization: () => ({
    hex: 0xff2bd6,
    pattern: "classic",
    sunglassesStyle: "silver",
  }),
}));
vi.mock("../src/utils/qualityMode.js", () => ({ getQualityTier: () => state.quality }));
vi.mock("../src/utils/diagnostics.js", () => ({ recordDiagEvent: state.record }));
vi.mock("../src/ui/cartPreview.js", () => ({
  CartPreview: class {
    constructor() {
      this.cartGroup = null;
      this.initExternal = vi.fn();
      this.setColor = vi.fn();
      this.setPattern = vi.fn();
      this.setSunglassesStyle = vi.fn();
      this.setHeroPose = vi.fn();
      this.applyShowroomFeint = vi.fn(() => false);
      this.resetShowroomFeint = vi.fn();
      this.renderExternal = vi.fn(() => state.renderResult);
      this.dispose = vi.fn();
      state.instances.push(this);
    }
  },
}));

/** @type {typeof import("../src/ui/menuCartShowcase.js")} */
let showcaseModule;

beforeEach(async () => {
  state.quality = "high";
  state.renderResult = "rendered";
  state.instances = [];
  state.record.mockReset();
  document.body.innerHTML = '<div id="cr-menu-cart-holder" hidden></div>';
  const holder = document.getElementById("cr-menu-cart-holder");
  holder.getBoundingClientRect = () => ({ width: 300, height: 220 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  vi.resetModules();
  showcaseModule = await import("../src/ui/menuCartShowcase.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("menu cart showcase gates", () => {
  it("mounts one static shared preview only on desktop Medium/High", () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      renderer: /** @type {any} */ ({}),
      getMenuVisible: () => true,
    });

    showcase.render(100);
    const preview = state.instances[0];
    expect(preview.initExternal).toHaveBeenCalledTimes(1);
    expect(preview.setHeroPose).toHaveBeenCalledTimes(1);
    expect(preview.renderExternal).toHaveBeenCalledTimes(1);

    state.quality = "low";
    showcase.render(140);
    expect(preview.dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById("cr-menu-cart-holder").hidden).toBe(true);
  });

  it("fails closed rather than drawing into a non-default composer target", () => {
    state.renderResult = "targetNonNull";
    const showcase = showcaseModule.createMenuCartShowcase({
      renderer: /** @type {any} */ ({}),
      getMenuVisible: () => true,
    });

    showcase.render(100);
    showcase.render(140);

    expect(state.record).toHaveBeenCalledWith("attract", "menuCartComposerTargetNonNull", {});
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].dispose).toHaveBeenCalledTimes(1);
  });
});
