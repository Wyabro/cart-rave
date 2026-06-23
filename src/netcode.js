// netcode.js — PartyKit networking, interpolation, host/client authority (extracted)

import PartySocket from "partysocket";
import * as THREE from "three";
import * as GameState from "./gameState.js";
import { CONFIG, MSG, PARTYKIT_PUBLIC_HOST } from "./config.js";
import { loadPlayerCustomization, resolveServerColorPick } from "./customization.js";
import { consumeHopRequest } from "./input.js";

/** Scratch quaternions for interpolation and reconciliation slerp. */
const _interpFromQ = new THREE.Quaternion();
const _interpToQ = new THREE.Quaternion();
const _reconcilePredQ = new THREE.Quaternion();
const _reconcileAuthQ = new THREE.Quaternion();

/** Reads a per-slot cart snapshot from array or legacy string-keyed object payloads. */
function getCartSnap(carts, slotIndex) {
  if (!carts) return null;
  if (Array.isArray(carts)) return carts[slotIndex] ?? null;
  return carts[String(slotIndex)] ?? carts[slotIndex] ?? null;
}

// === MODULE STATE & REFS ===

let partySocket = null;
let youConnId = null;
let hostId = null;
let isHost = false;

let hostSeq = 0;
let inputSeq = 0;
let hostEpoch = 0;
let serverClockOffsetMs = 0;
let serverClockOffsetSamples = 0;

let lastCartsCache = null;
let netStateBuffer = [];

let remoteInputsByConnId = new Map();
let remoteNitroLatchedByConnId = new Map();

let hostSendTimer = null;
let inputSendTimer = null;
let keepaliveTimer = null;

let hostMigrationFreezeUntilMs = 0;

let skipNextPhysicsStep = false;

/** @type {(() => Array<object> | null) | null} */
let getAllCartsRefFn = null;
let getAxisRef = null;
let isNitroHeldRef = null;
let triggerRamBoostRef = null;
let triggerHopRef = null;
let resetSimTimingRef = null;

let netSlots = [];
let lastSlotsJson = "";

// === CALLBACK REGISTRATION ===
// Registration of external callbacks/functions from main.js
let callbacks = {
  // Game mode
  detectGameMode: () => "quickplay",

  // Palette & NPC names
  getPALETTE: () => [],
  getInitialNpcNames: () => [],

  // Connection lifecycle
  markFirstHelloReceived: () => {},
  getOnGameStartHandler: () => null,
  getOnHostMigratedHandler: () => null,
  onCountdownCancelled: () => {},
  onJoinRejected: () => {},

  // Menu & HUD
  getMenuVisible: () => true,
  hideMenuRef: () => {},
  updateCartMaterialsFromSlots: () => {},
  updateHudColorsFromSlots: () => {},
  scheduleNameLabelUpdate: () => {},

  // Mid-round join
  respawnLocalMidRoundJoinRef: () => {},
  getPendingMidRoundJoinRespawnConnId: () => null,
  setPendingMidRoundJoinRespawnConnId: () => {},

  // Audio & VFX
  playCollisionRef: () => {},
  spawnTrashBurstRef: () => {},
  triggerLocalRamShakeRef: () => {},
  playFloorImpactRef: () => {},
  playEdgeImpactRef: () => {},

  // Kill feed
  addKillFeedEntry: () => {},
  colorHexForSlot: () => 0x888888,

  // Color picker
  getPendingColorKey: () => null,
  getPendingColorChipEl: () => null,
  setPendingColorKey: () => {},
  setPendingColorChipEl: () => {},
  getLocalColorPicked: () => false,
  setLocalColorPicked: () => {},

  // Stats & crowd
  recordPodiumStats: () => {},
  bumpCrowd: () => {},
};

export function registerCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

/**
 * Binds main-game hooks into netcode message handlers (slots, collisions, color pick, podium, etc.).
 * Call once during bootstrap before initNetcode(); deps supply live refs to main.js state.
 * @param {object} deps
 */
export function registerGameCallbacks(deps) {
  registerCallbacks({
    detectGameMode: () => deps.detectGameMode(),
    getPALETTE: () => deps.palette,
    getInitialNpcNames: () => deps.initialNpcNames,
    markFirstHelloReceived: () => deps.markFirstHelloReceived(),
    getOnGameStartHandler: () => deps.getOnGameStartHandler(),
    getOnHostMigratedHandler: () => deps.getOnHostMigratedHandler?.(),
    onCountdownCancelled: () => deps.onCountdownCancelled?.(),
    onJoinRejected: () => deps.onJoinRejected?.(),
    getMenuVisible: () => deps.getMenuVisible(),
    hideMenuRef: () => deps.invokeHideMenu(),
    updateCartMaterialsFromSlots: (slots) => deps.updateCartMaterialsFromSlots(slots),
    updateHudColorsFromSlots: (slots) => deps.updateHudColorsFromSlots(slots),
    scheduleNameLabelUpdate: () => {
      const pending = deps.getNameLabelUpdatePending();
      if (pending) cancelAnimationFrame(pending);
      deps.setNameLabelUpdatePending(requestAnimationFrame(() => {
        deps.setNameLabelUpdatePending(null);
        if (deps.updateNameLabelsRef.current) deps.updateNameLabelsRef.current();
      }));
    },
    respawnLocalMidRoundJoinRef: () => {
      if (deps.respawnLocalMidRoundJoinRef.current) deps.respawnLocalMidRoundJoinRef.current();
    },
    playCollisionRef: (intensity, opts) => deps.getPlayCollisionRef()?.(intensity, opts),
    playFloorImpactRef: (intensity) => deps.getSfx()?.playFloorImpact?.(intensity),
    playEdgeImpactRef: (intensity) => deps.getSfx()?.playEdgeImpact?.(intensity),
    spawnTrashBurstRef: (mp, intensity, type, opts) => {
      const spawnTrashBurst = deps.getSpawnTrashBurstRef();
      if (spawnTrashBurst) spawnTrashBurst(mp, intensity, type, opts);
    },
    triggerLocalRamShakeRef: (intensity, isBoosting) => {
      deps.getTriggerLocalRamShake?.()?.(intensity, isBoosting);
    },
    addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor) => {
      const hud = deps.getHud();
      if (hud && hud.addKillFeedEntry) hud.addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor);
    },
    colorHexForSlot: (slot) => deps.colorHexForSlot(slot),
    getPendingColorKey: () => deps.getPendingColorKey(),
    getPendingColorChipEl: () => deps.getPendingColorChipEl(),
    setPendingColorKey: (val) => deps.setPendingColorKey(val),
    setPendingColorChipEl: (val) => deps.setPendingColorChipEl(val),
    getLocalColorPicked: () => deps.getLocalColorPicked(),
    setLocalColorPicked: (val) => deps.setLocalColorPicked(val),
    recordPodiumStats: (winner, scores) => deps.recordPodiumStats(winner, scores),
    bumpCrowd: () => deps.getCrowd()?.bump?.(),
    getPendingMidRoundJoinRespawnConnId: () => deps.getPendingMidRoundJoinRespawnConnId(),
    setPendingMidRoundJoinRespawnConnId: (val) => deps.setPendingMidRoundJoinRespawnConnId(val),
  });
}

