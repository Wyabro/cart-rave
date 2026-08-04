// levelLod.test.js — distance culling registry

import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearLevelLod,
  registerLevelLodNode,
  updateLevelLod,
  getLevelLodNodeCount,
} from "../src/utils/levelLod.js";

function fakeObj(x, z) {
  return {
    visible: true,
    userData: {},
    getWorldPosition(out) {
      out.x = x;
      out.y = 0;
      out.z = z;
      return out;
    },
  };
}

function fakeCamera(x, z) {
  return { position: { x, y: 2, z } };
}

describe("levelLod", () => {
  beforeEach(() => clearLevelLod());

  it("registers and culls by far radius", () => {
    const near = fakeObj(5, 0);
    const far = fakeObj(100, 0);
    registerLevelLodNode(near, { far: 40 });
    registerLevelLodNode(far, { far: 40 });
    expect(getLevelLodNodeCount()).toBe(2);

    updateLevelLod(fakeCamera(0, 0), 1000);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false);
  });

  it("throttles updates within INTERVAL", () => {
    const obj = fakeObj(5, 0);
    registerLevelLodNode(obj, { far: 40 });
    updateLevelLod(fakeCamera(0, 0), 1000);
    obj.visible = false; // mutate externally
    updateLevelLod(fakeCamera(0, 0), 1100); // < 250ms later
    expect(obj.visible).toBe(false); // not re-run
    updateLevelLod(fakeCamera(0, 0), 1300);
    expect(obj.visible).toBe(true);
  });

  // * The defect behind the Storerooms floor-decal fix: updateLevelLod measures the
  // * REGISTERED object's world position, so registering a container whose children
  // * carry world coords tests camera-to-container-origin. The Storerooms decal groups
  // * sit at (0,0), so all ~22 floor markings culled on camera-to-arena-CENTRE and
  // * blinked together. Per-child registration is the fix; this locks both halves.
  it("culls a container by ITS origin, not by where its children are", () => {
    const groupAtOrigin = fakeObj(0, 0); // container never repositioned
    registerLevelLodNode(groupAtOrigin, { far: 38 });
    // Camera 20m from the child at (30,30) but 62m from the container origin.
    updateLevelLod(fakeCamera(44, 44), 1000);
    expect(groupAtOrigin.visible).toBe(false); // child would have been well in range
  });

  it("keeps a per-child node visible at the same camera pose", () => {
    const child = fakeObj(30, 30); // world-space decal, registered directly
    registerLevelLodNode(child, { far: 38 });
    updateLevelLod(fakeCamera(44, 44), 1000);
    expect(child.visible).toBe(true); // ~19.8m away — inside far
  });

  // * LOD-UNCANNY-1: the Storerooms painted arrows had the same container defect at
  // * far 42. Real numbers from the level: arrowSpots[0] is (33.5, 6), i.e. 34.0m from
  // * the arena centre its group never left. A camera at (60, 6) stands 26.5m from that
  // * arrow — comfortably inside 42 — but 60.3m from the origin.
  it("registering the arrow container would cull an arrow the camera is 26m from", () => {
    const groupAtOrigin = fakeObj(0, 0);
    const arrow = fakeObj(33.5, 6);
    registerLevelLodNode(groupAtOrigin, { far: 42 });
    registerLevelLodNode(arrow, { far: 42 });
    updateLevelLod(fakeCamera(60, 6), 1000);
    expect(groupAtOrigin.visible).toBe(false);
    expect(arrow.visible).toBe(true);
  });

  it("backroomsSupermarket registers the uncanny arrows per child, not as the group", () => {
    const src = readFileSync(
      new URL("../src/levels/backroomsSupermarket.js", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/registerLevelLodNode\(\s*uncanny\.group\s*,/);
    expect(src).toMatch(/for\s*\(const\s+\w+\s+of\s+uncanny\.group\.children\)/);
  });

  // * Sundial (zanzibarPlatform) registered ships, gulls and foam at far:95 and the gate was
  // * inert for all three. These three tests lock WHY, so nobody "fixes" it by copying the
  // * Storerooms per-child pattern — which cannot apply, because these are InstancedMeshes
  // * with no children to register.
  it("far:95 from the arena origin can never fire in a 34.3m arena", () => {
    const meshAtOrigin = fakeObj(0, 0); // ships/gulls/foam all sat here
    registerLevelLodNode(meshAtOrigin, { far: 95 });
    // Camera at the far rim of a 34.3m-circumradius arena, and then well beyond it.
    updateLevelLod(fakeCamera(34.3, 0), 1000);
    expect(meshAtOrigin.visible).toBe(true);
    updateLevelLod(fakeCamera(60, 60), 2000); // 84.9m — still inside 95
    expect(meshAtOrigin.visible).toBe(true);
  });

  it("measuring the ships' real orbit against far:95 would cull them — the opposite of intent", () => {
    // Ship instances orbit at 255 / 293 / 331m; the mesh they live in sits at the origin.
    const shipInstance = fakeObj(255, 0);
    registerLevelLodNode(shipInstance, { far: 95 });
    updateLevelLod(fakeCamera(0, 0), 1000);
    expect(shipInstance.visible).toBe(false); // horizon dressing would vanish
  });

  it("toggling visible on a container cannot hide an InstancedMesh's individual instances", () => {
    // The reason per-gull anchors were rejected: updateLevelLod only writes obj.visible, and
    // an anchor is not the instance. Instances are addressed by matrix, not by visibility.
    const instanced = { ...fakeObj(0, 0), isInstancedMesh: true, count: 5 };
    registerLevelLodNode(instanced, { far: 10 });
    updateLevelLod(fakeCamera(50, 0), 1000);
    expect(instanced.visible).toBe(false); // whole mesh only
    expect(instanced.count).toBe(5); // no per-instance effect exists to reach for
  });

  it("zanzibarPlatform registers no LOD nodes at all", () => {
    const src = readFileSync(
      new URL("../src/levels/zanzibarPlatform.js", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/registerLevelLodNode\(/);
    expect(src).not.toMatch(/lodProps/);
  });

  it("clearLevelLod empties registry", () => {
    registerLevelLodNode(fakeObj(0, 0), { far: 10 });
    clearLevelLod();
    expect(getLevelLodNodeCount()).toBe(0);
  });

  // * LOD-CLOCK-1: after a backward host-offset correction, syncedNow lags wall time.
  // * Feeding that lagging clock early-returns until it catches _lastUpdateMs; a
  // * monotonic local nowMs past INTERVAL still refreshes (main.js must pass raw now).
  it("does not stall when a simulated synced clock jumps backward while local now advances", () => {
    const obj = fakeObj(5, 0);
    registerLevelLodNode(obj, { far: 40 });
    updateLevelLod(fakeCamera(0, 0), 10_000);
    expect(obj.visible).toBe(true);

    obj.visible = false;
    updateLevelLod(fakeCamera(0, 0), 5_000); // lagging synced — early-returns, no poison
    expect(obj.visible).toBe(false);
    updateLevelLod(fakeCamera(0, 0), 5_500); // still lagging
    expect(obj.visible).toBe(false);

    updateLevelLod(fakeCamera(0, 0), 10_300); // local now past INTERVAL after last accept
    expect(obj.visible).toBe(true);
  });

  it("the sim loop passes raw now into updateLevelLod (not syncedNow)", () => {
    // * BUNDLE-1 Lever B: the sim loop lives in orchestration/gameBoot.js now.
    const src = readFileSync(new URL("../src/orchestration/gameBoot.js", import.meta.url), "utf8");
    expect(src).toMatch(/updateLevelLod\(\s*camera\s*,\s*now\s*\)/);
    expect(src).not.toMatch(/updateLevelLod\(\s*camera\s*,\s*syncedNow\s*\)/);
  });
});
