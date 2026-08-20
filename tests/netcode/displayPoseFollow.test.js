// displayPoseFollow.test.js — NET-LAG-1 revised A: copy, no v3 low-pass
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDisplayPoseFollow } from "../../src/netcode/displayPoseFollow.js";

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
  const src = readFileSync(new URL("../../src/frameVisuals.js", import.meta.url), "utf8");

  it("uses applyDisplayPoseFollow for the non-host local pose", () => {
    expect(src).toMatch(/applyDisplayPoseFollow\(/);
  });

  it("does not lerp or slerp the display pose", () => {
    expect(src).not.toMatch(/_displayPos\.lerp/);
    expect(src).not.toMatch(/_displayQuat\.slerp/);
  });
});
