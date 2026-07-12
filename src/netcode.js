// netcode.js — partyserver + WebRTC networking, interpolation, host/client authority (extracted)

import PartySocket from "partysocket";
import * as THREE from "three";
import * as GameState from "./gameState.js";
import { CART_COLORS, CONFIG, MSG, PALETTE, WORKER_PUBLIC_HOST } from "./config.js";
import { loadPlayerCustomization, resolveServerColorPick } from "./customization.js";
import { consumeHopRequest } from "./input.js";
import { clearHostCollisionBatch, drainHostCollisionBatch } from "./hostCollisionBatch.js";
import { clearNpcCartCache, resetReconciliationState } from "./gameLoop.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { settingsStore } from "./stores/settingsStore.js";
import { isShatterAnimating } from "./cartShatter.js";
import * as P2P from "./netcode/p2p.js";
import { encodeHostStateSnapshot, decodeHostStateSnapshot } from "./netcode/binary.js";
import { rebuildKOEvent } from "./scoring/koEvent.js";
import { dispatchKOEvent } from "./scoring/koReactors.js";
import { ChallengeTracker } from "./stores/challengeStore.js";
import { UnlockTracker } from "./stores/unlockStore.js";
import { getCurrentLevelId } from "./levelManager.js";
import { announce } from "./announcer/announcerManager.js";
import { applyRemoteDirective, getDirectiveWireState } from "./directives/directiveEngine.js";
import { armSpillBoost } from "./cargoLoad.js";
import { clamp } from "./utils.js";

import { getRoundClockNowMs } from "./roundClock.js";

/** Same domain as round startedAtMs / server #serverNowMs (see roundClock.js). */
function getMonotonicNow() { return getRoundClockNowMs(); }

/** Scratch quaternions for snapshot-pair slerp interpolation (zero per-frame allocs). */
const _interpFromQ = new THREE.Quaternion();
const _interpToQ = new THREE.Quaternion();
/** Scratch output arrays for lerpVec3Pair/slerpQuatPair — callers must drain before the next call. */
const _lerpVec3Out = [0, 0, 0];
const _slerpQuatOut = [0, 0, 0, 0];
/** Scratch pair result for findSnapshotPair — callers must destructure/consume before the next call. */
const _snapshotPairScratch = { before: null, after: null, beforeIndex: -1 };
/** Scratch cart snapshot (extrapolation/passthrough/interpolation) — avoids a fresh object alloc per cart per frame. */
const _cartSnapScratch = { p: null, q: null, lv: null, av: null, b: undefined, h: undefined, c: undefined, s: undefined };
const _cartSnapPosOut = [0, 0, 0];

/** Copies a cart snapshot's fields into a scratch object (avoids a `{...snap}` alloc). */
function copyCartSnapIntoScratch(scratch, snap) {
  scratch.p = snap.p;
  scratch.q = snap.q;
  scratch.lv = snap.lv;
  scratch.av = snap.av;
  scratch.b = snap.b;
  scratch.h = snap.h;
  scratch.c = snap.c;
  scratch.s = snap.s;
  return scratch;
}

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
/** @type {"ok" | "reconnecting"} Coarse socket health surfaced to the HUD. */
let connectionState = "ok";
let isHost = false;

/**
 * Last room-authoritative arena id from hello / MSG.round / host_round we sent.
 * Prefer this over local settings when the host broadcasts so a promoted client
 * does not rewrite the room to their menu preference on rematch.
 * @type {string | null}
 */
let authoritativeRoomLevelId = null;

let hostSeq = 0;
let inputSeq = 0;
let hostEpoch = 0;

/**
 * Dual clock offsets (NET-CLK-1).
 * - Party offset: local round-clock − Party `serverNowMs` (hello / gameStart / keepalive / round).
 *   Used only to convert Worker lifecycle stamps (startsAtMs) into local round-clock.
 * - Host offset: local round-clock − host `tHost` (P2P snapshots).
 *   Used for snapshot interpolation and HUD remaining vs host-stamped startedAtMs.
 * Never feed both remotes into one EWMA — that is the countdown snap / timer fight bug.
 */
/** @type {{ offsetMs: number, samples: number, bootstrap: number[], resyncDueAtMs: number, resyncSamples: number[] }} */
const partyClock = { offsetMs: 0, samples: 0, bootstrap: [], resyncDueAtMs: 0, resyncSamples: [] };
/** @type {{ offsetMs: number, samples: number, bootstrap: number[], resyncDueAtMs: number, resyncSamples: number[] }} */
const hostClock = { offsetMs: 0, samples: 0, bootstrap: [], resyncDueAtMs: 0, resyncSamples: [] };

let lastCartsCache = null;
/**
 * Latest compact kill-credit / combo snapshot from the host transform tail (NET-MIG-1).
 * Non-hosts cache this every frame; a promoted host restores open hits + combos from it.
 * @type {{ h?: unknown[], s?: number[], c?: unknown[] } | null}
 */
let lastAttributionCache = null;
let netStateBuffer = [];

let remoteInputsByConnId = new Map();
/** @type {Map<string, Array<{ seq: number, throttle: number, steer: number, nitro: boolean, hop: boolean, t: number }>>} */
let remoteInputQueuesByConnId = new Map();
let remoteNitroLatchedByConnId = new Map();
let hostLastProcessedInputSeq = new Map();
export let pendingInputs = [];

let hostSendTimer = null;
let keepaliveTimer = null;

/** @type {Map<string, number>} connId → earliest monotonic ms we may re-offer WebRTC. */
let peerReconnectNotBeforeMs = new Map();

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
/** @type {((cart: object) => void) | null} Entities.doRespawn — local respawn (shatter teardown + visual rebuild + transient reset). */
let doRespawnRef = null;

let netSlots = [];
let lastSlotsJson = "";
let lastSlotsServerMs = 0;

let pendingHostFallEvents = [];

export function queueHostFallEvent(eventData) {
  pendingHostFallEvents.push(eventData);
}

function drainHostFallBatch() {
  const batch = pendingHostFallEvents;
  pendingHostFallEvents = [];
  return batch;
}




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
  triggerLocalHitTakenRef: (_intensity, _isBoosting, _hitFromX, _hitFromZ) => {},
  // * Remote-cart boost start (rising edge from host snapshots) — attenuated SFX + pulse.
  onRemoteBoostStart: (cart) => {},
  // * Impact squash replay — (rammerCart|null, victimCart, intensity) per collision event.
  onCartImpactSquashRef: (rammerCart, victimCart, intensity) => {},
  playFloorImpactRef: (intensity) => {},
  playEdgeImpactRef: (intensity) => {},
  triggerCartShatterRef: (cart, scene, hex) => {},
  getSceneRef: () => null,

  // Kill feed
  addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier) => {},
  // * Presentation-only hook — fired when the LOCAL player's ram sent a victim into
  // * the void (host fires it from gameFlow; non-host from the falls[] replay path).
  // * The optional third arg is the full KO Event (reward breakdown for the score float).
  onLocalKillConfirm: (victimSlotIndex, comboTier, koEvent) => {},
  // * Arena light flash — every fall on every peer (club reacts to the KO).
  onArenaKoFlash: (koEvent) => {},
  // * Presentation-only observer hook for the announcer director — fired for EVERY fall
  // * (host fires it from gameFlow; non-host from this falls[] replay path).
  onAnnouncerFall: (fall) => {},
  // * Living Store Spill Bonus presentation (MSG.spillBonus) — feed/float only.
  onSpillBonusPresentation: (_msg) => {},
  /**
   * * Wired implementations may return either a numeric hex (0xff00ff) or a CSS
   * * hex string ("#ff00ff") — the host_event_fall handler narrows on typeof.
   * @type {(slot: object | null | undefined) => number | string}
   */
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
  // * Host optimistic podium rejected by server — tear down results/cam and resume running.
  onPodiumRejected: () => {},

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
    triggerLocalHitTakenRef: (intensity, isBoosting, hitFromX, hitFromZ) => {
      deps.getTriggerLocalHitTaken?.()?.(intensity, isBoosting, hitFromX, hitFromZ);
    },
    onRemoteBoostStart: (cart) => deps.onRemoteBoostStart?.(cart),
    onCartImpactSquashRef: (rammerCart, victimCart, intensity) => {
      deps.onCartImpactSquash?.(rammerCart, victimCart, intensity);
    },
    triggerCartShatterRef: (cart, scene, neonHex) => {
      deps.getTriggerCartShatterRef?.()?.(cart, scene, neonHex);
    },
    getSceneRef: () => deps.getSceneRef?.() ?? null,
    addKillFeedEntry: (actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier) => {
      const hud = deps.getHud();
      if (hud && hud.addKillFeedEntry) hud.addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor, comboTier, comboMultiplier);
    },
    onLocalKillConfirm: (victimSlotIndex, comboTier, koEvent) => deps.onLocalKillConfirm?.(victimSlotIndex, comboTier, koEvent),
    onArenaKoFlash: (koEvent) => deps.onArenaKoFlash?.(koEvent),
    onAnnouncerFall: (fall) => deps.onAnnouncerFall?.(fall),
    onSpillBonusPresentation: (msg) => deps.onSpillBonusPresentation?.(msg),
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
    onPodiumRejected: () => deps.onPodiumRejected?.(),
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
  if (refs.doRespawnRef !== undefined) doRespawnRef = refs.doRespawnRef;
}

