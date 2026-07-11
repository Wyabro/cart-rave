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

  /** @type {Map<string, { material: THREE.Material, geos: THREE.BufferGeometry[], sources: THREE.Mesh[] }>} */
  const byMat = new Map();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!material || Array.isArray(material)) continue;
    if (!mesh.geometry) continue;

    const key = material.uuid;
    let bucket = byMat.get(key);
    if (!bucket) {
      bucket = { material, geos: [], sources: [] };
      byMat.set(key, bucket);
    }

    mesh.updateWorldMatrix(true, false);
    _local.copy(_rootInv).multiply(mesh.matrixWorld);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(_local);
    bucket.geos.push(geo);
    bucket.sources.push(mesh);
  }

  let mergedCount = 0;
  let removedMeshes = 0;

  for (const bucket of byMat.values()) {
    if (bucket.geos.length < 2) {
      // * Leave single-mesh materials alone; dispose the unused clone.
      for (const g of bucket.geos) g.dispose();
      continue;
    }

    const merged = BufferGeometryUtils.mergeGeometries(bucket.geos, false);
    for (const g of bucket.geos) g.dispose();
    if (!merged) continue;

    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.name = `merged_${bucket.material.name || bucket.material.type}`;
    mergedMesh.userData.mergedStatic = true;
    mergedMesh.frustumCulled = true;
    root.add(mergedMesh);
    mergedCount += 1;

    for (const src of bucket.sources) {
      if (src.parent) src.parent.remove(src);
      if (disposeSourceGeometry && src.geometry) {
        // * Only dispose if no other mesh still references it (shared booth geos).
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
      removedMeshes += 1;
    }
  }

  return {
    mergedCount,
    removedMeshes,
    drawsAfter: Math.max(0, meshes.length - removedMeshes + mergedCount),
  };
}
