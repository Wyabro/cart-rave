// cartOrchestration.js — cart spawn/teardown, labels, boost/hop/ram, NPC, juice/FX (MAIN-1 Lever E)
// Mechanical extract from main(); charge SFX + destroySessionCarts stay on teardown/bridge paths.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RAPIER } from "../physics/rapierInstance.js";
import * as Simulation from "../simulation.js";
import * as Entities from "../entities.js";
import * as Netcode from "../netcode.js";
import * as GameState from "../stores/gameStore.js";
import * as HUD from "../hud.js";
import * as Input from "../input.js";
import * as AudioManager from "../audioManager.js";
import * as ArenaAmbience from "../ambience/arenaAmbience.js";
import * as SfxSynth from "../sfxSynth.js";
import { CONFIG, MSG, CART_COLORS } from "../config.js";
import { getCurrentLevelId } from "../levels/levelManager.js";
import { hapticPulse } from "../haptics.js";
import { sideWeightsFromCartBasis } from "../utils/edgeDanger.js";
import { animateCartBoostPulse, animateCartImpactSquash } from "../animations.js";
import { flashBoostActivate } from "../touchControls.js";
import { spawnKoWorldHitmarker } from "../effects/koHitmarkerFx.js";
import { getArenaKoPresentationProfile, triggerArenaKoFlash } from "../levels/arenaReactiveLights.js";
import { getNpcPersonality, PERSONALITY_META } from "../npcNames.js";
import { cargoFillLevelFor, cargoTierFor } from "../cargoLoad.js";
import {
  resolveCartPatternForSlot,
  resolveCartSunglassesStyleForSlot,
  resolveCartThemeForSlot,
} from "../customization.js";
// * BUNDLE-1 Lever E: the three slot-identity helpers moved to the leaf module
// * cartIdentity.js so main.js can import them WITHOUT pulling this module's heavy
// * graph (simulation/entities/hud/effects) onto the eager side of the gameBoot split.
// * Other consumers (gameBoot, roundLifecycle) import them from cartIdentity.js directly —
// * no re-export here, so there is exactly one definition site.
import { displayColorHexForSlot, displayCssColorForSlot } from "./cartIdentity.js";
import { applyCartPattern } from "../cartPatterns.js";
import { setEmissiveTrimMul } from "../cartRaveGltf.js";
import { getCartTheme } from "../cartThemeConfig.js";
import {
  applyThemeColorToCache,
  buildCartThemeMaterialCache,
} from "../cartThemes.js";
import { svgIcon } from "../ui/icons.js";
import {
  getActiveAiDifficulty,
  getBoostAlignmentAngleDeg,
  getEdgeSaveHopChance,
  getHopAlignmentDotMin,
  isHardTactics,
  resolveNpcBoostMode,
} from "../aiDifficulty.js";
import { resolveNpcHumanBoostCommit } from "../utils/soloRubberband.js";
import { clearNpcCartCache } from "../gameLoop.js";
import {
  getLastSuccessfulHelloGen,
  resetSessionCartBootstrap,
} from "../bootstrap.js";
import { clamp } from "../utils.js";
import { createCart } from "../entities.js";

/** Escapes player-provided text for the innerHTML-based nametag markup. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/**
 * Builds nametag inner markup: personality icon for NPCs, host antenna, leader crown,
 * cargo chip. Personality meta comes from PERSONALITY_META (npcNames.js).
 *
 * @param {string} name
 * @param {{ icon: string, color: string, label: string } | null} meta
 * @param {"intro" | "normal"} mode
 * @param {boolean} isHost
 * @param {boolean} [isLeader]
 * @param {{ tier: "stripped" | "stocked" | "boss", fill: number } | null} [cargoChip]
 * @returns {string}
 */
function nametagHtml(name, meta, mode, isHost, isLeader = false, cargoChip = null) {
  const hostGlyph = isHost
    ? `<span style="opacity:.85;margin-right:5px;">${svgIcon("host", { label: "Host" })}</span>`
    : "";
  const crown = isLeader
    ? `<span class="cart-nametag-crown">${svgIcon("crown", { label: "Leader" })}</span>`
    : "";
  const cargo = cargoChip
    ? `<span class="cart-nametag-cargo" data-cargo="${cargoChip.tier}" data-fill="${cargoChip.fill | 0}" aria-label="Cargo ${cargoChip.fill | 0} of 3"><i></i><i></i><i></i></span>`
    : "";
  if (!meta) return `${hostGlyph}${escapeHtml(name)}${crown}${cargo}`;
  const icon = `<span style="color:${meta.color};margin-right:6px;">${svgIcon(meta.icon, { label: meta.label })}</span>`;
  if (mode === "intro") {
    return `${icon}<span style="color:${meta.color};">${meta.label}</span>${crown}${cargo}`;
  }
  return `${icon}${escapeHtml(name)}${crown}${cargo}`;
}

/** Caches per-cart materials so recoloring doesn't traverse the mesh every update. */
export function buildCartMaterialCache(cartMesh) {
  return buildCartThemeMaterialCache(cartMesh);
}

function testDriveSpawnForSlot(_slotIndex, config) {
  const y = config.cart.size.y / 2 + (config.cart.collider?.localYOffset ?? 0.13) + 0.05;
  return { x: 0, y, z: 0 };
}

/**
 * Cart spawn/teardown, name labels, boost/hop/ram, NPC opportunistic helpers, juice/FX.
 * Owns juice mutable state + nameLabels + allCarts; syncs allCartsRef via deps.
 * @param {object} deps
 */
