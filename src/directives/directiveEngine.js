/**
 * directiveEngine.js — "The Living Store": the Store PA as game-master.
 *
 * The host periodically fires a directive from the DIRECTIVES table — a short, loud
 * mini-mutator (Flash Sale, Double Bag, Express Lane, Spill Bonus) that re-flavors the
 * next ~18 seconds, then restores the base rules. Modeled on the codebase's
 * frozen-table + pure-consumer convention.
 *
 * Authority & sync:
 *   - The HOST owns scheduling and picks directives. On fire it broadcasts a one-shot
 *     MSG.directive over the DataChannel (same pattern as MSG.spill); every peer applies
 *     the identical CONFIG overrides locally and self-expires on its own clock.
 *   - KO reward boosts (koRewardMul) apply host-side in buildKOEvent via an injected
 *     dep; the falls[] wire already carries the boosted reward to clients, so scoring
 *     display agrees even at window edges.
 *   - Spill Bonus points are host-only awards through the same addScore path as KOs.
 *   - Host migration: engine state is local; a new host simply starts a fresh schedule.
 *     Directives are ≤20s, so at worst one window is cut short.
 *
 * Safety rails:
 *   - Directives never fire during Sudden Death (an addScore there would end the round);
 *     entering SD or leaving the running phase restores overrides immediately.
 *   - No new directive starts if the round clock can't fit the window plus a beat.
 *   - One directive active at a time; back-to-back repeats are avoided.
 */

import { CONFIG, MSG } from "../config.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { ANNOUNCER_EVENTS } from "../announcer/announcerEvents.js";
import { DIRECTIVES } from "./directives.js";

/**
 * @typedef {object} DirectiveEngineDeps
 * @property {() => boolean} getIsHost
 * @property {(payload: object) => void} sendP2PEvent
 * @property {(eventId: string, data?: object) => void} announce
 * @property {(slotIndex: number, points: number) => void} addScore Host-authoritative score path.
 * @property {() => Map<number, { attackerSlotIndex: number, timestamp: number }>} getLastHitBy
 */

/** @type {DirectiveEngineDeps | null} */
let deps = null;

/** @type {{ def: import("./directives.js").DirectiveDef, startedAtMs: number, untilMs: number } | null} */
let active = null;

/** @type {Array<{ obj: object, key: string, old: number }>} Saved values for restore. */
let savedValues = [];

/** performance.now() deadline for the next host fire (0 = derive on next running tick). */
let nextFireAtMs = 0;

/** Avoid firing the same directive twice in a row. */
let lastDirectiveId = null;

/** Round start timestamp last seen — resets the schedule per round. */
let _lastRoundStartedAtMs = 0;

/**
 * @param {DirectiveEngineDeps} d
 */
export function initDirectiveEngine(d) {
  deps = d;
}

/**
 * Resolves a dot-path into CONFIG to its parent object + final key.
 * @param {string} path
 * @returns {{ obj: object, key: string } | null}
 */
function resolveConfigTarget(path) {
  const parts = path.split(".");
  let obj = /** @type {any} */ (CONFIG);
  for (let i = 0; i < parts.length - 1; i += 1) {
    obj = obj?.[parts[i]];
    if (obj == null || typeof obj !== "object") return null;
  }
  const key = parts[parts.length - 1];
  if (typeof obj[key] !== "number") return null;
  return { obj, key };
}

/**
 * Applies a directive's overrides and marks it active until `untilMs`.
 * @param {import("./directives.js").DirectiveDef} def
 * @param {number} nowMs performance.now()
 * @param {number} durationMs
 */
function applyDirective(def, nowMs, durationMs) {
  if (active) restoreActive({ silent: true });

  savedValues = [];
  for (const ov of def.overrides ?? []) {
    const target = resolveConfigTarget(ov.path);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn(`[directives] Bad override path "${ov.path}" in ${def.id} — skipped.`);
      continue;
    }
    savedValues.push({ obj: target.obj, key: target.key, old: target.obj[target.key] });
    target.obj[target.key] = target.obj[target.key] * ov.mul;
  }

  active = { def, startedAtMs: nowMs, untilMs: nowMs + durationMs };
  lastDirectiveId = def.id;
  deps?.announce(def.announceEvent, { title: def.title });
}

/**
 * Restores every override of the active directive and clears it.
 * @param {{ silent?: boolean }} [opts] silent — skip the PA end line (round ended, SD).
 */
function restoreActive(opts = {}) {
  if (!active) return;
  for (const s of savedValues) {
    s.obj[s.key] = s.old;
  }
  savedValues = [];
  const endedDef = active.def;
  active = null;
  if (!opts.silent) {
    deps?.announce("directive_end", { title: endedDef.title });
  }
}

/** Weighted random pick from DIRECTIVES, avoiding a back-to-back repeat. */
function pickDirective() {
  const defs = Object.values(DIRECTIVES).filter(
    (d) => d.id !== lastDirectiveId || Object.keys(DIRECTIVES).length === 1,
  );
  let totalWeight = 0;
  for (const d of defs) totalWeight += d.weight ?? 1;
  let roll = Math.random() * totalWeight;
  for (const d of defs) {
    roll -= d.weight ?? 1;
    if (roll <= 0) return d;
  }
  return defs[defs.length - 1] ?? null;
}

