import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CartPreview } from "../src/ui/cartPreview.js";

describe("CartPreview showroom feint", () => {
  it("returns exactly to the named hero pose at the end of its deterministic cycle", () => {
    const preview = new CartPreview();
    preview.cartGroup = new THREE.Group();
    preview._captureShowroomRestPosition(preview.cartGroup);
    preview.setHeroPose();

    expect(preview.applyShowroomFeint(10400)).toBe(true);
    expect(preview.cartGroup.position.length()).toBe(0);
    expect(preview.applyShowroomFeint(10950)).toBe(true);
    expect(preview.cartGroup.position.length()).toBe(0);
    expect(preview.applyShowroomFeint(12250)).toBe(false);
    expect(preview.cartGroup.position.length()).toBe(0);
    expect(preview.cartGroup.rotation.x).toBe(0);
    expect(preview.cartGroup.rotation.z).toBe(0);
    expect(preview.cartGroup.rotation.y).toBeCloseTo(Math.PI + 0.37);

    // * 16s later the same fake ram begins again from the same rest pose.
    expect(preview.applyShowroomFeint(26400)).toBe(true);
    expect(preview.cartGroup.position.length()).toBe(0);
  });
});
