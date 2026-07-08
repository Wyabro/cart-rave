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
const PATTERN_OVERLAY_TINT_SCALE = 0.15;
const PATTERN_OVERLAY_EMISSIVE_BOOST = 0.22;
const PATTERN_OVERLAY_OPACITY = 0.95;

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
    // * All masks target checker's readability: chunky ~50% coverage at a ~16px feature scale,
    // * and seamless tiling (128 = 8×16) so no edge seam reads differently across the body.
    case "stripes": {
      // * Bold diagonal bands. step 32 divides 128 (seamless at 45°); ~14px band ≈ 50/50.
      ctx.fillStyle = dark;
      const step = 32;
      const band = 15;
      for (let i = -size; i < size * 2; i += step) {
        ctx.save();
        ctx.translate(i, 0);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(0, -size, band, size * 3);
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
      // * Big bold dots on a 16px grid (128 = 8×16 → seamless). r7 ≈ 60% coverage.
      ctx.fillStyle = dark;
      const step = 16;
      const r = 7;
      for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "waves": {
      // * Thick wavy ribbons (not thin lines). period 32 divides 128 (seamless vertically);
      // * 2 horizontal cycles across the tile keep the left/right seam continuous.
      ctx.fillStyle = dark;
      const period = 32;
      const bandH = 16;
      const amp = 8;
      for (let x = 0; x < size; x += 1) {
        const off = Math.sin((x / size) * Math.PI * 4) * amp;
        for (let k = -1; k * period + off < size + period; k += 1) {
          ctx.fillRect(x, k * period + off, 1, bandH);
        }
      }
      break;
    }
    case "bolt": {
      // * Electric lightning zigzag: bold VERTICAL bands that jag left/right via a sharp
      // * triangle-wave offset — descending bolts, perpendicular to waves' horizontal ripples.
      // * bandW period 32 & vPeriod 64 both divide 128, so the tile is seamless in both axes.
      ctx.fillStyle = dark;
      const period = 32;
      const bandW = 15;
      const amp = 14;
      const vPeriod = 64;
      // * triangle wave in [-amp, amp], period vPeriod (troughs at y=0/vPeriod → seam matches).
      const tri = (y) => {
        const t = y / vPeriod;
        return amp * (2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1);
      };
      for (let y = 0; y < size; y += 1) {
        const off = tri(y);
        for (let k = -1; k * period + off < size + period; k += 1) {
          ctx.fillRect(k * period + off, y, bandW, 1);
        }
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
 * `useUv1` selects the second UV channel (`TEXCOORD_1` → three attribute `uv1`) for mask
 * sampling. The cartrave4 body's `TEXCOORD_0` carries a fragmented Tripo unwrap (plus the baked
 * albedo + wire-emissive), which shreds oriented patterns; a clean box-unwrapped `uv1` reads
 * correctly. Meshes without a second channel (procedural CartFrame) fall back to `uv`.
 *
 * @param {THREE.Material} mat
 * @param {boolean} [useUv1] Sample the mask from `uv1` (clean channel) instead of `uv`.
 * @returns {Record<string, THREE.IUniform>}
 */
function ensureFramePatternInjection(mat, useUv1 = false) {
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
  ud.cartPatternUv1 = !!useUv1;

  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === "function") prevOnBeforeCompile(shader, renderer);

    shader.uniforms.uPatternMask = uniforms.uPatternMask;
    shader.uniforms.uPatternRepeat = uniforms.uPatternRepeat;
    shader.uniforms.uPatternStrength = uniforms.uPatternStrength;
    shader.uniforms.uPatternTint = uniforms.uPatternTint;
    shader.uniforms.uPatternEmissive = uniforms.uPatternEmissive;

    // * Route mask sampling through the chosen UV channel. `uv` is declared in three's vertex
    // * prefix; the second channel (`uv1`) is NOT declared unless a map uses it (our body maps
    // * only use `uv`), so we declare `attribute vec2 uv1;` ourselves — three rewrites it to
    // * `in vec2 uv1;` for GLSL3. The geometry must carry a `uv1` attribute (TEXCOORD_1).
    const patternUvAttr = useUv1 ? "uv1" : "uv";
    const vertexCommon = useUv1
      ? "#include <common>\nattribute vec2 uv1;\nvarying vec2 vCartPatternUv;"
      : "#include <common>\nvarying vec2 vCartPatternUv;";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", vertexCommon)
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\n\tvCartPatternUv = ${patternUvAttr};`,
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

  // * Enabled state + UV channel gate the program cache: patterned/unpatterned never collide,
  // * and a `uv`-compiled program is never reused for a `uv1` body (distinct vertex shaders).
  mat.customProgramCacheKey = () => {
    const u = /** @type {any} */ (mat.userData);
    const base = u.cartPatternEnabled ? PATTERN_CACHE_KEY_ON : PATTERN_CACHE_KEY_OFF;
    return `${base}:${u.cartPatternUv1 ? "uv1" : "uv"}`;
  };

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
 * @param {boolean} [useUv1] Sample the mask from the clean `uv1` channel (see injection docs).
 */
function applyPatternToFrameMaterial(mat, patternId, neonHex, useUv1 = false) {
  const uniforms = ensureFramePatternInjection(mat, useUv1);
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

  // * Prefer the clean second UV channel when the body carries one (re-UV'd cartrave4 export);
  // * meshes with only TEXCOORD_0 (procedural CartFrame, current GLB) fall back to `uv`.
  const useUv1 = !!(/** @type {THREE.Mesh} */ (frameMesh).geometry?.getAttribute?.("uv1"));

  applyPatternToFrameMaterial(mat, normalizePatternId(patternId), neonHex ?? 0xffffff, useUv1);
}