export function createCartOrchestration(deps) {
  const {
    scene,
    camera,
    getFxPass,
    getHud,
    ramBoostStreaks,
    getWorld,
    getAllCartsRef,
    setAllCartsRef,
    getPendingMidRoundJoinRespawnConnId,
    setPendingMidRoundJoinRespawnConnId,
    helloGate,
    sessionRefs,
    gameCtx,
    rewireSessionNetcodeRefs,
    drainPendingArenaRotation,
    getSpawnTrashBurstRef,
  } = deps;

  let shakeUntil = 0;
  let shakeIntensity = 0;
  let fovPunchUntil = 0;
  // * Punch amplitude in degrees — ram hits use the base 8°, kill confirms hit harder.
  let fovPunchDeg = 8;
  // * Kill-confirm white flash + radial shockwave on the arcade pass (uFlash / uShock).
  // * Slightly longer than a pure white pop so the expanding Shadertoy-style ring can read.
  const killFlash = { until: 0, durationMs: 200, strength: 0 };
  // * KO hit-stop — presentation-only: rendered cart poses + the follow camera hold for
  // * ~80ms while physics/prediction/reconciliation run untouched, then blend back over
  // * ~120ms (frameVisuals consumes this). Never touches dt or the physics accumulator.
  const hitStop = { until: 0, blendUntil: 0 };
  // * Post-FX impact pulse — vignette/aberration kick when the local cart takes a big hit.
  // * Baselines are captured from the live uniforms at trigger time so the pulse never
  // * fights the dev Tweakpane or config changes; frameVisuals decays and restores them.
  const impactPulse = { until: 0, durationMs: 170, strength: 0, baseVignette: null, baseAberration: null };
  /** Round key (startedAtMs) whose first-blood KO has already been escalated. */
  let firstBloodRoundKey = null;
  /** Victim slot → local early-confirm time. Final fall still supplies the score float. */
  const earlyKoConfirmByVictim = new Map();

  /** Scratch for hit-direction → cart-local side mapping (no per-hit allocs). */
  const _hitDirFwd = new THREE.Vector3();
  const _hitDirRight = new THREE.Vector3();
  const _hitDirUp = new THREE.Vector3(0, 1, 0);
  const _hitDirQuat = new THREE.Quaternion();

  const ramBoostForwardXZ = new THREE.Vector3();
  const ramBoostToTargetXZ = new THREE.Vector3();
  const ramBoostRightXZ = new THREE.Vector3();

  /** @type {any} Reused Rapier ray for the hop grounded check (allocated on first hop). */
  let _hopGroundRay = null;

  // --- Floating name labels above carts ---
  const nameLabels = [];
  let allCarts = [];

  /** @type {{ renderer: import("three").WebGLRenderer, scene: import("three").Scene, camera: import("three").Camera } | null} */
  let slotsWarmupCtx = null;
  let slotsWarmupPending = false;

  function setSlotsWarmupCtx(ctx) {
    slotsWarmupCtx = ctx;
  }

  function scheduleSlotsMaterialWarmup() {
    if (!slotsWarmupCtx || slotsWarmupPending) return;
    slotsWarmupPending = true;
    setTimeout(() => {
      slotsWarmupPending = false;
      const ctx = slotsWarmupCtx;
      if (!ctx) return;
      ctx.renderer.compileAsync(ctx.scene, ctx.camera).catch(() => {});
    }, 0);
  }

  function localCartForConnId() {
    const carts = getAllCartsRef() || allCarts || [];
    const idx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    if (idx < 0) return null;
    return carts[idx] || null;
  }

  function teleportCartToSpawn(slotIndex) {
    const carts = getAllCartsRef() || allCarts;
    if (!carts || typeof slotIndex !== "number") return;
    const cart = carts[slotIndex];
    if (!cart?.body || !cart.spawn) return;
    cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y + 1.0, z: cart.spawn.z }, true);
    cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (typeof cart.spawnYaw === "number") {
      const halfYaw = cart.spawnYaw / 2;
      cart.body.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
    }
    cart.body.wakeUp();
  }

  function updateCartMaterialsFromSlots(slots) {
    const carts = getAllCartsRef() || allCarts;
    if (!carts || !Array.isArray(slots)) return;

    const youConnId = Netcode.getYouConnId();

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      const cart = carts[slotIndex];
      if (!slot || !cart?.mesh) continue;

      if (slot.kind === "empty") {
        cart.mesh.visible = false;
        if (cart.body) cart.body.setEnabled(false);
        continue;
      }

      if (slot.kind === "human" || slot.kind === "npc") {
        cart.mesh.visible = true;
        if (cart.body) cart.body.setEnabled(true);
      }

      const finalHex = displayColorHexForSlot(slot);
      const themeId = cart.cartThemeId
        ?? resolveCartThemeForSlot(slot, { youConnId });
      const cache = cart._materialCache || (cart._materialCache = buildCartMaterialCache(cart.mesh));
      const trimBefore = /** @type {any} */ (cache).emissiveTrimMul ?? 1;

      applyThemeColorToCache(cache, themeId, finalHex);

      const theme = getCartTheme(themeId);
      if (theme.patternPolicy !== "disable") {
        const patternId = resolveCartPatternForSlot(slot, { youConnId });
        applyCartPattern(cart.mesh, patternId, finalHex);
        cart.cartPatternId = patternId;
        // * FIX-EMISSIVE — THE live match path. Carts are built by prepareRaveGltfCart with no
        // * patternId, so they are all born "classic"; this is where the real pattern is known.
        // * Without this line every match cart stays trimmed and patterned carts never return
        // * to 1 — the fix inverted, while the menu preview still looks correct.
        // * Re-applies the colour because the trim only takes effect on the next recolor.
        if (setEmissiveTrimMul(cache, patternId, cart.mesh) !== trimBefore) {
          applyThemeColorToCache(cache, themeId, finalHex);
        }
      }

      cart.cartColor = finalHex;
      // * NET-LOOK-ACC-1: cache only — style is baked into the cloned GLTF materials, so a
      // * live cart keeps its current glasses. This is what rebuildCartVisualsIntoRoot reads
      // * (entities.js), so a peer's new style lands on that cart's next KO respawn instead
      // * of never.
      cart.cartSunglassesStyle = resolveCartSunglassesStyleForSlot(slot, { youConnId });
    }
    scheduleSlotsMaterialWarmup();
  }

  function updateHudColorsFromSlots(slots) {
    HUD.refreshScoreBoxGlows(slots, Netcode.getYouConnId());
  }

function triggerImpactPulse(strength) {
  const pass = getFxPass();
  if (!pass?.enabled || !pass.uniforms) return;
  const now = performance.now();
  if (now >= impactPulse.until) {
    impactPulse.baseVignette = pass.uniforms.uVignette.value;
    impactPulse.baseAberration = pass.uniforms.uAberration.value;
  }
  impactPulse.strength = Math.min(strength, 0.9);
  impactPulse.until = now + impactPulse.durationMs;
}
// * max-of on both duration and amplitude — overlapping punches never truncate or
// * soften each other (a ram punch landing mid kill-punch keeps the kill's 12°).
function armFovPunch(deg, durationMs) {
  const now = performance.now();
  fovPunchDeg = now < fovPunchUntil ? Math.max(fovPunchDeg, deg) : deg;
  fovPunchUntil = Math.max(fovPunchUntil, now + durationMs);
}
function triggerLocalRamShake(intensity, isBoosting = false) {
  const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
  const minI = isBoosting
    ? (fx.shakeBoostMinIntensity ?? 0.16)
    : (fx.shakeMinIntensity ?? 0.22);
  if (intensity < minI) return;
  const clampedI = Math.min(intensity, 1.2);
  const boostMul = isBoosting ? 1.3 : 1.0;
  shakeIntensity = clampedI * (fx.shakePixelScale ?? 5.5) * boostMul;
  shakeUntil = performance.now() + 150 + clampedI * 100;
  // * Attacker-side pulse runs softer than victim-side — you need to keep aiming
  // * through your own hit feedback (playtest 07-17: "flash too disorienting").
  triggerImpactPulse(clampedI * 0.7);
  hapticPulse(clampedI * 0.7, clampedI * 0.4, 60 + clampedI * 60);
  if (clampedI >= 0.45 && isBoosting) {
    armFovPunch(8, 100);
  }
}
// * Victim-side ram feedback — shake/post-FX from shakeMinIntensity; directional DOM
// * vignette from hitDirMinIntensity (HIT-FEEL-1: Round 1 quiet incoming, Round 2 wake normals).
/**
 * @param {number} intensity
 * @param {boolean} [isBoosting]
 * @param {number} [hitFromX] World-XZ direction the blow came from (attacker relative to you)
 * @param {number} [hitFromZ]
 */
function triggerLocalHitTaken(intensity, isBoosting = false, hitFromX = 0, hitFromZ = 0) {
  const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
  const clampedI = Math.min(Math.max(Number(intensity) || 0, 0), 1.35);

  // * Directional hit cue first — lower floor than shake so everyday rams still read.
  // * fxIntensity is impulse/maxImpulse; typical non-boost rams often land ~0.1–0.35.
  const vignetteMin = fx.hitDirMinIntensity ?? 0.14;
  if (clampedI >= vignetteMin) {
    pulseLocalHitDirectionVignette(clampedI, hitFromX, hitFromZ);
  }

  const minI = isBoosting
    ? (fx.shakeBoostMinIntensity ?? 0.16)
    : (fx.shakeMinIntensity ?? 0.22);
  if (clampedI < minI) return;
  const boostMul = isBoosting ? 1.3 : 1.0;
  shakeIntensity = clampedI * (fx.shakePixelScale ?? 5.5) * boostMul;
  shakeUntil = performance.now() + 150 + clampedI * 100;
  triggerImpactPulse(Math.min(clampedI * 1.15, 1.2));
  hapticPulse(clampedI * 0.85, clampedI * 0.5, 70 + clampedI * 70);
}

