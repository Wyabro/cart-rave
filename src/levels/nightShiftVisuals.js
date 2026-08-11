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

/** @param {ReturnType<typeof createNightShiftCityPlan>} plan */
function buildWindowBuffers(plan) {
  const corePositions = [];
  const coreColors = [];
  const extendedPositions = [];
  const extendedColors = [];
  const random = makeRng(plan.seed ^ 0xbb67ae85);

  for (const building of plan.buildings) {
    const positions = building.detail === "core" ? corePositions : extendedPositions;
    const colors = building.detail === "core" ? coreColors : extendedColors;
    const angle = Math.atan2(building.z, building.x);
    const inwardX = -Math.cos(angle);
    const inwardZ = -Math.sin(angle);
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    const faceOffset = Math.min(building.width, building.depth) * 0.5 + 0.55;
    const columns = Math.max(2, Math.floor(building.width / 7));
    const rows = Math.max(2, Math.floor((building.roofY - building.bottomY) / 8));

    for (let row = 1; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (random() > 0.48) continue;
        const across = ((column + 0.5) / columns - 0.5) * building.width * 0.78;
        positions.push(
          building.x + inwardX * faceOffset + tangentX * across,
          building.bottomY + row * 8 + (random() - 0.5) * 0.7,
          building.z + inwardZ * faceOffset + tangentZ * across,
        );
        const brightness = 0.48 + random() * 0.52;
        const cool = random() < 0.24;
        colors.push(
          brightness * (cool ? 0.62 : 1),
          brightness * (cool ? 0.8 : 0.66),
          brightness * (cool ? 1 : 0.34),
        );
      }
    }
  }

  // The arena's own tower needs occupied floors below the roof. These four facade grids make
  // the drop legible from the chase camera instead of reading as one unbroken black slab.
  const towerFaces = [
    { axis: "x", fixed: 36.45 },
    { axis: "x", fixed: -36.45 },
    { axis: "z", fixed: 36.45 },
    { axis: "z", fixed: -36.45 },
  ];
  for (const face of towerFaces) {
    for (let row = 0; row < 11; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        if (random() > 0.42) continue;
        const across = -28 + column * 8;
        const y = -9 - row * 7.2;
        if (face.axis === "x") corePositions.push(face.fixed, y, across);
        else corePositions.push(across, y, face.fixed);
        const brightness = 0.54 + random() * 0.46;
        const cool = random() < 0.2;
        coreColors.push(
          brightness * (cool ? 0.6 : 1),
          brightness * (cool ? 0.82 : 0.64),
          brightness * (cool ? 1 : 0.3),
        );
      }
    }
  }
  return { corePositions, coreColors, extendedPositions, extendedColors };
}

/**
 * @param {number[]} positions
 * @param {number[]} colors
 * @param {string} name
 */
