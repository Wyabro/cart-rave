/**
 * cartRaveGltf.js — Segmented rave-theme GLTF cart loader, materials, independent caster motion.
 *
 * Primary asset: `cartrave4.glb` — Tripo color segments for body / wheels / forks / trim.
 * Four composite casters swivel at the basket-side fork attachment; connector + wheel
 * hang below. Forks use car-like steering (body heading + yaw-rate offset) rather than
 * pure velocity trailing. Brackets and frame supports stay static.
 *
 * cartrave4 animate vs static:
 *   body=tripo_part_0, wheels=1/2/3/4 (roll inside swivel assembly),
 *   casters (forkParts swivel at basket attach; connector=swivelHub):
 *     FR {fork:14,20 hub:19 wheel:1} FL {fork:6 hub:18 wheel:3}
 *     BL {fork:5,21 hub:12 wheel:2} BR {fork:13,22 hub:17 wheel:4}
 *   face/sunglasses=8+9+11 (one static assembly), handle=10, face accent=7, static trim=15–16/23.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { applyCartPattern } from "./cartPatterns.js";
import { CART_THEMES } from "./cartThemeConfig.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "./utils.js";

/** @typedef {import("./cartThemes.js").CartThemeMaterialCache} CartThemeMaterialCache */

/** @typedef {"body" | "wheel" | "fork" | "handle" | "face" | "trim" | "unknown"} RaveGltfPartRole */

/** @typedef {"cartrave4" | "legacy"} RaveGltfLayoutId */

/**
 * Independent runtime state for one cartrave4 caster corner.
 * @typedef {object} RaveGltfCasterRuntime
 * @property {number} id Fork group id.
 * @property {THREE.Group} swivelPivot Y-axis swivel at the fork kingpin / basket attach.
 * @property {THREE.Group | null} rollPivot Nested wheel roll pivot (child of swivel).
 * @property {number} authoredForkYaw Rest heading (rad) from primary fork mesh local +Z in model space.
 * @property {number} hubLocalX Swivel anchor X in model space × scale (corner velocity kinematics).
 * @property {number} hubLocalZ Swivel anchor Z in model space × scale.
 * @property {number} smoothedHeading Absolute cart-local trail heading (rad); frozen when slow.
 * @property {number} wheelRoll Accumulated roll angle (rad) for this wheel.
 * @property {number} wheelRadius Roll radius (m) for this wheel.
 * @property {"x" | "y" | "z"} wheelRollAxis
 */

/** DRACO-compressed legacy model (fallback). */
export const RAVE_GLTF_URL_DRACO = "/models/cart-rave-base-draco.glb";

/** Uncompressed legacy monolithic-caster model (fallback). */
export const RAVE_GLTF_URL_LEGACY = "/models/cart-rave-base.glb";

/** Primary segmented rave cart — separate fork + wheel meshes per corner. */
export const RAVE_GLTF_URL = "/models/cartrave4.glb";

/** WASM/JS Draco decoder served from `public/draco/gltf/`. */
export const RAVE_GLTF_DRACO_DECODER_PATH = "/draco/gltf/";

/** CartFrame mesh name for the active cartrave4 export. */
export const RAVE_GLTF_FRAME_MESH = "tripo_part_0";

/**
 * Inner-model Y rotation for every rave GLTF instance.
 * Tripo export: face/handle on +X, wheels at ±X corners. Physics/procedural forward is -Z at yaw 0.
 * +π/2 maps authored +X → parent -Z. Applied on `RaveGltfModel`, not CartVisual (physics overwrites root quat).
 */
export const RAVE_GLTF_ORIENTATION_Y = Math.PI / 2;

/**
 * Live-tunable rave GLTF cart proportions and caster behavior (dev gui: `raveGltfCartDebug.js`).
 * Production builds read these defaults; dev sliders mutate this object in place.
 */
export const raveGltfTuning = {
  scale: 2.25,
  yOffset: -1.24,
  bodyScale: 1.2,
  bodyYDrop: 0.085,
  cornerInset: 0.015,
  cornerInsetFracX: 0.25,
  cornerInsetFracZ: 0.06,
  casterOffsetX: -0.024,
  casterOffsetZ: 0,
  casterStanceScaleX: 0.925,
  casterStanceScaleZ: 0.99,
  swivelMaxAngleDeg: 135,
  swivelDamping: 0.28,
  /** Radians of fork steer per rad/s cart yaw rate (before front/rear multipliers). */
  steeringInfluence: 0.38,
  /** Front-axle steer multiplier — primary turn response. */
  frontSteerMul: 1.0,
  /** Rear-axle steer multiplier — mild same-direction 4-wheel steering. */
  rearSteerMul: 0.32,
  /** Blend toward corner trail heading [0 = car steer only, 1 = pure velocity trail]. */
  trailBlend: 0.18,
  /** Min |yaw rate| (rad/s) to update swivel when hub speed is below swivel min. */
  steeringMinOmega: 0.06,
  /** Kingpin pivot offset from detected fork-top attach (model-local units, pre-scale). */
  casterPivotYOffset: 0,
  casterPivotXOffset: 0,
  casterPivotZOffset: 0,
  /** Per-corner kingpin fine-tune (added on top of global pivot offsets). */
  casterPivotCorner: {
    frontRight: { x: 0, y: 0, z: 0 },
    frontLeft: { x: 0, y: 0, z: 0 },
    backLeft: { x: 0, y: 0, z: 0 },
    backRight: { x: 0, y: 0, z: 0 },
  },
};

/** @returns {number} Max caster swivel deviation from rest heading (rad). */
export function getRaveGltfSwivelMaxAngle() {
  return (raveGltfTuning.swivelMaxAngleDeg * Math.PI) / 180;
}

/** Logs current tuning for copying into `cartRaveGltf.js` defaults. */
export function logRaveGltfTuningValues() {
  // eslint-disable-next-line no-console
  console.log("[raveGltfTuning]", JSON.stringify({ ...raveGltfTuning }, null, 2));
}

/** How much the player neon shifts body albedo (0 = authored grey, 1 = full neon). */
export const RAVE_GLTF_BODY_TINT_STRENGTH = 1;

// --- Caster / wheel animation tuning ---

/** Multiplier on roll angle integrated from planar speed / wheel radius. */
export const RAVE_GLTF_WHEEL_ROLL_SPEED_MUL = 1.0;

/** Planar speed (m/s) at a caster hub before that caster swivels toward its local trail heading. */
export const RAVE_GLTF_CASTER_SWIVEL_MIN_SPEED = 0.12;

/**
 * Planar speed (m/s) at a caster hub before its wheel stops accumulating roll.
 * Kept lower than swivel min so wheels coast visually while forks hold their last heading.
 */
export const RAVE_GLTF_WHEEL_ROLL_MIN_SPEED = 0.02;

/**
 * Scales rigid-body yaw rate (rad/s) for corner hub velocity and car-like steer offset.
 * Higher values make casters react more during turns.
 */
export const RAVE_GLTF_CASTER_ANGVEL_MUL = 1.0;

/**
 * Added to each caster's local trail heading when tracking movement (radians).
 * Tune if all casters appear consistently rotated vs travel direction.
 */
export const RAVE_GLTF_CASTER_SWIVEL_YAW_OFFSET = 0;

/**
 * Swivel / roll reset angle on teleport / respawn only — runtime casters hold their
 * last heading and wheel rotation when input is released.
 */
export const RAVE_GLTF_CASTER_SWIVEL_REST_YAW = 0;

/** Default wheel roll radius when bbox estimate is unavailable (meters, pre-scale). */
export const RAVE_GLTF_WHEEL_RADIUS_FALLBACK = 0.18;

/**
 * Wheel roll axis for cartrave4 separated tires (thin bbox axis = local X).
 * @type {"x" | "y" | "z"}
 */
export const RAVE_GLTF_WHEEL_ROLL_AXIS = "x";

/**
 * Wheel roll axis for legacy monolithic caster meshes (thin axis = local Z).
 * @type {"x" | "y" | "z"}
 */
export const RAVE_GLTF_WHEEL_ROLL_AXIS_LEGACY = "z";

/**
 * Swivel axis for the fork / caster housing (cart-local vertical = Y).
 * @type {"x" | "y" | "z"}
 */
export const RAVE_GLTF_CASTER_SWIVEL_AXIS = "y";

/** Extra radians added to wheel roll (model-specific correction). */
export const RAVE_GLTF_WHEEL_AXIS_CORRECTION = 0;

/**
 * Per-caster trail-heading tweak (radians) keyed by fork group id — added to runtime target heading.
 * @type {Readonly<Record<number, number>>}
 */
export const RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS = Object.freeze({
  0: 0,
  1: 0,
  2: 0,
  3: 0,
});

/** Near-black trim for handle / face / static brackets. */
const RAVE_GLTF_DARK_TRIM_HEX = 0x111111;

/**
 * cartrave4 sunglasses — frame (8) + lens pair (9, 11); one static face assembly.
 * @type {ReadonlyArray<string>}
 */
const RAVE_GLTF_V4_FACE_PARTS = Object.freeze([
  "tripo_part_8",
  "tripo_part_9",
  "tripo_part_11",
]);

/**
 * cartrave4 side-frame supports — tall angled/vertical body pieces, never animate.
 * @type {ReadonlySet<string>}
 */
const RAVE_GLTF_V4_STATIC_ANIM_EXCLUSIONS = new Set([
  "tripo_part_15",
  "tripo_part_16",
]);

/**
 * One cartrave4 caster — fork legs, connector hub, and wheel.
 * @typedef {object} RaveGltfForkGroupDef
 * @property {number} id
 * @property {string} label Corner label for dev logging.
 * @property {string} swivelHub Connector mesh (tripo_part_12/17/18/19).
 * @property {string} wheel
 * @property {readonly string[]} forkParts Fork leg meshes (exclude connector).
 */

/**
 * cartrave4 casters — swivel pivot at basket-side fork attachment; connector + wheel follow.
 * @type {ReadonlyArray<RaveGltfForkGroupDef>}
 */
const RAVE_GLTF_V4_FORK_GROUPS = Object.freeze([
  {
    id: 0,
    label: "frontRight",
    swivelHub: "tripo_part_19",
    wheel: "tripo_part_1",
    forkParts: Object.freeze(["tripo_part_14", "tripo_part_20"]),
  },
  {
    id: 1,
    label: "frontLeft",
    swivelHub: "tripo_part_18",
    wheel: "tripo_part_3",
    forkParts: Object.freeze(["tripo_part_6"]),
  },
  {
    id: 2,
    label: "backLeft",
    swivelHub: "tripo_part_12",
    wheel: "tripo_part_2",
    forkParts: Object.freeze(["tripo_part_5", "tripo_part_21"]),
  },
  {
    id: 3,
    label: "backRight",
    swivelHub: "tripo_part_17",
    wheel: "tripo_part_4",
    forkParts: Object.freeze(["tripo_part_13", "tripo_part_22"]),
  },
]);

