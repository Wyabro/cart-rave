// netcode.js — PartyKit networking, interpolation, host/client authority (extracted)

import PartySocket from "partysocket";
import * as THREE from "three";
import * as GameState from "./gameState.js";
import { CART_COLORS, CONFIG, MSG, PALETTE, PARTYKIT_PUBLIC_HOST } from "./config.js";
import { loadPlayerCustomization, resolveServerColorPick } from "./customization.js";
import { consumeHopRequest } from "./input.js";
import { clearHostCollisionBatch, drainHostCollisionBatch } from "./hostCollisionBatch.js";
import { clearNpcCartCache } from "./gameLoop.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { settingsStore } from "./stores/settingsStore.js";
import { cleanupShatter } from "./cartShatter.js";

/** Scratch quaternions/vectors for interpolation and reconciliation (zero per-frame allocs). */
const _interpFromQ = new THREE.Quaternion();
const _interpToQ = new THREE.Quaternion();
const _reconcilePredQ = new THREE.Quaternion();
const _reconcileAuthQ = new THREE.Quaternion();
const _reconcileYawQ = new THREE.Quaternion();
const _reconcileYAxis = new THREE.Vector3(0, 1, 0);
const _reconcileUpPred = new THREE.Vector3();
const _reconcileUpAuth = new THREE.Vector3();
const _reconcileFwdPred = new THREE.Vector3();
const _reconcileFwdAuth = new THREE.Vector3();

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
let serverClockSamples = [];
let clockResyncDueAtMs = 0;
let clockResyncSamples = [];

let lastCartsCache = null;
let netStateBuffer = [];

let remoteInputsByConnId = new Map();
let remoteNitroLatchedByConnId = new Map();

let hostSendTimer = null;
let inputSendTimer = null;
let keepaliveTimer = null;

let hostMigrationFreezeUntilMs = 0;

let skipNextPhysicsStep = false;

let _suppressRetry = false;

/** @type {(() => Array<object> | null) | null} */
let getAllCartsRefFn = null;
let getAxisRef = null;
let isNitroHeldRef = null;
let triggerRamBoostRef = null;
let triggerHopRef = null;
let triggerCartShatterRef = null;
let resetSimTimingRef = null;

let netSlots = [];
let lastSlotsJson = "";
let lastSlotsServerMs = 0;



/**
 * Ensures NPC slot colors do not clash with human players in the lobby/match.
 * Re-rolls NPC colors from the available palette if a collision occurs.
 * @param {Array<Object>} slots
 * @returns {Array<Object>}
 */
export function declashNpcSlotColors(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return slots;
  const palette = PALETTE || ["pink", "blue", "green", "yellow", "neonOrange"];
  const humanPresetColors = new Set();
  const humanLookHexes = new Set();

  for (const s of slots) {
    if (s && s.kind === "human") {
      if (s.color) humanPresetColors.add(s.color);
      if (typeof s.lookHex === "number") humanLookHexes.add(s.lookHex & 0xffffff);
    }
  }

  const availableColors = palette.filter((c) => {
    if (humanPresetColors.has(c)) return false;
    const hex = CART_COLORS[c]?.hex;
    if (hex != null && humanLookHexes.has(hex & 0xffffff)) return false;
    return true;
  });

  let availIdx = 0;
  for (const s of slots) {
    if (s && s.kind === "npc") {
      const npcHex = typeof s.lookHex === "number" ? (s.lookHex & 0xffffff) : (CART_COLORS[s.color]?.hex & 0xffffff);
      const isClashing = humanPresetColors.has(s.color) || (npcHex != null && humanLookHexes.has(npcHex));
      if (isClashing && availableColors.length > 0) {
        s.color = availableColors[availIdx % availableColors.length];
        delete s.lookHex;
        availIdx++;
      }
    }
  }
  return slots;
}


// === CALLBACK REGISTRATION ===
// Registration of external callbacks/functions from main.js
let callbacks = {
  // Game mode
  detectGameMode: () => "quickplay",

  // Palette & NPC names
  getPALETTE: () => [],
  getInitialNpcNames: () => [],

  // Connection lifecycle
  markFirstHelloReceived: (slots) => {},
  getOnGameStartHandler: () => null,
  getOnHostMigratedHandler: () => null,
  onCountdownCancelled: () => {},
  onJoinRejected: () => {},

  // Menu & HUD
  getMenuVisible: () => true,
  hideMenuRef: () => {},
  updateCartMaterialsFromSlots: (slots) => {},
  updateHudColorsFromSlots: (slots) => {},
  scheduleNameLabelUpdate: () => {},

  // Mid-round join
  respawnLocalMidRoundJoinRef: () => {},
  getPendingMidRoundJoinRespawnConnId: () => null,
  setPendingMidRoundJoinRespawnConnId: (connId) => {},

  // Audio & VFX
  playCollisionRef: (midpoint, intensity) => {},
  spawnTrashBurstRef: (pos, vel, count) => {},
  triggerLocalRamShakeRef: (intensity) => {},
  playFloorImpactRef: (intensity) => {},
  playEdgeImpactRef: (intensity) => {},
  triggerCartShatterRef: (cart, scene, hex) => {},
  getSceneRef: () => null,

  // Kill feed
  addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier) => {},
  colorHexForSlot: (slot) => 0x888888,

  // Color picker
  getPendingColorKey: () => null,
  getPendingColorChipEl: () => null,
  setPendingColorKey: (key) => {},
  setPendingColorChipEl: (el) => {},
  getLocalColorPicked: () => false,
  setLocalColorPicked: (picked, syncMenuUI) => {},

  // Stats
  recordPodiumStats: (winnerSlotIndex, scores) => {},
  onReturnToLobby: () => {},
  onEnterPodium: () => {},

  // Session lifecycle
  ensureSessionReady: () => {},
  endCinematicCountdown: () => {},
  teleportCartToSpawn: (slotIndex) => {},
};

