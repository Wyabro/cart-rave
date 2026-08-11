// nightShiftVisuals.js — deterministic, visual-only architecture for Night Shift.

import * as THREE from "three";

export const NIGHT_SHIFT_CITY_SEED = 0x4e534331;

const BAND_SPECS = Object.freeze([
  Object.freeze({ id: "near", count: 8, radiusMin: 94, radiusMax: 126, roofMin: -24, roofMax: -10, bottomY: -118, widthMin: 26, widthMax: 46, depthMin: 24, depthMax: 44 }),
  Object.freeze({ id: "mid", count: 14, radiusMin: 150, radiusMax: 226, roofMin: -52, roofMax: -28, bottomY: -132, widthMin: 25, widthMax: 50, depthMin: 24, depthMax: 48 }),
  Object.freeze({ id: "far", count: 24, radiusMin: 270, radiusMax: 410, roofMin: -84, roofMax: -48, bottomY: -160, widthMin: 32, widthMax: 72, depthMin: 30, depthMax: 68 }),
]);

const LOW_MID_COUNT = 8;
const TOWER_BOTTOM_Y = -96;
const TOWER_HALF_SIZE = 36;
const FACADE_THICKNESS = 0.8;

/** @param {number} value */
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/** @param {number} seed */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produces the complete city layout before any Three.js object is allocated. The band ranges
 * keep every skyline roof well below the driveable arena and leave a wide gameplay clearance.
 *
 * @param {number} [seed]
 */
export function createNightShiftCityPlan(seed = NIGHT_SHIFT_CITY_SEED) {
  const random = makeRng(seed);
  const buildings = [];

  for (const band of BAND_SPECS) {
    const angleStep = (Math.PI * 2) / band.count;
    const angleOffset = random() * angleStep;
    for (let index = 0; index < band.count; index += 1) {
      const angle = angleOffset + index * angleStep + (random() - 0.5) * angleStep * 0.54;
      const radius = band.radiusMin + random() * (band.radiusMax - band.radiusMin);
      const roofY = band.roofMin + random() * (band.roofMax - band.roofMin);
      const width = band.widthMin + random() * (band.widthMax - band.widthMin);
      const depth = band.depthMin + random() * (band.depthMax - band.depthMin);
      buildings.push(Object.freeze({
        id: `${band.id}-${index + 1}`,
        band: band.id,
        detail: band.id === "near" || (band.id === "mid" && index < LOW_MID_COUNT) ? "core" : "extended",
        x: round3(Math.cos(angle) * radius),
        z: round3(Math.sin(angle) * radius),
        yaw: round3(angle + Math.PI / 2 + (random() - 0.5) * 0.24),
        width: round3(width),
        depth: round3(depth),
        roofY: round3(roofY),
        bottomY: band.bottomY,
      }));
    }
  }

  return Object.freeze({
    seed: seed >>> 0,
    buildings: Object.freeze(buildings),
    bandCounts: Object.freeze(Object.fromEntries(BAND_SPECS.map((band) => [band.id, band.count]))),
    lowBuildingCount: buildings.filter((building) => building.detail === "core").length,
  });
}

/**
 * @param {THREE.InstancedMesh} mesh
 * @param {Array<{ x: number, y: number, z: number, yaw?: number, width: number, height: number, depth: number }>} specs
 */
