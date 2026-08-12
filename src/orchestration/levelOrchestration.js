// levelOrchestration.js — LevelManagerDeps impls + level-load helpers (MAIN-1 Lever C)
// Mechanical extract from main(); call order preserved. setContactShadowHazards stays inside applyLoadedLevelSideEffects.

import * as THREE from "three";
import {
  applyComposerQualityTier,
  setupSceneEnvironment,
  refreshSceneEnvironmentMaterials,
  setSceneFog,
  setBloomPipeline,
  isComposerBypassActive,
  setComposerBypassActive,
  COMPILE_ASYNC_WARM_PLAY_MAX_WAIT_MS,
  resolveArenaExposure,
} from "../scene.js";
import { applyPostFxAblation, getDebugParams } from "../utils/debugParams.js";
import { mark } from "../utils/perfSpans.js";
import { markBootPhase } from "../utils/bootTimeline.js";
import { RAPIER, initRapier, getRapierBuild } from "../physics/rapierInstance.js";
import * as Simulation from "../simulation.js";
import * as Effects from "../effects.js";
import * as GroceryPool from "../effects/groceryPool.js";
import * as AudioManager from "../audioManager.js";
import * as ArenaAmbience from "../ambience/arenaAmbience.js";
import * as CameraMod from "../camera.js";
import * as Entities from "../entities.js";
import * as Netcode from "../netcode.js";
import { loadLevel, resolveLevelId, LEVEL_STORAGE_KEY } from "../levels/index.js";
import { nextQuickplayArenaId } from "../../shared/arenaPool.js";
import { LEVEL_UNLOCKS } from "../unlockConfig.js";
import { registerMirrorExclude, clearMirrorExcludes } from "../utils/cheapMirror.js";
import { setContactShadowHazards } from "../contactShadows.js";
import { initSceneExtras, disposeSceneExtras } from "../sceneExtras.js";
import { installShatterProgramWarmup } from "../cartShatter.js";
import { installKoHitmarkerProgramWarmup } from "../effects/koHitmarkerFx.js";
import { installWaterFxProgramWarmup } from "../effects/waterDeathFx.js";
import { yieldForPaint } from "../ui/loadingScreen.js";
import { getCurrentLevelId, setLevelSwapping, swapLoadedLevel } from "../levels/levelManager.js";
import { isWorldBootstrapped } from "../bootstrap.js";
import {
  getMenuAttractWarmupPoses,
  setMenuAttractRenderHold,
  setMenuAttractReveal,
} from "../ui/menuAttract.js";
import { crossfadeElement } from "../animations.js";
import { isTouchDevice } from "../utils.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";
import { storageGet } from "../utils/storage.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { CONFIG, CART_COLORS } from "../config.js";
import { STAGE_PRIORITY } from "../ui/centerStage.js";

// * testArena constants inlined (same as main.js — avoid static import of heavy level module).
const TEST_ARENA_SKY = 0x586274;
const TEST_ARENA_FOG_DENSITY = 0.0032;

/**
 * Mutable level/arena state shared with main()'s loop and session bridge.
 * Owned by createLevelOrchestration; main reads via the returned accessors.
 * @typedef {object} LevelOrchestrationApi
 */

/**
 * LevelManagerDeps implementations + level-load / arena-rotation helpers.
 * @param {object} deps
 * @param {import("three").Scene} deps.scene
 * @param {import("three").PerspectiveCamera} deps.camera
 * @param {import("three").WebGLRenderer} deps.renderer
 * @param {*} deps.composer
 * @param {*} deps.bloomPass
 * @param {*} deps.arcadePass
 * @param {*} deps.fxaaPass
 * @param {*} deps.outputPass
 * @param {HTMLElement} deps.canvas
 * @param {() => boolean} deps.getBloomEnabled
 * @param {() => boolean} deps.getFxPassEnabled
 * @param {() => boolean} deps.getMenuVisible
 * @param {() => Array<unknown> | null | undefined} deps.getAllCartsRef
 * @param {() => any} deps.getHud
 * @param {() => { until: number, baseVignette: number | null, baseAberration: number | null } | undefined} [deps.getImpactPulse]
 * @param {() => { radius: number, height: number } | undefined} deps.resolveCinematicCountdownOverrides
 * @param {(levelId: string) => void} deps.prepareLevelMusic
 * @param {(levelId: string) => void} deps.startLevelMusic
 * @param {() => void} deps.stopAllChargeSfx
 */
