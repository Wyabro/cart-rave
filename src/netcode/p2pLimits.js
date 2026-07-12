/**
 * WebRTC DataChannel message-size policy — the P2P gameplay plane.
 *
 * Gameplay transforms/inputs ride the *unreliable* DataChannel directly between peers.
 * Unlike the WS control plane (see shared/wsMessageLimits.js), there is NO server in the
 * loop to validate these frames, the sending host is a semi-trusted peer's browser, and
 * every client JSON.parses the binary-snapshot tail + host JSON events at ~40Hz. These
 * ceilings bound the CPU/memory work a buggy or hostile host can force on every other
 * client. Legitimate frames sit far below them.
 *
 * Policy: an over-limit frame (or tail) is DROPPED, never fatal. A lost frame is already
 * expected on an unreliable channel, so dropping one must not desync the simulation — the
 * next 40Hz snapshot self-heals.
 */

// * A full binary host snapshot is HEADER(16) + MAX_CARTS(4)*CART(52) + JSON tail. Cap the
// * whole frame well above that; anything larger is pathological. Must stay >=
// * 224 + MAX_SNAPSHOT_TAIL_BYTES so a legitimate max-tail snapshot still passes.
export const MAX_P2P_BINARY_BYTES = 16_384;

// * A host-authored JSON event (spill / directive / spillBonus) or a client input frame.
// * These are small objects; the ceiling only rejects abuse.
export const MAX_P2P_JSON_CHARS = 16_384;

// * The JSON tail of a binary snapshot (collisions / falls / dir). Bounded in practice by
// * <=4 carts' worth of per-frame events; this is a generous backstop.
export const MAX_SNAPSHOT_TAIL_BYTES = 8_192;

// * Post-parse array-length caps so a well-formed-but-huge array cannot flood the
// * downstream collision/fall replay even when the byte tail is within limit.
export const MAX_TAIL_COLLISIONS = 32;
export const MAX_TAIL_FALLS = 16;

/**
 * Whether a raw binary DataChannel frame is within policy.
 * @param {number} byteLength ArrayBuffer byte length.
 * @returns {boolean}
 */
export function isP2PBinaryWithinLimit(byteLength) {
  return Number.isFinite(byteLength) && byteLength >= 0 && byteLength <= MAX_P2P_BINARY_BYTES;
}

/**
 * Whether a JSON DataChannel frame is within policy (measured as JS string length /
 * UTF-16 code units, cheap to check before JSON.parse).
 * @param {number} charLength `String.length` of the raw frame.
 * @returns {boolean}
 */
export function isP2PJsonWithinLimit(charLength) {
  return Number.isFinite(charLength) && charLength >= 0 && charLength <= MAX_P2P_JSON_CHARS;
}
