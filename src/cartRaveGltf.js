/**
 * cartRaveGltf.js — Segmented rave-theme GLTF cart loader, materials, independent caster motion.
 *
 * Primary asset: `cartrave4.glb` — Tripo color segments for body / wheels / forks / trim.
 * Four composite casters each swivel toward their own rigid-body trail heading and roll
 * independently. Brackets and small trim stay static.
 *
 * cartrave4 animate vs static:
 *   body=tripo_part_0, wheels=1/2/3/4 (roll inside fork swivel),
 *   fork groups (swivel at hub, wheel rolls inside):
 *     {hub:12, wheel:2, parts:5,12,21} {hub:19, wheel:1, parts:20,19,14}
 *     {hub:17, wheel:4, parts:13,17,22} {hub:18, wheel:3, parts:6,18}
 *   handle=8, face=7, static trim=9–11/15–16/23.
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
 * @property {THREE.Group} swivelPivot Y-axis swivel at the hub.
 * @property {THREE.Group | null} rollPivot Nested wheel roll pivot (child of swivel).
 * @property {number} authoredForkYaw Rest heading (rad) baked from hub → wheel layout.
 * @property {number} hubLocalX Hub X in `RaveGltfModel` space (for rigid-body corner velocity).
 * @property {number} hubLocalZ Hub Z in `RaveGltfModel` space.
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
 * Uniform scale on `RaveGltfModel` so the Tripo export matches procedural cart footprint
 * (~2.1 m length × ~1.35 m width). Authored bbox ≈ 0.93 × 1.0 × 0.83 m before scale.
 */
export const RAVE_GLTF_SCALE = 2.0;

/**
 * Vertical offset on `RaveGltfModel` (cart-local Y) so wheel bottoms sit at procedural caster
 * height (~y −1.11). Tripo origin is at the model floor; physics root is at the body center.
 */
export const RAVE_GLTF_Y_OFFSET = -1.1;

/**
 * Extra scale on body / handle / face only (pivot = wheel-mount centroid).
 * Wheels keep size and attachment points; basket grows uniformly (~20%).
 */
export const RAVE_GLTF_BODY_SCALE = 1.2;

/** How much the player neon shifts body albedo (0 = authored grey, 1 = full neon). */
export const RAVE_GLTF_BODY_TINT_STRENGTH = 1;

// --- Caster / wheel animation tuning ---

/** Multiplier on roll angle integrated from planar speed / wheel radius. */
export const RAVE_GLTF_WHEEL_ROLL_SPEED_MUL = 1.0;

/**
 * Exponential smoothing for caster swivel (0–1, higher = snappier).
 * Matches procedural cart.js `CASTER_YAW_DAMPING`.
 */
export const RAVE_GLTF_CASTER_SWIVEL_DAMPING = 0.28;

/** Planar speed (m/s) at a caster hub before that caster swivels toward its local trail heading. */
export const RAVE_GLTF_CASTER_SWIVEL_MIN_SPEED = 0.12;

/**
 * Planar speed (m/s) at a caster hub before its wheel stops accumulating roll.
 * Kept lower than swivel min so wheels coast visually while forks hold their last heading.
 */
export const RAVE_GLTF_WHEEL_ROLL_MIN_SPEED = 0.02;

/**
 * Scales rigid-body yaw rate (rad/s) when computing per-corner trail velocity.
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
 * Per-caster trail-heading tweak (radians) keyed by fork group id — applied at runtime only.
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
 * cartrave4 side-frame supports — tall angled/vertical body pieces, never animate.
 * @type {ReadonlySet<string>}
 */
const RAVE_GLTF_V4_STATIC_ANIM_EXCLUSIONS = new Set([
  "tripo_part_15",
  "tripo_part_16",
]);

/**
 * cartrave4 composite casters — fork sub-meshes swivel at `swivelHub`; paired `wheel` rolls inside.
 * @type {ReadonlyArray<{ id: number, swivelHub: string, wheel: string, parts: readonly string[] }>}
 */