/**
 * Basket bbox corner signs per caster label (cartrave4 authored +X/-Z = front-right, etc.).
 * @type {Readonly<Record<string, { sx: 1 | -1, sz: 1 | -1 }>>}
 */
const RAVE_GLTF_CASTER_CORNER_SIGNS = Object.freeze({
  frontRight: { sx: 1, sz: -1 },
  frontLeft: { sx: 1, sz: 1 },
  backLeft: { sx: -1, sz: 1 },
  backRight: { sx: -1, sz: -1 },
});

/**
 * cartrave4 mesh-name → role. Wheels roll individually; fork-group parts share a swivel pivot.
 * @type {Readonly<Record<string, RaveGltfPartRole>>}
 */
const RAVE_GLTF_PART_ROLES_V4 = Object.freeze({
  tripo_part_0: "body",
  tripo_part_1: "wheel",
  tripo_part_2: "wheel",
  tripo_part_3: "wheel",
  tripo_part_4: "wheel",
  tripo_part_5: "fork",
  tripo_part_6: "fork",
  tripo_part_7: "face",
  tripo_part_8: "face",
  tripo_part_9: "face",
  tripo_part_10: "handle",
  tripo_part_11: "face",
  tripo_part_12: "fork",
  tripo_part_13: "fork",
  tripo_part_14: "fork",
  tripo_part_15: "trim",
  tripo_part_16: "trim",
  tripo_part_17: "fork",
  tripo_part_18: "fork",
  tripo_part_19: "fork",
  tripo_part_20: "fork",
  tripo_part_21: "fork",
  tripo_part_22: "fork",
  tripo_part_23: "trim",
});

/**
 * Legacy cart-rave-base mesh-name → gameplay role (monolithic caster corners).
 * @type {Readonly<Record<string, RaveGltfPartRole>>}
 */
const RAVE_GLTF_PART_ROLES_LEGACY = Object.freeze({
  tripo_part_0: "wheel",
  tripo_part_1: "body",
  tripo_part_2: "handle",
  tripo_part_3: "wheel",
  tripo_part_4: "wheel",
  tripo_part_5: "wheel",
  tripo_part_6: "face",
});

/** @type {RaveGltfLayoutId} */
let _sourceLayout = "cartrave4";

/** @type {Readonly<Record<RaveGltfPartRole, Partial<THREE.MeshPhysicalMaterialParameters>>>} */
const RAVE_GLTF_ROLE_MAT_PRESETS = Object.freeze({
  body: {},
  wheel: { metalness: 0.35, roughness: 0.55, clearcoat: 0.15 },
  fork: { metalness: 0.45, roughness: 0.5, clearcoat: 0.2 },
  handle: { metalness: 0.2, roughness: 0.65, clearcoat: 0.05 },
  face: { metalness: 0.15, roughness: 0.7, clearcoat: 0.0 },
  trim: {},
  unknown: {},
});

/** Rave theme frame preset — matches cartThemeConfig `rave.frameMaterial`. */
const RAVE_GLTF_FRAME_PRESET = CART_THEMES.rave.frameMaterial;

const RAVE_GLTF_EMISSIVE_MUL = RAVE_GLTF_FRAME_PRESET.emissiveMul ?? 1.15;
/** Wireframe trim uses an emissive map (partial coverage); kept at 1.0 to match procedural bloom balance. */
const RAVE_GLTF_TRIM_MASK_BOOST = 1.0;

const LOAD_TIMEOUT_MS = 90_000;

/** @type {THREE.Color} */
const _bodyTintNeon = new THREE.Color();

/** @type {THREE.Color} */
const _bodyTintScratch = new THREE.Color();

/** @type {THREE.Vector3} */
const _localVel = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _localAngvel = new THREE.Vector3();

/** @type {THREE.Quaternion} */
const _rootWorld = new THREE.Quaternion();

/** @type {THREE.Quaternion} */
const _rootInv = new THREE.Quaternion();

/** @type {THREE.Vector3} */
const _bboxSize = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _bboxCenter = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _bodyScalePivot = new THREE.Vector3();

/** @type {THREE.Matrix4} */
const _hubLocalMat = new THREE.Matrix4();

/** @type {THREE.Matrix4} */
const _hubLocalInv = new THREE.Matrix4();

/** @type {THREE.Matrix4} */
const _meshLocalMat = new THREE.Matrix4();

/** @type {THREE.Quaternion} */
const _scratchQuat = new THREE.Quaternion();

/** @type {THREE.Vector3} */
const _scratchScale = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _authoredAttachPoint = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _targetAttachPoint = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _modelLocalScratch = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _forkForward = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _worldPosScratch = new THREE.Vector3();

/** @type {THREE.Quaternion} */
const _modelInvQuat = new THREE.Quaternion();

/** @type {THREE.Box3} */
const _bodyBbox = new THREE.Box3();

/** @type {THREE.Vector3} */
const _kingpinBaseScratch = new THREE.Vector3();

/** @type {THREE.Vector3} */
const _connectorHubScratch = new THREE.Vector3();

/** @type {THREE.Matrix4} */
const _modelInvMat = new THREE.Matrix4();

/** @type {GLTFLoader | null} */
let _loader = null;

/** @type {DRACOLoader | null} */
let _dracoLoader = null;

/** @type {THREE.Group | null} */
let _sourceScene = null;

/** @type {string | null} */
let _loadedUrl = null;

/** @type {Promise<THREE.Group> | null} */
let _loadPromise = null;

/** @type {boolean} */
let _partLayoutLogged = false;

/** @type {boolean} */
let _casterSourceHierarchyLogged = false;

/** Matches Tripo segmented mesh names (`tripo_part_0` … `tripo_part_23`). */
const RAVE_GLTF_TRIPO_PART_RE = /^tripo_part_\d+$/;

/**
 * Detects cartrave4 vs legacy layout from loaded URL + authored mesh names.
 * Primary `cartrave4.glb` always uses cartrave4 roles; legacy Draco URLs stay legacy.
 *
 * @param {THREE.Object3D} scene
 * @param {string | null | undefined} [loadedUrl]
 * @returns {RaveGltfLayoutId}
 */
function detectRaveGltfLayout(scene, loadedUrl = null) {
  if (loadedUrl === RAVE_GLTF_URL) return "cartrave4";
  if (loadedUrl === RAVE_GLTF_URL_LEGACY || loadedUrl === RAVE_GLTF_URL_DRACO) return "legacy";

  let hasTripoPart = false;
  scene.traverse((child) => {
    if (RAVE_GLTF_TRIPO_PART_RE.test(child.name || "")) hasTripoPart = true;
  });
  return hasTripoPart ? "cartrave4" : "legacy";
}

/** @returns {Readonly<Record<string, RaveGltfPartRole>>} */
function getRaveGltfPartRoles() {
  return _sourceLayout === "cartrave4" ? RAVE_GLTF_PART_ROLES_V4 : RAVE_GLTF_PART_ROLES_LEGACY;
}

/**
 * Logs the authored GLTF hierarchy for caster corners (dev aid).
 *
 * @param {THREE.Object3D} scene
 */
function logRaveGltfCasterSourceHierarchy(scene) {
  if (!import.meta.env?.DEV || _casterSourceHierarchyLogged) return;
  _casterSourceHierarchyLogged = true;

  const layout = _sourceLayout || detectRaveGltfLayout(scene, _loadedUrl);
  const lines = [
    `[cartRaveGltf] Source GLTF layout=${layout} url=${_loadedUrl ?? "?"} caster hierarchy:`,
    "  ParentNode",
  ];

  if (layout === "cartrave4") {
    for (const group of RAVE_GLTF_V4_FORK_GROUPS) {
      lines.push(
        `  caster ${group.id} (${group.label}): hub=${group.swivelHub} wheel=${group.wheel} fork=[${group.forkParts.join(", ")}]`,
      );
    }
    lines.push("  static: frame supports tripo_part_15,16 + sunglasses 8,9,11 + handle 10");
  } else {
    lines.push("  legacy monolithic corners: tripo_part_0,3,4,5 (swivel only)");
  }
  console.debug(lines.join("\n"));
}

/** @param {number} a @param {number} b @param {number} t */
function lerpAngle(a, b, t) {
  let delta = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + delta * t;
}

/**
 * Shortest-path delta from `center` to `heading` (rad), in (-π, π].
 *
 * @param {number} heading
 * @param {number} center
 * @returns {number}
 */
