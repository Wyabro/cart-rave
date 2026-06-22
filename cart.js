import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.164.1/examples/jsm/utils/BufferGeometryUtils.js";

// * Basket (cart-local units, ~classic proportions). Front = -Z, back = +Z.
export const BASKET_LENGTH = 2.1;
export const BASKET_WIDTH = 1.35;
export const BASKET_HEIGHT_BACK = 1.05;
export const BASKET_HEIGHT_FRONT = 0.675;
export const BASKET_RIM_TOP_Y = 0.51;
export const BASKET_RAIL_RADIUS = 0.0165;
export const BASKET_RAIL_SEGMENTS = 6;
export const HORIZONTAL_RAILS_LONG = 4;
export const VERTICAL_RAILS_LONG = 6;
export const HORIZONTAL_RAILS_FRONT = 3;
export const VERTICAL_RAILS_FRONT = 5;
export const HORIZONTAL_RAILS_BACK = 4;
export const VERTICAL_RAILS_BACK = 6;
export const BOTTOM_GRID_ALONG_X = 5;
export const BOTTOM_GRID_ALONG_Z = 5;
export const BOTTOM_Z_SEGMENTS = 10;

// * Handle (top-back, slightly proud of rim).
export const HANDLE_BAR_RADIUS = 0.072;
export const HANDLE_SPREAD_X = 0.42;
export const HANDLE_BAR_Y = BASKET_RIM_TOP_Y + 0.1425;
export const HANDLE_PUSH_Z = 0.105;

// * Open chassis under basket (rails + crossbars, no solid shelf).
export const CHASSIS_RAIL_RADIUS = 0.024;
export const CHASSIS_HALF_WIDTH = 0.54;
export const CHASSIS_HALF_LENGTH = 0.93;
export const CHASSIS_RAIL_Y = -0.48;
export const CHASSIS_CROSSBAR_COUNT = 2;
export const CHASSIS_CROSSBAR_Z_FRACTIONS = [-0.55, 0.55];

// * Caster / wheel (visual only). Chunky cartoon wheels.
export const CASTER_YAW_DAMPING = 0.28;
export const CASTER_YAW_WOBBLE_AMPLITUDE = 0.11;
export const CASTER_YAW_MIN_SPEED = 0.35;
export const WHEEL_RADIUS = 0.27;
export const WHEEL_WIDTH = 0.18;
export const WHEEL_RADIAL_SEGMENTS = 20;
export const CASTER_STEM_HEIGHT = 0.15;
export const CASTER_CORNER_INSET = 0.0525;
export const CASTER_MOUNT_DROP_BELOW_CHASSIS = 0.16;

const _v = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _rootWorld = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleOne = new THREE.Vector3(1, 1, 1);

const SHARED_WHEEL_GEO = new THREE.CylinderGeometry(
  WHEEL_RADIUS,
  WHEEL_RADIUS,
  WHEEL_WIDTH,
  WHEEL_RADIAL_SEGMENTS,
  1,
);
// * Inset hub disc per wheel: painted-metal frame color stands out against the dark chrome tire.
const SHARED_HUB_GEO = new THREE.CylinderGeometry(
  WHEEL_RADIUS * 0.42,
  WHEEL_RADIUS * 0.42,
  WHEEL_WIDTH * 1.04,
  14,
  1,
);

// * Unit cylinders for rail segments — clone + scale beats rebuilding per segment.
const UNIT_CYL_GEO_6 = new THREE.CylinderGeometry(1, 1, 1, BASKET_RAIL_SEGMENTS, 1);
const UNIT_CYL_GEO_8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);

const SHARED_LENS_MAT = new THREE.MeshBasicMaterial({
  color: 0x050505,
  side: THREE.DoubleSide,
});
const SHARED_MOUTH_MAT = new THREE.MeshBasicMaterial({ color: 0x050505 });
const SHARED_HANDLE_MAT = new THREE.MeshStandardMaterial({
  color: 0x111111,
  roughness: 0.6,
  metalness: 0.8,
  emissive: 0x000000,
});

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * @param {number} z
 * @param {number} halfL
 * @param {number} yFront
 * @param {number} yBack
 * @returns {number}
 */