export function getYouConnId() { return youConnId; }
export function getIsHost() { return isHost; }
export function getHostId() { return hostId; }
export function getNetSlots() { return netSlots; }
/** Coarse socket health for the HUD: "ok" | "reconnecting". */
export function getConnectionState() { return connectionState; }
/**
 * Returns the host-side remote input map after draining the jitter buffer.
 * Simulation should call this once per physics substep (gameLoop already does).
 * @returns {Map<string, { throttle: number, steer: number, nitro: boolean }>}
 */
export function getRemoteInputsByConnId() {
  drainRemoteInputJitterBuffers();
  return remoteInputsByConnId;
}

/**
 * Clears client prediction / reconciliation state so a new host epoch or rematch
 * cannot leave the seq gate permanently closed or replay stale inputs.
 */
export function resetClientPredictionState() {
  pendingInputs = [];
  netStateBuffer = [];
  resetReconciliationState();
}
export function getHostMigrationFreezeUntilMs() { return hostMigrationFreezeUntilMs; }
/** Host (P2P) clock offset — local − tHost. Prefer {@link getHostClockOffsetMs}. */
export function getServerClockOffsetMs() { return hostClock.offsetMs; }
/** Host (sim peer) clock offset: local round-clock − host tHost. */
export function getHostClockOffsetMs() { return hostClock.offsetMs; }
/** Party (Worker) clock offset: local round-clock − Party serverNowMs. */
export function getPartyClockOffsetMs() { return partyClock.offsetMs; }
export function getSkipNextPhysicsStep() { return skipNextPhysicsStep; }
export function setSkipNextPhysicsStep(val) { skipNextPhysicsStep = val; }
export function getPartySocket() { return partySocket; }

// * Public integration getters — main.js / gameLoop bridge only need these timer checks.
export function getHostSendTimer() { return hostSendTimer; }

// === CONNECTION & SOCKET ===

// * Local dev vs production Worker host — internal to initNetcode only.
function partyHostFromWindowLocation() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  return isLocal ? `${hostname}:8787` : WORKER_PUBLIC_HOST;
}

export function resolvedPartyRoomFromUrl() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  return /^[A-Za-z0-9]{2,16}$/.test(raw) ? raw : "quickplay";
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

/** Host-clock time used for interpolating authoritative snapshots on non-host clients. */
function getInterpTargetServerNowMs() {
  return getMonotonicNow() - hostClock.offsetMs - CONFIG.net.interpBufferMs;
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
  // * Shared scratch — every call site destructures before/after synchronously and never
  // * holds two live results at once, so reuse is safe (see netcode.js audit notes).
  _snapshotPairScratch.before = beforeIndex >= 0 ? netStateBuffer[beforeIndex] : null;
  _snapshotPairScratch.after = afterIndex >= 0 ? netStateBuffer[afterIndex] : null;
  _snapshotPairScratch.beforeIndex = beforeIndex;
  return _snapshotPairScratch;
}

