import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

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
export const CASTER_MOUNT_DROP_BELOW_CHASSIS = 0.02;

const _v = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _rootWorld = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();
const _yawWorld = new THREE.Quaternion();
const _rollDir = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();

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
 * @param {THREE.Object3D} parent
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} radius
 * @param {number} segments
 * @param {THREE.Material} material
 */
function addRailCylinder(parent, a, b, radius, segments, material) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-5) return;
  _dir.multiplyScalar(1 / len);
  _mid.addVectors(a, b).multiplyScalar(0.5);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, segments, 1),
    material,
  );
  mesh.position.copy(_mid);
  mesh.quaternion.setFromUnitVectors(_axisY, _dir);
  parent.add(mesh);
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
    roughness: 0.45,
    metalness: 0.12,
  });
}

/**
 * @param {THREE.Color} base
 * @returns {THREE.MeshStandardMaterial}
 */
function neonWheelMaterial(base) {
  const c = base.clone().multiplyScalar(0.55);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: base.clone(),
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.35,
  });
}

/**
 * @param {number} colorHex
 * @returns {THREE.Group}
 */
export function buildCart(colorHex) {
  const baseColor = new THREE.Color(colorHex);
  const frameMat = neonFrameMaterial(baseColor);
  const wheelMat = neonWheelMaterial(baseColor);
  const stemMat = neonWheelMaterial(baseColor);

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

  const basketGroup = new THREE.Group();
  basketGroup.name = "BasketWire";
  root.add(basketGroup);

  /**
   * @param {number} z
   * @returns {number}
   */
  function yBottom(z) {
    return bottomYAtZ(z, halfL, yBottomFront, yBottomBack);
  }

  /**
   * @param {number} z
   * @returns {number}
   */
  function wallHeight(z) {
    return BASKET_RIM_TOP_Y - yBottom(z);
  }

  // * Long sides: vertical rails along Z, horizontal tiers as polylines along Z (sloped silhouette).
  for (let i = 0; i < VERTICAL_RAILS_LONG; i += 1) {
    const u = VERTICAL_RAILS_LONG <= 1 ? 0.5 : i / (VERTICAL_RAILS_LONG - 1);
    const z = frontZ + u * (backZ - frontZ);
    const y0 = yBottom(z);
    _p0.set(-halfW, y0, z);
    _p1.set(-halfW, BASKET_RIM_TOP_Y, z);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
    _p0.set(halfW, y0, z);
    _p1.set(halfW, BASKET_RIM_TOP_Y, z);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
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
      addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
      _p0.set(halfW, y0, z0);
      _p1.set(halfW, y1, z1);
      addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
    }
  }

  // * Front wall (short): grid in X at z = frontZ.
  const hFront = BASKET_HEIGHT_FRONT;
  for (let i = 0; i < VERTICAL_RAILS_FRONT; i += 1) {
    const u = VERTICAL_RAILS_FRONT <= 1 ? 0.5 : i / (VERTICAL_RAILS_FRONT - 1);
    const x = -halfW + u * (2 * halfW);
    _p0.set(x, yBottom(frontZ), frontZ);
    _p1.set(x, BASKET_RIM_TOP_Y, frontZ);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  }
  for (let k = 0; k < HORIZONTAL_RAILS_FRONT; k += 1) {
    const f = (k + 1) / (HORIZONTAL_RAILS_FRONT + 1);
    const y = yBottom(frontZ) + f * hFront;
    _p0.set(-halfW, y, frontZ);
    _p1.set(halfW, y, frontZ);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  }

  // * Back wall (tall): grid in X at z = backZ.
  const hBack = BASKET_HEIGHT_BACK;
  for (let i = 0; i < VERTICAL_RAILS_BACK; i += 1) {
    const u = VERTICAL_RAILS_BACK <= 1 ? 0.5 : i / (VERTICAL_RAILS_BACK - 1);
    const x = -halfW + u * (2 * halfW);
    _p0.set(x, yBottom(backZ), backZ);
    _p1.set(x, BASKET_RIM_TOP_Y, backZ);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  }
  for (let k = 0; k < HORIZONTAL_RAILS_BACK; k += 1) {
    const f = (k + 1) / (HORIZONTAL_RAILS_BACK + 1);
    const y = yBottom(backZ) + f * hBack;
    _p0.set(-halfW, y, backZ);
    _p1.set(halfW, y, backZ);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  }

  // * Top rim (open basket): rectangle of rails so the read is clearly "cart top".
  const rimInset = railR * 2.2;
  _p0.set(-halfW + rimInset, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(halfW - rimInset, BASKET_RIM_TOP_Y, frontZ + rimInset);
  addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  _p0.set(-halfW + rimInset, BASKET_RIM_TOP_Y, backZ - rimInset);
  _p1.set(halfW - rimInset, BASKET_RIM_TOP_Y, backZ - rimInset);
  addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  _p0.set(-halfW, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(-halfW, BASKET_RIM_TOP_Y, backZ - rimInset);
  addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
  _p0.set(halfW, BASKET_RIM_TOP_Y, frontZ + rimInset);
  _p1.set(halfW, BASKET_RIM_TOP_Y, backZ - rimInset);
  addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);

  // * Sloped bottom wire grid (rails along X at several Z, rails along Z in segments).
  for (let j = 0; j < BOTTOM_GRID_ALONG_X; j += 1) {
    const u = BOTTOM_GRID_ALONG_X <= 1 ? 0.5 : j / (BOTTOM_GRID_ALONG_X - 1);
    const z = frontZ + u * (backZ - frontZ);
    const y = yBottom(z);
    _p0.set(-halfW, y, z);
    _p1.set(halfW, y, z);
    addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
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
      addRailCylinder(basketGroup, _p0, _p1, railR, railSeg, frameMat);
    }
  }

  // * Handle: horizontal bar + two vertical posts from rim to bar (behind basket in +Z).
  const handleZ = backZ + HANDLE_PUSH_Z;
  const postTopY = HANDLE_BAR_Y - HANDLE_BAR_RADIUS * 0.9;
  const postBottomY = BASKET_RIM_TOP_Y - railR * 0.5;
  for (const sx of [-HANDLE_SPREAD_X, HANDLE_SPREAD_X]) {
    _p0.set(sx, postBottomY, backZ);
    _p1.set(sx, postTopY, handleZ);
    addRailCylinder(root, _p0, _p1, railR * 1.15, railSeg, frameMat);
  }
  const handleLen = BASKET_WIDTH * 0.92;
  const handleBar = new THREE.Mesh(
    new THREE.CylinderGeometry(HANDLE_BAR_RADIUS, HANDLE_BAR_RADIUS, handleLen, 14, 1),
    frameMat,
  );
  handleBar.rotation.z = Math.PI / 2;
  handleBar.position.set(0, HANDLE_BAR_Y, handleZ);
  root.add(handleBar);

  // * Chassis: two long rails + crossbars (open frame).
  const chassisGroup = new THREE.Group();
  chassisGroup.name = "Chassis";
  root.add(chassisGroup);

  const chY = CHASSIS_RAIL_Y;
  const chX = CHASSIS_HALF_WIDTH;
  const chZ = CHASSIS_HALF_LENGTH;
  _p0.set(-chX, chY, -chZ);
  _p1.set(-chX, chY, chZ);
  addRailCylinder(chassisGroup, _p0, _p1, CHASSIS_RAIL_RADIUS, 8, frameMat);
  _p0.set(chX, chY, -chZ);
  _p1.set(chX, chY, chZ);
  addRailCylinder(chassisGroup, _p0, _p1, CHASSIS_RAIL_RADIUS, 8, frameMat);

  const crossCount = Math.min(CHASSIS_CROSSBAR_COUNT, CHASSIS_CROSSBAR_Z_FRACTIONS.length);
  for (let c = 0; c < crossCount; c += 1) {
    const frac = CHASSIS_CROSSBAR_Z_FRACTIONS[c];
    const zc = frac * chZ;
    _p0.set(-chX, chY, zc);
    _p1.set(chX, chY, zc);
    addRailCylinder(chassisGroup, _p0, _p1, CHASSIS_RAIL_RADIUS, 8, frameMat);
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
    addRailCylinder(chassisGroup, _p0, _p1, strutR, 6, frameMat);
  }

  // * Casters at chassis corners (same hierarchy as before).
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

  const wheelGeo = new THREE.CylinderGeometry(
    WHEEL_RADIUS,
    WHEEL_RADIUS,
    WHEEL_WIDTH,
    WHEEL_RADIAL_SEGMENTS,
    1,
  );
  for (let i = 0; i < corners.length; i += 1) {
    const { x, z } = corners[i];
    const mount = new THREE.Group();
    mount.position.set(x, mountY, z);
    root.add(mount);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_WIDTH * 0.42, WHEEL_WIDTH * 0.5, CASTER_STEM_HEIGHT, 10, 1),
      stemMat,
    );
    stem.position.y = -CASTER_STEM_HEIGHT * 0.35;
    mount.add(stem);

    const yawGroup = new THREE.Group();
    yawGroup.position.y = -CASTER_STEM_HEIGHT * 0.85;
    mount.add(yawGroup);
    casterYawGroups.push(yawGroup);

    const pitchGroup = new THREE.Group();
    yawGroup.add(pitchGroup);

    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    pitchGroup.add(wheel);
    wheelPitchObjects.push(pitchGroup);
  }

  root.userData.cartVisual = {
    casterYawGroups,
    wheelPitchObjects,
    smoothedCasterYaw: 0,
    wheelRoll: [0, 0, 0, 0],
    wobblePhases: corners.map((_, j) => j * 1.83 + 0.4),
  };

  return root;
}

