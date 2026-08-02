// effectsDispose.test.js — FX-TEXDISPOSE-1: disposeObject3D must not deallocate
// the shared cart materials, and must take a disposed material's maps with it.
//
// disposeObject3D is module-private in effects.js and knip's project scope is
// src/** + party/** only, so exporting it purely for this file would trip the
// unused-export gate. Source asserts instead — same shape as levelLod.test.js's
// main.js check. Both assertions fail against the pre-fix file.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const effectsSrc = readFileSync(new URL("../src/effects.js", import.meta.url), "utf8");
const cartSrc = readFileSync(new URL("../src/cart.js", import.meta.url), "utf8");

/** Body of `function disposeObject3D(...)` up to the next top-level declaration. */
function disposeObject3DSource() {
  const start = effectsSrc.indexOf("function disposeObject3D(");
  expect(start).toBeGreaterThan(-1);
  const end = effectsSrc.indexOf("\n/** @typedef", start);
  expect(end).toBeGreaterThan(start);
  return effectsSrc.slice(start, end);
}

describe("effects disposeObject3D", () => {
  it("skips materials flagged isSharedMaterial", () => {
    expect(disposeObject3DSource()).toMatch(/userData\?\.isSharedMaterial/);
  });

  it("disposes the maps of every material it does dispose", () => {
    const body = disposeObject3DSource();
    expect(body).toMatch(/DISPOSABLE_MAP_SLOTS/);
    // The slot list itself lives just above the function.
    for (const slot of ["map", "normalMap", "roughnessMap", "emissiveMap", "alphaMap"]) {
      expect(effectsSrc).toMatch(new RegExp(`"${slot}",`));
    }
  });

  it("the flag it gates on is the one cart.js actually sets", () => {
    // * Non-vacuity: the guard is worthless if cart.js stops marking the singletons.
    const flagged = cartSrc.match(/userData\s*=\s*\{\s*isSharedMaterial:\s*true\s*\}/g) ?? [];
    expect(flagged.length).toBeGreaterThanOrEqual(3);
  });
});
