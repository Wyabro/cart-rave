// frameVisuals.js — post-physics visual sync, effects, HUD, and render pass

import * as THREE from "three";
import * as Effects from "./effects.js";
import * as ContactShadows from "./contactShadows.js";
import { clamp } from "./utils.js";
import {
  applyThemeColorToCache,
  applyThemeLeaderGlow,
  applyThemeChargeGlow,
  boostChargeProgress01,
} from "./cartThemes.js";
import { isShatterAnimating, updateShatterEffect } from "./cartShatter.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { updateCargoLoad } from "./cargoLoad.js";
import { updateDirectiveEngine, getActiveDirective } from "./directives/directiveEngine.js";
import { updateWaterDeathFx } from "./effects/waterDeathFx.js";
import { updateKoHitmarkers } from "./effects/koHitmarkerFx.js";
import { setArenaReactiveLeaderHex, setArenaSuddenDeathMode } from "./arenaReactiveLights.js";
import { tickAutoQuality } from "./utils/autoQuality.js";
import { tickBlackFrameMonitor } from "./utils/blackFrameMonitor.js";
import { frameBudgetAllow } from "./utils/frameBudget.js";
import { isComposerBypassActive } from "./scene.js";


/** Last round phase seen by results overlay — used to hide overlay once when leaving podium. */
let lastResultsOverlayPhase = null;

const _interpPrevQuat = new THREE.Quaternion();
const _interpCurrQuat = new THREE.Quaternion();

// * Camera-space shake state. Applied as a render-only rotational offset and reverted
// * after render so follow-cam damping never sees the jitter. Disabled entirely for
// * prefers-reduced-motion users — the vignette impact pulse still communicates hits.
const _reducedMotionQuery = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : null;
const _preShakeQuat = new THREE.Quaternion();

// * Per-cart physics state scratch for the visual sync loop. Rapier getters
// * (translation/rotation/linvel/angvel) each allocate a fresh JS object at the
// * WASM boundary; caching into these plain objects collapses 4-6 allocs/cart/frame
// * down to 4 (one fetch), with the cached values reused by mesh sync + visuals + shadows.
const _visPos = { x: 0, y: 0, z: 0 };
const _visRot = { x: 0, y: 0, z: 0, w: 1 };
const _visLinvel = { x: 0, y: 0, z: 0 };
const _visAngvel = { x: 0, y: 0, z: 0 };

// * KO hit-stop blend scratch: frozen pose captured before the sync write, lerped
// * toward the fresh physics pose during the post-stop blend window.
const _hitStopPos = new THREE.Vector3();
const _hitStopQuat = new THREE.Quaternion();
/** Reconcile visual-offset scratch (world-Y heading twist) — see gameLoop.js capture side. */
const _reconYawQuat = new THREE.Quaternion();
const _yUpAxis = new THREE.Vector3(0, 1, 0);

// * Living Cargo per-frame context scratch (no per-frame object literal).
const _cargoCtx = { localSlotIndex: -1, netSlots: /** @type {Array<object>} */ ([]), roundPhase: "" };

// * Arcade-pass Sudden Death juice smoothing — avoids hard on/off pops.
let _arcadeSuddenDeathSmoothed = 0;



/**
 * * Fetches a cart body's translation/rotation/linvel/angvel ONCE into the module
 * * visual-scratch cache. Called at the top of each per-cart sync iteration.
 *
 * @param {object} cart
 * @returns {void}
 */
function readBodyStateIntoVisScratch(cart) {
  const body = cart.body;
  const p = body.translation();
  _visPos.x = p.x;
  _visPos.y = p.y;
  _visPos.z = p.z;
  const r = body.rotation();
  _visRot.x = r.x;
  _visRot.y = r.y;
  _visRot.z = r.z;
  _visRot.w = r.w;
  const lv = body.linvel();
  _visLinvel.x = lv.x;
  _visLinvel.y = lv.y;
  _visLinvel.z = lv.z;
  const av = body.angvel();
  _visAngvel.x = av.x;
  _visAngvel.y = av.y;
  _visAngvel.z = av.z;
}