function angleDeltaFromCenter(heading, center) {
  return ((heading - center) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

/**
 * Clamps `heading` to [center − maxDeviation, center + maxDeviation] on the circle.
 *
 * @param {number} heading
 * @param {number} center
 * @param {number} maxDeviation
 * @returns {number}
 */
function clampAngleToRange(heading, center, maxDeviation) {
  const delta = angleDeltaFromCenter(heading, center);
  const clampedDelta = Math.max(-maxDeviation, Math.min(maxDeviation, delta));
  return center + clampedDelta;
}

/** @param {THREE.Object3D} object @param {"x" | "y" | "z"} axis @param {number} radians */
function setObjectAxisRotation(object, axis, radians) {
  object.rotation.x = axis === "x" ? radians : 0;
  object.rotation.y = axis === "y" ? radians : 0;
  object.rotation.z = axis === "z" ? radians : 0;
}

/**
 * Maps a point in `object` local space to `RaveGltfModel` local space.
 *
 * @param {THREE.Object3D} object
 * @param {THREE.Vector3} localPoint
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function raveGltfToModelSpace(object, localPoint, modelRoot, out) {
  object.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  out.copy(localPoint).applyMatrix4(object.matrixWorld);
  modelRoot.worldToLocal(out);
  return out;
}

/**
 * Reparents one caster part under `swivelPivot` while keeping each child's offset from
 * `authoredPivotModel`. Uses model-space transforms so body/fork scaling under
 * `RaveGltfBodyScale` does not break attach math.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} authoredPivotModel Original swivel anchor in model space.
 * @param {THREE.Object3D} swivelPivot Child of `modelRoot`, placed at target attach.
 * @param {THREE.Object3D} modelRoot
 */
function reparentRaveGltfCasterPart(mesh, authoredPivotModel, swivelPivot, modelRoot) {
  mesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  _meshLocalMat.copy(mesh.matrixWorld).premultiply(_modelInvMat);

  _hubLocalMat.compose(authoredPivotModel, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.premultiply(_hubLocalInv);

  mesh.parent?.remove(mesh);
  _meshLocalMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
  swivelPivot.add(mesh);
}

/**
 * Picks the largest fork leg mesh for authored heading (ignores tiny bracket sub-meshes).
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @returns {THREE.Mesh | null}
 */
function pickPrimaryRaveGltfForkMesh(forkMeshes) {
  /** @type {THREE.Mesh | null} */
  let primary = null;
  let bestVolume = 0;

  for (const mesh of forkMeshes) {
    const bounds = computeRaveGltfMeshBounds(mesh);
    if (!bounds) continue;
    const volume = bounds.maxDim * bounds.midDim * bounds.minDim;
    if (volume > bestVolume) {
      bestVolume = volume;
      primary = mesh;
    }
  }

  return primary ?? forkMeshes[0] ?? null;
}

/**
 * Fork mesh local +Z projected to model XZ — rest heading for swivel offset math.
 *
 * @param {THREE.Mesh} forkMesh
 * @returns {number}
 */
function computeRaveGltfAuthoredForkYaw(forkMesh) {
  _forkForward.set(0, 0, 1).applyQuaternion(forkMesh.quaternion);
  return Math.atan2(_forkForward.x, _forkForward.z);
}

/**
 * Basket (`tripo_part_0`) axis-aligned bounds in `RaveGltfModel` local space (includes body scale).
 *
 * @param {THREE.Mesh} bodyMesh
 * @param {THREE.Object3D} modelRoot
 * @returns {THREE.Box3}
 */
function computeRaveGltfBodyBboxInModelSpace(bodyMesh, modelRoot) {
  bodyMesh.updateWorldMatrix(true, false);
  _bodyBbox.setFromObject(bodyMesh);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  return _bodyBbox.applyMatrix4(_modelInvMat);
}

/**
 * Outer basket XZ for one caster corner (after optional inset).
 *
 * @param {string} cornerLabel
 * @param {number} connectorModelX Connector origin X in model space.
 * @param {number} connectorModelZ Connector origin Z in model space.
 * @param {THREE.Box3} bodyBbox Basket bounds in model space.
 * @returns {{ x: number, z: number }}
 */
function resolveRaveGltfCasterCornerXZ(cornerLabel, connectorModelX, connectorModelZ, bodyBbox) {
  const signs = RAVE_GLTF_CASTER_CORNER_SIGNS[cornerLabel] ?? {
    sx: connectorModelX >= 0 ? 1 : -1,
    sz: connectorModelZ >= 0 ? 1 : -1,
  };
  const centerX = (bodyBbox.max.x + bodyBbox.min.x) * 0.5;
  const centerZ = (bodyBbox.max.z + bodyBbox.min.z) * 0.5;
  const halfSpanX = (bodyBbox.max.x - bodyBbox.min.x) * 0.5;
  const halfSpanZ = (bodyBbox.max.z - bodyBbox.min.z) * 0.5;
  const fracInsetX = halfSpanX * raveGltfTuning.cornerInsetFracX;
  const fracInsetZ = halfSpanZ * raveGltfTuning.cornerInsetFracZ;
  const absInset = raveGltfTuning.cornerInset;

  let x = signs.sx > 0
    ? bodyBbox.max.x - fracInsetX - absInset
    : bodyBbox.min.x + fracInsetX + absInset;
  let z = signs.sz > 0
    ? bodyBbox.max.z - fracInsetZ - absInset
    : bodyBbox.min.z + fracInsetZ + absInset;

  x = centerX + (x - centerX) * raveGltfTuning.casterStanceScaleX + raveGltfTuning.casterOffsetX;
  z = centerZ + (z - centerZ) * raveGltfTuning.casterStanceScaleZ + raveGltfTuning.casterOffsetZ;

  return { x, z };
}

/**
 * Applies global + per-corner kingpin offsets to a detected fork-top attach point.
 *
 * @param {THREE.Vector3} baseKingpin Detected kingpin in model space.
 * @param {string} cornerLabel
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function applyRaveGltfCasterPivotOffsets(baseKingpin, cornerLabel, out) {
  const cornerOff = raveGltfTuning.casterPivotCorner?.[cornerLabel] ?? {};
  return out.set(
    baseKingpin.x + raveGltfTuning.casterPivotXOffset + (cornerOff.x ?? 0),
    baseKingpin.y + raveGltfTuning.casterPivotYOffset + (cornerOff.y ?? 0),
    baseKingpin.z + raveGltfTuning.casterPivotZOffset + (cornerOff.z ?? 0),
  );
}

/**
 * Detects the fork kingpin in model space — highest fork-leg top center (basket-side swivel
 * pin), not the lower connector hub where the wheel mounts.
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function computeRaveGltfForkKingpinModelPoint(forkMeshes, modelRoot, out) {
  let found = false;
  let bestY = -Infinity;

  for (const fork of forkMeshes) {
    fork.geometry?.computeBoundingBox();
    const fbb = fork.geometry?.boundingBox;
    if (!fbb) continue;

    raveGltfToModelSpace(
      fork,
      _modelLocalScratch.set(
        (fbb.min.x + fbb.max.x) * 0.5,
        fbb.max.y,
        (fbb.min.z + fbb.max.z) * 0.5,
      ),
      modelRoot,
      _kingpinBaseScratch,
    );

    if (_kingpinBaseScratch.y >= bestY) {
      bestY = _kingpinBaseScratch.y;
      out.copy(_kingpinBaseScratch);
      found = true;
    }
  }

  if (!found && forkMeshes.length > 0) {
    raveGltfToModelSpace(forkMeshes[0], _modelLocalScratch.set(0, 0, 0), modelRoot, out);
  }

  return out;
}

/**
 * Authored kingpin (fork attach + pivot offsets) and basket-corner target XZ.
 * Child parts keep rigid offsets from `authored`; `swivelPivot` sits at `target` so the whole
 * caster assembly shifts outward to the scaled basket rim.
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh | null | undefined} bodyMesh
 * @param {string} cornerLabel
 * @param {THREE.Object3D} modelRoot
 * @returns {{ authored: THREE.Vector3, target: THREE.Vector3, baseKingpin: THREE.Vector3 }}
 */
function computeRaveGltfCasterAttachPoints(forkMeshes, bodyMesh, cornerLabel, modelRoot) {
  computeRaveGltfForkKingpinModelPoint(forkMeshes, modelRoot, _kingpinBaseScratch);
  applyRaveGltfCasterPivotOffsets(_kingpinBaseScratch, cornerLabel, _authoredAttachPoint);
  _targetAttachPoint.copy(_authoredAttachPoint);

  if (bodyMesh) {
    const bodyBbox = computeRaveGltfBodyBboxInModelSpace(bodyMesh, modelRoot);
    const corner = resolveRaveGltfCasterCornerXZ(
      cornerLabel,
      _authoredAttachPoint.x,
      _authoredAttachPoint.z,
      bodyBbox,
    );
    _targetAttachPoint.x = corner.x;
    _targetAttachPoint.z = corner.z;
  }

  return {
    authored: _authoredAttachPoint.clone(),
    target: _targetAttachPoint.clone(),
    baseKingpin: _kingpinBaseScratch.clone(),
  };
}

/**
 * Repositions roll pivot under the swivel kingpin while preserving wheel mesh orientation.
 *
 * @param {THREE.Group} rollPivot
 * @param {THREE.Mesh} wheelMesh
 * @param {THREE.Vector3} authoredKingpin
 * @param {THREE.Object3D} modelRoot
 */
function updateRaveGltfCasterRollPivot(rollPivot, wheelMesh, authoredKingpin, modelRoot) {
  wheelMesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  _meshLocalMat.copy(wheelMesh.matrixWorld).premultiply(_modelInvMat);
  _hubLocalMat.compose(authoredKingpin, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.premultiply(_hubLocalInv);
  _meshLocalMat.decompose(rollPivot.position, rollPivot.quaternion, rollPivot.scale);
}

/**
 * Places swivel pivot at the basket-corner kingpin and re-rigid-bodies fork / hub / wheel.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {THREE.Mesh} connectorMesh
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh | null | undefined} wheelMesh
 * @param {THREE.Vector3} authoredKingpin
 * @param {THREE.Vector3} targetKingpin
 * @param {THREE.Object3D} modelRoot
 */
function layoutRaveGltfCasterAssembly(
  caster,
  connectorMesh,
  forkMeshes,
  wheelMesh,
  authoredKingpin,
  targetKingpin,
  modelRoot,
) {
  caster.swivelPivot.position.copy(targetKingpin);
  caster.hubLocalX = targetKingpin.x * raveGltfTuning.scale;
  caster.hubLocalZ = targetKingpin.z * raveGltfTuning.scale;

  for (const mesh of forkMeshes) {
    reparentRaveGltfCasterPart(mesh, authoredKingpin, caster.swivelPivot, modelRoot);
  }
  reparentRaveGltfCasterPart(connectorMesh, authoredKingpin, caster.swivelPivot, modelRoot);

  if (wheelMesh && caster.rollPivot) {
    updateRaveGltfCasterRollPivot(caster.rollPivot, wheelMesh, authoredKingpin, modelRoot);

    wheelMesh.parent?.remove(wheelMesh);
    wheelMesh.position.set(0, 0, 0);
    wheelMesh.quaternion.identity();
    wheelMesh.scale.set(1, 1, 1);
    caster.rollPivot.add(wheelMesh);

    if (caster.rollPivot.parent !== caster.swivelPivot) {
      caster.swivelPivot.add(caster.rollPivot);
    }

    caster.wheelRadius = Math.max(
      estimateRaveGltfWheelRadius(wheelMesh.geometry) * raveGltfTuning.scale,
      RAVE_GLTF_WHEEL_RADIUS_FALLBACK * raveGltfTuning.scale,
    );
  }
}

/**
 * Dev log: swivel kingpin world position vs connector hub and fork-top geometry.
 *
 * @param {string} context
 * @param {number} casterId
 * @param {string} cornerLabel
 * @param {THREE.Object3D} cartRoot
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Vector3} baseKingpin
 * @param {THREE.Vector3} authoredKingpin
 * @param {THREE.Vector3} targetKingpin
 * @param {THREE.Mesh | null | undefined} connectorMesh
 * @param {THREE.Mesh | null | undefined} primaryForkMesh
 */
function logRaveGltfCasterKingpinDiagnostics(
  context,
  casterId,
  cornerLabel,
  cartRoot,
  modelRoot,
  baseKingpin,
  authoredKingpin,
  targetKingpin,
  connectorMesh,
  primaryForkMesh,
) {
  if (!import.meta.env?.DEV) return;

  cartRoot.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);
  const swivelPivot = cartRoot.getObjectByName(`RaveGltfForkPivot_${casterId}`);
  swivelPivot?.getWorldPosition(_worldPosScratch);
  const swivelWx = _worldPosScratch.x;
  const swivelWy = _worldPosScratch.y;
  const swivelWz = _worldPosScratch.z;

  modelRoot.localToWorld(_kingpinBaseScratch.copy(baseKingpin));
  const baseWx = _kingpinBaseScratch.x;
  const baseWy = _kingpinBaseScratch.y;
  const baseWz = _kingpinBaseScratch.z;

  let connectorWorldTag = "connectorHubWorld=n/a pivotToConnector=n/a";
  if (connectorMesh) {
    connectorMesh.getWorldPosition(_connectorHubScratch);
    connectorWorldTag =
      `connectorHubWorld=(${_connectorHubScratch.x.toFixed(3)}, ${_connectorHubScratch.y.toFixed(3)}, ${_connectorHubScratch.z.toFixed(3)}) ` +
      `pivotToConnector=(${(swivelWx - _connectorHubScratch.x).toFixed(3)}, ` +
      `${(swivelWy - _connectorHubScratch.y).toFixed(3)}, ` +
      `${(swivelWz - _connectorHubScratch.z).toFixed(3)})`;
  }

  let forkTopWorldTag = "forkTopWorld=n/a pivotToForkTop=n/a";
  if (primaryForkMesh?.geometry) {
    primaryForkMesh.geometry.computeBoundingBox();
    const fbb = primaryForkMesh.geometry.boundingBox;
    if (fbb) {
      raveGltfToModelSpace(
        primaryForkMesh,
        _modelLocalScratch.set(
          (fbb.min.x + fbb.max.x) * 0.5,
          fbb.max.y,
          (fbb.min.z + fbb.max.z) * 0.5,
        ),
        modelRoot,
        _kingpinBaseScratch,
      );
      modelRoot.localToWorld(_kingpinBaseScratch);
      forkTopWorldTag =
        `forkTopWorld=(${_kingpinBaseScratch.x.toFixed(3)}, ${_kingpinBaseScratch.y.toFixed(3)}, ${_kingpinBaseScratch.z.toFixed(3)}) ` +
        `pivotToForkTop=(${(swivelWx - _kingpinBaseScratch.x).toFixed(3)}, ` +
        `${(swivelWy - _kingpinBaseScratch.y).toFixed(3)}, ` +
        `${(swivelWz - _kingpinBaseScratch.z).toFixed(3)})`;
    }
  }

  console.debug(
    `[cartRaveGltf] ${context} caster ${casterId} (${cornerLabel}) kingpin: ` +
      `baseModel=(${baseKingpin.x.toFixed(3)}, ${baseKingpin.y.toFixed(3)}, ${baseKingpin.z.toFixed(3)}) ` +
      `baseWorld=(${baseWx.toFixed(3)}, ${baseWy.toFixed(3)}, ${baseWz.toFixed(3)}) ` +
      `authoredModel=(${authoredKingpin.x.toFixed(3)}, ${authoredKingpin.y.toFixed(3)}, ${authoredKingpin.z.toFixed(3)}) ` +
      `targetModel=(${targetKingpin.x.toFixed(3)}, ${targetKingpin.y.toFixed(3)}, ${targetKingpin.z.toFixed(3)}) ` +
      `pivotOffset=(${raveGltfTuning.casterPivotXOffset}, ${raveGltfTuning.casterPivotYOffset}, ${raveGltfTuning.casterPivotZOffset}) ` +
      `swivelWorld=(${swivelWx.toFixed(3)}, ${swivelWy.toFixed(3)}, ${swivelWz.toFixed(3)}) ` +
      connectorWorldTag + " " +
      forkTopWorldTag,
  );
}

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {Set<THREE.Material>} disposedMats
 */
function disposeMaterialOnce(material, disposedMats) {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!mat || disposedMats.has(mat)) continue;
    disposedMats.add(mat);
    mat.dispose?.();
  }
}

/** @returns {DRACOLoader} */
function getDracoLoader() {
  if (!_dracoLoader) {
    _dracoLoader = new DRACOLoader();
    _dracoLoader.setDecoderPath(RAVE_GLTF_DRACO_DECODER_PATH);
  }
  return _dracoLoader;
}

/** @returns {GLTFLoader} */
function getLoader() {
  if (!_loader) {
    _loader = new GLTFLoader();
    _loader.setDRACOLoader(getDracoLoader());
  }
  return _loader;
}

/**
 * @typedef {{ centerY: number, maxDim: number, minDim: number, midDim: number }} RaveGltfMeshBounds
 */

/**
 * Mesh bbox + approximate center Y in cart-local space (pre-scale GLTF units).
 *
 * @param {THREE.Object3D} object
 * @returns {RaveGltfMeshBounds | null}
 */
function computeRaveGltfMeshBounds(object) {
  if (!object.isMesh?.geometry) return null;

  const geometry = object.geometry;
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return null;

  geometry.boundingBox.getSize(_bboxSize);
  geometry.boundingBox.getCenter(_bboxCenter);
  _bboxCenter.add(object.position);

  const dims = [_bboxSize.x, _bboxSize.y, _bboxSize.z].sort((a, b) => a - b);
  return {
    centerY: _bboxCenter.y,
    maxDim: dims[2],
    minDim: dims[0],
    midDim: dims[1],
  };
}

/**
 * Confirms or rejects wheel/fork hints using bbox size + vertical placement.
 *
 * @param {string} meshName
 * @param {RaveGltfPartRole} hintedRole
 * @param {RaveGltfMeshBounds | null} bounds
 * @returns {RaveGltfPartRole}
 */
function classifyCartrave4AnimRole(meshName, hintedRole, bounds) {
  if (RAVE_GLTF_V4_STATIC_ANIM_EXCLUSIONS.has(meshName)) return "trim";

  if (hintedRole !== "wheel" && hintedRole !== "fork") return hintedRole;
  if (!bounds) return hintedRole;

  // * Frame / handle pieces sit high on the cart — never animate even if mis-tagged.
  if (bounds.centerY > 0.38 || bounds.maxDim > 0.48) return "trim";

  return hintedRole;
}

/**
 * Resolves gameplay role from mesh/material names (Tripo `tripo_part_N` segmentation).
 * cartrave4 wheel/fork hints are geometry-validated so frame pieces stay static.
 *
 * @param {THREE.Object3D} object
 * @returns {RaveGltfPartRole}
 */
function resolveRaveGltfPartRole(object) {
  const roles = getRaveGltfPartRoles();
  const meshName = object.name || "";
  let hintedRole = roles[meshName];

  if (!hintedRole) {
    const mat = object.isMesh
      ? (Array.isArray(object.material) ? object.material[0] : object.material)
      : null;
    const matName = mat?.name || "";
    const match = /tripo_part_(\d+)/.exec(meshName) || /tripo_part_(\d+)/.exec(matName);
    if (match) {
      const key = `tripo_part_${match[1]}`;
      hintedRole = roles[key];
    }
  }

  if (!hintedRole) return "unknown";

  if (_sourceLayout !== "cartrave4") return hintedRole;

  const bounds = computeRaveGltfMeshBounds(object);
  return classifyCartrave4AnimRole(meshName, hintedRole, bounds);
}

/**
 * Logs final role assignment per mesh (dev aid).
 *
 * @param {THREE.Object3D} model
 */
function logRaveGltfPartRoleAssignments(model) {
  if (!import.meta.env?.DEV || _partLayoutLogged) return;
  _partLayoutLogged = true;

  /** @type {string[]} */
  const lines = [`[cartRaveGltf] Part roles (layout=${_sourceLayout}):`];

  model.traverse((child) => {
    if (!child.isMesh) return;
    const role = child.userData.raveGltfPartRole || resolveRaveGltfPartRole(child);
    const bounds = computeRaveGltfMeshBounds(child);
    const boundsTag = bounds
      ? ` cy=${bounds.centerY.toFixed(3)} max=${bounds.maxDim.toFixed(3)} min=${bounds.minDim.toFixed(3)}`
      : "";
    lines.push(`  ${child.name || "(unnamed)"} → ${role}${boundsTag}`);
  });

  if (_sourceLayout === "cartrave4") {
    for (const group of RAVE_GLTF_V4_FORK_GROUPS) {
      lines.push(
        `  caster ${group.id} (${group.label}): hub=${group.swivelHub} wheel=${group.wheel} fork=[${group.forkParts.join(", ")}]`,
      );
    }
  }

  console.debug(lines.join("\n"));
}

/**
 * Inner-model Y rotation — see RAVE_GLTF_ORIENTATION_Y.
 *
 * @param {THREE.Object3D} root
 */
function applyRaveGltfOrientationCorrection(root) {
  root.rotation.y = RAVE_GLTF_ORIENTATION_Y;
}

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 */
function applyRaveGltfFramePreset(mat) {
  const preset = RAVE_GLTF_FRAME_PRESET;
  const env = getMaterialEnvMapIntensity();

  if (typeof mat.metalness === "number") mat.metalness = preset.metalness;
  if (typeof mat.roughness === "number") mat.roughness = preset.roughness;
  if (typeof mat.clearcoat === "number") mat.clearcoat = preset.clearcoat;
  if (typeof mat.clearcoatRoughness === "number") mat.clearcoatRoughness = preset.clearcoatRoughness;
  if (typeof preset.toneMapped === "boolean") mat.toneMapped = preset.toneMapped;
  if (typeof mat.envMapIntensity === "number") mat.envMapIntensity = env * 0.65;
}

/**
 * Clones authored GLTF material for one instance with role-specific PBR + trim mask setup.
 *
 * @param {THREE.Material} srcMat
 * @param {RaveGltfPartRole} role
 * @returns {THREE.MeshPhysicalMaterial}
 */
function cloneRaveGltfMaterial(srcMat, role) {
  const rolePreset = RAVE_GLTF_ROLE_MAT_PRESETS[role] || {};

  const mat = createPhysicalMaterial({
    name: srcMat.name,
    map: srcMat.map,
    normalMap: srcMat.normalMap,
    color: srcMat.color?.clone(),
    emissive: srcMat.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveIntensity: 0,
    ...rolePreset,
  });

  applyRaveGltfFramePreset(mat);
  if (rolePreset.metalness != null) mat.metalness = rolePreset.metalness;
  if (rolePreset.roughness != null) mat.roughness = rolePreset.roughness;
  if (rolePreset.clearcoat != null) mat.clearcoat = rolePreset.clearcoat;
  if (rolePreset.clearcoatRoughness != null) mat.clearcoatRoughness = rolePreset.clearcoatRoughness;

  mat.userData.raveGltfPartRole = role;

  if (role === "body") {
    // * Wireframe trim lives in the albedo map — reuse as emissive mask for neon bloom.
    mat.emissiveMap = srcMat.emissiveMap || srcMat.map || null;
    mat.userData.raveGltfHasEmissiveAccent = !!mat.emissiveMap;
    if (mat.color) mat.userData.raveGltfAuthoredColor = mat.color.clone();
  } else if (role === "wheel") {
    mat.userData.raveGltfHasEmissiveAccent = false;
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else if (role === "fork") {
    mat.userData.raveGltfHasEmissiveAccent = false;
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else if (role === "handle" || role === "face") {
    mat.userData.raveGltfHasEmissiveAccent = false;
    mat.color.setHex(RAVE_GLTF_DARK_TRIM_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else {
    mat.userData.raveGltfHasEmissiveAccent = !!srcMat.emissiveMap;
    mat.emissiveMap = srcMat.emissiveMap || null;
    if (role === "trim" && srcMat.map) {
      // * Small neon wire segments share the body albedo map as a bloom mask.
      mat.emissiveMap = srcMat.map;
      mat.userData.raveGltfHasEmissiveAccent = true;
    } else if (role === "trim") {
      mat.color.setHex(RAVE_GLTF_DARK_TRIM_HEX);
      if (mat.emissive) mat.emissive.setHex(0x000000);
    }
  }

  if (mat.emissive && !mat.emissiveMap && role !== "body") mat.emissive.setHex(0x000000);

  return mat;
}

/**
 * Estimates wheel roll radius from mesh bbox (Tripo wheels: thin axis = axle, larger dims = tire).
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {number}
 */
function estimateRaveGltfWheelRadius(geometry) {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return RAVE_GLTF_WHEEL_RADIUS_FALLBACK;

  geometry.boundingBox.getSize(_bboxSize);
  const dims = [_bboxSize.x, _bboxSize.y, _bboxSize.z].sort((a, b) => a - b);
  const radius = Math.max(dims[1], dims[2]) * 0.5;
  return Math.max(radius, RAVE_GLTF_WHEEL_RADIUS_FALLBACK * 0.5);
}

/**
 * Picks the local roll axis from the thinnest bbox dimension (axle direction).
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {"x" | "y" | "z"}
 */
function detectRaveGltfWheelRollAxis(geometry) {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return RAVE_GLTF_WHEEL_ROLL_AXIS;

  geometry.boundingBox.getSize(_bboxSize);
  const dims = [
    { axis: "x", size: _bboxSize.x },
    { axis: "y", size: _bboxSize.y },
    { axis: "z", size: _bboxSize.z },
  ].sort((a, b) => a.size - b.size);

  const thinnest = dims[0].axis;
  return thinnest === "x" || thinnest === "y" || thinnest === "z"
    ? thinnest
    : RAVE_GLTF_WHEEL_ROLL_AXIS;
}

/**
 * Wraps one mesh in a pivot group at its authored transform so axis rotation is stable.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Object3D} parent
 * @param {string} pivotName
 * @returns {THREE.Group}
 */
function wrapRaveGltfAnimPivot(mesh, parent, pivotName) {
  const pivot = new THREE.Group();
  pivot.name = pivotName;
  pivot.position.copy(mesh.position);
  pivot.quaternion.copy(mesh.quaternion);
  pivot.scale.copy(mesh.scale);

  parent.remove(mesh);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

/**
 * Builds one caster corner: basket-side swivel pivot, fork legs + connector + rolling wheel.
 *
 * @param {RaveGltfForkGroupDef} group
 * @param {Map<string, THREE.Mesh>} meshByName
 * @param {THREE.Object3D} cartRoot CartVisual root — for world-space dev logging
 * @param {THREE.Object3D} modelRoot `RaveGltfModel` — caster assembly parent + bbox space
 * @param {THREE.Mesh | null | undefined} bodyMesh `tripo_part_0` / CartFrame
 * @returns {RaveGltfCasterRuntime | null}
 */
function buildRaveGltfCasterCorner(group, meshByName, cartRoot, modelRoot, bodyMesh) {
  const connectorMesh = meshByName.get(group.swivelHub);
  if (!connectorMesh) return null;

  /** @type {THREE.Mesh[]} */
  const forkMeshes = [];
  for (const partName of group.forkParts) {
    const mesh = meshByName.get(partName);
    if (mesh?.userData.raveGltfPartRole === "fork") forkMeshes.push(mesh);
  }
  if (forkMeshes.length === 0) return null;

  const { authored: authoredAttach, target: targetAttach, baseKingpin } = computeRaveGltfCasterAttachPoints(
    forkMeshes,
    bodyMesh,
    group.label,
    modelRoot,
  );
  const primaryForkMesh = pickPrimaryRaveGltfForkMesh(forkMeshes);
  const authoredForkYaw = primaryForkMesh
    ? computeRaveGltfAuthoredForkYaw(primaryForkMesh)
    : 0;

  const swivelPivot = new THREE.Group();
  swivelPivot.name = `RaveGltfForkPivot_${group.id}`;
  swivelPivot.quaternion.identity();
  swivelPivot.scale.set(1, 1, 1);

  const wheelMesh = meshByName.get(group.wheel);

  /** @type {THREE.Group | null} */
  let rollPivot = null;
  /** @type {number} */
  let wheelRadius = RAVE_GLTF_WHEEL_RADIUS_FALLBACK * raveGltfTuning.scale;
  /** @type {"x" | "y" | "z"} */
  let wheelRollAxis = RAVE_GLTF_WHEEL_ROLL_AXIS;

  if (wheelMesh?.userData.raveGltfPartRole === "wheel") {
    rollPivot = new THREE.Group();
    rollPivot.name = `RaveGltfWheelPivot_${wheelMesh.name}`;
    wheelRollAxis = detectRaveGltfWheelRollAxis(wheelMesh.geometry);
    rollPivot.userData.wheelRollAxis = wheelRollAxis;
  }

  modelRoot.add(swivelPivot);
  swivelPivot.userData.forkGroupId = group.id;

  /** @type {RaveGltfCasterRuntime} */
  const caster = {
    id: group.id,
    swivelPivot,
    rollPivot,
    authoredForkYaw,
    hubLocalX: targetAttach.x * raveGltfTuning.scale,
    hubLocalZ: targetAttach.z * raveGltfTuning.scale,
    smoothedHeading: authoredForkYaw,
    wheelRoll: 0,
    wheelRadius,
    wheelRollAxis,
  };

  layoutRaveGltfCasterAssembly(
    caster,
    connectorMesh,
    forkMeshes,
    wheelMesh,
    authoredAttach,
    targetAttach,
    modelRoot,
  );

  swivelPivot.rotation.y = caster.smoothedHeading - authoredForkYaw;

  if (import.meta.env?.DEV) {
    logRaveGltfCasterKingpinDiagnostics(
      "build",
      group.id,
      group.label,
      cartRoot,
      modelRoot,
      baseKingpin,
      authoredAttach,
      targetAttach,
      connectorMesh,
      primaryForkMesh,
    );
  }

  return caster;
}

/**
 * Pre-scale vertical span of meshes that will join `RaveGltfBodyScale` (model-local units).
 *
 * @param {THREE.Mesh[]} bodyMeshes
 * @returns {number}
 */
function measureRaveGltfBodyMeshesHeight(bodyMeshes) {
  _bodyBbox.makeEmpty();

  for (const mesh of bodyMeshes) {
    if (!mesh.geometry) continue;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) continue;

    const p = mesh.position;
    const sx = mesh.scale.x;
    const sy = mesh.scale.y;
    const sz = mesh.scale.z;

    _modelLocalScratch.set(p.x + bb.min.x * sx, p.y + bb.min.y * sy, p.z + bb.min.z * sz);
    _bodyBbox.expandByPoint(_modelLocalScratch);
    _modelLocalScratch.set(p.x + bb.max.x * sx, p.y + bb.max.y * sy, p.z + bb.max.z * sz);
    _bodyBbox.expandByPoint(_modelLocalScratch);
  }

  if (_bodyBbox.isEmpty()) return 0.5;
  return _bodyBbox.max.y - _bodyBbox.min.y;
}

/**
 * Scales basket / trim above the fork line about the wheel-mount centroid; forks + wheels stay fixed.
 *
 * @param {THREE.Object3D} model `RaveGltfModel` group
 */
function applyRaveGltfBodyScale(model) {
  if (raveGltfTuning.bodyScale === 1 || model.getObjectByName("RaveGltfBodyScale")) return;

  /** @type {THREE.Mesh[]} */
  const wheelMeshes = [];
  /** @type {THREE.Mesh[]} */
  const bodyMeshes = [];

  model.traverse((child) => {
    if (!child.isMesh) return;
    const role = child.userData.raveGltfPartRole || resolveRaveGltfPartRole(child);
    if (role === "wheel") wheelMeshes.push(child);
    else if (role === "body" || role === "handle" || role === "face" || role === "trim") {
      bodyMeshes.push(child);
    }
  });

  if (wheelMeshes.length === 0 || bodyMeshes.length === 0) return;

  const bodyHeight = measureRaveGltfBodyMeshesHeight(bodyMeshes);
  const bodyYDrop = bodyHeight * raveGltfTuning.bodyYDrop;

  _bodyScalePivot.set(0, 0, 0);
  for (const wheel of wheelMeshes) _bodyScalePivot.add(wheel.position);
  _bodyScalePivot.multiplyScalar(1 / wheelMeshes.length);

  const bodyGroup = new THREE.Group();
  bodyGroup.name = "RaveGltfBodyScale";
  bodyGroup.position.set(_bodyScalePivot.x, _bodyScalePivot.y - bodyYDrop, _bodyScalePivot.z);
  bodyGroup.scale.setScalar(raveGltfTuning.bodyScale);
  bodyGroup.userData.raveGltfScalePivotY = _bodyScalePivot.y;
  bodyGroup.userData.raveGltfBodyHeight = bodyHeight;
  model.add(bodyGroup);

  for (const mesh of bodyMeshes) {
    mesh.parent?.remove(mesh);
    mesh.position.sub(_bodyScalePivot);
    bodyGroup.add(mesh);
  }

  if (import.meta.env?.DEV) {
    console.debug(
      `[cartRaveGltf] body scale: scale=${raveGltfTuning.bodyScale} ` +
        `yDrop=${bodyYDrop.toFixed(3)} (${(raveGltfTuning.bodyYDrop * 100).toFixed(0)}% of height ${bodyHeight.toFixed(3)}) ` +
        `pivot=(${_bodyScalePivot.x.toFixed(3)}, ${_bodyScalePivot.y.toFixed(3)}, ${_bodyScalePivot.z.toFixed(3)})`,
    );
  }
}

/**
 * Reapplies `raveGltfTuning.bodyYDrop` on an existing `RaveGltfBodyScale` group.
 *
 * @param {THREE.Group} bodyGroup
 */
function applyRaveGltfBodyYDropToGroup(bodyGroup) {
  const pivotY = bodyGroup.userData.raveGltfScalePivotY;
  const bodyHeight = bodyGroup.userData.raveGltfBodyHeight;
  if (typeof pivotY !== "number" || typeof bodyHeight !== "number") return;
  bodyGroup.position.y = pivotY - bodyHeight * raveGltfTuning.bodyYDrop;
}

/**
 * Reapplies live `raveGltfTuning` on one rave GLTF cart (body drop + caster corner inset).
 *
 * @param {THREE.Object3D} cartRoot `CartVisual` root with `userData.isRaveGltf`
 */
export function reapplyRaveGltfCartTuning(cartRoot) {
  if (!cartRoot?.userData?.isRaveGltf) return;

  const model = cartRoot.getObjectByName("RaveGltfModel");
  if (!model) return;

  model.scale.setScalar(raveGltfTuning.scale);
  model.position.y = raveGltfTuning.yOffset;

  const bodyGroup = model.getObjectByName("RaveGltfBodyScale");
  if (bodyGroup) {
    bodyGroup.scale.setScalar(raveGltfTuning.bodyScale);
    applyRaveGltfBodyYDropToGroup(bodyGroup);
  }

  const data = cartRoot.userData.cartVisual;
  if (!data?.casters?.length || _sourceLayout !== "cartrave4") return;

  const bodyMesh = cartRoot.getObjectByName("CartFrame") ?? model.getObjectByName("CartFrame");
  /** @type {Map<string, THREE.Mesh>} */
  const meshByName = new Map();
  model.traverse((child) => {
    if (child.isMesh && child.name) meshByName.set(child.name, child);
  });

  let maxWheelRadius = RAVE_GLTF_WHEEL_RADIUS_FALLBACK * raveGltfTuning.scale;

  for (const caster of data.casters) {
    const group = RAVE_GLTF_V4_FORK_GROUPS.find((g) => g.id === caster.id);
    if (!group) continue;

    const connectorMesh = meshByName.get(group.swivelHub);
    /** @type {THREE.Mesh[]} */
    const forkMeshes = [];
    for (const partName of group.forkParts) {
      const mesh = meshByName.get(partName);
      if (mesh?.userData.raveGltfPartRole === "fork") forkMeshes.push(mesh);
    }
    if (!connectorMesh || forkMeshes.length === 0) continue;

    const { authored, target } = computeRaveGltfCasterAttachPoints(
      forkMeshes,
      bodyMesh,
      group.label,
      model,
    );

    const wheelMesh = caster.rollPivot?.children[0];

    layoutRaveGltfCasterAssembly(
      caster,
      connectorMesh,
      forkMeshes,
      wheelMesh?.isMesh ? wheelMesh : undefined,
      authored,
      target,
      model,
    );

    if (caster.wheelRadius) {
      maxWheelRadius = Math.max(maxWheelRadius, caster.wheelRadius);
    }
  }

  data.wheelRadius = maxWheelRadius;
}

/**
 * Logs kingpin / swivel world positions for every rave GLTF cart in a scene (dev).
 *
 * @param {THREE.Object3D} scene
 */
export function logRaveGltfCasterPivotsOnScene(scene) {
  if (!import.meta.env?.DEV) return;

  scene.traverse((obj) => {
    if (!obj.userData?.isRaveGltf) return;
    const model = obj.getObjectByName("RaveGltfModel");
    const data = obj.userData.cartVisual;
    if (!model || !data?.casters?.length) return;

    const bodyMesh = obj.getObjectByName("CartFrame") ?? model.getObjectByName("CartFrame");
    /** @type {Map<string, THREE.Mesh>} */
    const meshByName = new Map();
    model.traverse((child) => {
      if (child.isMesh && child.name) meshByName.set(child.name, child);
    });

    for (const caster of data.casters) {
      const group = RAVE_GLTF_V4_FORK_GROUPS.find((g) => g.id === caster.id);
      if (!group) continue;

      const connectorMesh = meshByName.get(group.swivelHub);
      /** @type {THREE.Mesh[]} */
      const forkMeshes = [];
      for (const partName of group.forkParts) {
        const mesh = meshByName.get(partName);
        if (mesh?.userData.raveGltfPartRole === "fork") forkMeshes.push(mesh);
      }
      if (!connectorMesh || forkMeshes.length === 0) continue;

      const { authored, target, baseKingpin } = computeRaveGltfCasterAttachPoints(
        forkMeshes,
        bodyMesh,
        group.label,
        model,
      );

      logRaveGltfCasterKingpinDiagnostics(
        "inspect",
        caster.id,
        group.label,
        obj,
        model,
        baseKingpin,
        authored,
        target,
        connectorMesh,
        pickPrimaryRaveGltfForkMesh(forkMeshes),
      );
    }
  });
}

/**
 * Reapplies `raveGltfTuning` on every rave GLTF cart in a scene.
 *
 * @param {THREE.Object3D} scene
 */
export function reapplyRaveGltfCartTuningOnScene(scene) {
  scene.traverse((obj) => {
    if (obj.userData?.isRaveGltf) reapplyRaveGltfCartTuning(obj);
  });
}

/**
 * Parents sunglasses meshes into one static group so they move and tint as a unit.
 *
 * @param {THREE.Object3D} model `RaveGltfModel` (or `RaveGltfBodyScale` subtree)
 */
function groupRaveGltfFaceAssembly(model) {
  if (!model || model.getObjectByName("RaveGltfFaceGroup")) return;

  /** @type {THREE.Mesh[]} */
  const meshes = [];
  for (const partName of RAVE_GLTF_V4_FACE_PARTS) {
    const mesh = model.getObjectByName(partName);
    if (mesh?.isMesh) meshes.push(mesh);
  }
  if (meshes.length < 2) return;

  _bodyScalePivot.set(0, 0, 0);
  for (const mesh of meshes) _bodyScalePivot.add(mesh.position);
  _bodyScalePivot.multiplyScalar(1 / meshes.length);

  const parent = meshes[0].parent;
  if (!parent) return;

  const faceGroup = new THREE.Group();
  faceGroup.name = "RaveGltfFaceGroup";
  faceGroup.position.copy(_bodyScalePivot);
  parent.add(faceGroup);

  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    mesh.position.sub(_bodyScalePivot);
    mesh.userData.isFace = true;
    mesh.userData.raveGltfPartRole = "face";
    faceGroup.add(mesh);
  }
}

/**
 * Tags meshes, binds CartFrame, and adds simple roll/swivel pivots for main wheels + forks.
 *
 * @param {THREE.Object3D} root CartVisual root
 */
function bindRaveGltfCartParts(root) {
  const model = root.getObjectByName("RaveGltfModel") || root;

  if (_sourceLayout === "cartrave4") {
    groupRaveGltfFaceAssembly(model);
  }

  /** @type {THREE.Mesh[]} */
  const animMeshes = [];
  /** @type {Map<string, THREE.Mesh>} */
  const meshByName = new Map();

  model.traverse((child) => {
    if (!child.isMesh) return;
    const role = resolveRaveGltfPartRole(child);
    child.userData.raveGltfPartRole = role;
    if (child.name) meshByName.set(child.name, child);

    if (role === "body") {
      child.name = "CartFrame";
      child.userData.isCartFrame = true;
      child.userData.preserveGltfMaps = true;
      meshByName.set("CartFrame", child);
    } else if (role === "handle") {
      child.userData.isHandle = true;
    } else if (role === "face") {
      child.userData.isFace = true;
    } else if (role === "wheel" || role === "fork") {
      animMeshes.push(child);
    }
  });

  logRaveGltfPartRoleAssignments(model);

  if (!root.getObjectByName("CartFrame")) {
    console.warn(`[cartRaveGltf] No body mesh (${RAVE_GLTF_FRAME_MESH}) found for CartFrame binding.`);
  }

  /** @type {THREE.Group[]} */
  const forkPivots = [];
  /** @type {THREE.Group[]} */
  const wheelPivots = [];
  /** @type {RaveGltfCasterRuntime[]} */
  const casters = [];
  let wheelRadius = RAVE_GLTF_WHEEL_RADIUS_FALLBACK * raveGltfTuning.scale;
  const wheelRollAxis =
    _sourceLayout === "cartrave4" ? RAVE_GLTF_WHEEL_ROLL_AXIS : RAVE_GLTF_WHEEL_ROLL_AXIS_LEGACY;
  const legacySwivelOnly = _sourceLayout === "legacy";

  if (_sourceLayout === "cartrave4") {
    const model = root.getObjectByName("RaveGltfModel") || root;
    const bodyMesh = meshByName.get("CartFrame") ?? meshByName.get(RAVE_GLTF_FRAME_MESH);

    for (const group of RAVE_GLTF_V4_FORK_GROUPS) {
      const caster = buildRaveGltfCasterCorner(group, meshByName, root, model, bodyMesh);
      if (!caster) continue;

      casters.push(caster);
      forkPivots.push(caster.swivelPivot);
      if (caster.rollPivot) wheelPivots.push(caster.rollPivot);
      wheelRadius = Math.max(caster.wheelRadius, wheelRadius);

      if (import.meta.env?.DEV) {
        caster.swivelPivot.getWorldPosition(_worldPosScratch);
        const groupOffset = RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS[caster.id] ?? 0;
        console.debug(
          `[cartRaveGltf] caster ${caster.id} (${group.label}) bound: ` +
            `authoredForkYaw=${caster.authoredForkYaw.toFixed(3)} ` +
            `smoothedHeading=${caster.smoothedHeading.toFixed(3)} ` +
            `groupOffset=${groupOffset.toFixed(3)} ` +
            `anchor=(${caster.hubLocalX.toFixed(3)}, ${caster.hubLocalZ.toFixed(3)}) ` +
            `pivotWorld=(${_worldPosScratch.x.toFixed(3)}, ${_worldPosScratch.y.toFixed(3)}, ${_worldPosScratch.z.toFixed(3)}) ` +
            `radius=${caster.wheelRadius.toFixed(3)}`,
        );
      }
    }
  } else {
    for (const mesh of animMeshes) {
      const parent = mesh.parent;
      if (!parent) continue;

      const role = mesh.userData.raveGltfPartRole;
      if (role === "fork" || legacySwivelOnly) {
        forkPivots.push(wrapRaveGltfAnimPivot(mesh, parent, `RaveGltfForkPivot_${mesh.name}`));
        continue;
      }

      wheelPivots.push(wrapRaveGltfAnimPivot(mesh, parent, `RaveGltfWheelPivot_${mesh.name}`));
      wheelRadius = Math.max(
        estimateRaveGltfWheelRadius(mesh.geometry) * raveGltfTuning.scale,
        wheelRadius,
      );
    }
  }

  root.userData.cartVisual = {
    isRaveGltf: true,
    casters,
    forkPivots,
    wheelPivots,
    wheelRadius,
    wheelRollAxis,
    wheelRollEnabled: !legacySwivelOnly,
  };

  if (import.meta.env?.DEV) {
    console.debug(
      `[cartRaveGltf] Anim pivots: ${casters.length || wheelPivots.length} casters, ` +
        `radius≈${wheelRadius.toFixed(3)}, defaultRollAxis=${wheelRollAxis}`,
    );
    for (const caster of casters) {
      console.debug(
        `  caster ${caster.id} rollAxis=${caster.wheelRollAxis} parts hub+wheel independent`,
      );
    }
    for (const pivot of wheelPivots) {
      if (casters.some((c) => c.rollPivot === pivot)) continue;
      const mesh = pivot.children[0];
      const axis = pivot.userData.wheelRollAxis || wheelRollAxis;
      console.debug(`  wheel pivot ← ${mesh?.name || "?"} rollAxis=${axis}`);
    }
    for (const pivot of forkPivots) {
      if (casters.some((c) => c.swivelPivot === pivot)) continue;
      console.debug(`  fork pivot ← ${pivot.name}`);
    }
  }
}

/** @param {number} neonHex @param {number} [intensityMul=1] */
function getRaveGltfTrimEmissiveIntensity(neonHex, intensityMul = 1) {
  const refHex = emissiveRefHexForNeonHex(neonHex);
  const emMul = RAVE_GLTF_EMISSIVE_MUL * RAVE_GLTF_TRIM_MASK_BOOST * intensityMul;
  return cartEmissiveIntensityForHex(refHex, emMul);
}

/** @param {THREE.Material} mat @param {number} neonHex @param {number} intensityMul */
function applyRaveGltfTrimEmissive(mat, neonHex, intensityMul = 1) {
  if (mat.emissive) {
    mat.emissive.setHex(neonHex);
  }
  if (typeof mat.emissiveIntensity === "number") {
    mat.emissiveIntensity = getRaveGltfTrimEmissiveIntensity(neonHex, intensityMul);
  }
}

/** @param {THREE.Material} mat @param {number} neonHex @param {number} strength */
function applyRaveGltfBodyTint(mat, neonHex, strength) {
  if (!mat?.color || strength <= 0) return;

  if (strength >= 1) {
    mat.color.setHex(neonHex);
    mat.needsUpdate = true;
    return;
  }

  const authored = mat.userData?.raveGltfAuthoredColor;
  if (authored?.isColor) _bodyTintScratch.copy(authored);
  else _bodyTintScratch.setRGB(1, 1, 1);

  _bodyTintNeon.setHex(neonHex);
  mat.color.copy(_bodyTintScratch).lerp(_bodyTintNeon, strength);
  mat.needsUpdate = true;
}

/** @param {string} url @returns {Promise<THREE.Group>} */
function loadRaveGltfFromUrl(url) {
  return new Promise((resolve, reject) => {
    const loader = getLoader();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`[cartRaveGltf] Timed out loading ${url}`));
    }, LOAD_TIMEOUT_MS);

    loader.load(
      url,
      (gltf) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** @returns {Promise<{ scene: THREE.Group, url: string }>} */
async function loadRaveGltfSourceScene() {
  /** @type {Error | null} */
  let lastError = null;

  try {
    const scene = await loadRaveGltfFromUrl(RAVE_GLTF_URL);
    return { scene, url: RAVE_GLTF_URL };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      `[cartRaveGltf] Primary asset unavailable (${RAVE_GLTF_URL}), trying legacy fallback.`,
      lastError.message,
    );
  }

  try {
    const scene = await loadRaveGltfFromUrl(RAVE_GLTF_URL_LEGACY);
    console.warn(
      `[cartRaveGltf] Fell back to legacy monolithic GLTF (${RAVE_GLTF_URL_LEGACY}) — ${RAVE_GLTF_URL} failed to load.`,
    );
    return { scene, url: RAVE_GLTF_URL_LEGACY };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      `[cartRaveGltf] Legacy asset unavailable (${RAVE_GLTF_URL_LEGACY}), trying Draco fallback.`,
      lastError.message,
    );
  }

  try {
    const scene = await loadRaveGltfFromUrl(RAVE_GLTF_URL_DRACO);
    console.warn(
      `[cartRaveGltf] Fell back to Draco-compressed legacy GLTF (${RAVE_GLTF_URL_DRACO}) — cartrave4 is not loaded.`,
    );
    return { scene, url: RAVE_GLTF_URL_DRACO };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  throw lastError ?? new Error("[cartRaveGltf] Failed to load rave GLTF.");
}

/** @returns {boolean} */
export function isRaveGltfSourceReady() {
  return _sourceScene !== null;
}

/** @returns {string | null} */
export function getRaveGltfLoadedUrl() {
  return _loadedUrl;
}

/** @returns {Promise<THREE.Group>} */
export function prefetchRaveGltf() {
  return ensureRaveGltfSource();
}

/** @returns {Promise<THREE.Group>} */
function ensureRaveGltfSource() {
  if (_sourceScene) return Promise.resolve(_sourceScene);
  if (_loadPromise) return _loadPromise;

  _loadPromise = loadRaveGltfSourceScene()
    .then(({ scene, url }) => {
      scene.name = scene.name || "RaveCartGltfSource";
      _loadedUrl = url;
      _sourceLayout = detectRaveGltfLayout(scene, url);

      if (url !== RAVE_GLTF_URL) {
        console.warn(
          `[cartRaveGltf] Using fallback GLTF (${url}) instead of primary ${RAVE_GLTF_URL}.`,
        );
      }

      if (import.meta.env?.DEV) {
        const names = [];
        scene.traverse((child) => {
          if (child.isMesh) names.push(child.name || "(unnamed mesh)");
        });
        console.debug(
          `[cartRaveGltf] Loaded ${url} layout=${_sourceLayout} — meshes: ${names.join(", ") || "(none)"}`,
        );
      }

      _sourceScene = scene;
      logRaveGltfCasterSourceHierarchy(scene);
      return scene;
    })
    .catch((err) => {
      _loadPromise = null;
      console.warn("[cartRaveGltf] Failed to load rave GLTF:", err);
      throw err;
    });

  return _loadPromise;
}

/** @returns {THREE.Group} */
export function createRaveGltfCartInstance() {
  if (!_sourceScene) {
    throw new Error("[cartRaveGltf] Source not loaded — call prefetchRaveGltf() first.");
  }

  const root = new THREE.Group();
  root.name = "CartVisual";
  root.userData.isRaveGltf = true;
  root.userData.cartThemeId = "rave";

  const model = new THREE.Group();
  model.name = "RaveGltfModel";
  applyRaveGltfOrientationCorrection(model);
  model.scale.setScalar(raveGltfTuning.scale);
  model.position.y = raveGltfTuning.yOffset;

  /**
   * @param {THREE.Object3D} src
   * @param {THREE.Object3D} parent
   */
  const cloneHierarchy = (src, parent) => {
    if (src.isMesh) {
      const srcMat = Array.isArray(src.material) ? src.material[0] : src.material;
      const role = resolveRaveGltfPartRole(src);
      const material = cloneRaveGltfMaterial(srcMat, role);

      const mesh = new THREE.Mesh(src.geometry, material);
      mesh.name = src.name;
      mesh.position.copy(src.position);
      mesh.quaternion.copy(src.quaternion);
      mesh.scale.copy(src.scale);
      mesh.userData.raveGltfPartRole = role;
      parent.add(mesh);
      return;
    }

    const node = new THREE.Group();
    node.name = src.name;
    node.position.copy(src.position);
    node.quaternion.copy(src.quaternion);
    node.scale.copy(src.scale);
    parent.add(node);

    for (const child of src.children) {
      cloneHierarchy(child, node);
    }
  };

  for (const child of _sourceScene.children) {
    cloneHierarchy(child, model);
  }

  root.add(model);
  return root;
}

/** @param {THREE.Object3D} root @returns {CartThemeMaterialCache} */
export function buildRaveGltfMaterialCache(root) {
  const accentMats = [];
  const frameBodyMats = [];
  const frameGlowMats = [];
  const frameMats = [];
  const seen = new Set();

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData?.isCartPatternLayer) return;

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);

      const role = mat.userData?.raveGltfPartRole;
      if (role === "wheel" || role === "fork" || role === "handle" || role === "face") continue;

      frameMats.push(mat);
      if (role === "body") frameBodyMats.push(mat);

      if (mat.emissiveMap || mat.userData?.raveGltfHasEmissiveAccent) {
        accentMats.push(mat);
        if (mat.emissive) frameGlowMats.push(mat);
      }
    }
  });

  if (accentMats.length === 0) {
    console.warn("[cartRaveGltf] No trim emissive accent — neon bloom may be weak.");
  }

  return {
    isRaveGltf: true,
    frameMats,
    frameBodyMats,
    accentMats,
    frameGlowMats,
  };
}

