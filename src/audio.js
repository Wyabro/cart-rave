// audio.js — modular audio interface/delegates

import { CONFIG } from "./config.js";

let _sfx = null;
let _crowd = null;
let _leaderHum = null;

/** @returns {void} */
export function clearAudioRefs() {
  _sfx = null;
  _crowd = null;
  _leaderHum = null;
}

/**
 * * Wires live audio subsystems into this delegation layer.
 * @param {{ sfx?: object, crowd?: object, leaderHum?: object }} refs
 * @returns {void}
 */
export function registerAudioRefs(refs) {
  if (refs.sfx !== undefined) _sfx = refs.sfx;
  if (refs.crowd !== undefined) _crowd = refs.crowd;
  if (refs.leaderHum !== undefined) _leaderHum = refs.leaderHum;

  if (CONFIG.debug.audio) {
    // eslint-disable-next-line no-console
    console.log("[audio] registerAudioRefs", {
      sfx: Boolean(_sfx),
      crowd: Boolean(_crowd),
      leaderHum: Boolean(_leaderHum),
    });
  }
}

/**
 * * Plays a cart collision impact scaled by intensity (0–1).
 * @param {number} intensity
 * @returns {void}
 */
export function playCollision(intensity) {
  _sfx?.playCollision?.(intensity);
}

/** @returns {void} */
export function playNitro() {
  _sfx?.playNitro?.();
}

/** @returns {void} */
export function playHop() {
  _sfx?.playHop?.();
}

/** @returns {void} */
export function playFallOff() {
  _sfx?.playFallOff?.();
}

/**
 * * Plays wheel screech feedback scaled by intensity (0–1).
 * @param {number} intensity
 * @returns {void}
 */
export function playWheelScreech(intensity) {
  _sfx?.playWheelScreech?.(intensity);
}

/** @returns {void} */
export function playCrowdBump() {
  _crowd?.bump?.();
}

/** @deprecated Use {@link playCrowdBump} instead. */
export const bumpCrowd = playCrowdBump;

/** @returns {void} */
export function ensureCrowdStarted() {
  _crowd?.ensureStarted?.();
}

/** @returns {void} */
export function applyAmbientCrowd() {
  _crowd?.applyAmbient?.();
}

/** @returns {void} */
export function resyncLeaderHumVolume() {
  _leaderHum?.resyncVolume?.();
}

/**
 * * Highlights the current round leader for positional hum audio.
 * @param {number | null | undefined} slotIndex
 * @returns {void}
 */
export function setLeader(slotIndex) {
  _leaderHum?.setLeader?.(slotIndex);
}

/**
 * * Updates leader-hum 3D position from a cart body.
 * @param {object | null | undefined} cart
 * @returns {void}
 */
export function updateLeaderHumPosition(cart) {
  _leaderHum?.updatePositionFromCart?.(cart);
}
