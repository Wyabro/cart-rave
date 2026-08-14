// cartForkRole.test.js — CART-FORK-1 + CART-FORK-SWIVEL-1.
//
// * Source asserts, not a render test: cartRaveGltf.js is three.js-heavy and the repo gates
// * rendering visually (SHIP-1 § "Rendering coverage — handled differently"). What IS worth
// * pinning is the pure data table, because CART-MODEL-1 will re-author this model and a
// * re-import is exactly how a part quietly lands back in the wrong bucket.
//
// * CART-FORK-1: a "trim" part WITH an albedo map is treated as a neon wire segment on the
// * basket and takes the body bloom mask. tripo_part_23 is a tiny caster-level piece, so it
// * rendered basket-pink and glowing down among the white forks, while its mirror twin
// * tripo_part_22 (same x, mirrored z) was correctly "fork".
//
// * CART-FORK-SWIVEL-1: role alone is not enough — buildRaveGltfCasterCorner only reparents
// * meshes listed in RAVE_GLTF_V4_FORK_GROUPS.forkParts. part_23 must sit in backLeft with
// * its twin part_22 in backRight. Source pins membership; live steer still owns done.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../src/carts/cartRaveGltf.js", import.meta.url), "utf8");

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

/**
 * forkParts array for one RAVE_GLTF_V4_FORK_GROUPS entry by corner label.
 * @param {string} label
 * @returns {string[]}
 */
function forkPartsOf(label) {
  const groups = src.slice(
    src.indexOf("const RAVE_GLTF_V4_FORK_GROUPS"),
    src.indexOf("RAVE_GLTF_CASTER_CORNER_SIGNS"),
  );
  const block = new RegExp(
    `label:\\s*"${label}"[\\s\\S]*?forkParts:\\s*Object\\.freeze\\(\\[([^\\]]+)\\]\\)`,
  ).exec(groups);
  if (!block) return [];
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
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

describe("CART-FORK-SWIVEL-1 — rear fork group membership", () => {
  it("tripo_part_23 is in backLeft forkParts (not orphaned)", () => {
    expect(forkPartsOf("backLeft")).toContain("tripo_part_23");
  });

  it("keeps mirror twins on opposite rear casters", () => {
    // * part_22 (z -0.235) → BR; part_23 (z +0.236) → BL. Both must be listed or one side
    // * stays model-static while its caster steers — the SWIVEL defect.
    expect(forkPartsOf("backRight")).toContain("tripo_part_22");
    expect(forkPartsOf("backLeft")).toContain("tripo_part_23");
    expect(forkPartsOf("backLeft")).not.toContain("tripo_part_22");
    expect(forkPartsOf("backRight")).not.toContain("tripo_part_23");
  });
});
