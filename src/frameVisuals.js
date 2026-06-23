// frameVisuals.js — post-physics visual sync, effects, HUD, and render pass

import * as Effects from "./effects.js";
import * as ContactShadows from "./contactShadows.js";
import { applyCartFrameGlow, cartEmissiveIntensityForHex, clamp } from "./utils.js";

/** Last round phase seen by results overlay — used to hide overlay once when leaving podium. */
let lastResultsOverlayPhase = null;

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
 * @property {(mesh: import("three").Object3D, linvel: import("three").Vector3, dt: number, now: number) => void} updateCartVisuals
 * @property {(mesh: import("three").Object3D) => object} buildCartMaterialCache
 * @property {(slot: object | null | undefined) => number} colorHexForSlot
 * @property {() => boolean} isMuted
 * @property {() => number} getSfxVolume
 * @property {object | null | undefined} sfx
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
 */

/**
 * Post-physics frame phase: sync meshes from bodies/net targets, run effects,
 * update HUD/overlays, and issue the render pass. Called after simulation substeps
 * so visuals reflect the latest authoritative (or predicted) cart poses.
 *
 * @param {FrameVisualDeps} deps Wiring from main — closures keep netcode/HUD local.
 * @param {{ now: number, dt: number }} frameCtx Current frame timing from the loop.
 */
export function updateVisualsAndEffects(deps, frameCtx) {
  const { now, dt } = frameCtx;
  const allCarts = deps.getAllCarts();
  const localSlotIndexThisFrame = deps.getLocalSlotIndex();
  const netSlotsForFrame = deps.getNetSlots();
  const roundState = deps.getRoundState();

  // Host-only streak spawners (visual; reads cart velocity after game-logic pass).
  if (deps.isHost() && roundState.phase === "running") {
    Effects.tickRamBoostStreakSpawners(allCarts, now, dt);
  }

  Effects.updateRamBoostStreaks(now);

  // Sync render meshes from physics (or from net targets for remote non-host carts).
  const localSlotIndexForFrame = localSlotIndexThisFrame;
  for (let slotIndex = 0; slotIndex < allCarts.length; slotIndex += 1) {
    const c = allCarts[slotIndex];
    if (!c || !c.mesh) continue;

    if (!deps.isHost() && slotIndex !== localSlotIndexForFrame) {
      if (c._netTargetPos) {
        deps.netTargetPosScratch.copy(c._netTargetPos);
        deps.netTargetPosScratch.y += deps.CONFIG.cart.visualOffset;
        c.mesh.position.lerp(deps.netTargetPosScratch, 0.75);
      }
      if (c._netTargetQuat) c.mesh.quaternion.slerp(c._netTargetQuat, 0.75);
      c.mesh.updateMatrixWorld(true);
      const lv = c._lastNetLinvel || { x: 0, y: 0, z: 0 };
      deps.cartLinvelScratch.set(lv.x || 0, lv.y || 0, lv.z || 0);
      deps.updateCartVisuals(c.mesh, deps.cartLinvelScratch, dt, now);
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

    const p = c.body.translation();
    const r = c.body.rotation();
    c.mesh.position.set(p.x, p.y + deps.CONFIG.cart.visualOffset, p.z);
    c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    c.mesh.updateMatrixWorld(true);
    const lv = c.body.linvel();
    deps.cartLinvelScratch.set(lv.x, lv.y, lv.z);
    deps.updateCartVisuals(c.mesh, deps.cartLinvelScratch, dt, now);
    if (c.contactShadow) {
      ContactShadows.updateCartContactShadow(c.contactShadow, {
        x: c.mesh.position.x,
        z: c.mesh.position.z,
        yaw: ContactShadows.yawFromQuaternion(c.mesh.quaternion),
        heightAboveFloor: p.y - ContactShadows.getFloorY(),
      });
    }
  }

  // Subtle wheel screech: short noise bursts on sharp steering, local cart only.
  const sfxVolume = deps.getSfxVolume();
  const sfx = deps.sfx;
  if (!deps.isMuted() && sfxVolume > 0 && sfx && typeof sfx.playWheelScreech === "function") {
    if (!deps.isMenuVisible() && roundState.phase === "running") {
      const c = localSlotIndexThisFrame >= 0 ? allCarts[localSlotIndexThisFrame] : null;
      if (c && c.body) {
        const lv = c.body.linvel();
        const speed = Math.hypot(lv.x, lv.z);
        if (speed >= 4.0) {
          const axis = deps.getAxis();
          const steerMag = Math.abs(axis.turn || 0);
          const steerThreshold = 0.55;
          if (steerMag >= steerThreshold) {
            if (now - (c.lastWheelScreechAtMs || 0) >= 120) {
              c.lastWheelScreechAtMs = now;
              const steerFactor = clamp((steerMag - steerThreshold) / (1 - steerThreshold), 0, 1);
              const speedFactor = clamp((speed - 4.0) / 10.0, 0, 1);
              sfx.playWheelScreech(steerFactor * speedFactor);
            }
          }
        }
      }
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
      const cache = cart._materialCache || (cart._materialCache = deps.buildCartMaterialCache(cart.mesh));
      for (const mat of cache.frameGlowMats) {
        if (isLeader) {
          const hex = deps.colorHexForSlot(netSlotsForFrame[i]);
          const baseIntensity = cartEmissiveIntensityForHex(hex);
          const whiteMix = glowPulse ** 3;

          if (mat.color) mat.color.setHex(hex);
          if (mat.emissive) {
            const r = ((hex >> 16) & 255) / 255;
            const g = ((hex >> 8) & 255) / 255;
            const b = (hex & 255) / 255;
            mat.emissive.setRGB(
              r + (1 - r) * whiteMix,
              g + (1 - g) * whiteMix,
              b + (1 - b) * whiteMix,
            );
          }
          mat.emissiveIntensity = baseIntensity * (1 - whiteMix) + glowIntensity * whiteMix;
        } else if (roundState.phase === "running" && cart.ramBoostActiveUntilMs > performance.now()) {
          const boostHex = deps.colorHexForSlot(netSlotsForFrame[i]);
          applyCartFrameGlow(
            mat,
            boostHex,
            1.2 + 0.4 * Math.sin(performance.now() * 0.02),
          );
        } else {
          applyCartFrameGlow(mat, deps.colorHexForSlot(netSlotsForFrame[i]));
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
    const ox = (Math.random() - 0.5) * 2 * deps.shakeIntensity * t;
    const oy = (Math.random() - 0.5) * 2 * deps.shakeIntensity * t;
    deps.canvas.style.transform = `translate(${ox}px, ${oy}px)`;
  } else {
    deps.canvas.style.transform = "";
  }

  const fovPunchUntil = deps.getFovPunchUntil();
  if (roundState.phase === "running" && performance.now() < fovPunchUntil) {
    const t = (fovPunchUntil - performance.now()) / 200;
    deps.camera.fov = deps.BASE_FOV - 8 * t;
    deps.camera.updateProjectionMatrix();
  } else if (deps.camera.fov !== deps.BASE_FOV) {
    deps.camera.fov = deps.BASE_FOV;
    deps.camera.updateProjectionMatrix();
  }

  Effects.updateTrashParticles(dt);
}