export function applySnapshotToCartBody(cart, snap) {
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

/**
 * Lerps two vec3 snapshot arrays at alpha. Returns null unless BOTH are length-3 arrays,
 * so each caller keeps its own single-endpoint fallback rule.
 */
function lerpVec3Pair(b, a, alpha) {
  if (Array.isArray(b) && b.length === 3 && Array.isArray(a) && a.length === 3) {
    // * Shared scratch — callers drain the array (copy into a Vector3/plain snapshot) before
    // * the next lerpVec3Pair call, so reuse across carts/frames is safe.
    _lerpVec3Out[0] = b[0] + (a[0] - b[0]) * alpha;
    _lerpVec3Out[1] = b[1] + (a[1] - b[1]) * alpha;
    _lerpVec3Out[2] = b[2] + (a[2] - b[2]) * alpha;
    return _lerpVec3Out;
  }
  return null;
}

/**
 * Slerps two quaternion snapshot arrays at alpha via the module scratch quaternions.
 * Returns null unless BOTH are length-4 arrays (callers own the single-endpoint fallback).
 */
function slerpQuatPair(b, a, alpha) {
  if (Array.isArray(b) && b.length === 4 && Array.isArray(a) && a.length === 4) {
    _interpFromQ.set(b[0], b[1], b[2], b[3]);
    _interpToQ.set(a[0], a[1], a[2], a[3]);
    _interpFromQ.slerp(_interpToQ, alpha);
    // * Shared scratch — callers drain the array before the next slerpQuatPair call.
    _slerpQuatOut[0] = _interpFromQ.x;
    _slerpQuatOut[1] = _interpFromQ.y;
    _slerpQuatOut[2] = _interpFromQ.z;
    _slerpQuatOut[3] = _interpFromQ.w;
    return _slerpQuatOut;
  }
  return null;
}

function sampleCartSnapshotFromPair(before, after, alpha, slotIndex) {
  const b = getCartSnap(before?.carts, slotIndex);
  const a = getCartSnap(after?.carts, slotIndex);
  if (!b && !a) return null;
  if (b && a) {
    const out = { p: null, q: null, lv: null, av: null };
    out.p = lerpVec3Pair(b.p, a.p, alpha)
      ?? (Array.isArray(b.p) && b.p.length === 3 ? [b.p[0], b.p[1], b.p[2]] : null);
    out.q = slerpQuatPair(b.q, a.q, alpha)
      ?? (Array.isArray(b.q) && b.q.length === 4 ? [b.q[0], b.q[1], b.q[2], b.q[3]] : null);
    if (Array.isArray(a.lv) && a.lv.length === 3) out.lv = [a.lv[0], a.lv[1], a.lv[2]];
    if (Array.isArray(a.av) && a.av.length === 3) out.av = [a.av[0], a.av[1], a.av[2]];
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

/**
 * Samples host-authoritative cart state from the snapshot buffer for a slot index.
 *
 * @param {number} slotIndex
 * @param {number} [customTargetServerNowMs]
 * @returns {object|null}
 */
export function sampleAuthoritativeCartState(slotIndex, customTargetServerNowMs) {
  const targetServerNowMs = customTargetServerNowMs ?? getInterpTargetServerNowMs();
  const { before, after } = findSnapshotPair(targetServerNowMs);

  if (before && after) {
    const denom = (after.serverNowMs - before.serverNowMs) || 1;
    const alpha = clamp((targetServerNowMs - before.serverNowMs) / denom, 0, 1);
    return sampleCartSnapshotFromPair(before, after, alpha, slotIndex);
  }

  if (before && before.carts) {
    const b = getCartSnap(before.carts, slotIndex);
    if (!b) return null;
    const bp = b.p;
    const blv = b.lv;
    const extrapMs = targetServerNowMs - before.serverNowMs;
    const extrapS = Math.min(extrapMs, CONFIG.net.extrapolationCapMs) / 1000;

    // * Shared extrapolation scratch — caller (gameLoop) drains fields into the local cart's
    // * body synchronously before the next sampleAuthoritativeCartState/updateRemoteCartNetTargets call.
    copyCartSnapIntoScratch(_cartSnapScratch, b);
    if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
      _cartSnapPosOut[0] = bp[0] + blv[0] * extrapS;
      _cartSnapPosOut[1] = bp[1] + blv[1] * extrapS;
      _cartSnapPosOut[2] = bp[2] + blv[2] * extrapS;
      _cartSnapScratch.p = _cartSnapPosOut;
    }
    return _cartSnapScratch;
  }

  if (after && after.carts) {
    const a = getCartSnap(after.carts, slotIndex);
    return a ? copyCartSnapIntoScratch(_cartSnapScratch, a) : null;
  }

  if (lastCartsCache && lastCartsCache[slotIndex]) {
    return copyCartSnapIntoScratch(_cartSnapScratch, lastCartsCache[slotIndex]);
  }

  return null;
}

/** Writes interpolated snapshot fields directly onto cart net targets (shared pair lerp/slerp). */
function writeInterpolatedRemoteTargets(cart, b, a, alpha) {
  const p = lerpVec3Pair(b.p, a.p, alpha) ?? a.p ?? b.p;
  const q = slerpQuatPair(b.q, a.q, alpha) ?? a.q ?? b.q;

  // * Shared cart-snap scratch — applyCartState drains it into cart._netTarget* synchronously
  // * before the loop in updateRemoteCartNetTargets moves to the next remote cart.
  _cartSnapScratch.p = p;
  _cartSnapScratch.q = q;
  _cartSnapScratch.lv = a.lv ?? b.lv;
  _cartSnapScratch.av = a.av ?? b.av;
  _cartSnapScratch.b = a.b ?? b.b;
  _cartSnapScratch.h = a.h ?? b.h;
  _cartSnapScratch.c = a.c ?? b.c;
  _cartSnapScratch.s = a.s ?? b.s;

  applyCartState(cart, _cartSnapScratch, { interpolate: true });
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
      if (Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) {
        cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
      }
      if (Array.isArray(q) && q.length === 4 && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]) && Number.isFinite(q[3])) {
        cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
      }
      if (Array.isArray(lv) && lv.length === 3 && Number.isFinite(lv[0]) && Number.isFinite(lv[1]) && Number.isFinite(lv[2])) {
        cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
      }
    }
    // * Keep interpolation targets in lockstep with direct body snaps.
    if (Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && cart._netTargetPos) {
      cart._netTargetPos.set(p[0], p[1], p[2]);
    }
    if (Array.isArray(q) && q.length === 4 && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]) && Number.isFinite(q[3]) && cart._netTargetQuat) {
      cart._netTargetQuat.set(q[0], q[1], q[2], q[3]);
    }
  }

  if (Array.isArray(lv) && lv.length === 3 && Number.isFinite(lv[0]) && Number.isFinite(lv[1]) && Number.isFinite(lv[2]) && cart._lastNetLinvel) {
    cart._lastNetLinvel.x = lv[0];
    cart._lastNetLinvel.y = lv[1];
    cart._lastNetLinvel.z = lv[2];
  }
  if (Array.isArray(av) && av.length === 3 && Number.isFinite(av[0]) && Number.isFinite(av[1]) && Number.isFinite(av[2]) && cart.body) {
    cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
  }

  if (snap.b) {
    // * Continuously extend the timer while the host holds the nitro button.
    // * This prevents the VFX from cutting out if the host holds it longer than durationSec.
    cart.ramBoostActiveUntilMs = performance.now() + 150;
  }
  // * Rising-edge boost FX for remote carts (non-host clients only reach this path).
  // * Guarded to running phase so migration/hello snapshot replays stay silent, and to
  // * non-local slots so a stale self-snapshot can't double the owner's own boost FX.
  if (snap.b && !cart._prevRemoteBoosting
    && GameState.getRoundState().phase === "running"
    && cart.slotIndex !== strictSlotIndexForConn(youConnId)) {
    callbacks.onRemoteBoostStart(cart);
  }
  cart.isRamBoosting = snap.b;
  cart.isBoosting = snap.b;
  cart._prevRemoteBoosting = Boolean(snap.b);

  if (snap.h && !cart._prevRemoteHopping) {
    if (triggerHopRef) triggerHopRef(cart, performance.now());
  }
  cart._prevRemoteHopping = Boolean(snap.h);

  if (typeof snap.c === "boolean" && cart.cargoBay) {
    // Only update visibility if the cart has NOT spilled locally.
    // Once spilled, the local VFX manages visibility until respawn.
    if (!cart.hasSpilled) {
      cart.cargoBay.visible = snap.c;
    } else if (snap.s === false) {
      // Host says cart respawned (s: false), sync visibility back to true
      cart.hasSpilled = false;
      cart.cargoBay.visible = true;
    }
  }

  if (typeof snap.s === "boolean") {
    cart.hasSpilled = snap.s;
    // * Host-authoritative spill flag: if the cart has spilled, basket cargo must go.
    if (snap.s) GroceryPool.hideCargoBay(cart);
    else if (cart.cargoBay) cart.cargoBay.visible = true;
    // * Respawn teardown: the host says the cart is alive again and the death VFX has
    // * run its course — run the same local respawn as the host (cleanupShatter +
    // * visual rebuild + transient reset). While the animation is still playing, an
    // * s:false snapshot is stale pre-death state (host_event_fall applies immediately
    // * while transforms drain through the interp buffer); the shatter's own lifetime,
    // * not this network flag, decides when the VFX ends.
    if (!snap.s && cart._shatterState && !isShatterAnimating(cart, performance.now())) {
      doRespawnRef?.(cart);
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

      // * Shared extrapolation scratch — applyCartState drains it into the cart's net targets
      // * synchronously before the loop moves to the next remote cart.
      copyCartSnapIntoScratch(_cartSnapScratch, b);
      if (Array.isArray(bp) && bp.length === 3 && Array.isArray(blv) && blv.length === 3) {
        _cartSnapPosOut[0] = bp[0] + blv[0] * extrapS;
        _cartSnapPosOut[1] = bp[1] + blv[1] * extrapS;
        _cartSnapPosOut[2] = bp[2] + blv[2] * extrapS;
        _cartSnapScratch.p = _cartSnapPosOut;
      }
      applyCartState(cart, _cartSnapScratch, { interpolate: true });
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
    const cart = allCarts[slotIndex];
    if (!cart) continue;
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
// * Client-side reconciliation now lives inline in gameLoop.js (rewind-and-replay against the
// * latest binary host snapshot). netcode exposes the snapshot buffer helpers it consumes.

/**
 * Hard-applies each host-authoritative cart snapshot to its Rapier body (no interpolation).
 * Used on host promotion to seed bodies from the last cached snapshot.
 *
 * @param {Array<object>|Record<string, object>} carts Per-slot transform snapshot.
 */
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
  // * Host snapshots now travel over unordered/unreliable WebRTC while MSG.hostMigrated
  // * travels over the WebSocket — there is no cross-transport ordering guarantee. A
  // * stale pre-migration snapshot is instead rejected at the source in handleP2PMessage
  // * (fromConnId !== hostId), so it never reaches this append. The stored epoch backs
  // * pruneNetStateBufferForEpoch for locally-driven epoch bumps (disconnect/reconnect).
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

  const carts = getAllCarts();

  if (slotB === -1) {
    callbacks.playFloorImpactRef(intensity);
    if (GameState.getRoundState().phase === "running") {
      callbacks.spawnTrashBurstRef(mp, intensity, "floor");
      const floorCart = typeof msg.slotA === "number" ? carts?.[msg.slotA] : null;
      if (floorCart) callbacks.onCartImpactSquashRef(null, floorCart, intensity);
    }
    return;
  }
  if (slotB === -2 || slotB === -3) {
    callbacks.playEdgeImpactRef(intensity);
    if (GameState.getRoundState().phase === "running") {
      callbacks.spawnTrashBurstRef(mp, intensity, "edge");
      const edgeCart = typeof msg.slotA === "number" ? carts?.[msg.slotA] : null;
      if (edgeCart) callbacks.onCartImpactSquashRef(null, edgeCart, intensity);
    }
    return;
  }

  const isBoosting = Boolean(msg.isBoosting);
  callbacks.playCollisionRef(intensity, { isBoosting });
  if (GameState.getRoundState().phase === "running") {
    callbacks.spawnTrashBurstRef(mp, intensity, "cart", { isBoosting });
    // * slotB is always the victim slot (simulation queues slotA=rammer, slotB=victim).
    const rammerCart = typeof msg.rammerSlot === "number" ? carts?.[msg.rammerSlot] : null;
    const victimCart = carts?.[slotB] ?? null;
    if (rammerCart || victimCart) callbacks.onCartImpactSquashRef(rammerCart, victimCart, intensity);
  }
  const localSlot = strictSlotIndexForConn(youConnId);
  if (typeof msg.rammerSlot === "number" && msg.rammerSlot === localSlot) {
    callbacks.triggerLocalRamShakeRef(intensity, isBoosting);
  } else if (localSlot >= 0 && slotB === localSlot) {
    // * Hit-from direction for the directional vignette — attacker relative to local cart.
    let hitFromX = 0;
    let hitFromZ = 0;
    const rammerCart = typeof msg.rammerSlot === "number" ? carts?.[msg.rammerSlot] : null;
    const victimCart = carts?.[slotB];
    if (rammerCart?.body && victimCart?.body) {
      const rp = rammerCart.body.translation();
      const vp = victimCart.body.translation();
      hitFromX = rp.x - vp.x;
      hitFromZ = rp.z - vp.z;
    }
    callbacks.triggerLocalHitTakenRef(intensity, isBoosting, hitFromX, hitFromZ);
  }
}

function processHostFallEvent(msg) {
  if (isHost) return;
  const toCssHex = (n) => typeof n === "number" ? '#' + n.toString(16).padStart(6, '0') : (n ?? null);

  // * Non-hosts don't run buildKOEvent — rebuild the KO Event from the wire fall record and run
  // * the SAME reactors the host runs in gameFlow (kill feed, announcer, local kill-confirm, local
  // * challenges). Victim classification is recomputed from this client's own slots/carts.
  const koEvent = rebuildKOEvent(msg, { getNetSlots: () => netSlots, getAllCarts });
  const localSlotIdx = strictSlotIndexForConn(youConnId);

  // * Client-side combo UI pulse for the local attacker (the host sets this inside buildKOEvent;
  // * non-hosts mirror it here from the wire combo tier). Kept out of the reactors — it's a
  // * client-only store poke, not part of the shared fan-out.
  if (koEvent.isKill && koEvent.attackerSlotIndex === localSlotIdx && msg.comboTier != null) {
    GameState.setLocalCombo(msg.comboTier, performance.now() + 5000);
  }

  // * challengeReactor now records the LOCAL player's own kills on non-hosts too (each device
  // * counts only kills where attacker === its local slot, so no double-counting with the host).
  dispatchKOEvent(koEvent, {
    netSlots,
    localSlotIndex: localSlotIdx,
    hud: { addKillFeedEntry: callbacks.addKillFeedEntry, colorHexToCss: toCssHex },
    colorHexForSlot: callbacks.colorHexForSlot,
    onAnnouncerFall: callbacks.onAnnouncerFall,
    onLocalKillConfirm: callbacks.onLocalKillConfirm,
    onArenaKoFlash: callbacks.onArenaKoFlash,
    recordChallenge: ChallengeTracker.record,
    getLevelId: () => getCurrentLevelId(),
    recordKillOnLevel: UnlockTracker.recordKillOnLevel,
  });

  // * Replay the shatter + explosion VFX on non-host clients so everyone sees the same death pop.
  // * The host triggers it locally in gameFlow.js; kept out of the reactors (client-only VFX).
  const slotIdx = typeof msg.slotId === "number" ? msg.slotId : null;
  if (slotIdx != null) {
    const carts = getAllCarts();
    const victimCart = carts?.[slotIdx];
    if (victimCart?.mesh) {
      const scene = callbacks.getSceneRef?.();
      if (scene) {
        const shatterFn = triggerCartShatterRef || callbacks.triggerCartShatterRef;
        const targetColorHex = callbacks.colorHexForSlot(netSlots[slotIdx]);
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
}

function stopHostSendLoop() {
  if (hostSendTimer) clearInterval(hostSendTimer);
  hostSendTimer = null;
  clearHostCollisionBatch();
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
  stopKeepaliveLoop();
  clearHostCollisionBatch();
  // * Tear down WebRTC peers/DataChannels so menu return does not leak old
  // * onmessage/ICE handlers or keep background peer objects alive.
  P2P.closeAllConnections();
  peerReconnectNotBeforeMs.clear();

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
  resetClockState(partyClock);
  resetClockState(hostClock);
  hostMigrationFreezeUntilMs = 0;
  skipNextPhysicsStep = false;

  netSlots = [];
  lastSlotsJson = "";
  lastSlotsServerMs = 0;
  netStateBuffer = [];
  lastCartsCache = null;
  lastAttributionCache = null;
  remoteInputsByConnId = new Map();
  remoteInputQueuesByConnId = new Map();
  remoteNitroLatchedByConnId = new Map();
  hostLastProcessedInputSeq = new Map();
  pendingInputs = [];
  resetReconciliationState();
}

/**
 * Clears host/client send loops and authoritative snapshot state before a new socket session.
 * Called when replacing an existing PartyKit connection in {@link initNetcode}.
 */
function resetNetcodeReconnectState() {
  stopHostSendLoop();
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
  // * Hop has no persistent flag — derive from trigger-time freshness (triggerHop stamps
  // * lastHopAtMs) so snapshots can't miss the rising edge; same window trick as snap.b.
  const isHopping = performance.now() - (c.lastHopAtMs || 0) < 150;

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
      if (c) {
        const serialized = serializeCartToWire(c);
        if (serialized) {
          const slot = netSlots[i];
          const connId = slot?.connId;
          serialized.ackSeq = connId ? (hostLastProcessedInputSeq.get(connId) || 0) : 0;
          carts[i] = serialized;
        }
      }
    }

    lastCartsCache = carts;
    const collisions = drainHostCollisionBatch();
    const falls = drainHostFallBatch();
    // * Read the store instead of localStorage — this fires at hostSendHz (~40Hz) and
    // * settingsStore.selectedLevelId is already kept in sync with the persisted level
    // * (see cart-rave-menu.js persistLevel / adoptAuthoritativeRoomLevel below).
    // * tHost drives hostClock only (NET-CLK-1) — never the Party offset EWMA.
    const currentLevelId = settingsStore.getState().selectedLevelId || "classicRecord";
    const tHost = getMonotonicNow();
    const payload = {
      type: MSG.hostTransform,
      seq: hostSeq,
      levelId: currentLevelId,
      // * Host monotonic clock stamp; non-host clients use it to drive snapshot
      // * interpolation and estimate the host<->client clock offset (NET-CLK-1).
      tHost,
      carts,
    };
    if (collisions.length > 0) {
      payload.collisions = collisions;
    }
    if (falls.length > 0) {
      payload.falls = falls;
    }
    // * Active Living Store directive rides every snapshot — self-heal for a lost
    // * one-shot MSG.directive and the catch-up path for mid-window joiners.
    const dir = getDirectiveWireState();
    if (dir) {
      payload.dir = dir;
    }
    // * Open kill credit + combos for host migration (NET-MIG-1) — ages vs tHost.
    const attr = buildAttributionWire(tHost);
    if (attr) {
      payload.attr = attr;
    }
    const binaryPayload = encodeHostStateSnapshot(payload);
    P2P.sendToAll(binaryPayload);
  }, intervalMs);
}

export function sampleLocalInputForTick() {
  if (!partySocket || isHost || !getAxisRef) return null;

  const axis = getAxisRef();
  const forward = Number.isFinite(axis.forward) ? axis.forward : 0;
  const turn = Number.isFinite(axis.turn) ? axis.turn : 0;
  const nitroHeld = isNitroHeldRef ? isNitroHeldRef() : false;
  const hopRequested = consumeHopRequest();

  inputSeq += 1;

  const inputFrame = {
    throttle: forward,
    steer: turn,
    nitro: nitroHeld,
    hop: hopRequested,
  };

  const nowMs = performance.now();
  pendingInputs.push({
    seq: inputSeq,
    input: inputFrame,
    tClient: nowMs,
  });
  // * Cap prediction history so a stalled snapshot stream (ICE grace, host tab
  // * freeze, migration gap) cannot grow this list without bound. Drop oldest —
  // * on recovery, reconcile replays only the recent window (same as a long lag spike).
  const pendingMax = CONFIG.net.predictionPendingInputsMax ?? 120;
  while (pendingInputs.length > pendingMax) {
    pendingInputs.shift();
  }

  if (hostId) {
    P2P.sendToPeer(hostId, {
      type: MSG.clientInput,
      seq: inputSeq,
      tClient: nowMs,
      input: inputFrame,
    });
  }

  return inputFrame;
}

function startKeepaliveLoop() {
  stopKeepaliveLoop();
  if (!partySocket) return;

  keepaliveTimer = setInterval(() => {
    if (partySocket) {
      partySocket.send(JSON.stringify({ type: MSG.keepalive, tClient: getMonotonicNow() }));
    }
    // * Mid-match WebRTC recovery: slots only re-offer on join/migration; ICE/DC
    // * death otherwise leaves humans frozen despite a live PartyKit socket.
    maintainHostPeerConnections();
  }, CONFIG.net.keepaliveIntervalMs);
}

/**
 * Switches between host and client networking roles.
 * Starts/stops the host send loop, clears buffers on host promotion, and applies cached
 * snapshots. Non-host input is sampled inline by the physics loop (sampleLocalInputForTick),
 * so there is no separate client send loop to manage here.
 *
 * @param {boolean} nextIsHost True when this client becomes (or remains) the room host.
 */
export function setAuthorityMode(nextIsHost) {
  const becomingHost = nextIsHost && !isHost;
  isHost = Boolean(nextIsHost);

  if (becomingHost) {
    consumeHopRequest();
    netStateBuffer = [];
    hostSeq = 0;
    inputSeq = 0;
    remoteInputsByConnId.clear();
    remoteInputQueuesByConnId.clear();
    remoteNitroLatchedByConnId.clear();
    hostLastProcessedInputSeq.clear();
    pendingInputs = [];
    resetReconciliationState();

    if (lastCartsCache) applyCartsSnapshotToBodies(lastCartsCache);
    resetSimTimingRef?.current?.();
    skipNextPhysicsStep = true;

    for (const cart of getAllCarts() || []) cart.body?.wakeUp?.();
    startHostSendLoop();
    return;
  }

  if (isHost) {
    if (!hostSendTimer) startHostSendLoop();
  } else {
    stopHostSendLoop();
  }
}

export function strictSlotIndexForConn(connId) {
  if (!connId) return -1;
  return netSlots.findIndex((s) => s && s.connId === connId);
}

/**
 * Host-only: opens a WebRTC offer to every other human peer we aren't yet connected to.
 *
 * The P2P design makes the host the offerer ("Host creates a DataChannel per non-host peer" —
 * docs/ROADMAP.md); `initiateP2PConnection` is host-gated and the non-host answers via
 * `handleSignalingMessage`. Previously the only callers were on the non-host side, where the
 * host guard made them no-ops, so no offer was ever created and the DataChannel never opened.
 *
 * The server rebroadcasts MSG.slots on every join and on host departure, so calling this from
 * the slots handler establishes connections to new peers and, after migration, from the new
 * host to all surviving peers. `initiateP2PConnection` is idempotent (skips existing peers),
 * so repeated calls are safe. Non-hosts return early.
 *
 * Offers wait on {@link P2P.waitForIceServers} so TURN credentials can land first.
 */
function ensureHostPeerConnections() {
  if (!isHost || !youConnId) return;
  for (const slot of netSlots) {
    if (slot && slot.kind === "human" && slot.connId && slot.connId !== youConnId) {
      P2P.initiateP2PConnection(slot.connId).catch((e) => {
        console.warn("[netcode] P2P offer failed (will retry via maintain loop)", e);
      });
    }
  }
}

/**
 * Host-only: re-offer WebRTC to human peers whose DataChannel/ICE is dead or missing.
 *
 * Unlike {@link ensureHostPeerConnections}, this tears down half-dead peers first so
 * `initiateP2PConnection` is not stuck behind a zombie PC entry. Rate-limited per peer.
 * Skips ICE "disconnected" (grace recovery) and short-lived negotiations.
 */
function maintainHostPeerConnections() {
  if (!isHost || !youConnId) return;

  const now = getMonotonicNow();
  const cooldownMs = CONFIG.net.p2pReconnectCooldownMs ?? 3000;
  const connectingTimeoutMs = CONFIG.net.p2pConnectingTimeoutMs ?? 10000;

  for (const slot of netSlots) {
    if (!slot || slot.kind !== "human" || !slot.connId || slot.connId === youConnId) continue;
    const connId = slot.connId;
    const health = P2P.getPeerHealth(connId);

    if (health.ok) {
      peerReconnectNotBeforeMs.delete(connId);
      continue;
    }
    // * Let ICE self-heal during the disconnect grace window.
    if (health.reason === "disconnected") continue;
    // * Fresh offers still negotiating — do not thrash.
    if (health.reason === "negotiating" && health.ageMs < connectingTimeoutMs) continue;

    const notBefore = peerReconnectNotBeforeMs.get(connId) ?? 0;
    if (now < notBefore) continue;

    peerReconnectNotBeforeMs.set(connId, now + cooldownMs);
    if (health.reason !== "missing") {
      P2P.forceClosePeer(connId);
    }
    console.log(`[netcode] WebRTC recovery reconnect to peer ${connId} (${health.reason})`);
    P2P.initiateP2PConnection(connId).catch((e) => {
      console.warn("[netcode] P2P recovery offer failed (cooldown retry pending)", e);
    });
  }
}

/**
 * Request Cloudflare TURN credentials, then open host peer connections once ICE is ready.
 * Safe to call multiple times; each call starts a fresh wait window.
 */
function requestTurnCredentialsAndOpenPeers() {
  const timeoutMs = CONFIG.net.turnCredentialsTimeoutMs ?? 2500;
  P2P.beginIceServersWait(timeoutMs);
  if (partySocket && partySocket.readyState === WebSocket.OPEN) {
    try {
      partySocket.send(JSON.stringify({ type: MSG.requestTurnCredentials }));
    } catch (e) {
      console.warn("[netcode] requestTurnCredentials failed", e);
    }
  }
  // * Host opens offers after wait; non-host only answers inbound offers (also wait-gated).
  void P2P.waitForIceServers().then(() => {
    if (isHost) ensureHostPeerConnections();
  });
}

/**
 * Applies a server host-migration: re-points authority to the new host, tears down and
 * re-inits P2P, clears prediction/input state, bumps the snapshot epoch, and arms the
 * non-host freeze. Extracted from the WebSocket message dispatcher so the handoff is
 * unit-testable without a live socket (see tests/hostMigration.test.js).
 * @param {{ hostId?: unknown }} msg
 */
function applyHostMigration(msg) {
  hostId = typeof msg.hostId === "string" ? msg.hostId : null;
  const nextIsHost = Boolean(hostId && youConnId && hostId === youConnId);

  P2P.closeAllConnections();
  peerReconnectNotBeforeMs.clear();
  if (youConnId) {
    P2P.initP2P({
      localId: youConnId,
      host: nextIsHost,
      sendSignal: (m) => {
        if (partySocket && partySocket.readyState === WebSocket.OPEN) {
          partySocket.send(JSON.stringify(m));
        }
      },
      onInput: handleRemoteClientInput,
      onState: handleP2PMessage
    });
    // * New host starts hostSeq at 0 — every client must clear the reconcile gate
    // * and pending prediction inputs or seq > lastReconciledSnapSeq never fires.
    requestTurnCredentialsAndOpenPeers();
  }

  if (nextIsHost && lastCartsCache) {
    applyCartsSnapshotToBodies(lastCartsCache);
  }
  // * Restore open kill credit / combos from the last host snapshot tail (NET-MIG-1).
  // * Poses alone leave lastHitBy empty → post-promote falls mis-credit as self.
  if (nextIsHost && lastAttributionCache) {
    applyAttributionSnapshot(lastAttributionCache);
  }
  clearHostCollisionBatch();
  remoteInputsByConnId.clear();
  remoteInputQueuesByConnId.clear();
  remoteNitroLatchedByConnId.clear();
  hostLastProcessedInputSeq.clear();
  pendingInputs = [];
  inputSeq = 0;
  resetClientPredictionState();
  setAuthorityMode(nextIsHost);
  if (!nextIsHost) hostMigrationFreezeUntilMs = getMonotonicNow() + CONFIG.net.hostMigrationFreezeMs;
  hostEpoch += 1;
  netStateBuffer = [];
  // * Host migration is no longer silent — every client gets the PA callout
  // * and the HUD host glyph moves to the new host's chip on the next frame.
  const newHostSlot = Array.isArray(netSlots)
    ? netSlots.find((s) => s && s.connId === hostId)
    : null;
  if (newHostSlot?.name) {
    announce("new_host", { name: newHostSlot.name });
  }
  if (nextIsHost) {
    const hostMigratedHandler = callbacks.getOnHostMigratedHandler?.();
    if (hostMigratedHandler) hostMigratedHandler();
  }
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
  resetClockState(partyClock);
  resetClockState(hostClock);
  lastAttributionCache = null;
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
      connectionState = "reconnecting";
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
      connectionState = "reconnecting";
    }
    if (_suppressRetry) return;
    if (didSendJoin && !helloReceivedThisSession) {
      try { callbacks.onJoinRejected(); } catch {}
    } else {
      try { scheduleNetcodeRetry(); } catch {}
    }
  });

  partySocket.addEventListener("open", () => {
    connectionState = "ok";
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

    // * Party clock samples from any control-plane stamp (NET-CLK-1) — never from host tHost.
    maybeSamplePartyClock(msg);

    if (type === MSG.keepalive) {
      // * Server keepalive ack only carries party time for offset; no other work.
      return;
    }

    if (type === MSG.turnCredentials) {
      P2P.setTurnServers(msg.servers);
      return;
    }

    if (type === MSG.hostSpawn) {
      // * Reliable spawn/rematch poses over PartyKit (complements unreliable WebRTC).
      applyHostSpawnSnapshot(msg);
      return;
    }
    if (type === MSG.sdpOffer || type === MSG.sdpAnswer || type === MSG.iceCandidate) {
      P2P.handleSignalingMessage(msg);
      return;
    }

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
        // * Room level is server truth — adopt into settingsStore (not only raw
        // * localStorage) so a later host promote does not rematch on the wrong arena.
        adoptAuthoritativeRoomLevel(msg.levelId, { notify: true });
      }
      helloReceivedThisSession = true;
      youConnId = typeof msg.youConnId === "string" ? msg.youConnId : null;
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;

      if (youConnId) {
        P2P.initP2P({
          localId: youConnId,
          host: Boolean(hostId && youConnId && hostId === youConnId),
          sendSignal: (m) => {
            if (partySocket && partySocket.readyState === WebSocket.OPEN) {
              partySocket.send(JSON.stringify(m));
            }
          },
          onInput: handleRemoteClientInput,
          onState: handleP2PMessage
        });
        // * Gate WebRTC PC creation on TURN credentials (or timeout) so offers/answers
        // * are not built STUN-only while credentials are still in flight.
        requestTurnCredentialsAndOpenPeers();
      }

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
      // * Host peer offers are opened from requestTurnCredentialsAndOpenPeers (TURN-gated).

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
      applyHostMigration(msg);
      return;
    }

    if (type === MSG.slots) {
      const serverMs = typeof msg.serverNowMs === "number" ? msg.serverNowMs : 0;
      if (serverMs < lastSlotsServerMs) return;
      // * Server owns slot colors: it guarantees every slot holds a distinct preset
      // * color (displacing NPCs on human color-pick), so clients accept slots verbatim
      // * instead of re-deriving colors locally. This matches the MSG.hello path and
      // * keeps a single authority for slot state. (declashNpcSlotColors is retained only
      // * for solo/testdrive, where the client itself is the slot authority.)
      const merged = msg.slots;
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
            .catch((err) => {
              console.error("[netcode] ensureSessionReady failed during slot sync:", err);
            });
        }

        // * Host is the WebRTC offerer: open a DataChannel to every (new) human peer.
        // * Runs on join and post-migration (server rebroadcasts slots for both); no-op for non-hosts.
        ensureHostPeerConnections();

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
        for (const id of remoteInputQueuesByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteInputQueuesByConnId.delete(id);
        }
        for (const id of hostLastProcessedInputSeq.keys()) {
          if (!liveConnIds.has(id)) hostLastProcessedInputSeq.delete(id);
        }
        for (const id of peerReconnectNotBeforeMs.keys()) {
          if (!liveConnIds.has(id)) peerReconnectNotBeforeMs.delete(id);
        }
        // * Terminate WebRTC peer connections that are no longer in live slots
        P2P.prunePeers(liveConnIds);

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



    if (type === MSG.round) {
      const r = msg.round;
      if (r && typeof r === "object") {
        const prevPhase = GameState.getRoundState().phase;
        const newPhase = r.phase;
        // * Server rejected an optimistic host_round (or otherwise reasserted truth).
        // * Host may already be on podium while the room is still running — roll back.
        if (msg.rejected === true || (prevPhase === "podium" && newPhase === "running")) {
          callbacks.onPodiumRejected?.();
        }
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
          // * Rematch/lobby return: drop stale prediction so the next round reconciles cleanly.
          resetClientPredictionState();
          callbacks.onReturnToLobby?.();
        }
        if (typeof newPhase === "string" && prevPhase === "running" && newPhase === "podium") {
          // * Apply winner/scores before onEnterPodium so clients can aim the
          // * victory camera at the correct cart (state write below is idempotent).
          if (r.winnerSlotIndex !== undefined) {
            const w = r.winnerSlotIndex;
            GameState.setRoundWinnerSlotIndex(
              w === "draw" ? "draw" : Number.isFinite(w) ? w : null,
            );
          }
          if (r.scores && typeof r.scores === "object") GameState.setRoundScores(r.scores);
          if (r.endReason === "timer" || r.endReason === "lastStanding" || r.endReason == null) {
            GameState.setRoundEndReason(r.endReason ?? null);
          }
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
        // * Server now broadcasts levelId on every MSG.round. Clients latch it so
        // * rematch / host promote keep the room arena (not each player's menu pick).
        if (typeof msg.levelId === "string" && msg.levelId.trim() !== "") {
          adoptAuthoritativeRoomLevel(msg.levelId, { notify: true });
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
 * before the running-phase send loop resumes. Skips collision/fall draining on purpose.
 *
 * Sends both:
 * - Unreliable WebRTC binary (low latency when the channel is healthy)
 * - Reliable PartyKit MSG.hostSpawn (survives a lost DataChannel packet during countdown)
 */
export function broadcastHostTransform(carts) {
  if (!partySocket || !isHost) return;
  hostSeq += 1;
  lastCartsCache = carts;
  const tHost = getMonotonicNow();
  const payload = {
    seq: hostSeq,
    tHost,
    carts,
  };
  P2P.sendToAll(encodeHostStateSnapshot(payload));

  // * Reliable control-plane copy so clients never spend the whole countdown at old poses.
  if (partySocket.readyState === WebSocket.OPEN) {
    try {
      partySocket.send(JSON.stringify({
        type: MSG.hostSpawn,
        seq: hostSeq,
        tHost,
        carts,
      }));
    } catch (e) {
      console.warn("[netcode] hostSpawn send failed", e);
    }
  }

  // * Host also resets its own reconcile gate so a later demote→promote mid-session is clean.
  resetReconciliationState();
  hostLastProcessedInputSeq.clear();
  pendingInputs = [];
}

/**
 * Applies a reliable host spawn snapshot (MSG.hostSpawn) into bodies + the interp buffer.
 * @param {{ seq?: number, tHost?: number, carts?: unknown, serverNowMs?: number }} msg
 */
function applyHostSpawnSnapshot(msg) {
  const carts = msg?.carts;
  if (!carts || typeof carts !== "object") return;

  const seq = typeof msg.seq === "number" && Number.isFinite(msg.seq) ? msg.seq : 0;
  const tHost = typeof msg.tHost === "number" && Number.isFinite(msg.tHost) ? msg.tHost : getMonotonicNow();
  lastCartsCache = carts;

  // * Rematch/spawn is a hard pose reset — clear prediction so clients don't replay
  // * pre-rematch inputs on top of spawn.
  if (!isHost) {
    pendingInputs = [];
    resetReconciliationState();
    applyCartsSnapshotToBodies(carts);
    // * Buffer in the host tHost domain — the same domain as the live 40Hz entries and
    // * getInterpTargetServerNowMs(). msg.serverNowMs is Party (Worker) time; mixing
    // * domains mispairs findSnapshotPair at GO/rematch (NET-BUF-1). The server relays
    // * tHost: 0 for a malformed host message, so fall back to a local→host estimate.
    const bufferAtMs = tHost > 0 ? tHost : getMonotonicNow() - hostClock.offsetMs;
    bufferAuthoritativeState(bufferAtMs, seq, carts, hostEpoch);
  }
}

/**
 * Apply a room-authoritative level id (from server hello/round or our own host_round).
 * Updates the latch used by {@link sendHostRound} and keeps settings/localStorage aligned.
 * @param {string | null | undefined} levelId
 * @param {{ notify?: boolean }} [opts] When notify, fire onLevelIdChanged if the store changed.
 */
function adoptAuthoritativeRoomLevel(levelId, opts = {}) {
  const incoming = typeof levelId === "string" ? levelId.trim() : "";
  if (!incoming) return;
  authoritativeRoomLevelId = incoming;
  const stored = settingsStore.getState().selectedLevelId;
  if (incoming !== stored) {
    settingsStore.getState().setSelectedLevelId(incoming);
    if (opts.notify !== false) {
      callbacks.onLevelIdChanged?.(incoming);
    }
  }
}

export function sendHostRound() {
  if (!partySocket || !isHost) return;
  const state = GameState.getRoundState();
  // * Prefer room latch over menu preference so host migration rematch keeps the
  // * arena everyone was playing (new host's localStorage may differ).
  const currentLevelId =
    authoritativeRoomLevelId
    || settingsStore.getState().selectedLevelId
    || "classicRecord";
  authoritativeRoomLevelId = currentLevelId;
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

export function sendP2PEvent(payload) {
  P2P.sendToAll(payload);
}

/**
 * @param {{ offsetMs: number, samples: number, bootstrap: number[], resyncDueAtMs: number, resyncSamples: number[] }} clock
 */
function resetClockState(clock) {
  clock.offsetMs = 0;
  clock.samples = 0;
  clock.bootstrap = [];
  clock.resyncDueAtMs = 0;
  clock.resyncSamples = [];
}

/**
 * EWMA / 3-sample median clock offset estimator (shared by Party and host clocks).
 * @param {{ offsetMs: number, samples: number, bootstrap: number[], resyncDueAtMs: number, resyncSamples: number[] }} clock
 * @param {number} remoteNowMs Absolute ms from the remote domain
 * @param {number} [nowMs=getMonotonicNow()] Local round-clock now
 */
function updateClockOffset(clock, remoteNowMs, nowMs = getMonotonicNow()) {
  if (typeof remoteNowMs !== "number" || !Number.isFinite(remoteNowMs)) return;
  const sample = nowMs - remoteNowMs;
  if (clock.samples < 3) {
    // * Collect the first 3 samples and use their median as the baseline.
    // * A single bad first sample would otherwise poison the EWMA forever.
    // * Provisional offset on sample 1 so gameStart conversion works before median latches.
    clock.bootstrap.push(sample);
    clock.samples += 1;
    if (clock.samples === 1) clock.offsetMs = sample;
    if (clock.samples === 3) {
      const sorted = [...clock.bootstrap].sort((a, b) => a - b);
      clock.offsetMs = sorted[1]; // median of 3
      clock.bootstrap = [];
      clock.resyncDueAtMs = nowMs + CONFIG.net.clockResyncIntervalMs;
    }
  } else if (clock.resyncDueAtMs > 0 && nowMs >= clock.resyncDueAtMs) {
    // * Periodic re-bootstrap: the EWMA below rejects >500ms outliers, so a slowly
    // * drifting client clock can pull the offset unbounded over a long session.
    // * Every resync interval, take a fresh 3-sample median and blend it 20% into
    // * the running estimate — enough to arrest drift without a visible timer jump.
    clock.resyncSamples.push(sample);
    if (clock.resyncSamples.length >= 3) {
      const sorted = [...clock.resyncSamples].sort((a, b) => a - b);
      clock.offsetMs = clock.offsetMs * 0.8 + sorted[1] * 0.2;
      clock.resyncSamples = [];
      clock.resyncDueAtMs = nowMs + CONFIG.net.clockResyncIntervalMs;
    }
  } else {
    const isClockOutlier = Math.abs(sample - clock.offsetMs) > 500;
    if (!isClockOutlier) {
      clock.offsetMs += (sample - clock.offsetMs) * 0.1;
    }
  }
}

function updatePartyClockOffset(serverNowMs, nowMs = getMonotonicNow()) {
  updateClockOffset(partyClock, serverNowMs, nowMs);
}

function updateHostClockOffset(tHost, nowMs = getMonotonicNow()) {
  updateClockOffset(hostClock, tHost, nowMs);
}

/** @deprecated Use updateHostClockOffset — kept as test-hook name for host clock. */
function updateServerClockOffset(serverNowMs, nowMs = getMonotonicNow()) {
  updateHostClockOffset(serverNowMs, nowMs);
}

/**
 * Sample Party serverNowMs from any WS control-plane message that carries it.
 * @param {unknown} msg
 */
function maybeSamplePartyClock(msg) {
  if (!msg || typeof msg !== "object") return;
  const serverNowMs = /** @type {{ serverNowMs?: unknown }} */ (msg).serverNowMs;
  if (typeof serverNowMs === "number" && Number.isFinite(serverNowMs)) {
    updatePartyClockOffset(serverNowMs);
  }
}

/**
 * Compact kill-credit / combo tail for host migration (NET-MIG-1).
 * Ages are relative to host tHost so a new host can re-anchor to local now.
 * @param {number} tHost
 * @returns {{ h: number[][], s: number[], c: number[][] } | null}
 */
function buildAttributionWire(tHost) {
  const hitWindowMs = CONFIG.scoring?.hitWindowMs ?? 3000;
  const hits = GameState.getLastHitBy();
  /** @type {number[][]} */
  const h = [];
  if (hits && typeof hits.forEach === "function") {
    hits.forEach((hit, victimSlot) => {
      if (!hit) return;
      const ageMs = tHost - (hit.timestamp || 0);
      if (!(ageMs >= 0) || ageMs > hitWindowMs) return;
      h.push([
        Number(victimSlot) | 0,
        Number(hit.attackerSlotIndex) | 0,
        hit.wasCritical ? 1 : 0,
        Math.round((Number(hit.impactSpeed) || 0) * 10) / 10,
        hit.fromPodium ? 1 : 0,
        Math.round(ageMs),
      ]);
    });
  }

  const scoreAt = GameState.getLastScoringHitAt?.() ?? {};
  /** @type {number[]} */
  const s = [0, 1, 2, 3].map((i) => {
    const ts = Number(scoreAt[i]) || 0;
    if (!(ts > 0)) return 0;
    return Math.max(0, Math.round(tHost - ts));
  });

  /** @type {number[][]} */
  const c = [];
  const allCarts = getAllCarts();
  const nowPerf = performance.now();
  if (allCarts) {
    for (let i = 0; i < allCarts.length; i += 1) {
      const cart = allCarts[i];
      const tier = cart?.comboTier | 0;
      if (tier <= 0) continue;
      const remainMs = Math.max(0, Math.round((cart.comboExpiryMs || 0) - nowPerf));
      if (remainMs <= 0) continue;
      c.push([i, tier, remainMs]);
    }
  }

  if (h.length === 0 && c.length === 0 && s.every((v) => v === 0)) return null;
  return { h, s, c };
}

/**
 * Restore open hits / scoring stamps / combos after host promotion.
 * @param {{ h?: unknown[], s?: unknown[], c?: unknown[] } | null} attr
 */
function applyAttributionSnapshot(attr) {
  if (!attr || typeof attr !== "object") return;
  const now = getMonotonicNow();
  const hitWindowMs = CONFIG.scoring?.hitWindowMs ?? 3000;

  if (Array.isArray(attr.h)) {
    const map = new Map();
    for (const row of attr.h) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const victim = Number(row[0]);
      const attacker = Number(row[1]);
      const ageMs = Number(row[5]);
      if (!Number.isFinite(victim) || victim < 0 || victim > 3) continue;
      if (!Number.isFinite(attacker) || attacker < 0 || attacker > 3) continue;
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > hitWindowMs) continue;
      map.set(victim | 0, {
        attackerSlotIndex: attacker | 0,
        wasCritical: Boolean(row[2]),
        impactSpeed: Number(row[3]) || 0,
        fromPodium: Boolean(row[4]),
        timestamp: now - ageMs,
      });
    }
    GameState.replaceLastHitBy(map);
  }

  if (Array.isArray(attr.s) && attr.s.length >= 4) {
    /** @type {Record<number, number>} */
    const hits = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 4; i += 1) {
      const age = Number(attr.s[i]) || 0;
      hits[i] = age > 0 ? now - age : 0;
    }
    GameState.setLastScoringHitAt(hits);
  }

  if (Array.isArray(attr.c)) {
    const allCarts = getAllCarts();
    const nowPerf = performance.now();
    const maxTier = CONFIG.combo?.maxTier ?? 3;
    for (const row of attr.c) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const slot = Number(row[0]) | 0;
      const tier = Math.min(maxTier, Math.max(0, Number(row[1]) | 0));
      const remainMs = Math.max(0, Number(row[2]) || 0);
      const cart = allCarts?.[slot];
      if (!cart || tier <= 0 || remainMs <= 0) continue;
      cart.comboTier = tier;
      cart.comboExpiryMs = nowPerf + remainMs;
      const localIdx = youConnId ? strictSlotIndexForConn(youConnId) : -1;
      if (slot === localIdx) {
        GameState.setLocalCombo(tier, cart.comboExpiryMs);
      }
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
    lastAttributionCache = null;
    isHost = false;
    hostId = null;
    youConnId = null;
    netSlots = [];
    peerReconnectNotBeforeMs.clear();
    resetClockState(partyClock);
    resetClockState(hostClock);
    hostLastProcessedInputSeq = new Map();
    remoteInputQueuesByConnId = new Map();
    remoteInputsByConnId = new Map();
    remoteNitroLatchedByConnId = new Map();
    pendingInputs = [];
    inputSeq = 0;
  },
  getBufferLength: () => netStateBuffer.length,
  findSnapshotPair: (t) => findSnapshotPair(t),
  pruneConsumedSnapshots: (beforeIndex) => pruneConsumedSnapshots(beforeIndex),
  updateServerClockOffset: (serverNowMs, nowMs) => updateHostClockOffset(serverNowMs, nowMs),
  updatePartyClockOffset: (serverNowMs, nowMs) => updatePartyClockOffset(serverNowMs, nowMs),
  getServerClockOffset: () => hostClock.offsetMs,
  getHostClockOffset: () => hostClock.offsetMs,
  getPartyClockOffset: () => partyClock.offsetMs,
  getClockResyncDueAtMs: () => hostClock.resyncDueAtMs,
  getLastAttributionCache: () => lastAttributionCache,
  setLastAttributionCache: (attr) => { lastAttributionCache = attr; },
  applyAttributionSnapshot: (attr) => applyAttributionSnapshot(attr),
  buildAttributionWire: (tHost) => buildAttributionWire(tHost),
  // * Drives the exact function wired as P2P onState — proves raw binary/JSON
  // * frames flow through decode → dispatch → buffer without a live DataChannel.
  dispatchP2P: (data, fromConnId) => handleP2PMessage(data, fromConnId),
  // * Drives the exact host-migration branch of the WS dispatcher (see applyHostMigration).
  applyHostMigration: (msg) => applyHostMigration(msg),
  getHostEpoch: () => hostEpoch,
  setHostIdForTest: (id) => { hostId = id; },
  // * Signaling-flow validation: set host authority state, then call the exact helper
  // * the slots handler uses so tests can assert the host opens offers to the right peers.
  setHostStateForTest: ({ isHost: h, youConnId: y, netSlots: s }) => {
    if (h !== undefined) isHost = h;
    if (y !== undefined) youConnId = y;
    if (s !== undefined) netSlots = s;
  },
  ensureHostPeerConnections: () => ensureHostPeerConnections(),
  maintainHostPeerConnections: () => maintainHostPeerConnections(),
  clearPeerReconnectCooldowns: () => peerReconnectNotBeforeMs.clear(),
  // * Input jitter / ackSeq contract (host path).
  handleRemoteClientInput: (input, fromConnId, seq) => handleRemoteClientInput(input, fromConnId, seq),
  drainRemoteInputJitterBuffers: () => drainRemoteInputJitterBuffers(),
  getHostLastProcessedInputSeq: (connId) => hostLastProcessedInputSeq.get(connId) || 0,
  getRemoteInputQueueLength: (connId) => remoteInputQueuesByConnId.get(connId)?.length ?? 0,
  /** Push synthetic pending prediction frames (non-host history). */
  pushPendingInputForTest: (seq, tClient = performance.now()) => {
    pendingInputs.push({
      seq,
      input: { throttle: 0, steer: 0, nitro: false, hop: false },
      tClient,
    });
    const pendingMax = CONFIG.net.predictionPendingInputsMax ?? 120;
    while (pendingInputs.length > pendingMax) pendingInputs.shift();
  },
  /** Cap helper used by sampleLocalInputForTick — tests can re-apply after bulk push. */
  capPendingInputsForTest: () => {
    const pendingMax = CONFIG.net.predictionPendingInputsMax ?? 120;
    while (pendingInputs.length > pendingMax) pendingInputs.shift();
  },
};

/**
 * Host receives remote client input over the unreliable DataChannel.
 * Frames are queued and applied after a short jitter delay so variable packet
 * timing does not stutter remote carts.
 *
 * **ackSeq contract:** `hostLastProcessedInputSeq` advances only when a frame is
 * *applied* in {@link drainRemoteInputJitterBuffers}, not on wire receive. Snapshots
 * advertise that seq so non-hosts prune `pendingInputs` only after the host has
 * actually simulated the input (avoids ~jitterBufferMs systematic mis-acks).
 *
 * @param {object} input
 * @param {string} fromConnId
 * @param {number} [seq]
 */
function handleRemoteClientInput(input, fromConnId, seq) {
  if (!isHost) return;
  if (!fromConnId || !input || typeof input !== "object") return;

  const throttle = Math.max(-1, Math.min(1, Number.isFinite(input.throttle) ? input.throttle : 0));
  const steer = Math.max(-1, Math.min(1, Number.isFinite(input.steer) ? input.steer : 0));
  const nitro = Boolean(input.nitro);
  const hop = Boolean(input.hop);
  const seqNum = typeof seq === "number" && Number.isFinite(seq) ? seq : 0;

  let queue = remoteInputQueuesByConnId.get(fromConnId);
  if (!queue) {
    queue = [];
    remoteInputQueuesByConnId.set(fromConnId, queue);
  }
  queue.push({
    seq: seqNum,
    throttle,
    steer,
    nitro,
    hop,
    t: performance.now(),
  });
  const maxQ = CONFIG.net.inputJitterQueueMax ?? 24;
  while (queue.length > maxQ) queue.shift();
}

/**
 * Applies remote input frames whose age exceeds the jitter buffer delay.
 * Nitro/hop edges fire when each frame is applied (not on wire arrival), so a
 * burst of frames in one drain does not drop intermediate hops.
 * Advances per-peer ackSeq only for applied frames (see handleRemoteClientInput).
 */
function drainRemoteInputJitterBuffers() {
  if (!isHost) return;
  const now = performance.now();
  const delay = CONFIG.net.inputJitterBufferMs ?? 40;
  const allCarts = getAllCarts();

  for (const [connId, queue] of remoteInputQueuesByConnId) {
    if (!queue || queue.length === 0) continue;

    // * Drain every frame past the jitter delay in one pass (catch-up after hitch/burst).
    // * Continuous axes take the last sample; nitro rising-edge + hop fire per frame.
    while (queue.length > 0 && queue[0].t <= now - delay) {
      const applied = queue.shift();

      if (applied.seq > 0) {
        const existingSeq = hostLastProcessedInputSeq.get(connId) || 0;
        hostLastProcessedInputSeq.set(connId, Math.max(existingSeq, applied.seq));
      }

      remoteInputsByConnId.set(connId, {
        throttle: applied.throttle,
        steer: applied.steer,
        nitro: applied.nitro,
      });

      const was = remoteNitroLatchedByConnId.get(connId) || false;
      if (!was && applied.nitro && allCarts && triggerRamBoostRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerRamBoostRef(cart, now);
        }
      }
      remoteNitroLatchedByConnId.set(connId, applied.nitro);

      if (applied.hop && allCarts && triggerHopRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerHopRef(cart, now);
        }
      }
    }
    // * No ready frames yet — keep last applied continuous input (map already holds it).
  }
}

