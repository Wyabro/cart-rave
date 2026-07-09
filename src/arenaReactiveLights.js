// arenaReactiveLights.js — shared leader/KO accent state for Classic Record lights.
// Pure presentation: carts already have leader glow; this drives arena fixtures so the
// whole club reacts when someone takes the lead or a cart goes into the void.

import * as THREE from "three";

const DEFAULT_A = new THREE.Color(0xff2bd6);
const DEFAULT_B = new THREE.Color(0x2bd6ff);
const FLASH_WHITE = new THREE.Color(0xffffff);

const _leader = new THREE.Color(0xff2bd6);
const _out = new THREE.Color();
const _koColor = new THREE.Color(0xffffff);
const _ambientA = DEFAULT_A.clone();
const _ambientB = DEFAULT_B.clone();

/** @type {boolean} */
let hasLeader = false;

/** @type {number} */
let koUntil = 0;
/** @type {number} */
let koDurationMs = 320;
/** @type {number} */
let koStrength = 0;

/**
 * Sole scoreboard leader cart color, or null when tied / no leader / not running.
 * @param {number | null | undefined} hex
 */
export function setArenaReactiveLeaderHex(hex) {
  if (hex == null || Number.isNaN(Number(hex))) {
    hasLeader = false;
    return;
  }
  hasLeader = true;
  _leader.setHex(Number(hex) >>> 0);
}

/**
 * Brief arena-wide color/intensity flash (KO into the pit).
 * @param {number | null | undefined} hex Attacker (or victim) accent hex.
 * @param {{ durationMs?: number, strength?: number }} [opts]
 */
export function triggerArenaKoFlash(hex, opts = {}) {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  koDurationMs = opts.durationMs ?? 320;
  koStrength = opts.strength ?? 0.85;
  koUntil = now + koDurationMs;
  if (hex != null && !Number.isNaN(Number(hex))) {
    _koColor.setHex(Number(hex) >>> 0);
  } else {
    _koColor.setHex(0xffffff);
  }
}

/**
 * Clears KO flash + leader (menu / round end hygiene).
 */
export function resetArenaReactiveLights() {
  hasLeader = false;
  koUntil = 0;
  koStrength = 0;
}

/**
 * Samples current arena accent for the frame.
 * @param {number} timeMs Synced game clock (ms) — drives ambient pink↔cyan when no leader.
 * @param {number} [nowPerformance] performance.now() for KO decay (defaults to performance.now()).
 * @returns {{
 *   accentColor: THREE.Color,
 *   intensityMul: number,
 *   koT: number,
 *   hasLeader: boolean,
 * }}
 */
export function sampleArenaReactive(timeMs, nowPerformance) {
  const nowPerf =
    nowPerformance ?? (typeof performance !== "undefined" ? performance.now() : 0);

  if (hasLeader) {
    _out.copy(_leader);
  } else {
    // * Same ~8s pink↔cyan cycle the spindle used before reactive lighting.
    const t = (Math.sin(timeMs * 0.001 * Math.PI * 2 / 8) + 1) / 2;
    _out.copy(_ambientA).lerp(_ambientB, t);
  }

  let koT = 0;
  let intensityMul = 1;
  if (nowPerf < koUntil && koDurationMs > 0) {
    koT = Math.max(0, Math.min(1, (koUntil - nowPerf) / koDurationMs));
    // * Flash leans toward attacker color, then white-hot at peak.
    _out.lerp(_koColor, koT * 0.55);
    _out.lerp(FLASH_WHITE, koT * 0.25);
    intensityMul = 1 + koStrength * koT * 1.35;
  }

  return {
    accentColor: _out,
    intensityMul,
    koT,
    hasLeader,
  };
}
