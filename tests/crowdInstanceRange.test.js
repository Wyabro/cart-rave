// crowdInstanceRange.test.js — CROWD-INSTANCE-RANGE-1: the per-frame crowd batch
// rewrite must upload only the mutated batch via update ranges instead of the whole
// instanceMatrix buffer, and the buffer must carry DynamicDrawUsage so partial uploads
// stay cheap. Ranges must be cleared each frame or the union grows unbounded.
//
// updateCrowd lives inside effects.js's module-level closure with DOM/WebGL deps, so
// this file mirrors effectsDispose.test.js: the real three r185 InstancedBufferAttribute
// API is exercised behaviorally, and the actual code path is asserted from source.
// Both halves fail against the pre-fix file (no setUsage at creation, no update ranges).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";

const effectsSrc = readFileSync(new URL("../src/effects.js", import.meta.url), "utf8");

/** Source of `effects.js` between two top-level markers (exclusive of the end marker). */
function sourceBetween(startMarker, endMarker) {
  const start = effectsSrc.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = effectsSrc.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return effectsSrc.slice(start, end);
}

const initCrowdBody = sourceBetween("export function initCrowd(", "export function setRaveExtrasVisible(");
const updateCrowdBody = sourceBetween("export function updateCrowd(", "export function initEffects(");

describe("three r185 instance buffer API", () => {
  it("exposes DynamicDrawUsage and the update-range surface", () => {
    expect(THREE.DynamicDrawUsage).toBe(35048);
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
    expect(mesh.instanceMatrix.itemSize).toBe(16);
    expect(typeof mesh.instanceMatrix.setUsage).toBe("function");
    expect(typeof mesh.instanceMatrix.addUpdateRange).toBe("function");
    expect(typeof mesh.instanceMatrix.clearUpdateRanges).toBe("function");
  });

  it("clearing before adding keeps exactly one bounded range per frame", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 32);
    const im = mesh.instanceMatrix;
    im.setUsage(THREE.DynamicDrawUsage);
    expect(im.usage).toBe(THREE.DynamicDrawUsage);

    // * First frame: a 6-instance batch starting at instance 2. needsUpdate is a
    // * setter-only accessor in r185 — it bumps .version, which the renderer keys on.
    const versionBefore = im.version;
    im.clearUpdateRanges();
    im.addUpdateRange(2 * im.itemSize, 6 * im.itemSize);
    im.needsUpdate = true;
    expect(im.updateRanges).toEqual([{ start: 32, count: 96 }]);
    expect(im.version).toBe(versionBefore + 1);

    // * Second frame: if the caller skipped clearUpdateRanges the union would grow
    // * toward a full re-upload — the fix keeps it at exactly the new bounded range.
    im.clearUpdateRanges();
    im.addUpdateRange(10 * im.itemSize, 4 * im.itemSize);
    im.needsUpdate = true;
    expect(im.updateRanges).toEqual([{ start: 160, count: 64 }]);
  });
});

describe("effects.js crowd instance buffer fix", () => {
  it("sets DynamicDrawUsage on every crowd layer's instanceMatrix at creation", () => {
    expect(initCrowdBody).toMatch(/instanceMatrix\.setUsage\(\s*THREE\.DynamicDrawUsage\s*\)/);
  });

  it("keeps a full-buffer needsUpdate for the one-time layer population", () => {
    // * The initial population upload stays a whole-buffer update (no ranges) — ranges
    // * only belong in the per-frame path.
    expect(initCrowdBody).toMatch(/layer\.mesh\.instanceMatrix\.needsUpdate\s*=\s*true/);
    expect(initCrowdBody).not.toMatch(/clearUpdateRanges/);
  });

  it("clears prior ranges before adding the per-frame batch range", () => {
    expect(updateCrowdBody).toMatch(/\.clearUpdateRanges\(\)/);
    expect(updateCrowdBody).toMatch(/\.addUpdateRange\(/);
    const clear = updateCrowdBody.indexOf("clearUpdateRanges");
    const add = updateCrowdBody.indexOf("addUpdateRange");
    expect(clear).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(clear);
  });

  it("bounds every per-frame range to the mutated batch and still flags needsUpdate", () => {
    const bounded = updateCrowdBody.match(
      /addUpdateRange\(\s*start\s*\*\s*im\.itemSize,\s*\(end\s*-\s*start\)\s*\*\s*im\.itemSize\s*\)/g,
    ) ?? [];
    const total = updateCrowdBody.match(/addUpdateRange\(/g) ?? [];
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBe(total.length);
    const afterLastRange = updateCrowdBody.slice(updateCrowdBody.lastIndexOf("addUpdateRange"));
    expect(afterLastRange).toMatch(/im\.needsUpdate\s*=\s*true/);
  });
});