function bottomYAtZ(z, halfL, yFront, yBack) {
  const t = (z + halfL) / (2 * halfL);
  return yFront + (yBack - yFront) * t;
}

/**
 * Builds a cylinder rail segment as a standalone transformed geometry.
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} radius
 * @param {number} segments
 * @returns {THREE.BufferGeometry | null}
 */
function addRailCylinder(a, b, radius, segments) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-5) return null;
  _dir.multiplyScalar(1 / len);
  _mid.addVectors(a, b).multiplyScalar(0.5);

  let geo;
  if (segments === 8) {
    geo = UNIT_CYL_GEO_8.clone();
  } else if (segments === BASKET_RAIL_SEGMENTS) {
    geo = UNIT_CYL_GEO_6.clone();
  } else {
    geo = new THREE.CylinderGeometry(radius, radius, len, segments, 1);
    _quat.setFromUnitVectors(_axisY, _dir);
    _matrix.compose(_mid, _quat, _scaleOne);
    geo.applyMatrix4(_matrix);
    return geo;
  }

  geo.scale(radius, len, radius);
  _quat.setFromUnitVectors(_axisY, _dir);
  _matrix.compose(_mid, _quat, _scaleOne);
  geo.applyMatrix4(_matrix);
  return geo;
}

/**
 * @param {THREE.BufferGeometry[]} geometries
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} radius
 * @param {number} segments
 */
function pushRailGeometry(geometries, a, b, radius, segments) {
  const geo = addRailCylinder(a, b, radius, segments);
  if (geo) geometries.push(geo);
}

/**
 * @param {THREE.BufferGeometry[]} sourceGeometries
 * @param {THREE.Material} material
 * @param {string} name
 * @param {Record<string, unknown>} [userData]
 * @returns {THREE.Mesh | null}
 */
function mergeGeometriesIntoMesh(sourceGeometries, material, name, userData) {
  if (sourceGeometries.length === 0) return null;
  const merged = BufferGeometryUtils.mergeGeometries(sourceGeometries, false);
  for (const geo of sourceGeometries) {
    geo.dispose();
  }
  sourceGeometries.length = 0;
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  if (userData) mesh.userData = { ...userData };
  return mesh;
}

/**
 * @param {THREE.Color} base
 * @returns {THREE.MeshStandardMaterial}
 */
function neonFrameMaterial(base) {
  const c = base.clone();
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 1.85,
    roughness: 0.3,
    metalness: 0.7,
  });
}

/**
 * @param {THREE.Color} base
 * @returns {THREE.MeshStandardMaterial}
 */
function neonWheelMaterial(base) {
  return new THREE.MeshStandardMaterial({
    color: 0x333333,
    emissive: base.clone(),
    emissiveIntensity: 0.15,
    roughness: 0.2,
    metalness: 0.9,
  });
}

/**
 * @typedef {object} CartBuildDims
 * @property {number} halfW
 * @property {number} halfL
 * @property {number} frontZ
 * @property {number} backZ
 * @property {number} yBottomFront
 * @property {number} yBottomBack
 * @property {number} railR
 * @property {number} railSeg
 * @property {number} hFront
 * @property {number} hBack
 * @property {(z: number) => number} yBottom
 * @property {(z: number) => number} wallHeight
 */

/**
 * Builds the open wireframe basket: long sides, front/back walls, rim, and bottom grid.
 * @param {THREE.BufferGeometry[]} frameGeometries Collected static frame geometries for merging.
 * @param {THREE.Color} baseColor Cart base color (reserved for future basket accents).
 * @param {CartBuildDims} dims Shared basket geometry helpers and dimensions.
 */
