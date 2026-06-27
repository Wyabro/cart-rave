/**
 * cartPreviewGltf.js — GLTF loading and theme prep for the menu cart preview.
 *
 * The in-game cart still uses procedural `buildCart()`; only the customize-panel preview
 * loads external `.glb` assets. Per-theme model URLs live in `PREVIEW_GLTF_BY_THEME`
 * (fall back to `PREVIEW_GLTF_DEFAULT` until more assets exist).
 *
 * Performance notes:
 * - Source scenes are parsed once per URL and kept in memory (geometries/textures shared).
 * - Each preview open clones materials only — never deep-clones million-triangle meshes.
 * - Albedo maps are stripped on preview materials so neon tint matches procedural carts.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyCartPattern } from "../cartPatterns.js";
import { DEFAULT_CART_THEME, getCartTheme, normalizeThemeId } from "../cartThemeConfig.js";
import {
  applyThemeColorToCache,
  disposeCartThemeResources,
} from "../cartThemes.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "../utils.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "../scene.js";

/** @typedef {import("../cartThemes.js").CartThemeMaterialCache} CartThemeMaterialCache */

/**
 * @typedef {Object} PreviewGltfDef
 * @property {string} url — Vite-served path under `public/`
 * @property {number} [scale=1]
 * @property {number} [rotationY=0] — Y-axis correction so the cart faces the camera nicely
 * @property {readonly string[]} [accentMeshNames] — mesh names that receive accent tint (future multi-mesh models)
 * @property {string} [frameMeshName] — primary body mesh; renamed to `CartFrame` for pattern overlays
 */

/** Default preview asset (rave cart GLTF). */
export const PREVIEW_GLTF_DEFAULT = {
  url: "/models/ravecart.glb",
  scale: 1,
  rotationY: 0,
  frameMeshName: "Mesh10",
  accentMeshNames: [],
};

/**
 * Optional per-theme GLTF overrides. Empty today — all themes share `PREVIEW_GLTF_DEFAULT`.
 * @type {Partial<Record<string, PreviewGltfDef>>}
 */
export const PREVIEW_GLTF_BY_THEME = {};

/** @type {GLTFLoader | null} */
let _loader = null;

/** Parsed source scene per URL (geometries + embedded textures — never disposed during session). */
/** @type {Map<string, THREE.Group>} */
const _sourceScenes = new Map();

/** In-flight load promises per URL. */
/** @type {Map<string, Promise<THREE.Group>>} */
const _loadPromises = new Map();

/** Warn once per URL about heavy assets. */
/** @type {Set<string>} */
const _heavyAssetWarned = new Set();

const LOAD_TIMEOUT_MS = 90_000;

/** Material slot indices after `setupPreviewGltfPartGroups()` reorders triangle groups. */
const PREVIEW_PART = {
  FRAME: 0,
  TIRE: 1,
  HANDLE: 2,
  SUNGLASSES: 3,
  SMILE: 4,
  DARK: 5,
};

/** @type {readonly string[]} */
const PREVIEW_PART_ROLES = ["frame", "tire", "handle", "sunglasses", "smile", "dark"];

/** Logged once per URL when the source scene is first parsed. */
/** @type {Set<string>} */
const _hierarchyLogged = new Set();

/** Dark albedo cutoff — triangles below this luminance become accent parts, not tintable frame. */
const DARK_LUMINANCE_THRESHOLD = 0.18;

/**
 * @param {string} themeId
 * @returns {PreviewGltfDef}
 */
export function resolvePreviewGltfDef(themeId) {
  const id = normalizeThemeId(themeId);
  return { ...PREVIEW_GLTF_DEFAULT, ...PREVIEW_GLTF_BY_THEME[id] };
}

/**
 * Starts downloading/parsing the preview GLTF early (e.g. when the menu mounts).
 *
 * @param {string} [themeId]
 * @returns {Promise<THREE.Group>}
 */
export function prefetchPreviewCartGltf(themeId = DEFAULT_CART_THEME) {
  const def = resolvePreviewGltfDef(themeId);
  return ensureGltfSource(def.url);
}

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {Set<THREE.Material>} disposedMats
 */
