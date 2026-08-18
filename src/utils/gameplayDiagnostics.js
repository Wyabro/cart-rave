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
import { getLongTaskStats } from "./longTaskProbe.js";
import { getSessionRenderScaleMul } from "./qualityTiers.js";
import { readBootTimeline } from "./bootTimeline.js";
import { readRendererInfo } from "./rendererInfo.js";
import { isLegalPhaseTransition } from "./invariants.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { unlockStore, isLevelUnlocked, getLevelUnlockStatus } from "../stores/unlockStore.js";
import { challengeStore } from "../stores/challengeStore.js";
import { snapshotMatchStats } from "../scoring/matchStats.js";
// * BUNDLE-1 Lever E, third edge: importing announcerManager/directiveEngine here dragged
// * cargoLoad -> groceryPool -> effects.js + simulation.js onto the EAGER graph, because
// * main.js installs these probes at boot. The Lever D hook table is dependency-free.
import { gameTeardownHooks } from "../orchestration/gameTeardownHooks.js";
import { getCameraMode } from "../camera.js";
import {
  getIsHost,
  getPendingInputs,
  getLatestSnap,
  getConnectionState,
  getNetFlowStats,
  getHostClockOffsetMs,
  getPartyClockOffsetMs,
} from "../netcode.js";
import { getAudioDebugState } from "../audioManager.js";
import { isWorldBootstrapped } from "../bootstrap.js";
import { getRoundClockNowMs, getRoundRemainingMs } from "../roundClock.js";
import { CONFIG } from "../config.js";
import { probeGpu } from "./gpuCaps.js";
import { getQualityTier, getSessionQualityTierOverride } from "./qualityMode.js";
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
  wireStoreEvents(deps);
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

  // * COUNTDOWN-SYNC probe: records the exact clock-domain inputs the HUD digit math
  // * consumes, so a single F8 during "3…2…1" proves whether the non-host countdown is
  // * anchored in the host clock domain (the 07-21 SYNC-1 fix) or drifting. Without this
  // * the fix is unverifiable from a capture — you'd only see the announcer digit events,
  // * not the clock math behind them. Mirrors hud.js updateStatus()/adjustedNow() exactly.
  registerDiagProbe("countdown", () => {
    const s = gameStore.getState();
    const countdownStartedAtMs = s.roundCountdownStartedAtMs || 0;
    const countdownMs = CONFIG.round?.countdownMs ?? 3000;
    const hostClockOffsetMs = getHostClockOffsetMs();
    const partyClockOffsetMs = getPartyClockOffsetMs();
    const roundClockNowMs = getRoundClockNowMs();
    // * Host-domain "now" — the precise value hud.js feeds the digit math (getRoundClockNowMs
    // * − hostClockOffset). On a correctly-anchored non-host this tracks the host's GO.
    const adjustedNowMs = roundClockNowMs - hostClockOffsetMs;
    const elapsedMs = adjustedNowMs - countdownStartedAtMs;
    const remainingMs = countdownMs - elapsedMs;
    const inCountdown = s.roundPhase === RoundPhase.COUNTDOWN;
    return {
      isHost: getIsHost(),
      phase: s.roundPhase,
      // Raw clock-domain inputs (SYNC-1 changed how countdownStartedAtMs is anchored):
      countdownStartedAtMs,
      countdownMs,
      hostClockOffsetMs,
      partyClockOffsetMs,
      roundClockNowMs,
      // Derived exactly as the HUD does — what the banner should read right now:
      adjustedNowMs,
      elapsedMs,
      remainingMs,
      digitN: inCountdown ? Math.max(1, Math.min(3, Math.ceil(remainingMs / (countdownMs / 3)))) : null,
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

  registerDiagProbe("announcer", () => gameTeardownHooks.getAnnouncerDebugState());

  // * Added alongside the net probe (07-17 run 2): "the splash isn't audible" class
  // * of reports needs the audio stack's actual state in the bundle, not a guess.
  registerDiagProbe("audio", () => getAudioDebugState());

  registerDiagProbe("directive", () => {
    const d = /** @type {{ id?: string } | null} */ (gameTeardownHooks.getActiveDirective());
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
      connectionState: getConnectionState(),
      pendingInputs: pending.length,
      pendingNewestSeq: pending.length > 0 ? pending[pending.length - 1].seq : null,
      pendingOldestAgeMs:
        oldest?.tClient != null ? Math.round(performance.now() - oldest.tClient) : null,
      lastSnapSeq: snap?.seq ?? null,
      localAckSeq: localSnap?.ackSeq ?? null,
      localDeadFlag: localSnap?.s ?? null,
      // * Run-4 gap: "stuttery / rubberbandy" bundles had no snapshot-cadence or
      // * reconcile-error evidence. flow = arrival-gap stats + reconcile magnitudes
      // * since the last prediction reset (see netcode.js netFlowStats).
      flow: getNetFlowStats(),
      ...(deps.getNetDebug ? deps.getNetDebug() : {}),
    };
  });

  registerDiagProbe("camera", () => {
    const cam = deps.getCamera ? deps.getCamera() : null;
    // * CAM-1: prove follow vs freeze — need local body pos next to camera pos.
    const localSlot = deps.getLocalSlot ? deps.getLocalSlot() : -1;
    const carts = deps.getCarts ? deps.getCarts() : null;
    const local = (localSlot >= 0 && Array.isArray(carts)) ? carts[localSlot] : null;
    let bodyPos = null;
    if (local?.body?.translation) {
      const t = local.body.translation();
      bodyPos = { x: round2(t.x), y: round2(t.y), z: round2(t.z) };
    }
    let displayPos = null;
    if (local?._displayPos) {
      displayPos = {
        x: round2(local._displayPos.x),
        y: round2(local._displayPos.y),
        z: round2(local._displayPos.z),
      };
    }
    return {
      mode: cam ? getCameraMode(cam) : null,
      position: cam ? { x: round2(cam.position.x), y: round2(cam.position.y), z: round2(cam.position.z) } : null,
      fov: cam ? cam.fov : null,
      isHost: getIsHost(),
      localSlot,
      bodyPos,
      displayReady: Boolean(local?._displayReady),
      displayPos,
      isShattering: Boolean(local?.isShattering),
      isSdSpectator: Boolean(local?.isSuddenDeathSpectator),
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
  // * scenario asserts exactly that. PERF-RENDERINFO-1: renderer.info now reads via the
  // * prod-safe module ref (setRendererRef in scene.js), so memory/programs are live in
  // * prod captures too — previously null because __cartRavePerf.renderer is DEV-only.
  // * sceneNodes still comes from __cartRavePerf.scene (DEV-only; main.js assembles it).
  registerDiagProbe("resources", () => {
    const w = /** @type {any} */ (window);
    const perf = w.__cartRavePerf;
    const info = readRendererInfo();
    let sceneNodes = null;
    if (perf?.scene) {
      sceneNodes = 0;
      safeCall(() => perf.scene.traverse(() => { sceneNodes += 1; }));
    }
    return {
      geometries: info?.geometries ?? null,
      textures: info?.textures ?? null,
      programs: info?.programs ?? null,
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
    const hostSim = Boolean(getIsHost());
    /** @type {Array<object>} */
    const npcs = [];
    for (let i = 0; i < carts.length; i += 1) {
      const c = carts[i];
      // * NPC identity is net-slot kind — cart.isNpc is never set on live carts
      // * (gameLoop resolveNpcCarts, netharness hostMigration, diagnostics.md).
      if (!c || slots[i]?.kind !== "npc") continue;
      const pos = safeCall(() => c.body?.translation()) ?? null;
      const vel = safeCall(() => c.body?.linvel()) ?? null;
      npcs.push({
        slot: i,
        name: slots[i]?.name ?? null,
        // * Position + planar speed make obstacle-wedging measurable from a harness
        // * (e.g. time spent inside the Storerooms furniture-pile footprint).
        pos: pos ? { x: round2(pos.x), y: round2(pos.y), z: round2(pos.z) } : null,
        speed: vel ? round2(Math.hypot(vel.x, vel.z)) : null,
        target: c.aiTarget ? { x: round2(c.aiTarget.x), z: round2(c.aiTarget.z) } : null,
        paused: typeof c.aiPauseUntilMs === "number" && c.aiPauseUntilMs > now,
        reversing: typeof c.aiReverseUntilMs === "number" && c.aiReverseUntilMs > now,
        contestingPodium: typeof c.aiContestPodiumUntilMs === "number" && c.aiContestPodiumUntilMs > now,
        personality: c.aiPersonality?.name ?? c.aiPersonality ?? null,
      });
    }
    // * Decision fields (target/pause/personality) update only on the host AI tick.
    // * Non-host still returns count + slot/name so the probe is not empty mid-round.
    return { count: npcs.length, npcs, hostSim };
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
        ? list.map((c) => ({ id: c.id, progress: c.progress, goal: c.goal, done: Boolean(c.isComplete) }))
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
      // * PERF-PASS-1: `loop` is cumulative for the page load and never resets, so a raw read
      // * cannot answer "what did THIS round do". These two difference it against the RUNNING
      // * window. `loopRound` is recomputed live on every probe read, so an F8 mid-round is a
      // * complete measurement — no need to play out to the podium.
      loopRound: safeCall(() => summarizePerfWindow(perfWindowOpen)) ?? null,
      rounds: perfRoundWindows,
      visual: w.__cartRave?.stats ? safeCall(() => w.__cartRave.stats()) : null,
      // * Run-7 P0: Long Task observer counters (empty until installLongTaskProbe).
      longtask: safeCall(() => getLongTaskStats()) ?? null,
      // * PROBE-WARM-RT-1: three.js GL program count. Compare warmupSettle baseline
      // * to mid-round F8 after first KO — a climb confirms RT-variant cache miss.
      programs: safeCall(() => {
        const r = w.__cartRavePerf?.renderer;
        return r?.info?.programs?.length ?? null;
      }),
    };
  });

  // * Browser/runtime/device context — pulled from the same signals telemetry + quality
  // * detection already read (errorReporter userAgent, gpuCaps, quality mode, DPR). Its
  // * main consumer is __ccDiag.captureBundle(): a captured bug carries the device it happened
  // * on. Each read is guarded so a missing API degrades to null rather than breaking the probe.
  // * DIAG-TIER-1: qualityTier is the *effective* tier (menu-preview LOD → session override →
  // * store). Stored preference and session override are reported beside it so a demotion is
  // * visible instead of looking like the menu setting.
  registerDiagProbe("runtime", () => {
    const nav = typeof navigator !== "undefined" ? navigator : /** @type {any} */ ({});
    const gpu = safeCall(() => probeGpu()) || null;
    return {
      userAgent: typeof nav.userAgent === "string" ? nav.userAgent.slice(0, 256) : null,
      gpuClass: gpu?.gpuClass ?? null,
      gpuRenderer: gpu?.rendererString ?? null,
      qualityTier: safeCall(() => getQualityTier()) ?? null,
      qualityTierStored: safeCall(() => settingsStore.getState().qualityTier) ?? null,
      qualityTierOverride: safeCall(() => getSessionQualityTierOverride()) ?? null,
      // * Run-6: effective sub-native scale (tier renderScale × session watchdog mul) —
      // * next capture from the Intel host shows whether the relief valve engaged.
      renderScaleMul: safeCall(() => getSessionRenderScaleMul()) ?? null,
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

// ————— PERF-PASS-1: per-round frame-time windows —————
// * The 60fps question is "was the mean frame time under 16.7ms during THIS round, in THIS
// * arena, on THIS machine". `window.__ccLoopDbg` is cumulative for the page load and has no
// * reset path (deliberately — a reset would race every other reader), so the window is taken
// * by differencing two snapshots of it around the RUNNING phase. That also excludes menu,
// * countdown and podium time structurally, which is what made the Run-8 segment averages
// * optimistic by 9–15s of cheap menu frames.

const ROUND_WINDOW_MAX = 8;
/** @type {Array<Record<string, unknown>>} */
let perfRoundWindows = [];
/**
 * @typedef {object} RendererWindowStats Per-frame renderer.info accumulators (PERF-RENDERINFO-1).
 * @property {number} samples Number of per-frame samples folded into the window.
 * @property {{ calls: number, triangles: number }} sum Sum of raw per-frame samples (mean = sum / samples).
 * @property {{ calls: number, triangles: number }} max Largest raw per-frame sample.
 */
/**
 * @typedef {object} PerfWindowOpen
 * @property {Record<string, number>} start
 * @property {number} startedAtMs
 * @property {unknown} levelId
 * @property {unknown} mode
 * @property {boolean} isHost
 * @property {unknown} tier0
 * @property {unknown} rsm0
 * @property {RendererWindowStats} renderer
 */
/** @type {PerfWindowOpen | null} */
let perfWindowOpen = null;

/** @param {number} n @param {number} [places] */
function roundTo(n, places = 3) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Read the cumulative loop counters. Returns null when the loop debug object does not exist
 * (no `?diag` / `?nettest`), which is the same condition that makes a window meaningless.
 * @returns {Record<string, number> | null}
 */
function loopCountersSnapshot() {
  const d = /** @type {any} */ (typeof window !== "undefined" ? window.__ccLoopDbg : null);
  if (!d) return null;
  return {
    frames: d.frames || 0,
    timed: d.timed || 0,
    sumMs: d.sumMs || 0,
    over16: d.over16 || 0,
    over33: d.over33 || 0,
    over66: d.over66 || 0,
    simMs: d.simMs || 0,
    visMs: d.visMs || 0,
    visSyncMs: d.visSyncMs || 0,
    visFxMs: d.visFxMs || 0,
    visHudMs: d.visHudMs || 0,
    visRenderMs: d.visRenderMs || 0,
  };
}

/**
 * Difference an open window against the counters as they stand right now.
 * @param {typeof perfWindowOpen} open
 * @returns {Record<string, unknown> | null}
 */
function summarizePerfWindow(open) {
  if (!open) return null;
  const end = loopCountersSnapshot();
  if (!end) return null;
  const s = open.start;
  const timed = end.timed - s.timed;
  // * Fewer than a handful of timed frames is a phase blip, not a round.
  if (timed < 5) return null;
  const sumMs = end.sumMs - s.sumMs;
  const simMs = end.simMs - s.simMs;
  const visMs = end.visMs - s.visMs;
  const visSyncMs = end.visSyncMs - s.visSyncMs;
  const visFxMs = end.visFxMs - s.visFxMs;
  const visHudMs = end.visHudMs - s.visHudMs;
  const visRenderMs = end.visRenderMs - s.visRenderMs;
  const meanMs = sumMs / timed;
  const cpuMeanMs = (simMs + visMs) / timed;
  const tier1 = safeCall(() => getQualityTier()) ?? null;
  const rsm1 = safeCall(() => getSessionRenderScaleMul()) ?? null;
  // * PERF-RENDERINFO-1: at-summarize renderer.info snapshot (memory counters are
  // * first-render ratchets, so "current" ≈ the window max).
  const ri = readRendererInfo();
  const renderSamples = open.renderer?.samples ?? 0;
  return {
    levelId: open.levelId,
    mode: open.mode,
    isHost: open.isHost,
    durMs: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - open.startedAtMs),
    frames: end.frames - s.frames,
    timed,
    meanMs: roundTo(meanMs),
    fps: roundTo(1000 / meanMs, 2),
    cpuMeanMs: roundTo(cpuMeanMs),
    simMeanMs: roundTo(simMs / timed),
    visMeanMs: roundTo(visMs / timed),
    // * PERF-CLASSIC-IGPU-1: visMs split. Same ?diag gate as simMs/visMs. visOther
    // * is the unwrapped remainder inside onVisualUpdate (FOV punch, arcade juice).
    visSyncMeanMs: roundTo(visSyncMs / timed),
    visFxMeanMs: roundTo(visFxMs / timed),
    visHudMeanMs: roundTo(visHudMs / timed),
    visRenderMeanMs: roundTo(visRenderMs / timed),
    visOtherMeanMs: roundTo((visMs - visSyncMs - visFxMs - visHudMs - visRenderMs) / timed),
    // * NOT a GPU timer — a subtraction. Holds present/vsync wait, browser compositing, and any
    // * main-thread work outside onFrame/onVisualUpdate. Naming it gpu* would launder a residual
    // * into a measurement, which is exactly run-4's "GC metronome" error.
    unaccountedMeanMs: roundTo(meanMs - cpuMeanMs),
    over16: end.over16 - s.over16,
    over33: end.over33 - s.over33,
    over66: end.over66 - s.over66,
    tier0: open.tier0,
    tier1,
    rsm0: open.rsm0,
    rsm1,
    // * A window that straddles an auto-quality demotion measured two different renderers.
    // * `?preset=` disables the watchdog, so this should never be true under the measurement
    // * protocol — it is here to catch a protocol slip, not to be relied on.
    straddledDemotion: open.tier0 !== tier1 || open.rsm0 !== rsm1,
    // * PERF-RENDERINFO-1: per-frame GPU cost (draw calls / triangles) over the window,
    // * folded by the per-frame renderer sampler while the window was open. Null when the
    // * renderer ref was never set or no frame was sampled. programs/geometries/textures
    // * are the at-summarize snapshot (monotone ratchets, so ≈ window max).
    callsMax: renderSamples > 0 ? open.renderer.max.calls : null,
    callsMean: renderSamples > 0 ? roundTo(open.renderer.sum.calls / renderSamples) : null,
    trianglesMax: renderSamples > 0 ? open.renderer.max.triangles : null,
    trianglesMean: renderSamples > 0 ? roundTo(open.renderer.sum.triangles / renderSamples) : null,
    programs: ri?.programs ?? null,
    geometries: ri?.geometries ?? null,
    textures: ri?.textures ?? null,
    pass: meanMs <= 16.7,
  };
}

/** @param {GameplayDiagDeps} deps */
function openPerfRoundWindow(deps) {
  const start = loopCountersSnapshot();
  if (!start) {
    perfWindowOpen = null;
    return;
  }
  perfWindowOpen = {
    start,
    startedAtMs: typeof performance !== "undefined" ? performance.now() : 0,
    levelId: deps.getLevelId ? safeCall(() => deps.getLevelId()) : null,
    mode: deps.getMode ? safeCall(() => deps.getMode()) : null,
    isHost: Boolean(safeCall(() => getIsHost())),
    tier0: safeCall(() => getQualityTier()) ?? null,
    rsm0: safeCall(() => getSessionRenderScaleMul()) ?? null,
    renderer: { samples: 0, sum: { calls: 0, triangles: 0 }, max: { calls: 0, triangles: 0 } },
  };
  startRendererSampler();
}

// ————— PERF-RENDERINFO-1: per-frame renderer.info sampler —————
// * info.render.{calls,triangles} are PER-FRAME counts: setRendererRef (scene.js) disables
// * info.autoReset and frameVisuals zeroes them once per frame at the visual seam, so each
// * read is the current frame's accumulated render cost. The sampler folds every frame's
// * read into the open window's max + sum (mean = sum / samples). rAF ordering keeps it
// * behind the game's render: the game loop registered its callback at boot, before ?diag
// * installs this module, so it always runs first and the sampler reads a completed frame.
let rendererSamplerRaf = null;

/** @param {PerfWindowOpen} open */
function sampleRendererWindow(open) {
  const s = readRendererInfo();
  if (!s) return;
  open.renderer.samples += 1;
  open.renderer.sum.calls += s.calls;
  open.renderer.sum.triangles += s.triangles;
  if (s.calls > open.renderer.max.calls) open.renderer.max.calls = s.calls;
  if (s.triangles > open.renderer.max.triangles) open.renderer.max.triangles = s.triangles;
}

function startRendererSampler() {
  if (rendererSamplerRaf !== null) return;
  if (typeof requestAnimationFrame === "undefined") return;
  const tick = () => {
    rendererSamplerRaf = null;
    if (!perfWindowOpen) return;
    sampleRendererWindow(perfWindowOpen);
    rendererSamplerRaf = requestAnimationFrame(tick);
  };
  rendererSamplerRaf = requestAnimationFrame(tick);
}

function stopRendererSampler() {
  if (rendererSamplerRaf !== null) {
    cancelAnimationFrame(rendererSamplerRaf);
    rendererSamplerRaf = null;
  }
}

function closePerfRoundWindow() {
  const record = summarizePerfWindow(perfWindowOpen);
  perfWindowOpen = null;
  stopRendererSampler();
  if (!record) return;
  perfRoundWindows.push(record);
  while (perfRoundWindows.length > ROUND_WINDOW_MAX) perfRoundWindows.shift();
  // * Emitted for timeline anchoring against KOs and qualityStepDown — but the summaries live
  // * in the probe, never only here. The ring evicts from the loudest channel, and on a bad
  // * machine `perf/longframe` IS the storm, so a perf event is the first thing dropped.
  recordDiagEvent("perf", "round", record);
}

/** Test-only reset so a suite can drive windows without leaking state between cases. */
export function __resetPerfRoundWindowsForTest() {
  perfRoundWindows = [];
  perfWindowOpen = null;
  stopRendererSampler();
}

/**
 * Subscribe to the stores and emit events on the transitions they already broadcast.
 * Zustand vanilla subscriptions fire synchronously inside setState, so no transition is
 * missed even while the rAF loop is frozen.
 * @param {GameplayDiagDeps} deps
 */
function wireStoreEvents(deps) {
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
      // * PERF-PASS-1: the frame-time window is exactly the RUNNING span. Opened/closed here
      // * rather than on a timer so countdown and podium frames can never enter the mean.
      if (state.roundPhase === RoundPhase.RUNNING) openPerfRoundWindow(deps);
      else if (prevPhase === RoundPhase.RUNNING) closePerfRoundWindow();
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
  const count = (list) => (Array.isArray(list) ? list.filter((c) => c?.isComplete).length : 0);
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
