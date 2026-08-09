// menuPlayEntry.js — menu / play entry, music unlock, touch visibility (MAIN-1 Lever G)
// Mechanical extract from main(); bootstrap hooks + initMenu / commitMenuHiddenForGame unchanged.

import * as AudioManager from "../audioManager.js";
import * as GameState from "../gameState.js";
import * as Input from "../input.js";
import { ensureNetcode, getNetcode, requireNetcode } from "../netcode/load.js";
import { resolveLevelMusic } from "../music/levelMusic.js";
import { getCurrentLevelId, scheduleMenuLevelPreview } from "../levelManager.js";
import { enterPlayMode, ensureSessionCartsReady } from "../bootstrap.js";
// * BUNDLE-1 Lever D Edge 1: HUD / directiveEngine / announcerManager / arenaAmbience are
// * reached through the hook table instead of imported. Every one of those static edges kept
// * the in-round graph eager; the hooks default to no-ops and gameBoot registers the real
// * implementations. NEVER destructure a hook into a local — read through the object.
import { gameTeardownHooks } from "./gameTeardownHooks.js";
import { showRotatePromptIfNeeded } from "../ui/rotatePrompt.js";
import {
  dismissAllLoadingOverlays,
  dismissInitialBootSplash,
  noteBootMilestone,
  revealGameCanvas,
  withModeEntryLoading,
} from "../ui/loadingScreen.js";
import { startMenuAttract, stopMenuAttract } from "../ui/menuAttract.js";
import { setGamepadNavActive } from "../ui/gamepadNav.js";
import { syncAllAudioUi } from "../ui/audioControls.js";
import { resolveServerColorPick } from "../customization.js";
import {
  generateRoomCode,
  isQuickplayRoom,
  isReservedRoomName,
  normalizeRoomCode,
} from "../../shared/roomCodes.js";
import { PALETTE } from "../config.js";
import {
  STORAGE_KEYS,
  storageGet,
  storageSet,
  SESSION_KEYS,
  sessionGet,
  sessionSet,
  sessionRemove,
} from "../utils/storage.js";
import { isTouchDevice } from "../utils.js";

const MODE_MENU_BUTTON_IDS = ["cr-solo", "cr-quickplay", "cr-friends"];

/**
 * Pure URL room parse (same rules as netcode.resolvedPartyRoomFromUrl) for menu
 * before the netcode module is loaded.
 * @returns {string}
 */
function resolvedPartyRoomFromUrlFallback() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  return /^[A-Za-z0-9]{2,16}$/.test(raw) ? raw : "quickplay";
}

/** @type {string | null} Valid ?room= on first paint for friend-invite deferred menu. */
let pendingInviteRoomFromUrl = null;

function getPendingInviteRoomFromUrl() {
  return pendingInviteRoomFromUrl;
}

/** @param {string | null} v */
function setPendingInviteRoomFromUrl(v) {
  pendingInviteRoomFromUrl = v;
}

/** Valid ?room= on first paint: show menu before PartyKit connect (friend links). */
export function captureInviteRoomForDeferredMenu() {
  pendingInviteRoomFromUrl = null;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  const isValid = /^[A-Za-z0-9]{2,16}$/.test(raw);
  if (!isValid) return false;
  // * Reserved names are not friend invites. QUICKPLAY-SHARD-1 replaced a hand-rolled check
  // * (exact `quickplay` + two prefixes) with the shared helper, which prefix-matches the whole
  // * reserved family case-insensitively — so `?room=quickplay3` is no longer mistaken for an
  // * invite and offered as a JOIN LOBBY button into a public shard.
  if (isReservedRoomName(raw)) return false;
  pendingInviteRoomFromUrl = raw;
  return true;
}

export function enableModeMenuButtons() {
  for (const id of MODE_MENU_BUTTON_IDS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.classList.remove("cr-btn--boot-pending");
    btn.disabled = false;
    btn.removeAttribute("aria-disabled");
  }
}

/**
 * CHUNK-DEFER-1 L5: bare chunk warm on play CTA hover/focus — no connect, no register.
 * @param {() => void} prefetchChunks
 */
