// === IMPORTS ===

// * Self-installing rAF shim — must be the first import so it runs before anything
// * captures requestAnimationFrame (dev+?perfPump only, no-op otherwise).
import "./utils/perfPump.js";

import {
  applyDebugBootSideEffects,
  applyDebugCameraPose,
  applyPostFxAblation,
  getDebugParams,
  isDebugCameraLocked,
} from "./utils/debugParams.js";
import { installVisualHarness } from "./utils/visualHarness.js";
import { installNetTestHarness } from "./utils/netTestHarness.js";
import { installDiagnostics, diagUrlFlags } from "./utils/diagnostics.js";
import { logBuildBanner, refreshBuildFreshness } from "./utils/buildFreshness.js";
import { uploadCaptureBundle } from "./utils/captureUpload.js";
import { installGameplayDiagnostics } from "./utils/gameplayDiagnostics.js";
import { installLongTaskProbe } from "./utils/longTaskProbe.js";
import { installGameplayAnalytics } from "./analytics/gameplayAnalytics.js";
import { startBlackFrameMonitor } from "./utils/blackFrameMonitor.js";
import {
  loadPlayerCustomization,
  wireCustomizationStorageSync,
} from "./customization.js";
import "./cart-rave-menu.js";
import "./ui/styles/tokens.css";
import "./ui/styles/stickers.css";
import "./cart-rave-menu.css";
import "./ui/styles/global.css";
import * as THREE from "three";
import {
  createRenderer,
  createScene,
  createComposer,
  isSoftwareRendererActive,
  getSoftwareRendererName,
} from "./scene.js";
import { tickAutoQuality } from "./utils/autoQuality.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { prefetchRaveGltf } from "./cartRaveGltf.js";
import * as Input from "./input.js";
import * as Netcode from "./netcode.js";
import * as GameState from "./gameState.js";
import { unlockStore } from "./stores/unlockStore.js";

