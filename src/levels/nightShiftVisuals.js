// nightShiftVisuals.js — deterministic, visual-only architecture for Night Shift.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const NIGHT_SHIFT_CITY_SEED = 0x4e534331;
export const NIGHT_SHIFT_MAST_BUILDING_ID = "near-7";
export const NIGHT_SHIFT_NEON_COLORS = Object.freeze({
  cyan: 0x36d8e8,
  violet: 0xa45cff,
  pink: 0xff3fa4,
  blue: 0x4aa8ff,
});
const NEON_KEYS = Object.freeze(Object.keys(NIGHT_SHIFT_NEON_COLORS));

const BAND_SPECS = Object.freeze([
  Object.freeze({ id: "near", count: 10, radiusMin: 94, radiusMax: 132, roofMin: -26, roofMax: -11, bottomY: -118, widthMin: 24, widthMax: 44, depthMin: 22, depthMax: 42 }),
  Object.freeze({ id: "mid", count: 18, radiusMin: 145, radiusMax: 230, roofMin: -54, roofMax: -28, bottomY: -134, widthMin: 23, widthMax: 48, depthMin: 22, depthMax: 46 }),
  Object.freeze({ id: "far", count: 32, radiusMin: 250, radiusMax: 420, roofMin: -88, roofMax: -48, bottomY: -164, widthMin: 28, widthMax: 68, depthMin: 28, depthMax: 64 }),
]);

const LOW_MID_COUNT = 10;
const TOWER_BOTTOM_Y = -96;
const TOWER_HALF_SIZE = 36;
const FACADE_THICKNESS = 0.8;
const MAST_HEIGHT = 20;

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
      const silhouetteRoll = random();
      const silhouette = silhouetteRoll < 0.18 ? "slab" : silhouetteRoll < 0.76 ? "setback" : "crown";
      const neonRoll = random();
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
        silhouette,
        setbackScale: round3(0.58 + random() * 0.2),
        setbackRatio: round3(0.55 + random() * 0.18),
        crownHeight: silhouette === "crown" ? round3(3.5 + random() * 3) : 0,
        antennaHeight: silhouette === "crown" && random() < 0.62 ? round3(4 + random() * 6) : 0,
        neonAccent: neonRoll < 0.3
          ? NEON_KEYS[Math.floor(random() * NEON_KEYS.length)]
          : null,
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

/** @param {ReturnType<typeof createNightShiftCityPlan>["buildings"][number]} building */
function compileBuildingMasses(building) {
  const totalHeight = building.roofY - building.bottomY;
  if (building.silhouette === "slab") {
    return [{
      x: building.x,
      y: (building.roofY + building.bottomY) / 2,
      z: building.z,
      yaw: building.yaw,
      width: building.width,
      height: totalHeight,
      depth: building.depth,
    }];
  }

  const setbackY = building.bottomY + totalHeight * building.setbackRatio;
  const masses = [
    {
      x: building.x,
      y: (setbackY + building.bottomY) / 2,
      z: building.z,
      yaw: building.yaw,
      width: building.width,
      height: setbackY - building.bottomY,
      depth: building.depth,
    },
    {
      x: building.x,
      y: (building.roofY + setbackY) / 2,
      z: building.z,
      yaw: building.yaw,
      width: building.width * building.setbackScale,
      height: building.roofY - setbackY,
      depth: building.depth * building.setbackScale,
    },
  ];

  if (building.silhouette === "crown") {
    masses.push({
      x: building.x,
      y: building.roofY + building.crownHeight / 2,
      z: building.z,
      yaw: building.yaw,
      width: building.width * building.setbackScale * 0.7,
      height: building.crownHeight,
      depth: building.depth * building.setbackScale * 0.7,
    });
    if (building.antennaHeight > 0) {
      masses.push({
        x: building.x,
        y: building.roofY + building.crownHeight + building.antennaHeight / 2,
        z: building.z,
        yaw: building.yaw,
        width: 0.65,
        height: building.antennaHeight,
        depth: 0.65,
      });
    }
  }
  return masses;
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
 * @param {Array<{ x: number, y: number, z: number, yaw?: number, width: number,
 *   height: number, depth: number, color: number }>} specs
 */
function writeColoredBoxInstances(mesh, specs) {
  writeBoxInstances(mesh, specs);
  const color = new THREE.Color();
  for (const [index, spec] of specs.entries()) {
    mesh.setColorAt(index, color.setHex(spec.color));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * @param {THREE.InstancedMesh} mesh
 * @param {Array<{ start: THREE.Vector3, end: THREE.Vector3, thickness: number,
 *   color?: number }>} beams
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
    if (beam.color != null) mesh.setColorAt(index, new THREE.Color(beam.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * Creates one low-sided cylinder between two local-space endpoints. The mast is a distant
 * silhouette, so six radial sides preserve the open lattice without spending close-up geometry.
 *
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @param {number} radius
 * @param {number} [radialSegments]
 */
function createBeamGeometry(start, end, radius, radialSegments = 6) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false);
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    midpoint,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  ));
  return geometry;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Vector3} position
 * @param {THREE.Quaternion} [quaternion]
 * @param {THREE.Vector3} [scale]
 */
function placeGeometry(
  geometry,
  position,
  quaternion = new THREE.Quaternion(),
  scale = new THREE.Vector3(1, 1, 1),
) {
  geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, scale));
  return geometry;
}