/**
 * @returns {Array<object> | null}
 */
function getAllCarts() {
  return getAllCartsRefFn?.() ?? null;
}

export function setRefs(refs) {
  if (typeof refs.getAllCartsRef === "function") {
    getAllCartsRefFn = refs.getAllCartsRef;
  } else if (refs.allCartsRef !== undefined) {
    getAllCartsRefFn = () => refs.allCartsRef;
  }
  if (refs.getAxisRef !== undefined) getAxisRef = refs.getAxisRef;
  if (refs.isNitroHeldRef !== undefined) isNitroHeldRef = refs.isNitroHeldRef;
  if (refs.triggerRamBoostRef !== undefined) triggerRamBoostRef = refs.triggerRamBoostRef;
  if (refs.triggerHopRef !== undefined) triggerHopRef = refs.triggerHopRef;
  if (refs.resetSimTimingRef !== undefined) resetSimTimingRef = refs.resetSimTimingRef;
}

export function setNetSlots(slots) {
  netSlots = slots;
}

export function getYouConnId() { return youConnId; }
export function getIsHost() { return isHost; }
export function getHostId() { return hostId; }
export function getNetSlots() { return netSlots; }
export function getRemoteInputsByConnId() { return remoteInputsByConnId; }
export function getHostMigrationFreezeUntilMs() { return hostMigrationFreezeUntilMs; }
export function getServerClockOffsetMs() { return serverClockOffsetMs; }
export function getNetStateBuffer() { return netStateBuffer; }
export function getHostEpoch() { return hostEpoch; }
export function getSkipNextPhysicsStep() { return skipNextPhysicsStep; }
export function setSkipNextPhysicsStep(val) { skipNextPhysicsStep = val; }
export function getLastCartsCache() { return lastCartsCache; }
export function getPartySocket() { return partySocket; }

// Loop timers for main.js compatibility
export function getHostSendTimer() { return hostSendTimer; }
export function getInputSendTimer() { return inputSendTimer; }
export function getKeepaliveTimer() { return keepaliveTimer; }

// === CONNECTION & SOCKET ===

export function partyHostFromWindowLocation() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  return isLocal ? `${hostname}:1999` : PARTYKIT_PUBLIC_HOST;
}

export function resolvedPartyRoomFromUrl() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  return /^[A-Za-z0-9]{2,16}$/.test(raw) ? raw : "quickplay";
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// === HOST / CLIENT AUTHORITY ===

/**
 * Returns whether the local client should run client-side prediction for its cart.
 * Prediction applies only to multiplayer non-host clients; solo and host simulate locally.
 *
 * @returns {boolean} True when connected as a non-host client in a multiplayer room.
 */
export function shouldUseClientPrediction() {
  if (isHost) return false;
  if (!partySocket) return false;
  return callbacks.detectGameMode() !== "solo";
}

// === INTERPOLATION & REMOTE CARTS ===

/** Server clock time used for interpolating authoritative snapshots on non-host clients. */
export function getInterpTargetServerNowMs() {
  return Date.now() - serverClockOffsetMs - CONFIG.net.interpBufferMs;
}

function pruneNetStateBufferForEpoch() {
  for (let i = netStateBuffer.length - 1; i >= 0; i -= 1) {
    const e = netStateBuffer[i];
    if (!e || e.epoch !== hostEpoch) netStateBuffer.splice(i, 1);
  }
}

function findSnapshotPair(targetServerNowMs) {
  let afterIndex = -1;
  for (let i = 0; i < netStateBuffer.length; i += 1) {
    const e = netStateBuffer[i];
    if (e.serverNowMs > targetServerNowMs) {
      afterIndex = i;
      break;
    }
  }
  const beforeIndex = afterIndex > 0 ? afterIndex - 1 : (afterIndex === 0 ? -1 : netStateBuffer.length - 1);
  return {
    before: beforeIndex >= 0 ? netStateBuffer[beforeIndex] : null,
    after: afterIndex >= 0 ? netStateBuffer[afterIndex] : null,
    beforeIndex,
  };
}

function applySnapshotToCartBody(cart, snap) {
  if (!cart?.body || !snap) return;
  const { p, q, lv, av } = snap;
  if (Array.isArray(p) && p.length === 3) {
    cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
  }
  if (Array.isArray(q) && q.length === 4) {
    cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
  }
  if (Array.isArray(lv) && lv.length === 3) {
    cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
  }
  if (Array.isArray(av) && av.length === 3) {
    cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
  }
}

