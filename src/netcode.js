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
import { stampTailEventIds, markPresentationEid } from "./netcode/presentationDedupe.js";
import { rebuildKOEvent } from "./scoring/koEvent.js";
import { dispatchKOEvent } from "./scoring/koReactors.js";
import { ChallengeTracker } from "./stores/challengeStore.js";
import { UnlockTracker } from "./stores/unlockStore.js";
import { getCurrentLevelId } from "./levelManager.js";
import { announce } from "./announcer/announcerManager.js";
import { applyRemoteDirective, clearDirectiveOnHostMigration, getDirectiveWireState } from "./directives/directiveEngine.js";
import { armSpillBoost } from "./cargoLoad.js";
import { clamp } from "./utils.js";
import { playSfx } from "./audioManager.js";
import { recordDiagEvent } from "./utils/diagnostics.js";
import { computeLocalHostCapabilityScore } from "./utils/hostCapability.js";
import { probeGpu } from "./utils/gpuCaps.js";
import { getQualityTier } from "./utils/qualityMode.js";

import { getRoundClockNowMs } from "./roundClock.js";
import { devLog } from "./utils/devLog.js";

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
const _cartSnapScratch = { p: null, q: null, lv: null, av: null, b: undefined, h: undefined, ch: undefined, c: undefined, s: undefined };
const _cartSnapPosOut = [0, 0, 0];

/** Copies a cart snapshot's fields into a scratch object (avoids a `{...snap}` alloc). */
function copyCartSnapIntoScratch(scratch, snap) {
  scratch.p = snap.p;
  scratch.q = snap.q;
  scratch.lv = snap.lv;
  scratch.av = snap.av;
  scratch.b = snap.b;
  scratch.h = snap.h;
  scratch.ch = snap.ch;
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
 * True only when {@link lastCartsCache} came from MSG.hostSpawn / host rematch
 * broadcastHostTransform — not from a mid-round 40Hz snap or hello.
 * NET-1 S1 residual (Run7 third-round edge death): non-host rotate ends with
 * rematchResetWorld (good ring) then reapplyCachedCartsSnapshot(); if the cache
 * is still the previous round's live pose (off-edge / void), reapply stomps the
 * ring seat and the joiner dies at GO. Only reapply spawn-tagged caches.
 */
let lastCartsCacheIsSpawn = false;
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

// * Netcode-harness input-path counters (tools/netharness.mjs). Lets the 2-client rig tell
// * "joiner never sampled/sent" from "host never drained/applied". Off (zero-cost) unless the
// * ?nettest harness enables it via setNetTestActive — the increments are guarded by netTestOn.
let netTestOn = false;
const __dbgInputCounters = { drainCalls: 0, drainApplied: 0, sampleCalls: 0, sends: 0, ingest: 0 };
/** @param {boolean} on Enable input-path counters for the netcode harness (?nettest only). */
export function setNetTestActive(on) { netTestOn = Boolean(on); }

let hostSendTimer = null;
let keepaliveTimer = null;

/** @type {Map<string, number>} connId → earliest monotonic ms we may re-offer WebRTC. */
let peerReconnectNotBeforeMs = new Map();

let hostMigrationFreezeUntilMs = 0;
/**
 * Non-host after host_migrated: true until the first post-epoch snapshot is buffered.
 * Cleared only by that snap (or disconnect / becoming host) — NOT by freeze max timeout.
 * Freeze prediction may end earlier (hostMigrationFreezeMaxMs); this flag still blocks
 * lastCartsCache ghost poses and remote collider sync (NET-MIG-3 residual).
 */
let hostMigrationAwaitingFirstSnap = false;
/**
 * Presentation dedupe for unreliable falls[] tails (NET-PRES-1).
 * Primary: `eid` seen-set (`f{seq}.{i}`). Fallback: victim slot → last process time (600ms)
 * when the host omitted eid (legacy / partial deploy).
 */
const recentHostFallByVictim = new Map();
/** @type {Map<string, number>} NET-PRES-1 fall eid → last-seen ms */
const seenFallPresentationEids = new Map();
/** @type {Map<string, number>} NET-PRES-1 collision eid → last-seen ms */
const seenCollisionPresentationEids = new Map();

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
  // * Only queue what the 40Hz tick can actually drain: an active MP host send loop.
  // * Solo/testdrive never start the loop — without this gate every solo fall would
  // * accumulate all session and flush as phantom KO replays into the first snapshot
  // * of a later hosted room.
  if (!hostSendTimer) return;
  pendingHostFallEvents.push(eventData);
  if (GameState.getRoundState().phase !== "running") {
    // * The ROUND-ENDING KO: gameFlow queues the fall after addScore→endRound has
    // * already flipped the phase, and the scheduled tick early-returns outside
    // * "running" — so non-hosts historically never saw the winning KO's feed and
    // * shatter. Flush it immediately with one forced snapshot (same payload shape,
    // * same falls[] tail; clients replay falls regardless of phase).
    hostSendTick({ force: true });
  }
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
  // * Local-cart death teardown on the NON-host fall path (run-5: charge loop kept
  // * repeating after death — host-side scheduleRespawn stops it, this path must too).
  stopChargeSfxForCart: (cart) => {},
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
   * * hex string ("#ff00ff") — the falls[] tail replay (processHostFallEvent) narrows on typeof.
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
  // * Room-authoritative level changed mid-session (Quickplay rotation / host arena
  // * switch). main.js rotates the loaded arena in place when in-game.
  onLevelIdChanged: (levelId) => {},
  // * Host optimistic podium rejected by server — tear down results/cam and resume running.
  onPodiumRejected: () => {},

  // Session lifecycle — may return a Promise (cart bootstrap + warm); callers await when present.
  ensureSessionReady: () => /** @type {void | Promise<unknown>} */ (undefined),
  endCinematicCountdown: () => {},
  teleportCartToSpawn: (slotIndex) => {},
  /**
   * Non-host play-entry complete (carts + shader warm). Default true so tests /
   * hosts without the hook still apply countdown. Cap-59: main wires isSessionCartsReady.
   * @returns {boolean}
   */
  isSessionPlayReady: () => true,
  /** @returns {boolean} Non-host game_start waiter is mid carts-ready gate. */
  hasPendingNonHostCountdownApply: () => false,
};

function registerCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

/**
 * Cap-59 / cap-61: non-host must not enter local countdown phase until
 * carts + play-shader warm (isSessionPlayReady). Clocks/scores still apply;
 * deferred game_start or a later host_round flips phase once ready.
 * @param {unknown} newPhase
 * @param {boolean} clientIsHost
 * @returns {boolean}
 */
function shouldHoldNonHostCountdownPhase(newPhase, clientIsHost) {
  return (
    !clientIsHost
    && newPhase === "countdown"
    && typeof callbacks.isSessionPlayReady === "function"
    && !callbacks.isSessionPlayReady()
  );
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
    stopChargeSfxForCart: (cart) => deps.stopChargeSfxForCart?.(cart),
    onHopLandRef: (cart, intensity) => deps.onHopLand?.(cart, intensity),
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
    onLevelIdChanged: (levelId) => deps.onLevelIdChanged?.(levelId),
    onPodiumRejected: () => deps.onPodiumRejected?.(),
    getPendingMidRoundJoinRespawnConnId: () => deps.getPendingMidRoundJoinRespawnConnId(),
    setPendingMidRoundJoinRespawnConnId: (val) => deps.setPendingMidRoundJoinRespawnConnId(val),
    ensureSessionReady: () => deps.ensureSessionReady?.(),
    endCinematicCountdown: () => deps.endCinematicCountdown?.(),
    teleportCartToSpawn: (slotIndex) => deps.teleportCartToSpawn?.(slotIndex),
    // * Cap-63: default false when dep missing so hold engages; tests that need
    // * "always ready" set the hook via setIsSessionPlayReadyForTest / registerCallbacks.
    isSessionPlayReady: () => (
      typeof deps.isSessionPlayReady === "function" ? deps.isSessionPlayReady() : false
    ),
    hasPendingNonHostCountdownApply: () => (
      typeof deps.hasPendingNonHostCountdownApply === "function"
        ? deps.hasPendingNonHostCountdownApply()
        : false
    ),
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

/**
 * COUNTDOWN-ABORT-1 forensics: whenever a countdown tears down to lobby, record WHY (which
 * code path asserted lobby) plus the per-slot readiness snapshot at that instant. The 07-21
 * paired host+non-host captures proved the countdown thrashes (abort→restart) but not which
 * signal triggers it — this names the branch and shows whether a peer (e.g. a frozen non-host)
 * was un-ready when the abort fired. Inert until ?diag installs the hub.
 * @param {string} reason  which branch fired ("round_msg_lobby" | "pending_apply_lobby" | "countdown_cancel_msg")
 * @param {Record<string, unknown>} [extra]
 */
function recordCountdownAbort(reason, extra = {}) {
  const slotsReady = Array.isArray(netSlots)
    ? netSlots.map((s, i) =>
        s ? { slot: s.slotIndex ?? i, kind: s.kind ?? null, ready: s.isReady ?? null, conn: s.connId ? String(s.connId).slice(0, 6) : null } : null,
      )
    : null;
  recordDiagEvent("round", "countdownAbort", { reason, isHost, slotsReady, ...extra });
}
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
  resetNetFlowStats();
}

