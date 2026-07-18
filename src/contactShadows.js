// contactShadows.js — lightweight blob contact shadows (no shadow maps)
//
// Technique: shared radial-gradient alpha on horizontal PlaneGeometry quads
// (MeshBasicMaterial, depthWrite off, depthTest off so sloped floor chamfers do not
// clip the blob into a half-circle). Shadows are hidden over open holes and pit voids.
//
// Tune in CONFIG.contactShadows — cart.opacity, footprintRadiusX/Z, textureSoftness.

import * as THREE from "three";
import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";

/** @type {THREE.CanvasTexture | null} */
let sharedBlobTexture = null;

/** @type {{ squareHoles: Array<{ x: number, z: number }>, half: number, arenaHalf?: number } | null} */
let shadowHazards = null;

const _euler = new THREE.Euler();
const _sampleScratch = { x: 0, z: 0 };

/**
 * @returns {typeof CONFIG.contactShadows}
 */
function shadowCfg() {
  return CONFIG.contactShadows;
}

/**
 * Mirrors level `aiHazards` from main (null = Classic Record ring floor).
 *
 * @param {typeof shadowHazards} hazards
 */
export function setContactShadowHazards(hazards) {
  shadowHazards = hazards;
}

/**
 * @returns {boolean}
 */
function contactShadowsEnabled() {
  return Boolean(shadowCfg()?.enabled);
}

/**
 * @returns {number}
 */
export function getFloorY() {
  return shadowCfg()?.floorY ?? 0;
}

/**
 * @param {THREE.Quaternion} quat
 * @returns {number}
 */
export function yawFromQuaternion(quat) {
  _euler.setFromQuaternion(quat, "YXZ");
  return _euler.y;
}

/**
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
function isOnSolidPlaySurface(x, z) {
  if (shadowHazards?.squareHoles) {
    const arenaHalf = shadowHazards.arenaHalf ?? 34;
    if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) return false;
    const holeHalf = shadowHazards.half;
    for (const h of shadowHazards.squareHoles) {
      if (Math.max(Math.abs(x - h.x), Math.abs(z - h.z)) <= holeHalf) return false;
    }
    return true;
  }

  const haz = /** @type {Record<string, any>} */ (shadowHazards);
  if (haz?.isOctagon) {
    const apothem = haz.arenaHalf ?? CONFIG.record.radius;
    const cos22 = 0.9238795;
    const sin22 = 0.3826834;
    const absX = Math.abs(x);
    const absZ = Math.abs(z);
    const proj1 = absX * cos22 + absZ * sin22;
    const proj2 = absX * sin22 + absZ * cos22;
    return Math.max(proj1, proj2) <= apothem + 0.2;
  }

  const r = Math.hypot(x, z);
  if (CONFIG.record.centerHole?.enabled !== false && r < CONFIG.record.innerRadius) {
    return false;
  }
  if (r > CONFIG.record.radius) return false;
  return true;
}

/**
 * Fraction of footprint sample points that lie on solid play surface (0–1).
 *
 * @param {number} x
 * @param {number} z
 * @param {number} yaw
 * @param {number} radiusX
 * @param {number} radiusZ
 * @returns {number}
 */
function solidFootprintFactor(x, z, yaw, radiusX, radiusZ) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const offsets = [
    [0, 0],
    [radiusX * 0.72, 0],
    [-radiusX * 0.72, 0],
    [0, radiusZ * 0.72],
    [0, -radiusZ * 0.72],
  ];
  let solid = 0;
  for (const [lx, lz] of offsets) {
    _sampleScratch.x = x + lx * cos + lz * sin;
    _sampleScratch.z = z - lx * sin + lz * cos;
    if (isOnSolidPlaySurface(_sampleScratch.x, _sampleScratch.z)) solid += 1;
  }
  return solid / offsets.length;
}

/**
 * Builds (once) a soft radial blob used by all contact-shadow quads.
 *
 * @returns {THREE.CanvasTexture}
 */
