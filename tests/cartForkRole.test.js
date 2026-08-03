// cartForkRole.test.js — CART-FORK-1.
//
// * Source asserts, not a render test: cartRaveGltf.js is three.js-heavy and the repo gates
// * rendering visually (SHIP-1 § "Rendering coverage — handled differently"). What IS worth
// * pinning is the pure data table, because CART-MODEL-1 will re-author this model and a
// * re-import is exactly how a part quietly lands back in the wrong bucket.
//
// * The bug: a "trim" part WITH an albedo map is treated as a neon wire segment on the
// * basket and takes the body bloom mask. tripo_part_23 is a tiny caster-level piece, so it
// * rendered basket-pink and glowing down among the white forks, while its mirror twin
// * tripo_part_22 (same x, mirrored z) was correctly "fork".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/cartRaveGltf.js", import.meta.url), "utf8");

/**
 * Read one entry out of the cartrave4 role table (the block is a frozen object literal).
 * @param {string} part
 * @returns {string | null}
 */
function roleOf(part) {
  const table = src.slice(
    src.indexOf("const RAVE_GLTF_PART_ROLES_V4"),
    src.indexOf("RAVE_GLTF_PART_ROLES_LEGACY"),
  );
  const m = new RegExp(`\\b${part}:\\s*"([a-z]+)"`).exec(table);
  return m ? m[1] : null;
}

describe("CART-FORK-1 — cartrave4 part roles", () => {
  it("tripo_part_23 is a fork, not basket trim", () => {
    expect(roleOf("tripo_part_23")).toBe("fork");
  });

  it("keeps the mirror twins 22 and 23 in the same role", () => {
    // * These two are the same piece on opposite sides of the cart: identical x (-0.148),
    // * mirrored z (-0.235 / +0.236), 26 vs 29 verts in art/models/cartrave4.glb. They
    // * disagreeing is precisely the defect, so pin the pair rather than the value alone.
    expect(roleOf("tripo_part_23")).toBe(roleOf("tripo_part_22"));
  });

  it("no caster-level part is left on a basket role", () => {
    // * Every part named in a fork group, plus their twins, must be fork-roled — otherwise
    // * it picks up the body treatment down at wheel height.
    for (const part of ["tripo_part_13", "tripo_part_22", "tripo_part_5", "tripo_part_21", "tripo_part_23"]) {
      expect(`${part}=${roleOf(part)}`).toBe(`${part}=fork`);
    }
  });

  it("still routes trim-with-a-map through the body bloom mask", () => {
    // * This is WHY the role mattered. If this branch is ever removed the comments on the
    // * role table become false, and the test that pins them should fail loudly, not rot.
    expect(src).toMatch(/role === "trim" && srcMat\.map/);
  });

  it("the tall basket side panels stay trim", () => {
    // * Guards the other direction: 15/16 are the pink panels flanking the basket and are
    // * SUPPOSED to take the body treatment. A blanket "make everything fork" would pass
    // * the asserts above and break the cart's look.
    expect(roleOf("tripo_part_15")).toBe("trim");
    expect(roleOf("tripo_part_16")).toBe("trim");
  });
});
