// rooftop.js — Night Shift blockout: a high-rise rooftop cross with four open voids.

import * as THREE from "three";
import { RAPIER } from "../physics/rapierInstance.js";
import { createPhysicalMaterial } from "../scene.js";

const FLOOR_TOP_Y = 0;
const FLOOR_THICKNESS = 0.6;
const ARM_HALF_LENGTH = 36;
const ARM_HALF_WIDTH = 10;
const GAP_CENTER = 23;
const GAP_HALF = 12.4;
const HIGH_ROOF_TOP_Y = 3.4;
const HIGH_ROOF_SIZE = 12;

/**
 * Blockout dimensions stay data-only so the geometry, Rapier colliders, AI-safe voids, and
 * focused tests share one layout. The elevated roofs stay on the north/south arms, outside the
 * corner-void contract. They become AC-launch landing targets in a later card.
 */
export const NIGHT_SHIFT_BLOCKOUT_LAYOUT = Object.freeze({
  mainRoofs: Object.freeze([
    Object.freeze({ x: 0, z: 0, width: ARM_HALF_LENGTH * 2, depth: ARM_HALF_WIDTH * 2 }),
    Object.freeze({ x: 0, z: 23, width: ARM_HALF_WIDTH * 2, depth: 26 }),
    Object.freeze({ x: 0, z: -23, width: ARM_HALF_WIDTH * 2, depth: 26 }),
  ]),
  cornerVoids: Object.freeze([
    Object.freeze({ x: GAP_CENTER, z: GAP_CENTER }),
    Object.freeze({ x: -GAP_CENTER, z: GAP_CENTER }),
    Object.freeze({ x: GAP_CENTER, z: -GAP_CENTER }),
    Object.freeze({ x: -GAP_CENTER, z: -GAP_CENTER }),
  ]),
  highRoofs: Object.freeze([
    Object.freeze({ x: 0, z: 18 }),
    Object.freeze({ x: 0, z: -18 }),
  ]),
  inactiveVentMarkers: Object.freeze([
    Object.freeze({ x: -5, z: 0 }),
    Object.freeze({ x: 5, z: 0 }),
    Object.freeze({ x: 0, z: 6 }),
  ]),
});

/**
 * Reuses the established square-void AI contract only for this blockout. Omitting
 * `suctionBand` retains the gentle existing lip assist, so this card cannot silently inherit
 * Storerooms' pull-to-death behavior.
 *
 * @returns {{ squareHoles: { x: number, z: number }[], half: number, holeCenter: number,
 *   arenaHalf: number, avoidMargin: number, influenceBand: number }}
 */
export function getNightShiftBlockoutHazards() {
  return {
    squareHoles: NIGHT_SHIFT_BLOCKOUT_LAYOUT.cornerVoids.map(({ x, z }) => ({ x, z })),
    half: GAP_HALF,
    holeCenter: GAP_CENTER,
    arenaHalf: ARM_HALF_LENGTH,
    avoidMargin: 1.8,
    influenceBand: 1.2,
  };
}

/** @param {THREE.Material | THREE.Material[]} material */
function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material?.dispose?.();
}

/**
 * @param {THREE.Group} root
 * @param {import("@dimforge/rapier3d").World} world
 * @param {{ x: number, y: number, z: number, width: number, height: number, depth: number }} spec
 * @param {THREE.Material} material
 * @param {THREE.BufferGeometry[]} ownedGeometries
 * @param {THREE.Material[]} ownedMaterials
 * @param {any[]} bodies
 * @param {number[]} handles
 */
function addBox(root, world, spec, material, ownedGeometries, ownedMaterials, bodies, handles) {
  const geometry = new THREE.BoxGeometry(spec.width, spec.height, spec.depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(spec.x, spec.y, spec.z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  root.add(mesh);
  ownedGeometries.push(geometry);
  if (!ownedMaterials.includes(material)) ownedMaterials.push(material);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y, spec.z),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.width / 2, spec.height / 2, spec.depth / 2)
      .setFriction(0.82)
      .setRestitution(0.08),
    body,
  );
  bodies.push(body);
  handles.push(collider.handle);
  return mesh;
}

