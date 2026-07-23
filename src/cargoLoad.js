/**
 * cargoLoad.js — Living Cargo: life-scoped weight (CARGO-WT-1).
 *
 * Per-frame reconciliation between each cart's lifeCargoPoints and visual bay +
 * handling state. Called from frameVisuals right after GroceryPool.update.
 *
 * Responsibilities:
 *   - cargoFullness01  — weight01 from lifeCargoPoints / fullScore (0 stripped → 1 boss);
 *     consumed by grip / drive / ram-incoming / spill-count in simulation.js.
 *   - Bay fill         — GroceryPool.setCargoFillCount via lifeCargoVisibleCount;
 *     bay hidden while stripped (0 → empty, baseline → baseItems, full → maxItems).
 *   - Life cargo API   — grantLifeCargo / stripLifeCargo / clearCargoOverflowForSlot;
 *     host awards on KO/SD/SpillBonus; spill strips; respawn resets via entities.
 *   - Announcer        — "cart_overflow" first boss fill this life; "spill_rush" on strip.
 *   - Mass sync        — soft massMul (+ optional comRaise) via applyCartMassPropertiesOverride.
 *
 * Round scores still win the match on the HUD — they do NOT drive cart weight.
 * Life cargo rides the host snapshot cart padding byte (`lc`).
 */

import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { gameStore } from "./stores/gameStore.js";
import { announce } from "./announcer/announcerManager.js";
import { applyCartMassPropertiesOverride } from "./simulation.js";

/** Round start timestamp last seen — resets the per-round announce trackers. */
let _lastRoundStartedAtMs = 0;

/** Slots whose "cart_overflow" moment already fired this life. */
const _overflowAnnounced = new Set();

/** Local spill-boost deadline last seen — rising edge triggers "spill_rush". */
let _lastLocalSpillBoostUntilMs = 0;

/** @type {Array<object | null | undefined> | null} Latest carts for the DEV debug handle. */
let _debugCarts = null;

/**
 * Spawn/respawn stocked life-cargo points (today's handling anchor).
 * @returns {number}
 */
export function baselineLifeCargoPoints() {
  const full = Math.max(1, CONFIG.cargo?.fullScore ?? 8);
  const baseline = CONFIG.cargo?.baselinePoints ?? 3;
  return clamp(baseline, 0, full);
}

/**
 * Arms the spill VFX / spill_rush announce window. Drive surge comes from the
 * stripped weight curve (spillBoost speed/accel muls stay 1.0).
 * @param {object | null | undefined} cart
 */
export function armSpillBoost(cart) {
  if (!cart || !CONFIG.cargo?.spillBoost) return;
  cart.spillBoostUntilMs = performance.now() + (CONFIG.cargo.spillBoost.durationMs ?? 0);
}

/**
 * Strip life cargo to glass/fast (survive spill). Host + remote spill paths.
 * @param {object | null | undefined} cart
 */
export function stripLifeCargo(cart) {
  if (!cart) return;
  cart.lifeCargoPoints = 0;
}

/**
 * Host: add points to this life's cargo (KO / SD award / Spill Bonus). Caps at fullScore.
 * @param {object | null | undefined} cart
 * @param {number} points
 */
export function grantLifeCargo(cart, points) {
  if (!cart || !(points > 0)) return;
  const full = Math.max(1, CONFIG.cargo?.fullScore ?? 8);
  const cur = Number(cart.lifeCargoPoints);
  const base = Number.isFinite(cur) ? cur : baselineLifeCargoPoints();
  cart.lifeCargoPoints = clamp(base + points, 0, full);
}

/**
 * Host helper: grant by slot index against an allCarts array.
 * @param {Array<object | null | undefined> | null | undefined} allCarts
 * @param {number} slotIndex
 * @param {number} points
 */
export function grantLifeCargoForSlot(allCarts, slotIndex, points) {
  if (!Array.isArray(allCarts) || !(points > 0)) return;
  const cart = allCarts[slotIndex];
  if (!cart) return;
  grantLifeCargo(cart, points);
}

/**
 * Clears the once-per-life overflow announce bit (call on respawn).
 * @param {number} slotIndex
 */
