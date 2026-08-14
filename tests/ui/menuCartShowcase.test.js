// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  quality: "high",
  instances: [],
  record: vi.fn(),
}));

vi.mock("../../src/carts/customization.js", () => ({
  loadPlayerCustomization: () => ({
    hex: 0xff2bd6,
    pattern: "classic",
    sunglassesStyle: "silver",
  }),
}));
vi.mock("../../src/utils/qualityMode.js", () => ({ getQualityTier: () => state.quality }));
vi.mock("../../src/utils/diagnostics.js", () => ({ recordDiagEvent: state.record }));
vi.mock("../../src/ui/cartPreview.js", () => ({
  CartPreview: class {
    constructor() {
      this.cartGroup = null;
      this.init = vi.fn();
      this.initExternal = vi.fn();
      this.setColor = vi.fn();
      this.setPattern = vi.fn();
      this.setSunglassesStyle = vi.fn();
      this.setHeroPose = vi.fn();
      this.applyShowroomFeint = vi.fn(() => false);
      this.resetShowroomFeint = vi.fn();
      this.renderExternal = vi.fn();
      this.dispose = vi.fn();
      state.instances.push(this);
    }
  },
}));

/** @type {typeof import("../../src/ui/menuCartShowcase.js")} */
let showcaseModule;

beforeEach(async () => {
  state.quality = "high";
  state.instances = [];
  state.record.mockReset();
  document.body.innerHTML = '<div id="cr-menu-cart-holder" hidden></div>';
  const holder = document.getElementById("cr-menu-cart-holder");
  holder.getBoundingClientRect = () => ({ width: 300, height: 220 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  vi.resetModules();
  showcaseModule = await import("../../src/ui/menuCartShowcase.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("menu cart showcase", () => {
  it("mounts an owned CartPreview (Customize path) only on desktop Medium/High", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });

    showcase.render(100);
    // * CHUNK-DEFER-1 L1b: CartPreview loads via dynamic import().
    await vi.waitFor(() => {
      expect(state.instances.length).toBe(1);
    });
    const preview = state.instances[0];
    expect(preview.init).toHaveBeenCalledTimes(1);
    expect(preview.initExternal).not.toHaveBeenCalled();
    expect(preview.setHeroPose).toHaveBeenCalledTimes(1);
    // * Owned rAF draws; attract tick only drives feint.
    expect(preview.renderExternal).not.toHaveBeenCalled();

    state.quality = "low";
    showcase.render(140);
    expect(preview.dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById("cr-menu-cart-holder").hidden).toBe(true);
  });

  it("disposes the owned canvas when suspended for Customize", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => {
      expect(state.instances.length).toBe(1);
    });
    const preview = state.instances[0];
    showcase.setSuspended(true);
    expect(preview.dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById("cr-menu-cart-holder").hidden).toBe(true);
  });

  it("stays unmounted when the layout rail leaves less than 180px of height", () => {
    const holder = document.getElementById("cr-menu-cart-holder");
    holder.getBoundingClientRect = () => ({ width: 300, height: 179 });
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });

    showcase.render(100);

    expect(state.instances).toHaveLength(0);
    expect(holder.hidden).toBe(true);
  });
});