function registerCallbacks(cb) {
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
    getPALETTE: () => (typeof deps.getPalette === "function" ? deps.getPalette() : deps.palette) ?? [],
    getInitialNpcNames: () => (
      typeof deps.getInitialNpcNames === "function" ? deps.getInitialNpcNames() : deps.initialNpcNames
    ) ?? [],
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
        const labelRef = typeof deps.getUpdateNameLabelsRef === "function"
          ? deps.getUpdateNameLabelsRef()
          : deps.updateNameLabelsRef;
        if (labelRef?.current) labelRef.current();
      }));
    },
    respawnLocalMidRoundJoinRef: () => {
      const joinRef = typeof deps.getRespawnLocalMidRoundJoinRef === "function"
        ? deps.getRespawnLocalMidRoundJoinRef()
        : deps.respawnLocalMidRoundJoinRef;
      if (joinRef?.current) joinRef.current();
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
    triggerCartShatterRef: (cart, scene, neonHex) => {
      deps.getTriggerCartShatterRef?.()?.(cart, scene, neonHex);
    },
    getSceneRef: () => deps.getSceneRef?.() ?? deps.getScene?.() ?? null,
    addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier) => {
      const hud = deps.getHud();
      if (hud && hud.addKillFeedEntry) hud.addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier);
    },
    colorHexForSlot: (slot) => deps.colorHexForSlot(slot),
    getPendingColorKey: () => deps.getPendingColorKey(),
    getPendingColorChipEl: () => deps.getPendingColorChipEl(),
    setPendingColorKey: (val) => deps.setPendingColorKey(val),
    setPendingColorChipEl: (val) => deps.setPendingColorChipEl(val),
    getLocalColorPicked: () => deps.getLocalColorPicked(),
    setLocalColorPicked: (val) => deps.setLocalColorPicked(val),
    recordPodiumStats: (winner, scores) => deps.recordPodiumStats(winner, scores),
    onReturnToLobby: () => deps.onReturnToLobby?.(),
    onEnterPodium: () => deps.onEnterPodium?.(),
    getPendingMidRoundJoinRespawnConnId: () => deps.getPendingMidRoundJoinRespawnConnId(),
    setPendingMidRoundJoinRespawnConnId: (val) => deps.setPendingMidRoundJoinRespawnConnId(val),
    ensureSessionReady: () => deps.ensureSessionReady?.(),
    endCinematicCountdown: () => deps.endCinematicCountdown?.(),
    teleportCartToSpawn: (slotIndex) => deps.teleportCartToSpawn?.(slotIndex),
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
  if (refs.triggerCartShatterRef !== undefined) triggerCartShatterRef = refs.triggerCartShatterRef;
  if (refs.resetSimTimingRef !== undefined) resetSimTimingRef = refs.resetSimTimingRef;
  if (!isHost && partySocket && getAxisRef && !inputSendTimer) {
    startInputSendLoop();
  }
}

export function getYouConnId() { return youConnId; }
export function getIsHost() { return isHost; }
export function getNetSlots() { return netSlots; }
export function getRemoteInputsByConnId() { return remoteInputsByConnId; }
export function getHostMigrationFreezeUntilMs() { return hostMigrationFreezeUntilMs; }
export function getServerClockOffsetMs() { return serverClockOffsetMs; }
export function getSkipNextPhysicsStep() { return skipNextPhysicsStep; }
export function setSkipNextPhysicsStep(val) { skipNextPhysicsStep = val; }
export function getPartySocket() { return partySocket; }

// * Public integration getters — main.js / gameLoop bridge only need these timer checks.
export function getHostSendTimer() { return hostSendTimer; }

// === CONNECTION & SOCKET ===

// * Local dev vs production PartyKit host — internal to initNetcode only.
function partyHostFromWindowLocation() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  return isLocal ? `${hostname}:8787` : PARTYKIT_PUBLIC_HOST;
}

export function resolvedPartyRoomFromUrl() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  return /^[A-Za-z0-9]{2,16}$/.test(raw) ? raw : "quickplay";
}

function clamp(value, min, max) {
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
  return callbacks.detectGameMode() !== "solo" && callbacks.detectGameMode() !== "testdrive";
}

// === INTERPOLATION & REMOTE CARTS ===

/** Server clock time used for interpolating authoritative snapshots on non-host clients. */
function getInterpTargetServerNowMs() {
  return Date.now() - serverClockOffsetMs - CONFIG.net.interpBufferMs;
}

function pruneNetStateBufferForEpoch() {
  for (let i = netStateBuffer.length - 1; i >= 0; i -= 1) {
    const e = netStateBuffer[i];
    if (!e || e.epoch !== hostEpoch) netStateBuffer.splice(i, 1);
  }
}