/** @param {CartThemeMaterialCache | null | undefined} cache @param {number} neonHex @param {number} [intensityMul=1] @param {number} [bodyTintStrength=RAVE_GLTF_BODY_TINT_STRENGTH] */
export function applyRaveGltfColorToCache(
  cache,
  neonHex,
  intensityMul = 1,
  bodyTintStrength = RAVE_GLTF_BODY_TINT_STRENGTH,
) {
  if (!cache?.frameMats?.length) return;

  for (const mat of cache.frameBodyMats || []) {
    applyRaveGltfBodyTint(mat, neonHex, bodyTintStrength);
    mat.needsUpdate = true;
  }

  for (const mat of cache.accentMats || []) {
    applyRaveGltfTrimEmissive(mat, neonHex, intensityMul);
    mat.needsUpdate = true;
  }
}

/** @param {CartThemeMaterialCache | null | undefined} cache @param {number} neonHex @param {number} glowPulse @param {number} glowIntensity @param {number} [bodyTintStrength=RAVE_GLTF_BODY_TINT_STRENGTH] */
export function applyRaveGltfLeaderGlow(
  cache,
  neonHex,
  glowPulse,
  glowIntensity,
  bodyTintStrength = RAVE_GLTF_BODY_TINT_STRENGTH,
) {
  if (!cache?.frameMats?.length) return;

  const whiteMix = glowPulse ** 3;
  const baseIntensity = getRaveGltfTrimEmissiveIntensity(neonHex, 1);
  const r = ((neonHex >> 16) & 255) / 255;
  const g = ((neonHex >> 8) & 255) / 255;
  const b = (neonHex & 255) / 255;

  for (const mat of cache.frameBodyMats || []) {
    if (!mat.color) continue;
    applyRaveGltfBodyTint(mat, neonHex, bodyTintStrength);
    mat.color.setRGB(
      mat.color.r + (1 - mat.color.r) * whiteMix,
      mat.color.g + (1 - mat.color.g) * whiteMix,
      mat.color.b + (1 - mat.color.b) * whiteMix,
    );
    mat.needsUpdate = true;
  }

  for (const mat of cache.accentMats || []) {
    if (!mat.emissive) {
      mat.needsUpdate = true;
      continue;
    }

    mat.emissive.setRGB(
      r + (1 - r) * whiteMix,
      g + (1 - g) * whiteMix,
      b + (1 - b) * whiteMix,
    );
    if (typeof mat.emissiveIntensity === "number") {
      mat.emissiveIntensity = baseIntensity * (1 - whiteMix) + glowIntensity * whiteMix;
    }
    mat.needsUpdate = true;
  }
}

