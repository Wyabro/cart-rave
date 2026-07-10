/**
 * edgeDanger.js — pure world-direction → screen-side mapping for the HUD's
 * directional hit vignette (DOM only — no post-FX / composer).
 *
 * Maps a world-XZ threat direction (where a ram came from) into chase-cam edge
 * weights: cart forward → top, rear → bottom, left/right → screen left/right.
 */

/**
 * Map a world-XZ threat direction into chase-cam screen side weights.
 * Cart forward → top, rear → bottom, right → right, left → left.
 *
 * @param {number} intensity
 * @param {number} dirX World threat direction X
 * @param {number} dirZ World threat direction Z
 * @param {number} forwardX Cart planar forward X
 * @param {number} forwardZ Cart planar forward Z
 * @param {number} rightX Cart planar right X
 * @param {number} rightZ Cart planar right Z
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function sideWeightsFromCartBasis(
  intensity,
  dirX,
  dirZ,
  forwardX,
  forwardZ,
  rightX,
  rightZ,
) {
  if (!(intensity > 0)) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const f = forwardX * dirX + forwardZ * dirZ;
  const r = rightX * dirX + rightZ * dirZ;
  const fwd = Math.max(0, f);
  const back = Math.max(0, -f);
  const rt = Math.max(0, r);
  const lf = Math.max(0, -r);
  const sum = fwd + back + rt + lf;
  if (sum < 1e-6) {
    // * Degenerate basis/dir — fall back to uniform low glow on all sides.
    const u = intensity * 0.35;
    return { top: u, right: u, bottom: u, left: u };
  }
  // * Normalize so the threatened hemisphere sums to ~intensity (not 4×).
  const scale = intensity / sum;
  return {
    top: fwd * scale,
    right: rt * scale,
    bottom: back * scale,
    left: lf * scale,
  };
}
