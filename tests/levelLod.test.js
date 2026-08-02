// levelLod.test.js — distance culling registry

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

  it("clearLevelLod empties registry", () => {
    registerLevelLodNode(fakeObj(0, 0), { far: 10 });
    clearLevelLod();
    expect(getLevelLodNodeCount()).toBe(0);
  });
});
