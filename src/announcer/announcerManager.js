// announcerManager.js — arbitration engine for "The Store PA" announcer.
// Module-singleton pattern (mirrors sfxSynth.js / audioManager.js): init once from main,
// call announce() from gameplay code, everything else is internal bookkeeping.
//
// Responsibilities: pick at most one announcement to occupy the single announcer
// "channel" at a time, respect per-event cooldowns/round caps/chance gates, merge
// kill-burst spam into a single line, and resolve playback to a recorded voice
// variant (when registered) or a fallback sting — with zero code changes required
// once real voice assets drop in via registerAnnouncerVoicePack().

import { ANNOUNCER_EVENTS } from "./announcerEvents.js";
import { mark } from "../utils/perfSpans.js";
import { getAnnouncerLine, resetAnnouncerLineState } from "./announcerLines.js";
import { playAnnouncerSting } from "./announcerStings.js";
import { recordDiagEvent } from "../utils/diagnostics.js";

/**
 * @typedef {import("./announcerEvents.js").AnnouncerEventDef} AnnouncerEventDef
 * @typedef {import("./announcerEvents.js").AnnouncerEventClass} AnnouncerEventClass
 * @typedef {import("./announcerLines.js").AnnouncerLineData} AnnouncerLineData
 */

/**
 * @typedef {object} AnnouncerDeps
 * @property {() => number} getSfxVolume
 * @property {() => boolean} getIsMuted
 * @property {(key: string) => number | null} playSfx AudioManager.playSfx, passed in to avoid an import cycle.
 * @property {(key: string, id: number) => void} [stopSfx] Hard-stop a playing SFX instance.
 * @property {(key: string, id: number, ms?: number) => void} [fadeOutSfx] Fade-then-stop a
 *   playing SFX instance — preferred over stopSfx for interrupts (no click on reverby voice).
 * @property {(key: string) => number | null} [getSfxDurationMs] Real clip length of a loaded
 *   SFX, used to reserve the channel for the actual recorded take instead of the
 *   sting-era durationMs estimate.
 * @property {() => boolean} isVoiceEnabled Gates ALL announcer audio (voice + stings) except "sequence" events.
 * @property {() => boolean} isCalloutsEnabled
 * @property {() => string} [getLocale]
 * @property {(def: AnnouncerEventDef, voiceMs: number | null) => void} [onAnnouncementPlays]
 *   Mix hook fired the moment an event actually plays (main ducks music under big
 *   announcements). voiceMs is the real recorded-take length when a voice plays, else null.
 */

/**
 * @typedef {object} AnnouncerCalloutPayload
 * @property {string} eventId
 * @property {string} kicker
 * @property {string | null} text Resolved subtitle line, or null if none was available.
 * @property {string} accent CSS color.
 * @property {number} holdMs
 * @property {AnnouncerEventClass} cls
 * @property {boolean} [focus] Feature-size directive callout (see AnnouncerEventDef.focus).
 */

/**
 * @typedef {object} AnnouncerPresenter
 * @property {(payload: AnnouncerCalloutPayload) => void} showCallout
 * @property {() => void} hideCallout
 */

/**
 * @typedef {object} AnnouncerVoicePackManifest
 * @property {string} locale
 * @property {string[]} availableKeys Entries of the form "<voiceKey>_<NN>" (e.g. "first_spill_02")
 *   that the caller has already registered with AudioManager under sfx key "announcer_<voiceKey>_<NN>".
 */

/** @typedef {{ def: AnnouncerEventDef, data: AnnouncerLineData, enqueuedAtMs: number }} QueueItem */

// === Tunables ===

/** Minimum silence between the END of one announcement and the START of the next
 * (non-sequence). THE pacing taste knob — Wyatt-tuned 1200 → 1800 → 1500 → 1700 → 1800
 * across playtest passes on the recorded voice pack (2026-07). The announcer
 * tests' timing math overshoots to 1800, so values ≤1800 need no test changes. */