/**
 * * Writes an interpolated cart mesh pose from prev snapshot → current body using physics alpha.
 *
 * Reads pos/rot from the module visual-scratch cache (populated by the caller via
 * {@link readBodyStateIntoVisScratch}); avoids redundant Rapier getter allocations.
 *
 * @param {object} cart
 * @param {number} alpha
 * @param {number} visualOffset
 * @returns {{ bodyY: number }}
 */
function syncCartMeshFromPhysics(cart, alpha, visualOffset) {
  const p = _visPos;
  const r = _visRot;
  const prev = cart.prevPosition;
  const prevRot = cart.prevRotation;

  const ix = prev.x + (p.x - prev.x) * alpha;
  const iy = prev.y + (p.y - prev.y) * alpha;
  const iz = prev.z + (p.z - prev.z) * alpha;

  cart.mesh.position.set(ix, iy + visualOffset, iz);
  _interpPrevQuat.set(prevRot.x, prevRot.y, prevRot.z, prevRot.w);
  _interpCurrQuat.set(r.x, r.y, r.z, r.w);
  cart.mesh.quaternion.copy(_interpPrevQuat).slerp(_interpCurrQuat, alpha);

  return { bodyY: iy };
}

/**
 * @typedef {object} FrameVisualDeps
 * @property {() => Array<object>} getAllCarts
 * @property {() => number} getLocalSlotIndex
 * @property {() => Array<object>} getNetSlots
 * @property {() => boolean} isHost
 * @property {() => { phase: string, isSuddenDeath?: boolean }} getRoundState
 * @property {() => number[]} getRoundScores
 * @property {object} CONFIG
 * @property {import("three").Vector3} netTargetPosScratch
 * @property {import("three").Vector3} cartLinvelScratch
 * @property {import("three").Vector3} cartAngvelScratch
 * @property {(mesh: import("three").Object3D, linvel: import("three").Vector3, dt: number, now: number, angvel?: import("three").Vector3) => void} updateCartVisuals
 * @property {(mesh: import("three").Object3D) => object} buildCartMaterialCache
 * @property {(slot: object | null | undefined) => number} colorHexForSlot
 * @property {() => boolean} isMuted
 * @property {() => number} getSfxVolume
 * @property {() => boolean} isMenuVisible
 * @property {() => { turn?: number }} getAxis
 * @property {object | null | undefined} hud
 * @property {object | null | undefined} leaderHum
 * @property {object} HUD
 * @property {() => string | null} getYouConnId
 * @property {() => number} getMatchHistoryLength
 * @property {() => void} updateResultsOverlay
 * @property {() => void} positionNameLabels
 * @property {import("three/examples/jsm/postprocessing/EffectComposer.js").EffectComposer} composer
 * @property {import("three").Scene} scene
 * @property {import("three").PerspectiveCamera} camera
 * @property {import("three/examples/jsm/renderers/CSS2DRenderer.js").CSS2DRenderer} labelRenderer
 * @property {HTMLCanvasElement} canvas
 * @property {number} BASE_FOV
 * @property {() => number} getShakeUntil
 * @property {() => number} getShakeIntensity
 * @property {() => number} getFovPunchUntil
 * @property {() => number} [getFovPunchDeg]
 * @property {() => { until: number, durationMs: number, strength: number }} [getKillFlash]
 * @property {() => { until: number, durationMs: number, strength: number, baseVignette: number | null, baseAberration: number | null }} [getImpactPulse]
 * @property {() => { until: number, blendUntil: number }} [getHitStop] KO hit-stop window (presentation-only pose freeze).
 * @property {() => import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null} [getArcadePass]
 * @property {() => void} [onAutoQualityStepDown] Re-applies quality live after an auto-quality tier step.
 * @property {{ frames: number, last: number, canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null }} fpsState
 * @property {() => void} [updateTouchControlsVisibility]
 */