/**
 * @param {number} clampedI Raw collision intensity (often << 1 for normal rams).
 * @param {number} hitFromX
 * @param {number} hitFromZ
 */
function pulseLocalHitDirectionVignette(clampedI, hitFromX, hitFromZ) {
  const cart = localCartForConnId();
  if (!cart?.body || typeof HUD.pulseHitDirection !== "function") return;

  // * Remap low impulse intensities into a readable display range (HIT-FEEL-1 Round 1:
  // * quieter love-taps; hard/nitro still near full via sqrt). Knobs on CONFIG.ramming.fx.
  const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
  const bias = fx.hitDirDisplayBias ?? 0.3;
  const scale = fx.hitDirDisplayScale ?? 0.62;
  const displayI = Math.min(1, bias + Math.sqrt(Math.min(clampedI, 1.2)) * scale);

  const len = Math.hypot(hitFromX, hitFromZ);
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  if (len > 1e-4) {
    const nx = hitFromX / len;
    const nz = hitFromZ / len;
    const rot = cart.body.rotation();
    _hitDirQuat.set(rot.x, rot.y, rot.z, rot.w);
    _hitDirFwd.set(0, 0, -1).applyQuaternion(_hitDirQuat);
    _hitDirFwd.y = 0;
    if (_hitDirFwd.lengthSq() > 1e-6) _hitDirFwd.normalize();
    else _hitDirFwd.set(0, 0, -1);
    _hitDirRight.crossVectors(_hitDirFwd, _hitDirUp).normalize();
    const sides = sideWeightsFromCartBasis(
      displayI,
      nx,
      nz,
      _hitDirFwd.x,
      _hitDirFwd.z,
      _hitDirRight.x,
      _hitDirRight.z,
    );
    top = sides.top;
    right = sides.right;
    bottom = sides.bottom;
    left = sides.left;
  } else {
    const u = displayI * 0.45;
    top = right = bottom = left = u;
  }

  const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
  const slot = Netcode.getNetSlots()?.[localSlot];
  const colorCss = getHud()?.colorHexToCss?.(displayColorHexForSlot(slot))
    || _playerAccentFromHud()
    || "#22e6ff";

  HUD.pulseHitDirection({
    intensity: displayI,
    top,
    right,
    bottom,
    left,
    colorCss,
    durationMs: 420 + displayI * 220,
  });
}

/** @returns {string | null} */
function _playerAccentFromHud() {
  try {
    return getComputedStyle(document.getElementById("hud") || document.documentElement)
      .getPropertyValue("--hud-player-accent")
      .trim() || null;
  } catch {
    return null;
  }
}
// * Squash-and-stretch on impact — the victim compresses hard, the rammer flexes
// * lightly. Fired for every collision on the host and replayed for non-hosts, so
// * hits read as physical on every cart, not just the local one.
function squashCartsOnImpact(rammerCart, victimCart, intensity) {
  if (victimCart?.mesh) animateCartImpactSquash(victimCart.mesh, Math.min(intensity * 1.1, 1.2));
  if (rammerCart?.mesh) animateCartImpactSquash(rammerCart.mesh, intensity * 0.6);
}
// * Attacker-side KO payoff — confirm sting + hitmarker + harder FOV punch + white
// * flash + aberration kick. Purely presentational — never touches physics dt.
function playLocalKoConfirmFeedback() {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!reducedMotion) {
    // * max-of on chained KOs so a double-kill can't truncate the first stop.
    const nowMs = performance.now();
    hitStop.until = Math.max(hitStop.until, nowMs + 80);
    hitStop.blendUntil = hitStop.until + 120;
  }
  armFovPunch(9, 180);
  killFlash.strength = 0.45;
  killFlash.until = performance.now() + killFlash.durationMs;
  triggerImpactPulse(0.4);
  hapticPulse(0.9, 0.6, 120);
  AudioManager.duckMusic(0.45, 600);
  AudioManager.playSfx("killConfirm");
  getHud()?.showKillConfirm?.();
}

// * PACE-KO-1: host-confirmed at the shared rim crossing; the tuned fall and explosion
// * continue untouched. Remember the victim so its later authoritative fall only adds score.
function onLocalKoConfirm(victimSlotIndex) {
  if (!Number.isInteger(victimSlotIndex)) return;
  const nowMs = performance.now();
  earlyKoConfirmByVictim.set(victimSlotIndex, nowMs);
  for (const [slot, atMs] of earlyKoConfirmByVictim) {
    if (nowMs - atMs > 5000) earlyKoConfirmByVictim.delete(slot);
  }
  playLocalKoConfirmFeedback();
}

// * Full death still owns scoring, announcer, shatter, and respawn timing. If an early
// * P2P confirm was dropped, replay the full attacker feedback here as a loss-safe fallback.
function onLocalKillConfirm(victimSlotIndex, _comboTier, koEvent) {
  const earlyAtMs = earlyKoConfirmByVictim.get(victimSlotIndex);
  if (earlyAtMs != null && performance.now() - earlyAtMs <= 5000) {
    earlyKoConfirmByVictim.delete(victimSlotIndex);
  } else {
    playLocalKoConfirmFeedback();
  }
  if (koEvent?.reward) getHud()?.showScoreFloat?.(koEvent.reward, koEvent.cause);
}

/**
 * Local-victim KO feedback — a HUD-only red edge pulse and center shockwave. It runs from the
 * finalized KO Event, so rams, self-falls, and environmental falls follow the same path.
 * @param {import("../scoring/koEvent.js").KOEvent} _koEvent
 */
function onLocalDoomed(_koEvent) {
  getHud()?.showDoomedFeedback?.();
}

/**
 * Arena-wide KO light flash — every peer sees the club react (not just the scorer).
   * @param {import("../scoring/koEvent.js").KOEvent} koEvent
   */
function onArenaKoFlash(koEvent) {
  const slots = Netcode.getNetSlots();
  const colorSlotIndex = koEvent.attackerSlotIndex != null
    ? koEvent.attackerSlotIndex
    : koEvent.victimSlotIndex;
  const slot = slots?.[colorSlotIndex];
  const hex = displayColorHexForSlot(slot);
  // * First blood: the match's first KO gets a bigger flash + hitmarker so the opening
  // * elimination reads as an event, not just another KO. Keyed by round so it re-arms
  // * each round; fires for every peer (this reactor runs on all clients).
  const roundKey = GameState.getRoundState()?.startedAtMs ?? 0;
  const isFirstBlood = koEvent.isKill && firstBloodRoundKey !== roundKey;
  if (isFirstBlood) firstBloodRoundKey = roundKey;
  const presentation = getArenaKoPresentationProfile(koEvent, isFirstBlood);
  // * Reduced strengths vs the original reactive mode — a punch accent, not a recolor.
  triggerArenaKoFlash(hex, {
    strength: presentation.strength,
    durationMs: presentation.durationMs,
  });
  // * World hitmarker at the victim — every peer sees where the KO landed.
  const victim = allCarts?.[koEvent.victimSlotIndex];
  if (scene && victim) {
    let px = 0;
    let py = 1;
    let pz = 0;
    if (victim.body) {
      const t = victim.body.translation();
      px = t.x;
      py = t.y + 0.55;
      pz = t.z;
    } else if (victim.mesh) {
      px = victim.mesh.position.x;
      py = victim.mesh.position.y + 0.35;
      pz = victim.mesh.position.z;
    }
    spawnKoWorldHitmarker(
      scene,
      px,
      py,
      pz,
      hex,
      presentation.hitmarkerIntensity,
    );
  }
  // * Scoreboard rampage pips ride this reactor because it fires for every fall on
  // * every client: refresh the attacker's streak, clear the fallen victim's.
  if (koEvent.attackerSlotIndex != null && (koEvent.comboTier ?? 0) > 0) {
    getHud()?.noteComboPip?.(koEvent.attackerSlotIndex, koEvent.comboTier, koEvent.comboMultiplier ?? 1);
  }
  getHud()?.noteComboPip?.(koEvent.victimSlotIndex, 0);
  // * Crowd cheer on kills — Classic Record only (the one arena with a visible crowd;
  // * a cheering audience in the Storerooms would break the liminal theme).
  if (koEvent.isKill && getCurrentLevelId() === "classicRecord") {
    SfxSynth.playCrowdCheer(0.55 + Math.min(koEvent.comboTier ?? 0, 3) * 0.12);
  }
  // * The crowd bed reacts too (Classic hype layer; no-op elsewhere): kills swell it,
  // * combos and first blood push it toward a roar, plain falls nudge it.
  ArenaAmbience.bumpCrowdExcitement(
    (koEvent.isKill ? 0.4 + Math.min(koEvent.comboTier ?? 0, 3) * 0.12 : 0.16)
      * (isFirstBlood ? 1.35 : 1),
  );
}