function handleP2PMessage(data, fromConnId) {
  // * Only the current host is authoritative for snapshots/events. WebRTC is
  // * unordered/unreliable and the WS host_migrated arrives on a separate transport,
  // * so a pre-migration packet can still fire on the event loop after we've bumped
  // * the epoch and cleared the buffer. Reject by source connId — the stale old-host
  // * channel no longer matches hostId — so it can't poison the freshly-cleared buffer.
  if (fromConnId && hostId && fromConnId !== hostId) return;
  if (data instanceof ArrayBuffer) {
    const decoded = decodeHostStateSnapshot(data);
    if (decoded) {
      handleRemoteP2PMessage(decoded);
    }
  } else {
    handleRemoteP2PMessage(data);
  }
}

function handleRemoteP2PMessage(data) {
  if (data.type === MSG.hostTransform) {
    handleRemoteHostState(data);
  } else if (data.type === MSG.spill) {
    handleRemoteSpill(data);
  } else if (data.type === MSG.directive) {
    // * Living Store directive start — apply the same CONFIG overrides locally.
    applyRemoteDirective(data);
  } else if (data.type === MSG.spillBonus) {
    // * Presentation only — host already scored; local host uses onSpillBonusAward.
    callbacks.onSpillBonusPresentation?.(data);
  }
}