/**
 * Cart-local planar velocity at a caster hub (cm velocity + yaw spin about cart Y).
 *
 * @param {number} localVelX
 * @param {number} localVelZ
 * @param {number} localOmegaY
 * @param {number} hubLocalX
 * @param {number} hubLocalZ
 * @returns {{ vx: number, vz: number, speed: number, omega: number }}
 */
function computeRaveGltfCasterCornerLocalVel(
  localVelX,
  localVelZ,
  localOmegaY,
  hubLocalX,
  hubLocalZ,
) {
  const omega = localOmegaY * RAVE_GLTF_CASTER_ANGVEL_MUL;
  const vx = localVelX + omega * hubLocalZ;
  const vz = localVelZ - omega * hubLocalX;
  return { vx, vz, speed: Math.hypot(vx, vz), omega };
}

/**
 * Car-like caster steer target vs pure velocity trailing.
 *
 * Old behavior: `atan2(cornerVx, cornerVz)` — each hub trails its rigid-body corner
 * velocity (free-spinning shopping-cart casters).
 *
 * New behavior: body travel direction + explicit yaw-rate steering offset. Front casters
 * get the full offset; rear casters get a smaller same-direction offset (mild 4WS). A
 * small `trailBlend` keeps slight corner slip for motion readability at speed.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {number} localVelX Cart-local planar body velocity X.
 * @param {number} localVelZ Cart-local planar body velocity Z.
 * @param {number} scaledOmegaY Yaw rate after {@link RAVE_GLTF_CASTER_ANGVEL_MUL}.
 * @param {number} cornerVelVx Per-hub trail velocity X (rigid-body kinematics).
 * @param {number} cornerVelVz Per-hub trail velocity Z.
 * @returns {number} Absolute cart-local target heading (rad).
 */