function triggerSpillNetcode(slotIndex, pos, quat, vel, cargoBay, count) {
  if (!Netcode.getIsHost()) return;
  // Send over WebRTC DataChannel instead of WebSocket
  // The host broadcasts this to all non-host peers
  Netcode.sendP2PEvent({
    type: MSG.spill,
    slotId: slotIndex,
    pos,
    quat,
    vel,
    cargoBay: !!cargoBay,
    count,
  });
}

/**
 * Spill Bonus feed + (local attacker only) score float / light confirm.
 * Host: onSpillBonusAward. Clients: netcode MSG.spillBonus (scores still via round).
 * @param {{ attackerSlotIndex?: number, victimSlotIndex?: number, points?: number }} award
 */
function presentSpillBonusAward(award) {
  if (!award) return;
  const attackerSlotIndex = Number(award.attackerSlotIndex);
  const victimSlotIndex = Number(award.victimSlotIndex);
  const points = Math.max(0, Number(award.points) || 0);
  if (!Number.isFinite(attackerSlotIndex) || !Number.isFinite(victimSlotIndex) || points <= 0) {
    return;
  }
  const slots = Netcode.getNetSlots();
  const attacker = slots?.[attackerSlotIndex];
  const victim = slots?.[victimSlotIndex];
  const actorName = attacker?.name || `P${attackerSlotIndex + 1}`;
  const targetName = victim?.name || `P${victimSlotIndex + 1}`;
  const actorColor = getHud()?.colorHexToCss?.(displayColorHexForSlot(attacker)) ?? null;
  const targetColor = getHud()?.colorHexToCss?.(displayColorHexForSlot(victim)) ?? null;
  getHud()?.addKillFeedEntry?.(actorName, actorColor, "SPILLED", targetName, targetColor, 0, 1);

  const localSlot = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
  if (attackerSlotIndex !== localSlot) return;

  getHud()?.showScoreFloat?.(
    {
      base: points,
      critical: 0,
      leader: 0,
      highGround: 0,
      multiplier: 1,
      total: points,
    },
    "spill_bonus",
  );
  // * Lighter than a full KO confirm — just enough for the +1 to land.
  hapticPulse(0.35, 0.25, 45);
  SfxSynth.playKillConfirm();
}

function stopChargeSfxForCart(cart) {
  if (!cart) return;
  if (cart.chargeUpSfxId != null) {
    AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
    cart.chargeUpSfxId = null;
  }
  cart.isChargingBoost = false;
  cart.boostChargeStartedAtMs = 0;
}

/**
 * Starts the local presentation loop for an NPC charge.
 * Remote humans never use this path: their own client already owns its charge SFX.
 */
function startNpcChargeSfx(cart) {
  if (!cart || cart.chargeUpSfxId != null) return;
  cart.chargeUpSfxId = AudioManager.playSfx("chargeUp", undefined, { volume: 0.45 });
}

/**
 * Round-boundary sweep: stops any looping charge-up SFX on every cart. Charging
 * through the running→podium transition otherwise leaks the loop forever —
 * resetCartTransientState nulls chargeUpSfxId without stopping the sound, so the
 * loop must be stopped BEFORE any transient reset runs.
 */
function stopAllChargeSfx() {
  for (const cart of getAllCartsRef() || []) stopChargeSfxForCart(cart);
  // * Nuclear: rematchResetWorld / resetCartTransientState null chargeUpSfxId without
  // * stopping Howler — any missed stop path leaves chargeUp looping forever (NET-1
  // * rematch + mid-round cancel when localCart identity is briefly wrong).
  AudioManager.stopAllSfx?.("chargeUp");
}

function scheduleRespawn(cart, now) {
  if (cart.respawnAtMs !== null) return;
  cart.respawnAtMs = now + (CONFIG.fall?.respawnDelayMs ?? 1000); // * respawn after shatter VFX plays out
  // * Charge SFX already stopped via gameFlow onCartOutOfPlay at fall start.
  if (cart === localCartForConnId()) {
    stopChargeSfxForCart(cart);
    AudioManager.playCartDeath();
  }
}

function scheduleStuckRespawn(cart) {
  if (!cart?.body || cart.respawnAtMs !== null) return;
  stopChargeSfxForCart(cart);
  Entities.doRespawn(cart);
  Entities.resetCartIdleWatch(cart);
}

function makeNameLabel(contentHtml, color) {
  const el = document.createElement("div");
  el.className = "cart-nametag";
  el.innerHTML = contentHtml;
  // * Layout/size live in hud.css (fluid + mobile/coarse). Only the cart color
  // * is dynamic — do not set padding/fontSize here or media queries lose.
  // * 6a demotes it from a 2.5px neon edge to the punched hole's ring: the
  // * plate is a hairline price tag, identity rides the tag's own hardware.
  el.style.setProperty("--nt", color);

  const label = new CSS2DObject(el);
  label.center.set(0.5, 0);
  return label;
}

function updateNameLabels() {
  const leaderSlot = HUD.getLeaderSlotIndex();
  for (let i = 0; i < allCarts.length; i++) {
    const slot = Netcode.getNetSlots()[i];
    const cart = allCarts[i];
    if (!slot || !cart || !cart.mesh) continue;

    const name = slot.name || `P${i + 1}`;
    const colorCSS = displayCssColorForSlot(slot);

    const personality = cart.aiPersonality || (slot.kind === "npc" ? getNpcPersonality(name) : null);
    const meta = personality ? (PERSONALITY_META[personality.name] || null) : null;
    const introMode = meta && GameState.getRoundState().phase === "countdown" ? "intro" : "normal";
    // * Host glyph only means something online — solo/testdrive is always "host".
    const mode = Netcode.detectGameMode();
    const hostGlyphEligible = mode !== "solo" && mode !== "testdrive";
    const isHostSlot = hostGlyphEligible && Boolean(slot.connId && slot.connId === Netcode.getHostId());
    // * CARGO-HUD-1: lifeCargoPoints is already client-side for every cart (host sim
    // * locally, `lc` off the snapshot for remotes) — this is a read, never a sync.
    const cargo = {
      tier: cargoTierFor(cart.lifeCargoPoints),
      fill: cargoFillLevelFor(cart.lifeCargoPoints),
    };
    const contentHtml = nametagHtml(name, meta, introMode, isHostSlot, i === leaderSlot, cargo);

    if (nameLabels[i]) {
      if (
        nameLabels[i]._labelHtml !== contentHtml ||
        nameLabels[i]._labelColor !== colorCSS
      ) {
        nameLabels[i].element.innerHTML = contentHtml;
        nameLabels[i].element.style.setProperty("--nt", colorCSS);
        nameLabels[i]._labelHtml = contentHtml;
        nameLabels[i]._labelColor = colorCSS;
      }
    } else {
      const label = makeNameLabel(contentHtml, colorCSS);
      label._labelHtml = contentHtml;
      label._labelColor = colorCSS;
      scene.add(label);
      nameLabels[i] = label;
    }
  }
  while (nameLabels.length > allCarts.length) {
    const removedLabel = nameLabels.pop();
    if (!removedLabel) continue;
    scene.remove(removedLabel);
    if (removedLabel.element?.parentNode) {
      removedLabel.element.parentNode.removeChild(removedLabel.element);
    }
  }
}

