/**
 * cartPatterns.js — Layered pattern detail on the cart wireframe body.
 *
 * Pattern flow (menu → state → 3D cart):
 * 1. Menu PATTERNS tab calls `savePlayerCustomization({ pattern })` (customization.js).
 * 2. `loadPlayerCustomization().pattern` is read when spawning or recoloring carts.
 * 3. `resolveCartPatternForSlot()` picks the pattern id (local human → saved; others → classic).
 * 4. `applyCartPattern(mesh, patternId, neonHex)` keeps the base CartFrame material at full
 *    emissive bloom and adds a sibling CartFramePattern mesh with a tinted overlay material.
 *
 * Patterns are local-only for now (not synced over PartyKit).
 */

import * as THREE from "three";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import {
  cartEmissiveIntensityForHex,
  emissiveRefHexForNeonHex,
} from "./utils.js";
import {
  normalizePatternId,
} from "./cartPatternConfig.js";

/** @typedef {import("./cartPatternConfig.js").CartPatternId} CartPatternId */

/** @type {Map<CartPatternId, THREE.CanvasTexture>} */
const maskTextureCache = new Map();

/** @type {Map<CartPatternId, THREE.CanvasTexture>} */
const overlayAlphaTextureCache = new Map();

const MASK_SIZE = 128;
const MASK_REPEAT = 3;

// * Overlay tuning — darker tinted neon on pattern valleys; base wireframe stays full bloom.
const PATTERN_OVERLAY_TINT_SCALE = 0.32;
const PATTERN_OVERLAY_EMISSIVE_BOOST = 0.48;
const PATTERN_OVERLAY_OPACITY = 0.9;

/**
 * Grayscale mask: white = full neon glow, black = pattern valley (overlay target).
 * @param {CartPatternId} patternId
 * @returns {HTMLCanvasElement}
 */
function renderPatternMaskCanvas(patternId) {
  const size = MASK_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const glow = "#ffffff";
  const dark = "#000000";

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  switch (patternId) {
    case "stripes": {
      ctx.fillStyle = dark;
      for (let i = -size; i < size * 2; i += 14) {
        ctx.save();
        ctx.translate(i, 0);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(0, 0, 7, size * 2);
        ctx.restore();
      }
      break;
    }
    case "checker": {
      const cell = 16;
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          const on = ((x / cell) + (y / cell)) % 2 === 0;
          ctx.fillStyle = on ? dark : glow;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      break;
    }
    case "dots": {
      ctx.fillStyle = dark;
      const step = 20;
      for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "waves": {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 6;
      for (let row = 0; row < 5; row += 1) {
        const y = 10 + row * 24;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 3) {
          const wy = y + Math.sin((x / size) * Math.PI * 4) * 7;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 4;
      for (let row = 0; row < 4; row += 1) {
        const y = 22 + row * 24;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 3) {
          const wy = y + Math.sin((x / size) * Math.PI * 3 + 0.8) * 5;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }

  return canvas;
}

/**
 * Inverts a grayscale mask canvas for overlay alpha (pattern valleys → opaque overlay).
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement}
 */
function invertMaskCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const inverted = 255 - data[i];
    data[i] = inverted;
    data[i + 1] = inverted;
    data[i + 2] = inverted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * @param {CartPatternId} patternId
 * @returns {THREE.CanvasTexture}
 */
function getPatternMaskTexture(patternId) {
  const id = normalizePatternId(patternId);
  const cached = maskTextureCache.get(id);
  if (cached) return cached;

  const canvas = renderPatternMaskCanvas(id);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MASK_REPEAT, MASK_REPEAT);
  tex.colorSpace = THREE.NoColorSpace;
  maskTextureCache.set(id, tex);
  return tex;
}

/**
 * Alpha map for the pattern overlay — opaque where the base mask is dark.
 * @param {CartPatternId} patternId
 * @returns {THREE.CanvasTexture}
 */
function getPatternOverlayAlphaTexture(patternId) {
  const id = normalizePatternId(patternId);
  if (id === "classic") return getPatternMaskTexture(id);

  const cached = overlayAlphaTextureCache.get(id);
  if (cached) return cached;

  const inverted = invertMaskCanvas(renderPatternMaskCanvas(id));
  const tex = new THREE.CanvasTexture(inverted);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MASK_REPEAT, MASK_REPEAT);
  tex.colorSpace = THREE.NoColorSpace;
  overlayAlphaTextureCache.set(id, tex);
  return tex;
}

/**
 * @returns {THREE.MeshPhysicalMaterial}
 */
function createPatternOverlayMaterial() {
  return createPhysicalMaterial({
    metalness: 0.4,
    roughness: 0.22,
    clearcoat: 0.18,
    clearcoatRoughness: 0.1,
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    opacity: PATTERN_OVERLAY_OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.45,
  });
}

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 * @param {CartPatternId} patternId
 * @param {number} neonHex
 */
function updatePatternOverlayMaterial(mat, patternId, neonHex) {
  const id = normalizePatternId(patternId);
  const hex = Number.isFinite(neonHex) ? neonHex : 0xffffff;
  const tint = new THREE.Color(hex).multiplyScalar(PATTERN_OVERLAY_TINT_SCALE);

  mat.color.copy(tint);
  mat.emissive.copy(tint);
  const refHex = emissiveRefHexForNeonHex(hex);
  mat.emissiveIntensity = cartEmissiveIntensityForHex(refHex, PATTERN_OVERLAY_EMISSIVE_BOOST);
  mat.alphaMap = getPatternOverlayAlphaTexture(id);
  mat.opacity = PATTERN_OVERLAY_OPACITY;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.needsUpdate = true;
}

/**
 * Strips legacy single-material mask maps from the base CartFrame wireframe.
 * @param {THREE.Mesh} frameMesh
 */
function clearBaseFramePatternMaps(frameMesh) {
  const mat = frameMesh.material;
  if (!mat || Array.isArray(mat)) return;
  if (mat.emissiveMap || mat.map) {
    mat.emissiveMap = null;
    mat.map = null;
    mat.needsUpdate = true;
  }
}

/**
 * Removes legacy flat-panel pattern overlays from older builds.
 * @param {THREE.Object3D} root
 */
function removeLegacyPatternOverlays(root) {
  const legacy = root.getObjectByName("CartPatternOverlays");
  if (!legacy) return;

  legacy.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const mat = child.material;
    if (mat && !Array.isArray(mat)) mat.dispose();
  });
  root.remove(legacy);
}