// * ---- Net-flow stats (run-4 observability gap) ----
// * The 07-18 "stuttery mess / rubberbandy" F8 bundles carried ZERO snapshot-cadence or
// * reconcile-error evidence — the net probe was blind to exactly the two signals that
// * diagnose rubberbanding. Cheap always-on counters, surfaced in the "net" probe via
// * getNetFlowStats(); big arrival gaps additionally land in the diag event ring.
// *
// * Run-7 2e: wall-clock noteSnapshotArrival inflated snapGaps* on hitchy non-hosts
// * (cap-16/24: dozens of gaps>100 while host sendGapsOver100 was 1–3). Gaps + silence
// * now prefer host tHost domain so hold/skip-replay track host send, not client rAF.
// * Host-side sendGap* counters remain the ground truth on the host F8.
const netFlowStats = {
  startedMs: 0,
  lastArriveMs: 0,
  // * Last accepted snapshot tHost (host monotonic domain). Gap/silence source of truth.
  lastTHost: 0,
  gapCount: 0,
  gapSumMs: 0,
  gapMaxMs: 0,
  gapsOver100: 0,
  reconcileErrLastM: 0,
  reconcileErrMaxM: 0,
  reconcileTeleports: 0,
  // * NET-PERF-1: how many unacked inputs were dropped because reconcileReplayMaxSteps
  // * capped the Rapier replay (run-7 Match A death spiral).
  reconcileReplayDrops: 0,
  reconcileReplayTrimEvents: 0,
  // * How many reconciles skipped Rapier replay after a long snap gap (run-7 combat).
  reconcileReplaySkips: 0,
  lastGapEventMs: 0,
  // * Most recent inter-arrival gap (ms). Prefer tHost delta; wall fallback without tHost.
  // * gameLoop skips replay only when this exceeds prediction.skipReplayAfterSnapGapMs.
  lastArrivalGapMs: 0,
  // * Host-only: inter-send gaps of hostSendTick (setInterval @ hostSendHz). Independent
  // * of client receive path — use these on the host F8 for hitch forensics (2e).
  sendGapCount: 0,
  sendGapSumMs: 0,
  sendGapMaxMs: 0,
  sendGapsOver100: 0,
  sendCount: 0,
  lastSendGapEventMs: 0,
};

function resetNetFlowStats() {
  netFlowStats.startedMs = performance.now();
  netFlowStats.lastArriveMs = 0;
  netFlowStats.lastTHost = 0;
  netFlowStats.gapCount = 0;
  netFlowStats.gapSumMs = 0;
  netFlowStats.gapMaxMs = 0;
  netFlowStats.gapsOver100 = 0;
  netFlowStats.reconcileErrLastM = 0;
  netFlowStats.reconcileErrMaxM = 0;
  netFlowStats.reconcileTeleports = 0;
  netFlowStats.reconcileReplayDrops = 0;
  netFlowStats.reconcileReplayTrimEvents = 0;
  netFlowStats.reconcileReplaySkips = 0;
  netFlowStats.lastArrivalGapMs = 0;
  netFlowStats.sendGapCount = 0;
  netFlowStats.sendGapSumMs = 0;
  netFlowStats.sendGapMaxMs = 0;
  netFlowStats.sendGapsOver100 = 0;
  netFlowStats.sendCount = 0;
  netFlowStats.lastSendGapEventMs = 0;
}

/**
 * Host-only: record wall time between successful hostSendTick broadcasts.
 * Call only after the burst-coalesce guard accepts a tick (so skipped coalesced
 * intervals don't look like healthy 12ms micro-gaps).
 * @param {number} nowMs performance.now() at send
 */
function noteHostSendTick(nowMs) {
  netFlowStats.sendCount += 1;
  // * Anchor the flow window on first host send too (host never notes arrivals).
  if (netFlowStats.startedMs === 0) netFlowStats.startedMs = nowMs;
  if (lastHostSendTickMs > 0) {
    const gap = nowMs - lastHostSendTickMs;
    netFlowStats.sendGapCount += 1;
    netFlowStats.sendGapSumMs += gap;
    if (gap > netFlowStats.sendGapMaxMs) netFlowStats.sendGapMaxMs = gap;
    if (gap > 100) netFlowStats.sendGapsOver100 += 1;
    // * >250ms = 10+ missed 40Hz ticks — timestamped for KO/announcer correlation.
    if (gap > 250 && nowMs - netFlowStats.lastSendGapEventMs > 1000) {
      netFlowStats.lastSendGapEventMs = nowMs;
      const phase = GameState.getRoundState?.()?.phase ?? null;
      recordDiagEvent("net", "host_send_gap", {
        gapMs: Math.round(gap),
        phase,
      });
    }
  }
}

/**
 * Record a non-host snapshot arrival for cadence / silence stats.
 * Prefer host `tHost` deltas so client main-thread delay does not look like host silence
 * (run-7 2e cap-24: 47 wall snapGaps>100 vs host sendGapsOver100=3).
 * @param {number} [tHost] Host monotonic stamp from the snapshot (0/omit → wall fallback).
 */
function noteSnapshotArrival(tHost) {
  const nowMs = performance.now();
  // * Direct-join paths reach the first snapshot without a prediction reset — anchor the
  // * stats window on first arrival so flow.windowMs is honest (run-5 bundles showed 0).
  if (netFlowStats.startedMs === 0) netFlowStats.startedMs = nowMs;

  const tHostValid = typeof tHost === "number" && Number.isFinite(tHost) && tHost > 0;
  let gap = 0;
  let haveGap = false;
  if (tHostValid && netFlowStats.lastTHost > 0) {
    gap = tHost - netFlowStats.lastTHost;
    // * Positive only — reorders / host-migration epoch jumps must not inflate max.
    if (gap > 0) haveGap = true;
  } else if (!tHostValid && netFlowStats.lastArriveMs > 0) {
    gap = nowMs - netFlowStats.lastArriveMs;
    haveGap = gap > 0;
  }

  if (haveGap) {
    netFlowStats.lastArrivalGapMs = gap;
    netFlowStats.gapCount += 1;
    netFlowStats.gapSumMs += gap;
    if (gap > netFlowStats.gapMaxMs) netFlowStats.gapMaxMs = gap;
    if (gap > 100) netFlowStats.gapsOver100 += 1;
    // * >250ms is 10+ missed 40Hz sends — worth a timestamped event, rate-limited to 1/s.
    if (gap > 250 && nowMs - netFlowStats.lastGapEventMs > 1000) {
      netFlowStats.lastGapEventMs = nowMs;
      recordDiagEvent("net", "snap_gap", { gapMs: Math.round(gap), via: tHostValid ? "tHost" : "wall" });
    }
  }

  netFlowStats.lastArriveMs = nowMs;
  // * Advance lastTHost only on first stamp or forward progress — reorders must not
  // * rewrite the anchor (otherwise a late older packet poisons the next gap).
  if (tHostValid && (netFlowStats.lastTHost <= 0 || tHost > netFlowStats.lastTHost)) {
    netFlowStats.lastTHost = tHost;
  }
}