// Position name labels each frame (called in game loop)
function positionNameLabels() {
  // * Content refresh is diff-gated (innerHTML only on change), so running it per
  // * frame is cheap and keeps phase-driven states live (countdown personality
  // * intro collapsing at GO, host glyph moving on migration).
  updateNameLabels();
  for (let i = 0; i < nameLabels.length; i++) {
    const label = nameLabels[i];
    const cart = allCarts[i];
    if (!label || !cart || !cart.body) continue;
    const pos = cart.mesh.position;
    label.position.set(pos.x, pos.y + 3.0, pos.z);
    const distance = Math.max(0.001, camera.position.distanceTo(label.position));
    const scale = clamp(18 / distance, 0.65, 1.2);
    label.element.style.transform = `translate(-50%, 0) scale(${scale})`;
  }
}

function bootstrapSessionCarts(expectedGen) {
  if (getAllCartsRef()?.length && getLastSuccessfulHelloGen() === expectedGen) {
    return getAllCartsRef();
  }

  if (expectedGen != null && expectedGen !== helloGate.getGeneration()) {
    return null;
  }
  // * Cap-63: do not call destroySessionCarts() here — that resetSessionCartBootstrap()
  // * nulls the in-flight ensureSessionCartsReady promise mid-warm so isSessionCartsReady
  // * flipped true as soon as carts existed (before play-shader / carts-ready). Tear down
  // * cart bodies only; leave the bootstrap promise latch intact.
  Entities.destroyCarts({ scene, nameLabels });
  clearNpcCartCache();
  allCarts = [];
  setAllCartsRef(null);
  sessionRefs.clearSessionCallbackRefs();

  const { allCarts: carts, nextPendingMidRoundJoinRespawnConnId } = Entities.initCarts({
    scene,
    world: getWorld(),
    ramBoostStreaks,
    netSlots: Netcode.getNetSlots(),
    youConnId: Netcode.getYouConnId(),
    CART_COLORS,
    colorHexForSlot: displayColorHexForSlot,
    themeForSlot: (slot) => resolveCartThemeForSlot(slot, { youConnId: Netcode.getYouConnId() }),
    pendingMidRoundJoinRespawnConnId: getPendingMidRoundJoinRespawnConnId(),
    ...(Netcode.detectGameMode() === "testdrive"
      ? {
        spawnForSlot: () => testDriveSpawnForSlot(0, CONFIG),
        spawnYawForSlot: () => 0,
      }
      : {}),
  });
  if (expectedGen != null && expectedGen !== helloGate.getGeneration()) {
    Entities.destroyCarts({ scene, nameLabels });
    return null;
  }
  setPendingMidRoundJoinRespawnConnId(nextPendingMidRoundJoinRespawnConnId);
  allCarts = carts;
  setAllCartsRef(carts);
  // * Full ref re-wire (not just getAllCartsRef): a prior returnToMenu cleared the
  // * input-axis/trigger refs, and re-entering a session must restore them or the
  // * non-host predicts with null input forever (07-17 spawn-platform freeze).
  rewireSessionNetcodeRefs();
  Netcode.setRefs({ getAllCartsRef: () => getAllCartsRef() });
  // * Slot colors are authoritative: server-provided in multiplayer (accepted verbatim),
  // * and declashed once at init for solo/testdrive. No re-derivation here.
  updateCartMaterialsFromSlots(Netcode.getNetSlots());
  sessionRefs.updateNameLabelsRef.current = updateNameLabels;
  updateNameLabels();
  if (Netcode.getIsHost() && !Netcode.getHostSendTimer()) Netcode.startHostSendLoop();
  Netcode.setAuthorityMode(Netcode.getIsHost());
  gameCtx.registerRuntime({
    getAllCarts: () => allCarts,
    getAllCartsRef: () => getAllCartsRef(),
  });
  // * Joiner-desync drain: a room-authoritative levelId that arrived on hello (or
  // * an early MSG.round) while the play-entry was still tearing down the menu is
  // * latched in pendingArenaRotationLevelId. Now that carts exist and the world is
  // * live, retry the swap so the joiner ends up on the room's arena, not their
  // * own menu pick.
  void drainPendingArenaRotation();
  // * NET-2: hello may have cached a spawn snapshot before bodies existed.
  Netcode.reapplyCachedCartsSnapshot?.();
  return carts;
}

function destroySessionCarts() {
  Entities.destroyCarts({ scene, nameLabels });
  clearNpcCartCache();
  allCarts = [];
  setAllCartsRef(null);
  resetSessionCartBootstrap();
  sessionRefs.clearSessionCallbackRefs();
}

function getAiAxis(now, cart) {
  // * Solo rubberband is host-local AI only — never arm it for multiplayer rooms.
  Simulation.setSoloRubberbandActive(Netcode.detectGameMode() === "solo");
  // * Latch room difficulty once for the host brain (Quickplay → medium; Solo/Friends → store).
  Netcode.ensureHostAiDifficultyLatched(Netcode.detectGameMode());
  const axis = Simulation.getAiAxis(now, cart, allCarts, Netcode.getNetSlots());
  if (!cart.isChargingBoost || cart.npcBoostChargeTargetSlotIndex == null) return axis;

  // * NPC-BOOST-2: when the charge can no longer continue (target too close,
  // * edge danger, path unsafe), do NOT cancel. Leave boostHeld unset —
  // * applyArcadeControls sees a human-style release and fires a proportional
  // * burst instead of a full-power auto-release or a silent cancel.
  if (canContinueNpcChargedAttack(cart)) {
    axis.boostHeld = true;
  }
  return axis;
}

/**
 * Starts an Auto-Charge Boost for a human cart, or the selected NPC boost mode.
 *
 * Human path (default): sets `isChargingBoost` + records the start time + plays the
 * looping charge-up SFX locally. The actual burst is auto-released by
 * `applyArcadeControls` once `boostChargeTimeMs` elapses, which then fires
 * `onBoostRelease` to swap the SFX and trigger the visual pulse.
 *
 * NPC charge state is held by the host AI fixed tick. Instant remains available for
 * chase, escape, and recovery intents.
 *
 * @param {ReturnType<typeof createCart>} cart
 * @param {number} nowMs
 * @param {{ instant?: boolean }} [opts]
 */
/**
 * @param {ReturnType<typeof createCart>} cart
 * @param {number} nowMs
 * @param {{ instant?: boolean, silent?: boolean }} [opts]
 *   silent — skip charge SFX (reconcile replay re-arms without stacking loops).
 */