const MIN_GAP_MS = 1800;
/** Extra quiet after a focus (directive) window closes, so nothing piles in right as it ends. */
const POST_FOCUS_QUIET_MS = 800;
/** Max items held in the arbitration queue at once. */
const QUEUE_MAX = 2;
/** Kill-burst merge / comeback-swallow-new_leader collection window. */
const BURST_WINDOW_MS = 450;
/** Event ids collected into a single announcement when they land within BURST_WINDOW_MS of each other.
 * Combo tier-ups are NOT in this set (PA-COMBO-1): they dispatch synchronously so
 * announce() can return played/queued/discarded, and a dropped upgrade does not
 * consume cooldown. Pileup still merges first_spill / double_spill / aisle_wipeout. */
const KILL_BURST_IDS = new Set([
  "first_spill", "double_spill", "aisle_wipeout",
  "refund", "cleanup_aisle",
]);

/**
 * @typedef {{ type: "played" } | { type: "queued", queueItem?: QueueItem } | { type: "discarded" }} AnnounceOutcome
 */

// === Module state ===

/** @type {AnnouncerDeps | null} */
let _deps = null;
/** @type {AnnouncerPresenter | null} */
let _presenter = null;
let _initialized = false;

/** @type {{ eventId: string, priority: number, interruptible: boolean, endMs: number } | null} */
let _active = null;
/** @type {{ key: string, id: number } | null} The active announcement's playing SFX instance,
 * so an interrupt can SILENCE it — not just replace its callout (recorded voice lines are
 * long enough to audibly ring under whatever interrupts them otherwise). */
let _activeSound = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _endTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _drainTimer = null;
/** Timestamp (performance.now()) the last announcement finished; -Infinity until the first ever plays. */
let _lastEndMs = -Infinity;

/** @type {QueueItem[]} */
let _queue = [];

/**
 * Focus window deadline (performance.now()). While a `focus: true` event's callout is on
 * screen (Living Store directives), every other non-sequence, non-critical announcement is
 * dropped outright — not queued — so the rule change gets read uncontested and the PA
 * doesn't feel busy. Sequence beeps and critical match-state events still cut through.
 */
let _focusUntilMs = -Infinity;

/** @type {{ def: AnnouncerEventDef, data: AnnouncerLineData, timer: ReturnType<typeof setTimeout> } | null} */
let _burstHold = null;

/** Tracks the most recent new_leader so a following comeback can swallow it (see rule 9). */
/** @type {{ arrivedAtMs: number, queueItem: QueueItem | null } | null} */
let _newLeaderTrack = null;

/** @type {Set<string>} Event ids that have already fired once this round (oncePerRound gate). */
const _firedOnce = new Set();
/** @type {Map<string, number>} Event id -> firings this round (maxPerRound gate). */
const _roundCounts = new Map();
/** @type {Map<string, number>} Event id -> performance.now() of its last firing (cooldown gate). */
const _cooldownStamps = new Map();

/** @type {Set<string>} Unknown event ids we've already warned about, so we only warn once each. */
const _warnedMissingIds = new Set();

/** @type {Map<string, Set<string>>} locale -> Set of registered "<voiceKey>_<NN>" strings. */
const _voicePacks = new Map();

// === Init / wiring ===

/**
 * Initializes the announcer manager. Safe to call once from main.
 * @param {AnnouncerDeps} deps
 * @returns {void}
 */
export function initAnnouncer(deps) {
  _deps = deps;
  _initialized = true;
}

/**
 * Sets (or clears) the visual presenter used for on-screen callouts.
 * @param {AnnouncerPresenter | null} presenter
 * @returns {void}
 */
export function setAnnouncerPresenter(presenter) {
  _presenter = presenter;
}

/**
 * Records voice assets that have already been registered with AudioManager under
 * sfx key `announcer_<voiceKey>_<NN>`. Missing assets simply fall back to the
 * event's procedural/sfxKey sting — no code changes needed when new recordings land.
 * @param {AnnouncerVoicePackManifest} manifest
 * @returns {void}
 */
export function registerAnnouncerVoicePack(manifest) {
  if (!manifest?.locale || !Array.isArray(manifest.availableKeys)) return;
  let set = _voicePacks.get(manifest.locale);
  if (!set) {
    set = new Set();
    _voicePacks.set(manifest.locale, set);
  }
  for (const key of manifest.availableKeys) set.add(key);
}

// === Public entry point ===