/**
 * ms since the last host snapshot in the **host clock domain** (0 if none yet).
 * Non-host prediction holds when this exceeds prediction.holdAfterSnapGapMs so a
 * silent host cannot be fought as a ghost world (run-7 Match A combat retest).
 *
 * Uses `tHost` + hostClock offset rather than wall time since onmessage, so an
 * Intel client that stalls processing does not false-trip the hold while the
 * host keeps sending (2e residual after announcer warm).
 * @returns {number}
 */
export function getSnapshotSilenceMs() {
  if (getIsHost()) return 0;
  if (netFlowStats.lastTHost > 0 && hostClock.samples > 0) {
    const hostNow = getMonotonicNow() - hostClock.offsetMs;
    return Math.max(0, hostNow - netFlowStats.lastTHost);
  }
  // * Pre-clock-lock / missing tHost: wall since last handler (legacy).
  if (!(netFlowStats.lastArriveMs > 0)) return 0;
  return Math.max(0, performance.now() - netFlowStats.lastArriveMs);
}

/** Most recent inter-arrival gap at the last noteSnapshotArrival (ms; host tHost when available). */
export function getLastSnapshotArrivalGapMs() {
  return netFlowStats.lastArrivalGapMs;
}

/**
 * Reconcile-error hook for gameLoop (deps.netcode — gameLoop cannot import netcode, cycle).
 * @param {number} errM Positional error between predicted and host-authoritative pose.
 * @param {boolean} teleported True when the correction exceeded prediction.maxCorrectionM.
 */
export function noteReconcileError(errM, teleported) {
  netFlowStats.reconcileErrLastM = errM;
  if (errM > netFlowStats.reconcileErrMaxM) netFlowStats.reconcileErrMaxM = errM;
  if (teleported) netFlowStats.reconcileTeleports += 1;
}

/**
 * Count unacked inputs dropped by gameLoop's reconcileReplayMaxSteps cap.
 * @param {number} dropped
 */
export function noteReconcileReplayTruncate(dropped) {
  const n = Number(dropped) || 0;
  if (n <= 0) return;
  netFlowStats.reconcileReplayDrops += n;
  netFlowStats.reconcileReplayTrimEvents += 1;
}

/** Count a reconcile that hard-snapped without replaying (overload / long snap gap). */
export function noteReconcileReplaySkip() {
  netFlowStats.reconcileReplaySkips += 1;
}

/**
 * How long the host has been silent beyond a 2.5s grace, in ms (0 = healthy).
 * Non-host only — drives the HUD's "hold the countdown while the host is away"
 * behavior (run-6: a minimized host froze everyone's world while the wall-clock
 * timer kept counting). Grace absorbs ordinary hitches; the excess-over-grace
 * shape means the display never jumps backward when the hold engages.
 * Uses the same host-domain silence as prediction hold (2e).
 * @returns {number}
 */
export function getHostStallMs() {
  if (getIsHost()) return 0;
  const gap = getSnapshotSilenceMs();
  return gap > 2500 ? gap - 2500 : 0;
}

/** Diag "net" probe read: snapshot cadence + reconcile error since the last prediction reset. */
export function getNetFlowStats() {
  return {
    snapGapAvgMs: netFlowStats.gapCount > 0
      ? Math.round((netFlowStats.gapSumMs / netFlowStats.gapCount) * 10) / 10
      : null,
    snapGapMaxMs: Math.round(netFlowStats.gapMaxMs),
    snapGapsOver100: netFlowStats.gapsOver100,
    snapCount: netFlowStats.gapCount,
    // * Host-only send cadence (2e). Non-host F8s leave these at 0.
    sendGapAvgMs: netFlowStats.sendGapCount > 0
      ? Math.round((netFlowStats.sendGapSumMs / netFlowStats.sendGapCount) * 10) / 10
      : null,
    sendGapMaxMs: Math.round(netFlowStats.sendGapMaxMs),
    sendGapsOver100: netFlowStats.sendGapsOver100,
    sendCount: netFlowStats.sendCount,
    reconcileErrLastM: Math.round(netFlowStats.reconcileErrLastM * 1000) / 1000,
    reconcileErrMaxM: Math.round(netFlowStats.reconcileErrMaxM * 1000) / 1000,
    reconcileTeleports: netFlowStats.reconcileTeleports,
    reconcileReplayDrops: netFlowStats.reconcileReplayDrops,
    reconcileReplayTrimEvents: netFlowStats.reconcileReplayTrimEvents,
    reconcileReplaySkips: netFlowStats.reconcileReplaySkips,
    windowMs: netFlowStats.startedMs > 0 ? Math.round(performance.now() - netFlowStats.startedMs) : 0,
  };
}
/**
 * Deadline (round-clock ms) until which non-host prediction freezes after host_migrated.
 * While awaiting the first post-migration snapshot, returns the max-wait deadline until
 * that snap arrives **or** hostMigrationFreezeMaxMs elapses — then returns 0 so the
 * gameLoop unfreezes local prediction. Ghost guard (`hostMigrationAwaitingFirstSnap`)
 * stays true past the freeze cap until the first snap (NET-MIG-3).
 */
export function getHostMigrationFreezeUntilMs() {
  if (!hostMigrationAwaitingFirstSnap) return 0;
  const now = getMonotonicNow();
  if (now >= hostMigrationFreezeUntilMs) return 0;
  return hostMigrationFreezeUntilMs;
}

/** True until first post-migration host snap (ghost-collider guard). */
export function isHostMigrationAwaitingFirstSnap() {
  return hostMigrationAwaitingFirstSnap;
}

/**
 * Local human slot index for this client (-1 if unseated / unknown).
 * @returns {number}
 */
function localSlotIndexForYou() {
  if (!youConnId || !Array.isArray(netSlots)) return -1;
  return netSlots.findIndex((s) => s && s.connId === youConnId);
}

/**
 * Enable/disable remote cart Rapier bodies during migration ghost guard.
 * Local cart stays enabled so the player can still drive after freeze cap.
 * @param {boolean} enabled
 */
function setRemoteBodiesEnabledForMigration(enabled) {
  const allCarts = getAllCarts();
  if (!allCarts) return;
  const localIdx = localSlotIndexForYou();
  for (let i = 0; i < allCarts.length; i += 1) {
    if (i === localIdx) continue;
    const cart = allCarts[i];
    if (!cart) continue;
    try {
      if (cart.body?.setEnabled) cart.body.setEnabled(enabled);
      if (cart.collider?.setEnabled) cart.collider.setEnabled(enabled);
    } catch {
      // * Body may already be disposed mid-teardown.
    }
  }
}

/**
 * End the post-migration first-snap wait (called when a new-host snap buffers).
 */