/** Drops buffer entries older than the consumed `before` snapshot (keeps `before` itself). */
function pruneConsumedSnapshots(beforeIndex) {
  if (beforeIndex > 0) netStateBuffer.splice(0, beforeIndex);
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
  let p = a.p ?? b.p;
  if (Array.isArray(bp) && bp.length === 3 && Array.isArray(ap) && ap.length === 3) {
    p = [
      bp[0] + (ap[0] - bp[0]) * alpha,
      bp[1] + (ap[1] - bp[1]) * alpha,
      bp[2] + (ap[2] - bp[2]) * alpha,
    ];
  }

  const bq = b.q;
  const aq = a.q;
  let q = a.q ?? b.q;
  if (Array.isArray(bq) && bq.length === 4 && Array.isArray(aq) && aq.length === 4) {
    _interpFromQ.set(bq[0], bq[1], bq[2], bq[3]);
    _interpToQ.set(aq[0], aq[1], aq[2], aq[3]);
    _interpFromQ.slerp(_interpToQ, alpha);
    q = [_interpFromQ.x, _interpFromQ.y, _interpFromQ.z, _interpFromQ.w];
  }

  const interpSnap = {
    p,
    q,
    lv: a.lv ?? b.lv,
    av: a.av ?? b.av,
    b: a.b ?? b.b,
    h: a.h ?? b.h,
    c: a.c ?? b.c,
    s: a.s ?? b.s,
  };

  applyCartState(cart, interpSnap, { interpolate: true });
}

/**
 * Applies authoritative cart snapshot state (transforms, velocities, VFX flags).
 * Shared by both interpolated updates (updateRemoteCartNetTargets) and direct snaps (applyCartsSnapshotToBodies).
 *
 * @param {object} cart Target cart entity.
 * @param {object} snap Cart transform snapshot payload from host.
 * @param {{ interpolate?: boolean }} [options] Options object; `interpolate: true` updates target vectors, `false` snaps Rapier body.
 */
export function applyCartState(cart, snap, options = {}) {
  if (!cart || !snap) return;
  const { interpolate = true } = options;

  const { p, q, lv, av } = snap;

  if (interpolate) {
    if (Array.isArray(p) && p.length === 3 && cart._netTargetPos) {
      cart._netTargetPos.set(p[0], p[1], p[2]);
    }
    if (Array.isArray(q) && q.length === 4 && cart._netTargetQuat) {
      cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
    }
  } else {
    if (cart.body) {
      if (Array.isArray(p) && p.length === 3) {
        cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
      }
      if (Array.isArray(q) && q.length === 4) {
        cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
      }
      if (Array.isArray(lv) && lv.length === 3) {
        cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
      }
    }
    // * Keep interpolation targets in lockstep with direct body snaps.
    if (Array.isArray(p) && p.length === 3 && cart._netTargetPos) {
      cart._netTargetPos.set(p[0], p[1], p[2]);
    }
    if (Array.isArray(q) && q.length === 4 && cart._netTargetQuat) {
      cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
    }
  }

  if (Array.isArray(lv) && lv.length === 3 && cart._lastNetLinvel) {
    cart._lastNetLinvel.x = lv[0];
    cart._lastNetLinvel.y = lv[1];
    cart._lastNetLinvel.z = lv[2];
  }
  if (Array.isArray(av) && av.length === 3 && cart.body) {
    cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
  }

  if (snap.b && !cart._prevRemoteBoosting) {
    if (triggerRamBoostRef) triggerRamBoostRef(cart, performance.now(), { instant: true });
  }
  cart._prevRemoteBoosting = Boolean(snap.b);

  if (snap.h && !cart._prevRemoteHopping) {
    if (triggerHopRef) triggerHopRef(cart, performance.now());
  }
  cart._prevRemoteHopping = Boolean(snap.h);

  if (typeof snap.c === "boolean" && cart.cargoBay) {
    cart.cargoBay.visible = snap.c;
  }

  if (typeof snap.s === "boolean") {
    const wasSpilled = cart.hasSpilled;
    cart.hasSpilled = snap.s;
    if (!snap.s && (wasSpilled || cart.isShattering || cart._shatterState)) {
      const scene = callbacks.getSceneRef?.();
      cleanupShatter(cart, scene);

      // FORCE CLEAR: Ensure frameVisuals.js resumes position lerping even if cleanupShatter bailed out.
      cart.isShattering = false;
      cart._shatterState = null;
      cart._shatterDeathPos = null;

      if (cart.mesh) cart.mesh.visible = true;
      if (cart.contactShadow) cart.contactShadow.visible = true;
      if (cart.cargoBay) cart.cargoBay.visible = true;
    }
  }
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
        if (snap) applyCartState(cart, snap, { interpolate: true });
      }
    }
    pruneConsumedSnapshots(beforeIndex);
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
      const blv = b.lv;
      const cart = allCarts[slotIndex];
      if (!cart) continue;

      const snap = { ...b };
      if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
        snap.p = [
          bp[0] + blv[0] * extrapS,
          bp[1] + blv[1] * extrapS,
          bp[2] + blv[2] * extrapS,
        ];
      }
      applyCartState(cart, snap, { interpolate: true });
    }
    pruneConsumedSnapshots(beforeIndex);
    return;
  }

  const carts = (after && after.carts) || lastCartsCache;
  if (!carts) return;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    if (slotIndex === localSlotIndex) continue;
    const snap = getCartSnap(carts, slotIndex);
    if (!snap) continue;
    applyCartState(cart, snap, { interpolate: true });
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

    // * Yaw-only reconciliation: client and host physics produce slightly different
    // * pitch/roll (suspension, friction accumulation), so slerping the full quaternion
    // * visibly pops the cart on axes the player never steered. Correct only heading and
    // * let the local physics own pitch/roll — UNLESS the two orientations genuinely
    // * disagree about which way is up (host says flipped, we say upright); then fall
    // * back to the full slerp so the flip state converges.
    let usedYawOnly = false;
    if (cfg.yawOnlyReconcile) {
      _reconcileUpPred.set(0, 1, 0).applyQuaternion(_reconcilePredQ);
      _reconcileUpAuth.set(0, 1, 0).applyQuaternion(_reconcileAuthQ);
      if (_reconcileUpPred.dot(_reconcileUpAuth) >= 0.6) {
        _reconcileFwdPred.set(0, 0, -1).applyQuaternion(_reconcilePredQ);
        _reconcileFwdAuth.set(0, 0, -1).applyQuaternion(_reconcileAuthQ);
        _reconcileFwdPred.y = 0;
        _reconcileFwdAuth.y = 0;
        // * Skip heading correction while either nose points near-vertical — the XZ
        // * projection degenerates and the yaw angle becomes noise.
        if (_reconcileFwdPred.lengthSq() > 1e-6 && _reconcileFwdAuth.lengthSq() > 1e-6) {
          _reconcileFwdPred.normalize();
          _reconcileFwdAuth.normalize();
          const cross = _reconcileFwdPred.x * _reconcileFwdAuth.z - _reconcileFwdPred.z * _reconcileFwdAuth.x;
          const dot = _reconcileFwdPred.dot(_reconcileFwdAuth);
          const yawErr = Math.atan2(-cross, dot); // signed heading error about +Y
          _reconcileYawQ.setFromAxisAngle(_reconcileYAxis, yawErr * rotAlpha);
          _reconcilePredQ.premultiply(_reconcileYawQ);
          cart.body.setRotation({
            x: _reconcilePredQ.x,
            y: _reconcilePredQ.y,
            z: _reconcilePredQ.z,
            w: _reconcilePredQ.w,
          }, true);
          usedYawOnly = true;
        }
      }
    }
    if (!usedYawOnly) {
      _reconcilePredQ.slerp(_reconcileAuthQ, rotAlpha);
      cart.body.setRotation({
        x: _reconcilePredQ.x,
        y: _reconcilePredQ.y,
        z: _reconcilePredQ.z,
        w: _reconcilePredQ.w,
      }, true);
    }
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