/** @param {THREE.BufferGeometry[]} parts */
function mergeOwnedGeometries(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Night Shift mast geometry merge failed");
  return merged;
}

/**
 * Adds one shrouded dish to paint geometry and keeps all parts attached to the same local pivot.
 * The source photograph establishes the thick shroud and feed arm; hidden rear hardware is a
 * deliberate stylized inference for the distant game prop.
 *
 * @param {THREE.BufferGeometry[]} parts
 * @param {THREE.Vector3} center
 * @param {number} radius
 * @param {number} depth
 * @param {THREE.Vector3} direction
 */
function addDishGeometry(parts, center, radius, depth, direction) {
  const axis = direction.clone().normalize();
  const cylinderRotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  const faceCenter = center.clone().addScaledVector(axis, -depth * 0.34);
  parts.push(placeGeometry(
    new THREE.CylinderGeometry(radius, radius, depth, 16, 1, true),
    center,
    cylinderRotation,
  ));
  parts.push(placeGeometry(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.14, 16, 1, false),
    faceCenter,
    cylinderRotation,
  ));
  parts.push(placeGeometry(
    new THREE.TorusGeometry(radius, Math.max(0.08, radius * 0.055), 6, 16),
    center.clone().addScaledVector(axis, depth * 0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis),
  ));
  const feedStart = faceCenter.clone().addScaledVector(axis, depth * 0.25);
  const feedEnd = faceCenter.clone().addScaledVector(axis, depth * 0.95);
  parts.push(createBeamGeometry(feedStart, feedEnd, Math.max(0.07, radius * 0.05), 6));
  parts.push(placeGeometry(
    new THREE.SphereGeometry(Math.max(0.12, radius * 0.09), 8, 5),
    feedEnd,
  ));
}

/**
 * Builds the reference-informed functional mast as four bounded draw-call groups on Low and one
 * extra detail group on Full. It never receives Rapier state and cannot add gameplay collision.
 *
 * @param {THREE.Group} root
 * @param {ReturnType<typeof createNightShiftCityPlan>} plan
 * @param {{ mastMetal: THREE.Material, antennaPaint: THREE.Material }} materials
 * @param {{ reducedMotion?: boolean }} [options]
 */
