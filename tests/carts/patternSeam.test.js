// patternSeam.test.js — PATTERNS-UI-1: guard the two traps that would silently kill patterns.
//
// 1. TEXCOORD_1 (the clean pattern channel) must SURVIVE the draco compression pipeline.
//    The pattern mask is injected at runtime (src/cartPatterns.js samples three's `uv1`), so no
//    *material* references the channel — which is exactly why `gltf-transform optimize`'s prune
//    pass would strip it and why scripts/compress-rave-gltf.mjs uses discrete passes instead.
//    This test re-checks both GLBs (uncompressed master + shipped draco) on the CartFrame body
//    (`tripo_part_0` → `Mesh_0`) so a future recompression that drops the channel goes hard red.
//
// 2. The pattern id registry must stay coherent. A pattern id missing from `PATTERN_UNLOCKS`
//    silently becomes free (isPatternUnlocked treats a missing def as free), and a label missing
//    from `CART_PATTERNS` renders an empty chip. So `CART_PATTERN_IDS`, `CART_PATTERNS` keys, and
//    `PATTERN_UNLOCKS` keys must agree exactly.
//
// Deliberately NOT asserted: SVG tile / chip scale and the shader mask geometry — the visual pass
// may legitimately tune those numbers without this seam failing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CART_PATTERN_IDS,
  CART_PATTERNS,
  getPatternAccentHexes,
  isMulticolorPattern,
} from "../../src/carts/cartPatternConfig.js";
import { PATTERN_UNLOCKS } from "../../src/unlockConfig.js";
import { CART_COLORS } from "../../src/config.js";
import { PATTERN_MASK_LAYOUTS, PATTERN_MASK_SIZE } from "../../src/carts/cartPatterns.js";

const MASTER_GLB = new URL("../../art/models/cartrave4.glb", import.meta.url);
const DRACO_GLB = new URL("../../public/models/cartrave4-draco.glb", import.meta.url);

/**
 * Extracts the JSON chunk of a glTF Binary (GLB) file.
 * Header: magic(4) + version(4) + totalLength(4). Then chunks of
 * chunkLength(4) + chunkType(4) + data. 0x4E4F534A is "JSON".
 * @param {Buffer} buffer
 * @returns {any} Parsed glTF JSON.
 */
function parseGlbJson(buffer) {
  let offset = 12;
  const length = buffer.readUInt32LE(8);
  while (offset < length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkType === 0x4e4f534a) return JSON.parse(buffer.toString("utf8", dataStart, dataStart + chunkLength));
    offset = dataStart + chunkLength;
  }
  throw new Error("GLB has no JSON chunk");
}

/**
 * Attribute names of the CartFrame body primitive. The body node `tripo_part_0` is renamed
 * `CartFrame` at load (bindRaveGltfCartParts in src/cartRaveGltf.js).
 * @param {URL} glbUrl
 * @returns {string[]}
 */
function cartFrameAttributeNames(glbUrl) {
  const gltf = parseGlbJson(readFileSync(glbUrl));
  const bodyNode = gltf.nodes.find((n) => n.name === "tripo_part_0");
  if (!bodyNode) throw new Error(`${glbUrl}: node tripo_part_0 (CartFrame) not found`);
  const mesh = gltf.meshes[bodyNode.mesh];
  if (!mesh) throw new Error(`${glbUrl}: node tripo_part_0 has no mesh`);
  return Object.keys(mesh.primitives[0].attributes || {});
}

describe("pattern seam — TEXCOORD_1 survives on the CartFrame body", () => {
  it("1. keeps TEXCOORD_1 on the uncompressed master (art/models/cartrave4.glb)", () => {
    const attrs = cartFrameAttributeNames(MASTER_GLB);
    expect(attrs).toContain("POSITION");
    expect(attrs).toContain("TEXCOORD_0");
    expect(attrs).toContain("TEXCOORD_1");
  });

  it("2. keeps TEXCOORD_1 on the shipped draco build (public/models/cartrave4-draco.glb)", () => {
    // The prune trap: no material references `uv1` (the pattern mask is injected at runtime),
    // so `gltf-transform optimize` strips it silently. If this fails, recompress with
    // `npm run compress:rave-gltf` — not raw optimize (docs/guides/cart-pattern-reuv.md).
    const attrs = cartFrameAttributeNames(DRACO_GLB);
    expect(attrs).toContain("POSITION");
    expect(attrs).toContain("TEXCOORD_0");
    expect(attrs).toContain("TEXCOORD_1");
  });
});