const RAVE_GLTF_V4_FORK_GROUPS = Object.freeze([
  {
    id: 0,
    swivelHub: "tripo_part_12",
    wheel: "tripo_part_2",
    parts: Object.freeze(["tripo_part_5", "tripo_part_12", "tripo_part_21"]),
  },
  {
    id: 1,
    swivelHub: "tripo_part_19",
    wheel: "tripo_part_1",
    parts: Object.freeze(["tripo_part_20", "tripo_part_19", "tripo_part_14"]),
  },
  {
    id: 2,
    swivelHub: "tripo_part_17",
    wheel: "tripo_part_4",
    parts: Object.freeze(["tripo_part_13", "tripo_part_17", "tripo_part_22"]),
  },
  {
    id: 3,
    swivelHub: "tripo_part_18",
    wheel: "tripo_part_3",
    parts: Object.freeze(["tripo_part_6", "tripo_part_18"]),
  },
]);

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
  tripo_part_8: "handle",
  tripo_part_9: "trim",
  tripo_part_10: "trim",
  tripo_part_11: "trim",
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
const _wheelRelHub = new THREE.Vector3();

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

/**
 * Detects cartrave4 vs legacy layout from authored mesh names.
 *
 * @param {THREE.Object3D} scene
 * @returns {RaveGltfLayoutId}
 */
