// camera.js — cinematic countdown fly-over warm-up pose.
// getCinematicCountdownWarmupPose gives the shader/composer warm-up pass a representative
// point on the fly-over orbit so it can prime the view before the countdown camera ever
// hard-cuts to it live (see main.js warmupActiveSceneShaders — the previously-never-rendered
// wide/high orbit was stalling the countdown itself, round-start jank confirmed by playtest).

import { describe, it, expect } from "vitest";
import { getCinematicCountdownWarmupPose } from "../src/camera.js";

describe("getCinematicCountdownWarmupPose", () => {
  it("matches the default fly-over config (radius 28, height 14, lookAt y 1.5)", () => {
    const { position, lookAt } = getCinematicCountdownWarmupPose();
    expect(position.x).toBeCloseTo(28, 5);
    expect(position.y).toBeCloseTo(14, 5);
    expect(position.z).toBeCloseTo(0, 5);
    expect(lookAt.x).toBeCloseTo(0, 5);
    expect(lookAt.y).toBeCloseTo(1.5, 5);
    expect(lookAt.z).toBeCloseTo(0, 5);
  });

  it("honors per-arena overrides (Sundial's wider/higher orbit) the same way beginRoundFlyover does", () => {
    const { position } = getCinematicCountdownWarmupPose({ radius: 32.53, height: 16 });
    expect(position.x).toBeCloseTo(32.53, 2);
    expect(position.y).toBeCloseTo(16, 5);
    expect(position.z).toBeCloseTo(0, 5);
  });

  it("stays on the orbit circle at the configured radius regardless of startAngle", () => {
    const { position } = getCinematicCountdownWarmupPose({ startAngle: Math.PI / 3 });
    const radiusFromOrigin = Math.hypot(position.x, position.z);
    expect(radiusFromOrigin).toBeCloseTo(28, 5);
  });

  it("is pure — repeated calls return equal but distinct Vector3 instances", () => {
    const a = getCinematicCountdownWarmupPose();
    const b = getCinematicCountdownWarmupPose();
    expect(a.position).not.toBe(b.position);
    expect(a.position.equals(b.position)).toBe(true);
  });
});
