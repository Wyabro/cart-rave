// rooftop.js — Night Shift blockout: a square high-rise roof with corner spawn decks.

import * as THREE from "three";
import { RAPIER } from "../physics/rapierInstance.js";
import { computeSpawnAngleForSlot } from "../config.js";
import { createPhysicalMaterial } from "../scene.js";
import {
  createNightShiftAtmosphere,
  createNightShiftCityArchitecture,
  createNightShiftCityPlan,
} from "./nightShiftVisuals.js";
import { createNightShiftMaterialBundle } from "./nightShiftMaterials.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";

const FLOOR_TOP_Y = 0;
const FLOOR_THICKNESS = 0.6;
const ARM_HALF_LENGTH = 36;
const HIGH_ROOF_TOP_Y = 3.4;
const HIGH_ROOF_SIZE = 12;
const HIGH_ROOF_PLINTH_INSET = 1.2;
const HIGH_ROOF_PLINTH_HEIGHT = HIGH_ROOF_TOP_Y - FLOOR_THICKNESS;
const AC_HALF_WIDTH = 2.1;
const AC_MAX_BODY_Y = 1.55;
const AC_MAX_VERTICAL_SPEED = 2;
const AC_COOLDOWN_MS = 750;
const SPAWN_SUPPORT_INSET = 1;

/**
 * Blockout dimensions stay data-only so the geometry, Rapier colliders, and focused tests
 * share one layout. The square roof leaves every outer edge dangerous while the
 * elevated roofs and their inset utility plinths remain AC-launch landing targets.
 */
export const NIGHT_SHIFT_BLOCKOUT_LAYOUT = Object.freeze({
  mainRoofs: Object.freeze([
    Object.freeze({ x: 0, z: 0, width: ARM_HALF_LENGTH * 2, depth: ARM_HALF_LENGTH * 2 }),
  ]),
  highRoofs: Object.freeze([
    Object.freeze({ x: -23, z: 0 }),
    Object.freeze({ x: 23, z: 0 }),
  ]),
  highRoofPlinths: Object.freeze([
    Object.freeze({ x: -23, z: 0, width: HIGH_ROOF_SIZE - HIGH_ROOF_PLINTH_INSET, depth: HIGH_ROOF_SIZE - HIGH_ROOF_PLINTH_INSET }),
    Object.freeze({ x: 23, z: 0, width: HIGH_ROOF_SIZE - HIGH_ROOF_PLINTH_INSET, depth: HIGH_ROOF_SIZE - HIGH_ROOF_PLINTH_INSET }),
  ]),
  acLaunchers: Object.freeze([
    Object.freeze({
      id: "west-route",
      kind: "route",
      x: -5,
      z: 0,
      halfWidth: AC_HALF_WIDTH,
      maxBodyY: AC_MAX_BODY_Y,
      maxVerticalSpeed: AC_MAX_VERTICAL_SPEED,
      cooldownMs: AC_COOLDOWN_MS,
      targetX: -23,
      targetZ: 0,
      horizontalSpeed: 25,
      verticalSpeed: 18,
    }),
    Object.freeze({
      id: "east-route",
      kind: "route",
      x: 5,
      z: 0,
      halfWidth: AC_HALF_WIDTH,
      maxBodyY: AC_MAX_BODY_Y,
      maxVerticalSpeed: AC_MAX_VERTICAL_SPEED,
      cooldownMs: AC_COOLDOWN_MS,
      targetX: 23,
      targetZ: 0,
      horizontalSpeed: 25,
      verticalSpeed: 18,
    }),
    Object.freeze({
      id: "north-chaos",
      kind: "vertical",
      x: 0,
      z: 6,
      halfWidth: AC_HALF_WIDTH,
      maxBodyY: AC_MAX_BODY_Y,
      maxVerticalSpeed: AC_MAX_VERTICAL_SPEED,
      cooldownMs: AC_COOLDOWN_MS,
      verticalSpeed: 26,
    }),
    Object.freeze({
      id: "south-chaos",
      kind: "vertical",
      x: 0,
      z: -6,
      halfWidth: AC_HALF_WIDTH,
      maxBodyY: AC_MAX_BODY_Y,
      maxVerticalSpeed: AC_MAX_VERTICAL_SPEED,
      cooldownMs: AC_COOLDOWN_MS,
      verticalSpeed: 26,
    }),
  ]),
});