function triggerRamBoost(cart, nowMs, opts = {}) {
  if (!cart?.body) return;
  const rb = CONFIG.cart.ramBoost;
  if (!rb.enabled) return;
  if (nowMs <= cart.ramBoostActiveUntilMs) return;
  if (cart.isChargingBoost) return;

  const chargeCfg = rb.boostCharge;
  const useCharge = !opts.instant && chargeCfg?.enabled;

  if (useCharge) {
    // * Cooldown gate — block re-charging until boostCooldownMs passes after the last burst.
    if (nowMs < cart.boostCooldownUntilMs) return;
    cart.isChargingBoost = true;
    cart.boostChargeStartedAtMs = nowMs;
    cart.boostChargeMultiplier = chargeCfg.boostMaxMultiplier;
    // * Trail style is only "charged" after release — not while holding charge.
    cart.nitroStreakCharged = false;
    const isLocal = cart === localCartForConnId();
    if (isLocal && !opts.silent) {
      // * Stop any orphaned charge loop before starting a new one (reconcile used to
      // * clear isChargingBoost without stopping SFX — re-press stacked loops).
      if (cart.chargeUpSfxId != null) {
        AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
        cart.chargeUpSfxId = null;
      }
      // * Looping charge-up SFX; stopped on release / interrupt via onBoostRelease or respawn.
      cart.chargeUpSfxId = AudioManager.playSfx("chargeUp");
    } else if (Netcode.getNetSlots()?.[cart.slotIndex]?.kind === "npc") {
      // * Solo host has no incoming snapshot for its NPCs. Play the same local
      // * presentation loop that non-host clients start from the `ch` wire edge.
      startNpcChargeSfx(cart);
    }
    return;
  }

  // * Instant path (NPCs, or when the charge mechanic is disabled): legacy behavior.
  if (nowMs - cart.lastRamBoostTimeMs < rb.cooldownSec * 1000) return;
  cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1000;
  cart.lastRamBoostTimeMs = nowMs;
  // * Instant nitro = simple cart-color trail (charge release sets gold energy style).
  cart.nitroStreakCharged = false;
  cart.boostChargeMultiplier = 0;
  const isLocal = cart === localCartForConnId();
  if (isLocal) {
    AudioManager.playSfx("boost");
    if (cart.mesh) animateCartBoostPulse(cart.mesh);
    flashBoostActivate();
  } else {
    // * NPC / remote-human boosts are audible + pulsed for everyone (attenuated;
    // * the screen flash stays owner-only).
    AudioManager.playSfx("boost", undefined, { volume: 0.45 });
    if (cart.mesh) animateCartBoostPulse(cart.mesh);
  }
  cart.ramBoostStreakCarry = 0;
}

/**
 * Auto-Charge Boost release callback — invoked by `applyArcadeControls` (via the sim
 * callbacks) when a charging cart hits `boostChargeTimeMs` or early-releases after 100ms.
 * Stops the looping charge SFX and fires the boost/nitro SFX + visual pulse for the
 * local cart. Remote-cart releases on the host are silent here (the owning client plays
 * its own SFX locally).
 *
 * @param {ReturnType<typeof createCart>} cart
 */
function onBoostRelease(cart) {
  cart.npcBoostChargeTargetSlotIndex = null;
  const isLocal = cart === localCartForConnId();
  if (cart.chargeUpSfxId != null) {
    AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
    cart.chargeUpSfxId = null;
  }
  if (isLocal) {
    AudioManager.playSfx("boost");
    if (cart.mesh) animateCartBoostPulse(cart.mesh);
    flashBoostActivate();
    hapticPulse(0.4, 0.7, 60);
  } else {
    // * Host-side releases for remote humans: audible + pulsed, no screen flash.
    AudioManager.playSfx("boost", undefined, { volume: 0.45 });
    if (cart.mesh) animateCartBoostPulse(cart.mesh);
  }
}

/**
 * Auto-Charge Boost cancel callback — invoked by `applyArcadeControls` when the
 * player releases the boost button before 100ms of charging. Stops the looping
 * charge-up SFX silently (no boost sound, no visual pulse).
 *
 * @param {ReturnType<typeof createCart>} cart
 */
function onBoostCancel(cart) {
  cart.npcBoostChargeTargetSlotIndex = null;
  // * Always stop by id when present — only the local cart ever sets chargeUpSfxId.
  // * Gating on localCartForConnId() first left orphan loops when identity briefly
  // * mismatched after respawn/rebuild (charge cancelled, SFX kept looping).
  if (cart?.chargeUpSfxId != null) {
    AudioManager.stopSfx("chargeUp", cart.chargeUpSfxId);
    cart.chargeUpSfxId = null;
  }
}

// * Local-input hop with a grounded gate: blocks air-hops / chain-hops (the human path
// * previously gated on cooldown only — 2 hops/s each +25 N·s up). NPC and remote-replay
// * hops keep going through triggerHop directly and are unaffected.

// * Grounded = static/kinematic-or-any surface within reach straight below the cart
// * center. Replaces the old `|lv.y| > 2.2` velocity gate, which ate legitimate hop
// * presses whenever vertical velocity spiked without leaving the ground — driving the
// * Sundial podium ramp at speed (~11° slope ⇒ lv.y ≈ 2.3+), trimesh seam micro-hops,
// * post-landing rebound. Do NOT exclude kinematic bodies: the Classic Record floor is
// * kinematicVelocityBased.
function isCartGrounded(cart) {
  if (!getWorld() || !RAPIER || !cart?.body) return true; // no physics yet — don't eat input
  const p = cart.body.translation();
  if (!_hopGroundRay) _hopGroundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  _hopGroundRay.origin.x = p.x;
  _hopGroundRay.origin.y = p.y;
  _hopGroundRay.origin.z = p.z;
  const maxToi = CONFIG.cart.size.y / 2 + 0.55; // resting clearance + slope/seam tolerance
  const hit = getWorld().castRay(
    _hopGroundRay,
    maxToi,
    true,
    undefined,
    undefined,
    // * Pass the Collider / RigidBody OBJECTS — Rapier's castRay reads `.handle` off
    // * them internally (`filterExcludeCollider ? filterExcludeCollider.handle : null`).
    // * Passing raw handle numbers makes the exclusion inert ((number).handle is
    // * undefined), so with solid=true the ray hits the cart's OWN collider at toi 0
    // * and this returns true unconditionally — defeating the anti-air-hop gate.
    cart.collider ?? undefined,
    cart.body ?? undefined,
  );
  return hit != null;
}

function attemptLocalHop() {
  const cart = localCartForConnId();
  if (!cart?.body) return;
  const p = cart.body.translation();
  if (p.y > (CONFIG.booth?.platformY ?? 6) - 0.5) return; // still on the spawn booth
  if (!isCartGrounded(cart)) return; // mid-air — no air-hops / chain-hops
  triggerHop(cart, performance.now());
  Input.requestHop();
}

