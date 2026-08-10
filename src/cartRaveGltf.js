/**
 * cartRaveGltf.js — Segmented rave-theme GLTF cart loader, materials, independent caster motion.
 *
 * Primary asset: `cartrave4-draco.glb` (DRACO + WebP compressed). Fallback order prefers
 * small DRACO tiers before multi‑MB uncompressed masters — Tripo color segments for body /
 * wheels / forks / trim.
 * Four composite casters swivel at the basket-side fork attachment; connector + wheel
 * hang below. One steer pivot per corner (basket stance + kingpin offsets). Forks use
 * car-like steering (body heading + yaw-rate offset) rather than pure velocity trailing. Brackets and frame supports stay static.
 *
 * cartrave4 animate vs static:
 *   body=tripo_part_0, wheels=1/2/3/4 (roll inside swivel assembly),
 *   casters (forkParts swivel at basket attach; connector=swivelHub):
 *     FR {fork:14,20 hub:19 wheel:1} FL {fork:6 hub:18 wheel:3}
 *     BL {fork:5,21 hub:12 wheel:2} BR {fork:13,22 hub:17 wheel:4}
 *   face=7 (the SMILE — stays authored) + one-piece SunglassesVisor (replaces frame 8 +
 *   lenses 9/11 at source load; see integrateOnePieceSunglasses), handle=10, static trim=15–16/23.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getSharedDracoLoader } from "./loaders/sharedDracoLoader.js";
import { applyCartPattern } from "./cartPatterns.js";
import { CART_THEMES, resolveSunglassesStyle } from "./cartThemeConfig.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex, lerpAngle } from "./utils.js";
import { raveGltfTuning, cartTuningStore } from "./stores/cartTuningStore.js";
import { publicUrl } from "./utils/publicUrl.js";

/** @typedef {import("./cartThemes.js").CartThemeMaterialCache} CartThemeMaterialCache */
/** @typedef {import("./cartThemeConfig.js").SunglassesStyleDef} SunglassesStyleDef */

/** @typedef {"body" | "wheel" | "fork" | "handle" | "face" | "faceFrame" | "faceLens" | "smile" | "trim" | "unknown"} RaveGltfPartRole */

/** @typedef {"cartrave4" | "legacy"} RaveGltfLayoutId */

/**
 * Independent runtime state for one cartrave4 caster corner.
 * @typedef {object} RaveGltfCasterRuntime
 * @property {number} id Fork group id.
 * @property {THREE.Group} swivelPivot Y-axis steer pivot at fork attach (basket stance + pivot offsets).
 * @property {THREE.Group | null} [kingpinPivot] Legacy nested pivot; collapsed on next layout.
 * @property {THREE.Group | null} rollPivot Nested wheel roll pivot (child of swivelPivot).
 * @property {number} authoredForkYaw Rest heading (rad) in velocity-heading space (cart-local, model orientation undone).
 * @property {"front" | "rear"} axle Coordinated steer pair — front or rear.
 * @property {number} hubLocalX Swivel anchor X in model space × scale (corner velocity kinematics).
 * @property {number} hubLocalZ Swivel anchor Z in model space × scale.
 * @property {THREE.Vector3 | null} [baseKingpinModel] Frozen rest-pose kingpin (model space); offsets apply on top.
 * @property {number} smoothedHeading Absolute cart-local trail heading (rad); frozen when slow.
 * @property {number} [smoothedPivotSteer] Shared axle pivot steer offset (rad) when rigid front linkage is active.
 * @property {number} wheelRoll Accumulated roll angle (rad) for this wheel.
 * @property {number} wheelRadius Roll radius (m) for this wheel.
 * @property {"x" | "y" | "z"} wheelRollAxis
 */

/** DRACO-compressed legacy model (fallback). Public path — resolve via {@link publicUrl}. */
const RAVE_GLTF_PATH_DRACO = "models/cart-rave-base-draco.glb";

/** Primary segmented rave cart — DRACO + WebP. Public path — resolve via {@link publicUrl}. */
const RAVE_GLTF_PATH = "models/cartrave4-draco.glb";

/**
 * One-piece sunglasses visor (DRACO, master in art/models/sunglasses-visor.glb).
 * Replaces the four segmented cartrave4 face parts at source-load time — see
 * integrateOnePieceSunglasses(). Load failure falls back to the segmented parts.
 */
const SUNGLASSES_VISOR_PATH = "models/sunglasses-visor.glb";

const raveGltfUrl = () => publicUrl(RAVE_GLTF_PATH);
const raveGltfUrlDraco = () => publicUrl(RAVE_GLTF_PATH_DRACO);
const sunglassesVisorUrl = () => publicUrl(SUNGLASSES_VISOR_PATH);

// * Uncompressed masters live under art/models/ for authoring + npm run compress:rave-gltf.
// * They are not shipped in public/ (saves ~14 MB per deploy).


/** CartFrame mesh name for the active cartrave4 export. */
const RAVE_GLTF_FRAME_MESH = "tripo_part_0";

/**
 * Inner-model Y rotation for every rave GLTF instance.
 * Tripo export: face/handle on +X, wheels at ±X corners. Physics/procedural forward is -Z at yaw 0.
 * +π/2 maps authored +X → parent -Z. Applied on `RaveGltfModel`, not CartVisual (physics overwrites root quat).
 */
const RAVE_GLTF_ORIENTATION_Y = Math.PI / 2;

/** Keys whose changes require `reapplyRaveGltfCartTuningOnScene`. */
const RAVE_GLTF_TUNING_VISUAL_KEYS = new Set([
  "scale",
  "yOffset",
  "bodyScale",
  "bodyYDrop",
  "cornerInset",
  "cornerInsetFracX",
  "cornerInsetFracZ",
  "casterStanceScaleX",
  "casterStanceScaleZ",
  "casterOffsetX",
  "casterOffsetZ",
  "casterPivotYOffset",
  "casterPivotXOffset",
  "casterPivotZOffset",
  "frontPivotYOffset",
  "frontPivotXOffset",
  "frontPivotZOffset",
  "casterPivotCorner",
]);

/** Reset groups for Tweakpane section buttons (`raveGltfCartTweakpane.js`). */
export const RAVE_GLTF_TUNING_RESET_GROUPS = Object.freeze({
  steeringAll: Object.freeze([
    "frontSteerMul",
    "frontTurnSteerDamping",
    "steeringInfluence",
    "frontAxleRigid",
    "frontAxleSign",
    "yawSteerBlend",
    "rearSteerMul",
    "turnSteerDamping",
    "rearSteerMinOmega",
    "rearSteerFullOmega",
    "turnEngageOmega",
    "turnReleaseOmega",
    "swivelMaxAngleDeg",
    "swivelDamping",
  ]),
  frontSteering: Object.freeze([
    "frontSteerMul",
    "frontTurnSteerDamping",
    "steeringInfluence",
    "frontAxleRigid",
    "frontAxleSign",
    "yawSteerBlend",
  ]),
  rearSteering: Object.freeze([
    "rearSteerMul",
    "turnSteerDamping",
    "rearSteerMinOmega",
    "rearSteerFullOmega",
  ]),
  turnFeel: Object.freeze([
    "turnEngageOmega",
    "turnReleaseOmega",
    "swivelMaxAngleDeg",
    "swivelDamping",
  ]),
  straight: Object.freeze([
    "straightYawDeadzone",
    "straightYawSmoothing",
    "straightCruiseMinSpeed",
    "straightRestEpsilon",
    "restReturnDamping",
  ]),
  kingpinAll: Object.freeze([
    "frontPivotYOffset",
    "frontPivotXOffset",
    "frontPivotZOffset",
    "casterPivotYOffset",
    "casterPivotXOffset",
    "casterPivotZOffset",
  ]),
  frontKingpin: Object.freeze([
    "frontPivotYOffset",
    "frontPivotXOffset",
    "frontPivotZOffset",
  ]),
  allKingpin: Object.freeze([
    "casterPivotYOffset",
    "casterPivotXOffset",
    "casterPivotZOffset",
  ]),
  placement: Object.freeze([
    "casterStanceScaleX",
    "casterStanceScaleZ",
    "cornerInset",
    "cornerInsetFracX",
    "cornerInsetFracZ",
    "casterOffsetX",
    "casterOffsetZ",
  ]),
  size: Object.freeze(["scale", "yOffset", "bodyScale", "bodyYDrop"]),
  advanced: Object.freeze([
    "travelHeadingSmoothing",
    "trailBlend",
    "casterCoordinationLog",
    "casterPivotCorner",
  ]),
});

/**
 * @param {readonly string[]} keys
 * @returns {boolean}
 */
export function raveGltfTuningKeysNeedVisualReapply(keys) {
  return keys.some(
    (key) => key === "casterPivotCorner"
      || key.startsWith("casterPivotCorner.")
      || RAVE_GLTF_TUNING_VISUAL_KEYS.has(key),
  );
}

/**
 * Copies default values back onto the cart tuning store for the given keys.
 *
 * @param {readonly string[]} keys Top-level keys, `casterPivotCorner`, or `casterPivotCorner.<label>`.
 */
export function resetRaveGltfTuningKeys(keys) {
  cartTuningStore.getState().resetKeys(keys);
}

/** Resets every live tuning value to defaults. */
export function resetRaveGltfTuningAll() {
  cartTuningStore.getState().resetAll();
}

/** Logs current tuning for copying into `cartRaveGltf.js` defaults. */
export function logRaveGltfTuningValues() {
  // eslint-disable-next-line no-console
  console.log("[raveGltfTuning]", JSON.stringify(cartTuningStore.getState().getRaw(), null, 2));
}

/** How much the player neon shifts body albedo (0 = authored grey, 1 = full neon). */
const RAVE_GLTF_BODY_TINT_STRENGTH = 1;
/** CART-COLOR-DEPTH-1 — keep the picked hue vivid while giving the resting body a deeper base. */
const RAVE_GLTF_BODY_TINT_SCALE = 0.72;

// --- Caster / wheel animation tuning ---

/** Multiplier on roll angle integrated from planar speed / wheel radius. */
const RAVE_GLTF_WHEEL_ROLL_SPEED_MUL = 1.0;

/**
 * Planar speed (m/s) at a caster hub before its wheel stops accumulating roll.
 * Kept lower than swivel min so wheels coast visually while forks hold their last heading.
 */
const RAVE_GLTF_WHEEL_ROLL_MIN_SPEED = 0.02;

/**
 * Scales rigid-body yaw rate (rad/s) for corner hub velocity and car-like steer offset.
 * Higher values make casters react more during turns.
 */
const RAVE_GLTF_CASTER_ANGVEL_MUL = 1.0;

/**
 * Added to each caster's local trail heading when tracking movement (radians).
 * Tune if all casters appear consistently rotated vs travel direction.
 */
const RAVE_GLTF_CASTER_SWIVEL_YAW_OFFSET = 0;

/**
 * Swivel / roll reset angle on teleport / respawn only — runtime casters hold their
 * last heading and wheel rotation when input is released.
 */
const RAVE_GLTF_CASTER_SWIVEL_REST_YAW = 0;

/** Default wheel roll radius when bbox estimate is unavailable (meters, pre-scale). */
const RAVE_GLTF_WHEEL_RADIUS_FALLBACK = 0.18;

/**
 * Wheel roll axis for cartrave4 separated tires (thin bbox axis = local X).
 * @type {"x" | "y" | "z"}
 */
const RAVE_GLTF_WHEEL_ROLL_AXIS = "x";

/**
 * Wheel roll axis for legacy monolithic caster meshes (thin axis = local Z).
 * @type {"x" | "y" | "z"}
 */
const RAVE_GLTF_WHEEL_ROLL_AXIS_LEGACY = "z";

/**
 * Swivel axis for the fork / caster housing (cart-local vertical = Y).
 * @type {"x" | "y" | "z"}
 */
const RAVE_GLTF_CASTER_SWIVEL_AXIS = "y";

/** Extra radians added to wheel roll (model-specific correction). */
const RAVE_GLTF_WHEEL_AXIS_CORRECTION = 0;

/**
 * Per-caster trail-heading tweak (radians) keyed by fork group id — added to runtime target heading.
 * @type {Readonly<Record<number, number>>}
 */
const RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS = Object.freeze({
  0: 0,
  1: 0,
  2: 0,
  3: 0,
});