function getSharedBlobTexture() {
  const cfg = shadowCfg();
  const softness = clamp(cfg?.textureSoftness ?? 0.92, 0.15, 1);
  if (sharedBlobTexture?.userData?.softness === softness) {
    return sharedBlobTexture;
  }
  if (sharedBlobTexture) {
    sharedBlobTexture.dispose();
    sharedBlobTexture = null;
  }

  const size = cfg?.textureSize ?? 128;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.2 + 0.12 * softness, "rgba(0, 0, 0, 0.76)");
  gradient.addColorStop(0.45 + 0.17 * softness, "rgba(0, 0, 0, 0.34)");
  gradient.addColorStop(Math.min(0.99, 0.55 + 0.45 * softness), "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  sharedBlobTexture = new THREE.CanvasTexture(canvas);
  sharedBlobTexture.colorSpace = THREE.SRGBColorSpace;
  sharedBlobTexture.userData.softness = softness;
  sharedBlobTexture.needsUpdate = true;
  return sharedBlobTexture;
}

/**
 * Live-tweak snapshot for the graphics debug GUI.
 *
 * @returns {{
 *   enabled: boolean,
 *   textureSoftness: number,
 *   cartOpacity: number,
 *   footprintRadiusX: number,
 *   footprintRadiusZ: number,
 *   staticOpacity: number,
 * }}
 */
export function getContactShadowDebugParams() {
  const cfg = shadowCfg();
  return {
    enabled: Boolean(cfg.enabled),
    textureSoftness: cfg.textureSoftness ?? 0.92,
    cartOpacity: cfg.cart.opacity,
    footprintRadiusX: cfg.cart.footprintRadiusX,
    footprintRadiusZ: cfg.cart.footprintRadiusZ,
    staticOpacity: cfg.static.opacity,
  };
}

/**
 * @param {boolean} enabled
 */
export function setContactShadowsEnabled(enabled) {
  CONFIG.contactShadows.enabled = enabled;
}

/**
 * @param {number} opacity
 */
export function setContactShadowCartOpacity(opacity) {
  CONFIG.contactShadows.cart.opacity = opacity;
}

/**
 * @param {number} radiusX
 * @param {number} radiusZ
 */
export function setContactShadowFootprint(radiusX, radiusZ) {
  CONFIG.contactShadows.cart.footprintRadiusX = radiusX;
  CONFIG.contactShadows.cart.footprintRadiusZ = radiusZ;
}

/**
 * Rebuilds the shared blob gradient — higher softness = wider falloff.
 *
 * @param {number} softness
 * @param {THREE.Scene} [scene]
 */
export function setContactShadowTextureSoftness(softness, scene) {
  CONFIG.contactShadows.textureSoftness = softness;
  if (sharedBlobTexture) {
    sharedBlobTexture.dispose();
    sharedBlobTexture = null;
  }
  const texture = getSharedBlobTexture();
  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.userData?.isContactShadow) return;
      if (obj.material?.map) obj.material.map = texture;
    });
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {number} opacity
 */
export function setContactShadowStaticOpacity(scene, opacity) {
  CONFIG.contactShadows.static.opacity = opacity;
  if (!scene) return;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.userData?.isContactShadow) return;
    if (obj.parent?.name === "StaticContactShadows") {
      obj.material.opacity = opacity;
    }
  });
}

/**
 * @param {{ opacity?: number, renderOrder?: number }} [options]
 * @returns {THREE.Mesh}
 */
