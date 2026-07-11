/**
 * WebSocket control-plane message size policy (Party Durable Object).
 *
 * Gameplay transforms/inputs ride WebRTC DataChannels — not these limits.
 * WS carries lobby, host_round, signaling (SDP/ICE), and reliable host_spawn.
 *
 * Policy:
 *   - Never hard-close the socket for a single oversized frame (kills signaling mid-handshake).
 *   - Pathological bombs still close.
 *   - Signaling + host_spawn get a higher ceiling than routine control messages.
 */

import { MSG } from "./protocol.js";

/**
 * Absolute drop threshold before JSON.parse.
 * Measured as JS string `.length` (UTF-16 code units), not UTF-8 byte length.
 * For ASCII-only JSON these are equal; non-ASCII may undercount true wire bytes.
 */
export const WS_ABSOLUTE_MAX = 131_072;

/** Routine control messages (join, ready, host_round, keepalive, …). */
export const WS_CONTROL_MAX = 4_096;

/** SDP / ICE / reliable spawn poses — larger JSON envelopes are normal. */
export const WS_SIGNALING_MAX = 65_536;

/** Only sizes above this close the connection (memory/DoS bomb). */
export const WS_BOMB_CLOSE_MAX = 262_144;

/** Message types allowed under {@link WS_SIGNALING_MAX}. */
export const WS_ELEVATED_TYPES = new Set([
  MSG.sdpOffer,
  MSG.sdpAnswer,
  MSG.iceCandidate,
  MSG.hostSpawn,
]);

/**
 * Pre-parse gate: reject pathological sizes before JSON.parse.
 * @param {number} stringLength JS string `.length` (UTF-16 code units), not UTF-8 bytes.
 * @returns {"accept" | "drop" | "close"}
 */
export function classifyWsMessagePreParse(stringLength) {
  const n = typeof stringLength === "number" && Number.isFinite(stringLength) ? stringLength : 0;
  if (n > WS_BOMB_CLOSE_MAX) return "close";
  if (n > WS_ABSOLUTE_MAX) return "drop";
  return "accept";
}

/**
 * Post-parse gate: type-aware ceilings (signaling vs control).
 * @param {number} stringLength JS string `.length` (UTF-16 code units), not UTF-8 bytes.
 * @param {string | undefined | null} type
 * @returns {"accept" | "drop"}
 */
export function classifyWsMessagePostParse(stringLength, type) {
  const n = typeof stringLength === "number" && Number.isFinite(stringLength) ? stringLength : 0;
  if (n > WS_ABSOLUTE_MAX) return "drop";
  const elevated = typeof type === "string" && WS_ELEVATED_TYPES.has(type);
  if (elevated) {
    return n > WS_SIGNALING_MAX ? "drop" : "accept";
  }
  return n > WS_CONTROL_MAX ? "drop" : "accept";
}
