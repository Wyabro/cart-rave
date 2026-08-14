// yawExtraction.test.js — the reconcile visual path must use the ground-projected
// forward heading, not the z²-cos Euler yaw.
//
// Background: gameLoop.js carried a private yawFromQuat whose cos term used x².
// A 07-19 polish sweep nearly "fixed" it to match simulation.js's z² formula —
// but the x² form is the mathematically exact heading of the rotated -Z nose
// projected onto the floor, and it is what frameVisuals/contactShadows (YXZ Euler
// yaw) compose against when applying cart._reconcileVisOffset. The z² form drifts
// under steep pitch (16° error at 60° nose-down). The shared helper is now
// simulation.headingYawFromQuat; these tests pin it to the projected-forward
// ground truth so neither formula can silently replace the other again.

import { describe, it, expect } from "vitest";
import { Quaternion, Euler, Vector3 } from "three";
import { headingYawFromQuat, wrapAngleRad } from "../../src/simulation.js";
import { yawFromQuaternion as visualYawYXZ } from "../../src/contactShadows.js";

/** Heading of the cart's -Z nose projected onto the floor plane. */
function projectedForwardHeading(q) {
  const f = new Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-f.x, -f.z);
}

const FIXTURES = [
  { yaw: 0.3, pitch: 0, roll: 0 },
  { yaw: (30 * Math.PI) / 180, pitch: (25 * Math.PI) / 180, roll: (10 * Math.PI) / 180 },
  { yaw: (-140 * Math.PI) / 180, pitch: (60 * Math.PI) / 180, roll: (-20 * Math.PI) / 180 },
  { yaw: (95 * Math.PI) / 180, pitch: (-35 * Math.PI) / 180, roll: (45 * Math.PI) / 180 },
];

describe("headingYawFromQuat", () => {
  it("matches the projected -Z forward heading under any tilt", () => {
    for (const { yaw, pitch, roll } of FIXTURES) {
      const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, "YXZ"));
      const expected = projectedForwardHeading(q);
      expect(wrapAngleRad(headingYawFromQuat(q) - expected)).toBeCloseTo(0, 6);
    }
  });

  it("agrees with the visual pipeline's YXZ Euler yaw (contactShadows)", () => {
    for (const { yaw, pitch, roll } of FIXTURES) {
      const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, "YXZ"));
      expect(wrapAngleRad(headingYawFromQuat(q) - visualYawYXZ(q))).toBeCloseTo(0, 6);
    }
  });

  it("is NOT the z²-cos steering yaw — that one drifts under steep pitch", () => {
    const q = new Quaternion().setFromEuler(
      new Euler((60 * Math.PI) / 180, (30 * Math.PI) / 180, 0, "YXZ"),
    );
    const steeringStyle = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z),
    );
    // * ~14° apart on this fixture — if these ever converge the fixture is wrong.
    expect(Math.abs(wrapAngleRad(steeringStyle - headingYawFromQuat(q)))).toBeGreaterThan(0.1);
  });
});

describe("wrapAngleRad", () => {
  it("wraps into [-PI, PI]", () => {
    expect(wrapAngleRad(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngleRad(-3 * Math.PI)).toBeCloseTo(-Math.PI, 10);
    expect(wrapAngleRad(0.5)).toBeCloseTo(0.5, 10);
  });
});