function createNightShiftTelecomMast(root, plan, materials, options = {}) {
  const anchor = plan.buildings.find((building) => building.id === NIGHT_SHIFT_MAST_BUILDING_ID);
  if (!anchor) throw new Error(`Night Shift mast anchor ${NIGHT_SHIFT_MAST_BUILDING_ID} is missing`);

  const mastRoot = new THREE.Group();
  mastRoot.name = "night-shift-telecom-mast";
  mastRoot.position.set(anchor.x, anchor.roofY + anchor.crownHeight, anchor.z);
  mastRoot.rotation.y = anchor.yaw;
  const reducedMotion = options.reducedMotion ?? (
    typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );

  const coreParts = [];
  const detailParts = [];
  const paintParts = [];
  coreParts.push(placeGeometry(
    new THREE.BoxGeometry(5.2, 0.42, 5.2),
    new THREE.Vector3(0, 0.21, 0),
  ));

  const levels = 5;
  const halfAt = (y) => THREE.MathUtils.lerp(2.05, 0.72, y / MAST_HEIGHT);
  const cornerSigns = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [signX, signZ] of cornerSigns) {
    coreParts.push(createBeamGeometry(
      new THREE.Vector3(signX * halfAt(0.35), 0.35, signZ * halfAt(0.35)),
      new THREE.Vector3(signX * halfAt(MAST_HEIGHT), MAST_HEIGHT, signZ * halfAt(MAST_HEIGHT)),
      0.16,
      6,
    ));
  }

  for (let level = 0; level <= levels; level += 1) {
    const y = 0.6 + level * ((MAST_HEIGHT - 0.9) / levels);
    const half = halfAt(y);
    const corners = [
      new THREE.Vector3(-half, y, -half),
      new THREE.Vector3(half, y, -half),
      new THREE.Vector3(half, y, half),
      new THREE.Vector3(-half, y, half),
    ];
    for (let side = 0; side < 4; side += 1) {
      coreParts.push(createBeamGeometry(corners[side], corners[(side + 1) % 4], 0.11, 6));
    }
  }

  for (let level = 0; level < levels; level += 1) {
    const y0 = 0.6 + level * ((MAST_HEIGHT - 0.9) / levels);
    const y1 = 0.6 + (level + 1) * ((MAST_HEIGHT - 0.9) / levels);
    const h0 = halfAt(y0);
    const h1 = halfAt(y1);
    const faces = [
      [new THREE.Vector3(-h0, y0, h0), new THREE.Vector3(h1, y1, h1), new THREE.Vector3(h0, y0, h0), new THREE.Vector3(-h1, y1, h1)],
      [new THREE.Vector3(-h0, y0, -h0), new THREE.Vector3(h1, y1, -h1), new THREE.Vector3(h0, y0, -h0), new THREE.Vector3(-h1, y1, -h1)],
      [new THREE.Vector3(h0, y0, -h0), new THREE.Vector3(h1, y1, h1), new THREE.Vector3(h0, y0, h0), new THREE.Vector3(h1, y1, -h1)],
      [new THREE.Vector3(-h0, y0, -h0), new THREE.Vector3(-h1, y1, h1), new THREE.Vector3(-h0, y0, h0), new THREE.Vector3(-h1, y1, -h1)],
    ];
    for (const [startA, endA, startB, endB] of faces) {
      coreParts.push(createBeamGeometry(startA, endA, 0.085, 5));
      detailParts.push(createBeamGeometry(startB, endB, 0.07, 5));
    }
  }

  const ladderX = -0.58;
  detailParts.push(
    createBeamGeometry(new THREE.Vector3(ladderX - 0.24, 1, -1.36), new THREE.Vector3(ladderX - 0.24, 15.8, -0.7), 0.055, 5),
    createBeamGeometry(new THREE.Vector3(ladderX + 0.24, 1, -1.36), new THREE.Vector3(ladderX + 0.24, 15.8, -0.7), 0.055, 5),
  );
  for (let rung = 0; rung < 14; rung += 1) {
    const y = 1.35 + rung * 1.02;
    const z = THREE.MathUtils.lerp(-1.34, -0.72, y / 15.8);
    detailParts.push(createBeamGeometry(
      new THREE.Vector3(ladderX - 0.25, y, z),
      new THREE.Vector3(ladderX + 0.25, y, z),
      0.045,
      5,
    ));
  }

  detailParts.push(placeGeometry(
    new THREE.BoxGeometry(1.45, 1.9, 0.9),
    new THREE.Vector3(-1.55, 1.18, 1.15),
  ));
  detailParts.push(placeGeometry(
    new THREE.BoxGeometry(1.15, 0.055, 0.66),
    new THREE.Vector3(-1.55, 1.18, 1.61),
  ));

  const panelGeometry = new THREE.BoxGeometry(0.46, 3.4, 1.02);
  for (let index = 0; index < 3; index += 1) {
    const angle = index * (Math.PI * 2 / 3);
    const position = new THREE.Vector3(Math.cos(angle) * 1.85, 17.2, Math.sin(angle) * 1.85);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -angle, 0));
    paintParts.push(placeGeometry(panelGeometry.clone(), position, rotation));
    detailParts.push(createBeamGeometry(
      new THREE.Vector3(Math.cos(angle) * 0.65, 17.2, Math.sin(angle) * 0.65),
      position.clone().multiplyScalar(0.92).setY(17.2),
      0.08,
      5,
    ));
  }
  panelGeometry.dispose();

  addDishGeometry(
    paintParts,
    new THREE.Vector3(-1.55, 13.4, 0.7),
    1.75,
    0.72,
    new THREE.Vector3(-0.82, 0.08, 0.56),
  );

  coreParts.push(
    placeGeometry(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8), new THREE.Vector3(-0.52, 20.18, 0)),
    placeGeometry(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8), new THREE.Vector3(0.52, 20.18, 0)),
    placeGeometry(new THREE.CylinderGeometry(0.045, 0.07, 2.7, 6), new THREE.Vector3(0, 21.25, 0)),
  );

  const coreGeometry = mergeOwnedGeometries(coreParts);
  const detailGeometry = mergeOwnedGeometries(detailParts);
  const paintGeometry = mergeOwnedGeometries(paintParts);
  const mastCore = new THREE.Mesh(coreGeometry, materials.mastMetal);
  mastCore.name = "night-shift-mast-core";
  const mastDetail = new THREE.Mesh(detailGeometry, materials.mastMetal);
  mastDetail.name = "night-shift-mast-detail";
  const staticAntennas = new THREE.Mesh(paintGeometry, materials.antennaPaint);
  staticAntennas.name = "night-shift-mast-static-antennas";

  const dishPivot = new THREE.Group();
  dishPivot.name = "night-shift-mast-dish-pivot";
  dishPivot.position.set(0.95, 10.7, 0.1);
  const dishBaseYaw = 0.42;
  dishPivot.rotation.y = dishBaseYaw;
  const movingDishParts = [];
  addDishGeometry(
    movingDishParts,
    new THREE.Vector3(1.4, 0, 0),
    2.15,
    0.82,
    new THREE.Vector3(0.92, 0.06, 0.38),
  );
  movingDishParts.push(createBeamGeometry(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1.3, 0, 0),
    0.13,
    6,
  ));
  const movingDish = new THREE.Mesh(mergeOwnedGeometries(movingDishParts), materials.antennaPaint);
  movingDish.name = "night-shift-mast-moving-dish";
  dishPivot.add(movingDish);

  const beaconGeometry = new THREE.SphereGeometry(0.28, 8, 5);
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    fog: false,
    toneMapped: false,
  });
  const beacons = new THREE.InstancedMesh(beaconGeometry, beaconMaterial, 2);
  beacons.name = "night-shift-mast-beacons";
  const beaconMatrix = new THREE.Matrix4();
  const beaconColor = new THREE.Color();
  for (const [index, x] of [-0.52, 0.52].entries()) {
    beaconMatrix.makeTranslation(x, 20.55, 0);
    beacons.setMatrixAt(index, beaconMatrix);
    beacons.setColorAt(index, beaconColor.setRGB(1, 0.09, 0.24));
  }
  beacons.instanceMatrix.needsUpdate = true;
  if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;

  for (const object of [mastCore, mastDetail, staticAntennas, movingDish, beacons]) {
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
  }
  mastRoot.add(mastCore, mastDetail, staticAntennas, dishPivot, beacons);
  root.add(mastRoot);

  const triangleCount = (geometry) => (
    geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3
  );
  const lowTriangles = triangleCount(coreGeometry)
    + triangleCount(paintGeometry)
    + triangleCount(movingDish.geometry)
    + triangleCount(beaconGeometry) * 2;
  const fullTriangles = lowTriangles + triangleCount(detailGeometry);

  return {
    root: mastRoot,
    detail: mastDetail,
    dishPivot,
    beacons,
    diagnostics: Object.freeze({
      anchorBuildingId: anchor.id,
      anchorRoofY: anchor.roofY + anchor.crownHeight,
      localHeight: MAST_HEIGHT,
      lowDrawCalls: 4,
      fullDrawCalls: 5,
      lowTriangles,
      fullTriangles,
      hasGameplayCollider: false,
      reducedMotion,
    }),
    applyQualityTier(knobs) {
      mastDetail.visible = knobs.skyExtras !== false;
    },
    update(timeMs) {
      if (reducedMotion) return;
      dishPivot.rotation.y = dishBaseYaw + (timeMs * 0.000035) % (Math.PI * 2);
      for (let index = 0; index < 2; index += 1) {
        const wave = 0.5 + 0.5 * Math.sin(timeMs * 0.0017 + index * 2.35);
        const intensity = 0.22 + 0.78 * wave ** 6;
        beacons.setColorAt(
          index,
          beaconColor.setRGB(intensity, intensity * 0.09, intensity * 0.24),
        );
      }
      if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
    },
    dispose() {
      root.remove(mastRoot);
      coreGeometry.dispose();
      detailGeometry.dispose();
      paintGeometry.dispose();
      movingDish.geometry.dispose();
      beaconGeometry.dispose();
      beaconMaterial.dispose();
    },
  };
}