function buildBasketWireframe(frameGeometries, baseColor, dims) {
  void baseColor;

  const {
    halfW,
    frontZ,
    backZ,
    railR,
    railSeg,
    hFront,
    hBack,
    yBottom,
    wallHeight,
  } = dims;

  // * Long sides: vertical rails along Z, horizontal tiers as polylines along Z (sloped silhouette).
  for (let i = 0; i < VERTICAL_RAILS_LONG; i += 1) {
    const u = VERTICAL_RAILS_LONG <= 1 ? 0.5 : i / (VERTICAL_RAILS_LONG - 1);
    const z = frontZ + u * (backZ - frontZ);
    const y0 = yBottom(z);
    _p0.set(-halfW, y0, z);
    _p1.set(-halfW, BASKET_RIM_TOP_Y, z);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
    _p0.set(halfW, y0, z);
    _p1.set(halfW, BASKET_RIM_TOP_Y, z);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }

  for (let k = 0; k < HORIZONTAL_RAILS_LONG; k += 1) {
    const f = (k + 1) / (HORIZONTAL_RAILS_LONG + 1);
    const segs = BOTTOM_Z_SEGMENTS;
    for (let s = 0; s < segs; s += 1) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const z0 = frontZ + t0 * (backZ - frontZ);
      const z1 = frontZ + t1 * (backZ - frontZ);
      const h0 = wallHeight(z0);
      const h1 = wallHeight(z1);
      const y0 = yBottom(z0) + f * h0;
      const y1 = yBottom(z1) + f * h1;
      _p0.set(-halfW, y0, z0);
      _p1.set(-halfW, y1, z1);
      pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
      _p0.set(halfW, y0, z0);
      _p1.set(halfW, y1, z1);
      pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
    }
  }

  // * Front wall (short): grid in X at z = frontZ.
  for (let i = 0; i < VERTICAL_RAILS_FRONT; i += 1) {
    const u = VERTICAL_RAILS_FRONT <= 1 ? 0.5 : i / (VERTICAL_RAILS_FRONT - 1);
    const x = -halfW + u * (2 * halfW);
    _p0.set(x, yBottom(frontZ), frontZ);
    _p1.set(x, BASKET_RIM_TOP_Y, frontZ);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }
  for (let k = 0; k < HORIZONTAL_RAILS_FRONT; k += 1) {
    const f = (k + 1) / (HORIZONTAL_RAILS_FRONT + 1);
    const y = yBottom(frontZ) + f * hFront;
    _p0.set(-halfW, y, frontZ);
    _p1.set(halfW, y, frontZ);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }

  // * Back wall (tall): grid in X at z = backZ.
  for (let i = 0; i < VERTICAL_RAILS_BACK; i += 1) {
    const u = VERTICAL_RAILS_BACK <= 1 ? 0.5 : i / (VERTICAL_RAILS_BACK - 1);
    const x = -halfW + u * (2 * halfW);
    _p0.set(x, yBottom(backZ), backZ);
    _p1.set(x, BASKET_RIM_TOP_Y, backZ);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }
  for (let k = 0; k < HORIZONTAL_RAILS_BACK; k += 1) {
    const f = (k + 1) / (HORIZONTAL_RAILS_BACK + 1);
    const y = yBottom(backZ) + f * hBack;
    _p0.set(-halfW, y, backZ);
    _p1.set(halfW, y, backZ);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }

  // * Top rim (open basket): rectangle of rails so the read is clearly "cart top".
  const rimInset = railR * 2.2;
  _p0.set(-halfW + rimInset, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(halfW - rimInset, BASKET_RIM_TOP_Y, frontZ + rimInset);
  pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  _p0.set(-halfW + rimInset, BASKET_RIM_TOP_Y, backZ - rimInset);
  _p1.set(halfW - rimInset, BASKET_RIM_TOP_Y, backZ - rimInset);
  pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  _p0.set(-halfW, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(-halfW, BASKET_RIM_TOP_Y, backZ - rimInset);
  pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  _p0.set(halfW, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(halfW, BASKET_RIM_TOP_Y, backZ - rimInset);
  pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);

  // * Sloped bottom wire grid (rails along X at several Z, rails along Z in segments).
  for (let j = 0; j < BOTTOM_GRID_ALONG_X; j += 1) {
    const u = BOTTOM_GRID_ALONG_X <= 1 ? 0.5 : j / (BOTTOM_GRID_ALONG_X - 1);
    const z = frontZ + u * (backZ - frontZ);
    const y = yBottom(z);
    _p0.set(-halfW, y, z);
    _p1.set(halfW, y, z);
    pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
  }
  for (let i = 0; i < BOTTOM_GRID_ALONG_Z; i += 1) {
    const segs = BOTTOM_Z_SEGMENTS;
    for (let s = 0; s < segs; s += 1) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const z0 = frontZ + t0 * (backZ - frontZ);
      const z1 = frontZ + t1 * (backZ - frontZ);
      const x = -halfW + (i / Math.max(1, BOTTOM_GRID_ALONG_Z - 1)) * (2 * halfW);
      _p0.set(x, yBottom(z0), z0);
      _p1.set(x, yBottom(z1), z1);
      pushRailGeometry(frameGeometries, _p0, _p1, railR, railSeg);
    }
  }
}

