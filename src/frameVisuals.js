// frameVisuals.js — post-physics visual sync, effects, HUD, and render pass

import * as THREE from "three";
import * as Effects from "./effects.js";
import * as ContactShadows from "./contactShadows.js";
import { clamp } from "./utils.js";
import { applyThemeColorToCache, applyThemeLeaderGlow } from "./cartThemes.js";
import { updateShatterEffect } from "./cartShatter.js";
import * as GroceryPool from "./effects/groceryPool.js";

/** Last round phase seen by results overlay — used to hide overlay once when leaving podium. */
let lastResultsOverlayPhase = null;

const _interpPrevQuat = new THREE.Quaternion();
const _interpCurrQuat = new THREE.Quaternion();

// * Per-cart physics state scratch for the visual sync loop. Rapier getters
// * (translation/rotation/linvel/angvel) each allocate a fresh JS object at the
// * WASM boundary; caching into these plain objects collapses 4-6 allocs/cart/frame
// * down to 4 (one fetch), with the cached values reused by mesh sync + visuals + shadows.
const _visPos = { x: 0, y: 0, z: 0 };
const _visRot = { x: 0, y: 0, z: 0, w: 1 };
const _visLinvel = { x: 0, y: 0, z: 0 };
const _visAngvel = { x: 0, y: 0, z: 0 };

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
 * @property {() => { phase: string }} getRoundState
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

  // Host-only streak spawners (visual; reads cart velocity after game-logic pass).
  if (deps.isHost() && roundState.phase === "running") {
    Effects.tickRamBoostStreakSpawners(allCarts, now, dt);
  }

  Effects.updateRamBoostStreaks(now);

  GroceryPool.update(dt, now);

  const usePhysicsInterp = physicsAlpha != null;
  const visualOffset = deps.CONFIG.cart.visualOffset;

  // Sync render meshes from physics (or from net targets for remote non-host carts).
  const localSlotIndexForFrame = localSlotIndexThisFrame;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    const c = allCarts[slotIndex];
    if (!c || !c.mesh) continue;

    // * Shatter & Explosion death VFX: while a cart is shattering, syncCartMeshFromPhysics
    // * is skipped so the root pose freezes (parts + explosion animate independently via
    // * updateShatterEffect). doRespawn calls cleanupShatter to tear this down.
    if (c.isShattering) {
      updateShatterEffect(c, dt, now);
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
      c.mesh.updateMatrixWorld(true);
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
    let bodyY = _visPos.y;
    if (usePhysicsInterp && c.prevPosition && c.prevRotation) {
      bodyY = syncCartMeshFromPhysics(c, physicsAlpha, visualOffset).bodyY;
    } else {
      c.mesh.position.set(_visPos.x, _visPos.y + visualOffset, _visPos.z);
      c.mesh.quaternion.set(_visRot.x, _visRot.y, _visRot.z, _visRot.w);
    }
    c.mesh.updateMatrixWorld(true);
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

    const leaderHum = deps.leaderHum;
    if (!deps.isMenuVisible() && roundState.phase === "running" && leaderSlot >= 0 && allCarts[leaderSlot]) {
      leaderHum?.setLeader?.(leaderSlot);
      leaderHum?.updatePositionFromCart?.(allCarts[leaderSlot]);
    } else {
      leaderHum?.setLeader?.(null);
    }

    const glowPulse = (Math.sin(now * 0.001 * Math.PI * 2 * 1.0) + 1) / 2;
    const glowIntensity = (0.375 + glowPulse * 1.125) * 0.85;
    for (let i = 0; i < allCarts.length; i += 1) {
      const cart = allCarts[i];
      if (!cart || !cart.mesh) continue;
      const isLeader = i === leaderSlot;
      const themeId = cart.cartThemeId ?? "rave";
      const slotHex = deps.colorHexForSlot(netSlotsForFrame[i]);
      const cache = cart._materialCache || (cart._materialCache = deps.buildCartMaterialCache(cart.mesh));

      if (isLeader) {
        applyThemeLeaderGlow(cache, themeId, slotHex, glowPulse, glowIntensity);
      } else if (roundState.phase === "running" && cart.ramBoostActiveUntilMs > performance.now()) {
        applyThemeColorToCache(
          cache,
          themeId,
          slotHex,
          1.2 + 0.4 * Math.sin(performance.now() * 0.02),
        );
      } else {
        applyThemeColorToCache(cache, themeId, slotHex);
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
  deps.updateTouchControlsVisibility?.();
  if (roundState.phase === "podium" || lastResultsOverlayPhase === "podium") {
    deps.updateResultsOverlay();
  }
  lastResultsOverlayPhase = roundState.phase;
  deps.positionNameLabels();

  Effects.updateAmbientParticles(dt, now);

  deps.composer.render();
  deps.labelRenderer.render(deps.scene, deps.camera);

  const fpsState = deps.fpsState;
  fpsState.frames += 1;
  const fpsNow = performance.now();
  if (fpsNow - fpsState.last >= 500) {
    const fpsVal = Math.round((fpsState.frames * 1000) / (fpsNow - fpsState.last));
    if (!fpsState.canvas) {
      fpsState.canvas = document.createElement("canvas");
      fpsState.canvas.width = 90;
      fpsState.canvas.height = 24;
      fpsState.canvas.style.cssText = "position:fixed;bottom:8px;left:10px;z-index:99999;pointer-events:none;";
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

  const shakeUntil = deps.getShakeUntil();
  const shakeIntensity = deps.getShakeIntensity();
  if (roundState.phase === "running" && performance.now() < shakeUntil) {
    const t = (shakeUntil - performance.now()) / 250;
    const ox = (Math.random() - 0.5) * 2 * shakeIntensity * t;
    const oy = (Math.random() - 0.5) * 2 * shakeIntensity * t;
    deps.canvas.style.transform = `translate(${ox}px, ${oy}px)`;
  } else {
    deps.canvas.style.transform = "";
  }

  const fovPunchUntil = deps.getFovPunchUntil();
  if (roundState.phase === "running" && performance.now() < fovPunchUntil) {
    const t = (fovPunchUntil - performance.now()) / 200;
    const targetFov = (deps.camera.userData.baseFov || 55) - (8 * t);
    if (deps.camera.fov !== targetFov) deps.camera.fov = targetFov;
    deps.camera.updateProjectionMatrix();
  } else {
    deps.camera.fov = deps.camera.userData.baseFov || 55;
    deps.camera.updateProjectionMatrix();
  }

  Effects.updateTrashParticles(dt);
}
