// nightShiftMaterials.js — authored procedural surface identity for Night Shift.

import * as THREE from "three";
import { createPhysicalMaterial } from "../scene.js";

const SURFACE_SIZE = 256;
const SURFACE_SEED = 0x4e534d31;

/** @param {number} value */
function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** @param {number} x @param {number} y @param {number} seed */
function hashNoise(x, y, seed) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b)
    ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

/**
 * Samples one causal field used by albedo, roughness, and normal generation. The facade uses
 * vertical rain streaks; the roof uses broad damp patches, aggregate, and expansion seams.
 *
 * @param {"roof" | "facade"} kind
 * @param {number} x
 * @param {number} y
 * @param {number} [seed]
 */
export function sampleNightShiftSurface(kind, x, y, seed = SURFACE_SEED) {
  const fine = hashNoise(x, y, seed);
  const coarse = hashNoise(Math.floor(x / 13), Math.floor(y / 13), seed ^ 0x91e10da5);
  const broad = hashNoise(Math.floor(x / 41), Math.floor(y / 41), seed ^ 0x6a09e667);
  const seam = kind === "roof"
    ? (x % 64 < 2 || y % 64 < 2 ? 1 : 0)
    : (x % 48 < 2 || y % 72 < 2 ? 1 : 0);
  const streak = kind === "facade"
    ? Math.max(0, 1 - Math.abs((x % 31) - 15.5) / 4) * (0.25 + 0.75 * coarse)
    : 0;
  const damp = Math.max(0, broad * 0.92 + coarse * 0.32 - 0.68);
  const aggregate = fine * 0.55 + coarse * 0.3 + broad * 0.15;
  const height = aggregate * 0.2 - seam * 0.62 - damp * 0.12 - streak * 0.18;
  const roughness = Math.max(0.34, Math.min(0.98,
    0.78 + aggregate * 0.16 + seam * 0.12 - damp * 0.38 + streak * 0.1,
  ));
  return { aggregate, damp, seam, streak, height, roughness };
}

/**
 * @param {"roof" | "facade"} kind
 * @param {number} seed
 */