/**
 * Builds the rear handle: two vertical posts and a horizontal grip bar.
 * @param {THREE.BufferGeometry[]} handleGeometries Collected handle geometries for merging.
 * @param {CartBuildDims} dims Shared basket geometry helpers and dimensions.
 */
function buildHandle(handleGeometries, dims) {
  const { backZ, railR, railSeg } = dims;
  const handleZ = backZ + HANDLE_PUSH_Z;
  const postTopY = HANDLE_BAR_Y - HANDLE_BAR_RADIUS * 0.9;
  const postBottomY = BASKET_RIM_TOP_Y - railR * 0.5;

  for (const sx of [-HANDLE_SPREAD_X, HANDLE_SPREAD_X]) {
    _p0.set(sx, postBottomY, backZ);
    _p1.set(sx, postTopY, handleZ);
    pushRailGeometry(handleGeometries, _p0, _p1, railR * 1.15, railSeg);
  }

  const handleLen = BASKET_WIDTH * 0.92;
  const handleBarGeo = new THREE.CylinderGeometry(
    HANDLE_BAR_RADIUS,
    HANDLE_BAR_RADIUS,
    handleLen,
    14,
    1,
  );
  _quat.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  _matrix.compose(_v.set(0, HANDLE_BAR_Y, handleZ), _quat, _scaleOne);
  handleBarGeo.applyMatrix4(_matrix);
  handleGeometries.push(handleBarGeo);
}

/**
 * Builds the open chassis frame: long rails, crossbars, and corner struts.
 * @param {THREE.BufferGeometry[]} frameGeometries Collected static frame geometries for merging.
 * @param {CartBuildDims} dims Shared basket geometry helpers and dimensions.
 */
function buildChassis(frameGeometries, dims) {
  const { halfW, frontZ, backZ, railR, yBottom } = dims;

  const chY = CHASSIS_RAIL_Y;
  const chX = CHASSIS_HALF_WIDTH;
  const chZ = CHASSIS_HALF_LENGTH;
  _p0.set(-chX, chY, -chZ);
  _p1.set(-chX, chY, chZ);
  pushRailGeometry(frameGeometries, _p0, _p1, CHASSIS_RAIL_RADIUS, 8);
  _p0.set(chX, chY, -chZ);
  _p1.set(chX, chY, chZ);
  pushRailGeometry(frameGeometries, _p0, _p1, CHASSIS_RAIL_RADIUS, 8);

  const crossCount = Math.min(CHASSIS_CROSSBAR_COUNT, CHASSIS_CROSSBAR_Z_FRACTIONS.length);
  for (let c = 0; c < crossCount; c += 1) {
    const frac = CHASSIS_CROSSBAR_Z_FRACTIONS[c];
    const zc = frac * chZ;
    _p0.set(-chX, chY, zc);
    _p1.set(chX, chY, zc);
    pushRailGeometry(frameGeometries, _p0, _p1, CHASSIS_RAIL_RADIUS, 8);
  }

  // * Corner struts (basket → chassis) sell the classic curved-frame read without a solid shelf.
  const strutR = CHASSIS_RAIL_RADIUS * 0.78;
  const struts = [
    { x0: -chX, z0: -chZ, x1: -halfW * 0.9, z1: frontZ + railR * 3, zKey: frontZ },
    { x0: chX, z0: -chZ, x1: halfW * 0.9, z1: frontZ + railR * 3, zKey: frontZ },
    { x0: -chX, z0: chZ, x1: -halfW * 0.9, z1: backZ - railR * 3, zKey: backZ },
    { x0: chX, z0: chZ, x1: halfW * 0.9, z1: backZ - railR * 3, zKey: backZ },
  ];
  for (const s of struts) {
    const y1 = yBottom(s.zKey) + railR * 3;
    _p0.set(s.x0, chY, s.z0);
    _p1.set(s.x1, y1, s.z1);
    pushRailGeometry(frameGeometries, _p0, _p1, strutR, 6);
  }
}