export function clearCargoOverflowForSlot(slotIndex) {
  if (typeof slotIndex !== "number" || !Number.isFinite(slotIndex)) return;
  _overflowAnnounced.delete(slotIndex);
}

/**
 * Visible grocery count for life cargo — readable empty → stocked → overflow.
 * stripped (0) → 0; baseline → baseItems; full → maxItems.
 * @param {number} lifeCargoPoints
 * @returns {number}
 */
export function lifeCargoVisibleCount(lifeCargoPoints) {
  const cargoCfg = CONFIG.cargo;
  const full = Math.max(1, cargoCfg?.fullScore ?? 8);
  const baseline = baselineLifeCargoPoints();
  const base = Math.max(0, cargoCfg?.baseItems ?? 7);
  const max = Math.max(base, cargoCfg?.maxItems ?? 18);
  const life = clamp(Number(lifeCargoPoints) || 0, 0, full);
  if (life <= 0) return 0;
  if (life >= full) return max;
  if (life <= baseline) {
    // * Ramp from a few groceries up to the stocked baseline look.
    const t = life / Math.max(1e-6, baseline);
    return Math.max(1, Math.round(1 + (base - 1) * t));
  }
  const t = (life - baseline) / Math.max(1e-6, full - baseline);
  return Math.round(base + (max - base) * t);
}

/**
 * Living Cargo — fuller (boss) carts drop a bigger mess.
 * @param {object | null | undefined} cart
 * @returns {number} Grocery count for this cart's spill.
 */
export function spillCountForCart(cart) {
  const cargoCfg = CONFIG.cargo;
  if (!cargoCfg) return 6;
  const base = cargoCfg.spillCountBase ?? 6;
  const max = cargoCfg.spillCountMax ?? base;
  return Math.round(base + (max - base) * (cart?.cargoFullness01 ?? 0));
}

/**
 * Piecewise curve: weight01 0 → strippedVal, baselineWeight → 1.0, 1 → bossVal.
 * @param {number} weight01
 * @param {number} strippedVal
 * @param {number} bossVal
 * @returns {number}
 */
export function cargoCurveMul(weight01, strippedVal, bossVal) {
  const w = clamp(weight01, 0, 1);
  const full = Math.max(1, CONFIG.cargo?.fullScore ?? 8);
  const baselineW = clamp(baselineLifeCargoPoints() / full, 0, 1);
  const stripped = Number.isFinite(strippedVal) ? strippedVal : 1;
  const boss = Number.isFinite(bossVal) ? bossVal : 1;
  if (baselineW <= 1e-6) {
    return stripped + (boss - stripped) * w;
  }
  if (w <= baselineW) {
    const t = w / baselineW;
    return stripped + (1 - stripped) * t;
  }
  const t = (w - baselineW) / Math.max(1e-6, 1 - baselineW);
  return 1 + (boss - 1) * t;
}

/**
 * Soft mass multiplier for life-cargo weight.
 * @param {number} weight01
 * @returns {number}
 */
function cargoMassMul(weight01) {
  const cfg = CONFIG.cargo;
  return cargoCurveMul(weight01, cfg?.massAtStripped ?? 1, cfg?.massAtBoss ?? 1);
}

/**
 * * Re-applies mass properties when weight moved enough. Uses the same collider dims
 * * formula as entities.createCartCollider. massMul always; comRaise still gated.
 * @param {object} cart
 * @param {number} weight01
 */
function maybeApplyCargoMassProps(cart, weight01) {
  if (!cart.body || !cart.collider) return;

  const comCfg = CONFIG.cargo?.comRaise;
  const massMul = cargoMassMul(weight01);
  const applied = cart._cargoWeightApplied ?? -1;
  if (Math.abs(weight01 - applied) < 0.12) return;
  cart._cargoWeightApplied = weight01;

  if (cart._cargoBaseMass == null || !(cart._cargoBaseMass > 0)) {
    const m = cart.body.mass?.() ?? 1;
    cart._cargoBaseMass = Number.isFinite(m) && m > 0 ? m : 1;
  }

  const hx = CONFIG.cart.size.x / 2;
  const hy = CONFIG.cart.size.y / 2 - CONFIG.cart.collider.hyReduction;
  const hz = CONFIG.cart.size.z / 2;
  const comY =
    comCfg?.enabled
      ? -0.55 + (comCfg.maxRaiseY ?? 0) * weight01
      : -0.55;
  applyCartMassPropertiesOverride(cart.body, cart.collider, {
    hx,
    hy,
    hz,
    colliderLocalY: CONFIG.cart.collider.localYOffset,
    comY,
    massMul,
    baseMass: cart._cargoBaseMass,
  });
}