describe("pattern seam — registry coherence", () => {
  it("3. CART_PATTERN_IDS, CART_PATTERNS keys, and PATTERN_UNLOCKS keys agree exactly", () => {
    // A pattern missing from PATTERN_UNLOCKS silently becomes free (isPatternUnlocked defaults a
    // missing def to free); a missing CART_PATTERNS label renders an empty chip.
    expect(new Set(Object.keys(CART_PATTERNS))).toEqual(new Set(CART_PATTERN_IDS));
    expect(new Set(Object.keys(PATTERN_UNLOCKS))).toEqual(new Set(CART_PATTERN_IDS));
  });

  it("4. keeps the nine player-facing patterns in their approved order", () => {
    expect(CART_PATTERN_IDS).toEqual([
      "classic", "stripes", "checker", "dots", "waves", "bolt", "honeycomb", "diamond", "cubes",
    ]);
    expect(CART_PATTERNS.dots.label).toBe("Maze");
  });

  it("5. grants the first three patterns and preserves the six earned goals", () => {
    expect(CART_PATTERN_IDS.filter((id) => PATTERN_UNLOCKS[id].free)).toEqual([
      "classic", "stripes", "checker",
    ]);
    expect(PATTERN_UNLOCKS.dots).toMatchObject({ event: "combo_t2", goal: 8 });
    expect(PATTERN_UNLOCKS.waves).toMatchObject({ event: "combo_t3", goal: 5 });
    expect(PATTERN_UNLOCKS.bolt).toMatchObject({ event: "last_standing", goal: 3 });
    expect(PATTERN_UNLOCKS.honeycomb).toMatchObject({ event: "ko_void", goal: 10 });
    expect(PATTERN_UNLOCKS.diamond).toMatchObject({ event: "ko_npc", goal: 15 });
    expect(PATTERN_UNLOCKS.cubes).toMatchObject({ event: "ko_void", goal: 50 });
  });

  it("6. derives distinct brand-aligned accents only for multicolor patterns", () => {
    const [base, accentA, accentB] = getPatternAccentHexes("cubes", CART_COLORS.pink.hex);
    expect(base).toBe(CART_COLORS.pink.hex);
    expect(new Set([base, accentA, accentB]).size).toBe(3);
    expect(isMulticolorPattern("honeycomb")).toBe(true);
    expect(isMulticolorPattern("diamond")).toBe(true);
    expect(isMulticolorPattern("cubes")).toBe(true);
    expect(isMulticolorPattern("dots")).toBe(false);
  });

  it("7. keeps multicolor patterns in the existing one-material shader path", () => {
    const source = readFileSync(new URL("../../src/carts/cartPatterns.js", import.meta.url), "utf8");
    expect(source).toContain("uPatternMulticolor");
    expect(source).toContain("getPatternAccentHexes");
    expect(source).toContain('const PATTERN_CACHE_KEY_ON = "cartPattern:1";');
  });

  it("8. keeps the corrected art tiles large and phase-aligned at every texture edge", () => {
    expect(PATTERN_MASK_LAYOUTS.dots.repeat).toBe(1.5);
    expect(PATTERN_MASK_LAYOUTS.honeycomb.repeat).toBe(1.5);
    expect(PATTERN_MASK_LAYOUTS.diamond.repeat).toBe(1.25);
    expect(PATTERN_MASK_LAYOUTS.cubes.repeat).toBe(1.75);

    for (const layout of Object.values(PATTERN_MASK_LAYOUTS)) {
      expect(PATTERN_MASK_SIZE % layout.periodX).toBe(0);
      expect(PATTERN_MASK_SIZE % layout.periodY).toBe(0);
      expect(layout.cell).toBeGreaterThanOrEqual(32);
    }
  });

  it("9. builds smaller prismatic Cubes from colour-owned faces, edges, and glints", () => {
    const source = readFileSync(new URL("../../src/carts/cartPatterns.js", import.meta.url), "utf8");
    expect(source).toContain('const faceColors = ["#550000", "#004d00", "#000047"];');
    expect(source).toContain("const fillFace = (color, face) => {");
    expect(source).toContain("fillFace(faceColors[0], [points[0], points[1], center, points[5]]);");
    expect(source).toContain('trace("#666666",');
    expect(source).toContain("const center = [cx, cy];");
    expect(source).toContain("const offsetX = Math.abs(row) % 2 === 1 ? halfWidth : 0;");
    expect(source).toContain("trace(colors[1], center, points[0]);");
    expect(source).toContain("trace(colors[0], center, points[2]);");
    expect(source).toContain("trace(colors[2], center, points[4]);");
    expect(source).not.toContain("for (let x = -30; x < size + 30; x += 30)");
  });
});
