/**
 * Non-host local display pose (mesh + camera).
 *
 * NET-LAG-1 revised A: copy the physics mesh. v3's exp lerp at displayPosRate 14
 * trailed ~v/rate meters on a clean wire (cap-373: 1.63 m xz while errLast was
 * 1 mm). Teleport-scale gaps also copy — same as the old maxCorrectionM snap.
 *
 * Mutates `displayPos` / `displayQuat` in place. Plain {x,y,z} / {x,y,z,w} so
 * tests do not boot Three.
 *
 * @param {{ x: number, y: number, z: number }} displayPos
 * @param {{ x: number, y: number, z: number, w: number } | null | undefined} displayQuat
 * @param {{ x: number, y: number, z: number }} meshPos
 * @param {{ x: number, y: number, z: number, w: number } | null | undefined} [meshQuat]
 */
export function applyDisplayPoseFollow(displayPos, displayQuat, meshPos, meshQuat) {
  displayPos.x = meshPos.x;
  displayPos.y = meshPos.y;
  displayPos.z = meshPos.z;
  if (displayQuat && meshQuat) {
    displayQuat.x = meshQuat.x;
    displayQuat.y = meshQuat.y;
    displayQuat.z = meshQuat.z;
    displayQuat.w = meshQuat.w;
  }
}