export function createLevelOrchestration(deps) {
  const {
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    arcadePass,
    fxaaPass,
    outputPass,
    canvas,
  } = deps;

  /** @type {import("@dimforge/rapier3d").World | null} */
  let world = null;
  /** @type {import("@dimforge/rapier3d").EventQueue | null} */
  let eventQueue = null;

  let recordMesh = null;
  let recordCollider;
  let ringHandles;
  let recordColliderHandles = [];
  let pitWallColliderHandle;
  let boothColliderHandles = [];
  let boothNeonMeshes = [];
  let spindleLight = null;
  let pitInnerRadius = CONFIG.record.innerRadius;
  let recordLabelMat = null;
  let levelHazards;
  let disposeLevel;
  let levelUpdate;
  // * SKYBOX-1: MUST start null (see ensureRaveAttractShell).
  /** @type {ReturnType<typeof initSceneExtras> | null} */
  let sceneExtras = null;
  let upgradeRecordReflector = null;
  let setReflectorVisible = null;
  /** @type {((knobs: import("../utils/qualityTiers.js").QualityKnobs) => void) | null} */
  let levelApplyQualityTier = null;
  let raveShellInitialized = false;
  let raveJuiceInitialized = false;
  let raveJuiceJustBuilt = false;
  let sceneEnvironmentDispose = null;
  let vfxProgramAnchorsInstalled = false;
  /** @type {string | null} */
  let pendingArenaRotationLevelId = null;
  let arenaRotationInFlight = false;

  async function rebuildForQualityChange() {
    const knobs = getQualityKnobs();

    // * Physics substep cap + streak budget for the new tier (mirrors config.js boot logic).
    CONFIG.physics.maxSubsteps = knobs.maxSubsteps;
    CONFIG.physics.cart.ramBoost.streakMaxActive = knobs.streakCap;

    // * Post-processing: apply tier passes + renderer pixel ratio + FBO size
    // * (the user's separate Post-FX toggle still gates bloom/arcade).
    applyComposerQualityTier(bloomPass, arcadePass, fxaaPass, renderer, getQualityTier(), composer, {
      bloomEnabled: deps.getBloomEnabled(),
      fxPassEnabled: deps.getFxPassEnabled(),
    });
    // * URL ablation wins over tier/user Post-FX re-enables (visual QA).
    applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });

    // * Arena visuals: reflective floor is a full second scene render — high tier only.
    if (typeof setReflectorVisible === "function") {
      setReflectorVisible(knobs.reflector);
      // * Tier raised to high mid-session: make sure the RT upgrade (256²→1024²) runs.
      if (knobs.reflector) scheduleReflectorUpgrade();
    }

    // * Rave dressing on levels that support it (Classic Record): every tier keeps the
    // * crowd/stage/skybox silhouette so Low still reads as Cart Clash; the tier knobs
    // * decide crowd budget, lasers, and dynamic lights.
    const levelWantsExtras = levelUsesRaveExtras();
    Effects.setRaveExtrasVisible(levelWantsExtras);
    if (levelWantsExtras) Effects.applyRaveExtrasQuality(knobs);

    // * Scene extras (skybox, starfields, planets, UFOs, world spotlights): built only on
    // * levels that use them, and SKYBOX-1 tier-gates them off at LOW — the rig is +54 draw
    // * calls and 5 spotlights, which is the wrong bill for the weakest machines. The
    // * crowd/stage silhouette still carries the Cart Clash read there.
    // * sceneRoots is empty on other levels, so this loop is a no-op there.
    if (sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      const showSky = levelWantsExtras && knobs.skyExtras !== false;
      for (const root of sceneExtras.sceneRoots) {
        root.visible = showSky;
      }
    }

    // * Level-specific tier knobs (e.g. Storerooms ceiling SpotLight budget).
    if (typeof levelApplyQualityTier === "function") {
      levelApplyQualityTier(knobs);
    }

    // * Render-path flip (composer ↔ direct-to-canvas) changes the program cache key
    // * (tone mapping moves in/out of shaders) — every scene program recompiles on the
    // * first frame of the new path. Warm the target path here, behind the loading
    // * overlay, before latching the flag the frame loop reads. compileAsync uses
    // * KHR_parallel_shader_compile so even this warm-up avoids one giant stall.
    if (knobs.composerBypass !== isComposerBypassActive()) {
      try {
        if (knobs.composerBypass) {
          await renderer.compileAsync(scene, camera);
          renderer.render(scene, camera);
        } else {
          composer.render();
        }
      } catch (err) {
        console.warn("[CartRave] render-path warm-up failed:", err);
      }
      setComposerBypassActive(knobs.composerBypass);
    }
  }

  async function ensureRapierPhysics() {
    if (!world) {
      await initRapier();
      // * Dev breadcrumb for A/B: simd vs standard (see getRapierBuild).
      if (import.meta.env?.DEV) {
        console.info(`[rapier] loaded build: ${getRapierBuild()}`);
      }
      world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
      eventQueue = new RAPIER.EventQueue(true);
    }
  }

  function consumeRaveJuiceJustBuilt() {
    const v = raveJuiceJustBuilt;
    raveJuiceJustBuilt = false;
    return v;
  }

  function levelUsesRaveExtras(levelId) {
    const id = levelId ?? getCurrentLevelId();
    return id === "classicRecord";
  }

  function raveDressingWanted() {
    return raveShellInitialized && levelUsesRaveExtras() && getQualityKnobs().crowdAnimate;
  }

  function tickRaveDressing(timeMs) {
    Effects.updateStageLights(timeMs);
    Effects.updateCrowd(timeMs);
    Effects.updateStageLed(timeMs);
    if (raveJuiceInitialized) {
      Effects.updateLasers(timeMs);
      Effects.updateBillboard(timeMs);
    }
  }

  function applyLoadedLevelSideEffects(levelId) {
    const resolved = levelId ?? getCurrentLevelId();
    Simulation.setLevelHazards(levelHazards ?? null);
    setContactShadowHazards(levelHazards ?? null);
    // * ART-EXPO-1: each arena carries its own absolute exposure budget (config.postFx
    // * arenaExposure) — no global lock to ride. Same tone-map curve everywhere; only the
    // * exposure scalar moves, so no program-cache rebuild on arena swap.
    renderer.toneMappingExposure = resolveArenaExposure(resolved);
    // * ART-FILTER-1: the CRT layer (aberration/scanlines/vignette) is a per-arena device,
    // * not a global veneer — identity in The Storerooms, noise everywhere else. Must write
    // * an explicit 0 rather than skip the write: the shader's own uniform defaults are
    // * non-zero, and createComposer seeds all three from the global config at boot.
    if (arcadePass?.uniforms?.uAberration) {
      const arcadeCfg = CONFIG.postFx.arcade;
      const arcadeOn = resolved === "backrooms";
      arcadePass.uniforms.uAberration.value = arcadeOn ? arcadeCfg.aberration : 0;
      arcadePass.uniforms.uScanlineDensity.value = arcadeOn ? arcadeCfg.scanlineDensity : 0;
      arcadePass.uniforms.uVignette.value = arcadeOn ? arcadeCfg.vignette : 0;
      // ! A pulse still live across an arena swap would restore the OLD arena's vignette/
      // ! aberration over the values just written (frameVisuals re-applies the captured base
      // ! every frame until it decays), resurrecting the CRT on Classic/Sundial. Clearing
      // ! `until` as well as the bases is required: with a future `until`, the next impact
      // ! skips base capture entirely and its spike never renders.
      const pulse = deps.getImpactPulse?.();
      if (pulse) {
        pulse.until = 0;
        pulse.baseVignette = null;
        pulse.baseAberration = null;
      }
    }
    // * VHS/security-cam layer rides the arcade pass; only The Storerooms turns it on.
    if (arcadePass?.uniforms?.uVhsAmount) {
      const vhsCfg = CONFIG.postFx.vhs;
      arcadePass.uniforms.uVhsAmount.value = resolved === "backrooms" ? vhsCfg.amount : 0;
      arcadePass.uniforms.uVhsNoise.value = vhsCfg.noise;
      arcadePass.uniforms.uVhsTrackPeriod.value = vhsCfg.trackPeriodSec;
    }
    // * Bloom pipeline: default ?bloompipe=display keeps UnsignedByte + post-tonemap
    // * bloom on every level (no float↔byte mip rebuild when swapping into Storerooms).
    // * ?bloompipe=hdr restores the old split (Classic/Sundial HDR, Storerooms display).
    const bloomPipeMode =
      getDebugParams().bloomPipe === "display" || resolved === "backrooms" ? "display" : "hdr";
    setBloomPipeline({ composer, bloomPass, outputPass }, bloomPipeMode, { levelId: resolved });
    // * ?ablate=vhs / postmin must still win after level VHS turn-on.
    applyPostFxAblation({ bloomPass, arcadePass, fxaaPass, outputPass });
    // * Test Drive bloom rides resolveDisplayBloomConfig (BLOOM_DISPLAY_TESTDRIVE)
    // * through the setBloomPipeline call above — the old HDR-space save/restore
    // * override is gone (it read as no bloom under the display pipeline on entry,
    // * and its restore stomped the next arena's knobs with HDR values on exit).
    if (resolved === "testArena") {
      Effects.clearAmbientDust();
      setSceneFog(scene, renderer, { color: TEST_ARENA_SKY, density: TEST_ARENA_FOG_DENSITY });
    } else {
      Effects.setAmbientDustStyle(
        resolved === "backrooms" ? "backrooms" : resolved === "zanzibar" ? "sunset" : "rainbow",
        CART_COLORS,
        // * Arenas with a directional sun get a dust lobe aimed at it; the rest pass
        // * undefined and keep the uniform ring. Read from CONFIG rather than the level so
        // * this stays out of the lazily-chunked level modules.
        CONFIG.postFx.sunAzimuthByLevel?.[resolved],
      );
      if (resolved === "backrooms") {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.backrooms.color,
          density: CONFIG.postFx.fog.backrooms.density,
        });
      } else if (resolved === "zanzibar") {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.zanzibar.color,
          density: CONFIG.postFx.fog.zanzibar.density,
        });
      } else {
        setSceneFog(scene, renderer, {
          color: CONFIG.postFx.fog.color,
          density: CONFIG.postFx.fog.density,
        });
      }
    }
  }

  function ensureRaveAttractShell(opts = {}) {
    const includeJuice = opts.includeJuice === true;
    const wantRaveExtras = levelUsesRaveExtras();

    // * Build once, then only toggle visibility — rebuilding would thrash the starfield /
    // * planets / spotlight rig on every picker swap.
    // * SKYBOX-1: "built" means built WITH content. initSceneExtras returns the same shape
    // * with an empty sceneRoots when called with enabled:false (every non-Classic level), so
    // * a plain existence check would latch that empty object forever and Classic would never
    // * get its sky — the same class of bug as the old truthy stub, one level down. Only the
    // * populated case counts as built.
    const extrasBuilt = Boolean(
      sceneExtras && !sceneExtras.disposed && sceneExtras.sceneRoots?.length,
    );
    // * SKYBOX-1 tier gate: LOW skips the rig entirely — don't even build it there, so the
    // * weakest machines never pay the construction cost either (starfields, planet meshes,
    // * spotlight rig). One source for the decision, reused by the visibility pass below.
    const wantSky = wantRaveExtras && getQualityKnobs().skyExtras !== false;
    if (wantSky && !extrasBuilt) {
      // * Drops a stale enabled:false shell (no-op when there is nothing to free).
      disposeSceneExtras(sceneExtras);
      sceneExtras = initSceneExtras(scene, pitInnerRadius, { enabled: true });
    } else if (sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) root.visible = wantSky;
    }

    if (wantRaveExtras && !raveShellInitialized) {
      clearMirrorExcludes();
      Effects.initCrowd(scene, CART_COLORS, pitInnerRadius);
      Effects.initStage(scene, pitInnerRadius, CART_COLORS);
      raveShellInitialized = true;
    }

    if (wantRaveExtras && includeJuice && !raveJuiceInitialized) {
      Effects.initBillboard(scene, pitInnerRadius);
      Effects.initLasers(scene, pitInnerRadius, CART_COLORS);
      raveJuiceInitialized = true;
      // * FV-LOAD-1b: menu attract builds includeJuice:false, so the first play entry
      // * first-builds billboard/lasers/crowd programs. Warm path must NOT use the
      // * truncated 1.5s compile budget for that first build (assumed "already compiled").
      raveJuiceJustBuilt = true;
    }

    // * Mirror excludes still register for every root (harmless when hidden); visibility
    // * follows the same tier gate as above — a bare `= true` here would re-show the rig on
    // * LOW on the next picker swap and quietly undo the gate.
    if (wantRaveExtras && sceneExtras && Array.isArray(sceneExtras.sceneRoots)) {
      for (const root of sceneExtras.sceneRoots) {
        root.visible = wantSky;
        registerMirrorExclude(root);
      }
    }

    Effects.setRaveExtrasVisible(wantRaveExtras);
    if (wantRaveExtras) Effects.applyRaveExtrasQuality(getQualityKnobs());
  }

  function initDeferredRaveVisuals() {
    ensureRaveAttractShell({ includeJuice: true });
  }

  function scheduleReflectorUpgrade() {
    if (!upgradeRecordReflector) return;
    // * Only the high tier renders the reflector — skip the 1024² RT upgrade elsewhere.
    if (!getQualityKnobs().reflector) return;
    // * Touch devices that opted into high tier keep the 256² play-entry RT —
    // * the mirror re-renders the whole scene per frame and the res jump is
    // * invisible on phone-sized screens.
    if (isTouchDevice()) return;
    const run = () => {
      try { upgradeRecordReflector(); } catch (e) {}
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 8000 });
    } else {
      setTimeout(run, 2000);
    }
  }

  function finalizeArenaShellForMenu() {
    refreshSceneEnvironmentMaterials(scene);
    ensureRaveAttractShell({ includeJuice: false });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] menu attract shell (sky + stadium, no lasers)");
    }
  }

  function finalizeArenaForPlay() {
    refreshSceneEnvironmentMaterials(scene);
    initDeferredRaveVisuals();
    scheduleReflectorUpgrade();
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] arena finalize (extras + materials)");
    }
  }

  async function warmupActiveSceneShaders(opts = {}) {
    const forPlay = opts.forPlay !== false;
    const juiceFresh = opts.juiceFresh === true;
    // * Short budget only when warm AND juice was already live (not first-built here).
    const useWarmBudget = opts.warm === true && !juiceFresh;
    // * PERF-WARM disambiguation: the round-start freeze is a forPlay warmup's render pair
    // * (warm.render.default + warm.render.flyover) running DURING the countdown, after
    // * carts-ready — which the play-entry warm:true warmup cannot be (it completes before
    // * carts-ready). The two forPlay:true call sites differ only by the warm flag:
    // * play-entry passes warm:true (".play-warm"); quickplay arena rotation (main.js ~2901)
    // * passes no warm (".play-full", full compile budget, no loading overlay). Tag the
    // * render spans so ONE F8 tells us which call site owns the freeze. Menu path (".menu").
    // * juice-fresh warm path tags ".play-juice" so F8 separates "warm but new juice".
    const warmTag = forPlay
      ? juiceFresh
        ? ".play-juice"
        : useWarmBudget
          ? ".play-warm"
          : ".play-full"
      : ".menu";
    // * PROBE-WARM-RT-1: bind a scratch 1×1 RT during anchor install + compileAsync so
    // * three.js builds program cache keys with ColorManagement.workingColorSpace
    // * instead of renderer.outputColorSpace (the null-RT path).  The composer's internal
    // * RTs also use workingColorSpace, so the first KO mid-round is a cache hit instead
    // * of a synchronous shader link.  Any non-null non-XR RT triggers the right path.
    const prevTarget = renderer.getRenderTarget();
    const scratchRT = new THREE.WebGLRenderTarget(1, 1);
    /** @type {Promise<unknown>[]} */
    let audioWarmPromises = [];
    // * Menu path: still compileAsync so the first attract frame after a swap does not
    // * hitch. compileAsync uses KHR_parallel_shader_compile when available.
    // * Optional maxWaitMs / warm cap the readiness poll (scene.js patchSafeCompileAsync).
    // * FV-LOAD-1b: juiceFresh forces full default budget (4000ms) even on warm play-entry.
    // * Hoisted outside the inner RT-binding try (used by flyover warmup too).
    const maxWaitMs =
      typeof opts.maxWaitMs === "number"
        ? opts.maxWaitMs
        : useWarmBudget
          ? COMPILE_ASYNC_WARM_PLAY_MAX_WAIT_MS
          : undefined;
    // * 4th-arg opts is our patchSafeCompileAsync extension (not in three's types).
    const compileSceneAsync = () =>
      maxWaitMs != null
        ? /** @type {(s: typeof scene, c: typeof camera, t?: unknown, o?: { maxWaitMs?: number }) => Promise<typeof scene>} */ (
            renderer.compileAsync
          )(scene, camera, null, { maxWaitMs })
        : renderer.compileAsync(scene, camera);
    try {
      try {
        renderer.setRenderTarget(scratchRT);
        if (forPlay || !vfxProgramAnchorsInstalled) {
          // * PERF-WARM: attribute the ~1.4s play-entry freeze — this VFX-anchor install re-runs
          // * every play-entry (forPlay). Names it in longframe.spans if it's the cost.
          mark("warm.anchors", () => {
            installShatterProgramWarmup(scene);
            installKoHitmarkerProgramWarmup(scene);
            installWaterFxProgramWarmup(scene);
            Effects.installRamStreakProgramWarmup(scene);
          });
          vfxProgramAnchorsInstalled = true;
        }
        // * Audio pack warm (forPlay): fetch/decode under the loading overlay in parallel
        // * with compileAsync so first play is not a main-thread hitch.
        // * - Announcer (cap-23): mid-round 600–2000ms freezes on first callouts when warm
        // *   was fire-and-forget.
        // * - Ambience + game music + countdown (cap-54): MP commitMenuHidden starts beds
        // *   and playlist on the same tick as startCountdown — ~1.3s host LT swallowed
        // *   countdown_3. maxWaitMs caps a hung network.
        audioWarmPromises = [];
        if (forPlay) {
          const levelId = getCurrentLevelId();
          // * PERF-WARM: audio kickoff is synchronous up to the network/decode await — if
          // * prepareLevelMusic or a prefetch does sync decode/Howler work, it lands here.
          mark("warm.audioKickoff", () => {
            deps.prepareLevelMusic(levelId);
            audioWarmPromises.push(
              AudioManager.prefetchSfxByPrefixAsync("announcer_", { maxWaitMs: 8000 }),
              AudioManager.prefetchGameMusicAsync({ maxWaitMs: 6000 }),
              AudioManager.prefetchAmbienceAsync(ArenaAmbience.ambienceKeysForArena(levelId), {
                maxWaitMs: 6000,
              }),
              AudioManager.prefetchSfxKeysAsync(
                ["countdown_3", "countdown_2", "countdown_1", "countdown_go"],
                { maxWaitMs: 4000 },
              ),
            );
          });
        }
        await compileSceneAsync();
      } finally {
        renderer.setRenderTarget(prevTarget);
        scratchRT.dispose();
      }
      if (audioWarmPromises.length) {
        try {
          await Promise.all(audioWarmPromises);
        } catch (err) {
          console.warn("[CartRave] play-entry audio warm failed:", err);
        }
      }
      // * compileAsync covers SCENE programs only. The composer passes (bloom
      // * bright/blur, arcade, FXAA, output) and their render targets initialize on
      // * the first composer.render(). Play-entry used to be the only prime site;
      // * menu attract then paid multi-s longtasks on the first post-world-ready
      // * frame (Run-7 caps 45–51: LT start ≈ world-ready + 5ms). Always prime here.
      // * PERF-WARM-1: first composer.render can finalize freshly-linked programs on the
      // * driver — named so a round-start freeze attributes to compile vs first-render.
      mark(`warm.render.default${warmTag}`, () => {
        if (isComposerBypassActive()) renderer.render(scene, camera);
        else composer.render();
      });

      // * MENU-WARM-1: the default gameplay camera does not cover the menu's
      // * shot-list. Compile/render each attract framing while world-ready is
      // * still false, so newly visible arena programs cannot freeze the first
      // * menu frame. This deliberately makes cold menu load longer on weak
      // * drivers; the player gets a ready menu instead of a post-load hitch.
      if (!forPlay) {
        const savedPos = camera.position.clone();
        const savedQuat = camera.quaternion.clone();
        try {
          const poses = getMenuAttractWarmupPoses(CONFIG.record.radius, getCurrentLevelId());
          for (let i = 0; i < poses.length; i += 1) {
            const pose = poses[i];
            camera.position.set(pose.position.x, pose.position.y, pose.position.z);
            camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
            camera.updateMatrixWorld(true);
            mark(`warm.render.attract.${i}`, () => {
              if (isComposerBypassActive()) renderer.render(scene, camera);
              else composer.render();
            });
          }
        } finally {
          camera.position.copy(savedPos);
          camera.quaternion.copy(savedQuat);
          camera.updateMatrixWorld(true);
        }
      }

      // * The countdown fly-over (beginRoundFlyover) hard-cuts to a wide, high orbit the
      // * default-camera warm-up above never renders from — first use of that framing (new
      // * shader variants / draw calls only it exercises, e.g. previously off-screen arena
      // * geometry) was stalling the countdown itself, not just an ordinary slow frame.
      // * Prime it here too, hidden behind the loading overlay, then restore the camera
      // * exactly as it was — this must never leak into the visible frame.
      if (forPlay) {
        const pose = CameraMod.getCinematicCountdownWarmupPose(deps.resolveCinematicCountdownOverrides());
        const savedPos = camera.position.clone();
        const savedQuat = camera.quaternion.clone();
        const seatWarmupPose = () => {
          camera.position.copy(pose.position);
          camera.lookAt(pose.lookAt);
          camera.updateMatrixWorld(true);
        };
        try {
          seatWarmupPose();
          // * await yields to the event loop — the main rAF loop's follow-camera update
          // * could run in between and overwrite camera.position/quaternion before the
          // * render call below, so re-seat the pose right after each await rather than
          // * trusting it survived the wait.
          await compileSceneAsync();
          seatWarmupPose();
          mark(`warm.render.flyover${warmTag}`, () => {
            if (isComposerBypassActive()) renderer.render(scene, camera);
            else composer.render();
          });
        } finally {
          camera.position.copy(savedPos);
          camera.quaternion.copy(savedQuat);
          camera.updateMatrixWorld(true);
        }
      }
    } catch (err) {
      // * Warm-up is an optimization — never let it block play entry.
      console.warn("[CartRave] scene shader warm-up failed:", err);
    }
  }

  async function maskMenuPreviewSwap(runSwap, opts = {}) {
    const fade = opts.fade !== false;
    setMenuAttractRenderHold(true);
    try {
      // * Swap under the OPAQUE menu backdrop, not the 0.42 attract wash — the old
      // * canvas fade to 0 read as a whole-menu flash through the translucent wash.
      // * Lifting the reveal pushes .cr-root::before to opacity 1 (its 600ms
      // * transition) so geometry + compile run hidden behind the menu's own
      // * backdrop; the release re-reveals and the new arena crossfades in
      // * underneath the persistent menu. Canvas opacity is never touched.
      if (fade) setMenuAttractReveal(false);
      await runSwap();
      setMenuAttractRenderHold(false);
      await yieldForPaint();
      if (fade) setMenuAttractReveal(true);
    } finally {
      setMenuAttractRenderHold(false);
      if (fade) setMenuAttractReveal(true);
    }
  }

  async function commitLevelLoad(selected, opts) {
    // * ?perf=1 (DEV): per-phase swap breakdown. loadLevel is the mesh/collider build;
    // * rebuildForQualityChange re-applies the active tier after the legacy low/high split.
    const perfOn = import.meta.env.DEV && typeof location !== "undefined"
      && /(?:^|[?&])perf=1(?:&|$)/.test(location.search || "");
    const pnow = () => (typeof performance !== "undefined" ? performance.now() : 0);
    /** @type {Record<string, number>} */
    const perfPhase = {};
    let pMark = pnow();
    const lap = (name) => { if (perfOn) { const t = pnow(); perfPhase[name] = +(t - pMark).toFixed(1); pMark = t; } };

    if (typeof disposeLevel === "function") disposeLevel();
    lap("dispose");
    // * Let the menu UI / attract hold paint once after dispose so the main thread
    // * is not one continuous multi-hundred-ms block through loadLevel.
    await yieldForPaint();
    // * Grocery pool stays warm across level swaps — init() clears active spills only
    // * after the first load (no re-fetch of ~2.9 MB grocery GLBs per arena change).
    ({
      recordMesh,
      recordCollider,
      recordColliderHandles: ringHandles,
      pitWallColliderHandle,
      boothColliderHandles,
      boothNeonMeshes,
      spindleLight,
      pitInnerRadius,
      recordLabelMat,
      aiHazards: levelHazards,
      update: levelUpdate,
      dispose: disposeLevel,
      upgradeRecordReflector,
      setReflectorVisible,
      applyQualityTier: levelApplyQualityTier = null,
    } = await loadLevel(selected, scene, world, CONFIG, {
      menuPreview: opts.menuPreview === true,
      reflectorTextureSize: opts.reflectorTextureSize,
      onProgress: opts.onProgress,
    }));
    lap("loadLevel");

    // * Normalize: arena.js returns recordColliderHandles (compound ring); other levels return a single recordCollider.
    if (ringHandles) {
      recordColliderHandles = ringHandles;
    } else if (recordCollider) {
      recordColliderHandles = [recordCollider.handle];
    }
    // * Groceries are cosmetic and unneeded until the first hit — don't block the level
    // * swap on their ~3 MB of GLBs. init() is idempotent and pool consumers no-op
    // * until it resolves.
    const groceryReady = GroceryPool.init(scene, world);
    if (import.meta.env.DEV) groceryReady.catch((err) => console.warn("[GroceryPool] init failed:", err));
    applyLoadedLevelSideEffects(selected);
    lap("sideEffects");
    // * Levels build for the legacy low/high split internally; re-apply the active
    // * tier so medium lands correctly (reflector off, budgets right) on first load.
    await rebuildForQualityChange();
    lap("qualityRebuild");
    if (perfOn) {
      const total = +Object.values(perfPhase).reduce((a, b) => a + b, 0).toFixed(1);
      // eslint-disable-next-line no-console
      console.log(`[perf] commitLevelLoad ${selected} menuPreview=${opts.menuPreview === true} total=${total}ms`, perfPhase);
    }
  }

  async function bootstrapWorldCore(levelIdOverride) {
    if (!sceneEnvironmentDispose) {
      sceneEnvironmentDispose = setupSceneEnvironment(renderer, scene);
      await yieldForPaint();
    }
    await swapLoadedLevel(
      resolveLevelId(levelIdOverride ?? storageGet(LEVEL_STORAGE_KEY)),
    );
    // * Run-7 P0 (menu multi-s): world-ready un-gates menu attract. Caps 45–51 show
    // * 1.7–4.2s longtasks starting ~5ms after world-ready — first attract
    // * composer.render compiling arena + postFX programs. Warm *before* the
    // * bootstrap promise resolves so isWorldBootstrapped stays false and attract
    // * keeps the gradient. Marks: idle-shader-start/end (world-ready − start = cost).
    markBootPhase("idle-shader-start");
    await warmupActiveSceneShaders({ forPlay: false });
    markBootPhase("idle-shader-end");
    await yieldForPaint();
  }

  async function whenArenaRotationSettled(maxWaitMs = 10000) {
    const deadlineMs = performance.now() + maxWaitMs;
    while (
      (arenaRotationInFlight || pendingArenaRotationLevelId != null) &&
      performance.now() < deadlineMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  async function drainPendingArenaRotation() {
    if (pendingArenaRotationLevelId == null) return;
    const target = resolveLevelId(pendingArenaRotationLevelId);
    const carts = deps.getAllCartsRef();
    if (deps.getMenuVisible() || !isWorldBootstrapped() || !world) {
      recordDiagEvent("arena", "rotation_deferred", {
        target,
        reason: deps.getMenuVisible() ? "menu" : "world",
        loaded: getCurrentLevelId(),
      });
      return;
    }
    if (!Array.isArray(carts) || carts.length === 0) {
      recordDiagEvent("arena", "rotation_deferred", { target, reason: "carts", loaded: getCurrentLevelId() });
      return;
    }
    if (arenaRotationInFlight) {
      recordDiagEvent("arena", "rotation_deferred", { target, reason: "in_flight", loaded: getCurrentLevelId() });
      return;
    }
    const next = target;
    pendingArenaRotationLevelId = null;
    if (next === getCurrentLevelId()) {
      recordDiagEvent("arena", "rotation_skipped", { target: next, reason: "already_loaded" });
      return;
    }
    await rotateLoadedArenaInPlace(next);
  }

  function pickNextQuickplayArenaId() {
    return nextQuickplayArenaId(getCurrentLevelId());
  }

  async function rotateLoadedArenaInPlace(nextLevelIdRaw) {
    const nextLevelId = resolveLevelId(nextLevelIdRaw);
    if (arenaRotationInFlight) return;
    if (deps.getMenuVisible() || !isWorldBootstrapped() || !world) return;
    if (!Array.isArray(deps.getAllCartsRef()) || deps.getAllCartsRef().length === 0) return;
    if (nextLevelId === getCurrentLevelId()) return;
    arenaRotationInFlight = true;
    setLevelSwapping(true);
    recordDiagEvent("arena", "rotation_started", {
      target: nextLevelId,
      loaded: getCurrentLevelId(),
      isHost: Netcode.getIsHost(),
    });
    // * Old arena's beds fade out under the canvas crossfade; the new arena's start
    // * in the finally below (getCurrentLevelId() — correct even if the swap failed).
    ArenaAmbience.stopArenaAmbience();
    try {
      const label = (LEVEL_UNLOCKS[nextLevelId]?.label || nextLevelId).toUpperCase();
      deps.getHud()?.showChallengeToast?.(label, "◆ NEXT ARENA", { durationMs: 4500, priority: STAGE_PRIORITY.CRITICAL });
      /** @type {Promise<void>} */
      let swapPromise = Promise.resolve();
      const runSwap = () => {
        swapPromise = swapLoadedLevel(nextLevelId, { menuPreview: false });
      };
      // * Slower than the play-entry crossfade on purpose — the reveal is the transition.
      await crossfadeElement(canvas, runSwap, { fadeOutMs: 380, fadeInMs: 520 });
      await swapPromise;
      // * Compile the rotated arena's programs before the host re-seats carts —
      // * otherwise the first post-rotation frame stalls on shader compiles mid-MP.
      await warmupActiveSceneShaders({ forPlay: true });
      Entities.refreshCartSpawnPositions();
      // * Stop charge loops BEFORE rematchResetWorld nulls chargeUpSfxId (orphans Howler).
      deps.stopAllChargeSfx();
      if (Netcode.getIsHost()) {
        Entities.rematchResetWorld();
      } else {
        // * NET-1 S1: host_spawn often lands mid-swap (host is the fast machine). Bodies
        // * are rebuilt during swapLoadedLevel so that apply is wiped. Seat on the new
        // * ring first (broadcast no-ops for non-host), then re-apply last host poses.
        Entities.rematchResetWorld();
        Netcode.reapplyCachedCartsSnapshot();
      }
      recordDiagEvent("arena", "rotation_finished", { target: nextLevelId, loaded: getCurrentLevelId() });
    } catch (err) {
      console.error("[arena-rotation] in-place swap failed:", err);
      recordDiagEvent("arena", "rotation_failed", {
        target: nextLevelId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLevelSwapping(false);
      arenaRotationInFlight = false;
      // * WARM-IGPU-1 Lever A: the rotation warm above held clientPlayReady (see
      // * isSessionPlayReady). Re-signal now that the compile is done so the server arms
      // * game_start immediately — otherwise a quiet lobby waits out the 12s ceiling.
      Netcode.signalPlayReadyNow();
      // * menuVisible guard: a disconnect mid-swap returns to the menu (which stops
      // * ambience + music) — don't restart a bed/track under the menu music.
      if (!deps.getMenuVisible()) {
        ArenaAmbience.startArenaAmbience(getCurrentLevelId());
        // * Music is per-arena — swap to the rotated arena's playlist. stopGameMusic
        // * first so the new playlist starts from its own track 0 (startLevelMusic →
        // * setGamePlaylist → playGameMusic, which no-ops if not stopped).
        AudioManager.stopGameMusic();
        deps.startLevelMusic(getCurrentLevelId());
      }
    }
  }


  return {
    rebuildForQualityChange,
    ensureRapierPhysics,
    consumeRaveJuiceJustBuilt,
    levelUsesRaveExtras,
    raveDressingWanted,
    tickRaveDressing,
    applyLoadedLevelSideEffects,
    ensureRaveAttractShell,
    initDeferredRaveVisuals,
    scheduleReflectorUpgrade,
    finalizeArenaShellForMenu,
    finalizeArenaForPlay,
    warmupActiveSceneShaders,
    maskMenuPreviewSwap,
    commitLevelLoad,
    bootstrapWorldCore,
    whenArenaRotationSettled,
    drainPendingArenaRotation,
    pickNextQuickplayArenaId,
    rotateLoadedArenaInPlace,
    // Shared state accessors for main() loop / bridge / sim deps
    get world() { return world; },
    get eventQueue() { return eventQueue; },
    get recordMesh() { return recordMesh; },
    get recordColliderHandles() { return recordColliderHandles; },
    get pitWallColliderHandle() { return pitWallColliderHandle; },
    get boothColliderHandles() { return boothColliderHandles; },
    get boothNeonMeshes() { return boothNeonMeshes; },
    get recordLabelMat() { return recordLabelMat; },
    get levelUpdate() { return levelUpdate; },
    get sceneExtras() { return sceneExtras; },
    get pendingArenaRotationLevelId() { return pendingArenaRotationLevelId; },
    set pendingArenaRotationLevelId(v) { pendingArenaRotationLevelId = v; },
    get arenaRotationInFlight() { return arenaRotationInFlight; },
  };
}