/**
 * Post-physics frame phase: sync meshes from bodies/net targets, run effects,
 * update HUD/overlays, and issue the render pass. Called after simulation substeps
 * so visuals reflect the latest authoritative (or predicted) cart poses.
 *
 * @param {FrameVisualDeps} deps Wiring from main — closures keep netcode/HUD local.
 * @param {{ now: number, dt: number, physicsAlpha?: number | null }} frameCtx Current frame timing from the loop.
 */
export function updateVisualsAndEffects(deps, frameCtx) {
  const { now, dt, physicsAlpha } = frameCtx;
  const allCarts = deps.getAllCarts();
  const localSlotIndexThisFrame = deps.getLocalSlotIndex();
  const netSlotsForFrame = deps.getNetSlots();
  const roundState = deps.getRoundState();

  // * Session auto-quality: tiered step-down on sustained bad frame times (no localStorage).
  // * A step-down must be applied live (composer passes, pixel ratio, arena knobs) —
  // * the tier flip alone only affects per-frame readers.
  if (!deps.isMenuVisible?.()) {
    if (tickAutoQuality(dt, now)) {
      deps.onAutoQualityStepDown?.();
    }
  }

  if (roundState.phase === "running") {
    Effects.tickRamBoostStreakSpawners(allCarts, now, dt);
  }

  Effects.updateRamBoostStreaks(now);

  GroceryPool.update(dt, now);

  // * Living Cargo — sync cargo-bay fullness (the cart IS the scoreboard), post-spill
  // * restock, top-heavy fullness state, and cargo announcer moments from round scores.
  // * Context rides a module scratch object (house convention — no per-frame literal).
  _cargoCtx.localSlotIndex = localSlotIndexThisFrame;
  _cargoCtx.netSlots = netSlotsForFrame;
  _cargoCtx.roundPhase = roundState.phase;
  updateCargoLoad(allCarts, now, _cargoCtx);

  // * The Living Store — host schedules/fires PA directives; every peer ticks expiry.
  updateDirectiveEngine(now);
  // * Directive countdown chip under the round timer (hides itself when none active).
  deps.HUD?.setHudDirective?.(getActiveDirective(), now);

  const usePhysicsInterp = physicsAlpha != null;
  const visualOffset = deps.CONFIG.cart.visualOffset;

  // * KO hit-stop: while active, every cart's rendered pose holds exactly where it is
  // * (physics, prediction, and reconciliation continue untouched underneath). Shatter
  // * VFX still animates — the victim exploding mid-freeze is the payoff. After the
  // * stop, local/host meshes blend back to the live physics pose over ~120ms; remote
  // * meshes self-recover through their existing per-frame lerp.
  const hitStop = deps.getHitStop ? deps.getHitStop() : null;
  const inRunningPhase = roundState.phase === "running";
  const hitStopActive = Boolean(hitStop && inRunningPhase && now < hitStop.until);
  const hitStopBlending = Boolean(
    hitStop && inRunningPhase && !hitStopActive && now < hitStop.blendUntil,
  );

  // Sync render meshes from physics (or from net targets for remote non-host carts).
  const localSlotIndexForFrame = localSlotIndexThisFrame;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    const c = allCarts[slotIndex];
    if (!c || !c.mesh) continue;

    // * Shatter & Explosion death VFX: while the shatter animation plays, mesh sync
    // * is skipped so the root pose freezes (parts + explosion animate independently
    // * via updateShatterEffect). The lifecycle is self-contained: it ends when its
    // * own animation completes or when respawn calls cleanupShatter — network-synced
    // * state (hasSpilled) never gates it. The root stays hidden until cleanup, so
    // * falling through after completion resumes pose sync invisibly.
    if (isShatterAnimating(c, now)) {
      updateShatterEffect(c, dt, now);
      // eslint-disable-next-line no-continue
      continue;
    }

    // * Hit-stop freeze: skip every pose write (and dependent visuals) for this cart.
    if (hitStopActive) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (!deps.isHost() && slotIndex !== localSlotIndexForFrame) {
      // * Frame-rate independent decay: matches a 0.75 lerp at 60fps but stays
      // * consistent across other frame rates (no snapiness at low fps, no
      // * sluggishness at high fps).
      const netAlpha = 1 - Math.pow(1 - 0.75, dt * 60);
      if (c._netTargetPos) {
        deps.netTargetPosScratch.copy(c._netTargetPos);
        deps.netTargetPosScratch.y += deps.CONFIG.cart.visualOffset;
        c.mesh.position.lerp(deps.netTargetPosScratch, netAlpha);
      }
      if (c._netTargetQuat) c.mesh.quaternion.slerp(c._netTargetQuat, netAlpha);
      // * Pose write dirties this root; force=false still propagates to children.
      c.mesh.updateMatrixWorld(false);
      const lv = c._lastNetLinvel || { x: 0, y: 0, z: 0 };
      deps.cartLinvelScratch.set(lv.x || 0, lv.y || 0, lv.z || 0);
      // * Remote carts: angvel is the only live Rapier fetch (linvel comes from the net
      // * snapshot). Guarded optional-call preserves the original null-body tolerance.
      if (c.body?.angvel) {
        const av = c.body.angvel();
        deps.cartAngvelScratch.set(av.x, av.y, av.z);
      } else {
        deps.cartAngvelScratch.set(0, 0, 0);
      }
      deps.updateCartVisuals(c.mesh, deps.cartLinvelScratch, dt, now, deps.cartAngvelScratch);
      if (c.contactShadow) {
        const bodyY = c._netTargetPos
          ? c._netTargetPos.y
          : c.mesh.position.y - deps.CONFIG.cart.visualOffset;
        ContactShadows.updateCartContactShadow(c.contactShadow, {
          x: c.mesh.position.x,
          z: c.mesh.position.z,
          yaw: ContactShadows.yawFromQuaternion(c.mesh.quaternion),
          heightAboveFloor: bodyY - ContactShadows.getFloorY(),
        });
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    // * Local / host cart: fetch all four getters ONCE into the visual scratch; the
    // * cached values feed mesh sync and updateCartVisuals — no redundant Rapier allocations per frame.
    readBodyStateIntoVisScratch(c);
    if (hitStopBlending) {
      _hitStopPos.copy(c.mesh.position);
      _hitStopQuat.copy(c.mesh.quaternion);
    }
    let bodyY = _visPos.y;
    if (usePhysicsInterp && c.prevPosition && c.prevRotation) {
      bodyY = syncCartMeshFromPhysics(c, physicsAlpha, visualOffset).bodyY;
    } else {
      c.mesh.position.set(_visPos.x, _visPos.y + visualOffset, _visPos.z);
      c.mesh.quaternion.set(_visRot.x, _visRot.y, _visRot.z, _visRot.w);
    }
    if (hitStopBlending) {
      // * Post-stop recovery: exponential blend from the frozen pose to the live
      // * physics pose (same frame-rate-independent alpha the remote lerp uses),
      // * hiding the ~80ms of physics the freeze skipped.
      const blendAlpha = 1 - Math.pow(1 - 0.75, dt * 60);
      _hitStopPos.lerp(c.mesh.position, blendAlpha);
      c.mesh.position.copy(_hitStopPos);
      _hitStopQuat.slerp(c.mesh.quaternion, blendAlpha);
      c.mesh.quaternion.copy(_hitStopQuat);
    }
    // * Reconcile visual offset (non-host local cart): render at body pose + the eased
    // * remainder of the last corrections, decaying at the CONFIG.net.prediction rates.
    // * The Rapier body already holds host truth — only the rendered pose is softened
    // * (run-4 "laggy-rubberbandy"; capture side lives in gameLoop.js reconciliation).
    const ro = c._reconcileVisOffset;
    if (ro && !deps.isHost() && (ro.x !== 0 || ro.y !== 0 || ro.z !== 0 || ro.yaw !== 0)) {
      c.mesh.position.x += ro.x;
      c.mesh.position.y += ro.y;
      c.mesh.position.z += ro.z;
      bodyY += ro.y;
      if (ro.yaw !== 0) {
        _reconYawQuat.setFromAxisAngle(_yUpAxis, ro.yaw);
        c.mesh.quaternion.premultiply(_reconYawQuat);
      }
      const pcfg = deps.CONFIG.net?.prediction;
      const posDecay = Math.exp(-(pcfg?.reconcilePosRate ?? 8) * dt);
      const rotDecay = Math.exp(-(pcfg?.reconcileRotRate ?? 6) * dt);
      ro.x *= posDecay; ro.y *= posDecay; ro.z *= posDecay;
      ro.yaw *= rotDecay;
      if (Math.abs(ro.x) + Math.abs(ro.y) + Math.abs(ro.z) < 0.001 && Math.abs(ro.yaw) < 0.001) {
        ro.x = 0; ro.y = 0; ro.z = 0; ro.yaw = 0;
      }
    }
    // * Pose write dirties this root; force=false still propagates to children.
    c.mesh.updateMatrixWorld(false);
    deps.cartLinvelScratch.set(_visLinvel.x, _visLinvel.y, _visLinvel.z);
    deps.cartAngvelScratch.set(_visAngvel.x, _visAngvel.y, _visAngvel.z);
    deps.updateCartVisuals(c.mesh, deps.cartLinvelScratch, dt, now, deps.cartAngvelScratch);
    if (c.contactShadow) {
      ContactShadows.updateCartContactShadow(c.contactShadow, {
        x: c.mesh.position.x,
        z: c.mesh.position.z,
        yaw: ContactShadows.yawFromQuaternion(c.mesh.quaternion),
        heightAboveFloor: bodyY - ContactShadows.getFloorY(),
      });
    }
  }

  // * Water-death FX (Sundial Station): entry splashes on waterline crossings + live
  // * splash/detonation animations. Instant no-op on levels without a water plane.
  // * Yield under frame pressure — particles keep last pose for a frame.
  if (frameBudgetAllow("water_fx", now)) {
    updateWaterDeathFx(allCarts, now, dt);
  }
  updateKoHitmarkers(now, dt);

  // Leader glow: neon cart color at rest, brief white emissive flash at pulse peak.
  {
    let leaderSlot = -1;
    let leaderScore = 0;
    let isTied = false;
    if (roundState.phase === "running") {
      const scores = deps.getRoundScores();
      for (let i = 0; i < 4; i += 1) {
        const s = Number(scores[i] || 0);
        if (s > leaderScore) { leaderScore = s; leaderSlot = i; isTied = false; }
        else if (s === leaderScore && s > 0) { isTied = true; }
      }
      if (isTied) leaderSlot = -1;
    }

    // * Arena fixtures (spindle/spots/lasers) pick up the sole leader's cart color.
    if (leaderSlot >= 0) {
      setArenaReactiveLeaderHex(deps.colorHexForSlot(netSlotsForFrame[leaderSlot]));
    } else {
      setArenaReactiveLeaderHex(null);
    }

    // * Sudden Death world reaction — ambient fixture cycle hue-shifts red while the
    // * 1v1 plays out (broadcast SD state, so every client's arena reacts together).
    setArenaSuddenDeathMode(roundState.phase === "running" && roundState.isSuddenDeath === true);

    const leaderHum = deps.leaderHum;
    if (!deps.isMenuVisible() && roundState.phase === "running" && leaderSlot >= 0 && allCarts[leaderSlot]) {
      leaderHum?.setLeader?.(leaderSlot);
      leaderHum?.updatePositionFromCart?.(allCarts[leaderSlot]);
    } else {
      leaderHum?.setLeader?.(null);
    }

    const glowPulse = (Math.sin(now * 0.001 * Math.PI * 2 * 1.0) + 1) / 2;
    // * 0.85 → 0.66 with the ACES restore — the white-mix leader peak read "super
    // * bright" on every arena (07-17 run 2). Pulse shape unchanged.
    const glowIntensity = (0.375 + glowPulse * 1.125) * 0.66;
    // * Quantize leader pulse so dirty-gating still refreshes ~12×/s (smooth enough).
    const glowPulseQ = Math.round(glowPulse * 12);
    const chargeCfg = deps.CONFIG?.cart?.ramBoost?.boostCharge;
    const chargeTimeMs = chargeCfg?.boostChargeTimeMs || 1500;
    const chargeEnabled = chargeCfg?.enabled !== false;
    for (let i = 0; i < allCarts.length; i += 1) {
      const cart = allCarts[i];
      if (!cart || !cart.mesh) continue;
      const isLeader = i === leaderSlot;
      const themeId = cart.cartThemeId ?? "rave";
      const slotHex = deps.colorHexForSlot(netSlotsForFrame[i]);
      const cache = cart._materialCache || (cart._materialCache = deps.buildCartMaterialCache(cart.mesh));

      // * Priority: leader pulse > active nitro burst > charge buildup > idle tint.
      // * Charge telegraph is host-visible for any cart with isChargingBoost (solo = all humans).
      // * Dirty-gate: idle carts keep a static tint — rewriting emissives 60×/s was free heat.
      if (isLeader) {
        const key = `L|${themeId}|${slotHex}|${glowPulseQ}`;
        if (cart._themeGlowKey !== key) {
          cart._themeGlowKey = key;
          applyThemeLeaderGlow(cache, themeId, slotHex, glowPulse, glowIntensity);
        }
      } else if (roundState.phase === "running" && cart.ramBoostActiveUntilMs > now) {
        const boostPulseQ = Math.round((1.2 + 0.4 * Math.sin(now * 0.02)) * 20);
        const key = `B|${themeId}|${slotHex}|${boostPulseQ}`;
        if (cart._themeGlowKey !== key) {
          cart._themeGlowKey = key;
          applyThemeColorToCache(
            cache,
            themeId,
            slotHex,
            1.2 + 0.4 * Math.sin(now * 0.02),
          );
        }
      } else if (
        chargeEnabled
        && roundState.phase === "running"
        && cart.isChargingBoost
      ) {
        const charge01 = boostChargeProgress01(
          true,
          cart.boostChargeStartedAtMs || now,
          now,
          chargeTimeMs,
        );
        const chargeQ = Math.round(charge01 * 24);
        const key = `C|${themeId}|${slotHex}|${chargeQ}`;
        if (cart._themeGlowKey !== key) {
          cart._themeGlowKey = key;
          applyThemeChargeGlow(cache, themeId, slotHex, charge01, now, chargeCfg);
        }
      } else {
        const key = `I|${themeId}|${slotHex}`;
        if (cart._themeGlowKey !== key) {
          cart._themeGlowKey = key;
          applyThemeColorToCache(cache, themeId, slotHex);
        }
      }
    }
  }

  deps.HUD.update({
    youConnId: deps.getYouConnId(),
    netSlots: netSlotsForFrame,
    roundState,
    matchHistoryLength: deps.getMatchHistoryLength(),
    menuVisible: deps.isMenuVisible(),
  });
  // * Decay directional hit vignette (armed by triggerLocalHitTaken on rams).
  deps.HUD.tickHitDirection?.(now);
  deps.updateTouchControlsVisibility?.();
  if (roundState.phase === "podium" || lastResultsOverlayPhase === "podium") {
    deps.updateResultsOverlay();
  }
  lastResultsOverlayPhase = roundState.phase;
  // * Nametags: skip a frame under load (positions stay; one-frame lag is invisible).
  if (frameBudgetAllow("labels", now)) {
    deps.positionNameLabels();
  }

  if (frameBudgetAllow("ambient", now)) {
    Effects.updateAmbientParticles(dt, now);
  }

  // * Shake amplitudes are tuned in px (CONFIG.ramming.fx.shakePixelScale); convert to
  // * radians against viewport height so perceived amplitude matches the old DOM shake.
  const shakeUntil = deps.getShakeUntil();
  const shakeIntensity = deps.getShakeIntensity();
  let shakeApplied = false;
  if (!_reducedMotionQuery?.matches && roundState.phase === "running" && performance.now() < shakeUntil) {
    const t = (shakeUntil - performance.now()) / 250;
    const px = (Math.random() - 0.5) * 2 * shakeIntensity * t;
    const py = (Math.random() - 0.5) * 2 * shakeIntensity * t;
    const fovRad = (deps.camera.fov * Math.PI) / 180;
    const pxToRad = fovRad / Math.max(1, deps.canvas.clientHeight || window.innerHeight);
    _preShakeQuat.copy(deps.camera.quaternion);
    deps.camera.rotateX(py * pxToRad);
    deps.camera.rotateY(px * pxToRad);
    shakeApplied = true;
  }

  // * Low tier: every creative pass is disabled, so the composer would only burn two
  // * full-screen passes (render-to-RT + OutputPass copy). Render direct instead —
  // * renderer.toneMapping/outputColorSpace apply natively on the canvas path.
  // * Latched flag (not live knobs): the path flip recompiles all scene programs,
  // * so main.js only flips it behind the quality-apply overlay after a warm-up.
  if (isComposerBypassActive()) {
    deps.composer.renderer.render(deps.scene, deps.camera);
  } else {
    deps.composer.render();
  }
  // * VFX-1 (?blackmon): sample the just-rendered WebGL buffer in-task, before the
  // * browser composites+clears it. No-op unless the monitor is armed.
  tickBlackFrameMonitor();
  deps.labelRenderer.render(deps.scene, deps.camera);
  if (shakeApplied) deps.camera.quaternion.copy(_preShakeQuat);

  // * FPS meter is a dev-only overlay — production players never see it.
  const fpsState = import.meta.env.DEV ? deps.fpsState : null;
  if (fpsState) {
    fpsState.frames += 1;
  }
  const fpsNow = performance.now();
  if (fpsState && fpsNow - fpsState.last >= 500) {
    const fpsVal = Math.round((fpsState.frames * 1000) / (fpsNow - fpsState.last));
    if (!fpsState.canvas) {
      fpsState.canvas = document.createElement("canvas");
      fpsState.canvas.width = 90;
      fpsState.canvas.height = 24;
      fpsState.canvas.style.cssText = "position:fixed;bottom:8px;left:10px;z-index:100;pointer-events:none;";
      document.body.appendChild(fpsState.canvas);
      fpsState.ctx = fpsState.canvas.getContext("2d");
    }
    fpsState.ctx.clearRect(0, 0, 90, 24);
    if (!deps.isMenuVisible()) {
      fpsState.ctx.font = "11px 'Space Mono', monospace";
      fpsState.ctx.fillStyle = "rgba(255,255,255,0.35)";
      fpsState.ctx.textAlign = "right";
      fpsState.ctx.fillText(fpsVal + " FPS", 86, 16);
    }
    fpsState.frames = 0;
    fpsState.last = fpsNow;
  }

  if (deps.canvas.style.transform) deps.canvas.style.transform = "";

  const fovPunchUntil = deps.getFovPunchUntil();
  if (roundState.phase === "running" && performance.now() < fovPunchUntil) {
    const t = (fovPunchUntil - performance.now()) / 200;
    const punchDeg = deps.getFovPunchDeg?.() ?? 8;
    const targetFov = (deps.camera.userData.baseFov || 55) - (punchDeg * t);
    if (deps.camera.fov !== targetFov) deps.camera.fov = targetFov;
    deps.camera.updateProjectionMatrix();
  } else {
    deps.camera.fov = deps.camera.userData.baseFov || 55;
    deps.camera.updateProjectionMatrix();
  }

  // * Arcade-pass event juice — uniform writes only; shader early-outs when idle.
  const arcadePass = deps.getArcadePass?.();
  const arcadeOn = Boolean(arcadePass?.enabled && arcadePass.uniforms);
  const juiceNow = performance.now();
  const juiceRunning = roundState.phase === "running";

  // * Kill-confirm flash + expanding shockwave (uFlash strength, uShock 0→1 expand).
  const killFlash = deps.getKillFlash?.();
  if (killFlash && arcadePass?.uniforms?.uFlash) {
    const active = arcadeOn && juiceRunning && juiceNow < killFlash.until;
    if (active) {
      const remain = (killFlash.until - juiceNow) / killFlash.durationMs;
      arcadePass.uniforms.uFlash.value = killFlash.strength * remain;
      if (arcadePass.uniforms.uShock) arcadePass.uniforms.uShock.value = 1 - remain;
    } else {
      arcadePass.uniforms.uFlash.value = 0;
      if (arcadePass.uniforms.uShock) arcadePass.uniforms.uShock.value = 0;
    }
  }

  // * Impact pulse — vignette/aberration kick + mini cyan shock on hard local hits.
  // * Baselines captured at trigger time (main.js triggerImpactPulse); restore exactly
  // * so live Tweakpane/config tweaks are never overwritten between pulses.
  const pulse = deps.getImpactPulse?.();
  if (pulse && arcadePass?.uniforms) {
    const pulseActive = arcadeOn && juiceRunning && juiceNow < pulse.until;
    if (pulseActive && pulse.baseVignette != null && pulse.baseAberration != null) {
      const t = (pulse.until - juiceNow) / pulse.durationMs;
      arcadePass.uniforms.uVignette.value = pulse.baseVignette + pulse.strength * 0.55 * t;
      arcadePass.uniforms.uAberration.value = pulse.baseAberration + pulse.strength * 0.011 * t;
    } else if (!pulseActive && pulse.baseVignette != null && pulse.baseAberration != null) {
      arcadePass.uniforms.uVignette.value = pulse.baseVignette;
      arcadePass.uniforms.uAberration.value = pulse.baseAberration;
      pulse.baseVignette = null;
      pulse.baseAberration = null;
    }
    if (arcadePass.uniforms.uHitStrength) {
      if (pulseActive) {
        const remain = (pulse.until - juiceNow) / pulse.durationMs;
        // * Weaker than KO flash so chained rams don't read as kill-confirms.
        arcadePass.uniforms.uHitStrength.value = Math.min(pulse.strength, 1.2) * remain * 0.48;
        if (arcadePass.uniforms.uHitShock) arcadePass.uniforms.uHitShock.value = 1 - remain;
      } else {
        arcadePass.uniforms.uHitStrength.value = 0;
        if (arcadePass.uniforms.uHitShock) arcadePass.uniforms.uHitShock.value = 0;
      }
    }
  }

  // * Sudden Death edge heat (smoothed; post-FX gated). Nitro juice is world-space trails.
  if (arcadePass?.uniforms?.uSuddenDeath) {
    const sdTarget = arcadeOn && juiceRunning && roundState.isSuddenDeath === true ? 1 : 0;
    // * dt is seconds; ~6–8 Hz ease feels snappy without a hard pop.
    const k = Math.min(1, Math.max(0, dt) * 7);
    _arcadeSuddenDeathSmoothed += (sdTarget - _arcadeSuddenDeathSmoothed) * k;
    if (_arcadeSuddenDeathSmoothed < 0.001) _arcadeSuddenDeathSmoothed = 0;
    arcadePass.uniforms.uSuddenDeath.value = _arcadeSuddenDeathSmoothed;
  }

  if (frameBudgetAllow("trash", now)) {
    Effects.updateTrashParticles(dt);
  }
}
