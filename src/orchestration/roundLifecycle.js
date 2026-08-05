// roundLifecycle.js — countdown → running → podium → rematch (MAIN-1 Lever D)
// Mechanical extract from main(); round-lifecycle state lives here. Teardown/bridge
// keys are returned as bound methods for buildSessionBridgeContext (gameSession does not own them).

import * as CameraMod from "../camera.js";
import * as Netcode from "../netcode.js";
import * as GameState from "../gameState.js";
import * as Entities from "../entities.js";
import * as HUD from "../hud.js";
import * as GroceryPool from "../effects/groceryPool.js";
import * as ArenaAmbience from "../ambience/arenaAmbience.js";
import * as SfxSynth from "../sfxSynth.js";
import { CONFIG } from "../config.js";
import { ROUND_DURATION_MS } from "../../shared/roundConstants.js";
import { getCurrentLevelId } from "../levelManager.js";
import { getRoundClockNowMs } from "../roundClock.js";
import { armRoundStartRenderProbe } from "../gameLoop.js";
import {
  cleanupSuddenDeathState,
  ensureSuddenDeathOnHostPromote,
} from "../gameFlow.js";
import {
  shouldAllowPodiumEnd,
  notePodiumEndSend,
  clearPodiumEndLatch,
} from "../utils/podiumEndLatch.js";
import { challengeStore, ChallengeTracker, CHALLENGE_POOL } from "../stores/challengeStore.js";
import { PROGRESSION_EVENTS } from "../progression/eventIds.js";
import {
  getMatchStats,
  resetMatchStats,
  setMatchStatsLocalSlot,
  snapshotMatchStats,
} from "../scoring/matchStats.js";
import { shiftDirectiveTimersBy } from "../directives/directiveEngine.js";
import { announce, stopAnnouncer } from "../announcer/announcerManager.js";
import {
  animateResultsPodiumShow,
  animateResultsDismiss,
  cancelResultsAnimations,
  spawnResultsConfetti,
  spawnResultsDefeatWilt,
} from "../ui/resultsOverlay.js";
import { emblemForSlot } from "../npcNames.js";
import { svgIcon } from "../ui/icons.js";
import { resetArenaReactiveLights } from "../arenaReactiveLights.js";
import { displayCssColorForSlot } from "./cartIdentity.js";
import { getPersonalStats, savePersonalStats } from "../ui/menuStats.js";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";

const LAST_CART_STANDING_FLOURISH_MS = 3000;
const PODIUM_SKIP_GRACE_MS = 450;

/**
 * Per-arena fly-over sizing. Pure — safe to call before createRoundLifecycle.
 * @returns {{ radius: number, height: number } | undefined}
 */
export function resolveCinematicCountdownOverrides() {
  if (getCurrentLevelId() === "zanzibar") {
    const circumR = CONFIG.record.radius / Math.cos(Math.PI / 8);
    return { radius: circumR + 4, height: 16 };
  }
  return undefined;
}

/**
 * Countdown / running / podium / rematch orchestration.
 * Owns round-lifecycle mutable state; returns bound methods for sessionBridge + loop deps.
 * @param {object} deps
 */
export function createRoundLifecycle(deps) {
  const {
    camera,
    gameCtx,
    teleportCartToSpawn,
    getAllCartsRef,
    getHud,
    getResultsUi,
    getMatchHistory,
    getIsNewPersonalBest,
    setIsNewPersonalBest,
    localCartForConnId,
    refreshHiddenHostLifecycle,
    updateTouchControlsVisibility,
    stopAllChargeSfx,
    stopChargeSfxForCart,
    getArenaRotationInFlight,
    pickNextQuickplayArenaId,
    rotateLoadedArenaInPlace,
  } = deps;

  const syncRoundPhase = GameState.syncRoundPhase;
  const detectGameMode = Netcode.detectGameMode;

  /** @type {string | null} Dedupe key so host endRound + redelivered MSG.round never double-count. */
  let lastPodiumStatsRoundKey = null;

  /**
   * Records end-of-round match history and local personal stats at podium entry.
   * @param {number | "draw" | null} winnerSlotIndex
   * @param {Record<number, number> | null | undefined} scoresSrc
   */
  function recordPodiumStats(winnerSlotIndex, scoresSrc) {
    const startedAtMs = Number(GameState.getRoundState()?.startedAtMs) || 0;
    const winKey =
      winnerSlotIndex === "draw"
        ? "draw"
        : typeof winnerSlotIndex === "number" && Number.isFinite(winnerSlotIndex)
          ? String(winnerSlotIndex)
          : "0";
    if (startedAtMs > 0) {
      const key = `${startedAtMs}:${winKey}`;
      if (lastPodiumStatsRoundKey === key) return;
      lastPodiumStatsRoundKey = key;
    }

    /** @type {Record<number, number>} */
    const scores = {};
    for (let i = 0; i < 4; i += 1) {
      const raw = scoresSrc?.[i] ?? /** @type {any} */ (scoresSrc)?.[String(i)];
      scores[i] = Number(raw ?? 0);
    }

    const matchHistory = getMatchHistory();
    matchHistory.push({
      endedAtMs: Date.now(),
      winnerSlotIndex: winnerSlotIndex === "draw" ? "draw" : (typeof winnerSlotIndex === "number" && Number.isFinite(winnerSlotIndex) ? winnerSlotIndex : 0),
      scores,
      mode: /** @type {any} */ (detectGameMode()),
    });
    while (matchHistory.length > 10) matchHistory.shift();

    if (winnerSlotIndex !== "draw" && detectGameMode() === "solo") {
      let humanCount = 0;
      for (let i = 0; i < 4; i += 1) {
        const s = Netcode.getNetSlots()[i];
        if (s && s.kind === "human" && s.connId != null) humanCount += 1;
      }
      if (humanCount === 1) {
        const stats = getPersonalStats();
        stats.soloGames += 1;
        savePersonalStats(stats);
      }
    }

    if (winnerSlotIndex !== "draw") {
      const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      if (mySlotIdx >= 0) {
        const stats = getPersonalStats();
        const myScore = Number(scores[mySlotIdx] ?? 0);
        stats.matches += 1;
        stats.totalPoints += myScore;
        if (winnerSlotIndex === mySlotIdx) stats.wins += 1;
        savePersonalStats(stats);

        const storedBest = Number(storageGet(STORAGE_KEYS.bestScore, "0")) || 0;
        if (myScore > storedBest) {
          setIsNewPersonalBest(true);
          storageSet(STORAGE_KEYS.bestScore, String(myScore));
        }
      }
    }
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let roundCountdownTimeoutId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let roundPodiumTimeoutId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let autoContinuePodiumTimeoutId = null;
  let autoContinuePodiumDeadlineMs = 0;
  /** @type {string | null} */
  let autoContinuePodiumKey = null;
  let clientPodiumAutoContinueDeadlineMs = 0;
  /** @type {number | null} */
  let soloPauseStartedAtMs = null;
  /** @type {number | null} */
  let soloPauseCountdownRemainingMs = null;
  /** @type {Set<string>} */
  let challengesCompleteAtRoundStart = new Set();
  let lastResultsOverlayKey = null;
  let lastPodiumCelebratedRound = null;
  let podiumConfettiFiredKey = null;
  let podiumChallengesRecordedKey = null;
  let lastRoundEndedInSuddenDeath = false;
  let podiumCameraKey = null;
  let podiumPhaseEnteredAtMs = 0;
  let podiumWinnerCamSkipped = false;
  let podiumGamepadButtonHeld = true;
  let podiumSkipListenersOn = false;


  function requestPodiumWinnerCamSkip() {
    const camElapsed = podiumPhaseEnteredAtMs > 0 ? performance.now() - podiumPhaseEnteredAtMs : 0;
    if (camElapsed < PODIUM_SKIP_GRACE_MS) return;
    podiumWinnerCamSkipped = true;
    removePodiumSkipListeners();
  }

  /** @param {KeyboardEvent | PointerEvent} e */
  function podiumSkipInputHandler(e) {
    if (e.type === "keydown") {
      const ke = /** @type {KeyboardEvent} */ (e);
      if (ke.repeat) return; // keys still held from gameplay don't skip
      if (ke.key === "Escape") return; // Escape keeps its exit-to-menu semantics
    }
    requestPodiumWinnerCamSkip();
  }

  function installPodiumSkipListeners() {
    if (podiumSkipListenersOn) return;
    podiumSkipListenersOn = true;
    window.addEventListener("keydown", podiumSkipInputHandler, true);
    window.addEventListener("pointerdown", podiumSkipInputHandler, true);
  }

  function removePodiumSkipListeners() {
    if (!podiumSkipListenersOn) return;
    podiumSkipListenersOn = false;
    window.removeEventListener("keydown", podiumSkipInputHandler, true);
    window.removeEventListener("pointerdown", podiumSkipInputHandler, true);
  }

  /** Polls gamepads for a fresh any-button press during the winner cam (rising edge only). */
  function pollPodiumGamepadSkip() {
    let pressed = false;
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad?.connected) continue;
      for (const b of pad.buttons) {
        if (b?.pressed) { pressed = true; break; }
      }
      if (pressed) break;
    }
    if (pressed && !podiumGamepadButtonHeld) requestPodiumWinnerCamSkip();
    podiumGamepadButtonHeld = pressed;
  }