function detectRaveGltfLayout(scene) {
  let hasV4Wheel = false;
  scene.traverse((child) => {
    if (child.name === "tripo_part_13") hasV4Wheel = true;
  });
  return hasV4Wheel ? "cartrave4" : "legacy";
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

  const layout = detectRaveGltfLayout(scene);
  const lines = [
    `[cartRaveGltf] Source GLTF layout=${layout} caster hierarchy:`,
    "  ParentNode",
  ];

  if (layout === "cartrave4") {
    for (const group of RAVE_GLTF_V4_FORK_GROUPS) {
      lines.push(
        `  caster ${group.id}: hub=${group.swivelHub} wheel=${group.wheel} fork=[${group.parts.join(", ")}]`,
      );
    }
    lines.push("  static: frame supports tripo_part_15,16 + handle/trim");
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

/** @param {THREE.Object3D} object @param {"x" | "y" | "z"} axis @param {number} radians */
function setObjectAxisRotation(object, axis, radians) {
  object.rotation.x = axis === "x" ? radians : 0;
  object.rotation.y = axis === "y" ? radians : 0;
  object.rotation.z = axis === "z" ? radians : 0;
}

/**
 * Reparents `mesh` under `swivelPivot` while preserving its pose relative to `hubMesh`.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Mesh} hubMesh
 * @param {THREE.Object3D} swivelPivot
 * @param {THREE.Object3D} parent
 */
function reparentRaveGltfMeshRelativeToHub(mesh, hubMesh, swivelPivot, parent) {
  _hubLocalMat.compose(hubMesh.position, hubMesh.quaternion, hubMesh.scale);
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.compose(mesh.position, mesh.quaternion, mesh.scale);
  _meshLocalMat.premultiply(_hubLocalInv);

  parent.remove(mesh);
  _meshLocalMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
  swivelPivot.add(mesh);
}

/**
 * Hub → wheel offset in cart-local XZ used to derive each caster's authored rest heading.
 *
 * @param {THREE.Vector3} hubPosition
 * @param {THREE.Vector3} wheelPosition
 * @returns {number}
 */
function computeRaveGltfAuthoredForkYaw(hubPosition, wheelPosition) {
  _wheelRelHub.copy(wheelPosition).sub(hubPosition);
  return Math.atan2(_wheelRelHub.x, _wheelRelHub.z);
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
        `  caster ${group.id}: hub=${group.swivelHub} wheel=${group.wheel} parts=[${group.parts.join(", ")}]`,
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
 * Builds one caster corner: hub-position swivel pivot, fork parts + nested wheel roll pivot.
 * Preserves authored local transforms via matrix reparenting (avoids floating / splayed forks).
 *
 * @param {{ id: number, swivelHub: string, wheel: string, parts: readonly string[] }} group
 * @param {Map<string, THREE.Mesh>} meshByName
 * @param {THREE.Object3D} parent
 * @returns {RaveGltfCasterRuntime | null}
 */
function buildRaveGltfCasterCorner(group, meshByName, parent) {
  const hubMesh = meshByName.get(group.swivelHub);
  if (!hubMesh) return null;

  /** @type {THREE.Mesh[]} */
  const forkMeshes = [];
  for (const partName of group.parts) {
    const mesh = meshByName.get(partName);
    if (mesh?.userData.raveGltfPartRole === "fork") forkMeshes.push(mesh);
  }
  if (forkMeshes.length === 0) return null;

  const wheelMesh = meshByName.get(group.wheel);
  const authoredForkYaw = wheelMesh?.userData.raveGltfPartRole === "wheel"
    ? computeRaveGltfAuthoredForkYaw(hubMesh.position, wheelMesh.position)
    : 0;

  const swivelPivot = new THREE.Group();
  swivelPivot.name = `RaveGltfForkPivot_${group.id}`;
  swivelPivot.position.copy(hubMesh.position);
  swivelPivot.quaternion.identity();
  swivelPivot.scale.set(1, 1, 1);

  for (const mesh of forkMeshes) {
    reparentRaveGltfMeshRelativeToHub(mesh, hubMesh, swivelPivot, parent);
  }

  /** @type {THREE.Group | null} */
  let rollPivot = null;
  /** @type {number} */
  let wheelRadius = RAVE_GLTF_WHEEL_RADIUS_FALLBACK * RAVE_GLTF_SCALE;
  /** @type {"x" | "y" | "z"} */
  let wheelRollAxis = RAVE_GLTF_WHEEL_ROLL_AXIS;

  if (wheelMesh?.userData.raveGltfPartRole === "wheel") {
    rollPivot = new THREE.Group();
    rollPivot.name = `RaveGltfWheelPivot_${wheelMesh.name}`;

    _hubLocalMat.compose(hubMesh.position, hubMesh.quaternion, hubMesh.scale);
    _hubLocalInv.copy(_hubLocalMat).invert();
    _meshLocalMat.compose(wheelMesh.position, wheelMesh.quaternion, wheelMesh.scale);
    _meshLocalMat.premultiply(_hubLocalInv);
    _meshLocalMat.decompose(rollPivot.position, rollPivot.quaternion, rollPivot.scale);

    parent.remove(wheelMesh);
    wheelMesh.position.set(0, 0, 0);
    wheelMesh.quaternion.identity();
    wheelMesh.scale.set(1, 1, 1);
    rollPivot.add(wheelMesh);
    wheelRollAxis = detectRaveGltfWheelRollAxis(wheelMesh.geometry);
    rollPivot.userData.wheelRollAxis = wheelRollAxis;
    swivelPivot.add(rollPivot);

    wheelRadius = Math.max(
      estimateRaveGltfWheelRadius(wheelMesh.geometry) * RAVE_GLTF_SCALE,
      wheelRadius,
    );
  }

  parent.add(swivelPivot);
  swivelPivot.userData.forkGroupId = group.id;

  /** @type {RaveGltfCasterRuntime} */
  const caster = {
    id: group.id,
    swivelPivot,
    rollPivot,
    authoredForkYaw,
    hubLocalX: hubMesh.position.x,
    hubLocalZ: hubMesh.position.z,
    smoothedHeading: authoredForkYaw,
    wheelRoll: 0,
    wheelRadius,
    wheelRollAxis,
  };

  swivelPivot.rotation.y = caster.smoothedHeading - authoredForkYaw;
  return caster;
}

/**
 * Scales basket segments about the wheel-mount centroid so casters stay fixed.
 *
 * @param {THREE.Object3D} model `RaveGltfModel` group
 */
function applyRaveGltfBodyScale(model) {
  if (RAVE_GLTF_BODY_SCALE === 1 || model.getObjectByName("RaveGltfBodyScale")) return;

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

  _bodyScalePivot.set(0, 0, 0);
  for (const wheel of wheelMeshes) _bodyScalePivot.add(wheel.position);
  _bodyScalePivot.multiplyScalar(1 / wheelMeshes.length);

  const bodyGroup = new THREE.Group();
  bodyGroup.name = "RaveGltfBodyScale";
  bodyGroup.position.copy(_bodyScalePivot);
  bodyGroup.scale.setScalar(RAVE_GLTF_BODY_SCALE);
  model.add(bodyGroup);

  for (const mesh of bodyMeshes) {
    mesh.parent?.remove(mesh);
    mesh.position.sub(_bodyScalePivot);
    bodyGroup.add(mesh);
  }
}

/**
 * Tags meshes, binds CartFrame, and adds simple roll/swivel pivots for main wheels + forks.
 *
 * @param {THREE.Object3D} root CartVisual root
 */
function bindRaveGltfCartParts(root) {
  const model = root.getObjectByName("RaveGltfModel") || root;
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
  let wheelRadius = RAVE_GLTF_WHEEL_RADIUS_FALLBACK * RAVE_GLTF_SCALE;
  const wheelRollAxis =
    _sourceLayout === "cartrave4" ? RAVE_GLTF_WHEEL_ROLL_AXIS : RAVE_GLTF_WHEEL_ROLL_AXIS_LEGACY;
  const legacySwivelOnly = _sourceLayout === "legacy";

  if (_sourceLayout === "cartrave4") {
    for (const group of RAVE_GLTF_V4_FORK_GROUPS) {
      const parent = meshByName.get(group.swivelHub)?.parent
        ?? meshByName.get(group.parts[0])?.parent;
      if (!parent) continue;

      const caster = buildRaveGltfCasterCorner(group, meshByName, parent);
      if (!caster) continue;

      casters.push(caster);
      forkPivots.push(caster.swivelPivot);
      if (caster.rollPivot) wheelPivots.push(caster.rollPivot);
      wheelRadius = Math.max(caster.wheelRadius, wheelRadius);

      if (import.meta.env?.DEV) {
        console.debug(
          `  caster ${caster.id} authoredForkYaw=${caster.authoredForkYaw.toFixed(3)} ` +
            `hub=(${caster.hubLocalX.toFixed(3)}, ${caster.hubLocalZ.toFixed(3)}) ` +
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
        estimateRaveGltfWheelRadius(mesh.geometry) * RAVE_GLTF_SCALE,
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

  for (const url of [RAVE_GLTF_URL, RAVE_GLTF_URL_LEGACY, RAVE_GLTF_URL_DRACO]) {
    try {
      const scene = await loadRaveGltfFromUrl(url);
      return { scene, url };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (url !== RAVE_GLTF_URL_DRACO) {
        console.warn(
          `[cartRaveGltf] Asset unavailable (${url}), trying next fallback.`,
          lastError.message,
        );
      }
    }
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
      _sourceLayout = detectRaveGltfLayout(scene);

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
  model.scale.setScalar(RAVE_GLTF_SCALE);
  model.position.y = RAVE_GLTF_Y_OFFSET;

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
 * @returns {{ vx: number, vz: number, speed: number }}
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
  return { vx, vz, speed: Math.hypot(vx, vz) };
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
 * Per-frame independent caster swivel + wheel roll (rigid-body corner kinematics).
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
  _localVel.set(linvelWorld.x, 0, linvelWorld.z).applyQuaternion(_rootInv);

  let localOmegaY = 0;
  if (angvelWorld) {
    _localAngvel.copy(angvelWorld).applyQuaternion(_rootInv);
    localOmegaY = _localAngvel.y;
  }

  const swivelAlpha = 1 - (1 - RAVE_GLTF_CASTER_SWIVEL_DAMPING) ** Math.min(240 * dtSec, 1);
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

    if (cornerVel.speed >= RAVE_GLTF_CASTER_SWIVEL_MIN_SPEED) {
      const groupOffset = RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS[caster.id] ?? 0;
      const targetHeading = Math.atan2(cornerVel.vx, cornerVel.vz)
        + RAVE_GLTF_CASTER_SWIVEL_YAW_OFFSET
        + groupOffset;
      const nextHeading = lerpAngle(caster.smoothedHeading, targetHeading, swivelAlpha);
      applyRaveGltfCasterHeading(caster, nextHeading);
    } else {
      // * Hold last heading — real casters do not snap back to a shared rest angle.
      applyRaveGltfCasterHeading(caster, caster.smoothedHeading);
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