function sampleCartSnapshotFromPair(before, after, alpha, slotIndex) {
  const b = getCartSnap(before?.carts, slotIndex);
  const a = getCartSnap(after?.carts, slotIndex);
  if (!b && !a) return null;
  if (b && a) {
    const bp = b.p;
    const ap = a.p;
    const bq = b.q;
    const aq = a.q;
    const alv = a.lv;
    const aav = a.av;
    const out = { p: null, q: null, lv: null, av: null };
    if (Array.isArray(bp) && bp.length === 3 && Array.isArray(ap) && ap.length === 3) {
      out.p = [
        bp[0] + (ap[0] - bp[0]) * alpha,
        bp[1] + (ap[1] - bp[1]) * alpha,
        bp[2] + (ap[2] - bp[2]) * alpha,
      ];
    } else if (Array.isArray(bp) && bp.length === 3) {
      out.p = [bp[0], bp[1], bp[2]];
    }
    if (Array.isArray(bq) && bq.length === 4 && Array.isArray(aq) && aq.length === 4) {
      _interpFromQ.set(bq[0], bq[1], bq[2], bq[3]);
      _interpToQ.set(aq[0], aq[1], aq[2], aq[3]);
      _interpFromQ.slerp(_interpToQ, alpha);
      out.q = [_interpFromQ.x, _interpFromQ.y, _interpFromQ.z, _interpFromQ.w];
    } else if (Array.isArray(bq) && bq.length === 4) {
      out.q = [bq[0], bq[1], bq[2], bq[3]];
    }
    if (Array.isArray(alv) && alv.length === 3) out.lv = [alv[0], alv[1], alv[2]];
    if (Array.isArray(aav) && aav.length === 3) out.av = [aav[0], aav[1], aav[2]];
    return out;
  }
  const snap = b || a;
  return {
    p: Array.isArray(snap.p) ? [snap.p[0], snap.p[1], snap.p[2]] : null,
    q: Array.isArray(snap.q) ? [snap.q[0], snap.q[1], snap.q[2], snap.q[3]] : null,
    lv: Array.isArray(snap.lv) ? [snap.lv[0], snap.lv[1], snap.lv[2]] : null,
    av: Array.isArray(snap.av) ? [snap.av[0], snap.av[1], snap.av[2]] : null,
  };
}

/** Writes interpolated snapshot fields directly onto cart net targets (zero per-frame allocations). */
function writeInterpolatedRemoteTargets(cart, b, a, alpha) {
  const bp = b.p;
  const ap = a.p;
  if (Array.isArray(bp) && bp.length === 3 && Array.isArray(ap) && ap.length === 3) {
    cart._netTargetPos.set(
      bp[0] + (ap[0] - bp[0]) * alpha,
      bp[1] + (ap[1] - bp[1]) * alpha,
      bp[2] + (ap[2] - bp[2]) * alpha,
    );
  } else if (Array.isArray(bp) && bp.length === 3) {
    cart._netTargetPos.set(bp[0], bp[1], bp[2]);
  }

  const bq = b.q;
  const aq = a.q;
  if (Array.isArray(bq) && bq.length === 4 && Array.isArray(aq) && aq.length === 4) {
    _interpFromQ.set(bq[0], bq[1], bq[2], bq[3]);
    _interpToQ.set(aq[0], aq[1], aq[2], aq[3]);
    cart._netTargetQuat.copy(_interpFromQ).slerp(_interpToQ, alpha);
  } else if (Array.isArray(bq) && bq.length === 4) {
    cart._netTargetQuat.set(bq[0], bq[1], bq[2], bq[3]);
  }

  const alv = a.lv;
  if (Array.isArray(alv) && alv.length === 3) {
    cart._lastNetLinvel.x = alv[0];
    cart._lastNetLinvel.y = alv[1];
    cart._lastNetLinvel.z = alv[2];
  }
  const aav = a.av;
  if (Array.isArray(aav) && aav.length === 3) {
    cart.body.setAngvel({ x: aav[0], y: aav[1], z: aav[2] }, true);
  }
}

/**
 * Samples the host-authoritative cart state for a slot at the interpolation delay.
 * Interpolates between buffered snapshots, extrapolates briefly from velocity, or falls back to cache.
 *
 * @param {number} slotIndex Cart slot index (0–3).
 * @param {number} [targetServerNowMs] Server timestamp to sample at; defaults to interp-delayed now.
 * @returns {{ p: number[]|null, q: number[]|null, lv: number[]|null, av: number[]|null }|null}
 *   Snapshot fields or null when no data exists for the slot.
 */
export function sampleAuthoritativeCartState(slotIndex, targetServerNowMs = getInterpTargetServerNowMs()) {
  if (slotIndex < 0) return null;
  pruneNetStateBufferForEpoch();
  const { before, after } = findSnapshotPair(targetServerNowMs);
  if (before && after && before.carts && after.carts) {
    const denom = (after.serverNowMs - before.serverNowMs) || 1;
    const alpha = clamp((targetServerNowMs - before.serverNowMs) / denom, 0, 1);
    return sampleCartSnapshotFromPair(before, after, alpha, slotIndex);
  }
  if (before?.carts) {
    const snap = getCartSnap(before.carts, slotIndex);
    if (!snap) return null;
    const extrapMs = targetServerNowMs - before.serverNowMs;
    const extrapS = Math.min(extrapMs, CONFIG.net.extrapolationCapMs) / 1000;
    const bp = snap.p;
    const blv = snap.lv;
    if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
      return {
        p: [bp[0] + blv[0] * extrapS, bp[1] + blv[1] * extrapS, bp[2] + blv[2] * extrapS],
        q: Array.isArray(snap.q) ? snap.q.slice() : null,
        lv: blv.slice(),
        av: Array.isArray(snap.av) ? snap.av.slice() : null,
      };
    }
    return {
      p: Array.isArray(bp) ? bp.slice() : null,
      q: Array.isArray(snap.q) ? snap.q.slice() : null,
      lv: Array.isArray(blv) ? blv.slice() : null,
      av: Array.isArray(snap.av) ? snap.av.slice() : null,
    };
  }
  if (after?.carts) {
    const snap = getCartSnap(after.carts, slotIndex);
    if (!snap) return null;
    return {
      p: Array.isArray(snap.p) ? snap.p.slice() : null,
      q: Array.isArray(snap.q) ? snap.q.slice() : null,
      lv: Array.isArray(snap.lv) ? snap.lv.slice() : null,
      av: Array.isArray(snap.av) ? snap.av.slice() : null,
    };
  }
  const cache = lastCartsCache;
  const snap = getCartSnap(cache, slotIndex);
  if (!snap) return null;
  return {
    p: Array.isArray(snap.p) ? snap.p.slice() : null,
    q: Array.isArray(snap.q) ? snap.q.slice() : null,
    lv: Array.isArray(snap.lv) ? snap.lv.slice() : null,
    av: Array.isArray(snap.av) ? snap.av.slice() : null,
  };
}