/** @param {THREE.BufferGeometry} geometry @param {number} hex */
function colorGeometry(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Adds two Full-only dressing batches. Anything on the driveable roof is effectively flush;
 * solid tool props live on the unreachable mast tower, and conduit stays below the roof edge.
 *
 * @param {THREE.Group} root
 * @param {ReturnType<typeof createNightShiftCityPlan>} plan
 * @param {{ roofDressing: THREE.Material, roofWet: THREE.Material }} materials
 */
function createNightShiftRoofDressing(root, plan, materials) {
  const solidParts = [];
  const wetParts = [];
  const addSolid = (geometry, position, color, rotation = new THREE.Quaternion()) => {
    solidParts.push(colorGeometry(placeGeometry(geometry, position, rotation), color));
  };

  const markings = [
    { x: 0, z: 31.7, width: 14, depth: 0.62, color: 0xe49934 },
    { x: 0, z: -31.7, width: 14, depth: 0.62, color: NIGHT_SHIFT_NEON_COLORS.cyan },
    { x: 31.7, z: 0, width: 0.62, depth: 14, color: NIGHT_SHIFT_NEON_COLORS.violet },
    { x: -31.7, z: 0, width: 0.62, depth: 14, color: NIGHT_SHIFT_NEON_COLORS.pink },
  ];
  for (const marking of markings) {
    addSolid(
      new THREE.BoxGeometry(marking.width, 0.025, marking.depth),
      new THREE.Vector3(marking.x, 0.014, marking.z),
      marking.color,
    );
  }

  const servicePlates = [
    { x: -7.28, z: 0, yaw: 0, color: 0xe49934 },
    { x: 7.28, z: 0, yaw: 0, color: 0xe49934 },
    { x: 0, z: 8.28, yaw: Math.PI / 2, color: NIGHT_SHIFT_NEON_COLORS.pink },
    { x: 0, z: -8.28, yaw: Math.PI / 2, color: NIGHT_SHIFT_NEON_COLORS.violet },
  ];
  for (const plate of servicePlates) {
    addSolid(
      new THREE.BoxGeometry(0.72, 0.035, 1.15),
      new THREE.Vector3(plate.x, 0.02, plate.z),
      plate.color,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, plate.yaw, 0)),
    );
  }

  const flushProps = [
    { x: -28.4, z: 16.2, width: 4.4, depth: 2.7, yaw: 0.18, color: 0x247995 },
    { x: 27.7, z: -18.5, width: 4.8, depth: 2.5, yaw: -0.24, color: 0x6f4ca2 },
    { x: -29.8, z: -24.4, width: 1.8, depth: 0.9, yaw: 0.08, color: 0x344b5b },
    { x: 29.4, z: 24.8, width: 1.6, depth: 1.05, yaw: -0.12, color: 0x344b5b },
  ];
  for (const prop of flushProps) {
    addSolid(
      new THREE.BoxGeometry(prop.width, 0.028, prop.depth),
      new THREE.Vector3(prop.x, 0.016, prop.z),
      prop.color,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, prop.yaw, 0)),
    );
  }

  for (const side of [-1, 1]) {
    solidParts.push(colorGeometry(createBeamGeometry(
      new THREE.Vector3(-24, -0.24, side * 35.86),
      new THREE.Vector3(24, -0.24, side * 35.86),
      0.09,
      6,
    ), 0x4b7180));
    solidParts.push(colorGeometry(createBeamGeometry(
      new THREE.Vector3(side * 35.86, -0.24, -24),
      new THREE.Vector3(side * 35.86, -0.24, 24),
      0.09,
      6,
    ), 0x4b7180));
  }

  const anchor = plan.buildings.find((building) => building.id === NIGHT_SHIFT_MAST_BUILDING_ID);
  if (anchor) {
    const roofY = anchor.roofY + anchor.crownHeight;
    addSolid(
      new THREE.BoxGeometry(2.25, 0.9, 1.25),
      new THREE.Vector3(anchor.x + 4.2, roofY + 0.45, anchor.z - 1.8),
      0xd48335,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, anchor.yaw + 0.18, 0)),
    );
    addSolid(
      new THREE.TorusGeometry(1.05, 0.11, 6, 18),
      new THREE.Vector3(anchor.x - 4.1, roofY + 0.14, anchor.z + 1.8),
      0x4b7180,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, anchor.yaw)),
    );
  }

  const horizontal = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const puddles = [
    { x: -27.5, z: -14.8, width: 3.8, depth: 2.1 },
    { x: 26.8, z: 15.5, width: 3.2, depth: 1.8 },
    { x: -18.5, z: 28.8, width: 2.7, depth: 1.5 },
    { x: 20.5, z: -28.4, width: 3.4, depth: 1.7 },
  ];
  for (const puddle of puddles) {
    wetParts.push(placeGeometry(
      new THREE.CircleGeometry(1, 14),
      new THREE.Vector3(puddle.x, 0.032, puddle.z),
      horizontal,
      new THREE.Vector3(puddle.width, puddle.depth, 1),
    ));
  }

  const solidGeometry = mergeOwnedGeometries(solidParts);
  const wetGeometry = mergeOwnedGeometries(wetParts);
  const solid = new THREE.Mesh(solidGeometry, materials.roofDressing);
  solid.name = "night-shift-roof-dressing-solid";
  const wet = new THREE.Mesh(wetGeometry, materials.roofWet);
  wet.name = "night-shift-roof-dressing-wet";
  for (const mesh of [solid, wet]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    root.add(mesh);
  }

  const triangleCount = (geometry) => (
    geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3
  );
  const diagnostics = Object.freeze({
    fullDrawCalls: 2,
    fullTriangles: triangleCount(solidGeometry) + triangleCount(wetGeometry),
    flushPlayablePartCount: markings.length + servicePlates.length + flushProps.length + puddles.length,
    unreachableSolidPropCount: anchor ? 2 : 0,
    hasGameplayCollider: false,
  });

  return {
    solid,
    wet,
    diagnostics,
    applyQualityTier(knobs) {
      const visible = knobs.skyExtras !== false;
      solid.visible = visible;
      wet.visible = visible;
    },
    dispose() {
      root.remove(solid, wet);
      solidGeometry.dispose();
      wetGeometry.dispose();
    },
  };
}

