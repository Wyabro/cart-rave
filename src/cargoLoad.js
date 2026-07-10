/**
 * cargoLoad.js — Living Cargo: the cart IS the scoreboard.
 *
 * Per-frame reconciliation between the synced round scores and each cart's visual
 * cargo bay + handling state. Called from frameVisuals right after GroceryPool.update.
 *
 * Responsibilities:
 *   - cargoFullness01  — maps roundScores[slot] onto [0,1] (CONFIG.cargo.fullScore);
 *     consumed by the top-heavy grip scale in simulation.js and spill-count scaling.
 *   - Bay fill         — GroceryPool.setCargoFill reveals groceries as the score climbs,
 *     so the standings read off the field (the leader is a fat, obvious target).
 *   - Restock          — after a surviving ram-spill, the bay visually restocks once the
 *     spill-comeback buff lapses (fall spills restock via the existing respawn path).
 *   - Announcer        — "cart_overflow" when a cart first fills up; "spill_rush" nudges
 *     the local player when their comeback buff kicks in.
 *   - CoM experiment   — taste-gated (CONFIG.cargo.comRaise.enabled, off by default):
 *     re-applies cart mass properties with a fullness-raised center of mass.
 *
 * Scores are host-authoritative and already broadcast, so every client derives identical
 * fullness with zero extra netcode.
 */

import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { gameStore } from "./stores/gameStore.js";
import { announce } from "./announcer/announcerManager.js";
import { applyCartMassPropertiesOverride } from "./simulation.js";

/** Round start timestamp last seen — resets the per-round announce trackers. */
let _lastRoundStartedAtMs = 0;

/** Slots whose "cart_overflow" moment already fired this round. */
const _overflowAnnounced = new Set();

/** Local spill-boost deadline last seen — rising edge triggers "spill_rush". */
let _lastLocalSpillBoostUntilMs = 0;

/** @type {Array<object | null | undefined> | null} Latest carts for the DEV debug handle. */
let _debugCarts = null;

/**
 * Arms the "empty cart is a fast cart" comeback window at the spill moment — read by
 * the drive block in simulation.js. Single source for all three spill paths (host sim,
 * gameFlow fall, and the client's MSG.spill receive in netcode.js). Deliberately NOT
 * cleared by resetCartTransientState: a fall spill keeps the tail of the buff after
 * the 600ms respawn (the comeback moment).
 * @param {object | null | undefined} cart
 */
export function armSpillBoost(cart) {
  if (!cart || !CONFIG.cargo?.spillBoost) return;
  cart.spillBoostUntilMs = performance.now() + (CONFIG.cargo.spillBoost.durationMs ?? 0);
}

/**
 * Living Cargo — a fuller cart (higher score) drops a bigger mess.
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
 * * Taste-gated CoM raise — re-applies mass properties when fullness moved enough to
 * * matter. Uses the same collider dims formula as entities.createCartCollider.
 * @param {object} cart
 * @param {number} fullness
 */
function maybeApplyComRaise(cart, fullness) {
  const comCfg = CONFIG.cargo?.comRaise;
  if (!comCfg?.enabled || !cart.body || !cart.collider) return;

  const applied = cart._cargoComFullnessApplied ?? 0;
  if (Math.abs(fullness - applied) < 0.12) return;
  cart._cargoComFullnessApplied = fullness;

  const hx = CONFIG.cart.size.x / 2;
  const hy = CONFIG.cart.size.y / 2 - CONFIG.cart.collider.hyReduction;
  const hz = CONFIG.cart.size.z / 2;
  applyCartMassPropertiesOverride(cart.body, cart.collider, {
    hx,
    hy,
    hz,
    colliderLocalY: CONFIG.cart.collider.localYOffset,
    comY: -0.55 + (comCfg.maxRaiseY ?? 0) * fullness,
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

  const scores = state.roundScores;
  const running = ctx.roundPhase === "running";
  const fullScore = Math.max(1, cargoCfg.fullScore ?? 8);

  for (const cart of allCarts) {
    if (!cart) continue;

    const fullness = clamp((scores?.[cart.slotIndex] ?? 0) / fullScore, 0, 1);
    cart.cargoFullness01 = fullness;

    const bay = cart.cargoBay;
    if (bay) {
      GroceryPool.setCargoFill(bay, fullness);

      // * Restock after a surviving ram-spill: the bay stays visually empty for the
      // * spill-comeback window ("you're fast because you're empty"), then restocks to
      // * the score level. Fall spills skip this — respawn already restores the bay.
      const restockAtMs =
        (cart.spillBoostUntilMs ?? 0) + (cargoCfg.spillBoost?.restockDelayMs ?? 0);
      if (
        !bay.visible &&
        cart.hasSpilled &&
        cart.respawnAtMs == null &&
        !cart.isShattering &&
        nowMs > restockAtMs
      ) {
        bay.visible = true;
      }
    }

    maybeApplyComRaise(cart, fullness);

    // * "CART OVERFLOW" — first time a cart fills up this round. Announcer arbitration
    // * (cooldown/maxPerRound) still applies on top of the per-slot once guard.
    if (running && fullness >= 1 && !_overflowAnnounced.has(cart.slotIndex)) {
      _overflowAnnounced.add(cart.slotIndex);
      const name = ctx.netSlots?.[cart.slotIndex]?.name ?? cart.label ?? "SOMEONE";
      announce("cart_overflow", { name });
    }
  }

  // * DEV-only observability — lets the console (and tuning sessions) read live cargo
  // * state without exposing carts in production: window.__cartClashCargo().
  // * The module-level ref is updated each frame (no per-frame closure allocation);
  // * the window function is defined once and reads the ref, so it never goes stale
  // * across level swaps.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    _debugCarts = allCarts;
    window.__cartClashCargo ??= () =>
      (_debugCarts ?? []).map((c) =>
        c
          ? {
              slot: c.slotIndex,
              label: c.label,
              fullness: c.cargoFullness01,
              fillCount: c.cargoBay?.userData?.cargoFillCount ?? null,
              bayVisible: c.cargoBay?.visible ?? null,
              spillBoostMsLeft: Math.max(0, (c.spillBoostUntilMs ?? 0) - performance.now()),
              hasSpilled: c.hasSpilled,
            }
          : null,
      );
  }

  // * "FRESH START" — rising edge of the local player's spill-comeback buff.
  const localCart = allCarts[ctx.localSlotIndex];
  const localBoostUntil = localCart?.spillBoostUntilMs ?? 0;
  if (running && localBoostUntil > _lastLocalSpillBoostUntilMs) {
    _lastLocalSpillBoostUntilMs = localBoostUntil;
    if (nowMs < localBoostUntil) {
      announce("spill_rush");
    }
  }
}