/**
 * Updates `_netTargetPos` / `_netTargetQuat` for remote carts from the authoritative state buffer.
 * The local player's cart is skipped — client-side prediction drives that body instead.
 *
 * @param {number} localSlotIndex Slot index of the local human player (-1 when unknown).
 */
export function updateRemoteCartNetTargets(localSlotIndex) {
  const allCarts = getAllCarts();
  if (!allCarts) return;
  const targetServerNowMs = getInterpTargetServerNowMs();
  pruneNetStateBufferForEpoch();
  const { before, after, beforeIndex } = findSnapshotPair(targetServerNowMs);

  const applyRemoteTargets = (slotIndex, snap, options = {}) => {
    if (slotIndex === localSlotIndex) return;
    const cart = allCarts[slotIndex];
    if (!cart || !snap) return;
    const p = snap.p ?? (options.extrapolateP || null);
    if (Array.isArray(p) && p.length === 3) cart._netTargetPos.set(p[0], p[1], p[2]);
    const q = snap.q;
    if (Array.isArray(q) && q.length === 4) cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
    const lv = snap.lv;
    if (Array.isArray(lv) && lv.length === 3) {
      cart._lastNetLinvel.x = lv[0];
      cart._lastNetLinvel.y = lv[1];
      cart._lastNetLinvel.z = lv[2];
    }
    const aav = snap.av;
    if (Array.isArray(aav) && aav.length === 3) {
      cart.body.setAngvel({ x: aav[0], y: aav[1], z: aav[2] }, true);
    }
  };

  if (before && after && before.carts && after.carts) {
    const denom = (after.serverNowMs - before.serverNowMs) || 1;
    const alpha = clamp((targetServerNowMs - before.serverNowMs) / denom, 0, 1);
    for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
      if (slotIndex === localSlotIndex) continue;
      const cart = allCarts[slotIndex];
      if (!cart) continue;
      const b = getCartSnap(before.carts, slotIndex);
      const a = getCartSnap(after.carts, slotIndex);
      if (b && a) {
        writeInterpolatedRemoteTargets(cart, b, a, alpha);
      } else {
        const snap = b || a;
        if (snap) applyRemoteTargets(slotIndex, snap);
      }
    }
    const pruneIdx = beforeIndex >= 0 ? beforeIndex : -1;
    if (pruneIdx > 0) netStateBuffer.splice(0, pruneIdx);
    return;
  }

  if (before && before.carts) {
    const extrapMs = targetServerNowMs - before.serverNowMs;
    const extrapS = Math.min(extrapMs, CONFIG.net.extrapolationCapMs) / 1000;
    for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
      if (slotIndex === localSlotIndex) continue;
      const b = getCartSnap(before.carts, slotIndex);
      if (!b) continue;
      const bp = b.p;
      const bq = b.q;
      const blv = b.lv;
      const bav = b.av;
      const cart = allCarts[slotIndex];
      if (!cart) continue;
      if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
        cart._netTargetPos.set(
          bp[0] + blv[0] * extrapS,
          bp[1] + blv[1] * extrapS,
          bp[2] + blv[2] * extrapS,
        );
      } else if (Array.isArray(bp) && bp.length === 3) {
        cart._netTargetPos.set(bp[0], bp[1], bp[2]);
      }
      if (Array.isArray(bq) && bq.length === 4) cart._netTargetQuat.set(bq[0], bq[1], bq[2], bq[3]);
      if (Array.isArray(blv) && blv.length === 3) {
        cart._lastNetLinvel.x = blv[0];
        cart._lastNetLinvel.y = blv[1];
        cart._lastNetLinvel.z = blv[2];
      }
      if (Array.isArray(bav) && bav.length === 3) {
        cart.body.setAngvel({ x: bav[0], y: bav[1], z: bav[2] }, true);
      }
    }
    const pruneIdx = beforeIndex >= 0 ? beforeIndex : -1;
    if (pruneIdx > 0) netStateBuffer.splice(0, pruneIdx);
    return;
  }

  const carts = (after && after.carts) || lastCartsCache;
  if (!carts) return;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    if (slotIndex === localSlotIndex) continue;
    const snap = getCartSnap(carts, slotIndex);
    if (!snap) continue;
    applyRemoteTargets(slotIndex, snap);
  }
}

/**
 * Snaps remote cart physics bodies to their interpolated net targets.
 * Keeps predicted local-cart collisions aligned with where remote carts appear on screen.
 *
 * @param {number} localSlotIndex Slot index of the local human player (skipped).
 */
export function syncRemoteCartBodiesForPrediction(localSlotIndex) {
  const allCarts = getAllCarts();
  if (!allCarts) return;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    if (slotIndex === localSlotIndex) continue;
    const cart = allCarts[slotIndex];
    if (!cart?.body) continue;
    if (cart._netTargetPos) {
      const p = cart._netTargetPos;
      cart.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    }
    if (cart._netTargetQuat) {
      const q = cart._netTargetQuat;
      cart.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    }
    const lv = cart._lastNetLinvel;
    if (lv) {
      cart.body.setLinvel({ x: lv.x || 0, y: lv.y || 0, z: lv.z || 0 }, true);
    }
  }
}

// === RECONCILIATION ===

/**
 * Nudges the predicted local cart body toward the host-authoritative snapshot.
 * Uses exponential smoothing (`1 - exp(-rate * dt)`) for soft corrections; teleports on large error.
 * Prefers the latest buffered snapshot over the interp-delayed sample to avoid fighting prediction.
 *
 * @param {object} cart Local cart entity with a Rapier body.
 * @param {number} localSlotIndex Slot index of the local human player.
 * @param {number} dtSec Frame delta time in seconds.
 */
