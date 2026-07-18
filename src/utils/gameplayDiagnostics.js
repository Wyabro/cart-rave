/**
 * gameplayDiagnostics.js — wires the game's runtime read-surfaces into window.__ccDiag.
 *
 * Installed once from main.js when ?diag is present. Two responsibilities:
 *
 *   1. Register read-only PROBES (registerDiagProbe) from accessors the game already exposes
 *      — round phase/clock, scores + match stats, announcer state, NPC AI, camera mode, boot,
 *      unlocks, challenges, active directive, feel CONFIG. Pure reads; nothing is mutated.
 *
 *   2. Subscribe to the Zustand stores and EMIT events (recordDiagEvent) on transitions the
 *      stores already broadcast synchronously — round-phase flips, per-slot score deltas,
 *      Sudden Death, level unlocks. This needs zero edits to the stores themselves.
 *
 * KO, announcer, and fatal-error events are emitted at their own source chokepoints
 * (koReactors / announcerManager / gameLoop) because they carry attribution the stores
 * don't hold. Everything here is inert unless ?diag installed the hub first.
 *
 * Follows the install*Harness(deps) convention of netTestHarness.js / visualHarness.js:
 * runtime-bound refs (the cart array, the camera, the mode detector) arrive via `deps`; the
 * stable module singletons are imported directly.
 */

import { Howler } from "howler";
import { registerDiagProbe, recordDiagEvent } from "./diagnostics.js";
import { readBootTimeline } from "./bootTimeline.js";
import { isLegalPhaseTransition } from "./invariants.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { unlockStore, isLevelUnlocked, getLevelUnlockStatus } from "../stores/unlockStore.js";
import { challengeStore } from "../stores/challengeStore.js";
import { snapshotMatchStats } from "../scoring/matchStats.js";
import { getAnnouncerDebugState } from "../announcer/announcerManager.js";
import { getActiveDirective } from "../directives/directiveEngine.js";
import { getCameraMode } from "../camera.js";
import { getIsHost, getPendingInputs, getLatestSnap } from "../netcode.js";
import { isWorldBootstrapped } from "../bootstrap.js";
import { getRoundClockNowMs, getRoundRemainingMs } from "../roundClock.js";
import { CONFIG } from "../config.js";
import { probeGpu } from "./gpuCaps.js";
import { settingsStore } from "../stores/settingsStore.js";

/** Arena roster for level-unlock diffing (classicRecord is unlocked by default). */
const UNLOCKABLE_LEVELS = ["backrooms", "zanzibar"];

/**
 * @typedef {object} GameplayDiagDeps
 * @property {() => Array<any> | null} getCarts        allCartsRef (per-slot; holes are null).
 * @property {() => Array<any> | null} getNetSlots     Per-slot lobby records.
 * @property {() => import("three").PerspectiveCamera | null} getCamera
 * @property {() => string} [getMode]                  detectGameMode() ("solo"|"quickplay"|…).
 * @property {() => string | null} [getLevelId]        Current arena id.
 * @property {() => number} [getLocalSlot]             Local player's slot index (-1 if unseated).
 * @property {() => Record<string, unknown>} [getNetDebug]  Main-closure netcode state (rotation gate, menu flag, …).
 */

/**
 * @param {GameplayDiagDeps} deps
 * @returns {void}
 */
export function installGameplayDiagnostics(deps) {
  registerProbes(deps);
  wireStoreEvents();
  // * Boot marker: one event so a driver can anchor "the menu was ready" in the log.
  const menuReady = readMenuReadyMs();
  recordDiagEvent("boot", "diag-installed", { menuReadyMs: menuReady });
}

/**
 * @param {GameplayDiagDeps} deps
 */
