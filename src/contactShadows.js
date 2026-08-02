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

/**
 * Level surface description used to reject shadow placements over voids. Two shapes:
 * walled arenas with square holes (Storerooms), and open octagons (Sundial). The octagon
 * variant was always passed but never typed — the `isOctagon` branch below read it through
 * a `Record<string, any>` cast.
 *
 * @typedef {{ squareHoles: Array<{ x: number, z: number }>, half: number, arenaHalf?: number, isOctagon?: false }} SquareHoleHazards
 * @typedef {{ isOctagon: true, arenaHalf?: number, squareHoles?: undefined, half?: undefined }} OctagonHazards
 * @typedef {SquareHoleHazards | OctagonHazards} ContactShadowHazards
 */

/** @type {ContactShadowHazards | null} */
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
 * @param {ContactShadowHazards | null} hazards
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
 * Support distance of (x, z) on an octagon whose **flats are normal to the k·45°
 * directions** — the orientation every octagon arena in this game actually builds
 * (`zanzibarPlatform.getZanzibarFloorColliderSpec` lays the deck out as four cuboids at
 * `yaw = k·π/4`, and `octPath` / `buildOctHullVertices` put the vertices at 22.5° + k·45°).
 * A point is on the deck when this is ≤ the deck apothem.
 *
 * Deliberately identical to `simulation.js`'s `octagonEdgeDistance()`: the AI bounds and
 * the contact-shadow surface test have to describe the same octagon, and until 08-02 they
 * did not — this one used the cos22.5/sin22.5 support pair, which describes the octagon
 * rotated 22.5° from the deck. On Sundial (apothem 31.7) that accepted 2.61 m of open water
 * off each flat mid and rejected 2.61 m of real deck at each corner, including all eight
 * bollards at 33.28 m.
 *
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function octagonEdgeDistance(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, az, (ax + az) * Math.SQRT1_2);
}

/**
 * @param {number} x
 * @param {number} z
 * @param {ContactShadowHazards | null} [hazardsOverride] Surface description to test against
 *   instead of the module's. A **level builder** must pass its own: `main.js` only calls
 *   `setContactShadowHazards` *after* the level has finished building, so anything a level
 *   grounds during construction would otherwise be tested against the previous arena's
 *   shape — or, on a cold load, against the circular fallback below.
 * @returns {boolean}
 */
function isOnSolidPlaySurface(x, z, hazardsOverride) {
  const hz = hazardsOverride ?? shadowHazards;
  if (hz?.squareHoles) {
    const arenaHalf = hz.arenaHalf ?? 34;
    if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) return false;
    const holeHalf = hz.half;
    for (const h of hz.squareHoles) {
      if (Math.max(Math.abs(x - h.x), Math.abs(z - h.z)) <= holeHalf) return false;
    }
    return true;
  }

  if (hz?.isOctagon) {
    const apothem = hz.arenaHalf ?? CONFIG.record.radius;
    return octagonEdgeDistance(x, z) <= apothem + 0.2;
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
    // * Run-5: patches still dropped out over sloped chamfers and raised floor decor
    // * at long view distances (-2/-4 was under the quantum there) — factor -4 covers
    // * the slope term, units -32 is still centimeters-equivalent at 100m, far less
    // * than any real occluder's separation.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -32,
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

  // * Run-6 ruling: no directional bias — the blob sits dead-center under the cart on
  // * every arena (the Zanzibar sun offset read as "detached" in playtests).
  shadowMesh.position.set(pose.x, floorY, pose.z);
  shadowMesh.rotation.y = pose.yaw;
  shadowMesh.scale.set(rx, rz, 1);
  // @ts-expect-error THREE duck-typing suppress
  shadowMesh.material.opacity = cart.opacity * fade * solidFrac;
}

/**
 * Builds a group of static blob shadows for immobile level props (e.g. furniture pile).
 * Placements over voids are skipped automatically.
 *
 * `yaw` spins the quad **within** the floor plane (radians, 0 = radiusX along world +X).
 * It is applied as `rotation.z`, not `rotation.y`: the blob is created with
 * `rotation.x = -PI/2`, and under three's default XYZ Euler order a `rotation.y` on top of
 * that tilts the quad *out* of the floor — measured, the surface normal goes
 * `(sin yaw, cos yaw, 0)`, so it is edge-on and invisible at yaw = +/-90 deg. `rotation.z`
 * composes after the X rotation and spins the quad about its own normal, which is what an
 * oriented ground decal wants.
 *
 * @param {Array<{ x: number, z: number, radius?: number, radiusX?: number, radiusZ?: number, yaw?: number, opacity?: number }>} placements
 * @param {{ hazards?: ContactShadowHazards | null }} [options] `hazards` describes the surface to
 *   test placements against, overriding the module's.
 *   test placements against. **Pass it from a level builder** — `setContactShadowHazards`
 *   does not run until after the level is built, so without it a cold load tests against
 *   the circular fallback and silently drops everything outside `CONFIG.record.radius`.
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
export function createStaticContactShadowCluster(placements, options = {}) {
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
    if (!isOnSolidPlaySurface(p.x, p.z, options.hazards)) continue;

    const mesh = createBlobMesh({
      opacity: p.opacity ?? staticOpacity,
      renderOrder: -3,
    });
    mesh.position.set(p.x, floorY, p.z);
    if (p.yaw) mesh.rotation.z = p.yaw;
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
