import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeStaticMeshesByMaterial } from "../src/utils/mergeStaticMeshes.js";

describe("mergeStaticMeshesByMaterial", () => {
  it("merges meshes that share a material into one draw", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    for (let i = 0; i < 5; i += 1) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(i * 2, 0, 0);
      root.add(m);
    }
    root.updateMatrixWorld(true);

    const result = mergeStaticMeshesByMaterial(root, { deep: true });
    expect(result.mergedCount).toBe(1);
    expect(result.removedMeshes).toBe(5);

    const meshes = root.children.filter((c) => /** @type {THREE.Mesh} */ (c).isMesh);
    expect(meshes.length).toBe(1);
    expect(/** @type {THREE.Mesh} */ (meshes[0]).userData.mergedStatic).toBe(true);
  });

  it("keeps separate draws for different materials", () => {
    const root = new THREE.Group();
    const a = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const b = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), b));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), b));
    root.updateMatrixWorld(true);

    const result = mergeStaticMeshesByMaterial(root, { deep: true });
    expect(result.mergedCount).toBe(2);
    const meshes = root.children.filter((c) => /** @type {THREE.Mesh} */ (c).isMesh);
    expect(meshes.length).toBe(2);
  });

  it("respects userData.noMerge", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const keep = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    keep.userData.noMerge = true;
    root.add(keep);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    root.updateMatrixWorld(true);

    mergeStaticMeshesByMaterial(root, { deep: true });
    // * keep + one merged mesh for the other two
    const meshes = [];
    root.traverse((o) => {
      if (/** @type {THREE.Mesh} */ (o).isMesh) meshes.push(o);
    });
    expect(meshes.length).toBe(2);
    expect(meshes.some((m) => m.userData.noMerge)).toBe(true);
  });

  it("skips InstancedMesh", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(geo, mat, 4);
    inst.count = 4;
    root.add(inst);
    root.add(new THREE.Mesh(geo, mat));
    root.updateMatrixWorld(true);

    const result = mergeStaticMeshesByMaterial(root, { deep: true });
    expect(result.mergedCount).toBe(0);
    expect(root.children.includes(inst)).toBe(true);
  });

  it("merges mixed BoxGeometry + CylinderGeometry under one material (booth neon case)", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
    // * Chevrons / rails pattern: boxes + scaled cylinders sharing neon mat.
    for (let i = 0; i < 4; i += 1) {
      root.add(new THREE.Mesh(new THREE.BoxGeometry(1 - i * 0.1, 0.05, 0.16), mat));
    }
    for (let i = 0; i < 6; i += 1) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), mat);
      tube.scale.set(0.05, 2 + i * 0.1, 0.05);
      tube.position.set(i, 0, 0);
      root.add(tube);
    }
    root.updateMatrixWorld(true);

    const before = console.error;
    const errors = [];
    console.error = (...args) => {
      errors.push(args.join(" "));
    };
    try {
      const result = mergeStaticMeshesByMaterial(root, { deep: true });
      expect(result.mergedCount).toBeGreaterThanOrEqual(1);
      expect(result.removedMeshes).toBe(10);
      expect(errors.some((e) => e.includes("mergeGeometries"))).toBe(false);
    } finally {
      console.error = before;
    }
  });
});
