/**
 * levelLod.js — Runtime distance LOD for non-gameplay level props.
 *
 * Registers Object3Ds with a far-cull radius (XZ distance from camera).
 * Updated at most every INTERVAL_MS — never rebuilds physics.
 */

import * as THREE from "three";

/** @type {Array<{ obj: THREE.Object3D, far: number }>} */
const nodes = [];

const _worldPos = new THREE.Vector3();
let _lastUpdateMs = 0;

/** ms between visibility recompute passes */
const INTERVAL_MS = 250;

/**
 * Clears all registered LOD nodes (call on level dispose / swap).
 */
export function clearLevelLod() {
  nodes.length = 0;
  _lastUpdateMs = 0;
}

/**
 * Registers a prop group/mesh for distance culling.
 * @param {THREE.Object3D | null | undefined} obj
 * @param {{ far?: number }} [opts] far — hide when camera XZ distance exceeds this (meters)
 */
export function registerLevelLodNode(obj, opts = {}) {
  if (!obj) return;
  const far = typeof opts.far === "number" ? opts.far : 45;
  nodes.push({ obj, far });
  obj.userData = obj.userData || {};
  obj.userData.levelLodFar = far;
}

/**
 * Updates visibility of registered props from camera XZ position.
 * Cheap: at most ~few dozen hypot checks every 250ms.
 *
 * @param {THREE.Camera | null | undefined} camera
 * @param {number} [nowMs]
 */
export function updateLevelLod(camera, nowMs = performance.now()) {
  if (!camera || nodes.length === 0) return;
  if (nowMs - _lastUpdateMs < INTERVAL_MS) return;
  _lastUpdateMs = nowMs;

  const cx = camera.position.x;
  const cz = camera.position.z;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.obj) continue;
    n.obj.getWorldPosition(_worldPos);
    const d = Math.hypot(_worldPos.x - cx, _worldPos.z - cz);
    const want = d < n.far;
    if (n.obj.visible !== want) n.obj.visible = want;
  }
}

/** @returns {number} Registered node count (tests / debug). */
export function getLevelLodNodeCount() {
  return nodes.length;
}
