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

  it("clearLevelLod empties registry", () => {
    registerLevelLodNode(fakeObj(0, 0), { far: 10 });
    clearLevelLod();
    expect(getLevelLodNodeCount()).toBe(0);
  });
});