function computeRaveGltfCasterSteerTargetHeading(
  caster,
  localVelX,
  localVelZ,
  scaledOmegaY,
  cornerVelVx,
  cornerVelVz,
) {
  const trailHeading = Math.atan2(cornerVelVx, cornerVelVz);
  const bodySpeed = Math.hypot(localVelX, localVelZ);
  const bodyTravelHeading = bodySpeed > 1e-4
    ? Math.atan2(localVelX, localVelZ)
    : caster.smoothedHeading;

  const isFrontAxle = caster.hubLocalX > 0;
  const axleSteerMul = isFrontAxle
    ? raveGltfTuning.frontSteerMul
    : raveGltfTuning.rearSteerMul;
  const steerOffset = scaledOmegaY * raveGltfTuning.steeringInfluence * axleSteerMul;
  const carSteerHeading = bodyTravelHeading + steerOffset;

  const blend = raveGltfTuning.trailBlend;
  if (blend <= 0) return carSteerHeading;
  if (blend >= 1) return trailHeading;
  return lerpAngle(carSteerHeading, trailHeading, blend);
}

/**
 * Applies absolute trail heading to a swivel pivot using its authored rest offset.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {number} heading Absolute cart-local trail heading (rad).
 */
function applyRaveGltfCasterHeading(caster, heading) {
  caster.smoothedHeading = heading;
  setObjectAxisRotation(
    caster.swivelPivot,
    RAVE_GLTF_CASTER_SWIVEL_AXIS,
    heading - caster.authoredForkYaw,
  );
}