/**
 * The single entry point for triggering an announcement. Runs the full arbitration
 * pipeline: gate checks, kill-burst merge, comeback/new_leader swallow, channel/queue
 * placement, and (eventually) playback.
 * @param {string} eventId
 * @param {AnnouncerLineData} [data]
 * @returns {AnnounceOutcome} played = won the channel now; queued = waiting (incl.
 *   kill-burst hold); discarded = gated, dropped, or unknown id.
 */
export function announce(eventId, data = {}) {
  if (!_initialized || !_deps) return { type: "discarded" };
  const def = ANNOUNCER_EVENTS[eventId];
  if (!def) {
    warnMissingEventOnce(eventId);
    return { type: "discarded" };
  }
  // * Diagnostics: log every accepted announce request (channel "announcer") so a rig can
  // * assert the PA sequence (countdown_3→2→1→go, victory/defeat). No-op unless ?diag active.
  recordDiagEvent("announcer", eventId, {});
  const nowMs = performance.now();

  if (eventId === "comeback") {
    const bypassGap = handleComebackSwallow(nowMs);
    if (!passGates(def, nowMs)) return { type: "discarded" };
    return dispatch(def, data, nowMs, { bypassGap });
  }

  if (KILL_BURST_IDS.has(eventId)) {
    if (!passGates(def, nowMs)) return { type: "discarded" };
    // * Gates are consumed at collection time — a swallowed event still "counts as fired"
    // * even if a higher-priority sibling wins the merge window (rule 8).
    consumeGates(def, nowMs);
    collectBurst(def, data, nowMs);
    return { type: "queued" };
  }

  if (!passGates(def, nowMs)) return { type: "discarded" };

  if (eventId === "new_leader") {
    const outcome = dispatch(def, data, nowMs, {});
    if (outcome.type === "played") {
      _newLeaderTrack = { arrivedAtMs: nowMs, queueItem: null };
    } else if (outcome.type === "queued") {
      _newLeaderTrack = { arrivedAtMs: nowMs, queueItem: outcome.queueItem };
    } else {
      _newLeaderTrack = null;
    }
    return outcome;
  }

  return dispatch(def, data, nowMs, {});
}

/**
 * Clears the queue, per-round counters/oncePerRound state, cooldowns, and line
 * no-repeat memory. Does NOT stop whatever is currently playing on the channel.
 * Call at countdown start.
 * @returns {void}
 */
export function resetAnnouncerRound() {
  _queue = [];
  if (_burstHold) {
    clearTimeout(_burstHold.timer);
    _burstHold = null;
  }
  _firedOnce.clear();
  _roundCounts.clear();
  _cooldownStamps.clear();
  _newLeaderTrack = null;
  _focusUntilMs = -Infinity;
  resetAnnouncerLineState();
}

/**
 * Hard silence: clears the queue, hides any visible callout, and clears the active
 * channel (including pending timers). Use on menu return / session teardown.
 * @returns {void}
 */
export function stopAnnouncer() {
  _queue = [];
  if (_burstHold) {
    clearTimeout(_burstHold.timer);
    _burstHold = null;
  }
  if (_drainTimer) {
    clearTimeout(_drainTimer);
    _drainTimer = null;
  }
  if (_endTimer) {
    clearTimeout(_endTimer);
    _endTimer = null;
  }
  if (_active) {
    // * Hard silence includes the audio — menu return should not leave a line ringing.
    stopActiveSound();
    _presenter?.hideCallout();
    _active = null;
  }
  _activeSound = null;
  _newLeaderTrack = null;
  _focusUntilMs = -Infinity;
}

/**
 * Dev/test introspection into the arbitration engine's current state.
 * @returns {{ activeEventId: string | null, queueLength: number, heldEventId: string | null }}
 */
export function getAnnouncerDebugState() {
  return {
    activeEventId: _active ? _active.eventId : null,
    queueLength: _queue.length,
    heldEventId: _burstHold ? _burstHold.def.id : null,
  };
}

// === Gate checks (rule 7) ===

/**
 * @param {AnnouncerEventDef} def
 * @param {number} nowMs
 * @returns {boolean}
 */
function passGates(def, nowMs) {
  if (def.oncePerRound && _firedOnce.has(def.id)) return false;
  if (def.maxPerRound > 0 && (_roundCounts.get(def.id) ?? 0) >= def.maxPerRound) return false;
  const lastFired = _cooldownStamps.get(def.id);
  if (def.cooldownMs > 0 && lastFired !== undefined && nowMs - lastFired < def.cooldownMs) return false;
  if (def.chance < 1 && Math.random() >= def.chance) return false;
  return true;
}