export function wirePlayCtaChunkPrefetch(prefetchChunks) {
  if (typeof prefetchChunks !== "function") return;
  const run = () => {
    try {
      prefetchChunks();
    } catch {
      /* prefetch-only */
    }
  };
  for (const id of MODE_MENU_BUTTON_IDS) {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.chunkPrefetchWired === "1") continue;
    btn.dataset.chunkPrefetchWired = "1";
    btn.addEventListener("pointerenter", run, { passive: true });
    btn.addEventListener("focus", run, { passive: true });
  }
  // * Friends invite join button (typed code / link) lives outside MODE_MENU_BUTTON_IDS.
  const joinBtn = document.getElementById("cr-join-room")
    || document.getElementById("cr-friends-join");
  if (joinBtn && joinBtn.dataset.chunkPrefetchWired !== "1") {
    joinBtn.dataset.chunkPrefetchWired = "1";
    joinBtn.addEventListener("pointerenter", run, { passive: true });
    joinBtn.addEventListener("focus", run, { passive: true });
  }
}

/**
 * Menu / play-entry seam: level music, audio unlock, touch HUD visibility,
 * bootstrap arena-ready hooks, initMenu, commitMenuHiddenForGame.
 *
 * Call once from main() after audioListener + soundUrl exist. Late-bound deps
 * (labelRenderer, round podium skip, refreshMenuStats, drainPendingArenaRotation)
 * arrive as getters so createLevelOrchestration can take prepareLevelMusic /
 * startLevelMusic from the same return object.
 *
 * @param {object} deps
 * @param {import("three").AudioListener} deps.audioListener
 * @param {(name: string) => string} deps.soundUrl
 * @param {() => boolean} deps.getMenuVisible
 * @param {(v: boolean) => void} deps.setMenuVisible
 * @param {() => any} deps.getLabelRenderer
 * @param {() => void} deps.removePodiumSkipListeners
 * @param {() => void} deps.refreshMenuStats
 * @param {() => void | Promise<void>} deps.drainPendingArenaRotation
 * @param {(v: boolean) => void} deps.setJoinedViaTypedCode
 * @param {() => HTMLElement | null} deps.getPendingColorChipEl
 * @param {(v: HTMLElement | null) => void} deps.setPendingColorChipEl
 * @param {(v: string | null) => void} deps.setPendingColorKey
 * @param {(v: boolean) => void} deps.setLocalColorPicked
 * @param {() => Promise<void>} [deps.ensureGameSystems] BUNDLE-1 Lever C latch — loads
 *   orchestration/gameBoot.js and runs bootGameSystems() once. Injected, never imported:
 *   a static edge from this (eager) module to gameBoot.js would undo the code split.
 * @param {() => boolean} [deps.isGameSystemsReady] Sync "latch already resolved?" probe.
 * @param {() => Promise<void>} [deps.preparePlayNetworking] CHUNK-DEFER-1 L2 —
 *   ensureGameSystems → ensureNetcode → registerGameCallbacks (no connect).
 */