/**
 * Builds caster mounts, stems, yaw/pitch groups, wheels, and hub discs at chassis corners.
 * @param {THREE.Group} root Cart root group.
 * @param {THREE.Material} frameMat Neon frame material for wheel hubs.
 * @param {THREE.Material} wheelMat Dark chrome wheel tire and stem material.
 * @returns {{ casterYawGroups: THREE.Group[], wheelPitchObjects: THREE.Group[], wobblePhases: number[] }}
 */
function buildCastersAndWheels(root, frameMat, wheelMat) {
  const casterYawGroups = [];
  const wheelPitchObjects = [];
  const hx = CHASSIS_HALF_WIDTH - CASTER_CORNER_INSET;
  const hz = CHASSIS_HALF_LENGTH - CASTER_CORNER_INSET;
  const corners = [
    { x: -hx, z: -hz },
    { x: hx, z: -hz },
    { x: -hx, z: hz },
    { x: hx, z: hz },
  ];

  const chassisUnderside =
    CHASSIS_RAIL_Y - CHASSIS_RAIL_RADIUS - CASTER_MOUNT_DROP_BELOW_CHASSIS;
  const mountY = chassisUnderside - CASTER_STEM_HEIGHT * 0.35;

  for (let i = 0; i < corners.length; i += 1) {
    const { x, z } = corners[i];
    const mount = new THREE.Group();
    mount.position.set(x, mountY, z);
    root.add(mount);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_WIDTH * 0.42, WHEEL_WIDTH * 0.5, CASTER_STEM_HEIGHT, 10, 1),
      wheelMat,
    );
    stem.position.y = -CASTER_STEM_HEIGHT * 0.35;
    stem.userData.isWheel = true;
    mount.add(stem);

    const yawGroup = new THREE.Group();
    yawGroup.position.y = -CASTER_STEM_HEIGHT * 0.85;
    mount.add(yawGroup);
    casterYawGroups.push(yawGroup);

    const pitchGroup = new THREE.Group();
    yawGroup.add(pitchGroup);

    const wheel = new THREE.Mesh(SHARED_WHEEL_GEO, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.userData.isWheel = true;
    // * Marks shared geometry so cleanup utilities avoid disposing it per-instance.
    wheel.userData.isSharedGeometry = true;
    pitchGroup.add(wheel);

    const hub = new THREE.Mesh(SHARED_HUB_GEO, frameMat);
    hub.rotation.z = Math.PI / 2;
    // * Uses shared geometry across all carts.
    hub.userData.isSharedGeometry = true;
    pitchGroup.add(hub);

    wheelPitchObjects.push(pitchGroup);
  }

  return {
    casterYawGroups,
    wheelPitchObjects,
    wobblePhases: corners.map((_, j) => j * 1.83 + 0.4),
  };
}

/**
 * Builds the cart face on the front basket wall: sunglasses lenses, bridge, and grin mouth.
 * @param {THREE.Group} basketGroup Parent group for face meshes.
 * @param {number} frontZ Front wall Z coordinate.
 * @param {number} yBottomFront Y of the basket floor at the front wall.
 * @param {number} hFront Front wall height.
 * @param {number} halfW Half basket width.
 */