/**
 * Stamps cooldown/oncePerRound/maxPerRound bookkeeping. For regular (non-kill-burst)
 * events this is called from startAnnouncement — i.e. only once an event actually wins
 * a channel slot and starts playing, not merely when it's queued. This is what makes
 * the queue's eventId dedupe (rule 5) reachable: a still-queued, not-yet-played event
 * hasn't consumed its own cooldown yet, so a fresher duplicate can still pass gates and
 * replace it. Kill-burst events are the deliberate exception (rule 8): their gates are
 * consumed at collection time (see the KILL_BURST_IDS branch in announce()) so a
 * higher-priority sibling swallowing them still counts as "fired".
 * @param {AnnouncerEventDef} def
 * @param {number} nowMs
 * @returns {void}
 */
function consumeGates(def, nowMs) {
  _cooldownStamps.set(def.id, nowMs);
  if (def.oncePerRound) _firedOnce.add(def.id);
  if (def.maxPerRound > 0) _roundCounts.set(def.id, (_roundCounts.get(def.id) ?? 0) + 1);
}

/**
 * @param {string} eventId
 * @returns {void}
 */
function warnMissingEventOnce(eventId) {
  if (_warnedMissingIds.has(eventId)) return;
  _warnedMissingIds.add(eventId);
  console.warn(`[announcerManager] Unknown announcer event id "${eventId}" — ignoring.`);
}

// === Kill-burst merge (rule 8) ===

/**
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {number} nowMs
 * @returns {void}
 */
function collectBurst(def, data, nowMs) {
  if (!_burstHold) {
    _burstHold = { def, data, timer: setTimeout(fireBurst, BURST_WINDOW_MS) };
    return;
  }
  // * Higher priority replaces the held survivor; ties keep the first (already held) one.
  if (def.priority > _burstHold.def.priority) {
    _burstHold.def = def;
    _burstHold.data = data;
  }
}

/** @returns {void} */
function fireBurst() {
  const held = _burstHold;
  _burstHold = null;
  if (!held) return;
  dispatch(held.def, held.data, performance.now(), {});
}

// === comeback swallows new_leader (rule 9) ===

/**
 * If a new_leader was announced/queued within BURST_WINDOW_MS, removes it (from the
 * queue) or cuts it short (if currently active) so the incoming comeback replaces it.
 * @param {number} nowMs
 * @returns {boolean} True when an active new_leader was cut short — the caller should
 *   bypass the min-gap check since the channel was just freed for this purpose.
 */
function handleComebackSwallow(nowMs) {
  const track = _newLeaderTrack;
  _newLeaderTrack = null;
  if (!track) return false;
  if (nowMs - track.arrivedAtMs > BURST_WINDOW_MS) return false;

  if (track.queueItem) {
    const idx = _queue.indexOf(track.queueItem);
    if (idx >= 0) _queue.splice(idx, 1);
    return false;
  }

  if (_active && _active.eventId === "new_leader") {
    endActive(nowMs);
    return true;
  }

  return false;
}

// === Channel / queue arbitration (rules 1-6) ===

/**
 * @param {number} nowMs
 * @param {boolean | undefined} bypassGap
 * @returns {boolean}
 */
function channelReady(nowMs, bypassGap) {
  if (bypassGap) return true;
  return nowMs - _lastEndMs >= MIN_GAP_MS;
}

/**
 * Runs the channel/queue placement rules for a single (already gate-passed) event
 * and, if it wins a channel slot immediately, plays it.
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {number} nowMs
 * @param {{ bypassGap?: boolean }} [opts]
 * @returns {{ type: "played" } | { type: "queued", queueItem: QueueItem } | { type: "discarded" }}
 */