function createWindowPoints(positions, colors, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size: 2.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.94,
    fog: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  return points;
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
  const deckBraceStart = beams.length;
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
      {
        start: new THREE.Vector3(platform.x, undersideY - 0.1, platform.z),
        end: new THREE.Vector3(
          signX * (TOWER_HALF_SIZE - 0.35),
          -8.5,
          signZ * (TOWER_HALF_SIZE - 0.35),
        ),
        thickness: 0.5,
      },
    );
  }
  const deckBraceCount = beams.length - deckBraceStart;

  // Horizontal floor plates and vertical corner columns break the tower shell into readable
  // construction layers. Every beam stays outside or below the driveable roof plane.
  const facadeBandStart = beams.length;
  for (let y = -8; y >= -92; y -= 12) {
    beams.push(
      { start: new THREE.Vector3(-35.7, y, 36.45), end: new THREE.Vector3(35.7, y, 36.45), thickness: 0.34 },
      { start: new THREE.Vector3(-35.7, y, -36.45), end: new THREE.Vector3(35.7, y, -36.45), thickness: 0.34 },
      { start: new THREE.Vector3(36.45, y, -35.7), end: new THREE.Vector3(36.45, y, 35.7), thickness: 0.34 },
      { start: new THREE.Vector3(-36.45, y, -35.7), end: new THREE.Vector3(-36.45, y, 35.7), thickness: 0.34 },
    );
  }
  const facadeBandCount = beams.length - facadeBandStart;

  for (const x of [-36.45, 36.45]) {
    for (const z of [-36.45, 36.45]) {
      beams.push({
        start: new THREE.Vector3(x, -95, z),
        end: new THREE.Vector3(x, -0.3, z),
        thickness: 0.58,
      });
    }
  }
  beams.push(
    { start: new THREE.Vector3(-36, -0.2, 36.35), end: new THREE.Vector3(36, -0.2, 36.35), thickness: 0.36 },
    { start: new THREE.Vector3(-36, -0.2, -36.35), end: new THREE.Vector3(36, -0.2, -36.35), thickness: 0.36 },
    { start: new THREE.Vector3(36.35, -0.2, -36), end: new THREE.Vector3(36.35, -0.2, 36), thickness: 0.36 },
    { start: new THREE.Vector3(-36.35, -0.2, -36), end: new THREE.Vector3(-36.35, -0.2, 36), thickness: 0.36 },
  );
  const braces = new THREE.InstancedMesh(unitBox, materials.brace, beams.length);
  braces.name = "night-shift-tower-structure";
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

  const windowBuffers = buildWindowBuffers(plan);
  const coreWindows = createWindowPoints(
    windowBuffers.corePositions,
    windowBuffers.coreColors,
    "night-shift-windows-core",
  );
  const extendedWindows = createWindowPoints(
    windowBuffers.extendedPositions,
    windowBuffers.extendedColors,
    "night-shift-windows-extended",
  );

  for (const mesh of [tower, braces, coreSkyline, extendedSkyline]) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    root.add(mesh);
  }
  root.add(coreWindows, extendedWindows);

  function applyQualityTier(knobs) {
    const fullCity = knobs.skyExtras !== false;
    extendedSkyline.visible = fullCity;
    extendedWindows.visible = fullCity;
  }

  const diagnostics = Object.freeze({
    seed: plan.seed,
    bandCounts: plan.bandCounts,
    lowBuildingCount: coreSpecs.length,
    fullBuildingCount: plan.buildings.length,
    lowWindowCount: windowBuffers.corePositions.length / 3,
    fullWindowCount: (windowBuffers.corePositions.length + windowBuffers.extendedPositions.length) / 3,
    structuralBeamCount: beams.length,
    deckBraceCount,
    facadeBandCount,
    lowDrawCalls: 4,
    fullDrawCalls: 6,
  });
  root.userData.nightShiftCity = diagnostics;

  return {
    extendedSkyline,
    extendedWindows,
    diagnostics,
    applyQualityTier,
    dispose() {
      root.remove(tower, braces, coreSkyline, extendedSkyline, coreWindows, extendedWindows);
      unitBox.dispose();
      coreWindows.geometry.dispose();
      extendedWindows.geometry.dispose();
      coreWindows.material.dispose();
      extendedWindows.material.dispose();
      delete root.userData.nightShiftCity;
    },
  };
}

/**
 * Adds no-post-process atmosphere: distance fog, a moon landmark, and a restrained warm glow
 * below the tower. The glow is tier-gated; moon and fog preserve the level identity on Low.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Group} root
 */
export function createNightShiftAtmosphere(scene, root) {
  const previousFog = scene.fog;
  scene.fog = new THREE.FogExp2(0x070d19, 0.0018);

  const moonGeometry = new THREE.SphereGeometry(12, 24, 12);
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xc7d7ff, fog: false });
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.name = "night-shift-moon";
  moon.position.set(-82, 54, -235);

  const glowGeometry = new THREE.CircleGeometry(430, 48);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x7a2849,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const cityGlow = new THREE.Mesh(glowGeometry, glowMaterial);
  cityGlow.name = "night-shift-city-glow";
  cityGlow.position.y = -101;
  cityGlow.rotation.x = -Math.PI / 2;
  root.add(moon, cityGlow);

  return {
    applyQualityTier(knobs) {
      cityGlow.visible = knobs.skyExtras !== false;
    },
    dispose() {
      scene.fog = previousFog;
      root.remove(moon, cityGlow);
      moonGeometry.dispose();
      glowGeometry.dispose();
      moonMaterial.dispose();
      glowMaterial.dispose();
    },
  };
}