function buildSurfaceTextures(kind, seed) {
  const heightField = new Float32Array(SURFACE_SIZE * SURFACE_SIZE);
  const albedoCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, roughnessCanvas, normalCanvas]) {
    canvas.width = SURFACE_SIZE;
    canvas.height = SURFACE_SIZE;
  }
  const albedoContext = albedoCanvas.getContext("2d");
  const roughnessContext = roughnessCanvas.getContext("2d");
  const normalContext = normalCanvas.getContext("2d");
  const albedo = albedoContext.createImageData(SURFACE_SIZE, SURFACE_SIZE);
  const roughness = roughnessContext.createImageData(SURFACE_SIZE, SURFACE_SIZE);
  const normal = normalContext.createImageData(SURFACE_SIZE, SURFACE_SIZE);

  for (let y = 0; y < SURFACE_SIZE; y += 1) {
    for (let x = 0; x < SURFACE_SIZE; x += 1) {
      const sample = sampleNightShiftSurface(kind, x, y, seed);
      const index = y * SURFACE_SIZE + x;
      const pixel = index * 4;
      heightField[index] = sample.height;

      const base = kind === "roof" ? [39, 48, 61] : [21, 29, 43];
      const wear = sample.aggregate * 15 - sample.damp * 18 - sample.seam * 10 - sample.streak * 12;
      albedo.data[pixel] = clampByte(base[0] + wear + (kind === "roof" ? sample.damp * 2 : 0));
      albedo.data[pixel + 1] = clampByte(base[1] + wear + sample.damp * 3);
      albedo.data[pixel + 2] = clampByte(base[2] + wear + sample.damp * 7);
      albedo.data[pixel + 3] = 255;

      const rough = clampByte(sample.roughness * 255);
      roughness.data[pixel] = rough;
      roughness.data[pixel + 1] = rough;
      roughness.data[pixel + 2] = rough;
      roughness.data[pixel + 3] = 255;
    }
  }

  const sampleHeight = (x, y) => heightField[
    ((y + SURFACE_SIZE) % SURFACE_SIZE) * SURFACE_SIZE
      + ((x + SURFACE_SIZE) % SURFACE_SIZE)
  ];
  for (let y = 0; y < SURFACE_SIZE; y += 1) {
    for (let x = 0; x < SURFACE_SIZE; x += 1) {
      const dx = sampleHeight(x + 1, y) - sampleHeight(x - 1, y);
      const dy = sampleHeight(x, y + 1) - sampleHeight(x, y - 1);
      const nx = -dx * 1.8;
      const ny = dy * 1.8;
      const nz = 1;
      const invLength = 1 / Math.hypot(nx, ny, nz);
      const pixel = (y * SURFACE_SIZE + x) * 4;
      normal.data[pixel] = clampByte((nx * invLength * 0.5 + 0.5) * 255);
      normal.data[pixel + 1] = clampByte((ny * invLength * 0.5 + 0.5) * 255);
      normal.data[pixel + 2] = clampByte((nz * invLength * 0.5 + 0.5) * 255);
      normal.data[pixel + 3] = 255;
    }
  }

  albedoContext.putImageData(albedo, 0, 0);
  roughnessContext.putImageData(roughness, 0, 0);
  normalContext.putImageData(normal, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  for (const texture of [map, roughnessMap, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { map, roughnessMap, normalMap };
}

/** @param {{ map: THREE.Texture, roughnessMap: THREE.Texture, normalMap: THREE.Texture }} source @param {number} x @param {number} y */
function cloneSurface(source, x, y) {
  const cloned = {
    map: source.map.clone(),
    roughnessMap: source.roughnessMap.clone(),
    normalMap: source.normalMap.clone(),
  };
  for (const texture of Object.values(cloned)) {
    texture.repeat.set(x, y);
    texture.needsUpdate = true;
  }
  return cloned;
}

/**
 * Creates the full Night Shift surface palette. All hero materials are matte, worn, and
 * blue-charcoal; painted metal accents stay restrained so AC route colors remain dominant.
 */
export function createNightShiftMaterialBundle() {
  const roofSource = buildSurfaceTextures("roof", SURFACE_SEED);
  const facadeSource = buildSurfaceTextures("facade", SURFACE_SEED ^ 0x3c6ef372);
  const roofMaps = cloneSurface(roofSource, 7, 7);
  const highRoofMaps = cloneSurface(roofSource, 1.5, 1.5);
  const deckMaps = cloneSurface(roofSource, 1, 0.75);
  const facadeMaps = cloneSurface(facadeSource, 5, 12);
  const allTextures = [
    ...Object.values(roofSource), ...Object.values(facadeSource),
    ...Object.values(roofMaps), ...Object.values(highRoofMaps),
    ...Object.values(deckMaps), ...Object.values(facadeMaps),
  ];

  const materials = {
    roof: createPhysicalMaterial({ ...roofMaps, color: 0xffffff, metalness: 0.08, roughness: 1, normalScale: new THREE.Vector2(0.34, 0.34) }),
    highRoof: createPhysicalMaterial({ ...highRoofMaps, color: 0xe5edff, metalness: 0.1, roughness: 1, normalScale: new THREE.Vector2(0.32, 0.32) }),
    utility: createPhysicalMaterial({ color: 0x182232, metalness: 0.34, roughness: 0.72 }),
    spawnPlatform: createPhysicalMaterial({ ...deckMaps, color: 0xdce7ff, metalness: 0.2, roughness: 1, normalScale: new THREE.Vector2(0.3, 0.3) }),
    spawnSupport: createPhysicalMaterial({ color: 0x273449, metalness: 0.5, roughness: 0.6 }),
    parapet: createPhysicalMaterial({ color: 0x192333, metalness: 0.46, roughness: 0.66 }),
    tower: createPhysicalMaterial({ ...facadeMaps, color: 0xd9e4fa, metalness: 0.16, roughness: 1, normalScale: new THREE.Vector2(0.42, 0.42) }),
    brace: createPhysicalMaterial({ color: 0x33445d, metalness: 0.62, roughness: 0.52 }),
    skylineCore: createPhysicalMaterial({ color: 0x111a29, metalness: 0.08, roughness: 0.92 }),
    skylineExtended: createPhysicalMaterial({ color: 0x0a101c, metalness: 0.04, roughness: 0.96 }),
  };

  return {
    materials,
    textures: allTextures,
    disposeTextures() {
      allTextures.forEach((texture) => texture.dispose());
    },
  };
}