export function reconcilePredictedLocalCart(cart, localSlotIndex, dtSec) {
  if (!cart?.body || localSlotIndex < 0) return;
  // * Sample the most recent snapshot regardless of interp delay.
  const latestSnap = netStateBuffer.length > 0
    ? netStateBuffer[netStateBuffer.length - 1]
    : null;
  const latestCartSnap = latestSnap ? getCartSnap(latestSnap.carts, localSlotIndex) : null;
  const auth = latestCartSnap
    ? {
        p: latestCartSnap.p,
        q: latestCartSnap.q,
        lv: latestCartSnap.lv,
        av: latestCartSnap.av,
      }
    : sampleAuthoritativeCartState(localSlotIndex);
  if (!auth || !Array.isArray(auth.p) || auth.p.length !== 3) return;

  const cfg = CONFIG.net.prediction;
  const predT = cart.body.translation();
  const predR = cart.body.rotation();
  const predLv = cart.body.linvel();
  const predAv = cart.body.angvel();

  const dx = auth.p[0] - predT.x;
  const dy = auth.p[1] - predT.y;
  const dz = auth.p[2] - predT.z;
  const errMag = Math.hypot(dx, dy, dz);

  if (errMag > cfg.maxCorrectionM) {
    applySnapshotToCartBody(cart, auth);
    return;
  }
  if (errMag < cfg.minErrorM) return;

  const posAlpha = 1 - Math.exp(-cfg.reconcilePosRate * dtSec);
  cart.body.setTranslation({
    x: predT.x + dx * posAlpha,
    y: predT.y + dy * posAlpha,
    z: predT.z + dz * posAlpha,
  }, true);

  if (Array.isArray(auth.q) && auth.q.length === 4) {
    _reconcilePredQ.set(predR.x, predR.y, predR.z, predR.w);
    _reconcileAuthQ.set(auth.q[0], auth.q[1], auth.q[2], auth.q[3]);
    const rotAlpha = 1 - Math.exp(-cfg.reconcileRotRate * dtSec);
    _reconcilePredQ.slerp(_reconcileAuthQ, rotAlpha);
    cart.body.setRotation({
      x: _reconcilePredQ.x,
      y: _reconcilePredQ.y,
      z: _reconcilePredQ.z,
      w: _reconcilePredQ.w,
    }, true);
  }

  if (Array.isArray(auth.lv) && auth.lv.length === 3) {
    const velAlpha = 1 - Math.exp(-cfg.reconcileVelRate * dtSec);
    cart.body.setLinvel({
      x: predLv.x + (auth.lv[0] - predLv.x) * velAlpha,
      y: predLv.y + (auth.lv[1] - predLv.y) * velAlpha,
      z: predLv.z + (auth.lv[2] - predLv.z) * velAlpha,
    }, true);
  }
  if (Array.isArray(auth.av) && auth.av.length === 3) {
    const velAlpha = 1 - Math.exp(-cfg.reconcileVelRate * dtSec);
    cart.body.setAngvel({
      x: predAv.x + (auth.av[0] - predAv.x) * velAlpha,
      y: predAv.y + (auth.av[1] - predAv.y) * velAlpha,
      z: predAv.z + (auth.av[2] - predAv.z) * velAlpha,
    }, true);
  }
}

export function applyCartsSnapshotToBodies(carts) {
  const allCarts = getAllCarts();
  if (!allCarts) return;
  for (let i = 0; i < allCarts.length; i++) {
    const cart = allCarts[i];
    const snap = getCartSnap(carts, i);
    if (!cart || !snap) continue;

    const { p, q, lv, av } = snap;
    if (Array.isArray(p)) cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    if (Array.isArray(q)) cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
    if (Array.isArray(lv)) cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
    if (Array.isArray(av)) cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
  }
}

/**
 * Appends a host-authoritative cart snapshot to the client-side interpolation buffer.
 * Drops oldest entries when the buffer exceeds `CONFIG.net.stateBufferMaxSize`.
 *
 * @param {number} serverNowMs Server clock timestamp for the snapshot.
 * @param {number} seq Monotonic sequence number from the host.
 * @param {Array<object>|Record<string, object>} carts Per-slot transform snapshot (array preferred).
 * @param {number} epoch Host epoch (increments on host migration).
 */
export function bufferAuthoritativeState(serverNowMs, seq, carts, epoch) {
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(seq)) return;
  if (!carts || typeof carts !== "object") return;

  const last = netStateBuffer[netStateBuffer.length - 1];
  if (last && seq <= last.seq) return;

  netStateBuffer.push({ serverNowMs, seq, carts, epoch });
  while (netStateBuffer.length > CONFIG.net.stateBufferMaxSize) netStateBuffer.shift();
}

// --- Host / client send loops ---

export function stopHostSendLoop() {
  if (hostSendTimer) clearInterval(hostSendTimer);
  hostSendTimer = null;
}

export function stopInputSendLoop() {
  if (inputSendTimer) clearInterval(inputSendTimer);
  inputSendTimer = null;
}

export function stopKeepaliveLoop() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}

/**
 * Clears host/client send loops and authoritative snapshot state before a new socket session.
 * Called when replacing an existing PartyKit connection in {@link initNetcode}.
 */
function resetNetcodeReconnectState() {
  stopHostSendLoop();
  stopInputSendLoop();
  netStateBuffer = [];
  hostEpoch += 1;
  lastCartsCache = null;
}

export function startHostSendLoop() {
  stopHostSendLoop();
  if (!partySocket || !isHost || !getAllCarts()) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.hostSendHz));
  hostSendTimer = setInterval(() => {
    const allCarts = getAllCarts();
    if (!partySocket || !isHost || !allCarts || GameState.getRoundState().phase !== "running") return;

    hostSeq += 1;
    const carts = [];
    const round3 = v => Math.round(v * 1000) / 1000;

    for (let i = 0; i < allCarts.length; i++) {
      const c = allCarts[i];
      const t = c.body.translation();
      const r = c.body.rotation();
      const lv = c.body.linvel();
      const av = c.body.angvel();

      carts[i] = {
        p: [round3(t.x), round3(t.y), round3(t.z)],
        q: [round3(r.x), round3(r.y), round3(r.z), round3(r.w)],
        lv: [round3(lv.x), round3(lv.y), round3(lv.z)],
        av: [round3(av.x), round3(av.y), round3(av.z)],
      };
    }

    lastCartsCache = carts;
    partySocket.send(JSON.stringify({
      type: MSG.hostTransform,
      seq: hostSeq,
      tHost: Date.now(),
      carts,
    }));
  }, intervalMs);
}

export function startInputSendLoop() {
  stopInputSendLoop();
  if (!partySocket || isHost || !getAxisRef) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.clientInputHz));
  inputSendTimer = setInterval(() => {
    if (!partySocket || isHost || !getAxisRef) return;

    inputSeq += 1;
    const axis = getAxisRef();
    partySocket.send(JSON.stringify({
      type: MSG.clientInput,
      seq: inputSeq,
      tClient: Date.now(),
      input: {
        throttle: axis.forward,
        steer: axis.turn,
        nitro: isNitroHeldRef ? isNitroHeldRef() : false,
        hop: consumeHopRequest(),
      },
    }));
  }, intervalMs);
}