function buildFace(basketGroup, frontZ, yBottomFront, hFront, halfW) {
  const railR = BASKET_RAIL_RADIUS;

  // * Cart face: sunglasses + mouth.
  // * Sit clearly outside the front wall: frontZ is the inner-wall plane, so we
  // * step out by the rail radius plus a small gap to avoid z-fighting with rails.
  const faceZ = frontZ - railR - 0.03;
  const faceCenterY = yBottomFront + hFront * 0.55;

  // * Sunglasses: two dark lenses connected by a bridge.
  const lensW = halfW * 0.7;
  const lensH = hFront * 0.35;
  const lensGap = halfW * 0.06;

  // * Left lens.
  const leftLens = new THREE.Mesh(new THREE.PlaneGeometry(lensW, lensH), SHARED_LENS_MAT);
  leftLens.position.set(-lensGap - lensW * 0.5, faceCenterY, faceZ);
  leftLens.userData.isFace = true;
  basketGroup.add(leftLens);

  // * Right lens.
  const rightLens = new THREE.Mesh(new THREE.PlaneGeometry(lensW, lensH), SHARED_LENS_MAT);
  rightLens.position.set(lensGap + lensW * 0.5, faceCenterY, faceZ);
  rightLens.userData.isFace = true;
  basketGroup.add(rightLens);

  // * Bridge.
  const bridge = new THREE.Mesh(
    new THREE.PlaneGeometry(lensGap * 2, lensH * 0.3),
    SHARED_LENS_MAT,
  );
  bridge.position.set(0, faceCenterY, faceZ);
  bridge.userData.isFace = true;
  basketGroup.add(bridge);

  // * Mouth: wide grin.
  const mouthY = faceCenterY - hFront * 0.28;
  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-halfW * 0.6, mouthY, faceZ),
    new THREE.Vector3(0, mouthY - hFront * 0.15, faceZ),
    new THREE.Vector3(halfW * 0.6, mouthY, faceZ),
  );
  const mouthGeo = new THREE.TubeGeometry(mouthCurve, 12, 0.035, 4, false);
  const mouth = new THREE.Mesh(mouthGeo, SHARED_MOUTH_MAT);
  mouth.userData.isFace = true;
  basketGroup.add(mouth);
}

/**
 * Builds a complete procedural shopping cart mesh with basket, handle, chassis, casters, and face.
 * Attaches runtime wheel/caster state on `root.userData.cartVisual`.
 * @param {number} colorHex Cart emissive frame color as a hex number (e.g. `0xff00ff`).
 * @returns {THREE.Group} Named `"CartVisual"` root group ready to add to the scene.
 */
export function buildCart(colorHex) {
  const baseColor = new THREE.Color(colorHex);
  const frameMat = neonFrameMaterial(baseColor);
  const wheelMat = neonWheelMaterial(baseColor);
  const root = new THREE.Group();
  root.name = "CartVisual";

  const halfW = BASKET_WIDTH * 0.5;
  const halfL = BASKET_LENGTH * 0.5;
  const frontZ = -halfL;
  const backZ = halfL;
  const yBottomFront = BASKET_RIM_TOP_Y - BASKET_HEIGHT_FRONT;
  const yBottomBack = BASKET_RIM_TOP_Y - BASKET_HEIGHT_BACK;
  const railR = BASKET_RAIL_RADIUS;
  const railSeg = BASKET_RAIL_SEGMENTS;
  const hFront = BASKET_HEIGHT_FRONT;
  const hBack = BASKET_HEIGHT_BACK;

  /** @type {CartBuildDims} */
  const dims = {
    halfW,
    halfL,
    frontZ,
    backZ,
    yBottomFront,
    yBottomBack,
    railR,
    railSeg,
    hFront,
    hBack,
    yBottom: (z) => bottomYAtZ(z, halfL, yBottomFront, yBottomBack),
    wallHeight: (z) => BASKET_RIM_TOP_Y - bottomYAtZ(z, halfL, yBottomFront, yBottomBack),
  };

  const frameGeometries = [];
  const handleGeometries = [];

  buildBasketWireframe(frameGeometries, baseColor, dims);
  buildChassis(frameGeometries, dims);
  buildHandle(handleGeometries, dims);

  const frameMesh = mergeGeometriesIntoMesh(frameGeometries, frameMat, "CartFrame");
  if (frameMesh) root.add(frameMesh);

  const handleMesh = mergeGeometriesIntoMesh(
    handleGeometries,
    SHARED_HANDLE_MAT,
    "CartHandle",
    { isHandle: true },
  );
  if (handleMesh) root.add(handleMesh);

  const { casterYawGroups, wheelPitchObjects, wobblePhases } =
    buildCastersAndWheels(root, frameMat, wheelMat);

  root.userData.cartVisual = {
    casterYawGroups,
    wheelPitchObjects,
    smoothedCasterYaw: 0,
    wheelRoll: [0, 0, 0, 0],
    wobblePhases,
  };

  const faceGroup = new THREE.Group();
  faceGroup.name = "BasketFace";
  root.add(faceGroup);
  buildFace(faceGroup, frontZ, yBottomFront, hFront, halfW);

  return root;
}