/** @returns {number} Random interval between directive windows (ms). */
function randInterval() {
  const cfg = CONFIG.directives;
  const min = cfg?.minIntervalMs ?? 25000;
  const max = Math.max(min, cfg?.maxIntervalMs ?? 40000);
  return min + Math.random() * (max - min);
}

/**
 * Per-frame tick (all peers). Hosts schedule + fire; everyone ticks expiry locally.
 * @param {number} nowMs performance.now()
 */
export function updateDirectiveEngine(nowMs) {
  const cfg = CONFIG.directives;
  if (!cfg?.enabled || !deps) return;

  const state = gameStore.getState();
  const running = state.roundPhase === RoundPhase.RUNNING;

  // * Leaving the running phase or entering Sudden Death restores base rules at once.
  // * (An addScore during SD ends the round instantly — directives stay out of SD.)
  if (!running || state.isSuddenDeath) {
    if (active) restoreActive({ silent: true });
    nextFireAtMs = 0;
    return;
  }

  // * New round — fresh schedule anchored to the first-fire delay.
  if (state.roundStartedAtMs !== _lastRoundStartedAtMs) {
    _lastRoundStartedAtMs = state.roundStartedAtMs;
    if (active) restoreActive({ silent: true });
    nextFireAtMs = 0;
    lastDirectiveId = null;
  }
  if (nextFireAtMs === 0) {
    nextFireAtMs = nowMs + (cfg.firstDelayMs ?? 25000);
  }

  if (active && nowMs >= active.untilMs) {
    restoreActive();
  }

  if (!deps.getIsHost() || active || nowMs < nextFireAtMs) return;

  // * Don't start a window the round clock can't fit (roundStartedAtMs is Date.now-based).
  const durationMs = cfg.durationMs ?? 18000;
  const roundElapsed = Date.now() - state.roundStartedAtMs;
  const roundRemaining = (CONFIG.round?.durationMs ?? 150000) - roundElapsed;
  if (roundRemaining < durationMs + (cfg.minRoundRemainingMs ?? 8000)) {
    nextFireAtMs = Number.POSITIVE_INFINITY; // no more directives this round
    return;
  }

  const def = pickDirective();
  if (!def) return;
  const windowMs = def.durationMs ?? durationMs;
  applyDirective(def, nowMs, windowMs);
  nextFireAtMs = nowMs + windowMs + randInterval();
  deps.sendP2PEvent({ type: MSG.directive, id: def.id, durationMs: windowMs });
}

/**
 * Non-host handler for a host MSG.directive broadcast — applies the same directive
 * locally, anchored to receive time (windows are long; jitter is imperceptible).
 * @param {{ id?: string, durationMs?: number }} msg
 */
export function applyRemoteDirective(msg) {
  if (!CONFIG.directives?.enabled || !deps || deps.getIsHost()) return;
  const def = msg?.id ? DIRECTIVES[msg.id] : null;
  if (!def) return;
  if (active?.def.id === def.id) return;
  const durationMs = typeof msg.durationMs === "number" && msg.durationMs > 0
    ? msg.durationMs
    : (CONFIG.directives.durationMs ?? 18000);
  applyDirective(def, performance.now(), durationMs);
}

/**
 * KO reward multiplier for the active directive (host-side, read by buildKOEvent deps).
 * @returns {number}
 */
export function getDirectiveKoRewardMultiplier() {
  return active?.def.koRewardMul ?? 1;
}

/**
 * Host hook from the spill sites: while Spill Bonus is active, a recent rammer earns
 * points for force-spilling a victim's groceries. Self spills award nothing.
 * @param {number} victimSlotIndex
 */
export function onHostSpill(victimSlotIndex) {
  if (!deps || !deps.getIsHost()) return;
  const points = active?.def.spillBonusPoints ?? 0;
  if (points <= 0) return;

  const state = gameStore.getState();
  if (state.roundPhase !== RoundPhase.RUNNING || state.isSuddenDeath) return;

  const hit = deps.getLastHitBy().get(victimSlotIndex);
  const hitWindowMs = CONFIG.scoring?.hitWindowMs ?? 2500;
  if (!hit || Date.now() - hit.timestamp > hitWindowMs) return;
  if (hit.attackerSlotIndex === victimSlotIndex) return;

  deps.addScore(hit.attackerSlotIndex, points);
}

/**
 * The active directive (or null) — for HUD/debug surfaces. `accent` mirrors the
 * directive's announcer callout color so the HUD chip matches the big callout.
 * @returns {{ id: string, title: string, startedAtMs: number, untilMs: number, accent: string } | null}
 */
export function getActiveDirective() {
  if (!active) return null;
  return {
    id: active.def.id,
    title: active.def.title,
    startedAtMs: active.startedAtMs,
    untilMs: active.untilMs,
    accent: ANNOUNCER_EVENTS[active.def.announceEvent]?.callout?.accent ?? "#22e6ff",
  };
}
