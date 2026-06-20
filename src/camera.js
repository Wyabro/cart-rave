/**
 * camera.js — Third-person chase camera follow (behind the local cart).
 */

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

/** @typedef {{
 *   followBack: number,
 *   followUp: number,
 *   lookAhead: number,
 *   lookUp: number,
 *   positionDamping: number,
 *   rotationDamping: number,
 *   snapDistance: number,
 * }} CameraFollowConfig */

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
export function createCameraFollowState(camera) {
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