function dispatch(def, data, nowMs, opts = {}) {
  // * Fully disabled: no audio allowed (announcer voice toggle off) and no visual to show.
  // * Sequence events are exempt — the countdown beeps always play via their sfxKey.
  if (def.cls !== "sequence" && !_deps.isVoiceEnabled() && def.callout === null) {
    return { type: "discarded" };
  }

  // * Focus window (Living Store directives): drop everything that isn't a sequence
  // * beep, a critical match-state event, or another focus event while the directive
  // * callout is on screen. Dropped — not queued — so nothing bursts out stale after.
  if (
    nowMs < _focusUntilMs &&
    def.cls !== "sequence" &&
    def.cls !== "critical" &&
    !def.focus
  ) {
    return { type: "discarded" };
  }

  if (def.cls === "sequence") {
    // * Never queued, always bypasses the gap. A live SPOKEN line gets cut (fast
    // * fade via endActive) so the countdown doesn't talk over it; sibling sequence
    // * clips still ring their tails over each other by design (trackSound).
    if (_active && ANNOUNCER_EVENTS[_active.eventId]?.cls !== "sequence") endActive(nowMs);
    startAnnouncement(def, data, nowMs);
    return { type: "played" };
  }

  if (def.cls === "critical") {
    if (_active) endActive(nowMs);
    _queue = [];
    // * Also drop any pending kill-burst and its drain timer. A burst collected on
    // * the round-ending KO would otherwise fire its held timer AFTER victory/defeat
    // * started and re-enqueue behind the critical, surfacing a stale "FIRST BLOOD"
    // * callout over the podium. stopAnnouncer() clears these on menu return; the
    // * critical (victory/defeat) that opens the podium must clear them too.
    if (_burstHold) {
      clearTimeout(_burstHold.timer);
      _burstHold = null;
    }
    if (_drainTimer) {
      clearTimeout(_drainTimer);
      _drainTimer = null;
    }
    startAnnouncement(def, data, nowMs);
    return { type: "played" };
  }

  if (def.cls === "ambient") {
    if (_active || _queue.length > 0) return { type: "discarded" };
    if (!channelReady(nowMs, opts.bypassGap)) return { type: "discarded" };
    startAnnouncement(def, data, nowMs);
    return { type: "played" };
  }

  if (_active) {
    if (def.priority >= _active.priority + 20 && _active.interruptible) {
      endActive(nowMs);
      startAnnouncement(def, data, nowMs);
      return { type: "played" };
    }
    return queueOrDrop(def, data, nowMs);
  }

  if (channelReady(nowMs, opts.bypassGap)) {
    startAnnouncement(def, data, nowMs);
    return { type: "played" };
  }

  return enqueue(def, data, nowMs);
}

/** Combo tier-ups queue on a busy channel (PA-COMBO-1). Other medium/low still drop. */
const COMBO_TIER_IDS = new Set(["rampage", "savage", "carnage"]);

/**
 * Busy-channel policy: only "high" commentary survives a busy channel by queuing.
 * "medium"/"low" drop instead of building a backlog that drains back-to-back.
 * Combo tier-ups are the exception — an upgrade that lands while RAMPAGE is
 * still talking must wait its turn, not vanish.
 * Criticals/sequences interrupt before this point; the min-gap path still uses
 * enqueue so a new moment during the taste gap can wait one gap and play.
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {number} nowMs
 * @returns {{ type: "queued", queueItem: QueueItem } | { type: "discarded" }}
 */
function queueOrDrop(def, data, nowMs) {
  if (def.cls !== "high" && !COMBO_TIER_IDS.has(def.id)) return { type: "discarded" };
  return enqueue(def, data, nowMs);
}

/**
 * Places an event into the queue per rule 5: drop expired items, replace a duplicate
 * eventId with fresher data, otherwise push (or evict the lowest-priority item when full).
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {number} nowMs
 * @returns {{ type: "queued", queueItem: QueueItem } | { type: "discarded" }}
 */
function enqueue(def, data, nowMs) {
  _queue = _queue.filter((item) => nowMs <= item.enqueuedAtMs + item.def.ttlMs);

  const dupIdx = _queue.findIndex((item) => item.def.id === def.id);
  if (dupIdx >= 0) {
    const item = { def, data, enqueuedAtMs: nowMs };
    _queue[dupIdx] = item;
    return { type: "queued", queueItem: item };
  }

  if (_queue.length < QUEUE_MAX) {
    const item = { def, data, enqueuedAtMs: nowMs };
    _queue.push(item);
    return { type: "queued", queueItem: item };
  }

  let lowestIdx = 0;
  for (let i = 1; i < _queue.length; i += 1) {
    if (_queue[i].def.priority < _queue[lowestIdx].def.priority) lowestIdx = i;
  }
  if (def.priority > _queue[lowestIdx].def.priority) {
    const item = { def, data, enqueuedAtMs: nowMs };
    _queue[lowestIdx] = item;
    return { type: "queued", queueItem: item };
  }

  return { type: "discarded" };
}