/** Near-black trim for handle / face / static brackets. */
const RAVE_GLTF_DARK_TRIM_HEX = 0x111111;

/**
 * Sunglasses self-tint strength (emissive in the style's core color). Makes styles
 * readable in the dark arenas without turning the visor into a bloom source.
 * Dropped 0.35 → 0.14 with the gradient-env rework (playtest 2026-07-16 "washed
 * out"): the flat emissive wash was greying the mirror; the per-style gradient
 * reflection now carries the color, emissive is just the dark-corner floor.
 */
const SUNGLASSES_LENS_EMISSIVE_INTENSITY = 0.14;

/**
 * cartrave4 face assembly — the SMILE (7) plus the one-piece sunglasses visor that
 * replaces the segmented frame (8) + lens pair (9, 11) at source load
 * (integrateOnePieceSunglasses). 8/9/11 stay listed defensively for the fallback
 * path where the visor GLB fails to load and the segmented parts remain.
 * @type {ReadonlyArray<string>}
 */
const RAVE_GLTF_V4_FACE_PARTS = Object.freeze([
  "tripo_part_7",
  "tripo_part_8",
  "tripo_part_9",
  "tripo_part_11",
  "SunglassesVisor",
]);

/**
 * The segmented sunglasses parts the one-piece visor REPLACES: frame (8) + lenses
 * (9, 11). tripo_part_7 is the cart's SMILE — a separate face accent that must stay
 * on the basket (deleting it with the glasses removed the cart's mouth).
 * @type {ReadonlyArray<string>}
 */
const RAVE_GLTF_V4_SUNGLASSES_PARTS = Object.freeze([
  "tripo_part_8",
  "tripo_part_9",
  "tripo_part_11",
]);

/**
 * Bounding box of the original segmented glasses (frame 8 + lenses 9/11) in ParentNode-
 * local space, measured once from the master `art/models/cartrave4.glb`. Baked as a
 * constant so visor placement no longer depends on those parts existing in the shipped
 * asset — the hand-sealed basket export (2026-07-12) removed 8/9/11. Still removed
 * defensively at load if a pre-seal asset ships them.
 * @type {{ min: readonly number[], max: readonly number[] }}
 */
const RAVE_GLTF_V4_SUNGLASSES_FOOTPRINT = Object.freeze({
  min: Object.freeze([0.2835, 0.5566, -0.2902]),
  max: Object.freeze([0.4659, 0.791, 0.2913]),
});

/** Node the face parts (smile + glasses) live under — the visor attaches here. */
const RAVE_GLTF_V4_FACE_PARENT_NODE = "ParentNode";

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
    // * CART-FORK-SWIVEL-1: tripo_part_23 is the mirror twin of BR's tripo_part_22
    // * (same x -0.148, mirrored z +0.236 vs -0.235). Without it, the piece stayed
    // * model-static while the rest of the BL caster swiveled.
    forkParts: Object.freeze(["tripo_part_5", "tripo_part_21", "tripo_part_23"]),
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
  SunglassesVisor: "face",
  tripo_part_0: "body",
  tripo_part_1: "wheel",
  tripo_part_2: "wheel",
  tripo_part_3: "wheel",
  tripo_part_4: "wheel",
  tripo_part_5: "fork",
  tripo_part_6: "fork",
  // * The SMILE — a face accent, but NOT part of the sunglasses assembly: it keeps
  // * static glossy-black trim instead of the player-picked mirror style (playtest
  // * 2026-07-16: the style color was tinting the mouth).
  tripo_part_7: "smile",
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
  // * CART-FORK-1: was "trim", which means "neon wire segment on the basket" — a trim part
  // * WITH an albedo map takes the body bloom treatment at cloneRaveGltfMaterial (see the
  // * `role === "trim" && srcMat.map` branch), so this rendered basket-pink and glowing down
  // * among the white casters. It is the mirror twin of tripo_part_22 (same x -0.148,
  // * mirrored z +0.236 vs -0.235, 29 vs 26 verts), which was already "fork".
  // * Swivel membership: backLeft.forkParts (CART-FORK-SWIVEL-1).
  tripo_part_23: "fork",
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
  faceFrame: { metalness: 0.28, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.16 },
  faceLens: { metalness: 1.0, roughness: 0.02, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  // * Matches the procedural cart's glossy-black face trim (cart.js SHARED_FACE_TRIM_MAT).
  smile: { metalness: 0.88, roughness: 0.42, clearcoat: 0.4 },
  trim: {},
  unknown: {},
});

/** Rave theme frame preset — matches cartThemeConfig `rave.frameMaterial`. */
const RAVE_GLTF_FRAME_PRESET = CART_THEMES.rave.frameMaterial;

const RAVE_GLTF_EMISSIVE_MUL = RAVE_GLTF_FRAME_PRESET.emissiveMul ?? 1.15;
/** Wireframe trim uses an emissive map (partial coverage); kept at 1.0 to match procedural bloom balance. */
const RAVE_GLTF_TRIM_MASK_BOOST = 1.0;

/**
 * Split the one-piece visor index into solid frame group 0 and lens group 1.
 * The source asset has large lens sheets facing +/-X and a frame around them.
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {boolean}
 */
export function splitRaveGltfVisorGeometry(geometry) {
  const position = geometry?.getAttribute("position");
  const index = geometry?.getIndex();
  const indexCount = index?.count ?? position?.count ?? 0;
  if (!position || indexCount < 6 || indexCount % 3 !== 0) return false;

  const readIndex = (offset) => index ? index.getX(offset) : offset;
  const frameIndices = [];
  const lensIndices = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let offset = 0; offset < indexCount; offset += 3) {
    a.fromBufferAttribute(position, readIndex(offset));
    b.fromBufferAttribute(position, readIndex(offset + 1));
    c.fromBufferAttribute(position, readIndex(offset + 2));
    edge.subVectors(b, a);
    normal.subVectors(c, a);
    edge.cross(normal);
    const normalLength = edge.length();
    const triangle = [readIndex(offset), readIndex(offset + 1), readIndex(offset + 2)];
    if (normalLength < 1e-8) {
      frameIndices.push(...triangle);
      continue;
    }

    edge.multiplyScalar(1 / normalLength);
    const centroidX = (a.x + b.x + c.x) / 3;
    const target = Math.abs(edge.x) > 0.55 && centroidX > 0.02
      ? lensIndices
      : frameIndices;
    target.push(...triangle);
  }

  if (!frameIndices.length || !lensIndices.length) return false;
  geometry.setIndex(frameIndices.concat(lensIndices));
  geometry.clearGroups();
  geometry.addGroup(0, frameIndices.length, 0);
  geometry.addGroup(frameIndices.length, lensIndices.length, 1);
  geometry.userData.raveGltfVisorSplit = true;
  geometry.userData.raveGltfVisorLensTriangles = lensIndices.length / 3;
  return true;
}

/**
 * FIX-EMISSIVE — trim emissive multiplier for a cart with NO pattern.
 *
 * * A pattern is the only thing that currently reduces emissive AREA, so a `classic` cart shows
 * * full-area trim glow and reads blown out beside a patterned one (Wyatt, 08-04). This trims the
 * * intensity instead. Not a niche case: `classic` stays common even with networked patterns
 * * (NET-LOOK-ACC-1) — it is the default, and the NPC pool draws it 2/7.
 *
 * * Eye-tuned starting value, NOT a measured gate — Classic's ~15.9% construction-noise floor
 * * swamps a trim this size in `npm run compare`, which is why this card ships on a unit seam
 * * plus a human look-check rather than on pixels.
 */
const CLASSIC_TRIM_EMISSIVE_MUL = 0.85;

/**
 * FIX-EMISSIVE — record the trim on the CACHE (and stickily on the root), never as a call argument.
 *
 * * THIS IS THE WHOLE POINT OF THE CARD, and the reason its first attempt (08-04) was aborted.
 * * `intensityMul` is a per-call argument: the unguarded every-frame leader-glow loop in
 * * frameVisuals.js calls `applyThemeColorToCache(cache, themeId, hex)` with three arguments, so
 * * the mul defaults to 1 and any threaded trim is erased within a frame. Cache-owned survives.
 *
 * * The userData stamp is what survives a CACHE REBUILD. Both frameVisuals and cartOrchestration
 * * do `cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh))`, so a
 * * miss rebuilds the cache — without the stamp a classic cart would pop back to full brightness.
 *
 * * CALL THIS WHEREVER A PATTERN IS DECIDED, not just where a cart is built. Match spawn calls
 * * `prepareRaveGltfCart(mesh, color)` with no pattern, so every match cart is born "classic" and
 * * the real pattern arrives later via updateCartMaterialsFromSlots. Setting this at birth only
 * * would trim every cart in the game and never restore patterned ones to 1.
 *
 * @param {CartThemeMaterialCache | null | undefined} cache
 * @param {string | null | undefined} patternId
 * @param {THREE.Object3D | null | undefined} [root] Cart root, stamped so a cache rebuild recovers.
 * @returns {number} The applied multiplier.
 */
export function setEmissiveTrimMul(cache, patternId, root) {
  const mul = !patternId || patternId === "classic" ? CLASSIC_TRIM_EMISSIVE_MUL : 1;
  if (cache) /** @type {any} */ (cache).emissiveTrimMul = mul;
  if (root) (root.userData ||= {}).cartEmissiveTrimMul = mul;
  return mul;
}

/** @param {CartThemeMaterialCache | null | undefined} cache */
function trimMulOf(cache) {
  const v = /** @type {any} */ (cache)?.emissiveTrimMul;
  return typeof v === "number" ? v : 1;
}

// * Body emissive wire mask — soft luminance ramp isolating the bright neon wire strokes from
// * the darker body so wire glow (emissiveIntensity) tunes independently of surface albedo.
// * Brightness = per-pixel max(r,g,b) (captures saturated neon of any hue, not just high-luma).
// * Below LOW → fully masked out (0); above HIGH → full wire (1); smoothstep between.
const RAVE_GLTF_WIRE_MASK_BRIGHTNESS_LOW = 0.45;
const RAVE_GLTF_WIRE_MASK_BRIGHTNESS_HIGH = 0.7;

/**
 * Generated emissive wire masks keyed by source albedo `texture.uuid`. Module-level and shared
 * across every cart instance (all bodies clone the same GLB albedo), so these are never disposed
 * per-cart — their lifetime matches `_sourceScene` (which itself is never torn down; see
 * {@link disposeRaveGltfInstance}). `null` = generation bailed (undecodable image) → albedo reuse.
 * @type {Map<string, THREE.CanvasTexture | null>}
 */
const _wireEmissiveMaskCache = new Map();

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

/** Scratch: wheel rolling direction (axle × up) in cart-velocity space. */
const _wheelRollDir = new THREE.Vector3();

/** @type {number} */
let _casterCoordLogLastMs = 0;

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
 * Primary cartrave4-draco always uses cartrave4 roles; legacy Draco URLs stay legacy.
 *
 * @param {THREE.Object3D} scene
 * @param {string | null | undefined} [loadedUrl]
 * @returns {RaveGltfLayoutId}
 */