function clearHostMigrationFirstSnapWait() {
  if (!hostMigrationAwaitingFirstSnap) return;
  hostMigrationAwaitingFirstSnap = false;
  hostMigrationFreezeUntilMs = 0;
  setRemoteBodiesEnabledForMigration(true);
}
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

  // * Local-cart boost authority (NH-BOOST consistency). Transforms-only snap left
  // * isChargingBoost / ramBoostActiveUntilMs as pure client prediction, so host fire
  // * time and client fire time diverged (bar/SFX/trails "sometimes" only).
  const nowBoostMs = performance.now();
  if (snap.b) {
    if (cart.isChargingBoost) {
      callbacks.stopChargeSfxForCart?.(cart);
      cart.isChargingBoost = false;
      cart.boostChargeStartedAtMs = 0;
    }
    const rb = CONFIG.cart?.ramBoost;
    const keepAliveMs = 280;
    const fullWindowMs = Math.max(
      400,
      (Number(rb?.durationSec) || 1.7) * 1.5 * 1000,
    );
    if (!cart._localHostBoostLatched) {
      cart._localHostBoostLatched = true;
      cart.ramBoostActiveUntilMs = Math.max(
        Number(cart.ramBoostActiveUntilMs) || 0,
        nowBoostMs + fullWindowMs,
      );
      // * Trails: host already in nitro — use charged look (human path).
      cart.nitroStreakCharged = true;
      cart.boostChargeMultiplier = 1;
    } else {
      cart.ramBoostActiveUntilMs = Math.max(
        Number(cart.ramBoostActiveUntilMs) || 0,
        nowBoostMs + keepAliveMs,
      );
    }
    cart.isRamBoosting = true;
    cart.isBoosting = true;
  } else {
    cart._localHostBoostLatched = false;
    cart.isRamBoosting = false;
    cart.isBoosting = false;
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

  // * NET-MIG-3: never feed pre-migration lastCartsCache poses while waiting for the
  // * new host's first snap — those become collidable ghost targets after freeze max.
  if (hostMigrationAwaitingFirstSnap) return null;

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
  _cartSnapScratch.ch = a.ch ?? b.ch;
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

  const nowBoostMs = performance.now();
  if (snap.b) {
    // * Keep trails alive across 40Hz snaps (and brief drops). Rising edge also latches
    // * a full charge-boost window so a single true bit isn't a 150ms flash (NH-BOOST).
    const keepAliveMs = 280;
    cart.ramBoostActiveUntilMs = Math.max(
      Number(cart.ramBoostActiveUntilMs) || 0,
      nowBoostMs + keepAliveMs,
    );
  }
  // * Rising-edge boost FX for remote carts (non-host clients only reach this path).
  // * Guarded to running phase so migration/hello snapshot replays stay silent, and to
  // * non-local slots so a stale self-snapshot can't double the owner's own boost FX.
  if (snap.b && !cart._prevRemoteBoosting
    && GameState.getRoundState().phase === "running"
    && cart.slotIndex !== strictSlotIndexForConn(youConnId)) {
    const rb = CONFIG.cart?.ramBoost;
    const boostWindowMs = Math.max(
      400,
      (Number(rb?.durationSec) || 1.7) * 1.5 * 1000,
    );
    cart.ramBoostActiveUntilMs = Math.max(
      Number(cart.ramBoostActiveUntilMs) || 0,
      nowBoostMs + boostWindowMs,
    );
    callbacks.onRemoteBoostStart(cart);
  }
  cart.isRamBoosting = snap.b;
  cart.isBoosting = snap.b;
  cart._prevRemoteBoosting = Boolean(snap.b);

  if (typeof snap.ch === "boolean") {
    cart.isChargingBoost = snap.ch;
    if (snap.ch && !cart.boostChargeStartedAtMs) {
      cart.boostChargeStartedAtMs = nowBoostMs;
    } else if (!snap.ch) {
      cart.boostChargeStartedAtMs = 0;
    }
  }

  if (snap.h && !cart._prevRemoteHopping) {
    if (triggerHopRef) triggerHopRef(cart, performance.now());
    cart.takeoffPy = Array.isArray(snap.p) ? snap.p[1] : 0;
  }
  cart._prevRemoteHopping = Boolean(snap.h);

  if (cart.hopAwaitingLand && !isHost && cart.slotIndex !== strictSlotIndexForConn(youConnId)) {
    const vy = Array.isArray(snap.lv) ? snap.lv[1] : 0;
    const py = Array.isArray(snap.p) ? snap.p[1] : 0;
    const airborneVy = CONFIG.cart?.hop?.airborneVy ?? 1.15;
    const landingMaxMs = CONFIG.cart?.hop?.landingMaxMs ?? 900;
    const timeSinceHop = nowBoostMs - (cart.lastHopAtMs || 0);

    if (vy > airborneVy) {
      cart.hopAirborne = true;
    }
    if (
      cart.hopAirborne
      && vy < 0
      && Number.isFinite(cart.takeoffPy)
      && py <= cart.takeoffPy + 0.1
    ) {
      const intensity = Math.min(1, Math.max(0.22, (-vy) / 10));
      callbacks.onHopLandRef?.(cart, intensity);
      cart.hopAwaitingLand = false;
      cart.hopAirborne = false;
      cart.takeoffPy = undefined;
    } else if (timeSinceHop > landingMaxMs) {
      cart.hopAwaitingLand = false;
      cart.hopAirborne = false;
      cart.takeoffPy = undefined;
    }
  }

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
    // * s:false snapshot is stale pre-death state (the falls[] tail replay applies
    // * immediately while transforms drain through the interp buffer); the shatter's own lifetime,
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

  // * NET-MIG-3: empty buffer after promote must not paint remotes from lastCartsCache.
  if (hostMigrationAwaitingFirstSnap) return;

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
  // * NET-MIG-3: remotes stay collider-disabled until first post-epoch snap; do not
  // * re-arm them by snapping bodies to stale _netTarget* / lastCartsCache poses.
  if (hostMigrationAwaitingFirstSnap) return;
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
 * Re-applies the last hello/host carts snapshot once bodies exist (NET-2 + NET-1 S1).
 * Hello may arrive before cart bootstrap; apply is a no-op until bodies exist.
 * Quickplay rematch: non-host also calls this after arena rotation so host_spawn
 * poses that landed mid-collider-rebuild are restored before GO.
 * Only spawn-tagged caches (see lastCartsCacheIsSpawn) — never a stale live snap.
 */
export function reapplyCachedCartsSnapshot() {
  if (lastCartsCache && lastCartsCacheIsSpawn) applyCartsSnapshotToBodies(lastCartsCache);
}

/**
 * Appends a host-authoritative cart snapshot to the client-side interpolation buffer.
 * Drops oldest entries when the buffer exceeds `CONFIG.net.stateBufferMaxSize`.
 *
 * @param {number} serverNowMs HOST-domain timestamp (snapshot tHost / hostSpawn tHost —
 *   NET-CLK-1; the Party/Worker clock never feeds this buffer despite the legacy name).
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
  // * NET-MIG-3: first accepted post-migration snapshot ends freeze + re-enables remotes.
  clearHostMigrationFirstSnapWait();
}

// --- Host / client send loops ---

/**
 * Replays one host collision FX event on non-host clients.
 *
 * @param {object} msg Collision payload (single or batched entry).
 * @param {object} callbacks Injected FX helpers from main.
 * @returns {void}
 */
/** @type {Map<string, number>} NET-PRES-1 collision FX pair dedupe (performance.now). */
const recentHostCollisionFxByPair = new Map();
const COLLISION_FX_DEDUPE_MS = 250;

/**
 * Collision FX pair key shared by host-tail replay and NH-HIT optimistic local rams.
 * @param {number} slotA
 * @param {number} slotB
 * @param {number | string} [rammerSlot]
 */
function collisionFxPairKey(slotA, slotB, rammerSlot = "") {
  return `${Math.min(slotA, slotB)}:${Math.max(slotA, slotB)}:${rammerSlot ?? ""}`;
}

/**
 * NH-HIT: mark a pair as already presented (optimistic local ram FX) so the host
 * collisions[] tail does not double-fire SFX/particles within the dedupe window.
 * @param {number} slotA
 * @param {number} slotB
 * @param {number} [rammerSlot]
 */
export function noteOptimisticCollisionFx(slotA, slotB, rammerSlot) {
  if (typeof slotA !== "number" || typeof slotB !== "number") return;
  const nowFx = performance.now();
  const pairKey = collisionFxPairKey(slotA, slotB, typeof rammerSlot === "number" ? rammerSlot : slotA);
  recentHostCollisionFxByPair.set(pairKey, nowFx);
  if (recentHostCollisionFxByPair.size > 32) {
    for (const [k, t] of recentHostCollisionFxByPair) {
      if (nowFx - t > 1000) recentHostCollisionFxByPair.delete(k);
    }
  }
}

function replayHostCollisionFx(msg, callbacks) {
  const intensity = typeof msg.intensity === "number" ? msg.intensity : 0;
  const mp = msg.midpoint;
  const slotB = typeof msg.slotB === "number" ? msg.slotB : 0;
  if (!mp || typeof mp.x !== "number") return;

  // * NET-PRES-1: collisions[] ride unordered DC and always replay even when seq rejects
  // * the pose buffer. Prefer eid (`c{seq}.{i}`); pair-key still covers NH-HIT optimistic
  // * local rams (no shared eid) and hosts that omit eid.
  const nowFx = performance.now();
  if (markPresentationEid(seenCollisionPresentationEids, msg.eid, nowFx)) return;
  const slotA = typeof msg.slotA === "number" ? msg.slotA : -1;
  const pairKey = collisionFxPairKey(
    slotA,
    slotB,
    typeof msg.rammerSlot === "number" ? msg.rammerSlot : "",
  );
  const prevFx = recentHostCollisionFxByPair.get(pairKey);
  if (prevFx != null && nowFx - prevFx < COLLISION_FX_DEDUPE_MS) return;
  recentHostCollisionFxByPair.set(pairKey, nowFx);
  if (recentHostCollisionFxByPair.size > 32) {
    for (const [k, t] of recentHostCollisionFxByPair) {
      if (nowFx - t > 1000) recentHostCollisionFxByPair.delete(k);
    }
  }

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

/**
 * @param {object} msg Fall wire record
 * @param {object[] | null | undefined} [cartsSnap] Same-snapshot cart poses (optional).
 *   When present, the victim body is hard-snapped to host death pose BEFORE shatter so the
 *   pop is not at the non-host's predicted "where I was still driving" pose (run-7 combat).
 */
function processHostFallEvent(msg, cartsSnap) {
  if (isHost) return;
  // * NET-PRES-1: falls ride unreliable unordered DC. Prefer stamped eid (`f{seq}.{i}`) so
  // * late/reordered copies of the same KO do not re-fan reactors. Legacy hosts without eid
  // * keep the 600ms per-victim window (victim cannot legitimately fall twice inside respawn).
  const now = performance.now();
  if (typeof msg.eid === "string" && msg.eid.length > 0) {
    if (markPresentationEid(seenFallPresentationEids, msg.eid, now)) return;
  } else {
    const victimKey = typeof msg.slotId === "number"
      ? msg.slotId
      : (typeof msg.victimSlotIndex === "number" ? msg.victimSlotIndex : null);
    if (victimKey != null) {
      const prev = recentHostFallByVictim.get(victimKey);
      if (prev != null && now - prev < 600) return;
      recentHostFallByVictim.set(victimKey, now);
      if (recentHostFallByVictim.size > 16) {
        for (const [k, t] of recentHostFallByVictim) {
          if (now - t > 2000) recentHostFallByVictim.delete(k);
        }
      }
    }
  }

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
    // * Snap victim to the host pose that rode this same snapshot before detaching mesh
    // * parts — otherwise local prediction keeps driving past the true death point and the
    // * shatter plays "on the arena where I still was" (Intel Match A combat retest).
    const deathSnap = cartsSnap?.[slotIdx];
    if (victimCart?.body && deathSnap && Array.isArray(deathSnap.p) && deathSnap.p.length === 3) {
      applySnapshotToCartBody(victimCart, deathSnap);
    }
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

  // * The death sting lives in the host-only scheduleRespawn path (main.js), gated to the
  // * host's own cart — so a non-host's own death was silent (run-4 playtest). Mirror the
  // * same own-cart-only rule here off the wire fall record. Run-5: also mirror the charge
  // * teardown — dying with nitro held never fires onBoostRelease, so the chargeUp loop
  // * kept repeating until the round-boundary sweep.
  if (slotIdx != null && slotIdx === localSlotIdx) {
    callbacks.stopChargeSfxForCart(getAllCarts()?.[slotIdx] ?? null);
    playSfx("death");
  }
}

/** Last hostSendTick wall time — the setInterval burst-coalescing guard reads this. */
let lastHostSendTickMs = 0;

function stopHostSendLoop() {
  if (hostSendTimer) clearInterval(hostSendTimer);
  hostSendTimer = null;
  lastHostSendTickMs = 0;
  clearHostCollisionBatch();
  pendingHostFallEvents = [];
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
  hostMigrationAwaitingFirstSnap = false;
  recentHostFallByVictim.clear();
  recentHostCollisionFxByPair.clear();
  seenFallPresentationEids.clear();
  seenCollisionPresentationEids.clear();
  skipNextPhysicsStep = false;

  netSlots = [];
  lastSlotsJson = "";
  lastSlotsServerMs = 0;
  netStateBuffer = [];
  lastCartsCache = null;
  lastCartsCacheIsSpawn = false;
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
  lastCartsCacheIsSpawn = false;
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
  // * Host never latches isRamBoosting/isBoosting — those flags are only set on non-hosts
  // * when applying snap.b. Authoritative nitro window is ramBoostActiveUntilMs (charge
  // * release + instant NPC boost). Without it, b is always false on the wire → non-hosts
  // * never get remote trails / onRemoteBoostStart (NH-BOOST / MP-FX-1).
  const nowMs = performance.now();
  const isBoosting = Boolean(
    c.isRamBoosting
    || c._isBoosting
    || c.isBoosting
    || (Number(c.ramBoostActiveUntilMs) > 0 && nowMs <= c.ramBoostActiveUntilMs),
  );
  // * Hop has no persistent flag — derive from trigger-time freshness (triggerHop stamps
  // * lastHopAtMs) so snapshots can't miss the rising edge; same window trick as snap.b.
  const isHopping = nowMs - (c.lastHopAtMs || 0) < 150;

  return {
    p: [round3(t.x), round3(t.y), round3(t.z)],
    q: [round3(r.x), round3(r.y), round3(r.z), round3(r.w)],
    lv: [round3(lv.x), round3(lv.y), round3(lv.z)],
    av: [round3(av.x), round3(av.y), round3(av.z)],
    b: isBoosting,
    h: isHopping,
    ch: Boolean(c.isChargingBoost),
    c: c.cargoBay ? Boolean(c.cargoBay.visible) : true,
    s: Boolean(c.hasSpilled),
  };
}

/**
 * One 40Hz host snapshot: serialize carts, drain collision/fall batches, encode,
 * broadcast. `force` skips the running-phase gate for the single round-end flush
 * (see queueHostFallEvent) — everything else is identical to a scheduled tick.
 * @param {{ force?: boolean }} [opts]
 */
function hostSendTick(opts = {}) {
  const allCarts = getAllCarts();
  if (!partySocket || !isHost || !allCarts) return;
  if (!opts.force && GameState.getRoundState().phase !== "running") {
    // * Falls queued outside a running round with no flush (e.g. mid-podium after
    // * the forced round-end tick already ran) must not sit here — they would
    // * replay as phantom KOs on every non-host at the start of the NEXT round
    // * (kill feed, shatter, duplicate challenge/unlock credit).
    if (pendingHostFallEvents.length > 0) pendingHostFallEvents = [];
    // * 2e: don't let lobby/countdown silence count as one giant host_send_gap when
    // * the first running tick fires — reset the inter-send anchor.
    lastHostSendTickMs = 0;
    return;
  }

  // * Burst coalescing: setInterval callbacks queue while the host main thread hitches
  // * and fire back-to-back on recovery — a burst of near-identical-tHost snapshots that
  // * every non-host then reconciles one after another (visible as post-hitch rubberband
  // * churn, run-4). Skip ticks that fire sooner than half the send period; the forced
  // * round-end flush bypasses the guard.
  const sendNowMs = performance.now();
  if (!opts.force && sendNowMs - lastHostSendTickMs < 500 / CONFIG.net.hostSendHz) return;
  // * 2e: record inter-send gap BEFORE stamping lastHostSendTickMs (uses prior stamp).
  noteHostSendTick(sendNowMs);
  lastHostSendTickMs = sendNowMs;

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
  lastCartsCacheIsSpawn = false;
  const collisions = drainHostCollisionBatch();
  const falls = drainHostFallBatch();
  // * NET-PRES-1: stamp (seq, i) eids so non-hosts can dedupe late/reordered tails.
  stampTailEventIds(hostSeq, falls, collisions);
  // * tHost drives hostClock only (NET-CLK-1) — never the Party offset EWMA.
  // * (No levelId here: the binary snapshot encoder never carried it — level truth
  // * travels via host_round / hello / round, the quickplay-rotation design.)
  const tHost = getMonotonicNow();
  const payload = {
    type: MSG.hostTransform,
    seq: hostSeq,
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
}

export function startHostSendLoop() {
  stopHostSendLoop();
  if (!partySocket || !isHost || !getAllCarts()) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.hostSendHz));
  hostSendTimer = setInterval(hostSendTick, intervalMs);
}

/** Diag probe: false means sampleLocalInputForTick is a no-op (the 07-17 spawn freeze). */
export function isInputAxisWired() {
  return Boolean(getAxisRef);
}

export function sampleLocalInputForTick() {
  if (!partySocket || isHost || !getAxisRef) return null;
  if (netTestOn) __dbgInputCounters.sampleCalls += 1;

  const axis = getAxisRef();
  const forward = Number.isFinite(axis.forward) ? axis.forward : 0;
  const turn = Number.isFinite(axis.turn) ? axis.turn : 0;
  // * Prefer getAxis().boostHeld (keyboard + touch + gamepad). Fall back to isNitroHeldRef
  // * only if axis lacks boostHeld (legacy test stubs).
  const nitroHeld = typeof axis.boostHeld === "boolean"
    ? axis.boostHeld
    : (isNitroHeldRef ? isNitroHeldRef() : false);
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
    if (netTestOn) __dbgInputCounters.sends += 1;
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

    for (const cart of getAllCarts() || []) {
      cart.body?.wakeUp?.();
      // * CAM-1: non-host display pose must not survive host promote — main.js used to
      // * keep following a frozen `_displayPos` while the body drove on (cart moves,
      // * camera stuck). frameVisuals only refreshes display for non-host local.
      if (cart) cart._displayReady = false;
    }
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
    devLog(`[netcode] WebRTC recovery reconnect to peer ${connId} (${health.reason})`);
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
 * @param {{ hostId?: unknown, reason?: unknown }} msg
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
  pendingHostFallEvents = [];
  remoteInputsByConnId.clear();
  remoteInputQueuesByConnId.clear();
  remoteNitroLatchedByConnId.clear();
  hostLastProcessedInputSeq.clear();
  pendingInputs = [];
  inputSeq = 0;
  resetClientPredictionState();
  setAuthorityMode(nextIsHost);
  // * Living Store: mid-window CONFIG mutators die with the old host on every peer.
  // * New host re-derives schedule slots from round-elapsed; clients must not keep
  // * Rush Hour / Flash Sale overrides against base-rules host physics.
  clearDirectiveOnHostMigration();
  // * NET-MIG-3: freeze non-host prediction until first post-epoch snap (or freezeMaxMs).
  // * Past the freeze cap, keep awaitingFirstSnap so lastCartsCache / remote colliders
  // * cannot ghost-bounce until the new host's DC actually delivers a snap.
  if (!nextIsHost) {
    const maxMs = CONFIG.net.hostMigrationFreezeMaxMs
      ?? Math.max(CONFIG.net.hostMigrationFreezeMs ?? 300, 2000);
    hostMigrationFreezeUntilMs = getMonotonicNow() + maxMs;
    hostMigrationAwaitingFirstSnap = true;
    setRemoteBodiesEnabledForMigration(false);
  } else {
    hostMigrationFreezeUntilMs = 0;
    hostMigrationAwaitingFirstSnap = false;
    setRemoteBodiesEnabledForMigration(true);
  }
  hostEpoch += 1;
  netStateBuffer = [];
  recentHostFallByVictim.clear();
  recentHostCollisionFxByPair.clear();
  // * New host resets hostSeq — clear eid sets so f1.0 from the new host is not a false dup.
  seenFallPresentationEids.clear();
  seenCollisionPresentationEids.clear();
  // * Host migration is no longer silent — every client gets the PA callout
  // * and the HUD host glyph moves to the new host's chip on the next frame.
  const newHostSlot = Array.isArray(netSlots)
    ? netSlots.find((s) => s && s.connId === hostId)
    : null;
  if (newHostSlot?.name) {
    announce("new_host", { name: newHostSlot.name });
  }
  // * HOST-ROLE-1 lobby rebalance: plain-language toast so players know why
  // * the host glyph moved without a disconnect.
  if (msg?.reason === "host_quality") {
    try {
      const toast = typeof window !== "undefined" ? window.CartRave?.showToast : null;
      if (typeof toast === "function") {
        if (nextIsHost) {
          toast("You're hosting — stronger machine for smoother multiplayer.", 4500);
        } else if (newHostSlot?.name) {
          toast(`Host moved to ${newHostSlot.name} for smoother multiplayer.`, 4500);
        } else {
          toast("Host reassigned for smoother multiplayer.", 4500);
        }
      }
    } catch {
      // * Presentation-only.
    }
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
      // * Shuffled NPC colors per session (mirrors the server-side slot shuffle) —
      // * declashNpcSlotColors still resolves any clash with the human's pick.
      const npcColors = ["blue", "green", "yellow"];
      for (let i = npcColors.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [npcColors[i], npcColors[j]] = [npcColors[j], npcColors[i]];
      }
      netSlots = declashNpcSlotColors([
        { slotId: 0, kind: "human", connId: youConnId, name: savedUsername, color: colorToSend, lookHex },
        { slotId: 1, kind: "npc", connId: null, name: npcNames[1], color: npcColors[0] },
        { slotId: 2, kind: "npc", connId: null, name: npcNames[2], color: npcColors[1] },
        { slotId: 3, kind: "npc", connId: null, name: npcNames[3], color: npcColors[2] },
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

  // * Quickplay/solo ready reconcile (replaces the old one-shot auto-ready). A
  // * mid-session reconnect re-seats this client isReady=false AFTER the server's
  // * playAgain auto-ready pass, and these modes have no manual READY button — the
  // * room's #checkAllReady then waits forever (07-20 mpIntegration 48s lobby stall).
  // * Re-run from every hello/slots/round while in lobby so readiness converges.
  // * MUST send the idempotent SET form (`ready: true`), never a bare toggle: a
  // * toggle crossing playAgain's server-side ready-all flips the sender back to
  // * unready and re-creates the stall deterministically (07-20 v1 regression).
  let lastAutoReadySendAtMs = 0;
  const maybeAutoReadyLobby = () => {
    const mode = callbacks.detectGameMode();
    if (mode !== "quickplay" && mode !== "solo") return;
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (GameState.getRoundState().phase !== "lobby") return;
    const mySlot = Array.isArray(netSlots)
      ? netSlots.find((s) => s && s.connId === youConnId)
      : null;
    if (!mySlot || mySlot.kind !== "human" || mySlot.isReady) return;
    const now = getMonotonicNow();
    if (now - lastAutoReadySendAtMs < 1200) return;
    lastAutoReadySendAtMs = now;
    partySocket.send(JSON.stringify({ type: MSG.readyToggle, ready: true }));
  };

  // * COUNTDOWN-ARM-1: tell the DO carts+warm are done so continuous mode can mint
  // * startsAtMs. Server handler is idempotent; rematch lobby may re-send.
  let lastPlayReadySendAtMs = 0;
  const sendClientPlayReady = () => {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    const mode = callbacks.detectGameMode();
    if (mode === "solo" || mode === "testdrive") return;
    const now = getMonotonicNow();
    if (now - lastPlayReadySendAtMs < 1200) return;
    lastPlayReadySendAtMs = now;
    partySocket.send(JSON.stringify({ type: MSG.clientPlayReady }));
  };

  /** Rematch / lobby heartbeat: re-signal playReady when session carts are already warm. */
  const maybeSendPlayReadyLobby = () => {
    if (GameState.getRoundState().phase !== "lobby") return;
    if (typeof callbacks.isSessionPlayReady === "function" && !callbacks.isSessionPlayReady()) {
      return;
    }
    sendClientPlayReady();
  };

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
    devLog("[netcode] Socket closed", {
      didSendJoin,
      helloReceivedThisSession,
      code: ev?.code,
      reason: ev?.reason,
    });
    if (helloReceivedThisSession) {
      devLog("[netcode] Socket closed after successful hello (will retry with backoff)");
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
    devLog("[netcode] Socket error", {
      didSendJoin,
      helloReceivedThisSession,
    });
    if (helloReceivedThisSession) {
      devLog("[netcode] Socket error after successful hello (will retry with backoff)");
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
    // * NH-HIT lever 3 / HOST-ROLE-1: report host capability so lobby can rebalance
    // * toward a clearly stronger peer (not a hard ban on weak hosts).
    let hostScore = 50;
    try {
      hostScore = computeLocalHostCapabilityScore({
        probeGpu,
        getQualityTier,
      });
    } catch {
      hostScore = 50;
    }
    devLog("[netcode] Sending MSG.join", { name: savedUsername, clientId, hostScore });
    partySocket?.send(JSON.stringify({ type: MSG.join, name: savedUsername, clientId, hostScore }));
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
      devLog("[netcode] Received MSG.hello", {
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
        // * Cap-61: hello used to stamp countdown before carts-ready (hold only lived
        // * on MSG.round). isHost is not updated until setAuthorityMode below — use
        // * the same hostId/youConnId pair we just adopted.
        const helloIsHost = Boolean(hostId && youConnId && hostId === youConnId);
        const helloPhase = msg.round.phase ?? state.phase;
        if (!shouldHoldNonHostCountdownPhase(helloPhase, helloIsHost)) {
          GameState.setRoundPhase(helloPhase);
        }
        GameState.setRoundStartedAtMs(msg.round.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(msg.round.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(msg.round.winnerSlotIndex ?? state.winnerSlotIndex);
        if (msg.round.scores && typeof msg.round.scores === "object") {
          GameState.setRoundScores(msg.round.scores);
        }
        if (msg.round.endReason === "timer" || msg.round.endReason === "lastStanding" || msg.round.endReason == null) {
          GameState.setRoundEndReason(msg.round.endReason ?? null);
        }
        // * Parity with MSG.round — mid-round join during SD must latch the flag on
        // * hello (next host_round may lag). Host-authoritative sim is unaffected;
        // * HUD / SD presentation / promote inference read this client flag.
        if (typeof msg.round.isSuddenDeath === "boolean") {
          GameState.setSuddenDeath(msg.round.isSuddenDeath);
        }
      }
      if (GameState.getRoundState().phase === "running" && youConnId) {
        callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
      }
      callbacks.markFirstHelloReceived();
      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
        // * Hello carts are seat/spawn poses for cold join — tag so reapply after
        // * bootstrap still restores them (NET-2). Live 40Hz snaps clear the tag.
        lastCartsCacheIsSpawn = true;
        // * Bodies may not exist yet (NET-2 cold join) — reapply after cart bootstrap.
        applyCartsSnapshotToBodies(msg.carts);
      }

      setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));
      // * Host peer offers are opened from requestTurnCredentialsAndOpenPeers (TURN-gated).

      // * Enter game only after server hello — menu stays up while connecting.
      // * Await cart bootstrap before hideMenu so mid-round joiners don't drive a
      // * weld-at-spawn cart while shaders/Rapier are still compiling (NET-2 residual).
      const colorToSend = resolveServerColorPick();
      if (partySocket && partySocket.readyState === WebSocket.OPEN) {
        sendColorPick(colorToSend);
        if (GameState.getRoundState().phase === "running" && youConnId) {
          callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
        }
      }

      const finishHelloEnter = () => {
        reapplyCachedCartsSnapshot();
        callbacks.hideMenuRef();
        // * Cap-104/105: use live netSlots, not the hello snapshot. color_pick /
        // * cart_look rebroadcasts land during ensureSessionReady (often 1s+ of
        // * shader compile); materials applied from msg.slots stomped correct
        // * looks. frameVisuals re-tints base color every frame → "color fixes"
        // * while pattern uniforms stay stale ("pattern stuck" / blue valleys).
        // * Host is less exposed (hello already has own lookHex; shorter warm).
        const liveSlots = Array.isArray(netSlots) ? netSlots : msg.slots;
        callbacks.updateCartMaterialsFromSlots(liveSlots);
        callbacks.updateHudColorsFromSlots(liveSlots);
        callbacks.scheduleNameLabelUpdate();

        setTimeout(maybeAutoReadyLobby, 400);
        setTimeout(maybeSendPlayReadyLobby, 400);
      };

      /** @type {unknown} */
      let readyResult;
      try {
        readyResult = callbacks.ensureSessionReady();
      } catch {
        readyResult = null;
      }
      const safeReady = readyResult != null && typeof (/** @type {{ then?: unknown }} */ (readyResult)).then === "function"
        ? /** @type {Promise<unknown>} */ (readyResult)
        : Promise.resolve();
      void safeReady.then(() => {
        finishHelloEnter();
        sendClientPlayReady();
      }).catch(() => {
        // * Never softlock the join — enter even if cart warm fails.
        finishHelloEnter();
        // * Still signal so continuous lobby cannot wait the full 12s ceiling.
        sendClientPlayReady();
      });
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
          /** @type {number[]} */
          const seatedFromNpc = [];
          for (let i = 0; i < merged.length; i += 1) {
            const wasNpc = netSlots[i]?.kind === "npc";
            const isHumanNow = merged[i]?.kind === "human";
            if (wasNpc && isHumanNow) {
              callbacks.teleportCartToSpawn?.(i);
              seatedFromNpc.push(i);
            }
          }
          // * NET-1 residual: joiner must not inherit the replaced NPC's slot score.
          // * Server zeros on assign + broadcasts round; host also zeros so the next
          // * host_round doesn't re-inflate (monotonic clamp vs prev=0 allows increase).
          const phase = GameState.getRoundState().phase;
          if (
            seatedFromNpc.length > 0
            && (phase === "running" || phase === "countdown")
          ) {
            const scores = GameState.getRoundScores();
            for (const i of seatedFromNpc) scores[i] = 0;
            GameState.setRoundScores(scores);
            sendHostRound();
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
        maybeAutoReadyLobby();
        maybeSendPlayReadyLobby();
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
          recordCountdownAbort("round_msg_lobby", { prevPhase, newPhase, rejected: msg.rejected === true });
          callbacks.onCountdownCancelled?.();
          GameState.setRoundCountdownStartedAtMs(0);
          GameState.setRoundStartedAtMs(0);
        }
        // * Cap-59 hold: local phase stayed lobby while room counted then aborted.
        // * Still invalidate the deferred game_start waiter so we don't re-apply a dead arm.
        if (
          !isHost
          && typeof newPhase === "string"
          && newPhase === "lobby"
          && prevPhase === "lobby"
          && callbacks.hasPendingNonHostCountdownApply?.()
        ) {
          recordCountdownAbort("pending_apply_lobby", { prevPhase, newPhase });
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
          // * Lifetime YOUR STATS (wins/played/points) for non-hosts: only count
          // * server-validated podium rounds. Do NOT early-return the whole MSG.round
          // * handler when unvalidated — that skipped phase clocks/apply (NH-STATS).
          if (!isHost && r.validated === true) {
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
        // * Cap-59: non-host host_round(countdown) during play-entry applied phase
        // * mid-shader and the HUD/announcer ran behind a multi-10s longframe.
        // * Adopt clocks/scores so the deferred game_start apply stays in sync, but
        // * keep local phase off countdown until isSessionPlayReady (carts-ready).
        // * Cap-61: same gate on MSG.hello (see shouldHoldNonHostCountdownPhase).
        if (!shouldHoldNonHostCountdownPhase(newPhase, isHost)) {
          GameState.setRoundPhase(r.phase ?? state.phase);
        }
        GameState.setRoundStartedAtMs(r.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(r.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(r.winnerSlotIndex ?? null);
        if (r.endReason === "timer" || r.endReason === "lastStanding" || r.endReason == null) {
          GameState.setRoundEndReason(r.endReason ?? null);
        }
        if (r.scores && typeof r.scores === "object") GameState.setRoundScores(r.scores);
        if (typeof r.isSuddenDeath === "boolean") GameState.setSuddenDeath(r.isSuddenDeath);
        maybeAutoReadyLobby();
        maybeSendPlayReadyLobby();
      }
      return;
    }

    if (type === MSG.countdownCancel) {
      if (GameState.getRoundState().phase === "countdown") {
        recordCountdownAbort("countdown_cancel_msg", { prevPhase: "countdown" });
        callbacks.onCountdownCancelled?.();
        GameState.setRoundPhase("lobby");
        GameState.setRoundCountdownStartedAtMs(0);
        GameState.setRoundStartedAtMs(0);
      }
      maybeAutoReadyLobby();
      maybeSendPlayReadyLobby();
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
  lastCartsCacheIsSpawn = true;
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
  lastCartsCacheIsSpawn = true;

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

/**
 * Host-side room level change (Quickplay arena rotation). Updates the authoritative
 * latch + settings store WITHOUT firing onLevelIdChanged — the caller performs its own
 * arena swap. The next sendHostRound broadcasts the new id; the server latches and
 * rebroadcasts it, and non-host clients rotate via their onLevelIdChanged.
 * @param {string} levelId
 */
export function adoptRoomLevelAsHost(levelId) {
  if (!isHost) return;
  adoptAuthoritativeRoomLevel(levelId, { notify: false });
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
    lastCartsCacheIsSpawn = false;
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
    recentHostFallByVictim.clear();
    recentHostCollisionFxByPair.clear();
    seenFallPresentationEids.clear();
    seenCollisionPresentationEids.clear();
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
  /** Cap-61 unit seam: countdown hold predicate (hello + MSG.round). */
  shouldHoldNonHostCountdownPhase: (newPhase, clientIsHost) =>
    shouldHoldNonHostCountdownPhase(newPhase, clientIsHost),
  setIsSessionPlayReadyForTest: (fn) => {
    registerCallbacks({ isSessionPlayReady: typeof fn === "function" ? fn : () => true });
  },
  ensureHostPeerConnections: () => ensureHostPeerConnections(),
  maintainHostPeerConnections: () => maintainHostPeerConnections(),
  clearPeerReconnectCooldowns: () => peerReconnectNotBeforeMs.clear(),
  // * Input jitter / ackSeq contract (host path).
  handleRemoteClientInput: (input, fromConnId, seq) => handleRemoteClientInput(input, fromConnId, seq),
  drainRemoteInputJitterBuffers: () => drainRemoteInputJitterBuffers(),
  getHostLastProcessedInputSeq: (connId) => hostLastProcessedInputSeq.get(connId) || 0,
  getRemoteInputQueueLength: (connId) => remoteInputQueuesByConnId.get(connId)?.length ?? 0,
  getInputCounters: () => ({ ...__dbgInputCounters }),
  /** Push synthetic pending prediction frames (non-host history). */
  /** 2e: host-domain snap gap / silence unit tests. */
  noteSnapshotArrivalForTest: (tHost) => noteSnapshotArrival(tHost),
  resetNetFlowStatsForTest: () => resetNetFlowStats(),
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
  // * NET-1 rematch spawn reapply (host_spawn mid-arena-swap).
  applyHostSpawnSnapshot: (msg) => applyHostSpawnSnapshot(msg),
  setLastCartsCache: (carts, isSpawn = false) => {
    lastCartsCache = carts;
    lastCartsCacheIsSpawn = Boolean(isSpawn) && carts != null;
  },
  getLastCartsCache: () => lastCartsCache,
  getLastCartsCacheIsSpawn: () => lastCartsCacheIsSpawn,
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
  if (netTestOn) __dbgInputCounters.ingest += 1;

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
  if (netTestOn) __dbgInputCounters.drainCalls += 1;
  const now = performance.now();
  const delay = CONFIG.net.inputJitterBufferMs ?? 40;
  const allCarts = getAllCarts();

  for (const [connId, queue] of remoteInputQueuesByConnId) {
    if (!queue || queue.length === 0) continue;

    // * Drain every frame past the jitter delay in one pass (catch-up after hitch/burst).
    // * Continuous axes take the last sample; nitro uses OR across the batch so a single
    // * false in a multi-frame catch-up cannot cancel an in-progress charge (NH-BOOST).
    // * Rising-edge + hop still fire per frame.
    let lastThrottle = 0;
    let lastSteer = 0;
    let nitroAny = false;
    let nitroLast = false;
    let appliedAny = false;
    while (queue.length > 0 && queue[0].t <= now - delay) {
      const applied = queue.shift();
      if (netTestOn) __dbgInputCounters.drainApplied += 1;
      appliedAny = true;

      if (applied.seq > 0) {
        const existingSeq = hostLastProcessedInputSeq.get(connId) || 0;
        hostLastProcessedInputSeq.set(connId, Math.max(existingSeq, applied.seq));
      }

      lastThrottle = applied.throttle;
      lastSteer = applied.steer;
      nitroLast = Boolean(applied.nitro);
      if (nitroLast) nitroAny = true;

      const was = remoteNitroLatchedByConnId.get(connId) || false;
      if (!was && applied.nitro && allCarts && triggerRamBoostRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerRamBoostRef(cart, now);
        }
      }
      // * Provisional latch — final sticky value applied after the drain batch.
      remoteNitroLatchedByConnId.set(connId, Boolean(applied.nitro));

      if (applied.hop && allCarts && triggerHopRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCarts[slotIndex];
          if (cart) triggerHopRef(cart, now);
        }
      }
    }
    if (appliedAny) {
      // * Prefer OR for nitro so charge hold survives one dropped false in a burst.
      const slotIndex = strictSlotIndexForConn(connId);
      const cart = slotIndex >= 0 ? allCarts?.[slotIndex] : null;
      const stickyNitro = nitroAny || (Boolean(cart?.isChargingBoost) && nitroLast);
      const nitroHeld = Boolean(stickyNitro || nitroLast);
      remoteInputsByConnId.set(connId, {
        throttle: lastThrottle,
        steer: lastSteer,
        nitro: nitroHeld,
      });
      remoteNitroLatchedByConnId.set(connId, nitroHeld);
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
    lastCartsCacheIsSpawn = false;
  }
  if (!isHost) {
    // * Guard tHost > 0 like applyHostSpawnSnapshot does — a malformed binary header
    // * decodes Float64 fields to 0 (getSafeFloat64), which would feed a garbage
    // * ~1.7e12 offset sample and buffer a permanent time-0 "before" snapshot. The
    // * old `state.serverNowMs` fallback was dead compat: hostTransform is binary-only
    // * now and the decoder never emits that field.
    const tHostValid = typeof state.tHost === "number" && state.tHost > 0;
    const hostTime = tHostValid ? state.tHost : getMonotonicNow() - hostClock.offsetMs;
    if (tHostValid) updateHostClockOffset(hostTime);
    // * Pass tHost so gap/silence stats are host-domain (2e non-host arrival honesty).
    noteSnapshotArrival(tHostValid ? hostTime : 0);
    const seq = typeof state.seq === "number" ? state.seq : -1;
    bufferAuthoritativeState(hostTime, seq, state.carts, hostEpoch);
    // * Kill-credit / combo ages for host promotion (NET-MIG-1). Mirror host truth
    // * every snapshot: the host omits `attr` once all hit windows/combos close, so
    // * absent means EMPTY — holding the last non-empty value would resurrect
    // * minutes-old kill credit on promote (applyAttributionSnapshot re-anchors the
    // * cached ages to promote-time now).
    lastAttributionCache = (state.attr && typeof state.attr === "object") ? state.attr : null;
    if (Array.isArray(state.collisions)) {
      for (const ev of state.collisions) {
        replayHostCollisionFx(ev, callbacks);
      }
    }
    if (Array.isArray(state.falls)) {
      for (const ev of state.falls) {
        processHostFallEvent(ev, state.carts);
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