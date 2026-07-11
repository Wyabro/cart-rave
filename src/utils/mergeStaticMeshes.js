/**
 * mergeStaticMeshes.js — collapse static Mesh children into one draw per material.
 *
 * Used on Classic stage / stadium shell / booth neon so High-tier draw calls
 * drop from hundreds of tiny boxes to a handful of batched geometries.
 * Does not touch InstancedMesh, lights, animated meshes (userData.noMerge), or
 * multi-material meshes.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _rootInv = new THREE.Matrix4();
const _local = new THREE.Matrix4();

/**
 * Attribute + index fingerprint so BoxGeometry (rails/chevrons) and
 * CylinderGeometry (neon tubes) under the same material don't get force-merged
 * when Three would reject the batch (mixed index or mismatched attrs).
 *
 * @param {THREE.BufferGeometry} geo
 * @returns {string}
 */
function geometryCompatKey(geo) {
  const names = Object.keys(geo.attributes).sort().join(",");
  return `${geo.index ? "idx" : "raw"}|${names}`;
}

/**
 * @param {THREE.Object3D} root Group whose static mesh descendants should be merged.
 * @param {{
 *   deep?: boolean,
 *   disposeSourceGeometry?: boolean,
 * }} [opts]
 * @returns {{ mergedCount: number, removedMeshes: number, drawsAfter: number }}
 */
export function mergeStaticMeshesByMaterial(root, opts = {}) {
  if (!root) {
    return { mergedCount: 0, removedMeshes: 0, drawsAfter: 0 };
  }

  const deep = opts.deep !== false;
  const disposeSourceGeometry = opts.disposeSourceGeometry !== false;

  /** @type {THREE.Mesh[]} */
  const meshes = [];
  if (deep) {
    root.traverse((obj) => {
      const mesh = /** @type {THREE.Mesh} */ (obj);
      if (!mesh.isMesh) return;
      if (/** @type {any} */ (mesh).isInstancedMesh) return;
      if (mesh.userData?.noMerge) return;
      if (mesh === root) return;
      meshes.push(mesh);
    });
  } else {
    for (const child of root.children) {
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (!mesh.isMesh) continue;
      if (/** @type {any} */ (mesh).isInstancedMesh) continue;
      if (mesh.userData?.noMerge) continue;
      meshes.push(mesh);
    }
  }

  if (meshes.length < 2) {
    return { mergedCount: 0, removedMeshes: 0, drawsAfter: meshes.length };
  }

  root.updateWorldMatrix(true, true);
  _rootInv.copy(root.matrixWorld).invert();

  /**
   * @type {Map<string, {
   *   material: THREE.Material,
   *   pairs: { geo: THREE.BufferGeometry, source: THREE.Mesh }[],
   * }>}
   */
  const byMat = new Map();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!material || Array.isArray(material)) continue;
    if (!mesh.geometry) continue;

    const key = material.uuid;
    let bucket = byMat.get(key);
    if (!bucket) {
      bucket = { material, pairs: [] };
      byMat.set(key, bucket);
    }

    mesh.updateWorldMatrix(true, false);
    _local.copy(_rootInv).multiply(mesh.matrixWorld);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(_local);
    bucket.pairs.push({ geo, source: mesh });
  }

  let mergedCount = 0;
  let removedMeshes = 0;
  /** @type {Set<THREE.Mesh>} */
  const removed = new Set();

  for (const bucket of byMat.values()) {
    if (bucket.pairs.length < 2) {
      for (const p of bucket.pairs) p.geo.dispose();
      continue;
    }

    // * Three's mergeGeometries requires: all indexed OR all non-indexed.
    // * Booth neon mixes BoxGeometry chevrons + CylinderGeometry tubes under one
    // * material — convert mixed batches to non-indexed before merge.
    let pairs = bucket.pairs;
    const anyIndexed = pairs.some((p) => p.geo.index != null);
    const allIndexed = pairs.every((p) => p.geo.index != null);
    if (anyIndexed && !allIndexed) {
      pairs = pairs.map((p) => {
        if (p.geo.index == null) return p;
        const ni = p.geo.toNonIndexed();
        p.geo.dispose();
        return { geo: ni, source: p.source };
      });
    }

    /** @type {Map<string, { geo: THREE.BufferGeometry, source: THREE.Mesh }[]>} */
    const byCompat = new Map();
    for (const p of pairs) {
      const compatKey = geometryCompatKey(p.geo);
      let list = byCompat.get(compatKey);
      if (!list) {
        list = [];
        byCompat.set(compatKey, list);
      }
      list.push(p);
    }

    for (const group of byCompat.values()) {
      if (group.length < 2) {
        for (const p of group) p.geo.dispose();
        continue;
      }

      const merged = BufferGeometryUtils.mergeGeometries(
        group.map((p) => p.geo),
        false,
      );
      for (const p of group) p.geo.dispose();
      if (!merged) continue;

      const mergedMesh = new THREE.Mesh(merged, bucket.material);
      mergedMesh.name = `merged_${bucket.material.name || bucket.material.type}`;
      mergedMesh.userData.mergedStatic = true;
      mergedMesh.frustumCulled = true;
      root.add(mergedMesh);
      mergedCount += 1;

      for (const p of group) {
        const src = p.source;
        if (removed.has(src)) continue;
        if (src.parent) src.parent.remove(src);
        if (disposeSourceGeometry && src.geometry) {
          const geo = src.geometry;
          let shared = false;
          for (const other of meshes) {
            if (other !== src && other.geometry === geo) {
              shared = true;
              break;
            }
          }
          if (!shared) geo.dispose();
        }
        removed.add(src);
        removedMeshes += 1;
      }
    }
  }

  return {
    mergedCount,
    removedMeshes,
    drawsAfter: Math.max(0, meshes.length - removedMeshes + mergedCount),
  };
}
