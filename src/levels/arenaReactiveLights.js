// arenaReactiveLights.js — shared ambient accent state for Classic Record lights.
// Ambient pink↔cyan spindle/rim cycle stays; KO flash + Sudden Death hue shift are on;
// the persistent leader tint stays off.

import * as THREE from "three";

/**
 * Brief KO color/intensity flash across arena fixtures. Re-enabled at reduced strength
 * (callers pass ~0.6 max) — a 320ms punch accent, not the persistent recolor that got
 * the original reactive mode disabled.
 */
const ARENA_KO_FLASH_ENABLED = true;

/**
 * Persistent sole-leader arena tint. Stays OFF — the cart leader glow already sells
 * the moment, and the whole-arena recolor was judged too aggressive.
 */
const ARENA_LEADER_TINT_ENABLED = false;

const DEFAULT_A = new THREE.Color(0xff2bd6);
const DEFAULT_B = new THREE.Color(0x2bd6ff);
// * Sudden Death ambient pair — same brightness class as the defaults, hue-shifted to a
// * red↔magenta cycle so the world holds its breath without brightening (dark identity).
const SUDDEN_DEATH_A = new THREE.Color(0xff2233);
const SUDDEN_DEATH_B = new THREE.Color(0xff2bd6);
const FLASH_WHITE = new THREE.Color(0xffffff);

/**
 * Returns the bounded presentation profile for one KO. The host already stamps
 * `wasCritical` on the falls[] tail, so every peer can make the same distinction
 * without a new network message or any simulation change.
 *
 * @param {{ isKill?: boolean, wasCritical?: boolean } | null | undefined} koEvent
 * @param {boolean} [isFirstBlood=false]
 * @returns {{ strength: number, durationMs: number, hitmarkerIntensity: number }}
 */
export function getArenaKoPresentationProfile(koEvent, isFirstBlood = false) {
  const isKill = Boolean(koEvent?.isKill);
  const firstBloodMul = isFirstBlood ? 1.45 : 1;
  // Critical is a high-speed, credited ram only. A self-fall cannot borrow the
  // bigger payoff even if an older/invalid wire event carries the flag.
  const criticalMul = isKill && koEvent?.wasCritical ? 1.22 : 1;
  return {
    strength: (isKill ? 0.6 : 0.35) * firstBloodMul * criticalMul,
    durationMs: (isKill ? 340 : 240) * (isFirstBlood ? 1.3 : 1),
    hitmarkerIntensity: (isKill ? 1.05 : 0.6) * firstBloodMul * criticalMul,
  };
}

const _leader = new THREE.Color(0xff2bd6);
const _out = new THREE.Color();
const _koColor = new THREE.Color(0xffffff);
const _ambientA = DEFAULT_A.clone();
const _ambientB = DEFAULT_B.clone();

/**
 * ZAN-REACTIVE-ALLOC-1: module scratch for the per-frame sample. Callers drain
 * synchronously — `accentColor` already reuses the shared `_out` Color — so one
 * reusable object is safe; the old shape allocated a fresh literal every frame.
 * @type {{ accentColor: THREE.Color, intensityMul: number, koT: number, hasLeader: boolean }}
 */
const _reactiveScratch = { accentColor: _out, intensityMul: 1, koT: 0, hasLeader: false };

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
 * No-op while the leader tint stays disabled.
 * @param {number | null | undefined} hex
 */
export function setArenaReactiveLeaderHex(hex) {
  if (!ARENA_LEADER_TINT_ENABLED) {
    hasLeader = false;
    return;
  }
  if (hex == null || Number.isNaN(Number(hex))) {
    hasLeader = false;
    return;
  }
  hasLeader = true;
  _leader.setHex(Number(hex) >>> 0);
}

/**
 * Sudden Death world reaction: hue-shift the ambient cycle to red↔magenta while the
 * 1v1 plays out, restore the pink↔cyan pair when it ends. A hue shift on existing
 * fixtures, never a brighten.
 * @param {boolean} active
 */
export function setArenaSuddenDeathMode(active) {
  if (active) {
    _ambientA.copy(SUDDEN_DEATH_A);
    _ambientB.copy(SUDDEN_DEATH_B);
  } else {
    _ambientA.copy(DEFAULT_A);
    _ambientB.copy(DEFAULT_B);
  }
}

/**
 * Brief arena-wide color/intensity flash (KO into the pit).
 * No-op when {@link ARENA_KO_FLASH_ENABLED} is false.
 * @param {number | null | undefined} hex Attacker (or victim) accent hex.
 * @param {{ durationMs?: number, strength?: number }} [opts]
 */
export function triggerArenaKoFlash(hex, opts = {}) {
  if (!ARENA_KO_FLASH_ENABLED) return;
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
 * Clears KO flash + leader + Sudden Death hue shift (menu / round end hygiene).
 */
export function resetArenaReactiveLights() {
  hasLeader = false;
  koUntil = 0;
  koStrength = 0;
  setArenaSuddenDeathMode(false);
}

/**
 * Samples current arena accent for the frame.
 * Ambient pink↔cyan cycle always; leader/KO only when {@link ARENA_REACTIVE_PLAY_EVENTS}.
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

  if (ARENA_LEADER_TINT_ENABLED && hasLeader) {
    _out.copy(_leader);
  } else {
    // * Same ~8s two-color cycle the spindle used before reactive lighting
    // * (pink↔cyan normally; red↔magenta during Sudden Death).
    const t = (Math.sin(timeMs * 0.001 * Math.PI * 2 / 8) + 1) / 2;
    _out.copy(_ambientA).lerp(_ambientB, t);
  }

  let koT = 0;
  let intensityMul = 1;
  if (ARENA_KO_FLASH_ENABLED && nowPerf < koUntil && koDurationMs > 0) {
    koT = Math.max(0, Math.min(1, (koUntil - nowPerf) / koDurationMs));
    // * Flash leans toward attacker color, then white-hot at peak.
    _out.lerp(_koColor, koT * 0.55);
    _out.lerp(FLASH_WHITE, koT * 0.25);
    intensityMul = 1 + koStrength * koT * 1.35;
  }

  _reactiveScratch.accentColor = _out;
  _reactiveScratch.intensityMul = intensityMul;
  _reactiveScratch.koT = koT;
  _reactiveScratch.hasLeader = ARENA_LEADER_TINT_ENABLED && hasLeader;
  return _reactiveScratch;
}
