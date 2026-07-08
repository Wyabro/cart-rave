/**
 * cartPatterns.js — Pattern detail baked into the cart wireframe body material.
 *
 * Pattern flow (menu → state → 3D cart):
 * 1. Menu PATTERNS tab calls `savePlayerCustomization({ pattern })` (customization.js).
 * 2. `loadPlayerCustomization().pattern` is read when spawning or recoloring carts.
 * 3. `resolveCartPatternForSlot()` picks the pattern id (local human → saved; others → classic).
 * 4. `applyCartPattern(mesh, patternId, neonHex)` injects a mask sampler into the CartFrame's
 *    own MeshPhysicalMaterial (via `onBeforeCompile`) so pattern "valleys" read as darker
 *    tinted neon while the base wireframe keeps full emissive bloom — no second draw pass.
 *
 * Patterns are local-only for now (not synced over PartyKit).
 */

import * as THREE from "three";
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

const MASK_SIZE = 128;
const MASK_REPEAT = 3;

// * Overlay tuning — pattern valleys read as darker tinted neon; wire bloom stays full.
// * Reproduces the retired coplanar-overlay material in-shader: valley fragments blend
// * `uPatternStrength` of the way toward a `TINT_SCALE` diffuse tint + an emissive whose
// * radiance matches the old overlay (tint colour × `EMISSIVE_BOOST` intensity curve).
const PATTERN_OVERLAY_TINT_SCALE = 0.32;
const PATTERN_OVERLAY_EMISSIVE_BOOST = 0.48;
const PATTERN_OVERLAY_OPACITY = 0.9;

// * customProgramCacheKey values — patterned (enabled) vs unpatterned (classic) get distinct
// * programs so three never reuses one for the other. Two non-classic patterns share the ON
// * key and differ only by the uPatternMask texture uniform (no recompile on pattern swap).
const PATTERN_CACHE_KEY_ON = "cartPattern:1";
const PATTERN_CACHE_KEY_OFF = "cartPattern:0";

/** @type {THREE.Color} */
const _patternColor = new THREE.Color();

/**
 * Grayscale mask: white = full neon glow, black = pattern valley (tinted darker region).
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
 * Cached pattern mask texture (white = glow, dark = valley). Repeat baked into the texture
 * as a fallback; the shader also multiplies UVs by {@link MASK_REPEAT} via `uPatternRepeat`.
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
 * Injects the pattern mask sampler into a CartFrame MeshPhysicalMaterial once (idempotent).
 * Returns the persistent uniform bag so callers can retune it without recompiling.
 *
 * The injected chunk modulates the standard color / emissive pipeline (it never replaces
 * `diffuseColor` or `totalEmissiveRadiance` wholesale), so per-frame recolor / leader-glow /
 * boost-pulse mutations of `material.color` / `material.emissive` keep flowing through.
 *
 * @param {THREE.Material} mat
 * @returns {Record<string, THREE.IUniform>}
 */
function ensureFramePatternInjection(mat) {
  const ud = /** @type {any} */ (mat.userData);
  if (ud.cartPatternUniforms) return ud.cartPatternUniforms;

  /** @type {Record<string, THREE.IUniform>} */
  const uniforms = {
    uPatternMask: { value: null },
    uPatternRepeat: { value: MASK_REPEAT },
    uPatternStrength: { value: 0 },
    uPatternTint: { value: new THREE.Color(1, 1, 1) },
    uPatternEmissive: { value: new THREE.Color(0, 0, 0) },
  };
  ud.cartPatternUniforms = uniforms;
  ud.cartPatternEnabled = false;

  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === "function") prevOnBeforeCompile(shader, renderer);

    shader.uniforms.uPatternMask = uniforms.uPatternMask;
    shader.uniforms.uPatternRepeat = uniforms.uPatternRepeat;
    shader.uniforms.uPatternStrength = uniforms.uPatternStrength;
    shader.uniforms.uPatternTint = uniforms.uPatternTint;
    shader.uniforms.uPatternEmissive = uniforms.uPatternEmissive;

    // * `uv` is always declared in three's vertex prefix, so a dedicated varying works for
    // * both the mapped GLTF body and the map-less procedural CartFrame.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vCartPatternUv;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\n\tvCartPatternUv = uv;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D uPatternMask;",
          "uniform float uPatternRepeat;",
          "uniform float uPatternStrength;",
          "uniform vec3 uPatternTint;",
          "uniform vec3 uPatternEmissive;",
          "varying vec2 vCartPatternUv;",
          "",
        ].join("\n"),
      )
      // * valley = dark mask region × strength; tint diffuse toward the darker overlay colour.
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "\tfloat cartPatternValley = ( 1.0 - texture2D( uPatternMask, vCartPatternUv * uPatternRepeat ).r ) * uPatternStrength;",
          "\tdiffuseColor.rgb = mix( diffuseColor.rgb, uPatternTint, cartPatternValley );",
        ].join("\n"),
      )
      // * Dim wire bloom inside valleys toward the overlay's (dimmer) emissive radiance.
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, uPatternEmissive, cartPatternValley );",
        ].join("\n"),
      );
  };

  // * Enabled state gates the program cache so patterned/unpatterned bodies never collide.
  mat.customProgramCacheKey = () =>
    (/** @type {any} */ (mat.userData).cartPatternEnabled ? PATTERN_CACHE_KEY_ON : PATTERN_CACHE_KEY_OFF);

  // * First injection on an already-compiled material must trigger a recompile.
  mat.needsUpdate = true;
  return uniforms;
}