/**
 * Returns the rotated building face that looks most directly toward the arena. Width and
 * normal offset come from the active lower or setback mass, so facade details stay attached.
 *
 * @param {ReturnType<typeof createNightShiftCityPlan>["buildings"][number]} building
 * @param {number} y
 * @param {number} surfaceOffset
 */
function getInwardFacadeFrame(building, y, surfaceOffset) {
  const totalHeight = building.roofY - building.bottomY;
  const setbackY = building.bottomY + totalHeight * building.setbackRatio;
  const massScale = building.silhouette !== "slab" && y >= setbackY
    ? building.setbackScale
    : 1;
  const halfWidth = building.width * massScale * 0.5;
  const halfDepth = building.depth * massScale * 0.5;
  const cos = Math.cos(building.yaw);
  const sin = Math.sin(building.yaw);
  const localX = { x: cos, z: -sin };
  const localZ = { x: sin, z: cos };
  const radius = Math.hypot(building.x, building.z) || 1;
  const inwardX = -building.x / radius;
  const inwardZ = -building.z / radius;
  const faces = [
    { normalX: localX.x, normalZ: localX.z, tangentX: localZ.x, tangentZ: localZ.z, halfNormal: halfWidth, faceWidth: halfDepth * 2 },
    { normalX: -localX.x, normalZ: -localX.z, tangentX: localZ.x, tangentZ: localZ.z, halfNormal: halfWidth, faceWidth: halfDepth * 2 },
    { normalX: localZ.x, normalZ: localZ.z, tangentX: localX.x, tangentZ: localX.z, halfNormal: halfDepth, faceWidth: halfWidth * 2 },
    { normalX: -localZ.x, normalZ: -localZ.z, tangentX: localX.x, tangentZ: localX.z, halfNormal: halfDepth, faceWidth: halfWidth * 2 },
  ];
  let face = faces[0];
  let bestDot = -Infinity;
  for (const candidate of faces) {
    const dot = candidate.normalX * inwardX + candidate.normalZ * inwardZ;
    if (dot > bestDot) {
      face = candidate;
      bestDot = dot;
    }
  }
  return {
    ...face,
    x: building.x + face.normalX * (face.halfNormal + surfaceOffset),
    z: building.z + face.normalZ * (face.halfNormal + surfaceOffset),
  };
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
    const rows = Math.max(2, Math.floor((building.roofY - building.bottomY) / 8));

    for (let row = 1; row < rows; row += 1) {
      const rowY = building.bottomY + row * 8;
      const rowFacade = getInwardFacadeFrame(building, rowY, 0.12);
      const columns = Math.max(2, Math.floor(rowFacade.faceWidth / 7));
      for (let column = 0; column < columns; column += 1) {
        if (random() > 0.56) continue;
        const y = rowY + (random() - 0.5) * 0.7;
        const facade = getInwardFacadeFrame(building, y, 0.12);
        const across = ((column + 0.5) / columns - 0.5) * facade.faceWidth * 0.78;
        positions.push(
          facade.x + facade.tangentX * across,
          y,
          facade.z + facade.tangentZ * across,
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

/** @param {ReturnType<typeof createNightShiftCityPlan>} plan */
function buildNeonSignSpecs(plan) {
  const core = [];
  const extended = [];
  for (const [index, building] of plan.buildings.entries()) {
    if (!building.neonAccent) continue;
    const totalHeight = building.roofY - building.bottomY;
    const y = building.bottomY + totalHeight * (0.66 + (index % 3) * 0.08);
    const facade = getInwardFacadeFrame(building, y, 0.2);
    const spec = {
      x: facade.x,
      y,
      z: facade.z,
      yaw: Math.atan2(facade.normalX, facade.normalZ),
      width: Math.min(16, facade.faceWidth * 0.48),
      height: 2.1 + (index % 2) * 1.1,
      depth: 0.38,
      color: NIGHT_SHIFT_NEON_COLORS[building.neonAccent],
    };
    (building.detail === "core" ? core : extended).push(spec);
  }
  return { core, extended };
}

/**
 * Builds exposed facade faces, corner-deck braces, and three batched skyline depth bands.
 * This module never receives Rapier's world, so it cannot change gameplay collision.
 *
 * @param {THREE.Group} root
 * @param {ReturnType<typeof createNightShiftCityPlan>} plan
 * @param {ReturnType<import("./rooftop.js").getNightShiftSpawnPlatforms>} spawnPlatforms
 * @param {{ tower: THREE.Material, brace: THREE.Material,
 *   skylineCore: THREE.Material, skylineExtended: THREE.Material,
 *   mastMetal: THREE.Material, antennaPaint: THREE.Material,
 *   roofDressing: THREE.Material, roofWet: THREE.Material }} materials
 * @param {{ reducedMotion?: boolean }} [options]
 */
export function createNightShiftCityArchitecture(root, plan, spawnPlatforms, materials, options = {}) {
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
        color: NIGHT_SHIFT_NEON_COLORS.blue,
      },
      {
        start: new THREE.Vector3(platform.x, undersideY, platform.z - signZ * 2.1),
        end: new THREE.Vector3(platform.x, -5.5, signZ * (TOWER_HALF_SIZE - 0.35)),
        thickness: 0.42,
        color: NIGHT_SHIFT_NEON_COLORS.blue,
      },
      {
        start: new THREE.Vector3(platform.x, undersideY - 0.1, platform.z),
        end: new THREE.Vector3(
          signX * (TOWER_HALF_SIZE - 0.35),
          -8.5,
          signZ * (TOWER_HALF_SIZE - 0.35),
        ),
        thickness: 0.5,
        color: NIGHT_SHIFT_NEON_COLORS.cyan,
      },
    );
  }
  const deckBraceCount = beams.length - deckBraceStart;

  // Horizontal floor plates and vertical corner columns break the tower shell into readable
  // construction layers. Every beam stays outside or below the driveable roof plane.
  const facadeBandStart = beams.length;
  for (let bandIndex = 0, y = -8; y >= -92; bandIndex += 1, y -= 12) {
    const bandColor = bandIndex % 4 === 2
      ? NIGHT_SHIFT_NEON_COLORS.violet
      : NIGHT_SHIFT_NEON_COLORS.cyan;
    beams.push(
      { start: new THREE.Vector3(-35.7, y, 36.45), end: new THREE.Vector3(35.7, y, 36.45), thickness: 0.34, color: bandColor },
      { start: new THREE.Vector3(-35.7, y, -36.45), end: new THREE.Vector3(35.7, y, -36.45), thickness: 0.34, color: bandColor },
      { start: new THREE.Vector3(36.45, y, -35.7), end: new THREE.Vector3(36.45, y, 35.7), thickness: 0.34, color: bandColor },
      { start: new THREE.Vector3(-36.45, y, -35.7), end: new THREE.Vector3(-36.45, y, 35.7), thickness: 0.34, color: bandColor },
    );
  }
  const facadeBandCount = beams.length - facadeBandStart;

  for (const x of [-36.45, 36.45]) {
    for (const z of [-36.45, 36.45]) {
      beams.push({
        start: new THREE.Vector3(x, -95, z),
        end: new THREE.Vector3(x, -0.3, z),
        thickness: 0.58,
        color: NIGHT_SHIFT_NEON_COLORS.blue,
      });
    }
  }
  beams.push(
    { start: new THREE.Vector3(-36, -0.2, 36.35), end: new THREE.Vector3(36, -0.2, 36.35), thickness: 0.36, color: NIGHT_SHIFT_NEON_COLORS.cyan },
    { start: new THREE.Vector3(-36, -0.2, -36.35), end: new THREE.Vector3(36, -0.2, -36.35), thickness: 0.36, color: NIGHT_SHIFT_NEON_COLORS.cyan },
    { start: new THREE.Vector3(36.35, -0.2, -36), end: new THREE.Vector3(36.35, -0.2, 36), thickness: 0.36, color: NIGHT_SHIFT_NEON_COLORS.cyan },
    { start: new THREE.Vector3(-36.35, -0.2, -36), end: new THREE.Vector3(-36.35, -0.2, 36), thickness: 0.36, color: NIGHT_SHIFT_NEON_COLORS.cyan },
  );
  const braces = new THREE.InstancedMesh(unitBox, materials.brace, beams.length);
  braces.name = "night-shift-tower-structure";
  writeBeamInstances(braces, beams);

  const coreSpecs = [];
  const extendedSpecs = [];
  for (const building of plan.buildings) {
    (building.detail === "core" ? coreSpecs : extendedSpecs)
      .push(...compileBuildingMasses(building));
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

  const neonSignSpecs = buildNeonSignSpecs(plan);
  const neonMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
    toneMapped: false,
  });
  const coreNeon = new THREE.InstancedMesh(unitBox, neonMaterial, neonSignSpecs.core.length);
  coreNeon.name = "night-shift-neon-core";
  writeColoredBoxInstances(coreNeon, neonSignSpecs.core);
  const extendedNeon = new THREE.InstancedMesh(unitBox, neonMaterial, neonSignSpecs.extended.length);
  extendedNeon.name = "night-shift-neon-extended";
  writeColoredBoxInstances(extendedNeon, neonSignSpecs.extended);

  for (const mesh of [tower, braces, coreSkyline, extendedSkyline]) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    root.add(mesh);
  }
  root.add(coreWindows, extendedWindows, coreNeon, extendedNeon);
  const telecomMast = createNightShiftTelecomMast(root, plan, materials, options);
  const roofDressing = createNightShiftRoofDressing(root, plan, materials);

  function applyQualityTier(knobs) {
    const fullCity = knobs.skyExtras !== false;
    extendedSkyline.visible = fullCity;
    extendedWindows.visible = fullCity;
    extendedNeon.visible = fullCity;
    telecomMast.applyQualityTier(knobs);
    roofDressing.applyQualityTier(knobs);
  }

  const diagnostics = Object.freeze({
    seed: plan.seed,
    bandCounts: plan.bandCounts,
    lowBuildingCount: coreSpecs.length,
    fullBuildingCount: coreSpecs.length + extendedSpecs.length,
    lowTowerCount: plan.lowBuildingCount,
    fullTowerCount: plan.buildings.length,
    lowWindowCount: windowBuffers.corePositions.length / 3,
    fullWindowCount: (windowBuffers.corePositions.length + windowBuffers.extendedPositions.length) / 3,
    lowNeonSignCount: neonSignSpecs.core.length,
    fullNeonSignCount: neonSignSpecs.core.length + neonSignSpecs.extended.length,
    structuralBeamCount: beams.length,
    deckBraceCount,
    facadeBandCount,
    lowDrawCalls: 5 + telecomMast.diagnostics.lowDrawCalls,
    fullDrawCalls: 8 + telecomMast.diagnostics.fullDrawCalls + roofDressing.diagnostics.fullDrawCalls,
    telecomMast: telecomMast.diagnostics,
    roofDressing: roofDressing.diagnostics,
  });
  root.userData.nightShiftCity = diagnostics;

  return {
    extendedSkyline,
    extendedWindows,
    extendedNeon,
    telecomMast,
    roofDressing,
    diagnostics,
    applyQualityTier,
    update(timeMs) {
      telecomMast.update(timeMs);
    },
    dispose() {
      telecomMast.dispose();
      roofDressing.dispose();
      root.remove(
        tower,
        braces,
        coreSkyline,
        extendedSkyline,
        coreWindows,
        extendedWindows,
        coreNeon,
        extendedNeon,
      );
      unitBox.dispose();
      coreWindows.geometry.dispose();
      extendedWindows.geometry.dispose();
      coreWindows.material.dispose();
      extendedWindows.material.dispose();
      neonMaterial.dispose();
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
