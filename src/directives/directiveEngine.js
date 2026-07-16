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
 * Scheduling: a fixed per-round slot list (CONFIG.directives.fireAtMs, default three
 * slots evenly spaced across the first two minutes) with ± jitter re-rolled each round.
 * Slot times are anchored to round-elapsed time (getRoundClockNowMs − roundStartedAtMs),
 * so a migrated host derives the same remaining slots; stale slots (missed by more than a
 * window, e.g. across a migration) are skipped, never fired late.
 *
 * Safety rails:
 *   - Directives never fire during Sudden Death (an addScore there would end the round);
 *     entering SD or leaving the running phase restores overrides immediately.
 *   - No window may run inside the round's quiet finale (CONFIG.directives.quietFinaleMs)
 *     — the last 30 seconds belong to the endgame.
 *   - One directive active at a time; back-to-back repeats are avoided.
 */

import { CONFIG, MSG } from "../config.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";
import { ANNOUNCER_EVENTS } from "../announcer/announcerEvents.js";
import { getRoundClockNowMs } from "../roundClock.js";
import { DIRECTIVES } from "./directives.js";

/**
 * @typedef {object} DirectiveEngineDeps
 * @property {() => boolean} getIsHost
 * @property {(payload: object) => void} sendP2PEvent
 * @property {(eventId: string, data?: object) => void} announce
 * @property {(slotIndex: number, points: number) => void} addScore Host-authoritative score path.
 * @property {() => Map<number, { attackerSlotIndex: number, timestamp: number }>} getLastHitBy
 * @property {(info: {
 *   attackerSlotIndex: number,
 *   victimSlotIndex: number,
 *   points: number,
 * }) => void} [onSpillBonusAward] Presentation fan-out after a successful Spill Bonus score
 *   (score float, kill feed). Optional — tests may omit.
 */

/** @type {DirectiveEngineDeps | null} */
let deps = null;

/** @type {{ def: import("./directives.js").DirectiveDef, startedAtMs: number, untilMs: number } | null} */
let active = null;

/** @type {Array<{ obj: object, key: string, old: number }>} Saved values for restore. */
let savedValues = [];

/** @type {number[]} This round's jittered fire times, in round-elapsed ms. */
let fireSchedule = [];

/** Index of the next unfired slot in {@link fireSchedule}. */
let scheduleIdx = 0;

/** Avoid firing the same directive twice in a row. */
let lastDirectiveId = null;

/** Round start timestamp last seen — resets the schedule per round. */
let _lastRoundStartedAtMs = 0;

/**
 * @param {DirectiveEngineDeps} d
 */
export function initDirectiveEngine(d) {
  deps = d;
  // * Phase-exit safety net that doesn't depend on the rAF tick: when the menu/pause
  // * path freezes the game loop mid-window, updateDirectiveEngine stops running and
  // * a phase change (quit to lobby, round end) would otherwise leave CONFIG mutated
  // * until the next running-phase frame. Store subscriptions fire synchronously on
  // * setState, so this restores base rules even with the loop frozen.
  gameStore.subscribe((state) => {
    if (active && (state.roundPhase !== RoundPhase.RUNNING || state.isSuddenDeath)) {
      restoreActive();
    }
  });
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
  if (active) restoreActive();

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
  activeView = {
    id: def.id,
    title: def.title,
    startedAtMs: nowMs,
    untilMs: nowMs + durationMs,
    accent: ANNOUNCER_EVENTS[def.announceEvent]?.callout?.accent ?? "#22e6ff",
  };
  lastDirectiveId = def.id;
  deps?.announce(def.announceEvent, { title: def.title });
}

/**
 * Restores every override of the active directive and clears it. Deliberately silent —
 * the HUD chip draining to zero is the end signal; a PA sign-off read as noise.
 */
function restoreActive() {
  if (!active) return;
  for (const s of savedValues) {
    s.obj[s.key] = s.old;
  }
  savedValues = [];
  active = null;
  activeView = null;
}

/**
 * Host migration: drop any mid-window mutators on every peer immediately.
 *
 * New host starts a fresh schedule (engine doc + living-store-test-plan). Clients must
 * not keep Flash Sale / Rush Hour / Express Lane CONFIG overrides after the old host
 * dies — host physics would be base rules while non-hosts still predict with mutators
 * until their local untilMs (up to ~18s of drive desync). Safe no-op when nothing active.
 */