function writeBoxInstances(mesh, specs) {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();

  for (const [index, spec] of specs.entries()) {
    position.set(spec.x, spec.y, spec.z);
    euler.set(0, spec.yaw ?? 0, 0);
    rotation.setFromEuler(euler);
    scale.set(spec.width, spec.height, spec.depth);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * @param {THREE.InstancedMesh} mesh
 * @param {Array<{ start: THREE.Vector3, end: THREE.Vector3, thickness: number }>} beams
 */
function writeBeamInstances(mesh, beams) {
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);

  for (const [index, beam] of beams.entries()) {
    position.copy(beam.start).add(beam.end).multiplyScalar(0.5);
    direction.copy(beam.end).sub(beam.start);
    const length = direction.length();
    rotation.setFromUnitVectors(up, direction.normalize());
    scale.set(beam.thickness, length, beam.thickness);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Builds exposed facade faces, corner-deck braces, and three batched skyline depth bands.
 * This module never receives Rapier's world, so it cannot change gameplay collision.
 *
 * @param {THREE.Group} root
 * @param {ReturnType<typeof createNightShiftCityPlan>} plan
 * @param {ReturnType<import("./rooftop.js").getNightShiftSpawnPlatforms>} spawnPlatforms
 * @param {{ tower: THREE.Material, brace: THREE.Material,
 *   skylineCore: THREE.Material, skylineExtended: THREE.Material }} materials
 */
export function createNightShiftCityArchitecture(root, plan, spawnPlatforms, materials) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const towerHeight = Math.abs(TOWER_BOTTOM_Y);
  const towerSpecs = [
    { x: 0, y: TOWER_BOTTOM_Y / 2, z: TOWER_HALF_SIZE, width: TOWER_HALF_SIZE * 2, height: towerHeight, depth: FACADE_THICKNESS },
    { x: 0, y: TOWER_BOTTOM_Y / 2, z: -TOWER_HALF_SIZE, width: TOWER_HALF_SIZE * 2, height: towerHeight, depth: FACADE_THICKNESS },
    { x: TOWER_HALF_SIZE, y: TOWER_BOTTOM_Y / 2, z: 0, width: FACADE_THICKNESS, height: towerHeight, depth: TOWER_HALF_SIZE * 2 },
    { x: -TOWER_HALF_SIZE, y: TOWER_BOTTOM_Y / 2, z: 0, width: FACADE_THICKNESS, height: towerHeight, depth: TOWER_HALF_SIZE * 2 },
  ];
  const tower = new THREE.InstancedMesh(unitBox, materials.tower, towerSpecs.length);
  tower.name = "night-shift-tower-shell";
  writeBoxInstances(tower, towerSpecs);

  const beams = [];
  for (const platform of spawnPlatforms) {
    const signX = Math.sign(platform.x) || 1;
    const signZ = Math.sign(platform.z) || 1;
    const undersideY = platform.y - platform.height / 2 - 0.15;
    beams.push(
      {
        start: new THREE.Vector3(platform.x - signX * 2.1, undersideY, platform.z),
        end: new THREE.Vector3(signX * (TOWER_HALF_SIZE - 0.35), -5.5, platform.z),
        thickness: 0.42,
      },
      {
        start: new THREE.Vector3(platform.x, undersideY, platform.z - signZ * 2.1),
        end: new THREE.Vector3(platform.x, -5.5, signZ * (TOWER_HALF_SIZE - 0.35)),
        thickness: 0.42,
      },
    );
  }
  const braces = new THREE.InstancedMesh(unitBox, materials.brace, beams.length);
  braces.name = "night-shift-corner-deck-braces";
  writeBeamInstances(braces, beams);

  const coreSpecs = [];
  const extendedSpecs = [];
  for (const building of plan.buildings) {
    const spec = {
      x: building.x,
      y: (building.roofY + building.bottomY) / 2,
      z: building.z,
      yaw: building.yaw,
      width: building.width,
      height: building.roofY - building.bottomY,
      depth: building.depth,
    };
    (building.detail === "core" ? coreSpecs : extendedSpecs).push(spec);
  }

  const coreSkyline = new THREE.InstancedMesh(unitBox, materials.skylineCore, coreSpecs.length);
  coreSkyline.name = "night-shift-skyline-core";
  writeBoxInstances(coreSkyline, coreSpecs);
  const extendedSkyline = new THREE.InstancedMesh(unitBox, materials.skylineExtended, extendedSpecs.length);
  extendedSkyline.name = "night-shift-skyline-extended";
  writeBoxInstances(extendedSkyline, extendedSpecs);

  for (const mesh of [tower, braces, coreSkyline, extendedSkyline]) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    root.add(mesh);
  }

  const diagnostics = Object.freeze({
    seed: plan.seed,
    bandCounts: plan.bandCounts,
    lowBuildingCount: coreSpecs.length,
    fullBuildingCount: plan.buildings.length,
    braceCount: beams.length,
    architectureDrawCalls: 4,
  });

  return {
    extendedSkyline,
    diagnostics,
    dispose() {
      root.remove(tower, braces, coreSkyline, extendedSkyline);
      unitBox.dispose();
    },
  };
}