function handleRemoteSpill(msg) {
  const carts = getAllCarts();
  const cart = carts?.[msg.slotId];
  // * Do NOT early return if cart.hasSpilled is true.
  // * The host sends this exactly once. If snap.s arrived first, we still need the VFX.
  // * We only set hasSpilled if it wasn't already, to avoid stepping on respawn logic.
  if (cart && !cart.hasSpilled) cart.hasSpilled = true;
  // * Always despawn basket cargo on the wire spill (hide every bay under the cart).
  if (cart) GroceryPool.hideCargoBay(cart);
  // * Living Cargo spill comeback — arm the "empty cart is fast" window locally so the
  // * predicted local cart matches the host's buffed drive (and cargoLoad.js can run
  // * the restock timer + announcer nudge on every client). Note the window anchors to
  // * wire-receive time, so it lags the host's by one-way latency — reconciliation
  // * absorbs the edges (see docs/planning/living-store-test-plan.md).
  armSpillBoost(cart);

  GroceryPool.triggerSpill(
    String(msg.slotId),
    msg.pos,
    msg.quat,
    msg.vel,
    typeof msg.count === "number" && msg.count > 0 ? msg.count : 6,
    cart?.cargoBay ?? null,
  );
}

function handleRemoteHostState(state) {
  if (state.carts && typeof state.carts === "object") {
    lastCartsCache = state.carts;
  }
  if (!isHost) {
    const hostTime = typeof state.tHost === "number" ? state.tHost : (typeof state.serverNowMs === "number" ? state.serverNowMs : getMonotonicNow());
    updateHostClockOffset(hostTime);
    const seq = typeof state.seq === "number" ? state.seq : -1;
    bufferAuthoritativeState(hostTime, seq, state.carts, hostEpoch);
    // * Cache kill-credit / combo ages for host promotion (NET-MIG-1).
    if (state.attr && typeof state.attr === "object") {
      lastAttributionCache = state.attr;
    }
    if (Array.isArray(state.collisions)) {
      for (const ev of state.collisions) {
        replayHostCollisionFx(ev, callbacks);
      }
    }
    if (Array.isArray(state.falls)) {
      for (const ev of state.falls) {
        processHostFallEvent(ev);
      }
    }
    // * Directive self-heal: if the host has an active window this client doesn't
    // * (lost one-shot, mid-window join), apply it with the remaining duration.
    // * applyRemoteDirective no-ops when the same directive is already active.
    if (state.dir && state.dir.id) {
      applyRemoteDirective({ id: state.dir.id, durationMs: state.dir.r });
    }
  }
}

export function getPendingInputs() {
  return pendingInputs;
}

export function prunePendingInputs(ackSeq) {
  pendingInputs = pendingInputs.filter(item => item.seq > ackSeq);
}

export function getLatestSnap() {
  return netStateBuffer.length > 0 ? netStateBuffer[netStateBuffer.length - 1] : null;
}