/**
 * Keeps AC launch data available without claiming any internal square voids. The simulation
 * registers launchers separately from AI hole avoidance, so Night Shift uses the conservative
 * default outer-rim model instead of Storerooms' corner-hole routing.
 *
 * @returns {{ squareHoles: never[], acLaunchers: readonly object[] }}
 */
export function getNightShiftBlockoutHazards() {
  return {
    squareHoles: [],
    acLaunchers: NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers,
  };
}

/**
 * Builds the four data-only rooftop spawn structures from the same live radius, angle, and
 * height inputs as cart spawning. Each platform rotates so its short axis stays radial.
 *
 * @param {object} config
 * @returns {Array<{ x: number, y: number, z: number, yaw: number, width: number, height: number,
 *   depth: number, supportY: number, supportHeight: number, supportWidth: number,
 *   supportDepth: number }>}
 */
export function getNightShiftSpawnPlatforms(config) {
  const radius = config.cart.spawnRingRadius;
  const platformY = config.booth.platformY;
  const platformHeight = config.booth.platformThickness;
  const supportHeight = platformY - platformHeight / 2 - FLOOR_TOP_Y;
  const supportY = FLOOR_TOP_Y + supportHeight / 2;
  return [0, 1, 2, 3].map((index) => {
    const angle = computeSpawnAngleForSlot(config, index);
    return {
      x: radius * Math.cos(angle),
      y: platformY,
      z: radius * Math.sin(angle),
      yaw: Math.PI / 2 - angle,
      width: config.booth.platformWidth,
      height: platformHeight,
      depth: config.booth.platformDepth,
      supportY,
      supportHeight,
      supportWidth: config.booth.platformWidth - SPAWN_SUPPORT_INSET,
      supportDepth: config.booth.platformDepth - SPAWN_SUPPORT_INSET,
    };
  });
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
 * @param {{ x: number, y: number, z: number, width: number, height: number, depth: number,
 *   yaw?: number }} spec
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
  mesh.rotation.y = spec.yaw ?? 0;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  root.add(mesh);
  ownedGeometries.push(geometry);
  if (!ownedMaterials.includes(material)) ownedMaterials.push(material);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y, spec.z),
  );
  if (spec.yaw) {
    const halfYaw = spec.yaw / 2;
    body.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
  }
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
 * Night Shift blockout. The square roof exposes four lethal outer edges, while two high roofs
 * test the vertical camera envelope. The colored pads mark the active AC launch
 * zones; launch physics is owned by the host fixed step through the level hazard descriptor.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 */
