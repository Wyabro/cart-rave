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
  FOIL_GROOVES,
  FOIL_PATTERN_IDS,
  FOIL_SIGMA,
  getFoilGroove,
  getPatternAccentHexes,
  isFoilPattern,
  isMulticolorPattern,
  sampleFoilLobe,
} from "../../src/carts/cartPatternConfig.js";
import { PATTERN_UNLOCKS } from "../../src/unlockConfig.js";
import { CART_COLORS } from "../../src/config.js";
import {
  FOIL_EMISSIVE_GLSL,
  FOIL_VERTEX_GLSL,
  PATTERN_MASK_LAYOUTS,
  PATTERN_MASK_SIZE,
} from "../../src/carts/cartPatterns.js";

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

  it("10. grants foil only to the six earned patterns with unique groove fields", () => {
    expect(FOIL_PATTERN_IDS).toEqual(["dots", "waves", "bolt", "honeycomb", "diamond", "cubes"]);
    expect(isFoilPattern("classic")).toBe(false);
    expect(isFoilPattern("stripes")).toBe(false);
    expect(isFoilPattern("checker")).toBe(false);
    expect(getFoilGroove("classic")).toBeNull();
    const keys = FOIL_PATTERN_IDS.map((id) => {
      expect(isFoilPattern(id)).toBe(true);
      const groove = getFoilGroove(id);
      expect(groove).toEqual(FOIL_GROOVES[id]);
      return `${groove.angle}:${groove.pitchNm}`;
    });
    expect(new Set(keys).size).toBe(FOIL_PATTERN_IDS.length);
  });

  it("11. keeps the L1 foil contract in the injected chunks and human-only apply path", () => {
    expect(FOIL_VERTEX_GLSL).toContain("modelMatrix * vec4( transformed, 1.0 )");
    expect(FOIL_VERTEX_GLSL).toContain("mat3( modelMatrix ) * vec3( uFoilGroove.x, 0.0, uFoilGroove.y )");
    expect(FOIL_VERTEX_GLSL).not.toContain("dFdx");
    expect(FOIL_EMISSIVE_GLSL).toContain("uFoilStrength");
    expect(FOIL_EMISSIVE_GLSL).toContain("fract( foilQAcross * ( uFoilPitch / 1000.0 ) )");
    expect(FOIL_EMISSIVE_GLSL).toContain(` / ${FOIL_SIGMA.toFixed(2)}`);
    expect(FOIL_EMISSIVE_GLSL).toContain("380.0");
    expect(FOIL_EMISSIVE_GLSL).toContain("720.0");
    expect(FOIL_EMISSIVE_GLSL).toContain("foilHue * foilEmissiveLum");
    expect(FOIL_EMISSIVE_GLSL).toContain("mix( totalEmissiveRadiance");
    expect(FOIL_EMISSIVE_GLSL).toContain("mix( diffuseColor.rgb");
    expect(FOIL_EMISSIVE_GLSL).not.toContain("1.0 - foilWire");
    expect(FOIL_EMISSIVE_GLSL).not.toContain("totalEmissiveRadiance +=");
    expect(FOIL_EMISSIVE_GLSL).not.toContain("for (");

    const patterns = readFileSync(new URL("../../src/carts/cartPatterns.js", import.meta.url), "utf8");
    expect(patterns).toContain("FOIL_EMISSIVE_GLSL");
    expect(patterns).toContain("allowFoil && isFoilPattern(id)");
    expect(patterns).toContain('const PATTERN_CACHE_KEY_ON = "cartPattern:1";');

    const orchestration = readFileSync(
      new URL("../../src/orchestration/cartOrchestration.js", import.meta.url),
      "utf8",
    );
    expect(orchestration).toContain("const allowFoil = slot.kind === \"human\"");
    expect(orchestration).toContain("cart.cartFoilAllowed = allowFoil");

    const entities = readFileSync(new URL("../../src/entities.js", import.meta.url), "utf8");
    expect(entities).toContain("allowFoil: cart.cartFoilAllowed === true");

    const preview = readFileSync(new URL("../../src/ui/cartPreview.js", import.meta.url), "utf8");
    expect(preview).toContain("allowFoil: true");
  });

  it("12. keeps the calibrated L1 lobe visible under the customize preview key light", () => {
    const norm = (v) => {
      const length = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / length, v[1] / length, v[2] / length];
    };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const rotY = (v, yaw) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
    };

    const wi = norm([0.35, 0.85, 0.4]);
    const elev = 0.2;
    const azimuth = 0.85;
    const cam = [
      Math.sin(azimuth) * Math.cos(elev),
      Math.sin(elev),
      Math.cos(azimuth) * Math.cos(elev),
    ];
    const groove = FOIL_GROOVES.cubes;
    const axis0 = [Math.cos(groove.angle), 0, Math.sin(groove.angle)];
    const faces = [
      [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0],
      [0.7, 0.2, 0.68], [0.4, 0.5, 0.77],
    ];

    let hits = 0;
    let samples = 0;
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.05) {
      const axis = rotY(axis0, yaw);
      for (const face of faces) {
        const normal = norm(rotY(face, yaw));
        const wo = norm([
          cam[0] * 8 - normal[0] * 0.6,
          cam[1] * 8 - normal[1] * 0.6,
          cam[2] * 8 - normal[2] * 0.6,
        ]);
        const q = [wi[0] + wo[0], wi[1] + wo[1], wi[2] + wo[2]];
        let tangent = cross(normal, axis);
        const tangentLen = Math.hypot(tangent[0], tangent[1], tangent[2]);
        tangent = tangentLen > 1e-4
          ? [tangent[0] / tangentLen, tangent[1] / tangentLen, tangent[2] / tangentLen]
          : [0, 0, 1];
        const grooveDir = norm(cross(normal, tangent));
        const { weight } = sampleFoilLobe({
          qAcross: dot(q, tangent),
          qAlong: dot(q, grooveDir),
          front: dot(normal, wi) > 0 && dot(normal, wo) > 0,
          pitchNm: groove.pitchNm,
        });
        samples += 1;
        if (weight > 0.05) hits += 1;
      }
    }

    expect(samples).toBeGreaterThan(0);
    expect(hits / samples).toBeGreaterThan(0.1);
  });
});
