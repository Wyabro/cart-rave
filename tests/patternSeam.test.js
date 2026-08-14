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
import { CART_PATTERN_IDS, CART_PATTERNS } from "../src/carts/cartPatternConfig.js";
import { PATTERN_UNLOCKS } from "../src/unlockConfig.js";

const MASTER_GLB = new URL("../art/models/cartrave4.glb", import.meta.url);
const DRACO_GLB = new URL("../public/models/cartrave4-draco.glb", import.meta.url);

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

  it("4. the classic default is always selectable and free", () => {
    expect(CART_PATTERN_IDS[0]).toBe("classic");
    expect(CART_PATTERNS.classic).toBeTruthy();
    expect(PATTERN_UNLOCKS.classic.free).toBe(true);
  });
});
