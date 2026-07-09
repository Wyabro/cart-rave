/**
 * camera.js — Third-person chase camera follow (behind the local cart),
 * plus a cinematic fly-over camera used during the pre-round countdown.
 */

import * as THREE from "three";
import { RAPIER } from "./physics/rapierInstance.js";

// * Single reusable ray for camera-wall avoidance — lazily created once RAPIER is ready.
let _cameraRay = null;

// * Scratch look matrix for the death camera pan — reused every updateDeathCamera() call.
const _deathCamLookMat = new THREE.Matrix4();

/**
 * Camera controller modes.
 * @readonly
 * @enum {string}
 */
export const CameraMode = {
  FOLLOW: "follow",
  CINEMATIC_COUNTDOWN: "cinematic_countdown",
  CINEMATIC_PODIUM: "cinematic_podium",
  DEATH: "death",
};

/** @typedef {{
 *   followBack: number,
 *   followUp: number,
 *   lookAhead: number,
 *   lookUp: number,
 *   positionDamping: number,
 *   rotationDamping: number,
 *   snapDistance: number,
 * }} CameraFollowConfig */

/**
 * Tuning for the cinematic countdown fly-over.
 * @typedef {{
 *   radius: number,
 *   height: number,
 *   startAngle: number,
 *   angularSpeed: number,
 *   lookTargetY: number,
 * }} CinematicCountdownConfig */

/** @typedef {{
 *   pos: THREE.Vector3,
 *   quat: THREE.Quaternion,
 *   playerQuat: THREE.Quaternion,
 *   playerPosition: THREE.Vector3,
 *   forwardWorld: THREE.Vector3,
 *   desiredPos: THREE.Vector3,
 *   desiredLook: THREE.Vector3,
 *   up: THREE.Vector3,
 *   worldUp: THREE.Vector3,
 *   cartUp: THREE.Vector3,
 *   rayDir: THREE.Vector3,
 *   rayOrigin: THREE.Vector3,
 *   lookMat: THREE.Matrix4,
 *   desiredQuat: THREE.Quaternion,
 * }} CameraFollowState */

/**
 * Exponential damping factor for frame-rate-independent smoothing.
 * @param {number} lambda Damping rate (1/s).
 * @param {number} dt Frame delta (seconds).
 * @returns {number} Interpolation alpha in [0, 1].
 */