/**
 * Resets caster yaw + wheel roll after teleport / respawn.
 *
 * @param {THREE.Object3D} root
 */
export function resetRaveGltfCartVisualState(root) {
  const data = root.userData.cartVisual;
  if (!data?.isRaveGltf) return;

  const rollAxis = data.wheelRollAxis || RAVE_GLTF_WHEEL_ROLL_AXIS;

  for (const caster of data.casters || []) {
    caster.wheelRoll = 0;
    applyRaveGltfCasterHeading(caster, caster.authoredForkYaw + RAVE_GLTF_CASTER_SWIVEL_REST_YAW);

    if (!caster.rollPivot) continue;
    setObjectAxisRotation(
      caster.rollPivot,
      caster.wheelRollAxis || rollAxis,
      RAVE_GLTF_WHEEL_AXIS_CORRECTION,
    );
  }

  for (const pivot of data.forkPivots || []) {
    if ((data.casters || []).some((c) => c.swivelPivot === pivot)) continue;
    setObjectAxisRotation(pivot, RAVE_GLTF_CASTER_SWIVEL_AXIS, RAVE_GLTF_CASTER_SWIVEL_REST_YAW);
  }

  for (const pivot of data.wheelPivots || []) {
    if ((data.casters || []).some((c) => c.rollPivot === pivot)) continue;
    pivot.userData.wheelRoll = 0;
    const axis = pivot.userData.wheelRollAxis || rollAxis;
    setObjectAxisRotation(pivot, axis, RAVE_GLTF_WHEEL_AXIS_CORRECTION);
  }
}