function registerProbes(deps) {
  registerDiagProbe("round", () => {
    const s = gameStore.getState();
    const durationMs = CONFIG.round?.durationMs ?? 0;
    return {
      phase: s.roundPhase,
      isSuddenDeath: s.isSuddenDeath,
      winnerSlotIndex: s.roundWinnerSlotIndex,
      endReason: s.roundEndReason,
      startedAtMs: s.roundStartedAtMs,
      remainingMs:
        s.roundPhase === RoundPhase.RUNNING && s.roundStartedAtMs
          ? getRoundRemainingMs(s.roundStartedAtMs, durationMs, getRoundClockNowMs())
          : null,
      mode: deps.getMode ? deps.getMode() : null,
      levelId: deps.getLevelId ? deps.getLevelId() : null,
      localSlotIndex: deps.getLocalSlot ? deps.getLocalSlot() : null,
    };
  });

  registerDiagProbe("score", () => {
    const s = gameStore.getState();
    return {
      scores: { ...s.roundScores },
      lastScoringHitAt: { ...s.lastScoringHitAt },
      comboTier: s.localComboTier,
      match: snapshotMatchStats(),
    };
  });

  registerDiagProbe("announcer", () => getAnnouncerDebugState());

  registerDiagProbe("directive", () => {
    const d = getActiveDirective();
    return d ? { id: d.id, ...serializeShallow(d) } : null;
  });

  // * Netcode/input state — added for the run-2 "non-host can't leave spawn" report.
  // * The load-bearing distinction an F8 must answer: pendingInputs === 0 while keys
  // * are held means input SAMPLING is starved (rAF/accumulator side); a large,
  // * old backlog means the host isn't ACKING (wire/host side).
  registerDiagProbe("net", () => {
    const pending = getPendingInputs() ?? [];
    const snap = getLatestSnap();
    const slot = deps.getLocalSlot ? deps.getLocalSlot() : -1;
    const localSnap = snap && slot >= 0 ? snap.carts?.[slot] : null;
    const oldest = pending.length > 0 ? pending[0] : null;
    return {
      isHost: getIsHost(),
      pendingInputs: pending.length,
      pendingNewestSeq: pending.length > 0 ? pending[pending.length - 1].seq : null,
      pendingOldestAgeMs:
        oldest?.tClient != null ? Math.round(performance.now() - oldest.tClient) : null,
      lastSnapSeq: snap?.seq ?? null,
      localAckSeq: localSnap?.ackSeq ?? null,
      localDeadFlag: localSnap?.s ?? null,
      ...(deps.getNetDebug ? deps.getNetDebug() : {}),
    };
  });

  registerDiagProbe("camera", () => {
    const cam = deps.getCamera ? deps.getCamera() : null;
    return {
      mode: cam ? getCameraMode(cam) : null,
      position: cam ? { x: round2(cam.position.x), y: round2(cam.position.y), z: round2(cam.position.z) } : null,
      fov: cam ? cam.fov : null,
    };
  });

  registerDiagProbe("boot", () => ({
    worldReady: isWorldBootstrapped(),
    mainReady: Boolean(/** @type {any} */ (window).__cartRaveMainReady),
    menuReadyMs: readMenuReadyMs(),
    // * Full cr:* mark sequence (play-entry, world-init-start, world-ready, carts-ready, …).
    // * world-ready − world-init-start = the cold-load stall window (the NET-2 mechanism).
    timeline: readBootTimeline(),
  }));

  // * Live GPU/audio resource counts — the leak-sentinel read. Every past leak in this
  // * codebase (suction rings, boost rings, countdown pulse, VFX dispose) would have shown
  // * up as one of these counters growing across rematch cycles; the gameharness `soak`
  // * scenario asserts exactly that. renderer/scene arrive via the DEV-only __cartRavePerf
  // * probe (scene.js/main.js), so fields degrade to null in prod builds — documented.
  registerDiagProbe("resources", () => {
    const w = /** @type {any} */ (window);
    const perf = w.__cartRavePerf;
    const info = perf?.renderer?.info;
    let sceneNodes = null;
    if (perf?.scene) {
      sceneNodes = 0;
      safeCall(() => perf.scene.traverse(() => { sceneNodes += 1; }));
    }
    return {
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      programs: info?.programs?.length ?? null,
      sceneNodes,
      howls: safeCall(() => /** @type {any} */ (Howler)?._howls?.length) ?? null,
      heapMB: safeCall(() => {
        const m = /** @type {any} */ (performance).memory;
        return m ? round2(m.usedJSHeapSize / 1048576) : null;
      }) ?? null,
    };
  });

  registerDiagProbe("ai", () => {
    const carts = deps.getCarts ? deps.getCarts() || [] : [];
    const slots = deps.getNetSlots ? deps.getNetSlots() || [] : [];
    const now = performance.now();
    /** @type {Array<object>} */
    const npcs = [];
    for (let i = 0; i < carts.length; i += 1) {
      const c = carts[i];
      if (!c || !c.isNpc) continue;
      npcs.push({
        slot: i,
        name: slots[i]?.name ?? null,
        target: c.aiTarget ? { x: round2(c.aiTarget.x), z: round2(c.aiTarget.z) } : null,
        paused: typeof c.aiPauseUntilMs === "number" && c.aiPauseUntilMs > now,
        reversing: typeof c.aiReverseUntilMs === "number" && c.aiReverseUntilMs > now,
        contestingPodium: typeof c.aiContestPodiumUntilMs === "number" && c.aiContestPodiumUntilMs > now,
        personality: c.aiPersonality?.name ?? c.aiPersonality ?? null,
      });
    }
    return { count: npcs.length, npcs };
  });

  registerDiagProbe("unlocks", () => {
    /** @type {Record<string, unknown>} */
    const levels = {};
    for (const id of UNLOCKABLE_LEVELS) {
      const st = safeCall(() => getLevelUnlockStatus(id));
      levels[id] = st
        ? { unlocked: Boolean(st.unlocked), progress: st.progress, goal: st.goal }
        : { unlocked: safeCall(() => isLevelUnlocked(id)) };
    }
    return { levels };
  });

  registerDiagProbe("challenges", () => {
    const st = challengeStore.getState();
    const shape = (list) =>
      Array.isArray(list)
        ? list.map((c) => ({ id: c.id, progress: c.progress, goal: c.goal, done: Boolean(c.completed) }))
        : [];
    return { daily: shape(st.dailyChallenges), weekly: shape(st.weeklyChallenges) };
  });

  registerDiagProbe("config", () => ({
    driving: serializeShallow(CONFIG.driving),
    ramming: serializeShallow(CONFIG.ramming),
    round: serializeShallow(CONFIG.round),
  }));

  registerDiagProbe("perf", () => {
    const w = /** @type {any} */ (window);
    return {
      loop: w.__ccLoopDbg ?? null,
      visual: w.__cartRave?.stats ? safeCall(() => w.__cartRave.stats()) : null,
    };
  });

  // * Browser/runtime/device context — pulled from the same signals telemetry + quality
  // * detection already read (errorReporter userAgent, gpuCaps, settingsStore tier, DPR). Its
  // * main consumer is __ccDiag.captureBundle(): a captured bug carries the device it happened
  // * on. Each read is guarded so a missing API degrades to null rather than breaking the probe.
  registerDiagProbe("runtime", () => {
    const nav = typeof navigator !== "undefined" ? navigator : /** @type {any} */ ({});
    const gpu = safeCall(() => probeGpu()) || null;
    return {
      userAgent: typeof nav.userAgent === "string" ? nav.userAgent.slice(0, 256) : null,
      gpuClass: gpu?.gpuClass ?? null,
      gpuRenderer: gpu?.rendererString ?? null,
      qualityTier: safeCall(() => settingsStore.getState().qualityTier) ?? null,
      devicePixelRatio: typeof window !== "undefined" ? (window.devicePixelRatio ?? null) : null,
      deviceMemory: /** @type {any} */ (nav).deviceMemory ?? null,
      hardwareConcurrency: nav.hardwareConcurrency ?? null,
      viewport:
        typeof window !== "undefined"
          ? { w: window.innerWidth ?? null, h: window.innerHeight ?? null }
          : null,
      url: typeof location !== "undefined" ? location.href : null,
    };
  });
}