/** Pre-round camera fly-over, sized to the active arena (see {@link resolveCinematicCountdownOverrides}). */
function beginRoundFlyover() {
  // * PERF-WARM (§4): the round-start freeze lands AFTER carts-ready, on the first live
  // * render at this fly-over pose — outside every warm.* span. Arm the render probe so
  // * the next few frames' composer.render() is timed as `render.roundStart`; an F8
  // * longframe on those frames then names the render as the freeze owner.
  armRoundStartRenderProbe(8);
  CameraMod.beginCinematicCountdown(camera, resolveCinematicCountdownOverrides());
}

/**
 * World position of the winning cart (arena center fallback for draws / missing bodies).
 * @returns {{ x: number, y: number, z: number }}
 */
function getWinnerWorldPos() {
  const winnerIdx = GameState.getRoundState().winnerSlotIndex;
  if (winnerIdx === "draw" || !Number.isFinite(winnerIdx)) return { x: 0, y: 0, z: 0 };
  const winnerCart = getAllCartsRef()?.[winnerIdx];
  if (winnerCart?.body) {
    const t = winnerCart.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }
  if (winnerCart?.mesh) {
    const p = winnerCart.mesh.position;
    return { x: p.x, y: p.y, z: p.z };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * Starts the post-game winner camera once per match and fires victory/defeat VO.
 * Idempotent for a given `startedAtMs:winner` key.
 */
function beginPodiumPresentation() {
  const rs = GameState.getRoundState();
  const key = `${rs.startedAtMs}:${rs.winnerSlotIndex}`;
  if (podiumCameraKey === key) {
    // * Mode may have been cleared — re-arm without resetting the 5s timer.
    if (CameraMod.getCameraMode(camera) !== CameraMod.CameraMode.CINEMATIC_PODIUM) {
      CameraMod.beginCinematicPodium(camera, getWinnerWorldPos());
    } else {
      CameraMod.setCinematicPodiumTarget(camera, getWinnerWorldPos());
    }
    return;
  }
  podiumCameraKey = key;
  podiumPhaseEnteredAtMs = performance.now();
  podiumConfettiFiredKey = null;
  // * Any-input skip: fresh presses (not held-from-gameplay inputs) jump straight
  // * to the results panel; the celebration VO/confetti already fired and play out.
  podiumWinnerCamSkipped = false;
  podiumGamepadButtonHeld = true;
  installPodiumSkipListeners();
  CameraMod.beginCinematicPodium(camera, getWinnerWorldPos());

  // * Voice + a first confetti burst play over the pure winner cam, so the orbit frames
  // * a celebrated cart; a second burst fires when the results panel lands.
  if (lastPodiumCelebratedRound !== rs.startedAtMs) {
    lastPodiumCelebratedRound = rs.startedAtMs;
    const celebrationWinner = rs.winnerSlotIndex;
    if (celebrationWinner !== "draw" && typeof celebrationWinner === "number") {
      const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      const isLocalWinner = mySlotIdx >= 0 && celebrationWinner === mySlotIdx;
      // * Participated but didn't win — defeat is its own quieter beat: no winner-confetti,
      // * no crowd roar. Spectators (mySlotIdx < 0) still see the full celebration.
      const isLocalLoser = mySlotIdx >= 0 && !isLocalWinner;
      if (isLocalWinner) {
        announce("victory");
      } else if (isLocalLoser) {
        announce("defeat");
      }
      if (!isLocalLoser) {
        if (getHud()?.root) {
          const winnerCss = displayCssColorForSlot(Netcode.getNetSlots()[celebrationWinner]);
          spawnResultsConfetti(getHud().root, [winnerCss, "#ff2bd6", "#22e6ff", "#ffe53d", "#ffffff"]);
        }
        // * Victory roar on the match's single peak beat — every arena. (The frequent
        // * KO-time cheer stays Classic-only in onLocalKillConfirm/onArenaKoFlash.)
        SfxSynth.playCrowdCheer(1);
        ArenaAmbience.bumpCrowdExcitement(1);
      }
    } else {
      // * Draw: no victory/defeat VO fires, so nothing interrupts an in-flight
      // * callout ("10 SECONDS" / "SCOREBOARD" can hold ~2s over the podium cam).
      // * Hard-silence so the podium opens clean; lobby entry would do this later
      // * anyway (announcerDirector phase watcher).
      stopAnnouncer();
    }
  }
}

function clearPodiumPresentation() {
  podiumCameraKey = null;
  podiumPhaseEnteredAtMs = 0;
  podiumConfettiFiredKey = null;
  podiumWinnerCamSkipped = false;
  removePodiumSkipListeners();
  if (CameraMod.getCameraMode(camera) === CameraMod.CameraMode.CINEMATIC_PODIUM) {
    CameraMod.endCinematicCountdown(camera);
  }
}

function updateResultsOverlay() {
  const resultsUi = getResultsUi();
    if (!resultsUi) return;
  const { overlay, panel, title, verdict, finalScores, receipt, playAgain, mainMenuBtn } = resultsUi;
  const roundState = GameState.getRoundState();
  if (roundState.phase === "podium") {
    // * Ensure host + all clients share the same winner-cam presentation path.
    beginPodiumPresentation();

    // * Hold the opaque results UI until the pure winner camera shot finishes —
    // * or the player skips it with any fresh input (keyboard/mouse/touch via
    // * listeners, gamepad via the per-frame rising-edge poll below).
    const camElapsed = podiumPhaseEnteredAtMs > 0
      ? performance.now() - podiumPhaseEnteredAtMs
      : 0;
    if (camElapsed < CameraMod.PODIUM_WINNER_CAM_MS && !podiumWinnerCamSkipped) {
      pollPodiumGamepadSkip();
    }
    if (camElapsed < CameraMod.PODIUM_WINNER_CAM_MS && !podiumWinnerCamSkipped) {
      if (overlay.style.display !== "none") {
        cancelResultsAnimations(overlay);
        overlay.style.display = "none";
        overlay.style.pointerEvents = "none";
      }
      return;
    }
    removePodiumSkipListeners();

    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
    const isHost = Netcode.getIsHost();
    const scores = GameState.getRoundScores() || {};
    const stats = getPersonalStats();
    if (
      lastResultsOverlayKey?.winner === roundState.winnerSlotIndex
      && lastResultsOverlayKey?.s0 === (scores[0] ?? 0)
      && lastResultsOverlayKey?.s1 === (scores[1] ?? 0)
      && lastResultsOverlayKey?.s2 === (scores[2] ?? 0)
      && lastResultsOverlayKey?.s3 === (scores[3] ?? 0)
      && lastResultsOverlayKey?.hist === getMatchHistory().length
      && lastResultsOverlayKey?.host === isHost
      && lastResultsOverlayKey?.matches === stats.matches
      && lastResultsOverlayKey?.wins === stats.wins
      && lastResultsOverlayKey?.totalPoints === stats.totalPoints
      && lastResultsOverlayKey?.solo === (stats.soloGames ?? 0)
      && lastResultsOverlayKey?.endReason === roundState.endReason
    ) {
      maybeScheduleAutoContinuePodium();
      updatePlayAgainCountdownLabel(playAgain);
      return;
    }
    lastResultsOverlayKey = {
      winner: roundState.winnerSlotIndex,
      s0: scores[0] ?? 0,
      s1: scores[1] ?? 0,
      s2: scores[2] ?? 0,
      s3: scores[3] ?? 0,
      hist: getMatchHistory().length,
      host: isHost,
      matches: stats.matches,
      wins: stats.wins,
      totalPoints: stats.totalPoints,
      solo: stats.soloGames ?? 0,
      endReason: roundState.endReason ?? null,
    };

    const mySlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    const isLocalWinner = mySlotIdx >= 0 && roundState.winnerSlotIndex === mySlotIdx;
    // * Once per podium — the overlay re-renders whenever a key field changes (late stat
    // * write, host flip), and challenge credit must not double-count on a re-render.
    const challengeRoundKey = `${roundState.startedAtMs}:${roundState.winnerSlotIndex}`;
    if (isLocalWinner && podiumChallengesRecordedKey !== challengeRoundKey) {
      podiumChallengesRecordedKey = challengeRoundKey;
      if (roundState.endReason === "lastStanding") {
        ChallengeTracker.record(PROGRESSION_EVENTS.LAST_STANDING);
      }
      if (lastRoundEndedInSuddenDeath) {
        ChallengeTracker.record(PROGRESSION_EVENTS.SUDDEN_DEATH_WIN);
      }
      const localCart = localCartForConnId();
      // * "Win without spilling": hasSpilled is per-life (reset on respawn), so a fall
      // * mid-round must also disqualify — localDeaths accumulates for the whole round.
      if (localCart && !localCart.hasSpilled && getMatchStats().localDeaths === 0) {
        ChallengeTracker.record(PROGRESSION_EVENTS.UNTOUCHABLE);
      }
    }

    // * Local-outcome treatment: a defeat gets a desaturated, un-celebrated panel; a win
    // * keeps the bright party. Classes drive results.css; spectators (mySlotIdx < 0) get
    // * neither and see the normal winner celebration.
    const isLocalLoser = mySlotIdx >= 0
      && typeof roundState.winnerSlotIndex === "number"
      && roundState.winnerSlotIndex !== mySlotIdx;
    overlay.classList.toggle("results-defeat", isLocalLoser);
    overlay.classList.toggle("results-victory", isLocalWinner);

    // * Once per podium presentation, when the results panel actually appears: the
    // * winner gets neon confetti; the local loser gets the "opposite of confetti" —
    // * a field of spoiled groceries that sag and deflate (ART-3). A draw gets neither.
    const confettiKey = `${roundState.startedAtMs}:${roundState.winnerSlotIndex}`;
    if (podiumConfettiFiredKey !== confettiKey) {
      podiumConfettiFiredKey = confettiKey;
      const celebrationWinner = roundState.winnerSlotIndex;
      if (isLocalLoser) {
        spawnResultsDefeatWilt(overlay);
      } else if (celebrationWinner !== "draw" && typeof celebrationWinner === "number") {
        const winnerCss = displayCssColorForSlot(Netcode.getNetSlots()[celebrationWinner]);
        spawnResultsConfetti(overlay, [winnerCss, "#ff2bd6", "#22e6ff", "#ffe53d", "#ffffff"]);
      }
    }

    playAgain.disabled = !isHost;
    if (isHost) {
      playAgain.textContent = "PLAY AGAIN";
    } else {
      // * Arm a local auto-continue estimate so non-hosts see a countdown, not a
      // * dead "WAITING FOR HOST…" with no sense of when the next round starts.
      const mode = detectGameMode();
      if (
        (mode === "quickplay" || mode === "friends")
        && !clientPodiumAutoContinueDeadlineMs
      ) {
        const delayMs = mode === "friends" ? 10000 : 5000;
        clientPodiumAutoContinueDeadlineMs = performance.now() + delayMs;
      }
      playAgain.innerHTML = `<span style="opacity:.8;margin-right:6px;">${svgIcon("host", { label: "Host" })}</span>WAITING FOR HOST…`;
    }

    const slotDisplayName = (slotIndex) => Netcode.getNetSlots()[slotIndex]?.name || `P${slotIndex + 1}`;

    // * 7g: the headline is the PA callout ("THE STORE IS NOW CLOSED", set once
    // * in initResultsOverlay); the per-round verdict lives on its own line and
    // * the winner's color still drives --title-glow on the headline.
    const winnerIdx = roundState.winnerSlotIndex;
    if (winnerIdx === "draw") {
      verdict.textContent = "DRAW";
      title.style.setProperty("--title-glow", "#ffe53d");
    } else {
      const idx = Number.isFinite(winnerIdx) ? winnerIdx : null;
      if (idx != null) {
        const score = scores[idx] != null ? scores[idx] : 0;
        let maxScore = 0;
        let tiedAtTop = 0;
        for (let ti = 0; ti < 4; ti += 1) {
          const ts = Number(scores[ti] ?? 0);
          if (ts > maxScore) maxScore = ts;
        }
        for (let ti = 0; ti < 4; ti += 1) {
          if (Number(scores[ti] ?? 0) === maxScore) tiedAtTop += 1;
        }
        const tieSuffix = tiedAtTop > 1 ? " (TIEBREAK)" : "";
        if (roundState.endReason === "lastStanding") {
          verdict.textContent = `${slotDisplayName(idx)} wins — LAST CART STANDING`;
        } else {
          verdict.textContent = `${slotDisplayName(idx)} wins — ${score} pts${tieSuffix}`;
        }
        title.style.setProperty("--title-glow", displayCssColorForSlot(Netcode.getNetSlots()[idx]));
      } else {
        verdict.textContent = "ROUND COMPLETE";
        title.style.setProperty("--title-glow", "#ffffff");
      }
    }

    finalScores.replaceChildren();
    /** @type {Array<{ row: HTMLElement, valEl: HTMLElement, score: number, isWinner: boolean, badge: HTMLElement | null, format?: (n: number) => string }>} */
    const scoreRows = [];
    // * Winner pinned first explicitly — under lastStanding/Sudden Death they can
    // * hold a lower score than a fallen rival, so score-desc alone isn't enough.
    const rankedSlots = [0, 1, 2, 3].sort((a, b) => {
      const aWin = winnerIdx !== "draw" && winnerIdx === a;
      const bWin = winnerIdx !== "draw" && winnerIdx === b;
      if (aWin !== bWin) return aWin ? -1 : 1;
      const byScore = Number(scores[b] ?? 0) - Number(scores[a] ?? 0);
      return byScore !== 0 ? byScore : a - b;
    });
    // * 7g podium — one column per slot, block height by finish (design ratios
    // * 250/170/120/80 scaled to the panel). Winner reads magenta + crown, the
    // * local player cyan, everyone else a hairline.
    const PODIUM_HEIGHTS = [250, 170, 120, 80];
    const RANK_LABELS = ["1st", "2nd", "3rd", "4th"];
    const myPodiumSlotIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    rankedSlots.forEach((i, rank) => {
      const s = scores[i] != null ? scores[i] : 0;
      const netSlot = Netcode.getNetSlots()[i];
      const col = document.createElement("div");
      col.className = "results-podium-col";
      const isWinner = winnerIdx !== "draw" && winnerIdx === i;
      if (isWinner) col.classList.add("is-winner");
      if (i === myPodiumSlotIdx) col.classList.add("is-you");
      col.style.setProperty("--slot-glow", displayCssColorForSlot(netSlot));
      col.style.setProperty("--podium-h", `${PODIUM_HEIGHTS[rank] ?? 48}px`);

      const cap = document.createElement("div");
      cap.className = "results-podium-cap";

      // * Same resolver as the HUD roster: NPCs get their personality emblem,
      // * humans the cart-color shopper glyph.
      const emblemInfo = emblemForSlot(netSlot);
      if (emblemInfo) {
        const emblemEl = document.createElement("span");
        emblemEl.className = "results-podium-emblem";
        emblemEl.innerHTML = svgIcon(emblemInfo.icon, { label: emblemInfo.label });
        emblemEl.style.color = emblemInfo.color;
        cap.appendChild(emblemEl);
      }

      const nameEl = document.createElement("span");
      nameEl.className = "results-score-name results-podium-name";
      nameEl.textContent = slotDisplayName(i);

      // * 7g: the cyan YOU pill next to your own name — the podium's cyan block
      // * border alone doesn't say which cart was yours.
      if (i === myPodiumSlotIdx) {
        const youPill = document.createElement("span");
        youPill.className = "results-you-pill";
        youPill.textContent = "YOU";
        nameEl.appendChild(youPill);
      }

      if (i === myPodiumSlotIdx && getIsNewPersonalBest()) {
        const pbBadge = document.createElement("span");
        pbBadge.className = "pb-badge";
        pbBadge.textContent = "NEW PB!";
        nameEl.appendChild(pbBadge);
      }

      let winnerBadge = null;
      if (isWinner) {
        winnerBadge = document.createElement("span");
        winnerBadge.className = "results-winner-badge";
        // * Purpose-built sticker crown (icons.js), not the OS emoji — matches
        // * the HUD leader pip and colors to gold via .results-winner-badge CSS.
        winnerBadge.innerHTML = svgIcon("crown", { label: "Winner", size: "1.15em" });
        cap.prepend(winnerBadge);
      }
      cap.appendChild(nameEl);

      const block = document.createElement("div");
      block.className = "results-podium-block";

      const rankEl = document.createElement("span");
      rankEl.className = "results-podium-rank";
      rankEl.textContent = String(rank + 1);

      const valEl = document.createElement("span");
      valEl.className = "results-score-val";
      const rankLabel = RANK_LABELS[rank] ?? `${rank + 1}th`;
      const formatScore = (n) => `${rankLabel} · ${Math.round(n)} PTS`;
      valEl.textContent = formatScore(s);

      block.appendChild(rankEl);
      block.appendChild(valEl);
      col.appendChild(cap);
      col.appendChild(block);
      finalScores.appendChild(col);
      scoreRows.push({ row: col, valEl, score: s, isWinner, badge: winnerBadge, format: formatScore });
    });

    // ── Match receipt (7g) — this round's till slip, existing stats only ──
    /** @type {HTMLElement[]} */
    const receiptLines = [];
    if (receipt) {
      receipt.replaceChildren();
      const snap = snapshotMatchStats();
      const comboLabel = snap.maxComboTier >= 3
        ? "CARNAGE"
        : snap.maxComboTier >= 2
          ? "RAMPAGE"
          : snap.maxComboTier >= 1
            ? "STREAK"
            : "—";
      const myScore = myPodiumSlotIdx >= 0 ? Number(scores[myPodiumSlotIdx] ?? 0) : 0;

      const hd = document.createElement("div");
      hd.className = "results-receipt-hd";
      hd.textContent = "— MATCH RECEIPT —";
      receipt.appendChild(hd);
      receiptLines.push(hd);

      // * EXPRESS LANE HELD is deliberately absent — nothing tracks it (see plan
      // * 7g); leaderDowns rides along only when the player actually earned one.
      /** @type {Array<[string, string]>} */
      const lines = [
        ["BODIES", String(snap.localKos)],
        ["SPILLS CAUSED", String(snap.localSpills)],
        ["BEST COMBO", comboLabel],
        ["TIMES BODIED", String(snap.localDeaths)],
      ];
      if (snap.leaderDowns > 0) lines.push(["LEADER DOWNS", String(snap.leaderDowns)]);
      if (snap.criticalKos > 0) lines.push(["CRITICALS", String(snap.criticalKos)]);

      for (const [label, value] of lines) {
        const line = document.createElement("div");
        line.className = "results-receipt-line";
        const lbl = document.createElement("span");
        lbl.className = "results-receipt-lbl";
        lbl.textContent = label;
        const val = document.createElement("span");
        val.className = "results-receipt-val";
        val.textContent = value;
        line.appendChild(lbl);
        line.appendChild(val);
        receipt.appendChild(line);
        receiptLines.push(line);
      }

      // * Challenges finished DURING this round — diffed against the snapshot
      // * taken at countdown, so an objective completed last week never prints.
      // * Empty case: omit the line entirely (no DOM, no stagger slot) — bare
      // * "CHALLENGE" + "—" read as placeholder junk (FV-RESULTS-1).
      const chNow = challengeStore.getState();
      const completedThisMatch = [...(chNow.dailyChallenges || []), ...(chNow.weeklyChallenges || [])]
        .filter((c) => c?.isComplete && !challengesCompleteAtRoundStart.has(c.id))
        .map((c) => CHALLENGE_POOL.find((meta) => meta.id === c.id)?.title)
        .filter(Boolean);
      if (completedThisMatch.length > 0) {
        const challengeLine = document.createElement("div");
        challengeLine.className = "results-receipt-line results-receipt-challenge is-complete";
        const chLbl = document.createElement("span");
        chLbl.className = "results-receipt-lbl";
        chLbl.textContent = "CHALLENGE UNLOCKED";
        const chVal = document.createElement("span");
        chVal.className = "results-receipt-val";
        chVal.textContent = completedThisMatch.length > 1
          ? `✓ ${completedThisMatch.length} REDEEMED`
          : `✓ ${completedThisMatch[0]}`;
        challengeLine.appendChild(chLbl);
        challengeLine.appendChild(chVal);
        receipt.appendChild(challengeLine);
        receiptLines.push(challengeLine);
      }

      const total = document.createElement("div");
      total.className = "results-receipt-line results-receipt-total";
      const totalLbl = document.createElement("span");
      totalLbl.className = "results-receipt-lbl";
      totalLbl.textContent = "TOTAL";
      const totalVal = document.createElement("span");
      totalVal.className = "results-receipt-val";
      totalVal.textContent = `${myScore} PTS`;
      total.appendChild(totalLbl);
      total.appendChild(totalVal);
      receipt.appendChild(total);
      receiptLines.push(total);

      const barcode = document.createElement("div");
      barcode.className = "results-receipt-barcode";
      barcode.setAttribute("aria-hidden", "true");
      receipt.appendChild(barcode);

      const foot = document.createElement("div");
      foot.className = "results-receipt-foot";
      foot.textContent = "THANK YOU FOR SHOPPING";
      receipt.appendChild(foot);
      receiptLines.push(foot);
    }

    animateResultsPodiumShow({
      overlay,
      panel,
      title,
      verdict,
      scoreRows,
      receiptLines,
      playAgain,
      mainMenuBtn,
    });

    maybeScheduleAutoContinuePodium();
  } else {
    clearAutoContinuePodiumTimeout();
    autoContinuePodiumKey = null;
    lastResultsOverlayKey = null;
    clearPodiumPresentation();
    cancelResultsAnimations(overlay);
    animateResultsDismiss(overlay, panel);
  }
}

function startRunningAt(startedAtMs) {
  setIsNewPersonalBest(false);
  cancelLastCartStandingFinish();
  GameState.setRoundEndReason(null);
  syncRoundPhase("running");
  refreshHiddenHostLifecycle();
  gameCtx.slowMo.active = false;
  GameState.setRoundStartedAtMs(startedAtMs);
  GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
  GameState.setRoundWinnerSlotIndex(null);
  Netcode.sendHostRound();
  updateTouchControlsVisibility();
  CameraMod.endCinematicCountdown(camera);
}

function clearRoundCountdownTimeout() {
  if (roundCountdownTimeoutId != null) {
    clearTimeout(roundCountdownTimeoutId);
    roundCountdownTimeoutId = null;
  }
}

function startCountdown(startsAtLocalMs = getRoundClockNowMs() + CONFIG.round.countdownMs) {
  if (!Netcode.getIsHost()) return;
  if (GameState.getRoundState().phase === "running") return;
  setIsNewPersonalBest(false);
  cancelLastCartStandingFinish();
  GameState.setRoundEndReason(null);
  clearPodiumEndLatch();
  clearRoundCountdownTimeout();
  // * Fresh match-stat spine for the receipt this round.
  resetMatchStats();
  {
    const chState = challengeStore.getState();
    challengesCompleteAtRoundStart = new Set(
      [...(chState.dailyChallenges || []), ...(chState.weeklyChallenges || [])]
        .filter((c) => c?.isComplete)
        .map((c) => c.id)
    );
  }
  setMatchStatsLocalSlot(Netcode.strictSlotIndexForConn(Netcode.getYouConnId()));
  syncRoundPhase("countdown");
  refreshHiddenHostLifecycle();
  gameCtx.slowMo.active = false;
  GameState.setRoundCountdownStartedAtMs(startsAtLocalMs - CONFIG.round.countdownMs);
  GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
  GameState.setRoundWinnerSlotIndex(null);
  GameState.setRoundStartedAtMs(0);

  if (Array.isArray(getAllCartsRef())) {
    for (let i = 0; i < getAllCartsRef().length; i += 1) {
      teleportCartToSpawn(i);
    }
  }

  Netcode.sendHostRound();
  roundCountdownTimeoutId = setTimeout(() => {
    roundCountdownTimeoutId = null;
    if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
  }, Math.max(0, startsAtLocalMs - getRoundClockNowMs()));
  beginRoundFlyover();
}

/**
 * * Fallback when promoted to host mid-countdown (e.g. prior host disconnected).
 * * Completes the in-flight countdown window; server reset + game_start is preferred
 * * when deployed but this keeps older servers and message-order races un-stuck.
 */
function resumeCountdownAsNewHost() {
  if (!Netcode.getIsHost()) return;
  const roundState = GameState.getRoundState();
  if (roundState.phase !== "countdown") return;

  clearRoundCountdownTimeout();
  const startsAtLocalMs = (roundState.countdownStartedAtMs || getRoundClockNowMs()) + CONFIG.round.countdownMs;
  const delayMs = Math.max(0, startsAtLocalMs - getRoundClockNowMs());

  if (delayMs === 0) {
    if (GameState.getRoundState().phase === "countdown") startRunningAt(getRoundClockNowMs());
    return;
  }

  // * Re-arm pregame fly-over if host migration interrupted the prior client's cam.
  beginRoundFlyover();
  Netcode.sendHostRound();
  roundCountdownTimeoutId = setTimeout(() => {
    roundCountdownTimeoutId = null;
    if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
  }, delayMs);
}

function ensureSuddenDeathStateAsNewHost() {
  if (!Netcode.getIsHost()) return;
  const roundState = GameState.getRoundState();
  ensureSuddenDeathOnHostPromote({
    phase: roundState.phase,
    isSuddenDeath: roundState.isSuddenDeath,
    startedAtMs: roundState.startedAtMs,
    nowMs: getRoundClockNowMs(),
    durationMs: CONFIG.round?.durationMs ?? ROUND_DURATION_MS,
    scores: GameState.getRoundScores() || {},
    netSlots: Netcode.getNetSlots(),
    allCarts: getAllCartsRef(),
    fallYThreshold: CONFIG.fall.yThreshold,
    nowPerfMs: performance.now(),
    setSuddenDeath: GameState.setSuddenDeath,
    sendHostRound: () => Netcode.sendHostRound(),
    onCartOutOfPlay: stopChargeSfxForCart,
    // * Match the in-round SD entry path (updateGameFlow deps): release the torn-down
    // * cart's spilled groceries too, or the promoted host keeps them on the floor.
    doRespawn: (c) => Entities.doRespawn(c, {
      onCartRespawn: (slotIndex) => GroceryPool.releaseByCartId(String(slotIndex)),
    }),
  });
}

function cancelLastCartStandingFinish() {
  if (roundPodiumTimeoutId != null) {
    clearTimeout(roundPodiumTimeoutId);
    roundPodiumTimeoutId = null;
  }
  gameCtx.slowMo.active = false;
}

function abortLastCartStandingFlourish() {
  const hadFlourish = GameState.getRoundState().endReason === "lastStanding";
  cancelLastCartStandingFinish();
  if (hadFlourish && Netcode.getIsHost()) {
    GameState.setRoundEndReason(null);
    Netcode.sendHostRound();
  }
}

function scheduleLastCartStandingFinish(soleSurvivorSlot) {
  if (!Netcode.getIsHost()) return;
  if (roundPodiumTimeoutId != null) return;
  if (!gameCtx.slowMo.active) {
    gameCtx.slowMo.active = true;
    gameCtx.slowMo.startMs = performance.now();
  }
  if (GameState.getRoundState().endReason !== "lastStanding") {
    GameState.setRoundEndReason("lastStanding");
    Netcode.sendHostRound();
  }
  roundPodiumTimeoutId = setTimeout(() => {
    roundPodiumTimeoutId = null;
    if (GameState.getRoundState().phase !== "running") return;
    endRound(soleSurvivorSlot);
  }, LAST_CART_STANDING_FLOURISH_MS);
}

function endRound(lastStandingWinnerSlot = null) {
  if (GameState.getRoundState().phase !== "running") return;
  // * ROUND-WEDGE-1 Phase B: after a server podium reject, gameFlow would re-enter
  // * here every frame. Latch is send-counted + time-gated retry (see podiumEndLatch).
  const endStartedAtMs = GameState.getRoundState().startedAtMs;
  const endNowMs = getRoundClockNowMs();
  if (!shouldAllowPodiumEnd(endStartedAtMs, endNowMs)) return;
  cancelLastCartStandingFinish();
  clearRoundCountdownTimeout();
  deps.setPendingMidRoundJoinRespawnConnId?.(null);
  resetArenaReactiveLights();
  // * A charge held across the round-end boundary must stop looping here, before
  // * anything downstream (cleanupSuddenDeathState/rematch resets) nulls the SFX id.
  stopAllChargeSfx();
  const suddenDeathActive = GameState.getRoundState().isSuddenDeath;
  // * Latch SD-at-end for the podium challenge block — endRound clears the live flag
  // * below (SD branch), so `sd_win` would otherwise never be creditable.
  lastRoundEndedInSuddenDeath = suddenDeathActive;
  if (suddenDeathActive) {
    // * Sudden Death winner — first to score wins instantly. A null slot here is the
    // * run-6 stalemate timeout: nobody forced a KO, resolve by the standard
    // * most-recent-scoring-hit tiebreak instead of hanging forever.
    GameState.setRoundEndReason("timer");
    const sdWinner = lastStandingWinnerSlot != null && Number.isFinite(lastStandingWinnerSlot)
      ? lastStandingWinnerSlot
      : GameState.pickTimerWinner(GameState.getRoundScores());
    GameState.setRoundWinnerSlotIndex(sdWinner);
    GameState.setSuddenDeath(false);
    cleanupSuddenDeathState(getAllCartsRef() || []);
  } else if (lastStandingWinnerSlot != null && Number.isFinite(lastStandingWinnerSlot)) {
    GameState.setRoundEndReason("lastStanding");
    GameState.setRoundWinnerSlotIndex(lastStandingWinnerSlot);
  } else {
    GameState.setRoundEndReason("timer");
    const scores = GameState.getRoundScores();
    GameState.setRoundWinnerSlotIndex(GameState.pickTimerWinner(scores));
  }
  recordPodiumStats(/** @type {any} */ (GameState.getRoundState().winnerSlotIndex), GameState.getRoundScores());
  HUD.clearFeed();
  syncRoundPhase("podium");
  beginPodiumPresentation();
  // * Count on send only — reject path must not also +1 (podiumEndLatch tests pin this).
  notePodiumEndSend(endStartedAtMs);
  Netcode.sendHostRound();
}

// * Wire Sudden Death win callback — addScore fires this on first score during SD.
GameState.setSuddenDeathWinCallback((scoringSlot) => {
  endRound(scoringSlot);
});

function clearAutoContinuePodiumTimeout() {
  if (autoContinuePodiumTimeoutId != null) {
    clearTimeout(autoContinuePodiumTimeoutId);
    autoContinuePodiumTimeoutId = null;
  }
  clientPodiumAutoContinueDeadlineMs = 0;
}

function currentPodiumAutoContinueKey() {
  return `${GameState.getRoundState().startedAtMs}:${GameState.getRoundState().winnerSlotIndex}:${getMatchHistory().length}`;
}

function maybeScheduleAutoContinuePodium() {
  if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
  const mode = detectGameMode();
  // * Friends parties get the auto-advance too (longer window — the host can still
  // * bail to the menu or change arenas before it fires). Kills post-match limbo.
  if (mode !== "quickplay" && mode !== "friends") return;
  const delayMs = mode === "friends" ? 10000 : 5000;

  const key = currentPodiumAutoContinueKey();
  if (autoContinuePodiumTimeoutId != null || autoContinuePodiumKey === key) return;

  autoContinuePodiumKey = key;
  autoContinuePodiumDeadlineMs = performance.now() + delayMs;
  autoContinuePodiumTimeoutId = setTimeout(() => {
    autoContinuePodiumTimeoutId = null;
    if (!Netcode.getIsHost() || GameState.getRoundState().phase !== "podium") return;
    const modeNow = detectGameMode();
    if (modeNow !== "quickplay" && modeNow !== "friends") return;
    onHostPlayAgainClick();
  }, delayMs);
}

/**
 * Ticks rematch labels while auto-continue is armed:
 * host → "PLAY AGAIN (n)"; non-host → "STARTING IN (n)…" (local estimate).
 */
function updatePlayAgainCountdownLabel(playAgain) {
  if (!playAgain) return;
  if (Netcode.getIsHost()) {
    if (autoContinuePodiumTimeoutId == null || !autoContinuePodiumDeadlineMs) return;
    const secs = Math.max(0, Math.ceil((autoContinuePodiumDeadlineMs - performance.now()) / 1000));
    const next = `PLAY AGAIN (${secs})`;
    if (playAgain.textContent !== next) playAgain.textContent = next;
    return;
  }
  if (!clientPodiumAutoContinueDeadlineMs) return;
  const secs = Math.max(0, Math.ceil((clientPodiumAutoContinueDeadlineMs - performance.now()) / 1000));
  const next = `STARTING IN (${secs})…`;
  if (playAgain.textContent !== next) playAgain.textContent = next;
}

/**
 * Solo/testdrive ESC: freeze round clock + countdown timeout so pause is real.
 * @param {boolean} open
 */
function handleSoloPauseOverlay(open) {
  const mode = detectGameMode();
  if (mode !== "solo" && mode !== "testdrive") return;
  if (open) {
    if (soloPauseStartedAtMs != null) return;
    soloPauseStartedAtMs = getRoundClockNowMs();
    if (roundCountdownTimeoutId != null) {
      const state = GameState.getRoundState();
      const startsAt = (state.countdownStartedAtMs || 0) + CONFIG.round.countdownMs;
      soloPauseCountdownRemainingMs = Math.max(0, startsAt - getRoundClockNowMs());
      clearRoundCountdownTimeout();
    }
    return;
  }
  if (soloPauseStartedAtMs != null) {
    const delta = getRoundClockNowMs() - soloPauseStartedAtMs;
    soloPauseStartedAtMs = null;
    if (delta > 0) {
      const state = GameState.getRoundState();
      if (state.phase === "running" && state.startedAtMs > 0) {
        GameState.setRoundStartedAtMs(state.startedAtMs + delta);
      }
      if (state.phase === "countdown" && state.countdownStartedAtMs > 0) {
        GameState.setRoundCountdownStartedAtMs(state.countdownStartedAtMs + delta);
      }
      // * Run-6: the PA directive window rides performance.now(), not the round
      // * clock — shift it too or the chip drains/expires behind the Esc menu.
      shiftDirectiveTimersBy(delta);
    }
  }
  if (soloPauseCountdownRemainingMs != null) {
    const remaining = soloPauseCountdownRemainingMs;
    soloPauseCountdownRemainingMs = null;
    if (GameState.getRoundState().phase === "countdown" && Netcode.getIsHost()) {
      const startsAtLocalMs = getRoundClockNowMs() + remaining;
      roundCountdownTimeoutId = setTimeout(() => {
        roundCountdownTimeoutId = null;
        if (GameState.getRoundState().phase === "countdown") startRunningAt(startsAtLocalMs);
      }, remaining);
    }
  }
}

function onHostPlayAgainClick() {
  if (!Netcode.getIsHost()) return;
  // * Re-entrancy guard (quickplay): a double-fire (button + auto-continue race, or
  // * a fast double-click) would adopt+broadcast a SECOND next arena while its
  // * rotateLoadedArenaInPlace no-ops on the in-flight flag — host on arena A,
  // * everyone else on arena B. Checked BEFORE the world-reset side effects below:
  // * the suppressed call must not re-run rematchResetWorld mid-collider-rebuild
  // * (it would broadcast spawn poses computed against the outgoing arena's ring).
  if (detectGameMode() === "quickplay" && getArenaRotationInFlight()) return;
  cancelLastCartStandingFinish();
  autoContinuePodiumKey = currentPodiumAutoContinueKey();
  clearAutoContinuePodiumTimeout();
  clearRoundCountdownTimeout();
  gameCtx.slowMo.active = false;
  lastResultsOverlayKey = null;
  clearPodiumPresentation();
  GameState.setRoundEndReason(null);
  Netcode.resetClientPredictionState();
  stopAllChargeSfx();
  // * NET-1 S1 (caps 98–102): quickplay rematch used to rematchResetWorld() HERE
  // * (old arena ring) then rotate async and rematchResetWorld again. Non-hosts got a
  // * wrong host_spawn, a multi-second snap gap during the swap, and sometimes sat
  // * on void coords at GO. Skip the pre-rotation broadcast; rotateLoadedArenaInPlace
  // * re-seats + broadcasts after refreshCartSpawnPositions on the NEW ring.
  const isQuickplayRematch = detectGameMode() === "quickplay";
  if (!isQuickplayRematch) {
    Entities.rematchResetWorld();
  }
  if (detectGameMode() === "solo" || detectGameMode() === "testdrive") {
    // * RESTART is reachable mid-round from the pause menu, where the round is
    // * still phase==="running" (solo pause only freezes the clock, never changes
    // * phase). startCountdown() bails out on phase==="running" to block
    // * double-starts — so without dropping the abandoned round to lobby first,
    // * rematchResetWorld() above would snap the carts to spawn but no countdown,
    // * no score reset, and the stale round would keep ticking. Clearing to lobby
    // * lets startCountdown run its full reset (scores/winner/startedAt + 3-2-1).
    syncRoundPhase("lobby");
    clearPodiumEndLatch();
    GameState.setRoundStartedAtMs(0);
    startCountdown(getRoundClockNowMs() + CONFIG.round.countdownMs);
    return;
  }
  // * Quickplay arena rotation (D-STAB-2 seam / QP-ORDER-1): advance to the next
  // * catalog arena at the rematch boundary. Latch it BEFORE sendHostRound below so
  // * the round broadcast carries the new levelId (server latches + rebroadcasts;
  // * non-host clients rotate via onLevelIdChanged). Friends lobbies keep the host's
  // * deliberate arena choice.
  if (isQuickplayRematch) {
    const nextArenaId = pickNextQuickplayArenaId();
    Netcode.adoptRoomLevelAsHost(nextArenaId);
    Netcode.adoptRoomAiDifficultyAsHost("quickplay");
    void rotateLoadedArenaInPlace(nextArenaId);
  }
  syncRoundPhase("lobby");
  clearPodiumEndLatch();
  GameState.setRoundScores({ 0: 0, 1: 0, 2: 0, 3: 0 });
  GameState.setRoundWinnerSlotIndex(null);
  GameState.setRoundStartedAtMs(0);
  GameState.setRoundCountdownStartedAtMs(0);
  Netcode.sendHostRound();
  Netcode.sendPlayAgain();
}


  function clearPodiumRoundTimeout() {
    if (roundPodiumTimeoutId != null) {
      clearTimeout(roundPodiumTimeoutId);
      roundPodiumTimeoutId = null;
    }
  }

  function resetResultsOverlayKey() {
    lastResultsOverlayKey = null;
  }

  function resetPodiumSessionState() {
    autoContinuePodiumKey = null;
    clientPodiumAutoContinueDeadlineMs = 0;
    lastResultsOverlayKey = null;
    clearPodiumPresentation();
  }

  function getSoloPauseStartedAtMs() {
    return soloPauseStartedAtMs;
  }

  function setAutoContinuePodiumKey(key) {
    autoContinuePodiumKey = key;
  }

  /** @param {{ clear: () => void }} podiumAutoContinue */
  function wirePodiumAutoContinueClear(podiumAutoContinue) {
    podiumAutoContinue.clear = clearAutoContinuePodiumTimeout;
  }

  return {
    resolveCinematicCountdownOverrides,
    beginRoundFlyover,
    getWinnerWorldPos,
    beginPodiumPresentation,
    clearPodiumPresentation,
    updateResultsOverlay,
    startRunningAt,
    clearRoundCountdownTimeout,
    startCountdown,
    resumeCountdownAsNewHost,
    ensureSuddenDeathStateAsNewHost,
    cancelLastCartStandingFinish,
    abortLastCartStandingFlourish,
    scheduleLastCartStandingFinish,
    endRound,
    clearAutoContinuePodiumTimeout,
    currentPodiumAutoContinueKey,
    maybeScheduleAutoContinuePodium,
    updatePlayAgainCountdownLabel,
    handleSoloPauseOverlay,
    onHostPlayAgainClick,
    recordPodiumStats,
    // Teardown / bridge helpers (rebind Lever B deps)
    clearPodiumRoundTimeout,
    resetResultsOverlayKey,
    resetPodiumSessionState,
    getSoloPauseStartedAtMs,
    setAutoContinuePodiumKey,
    removePodiumSkipListeners,
    wirePodiumAutoContinueClear,
  };
}