function triggerHop(cart, nowMs) {
  if (!cart?.body) return;
  if (nowMs - cart.lastHopAtMs < CONFIG.cart.hop.cooldownMs) return;
  cart.lastHopAtMs = nowMs;
  // * Arm one-shot landing feedback (rising-edge floor contact in simulation).
  cart.hopAwaitingLand = true;
  cart.hopAirborne = false;
  cart.body.applyImpulse({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
  if (cart === localCartForConnId()) {
    AudioManager.playSfx("hop");
  } else {
    // * Remote humans and NPCs hop audibly too (covers host-side sim hops AND the
    // * non-host snap.h replay, which routes through this same function).
    AudioManager.playSfx("hop", undefined, { volume: 0.45 });
  }
}

/**
 * Hop landing thud + light dust. Fired once per hop on rising-edge floor contact
 * (simulation sets hopAwaitingLand / hopAirborne). Distinct from takeoff "hop" SFX.
 *
 * @param {ReturnType<typeof createCart>} cart
 * @param {number} intensity 0–1-ish from fall speed
 */
function onHopLand(cart, intensity) {
  if (!cart) return;
  const i = Math.max(0, Math.min(1, Number(intensity) || 0.3));
  const isLocal = cart === localCartForConnId();
  if (isLocal) {
    // * Floor sample as a softer/lower "thud" so it reads differently from takeoff hop.
    AudioManager.playSfx("floor", undefined, {
      volume: 0.5 + i * 0.4,
      rate: 0.78 + Math.random() * 0.08,
    });
    hapticPulse(0.18, 0.35, 28);
  } else {
    // * Remote / NPC: attenuated like boost so the field stays readable without spam.
    AudioManager.playSfx("floor", undefined, {
      volume: 0.22 + i * 0.12,
      rate: 0.82,
    });
  }
  // * Light dust — reuse floor trash profile at low intensity (cheap pool particles).
  if (getSpawnTrashBurstRef() && cart.body && GameState.getRoundState().phase === "running") {
    const p = cart.body.translation();
    getSpawnTrashBurstRef()(
      { x: p.x, y: p.y - 0.35, z: p.z },
      Math.min(0.42, 0.18 + i * 0.35),
      "floor",
    );
  }
}

function npcBoostCooldownMs() {
  const rb = CONFIG.cart.ramBoost;
  return GameState.getRoundState()?.isSuddenDeath ? rb.cooldownSec * 500 : rb.cooldownSec * 1000;
}

/**
 * Returns a conservative target point for the dangerous opening of an NPC boost.
 * The cart keeps steering after this point, but six metres was too short to stop an
 * escape/recovery boost from entering a death rim before the AI could turn back.
 */
function npcBoostRunwayEndpoint(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return null;
  // * About 0.7 s at boosted top speed: long enough to cover the launch danger,
  // * short enough that an inward attack on the 26.4 m Classic floor remains valid.
  const runwayM = Math.max(12, Math.min(20, CONFIG.cart.ramBoost.boostedMaxSpeed * 0.7));
  const runDistance = Math.max(distance, runwayM);
  return {
    x: from.x + (dx / distance) * runDistance,
    z: from.z + (dz / distance) * runDistance,
  };
}

function npcBoostPathIsUnsafe(from, to) {
  const runwayEnd = npcBoostRunwayEndpoint(from, to);
  if (!runwayEnd) return true;
  if (Simulation.findBlockingSquareHole(from.x, from.z, runwayEnd.x, runwayEnd.z, 0.6)) return true;

  if (CONFIG.record.centerHole?.enabled !== false) {
    const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
    const minClear = holeLip + 1.5;
    const abX = runwayEnd.x - from.x;
    const abZ = runwayEnd.z - from.z;
    const abLenSq = abX * abX + abZ * abZ;
    if (abLenSq > 1e-8) {
      const t = clamp((-from.x * abX - from.z * abZ) / abLenSq, 0, 1);
      if (Math.hypot(from.x + t * abX, from.z + t * abZ) < minClear) return true;
    } else if (Math.hypot(from.x, from.z) < minClear) {
      return true;
    }
  }

  return Boolean(
    Simulation.boostSegmentExitsClassicDisc?.(from.x, from.z, runwayEnd.x, runwayEnd.z, 1.25)
    || Simulation.boostSegmentExitsOctagon?.(from.x, from.z, runwayEnd.x, runwayEnd.z, 1.25),
  );
}

function npcAimAngleDeg(npc, targetPos) {
  const p = npc.body.translation();
  const yaw = Simulation.yawFromQuaternion(npc.body.rotation());
  Simulation.setForwardRightFromYaw(yaw, ramBoostForwardXZ, ramBoostRightXZ);
  ramBoostToTargetXZ.set(targetPos.x - p.x, 0, targetPos.z - p.z);
  if (ramBoostToTargetXZ.lengthSq() < 1e-8 || ramBoostForwardXZ.lengthSq() < 1e-8) return Infinity;
  ramBoostToTargetXZ.normalize();
  ramBoostForwardXZ.normalize();
  return Math.acos(clamp(ramBoostForwardXZ.dot(ramBoostToTargetXZ), -1, 1)) * (180 / Math.PI);
}

function canContinueNpcChargedAttack(npc) {
  const targetIndex = npc.npcBoostChargeTargetSlotIndex;
  const target = Number.isInteger(targetIndex) ? allCarts[targetIndex] : null;
  if (!target?.body || target.respawnAtMs != null || target.isSuddenDeathSpectator) return false;
  const p = npc.body.translation();
  const op = target.body.translation();
  const dist = Math.hypot(op.x - p.x, op.z - p.z);
  const ncfg = CONFIG.cart.ramBoost.npc;
  if (
    op.y < CONFIG.fall.yThreshold
    || dist < ncfg.minTargetDistance
    || dist > ncfg.maxTargetDistance
  ) return false;
  if (Simulation.getEdgeVictimBias(p.x, p.z) >= (ncfg.finisherEdgeBiasMin ?? 0.35)) return false;
  return !npcBoostPathIsUnsafe(p, op);
}

/**
 * @param {number} nowMs
 * @param {ReturnType<typeof createCart>} npc
 */
function maybeTriggerNpcOpportunisticRamBoost(nowMs, npc) {
  const rb = CONFIG.cart.ramBoost;
  const ncfg = rb.npc;
  if (!rb.enabled || !ncfg.enabled || !npc?.body) return;
  if (npc.respawnAtMs != null || npc.isSuddenDeathSpectator || npc.isChargingBoost) return;
  if (nowMs <= npc.ramBoostActiveUntilMs || nowMs - npc.lastRamBoostTimeMs < npcBoostCooldownMs()) return;

  const p = npc.body.translation();
  const driveIntent = npc.aiDriveIntent;
  if (
    (driveIntent === "escape" || driveIntent === "recover")
    && p.y <= CONFIG.booth.platformY - 0.5
  ) {
    const direction = npc.aiBoostDirection;
    const aimLimit = Math.max(
      12,
      getBoostAlignmentAngleDeg(ncfg.alignmentAngleDeg ?? 40, getActiveAiDifficulty()),
    );
    if (
      direction
      && !npcBoostPathIsUnsafe(p, direction)
      && npcAimAngleDeg(npc, direction) <= aimLimit
    ) {
      triggerRamBoost(npc, nowMs, { instant: true });
    }
    return;
  }

  const netSlots = Netcode.getNetSlots();
  let nearestTarget = null;
  let nearestTargetIndex = -1;
  let nearestD2 = Infinity;
  let nearestIsHuman = false;
  for (let i = 0; i < allCarts.length; i += 1) {
    const o = allCarts[i];
    if (o === npc || !o?.body || o.respawnAtMs != null || o.isSuddenDeathSpectator) continue;
    const op = o.body.translation();
    if (op.y < CONFIG.fall.yThreshold) continue;
    const d2 = (op.x - p.x) ** 2 + (op.z - p.z) ** 2;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearestTarget = o;
      nearestTargetIndex = i;
      const slot = netSlots?.[i];
      nearestIsHuman = slot?.kind === "human" && !!slot?.connId;
    }
  }
  if (!nearestTarget) return;

  const op = nearestTarget.body.translation();
  const dist = Math.sqrt(nearestD2);
  if (dist < ncfg.minTargetDistance || dist > ncfg.maxTargetDistance || npcBoostPathIsUnsafe(p, op)) return;

  let aimSlackDeg = 0;
  if (!nearestIsHuman) {
    if (Math.random() >= (npc.aiPersonality?.npcRamCommitChance ?? 0.25)) return;
  } else if (Netcode.detectGameMode() === "solo") {
    const solo = Simulation.getSoloRubberbandFactors(netSlots);
    aimSlackDeg = solo.aimSlackDeg;
    const commit = resolveNpcHumanBoostCommit({
      nitroMul: solo.nitroMul,
      edgeBias: Simulation.getEdgeVictimBias(op.x, op.z),
      botEdgeBias: Simulation.getEdgeVictimBias(p.x, p.z),
      dist,
      difficulty: getActiveAiDifficulty(),
      cfg: ncfg,
    }).commit;
    if (commit <= 0 || Math.random() >= commit) return;
  }

  const angleDeg = npcAimAngleDeg(npc, op);
  const aimLimit = Math.max(
    12,
    getBoostAlignmentAngleDeg(ncfg.alignmentAngleDeg ?? 40, getActiveAiDifficulty()) + aimSlackDeg,
  );
  if (angleDeg > aimLimit) return;

  const isChargedAttack = resolveNpcBoostMode(dist, angleDeg, getActiveAiDifficulty()) === "charge";
  npc.aiDriveIntent = isChargedAttack ? "attack" : "chase";

  if (isChargedAttack) {
    triggerRamBoost(npc, nowMs);
    if (npc.isChargingBoost) npc.npcBoostChargeTargetSlotIndex = nearestTargetIndex;
    return;
  }
  triggerRamBoost(npc, nowMs, { instant: true });
}

/**
 * Host-only rare NPC hop: dodge an approaching rammer, or juke near a void edge.
 * Mirrors maybeTriggerNpcOpportunisticRamBoost safety (no hop-suicide into holes).
 *
 * @param {number} nowMs
 * @param {ReturnType<typeof createCart>} npc
 */
function maybeTriggerNpcOpportunisticHop(nowMs, npc) {
  const hopCfg = CONFIG.cart.hop;
  const ncfg = hopCfg?.npc;
  if (!hopCfg || !ncfg?.enabled) return;
  if (!npc?.body || npc.respawnAtMs != null || npc.isSuddenDeathSpectator) return;
  if (GameState.getRoundState().phase !== "running") return;

  const cooldownMs = ncfg.cooldownMs ?? hopCfg.cooldownMs * 5;
  if (nowMs - (npc.lastHopAtMs || 0) < cooldownMs) return;

  const p = npc.body.translation();
  const lv = npc.body.linvel();
  const fallYThreshold = CONFIG.fall.yThreshold;
  // * Grounded-ish only — never hop while already falling / mid-air / on booth.
  if (p.y < fallYThreshold + 3) return;
  if (p.y > (CONFIG.booth?.platformY ?? 6) - 0.5) return;
  if (Math.abs(lv.y) > 2.2) return;

  // * Near-hazard band (edge-save). Reuse the same keep-outs as nitro / reverse gates.
  let nearHazard = false;
  const edgeProx = ncfg.edgeProximityM ?? 3.2;
  nearHazard = Simulation.isNpcNearHazardEdge(p.x, p.z, edgeProx);
  // * Classic outer rim (not in hazard helper — only center hole / level voids).
  if (!nearHazard && CONFIG.record?.radius != null) {
    const outer = CONFIG.record.radius - edgeProx;
    if (Math.hypot(p.x, p.z) > outer) nearHazard = true;
  }

  // * Don't hop when the forward path already crosses a square void (Backrooms).
  // * Pure-Y hop won't change XZ, but airborne carts steer less and can coast in.
  const yaw = Simulation.yawFromQuaternion(npc.body.rotation());
  Simulation.setForwardRightFromYaw(yaw, ramBoostForwardXZ, ramBoostRightXZ);
  if (ramBoostForwardXZ.lengthSq() > 1e-8) {
    ramBoostForwardXZ.normalize();
    const lookX = p.x + ramBoostForwardXZ.x * 4;
    const lookZ = p.z + ramBoostForwardXZ.z * 4;
    if (Simulation.findBlockingSquareHole(p.x, p.z, lookX, lookZ, 0.35)) {
      return;
    }
  }

  const netSlots = Netcode.getNetSlots();
  const minD = ncfg.minThreatDistance ?? 2.4;
  const maxD = ncfg.maxThreatDistance ?? 7.5;
  const minD2 = minD * minD;
  const maxD2 = maxD * maxD;
  const alignMin = getHopAlignmentDotMin(ncfg.alignmentDotMin ?? 0.35, getActiveAiDifficulty());
  const minThreatSpeed = ncfg.minThreatSpeed ?? 6;
  const hard = isHardTactics(getActiveAiDifficulty());

  let threatened = false;
  for (let i = 0; i < allCarts.length; i += 1) {
    const o = allCarts[i];
    if (o === npc || !o?.body || o.respawnAtMs != null || o.isSuddenDeathSpectator) continue;
    const op = o.body.translation();
    if (op.y < fallYThreshold) continue;
    const dx = p.x - op.x;
    const dz = p.z - op.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD2 || d2 > maxD2) continue;
    const ov = o.body.linvel();
    const spd = Math.hypot(ov.x, ov.z);
    // * Hard: defensive hop vs boosting closer — lower speed gate when they are boosting.
    const boosting = hard && nowMs <= (o.ramBoostActiveUntilMs || 0);
    const speedGate = boosting ? Math.min(minThreatSpeed, 3.5) : minThreatSpeed;
    if (spd < speedGate) continue;
    // * Threat velocity points roughly toward us.
    const invDist = 1 / Math.sqrt(d2);
    const toNpcX = dx * invDist;
    const toNpcZ = dz * invDist;
    const vLen = spd || 1;
    const vDot = (ov.x / vLen) * toNpcX + (ov.z / vLen) * toNpcZ;
    if (vDot < alignMin) continue;
    threatened = true;
    break;
  }

  if (!threatened) return;

  const baseChance = ncfg.chance ?? 0.11;
  const edgeChance = getEdgeSaveHopChance(ncfg.edgeSaveChance ?? 0.18, getActiveAiDifficulty());
  const roll = Math.random();
  if (roll >= (nearHazard ? edgeChance : baseChance)) return;

  triggerHop(npc, nowMs);
}

  return {
    triggerImpactPulse,
    armFovPunch,
    triggerLocalRamShake,
    triggerLocalHitTaken,
    pulseLocalHitDirectionVignette,
    _playerAccentFromHud,
    squashCartsOnImpact,
    onLocalKoConfirm,
    onLocalKillConfirm,
    onLocalDoomed,
    onArenaKoFlash,
    triggerSpillNetcode,
    presentSpillBonusAward,
    startNpcChargeSfx,
    stopChargeSfxForCart,
    stopAllChargeSfx,
    scheduleRespawn,
    scheduleStuckRespawn,
    makeNameLabel,
    updateNameLabels,
    positionNameLabels,
    bootstrapSessionCarts,
    destroySessionCarts,
    getAiAxis,
    triggerRamBoost,
    onBoostRelease,
    onBoostCancel,
    isCartGrounded,
    attemptLocalHop,
    triggerHop,
    onHopLand,
    maybeTriggerNpcOpportunisticRamBoost,
    maybeTriggerNpcOpportunisticHop,
    localCartForConnId,
    teleportCartToSpawn,
    updateCartMaterialsFromSlots,
    updateHudColorsFromSlots,
    setSlotsWarmupCtx,
    // Juice state accessors (visualDeps / game loop)
    getShakeUntil: () => shakeUntil,
    getShakeIntensity: () => shakeIntensity,
    getFovPunchUntil: () => fovPunchUntil,
    getFovPunchDeg: () => fovPunchDeg,
    getKillFlash: () => killFlash,
    getImpactPulse: () => impactPulse,
    getHitStop: () => hitStop,
    getAllCarts: () => allCarts,
    getNameLabels: () => nameLabels,
  };
}