function applyCartsSnapshotToBodies(carts) {
  const allCarts = getAllCarts();
  if (!allCarts) return;
  for (let i = 0; i < allCarts.length; i++) {
    const cart = allCarts[i];
    const snap = getCartSnap(carts, i);
    if (!cart || !snap) continue;
    applyCartState(cart, snap, { interpolate: false });
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
function bufferAuthoritativeState(serverNowMs, seq, carts, epoch) {
  // * No epoch guard on append: MSG.state and MSG.hostMigrated share one WebSocket, so
  // * TCP ordering guarantees no pre-migration snapshot can arrive after host_migrated
  // * (which clears this buffer and bumps hostEpoch). The stored epoch exists for
  // * pruneNetStateBufferForEpoch, which sweeps entries after locally-driven epoch bumps
  // * (disconnect/reconnect) where ordering guarantees don't apply.
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(seq)) return;
  if (!carts || typeof carts !== "object") return;

  const last = netStateBuffer[netStateBuffer.length - 1];
  if (last && seq <= last.seq) return;

  netStateBuffer.push({ serverNowMs, seq, carts, epoch });
  while (netStateBuffer.length > CONFIG.net.stateBufferMaxSize) netStateBuffer.shift();
}

// --- Host / client send loops ---

/**
 * Replays one host collision FX event on non-host clients.
 *
 * @param {object} msg Collision payload (single or batched entry).
 * @param {object} callbacks Injected FX helpers from main.
 * @returns {void}
 */
function replayHostCollisionFx(msg, callbacks) {
  const intensity = typeof msg.intensity === "number" ? msg.intensity : 0;
  const mp = msg.midpoint;
  const slotB = typeof msg.slotB === "number" ? msg.slotB : 0;
  if (!mp || typeof mp.x !== "number") return;

  if (slotB === -1) {
    callbacks.playFloorImpactRef(intensity);
    if (GameState.getRoundState().phase === "running") {
      callbacks.spawnTrashBurstRef(mp, intensity, "floor");
    }
    return;
  }
  if (slotB === -2 || slotB === -3) {
    callbacks.playEdgeImpactRef(intensity);
    if (GameState.getRoundState().phase === "running") {
      callbacks.spawnTrashBurstRef(mp, intensity, "edge");
    }
    return;
  }

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

function stopHostSendLoop() {
  if (hostSendTimer) clearInterval(hostSendTimer);
  hostSendTimer = null;
  clearHostCollisionBatch();
}

function stopInputSendLoop() {
  if (inputSendTimer) clearInterval(inputSendTimer);
  inputSendTimer = null;
}

function stopKeepaliveLoop() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}

/**
 * Closes the PartyKit socket and clears authoritative networking state.
 * Safe to call when returning to the menu in-tab or before a new room join.
 */
export function disconnectPartySession() {
  _suppressRetry = true;
  stopHostSendLoop();
  stopInputSendLoop();
  stopKeepaliveLoop();
  clearHostCollisionBatch();

  if (partySocket) {
    try { partySocket.close(); } catch {}
    partySocket = null;
  }

  youConnId = null;
  hostId = null;
  isHost = false;
  hostSeq = 0;
  inputSeq = 0;
  hostEpoch += 1;
  serverClockOffsetMs = 0;
  serverClockOffsetSamples = 0;
  serverClockSamples = [];
  clockResyncDueAtMs = 0;
  clockResyncSamples = [];
  hostMigrationFreezeUntilMs = 0;
  skipNextPhysicsStep = false;

  netSlots = [];
  lastSlotsJson = "";
  lastSlotsServerMs = 0;
  netStateBuffer = [];
  lastCartsCache = null;
  remoteInputsByConnId = new Map();
  remoteNitroLatchedByConnId = new Map();
}

/**
 * Clears host/client send loops and authoritative snapshot state before a new socket session.
 * Called when replacing an existing PartyKit connection in {@link initNetcode}.
 */
function resetNetcodeReconnectState() {
  stopHostSendLoop();
  stopInputSendLoop();
  clearHostCollisionBatch();
  netStateBuffer = [];
  hostEpoch += 1;
  lastCartsCache = null;
}

/**
 * Assembles host-authoritative cart state into the 40Hz wire snapshot format.
 *
 * @param {object} c Cart entity.
 * @returns {object|null}
 */
export function serializeCartToWire(c) {
  if (!c?.body) return null;
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const t = c.body.translation();
  const r = c.body.rotation();
  const lv = c.body.linvel();
  const av = c.body.angvel();
  const isBoosting = Boolean(c.isRamBoosting || c._isBoosting || c.isBoosting);
  const isHopping = Boolean(c.isHopping || c._isHopping);

  return {
    p: [round3(t.x), round3(t.y), round3(t.z)],
    q: [round3(r.x), round3(r.y), round3(r.z), round3(r.w)],
    lv: [round3(lv.x), round3(lv.y), round3(lv.z)],
    av: [round3(av.x), round3(av.y), round3(av.z)],
    b: isBoosting,
    h: isHopping,
    c: c.cargoBay ? Boolean(c.cargoBay.visible) : true,
    s: Boolean(c.hasSpilled),
  };
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

    for (let i = 0; i < allCarts.length; i++) {
      const c = allCarts[i];
      if (c) carts[i] = serializeCartToWire(c);
    }

    lastCartsCache = carts;
    const collisions = drainHostCollisionBatch();
    const currentLevelId = (typeof localStorage !== "undefined" ? localStorage.getItem("cartRaveLevel") : null) || "classicRecord";
    const payload = {
      type: MSG.hostTransform,
      seq: hostSeq,
      levelId: currentLevelId,
      // * Host wall-clock stamp. The server ignores any client-supplied serverNowMs and
      // * stamps its own on the MSG.state rebroadcast; tHost is relayed for diagnostics.
      tHost: Date.now(),
      carts,
    };
    if (collisions.length > 0) {
      payload.collisions = collisions;
    }
    partySocket.send(JSON.stringify(payload));
  }, intervalMs);
}