/**
 * Resets caster yaw and wheel roll angles after teleport or respawn so visuals
 * do not inherit stale rotation state from the previous pose.
 * @param {THREE.Object3D} root Cart root returned by {@link buildCart}.
 */
export function resetCartVisualState(root) {
  const data = root.userData.cartVisual;
  if (!data) return;
  data.smoothedCasterYaw = 0;
  // Keep wheelRoll and wheelPitchObjects in sync in case the mesh changes.
  data.wheelRoll = new Array(data.wheelPitchObjects.length).fill(0);
  for (let i = 0; i < data.wheelRoll.length; i += 1) {
    data.wheelRoll[i] = 0;
  }
  for (const yawG of data.casterYawGroups) {
    yawG.rotation.y = 0;
  }
  for (const pitchG of data.wheelPitchObjects) {
    pitchG.rotation.x = 0;
  }
}

/**
 * Updates per-frame cart visuals: caster yaw aligned to planar velocity (with damping
 * and high-speed wobble) and wheel roll from signed speed along each caster heading.
 * @param {THREE.Object3D} root Cart root returned by {@link buildCart}.
 * @param {THREE.Vector3} linvelWorld World-space linear velocity of the cart body.
 * @param {number} dtSec Delta time in seconds since the last update.
 * @param {number} timeMs Absolute time in milliseconds (used for wobble phase).
 */
export function updateCartVisuals(root, linvelWorld, dtSec, timeMs) {
  const data = root.userData.cartVisual;
  if (!data) return;

  const { casterYawGroups, wheelPitchObjects, wobblePhases } = data;
  const vx = linvelWorld.x;
  const vz = linvelWorld.z;
  const speed = Math.hypot(vx, vz);

  root.getWorldQuaternion(_rootWorld);
  _rootInv.copy(_rootWorld).invert();
  _v.set(vx, 0, vz);
  if (speed >= CASTER_YAW_MIN_SPEED) {
    _localDir.copy(_v).applyQuaternion(_rootInv);
    const targetYaw = Math.atan2(_localDir.x, _localDir.z);
    const alpha = 1 - (1 - CASTER_YAW_DAMPING) ** Math.min(240 * dtSec, 1);
    data.smoothedCasterYaw = lerpAngle(data.smoothedCasterYaw, targetYaw, alpha);
  } else if (speed > 1e-5) {
    // * Wheel roll still needs local velocity when below caster-yaw threshold.
    _localDir.copy(_v).applyQuaternion(_rootInv);
  }

  const speedNorm = clamp(speed / 14, 0, 1);
  const wobbleScale = CASTER_YAW_WOBBLE_AMPLITUDE * speedNorm;
  const t = timeMs * 0.001;

  const yawBase = data.smoothedCasterYaw;
  const wheelRadius = Math.max(WHEEL_RADIUS, 1e-4);

  for (let i = 0; i < casterYawGroups.length; i += 1) {
    if (i >= data.wheelRoll.length) break;
    const yawG = casterYawGroups[i];
    const wob = Math.sin(t * 14.2 + wobblePhases[i]) * wobbleScale;
    const localYaw = yawBase + wob;
    yawG.rotation.y = localYaw;

    const localSignedSpeed =
      _localDir.x * Math.sin(localYaw) + _localDir.z * Math.cos(localYaw);
    data.wheelRoll[i] += (localSignedSpeed / wheelRadius) * dtSec;
    wheelPitchObjects[i].rotation.x = data.wheelRoll[i];
  }
}