/**
 * Removes expired items and returns the highest-priority (ties -> earliest/FIFO)
 * remaining queue item, or null if the queue is empty after expiry pruning.
 * @param {number} nowMs
 * @returns {QueueItem | null}
 */
function popNextQueueItem(nowMs) {
  _queue = _queue.filter((item) => nowMs <= item.enqueuedAtMs + item.def.ttlMs);
  if (_queue.length === 0) return null;
  let bestIdx = 0;
  for (let i = 1; i < _queue.length; i += 1) {
    if (_queue[i].def.priority > _queue[bestIdx].def.priority) bestIdx = i;
  }
  const [item] = _queue.splice(bestIdx, 1);
  return item;
}

// === Channel lifecycle ===

/**
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {number} nowMs
 * @returns {void}
 */
function startAnnouncement(def, data, nowMs) {
  // * Kill-burst events already consumed their gates at collection time (rule 8);
  // * everything else consumes here, at the moment it actually wins the channel.
  if (!KILL_BURST_IDS.has(def.id)) consumeGates(def, nowMs);

  // * Resolve the voice take up front so the channel reservation can use the REAL
  // * clip length. Sequence events resolve regardless of the voice toggle (they're
  // * core feedback, not commentary); everything else only when audio is allowed.
  const locale = _deps.getLocale ? _deps.getLocale() : "en";
  const voiceKey =
    def.cls === "sequence" || _deps.isVoiceEnabled() ? resolveVoiceKey(def, locale) : null;
  const voiceMs = voiceKey ? (_deps.getSfxDurationMs?.(`announcer_${voiceKey}`) ?? null) : null;
  // * Honest reservation: recorded takes outrun the sting-era durationMs estimates
  // * (1.3–5s vs 0.7–1.6s), which let the next line start while the last was still
  // * talking. Never shorter than the declared pacing floor.
  const reserveMs = Math.max(def.durationMs, voiceMs ?? 0);

  // * Focus events (Living Store directives) open a suppression window for the whole
  // * on-screen hold OR the full voice line, whichever runs longer, plus a beat of
  // * air — nothing should fire right as the rule change lands or right after it.
  if (def.focus) {
    _focusUntilMs = nowMs + Math.max(def.callout?.holdMs ?? 0, reserveMs) + POST_FOCUS_QUIET_MS;
  }

  if (_endTimer) {
    clearTimeout(_endTimer);
    _endTimer = null;
  }
  _active = {
    eventId: def.id,
    priority: def.priority,
    interruptible: def.interruptible,
    endMs: nowMs + reserveMs,
  };
  playAnnouncement(def, data, voiceKey, voiceMs);
  const { id } = def;
  _endTimer = setTimeout(() => onAnnouncementEnd(id), reserveMs);
}

/**
 * Forcibly ends the active announcement (interrupt path). Hides the callout and
 * stamps _lastEndMs so the caller can decide whether the next play bypasses the gap.
 * @param {number} nowMs
 * @returns {void}
 */
function endActive(nowMs) {
  if (_endTimer) {
    clearTimeout(_endTimer);
    _endTimer = null;
  }
  if (_active) {
    _lastEndMs = nowMs;
    // * Interrupts must SILENCE the outgoing line, not just replace its callout —
    // * otherwise the old voice keeps ringing under the new one (the directive
    // * overlap bug). Natural completion never lands here, so tails still decay.
    stopActiveSound();
    _presenter?.hideCallout();
    // * If the interrupted event owned the focus window, close it — its callout is
    // * gone, so leaving the suppression running would mute the PA over nothing.
    if (ANNOUNCER_EVENTS[_active.eventId]?.focus) {
      _focusUntilMs = nowMs;
    }
  }
  _active = null;
}

/**
 * Fade-then-stop (or hard-stop) the active announcement's playing audio instance.
 * @returns {void}
 */
function stopActiveSound() {
  if (!_activeSound) return;
  const { key, id } = _activeSound;
  _activeSound = null;
  if (_deps.fadeOutSfx) _deps.fadeOutSfx(key, id, 90);
  else _deps.stopSfx?.(key, id);
}