export function startInputSendLoop() {
  stopInputSendLoop();
  if (!partySocket || isHost || !getAxisRef) return;

  let _lastSentForward = 0;
  let _lastSentTurn = 0;
  let _lastSentNitro = false;
  let _lastSentAt = 0;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.clientInputHz));
  inputSendTimer = setInterval(() => {
    if (!partySocket || isHost || !getAxisRef) return;

    const axis = getAxisRef();
    const now = Date.now();
    const forward = Number.isFinite(axis.forward) ? axis.forward : 0;
    const turn = Number.isFinite(axis.turn) ? axis.turn : 0;
    const nitroHeld = isNitroHeldRef ? isNitroHeldRef() : false;
    const hopRequested = consumeHopRequest();

    // * Suppress duplicate frames — send on axis change, nitro EDGE (press or release),
    // * hop, or the 100ms heartbeat. Nitro release must go out immediately: the host's
    // * charge-boost burst is proportional to hold time, so a heartbeat-delayed release
    // * would add up to 100ms of phantom charge. While held with nothing else changing,
    // * the heartbeat is enough — the host latches nitro from the last received input.
    const heartbeatMs = 100;
    const axisChanged = forward !== _lastSentForward || turn !== _lastSentTurn;
    const nitroChanged = nitroHeld !== _lastSentNitro;
    const heartbeatDue = now - _lastSentAt >= heartbeatMs;
    if (!axisChanged && !nitroChanged && !heartbeatDue && !hopRequested) return;

    inputSeq += 1;
    _lastSentForward = forward;
    _lastSentNitro = nitroHeld;
    _lastSentTurn = turn;
    _lastSentAt = now;

    partySocket.send(JSON.stringify({
      type: MSG.clientInput,
      seq: inputSeq,
      tClient: now,
      input: {
        throttle: forward,
        steer: turn,
        nitro: nitroHeld,
        hop: hopRequested,
      },
    }));
  }, intervalMs);
}