import * as AudioManager from "./audioManager.js";
import * as CameraMod from "./camera.js";
// * BUNDLE-1 Lever D Edge 1: the menu half reaches HUD / directives / announcer / ambience
// * through this no-op-by-default table (gameBoot registers the real implementations)
// * instead of importing them — those static edges are what kept the in-round graph eager.
import { gameTeardownHooks } from "./orchestration/gameTeardownHooks.js";
import { resolveLevelId, prefetchLevelChunks, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { DEV_UNLOCKS_STORAGE_KEY } from "./unlockConfig.js";
import { updateLevelLod } from "./utils/levelLod.js";
import { markBootPhase, onBootPhase } from "./utils/bootTimeline.js";

import {
  dismissAllLoadingOverlays,
  dismissInitialBootSplash,
  initLoadingScreen,
  noteBootMilestone,
  showQualityApplyLoading,
  waitForPaintedFrames,
  yieldForPaint,
} from "./ui/loadingScreen.js";
import {
  getCurrentLevelId,
  scheduleMenuLevelPreview,
} from "./levelManager.js";
import {
  ensureWorldBootstrapped,
  isIdleWorldWarmSuppressed,
  isWorldBootstrapped,
  isWorldBootstrapInFlight,
  scheduleIdleWorldWarm,
} from "./bootstrap.js";
import { initMenuAttract, startMenuAttract } from "./ui/menuAttract.js";
import {
  getIsMuted,
  getMusicVolume,
  getSfxVolume,
  initAudioControls,
  setAllAudioMuted,
  syncAllAudioUi,
  wireMenuAudioControlsOnce,
} from "./ui/audioControls.js";
import { registerGraphicsToggleHandlers } from "./ui/graphicsToggles.js";
import { createCameraFraming } from "./ui/cameraFraming.js";
import { createMenuStats } from "./ui/menuStats.js";
import { getRoundClockNowMs, getRoundRemainingMs } from "./roundClock.js";
import {
  bootstrapNetcodeEntryFromUrl,
  createGameSessionController,
  createHelloBootstrapFlush,
  createHelloGate,
  createSessionBridgeRefs,
} from "./gameSession.js";
// * BUNDLE-1 Lever E — leaf module, NOT cartOrchestration.js: importing these two from
// * cartOrchestration dragged simulation/entities/hud/effects onto the eager graph.
import {
  displayColorHexForSlot,
  shuffledClientNpcNames,
} from "./orchestration/cartIdentity.js";
import {
  captureInviteRoomForDeferredMenu,
  createMenuPlayEntry,
  enableModeMenuButtons,
} from "./orchestration/menuPlayEntry.js";
import { setQualityTier, setSessionQualityTier } from "./utils/qualityMode.js";

// * URL level / quality boot side effects (must run before renderer creation in main()).
applyDebugBootSideEffects();
{
  const _dbgPreset = getDebugParams().preset;
  if (_dbgPreset) setSessionQualityTier(_dbgPreset);
}
import { installGlobalErrorReporting } from "./utils/errorReporter.js";
import { storageGet } from "./utils/storage.js";
import { CONFIG } from "./config.js";
import { startGamepadUiNav } from "./ui/gamepadNav.js";

// eslint-disable-next-line no-console
console.log("%cHI :D", "font-size:32px;color:#ff2bd6;font-weight:bold;text-shadow:0 0 10px #ff2bd6");

// === SESSION BRIDGE & MODULE STATE ===

/** @type {{ current: object | null }} Live bridge context wired from main(). */
const sessionBridgeCtx = { current: null };
const sessionRefs = createSessionBridgeRefs();
const helloGate = createHelloGate();
const { flushPendingSessionBootstrap, markFirstHelloReceived } = createHelloBootstrapFlush(
  helloGate,
  () => sessionBridgeCtx.current,
);
const gameSession = createGameSessionController(() => sessionBridgeCtx.current);

const initialNpcNames = shuffledClientNpcNames(4);

import { settingsStore } from "./stores/settingsStore.js";

/**
 * BUNDLE-1 Lever B — the single mutable handle the two halves of boot share.
 *
 * These were ~16 module-scope `let`s written by the game half (now
 * `orchestration/gameBoot.js`) and read by the menu half (this file: audio controls, the
 * input handlers, levelOrchestration, menuAttract, devControl, the graphics toggles, and
 * every diagnostics / harness / analytics probe installed after `initMenu()`).
 *
 * A reassigned `let` cannot cross a module boundary — the importer keeps binding to the
 * old value once these modules land in different chunks (Lever C). Property mutation on
 * one shared object does cross, so every write goes through `gameRefs.*` on both sides.
 * ⚠ When adding a probe getter here, read `gameRefs.x` — never capture `gameRefs.x` into
 * a local at install time, or the probe latches whatever null it saw at boot.
 */
const gameRefs = {
  /** @type {ReturnType<typeof import("./hud.js").init> | null} */
  hud: null,
  /** @type {ReturnType<typeof import("./orchestration/cartOrchestration.js").createCartOrchestration> | null} */
  cart: null,
  /**
   * BUNDLE-1 Lever D Edge 2 — `createLevelOrchestration` moved behind the boundary, so the
   * handle is published here by gameBoot instead of being a `main()` local. Null until the
   * latch resolves: EVERY menu-side read must be `refs.level?.…`.
   * @type {ReturnType<typeof import("./orchestration/levelOrchestration.js").createLevelOrchestration> | null}
   */
  level: null,
  /** @type {any[] | null} */
  allCartsRef: null,
  /** @type {boolean} */
  menuVisible: true,
  bloomEnabled: settingsStore.getState().bloomEnabled,
  fxPassEnabled: settingsStore.getState().fxPassEnabled,
  /** @type {any} */
  fxPass: null,
  /** @type {null | { setLeader: (slotIndex: number|null) => void; updatePositionFromCart: (cart: any) => void; resyncVolume: () => void }} */
  leaderHum: null,
  /** @type {((position: { x: number; y: number; z: number }, intensity: number, type?: string, opts?: object) => void) | null} */
  spawnTrashBurstRef: null,
  // * Lever D: assigned by gameBoot (cartShatter.js is behind the boundary now).
  /** @type {((cart: object, scene: object, neonHex: number) => void) | null} */
  triggerCartShatterRef: null,
  /** @type {string | null} */
  pendingMidRoundJoinRespawnConnId: null,
  /**
   * FRIENDS-JOIN-1: true when this client reached the room by TYPING a code, which is the
   * only case where "alone in the lobby" might mean "you mistyped it". A host who created a
   * room and is waiting for friends looks identical (alone, isHost, phase lobby) and must
   * never be told to check the code. Cleared on menu return (createMenuPlayEntry).
   */
  joinedViaTypedCode: false,
  /** Set to true the moment a color-dot is clicked, preventing slots-message re-renders from re-opening the picker before server confirmation arrives. */
  _localColorPicked: false,
  /** @type {HTMLElement | null} */
  pendingColorChipEl: null,
  /** @type {string | null} */
  pendingColorKey: null,
  /** @type {() => void} Rebound by roundLifecycle inside gameBoot. */
  removePodiumSkipListeners: () => {},
};

// === BUNDLE-1 LEVER C — THE gameBoot LATCH ===

/**
 * BUNDLE-1 Lever C — `orchestration/gameBoot.js` is behind a dynamic `import()`, so the
 * whole in-round half of boot (audio/announcer/directives, HUD, results overlay, cart +
 * round + loop orchestration, level manager, play-entry bootstrap, netcode game handlers,
 * the session bridge and the sim loop) neither parses nor constructs on the pre-menu path.
 *
 * ONE latch, five triggers: idle prefetch (bootstrap.js `scheduleIdleWorldWarm`), play
 * press, `?room=` auto-enter (both via `startPlay` in menuPlayEntry.js), the `?harness=`
 * branch at the end of main(), and first netcode hello (gameSession.js bridge).
 *
 * ⚠ Nothing eager may `import` gameBoot.js — statically or otherwise. `bootstrap.js`,
 * `menuPlayEntry.js` and `gameSession.js` all receive these functions as injected deps
 * for exactly that reason; a static edge from any of them undoes the split silently.
 */
/** @type {Promise<typeof import("./orchestration/gameBoot.js")> | null} */
let gameBootModulePromise = null;
/** @type {Promise<void> | null} */
let gameSystemsPromise = null;
let gameSystemsReady = false;
/** @type {Record<string, any> | null} Boot context assembled in main(), consumed by the latch. */
let gameBootCtx = null;

/**
 * Trigger 1a — bare chunk fetch, no construction. Fired at the TOP of the idle-warm
 * delay so the network round-trip overlaps the 1800 ms wait instead of following it.
 * @returns {Promise<typeof import("./orchestration/gameBoot.js")>}
 */
function prefetchGameSystems() {
  if (!gameBootModulePromise) {
    gameBootModulePromise = import("./orchestration/gameBoot.js");
    // * A failed fetch must not latch — a later play press has to be able to retry.
    gameBootModulePromise.catch(() => {
      gameBootModulePromise = null;
    });
  }
  return gameBootModulePromise;
}

/** @returns {boolean} True once bootGameSystems() has completed (sync, for overlay policy). */
function isGameSystemsReady() {
  return gameSystemsReady;
}

/**
 * Loads the gameBoot chunk and runs `bootGameSystems(ctx)` exactly once. Idempotent:
 * every trigger shares this one promise, so concurrent callers get one load and one boot.
 * @returns {Promise<void>}
 */
function ensureGameSystems() {
  if (gameSystemsPromise) return gameSystemsPromise;
  gameSystemsPromise = (async () => {
    /** @type {typeof import("./orchestration/gameBoot.js")} */
    let mod;
    try {
      mod = await prefetchGameSystems();
    } catch (err) {
      // * Chunk fetch failed (offline / bad deploy). Clear the latch so the next PLAY
      // * press retries rather than inheriting a permanently rejected promise.
      gameSystemsPromise = null;
      throw err;
    }
    if (!gameBootCtx) {
      throw new Error("[main] ensureGameSystems() ran before main() built the boot context");
    }
    // ! Deliberately NOT reset on throw: a half-run boot must never be re-entered.
    mod.bootGameSystems(gameBootCtx);
    gameSystemsReady = true;
  })();
  return gameSystemsPromise;
}

/** Renderer handle for the module-level idle warm (set once in main()). */
let idleWarmRenderer = null;
let fpsCanvas2d = null;
let fpsCtx2d = null;

// === GAME LOOP ===

async function main() {
  installGlobalErrorReporting();
  // * FV-BOOT-1: HTML parse → module eval gap (bootStartTime is set inline in index.html).
  const moduleEvalMs = Math.round(performance.now());
  const htmlBootMs =
    typeof window.bootStartTime === "number"
      ? Math.round(moduleEvalMs - window.bootStartTime)
      : null;
  markBootPhase("module-eval", {
    tMs: moduleEvalMs,
    htmlToModuleMs: htmlBootMs,
  });
  // * fonts.css is render-blocking in <head> — surface its ResourceTiming if present.
  try {
    const fontEntries = performance.getEntriesByName(
      `${window.location.origin}/fonts/fonts.css`,
      "resource",
    );
    const fe = fontEntries[fontEntries.length - 1];
    if (fe && "responseEnd" in fe) {
      markBootPhase("fonts-css", {
        durationMs: Math.round(/** @type {PerformanceResourceTiming} */ (fe).duration),
        responseEndMs: Math.round(/** @type {PerformanceResourceTiming} */ (fe).responseEnd),
        transferSize: /** @type {PerformanceResourceTiming} */ (fe).transferSize ?? 0,
      });
    }
  } catch {
    /* ResourceTiming unavailable — boot continues */
  }
  initLoadingScreen();
  // * Bundle fetched + parsed — the dominant real unknown in boot time.
  noteBootMilestone(45);
  markBootPhase("milestone-45");
  // * Dismiss boot splash before scene init — initMenu() may return early on ?room= URLs.
  // * Rapier WASM is loaded lazily via dynamic import in ensureRapierPhysics, keeping
  // * the boot critical path clean.
  void dismissInitialBootSplash();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");
  loadPlayerCustomization();
  wireCustomizationStorageSync();

  // * FV-BOOT-1: defer GLB prefetch until the boot splash has dismissed so the cold-boot
  // * critical path is not competing with a multi-MB Draco fetch. Carts still warm via
  // * play-entry cartPrefetch; menu idle has plenty of time after splash for the GLB.
  const startGlbPrefetch = () => {
    const glbPrefetchT0 = performance.now();
    markBootPhase("glb-prefetch-start");
    void prefetchRaveGltf()
      .then(() => {
        noteBootMilestone(75);
        markBootPhase("glb-prefetch-end", {
          durationMs: Math.round(performance.now() - glbPrefetchT0),
        });
        markBootPhase("milestone-75");
      })
      .catch((err) => {
        console.warn("[cartRaveGltf] Early prefetch failed:", err);
        markBootPhase("glb-prefetch-end", {
          durationMs: Math.round(performance.now() - glbPrefetchT0),
          failed: true,
        });
      });
  };
  {
    let glbArmed = false;
    const armGlb = () => {
      if (glbArmed) return;
      glbArmed = true;
      startGlbPrefetch();
    };
    const unsub = onBootPhase((name) => {
      if (name === "boot-splash-dismissed") {
        unsub();
        armGlb();
      }
    });
    // * Safety: if dismiss marks never fire (tests / exotic embeds), start after a beat.
    setTimeout(() => {
      unsub();
      armGlb();
    }, 8000);
  }

  let labelRenderer = null;
  let input = null;

  // --- Canvas & input ---
  const canvas = document.getElementById(CONFIG.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas element '#${CONFIG.canvasId}' not found.`);
  }

  // * Create AudioListener early so Howler can share its AudioContext before any Howl loads.
  // * Attached to scene (not camera) to prevent Reflector from cloning it every frame.
  const audioListener = new THREE.AudioListener();

  // * Audio UI pushes volume/mute changes into main()-owned objects; hud/leaderHum
  // * are assigned later in main(), so getters resolve lazily (null until then).
  initAudioControls({
    getHud: () => gameRefs.hud,
    getAudioListener: () => audioListener,
    getLeaderHum: () => gameRefs.leaderHum,
  });

  // * Start music loading immediately via Howler — before scene/composer init blocks the main thread.
  // * Page-visibility guard pauses/silences audio in background tabs (user mute unchanged).
  AudioManager.initAudioManager(audioListener.context, {
    getAudioListener: () => audioListener,
  });

  // * Sync AudioManager to the volumes audioStore already loaded from localStorage
  // * at module scope. These are store-domain values (0..AUDIO_VOLUME_MAX); the
  // * setState-backed setters re-persist them as the same pct, so the round-trip is
  // * idempotent. Do NOT divide by AUDIO_VOLUME_MAX here — that shrank sfx/music
  // * into 0..1, and because the setters immediately saved the shrunken value back,
  // * every page load quietly decayed saved volume by ~1/AUDIO_VOLUME_MAX until the
  // * player touched a slider (trended toward silence over ~15 reloads).
  AudioManager.restoreVolumeState({
    sfx: getSfxVolume(),
    music: getMusicVolume(),
    muted: getIsMuted(),
  });

  // * Opus has universal browser support (Chrome, Firefox, Safari, Edge).
  // * No fallback array needed — pass a single URL to Howler.
  const soundUrl = (name) =>
    new URL(`sounds/${name}`, window.location.href).toString();

  // * Menu music is eager (preload + play request) so it can start as soon as the menu is up.
  // * Game playlist is URL-only until enter-play — avoids ~10 MB competing with menu.opus.
  AudioManager.loadMenuMusic(soundUrl("menu.opus"));
  if (gameRefs.menuVisible) AudioManager.playMenuMusic();
  // * Menu HTML loads before main; first gesture calls this to start menu music
  // * once Howler is wired (see cart-rave-menu.js pointerdown bridge). Also
  // * invoked best-effort at boot-splash dismiss — the resume() only succeeds
  // * where autoplay policy allows, and rejections are swallowed.
  window.__cartRaveTryStartMenuMusic = () => {
    try {
      // * Only while the menu is actually up. Boot-splash dismiss and the menu
      // * shell's first-pointerdown hook can fire AFTER Solo/Quickplay already
      // * started level music — without this guard they called playMenuMusic()
      // * and the menu track bled into (or stole) the arena playlist.
      if (!gameRefs.menuVisible) return;
      if (AudioManager.isGameMusicPlaying()) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      AudioManager.playMenuMusic();
    } catch {
      /* ignore */
    }
  };

  // * MAIN-1 Lever G: menu / play entry + level music + audio unlock + touch visibility.
  // * Music is per-arena (src/music/levelMusic.js); playlist warm lives in menuPlayEntry.
  // * Late getters: level drain, podium skip, refreshMenuStats — rebound below.
  /** @type {() => void} */
  let refreshMenuStats = () => {};

  const menu = createMenuPlayEntry({
    audioListener,
    soundUrl,
    // * BUNDLE-1 Lever C triggers 2 + 3 — every enterPlayMode() in menuPlayEntry goes
    // * through startPlay(), which awaits this latch first. Injected (never imported
    // * there) so menuPlayEntry keeps no static edge to gameBoot.js.
    ensureGameSystems,
    isGameSystemsReady,
    getMenuVisible: () => gameRefs.menuVisible,
    setMenuVisible: (v) => { gameRefs.menuVisible = v; },
    getLabelRenderer: () => labelRenderer,
    removePodiumSkipListeners: () => gameRefs.removePodiumSkipListeners(),
    refreshMenuStats: () => refreshMenuStats(),
    // * Lever D: levelOrchestration is behind the boundary — read it off refs, and keep the
    // * optional chaining (a menu return before the latch resolves has nothing to drain).
    drainPendingArenaRotation: () => { void gameRefs.level?.drainPendingArenaRotation?.(); },
    setJoinedViaTypedCode: (v) => { gameRefs.joinedViaTypedCode = v; },
    getPendingColorChipEl: () => gameRefs.pendingColorChipEl,
    setPendingColorChipEl: (v) => { gameRefs.pendingColorChipEl = v; },
    setPendingColorKey: (v) => { gameRefs.pendingColorKey = v; },
    setLocalColorPicked: (v) => { gameRefs._localColorPicked = v; },
  });
  const {
    prepareLevelMusic,
    startLevelMusic,
    updateTouchControlsVisibility,
    initMenu,
    commitMenuHiddenForGame,
  } = menu;

  // Make canvas able to receive keyboard focus.
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  // * Focus only when the menu is not covering the canvas — boot-time focus steals
  // * keyboard/screen-reader attention from #cr-root controls. Game entry paths focus
  // * the canvas when leaving the menu; pointerdown also covers gesture-gated focus.
  setTimeout(() => {
    if (!gameRefs.menuVisible) canvas.focus();
  }, 0);

  input = Input.setupInput(
    canvas,
    () => {
      // * On the results/podium screen, Escape (and gamepad B, which dispatches
      // * Escape) backs out to the MAIN MENU instead of opening the pause overlay
      // * on top of the podium — matches the MAIN MENU button's behavior.
      if (GameState.getRoundState().phase === "podium") {
        podiumAutoContinue.clear();
        gameSession.returnToMenu({ reason: "results" });
        return;
      }
      // * Lever D: no world ⇒ no pause overlay, and the default predicate says so, so an
      // * Escape press at the title screen is a no-op exactly as it was before.
      if (gameTeardownHooks.isEscOverlayVisible()) {
        gameTeardownHooks.hideEscOverlay();
      } else {
        gameTeardownHooks.showEscOverlay();
      }
    },
    () => {
      setAllAudioMuted(!getIsMuted());
    },
    () => {
      if (gameRefs.menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      gameRefs.cart?.attemptLocalHop();
    },
    () => {
      if (gameRefs.menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      const cart = gameRefs.cart?.localCartForConnId();
      if (!cart) return;
      gameRefs.cart.triggerRamBoost(cart, performance.now());
    }
  );

  Input.setupTouchControls({
    onHop: () => {
      if (gameRefs.menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      gameRefs.cart?.attemptLocalHop();
    },
    onBoost: () => {
      if (gameRefs.menuVisible) return;
      if (GameState.getRoundState().phase !== "running") return;
      const cart = gameRefs.cart?.localCartForConnId();
      if (!cart) return;
      gameRefs.cart.triggerRamBoost(cart, performance.now());
    },
  });

  startGamepadUiNav();

  // --- Renderer & scene ---
  const renderer = createRenderer(canvas);
  idleWarmRenderer = renderer;

  // * WebGL context loss (iOS Safari reclaims contexts aggressively under memory
  // * pressure/backgrounding; previously the game just froze with no recovery path).
  // * preventDefault permits restoration; a full reload is the only state-safe
  // * recovery for the whole app (composer RTs, instanced buffers, WASM-side refs).
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn("[CartRave] WebGL context lost");
  });
  let contextLossReloaded = false;
  canvas.addEventListener("webglcontextrestored", () => {
    if (contextLossReloaded) return;
    contextLossReloaded = true;
    console.warn("[CartRave] WebGL context restored — reloading for a clean GPU state");
    window.location.reload();
  });

  // * Software-WebGL notice: createRenderer already floored the session to LOW,
  // * but LOW cannot rescue a CPU rasterizer — the game will still crawl. A quiet
  // * bottom strip let frustrated playtesters miss it entirely, so this is a
  // * center-stage first-entry modal that names the cause and the *right* fix.
  // * The two software causes need opposite fixes:
  // *   - "Basic Render Driver" / WARP → Windows loaded NO GPU driver (or it's a
  // *     VM / remote desktop). Toggling browser accel does nothing; the fix is a
  // *     driver install. Multiple browsers all failing is this case.
  // *   - SwiftShader / llvmpipe → a real GPU exists but the browser has hardware
  // *     acceleration turned off (or blocklisted the GPU). Browser-setting fix.
  if (isSoftwareRendererActive()) {
    const adapter = getSoftwareRendererName();
    const noDriver = /basic render|warp\b/i.test(adapter);
    const fixHtml = noDriver
      ? "Windows isn't loading a graphics driver for your GPU, so the game is running on "
        + "the CPU and will be <strong>very slow</strong>.<br><br>"
        + "<strong>To fix:</strong> update your graphics driver — Device Manager → Display "
        + "adapters → Update driver, or grab the latest from your GPU maker (NVIDIA / AMD / "
        + "Intel). If this is a remote-desktop or cloud PC, it may have no GPU at all."
      : "Your browser is drawing without GPU acceleration, so the game is running on the "
        + "CPU and will be <strong>very slow</strong>.<br><br>"
        + "<strong>To fix:</strong> turn on hardware acceleration — Settings → System → "
        + "“Use graphics acceleration when available” — then reload. If it's already "
        + "on, updating your graphics driver usually clears it.";

    const backdrop = document.createElement("div");
    backdrop.id = "cr-softgl-notice";
    backdrop.setAttribute("role", "alertdialog");
    backdrop.setAttribute("aria-modal", "true");
    // * z-index 20010 — band table: hud.css, next to `#hud`.
    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:20010;display:flex;align-items:center;justify-content:center;"
      + "padding:16px;background:rgba(4,2,8,0.72);backdrop-filter:blur(2px);";

    const card = document.createElement("div");
    card.style.cssText =
      "position:relative;max-width:min(92vw,480px);padding:22px 22px 20px;border:1px solid #ff2bd6;"
      + "background:rgba(12,6,20,0.97);color:#f4eaff;font:13px/1.6 'Space Mono',monospace;"
      + "border-radius:10px;box-shadow:0 0 32px rgba(255,43,214,0.45);text-align:left;";
    card.innerHTML =
      "<div style=\"font-size:15px;letter-spacing:0.04em;color:#ff2bd6;margin-bottom:10px;\">"
      + "◆ GRAPHICS RUNNING IN SOFTWARE MODE</div>"
      + "<div>" + fixHtml + "</div>"
      + "<div style=\"margin-top:14px;font-size:10px;opacity:0.5;word-break:break-word;\">"
      + "Detected adapter: " + adapter.replace(/</g, "&lt;") + "</div>";

    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "PLAY ANYWAY";
    play.style.cssText =
      "margin-top:16px;width:100%;padding:9px 12px;border:1px solid #ff2bd6;border-radius:7px;"
      + "background:rgba(255,43,214,0.14);color:#f4eaff;font:12px 'Space Mono',monospace;"
      + "letter-spacing:0.08em;cursor:pointer;";
    play.addEventListener("click", () => backdrop.remove(), { once: true });
    card.appendChild(play);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  const scene = createScene();

  // * BUNDLE-1 Lever D: Effects.initEffects / spawnTrashBurstRef moved into gameBoot with
  // * the rest of the in-round graph — `src/effects.js` was one of the four static edges
  // * still dragging the heavy modules into the eager set. Nothing on the menu path (menu
  // * attract renders the idle-warmed arena, which is itself built behind the latch) reads
  // * an FX pool before the boot runs.

  // * IBL PMREM bake deferred until after the menu is shown (see bootstrapWorldCore).

  // --- Camera, audio, post-processing ---
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    600,
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);

  // * Lever D: gameRefs.triggerCartShatterRef is assigned inside gameBoot (cartShatter.js).

  // * Living Cargo spill helpers (armSpillBoost / spillCountForCart) live in
  // * cargoLoad.js — wired into gameFlow/sim deps via loopDeps.attachPhaseDeps.

  // * BUNDLE-1 Lever D: `createGameContext().registerModules({… Simulation, Entities, HUD})`
  // * moved into gameBoot. Registering those three module namespaces here was the last
  // * static edge holding `src/simulation.js`, `src/entities.js` and `src/hud.js` in the
  // * eager set; nothing reads gameCtx before the boot builds it.
  const BASE_FOV = CONFIG.camera.fov;

  scene.add(audioListener);

  const { composer, bloomPass, arcadePass, fxaaPass, outputPass } = createComposer(renderer, scene, camera);
  gameRefs.fxPass = arcadePass;
  if (!gameRefs.bloomEnabled && bloomPass) bloomPass.enabled = false;
  if (!gameRefs.fxPassEnabled && gameRefs.fxPass) gameRefs.fxPass.enabled = false;
  // * URL ablation / postmin — after user toggles so disabled flags still win for QA.
  applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });

  // * BUNDLE-1 Lever D Edge 2: `createLevelOrchestration` moved into gameBoot. It is the
  // * single biggest eager edge the card had left — it statically pulls Simulation /
  // * Effects / Entities / CameraMod / ArenaAmbience / cartShatter / koHitmarkerFx /
  // * waterDeathFx / sceneExtras / contactShadows. It is safe to be LATE IN BYTES only
  // * because the arena work it drives is already LATE IN TIME: every path that needs it
  // * (idle warm at 1800 ms, play entry, the harness branch) runs behind the same latch.
  // * The handle lands on `gameRefs.level`; menu-side reads must all be `?.`-guarded.

  if (getDebugParams().cam) applyDebugCameraPose(camera);

  if (import.meta.env.DEV) {
    // * Dev-only perf probe (see createRenderer): scene/camera/composer for console-driven profiling.
    const probe = /** @type {any} */ (window);
    probe.__cartRavePerf = { ...probe.__cartRavePerf, scene, camera, composer };
  }

  // * Attract-mode arena backdrop: renders the idle-warmed arena behind the
  // * menu on its own throttled loop (the game loop skips while menuVisible).
  initMenuAttract({
    camera,
    scene,
    renderer,
    composer,
    isWorldBootstrapped,
    getMenuVisible: () => gameRefs.menuVisible,
    getArenaRadius: () => CONFIG.record.radius,
    getLevelId: getCurrentLevelId,
    // * SHOOT-ANIM-1: the attract loop renders but ran no updates, so level animation
    // * was frozen at its constructor value behind the menu and in every capture. This
    // * is the game loop's cosmetic block (the rave gate + the two calls above it)
    // * driven from the only loop that is actually running here.
    // ! Lever D null-safety: this loop starts at initMenu() — i.e. BEFORE the latch — so
    // ! every level.* read here is now `gameRefs.level?.…`. Pre-latch there is no arena to
    // ! animate (the attract loop is rendering an empty scene), so the no-op is correct.
    onAnimationTick: (timeMs) => {
      const lvl = gameRefs.level;
      /** @type {any} */ (lvl?.sceneExtras)?.update?.(timeMs, camera);
      lvl?.levelUpdate?.(timeMs);
      // * SHOOT-ANIM-2: same story one block down — Classic's crowd, stage lights and
      // * LED screen sat frozen too. Deliberately NO frameBudgetAllow here: it fails
      // * CLOSED without a preceding beginFrameBudget (stale frameStartMs → negative
      // * remaining) and its allowCache is only cleared by beginFrameBudget, so the
      // * first false would latch this bucket permanently. Calling beginFrameBudget
      // * instead would have two loops writing one set of module globals, and the
      // * budget exists to protect host physics — none of which runs at the menu.
      // * Weak machines are covered here by the attract cost feed → auto-quality,
      // * which steps the tier down and flips crowdAnimate off.
      if (lvl?.raveDressingWanted?.()) lvl.tickRaveDressing(timeMs);
      // * LOD stays on local wall time even when ?t= pins animation — levelLod's
      // * _lastUpdateMs latch is module-global with a 250ms interval, so a small
      // * pinned t would park it in the future and suppress LOD entirely. Same
      // * local-clock reasoning as LOD-CLOCK-1 at the game-loop call site.
      updateLevelLod(camera, performance.now());
    },
    // * Weak machines land at the MENU first — feed measured attract frame cost
    // * to the same session watchdog the game loop uses so they step down to a
    // * survivable tier before ever entering a round. (Frame spacing can't be
    // * used here: the attract loop throttles to ~30fps by design.)
    onRenderCost: (frameCostSec, nowMs) => {
      // * "attract" tags the feed: this is FRAME COST — animation tick plus render, not
      // * frame delta (the attract loop throttles to ~30fps) — yet both feed the same
      // * 20.5ms bar. WARM-IGPU-1 Phase 0b.
      if (tickAutoQuality(frameCostSec, nowMs, "attract")) handleAutoQualityStepDown();
    },
  });

  let devControl = null;
  // * Run-6: control levers also attach in PROD when ?diag=1 is present — Wyatt needs
  // * forceSuddenDeath/setScores on the live site to reproduce MP-only round-end bugs
  // * (still host-gated + running-round-gated inside devControl).
  // * SEC-DIAG-1 closed the trade-off that bought (a ?diag=1 quickplay host could cheat
  // * scores): in prod the round levers refuse in PUBLIC QUICKPLAY and grantKos is absent
  // * outside DEV. Live round-end repro now goes through a friends room, which is code-gated.
  // * Read-only diag and F8 capture are deliberately untouched — they are how evidence is
  // * collected on the live site.
  if (import.meta.env.DEV || diagUrlFlags().enabled) {
    try {
      const { createDevControl } = await import("./dev/devControl.js");
      devControl = createDevControl({
        getIsHost: () => Netcode.getIsHost(),
        // * SEC-DIAG-1 public-room gate. A getter, not a captured value: menu → solo → menu →
        // * quickplay happens without a page reload, so a mode read once at construction would
        // * outlive its room and leave a solo-built control live in a public game.
        getGameMode: () => Netcode.detectGameMode(),
        getRoundState: () => GameState.getRoundState(),
        getNetSlots: () => Netcode.getNetSlots(),
        getYouConnId: () => Netcode.getYouConnId(),
        getLocalSlotIndex: (connId) => Netcode.strictSlotIndexForConn(connId),
        setRoundScores: (scores) => GameState.setRoundScores(scores),
        setRoundStartedAtMs: (startedAtMs) => GameState.setRoundStartedAtMs(startedAtMs),
        getRoundClockNowMs,
        sendHostRound: () => Netcode.sendHostRound(),
        grantKos: (level, n) => unlockStore.getState().recordKillOnLevel(level, n),
        roundDurationMs: CONFIG.round.durationMs,
        // * Non-host session teardown lever — drives the real menu-return path so the
        // * netharness teardownRejoin scenario can reproduce the 07-17 axis-unwire freeze.
        returnToMenu: (reason) => gameSession.returnToMenu({ reason }),
        // * SHEET-1 forceKillFeed deps. `isDev` is passed IN, not read inside devControl:
        // * vitest runs with DEV === true, so an internal read would leave the production
        // * branch untestable. It gates that one lever off in prod ?diag=1 builds.
        // * The rest are lazy getters — hud and allCartsRef are assigned later in main().
        isDev: Boolean(import.meta.env.DEV),
        getHud: () => gameRefs.hud,
        getAllCarts: () => gameRefs.allCartsRef,
        colorHexForSlot: displayColorHexForSlot,
      });
    } catch (error) {
      console.warn("[CartClashDev] Dev control levers failed to initialize:", error);
    }
  }
  if (import.meta.env.DEV) {
    try {
      const { initPostFxDebugGui } = await import("./postFxDebug.js");
      const getDevStatus = () => {
        const state = GameState.getRoundState();
        const adjustedNow = getRoundClockNowMs() - Netcode.getHostClockOffsetMs();
        let unlockOverride = null;
        try {
          unlockOverride = localStorage.getItem(DEV_UNLOCKS_STORAGE_KEY);
        } catch {
          // * Privacy modes report the default rather than blocking the panel.
        }
        return {
          isHost: Netcode.getIsHost(),
          phase: state.phase,
          remainMs: state.phase === "running" && !state.isSuddenDeath
            ? getRoundRemainingMs(state.startedAtMs, CONFIG.round.durationMs, adjustedNow)
            : null,
          unlockOverride,
        };
      };
      initPostFxDebugGui({
        renderer, scene, camera, bloomPass, arcadePass, fxaaPass,
        control: devControl,
        getStatus: getDevStatus,
      });
    } catch (error) {
      console.warn("[CartClashDev] Developer panel failed to initialize:", error);
    }
  }


  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "fixed";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  // * World-anchored labels sit UNDER all screen UI: below touch controls
  // * (19990) and the HUD (20000) — countdown/SUDDEN DEATH banners, chips, and
  // * feed plates must never draw behind a nametag.
  labelRenderer.domElement.style.zIndex = "19985";
  labelRenderer.domElement.style.display = gameRefs.menuVisible ? "none" : "block";
  document.body.appendChild(labelRenderer.domElement);

  CameraMod.initCameraFollow(camera, CONFIG.camera);

  const fpsState = {
    frames: 0,
    last: performance.now(),
    get canvas() { return fpsCanvas2d; },
    set canvas(v) { fpsCanvas2d = v; },
    get ctx() { return fpsCtx2d; },
    set ctx(v) { fpsCtx2d = v; },
  };

  const { updateViewport } = createCameraFraming({
    camera,
    renderer,
    composer,
    arcadePass,
    fxaaPass,
    bloomPass,
    labelRenderer,
    getFpsCanvas: () => fpsCanvas2d,
  });

  updateViewport();

  // --- HUD, menu, results overlay ---
  // * Audio state + menu audio wiring live in ui/audioControls.js (initAudioControls above).

  /** Wired after clearAutoContinuePodiumTimeout is defined in main(). */
  const podiumAutoContinue = { clear: () => {} };

  // * Menu bootstrap / initMenu / commitMenuHiddenForGame live in createMenuPlayEntry (Lever G).

  ({ refreshMenuStats } = createMenuStats());


  let qualityRebuildInProgress = false;
  const handleQualityTierChange = async (tier, { persist = true } = {}) => {
    if (qualityRebuildInProgress) return;
    qualityRebuildInProgress = true;
    // * Close Esc overlay first so it doesn't persist across the rebuild.
    gameTeardownHooks.hideEscOverlay();
    if (persist) setQualityTier(tier);
    // * setQualityTier clears the session override so user choices beat the auto-quality
    // * watchdog — but the SwiftShader hard floor rides that same override. Re-clamp:
    // * picking HIGH on software WebGL rebuilds the DPR×2 HalfFloat RT chain in system
    // * RAM, the exact tab-OOM the floor exists to prevent. The pref still persists, so
    // * a future hardware-accelerated session gets the user's choice.
    if (isSoftwareRendererActive() && tier !== "low") setSessionQualityTier("low");
    // * Show loading overlay with quality-apply copy, then rebuild in-place.
    showQualityApplyLoading();
    await yieldForPaint();
    try {
      // ! Lever D: rebuildForQualityChange lives on the deferred levelOrchestration handle,
      // ! and the GFX menu can be used before the latch resolves. Force the boot rather than
      // ! silently skipping — a menu quality change must still re-apply the composer tier,
      // ! renderer pixel ratio and FBO sizes, which is what the player sees behind the menu.
      // ! We are already under the quality-apply overlay here, so the await is covered.
      await ensureGameSystems();
      await gameRefs.level?.rebuildForQualityChange();
    } catch (err) {
      console.error("[CartRave] quality rebuild failed:", err);
    } finally {
      // * FIX-QUALFEEL: rebuildForQualityChange() resolves *before* the expensive
      // * post-swap frames (shader link, first draw of the new render path) are
      // * painted, so dismissing here left the freeze happening on a bare screen —
      // * it read as unannounced. Hold the overlay across 2 confirmed painted
      // * frames first. Runs on the throw path too, so the overlay can never stick.
      try {
        await waitForPaintedFrames(2);
      } catch { /* a stalled rAF must never strand the overlay */ }
      dismissAllLoadingOverlays();
      // * Cleared last: a second toggle must not interleave while the overlay is up.
      qualityRebuildInProgress = false;
    }
  };

  // * Auto-quality watchdog fired (session tier already stepped down) — apply live,
  // * without the loading overlay: mid-round the swap is quick knob flips.
  const handleAutoQualityStepDown = () => {
    // * Lever D: the watchdog only fires off measured attract/game frames, which means an
    // * arena is already on screen and the latch has therefore resolved — but stay `?.`-safe
    // * rather than assume it, and never force a boot from a per-frame cost feed.
    gameRefs.level?.rebuildForQualityChange().catch((err) => {
      console.error("[CartRave] auto-quality rebuild failed:", err);
    });
  };


  // * BUNDLE-1 Lever C: the game half of boot is no longer CALLED here — only its context
  // * is assembled. `ensureGameSystems()` dynamically imports orchestration/gameBoot.js and
  // * runs bootGameSystems(ctx) on the first of the five triggers (idle warm, play press,
  // * ?room= auto-enter, ?harness=, first netcode hello).
  // ! Must stay AHEAD of initMenu(): initMenu can synchronously take the `?room=`
  // ! auto-enter branch, and menuPlayEntry's startPlay() wrapper awaits this latch — which
  // ! throws if the context is not assembled yet.
  // ! initMenu()'s HUD.hideGameplayElements() / removePodiumSkipListeners() now land BEFORE
  // ! the HUD exists; gameBoot re-applies the menu HUD state at the end of its boot.
  gameBootCtx = {
    refs: gameRefs,
    canvas,
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    arcadePass,
    fxaaPass,
    outputPass,
    audioListener,
    soundUrl,
    labelRenderer,
    input,
    BASE_FOV,
    fpsState,
    podiumAutoContinue,
    sessionBridgeCtx,
    sessionRefs,
    helloGate,
    gameSession,
    flushPendingSessionBootstrap,
    markFirstHelloReceived,
    initialNpcNames,
    // * Lever D: levelOrchestration is constructed inside gameBoot now and needs these two
    // * from the (eager) menuPlayEntry factory.
    prepareLevelMusic,
    startLevelMusic,
    updateTouchControlsVisibility,
    initMenu,
    commitMenuHiddenForGame,
    handleQualityTierChange,
    handleAutoQualityStepDown,
  };

  wireMenuAudioControlsOnce();
  syncAllAudioUi();
  initMenu();


  window.addEventListener("cartrave:level-changed", () => {
    scheduleMenuLevelPreview();
    // * BOOT-PERF-1: retarget in-flight idle warm when the picker moves. Pre-start
    // * (still in the 1.8s delay) does not need this — runWarm reads storage at fire.
    if (
      gameRefs.menuVisible
      && !isWorldBootstrapped()
      && !isIdleWorldWarmSuppressed()
      && isWorldBootstrapInFlight()
    ) {
      void ensureWorldBootstrapped(resolveLevelId(storageGet(LEVEL_STORAGE_KEY)));
    }
  });


  // * Register bridge functions for cart-rave-menu.js to toggle GFX/quality live.
  registerGraphicsToggleHandlers({
    togglePostFx: (next) => {
      gameRefs.bloomEnabled = next;
      gameRefs.fxPassEnabled = next;
      settingsStore.getState().setBloomEnabled(next);
      settingsStore.getState().setFxPassEnabled(next);
      if (bloomPass) bloomPass.enabled = next;
      if (arcadePass) arcadePass.enabled = next;
      if (gameRefs.fxPass) gameRefs.fxPass.enabled = next;
      // * Keep URL ablation in force after menu Post-FX toggle.
      applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });
    },
    applyQualityTier: (tier) => handleQualityTierChange(tier),
  });

  window.addEventListener("resize", updateViewport);
  enableModeMenuButtons();
  window.__cartRaveMainReady = true;
  window.__cartRaveBootstrapped = true;
  // * DEPLOY-STALE-HTML-1 B: boot succeeded — allow a future deploy-window heal in this tab.
  try {
    sessionStorage.removeItem("cc-deploy-heal");
  } catch {
    /* private mode / blocked storage */
  }
  // * Boot telemetry — time-to-menu-interactive from navigation start (ms). Read via
  // * performance.getEntriesByName("cr:menu-ready")[0].startTime or the DevTools timeline.
  // * The app had no boot marks, so load-time regressions were invisible to profiling.
  if (typeof performance !== "undefined" && performance.mark) {
    performance.mark("cr:menu-ready");
  }
  window.__cartRaveCancelBootError?.();
  document.getElementById("cr-boot-error")?.classList.remove("cr-boot-error--visible");

  // * Visual QA harness (Playwright shoot / blackframes) when URL flags request it.
  const dbg = getDebugParams();
  if (dbg.harness || dbg.freeze || dbg.cam || dbg.ablate.size || dbg.hideHud) {
    installVisualHarness({
      isReady: () => Boolean(window.__cartRaveMainReady),
      isWorldReady: () => isWorldBootstrapped(),
      getError: () => null,
      getRenderer: () => renderer,
      getCamera: () => camera,
      getCanvas: () => canvas,
      getPasses: () => ({ bloomPass, arcadePass, fxaaPass, outputPass }),
      // * BUNDLE-1 Lever C: ?freeze / ?cam / ?ablate installs the harness but does NOT
      // * take the harness idle branch below, so this hook can be the first thing that
      // * needs initBootstrap() — which now lives behind the latch.
      ensureWorld: () => ensureGameSystems().then(() => ensureWorldBootstrapped()),
      onSettleFrame: () => {
        if (isDebugCameraLocked()) applyDebugCameraPose(camera);
      },
    });
  }

  // * Netcode E2E harness (2-client rig / tools/netharness.mjs) when ?nettest=1. Read-only
  // * snapshot of phase + per-cart pose so an external driver can assert cross-client sync.
  // * Input is driven by real keydown events, not this hook. Zero cost when the flag is absent.
  if (new URLSearchParams(window.location.search || "").has("nettest")) {
    window.__ccNetTest = true;
    Netcode.setNetTestActive(true);
    installNetTestHarness({
      isReady: () => Boolean(window.__cartRaveMainReady),
      getPhase: () => GameState.getRoundState()?.phase ?? "unknown",
      getYouConnId: () => Netcode.getYouConnId(),
      getHostId: () => Netcode.getHostId(),
      getIsHost: () => Netcode.getIsHost(),
      getLocalSlotIndex: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
      getCarts: () => gameRefs.allCartsRef,
      getNetSlots: () => Netcode.getNetSlots(),
      getLatestSnap: () => Netcode.getLatestSnap(),
      getAxis: () => Input.getAxis(),
      getPendingInputCount: () => Netcode.getPendingInputs().length,
      getPendingMidJoinConnId: () => gameRefs.pendingMidRoundJoinRespawnConnId,
      getInputCounters: () => Netcode.__netcodeTestHooks.getInputCounters(),
      getShouldPredict: () => Netcode.shouldUseClientPrediction(),
      getMode: () => Netcode.detectGameMode(),
      getMigFreezeRemMs: () =>
        Netcode.getHostMigrationFreezeUntilMs() - (performance.timeOrigin + performance.now()),
      getHostInputDebug: (connId) => {
        const h = Netcode.__netcodeTestHooks;
        return {
          queueLen: h.getRemoteInputQueueLength(connId),
          lastAckSeq: h.getHostLastProcessedInputSeq(connId),
        };
      },
    });
  }

  // * Build identity banner + stale-cache guard — UNCONDITIONAL (not ?diag-gated) so every
  // * tab prints its bundle to the console and shouts if it's running an old cached bundle
  // * while a newer one is deployed. Root cause of the 07-21 "fixes never ran" playtest.
  logBuildBanner();

  // * Gameplay diagnostics hub (?diag → window.__ccDiag). Probes + event log + optional
  // * control (host-gated; wired under ?diag=1 in DEV or prod). Read surface works in prod
  // * builds; zero cost when the flag is absent. See tools/gameharness.mjs.
  if (diagUrlFlags().enabled) {
    // * Scenario levers — each reuses an existing proven production path; never a new
    // * mutation route. Run-6: also attached in prod builds under ?diag=1 (host-gated;
    // * see the devControl creation note) so live MP round-end bugs are reproducible.
    installDiagnostics({ flags: diagUrlFlags(), control: devControl });
    // * Run-7 P0: Long Task observer so multi-second host freezes attribute to a
    // * main-thread task (or empty lt[] + focus flags) on the next friend F8.
    installLongTaskProbe();
    installGameplayDiagnostics({
      getCarts: () => gameRefs.allCartsRef,
      getNetSlots: () => Netcode.getNetSlots(),
      getCamera: () => camera,
      getMode: () => Netcode.detectGameMode(),
      getLevelId: () => getCurrentLevelId(),
      getLocalSlot: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
      // * Spawn-lock triage (07-17 run 2): main-closure state the "net" probe can't
      // * reach — an F8 during "can't leave spawn" must show whether inputs are being
      // * sampled at all, and whether an arena swap gate is still up.
      getNetDebug: () => {
        const slot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
        const localCart = Array.isArray(gameRefs.allCartsRef) && slot >= 0
          ? gameRefs.allCartsRef[slot]
          : null;
        return {
          // * Lever D: null until the latch resolves — a diag probe must never throw.
          arenaRotationInFlight: gameRefs.level?.arenaRotationInFlight ?? null,
          menuVisible: gameRefs.menuVisible,
          // * Cap-200: DOM truth next to the flag — late CartRave.show() after hide left
          // * menuVisible false while #cr-root was visible (harness false green).
          crRootDisplay: (() => {
            const el = document.getElementById("cr-root");
            if (!el) return null;
            return el.style.display || getComputedStyle(el).display;
          })(),
          localShatterState: Boolean(localCart?._shatterState),
          localBodyEnabled: localCart?.body ? localCart.body.isEnabled() : null,
          // * The two client-freeze gates the 07-17 captures could NOT see: an unwired
          // * axis ref (input sampling no-op) and a live host-migration freeze window.
          axisWired: Netcode.isInputAxisWired(),
          migFreezeRemMs: Math.max(
            0,
            Math.round(Netcode.getHostMigrationFreezeUntilMs() - (performance.timeOrigin + performance.now())),
          ),
        };
      },
    });

    // * Bug-capture hotkeys (F8, or legacy Ctrl+Shift+D): assemble a __ccDiag capture bundle for
    // * the moment a bug is on screen — "player reports it, dev presses the key". Logs the bundle,
    // * copies its JSON to the clipboard, downloads a .json, AND POSTs to /api/captures so both
    // * playtest machines land in one place (pull with `npm run captures:pull` — no email hop).
    // * Read-only on the game — captureBundle() never mutates state. Safe in prod under ?diag.
    // * The harness path captures on its own; automatic error/assert captures live under
    // * __ccDiag.captures() (auto path does not upload — only the intentional F8).
    /** @param {string} msg @param {number} [ms] */
    const captureToast = (msg, ms = 6000) => {
      try {
        /** @type {any} */ (window).CartRave?.showToast?.(msg, ms);
      } catch {
        /* toast surface not up yet — console lines above still carry the outcome */
      }
    };
    const manualCapture = async (trigger) => {
      try {
        // * Re-verify loaded-vs-deployed RIGHT NOW so this F8 carries current truth, not the
        // * boot-time snapshot. If stale, shout before capturing — a bug "reproduced" on an old
        // * cached bundle is not a bug in the deployed build (07-21 root cause).
        // ! Never let the freshness check decide whether a capture happens: it is advisory.
        // ! It self-aborts after 2s, and a throw here is swallowed so the bundle still runs.
        let fresh = /** @type {import("./utils/buildFreshness.js").Freshness} */ ({ checked: false });
        try {
          fresh = await refreshBuildFreshness();
        } catch (freshErr) {
          console.warn("[diag] build freshness check failed (capturing anyway):", freshErr);
        }
        if (fresh.ok && fresh.stale) {
          console.warn(
            `%c[diag] ⚠ STALE BUNDLE — capturing anyway%c  tab=index-${fresh.loaded}.js  deployed=index-${fresh.live}.js.\n` +
              `This F8 does NOT reflect the deployed build. Hard-reload (Ctrl+Shift+R) and re-capture.`,
            "font-weight:bold;color:#f14c4c",
            "color:inherit",
          );
        }
        const bundle = /** @type {any} */ (window).__ccDiag.captureBundle({
          scenario: "manual",
          reason: `hotkey ${trigger}`,
        });
        const json = JSON.stringify(bundle, null, 2);
        // eslint-disable-next-line no-console
        console.info(`[diag] capture bundle (phase=${bundle.phase}, ${bundle.events.length} events):`, bundle);
        navigator.clipboard?.writeText?.(json).then(
          () => console.info("[diag] capture bundle copied to clipboard"),
          () => {},
        );
        const blob = new Blob([json], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cc-capture-${bundle.phase ?? "nophase"}-${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);

        // * Optional override: ?captureLabel=run7-A-nonhost-weak (console + playtest cards).
        const labelParam = new URLSearchParams(location.search).get("captureLabel");
        // * uploadCaptureBundle never throws: it returns { ok:false, error } for network
        // * rejections, Worker non-ok (`http_<status>`), and JSON parse failures alike — so
        // * ONE toast branch covers all three. Console-only was the bug: a failed upload was
        // * indistinguishable from a good one at the keyboard.
        const up = await uploadCaptureBundle(bundle, {
          label: labelParam || undefined,
        });
        if (up.ok) {
          // eslint-disable-next-line no-console
          console.info(`[diag] capture uploaded → /api/captures id=${up.id} (pull: npm run captures:pull)`);
          captureToast(`Capture #${up.id ?? "?"} uploaded ✓ (also saved locally)`);
        } else {
          console.warn("[diag] capture upload failed:", up.error);
          captureToast(`Capture upload FAILED: ${up.error ?? "unknown"} — the .json download still saved`, 9000);
        }
      } catch (err) {
        console.warn("[diag] capture bundle failed:", err);
        captureToast(`Capture FAILED: ${err instanceof Error ? err.message : String(err)}`, 9000);
      }
    };
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const isF8 = e.code === "F8" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const isLegacy = e.ctrlKey && e.shiftKey && e.code === "KeyD";
      if (!isF8 && !isLegacy) return;
      e.preventDefault();
      manualCapture(isF8 ? "F8" : "Ctrl+Shift+D");
    });
  }

  // * Gameplay analytics (production-safe, event-level only — see src/analytics/). Installed
  // * unconditionally: opt-out (?analytics=off / localStorage) and DEV console routing are the
  // * core's concern. Emits match/unlock/challenge/quit/session events via store subscriptions;
  // * nothing per-frame. Runs AFTER the diagnostics block so its `analytics` probe can register
  // * with an installed hub (registerDiagProbe is a no-op before installDiagnostics).
  installGameplayAnalytics({
    getMode: () => Netcode.detectGameMode(),
    getLevelId: () => getCurrentLevelId(),
    getLocalSlot: () => Netcode.strictSlotIndexForConn(Netcode.getYouConnId()),
    // * ANLX-ATTRACT-1: "did I actually play this round?". A mid-round joiner adopts the
    // * room's running phase from hello/MSG.round while still on the menu with no cart, so
    // * the phase transition alone booked phantom matches. Read live (allCartsRef is a
    // * mutable closure ref) and null-guard per the standing cart-access invariant.
    // * Same shape as getNetDebug's localBodyEnabled above — keep them in step.
    getLocalCartActive: () => {
      const slot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
      const cart = Array.isArray(gameRefs.allCartsRef) && slot >= 0
        ? gameRefs.allCartsRef[slot]
        : null;
      return Boolean(cart?.body && cart.body.isEnabled());
    },
    getQuickplayHops: () => Netcode.getQuickplayHopCount(),
  });

  // * VFX-1: live black-frame flicker monitor on real hardware (?blackmon=1). Opt-in,
  // * self-scheduling; logs left/right slab events + shows a counter. Zero cost otherwise.
  if (dbg.blackmon) {
    startBlackFrameMonitor({ getCanvas: () => canvas });
  }

  // * Idle warm: after menu is up, load Rapier + selected level in the background so
  // * first Solo/Quickplay skips the cold arena stack. Idempotent with enterPlayMode.
  // * Delay so menu music + cart Draco keep first dibs on bandwidth; skip when tab hidden.
  // * Harness path warms immediately so shoot tools do not wait on the idle delay.
  if (dbg.harness || dbg.hideHud) {
    // * BUNDLE-1 Lever C trigger 4 — the harness branch bypasses idle warm entirely and
    // * EVERY shoot / blackframes / loadshots capture takes it. ensureWorldBootstrapped()
    // * throws without initBootstrap(), which now lives behind the latch, so this await is
    // * non-optional: without it all visual QA breaks.
    void ensureGameSystems().then(() => ensureWorldBootstrapped()).then(() => {
      if (getDebugParams().cam) applyDebugCameraPose(camera);
      if (getDebugParams().hideHud) {
        const root = document.getElementById("cr-root");
        if (root) {
          root.style.visibility = "hidden";
          root.style.pointerEvents = "none";
        }
        // * Attract only runs while menu is "visible" — keep menuVisible true, hide DOM.
        startMenuAttract();
      } else {
        startMenuAttract();
      }
    }).catch((err) => {
      console.warn("[harness] world warm failed", err);
    });
  } else {
    scheduleIdleWorldWarm({
      getMenuVisible: () => gameRefs.menuVisible,
      getIdleWarmRenderer: () => idleWarmRenderer,
      // * BUNDLE-1 Lever C trigger 1 — the chunk is fetched at the top of the 1800 ms
      // * delay and booted when the warm actually fires. Injected, never imported by
      // * bootstrap.js: that module is eager and a static edge would undo the split.
      prefetchGameSystems,
      ensureGameSystems,
      scheduleMenuLevelPreview,
      prefetchLevelChunks,
      prefetchAnnouncerSfx: () => AudioManager.prefetchSfxByPrefix("announcer_"),
    });
  }
}


// * BUNDLE-1 Lever C trigger 5 — the lobby-bridge guard. `registerGameCallbacks` is wired
// * here at module scope reading `() => sessionBridgeCtx.current`, but `.current` is
// * assigned inside gameBoot. Today no socket can exist before the latch (the only
// * initNetcode() call is inside enterPlayMode's onArenaReady, already behind startPlay),
// * so this is a fail-safe: the first hello forces the boot rather than reading a dead
// * bridge. See docs/planning/bundle-1.md §8 for the full key inventory.
bootstrapNetcodeEntryFromUrl(
  sessionBridgeCtx,
  gameSession,
  captureInviteRoomForDeferredMenu,
  ensureGameSystems,
);

main().catch((err) => {
  console.error("[CartRave] bootstrap failed:", err);
  dismissAllLoadingOverlays();
  if (typeof window.__cartRaveShowBootError === "function") {
    window.__cartRaveCancelBootError?.();
    window.__cartRaveShowBootError(
      err && err.message ? err.message : "Game bootstrap failed. Hard refresh or restart dev server.",
    );
  }
});