function disposeMaterialOnce(material, disposedMats) {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!mat || disposedMats.has(mat)) continue;
    disposedMats.add(mat);
    mat.dispose?.();
  }
}

/**
 * @returns {GLTFLoader}
 */
function getLoader() {
  if (!_loader) _loader = new GLTFLoader();
  return _loader;
}

/**
 * @param {THREE.Object3D} scene
 * @param {string} url
 */
function warnIfHeavyAsset(scene, url) {
  if (_heavyAssetWarned.has(url)) return;
  let triCount = 0;
  scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geo = child.geometry;
    triCount += geo.index
      ? geo.index.count / 3
      : (geo.attributes.position?.count ?? 0) / 3;
  });
  if (triCount > 200_000) {
    _heavyAssetWarned.add(url);
    console.warn(
      `[CartPreviewGltf] "${url}" has ~${Math.round(triCount).toLocaleString()} triangles. `
      + "Consider exporting a low-poly preview variant for faster menu loads.",
    );
  }
}

/**
 * @param {string} themeId
 * @returns {boolean}
 */
export function isPreviewGltfCached(themeId = DEFAULT_CART_THEME) {
  const def = resolvePreviewGltfDef(themeId);
  return _sourceScenes.has(def.url);
}

/**
 * Loads and caches the source GLTF scene for a URL (shared across preview sessions).
 *
 * @param {string} url
 * @returns {Promise<THREE.Group>}
 */
function ensureGltfSource(url) {
  const cached = _sourceScenes.get(url);
  if (cached) return Promise.resolve(cached);

  let pending = _loadPromises.get(url);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const loader = getLoader();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      _loadPromises.delete(url);
      const err = new Error(`[CartPreviewGltf] Timed out loading ${url} after ${LOAD_TIMEOUT_MS}ms`);
      console.warn(err.message);
      reject(err);
    }, LOAD_TIMEOUT_MS);

    loader.load(
      url,
      (gltf) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);

        const scene = gltf.scene;
        scene.name = scene.name || "CartGltfSource";
        scene.userData.previewGltfUrl = url;
        warnIfHeavyAsset(scene, url);
        logPreviewGltfHierarchy(scene, url);
        setupPreviewGltfPartGroups(findPrimaryMesh(scene));

        _sourceScenes.set(url, scene);
        _loadPromises.delete(url);
        resolve(scene);
      },
      undefined,
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        _loadPromises.delete(url);
        console.warn(`[CartPreviewGltf] Failed to load ${url}:`, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });

  _loadPromises.set(url, pending);
  return pending;
}

/**
 * Strips albedo/normal maps so `applyThemeColorToCache` neon tint is visible on GLTF materials.
 *
 * @param {THREE.Material} mat
 */
function prepareMaterialForPreviewTint(mat) {
  if (!mat) return;

  mat.map = null;
  mat.emissiveMap = null;
  mat.metalnessMap = null;
  mat.roughnessMap = null;
  mat.aoMap = null;
  mat.normalMap = null;

  if (!mat.emissive) mat.emissive = new THREE.Color(0xffffff);
  mat.needsUpdate = true;
}

/**
 * @param {THREE.Material | THREE.Material[]} srcMat
 * @returns {THREE.Material | THREE.Material[]}
 */
function cloneMaterialForPreview(srcMat) {
  if (Array.isArray(srcMat)) {
    return srcMat.map((m) => {
      const cloned = m.clone();
      prepareMaterialForPreviewTint(cloned);
      return cloned;
    });
  }
  const cloned = srcMat.clone();
  prepareMaterialForPreviewTint(cloned);
  return cloned;
}

/**
 * Logs mesh/material names once after load (helps tune part classification heuristics).
 *
 * @param {THREE.Object3D} root
 * @param {string} url
 */
function logPreviewGltfHierarchy(root, url) {
  if (_hierarchyLogged.has(url)) return;
  _hierarchyLogged.add(url);

  const lines = [];
  root.traverse((child) => {
    if (!child.isMesh) {
      if (child.name) lines.push(`${child.type} "${child.name}"`);
      return;
    }
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    lines.push(
      `Mesh "${child.name || "(unnamed)"}" — ${mats.length} material(s), `
      + `${child.geometry?.attributes?.position?.count ?? 0} verts`,
    );
    mats.forEach((mat, i) => {
      lines.push(
        `  [${i}] ${mat?.type ?? "unknown"} name="${mat?.name ?? ""}" `
        + `color=#${mat?.color?.getHexString?.() ?? "?"}`,
      );
    });
  });

  console.debug(`[CartPreviewGltf] Loaded "${url}":\n  ${lines.join("\n  ")}`);
}