export function clearDirectiveOnHostMigration() {
  if (active) restoreActive();
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

/** Builds this round's jittered slot list from CONFIG.directives.fireAtMs. */
function buildFireSchedule() {
  const cfg = CONFIG.directives;
  const jitter = cfg?.jitterMs ?? 0;
  fireSchedule = (cfg?.fireAtMs ?? []).map(
    (t) => Math.max(0, t + (Math.random() * 2 - 1) * jitter),
  );
  scheduleIdx = 0;
}

/**
 * Per-frame tick (all peers). Hosts fire the per-round slot schedule; everyone ticks
 * expiry locally.
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
    if (active) restoreActive();
    return;
  }

  // * New round — restore leftovers and re-roll the slot jitter.
  if (state.roundStartedAtMs !== _lastRoundStartedAtMs) {
    _lastRoundStartedAtMs = state.roundStartedAtMs;
    if (active) restoreActive();
    buildFireSchedule();
    lastDirectiveId = null;
  }

  if (active && nowMs >= active.untilMs) {
    restoreActive();
  }

  if (!deps.getIsHost() || active || scheduleIdx >= fireSchedule.length) return;

  const durationMs = cfg.durationMs ?? 18000;
  const slotAtMs = fireSchedule[scheduleIdx];
  // * Round clock only — never Date.now() (NET-CLK-3: wall jumps mis-schedule slots).
  const roundElapsed = getRoundClockNowMs() - state.roundStartedAtMs;
  if (roundElapsed < slotAtMs) return;

  // * Stale slot — missed by more than a window (host migration, frozen tab). Skip it;
  // * firing late would push the window toward the finale and bunch up the next slot.
  if (roundElapsed > slotAtMs + durationMs) {
    scheduleIdx += 1;
    return;
  }

  // * Quiet finale — the window must fully clear the protected round tail.
  const roundDurationMs = CONFIG.round?.durationMs ?? 150000;
  if (roundElapsed + durationMs > roundDurationMs - (cfg.quietFinaleMs ?? 30000)) {
    scheduleIdx = fireSchedule.length;
    return;
  }

  const def = pickDirective();
  if (!def) return;
  scheduleIdx += 1;
  applyDirective(def, nowMs, durationMs);
  deps.sendP2PEvent({ type: MSG.directive, id: def.id, durationMs });
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
  // * Late/stray packet guard: never apply outside a live running phase (a directive
  // * landing during Sudden Death or podium would mutate CONFIG with no restore tick).
  const state = gameStore.getState();
  if (state.roundPhase !== RoundPhase.RUNNING || state.isSuddenDeath) return;
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
 * Presentation (float / feed) is optional via {@link DirectiveEngineDeps.onSpillBonusAward}.
 * @param {number} victimSlotIndex
 */
export function onHostSpill(victimSlotIndex) {
  if (!deps || !deps.getIsHost()) return;
  const points = active?.def.spillBonusPoints ?? 0;
  if (points <= 0) return;

  const state = gameStore.getState();
  if (state.roundPhase !== RoundPhase.RUNNING || state.isSuddenDeath) return;

  const hit = deps.getLastHitBy().get(victimSlotIndex);
  const hitWindowMs = CONFIG.scoring?.hitWindowMs ?? 3000;
  // * Hit stamps use getRoundClockNowMs (gameStore.recordHit); compare in the same domain.
  if (!hit || getRoundClockNowMs() - hit.timestamp > hitWindowMs) return;
  if (hit.attackerSlotIndex === victimSlotIndex) return;

  const attackerSlotIndex = hit.attackerSlotIndex;
  deps.addScore(attackerSlotIndex, points);
  // * Score path is host-authoritative; fan presentation after the award so a failed
  // * addScore (none today) would still not show a false float. Callback is optional
  // * so unit tests stay pure number-recordings.
  const award = {
    attackerSlotIndex,
    victimSlotIndex,
    points,
  };
  deps.onSpillBonusAward?.(award);
  // * Presentation-only wire event — clients render feed/float; scores still arrive
  // * via host_round. Host does not receive its own sendToAll, so local callback above
  // * covers the host machine.
  deps.sendP2PEvent?.({
    type: MSG.spillBonus,
    attackerSlotIndex,
    victimSlotIndex,
    points,
  });
}

/**
 * Cached public view of the active directive. Built ONCE per apply (all fields are
 * stable for the window's life) so the per-frame HUD read doesn't allocate — see the
 * scratch-object convention in frameVisuals.js/simulation.js.
 * @type {{ id: string, title: string, startedAtMs: number, untilMs: number, accent: string } | null}
 */
let activeView = null;

/**
 * The active directive (or null) — for HUD/debug surfaces. `accent` mirrors the
 * directive's announcer callout color so the HUD chip matches the big callout.
 * @returns {{ id: string, title: string, startedAtMs: number, untilMs: number, accent: string } | null}
 */
export function getActiveDirective() {
  return activeView;
}

/**
 * Wire-shaped state of the active window for the host's 40Hz snapshot tail — the
 * self-heal for a lost one-shot MSG.directive (unreliable DataChannel) and for
 * mid-window joiners: clients that missed the start apply it from the next snapshot.
 * `r` is remaining ms so the receiver anchors to its own clock.
 * @returns {{ id: string, r: number } | null}
 */
export function getDirectiveWireState() {
  if (!active) return null;
  const remaining = Math.round(active.untilMs - performance.now());
  return remaining > 250 ? { id: active.def.id, r: remaining } : null;
}

/**
 * Dev/test-only: the directive ids that can be fired manually (Tweakpane playtest tools).
 * @returns {string[]}
 */
export function getDirectiveIdsForTest() {
  return Object.keys(DIRECTIVES);
}

/**
 * Dev/test-only: fire a directive immediately, bypassing the round schedule so a tester
 * can see/feel each one on demand (Living Store readability checks). Only meaningful
 * during the RUNNING phase — {@link updateDirectiveEngine} restores base rules on any
 * non-running phase or Sudden Death, so a directive forced outside a live round reverts
 * on the next tick. No-op for an unknown id or before the engine is initialized.
 * @param {string} id one of {@link getDirectiveIdsForTest}
 * @param {number} [durationMs] defaults to CONFIG.directives.durationMs
 * @returns {boolean} whether a directive was applied
 */
export function forceDirectiveForTest(id, durationMs) {
  const def = DIRECTIVES[id];
  if (!def || !deps) return false;
  applyDirective(def, performance.now(), durationMs ?? CONFIG.directives?.durationMs ?? 18000);
  return true;
}