function dampFactor(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

/**
 * Allocates smoothed follow state and scratch buffers for chase camera updates.
 * @param {THREE.PerspectiveCamera} camera Camera whose initial pose seeds follow state.
 * @returns {CameraFollowState}
 */
function createCameraFollowState(camera) {
  return {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    playerQuat: new THREE.Quaternion(),
    playerPosition: new THREE.Vector3(),
    forwardWorld: new THREE.Vector3(),
    desiredPos: new THREE.Vector3(),
    desiredLook: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    worldUp: new THREE.Vector3(0, 1, 0),
    cartUp: new THREE.Vector3(0, 1, 0),
    rayDir: new THREE.Vector3(),
    rayOrigin: new THREE.Vector3(),
    lookMat: new THREE.Matrix4(),
    desiredQuat: new THREE.Quaternion(),
  };
}

/**
 * Binds follow state and tuning to a camera instance. Call once after the camera is created.
 * @param {THREE.PerspectiveCamera} camera
 * @param {CameraFollowConfig} cameraConfig Typically `CONFIG.camera`.
 */
export function initCameraFollow(camera, cameraConfig) {
  camera.userData.followState = createCameraFollowState(camera);
  camera.userData.followConfig = cameraConfig;
  camera.userData.cameraMode = CameraMode.FOLLOW;
  camera.userData.cinematicState = null;
}

/**
 * Updates third-person chase camera behind the local cart using exponential damping and snap-on-teleport.
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ collider?: { handle: number }, body?: { handle: number } } | null | undefined} localCart Used to exclude the cart from wall raycasts.
 * @param {number} dt Frame delta (seconds).
 * @param {{ x: number, y: number, z: number }} playerPos Pre-fetched cart translation for this frame.
 * @param {{ x: number, y: number, z: number, w: number }} playerRot Pre-fetched cart rotation for this frame.
 * @param {import("@dimforge/rapier3d").World | null | undefined} [physicsWorld] Rapier world for camera-wall raycasts.
 */
export function updateCamera(camera, localCart, dt, playerPos, playerRot, physicsWorld) {
  const followState = camera.userData.followState;
  const followConfig = camera.userData.followConfig;
  if (!followState || !followConfig || !playerPos || !playerRot) return;

  const {
    playerQuat,
    playerPosition,
    forwardWorld,
    desiredPos,
    desiredLook,
    up,
    worldUp,
    cartUp,
    rayDir,
    rayOrigin,
    lookMat,
    desiredQuat,
    pos,
    quat,
  } = followState;

  playerQuat.set(playerRot.x, playerRot.y, playerRot.z, playerRot.w);
  playerPosition.set(playerPos.x, playerPos.y, playerPos.z);
  forwardWorld.set(0, 0, -1).applyQuaternion(playerQuat);

  desiredPos
    .copy(playerPosition)
    .addScaledVector(forwardWorld, -followConfig.followBack);
  desiredPos.y += followConfig.followUp;

  desiredLook
    .copy(playerPosition)
    .addScaledVector(forwardWorld, followConfig.lookAhead);
  desiredLook.y += followConfig.lookUp;

  // Blend cart up with world up to avoid gimbal lock when airborne or inverted.
  cartUp.set(0, 1, 0).applyQuaternion(playerQuat);
  up.copy(worldUp).lerp(cartUp, 0.2).normalize();

  // Pull camera in when arena geometry blocks the chase offset.
  if (physicsWorld && followConfig.followBack > 0) {
    // Start above/ahead of the cart center so the ray does not self-hit the cart body.
    rayOrigin
      .copy(playerPosition)
      .addScaledVector(up, 1.2)
      .addScaledVector(forwardWorld, 0.4);
    rayDir.subVectors(desiredPos, rayOrigin);
    const maxDist = rayDir.length();
    const minValidHit = 1.5;
    if (maxDist > 1e-4) {
      rayDir.multiplyScalar(1 / maxDist);
      if (!_cameraRay) _cameraRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      _cameraRay.origin.x = rayOrigin.x;
      _cameraRay.origin.y = rayOrigin.y;
      _cameraRay.origin.z = rayOrigin.z;
      _cameraRay.dir.x = rayDir.x;
      _cameraRay.dir.y = rayDir.y;
      _cameraRay.dir.z = rayDir.z;
      const excludeCollider = localCart?.collider?.handle ?? undefined;
      const excludeRigidBody = localCart?.body?.handle ?? undefined;
      const hit = physicsWorld.castRay(
        _cameraRay,
        maxDist,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
        undefined,
        // @ts-expect-error - Rapier handle (number) passed where Collider type expected; safe at runtime
        excludeCollider,
        excludeRigidBody,
      );
      if (hit && hit.timeOfImpact >= minValidHit) {
        const hitDist = Math.max(minValidHit, hit.timeOfImpact - 0.3);
        if (hitDist < maxDist) {
          desiredPos.copy(rayOrigin).addScaledVector(rayDir, hitDist);
        }
      }
    }
  }

  lookMat.lookAt(desiredPos, desiredLook, up);
  desiredQuat.setFromRotationMatrix(lookMat);

  if (pos.distanceTo(desiredPos) > followConfig.snapDistance) {
    pos.copy(desiredPos);
    quat.copy(desiredQuat);
  } else {
    const posAlpha = dampFactor(followConfig.positionDamping, dt);
    const rotAlpha = dampFactor(followConfig.rotationDamping, dt);
    pos.lerp(desiredPos, posAlpha);
    quat.slerp(desiredQuat, rotAlpha);
  }

  camera.position.copy(pos);
  camera.quaternion.copy(quat);
}

// === Cinematic countdown camera ===

const DEFAULT_CINEMATIC_CONFIG = {
  radius: 28,
  height: 14,
  startAngle: 0,
  angularSpeed: 0.6,
  lookTargetY: 1.5,
};

/**
 * Allocates cinematic fly-over scratch state.
 * @param {THREE.PerspectiveCamera} camera
 * @param {CinematicCountdownConfig} config
 * @returns {{
 *   config: CinematicCountdownConfig,
 *   angle: number,
 *   lookTarget: THREE.Vector3,
 *   desiredPos: THREE.Vector3,
 *   lookMat: THREE.Matrix4,
 *   desiredQuat: THREE.Quaternion,
 *   podiumTargetPos?: THREE.Vector3,
 * } | null}
 */
function createCinematicState(camera, config) {
  // ! Without a valid follow state, the cinematic-to-follow handoff cannot seed
  // ! the follow pose; refuse to start so the caller falls back to follow mode.
  if (!camera.userData.followState) return null;
  return {
    config,
    angle: config.startAngle,
    lookTarget: new THREE.Vector3(0, config.lookTargetY, 0),
    desiredPos: new THREE.Vector3(),
    lookMat: new THREE.Matrix4(),
    desiredQuat: new THREE.Quaternion(),
    podiumTargetPos: /** @type {THREE.Vector3 | undefined} */ (undefined),
  };
}

/**
 * Switches the camera into cinematic countdown mode and begins a fly-over orbit.
 * Call when the round enters the COUNTDOWN phase.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {Partial<CinematicCountdownConfig>} [configOverrides]
 */
export function beginCinematicCountdown(camera, configOverrides) {
  if (!camera) return;
  const config = { ...DEFAULT_CINEMATIC_CONFIG, ...configOverrides };
  const state = createCinematicState(camera, config);
  if (!state) return;

  // * Seed orbit angle from the camera's current XZ bearing so the fly-over
  // * begins from wherever the chase camera happened to be, avoiding a hard cut.
  const cur = camera.position;
  state.angle = Math.atan2(cur.z, cur.x) || config.startAngle;

  // * Cinematics take exclusive control — drop any death-cam residue so the
  // * frame loop cannot fall back to DEATH while mode is countdown.
  camera.userData.deathState = null;
  camera.userData.cameraMode = CameraMode.CINEMATIC_COUNTDOWN;
  camera.userData.cinematicState = state;
}

// * Shared world-up / aim scratch for cinematic look matrices — avoid per-frame alloc.
const _cinematicUp = new THREE.Vector3(0, 1, 0);
const _cinematicAim = new THREE.Vector3();

/**
 * Updates the cinematic fly-over. Orbits the arena center on a fixed-radius
 * circle at a constant angular rate, looking at the center.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} dt Frame delta (seconds).
 */
export function updateCinematicCountdown(camera, dt) {
  const state = camera.userData.cinematicState;
  if (!state) return;
  const { config, lookTarget, desiredPos, lookMat, desiredQuat } = state;

  state.angle += config.angularSpeed * dt;

  desiredPos.set(
    Math.cos(state.angle) * config.radius,
    config.height,
    Math.sin(state.angle) * config.radius,
  );

  lookMat.lookAt(desiredPos, lookTarget, _cinematicUp);
  desiredQuat.setFromRotationMatrix(lookMat);

  // * Direct copy (no damping) — the slow orbit rate keeps motion smooth, and
  // * the follow state's damped lerp will absorb the pose gap on handoff.
  camera.position.copy(desiredPos);
  camera.quaternion.copy(desiredQuat);
}

/**
 * Exits cinematic mode and returns to follow mode. Seeds the follow state with
 * the camera's current cinematic pose so the existing damped lerp naturally
 * blends back to the standard chase position over ~0.5s (positionDamping=10,
 * rotationDamping=12 at 60fps converge ~99% within that window).
 *
 * Call when the round transitions to PLAYING (GO!).
 *
 * @param {THREE.PerspectiveCamera} camera
 */
export function endCinematicCountdown(camera) {
  if (!camera) return;
  const followState = camera.userData.followState;
  if (followState) {
    // * Seed the follow buffers with the live cinematic pose. The next
    // * updateCamera call computes a fresh desiredPos from the cart and the
    // * damped lerp pulls pos/quat toward it — this is the smooth handoff.
    followState.pos.copy(camera.position);
    followState.quat.copy(camera.quaternion);
  }
  camera.userData.cameraMode = CameraMode.FOLLOW;
  camera.userData.cinematicState = null;
  camera.userData.deathState = null;
}

/**
 * Pure winner-cam duration before the results UI is allowed to cover the shot.
 * Kept on the camera module so UI + round flow share one source of truth.
 */
export const PODIUM_WINNER_CAM_MS = 5000;

const DEFAULT_PODIUM_CONFIG = {
  radius: 6.0,
  height: 1.8,
  startAngle: 0,
  // * ~0.4 rad/s ≈ 115° over PODIUM_WINNER_CAM_MS — readable victory orbit.
  angularSpeed: 0.4,
  lookTargetY: 0.8,
};

/**
 * Switches camera into cinematic victory-lap podium mode orbiting the winning cart (or arena center).
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ x: number, y: number, z: number }} [targetPos]
 * @param {Partial<CinematicCountdownConfig>} [configOverrides]
 */
export function beginCinematicPodium(camera, targetPos, configOverrides) {
  if (!camera) return;
  const config = { ...DEFAULT_PODIUM_CONFIG, ...configOverrides };
  const state = createCinematicState(camera, config);
  if (!state) return;

  const cur = camera.position;
  const tx = targetPos?.x ?? 0;
  const ty = targetPos?.y ?? 0;
  const tz = targetPos?.z ?? 0;
  state.angle = Math.atan2(cur.z - tz, cur.x - tx) || config.startAngle;
  state.podiumTargetPos = new THREE.Vector3(tx, ty, tz);

  // * Same exclusive-control rule as countdown — death residue cannot steal the shot.
  camera.userData.deathState = null;
  camera.userData.cameraMode = CameraMode.CINEMATIC_PODIUM;
  camera.userData.cinematicState = state;
}

/**
 * Re-aims the podium orbit center (e.g. when the winner slot resolves late on clients).
 * No-op when not in podium mode.
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ x: number, y: number, z: number }} targetPos
 */
export function setCinematicPodiumTarget(camera, targetPos) {
  const state = camera?.userData?.cinematicState;
  if (!state || camera.userData.cameraMode !== CameraMode.CINEMATIC_PODIUM) return;
  if (!targetPos) return;
  if (!state.podiumTargetPos) state.podiumTargetPos = new THREE.Vector3();
  state.podiumTargetPos.set(targetPos.x ?? 0, targetPos.y ?? 0, targetPos.z ?? 0);
}

/**
 * Updates the low-angle cinematic podium orbit around the winning cart.
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} dt Frame delta (seconds).
 */
export function updateCinematicPodium(camera, dt) {
  const state = camera.userData.cinematicState;
  if (!state) return;
  const { config, lookTarget, desiredPos, lookMat, desiredQuat, podiumTargetPos } = state;
  const center = podiumTargetPos || lookTarget;

  state.angle += config.angularSpeed * dt;

  desiredPos.set(
    center.x + Math.cos(state.angle) * config.radius,
    center.y + config.height,
    center.z + Math.sin(state.angle) * config.radius,
  );

  _cinematicAim.set(center.x, center.y + config.lookTargetY, center.z);
  lookMat.lookAt(desiredPos, _cinematicAim, _cinematicUp);
  desiredQuat.setFromRotationMatrix(lookMat);

  camera.position.copy(desiredPos);
  camera.quaternion.copy(desiredQuat);
}

// === Death camera ===

/**
 * Switches the camera into death mode. The camera carries a fraction of its
 * forward momentum, gently decelerating to a stop over ~300ms while beginning
 * a smooth pan toward the death look target (the explosion center). Call when
 * the local cart's `isShattering` flag becomes true.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ x: number, y: number, z: number }} deathWorldPos World-space center of the explosion.
 */
export function beginDeathCamera(camera, deathWorldPos) {
  if (!camera) return;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const driftDistance = 2.5;
  camera.userData.cameraMode = CameraMode.DEATH;
  camera.userData.deathState = {
    startPos: camera.position.clone(),
    driftEndPos: camera.position.clone().addScaledVector(forward, driftDistance),
    lookTarget: new THREE.Vector3(deathWorldPos.x, deathWorldPos.y, deathWorldPos.z),
    startQuat: camera.quaternion.clone(),
    startMs: performance.now(),
    driftDurationMs: 300,
    panDurationMs: 800,
  };
}

/**
 * Updates the death camera each frame. Position gently decelerates from a
 * forward drift to a stop over ~300ms while the look direction smoothly pans
 * from the initial orientation toward the death target over ~800ms.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} dt Frame delta in seconds (unused — time-driven via startMs).
 */
export function updateDeathCamera(camera, dt) {
  const state = camera.userData.deathState;
  if (!state) return;

  const elapsed = performance.now() - state.startMs;

  // * Drift: ease-out from startPos to driftEndPos over driftDurationMs.
  const driftProgress = Math.min(1, elapsed / state.driftDurationMs);
  const driftEased = 1 - Math.pow(1 - driftProgress, 3);
  camera.position.lerpVectors(state.startPos, state.driftEndPos, driftEased);

  // * Pan: eased slerp from startQuat toward lookTarget over panDurationMs.
  const panProgress = Math.min(1, elapsed / state.panDurationMs);
  const panEased = 1 - Math.pow(1 - panProgress, 3);

  const lookMat = _deathCamLookMat;
  lookMat.lookAt(camera.position, state.lookTarget, new THREE.Vector3(0, 1, 0));
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);

  camera.quaternion.copy(state.startQuat).slerp(targetQuat, panEased);
}

/**
 * Exits death camera mode and returns to follow mode. Seeds the follow state
 * with the current death camera pose so the damped lerp naturally blends from
 * the drift/death position back to the standard chase position.
 *
 * Call when `isShattering` becomes false (doRespawn / cleanupShatter).
 *
 * @param {THREE.PerspectiveCamera} camera
 */
export function endDeathCamera(camera) {
  if (!camera) return;
  const followState = camera.userData.followState;
  if (followState) {
    followState.pos.copy(camera.position);
    followState.quat.copy(camera.quaternion);
  }
  camera.userData.cameraMode = CameraMode.FOLLOW;
  camera.userData.deathState = null;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @returns {string} Current camera mode (see CameraMode).
 */
export function getCameraMode(camera) {
  return camera?.userData?.cameraMode || CameraMode.FOLLOW;
}