/**
 * @param {THREE.Object3D | null | undefined} root
 * @returns {THREE.Mesh | null}
 */
function findPrimaryMesh(root) {
  if (!root) return null;
  let mesh = null;
  root.traverse((child) => {
    if (!mesh && child.isMesh) mesh = child;
  });
  return mesh;
}

/**
 * Builds a UV → luminance lookup from the GLTF base-color map (downsampled for speed).
 *
 * @param {THREE.Texture | null | undefined} map
 * @returns {(u: number, v: number) => number}
 */
function buildLuminanceSamplerFromMap(map) {
  if (!map?.image) return () => 1;

  const canvas = document.createElement("canvas");
  const maxDim = 512;
  const img = map.image;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  canvas.width = Math.max(1, Math.floor((img.width || 1) * scale));
  canvas.height = Math.max(1, Math.floor((img.height || 1) * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => 1;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return (u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    const i = (y * width + x) * 4;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
}

/**
 * Classifies a dark triangle into tire / handle / sunglasses / smile using normalized position.
 *
 * @param {number} lum
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {THREE.Box3} bounds
 * @returns {number} PREVIEW_PART index
 */
function classifyPreviewPart(lum, cx, cy, cz, bounds) {
  const nx = (cx - bounds.min.x) / Math.max(bounds.max.x - bounds.min.x, 1e-6);
  const ny = (cy - bounds.min.y) / Math.max(bounds.max.y - bounds.min.y, 1e-6);
  const nz = (cz - bounds.min.z) / Math.max(bounds.max.z - bounds.min.z, 1e-6);

  if (lum >= DARK_LUMINANCE_THRESHOLD) return PREVIEW_PART.FRAME;

  // * Tires — bottom band + outer X, matte rubber.
  if (ny < 0.18 || (ny < 0.30 && (nx < 0.25 || nx > 0.75))) return PREVIEW_PART.TIRE;

  // * Handle — top-back rail, plastic/metal grip.
  if (ny > 0.68 && nz > 0.52) return PREVIEW_PART.HANDLE;

  // * Sunglasses — front upper face, glossy lenses.
  if (nz < 0.42 && ny > 0.50 && ny < 0.73 && nx > 0.32 && nx < 0.68) return PREVIEW_PART.SUNGLASSES;

  // * Smile — front lower face, slightly softer dark.
  if (nz < 0.42 && ny > 0.36 && ny < 0.52 && nx > 0.36 && nx < 0.64) return PREVIEW_PART.SMILE;

  // * Other dark mesh details — generic dark accent (not player-tinted).
  return PREVIEW_PART.DARK;
}

/**
 * Reorders indexed triangles into material groups (runs once on the cached source mesh).
 * Bright/colorful triangles → tintable frame; dark triangles → part-specific accent materials.
 *
 * @param {THREE.Mesh | null | undefined} mesh
 */
function setupPreviewGltfPartGroups(mesh) {
  if (!mesh?.geometry || mesh.userData.previewPartGroupsReady) return;

  const geometry = mesh.geometry;
  const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const sampleLum = buildLuminanceSamplerFromMap(srcMat?.map);

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  if (!geometry.index) {
    const count = geometry.attributes.position.count;
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) indices[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  const index = geometry.index;
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!index || !pos) return;

  const t0 = import.meta.env?.DEV ? performance.now() : 0;
  const triCount = index.count / 3;
  /** @type {number[][]} */
  const buckets = Array.from({ length: PREVIEW_PART_ROLES.length }, () => []);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index.getX(t * 3);
    const i1 = index.getX(t * 3 + 1);
    const i2 = index.getX(t * 3 + 2);

    let cx = 0;
    let cy = 0;
    let cz = 0;
    let u = 0;
    let v = 0;

    for (const vi of [i0, i1, i2]) {
      cx += pos.getX(vi);
      cy += pos.getY(vi);
      cz += pos.getZ(vi);
      if (uv) {
        u += uv.getX(vi);
        v += uv.getY(vi);
      }
    }
    cx /= 3;
    cy /= 3;
    cz /= 3;
    if (uv) {
      u /= 3;
      v /= 3;
    }

    const lum = uv ? sampleLum(u, v) : 1;
    const part = classifyPreviewPart(lum, cx, cy, cz, bounds);
    buckets[part].push(i0, i1, i2);
  }

  let totalIndices = 0;
  for (const bucket of buckets) totalIndices += bucket.length;

  const newIndex = new Uint32Array(totalIndices);
  geometry.clearGroups();

  let offset = 0;
  for (let part = 0; part < buckets.length; part += 1) {
    const bucket = buckets[part];
    if (bucket.length === 0) continue;
    newIndex.set(bucket, offset);
    geometry.addGroup(offset, bucket.length, part);
    offset += bucket.length;
  }

  geometry.setIndex(new THREE.BufferAttribute(newIndex, 1));
  mesh.userData.previewPartGroupsReady = true;

  if (import.meta.env?.DEV) {
    const summary = geometry.groups
      .map((g) => `${PREVIEW_PART_ROLES[g.materialIndex]}:${Math.round(g.count / 3)} tris`)
      .join(", ");
    console.debug(
      `[CartPreviewGltf] Part groups for "${mesh.name}" (${Math.round(performance.now() - t0)}ms): ${summary}`,
    );
  }
}

/**
 * Creates a distinct PBR material for each preview part role.
 *
 * @param {string} role
 * @returns {THREE.Material}
 */
function createPreviewPartMaterial(role) {
  const env = getMaterialEnvMapIntensity();

  switch (role) {
    // * Frame — tintable neon body (maps stripped elsewhere).
    case "frame":
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        metalness: 0.55,
        roughness: 0.16,
        toneMapped: false,
        envMapIntensity: env * 0.85,
      });

    // * Tires — matte rubber, high roughness, very low metalness.
    case "tire":
      return new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.04,
        roughness: 0.92,
        envMapIntensity: env * 0.32,
      });

    // * Handle — dark plastic / painted metal grip.
    case "handle":
      return new THREE.MeshStandardMaterial({
        color: 0x121212,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.38,
        roughness: 0.58,
        envMapIntensity: env * 0.72,
      });

    // * Sunglasses — glossy lens frames via clearcoat physical material.
    case "sunglasses":
      return createPhysicalMaterial({
        color: 0x050505,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.88,
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: env * 1.25,
      });

    // * Smile — simple dark accent with softer roughness than lenses.
    case "smile":
      return new THREE.MeshStandardMaterial({
        color: 0x101010,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.12,
        roughness: 0.74,
        envMapIntensity: env * 0.42,
      });

    // * Fallback dark detail — distinct from tires/handle but not tintable.
    default:
      return new THREE.MeshStandardMaterial({
        color: 0x0d0d0d,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.22,
        roughness: 0.66,
        envMapIntensity: env * 0.48,
      });
  }
}