export function createMenuPlayEntry(deps) {
  const {
    audioListener,
    soundUrl,
    // * Defaults keep the factory constructible in tests / any caller that predates
    // * Lever C: an already-booted world behaves exactly as it did before.
    ensureGameSystems = async () => {},
    isGameSystemsReady = () => true,
    preparePlayNetworking = async () => {
      await ensureGameSystems();
      await ensureNetcode();
    },
    getMenuVisible,
    setMenuVisible,
    getLabelRenderer,
    removePodiumSkipListeners,
    refreshMenuStats,
    drainPendingArenaRotation,
    setJoinedViaTypedCode,
    getPendingColorChipEl,
    setPendingColorChipEl,
    setPendingColorKey,
    setLocalColorPicked,
  } = deps;

  /** @type {string | null} Level id whose playlist is already shuffled + materialized. */
  let preparedLevelMusicId = null;
  /** @type {boolean | null} */
  let lastTouchControlsVisible = null;
  let didUnlockAudio = false;
  let menuPresentedOnce = false;
  let menuColorPickListenerWired = false;
  let menuActionListenerWired = false;
  let menuNameSyncWired = false;
  let menuJoinWired = false;
  let quickplayAutoRejoinAttempted = false;

  /**
   * Shuffle + register (+ materialize) the arena playlist without starting playback.
   * Idempotent per level so play-entry warm and commitMenuHidden share one track order.
   * @param {string | null | undefined} levelId
   */
  function prepareLevelMusic(levelId) {
    if (!levelId) return;
    if (preparedLevelMusicId === levelId && AudioManager.hasMaterializedGamePlaylist()) {
      return;
    }
    const files = resolveLevelMusic(levelId);
    // * Shuffle a multi-song level so the same track doesn't always open. Single-song
    // * levels are unaffected. RNG lives here (menuPlayEntry), not the resolvable/testable module.
    for (let i = files.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }
    AudioManager.setGamePlaylist(files.map((f) => [soundUrl(f)]));
    AudioManager.materializeGamePlaylistIfPending();
    preparedLevelMusicId = levelId;
  }

  /** @param {string | null | undefined} levelId */
  function startLevelMusic(levelId) {
    prepareLevelMusic(levelId);
    AudioManager.playGameMusic();
  }

  // * Autoplay policy: unlock AudioContext on the first user gesture anywhere on the page.
  // * Registered early (before initMenu) with capture so it fires before other handlers.
  function unlockAudio() {
    if (didUnlockAudio) return;
    didUnlockAudio = true;
    const ctx = audioListener.context;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    if (getMenuVisible()) AudioManager.playMenuMusic();
    if (!getMenuVisible()) AudioManager.playGameMusic();
  }
  window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
  window.addEventListener("keydown", unlockAudio, { capture: true, once: true });

  function updateTouchControlsVisibility() {
    const roundPhase = GameState.getRoundState().phase;
    const show =
      isTouchDevice() &&
      !getMenuVisible() &&
      roundPhase !== "podium" &&
      !gameTeardownHooks.isEscOverlayVisible();
    if (show === lastTouchControlsVisible) return;
    lastTouchControlsVisible = show;
    Input.setTouchControlsVisible(show);
  }

  function onMenuBootstrapError(mode, err) {
    console.error(`[menu] ${mode} bootstrap failed:`, err);
    dismissAllLoadingOverlays();
    // * The player is dropped back at the menu — say why instead of failing silently.
    window.CartRave?.showToast?.("Couldn't start the game — check your connection and try again.", 6000);
  }

  /**
   * BUNDLE-1 Lever C — the ONE play-entry wrapper. Every `enterPlayMode()` in this module
   * goes through it (7 sites: testdrive / solo / quickplay auto-rejoin `?room=` branches in
   * initMenu, and joinroom / solo / quickplay / friends in the `cartrave:menu` handler).
   *
   * `bootstrap.js` throws `initBootstrap() must run before enterPlayMode()` and
   * `initBootstrap` now lives inside gameBoot — so a missed site is a hard crash.
   *
   * Overlay policy: in the normal case the idle prefetch already resolved the latch and
   * this is a straight pass-through — byte-for-byte the old behavior. On a cold press
   * (inside the first ~1.8 s, a hidden tab, or a suppressed idle warm) the boot is awaited
   * INSIDE a mode-entry overlay; `withModeEntryLoading` is depth-counted, so the
   * enterPlayMode() call below nests into the same overlay rather than showing a second
   * one. `backfillBootMarks` is deliberately omitted: a cold press has no world marks to
   * seed the meter with. Failures route to onMenuBootstrapError, which dismisses overlays
   * and toasts — index.html's boot-error handlers cannot cover this, they all early-return
   * on `window.__cartRaveBootstrapped` (set before menu-ready).
   *
   * @param {string} modeLabel Player-facing label for the failure toast.
   * @param {Parameters<typeof enterPlayMode>[0]} opts
   * @returns {Promise<void>}
   */
  function startPlay(modeLabel, opts) {
    // * Always run preparePlayNetworking so netcode callbacks exist before connect,
    // * even when game systems were already idle-warmed (Choice 3 may have loaded
    // * netcode as a gameBoot dep without registering callbacks).
    return withModeEntryLoading(
      async (report) => {
        if (!isGameSystemsReady() || !getNetcode()) {
          report(2, "Warming up…");
        }
        await preparePlayNetworking();
        await enterPlayMode(opts);
      },
      { gameMode: opts?.gameMode ?? null, levelId: opts?.levelId ?? null },
    ).catch((err) => {
      // ! Re-thrown so each call site's own .catch(onMenuBootstrapError) still runs
      // ! exactly once; this branch only names the mode for the console line.
      console.warn(`[menu] ${modeLabel} deferred play-networking boot failed`, err);
      throw err;
    });
  }

  /** @returns {Promise<boolean>} true when initNetcode was invoked without throwing. */
  async function bootstrapNetcodeFromMenu(mode, roomOverride) {
    try {
      await preparePlayNetworking();
      requireNetcode().initNetcode(roomOverride);
      return true;
    } catch (err) {
      onMenuBootstrapError(mode, err);
      return false;
    }
  }

  /**
   * Solo/test-drive arena-ready hook for enterPlayMode: kicks netcode under the
   * loading overlay and holds the overlay until carts exist and shader warm-up is
   * done (ensureSessionCartsReady resolves post-warmup; the solo game start fires
   * off that same promise — so the countdown can't begin before loading completes).
   * @param {string} modeLabel
   * @returns {(report: (pct: number, label: string) => void) => Promise<void>}
   */
  function makeSoloArenaReadyHook(modeLabel) {
    return async (report) => {
      report?.(96, "Rolling out carts…");
      if (!(await bootstrapNetcodeFromMenu(modeLabel))) return;
      await ensureSessionCartsReady();
    };
  }

  /**
   * Multiplayer (quickplay/friends) arena-ready hook — same cold-load gate as solo:
   * keep mode-entry overlay until netcode hello + carts + shader warm finish (NET-2).
   * @param {string} modeLabel
   * @param {string} [roomOverride]
   * @returns {(report: (pct: number, label: string) => void) => Promise<void>}
   */
  function makeMultiplayerArenaReadyHook(modeLabel, roomOverride) {
    return async (report) => {
      report?.(94, "Connecting…");
      if (!(await bootstrapNetcodeFromMenu(modeLabel, roomOverride))) return;
      report?.(97, "Rolling out carts…");
      await ensureSessionCartsReady();
      requireNetcode().reapplyCachedCartsSnapshot?.();
      // * Cap-56: game_start used to stack menu-hide + first music/ambience play +
      // * startCountdown teleports into one ~400ms host LT. Play-entry already
      // * decoded those packs (audio warm); roll playback under the loading overlay
      // * so the start tick mostly reveals the canvas. Safe if game_start never
      // * comes — initMenu stops game music on return.
      try {
        AudioManager.stopMenuMusic();
        startLevelMusic(getCurrentLevelId());
        gameTeardownHooks.startArenaAmbience(getCurrentLevelId());
      } catch {
        /* non-fatal — game_start path still starts audio in commitMenuHiddenForGame */
      }
    };
  }

  function initMenu() {
    noteBootMilestone(90);
    setMenuVisible(true);
    // * Back at the title screen, nobody arrived by typed code any more — a stale flag
    // * would show "check the code" to the next room's host (FRIENDS-JOIN-1).
    setJoinedViaTypedCode(false);
    removePodiumSkipListeners();
    setGamepadNavActive(true);
    startMenuAttract();
    syncAllAudioUi();
    // * Always dismiss boot splash first — solo/quickplay paths return early below.
    void dismissInitialBootSplash();
    updateTouchControlsVisibility();
    const labelRenderer = getLabelRenderer();
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    const hudAudio = document.querySelector(".hud-audio");
    if (hudAudio) gameTeardownHooks.hideAudioWidget();
    // * Single canonical gameplay-HUD hide (timer/scores/status/feed/splash/
    // * directive/toast/hitmarker/floats/… — full audit in hideGameplayElements).
    // * Menu skips the game loop so frameVisuals + HUD.update never self-clear.
    gameTeardownHooks.hideGameplayElements();
    gameTeardownHooks.clearActiveDirective();
    // * Lobby-phase store watch usually stopAnnouncer on LOBBY; belt-and-suspenders
    // * so a mid-callout return does not leave the PA plate over the title.
    gameTeardownHooks.stopAnnouncer();
    // Stop game music before menu music starts.
    try { AudioManager.stopGameMusic(); } catch (e) {}
    preparedLevelMusicId = null;
    try { gameTeardownHooks.stopArenaAmbience(); } catch (e) {}
    try { AudioManager.playMenuMusic(); } catch (e) {}
    const wrap = document.getElementById("cr-root");
    if (wrap) {
      // * First presentation gets the full entrance cascade; same-session returns
      // * from gameplay reveal instantly — replaying the ~1s stagger read as lag.
      if (menuPresentedOnce) window.CartRave?.revealShell?.();
      else window.CartRave?.show?.();
      menuPresentedOnce = true;
    }

    // Cosmetic: mark color chip as pending until server confirms slots.
    if (!menuColorPickListenerWired) {
      menuColorPickListenerWired = true;
      const customizeColorRow = document.getElementById("cr-customize-color-row");
      if (customizeColorRow) {
        customizeColorRow.addEventListener("click", (e) => {
          const chip = e.target && e.target.closest ? e.target.closest(".cr-color-chip") : null;
          if (!chip) return;
          getPendingColorChipEl()?.classList.remove("color-pending");
          setPendingColorChipEl(chip);
          chip.classList.add("color-pending");
          setLocalColorPicked(true);
          const colorToSend = resolveServerColorPick();
          const nextKey = colorToSend && PALETTE.includes(colorToSend) ? colorToSend : null;
          setPendingColorKey(nextKey);
          const nc = getNetcode();
          if (nextKey && nc?.getPartySocket()?.readyState === WebSocket.OPEN) {
            nc.sendColorPick(nextKey);
          }
        });
      }
    }

    // * URL parse lives on netcode module — use local fallback until loaded (pure menu).
    let room = getNetcode()?.resolvedPartyRoomFromUrl() ?? resolvedPartyRoomFromUrlFallback();

    // * Mid-round refresh recovery: a solo/testdrive ?room= this tab already
    // * entered gameplay in is a stale leftover, not a deep link. Strip it and
    // * present a clean menu (harness/deep-link boots have no sessionStorage
    // * marker, so their auto-enter below still works).
    if (
      room
      && /^(solo|testdrive)/i.test(room)
      && sessionGet(SESSION_KEYS.engagedRoom) === room
    ) {
      sessionRemove(SESSION_KEYS.engagedRoom);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("room");
      history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}`);
      room = null;
    }

    if (room && room.toLowerCase().startsWith("testdrive")) {
      void startPlay("Test Drive", {
        gameMode: "testdrive",
        levelId: "testArena",
        onArenaReady: makeSoloArenaReadyHook("Test Drive"),
      })
        .then(() => showRotatePromptIfNeeded())
        .catch((err) => onMenuBootstrapError("Test Drive", err));
      return;
    }

    if (room && room.toLowerCase().startsWith("solo")) {
      void startPlay("Solo", {
        gameMode: "solo",
        onArenaReady: makeSoloArenaReadyHook("Solo"),
      })
        .then(() => showRotatePromptIfNeeded())
        .catch((err) => onMenuBootstrapError("Solo", err));
      return;
    }

    // * Returning visitor refreshing ?room=quickplay — auto-rejoin once per page load.
    // * QUICKPLAY-SHARD-1: any public shard auto-rejoins, so refreshing after an overflow hop
    // * returns you to the shard you were actually on. Still read the RAW param, never
    // * `resolvedPartyRoomFromUrl()`: that one defaults a missing ?room= to "quickplay", which
    // * would auto-enter a match straight off the bare title URL.
    const savedUsername = (storageGet(STORAGE_KEYS.username) || "").trim();
    const roomParam = new URLSearchParams(window.location.search || "").get("room");
    if (isQuickplayRoom(roomParam) && savedUsername && !quickplayAutoRejoinAttempted) {
      quickplayAutoRejoinAttempted = true;
      void startPlay("Quickplay", {
        gameMode: "quickplay",
        commitMenuHidden: false,
        onArenaReady: makeMultiplayerArenaReadyHook("Quickplay"),
      }).catch((err) => onMenuBootstrapError("Quickplay", err));
      return;
    }

    document.getElementById("cr-btn-join-invite")?.remove();
    if (getPendingInviteRoomFromUrl()) {
      const btnRow = document.querySelector(".cr-buttons");
      if (btnRow) {
        const btn = document.createElement("button");
        btn.id = "cr-btn-join-invite";
        btn.type = "button";
        btn.className = "cr-btn";
        btn.dataset.action = "joinroom";
        btn.dataset.colorkey = "secondary";
        btn.innerHTML =
          '<span class="cr-btn-inner"><span class="cr-btn-label">JOIN LOBBY</span></span>';
        btnRow.insertBefore(btn, btnRow.firstChild);
        btn.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("cartrave:menu", { detail: { action: "joinroom" } }));
        });
        window.CartRave?.wireMenuButton?.(btn, { delay: 0, duration: 340, y: 18 });
      }
    }

    // Wire new menu button events (once — initMenu may run again after failed joins).
    if (!menuActionListenerWired) {
      menuActionListenerWired = true;
      window.addEventListener("cartrave:menu", (e) => {
      const action = e.detail.action;
      if (action === "solo" || action === "quickplay" || action === "friends" || action === "testdrive") {
        if (!window.__cartRaveBootstrapped) return;
      }
      if (action === "joinroom") {
        const inviteRoom = getPendingInviteRoomFromUrl();
        if (!inviteRoom) return;
        setPendingInviteRoomFromUrl(null);
        document.getElementById("cr-btn-join-invite")?.remove();
        void startPlay("Friends", {
          gameMode: "friends",
          commitMenuHidden: false,
          onArenaReady: makeMultiplayerArenaReadyHook("Friends", inviteRoom),
        }).catch((err) => onMenuBootstrapError("Friends", err));
        return;
      }
      setPendingInviteRoomFromUrl(null);
      document.getElementById("cr-btn-join-invite")?.remove();
      if (action === "solo") {
        const roomId = `solo${Math.random().toString(36).substring(2, 8)}`;
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void startPlay("Solo", {
          gameMode: "solo",
          onArenaReady: makeSoloArenaReadyHook("Solo"),
        })
          .catch((err) => onMenuBootstrapError("Solo", err));
      } else if (action === "quickplay") {
        const url = new URL(window.location.href);
        url.searchParams.set("room", "quickplay");
        history.pushState({}, "", url);
        void startPlay("Quickplay", {
          gameMode: "quickplay",
          commitMenuHidden: false,
          onArenaReady: makeMultiplayerArenaReadyHook("Quickplay"),
        }).catch((err) => onMenuBootstrapError("Quickplay", err));
      } else if (action === "friends") {
        // * FRIENDS-JOIN-1: creating a room now JOINS it. The old flow parked the
        // * creator on an invite screen that opened no socket, so an invited player who
        // * pressed JOIN LOBBY connected alone and became host of a room its creator had
        // * never entered — same code on both screens, same room in both URLs, no shared
        // * room (cap-224/225, 08-01). CHECKOUT LINE already shows the code, the COPY
        // * button and the roster, so the middle screen had no job left.
        const roomId = generateRoomCode();
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        history.pushState({}, "", url);
        void startPlay("Friends", {
          gameMode: "friends",
          commitMenuHidden: false,
          onArenaReady: makeMultiplayerArenaReadyHook("Friends"),
        }).catch((err) => onMenuBootstrapError("Friends", err));
      }
    });
    }

    // ── Join a private room by typed code (FRIENDS-JOIN-1) ──
    // * The link path already works; this is the path for someone who only HEARD the
    // * code — the Discord-voice case that had no affordance at all before.
    if (!menuJoinWired) {
      menuJoinWired = true;
      const joinInput = /** @type {HTMLInputElement | null} */ (document.getElementById("cr-join-code"));
      const joinGo = document.getElementById("cr-join-go");
      const joinError = document.getElementById("cr-join-error");

      const clearJoinError = () => {
        if (joinError) joinError.hidden = true;
      };
      const showJoinError = () => {
        // * A silent no-op on a bad code reads as a broken button.
        if (joinError) joinError.hidden = false;
        joinInput?.focus();
        joinInput?.select();
      };

      const submitJoinCode = () => {
        clearJoinError();
        // * 1. One validation funnel: uppercases, and refuses names reserved for a mode.
        const code = normalizeRoomCode(joinInput?.value ?? "");
        if (!code) {
          showJoinError();
          return;
        }
        // * 2. The URL must carry the room — Netcode.detectGameMode() derives the mode from it,
        // * and a bare URL resolves to "quickplay", so CHECKOUT LINE would never open.
        // * Write the VALIDATOR's string, never the raw field: `kale7` and `KALE7` are
        // * different Durable Objects, which splits the room exactly like a typo.
        const url = new URL(window.location.href);
        url.searchParams.set("room", code);
        history.pushState({}, "", url);
        // * 3. The joinroom handler reads pendingInviteRoomFromUrl and never the URL, so
        // * without this it is a silent no-op. Re-run the capture helper rather than
        // * assigning by hand, so validation has one path; if it disagrees with the
        // * validator, fail visibly instead of dispatching a join that cannot work.
        if (!captureInviteRoomForDeferredMenu()) {
          showJoinError();
          return;
        }
        setJoinedViaTypedCode(true);
        if (joinInput) joinInput.value = "";
        // * 4. Same action the invite link's JOIN LOBBY button fires — one enter path.
        window.dispatchEvent(new CustomEvent("cartrave:menu", { detail: { action: "joinroom" } }));
      };

      joinGo?.addEventListener("click", submitJoinCode);
      joinInput?.addEventListener("input", clearJoinError);
      joinInput?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        // * stopPropagation as well as preventDefault: the menu's own Enter handler
        // * would otherwise activate whatever command is currently selected.
        e.preventDefault();
        e.stopPropagation();
        submitJoinCode();
      });
    }

    refreshMenuStats();

    if (getCurrentLevelId() === "testArena") {
      scheduleMenuLevelPreview();
    }

    // Sync new menu name to localStorage for join message (once per page load).
    if (!menuNameSyncWired) {
      menuNameSyncWired = true;
      const crNameText = document.getElementById("cr-name-text");
      if (crNameText) {
        const saved = storageGet(STORAGE_KEYS.username);
        if (saved) crNameText.textContent = saved;

        const nameObs = new MutationObserver(() => {
          const name = crNameText.textContent.trim();
          if (name) storageSet(STORAGE_KEYS.username, name);
        });
        nameObs.observe(crNameText, { childList: true, characterData: true, subtree: true });
      }

      const crNameInput = document.getElementById("cr-name-input");
      if (crNameInput) {
        crNameInput.addEventListener("blur", () => {
          const name = crNameInput.value.trim();
          if (name) storageSet(STORAGE_KEYS.username, name);
        });
      }
    }

    if (window.__cartRaveBootstrapped) {
      enableModeMenuButtons();
    }
  }

  function commitMenuHiddenForGame() {
    window.CartRave?.stopAnimations?.();
    window.CartRave?.hide?.();
    setMenuVisible(false);
    stopMenuAttract();
    setGamepadNavActive(false);
    revealGameCanvas();
    const isTestDrive = (getNetcode()?.detectGameMode?.() ?? "solo") === "testdrive";
    const labelRenderer = getLabelRenderer();
    if (labelRenderer) {
      labelRenderer.domElement.style.display = isTestDrive ? "none" : "block";
    }
    gameTeardownHooks.showAudioWidget();
    if (isTestDrive) {
      gameTeardownHooks.hideGameplayElements();
    }
    updateTouchControlsVisibility();
    AudioManager.stopMenuMusic();
    if (!isTestDrive) {
      startLevelMusic(getCurrentLevelId());
    }
    // * Arena atmosphere rides along in every mode (test drive included — it is the
    // * world's sound, not the match's). Unknown arenas (testArena) stay silent.
    gameTeardownHooks.startArenaAmbience(getCurrentLevelId());
    // * Mark solo/testdrive rooms as "engaged" so a mid-round refresh recovers to
    // * the menu instead of auto-restarting the room from the stale ?room= URL.
    // * (Quickplay refresh deliberately auto-rejoins — see initMenu.)
    const engagedRoom =
      getNetcode()?.resolvedPartyRoomFromUrl() ?? resolvedPartyRoomFromUrlFallback();
    if (engagedRoom && /^(solo|testdrive)/i.test(engagedRoom)) {
      sessionSet(SESSION_KEYS.engagedRoom, engagedRoom);
    }
    // * A room levelId that arrived during play-entry parks in
    // * pendingArenaRotationLevelId, but the drain no-ops while menuVisible — and
    // * every pre-hide retry (bootstrapSessionCarts) runs before finishHelloEnter
    // * gets here. Without this kick the joiner stays on their local menu arena
    // * until the next round broadcast (07-17 playtest: quickplay joiner loaded
    // * the wrong level on first join).
    void drainPendingArenaRotation();
  }

  return {
    prepareLevelMusic,
    startLevelMusic,
    unlockAudio,
    updateTouchControlsVisibility,
    onMenuBootstrapError,
    bootstrapNetcodeFromMenu,
    makeSoloArenaReadyHook,
    makeMultiplayerArenaReadyHook,
    initMenu,
    commitMenuHiddenForGame,
  };
}
