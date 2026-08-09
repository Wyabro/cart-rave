// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CartPreview } from "../src/ui/cartPreview.js";

function createPreview() {
  const preview = new CartPreview();
  preview.cartGroup = new THREE.Group();
  preview.cartGroup.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1)));
  preview.camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 50);
  preview.renderer = {};
  preview._getContentSize = () => ({ width: 400, height: 300 });
  return preview;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CartPreview sunglasses zoom transition", () => {
  it("settles on the exact target after the balanced transition", () => {
    const preview = createPreview();

    preview.setZoom(1.35, { animate: true });
    expect(preview._zoomMultiplier).toBe(1);
    expect(preview._zoomTransition).not.toBeNull();

    preview._advanceZoomTransition(120);
    expect(preview._zoomMultiplier).toBeGreaterThan(1);
    expect(preview._zoomMultiplier).toBeLessThan(1.35);

    preview._advanceZoomTransition(120);
    expect(preview._zoomMultiplier).toBe(1.35);
    expect(preview._zoomTransition).toBeNull();
  });

  it("reverses from the current zoom when the tab changes quickly", () => {
    const preview = createPreview();

    preview.setZoom(1.35, { animate: true });
    preview._advanceZoomTransition(120);
    const midZoom = preview._zoomMultiplier;

    preview.setZoom(1, { animate: true });
    expect(preview._zoomTransition?.from).toBe(midZoom);

    preview._advanceZoomTransition(240);
    expect(preview._zoomMultiplier).toBe(1);
    expect(preview._zoomTransition).toBeNull();
  });

  it("snaps immediately for reduced-motion users", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true });
    const preview = createPreview();

    preview.setZoom(1.35, { animate: true });

    expect(preview._zoomMultiplier).toBe(1.35);
    expect(preview._zoomTransition).toBeNull();
  });
});
