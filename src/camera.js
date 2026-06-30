/**
 * camera.js — Third-person chase camera follow (behind the local cart),
 * plus a cinematic fly-over camera used during the pre-round countdown.
 */

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Camera controller modes.
 * @readonly
 * @enum {string}
 */
export const CameraMode = {
  FOLLOW: "follow",
  CINEMATIC_COUNTDOWN: "cinematic_countdown",
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
 * @param {import("@dimforge/rapier3d-compat").World | null | undefined} [physicsWorld] Rapier world for camera-wall raycasts.
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
      const ray = new RAPIER.Ray(
        { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z },
      );
      const excludeCollider = localCart?.collider?.handle ?? undefined;
      const excludeRigidBody = localCart?.body?.handle ?? undefined;
      const hit = physicsWorld.castRay(
        ray,
        maxDist,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
        undefined,
        excludeCollider,
        excludeRigidBody,
      );
      if (hit && hit.timeOfImpact >= minValidHit) {
        const hitDist = Math.max(minValidHit, hit.timeOfImpact - 0.3);
        if (hitDist < maxDist) {
          desiredPos.copy(playerPosition).addScaledVector(rayDir, hitDist);
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
 * }}
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

  camera.userData.cameraMode = CameraMode.CINEMATIC_COUNTDOWN;
  camera.userData.cinematicState = state;
}

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

  lookMat.lookAt(desiredPos, lookTarget, new THREE.Vector3(0, 1, 0));
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
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @returns {string} Current camera mode (see CameraMode).
 */
export function getCameraMode(camera) {
  return camera?.userData?.cameraMode || CameraMode.FOLLOW;
}