/**
 * Natural-completion handler: frees the channel and schedules the min-gap drain
 * so any queued item gets its turn once the gap elapses.
 * @param {string} eventId
 * @returns {void}
 */
function onAnnouncementEnd(eventId) {
  if (!_active || _active.eventId !== eventId) return;
  _lastEndMs = _active.endMs;
  _active = null;
  // * Natural end — the clip finished on its own; just drop the handle (no stop, so
  // * any last bit of reverb tail rings out).
  _activeSound = null;
  _endTimer = null;
  scheduleDrain();
}

/** @returns {void} */
function scheduleDrain() {
  if (_drainTimer) clearTimeout(_drainTimer);
  _drainTimer = setTimeout(attemptDrain, MIN_GAP_MS);
}

/** @returns {void} */
function attemptDrain() {
  _drainTimer = null;
  if (_active) return;
  const nowMs = performance.now();
  const item = popNextQueueItem(nowMs);
  if (!item) return;
  startAnnouncement(item.def, item.data, nowMs);
}

// === Playback resolution (rule 10) ===

/**
 * Plays the (already-resolved) audio for the winning event and shows its callout if
 * enabled. The voice key is resolved in startAnnouncement so the channel reservation
 * and this playback always agree on the same take.
 * @param {AnnouncerEventDef} def
 * @param {AnnouncerLineData} data
 * @param {string | null} voiceKey Registered "<key>_<NN>" voice take, or null.
 * @param {number | null} voiceMs Real clip length of that take, or null.
 * @returns {void}
 */
function playAnnouncement(def, data, voiceKey, voiceMs) {
  const locale = _deps.getLocale ? _deps.getLocale() : "en";
  const line = getAnnouncerLine(def.id, data, locale);

  // * Optional mix hook — main ducks music under big announcements (by event class).
  _deps.onAnnouncementPlays?.(def, voiceMs);

  if (def.cls === "sequence") {
    // * Core countdown feedback — never gated by the announcer toggle. A registered
    // * voice take supersedes the beep sting (recorded countdown replaces the beeps).
    if (voiceKey) {
      trackSound(`announcer_${voiceKey}`);
    } else if (def.sting?.type === "sfxKey") {
      trackSound(def.sting.key);
    }
  } else if (_deps.isVoiceEnabled()) {
    if (voiceKey) {
      trackSound(`announcer_${voiceKey}`);
    } else if (def.sting?.type === "sfxKey") {
      trackSound(def.sting.key);
    } else if (def.sting?.type === "proc") {
      // * Named span: procedural PA sting synthesis is the audio-side suspect for the
      // * "freeze near PA" reports. Attributes into longframe.spans. Bind the name in the
      // * narrowed scope — TS loses the `type === "proc"` narrowing inside the closure.
      const stingName = def.sting.name;
      mark("pa.sting", () => playAnnouncerSting(stingName));
    }
  }

  if (def.callout && _deps.isCalloutsEnabled()) {
    _presenter?.showCallout({
      eventId: def.id,
      kicker: def.callout.kicker,
      text: line,
      accent: def.callout.accent,
      holdMs: def.callout.holdMs,
      cls: def.cls,
      focus: Boolean(def.focus),
    });
  }
}

/**
 * Plays an SFX and remembers the instance handle so an interrupt can silence it.
 * Sequence overrides (countdown digits replacing each other) deliberately do NOT stop
 * the previous instance — their reverb tails overlapping at the 1s cadence is the PA echo.
 * @param {string} key
 * @returns {void}
 */
function trackSound(key) {
  const id = _deps.playSfx(key);
  _activeSound = id != null ? { key, id } : null;
}

/**
 * Picks a random registered voice variant for an event, or null if none are registered.
 * @param {AnnouncerEventDef} def
 * @param {string} locale
 * @returns {string | null} A "<voiceKey>_<NN>" key, ready to prefix with "announcer_".
 */
function resolveVoiceKey(def, locale) {
  const set = _voicePacks.get(locale);
  if (!set || set.size === 0) return null;
  const candidates = [];
  for (let i = 1; i <= def.voice.variants; i += 1) {
    const candidate = `${def.voice.key}_${String(i).padStart(2, "0")}`;
    if (set.has(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
