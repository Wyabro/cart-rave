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
      this.setPointerParallax = vi.fn();
      this.resetPointerParallax = vi.fn();
      this.applyShowroomFeint = vi.fn(() => false);
      this.resetShowroomFeint = vi.fn();
      this.renderExternal = vi.fn();
      this.pause = vi.fn();
      this.resume = vi.fn();
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
  document.body.innerHTML = '<div id="cr-root"><div id="cr-menu-cart-holder" hidden></div></div>';
  const holder = document.getElementById("cr-menu-cart-holder");
  holder.getBoundingClientRect = () => ({ width: 300, height: 220 });
  const root = document.getElementById("cr-root");
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
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

  it("pauses the owned canvas when suspended for Customize", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => {
      expect(state.instances.length).toBe(1);
    });
    const preview = state.instances[0];
    showcase.setSuspended(true);
    expect(preview.pause).toHaveBeenCalledTimes(1);
    expect(preview.dispose).not.toHaveBeenCalled();
    expect(document.getElementById("cr-menu-cart-holder").hidden).toBe(true);
  });

  it("resumes the same instance when unsuspended", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => {
      expect(state.instances.length).toBe(1);
    });
    const preview = state.instances[0];
    showcase.setSuspended(true);
    showcase.render(200);
    expect(preview.dispose).not.toHaveBeenCalled();
    showcase.setSuspended(false);
    expect(preview.resume).toHaveBeenCalledTimes(1);
    expect(state.instances.length).toBe(1);
    expect(preview.dispose).not.toHaveBeenCalled();
  });

  it("release() disposes the owned canvas", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => {
      expect(state.instances.length).toBe(1);
    });
    const preview = state.instances[0];
    showcase.release();
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

  it("tracks a mouse across the full menu root and clamps to its edges", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => expect(state.instances.length).toBe(1));
    const preview = state.instances[0];
    const root = document.getElementById("cr-root");

    const move = new Event("pointermove");
    Object.defineProperties(move, {
      clientX: { value: 1400 },
      clientY: { value: -80 },
      pointerType: { value: "mouse" },
    });
    root.dispatchEvent(move);

    expect(preview.setPointerParallax).toHaveBeenCalledWith(1, -1);
    root.dispatchEvent(new Event("pointerleave"));
    expect(preview.resetPointerParallax).toHaveBeenLastCalledWith({ immediate: false });
  });

  it("ignores touch and immediately clears stale cursor life when suspended", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => expect(state.instances.length).toBe(1));
    const preview = state.instances[0];
    const root = document.getElementById("cr-root");

    const touch = new Event("pointermove");
    Object.defineProperties(touch, {
      clientX: { value: 500 },
      clientY: { value: 300 },
      pointerType: { value: "touch" },
    });
    root.dispatchEvent(touch);
    expect(preview.setPointerParallax).not.toHaveBeenCalled();

    showcase.setSuspended(true);
    expect(preview.resetPointerParallax).toHaveBeenLastCalledWith({ immediate: true });
  });

  it("suppresses cursor and showroom motion when reduced motion is active", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => expect(state.instances.length).toBe(1));
    const preview = state.instances[0];
    const root = document.getElementById("cr-root");

    const move = new Event("pointermove");
    Object.defineProperties(move, {
      clientX: { value: 800 },
      clientY: { value: 300 },
      pointerType: { value: "mouse" },
    });
    root.dispatchEvent(move);

    expect(preview.setPointerParallax).not.toHaveBeenCalled();
    expect(preview.resetPointerParallax).toHaveBeenLastCalledWith({ immediate: true });
    expect(preview.applyShowroomFeint).not.toHaveBeenCalled();
  });

  it("cleans cursor listeners when disposed", async () => {
    const showcase = showcaseModule.createMenuCartShowcase({
      getMenuVisible: () => true,
    });
    showcase.render(100);
    await vi.waitFor(() => expect(state.instances.length).toBe(1));
    const preview = state.instances[0];
    showcase.dispose();
    preview.setPointerParallax.mockClear();

    const move = new Event("pointermove");
    Object.defineProperties(move, {
      clientX: { value: 500 },
      clientY: { value: 300 },
      pointerType: { value: "mouse" },
    });
    document.getElementById("cr-root").dispatchEvent(move);
    expect(preview.setPointerParallax).not.toHaveBeenCalled();
  });
});