/**
 * Subscribe to the stores and emit events on the transitions they already broadcast.
 * Zustand vanilla subscriptions fire synchronously inside setState, so no transition is
 * missed even while the rAF loop is frozen.
 */
function wireStoreEvents() {
  // — Round phase + scores + Sudden Death (gameStore) —
  let prevPhase = gameStore.getState().roundPhase;
  let prevScores = { ...gameStore.getState().roundScores };
  let prevSuddenDeath = gameStore.getState().isSuddenDeath;

  gameStore.subscribe((state) => {
    if (state.roundPhase !== prevPhase) {
      recordDiagEvent("round", "phase", { from: prevPhase, to: state.roundPhase });
      // * Invariant watchdog (observe-only): an illegal transition means a seam skipped a
      // * required state — the "wedged round" bug class. Evidence, never intervention.
      if (!isLegalPhaseTransition(prevPhase, state.roundPhase)) {
        recordDiagEvent("assert", "phase-transition", { from: prevPhase, to: state.roundPhase });
      }
      prevPhase = state.roundPhase;
    }
    if (state.isSuddenDeath && !prevSuddenDeath) {
      recordDiagEvent("round", "sudden-death", {});
    }
    prevSuddenDeath = state.isSuddenDeath;

    const scores = state.roundScores;
    for (const slot of [0, 1, 2, 3]) {
      const before = prevScores[slot] ?? 0;
      const after = scores[slot] ?? 0;
      if (after !== before) {
        recordDiagEvent("score", "change", { slot, delta: after - before, total: after });
      }
    }
    prevScores = { ...scores };
  });

  // — Level unlocks (unlockStore) —
  const prevUnlocked = new Set(UNLOCKABLE_LEVELS.filter((id) => safeCall(() => isLevelUnlocked(id))));
  unlockStore.subscribe(() => {
    for (const id of UNLOCKABLE_LEVELS) {
      const nowUnlocked = safeCall(() => isLevelUnlocked(id));
      if (nowUnlocked && !prevUnlocked.has(id)) {
        prevUnlocked.add(id);
        recordDiagEvent("unlock", "level", { levelId: id });
      }
    }
  });

  // — Challenge completions (challengeStore) —
  let prevDone = countCompleted(challengeStore.getState());
  challengeStore.subscribe((state) => {
    const done = countCompleted(state);
    if (done > prevDone) recordDiagEvent("challenge", "complete", { total: done });
    prevDone = done;
  });
}

/** Reads the sole boot perf mark; null before the menu is ready. */
function readMenuReadyMs() {
  try {
    const e = performance.getEntriesByName("cr:menu-ready")[0];
    return e ? Math.round(e.startTime) : null;
  } catch {
    return null;
  }
}

/** @param {any} state */
function countCompleted(state) {
  const count = (list) => (Array.isArray(list) ? list.filter((c) => c?.completed).length : 0);
  return count(state?.dailyChallenges) + count(state?.weeklyChallenges);
}

/** Shallow-serialize an object's primitive own-props (drops nested objects/fns to keep snapshots flat). */
function serializeShallow(obj) {
  if (!obj || typeof obj !== "object") return obj ?? null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const t = typeof v;
    if (t === "number" || t === "string" || t === "boolean") out[k] = v;
  }
  return out;
}

function round2(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
