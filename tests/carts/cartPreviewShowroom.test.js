import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CartPreview } from "../../src/ui/cartPreview.js";

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

  it("blends cursor yaw and lean into the fake ram without competing pose writes", () => {
    const preview = new CartPreview();
    preview.cartGroup = new THREE.Group();
    preview._captureShowroomRestPosition(preview.cartGroup);
    preview.setHeroPose();
    preview.setPointerParallax(1, -1);
    preview._advancePointerParallax(1);

    const pointerYaw = preview.cartGroup.rotation.y;
    const pointerLean = preview.cartGroup.rotation.x;
    expect(pointerYaw).toBeGreaterThan(Math.PI + 0.37);
    expect(pointerLean).toBeGreaterThan(0);

    // * At preparation start, feint weight is zero: the live cursor pose stays exact.
    preview.applyShowroomFeint(10400);
    expect(preview.cartGroup.rotation.y).toBeCloseTo(pointerYaw);
    expect(preview.cartGroup.rotation.x).toBeCloseTo(pointerLean);

    // * At ram start the feint owns the pose completely, then recovery restores cursor life.
    preview.applyShowroomFeint(10950);
    expect(preview.cartGroup.rotation.x).toBeCloseTo(0.055);
    preview.applyShowroomFeint(12250);
    expect(preview.cartGroup.rotation.y).toBeCloseTo(pointerYaw);
    expect(preview.cartGroup.rotation.x).toBeCloseTo(pointerLean);
  });

  it("clamps menu targets and returns exactly to the hero pose", () => {
    const preview = new CartPreview();
    preview.cartGroup = new THREE.Group();
    preview._captureShowroomRestPosition(preview.cartGroup);
    preview.setHeroPose();
    preview.setPointerParallax(99, -99);
    preview._advancePointerParallax(1);

    expect(preview.cartGroup.rotation.y - (Math.PI + 0.37)).toBeCloseTo(THREE.MathUtils.degToRad(5));
    expect(preview.cartGroup.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(2));

    preview.resetPointerParallax();
    preview._advancePointerParallax(2);
    expect(preview.cartGroup.rotation.y).toBeCloseTo(Math.PI + 0.37);
    expect(preview.cartGroup.rotation.x).toBe(0);
  });

  it("reapplies the live cursor pose after a preview cart replacement", () => {
    const preview = new CartPreview();
    preview.cartGroup = new THREE.Group();
    preview._captureShowroomRestPosition(preview.cartGroup);
    preview.setHeroPose();
    preview.setPointerParallax(-1, 1);
    preview._advancePointerParallax(1);

    preview.cartGroup = new THREE.Group();
    preview._captureShowroomRestPosition(preview.cartGroup);
    preview._applySpinRotation();

    expect(preview.cartGroup.rotation.y).toBeCloseTo(Math.PI + 0.37 - THREE.MathUtils.degToRad(5));
    expect(preview.cartGroup.rotation.x).toBeCloseTo(-THREE.MathUtils.degToRad(2));
  });
});