function detectRaveGltfLayout(scene, loadedUrl = null) {
  if (/cartrave4-draco\.glb(\?|#|$)/i.test(loadedUrl) || loadedUrl === RAVE_GLTF_PATH) {
    return "cartrave4";
  }
  if (/cart-rave-base-draco\.glb(\?|#|$)/i.test(loadedUrl) || loadedUrl === RAVE_GLTF_PATH_DRACO) {
    return "legacy";
  }

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
    lines.push("  static: frame supports tripo_part_15,16 + smile 7 + SunglassesVisor + handle 10");
  } else {
    lines.push("  legacy monolithic corners: tripo_part_0,3,4,5 (swivel only)");
  }
  console.debug(lines.join("\n"));
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

/**
 * 0 = straight (rest bias), 1 = full car-steer. Smooth ramp between deadzone and engage omega.
 *
 * @param {number} absOmega |scaled yaw rate| (rad/s).
 * @returns {number}
 */
function computeRaveGltfTurnEngagement(absOmega) {
  const dead = raveGltfTuning.straightYawDeadzone;
  const engage = Math.max(raveGltfTuning.turnEngageOmega, dead + 1e-4);
  if (absOmega <= dead) return 0;
  if (absOmega >= engage) return 1;
  const t = (absOmega - dead) / (engage - dead);
  return t * t * (3 - 2 * t);
}

/**
 * Rear-axle steer scale — stays near zero on gentle turns, ramps in on hard yaw.
 *
 * @param {number} absOmega Filtered |scaled yaw rate| (rad/s).
 * @returns {number} [0, 1]
 */
function computeRaveGltfRearSteerScale(absOmega) {
  const min = raveGltfTuning.rearSteerMinOmega;
  const full = Math.max(raveGltfTuning.rearSteerFullOmega, min + 1e-4);
  if (absOmega <= min) return 0;
  if (absOmega >= full) return 1;
  const t = (absOmega - min) / (full - min);
  return t * t * (3 - 2 * t);
}

/**
 * Low-pass |yaw rate| for straight/turn engagement — rejects brief physics spikes.
 *
 * @param {object} data `root.userData.cartVisual`
 * @param {number} absOmega Raw |scaled yaw rate| (rad/s).
 * @param {number} dtSec Frame delta (s).
 * @returns {number} Filtered |yaw rate| (rad/s).
 */
function filterRaveGltfCasterAbsOmega(data, absOmega, dtSec) {
  const smooth = raveGltfTuning.straightYawSmoothing;
  if (smooth <= 0) {
    data.casterFilteredAbsOmega = absOmega;
    return absOmega;
  }

  const prev = data.casterFilteredAbsOmega ?? absOmega;
  const alpha = (1 - smooth) * Math.min(240 * dtSec, 1);
  const filtered = prev + (absOmega - prev) * alpha;
  data.casterFilteredAbsOmega = filtered;
  return filtered;
}

/**
 * Mean rest heading per front/rear axle (for coordinated steer + rigid front linkage).
 *
 * @param {RaveGltfCasterRuntime[]} casters
 * @returns {{ frontMeanRest: number, rearMeanRest: number }}
 */
function computeRaveGltfAxleMeanRests(casters) {
  let frontRestSum = 0;
  let frontCount = 0;
  let rearRestSum = 0;
  let rearCount = 0;

  for (const caster of casters) {
    const restHeading = caster.authoredForkYaw + RAVE_GLTF_CASTER_SWIVEL_REST_YAW;
    const axle = caster.axle ?? (caster.hubLocalX > 0 ? "front" : "rear");
    if (axle === "front") {
      frontRestSum += restHeading;
      frontCount += 1;
    } else {
      rearRestSum += restHeading;
      rearCount += 1;
    }
  }

  return {
    frontMeanRest: frontCount > 0 ? frontRestSum / frontCount : 0,
    rearMeanRest: rearCount > 0 ? rearRestSum / rearCount : 0,
  };
}

/**
 * Dev log: front/rear axle pivot spread (rigid front should stay at 0°).
 *
 * @param {RaveGltfCasterRuntime[]} casters
 */
function logRaveGltfCasterCoordination(casters) {
  if (!import.meta.env?.DEV || !raveGltfTuning.casterCoordinationLog) return;

  const now = performance.now();
  if (now - _casterCoordLogLastMs < 500) return;
  _casterCoordLogLastMs = now;

  /** @type {number[]} */
  const frontPivotYaws = [];
  /** @type {number[]} */
  const rearPivotYaws = [];
  /** @type {number[]} */
  const frontSteerOffsets = [];
  /** @type {number[]} */
  const rearSteerOffsets = [];

  for (const caster of casters) {
    const pivotYaw = getRaveGltfCasterSteerPivot(caster).rotation.y;
    const steerOffset = caster.smoothedPivotSteer ?? pivotYaw - RAVE_GLTF_CASTER_SWIVEL_REST_YAW;
    const axle = caster.axle ?? (caster.hubLocalX > 0 ? "front" : "rear");
    if (axle === "front") {
      frontPivotYaws.push(pivotYaw);
      frontSteerOffsets.push(steerOffset);
    } else {
      rearPivotYaws.push(pivotYaw);
      rearSteerOffsets.push(steerOffset);
    }
  }

  const formatPair = (label, pivotYaws, steerOffsets) => {
    if (pivotYaws.length < 2) return null;
    const pivotSpreadDeg = (Math.abs(pivotYaws[0] - pivotYaws[1]) * 180) / Math.PI;
    const meanSteerDeg = ((steerOffsets[0] + steerOffsets[1]) * 0.5 * 180) / Math.PI;
    return `${label} pivotΔ=${pivotSpreadDeg.toFixed(2)}° meanSteer=${meanSteerDeg.toFixed(1)}°`;
  };

  const frontTag = formatPair("front", frontPivotYaws, frontSteerOffsets);
  const rearTag = formatPair("rear", rearPivotYaws, rearSteerOffsets);
  if (!frontTag && !rearTag) return;

  console.debug(
    `[cartRaveGltf] caster coordination: ${[frontTag, rearTag].filter(Boolean).join(" | ")}`,
  );
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
 * Snapshots a mesh transform in `RaveGltfModel` local space from the authored GLTF pose.
 * Used so kingpin / stance re-layout is idempotent (sliders return to rest when set back to 0).
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Object3D} modelRoot
 */
function captureRaveGltfMeshRestModelTransform(mesh, modelRoot) {
  if (mesh.userData.raveGltfRestModelPos) return;

  mesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  _meshLocalMat.copy(mesh.matrixWorld).premultiply(_modelInvMat);
  _meshLocalMat.decompose(_modelLocalScratch, _scratchQuat, _scratchScale);

  mesh.userData.raveGltfRestModelPos = _modelLocalScratch.clone();
  mesh.userData.raveGltfRestModelQuat = _scratchQuat.clone();
  mesh.userData.raveGltfRestModelScale = _scratchScale.clone();
}

/**
 * Reparents one caster part under `steerPivot` from the frozen rest model transform.
 * Geometry stays relative to `baseKingpin` (detected attach, no slider offsets) so pivot
 * sliders visibly move the fork assembly and rotation point together.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} baseKingpinModel Frozen detected kingpin in model space.
 * @param {THREE.Object3D} steerPivot
 * @param {THREE.Object3D} modelRoot Fallback live reparent when rest pose was not captured.
 * @returns {boolean} True when rest-pose reparent succeeded.
 */
function reparentRaveGltfCasterPartFromRest(mesh, baseKingpinModel, steerPivot, modelRoot) {
  const restPos = mesh.userData.raveGltfRestModelPos;
  if (!restPos) return false;

  _meshLocalMat.compose(
    restPos,
    mesh.userData.raveGltfRestModelQuat,
    mesh.userData.raveGltfRestModelScale,
  );
  _hubLocalMat.compose(baseKingpinModel, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.premultiply(_hubLocalInv);

  mesh.parent?.remove(mesh);
  _meshLocalMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
  steerPivot.add(mesh);
  return true;
}

/**
 * Reparents one caster part under `steerPivot` while keeping each child's offset from
 * `baseKingpinModel`. Uses model-space transforms so body/fork scaling under
 * `RaveGltfBodyScale` does not break attach math.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} baseKingpinModel Frozen detected kingpin in model space.
 * @param {THREE.Object3D} steerPivot Caster steer pivot on `modelRoot`.
 * @param {THREE.Object3D} modelRoot
 */
function reparentRaveGltfCasterPart(mesh, baseKingpinModel, steerPivot, modelRoot) {
  if (reparentRaveGltfCasterPartFromRest(mesh, baseKingpinModel, steerPivot, modelRoot)) {
    return;
  }

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cartRaveGltf] rest pose missing for ${mesh.name}; live reparent may drift when tuning pivots`,
    );
  }

  mesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  _meshLocalMat.copy(mesh.matrixWorld).premultiply(_modelInvMat);

  _hubLocalMat.compose(baseKingpinModel, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.premultiply(_hubLocalInv);

  mesh.parent?.remove(mesh);
  _meshLocalMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
  steerPivot.add(mesh);
}

/**
 * Captures rest GLTF transforms for all meshes in one caster corner (no-op after first capture).
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh} connectorMesh
 * @param {THREE.Mesh | null | undefined} wheelMesh
 * @param {THREE.Object3D} modelRoot
 */
function captureRaveGltfCasterRestTransforms(forkMeshes, connectorMesh, wheelMesh, modelRoot) {
  for (const mesh of forkMeshes) captureRaveGltfMeshRestModelTransform(mesh, modelRoot);
  captureRaveGltfMeshRestModelTransform(connectorMesh, modelRoot);
  if (wheelMesh) captureRaveGltfMeshRestModelTransform(wheelMesh, modelRoot);
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
 * Fork rest heading in the same space as runtime `targetHeading` (velocity-heading space).
 * World +Z of the fork mesh, then undo {@link RAVE_GLTF_ORIENTATION_Y} so it matches
 * `_localVel` / `atan2(localVelX, localVelZ)` in {@link updateRaveGltfCartVisuals}.
 *
 * @param {THREE.Mesh} forkMesh
 * @param {THREE.Object3D} modelRoot `RaveGltfModel` (orientation correction already applied).
 * @returns {number}
 */
function computeRaveGltfAuthoredForkYaw(forkMesh, modelRoot) {
  forkMesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvQuat.setFromAxisAngle(_forkForward.set(0, 1, 0), -RAVE_GLTF_ORIENTATION_Y);
  _forkForward.set(0, 0, 1).transformDirection(forkMesh.matrixWorld).applyQuaternion(_modelInvQuat);
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
  const isFront = cornerLabel.startsWith("front");
  return out.set(
    baseKingpin.x
      + raveGltfTuning.casterPivotXOffset
      + (isFront ? raveGltfTuning.frontPivotXOffset : 0)
      + (cornerOff.x ?? 0),
    baseKingpin.y
      + raveGltfTuning.casterPivotYOffset
      + (isFront ? raveGltfTuning.frontPivotYOffset : 0)
      + (cornerOff.y ?? 0),
    baseKingpin.z
      + raveGltfTuning.casterPivotZOffset
      + (isFront ? raveGltfTuning.frontPivotZOffset : 0)
      + (cornerOff.z ?? 0),
  );
}

/**
 * Detects basket-side kingpin in model space — highest fork/connector attach biased toward
 * the body center (basket-side pin), not the lower wheel-side geometry.
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh | null | undefined} connectorMesh
 * @param {THREE.Mesh | null | undefined} bodyMesh
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
function computeRaveGltfCasterKingpinModelPoint(
  forkMeshes,
  connectorMesh,
  bodyMesh,
  modelRoot,
  out,
) {
  let bodyCenterX = 0;
  let bodyCenterZ = 0;
  if (bodyMesh) {
    const bodyBbox = computeRaveGltfBodyBboxInModelSpace(bodyMesh, modelRoot);
    bodyCenterX = (bodyBbox.min.x + bodyBbox.max.x) * 0.5;
    bodyCenterZ = (bodyBbox.min.z + bodyBbox.max.z) * 0.5;
  }

  let found = false;
  let bestScore = -Infinity;

  const considerPoint = (modelPoint) => {
    const distToBody = Math.hypot(modelPoint.x - bodyCenterX, modelPoint.z - bodyCenterZ);
    const score = modelPoint.y * 1000 - distToBody;
    if (score > bestScore) {
      bestScore = score;
      out.copy(modelPoint);
      found = true;
    }
  };

  const considerMeshTopCenter = (mesh) => {
    mesh.geometry?.computeBoundingBox();
    const fbb = mesh.geometry?.boundingBox;
    if (!fbb) return;

    raveGltfToModelSpace(
      mesh,
      _modelLocalScratch.set(
        (fbb.min.x + fbb.max.x) * 0.5,
        fbb.max.y,
        (fbb.min.z + fbb.max.z) * 0.5,
      ),
      modelRoot,
      _kingpinBaseScratch,
    );
    considerPoint(_kingpinBaseScratch);
  };

  for (const fork of forkMeshes) considerMeshTopCenter(fork);
  if (connectorMesh) considerMeshTopCenter(connectorMesh);

  if (!found && forkMeshes.length > 0) {
    raveGltfToModelSpace(forkMeshes[0], _modelLocalScratch.set(0, 0, 0), modelRoot, out);
  }

  return out;
}

/**
 * Authored kingpin offsets, basket-corner stance XZ, and final steer pivot position.
 * Fork geometry stays rigid to `baseKingpin`; `steerPivot` sits at basket stance XZ plus
 * kingpin offsets so placement and attach sliders both move the assembly predictably.
 *
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh | null | undefined} bodyMesh
 * @param {string} cornerLabel
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Mesh | null | undefined} [connectorMesh]
 * @param {THREE.Vector3 | null | undefined} [frozenBaseKingpin] Rest-pose kingpin; skips live re-detect.
 * @returns {{ baseKingpin: THREE.Vector3, steerPivot: THREE.Vector3, stanceX: number, stanceZ: number, authored: THREE.Vector3 }}
 */
function computeRaveGltfCasterSteerLayout(
  forkMeshes,
  bodyMesh,
  cornerLabel,
  modelRoot,
  connectorMesh = null,
  frozenBaseKingpin = null,
) {
  if (frozenBaseKingpin) {
    _kingpinBaseScratch.copy(frozenBaseKingpin);
  } else {
    computeRaveGltfCasterKingpinModelPoint(
      forkMeshes,
      connectorMesh,
      bodyMesh,
      modelRoot,
      _kingpinBaseScratch,
    );
  }

  const baseKingpin = _kingpinBaseScratch;
  applyRaveGltfCasterPivotOffsets(baseKingpin, cornerLabel, _authoredAttachPoint);

  let stanceX = baseKingpin.x;
  let stanceZ = baseKingpin.z;
  if (bodyMesh) {
    const bodyBbox = computeRaveGltfBodyBboxInModelSpace(bodyMesh, modelRoot);
    const corner = resolveRaveGltfCasterCornerXZ(
      cornerLabel,
      baseKingpin.x,
      baseKingpin.z,
      bodyBbox,
    );
    stanceX = corner.x;
    stanceZ = corner.z;
  }

  _targetAttachPoint.set(
    stanceX + (_authoredAttachPoint.x - baseKingpin.x),
    _authoredAttachPoint.y,
    stanceZ + (_authoredAttachPoint.z - baseKingpin.z),
  );

  return {
    baseKingpin: baseKingpin.clone(),
    steerPivot: _targetAttachPoint.clone(),
    stanceX,
    stanceZ,
    authored: _authoredAttachPoint.clone(),
  };
}

/**
 * Repositions roll pivot under the steer pivot while preserving wheel mesh orientation.
 *
 * @param {THREE.Group} rollPivot
 * @param {THREE.Mesh} wheelMesh
 * @param {THREE.Vector3} baseKingpin
 * @param {THREE.Object3D} modelRoot
 */
function updateRaveGltfCasterRollPivot(rollPivot, wheelMesh, baseKingpin, modelRoot) {
  const restPos = wheelMesh.userData.raveGltfRestModelPos;
  if (restPos) {
    _meshLocalMat.compose(
      restPos,
      wheelMesh.userData.raveGltfRestModelQuat,
      wheelMesh.userData.raveGltfRestModelScale,
    );
    _hubLocalMat.compose(baseKingpin, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
    _hubLocalInv.copy(_hubLocalMat).invert();
    _meshLocalMat.premultiply(_hubLocalInv);
    _meshLocalMat.decompose(rollPivot.position, rollPivot.quaternion, rollPivot.scale);
    return;
  }

  wheelMesh.updateWorldMatrix(true, false);
  modelRoot.updateWorldMatrix(true, false);
  _modelInvMat.copy(modelRoot.matrixWorld).invert();
  _meshLocalMat.copy(wheelMesh.matrixWorld).premultiply(_modelInvMat);
  _hubLocalMat.compose(baseKingpin, _scratchQuat.identity(), _scratchScale.set(1, 1, 1));
  _hubLocalInv.copy(_hubLocalMat).invert();
  _meshLocalMat.premultiply(_hubLocalInv);
  _meshLocalMat.decompose(rollPivot.position, rollPivot.quaternion, rollPivot.scale);
}

/** @param {RaveGltfCasterRuntime} caster @returns {THREE.Object3D} Pivot that receives Y steer rotation. */
function getRaveGltfCasterSteerPivot(caster) {
  return caster.swivelPivot;
}

/**
 * Removes legacy nested kingpin groups from carts built before the single-pivot layout.
 *
 * @param {RaveGltfCasterRuntime} caster
 */
function collapseRaveGltfLegacyKingpinPivot(caster) {
  const legacy = caster.kingpinPivot
    ?? caster.swivelPivot.getObjectByName(`RaveGltfKingpinPivot_${caster.id}`);
  if (!legacy || legacy === caster.swivelPivot) {
    caster.kingpinPivot = null;
    return;
  }

  const children = [...legacy.children];
  for (const child of children) {
    legacy.remove(child);
    caster.swivelPivot.add(child);
  }
  caster.swivelPivot.remove(legacy);
  caster.kingpinPivot = null;
}

/**
 * Places steer pivot at basket stance + offsets and re-rigid-bodies fork / hub / wheel.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {THREE.Mesh} connectorMesh
 * @param {THREE.Mesh[]} forkMeshes
 * @param {THREE.Mesh | null | undefined} wheelMesh
 * @param {THREE.Vector3} baseKingpin Frozen detected kingpin (no slider offsets).
 * @param {THREE.Vector3} steerPivot Final Y-axis rotation point in model space.
 * @param {number} stanceX Basket-corner anchor X for corner velocity kinematics.
 * @param {number} stanceZ Basket-corner anchor Z for corner velocity kinematics.
 * @param {THREE.Object3D} modelRoot
 */
function layoutRaveGltfCasterAssembly(
  caster,
  connectorMesh,
  forkMeshes,
  wheelMesh,
  baseKingpin,
  steerPivot,
  stanceX,
  stanceZ,
  modelRoot,
) {
  collapseRaveGltfLegacyKingpinPivot(caster);

  caster.swivelPivot.position.copy(steerPivot);
  caster.swivelPivot.rotation.set(0, 0, 0);
  caster.hubLocalX = stanceX * raveGltfTuning.scale;
  caster.hubLocalZ = stanceZ * raveGltfTuning.scale;

  for (const mesh of forkMeshes) {
    reparentRaveGltfCasterPart(mesh, baseKingpin, caster.swivelPivot, modelRoot);
  }
  reparentRaveGltfCasterPart(connectorMesh, baseKingpin, caster.swivelPivot, modelRoot);

  if (wheelMesh && caster.rollPivot) {
    updateRaveGltfCasterRollPivot(caster.rollPivot, wheelMesh, baseKingpin, modelRoot);

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
  const steerPivotObj = cartRoot.getObjectByName(`RaveGltfForkPivot_${casterId}`);
  steerPivotObj?.getWorldPosition(_worldPosScratch);
  const steerWx = _worldPosScratch.x;
  const steerWy = _worldPosScratch.y;
  const steerWz = _worldPosScratch.z;

  modelRoot.localToWorld(_kingpinBaseScratch.copy(baseKingpin));
  const baseWx = _kingpinBaseScratch.x;
  const baseWy = _kingpinBaseScratch.y;
  const baseWz = _kingpinBaseScratch.z;

  let connectorWorldTag = "connectorHubWorld=n/a pivotToConnector=n/a";
  if (connectorMesh) {
    connectorMesh.getWorldPosition(_connectorHubScratch);
    connectorWorldTag =
      `connectorHubWorld=(${_connectorHubScratch.x.toFixed(3)}, ${_connectorHubScratch.y.toFixed(3)}, ${_connectorHubScratch.z.toFixed(3)}) ` +
      `pivotToConnector=(${(steerWx - _connectorHubScratch.x).toFixed(3)}, ` +
      `${(steerWy - _connectorHubScratch.y).toFixed(3)}, ` +
      `${(steerWz - _connectorHubScratch.z).toFixed(3)})`;
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
        `pivotToForkTop=(${(steerWx - _kingpinBaseScratch.x).toFixed(3)}, ` +
        `${(steerWy - _kingpinBaseScratch.y).toFixed(3)}, ` +
        `${(steerWz - _kingpinBaseScratch.z).toFixed(3)})`;
    }
  }

  console.debug(
    `[cartRaveGltf] ${context} caster ${casterId} (${cornerLabel}) kingpin: ` +
      `baseModel=(${baseKingpin.x.toFixed(3)}, ${baseKingpin.y.toFixed(3)}, ${baseKingpin.z.toFixed(3)}) ` +
      `baseWorld=(${baseWx.toFixed(3)}, ${baseWy.toFixed(3)}, ${baseWz.toFixed(3)}) ` +
      `offsetModel=(${(authoredKingpin.x - baseKingpin.x).toFixed(3)}, ${(authoredKingpin.y - baseKingpin.y).toFixed(3)}, ${(authoredKingpin.z - baseKingpin.z).toFixed(3)}) ` +
      `steerModel=(${targetKingpin.x.toFixed(3)}, ${targetKingpin.y.toFixed(3)}, ${targetKingpin.z.toFixed(3)}) ` +
      `steerWorld=(${steerWx.toFixed(3)}, ${steerWy.toFixed(3)}, ${steerWz.toFixed(3)}) ` +
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

/** @returns {GLTFLoader} */
function getLoader() {
  if (!_loader) {
    _loader = new GLTFLoader();
    _loader.setDRACOLoader(getSharedDracoLoader());
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
  const obj = /** @type {any} */ (object);
  if (!obj.isMesh?.geometry) return null;

  const geometry = obj.geometry;
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
    const obj = /** @type {any} */ (object);
    const mat = obj.isMesh
      ? (Array.isArray(obj.material) ? obj.material[0] : obj.material)
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
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
 * Reads a source texture's decoded image dimensions when it can be drawn to a 2D canvas.
 * Handles both `ImageBitmap` (three r185 Draco/WebP path) and `HTMLImageElement`/`HTMLCanvasElement`.
 * Returns null for compressed (KTX2) or not-yet-decoded images that `drawImage` cannot accept.
 *
 * @param {THREE.Texture | null | undefined} texture
 * @returns {{ image: CanvasImageSource, width: number, height: number } | null}
 */
function getDrawableTextureImage(texture) {
  if (!texture || /** @type {any} */ (texture).isCompressedTexture) return null;
  const image = /** @type {any} */ (texture).image;
  if (!image) return null;

  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { image, width: image.width, height: image.height };
  }
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return { image, width: image.width, height: image.height };
  }
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0 && image.complete) return { image, width, height };
    return null;
  }
  return null;
}

/**
 * Builds (and caches) a grayscale emissive wire mask from a source albedo texture. The mask
 * keeps only the bright neon wire strokes (soft luminance ramp) so wire glow can be tuned
 * without brightening the whole body surface. Cached by `texture.uuid`; shared across carts.
 *
 * @param {THREE.Texture | null | undefined} srcAlbedo
 * @returns {THREE.CanvasTexture | null} Wire mask, or null when the image cannot be decoded.
 */
function buildRaveGltfWireEmissiveMask(srcAlbedo) {
  if (!srcAlbedo) return null;

  const cached = _wireEmissiveMaskCache.get(srcAlbedo.uuid);
  if (cached !== undefined) return cached;

  const drawable = getDrawableTextureImage(srcAlbedo);
  if (!drawable) {
    _wireEmissiveMaskCache.set(srcAlbedo.uuid, null);
    return null;
  }

  /** @type {THREE.CanvasTexture | null} */
  let mask = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = drawable.width;
    canvas.height = drawable.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(drawable.image, 0, 0, drawable.width, drawable.height);
      const pixels = ctx.getImageData(0, 0, drawable.width, drawable.height);
      const { data } = pixels;
      const low = RAVE_GLTF_WIRE_MASK_BRIGHTNESS_LOW;
      const high = RAVE_GLTF_WIRE_MASK_BRIGHTNESS_HIGH;
      const span = Math.max(high - low, 1e-4);

      for (let i = 0; i < data.length; i += 4) {
        const brightness = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
        let t = (brightness - low) / span;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const value = Math.round(t * t * (3 - 2 * t) * 255);
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);

      mask = new THREE.CanvasTexture(canvas);
      // * Mask is data (intensity), not colour — no sRGB decode. Copy UV settings so it lines
      // * up with the albedo's UVs on the body geometry.
      mask.colorSpace = THREE.NoColorSpace;
      mask.wrapS = srcAlbedo.wrapS;
      mask.wrapT = srcAlbedo.wrapT;
      mask.repeat.copy(srcAlbedo.repeat);
      mask.offset.copy(srcAlbedo.offset);
      mask.center.copy(srcAlbedo.center);
      mask.rotation = srcAlbedo.rotation;
      mask.flipY = srcAlbedo.flipY;
      mask.channel = srcAlbedo.channel;
      mask.needsUpdate = true;
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[cartRaveGltf] wire mask generation failed; reusing albedo as emissive map", err);
    }
    mask = null;
  }

  _wireEmissiveMaskCache.set(srcAlbedo.uuid, mask);
  return mask;
}

/**
 * Clones authored GLTF material for one instance with role-specific PBR + trim mask setup.
 *
 * Face-role meshes (sunglasses frame + lenses + accent) are recolored as a mirrored
 * finish using the resolved {@link SunglassesStyleDef}; the handle role keeps the
 * static dark plastic trim.
/**
 * Clones authored GLTF material for one instance with role-specific PBR + trim mask setup.
 *
 * Face-role meshes (sunglasses frame + lenses + accent) are recolored as a mirrored
 * finish using the resolved {@link SunglassesStyleDef}; the handle role keeps the
 * static dark plastic trim.
 *
 * @param {THREE.MeshStandardMaterial} srcMat
 * @param {RaveGltfPartRole} role
 * @param {string | null | undefined} [sunglassesStyle] - SunglassesStyleDef id; defaults to silver mirror.
 * @returns {THREE.MeshPhysicalMaterial}
 */
function cloneRaveGltfMaterial(srcMat, role, sunglassesStyle) {
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
    // * Wireframe trim lives in the albedo map. Generate a dedicated emissive wire mask from
    // * it so glow intensity tunes independently of surface colour; fall back to reusing the
    // * albedo as the emissive mask when the image can't be decoded (compressed / not ready).
    const wireMask = buildRaveGltfWireEmissiveMask(srcMat.map);
    mat.emissiveMap = wireMask || srcMat.emissiveMap || srcMat.map || null;
    mat.userData.raveGltfHasEmissiveAccent = !!mat.emissiveMap;
    if (mat.color) mat.userData.raveGltfAuthoredColor = mat.color.clone();
  } else if (role === "wheel") {
    mat.userData.raveGltfHasEmissiveAccent = false;
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else if (role === "fork") {
    mat.userData.raveGltfHasEmissiveAccent = false;
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else if (role === "handle" || role === "smile") {
    // * Smile: static glossy-black face trim — deliberately NOT the sunglasses style
    // * (the picked style color was tinting the mouth, playtest 2026-07-16).
    mat.userData.raveGltfHasEmissiveAccent = false;
    mat.color.setHex(RAVE_GLTF_DARK_TRIM_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
  } else if (role === "face") {
    // * Sunglasses "Mirror Finish": override PBR with the resolved style so the lens
    // * + frame + accent assembly reads as a metallic mirrored visor. Applied after
    // * the frame preset so style values win over the rave frame preset defaults.
    const style = resolveSunglassesStyle(sunglassesStyle);
    mat.userData.raveGltfHasEmissiveAccent = false;
    // * White metal base — the per-style GRADIENT env map carries the hue (Pit Viper
    // * rework, Wyatt reference 2026-07-16). The old scheme (style-tinted albedo over a
    // * shared mostly-dark neon env) multiplied color into grey reflections → every
    // * style read washed out. A white mirror reflecting a saturated hot-core→cool-edge
    // * gradient gives the iridescent angle-dependent color of the reference instead.
    if (mat.color) mat.color.setHex(0xffffff);
    mat.metalness = style.metalness;
    mat.roughness = style.roughness;
    mat.envMapIntensity = style.envMapIntensity;
    mat.clearcoat = style.clearcoat;
    const lensEnv = getSunglassesStyleEnvMap(style) ?? getNeonLensEnvMap();
    if (lensEnv) mat.envMap = lensEnv;
    // * Emissive floor in the style's core color so the visor never goes fully black
    // * in a dark corner — low intensity, the reflections do the talking now.
    if (mat.emissive) {
      mat.emissive.set(style.gradient?.[0] ?? style.color);
      mat.emissiveIntensity = SUNGLASSES_LENS_EMISSIVE_INTENSITY;
    }
    mat.userData.raveGltfSunglassesStyle = style.id;
  } else if (role === "faceFrame" || role === "faceLens") {
    const style = resolveSunglassesStyle(sunglassesStyle);
    mat.userData.raveGltfHasEmissiveAccent = false;
    mat.map = null;
    if (mat.emissive) mat.emissive.setHex(0x000000);
    if (role === "faceFrame") {
      if (mat.color) mat.color.setHex(style.frameColor ?? style.color);
      mat.envMapIntensity = 0.45;
    } else {
      if (mat.color) mat.color.setHex(0xffffff);
      mat.metalness = style.metalness;
      mat.roughness = style.roughness;
      mat.envMapIntensity = style.envMapIntensity;
      mat.clearcoat = style.clearcoat;
      const lensEnv = getSunglassesStyleEnvMap(style) ?? getNeonLensEnvMap();
      if (lensEnv) mat.envMap = lensEnv;
      if (mat.emissive) {
        mat.emissive.set(style.gradient?.[0] ?? style.color);
        mat.emissiveIntensity = SUNGLASSES_LENS_EMISSIVE_INTENSITY;
      }
    }
    mat.userData.raveGltfSunglassesStyle = style.id;
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

  // * "face" keeps its style self-tint (set above) — everything else without an
  // * emissive mask is forced dark so only authored accents bloom.
  if (mat.emissive && !mat.emissiveMap && role !== "body" && role !== "face" && role !== "faceFrame" && role !== "faceLens") mat.emissive.setHex(0x000000);

  return mat;
}

/** @type {Map<string, THREE.Texture>} Per-style gradient reflection envs, keyed by style id. */
const _sunglassesStyleEnvMaps = new Map();

/**
 * Lazily builds the per-style "Pit Viper" reflection environment: a saturated radial
 * gradient — hot core color at the forward horizon melting through the style's stops to
 * a near-black rim — plus a white sun-glint and a thin horizon streak for the mirror
 * sparkle. Because the visor is a curved metalness-1.0 mirror, this env IS the finish:
 * face-on shows the hot core, grazing angles sweep through the cool edge stops, exactly
 * the reference lens (Wyatt 2026-07-16). Equirect canvas, same pipeline as the neon env;
 * one texture per style per session, shared by every cart instance using that style.
 *
 * @param {import("./cartThemeConfig.js").SunglassesStyleDef} style
 * @returns {THREE.Texture | null}
 */
function getSunglassesStyleEnvMap(style) {
  const stops = style?.gradient;
  if (!stops || stops.length < 2) return null;
  const cached = _sunglassesStyleEnvMaps.get(style.id);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // * Radial burst from the forward horizon point: style stops span the first 82% of
  // * the radius, then fall to near-black so grazing angles/rim go dark like the
  // * reference frame edges. Radius overshoots the canvas so the seam (behind the
  // * viewer) lands in the dark tail on both sides.
  const grad = ctx.createRadialGradient(w / 2, h * 0.5, 2, w / 2, h * 0.5, w * 0.58);
  const span = 0.82;
  stops.forEach((c, i) => {
    grad.addColorStop((i / (stops.length - 1)) * span, c);
  });
  grad.addColorStop(1, "#05060d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // * Hot white sun-glint just above center — the specular ping that sells "mirror".
  const glint = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.09);
  glint.addColorStop(0, "rgba(255,255,255,0.95)");
  glint.addColorStop(0.4, "rgba(255,255,255,0.35)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, w, h);

  // * Thin bright horizon streak — the sharp mirror band that sweeps as the cart turns.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(0, h * 0.485, w, 3);

  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _sunglassesStyleEnvMaps.set(style.id, tex);
  return tex;
}

/** @type {THREE.Texture | null} Shared neon reflection env for the sunglasses lenses. */
let _neonLensEnvMap = null;

/**
 * Lazily builds a shared neon "arena reflection" environment used only by the sunglasses
 * lens material. `scene.environment` is a neutral RoomEnvironment probe, so the mirror-finish
 * lenses reflected flat grey in the dark arenas and read dead. This dedicated equirect env
 * gives them punchy neon reflections (the "Pit Viper" look) without touching the rest of the
 * scene or paying for a per-frame reflection probe. Authored once per session.
 *
 * @returns {THREE.Texture | null}
 */
function getNeonLensEnvMap() {
  if (_neonLensEnvMap) return _neonLensEnvMap;
  if (typeof document === "undefined") return null;
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // * Dark base with a faint purple floor/ceiling.
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#05010a");
  base.addColorStop(0.5, "#160b26");
  base.addColorStop(1, "#04020a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // * Neon horizon band across the middle — the bright arena glow the lens sweeps as it turns.
  const horizon = ctx.createLinearGradient(0, 0, w, 0);
  horizon.addColorStop(0.0, "#ff2bd6");
  horizon.addColorStop(0.25, "#00e5ff");
  horizon.addColorStop(0.5, "#7a5cff");
  horizon.addColorStop(0.72, "#39ff88");
  horizon.addColorStop(1.0, "#ff2bd6");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, h * 0.36, w, h * 0.28);

  // * Vertical neon strip-lights (arena columns) — bright bars that streak across the lens.
  const stripColors = ["#ff2bd6", "#00e5ff", "#39ff88", "#ffd23a", "#ff6a2b"];
  for (let i = 0; i < 7; i += 1) {
    const x = (i + 0.5) * (w / 7) + (Math.random() - 0.5) * 16;
    const bw = 6 + Math.random() * 10;
    ctx.fillStyle = stripColors[i % stripColors.length];
    ctx.fillRect(x - bw / 2, h * 0.18, bw, h * 0.64);
  }

  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _neonLensEnvMap = tex;
  return tex;
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

  const wheelMesh = meshByName.get(group.wheel);
  captureRaveGltfCasterRestTransforms(
    forkMeshes,
    connectorMesh,
    wheelMesh?.userData.raveGltfPartRole === "wheel" ? wheelMesh : undefined,
    modelRoot,
  );

  const {
    baseKingpin,
    steerPivot,
    stanceX,
    stanceZ,
    authored: authoredAttach,
  } = computeRaveGltfCasterSteerLayout(
    forkMeshes,
    bodyMesh,
    group.label,
    modelRoot,
    connectorMesh,
  );
  const primaryForkMesh = pickPrimaryRaveGltfForkMesh(forkMeshes);
  const authoredForkYaw = primaryForkMesh
    ? computeRaveGltfAuthoredForkYaw(primaryForkMesh, modelRoot)
    : 0;

  const swivelPivot = new THREE.Group();
  swivelPivot.name = `RaveGltfForkPivot_${group.id}`;
  swivelPivot.quaternion.identity();
  swivelPivot.scale.set(1, 1, 1);

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
    axle: group.label.startsWith("front") ? "front" : "rear",
    swivelPivot,
    kingpinPivot: null,
    rollPivot,
    authoredForkYaw,
    hubLocalX: stanceX * raveGltfTuning.scale,
    hubLocalZ: stanceZ * raveGltfTuning.scale,
    baseKingpinModel: baseKingpin.clone(),
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
    baseKingpin,
    steerPivot,
    stanceX,
    stanceZ,
    modelRoot,
  );

  setObjectAxisRotation(
    getRaveGltfCasterSteerPivot(caster),
    RAVE_GLTF_CASTER_SWIVEL_AXIS,
    caster.smoothedHeading - authoredForkYaw,
  );

  if (import.meta.env?.DEV) {
    logRaveGltfCasterKingpinDiagnostics(
      "build",
      group.id,
      group.label,
      cartRoot,
      modelRoot,
      baseKingpin,
      authoredAttach,
      steerPivot,
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
    const role = c.userData.raveGltfPartRole || resolveRaveGltfPartRole(c);
    if (role === "wheel") wheelMeshes.push(c);
    else if (role === "body" || role === "handle" || role === "face" || role === "smile" || role === "trim") {
      bodyMeshes.push(c);
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
 * Reapplies `raveGltfTuning` layout keys on one live rave GLTF cart (scale, stance, kingpin).
 * Steering / damping keys do not need this — they are read every frame.
 *
 * @param {THREE.Object3D} cartRoot
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
    applyRaveGltfBodyYDropToGroup(/** @type {THREE.Group} */ (bodyGroup));
  }

  const data = cartRoot.userData.cartVisual;
  if (!data?.casters?.length || _sourceLayout !== "cartrave4") return;

  const bodyMesh = cartRoot.getObjectByName("CartFrame") ?? model.getObjectByName("CartFrame");
  /** @type {Map<string, THREE.Mesh>} */
  const meshByName = new Map();
  model.traverse((child) => {
    const mesh = /** @type {THREE.Mesh} */ (child);
    if (mesh.isMesh && mesh.name) meshByName.set(mesh.name, mesh);
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

    const wheelMesh = meshByName.get(group.wheel);
    captureRaveGltfCasterRestTransforms(
      forkMeshes,
      connectorMesh,
      wheelMesh?.userData.raveGltfPartRole === "wheel" ? wheelMesh : undefined,
      model,
    );

    const {
      baseKingpin,
      steerPivot,
      stanceX,
      stanceZ,
    } = computeRaveGltfCasterSteerLayout(
      forkMeshes,
      /** @type {THREE.Mesh | null | undefined} */ (bodyMesh),
      group.label,
      model,
      connectorMesh,
      caster.baseKingpinModel ?? null,
    );
    if (!caster.baseKingpinModel) {
      caster.baseKingpinModel = baseKingpin.clone();
    }

    const rollWheelMesh = caster.rollPivot?.children[0];

    layoutRaveGltfCasterAssembly(
      caster,
      connectorMesh,
      forkMeshes,
      rollWheelMesh?.isMesh
        ? /** @type {THREE.Mesh} */ (rollWheelMesh)
        : wheelMesh?.isMesh
          ? wheelMesh
          : undefined,
      baseKingpin,
      steerPivot,
      stanceX,
      stanceZ,
      model,
    );

    if (caster.wheelRadius) {
      maxWheelRadius = Math.max(maxWheelRadius, caster.wheelRadius);
    }
  }

  data.wheelRadius = maxWheelRadius;
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
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (mesh.isMesh && mesh.name) meshByName.set(mesh.name, mesh);
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

      const { authored, steerPivot, baseKingpin } = computeRaveGltfCasterSteerLayout(
        forkMeshes,
        /** @type {THREE.Mesh} */ (bodyMesh),
        group.label,
        model,
        connectorMesh,
      );

      logRaveGltfCasterKingpinDiagnostics(
        "inspect",
        caster.id,
        group.label,
        obj,
        model,
        baseKingpin,
        authored,
        steerPivot,
        connectorMesh,
        pickPrimaryRaveGltfForkMesh(forkMeshes),
      );
    }
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
    const mesh = /** @type {THREE.Mesh | undefined} */ (model.getObjectByName(partName));
    if (mesh?.isMesh) meshes.push(mesh);
  }
  // * One mesh is valid since the one-piece visor swap (group still wanted — theme
  // * face policy toggles "RaveGltfFaceGroup" visibility).
  if (meshes.length < 1) return;

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
    // * Preserve the smile's distinct role — a blanket "face" stamp here would opt the
    // * mouth back into the sunglasses style treatment.
    if (!mesh.userData.raveGltfPartRole) mesh.userData.raveGltfPartRole = "face";
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
    const role = resolveRaveGltfPartRole(c);
    c.userData.raveGltfPartRole = role;
    if (c.name) meshByName.set(c.name, c);

    if (role === "body") {
      child.name = "CartFrame";
      child.userData.isCartFrame = true;
      child.userData.preserveGltfMaps = true;
      meshByName.set("CartFrame", /** @type {THREE.Mesh} */ (child));
    } else if (role === "handle") {
      child.userData.isHandle = true;
    } else if (role === "face" || role === "smile") {
      // * isFace keeps theme tinting off the smile too (cartThemes skips isFace parts).
      child.userData.isFace = true;
    } else if (role === "wheel" || role === "fork") {
      animMeshes.push(/** @type {THREE.Mesh} */ (child));
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
      forkPivots.push(/** @type {THREE.Group} */ (getRaveGltfCasterSteerPivot(caster)));
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
      if (casters.some((c) => c.swivelPivot === pivot || c.kingpinPivot === pivot)) continue;
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

/** @param {THREE.MeshStandardMaterial} mat @param {number} neonHex @param {number} intensityMul */
function applyRaveGltfTrimEmissive(mat, neonHex, intensityMul = 1) {
  if (mat.emissive) {
    mat.emissive.setHex(neonHex);
  }
  if (typeof mat.emissiveIntensity === "number") {
    mat.emissiveIntensity = getRaveGltfTrimEmissiveIntensity(neonHex, intensityMul);
  }
}

/** @param {THREE.MeshStandardMaterial} mat @param {number} neonHex @param {number} strength */
function applyRaveGltfBodyTint(mat, neonHex, strength) {
  if (!mat?.color || strength <= 0) return;

  // * CART-COLOR-DEPTH-1 — let emissive carry the neon read while the body stays deep.
  // * Scaling preserves the picked color's channel ratio, so the leader white-mix can
  // * return to this exact base instead of returning to the pastel-rendering raw albedo.
  _bodyTintNeon.setHex(neonHex).multiplyScalar(RAVE_GLTF_BODY_TINT_SCALE);

  if (strength >= 1) {
    mat.color.copy(_bodyTintNeon);
    mat.needsUpdate = true;
    return;
  }

  const authored = mat.userData?.raveGltfAuthoredColor;
  if (authored?.isColor) _bodyTintScratch.copy(authored);
  else _bodyTintScratch.setRGB(1, 1, 1);

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

/**
 * Replaces the segmented cartrave4 sunglasses (frame 8 + lenses 9/11) with the
 * one-piece visor GLB, fitted to those parts' bounds so the visor sits exactly where
 * the old glasses did. The SMILE (tripo_part_7) is untouched — it stays on the basket
 * below the visor and keeps its face-role mirror tint. Runs ONCE on the shared source
 * scene before any instance is cloned:
 *
 * - The visor mesh is named "SunglassesVisor" (mapped to role "face" in
 *   RAVE_GLTF_PART_ROLES_V4), so every existing customization path — mirror-style
 *   recolor, neon lens envMap, theme face policy — applies unchanged.
 * - Placement is baked onto the MESH transform (like the old parts), NOT a wrapper
 *   group: applyRaveGltfBodyScale reparents face meshes by their own positions, and
 *   groupRaveGltfFaceAssembly builds "RaveGltfFaceGroup" per instance afterwards.
 * - The basket body (tripo_part_0) was a wire lattice with NO geometry behind the glasses
 *   footprint (the authored parts covered a hole). It is now hand-sealed in the master
 *   (2026-07-12 re-export), so the visor sits at its natural approved size over solid
 *   basket — no runtime patch needed.
 * - The old parts (8/9/11) no longer ship, so the footprint is a baked constant
 *   (RAVE_GLTF_V4_SUNGLASSES_FOOTPRINT); leftover parts are removed defensively.
 * - Its authored base-color map is dropped: frame and lens materials are fully procedural
 *   (cloneRaveGltfMaterial gives the frame a solid colour and the lenses the mirror finish).
 *
 * @param {THREE.Object3D} sourceScene
 * @returns {Promise<void>}
 */
async function integrateOnePieceSunglasses(sourceScene) {
  // * Attach point: the node the face parts (smile + glasses) live under. Fall back to
  // * the smile's parent, then the scene, so a hierarchy tweak can't silently no-op this.
  const smile = sourceScene.getObjectByName("tripo_part_7");
  const parent = sourceScene.getObjectByName(RAVE_GLTF_V4_FACE_PARENT_NODE)
    || smile?.parent
    || sourceScene;

  // * Remove the segmented glasses if this asset still ships them (pre-seal builds). The
  // * hand-sealed basket (2026-07-12) deleted 8/9/11, so this is usually a no-op now.
  for (const name of RAVE_GLTF_V4_SUNGLASSES_PARTS) {
    const mesh = /** @type {THREE.Object3D | null} */ (sourceScene.getObjectByName(name));
    if (mesh) mesh.parent?.remove(mesh);
  }

  const visorUrl = sunglassesVisorUrl();
  const visorScene = await loadRaveGltfFromUrl(visorUrl);
  /** @type {THREE.Mesh | null} */
  let visor = null;
  visorScene.traverse((child) => {
    const c = /** @type {any} */ (child);
    if (!visor && c.isMesh) visor = c;
  });
  if (!visor) throw new Error(`No mesh found in ${visorUrl}`);

  // * Footprint of the old glasses in ParentNode-local space, from the baked constant
  // * (the parts it was measured from no longer ship — see the constant's docstring).
  const fp = RAVE_GLTF_V4_SUNGLASSES_FOOTPRINT;
  const box = new THREE.Box3(
    new THREE.Vector3(fp.min[0], fp.min[1], fp.min[2]),
    new THREE.Vector3(fp.max[0], fp.max[1], fp.max[2]),
  );
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // * Visor authoring axes (Tripo export): width along Z, height Y, lenses facing ±X.
  const geo = visor.geometry;
  geo.center();
  geo.computeBoundingBox();
  const visorSplit = splitRaveGltfVisorGeometry(geo);
  const vSize = geo.boundingBox
    ? geo.boundingBox.getSize(new THREE.Vector3())
    : new THREE.Vector3(0.15, 0.22, 0.69);

  // * Fit: the approved uniform width-match of the old glasses (frame 8 + lenses 9/11).
  // * The basket front (tripo_part_0) is hand-sealed in Blender behind this footprint
  // * (2026-07-12 master re-export), so the visor just sits at its natural size, dropped
  // * a smidge onto the sealed face.
  const widthAxis = size.x >= size.z ? "x" : "z";
  const depthAxis = widthAxis === "x" ? "z" : "x";
  const facingSign = Math.sign(center[depthAxis]) || 1;
  const scale = size[widthAxis] / (vSize.z || 1);
  const yaw = depthAxis === "x"
    ? (facingSign > 0 ? 0 : Math.PI)
    : (facingSign > 0 ? -Math.PI / 2 : Math.PI / 2);

  const visorMesh = new THREE.Mesh(geo, visor.material);
  visorMesh.name = "SunglassesVisor";
  const mat = /** @type {any} */ (Array.isArray(visor.material) ? visor.material[0] : visor.material);
  if (mat) mat.map = null; // frame/lens finish is procedural — drop the baked single-material map
  visorMesh.position.copy(center);
  // * Top-edge aligned to the old frame box, then lowered a smidge so it seats naturally
  // * over the sealed basket face.
  const VISOR_LOWER = size.y * 0.12;
  visorMesh.position.y = box.max.y - (vSize.y * scale) / 2 - VISOR_LOWER;
  // * Keep the lens plane where the old assembly's outer face was (centered geometry
  // * would otherwise recess the visor by half its depth difference).
  visorMesh.position[depthAxis] += facingSign * (size[depthAxis] - vSize.x * scale) / 2;
  visorMesh.rotation.y = yaw;
  visorMesh.scale.setScalar(scale);
  visorMesh.userData.isFace = true;
  visorMesh.userData.raveGltfPartRole = "face";
  visorMesh.userData.raveGltfVisorSplit = visorSplit;
  parent.add(visorMesh);

  if (import.meta.env?.DEV) {
    console.debug(
      `[cartRaveGltf] One-piece sunglasses integrated (baked footprint, smile kept), ` +
      `widthAxis=${widthAxis} facing=${facingSign > 0 ? "+" : "-"}${depthAxis} ` +
      `scale=${scale.toFixed(3)} ` +
      `pos=(${visorMesh.position.x.toFixed(3)}, ${visorMesh.position.y.toFixed(3)}, ${visorMesh.position.z.toFixed(3)})`,
    );
  }
}

/** @returns {Promise<{ scene: THREE.Group, url: string }>} */
async function loadRaveGltfSourceScene() {
  /** @type {Error | null} */
  let lastError = null;

  // * Runtime ships DRACO only (~1.1 MB combined). Uncompressed masters stay in art/models/.
  // * publicUrl(): Glitch CDN nests the build — root-absolute /models/* 403s there.
  try {
    const url = raveGltfUrl();
    const scene = await loadRaveGltfFromUrl(url);
    return { scene, url };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      `[cartRaveGltf] Primary DRACO unavailable (${RAVE_GLTF_PATH}), trying legacy DRACO.`,
      lastError.message,
    );
  }

  try {
    const url = raveGltfUrlDraco();
    const scene = await loadRaveGltfFromUrl(url);
    console.warn(
      `[cartRaveGltf] Fell back to Draco-compressed legacy GLTF (${RAVE_GLTF_PATH_DRACO}).`,
    );
    return { scene, url };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  throw lastError ?? new Error("[cartRaveGltf] Failed to load rave GLTF (DRACO tiers only).");
}

/** @returns {boolean} */
export function isRaveGltfSourceReady() {
  return _sourceScene !== null;
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
    .then(async ({ scene, url }) => {
      scene.name = scene.name || "RaveCartGltfSource";
      _loadedUrl = url;
      _sourceLayout = detectRaveGltfLayout(scene, url);

      // * One-piece sunglasses swap (cartrave4 only). Failure is non-fatal: the
      // * segmented face parts stay in place and every downstream path still works.
      if (_sourceLayout === "cartrave4") {
        try {
          await integrateOnePieceSunglasses(scene);
        } catch (err) {
          console.warn(
            "[cartRaveGltf] One-piece sunglasses unavailable — keeping segmented parts:",
            err,
          );
        }
      }

      if (!/cartrave4-draco\.glb(\?|#|$)/i.test(url)) {
        console.warn(
          `[cartRaveGltf] Using fallback GLTF (${url}) instead of primary ${RAVE_GLTF_PATH}.`,
        );
      }

      if (import.meta.env?.DEV) {
        const names = [];
        scene.traverse((child) => {
          const c = /** @type {any} */ (child);
          if (c.isMesh) names.push(c.name || "(unnamed mesh)");
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

/**
 * @param {string | null | undefined} [sunglassesStyle] - SunglassesStyleDef id; defaults to silver mirror when omitted.
 * @returns {THREE.Group}
 */
export function createRaveGltfCartInstance(sunglassesStyle) {
  if (!_sourceScene) {
    throw new Error("[cartRaveGltf] Source not loaded — call prefetchRaveGltf() first.");
  }

  const root = new THREE.Group();
  root.name = "CartVisual";
  root.userData.isRaveGltf = true;
  root.userData.cartThemeId = "rave";
  if (sunglassesStyle) root.userData.raveGltfSunglassesStyle = sunglassesStyle;

  const model = new THREE.Group();
  model.name = "RaveGltfModel";
  applyRaveGltfOrientationCorrection(model);
  model.scale.setScalar(raveGltfTuning.scale);
  model.position.y = raveGltfTuning.yOffset;

  // * Intra-cart material dedup: parts whose clone inputs are identical (role + maps +
  // * authored color) share one material instance — e.g. the 4 wheels, paired lenses.
  // * Body is excluded (carries per-material raveGltfAuthoredColor for tint lerps).
  // * Scoped per cart instance; carts never share materials across instances.
  /** @type {Map<string, THREE.MeshPhysicalMaterial>} */
  const materialMemo = new Map();

  /**
   * @param {THREE.Object3D} src
   * @param {THREE.Object3D} parent
   */
  const cloneHierarchy = (src, parent) => {
    const s = /** @type {any} */ (src);
    if (s.isMesh) {
      const srcMat = Array.isArray(s.material) ? s.material[0] : s.material;
      const role = resolveRaveGltfPartRole(s);
      const isSplitVisor = s.userData?.raveGltfVisorSplit === true;
      let material;
      if (isSplitVisor) {
        material = [
          cloneRaveGltfMaterial(srcMat, "faceFrame", sunglassesStyle),
          cloneRaveGltfMaterial(srcMat, "faceLens", sunglassesStyle),
        ];
      } else if (role === "body") {
        material = cloneRaveGltfMaterial(srcMat, role, sunglassesStyle);
      } else {
        const memoKey = [
          role,
          srcMat.map?.uuid ?? "-",
          srcMat.normalMap?.uuid ?? "-",
          srcMat.emissiveMap?.uuid ?? "-",
          srcMat.color ? srcMat.color.getHex() : "-",
        ].join("|");
        material = materialMemo.get(memoKey);
        if (!material) {
          material = cloneRaveGltfMaterial(srcMat, role, sunglassesStyle);
          materialMemo.set(memoKey, material);
        }
      }

      const mesh = new THREE.Mesh(s.geometry, material);
      mesh.name = src.name;
      mesh.position.copy(src.position);
      mesh.quaternion.copy(src.quaternion);
      mesh.scale.copy(src.scale);
      mesh.userData.raveGltfPartRole = role;
      mesh.userData.raveGltfVisorSplit = isSplitVisor;
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh || !c.material) return;

    const mats = Array.isArray(c.material) ? c.material : [c.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);

      const role = mat.userData?.raveGltfPartRole;
      if (role === "wheel" || role === "fork" || role === "handle" || role === "face" || role === "faceFrame" || role === "faceLens" || role === "smile") continue;

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
    // * FIX-EMISSIVE — rehydrate the trim stamped by setEmissiveTrimMul. Every rebuild path
    // * (frameVisuals + cartOrchestration cache misses, KO respawn) funnels through here, so
    // * this one line is what stops a classic cart popping back to full brightness.
    emissiveTrimMul: /** @type {any} */ (root?.userData)?.cartEmissiveTrimMul ?? 1,
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

  // * FIX-EMISSIVE — the cache-owned trim folds in here, so callers keep passing whatever
  // * intensityMul they already passed (usually 1) and still get a trimmed classic cart.
  const trimmedMul = intensityMul * trimMulOf(cache);
  for (const mat of cache.accentMats || []) {
    applyRaveGltfTrimEmissive(mat, neonHex, trimmedMul);
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
  // * FIX-EMISSIVE — this hardcoded 1 is the line that killed the card's first attempt: a classic
  // * cart popped back to full brightness the instant it took the lead. Reads the cache instead.
  // * KNOWN LIMIT, accepted: the blend below is `base*(1-whiteMix) + glowIntensity*whiteMix`, and
  // * glowIntensity is an absolute per-frame value that is NOT trim-scaled — so classic stays
  // * dimmer at idle and while the pulse rises, but converges with patterned at the peak flash.
  const baseIntensity = getRaveGltfTrimEmissiveIntensity(neonHex, trimMulOf(cache));
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

/** @returns {number} Front rigid-axle steer sign (−1 or +1). */
function getRaveGltfFrontAxleSign() {
  const sign = raveGltfTuning.frontAxleSign ?? -1;
  return sign >= 0 ? 1 : -1;
}

/**
 * * Maximum swivel/fork steering angle in radians (configured in degrees).
 * @returns {number}
 */
function getRaveGltfSwivelMaxAngle() {
  return (raveGltfTuning.swivelMaxAngleDeg ?? 135) * (Math.PI / 180);
}

/**
 * Per-axle coordinated car-steer: front/rear pairs share the same steer delta from their
 * mean rest heading so casters on an axle move together instead of lerping to different absolutes.
 *
 * @param {RaveGltfCasterRuntime[]} casters
 * @param {number} localVelX
 * @param {number} localVelZ
 * @param {number} bodySpeed
 * @param {number} scaledOmegaY Signed scaled yaw rate (rad/s).
 * @param {number} turnBlend Turn engagement [0 = rest, 1 = full steer].
 * @param {object} data `root.userData.cartVisual`
 * @param {number} dtSec
 * @returns {{
 *   frontSteerDelta: number,
 *   rearSteerDelta: number,
 *   frontMeanRest: number,
 *   rearMeanRest: number,
 * }}
 */
function computeRaveGltfAxleSteerDeltas(
  casters,
  localVelX,
  localVelZ,
  bodySpeed,
  scaledOmegaY,
  turnBlend,
  absBodyOmega,
  data,
  dtSec,
) {
  const { frontMeanRest, rearMeanRest } = computeRaveGltfAxleMeanRests(casters);
  const frontSign = getRaveGltfFrontAxleSign();

  const yawBlend = Math.max(0, Math.min(1, raveGltfTuning.yawSteerBlend));
  const frontYawDelta =
    scaledOmegaY
    * raveGltfTuning.steeringInfluence
    * raveGltfTuning.frontSteerMul
    * turnBlend
    * frontSign;
  const rearYawDelta =
    scaledOmegaY
    * raveGltfTuning.steeringInfluence
    * raveGltfTuning.rearSteerMul
    * computeRaveGltfRearSteerScale(absBodyOmega)
    * turnBlend;

  if (yawBlend >= 1) {
    return {
      frontSteerDelta: frontYawDelta,
      rearSteerDelta: rearYawDelta,
      frontMeanRest,
      rearMeanRest,
    };
  }

  let travelHeading = data.casterSmoothedTravelHeading;
  if (bodySpeed > 1e-4) {
    const instantTravel = Math.atan2(localVelX, localVelZ);
    const travelSmooth = raveGltfTuning.travelHeadingSmoothing;
    if (travelHeading == null || travelSmooth <= 0) {
      travelHeading = instantTravel;
    } else {
      const travelAlpha = (1 - travelSmooth) * Math.min(240 * dtSec, 1);
      travelHeading = lerpAngle(travelHeading, instantTravel, travelAlpha);
    }
    data.casterSmoothedTravelHeading = travelHeading;
  }

  const travelRef = travelHeading ?? frontMeanRest;
  const frontSteerOffset =
    scaledOmegaY * raveGltfTuning.steeringInfluence * raveGltfTuning.frontSteerMul * frontSign;
  const rearSteerOffset =
    scaledOmegaY
    * raveGltfTuning.steeringInfluence
    * raveGltfTuning.rearSteerMul
    * computeRaveGltfRearSteerScale(absBodyOmega);
  const frontTravelDelta = angleDeltaFromCenter(travelRef + frontSteerOffset, frontMeanRest) * turnBlend;
  const rearTravelDelta = angleDeltaFromCenter(travelRef + rearSteerOffset, rearMeanRest) * turnBlend;

  return {
    frontSteerDelta: frontTravelDelta + (frontYawDelta - frontTravelDelta) * yawBlend,
    rearSteerDelta: rearTravelDelta + (rearYawDelta - rearTravelDelta) * yawBlend,
    frontMeanRest,
    rearMeanRest,
  };
}

/**
 * Coordinated caster steer target for one corner (axle-shared delta + optional trail blend).
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {number} restHeading
 * @param {{ frontSteerDelta: number, rearSteerDelta: number }} axleSteer
 * @param {number} cornerVelVx
 * @param {number} cornerVelVz
 * @returns {number}
 */
function computeRaveGltfCoordinatedCasterTarget(
  caster,
  restHeading,
  axleSteer,
  cornerVelVx,
  cornerVelVz,
) {
  const axle = caster.axle ?? (caster.hubLocalX > 0 ? "front" : "rear");
  const sharedDelta = axle === "front" ? axleSteer.frontSteerDelta : axleSteer.rearSteerDelta;
  let targetHeading = restHeading + sharedDelta;

  const trailMix = raveGltfTuning.trailBlend;
  if (trailMix > 0) {
    const trailHeading = Math.atan2(cornerVelVx, cornerVelVz);
    targetHeading = trailMix >= 1
      ? trailHeading
      : lerpAngle(targetHeading, trailHeading, trailMix);
  }

  return targetHeading;
}

/**
 * Applies a rigid axle steer angle — identical pivot rotation on every caster on that axle.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {number} pivotSteerOffset Steer offset from rest (rad), shared across the axle.
 * @param {number} sharedHeading Absolute heading used for wheel-roll projection.
 */
function applyRaveGltfRigidAxleSteer(caster, pivotSteerOffset, sharedHeading) {
  const pivotYaw = RAVE_GLTF_CASTER_SWIVEL_REST_YAW + pivotSteerOffset;
  caster.smoothedPivotSteer = pivotSteerOffset;
  caster.smoothedHeading = sharedHeading;
  setObjectAxisRotation(
    getRaveGltfCasterSteerPivot(caster),
    RAVE_GLTF_CASTER_SWIVEL_AXIS,
    pivotYaw,
  );
}

/**
 * Updates shared front/rear axle pivot-steer state (one smoothed angle per axle).
 *
 * @param {object} data `root.userData.cartVisual`
 * @param {{ frontSteerDelta: number, rearSteerDelta: number } | null} axleSteer
 * @param {number} turnBlend
 * @param {boolean} cartTurning
 * @param {number} dtSec
 */
function updateRaveGltfAxleSteerState(data, axleSteer, turnBlend, cartTurning, dtSec) {
  const maxSteer = getRaveGltfSwivelMaxAngle();
  const frameAlpha = Math.min(240 * dtSec, 1);
  const frontAlpha = 1 - (1 - raveGltfTuning.frontTurnSteerDamping) ** frameAlpha;
  const rearAlpha = 1 - (1 - raveGltfTuning.turnSteerDamping) ** frameAlpha;
  const returnAlpha = 1 - (1 - raveGltfTuning.restReturnDamping) ** frameAlpha;

  if (turnBlend > 0 && axleSteer) {
    const prevFront = data.frontAxleSteerSmoothed ?? 0;
    const prevRear = data.rearAxleSteerSmoothed ?? 0;
    const targetFront = Math.max(-maxSteer, Math.min(maxSteer, axleSteer.frontSteerDelta));
    const targetRear = Math.max(-maxSteer, Math.min(maxSteer, axleSteer.rearSteerDelta));
    data.frontAxleSteerSmoothed = prevFront + (targetFront - prevFront) * frontAlpha;
    data.rearAxleSteerSmoothed = prevRear + (targetRear - prevRear) * rearAlpha;
    return;
  }

  const prevFront = data.frontAxleSteerSmoothed ?? 0;
  if (Math.abs(prevFront) > raveGltfTuning.straightRestEpsilon) {
    data.frontAxleSteerSmoothed = prevFront + (0 - prevFront) * returnAlpha;
  } else {
    data.frontAxleSteerSmoothed = 0;
  }

  if (!cartTurning) {
    const prevRear = data.rearAxleSteerSmoothed ?? 0;
    if (Math.abs(prevRear) > raveGltfTuning.straightRestEpsilon) {
      data.rearAxleSteerSmoothed = prevRear + (0 - prevRear) * returnAlpha;
    } else {
      data.rearAxleSteerSmoothed = 0;
    }
  }
}

/**
 * Signed ground speed along the wheel's rolling direction (m/s, forward-positive).
 *
 * The rolling direction is derived from the live pivot chain — the roll axle
 * (thin bbox axis) crossed with up — so a positive value always advances the
 * wheel the way the mesh visually rolls, regardless of authored fork yaw or
 * current swivel angle. (Projecting onto the steer heading, the previous
 * approach, collapsed to ~0 on a straight cruise and flipped sign with steer,
 * because authored fork yaws are not aligned with wheel-forward.)
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {{ vx: number, vz: number }} cornerVel Corner velocity in cart-velocity space.
 * @returns {number}
 */
function computeRaveGltfWheelRollSignedSpeed(caster, cornerVel) {
  const axis = caster.wheelRollAxis;
  _wheelRollDir.set(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  caster.rollPivot.updateWorldMatrix(true, false);
  _wheelRollDir
    .transformDirection(caster.rollPivot.matrixWorld)
    .applyQuaternion(_rootInv)
    .applyQuaternion(_modelInvQuat);
  // * travel = axle × up — positive roll about the axle advances the wheel this way.
  const dirX = -_wheelRollDir.z;
  const dirZ = _wheelRollDir.x;
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-4) return 0; // * degenerate (near-vertical axle) — skip roll this frame
  return (cornerVel.vx * dirX + cornerVel.vz * dirZ) / len;
}

/**
 * Applies absolute trail heading to a swivel pivot using its authored rest offset.
 *
 * @param {RaveGltfCasterRuntime} caster
 * @param {number} heading Absolute cart-local trail heading (rad).
 */
function applyRaveGltfCasterHeading(caster, heading) {
  caster.smoothedHeading = heading;
  caster.smoothedPivotSteer = undefined;
  setObjectAxisRotation(
    getRaveGltfCasterSteerPivot(caster),
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

  data.casterSteerEngaged = false;
  data.casterFilteredAbsOmega = 0;
  data.casterSmoothedTravelHeading = undefined;
  data.frontAxleSteerSmoothed = 0;
  data.rearAxleSteerSmoothed = 0;

  const rollAxis = data.wheelRollAxis || RAVE_GLTF_WHEEL_ROLL_AXIS;

  for (const caster of data.casters || []) {
    caster.wheelRoll = 0;
    caster.smoothedPivotSteer = 0;
    applyRaveGltfRigidAxleSteer(
      caster,
      0,
      caster.authoredForkYaw + RAVE_GLTF_CASTER_SWIVEL_REST_YAW,
    );

    if (!caster.rollPivot) continue;
    setObjectAxisRotation(
      caster.rollPivot,
      caster.wheelRollAxis || rollAxis,
      RAVE_GLTF_WHEEL_AXIS_CORRECTION,
    );
  }

  for (const pivot of data.forkPivots || []) {
    if ((data.casters || []).some((c) => c.swivelPivot === pivot || c.kingpinPivot === pivot)) continue;
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
 * Swivel: rest-biased on straight cruise; rigid shared front-axle pivot steer when turning;
 * rear uses one smoothed delta per pair. Wheel roll unchanged.
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

  const rawAbsBodyOmega = Math.abs(localOmegaY * RAVE_GLTF_CASTER_ANGVEL_MUL);
  const absBodyOmega = filterRaveGltfCasterAbsOmega(data, rawAbsBodyOmega, dtSec);
  const bodySpeed = Math.hypot(_localVel.x, _localVel.z);
  const straightCruise =
    bodySpeed >= raveGltfTuning.straightCruiseMinSpeed
    && absBodyOmega < raveGltfTuning.straightYawDeadzone;

  if (data.casterSteerEngaged) {
    if (absBodyOmega < raveGltfTuning.turnReleaseOmega) data.casterSteerEngaged = false;
  } else if (absBodyOmega >= raveGltfTuning.turnEngageOmega) {
    data.casterSteerEngaged = true;
  }
  const cartTurning = data.casterSteerEngaged === true;
  const turnBlend = cartTurning ? computeRaveGltfTurnEngagement(absBodyOmega) : 0;
  const scaledBodyOmega = localOmegaY * RAVE_GLTF_CASTER_ANGVEL_MUL;
  const turnSteerAlpha = 1 - (1 - raveGltfTuning.turnSteerDamping) ** Math.min(240 * dtSec, 1);
  const axleMeanRests = computeRaveGltfAxleMeanRests(casters);
  const maxSteer = getRaveGltfSwivelMaxAngle();
  const frontAxleRigid = raveGltfTuning.frontAxleRigid !== false;
  const axleSteer = turnBlend > 0
    ? computeRaveGltfAxleSteerDeltas(
      casters,
      _localVel.x,
      _localVel.z,
      bodySpeed,
      scaledBodyOmega,
      turnBlend,
      absBodyOmega,
      data,
      dtSec,
    )
    : null;

  updateRaveGltfAxleSteerState(data, axleSteer, turnBlend, cartTurning, dtSec);

  const frontPivotSteer = Math.max(
    -maxSteer,
    Math.min(maxSteer, data.frontAxleSteerSmoothed ?? 0),
  );
  const rearPivotSteer = Math.max(
    -maxSteer,
    Math.min(maxSteer, data.rearAxleSteerSmoothed ?? 0),
  );
  const frontSharedHeading = axleMeanRests.frontMeanRest + frontPivotSteer;

  /** @type {{ frontSteerDelta: number, rearSteerDelta: number, frontMeanRest: number, rearMeanRest: number } | null} */
  const axleSteerApplied = axleSteer
    ? {
      frontSteerDelta: frontPivotSteer,
      rearSteerDelta: rearPivotSteer,
      frontMeanRest: axleMeanRests.frontMeanRest,
      rearMeanRest: axleMeanRests.rearMeanRest,
    }
    : null;

  const shouldLogCoordination = raveGltfTuning.casterCoordinationLog === true;

  for (const caster of casters) {
    const cornerVel = computeRaveGltfCasterCornerLocalVel(
      _localVel.x,
      _localVel.z,
      localOmegaY,
      caster.hubLocalX,
      caster.hubLocalZ,
    );

    const restHeading = caster.authoredForkYaw + RAVE_GLTF_CASTER_SWIVEL_REST_YAW;
    const axle = caster.axle ?? (caster.hubLocalX > 0 ? "front" : "rear");
    const axleMeanRest = axle === "front" ? axleMeanRests.frontMeanRest : axleMeanRests.rearMeanRest;
    const pivotSteer = axle === "front" ? frontPivotSteer : rearPivotSteer;
    const restDelta = Math.abs(
      pivotSteer !== 0
        ? pivotSteer
        : angleDeltaFromCenter(caster.smoothedHeading, restHeading),
    );
    const needsRestReturn =
      !cartTurning
      && restDelta > raveGltfTuning.straightRestEpsilon;
    const straightCruiseLocked = straightCruise && !needsRestReturn;
    const shouldSteer = !straightCruiseLocked && (turnBlend > 0 || needsRestReturn);
    const restReturn = needsRestReturn && !cartTurning;
    const steerAlpha = restReturn
      ? 1 - (1 - raveGltfTuning.restReturnDamping) ** Math.min(240 * dtSec, 1)
      : (turnBlend > 0 ? turnSteerAlpha : swivelAlpha);

    if (frontAxleRigid && axle === "front") {
      if (!straightCruiseLocked || Math.abs(frontPivotSteer) > raveGltfTuning.straightRestEpsilon) {
        applyRaveGltfRigidAxleSteer(caster, frontPivotSteer, frontSharedHeading);
      } else {
        applyRaveGltfRigidAxleSteer(caster, 0, axleMeanRests.frontMeanRest);
      }
    } else if (shouldSteer) {
      const groupOffset = RAVE_GLTF_CASTER_SWIVEL_GROUP_OFFSETS[caster.id] ?? 0;
      const targetHeading = (turnBlend > 0 && axleSteerApplied
        ? computeRaveGltfCoordinatedCasterTarget(
          caster,
          restHeading,
          axleSteerApplied,
          cornerVel.vx,
          cornerVel.vz,
        )
        : restHeading)
        + RAVE_GLTF_CASTER_SWIVEL_YAW_OFFSET
        + groupOffset;
      const clampedTarget = clampAngleToRange(
        targetHeading,
        axleMeanRest,
        maxSteer,
      );
      const nextHeading = turnBlend > 0
        ? clampedTarget
        : clampAngleToRange(
          lerpAngle(caster.smoothedHeading, clampedTarget, steerAlpha),
          axleMeanRest,
          maxSteer,
        );
      applyRaveGltfCasterHeading(caster, nextHeading);
    } else {
      // * Hold last heading when settled at rest on a straight cruise.
      applyRaveGltfCasterHeading(
        caster,
        clampAngleToRange(
          caster.smoothedHeading,
          restHeading,
          maxSteer,
        ),
      );
    }

    if (!rollEnabled || !caster.rollPivot) continue;

    if (cornerVel.speed >= RAVE_GLTF_WHEEL_ROLL_MIN_SPEED) {
      const signedSpeed = computeRaveGltfWheelRollSignedSpeed(caster, cornerVel);
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

  if (shouldLogCoordination) {
    logRaveGltfCasterCoordination(casters);
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
  // * FIX-EMISSIVE — set BEFORE the recolor so the first paint is already trimmed.
  // * NOTE this is not the only place it must be set: match spawn calls this with no patternId
  // * (entities.js), so every match cart is born "classic" here and the real pattern lands later
  // * in updateCartMaterialsFromSlots, which sets it again.
  setEmissiveTrimMul(cache, patternId, root);
  applyRaveGltfColorToCache(cache, neonHex, 1, bodyTintStrength);
  applyCartPattern(root, patternId, neonHex);
  return cache;
}

/** @param {THREE.Object3D | null | undefined} root */
export function disposeRaveGltfInstance(root) {
  if (!root) return;

  if (root.parent) {
    root.parent.remove(root);
  }

  // * The pattern mask now lives inside the CartFrame body material (no separate overlay mesh),
  // * so every mesh material is per-instance and safe to dispose here. Generated wire-emissive
  // * masks are module-cached + shared across carts; Material.dispose() leaves textures alone.
  const disposedMats = new Set();
  root.traverse((child) => {
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
    disposeMaterialOnce(c.material, disposedMats);
  });
}