/**
 * Applies (or clears) a pattern on a CartFrame material by retuning the injected uniforms.
 * classic → strength 0 (mask disabled). Non-classic → mask + tint uniforms swapped in place;
 * a recompile only happens when the enabled state itself flips (uses a distinct cache key).
 *
 * @param {THREE.Material} mat
 * @param {CartPatternId} patternId
 * @param {number} neonHex
 */
function applyPatternToFrameMaterial(mat, patternId, neonHex) {
  const uniforms = ensureFramePatternInjection(mat);
  const id = normalizePatternId(patternId);
  const enabled = id !== "classic";
  const hex = Number.isFinite(neonHex) ? neonHex : 0xffffff;
  const ud = /** @type {any} */ (mat.userData);

  if (enabled) {
    uniforms.uPatternMask.value = getPatternMaskTexture(id);
    uniforms.uPatternStrength.value = PATTERN_OVERLAY_OPACITY;

    // * Linear-space neon; diffuse tint + emissive radiance mirror the retired overlay material.
    _patternColor.setHex(hex).convertSRGBToLinear();
    /** @type {THREE.Color} */ (uniforms.uPatternTint.value)
      .copy(_patternColor)
      .multiplyScalar(PATTERN_OVERLAY_TINT_SCALE);

    const refHex = emissiveRefHexForNeonHex(hex);
    const emissiveIntensity = cartEmissiveIntensityForHex(refHex, PATTERN_OVERLAY_EMISSIVE_BOOST);
    /** @type {THREE.Color} */ (uniforms.uPatternEmissive.value)
      .copy(_patternColor)
      .multiplyScalar(PATTERN_OVERLAY_TINT_SCALE * emissiveIntensity);
  } else {
    uniforms.uPatternStrength.value = 0;
  }

  if (ud.cartPatternEnabled !== enabled) {
    ud.cartPatternEnabled = enabled;
    // * Program cache key changed (classic ↔ patterned) — force a recompile.
    mat.needsUpdate = true;
  }
}

/**
 * Removes legacy pattern meshes from older builds (flat-panel overlays + the coplanar
 * CartFramePattern sibling that predated the in-material mask).
 * @param {THREE.Object3D} root
 */
function removeLegacyPatternMeshes(root) {
  for (const name of ["CartPatternOverlays", "CartFramePattern"]) {
    const legacy = root.getObjectByName(name);
    if (!legacy) continue;

    legacy.traverse((child) => {
      const c = /** @type {any} */ (child);
      if (!c.isMesh) return;
      if (!c.userData?.sharesCartFrameGeometry) c.geometry?.dispose();
      const mat = c.material;
      if (mat && !Array.isArray(mat)) mat.dispose?.();
    });
    legacy.parent?.remove(legacy);
  }
}

/**
 * Applies or clears a pattern on the merged CartFrame wireframe material.
 * The base CartFrame keeps full neon bloom; masked "valleys" read as darker tinted detail.
 *
 * @param {THREE.Object3D | null | undefined} root
 * @param {CartPatternId | string} patternId
 * @param {number} [neonHex] Cart neon hex for the valley tint (independent of base glow).
 */
export function applyCartPattern(root, patternId, neonHex) {
  if (!root) return;

  removeLegacyPatternMeshes(root);

  const frameMesh = root.getObjectByName("CartFrame");
  if (!(/** @type {any} */ (frameMesh)?.isMesh)) return;

  const mat = /** @type {THREE.Mesh} */ (frameMesh).material;
  if (!mat || Array.isArray(mat)) return;

  applyPatternToFrameMaterial(mat, normalizePatternId(patternId), neonHex ?? 0xffffff);
}