function createBlobMesh(options = {}) {
  const cfg = shadowCfg();
  const mat = new THREE.MeshBasicMaterial({
    map: getSharedBlobTexture(),
    color: 0x000000,
    transparent: true,
    opacity: options.opacity ?? cfg?.cart?.opacity ?? 0.36,
    depthWrite: false,
    // * depthTest ON (07-17 run 2 "shadows go through objects and other carts"):
    // * transparent-pass quads with depthTest:false painted over every opaque mesh.
    // * floorEpsilon (4.5cm) keeps the quad clear of floor z-fighting; scenery and
    // * carts now occlude blobs correctly. Trade-off: on raised surfaces the
    // * floor-level blob is hidden by the platform instead of bleeding through it.
    depthTest: true,
    // * Run-4 "shadows clip into the arena floors": at 10-30m view distances the
    // * near-0.1/far-600 depth buffer quantizes coarser than the 4.5cm epsilon, so
    // * blob fragments tie/lose against the floor depth and vanish in patches.
    // * polygonOffset biases the blob's own depth a few quanta toward the camera —
    // * decisively wins vs the coplanar floor while real occluders (carts, walls,
    // * platforms) still sit far closer in depth and keep occluding correctly.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = options.renderOrder ?? -2;
  mesh.name = "ContactShadow";
  mesh.frustumCulled = false;
  mesh.userData.isContactShadow = true;
  return mesh;
}

/**
 * Creates a cart contact-shadow quad (add to scene separately — stays flat on the floor).
 *
 * @returns {THREE.Mesh | null}
 */
export function createCartContactShadow() {
  if (!contactShadowsEnabled()) return null;
  return createBlobMesh({ opacity: shadowCfg().cart.opacity });
}

/**
 * Syncs a cart blob to world XZ, yaw, and height above the play floor.
 *
 * @param {THREE.Mesh | null | undefined} shadowMesh
 * @param {{ x: number, z: number, yaw: number, heightAboveFloor: number }} pose
 */
export function updateCartContactShadow(shadowMesh, pose) {
  if (!shadowMesh || !contactShadowsEnabled()) return;

  const cfg = shadowCfg();
  const cart = cfg.cart;
  const floorY = cfg.floorY + cfg.floorEpsilon;
  const height = Math.max(0, pose.heightAboveFloor);
  const fade = 1 - clamp(
    (height - cart.heightFadeStart) / Math.max(0.001, cart.heightFadeEnd - cart.heightFadeStart),
    0,
    1,
  );

  const fadeScale = cart.minAirborneScale + (1 - cart.minAirborneScale) * fade;
  const rx = cart.footprintRadiusX * fadeScale;
  const rz = cart.footprintRadiusZ * fadeScale;
  const solidFrac = solidFootprintFactor(pose.x, pose.z, pose.yaw, rx, rz);

  shadowMesh.visible = fade > 0.03 && solidFrac > 0.12;
  if (!shadowMesh.visible) return;

  // * Directional bias (Zanzibar sun only — octagon hazards identify the level). Visual
  // * offset only: solidFrac above samples the cart's true position, and the bias shrinks
  // * with the airborne fade so lifted shadows never look detached.
  let biasX = 0;
  let biasZ = 0;
  if (/** @type {Record<string, any>} */ (shadowHazards)?.isOctagon) {
    const bias = cfg.directionalBias?.zanzibar;
    if (bias) {
      biasX = bias.x * fade;
      biasZ = bias.z * fade;
    }
  }

  shadowMesh.position.set(pose.x + biasX, floorY, pose.z + biasZ);
  shadowMesh.rotation.y = pose.yaw;
  shadowMesh.scale.set(rx, rz, 1);
  // @ts-expect-error THREE duck-typing suppress
  shadowMesh.material.opacity = cart.opacity * fade * solidFrac;
}

/**
 * Builds a group of static blob shadows for immobile level props (e.g. furniture pile).
 * Placements over voids are skipped automatically.
 *
 * @param {Array<{ x: number, z: number, radius?: number, radiusX?: number, radiusZ?: number, opacity?: number }>} placements
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
export function createStaticContactShadowCluster(placements) {
  const group = new THREE.Group();
  group.name = "StaticContactShadows";
  const ownedGeometries = [];
  const ownedMaterials = [];
  const staticOpacity = shadowCfg()?.static?.opacity ?? 0.26;

  if (!contactShadowsEnabled()) {
    return { group, ownedGeometries, ownedMaterials };
  }

  const floorY = shadowCfg().floorY + shadowCfg().floorEpsilon;

  for (const p of placements) {
    if (!isOnSolidPlaySurface(p.x, p.z)) continue;

    const mesh = createBlobMesh({
      opacity: p.opacity ?? staticOpacity,
      renderOrder: -3,
    });
    mesh.position.set(p.x, floorY, p.z);
    const base = p.radius ?? 1;
    const rx = p.radiusX ?? base;
    const rz = p.radiusZ ?? base;
    mesh.scale.set(rx, rz, 1);
    // @ts-expect-error THREE duck-typing suppress
    mesh.material.opacity = p.opacity ?? staticOpacity;
    group.add(mesh);
    ownedGeometries.push(mesh.geometry);
    ownedMaterials.push(/** @type {THREE.Material} */ (mesh.material));
  }

  return { group, ownedGeometries, ownedMaterials };
}

/**
 * @param {THREE.Mesh} shadowMesh
 */
export function disposeContactShadow(shadowMesh) {
  if (!shadowMesh) return;
  shadowMesh.geometry?.dispose?.();
  // @ts-expect-error THREE duck-typing suppress
  shadowMesh.material?.dispose?.();
}