/**
 * * Resets caster angles after teleport / respawn so visuals do not inherit stale state.
 * @param {THREE.Object3D} root
 */
export function resetCartVisualState(root) {
  const data = root.userData.cartVisual;
  if (!data) return;
  data.smoothedCasterYaw = 0;
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
 * * Updates caster yaw (velocity-aligned, damped, wobble) and wheel roll from planar speed.
 * @param {THREE.Object3D} root
 * @param {THREE.Vector3} linvelWorld
 * @param {number} dtSec
 * @param {number} timeMs
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
  }

  const speedNorm = clamp(speed / 14, 0, 1);
  const wobbleScale = CASTER_YAW_WOBBLE_AMPLITUDE * speedNorm;
  const t = timeMs * 0.001;

  const yawBase = data.smoothedCasterYaw;

  for (let i = 0; i < casterYawGroups.length; i += 1) {
    const yawG = casterYawGroups[i];
    const wob = Math.sin(t * 14.2 + wobblePhases[i]) * wobbleScale;
    yawG.rotation.y = yawBase + wob;

    yawG.getWorldQuaternion(_yawWorld);
    _rollDir.set(0, 0, 1).applyQuaternion(_yawWorld);
    _rollDir.y = 0;
    const rl = _rollDir.length();
    if (rl > 1e-5) _rollDir.multiplyScalar(1 / rl);

    const signedSpeed = vx * _rollDir.x + vz * _rollDir.z;
    data.wheelRoll[i] += (signedSpeed / Math.max(WHEEL_RADIUS, 1e-4)) * dtSec;

    wheelPitchObjects[i].rotation.x = data.wheelRoll[i];
  }
}