/**
 * Builds the multi-material array for a meshed preview instance (one slot per geometry group).
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.Material[]}
 */
function createPreviewPartMaterialSet(geometry) {
  const maxIndex = geometry.groups.reduce(
    (max, group) => Math.max(max, group.materialIndex),
    0,
  );

  /** @type {THREE.Material[]} */
  const materials = [];
  for (let i = 0; i <= maxIndex; i += 1) {
    const role = PREVIEW_PART_ROLES[i] ?? "dark";
    const mat = createPreviewPartMaterial(role);
    mat.userData.previewPartRole = role;
    mat.userData.excludedFromTint = role !== "frame";

    if (role === "frame") prepareMaterialForPreviewTint(mat);

    materials.push(mat);
  }

  return materials;
}

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} srcMat
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.Material | THREE.Material[]}
 */
function createInstanceMaterials(srcMat, geometry) {
  if (geometry.groups?.length > 0) {
    return createPreviewPartMaterialSet(geometry);
  }
  return cloneMaterialForPreview(srcMat);
}

/**
 * Applies theme frame PBR preset fields supported by the loaded GLTF materials.
 *
 * @param {THREE.Material} mat
 * @param {import("../cartThemeConfig.js").CartThemeDef} theme
 */
function applyGltfFramePreset(mat, theme) {
  if (!mat) return;
  const { frameMaterial, ghost } = theme;
  mat.userData.themeLocked = true;

  if (typeof mat.metalness === "number") mat.metalness = frameMaterial.metalness;
  if (typeof mat.roughness === "number") mat.roughness = frameMaterial.roughness;
  if (typeof mat.clearcoat === "number") mat.clearcoat = frameMaterial.clearcoat;
  if (typeof mat.clearcoatRoughness === "number") mat.clearcoatRoughness = frameMaterial.clearcoatRoughness;
  if (typeof mat.toneMapped === "boolean") mat.toneMapped = frameMaterial.toneMapped;
  if (typeof mat.envMapIntensity === "number") {
    mat.envMapIntensity = getMaterialEnvMapIntensity() * (frameMaterial.metalness > 0.7 ? 1.15 : 0.85);
  }

  if (ghost && "transmission" in mat) {
    const phys = /** @type {THREE.MeshPhysicalMaterial} */ (mat);
    phys.transparent = true;
    phys.opacity = ghost.opacity;
    phys.transmission = ghost.transmission;
    phys.ior = ghost.ior;
    phys.thickness = 0.35;
    phys.depthWrite = false;
  }

  mat.needsUpdate = true;
}