/**
 * Per-frame Living Cargo sync. Cheap: 4 carts, integer-compare visibility writes.
 *
 * @param {Array<object | null | undefined>} allCarts Slot carts (entities.createCart).
 * @param {number} nowMs performance.now() timestamp for this frame.
 * @param {{
 *   localSlotIndex: number,
 *   netSlots: Array<{ name?: string } | null | undefined>,
 *   roundPhase: string,
 * }} ctx Frame context from frameVisuals.
 */
export function updateCargoLoad(allCarts, nowMs, ctx) {
  const cargoCfg = CONFIG.cargo;
  if (!cargoCfg || !Array.isArray(allCarts)) return;

  const state = gameStore.getState();

  // * New round — reset the per-round announce trackers.
  if (state.roundStartedAtMs !== _lastRoundStartedAtMs) {
    _lastRoundStartedAtMs = state.roundStartedAtMs;
    _overflowAnnounced.clear();
    _lastLocalSpillBoostUntilMs = 0;
  }

  const running = ctx.roundPhase === "running";
  const fullScore = Math.max(1, cargoCfg.fullScore ?? 8);
  const baseline = baselineLifeCargoPoints();

  for (const cart of allCarts) {
    if (!cart) continue;

    let life = Number(cart.lifeCargoPoints);
    if (!Number.isFinite(life)) {
      life = baseline;
      cart.lifeCargoPoints = life;
    }
    life = clamp(life, 0, fullScore);
    cart.lifeCargoPoints = life;

    const weight01 = clamp(life / fullScore, 0, 1);
    cart.cargoFullness01 = weight01;

    const bay = cart.cargoBay;
    if (bay) {
      const fillCount = lifeCargoVisibleCount(life);
      if (life <= 0) {
        if (bay.visible) bay.visible = false;
        GroceryPool.setCargoFillCount(bay, 0);
      } else if (!cart.isShattering && cart.respawnAtMs == null) {
        if (!bay.visible) bay.visible = true;
        GroceryPool.setCargoFillCount(bay, fillCount);
      }
    }

    maybeApplyCargoMassProps(cart, weight01);

    // * "CART OVERFLOW" — first time this life the cart hits boss fill.
    if (running && weight01 >= 1 && !_overflowAnnounced.has(cart.slotIndex)) {
      _overflowAnnounced.add(cart.slotIndex);
      const name = ctx.netSlots?.[cart.slotIndex]?.name ?? cart.label ?? "SOMEONE";
      announce("cart_overflow", { name });
    }
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    _debugCarts = allCarts;
    window.__cartClashCargo ??= () =>
      (_debugCarts ?? []).map((c) =>
        c
          ? {
              slot: c.slotIndex,
              label: c.label,
              lifeCargo: c.lifeCargoPoints,
              fullness: c.cargoFullness01,
              fillCount: c.cargoBay?.userData?.cargoFillCount ?? null,
              bayVisible: c.cargoBay?.visible ?? null,
              spillBoostMsLeft: Math.max(0, (c.spillBoostUntilMs ?? 0) - performance.now()),
              hasSpilled: c.hasSpilled,
            }
          : null,
      );
  }

  // * "FRESH START" — rising edge of the local player's spill window.
  const localCart = allCarts[ctx.localSlotIndex];
  const localBoostUntil = localCart?.spillBoostUntilMs ?? 0;
  if (running && localBoostUntil > _lastLocalSpillBoostUntilMs) {
    _lastLocalSpillBoostUntilMs = localBoostUntil;
    if (nowMs < localBoostUntil) {
      announce("spill_rush");
    }
  }
}
