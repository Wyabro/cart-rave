// SHADES-MAT-1 — the one-piece visor must split its lens sheets from the solid frame.
//
// The shipped visor asset is one mesh / one material. The runtime groups its large
// +/-X-facing lens sheets so the rainbow mirror finish cannot wash over the frame.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { splitRaveGltfVisorGeometry } from "../src/cartRaveGltf.js";
import { SUNGLASSES_STYLES } from "../src/cartThemeConfig.js";

describe("SHADES-MAT-1 — visor material contract", () => {
  it("routes lens-facing triangles into material group 1", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      // Lens sheet: normal faces +/-X and centroid x is in the visor lens volume.
      0.05, 0, 0,
      0.05, 0, 1,
      0.05, 1, 0,
      // Frame: normal does not face +/-X.
      0, 0, 0,
      1, 0, 0,
      0, 0, 1,
    ], 3));
    geometry.setIndex([0, 1, 2, 3, 4, 5]);

    expect(splitRaveGltfVisorGeometry(geometry)).toBe(true);
    expect(geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ]);
  });

  it("gives every style a solid frame colour", () => {
    expect(SUNGLASSES_STYLES).toHaveLength(9);
    expect(SUNGLASSES_STYLES.map((style) => style.label)).toEqual([
      "Silver",
      "Gold",
      "Blue",
      "Red",
      "Green",
      "Purple",
      "Obsidian",
      "Hazard",
      "Pearl",
    ]);
    for (const style of SUNGLASSES_STYLES) {
      expect(style.frameColor, style.id).toEqual(expect.any(Number));
    }
  });

  it("keeps Silver Mirror as a silver-to-black lens gradient", () => {
    const silver = SUNGLASSES_STYLES.find((style) => style.id === "silverMirror");
    expect(silver?.gradient.at(-1)).toBe("#070b13");
  });
});