/**
 * Night Shift blockout. The visible cross creates four lethal corner voids, while two high
 * roofs test the vertical camera envelope. The three yellow pads are inactive AC placeholders;
 * they have no colliders or gameplay effect until NIGHT-SHIFT-VENT-1.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 */
export function initRooftop(scene, world, config) {
  const root = new THREE.Group();
  root.name = "night-shift-blockout";
  scene.add(root);

  const previousCenterHole = config.record.centerHole;
  const previousBackground = scene.background;
  config.record.centerHole = { enabled: false };
  scene.background = new THREE.Color(0x07111f);

  const roofMaterial = createPhysicalMaterial({ color: 0x263142, metalness: 0.2, roughness: 0.78 });
  const highRoofMaterial = createPhysicalMaterial({ color: 0x41506a, metalness: 0.18, roughness: 0.72 });
  const parapetMaterial = createPhysicalMaterial({ color: 0x1a202b, metalness: 0.38, roughness: 0.55 });
  const ventMarkerMaterial = createPhysicalMaterial({ color: 0xd38e28, metalness: 0.2, roughness: 0.6, emissive: 0x2e1600 });
  const ownedGeometries = [];
  const ownedMaterials = [ventMarkerMaterial];
  const bodies = [];
  const recordColliderHandles = [];
  const edgeColliderHandles = [];

  const moonHemi = new THREE.HemisphereLight(0x91b9ff, 0x101522, 1.2);
  const roofKey = new THREE.DirectionalLight(0x8ca8ff, 1.6);
  roofKey.position.set(-20, 32, 18);
  root.add(moonHemi, roofKey);

  for (const roof of NIGHT_SHIFT_BLOCKOUT_LAYOUT.mainRoofs) {
    addBox(root, world, {
      ...roof,
      y: FLOOR_TOP_Y - FLOOR_THICKNESS / 2,
      height: FLOOR_THICKNESS,
    }, roofMaterial, ownedGeometries, ownedMaterials, bodies, recordColliderHandles);
  }

  for (const roof of NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs) {
    addBox(root, world, {
      x: roof.x,
      y: HIGH_ROOF_TOP_Y - FLOOR_THICKNESS / 2,
      z: roof.z,
      width: HIGH_ROOF_SIZE,
      height: FLOOR_THICKNESS,
      depth: HIGH_ROOF_SIZE,
    }, highRoofMaterial, ownedGeometries, ownedMaterials, bodies, recordColliderHandles);
  }

  // Spawn-side baffles prevent an immediate backward fall while keeping the long edges exposed.
  const parapets = [
    { x: 35.7, z: 0, width: 0.6, depth: 8 },
    { x: -35.7, z: 0, width: 0.6, depth: 8 },
    { x: 0, z: 35.7, width: 8, depth: 0.6 },
    { x: 0, z: -35.7, width: 8, depth: 0.6 },
  ];
  for (const parapet of parapets) {
    addBox(root, world, {
      ...parapet,
      y: 0.65,
      height: 1.3,
    }, parapetMaterial, ownedGeometries, ownedMaterials, bodies, edgeColliderHandles);
  }

  for (const marker of NIGHT_SHIFT_BLOCKOUT_LAYOUT.inactiveVentMarkers) {
    const geometry = new THREE.BoxGeometry(4.2, 0.12, 4.2);
    const mesh = new THREE.Mesh(geometry, ventMarkerMaterial);
    mesh.position.set(marker.x, 0.07, marker.z);
    mesh.name = "night-shift-inactive-vent-marker";
    root.add(mesh);
    ownedGeometries.push(geometry);
  }

  function dispose() {
    scene.remove(root);
    config.record.centerHole = previousCenterHole;
    scene.background = previousBackground;
    for (const body of bodies) {
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
    }
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach(disposeMaterial);
  }

  return {
    recordMesh: root,
    recordCollider: null,
    recordColliderHandles,
    pitWallColliderHandle: edgeColliderHandles[0] ?? null,
    boothColliderHandles: edgeColliderHandles,
    boothNeonMeshes: [],
    spindleLight: null,
    spindleLightColorPink: null,
    spindleLightColorCyan: null,
    pitInnerRadius: 0,
    recordLabelMat: null,
    upgradeRecordReflector: null,
    aiHazards: getNightShiftBlockoutHazards(),
    update: () => {},
    dispose,
  };
}