function startKeepaliveLoop() {
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
  _suppressRetry = false;
  callbacks.setLocalColorPicked(false);
  serverClockOffsetMs = 0;
  serverClockOffsetSamples = 0;
  serverClockSamples = [];
  clockResyncDueAtMs = 0;
  clockResyncSamples = [];
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

  if (modeAtConnect === "solo" || modeAtConnect === "testdrive") {
    youConnId = modeAtConnect === "testdrive" ? "local-testdrive-player" : "local-solo-player";
    hostId = youConnId;
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

    if (modeAtConnect === "testdrive") {
      netSlots = declashNpcSlotColors([
        { slotId: 0, kind: "human", connId: youConnId, name: savedUsername, color: colorToSend, lookHex },
        { slotId: 1, kind: "empty", connId: null, name: "", color: "blue" },
        { slotId: 2, kind: "empty", connId: null, name: "", color: "green" },
        { slotId: 3, kind: "empty", connId: null, name: "", color: "yellow" },
      ]);
    } else {
      const npcNames = callbacks.getInitialNpcNames();
      netSlots = declashNpcSlotColors([
        { slotId: 0, kind: "human", connId: youConnId, name: savedUsername, color: colorToSend, lookHex },
        { slotId: 1, kind: "npc", connId: null, name: npcNames[1], color: "blue" },
        { slotId: 2, kind: "npc", connId: null, name: npcNames[2], color: "green" },
        { slotId: 3, kind: "npc", connId: null, name: npcNames[3], color: "yellow" },
      ]);
    }

    callbacks.markFirstHelloReceived();
    const readyPromise = callbacks.ensureSessionReady();
    const safeReady = (/** @type {any} */ (readyPromise)) instanceof Promise ? readyPromise : Promise.resolve();

    safeReady.then(() => {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) {
        startHandler({ type: MSG.gameStart });
      }
    }).catch(() => {
      // * Fire game start even if cart bootstrap fails — prevents softlock.
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) {
        startHandler({ type: MSG.gameStart });
      }
    });
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
    party: "cart-rave-server",
    room: resolvedRoom,
  });

  let didSendJoin = false;
  let helloReceivedThisSession = false;
  let netcodeRetryScheduled = false;
  const scheduleNetcodeRetry = () => {
    if (netcodeRetryScheduled) return;

    const delay = helloReceivedThisSession
      ? 3000 + Math.random() * 2000
      : 400 + Math.random() * 600;

    netcodeRetryScheduled = true;
    setTimeout(() => {
      netcodeRetryScheduled = false;
      if (partySocket) return;
      initNetcode(roomOverride);
    }, delay);
  };

  partySocket.addEventListener("close", (ev) => {
    console.log("[netcode] Socket closed", {
      didSendJoin,
      helloReceivedThisSession,
      code: ev?.code,
      reason: ev?.reason,
    });
    if (helloReceivedThisSession) {
      console.log("[netcode] Socket closed after successful hello (will retry with backoff)");
    }
    if (_suppressRetry) return;
    if (didSendJoin && !helloReceivedThisSession) {
      try { callbacks.onJoinRejected(); } catch {}
    } else {
      try { scheduleNetcodeRetry(); } catch {}
    }
  });

  partySocket.addEventListener("error", () => {
    console.log("[netcode] Socket error", {
      didSendJoin,
      helloReceivedThisSession,
    });
    if (helloReceivedThisSession) {
      console.log("[netcode] Socket error after successful hello (will retry with backoff)");
    }
    if (_suppressRetry) return;
    if (didSendJoin && !helloReceivedThisSession) {
      try { callbacks.onJoinRejected(); } catch {}
    } else {
      try { scheduleNetcodeRetry(); } catch {}
    }
  });

  partySocket.addEventListener("open", () => {
    let savedUsername = (localStorage.getItem("cartRaveUsername") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      localStorage.setItem("cartRaveUsername", savedUsername);
    }
    console.log("[netcode] Sending MSG.join", { name: savedUsername, clientId });
    partySocket?.send(JSON.stringify({ type: MSG.join, name: savedUsername, clientId }));
    didSendJoin = true;
    sendColorPick(resolveServerColorPick());
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
      console.log("[netcode] Received MSG.hello", {
        youConnId: msg.youConnId,
        hostId: msg.hostId,
        levelId: msg.levelId,
        slotCount: msg.slots?.length,
        roundPhase: msg.round?.phase,
      });
      if (typeof msg.levelId === "string" && msg.levelId.trim() !== "") {
        try {
          localStorage.setItem("cartRaveLevel", msg.levelId.trim());
        } catch {}
      }
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
        if (msg.round.scores && typeof msg.round.scores === "object") {
          GameState.setRoundScores(msg.round.scores);
        }
        if (msg.round.endReason === "timer" || msg.round.endReason === "lastStanding" || msg.round.endReason == null) {
          GameState.setRoundEndReason(msg.round.endReason ?? null);
        }
      }
      if (GameState.getRoundState().phase === "running" && youConnId) {
        callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
      }
      callbacks.markFirstHelloReceived();
      try { callbacks.ensureSessionReady(); } catch {}

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
      clearHostCollisionBatch();
      remoteInputsByConnId.clear();
      remoteNitroLatchedByConnId.clear();
      inputSeq = 0;
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
      const serverMs = typeof msg.serverNowMs === "number" ? msg.serverNowMs : 0;
      if (serverMs < lastSlotsServerMs) return;
      // * Server slots are authoritative — accepted verbatim (a ghost-human guard once
      // * lived here; it was a no-op and slot takeover is handled server-side).
      const merged = declashNpcSlotColors(msg.slots);
      const incomingJson = JSON.stringify(merged);
      if (serverMs === lastSlotsServerMs && incomingJson === lastSlotsJson) return;
      lastSlotsServerMs = serverMs;
      lastSlotsJson = incomingJson;
      if (Array.isArray(merged)) {
        const newColors = merged.map((s) => (s?.color || ""));
        const oldColors = netSlots.map((s) => (s?.color || ""));
        const colorsChanged = newColors.some((c, i) => c !== oldColors[i]);
        const looksChanged = merged.some((s, i) => {
          const oldLook = netSlots[i]?.lookHex ?? null;
          const newLook = s?.lookHex ?? null;
          return oldLook !== newLook;
        });

        const kindsChanged = merged.some(
          (s, i) => (s?.kind ?? "") !== (netSlots[i]?.kind ?? ""),
        );
        const namesChanged = merged.some(
          (s, i) => (s?.name ?? "") !== (netSlots[i]?.name ?? ""),
        );

        if (isHost && Array.isArray(netSlots) && netSlots.length > 0) {
          for (let i = 0; i < merged.length; i += 1) {
            const wasNpc = netSlots[i]?.kind === "npc";
            const isHumanNow = merged[i]?.kind === "human";
            if (wasNpc && isHumanNow) {
              callbacks.teleportCartToSpawn?.(i);
            }
          }
        }

        const prevHadSlot = Boolean(
          youConnId && netSlots.some((s) => s && s.connId === youConnId),
        );

        netSlots = merged;

        const nowHasSlot = Boolean(
          youConnId && netSlots.some((s) => s && s.connId === youConnId),
        );
        if (!prevHadSlot && nowHasSlot) {
          setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));
          void Promise.resolve(callbacks.ensureSessionReady?.())
            .then(() => {
              if (!isHost) startInputSendLoop();
            })
            .catch((err) => {
              console.error("[netcode] ensureSessionReady failed during slot sync:", err);
              if (!isHost) startInputSendLoop();
            });
        }

        if (kindsChanged) {
          clearNpcCartCache();
        }

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

        if (callbacks.getLocalColorPicked() && youConnId) {
          const mySlot = merged.find((s) => s && s.connId === youConnId) || null;
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
        
        if (colorsChanged || looksChanged || kindsChanged || namesChanged) {
          callbacks.updateCartMaterialsFromSlots(merged);
        }
        if (colorsChanged || looksChanged || kindsChanged) {
          callbacks.updateHudColorsFromSlots(merged);
        }
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
          updateServerClockOffset(serverNowMs);
        }
        const seq = typeof msg.seq === "number" ? msg.seq : -1;
        bufferAuthoritativeState(serverNowMs, seq, msg.carts, hostEpoch);
        if (Array.isArray(msg.collisions)) {
          for (const ev of msg.collisions) {
            replayHostCollisionFx(ev, callbacks);
          }
        }
      }
      return;
    }

    if (type === MSG.hostEventCollision) {
      if (isHost) return;
      replayHostCollisionFx(msg, callbacks);
      return;
    }

    if (type === MSG.hostEventFall) {
      if (isHost) return;
      const toCssHex = (n) => typeof n === "number" ? '#' + n.toString(16).padStart(6, '0') : (n ?? null);
      const victimSlot = netSlots[msg.slotId];
      const targetName = victimSlot?.name || `P${(msg.slotId ?? 0) + 1}`;
      const targetColorHex = callbacks.colorHexForSlot(victimSlot);
      const targetColor = toCssHex(targetColorHex);
      if (msg.attackerSlot != null) {
        const attackerSlot = netSlots[msg.attackerSlot];
        const actorName = attackerSlot?.name || `P${msg.attackerSlot + 1}`;
        const actorColorHex = callbacks.colorHexForSlot(attackerSlot);
        const actorColor = toCssHex(actorColorHex);
        callbacks.addKillFeedEntry(actorName, actorColor, msg.verb || "RAMMED", targetName, targetColor, msg.comboTier, msg.comboMultiplier);

        const localSlotIdx = strictSlotIndexForConn(youConnId);
        if (msg.attackerSlot === localSlotIdx && msg.comboTier != null) {
          GameState.setLocalCombo(msg.comboTier, performance.now() + 5000);
        }
      } else {
        callbacks.addKillFeedEntry(null, null, msg.verb || "FELL OFF", targetName, targetColor);
      }
      // * Replay the shatter + explosion VFX on non-host clients so everyone sees
      // * the same death pop. The host triggers it locally in gameFlow.js.
      const slotIdx = typeof msg.slotId === "number" ? msg.slotId : null;
      if (slotIdx != null) {
        const carts = getAllCarts();
        const victimCart = carts?.[slotIdx];
        if (victimCart?.mesh) {
          const scene = callbacks.getSceneRef?.();
          if (scene) {
            const shatterFn = triggerCartShatterRef || callbacks.triggerCartShatterRef;
            let numericHex = 0xffffff;
            if (typeof targetColorHex === "number" && !Number.isNaN(targetColorHex)) {
              numericHex = targetColorHex & 0xffffff;
            } else if (typeof targetColorHex === "string") {
              const parsed = parseInt(targetColorHex.replace(/^#/, ""), 16);
              if (!Number.isNaN(parsed)) numericHex = parsed & 0xffffff;
            }
            shatterFn?.(victimCart, scene, numericHex);
          }
        }
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
        const prevPhase = GameState.getRoundState().phase;
        const newPhase = r.phase;
        if (typeof newPhase === "string" && prevPhase === "countdown" && newPhase === "lobby") {
          callbacks.onCountdownCancelled?.();
          GameState.setRoundCountdownStartedAtMs(0);
          GameState.setRoundStartedAtMs(0);
        }
        if (typeof newPhase === "string" && prevPhase === "podium" && newPhase === "lobby") {
          GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
          GameState.setRoundStartedAtMs(0);
          GameState.setRoundCountdownStartedAtMs(0);
          GameState.setRoundWinnerSlotIndex(null);
          GameState.setRoundEndReason(null);
          callbacks.onReturnToLobby?.();
        }
        if (typeof newPhase === "string" && prevPhase === "running" && newPhase === "podium") {
          callbacks.onEnterPodium?.();
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
        // * Non-host clients receive MSG.round to learn the countdown→running transition.
        // * The host calls endCinematicCountdown() directly in startRunningAt() (main.js),
        // * so this guard is the mirror for all other clients to exit cinematic camera mode.
        if (typeof newPhase === "string" && prevPhase === "countdown" && newPhase === "running") {
          callbacks.endCinematicCountdown?.();
        }
        // * Server now broadcasts levelId on every MSG.round. Non-host clients apply it
        // * so level selection stays in sync without needing a fresh MSG.hello on rematch.
        if (typeof msg.levelId === "string" && msg.levelId.trim() !== "") {
          const incoming = msg.levelId.trim();
          const stored = settingsStore.getState().selectedLevelId;
          if (incoming !== stored) {
            settingsStore.getState().setSelectedLevelId(incoming);
            callbacks.onLevelIdChanged?.(incoming);
          }
        }
        const state = GameState.getRoundState();
        GameState.setRoundPhase(r.phase ?? state.phase);
        GameState.setRoundStartedAtMs(r.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(r.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(r.winnerSlotIndex ?? null);
        if (r.endReason === "timer" || r.endReason === "lastStanding" || r.endReason == null) {
          GameState.setRoundEndReason(r.endReason ?? null);
        }
        if (r.scores && typeof r.scores === "object") GameState.setRoundScores(r.scores);
        if (typeof r.isSuddenDeath === "boolean") GameState.setSuddenDeath(r.isSuddenDeath);
      }
      return;
    }

    if (type === MSG.countdownCancel) {
      if (GameState.getRoundState().phase === "countdown") {
        callbacks.onCountdownCancelled?.();
        GameState.setRoundPhase("lobby");
        GameState.setRoundCountdownStartedAtMs(0);
        GameState.setRoundStartedAtMs(0);
      }
      return;
    }

    if (type === MSG.spill) {
      const carts = getAllCarts();
      const cart = carts?.[msg.slotId];

      // * Skip duplicate relay if local simulation already triggered VFX for this cart cycle.
      if (cart?.hasSpilled) return;

      if (cart) cart.hasSpilled = true;
      if (cart?.cargoBay && msg.cargoBay) cart.cargoBay.visible = false;

      const pos = (msg.pos && typeof msg.pos === "object") ? msg.pos : { x: 0, y: 0, z: 0 };
      const quat = (msg.quat && typeof msg.quat === "object") ? msg.quat : { x: 0, y: 0, z: 0, w: 1 };
      const vel = (msg.vel && typeof msg.vel === "object") ? msg.vel : { x: 0, y: 0, z: 0 };

      GroceryPool.triggerSpill(
        String(msg.slotId),
        pos,
        quat,
        vel,
        6,
      );
      return;
    }

    if (type === MSG.gameStart) {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) startHandler(msg);
      return;
    }
  });
}

/**
 * One-shot host transform broadcast outside the 40Hz loop.
 * Used by the rematch reset (entities.js) to push spawn poses to clients immediately,
 * before the running-phase send loop resumes. Skips collision draining on purpose.
 */
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
  const currentLevelId = settingsStore.getState().selectedLevelId || "classicRecord";
  partySocket.send(JSON.stringify({
    type: MSG.hostRound,
    levelId: currentLevelId,
    round: {
      phase: state.phase,
      startedAtMs: state.startedAtMs,
      countdownStartedAtMs: state.countdownStartedAtMs,
      winnerSlotIndex: state.winnerSlotIndex,
      endReason: state.endReason ?? null,
      scores: state.scores,
      isSuddenDeath: state.isSuddenDeath ?? false,
    },
  }));
}

