// shelfRail.test.js — SHELF-RAIL-1: the booth rails must not be the shiniest
// surface in The Storerooms.
//
// railMat (buildBackroomsBooths) was roughness 0.45 / metalness 0.7 — the
// lowest-roughness / highest-metalness pair in backroomsSupermarket.js — so
// under the RoomEnvironment PMREM it read as polished chrome in a room where
// every other surface is matte (painted wood 0.92/0.02, booth slab 0.9/0.08,
// fixture frames 0.7/0.3). The fix moves it to painted steel in the frameMat
// language. Source assertion — the material is built inline and there is no
// renderer in unit tests; same shape as the STORE-WALL-SLIDE-1 friction check
// in backroomsPitWall.test.js.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../src/levels/backroomsSupermarket.js", import.meta.url), "utf8");

/** Body of the railMat createPhysicalMaterial call. */
function railMatSource() {
  const start = src.indexOf("const railMat = createPhysicalMaterial(");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("});", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("SHELF-RAIL-1 — booth rails read painted steel, not chrome", () => {
  it("roughness is raised out of the polished band (>= 0.7)", () => {
    const body = railMatSource();
    const m = body.match(/roughness:\s*([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(0.7);
  });

  it("metalness is cut below the old chrome value (<= 0.4)", () => {
    const body = railMatSource();
    const m = body.match(/metalness:\s*([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeLessThanOrEqual(0.4);
  });

  it("the rails are no longer the shiniest pair in the file", () => {
    // * Collect every roughness/metalness pair in the file; rails must not be the
    // * lowest-roughness AND highest-metalness combination (the chrome signature).
    const pairs = [];
    const re = /roughness:\s*([0-9.]+)[^}]*metalness:\s*([0-9.]+)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      pairs.push({ roughness: Number(m[1]), metalness: Number(m[2]) });
    }
    expect(pairs.length).toBeGreaterThan(5); // non-vacuous: room has many materials
    const rails = pairs.find((p) => p.roughness >= 0.7 && p.metalness <= 0.4 && p.metalness >= 0.25);
    expect(rails).toBeTruthy();
    const shinier = pairs.filter((p) => p.roughness <= rails.roughness && p.metalness >= rails.metalness);
    // * Only the rails themselves (or an exact tie) may sit at the extreme.
    expect(shinier.length).toBeLessThanOrEqual(2);
  });
});