/**
 * Per-frame independent caster swivel + wheel roll.
 *
 * Swivel: car-like body heading + yaw-rate steer (front strong, rear mild); clamped per
 * caster around `authoredForkYaw`. Wheel roll: unchanged rigid-body corner kinematics.
 *
 * @param {THREE.Object3D} root CartVisual root
 * @param {THREE.Vector3} linvelWorld
 * @param {number} dtSec
 * @param {THREE.Vector3 | null | undefined} [angvelWorld]
 */
export function updateRaveGltfCartVisuals(root, linvelWorld, dtSec, angvelWorld = null) {
  const data = root.userData.cartVisual;
  if (!data?.isRaveGltf) return;

  root.getWorldQuaternion(_rootWorld);
  _rootInv.copy(_rootWorld).invert();
  _modelInvQuat.setFromAxisAngle(_forkForward.set(0, 1, 0), -RAVE_GLTF_ORIENTATION_Y);
  _localVel.set(linvelWorld.x, 0, linvelWorld.z).applyQuaternion(_rootInv).applyQuaternion(_modelInvQuat);

  let localOmegaY = 0;
  if (angvelWorld) {
    _localAngvel.copy(angvelWorld).applyQuaternion(_rootInv);
    localOmegaY = _localAngvel.y;
  }

  const swivelAlpha = 1 - (1 - raveGltfTuning.swivelDamping) ** Math.min(240 * dtSec, 1);
  const rollEnabled = data.wheelRollEnabled !== false;
  const casters = /** @type {RaveGltfCasterRuntime[]} */ (data.casters || []);

  if (casters.length === 0) return;

  for (const caster of casters) {
    const cornerVel = computeRaveGltfCasterCornerLocalVel(
      _localVel.x,
      _localVel.z,
      localOmegaY,
      caster.hubLocalX,
      caster.hubLocalZ,
    );

    const shouldSteer =
      cornerVel.speed >= RAVE_GLTF_CASTER_SWIVEL_MIN_SPEED
      || Math.abs(cornerVel.omega) >= raveGltfTuning.steeringMinOmega;

    if (shouldSteer) {
      const groupOffset = RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS[caster.id] ?? 0;
      const targetHeading = computeRaveGltfCasterSteerTargetHeading(
        caster,
        _localVel.x,
        _localVel.z,
        cornerVel.omega,
        cornerVel.vx,
        cornerVel.vz,
      )
        + RAVE_GLTF_CASTER_SWIVEL_YAW_OFFSET
        + groupOffset;
      const restHeading = caster.authoredForkYaw;
      const clampedTarget = clampAngleToRange(
        targetHeading,
        restHeading,
        getRaveGltfSwivelMaxAngle(),
      );
      const nextHeading = clampAngleToRange(
        lerpAngle(caster.smoothedHeading, clampedTarget, swivelAlpha),
        restHeading,
        getRaveGltfSwivelMaxAngle(),
      );
      applyRaveGltfCasterHeading(caster, nextHeading);
    } else {
      // * Hold last heading — real casters do not snap back to a shared rest angle.
      applyRaveGltfCasterHeading(
        caster,
        clampAngleToRange(
          caster.smoothedHeading,
          caster.authoredForkYaw,
          getRaveGltfSwivelMaxAngle(),
        ),
      );
    }

    if (!rollEnabled || !caster.rollPivot) continue;

    if (cornerVel.speed >= RAVE_GLTF_WHEEL_ROLL_MIN_SPEED) {
      const heading = caster.smoothedHeading;
      const signedSpeed =
        cornerVel.vx * Math.sin(heading) + cornerVel.vz * Math.cos(heading);
      caster.wheelRoll +=
        (signedSpeed / Math.max(caster.wheelRadius, 1e-4))
        * dtSec
        * RAVE_GLTF_WHEEL_ROLL_SPEED_MUL;
    }

    setObjectAxisRotation(
      caster.rollPivot,
      caster.wheelRollAxis,
      caster.wheelRoll + RAVE_GLTF_WHEEL_AXIS_CORRECTION,
    );
  }
}

/** @param {THREE.Object3D} root @param {number} neonHex @param {string} [patternId="classic"] @param {number} [bodyTintStrength=RAVE_GLTF_BODY_TINT_STRENGTH] @returns {CartThemeMaterialCache} */
export function prepareRaveGltfCart(
  root,
  neonHex,
  patternId = "classic",
  bodyTintStrength = RAVE_GLTF_BODY_TINT_STRENGTH,
) {
  const model = root.getObjectByName("RaveGltfModel");
  if (import.meta.env?.DEV) {
    console.debug(
      `[cartRaveGltf] proportions: scale=${raveGltfTuning.scale} yOffset=${raveGltfTuning.yOffset} ` +
        `bodyScale=${raveGltfTuning.bodyScale} bodyYDrop=${raveGltfTuning.bodyYDrop}`,
    );
  }
  if (model) applyRaveGltfBodyScale(model);
  bindRaveGltfCartParts(root);
  const cache = buildRaveGltfMaterialCache(root);
  applyRaveGltfColorToCache(cache, neonHex, 1, bodyTintStrength);
  applyCartPattern(root, patternId, neonHex);
  return cache;
}

/** Dev aid — logs one mesh material summary. @param {THREE.Mesh} mesh */
export function logRaveGltfPartTags(mesh) {
  if (!mesh) return;
  const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  console.debug(
    `[cartRaveGltf] ${mesh.name} role=${mesh.userData?.raveGltfPartRole || "?"} mat=${srcMat?.name || "?"}`,
  );
}

/** @param {THREE.Object3D} root */
export function tagRaveGltfPartsForDebug(root) {
  root.traverse((child) => {
    if (child.isMesh) logRaveGltfPartTags(child);
  });
}

/** @param {THREE.Object3D | null | undefined} root */
export function disposeRaveGltfInstance(root) {
  if (!root) return;

  const disposedMats = new Set();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const ud = child.userData || {};

    if (ud.sharesCartFrameGeometry) {
      if (ud.isCartPatternLayer && child.material) {
        disposeMaterialOnce(child.material, disposedMats);
      }
      return;
    }

    disposeMaterialOnce(child.material, disposedMats);
  });
}