export function sendPlayAgain() {
  if (partySocket && partySocket.readyState === 1) {
    partySocket.send(JSON.stringify({ type: MSG.playAgain }));
  }
}

function updateServerClockOffset(serverNowMs, nowMs = Date.now()) {
  if (typeof serverNowMs !== "number") return;
  const sample = nowMs - serverNowMs;
  if (serverClockOffsetSamples < 3) {
    // * Collect the first 3 samples and use their median as the baseline.
    // * A single bad first sample would otherwise poison the EWMA forever.
    serverClockSamples.push(sample);
    serverClockOffsetSamples += 1;
    if (serverClockOffsetSamples === 3) {
      const sorted = [...serverClockSamples].sort((a, b) => a - b);
      serverClockOffsetMs = sorted[1]; // median of 3
      serverClockSamples = []; // release the array
      clockResyncDueAtMs = nowMs + CONFIG.net.clockResyncIntervalMs;
    }
  } else if (clockResyncDueAtMs > 0 && nowMs >= clockResyncDueAtMs) {
    // * Periodic re-bootstrap: the EWMA below rejects >500ms outliers, so a slowly
    // * drifting client clock can pull the offset unbounded over a long session.
    // * Every resync interval, take a fresh 3-sample median and blend it 20% into
    // * the running estimate — enough to arrest drift without a visible timer jump.
    clockResyncSamples.push(sample);
    if (clockResyncSamples.length >= 3) {
      const sorted = [...clockResyncSamples].sort((a, b) => a - b);
      serverClockOffsetMs = serverClockOffsetMs * 0.8 + sorted[1] * 0.2;
      clockResyncSamples = [];
      clockResyncDueAtMs = nowMs + CONFIG.net.clockResyncIntervalMs;
    }
  } else {
    const isClockOutlier = Math.abs(sample - serverClockOffsetMs) > 500;
    if (!isClockOutlier) {
      serverClockOffsetMs += (sample - serverClockOffsetMs) * 0.1;
    }
  }
}

// === TEST HOOKS ===

/**
 * Internal seams for unit tests only — never imported by game code.
 * Exposes the private interpolation buffer so buffer/interp/reconcile math is testable
 * without a live socket. Kept minimal on purpose; do not reach for this in gameplay code.
 */
export const __netcodeTestHooks = {
  bufferState: (serverNowMs, seq, carts) => bufferAuthoritativeState(serverNowMs, seq, carts, hostEpoch),
  resetNetState: () => {
    netStateBuffer = [];
    lastCartsCache = null;
    serverClockOffsetMs = 0;
    serverClockOffsetSamples = 0;
    serverClockSamples = [];
    clockResyncDueAtMs = 0;
    clockResyncSamples = [];
  },
  getBufferLength: () => netStateBuffer.length,
  findSnapshotPair: (t) => findSnapshotPair(t),
  pruneConsumedSnapshots: (beforeIndex) => pruneConsumedSnapshots(beforeIndex),
  updateServerClockOffset: (serverNowMs, nowMs) => updateServerClockOffset(serverNowMs, nowMs),
  getServerClockOffset: () => serverClockOffsetMs,
  getClockResyncDueAtMs: () => clockResyncDueAtMs,
};