export function startKeepaliveLoop() {
  stopKeepaliveLoop();
  if (!partySocket) return;

  keepaliveTimer = setInterval(() => {
    if (partySocket) {
      partySocket.send(JSON.stringify({ type: MSG.keepalive, tClient: Date.now() }));
    }
  }, CONFIG.net.keepaliveIntervalMs);
}

/**
 * Switches between host and client networking roles.
 * Starts/stops send loops, clears buffers on host promotion, and applies cached snapshots.
 *
 * @param {boolean} nextIsHost True when this client becomes (or remains) the room host.
 */
export function setAuthorityMode(nextIsHost) {
  const becomingHost = nextIsHost && !isHost;
  const becomingClient = !nextIsHost && isHost;
  isHost = Boolean(nextIsHost);

  if (becomingHost) {
    stopInputSendLoop();
    consumeHopRequest();
    netStateBuffer = [];
    hostSeq = 0;
    inputSeq = 0;
    remoteInputsByConnId.clear();
    remoteNitroLatchedByConnId.clear();

    if (lastCartsCache) applyCartsSnapshotToBodies(lastCartsCache);
    resetSimTimingRef?.current?.();
    skipNextPhysicsStep = true;

    for (const cart of getAllCarts() || []) cart.body?.wakeUp?.();
    startHostSendLoop();
    return;
  }

  if (becomingClient) {
    stopHostSendLoop();
    startInputSendLoop();
    return;
  }

  if (isHost) {
    stopInputSendLoop();
    if (!hostSendTimer) startHostSendLoop();
  } else {
    stopHostSendLoop();
    if (!inputSendTimer) startInputSendLoop();
  }
}

export function strictSlotIndexForConn(connId) {
  if (!connId) return -1;
  return netSlots.findIndex((s) => s && s.connId === connId);
}

/**
 * Sends multiplayer color pick with the player's cosmetic neon hex.
 * @param {string} color Preset palette id for slot assignment.
 */
export function sendColorPick(color) {
  if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
  const lookHex = loadPlayerCustomization().hex;
  partySocket.send(JSON.stringify({ type: MSG.colorPick, color, lookHex }));
}

/** Pushes an updated cosmetic hex to the server (Customize menu mid-session). */
export function syncCartLookToServer() {
  if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
  const lookHex = loadPlayerCustomization().hex;
  partySocket.send(JSON.stringify({ type: MSG.cartLook, lookHex }));
}

/** Solo / offline path: patch lookHex on the local human slot in netSlots. */
export function syncLocalSlotLookHex() {
  if (!youConnId) return;
  const lookHex = loadPlayerCustomization().hex;
  const idx = strictSlotIndexForConn(youConnId);
  if (idx < 0 || !netSlots[idx]) return;
  netSlots[idx].lookHex = lookHex;
}

/**
 * Initializes PartyKit networking for the current game mode.
 * Solo mode skips the socket and seeds local slots; multiplayer opens a WebSocket and wires handlers.
 *
 * @param {string} [roomOverride] Optional room code override (alphanumeric, 2–16 chars).
 */