/**
 * Tags GLTF meshes so tint logic can split frame vs accent materials.
 *
 * @param {THREE.Object3D} root
 * @param {PreviewGltfDef} def
 */
function tagGltfPreviewMaterials(root, def) {
  const accentNames = new Set(def.accentMeshNames ?? []);

  root.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.cartMatRole = accentNames.has(child.name) ? "accent" : "frame";
  });
}

/**
 * Renames the primary body mesh so `applyCartPattern()` can attach its overlay sibling.
 *
 * @param {THREE.Object3D} root
 * @param {PreviewGltfDef} def
 * @returns {THREE.Mesh | null}
 */
function bindFrameMeshForPatterns(root, def) {
  const preferred = def.frameMeshName ? root.getObjectByName(def.frameMeshName) : null;
  let frameMesh = preferred?.isMesh ? preferred : null;

  if (!frameMesh) {
    root.traverse((child) => {
      if (frameMesh || !child.isMesh) return;
      frameMesh = child;
    });
  }

  if (!frameMesh) {
    console.warn("[CartPreviewGltf] No frame mesh found — pattern overlay will be skipped.");
    return null;
  }

  frameMesh.name = "CartFrame";
  frameMesh.userData.isCartFrame = true;
  frameMesh.userData.cartMatRole = "frame";
  return frameMesh;
}

/**
 * Builds a material cache from GLTF preview meshes (MeshStandardMaterial instances).
 *
 * @param {THREE.Object3D} root
 * @param {PreviewGltfDef} def
 * @returns {CartThemeMaterialCache}
 */
export function buildPreviewGltfMaterialCache(root, def) {
  const frameMats = [];
  const frameBodyMats = [];
  const accentMats = [];
  const frameGlowMats = [];
  const seen = new Set();
  const accentNames = new Set(def.accentMeshNames ?? []);

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData?.isCartPatternLayer) return;

    const isAccentMesh = accentNames.has(child.name) || child.userData.cartMatRole === "accent";
    const mats = Array.isArray(child.material) ? child.material : [child.material];

    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;

      // * Only the frame slot receives player neon tint; dark part materials stay fixed.
      if (mat.userData.excludedFromTint || mat.userData.previewPartRole !== "frame") continue;

      seen.add(mat);
      if (isAccentMesh) accentMats.push(mat);
      else frameBodyMats.push(mat);
      frameMats.push(mat);
      if (mat.emissive) frameGlowMats.push(mat);
    }
  });

  if (frameMats.length === 0) {
    console.warn("[CartPreviewGltf] Frame material cache is empty — color tinting will not apply.");
  }

  return { frameMats, frameBodyMats, accentMats, frameGlowMats };
}

/**
 * Fast instance: shared geometry from cached source, unique cloned materials per preview.
 *
 * @param {THREE.Object3D} source
 * @returns {THREE.Group}
 */
