// @vitest-environment happy-dom
// NET-LAG-1: normal driving is direct; correction and hit-stop easing are separate.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyDisplayPoseFollow } from "../../src/netcode/displayPoseFollow.js";
import { prepareLocalCartDisplayPose } from "../../src/frameVisuals.js";

function hypot3(ax, ay, az, bx, by, bz) {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

describe("applyDisplayPoseFollow", () => {
  it("copies the cap-373 trail to the mesh in one step (no v/rate leftover)", () => {
    // * Alive non-host 4090: body (−1.66, 0.37, −12.11), display (−3.20, 1.19, −11.58).
    const display = { x: -3.2, y: 1.19, z: -11.58 };
    const mesh = { x: -1.66, y: 0.37, z: -12.11 };
    expect(hypot3(display.x, display.y, display.z, mesh.x, mesh.y, mesh.z)).toBeGreaterThan(1.5);
    applyDisplayPoseFollow(display, null, mesh);
    expect(display).toEqual(mesh);
  });

  it("copies a teleport-scale gap the same way (old maxCorrectionM snap)", () => {
    const display = { x: 0, y: 0, z: 0 };
    const mesh = { x: 8, y: 0, z: 0 };
    applyDisplayPoseFollow(display, null, mesh);
    expect(display).toEqual(mesh);
  });

  it("copies heading with position", () => {
    const displayPos = { x: 1, y: 2, z: 3 };
    const displayQuat = { x: 0, y: 0, z: 0, w: 1 };
    const meshPos = { x: 4, y: 5, z: 6 };
    const meshQuat = { x: 0, y: 0.707, z: 0, w: 0.707 };
    applyDisplayPoseFollow(displayPos, displayQuat, meshPos, meshQuat);
    expect(displayPos).toEqual(meshPos);
    expect(displayQuat).toEqual(meshQuat);
  });
});

describe("NET-LAG-1 frameVisuals wiring", () => {
  function cartAt(x = 10) {
    return {
      body: {
        translation: () => ({ x, y: 0, z: 0 }),
        rotation: () => ({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }),
      },
      _displayPos: new THREE.Vector3(),
      _displayQuat: new THREE.Quaternion(),
      _displayReady: true,
    };
  }

  it("copies normal driving pose without adding display lag", () => {
    const cart = cartAt();
    prepareLocalCartDisplayPose(cart, 1, 0, 1 / 60, {});
    expect(cart._displayPos.x).toBe(10);
    expect(cart._displayQuat.angleTo(new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2))).toBeCloseTo(0);
  });

  it("applies and decays only the reconciliation error", () => {
    const cart = cartAt();
    cart._reconcileVisOffset = { x: 2, y: 0, z: 0, yaw: 0 };
    const prediction = { reconcilePosRate: 3.2, reconcileRotRate: 2.5 };
    prepareLocalCartDisplayPose(cart, 1, 0, 1 / 60, prediction);
    expect(cart._displayPos.x).toBe(12);
    expect(cart._reconcileVisOffset.x).toBeCloseTo(2 * Math.exp(-3.2 / 60));
    cart.body.translation = () => ({ x: 20, y: 0, z: 0 });
    const remainingError = cart._reconcileVisOffset.x;
    prepareLocalCartDisplayPose(cart, 1, 0, 1 / 60, prediction);
    expect(cart._displayPos.x).toBeCloseTo(20 + remainingError);
  });

  it("blends only when explicitly recovering from hit-stop", () => {
    const cart = cartAt();
    prepareLocalCartDisplayPose(cart, 1, 0, 1 / 60, {}, true);
    expect(cart._displayPos.x).toBeCloseTo(7.5);
    const target = new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2);
    expect(cart._displayQuat.angleTo(target)).toBeCloseTo(Math.PI / 8);
    prepareLocalCartDisplayPose(cart, 1, 0, 1 / 60, {}, false);
    expect(cart._displayPos.x).toBe(10);
    expect(cart._displayQuat.angleTo(target)).toBeCloseTo(0);
  });
});