export function initNetcode(roomOverride) {
  if (typeof window === "undefined") return;
  callbacks.setLocalColorPicked(false);
  serverClockOffsetMs = 0;
  serverClockOffsetSamples = 0;
  let clientId = localStorage.getItem("cartRaveClientId");
  if (!clientId) {
    try {
      clientId = crypto.randomUUID();
    } catch {
      clientId = `cr-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    }
    try {
      localStorage.setItem("cartRaveClientId", clientId);
    } catch {
      // ignore
    }
  }
  const modeAtConnect = callbacks.detectGameMode();
  if (partySocket) {
    stopKeepaliveLoop();
    partySocket.close();
    partySocket = null;
    resetNetcodeReconnectState();
  }

  if (modeAtConnect === "solo") {
    youConnId = "local-solo-player";
    hostId = "local-solo-player";
    isHost = true;
    setAuthorityMode(true);

    let savedUsername = (localStorage.getItem("cartRaveUsername") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      try {
        localStorage.setItem("cartRaveUsername", savedUsername);
      } catch {}
    }
    const colorToSend = resolveServerColorPick();
    const lookHex = loadPlayerCustomization().hex;
    const npcNames = callbacks.getInitialNpcNames();

    netSlots = [
      { slotId: 0, kind: "human", connId: youConnId, name: savedUsername, color: colorToSend, lookHex },
      { slotId: 1, kind: "npc", connId: null, name: npcNames[1], color: "blue" },
      { slotId: 2, kind: "npc", connId: null, name: npcNames[2], color: "green" },
      { slotId: 3, kind: "npc", connId: null, name: npcNames[3], color: "yellow" },
    ];

    callbacks.markFirstHelloReceived();

    setTimeout(() => {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) {
        startHandler({ type: MSG.gameStart });
      }
    }, 100);
    return;
  }

  let didAutoReadyOnOpen = false;

  let resolvedRoom = resolvedPartyRoomFromUrl();
  if (roomOverride != null && String(roomOverride).trim() !== "") {
    const r = String(roomOverride).trim();
    if (/^[A-Za-z0-9]{2,16}$/.test(r)) resolvedRoom = r;
  }
  partySocket = new PartySocket({
    host: partyHostFromWindowLocation(),
    party: "main",
    room: resolvedRoom,
  });

  let didSendJoin = false;
  let helloReceivedThisSession = false;
  let netcodeRetryScheduled = false;
  const scheduleNetcodeRetry = () => {
    if (netcodeRetryScheduled) return;
    netcodeRetryScheduled = true;
    setTimeout(() => {
      netcodeRetryScheduled = false;
      if (partySocket) return;
      initNetcode(roomOverride);
    }, 400 + Math.random() * 600);
  };

  partySocket.addEventListener("close", () => {
    if (didSendJoin && !helloReceivedThisSession) {
      try { callbacks.onJoinRejected(); } catch {}
      return;
    }
    if (didSendJoin) return;
    try { scheduleNetcodeRetry(); } catch {}
  });

  partySocket.addEventListener("error", () => {
    if (didSendJoin && !helloReceivedThisSession) {
      try { callbacks.onJoinRejected(); } catch {}
      return;
    }
    if (didSendJoin) return;
    try { scheduleNetcodeRetry(); } catch {}
  });

  partySocket.addEventListener("open", () => {
    let savedUsername = (localStorage.getItem("cartRaveUsername") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      localStorage.setItem("cartRaveUsername", savedUsername);
    }
    partySocket?.send(JSON.stringify({ type: MSG.join, name: savedUsername, clientId }));
    didSendJoin = true;
    
    startKeepaliveLoop();
  });

  // === MESSAGE HANDLING ===
  partySocket.addEventListener("message", (ev) => {
    let msg = null;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const type = msg.type;
    const menuVisible = callbacks.getMenuVisible();

    if (type === MSG.joinRejected) {
      try { callbacks.onJoinRejected(); } catch {}
      return;
    }

    if (type === MSG.hello) {
      helloReceivedThisSession = true;
      youConnId = typeof msg.youConnId === "string" ? msg.youConnId : null;
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      if (Array.isArray(msg.slots)) netSlots = msg.slots;
      if (msg.round && typeof msg.round === "object") {
        const state = GameState.getRoundState();
        GameState.setRoundPhase(msg.round.phase ?? state.phase);
        GameState.setRoundStartedAtMs(msg.round.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(msg.round.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(msg.round.winnerSlotIndex ?? state.winnerSlotIndex);
      }
      if (GameState.getRoundState().phase === "running" && youConnId) {
        callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
      }
      callbacks.markFirstHelloReceived();

      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
        applyCartsSnapshotToBodies(msg.carts);
      }

      setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));

      // * Enter game only after server hello — menu stays up while connecting.
      const colorToSend = resolveServerColorPick();
      if (partySocket && partySocket.readyState === WebSocket.OPEN) {
        sendColorPick(colorToSend);
        if (GameState.getRoundState().phase === "running" && youConnId) {
          callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
        }
      }
      callbacks.hideMenuRef();

      callbacks.updateCartMaterialsFromSlots(msg.slots);
      callbacks.updateHudColorsFromSlots(msg.slots);
      callbacks.scheduleNameLabelUpdate();

      if (!didAutoReadyOnOpen && (modeAtConnect === "quickplay" || modeAtConnect === "solo")) {
        didAutoReadyOnOpen = true;
        setTimeout(() => {
          if (
            partySocket &&
            partySocket.readyState === WebSocket.OPEN &&
            (callbacks.detectGameMode() === "quickplay" || callbacks.detectGameMode() === "solo")
          ) {
            partySocket.send(JSON.stringify({ type: MSG.readyToggle }));
          }
        }, 400);
      }
      return;
    }

    if (type === MSG.hostMigrated) {
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      const nextIsHost = Boolean(hostId && youConnId && hostId === youConnId);
      if (nextIsHost && lastCartsCache) {
        applyCartsSnapshotToBodies(lastCartsCache);
      }
      setAuthorityMode(nextIsHost);
      if (!nextIsHost) hostMigrationFreezeUntilMs = Date.now() + CONFIG.net.hostMigrationFreezeMs;
      hostEpoch += 1;
      netStateBuffer = [];
      if (nextIsHost) {
        const hostMigratedHandler = callbacks.getOnHostMigratedHandler?.();
        if (hostMigratedHandler) hostMigratedHandler();
      }
      return;
    }

    if (type === MSG.slots) {
      const incomingJson = JSON.stringify(msg.slots);
      if (incomingJson === lastSlotsJson) return;
      lastSlotsJson = incomingJson;
      if (Array.isArray(msg.slots)) {
        const newColors = msg.slots.map((s) => (s?.color || ""));
        const oldColors = netSlots.map((s) => (s?.color || ""));
        const colorsChanged = newColors.some((c, i) => c !== oldColors[i]);
        const looksChanged = msg.slots.some((s, i) => {
          const oldLook = netSlots[i]?.lookHex ?? null;
          const newLook = s?.lookHex ?? null;
          return oldLook !== newLook;
        });

        netSlots = msg.slots;
        const liveConnIds = new Set(
          netSlots
            .map((s) => (s && typeof s.connId === "string" ? s.connId : null))
            .filter(Boolean),
        );
        for (const id of remoteInputsByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteInputsByConnId.delete(id);
        }
        for (const id of remoteNitroLatchedByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteNitroLatchedByConnId.delete(id);
        }
        
        const takenColors = msg.slots
          .filter((s) => s && s.kind === "human" && s.connId !== youConnId)
          .map((s) => s.color);
        const palette = callbacks.getPALETTE();
        const availableColors = palette.filter((c) => !takenColors.includes(c));
        void availableColors;

        if (callbacks.getLocalColorPicked() && youConnId) {
          const mySlot = msg.slots.find((s) => s && s.connId === youConnId) || null;
          if (mySlot && typeof mySlot.color === "string") {
            const pendingColorKey = callbacks.getPendingColorKey();
            const isConfirmed = pendingColorKey && mySlot.color === pendingColorKey;
            const isRejected = pendingColorKey && mySlot.color !== pendingColorKey;
            if (isConfirmed || isRejected) {
              const pendingColorChipEl = callbacks.getPendingColorChipEl();
              pendingColorChipEl?.classList.remove("color-pending");
              callbacks.setPendingColorChipEl(null);
              callbacks.setPendingColorKey(null);
              callbacks.setLocalColorPicked(false);
            }
          }
        }
        
        if (colorsChanged || looksChanged) callbacks.updateCartMaterialsFromSlots(msg.slots);
        if (colorsChanged || looksChanged) callbacks.updateHudColorsFromSlots(msg.slots);
        callbacks.scheduleNameLabelUpdate();
        callbacks.respawnLocalMidRoundJoinRef();
      }
      return;
    }

    if (type === MSG.state) {
      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
      }
      if (!isHost) {
        const serverNowMs = typeof msg.serverNowMs === "number" ? msg.serverNowMs : Date.now();
        if (typeof serverNowMs === "number") {
          const sample = Date.now() - serverNowMs;
          const isClockOutlier = Math.abs(sample - serverClockOffsetMs) > 500 && serverClockOffsetSamples > 0;
          if (!isClockOutlier) {
            serverClockOffsetSamples += 1;
            if (serverClockOffsetSamples === 1) {
              serverClockOffsetMs = sample;
            } else {
              serverClockOffsetMs += (sample - serverClockOffsetMs) * 0.1;
            }
          }
        }
        const seq = typeof msg.seq === "number" ? msg.seq : -1;
        bufferAuthoritativeState(serverNowMs, seq, msg.carts, hostEpoch);
      }
      return;
    }

    if (type === MSG.hostEventCollision) {
      if (isHost) return;
      const intensity = typeof msg.intensity === "number" ? msg.intensity : 0;
      const mp = msg.midpoint;
      const slotB = typeof msg.slotB === "number" ? msg.slotB : 0;
      if (mp && typeof mp.x === "number") {
        if (slotB === -1) {
          callbacks.playFloorImpactRef(intensity);
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity, "floor");
          }
        } else if (slotB === -2 || slotB === -3) {
          callbacks.playEdgeImpactRef(intensity);
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity, "edge");
          }
        } else {
          const isBoosting = Boolean(msg.isBoosting);
          callbacks.playCollisionRef(intensity, { isBoosting });
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity, "cart", { isBoosting });
          }
          const localSlot = strictSlotIndexForConn(youConnId);
          if (typeof msg.rammerSlot === "number" && msg.rammerSlot === localSlot) {
            callbacks.triggerLocalRamShakeRef(intensity, isBoosting);
          }
        }
      }
      return;
    }

    if (type === MSG.hostEventFall) {
      if (isHost) return;
      const victimSlot = netSlots[msg.slotId];
      const targetName = victimSlot?.name || `P${(msg.slotId ?? 0) + 1}`;
      const targetColor = callbacks.colorHexForSlot(victimSlot);
      if (msg.attackerSlot != null) {
        const attackerSlot = netSlots[msg.attackerSlot];
        const actorName = attackerSlot?.name || `P${msg.attackerSlot + 1}`;
        const actorColor = callbacks.colorHexForSlot(attackerSlot);
        callbacks.addKillFeedEntry(actorName, actorColor, msg.verb || "RAMMED", targetName, targetColor);
      } else {
        callbacks.addKillFeedEntry(null, null, msg.verb || "FELL OFF", targetName, targetColor);
      }
      return;
    }

    if (type === MSG.clientInput) {
      if (!isHost) return;
      const connId = typeof msg.connId === "string" ? msg.connId : null;
      const input = msg.input;
      if (!connId || !input || typeof input !== "object") return;

      const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
      const steer = Number.isFinite(input.steer) ? input.steer : 0;
      const nitro = Boolean(input.nitro);
      const hop = Boolean(input.hop);

      remoteInputsByConnId.set(connId, {
        throttle: clamp(throttle, -1, 1),
        steer: clamp(steer, -1, 1),
        nitro,
      });

      const was = remoteNitroLatchedByConnId.get(connId) || false;
      const allCarts = getAllCarts();
      if (!was && nitro && allCarts && triggerRamBoostRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerRamBoostRef(cart, performance.now());
        }
      }
      remoteNitroLatchedByConnId.set(connId, nitro);

      if (hop && allCarts && triggerHopRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerHopRef(cart, performance.now());
        }
      }
      return;
    }

    if (type === MSG.round) {
      const r = msg.round;
      if (r && typeof r === "object") {
        if (r.phase === "running" && r.scores && typeof r.scores === "object") {
          let didScore = false;
          const currentScores = GameState.getRoundState().scores;
          for (let i = 0; i < 4; i += 1) {
            const prev = Number(currentScores?.[i] ?? 0);
            const next = Number(r.scores?.[i] ?? prev);
            if (next > prev) { didScore = true; break; }
          }
          callbacks.bumpCrowd();
        }

        const prevPhase = GameState.getRoundState().phase;
        const newPhase = r.phase;
        if (typeof newPhase === "string" && prevPhase === "countdown" && newPhase === "lobby") {
          callbacks.onCountdownCancelled?.();
        }
        if (typeof newPhase === "string" && prevPhase === "podium" && newPhase === "lobby") {
          GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
          GameState.setRoundStartedAtMs(0);
          GameState.setRoundCountdownStartedAtMs(0);
          GameState.setRoundWinnerSlotIndex(null);
        }
        if (typeof newPhase === "string" && prevPhase === "running" && newPhase === "podium") {
          callbacks.setPendingMidRoundJoinRespawnConnId(null);
          if (!isHost) {
            if (r.validated !== true) return;
            const w = r.winnerSlotIndex;
            const winnerSlotIndex =
              w === "draw" ? "draw" : Number.isFinite(w) ? w : 0;
            const src = r.scores && typeof r.scores === "object" ? r.scores : GameState.getRoundState().scores;
            callbacks.recordPodiumStats(winnerSlotIndex, src);
          }
        }
        const state = GameState.getRoundState();
        GameState.setRoundPhase(r.phase ?? state.phase);
        GameState.setRoundStartedAtMs(r.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(r.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(r.winnerSlotIndex ?? null);
        if (r.scores && typeof r.scores === "object") GameState.setRoundScores(r.scores);
      }
      return;
    }

    if (type === MSG.gameStart) {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) startHandler(msg);
      return;
    }
  });
}

export function broadcastHostTransform(carts) {
  if (!partySocket || !isHost) return;
  hostSeq += 1;
  lastCartsCache = carts;
  partySocket.send(JSON.stringify({
    type: MSG.hostTransform,
    seq: hostSeq,
    tHost: Date.now(),
    carts: lastCartsCache,
  }));
}

export function sendHostRound() {
  if (!partySocket || !isHost) return;
  const state = GameState.getRoundState();
  partySocket.send(JSON.stringify({
    type: MSG.hostRound,
    round: {
      phase: state.phase,
      startedAtMs: state.startedAtMs,
      countdownStartedAtMs: state.countdownStartedAtMs,
      winnerSlotIndex: state.winnerSlotIndex,
      scores: state.scores,
    },
  }));
}

export function sendPlayAgain() {
  if (partySocket && partySocket.readyState === 1) {
    partySocket.send(JSON.stringify({ type: MSG.playAgain }));
  }
}