/**
 * @param {THREE.Object3D} root
 * @param {THREE.Mesh} frameMesh
 * @returns {THREE.Mesh}
 */
function ensurePatternOverlayMesh(root, frameMesh) {
  let patternMesh = root.getObjectByName("CartFramePattern");
  if (patternMesh?.isMesh) return patternMesh;

  patternMesh = new THREE.Mesh(frameMesh.geometry, createPatternOverlayMaterial());
  patternMesh.name = "CartFramePattern";
  patternMesh.userData.isCartPatternLayer = true;
  patternMesh.userData.sharesCartFrameGeometry = true;
  patternMesh.renderOrder = (frameMesh.renderOrder || 0) + 1;
  root.add(patternMesh);
  return patternMesh;
}

/**
 * Applies or clears a layered pattern on the merged CartFrame wireframe mesh.
 * Base CartFrame keeps full neon bloom; CartFramePattern adds tinted detail on top.
 *
 * @param {THREE.Object3D | null | undefined} root
 * @param {CartPatternId | string} patternId
 * @param {number} [neonHex] Cart neon hex for overlay tint (independent of base glow).
 */
export function applyCartPattern(root, patternId, neonHex) {
  if (!root) return;

  removeLegacyPatternOverlays(root);

  const frameMesh = root.getObjectByName("CartFrame");
  if (!frameMesh?.isMesh || !frameMesh.geometry) return;

  // * GLTF rave cart keeps authored baseColor + emissive maps for uniform PBR.
  if (!root.userData?.isRaveGltf && !frameMesh.userData?.preserveGltfMaps) {
    clearBaseFramePatternMaps(frameMesh);
  }

  const id = normalizePatternId(patternId);
  const patternMesh = root.getObjectByName("CartFramePattern");

  if (id === "classic") {
    if (patternMesh) patternMesh.visible = false;
    return;
  }

  const overlayMesh = ensurePatternOverlayMesh(root, frameMesh);
  const mat = overlayMesh.material;
  if (!mat || Array.isArray(mat)) return;

  updatePatternOverlayMaterial(mat, id, neonHex ?? 0xffffff);
  overlayMesh.visible = true;
}
