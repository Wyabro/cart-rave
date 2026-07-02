// testArena.js — flat open floor for driving tuning (test drive mode)

import * as THREE from "three";
import { RAPIER } from "../physics/rapierInstance.js";
import { createPhysicalMaterial } from "../scene.js";

const FLOOR_HALF = 28;
const FLOOR_THICKNESS = 0.4;
const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 0.5;
/** Muted overcast sky — readable, not blown out. */
export const TEST_ARENA_SKY = 0x586274;
export const TEST_ARENA_FOG_DENSITY = 0.0032;

/**
 * Minimal flat arena: soft daylight, grid floor, low boundary walls.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 */
export function initTestArena(scene, world, config) {
  const floorTopY = 0;
  const friction = config.cart?.friction ?? 1.1;
  const prevCenterHole = config.record.centerHole;
  config.record.centerHole = { enabled: false };

  const prevFog = scene.fog;
  const prevBackground = scene.background;
  scene.fog = new THREE.FogExp2(TEST_ARENA_SKY, TEST_ARENA_FOG_DENSITY);
  scene.background = new THREE.Color(TEST_ARENA_SKY);

  const hemi = new THREE.HemisphereLight(0xb8c4d4, 0x5a6472, 0.42);
  scene.add(hemi);

  const floorGeo = new THREE.PlaneGeometry(FLOOR_HALF * 2, FLOOR_HALF * 2);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = createPhysicalMaterial({
    color: 0x636e7c,
    metalness: 0.12,
    roughness: 0.58,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = floorTopY + 0.01;
  scene.add(floorMesh);

  const grid = new THREE.GridHelper(FLOOR_HALF * 2, 28, 0x4a5668, 0x727d8c);
  grid.position.y = floorTopY + 0.02;
  scene.add(grid);

  const floorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, floorTopY - FLOOR_THICKNESS / 2, 0),
  );
  const recordCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(FLOOR_HALF, FLOOR_THICKNESS / 2, FLOOR_HALF)
      .setFriction(friction)
      .setRestitution(0.08),
    floorBody,
  );

  const wallBodies = [];
  const wallHalfH = WALL_HEIGHT / 2;
  const wallCenterY = floorTopY + wallHalfH;
  const wallSpecs = [
    { x: 0, z: FLOOR_HALF + WALL_THICKNESS / 2, hx: FLOOR_HALF, hz: WALL_THICKNESS / 2 },
    { x: 0, z: -(FLOOR_HALF + WALL_THICKNESS / 2), hx: FLOOR_HALF, hz: WALL_THICKNESS / 2 },
    { x: FLOOR_HALF + WALL_THICKNESS / 2, z: 0, hx: WALL_THICKNESS / 2, hz: FLOOR_HALF },
    { x: -(FLOOR_HALF + WALL_THICKNESS / 2), z: 0, hx: WALL_THICKNESS / 2, hz: FLOOR_HALF },
  ];

  for (const spec of wallSpecs) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, wallCenterY, spec.z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(spec.hx, wallHalfH, spec.hz)
        .setFriction(0.6)
        .setRestitution(0.35),
      body,
    );
    wallBodies.push(body);
  }

  const sceneRoots = [floorMesh, grid, hemi];
  const ownedGeometries = [floorGeo];
  const ownedMaterials = [floorMat];

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function dispose() {
    config.record.centerHole = prevCenterHole;
    scene.fog = prevFog;
    scene.background = prevBackground;

    for (const root of sceneRoots) {
      scene.remove(root);
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (child.geometry && !ownedGeometries.includes(child.geometry)) {
          child.geometry.dispose();
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat && !ownedMaterials.includes(mat)) disposeMaterial(mat);
        });
      });
    }
    ownedGeometries.forEach((geo) => geo.dispose());
    ownedMaterials.forEach((mat) => disposeMaterial(mat));
    world.removeRigidBody(floorBody);
    for (const body of wallBodies) {
      world.removeRigidBody(body);
    }
  }

  return {
    recordMesh: floorMesh,
    recordCollider,
    pitWallColliderHandle: null,
    boothColliderHandles: [],
    boothNeonMeshes: [],
    spindleLight: null,
    spindleLightColorPink: null,
    spindleLightColorCyan: null,
    pitInnerRadius: 0,
    recordLabelMat: null,
    upgradeRecordReflector: null,
    aiHazards: null,
    update: () => {},
    dispose,
  };
}