export function initRooftop(scene, world, config) {
  const root = new THREE.Group();
  root.name = "night-shift-blockout";
  scene.add(root);
  // * gameBoot rotates `recordMesh` for Classic's vinyl. Static arenas return a detached empty
  // * proxy so their visible geometry and fixed Rapier colliders cannot drift apart.
  const recordMesh = new THREE.Group();
  recordMesh.name = "night-shift-static-rotation-proxy";

  const previousCenterHole = config.record.centerHole;
  const previousBackground = scene.background;
  config.record.centerHole = { enabled: false };
  scene.background = new THREE.Color(0x0a1222);

  const materialBundle = createNightShiftMaterialBundle();
  const {
    roof: roofMaterial,
    highRoof: highRoofMaterial,
    utility: utilityPlinthMaterial,
    spawnPlatform: spawnPlatformMaterial,
    spawnSupport: spawnSupportMaterial,
    parapet: parapetMaterial,
  } = materialBundle.materials;
  const routeVentMaterial = createPhysicalMaterial({ color: 0xd38e28, metalness: 0.2, roughness: 0.6, emissive: 0x2e1600 });
  const chaosVentMaterial = createPhysicalMaterial({ color: 0xd82bd4, metalness: 0.22, roughness: 0.55, emissive: 0x31072f });
  const ownedGeometries = [];
  const ownedMaterials = [
    routeVentMaterial,
    chaosVentMaterial,
    ...Object.values(materialBundle.materials),
  ];
  const bodies = [];
  const recordColliderHandles = [];
  const edgeColliderHandles = [];
  const spawnPlatforms = getNightShiftSpawnPlatforms(config);

  const moonHemi = new THREE.HemisphereLight(0xa8c6ff, 0x151b2b, 2.25);
  const roofKey = new THREE.DirectionalLight(0x9eb7ff, 3.2);
  roofKey.position.set(-20, 32, 18);
  const cityUplight = new THREE.PointLight(0xff7855, 115, 260, 2);
  cityUplight.position.set(0, -28, 0);
  root.add(moonHemi, roofKey, cityUplight);

  for (const roof of NIGHT_SHIFT_BLOCKOUT_LAYOUT.mainRoofs) {
    addBox(root, world, {
      ...roof,
      y: FLOOR_TOP_Y - FLOOR_THICKNESS / 2,
      height: FLOOR_THICKNESS,
    }, roofMaterial, ownedGeometries, ownedMaterials, bodies, recordColliderHandles);
  }

  for (const plinth of NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofPlinths) {
    addBox(root, world, {
      ...plinth,
      y: FLOOR_TOP_Y + HIGH_ROOF_PLINTH_HEIGHT / 2,
      height: HIGH_ROOF_PLINTH_HEIGHT,
    }, utilityPlinthMaterial, ownedGeometries, ownedMaterials, bodies, recordColliderHandles);
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

  for (const platform of spawnPlatforms) {
    addBox(root, world, {
      x: platform.x,
      y: platform.supportY,
      z: platform.z,
      width: platform.supportWidth,
      height: platform.supportHeight,
      depth: platform.supportDepth,
      yaw: platform.yaw,
    }, spawnSupportMaterial, ownedGeometries, ownedMaterials, bodies, edgeColliderHandles);
    addBox(root, world, {
      x: platform.x,
      y: platform.y,
      z: platform.z,
      width: platform.width,
      height: platform.height,
      depth: platform.depth,
      yaw: platform.yaw,
    }, spawnPlatformMaterial, ownedGeometries, ownedMaterials, bodies, recordColliderHandles);
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

  for (const launcher of NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers) {
    const geometry = new THREE.BoxGeometry(4.2, 0.12, 4.2);
    const material = launcher.kind === "vertical" ? chaosVentMaterial : routeVentMaterial;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(launcher.x, 0.07, launcher.z);
    mesh.name = `night-shift-ac-${launcher.id}`;
    root.add(mesh);
    ownedGeometries.push(geometry);
  }

  const cityArchitecture = createNightShiftCityArchitecture(
    root,
    createNightShiftCityPlan(),
    spawnPlatforms,
    materialBundle.materials,
  );
  const atmosphere = createNightShiftAtmosphere(scene, root);

  function applyQualityTier(knobs) {
    cityArchitecture.applyQualityTier(knobs);
    atmosphere.applyQualityTier(knobs);
    cityUplight.visible = knobs.skyExtras !== false;
  }
  applyQualityTier(getQualityKnobs());

  function dispose() {
    atmosphere.dispose();
    cityArchitecture.dispose();
    scene.remove(root);
    config.record.centerHole = previousCenterHole;
    scene.background = previousBackground;
    for (const body of bodies) {
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
    }
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach(disposeMaterial);
    materialBundle.disposeTextures();
  }

  return {
    applyQualityTier,
    recordMesh,
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
    nightShiftDiagnostics: cityArchitecture.diagnostics,
    update: () => {},
    dispose,
  };
}