function createPreviewInstanceFromSource(source) {
  const root = new THREE.Group();
  root.name = "CartVisual";
  root.userData.isPreviewGltf = true;

  /**
   * @param {THREE.Object3D} src
   * @param {THREE.Object3D} parent
   */
  const cloneHierarchy = (src, parent) => {
    if (src.isMesh) {
      const mesh = new THREE.Mesh(
        src.geometry,
        createInstanceMaterials(src.material, src.geometry),
      );
      mesh.name = src.name;
      mesh.castShadow = src.castShadow;
      mesh.receiveShadow = src.receiveShadow;
      mesh.position.copy(src.position);
      mesh.quaternion.copy(src.quaternion);
      mesh.scale.copy(src.scale);
      parent.add(mesh);
      return;
    }

    const node = new THREE.Group();
    node.name = src.name;
    node.position.copy(src.position);
    node.quaternion.copy(src.quaternion);
    node.scale.copy(src.scale);
    parent.add(node);

    for (const child of src.children) {
      cloneHierarchy(child, node);
    }
  };

  for (const child of source.children) {
    cloneHierarchy(child, root);
  }

  return root;
}

/**
 * Loads a preview cart instance for a theme (reuses cached source scene).
 *
 * @param {string} themeId
 * @returns {Promise<THREE.Group>}
 */
export async function loadPreviewCartGltf(themeId) {
  const def = resolvePreviewGltfDef(themeId);
  const source = await ensureGltfSource(def.url);
  const root = createPreviewInstanceFromSource(source);

  if (def.scale !== 1) root.scale.setScalar(def.scale);
  if (def.rotationY) root.rotation.y = def.rotationY;

  return root;
}

/**
 * Applies theme PBR, player color, and pattern overlay to a loaded preview root.
 *
 * @param {THREE.Object3D} root
 * @param {string} themeId
 * @param {number} neonHex
 * @param {string} patternId
 * @returns {CartThemeMaterialCache}
 */
export function preparePreviewCartGltf(root, themeId, neonHex, patternId) {
  const theme = getCartTheme(themeId);
  const id = normalizeThemeId(themeId);
  const def = resolvePreviewGltfDef(id);

  root.userData.cartThemeId = id;
  bindFrameMeshForPatterns(root, def);
  tagGltfPreviewMaterials(root, def);

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData?.isCartPatternLayer) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (mat.userData.previewPartRole && mat.userData.previewPartRole !== "frame") continue;
      applyGltfFramePreset(mat, theme);
    }
  });

  const cache = buildPreviewGltfMaterialCache(root, def);
  applyThemeColorToCache(cache, id, neonHex);
  applyCartPattern(root, patternId, neonHex);

  if (theme.patternPolicy === "disable") {
    const patternMesh = root.getObjectByName("CartFramePattern");
    if (patternMesh) patternMesh.visible = false;
  }

  return cache;
}

/**
 * Direct neon tint for placeholder materials (bypasses theme cache).
 *
 * @param {THREE.MeshStandardMaterial} mat
 * @param {number} neonHex
 */
export function applyPreviewPlaceholderColor(mat, neonHex) {
  if (!mat) return;
  const refHex = emissiveRefHexForNeonHex(neonHex);
  mat.color.setHex(neonHex);
  mat.emissive.setHex(neonHex);
  mat.emissiveIntensity = cartEmissiveIntensityForHex(refHex, 1.15);
  mat.needsUpdate = true;
}

/**
 * Releases per-instance materials (shared source geometries/textures are kept in cache).
 *
 * @param {THREE.Object3D | null | undefined} root
 */
export function disposePreviewCartGltf(root) {
  if (!root) return;
  disposeCartThemeResources(root);

  const disposedMats = new Set();

  root.traverse((child) => {
    if (!child.isMesh) return;
    const ud = child.userData || {};

    if (ud.sharesCartFrameGeometry) {
      if (ud.isCartPatternLayer && child.material) {
        disposeMaterialOnce(child.material, disposedMats);
      }
      return;
    }

    // * Geometry belongs to the cached source scene — never dispose here.
    disposeMaterialOnce(child.material, disposedMats);
  });
}
