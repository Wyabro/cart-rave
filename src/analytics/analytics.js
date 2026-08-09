/**
 * analytics.js — the lightweight gameplay analytics core (transport + queue, no game imports).
 *
 * Design-question telemetry, not surveillance: a handful of high-value gameplay EVENTS
 * (match started/ended, unlock earned, player quit …) so questions like "which arena gets
 * played?" and "where do players quit?" stop being guesses. Explicitly NOT continuous
 * telemetry — nothing here runs per frame, and the emission sites live in
 * gameplayAnalytics.js (store subscriptions + existing chokepoints, mirroring
 * gameplayDiagnostics.js).
 *
 * Performance contract:
 *   - trackEvent() is an array push behind one boolean read; uninitialized/opted-out = no-op.
 *   - Serialization happens only at flush time (batched), never per event.
 *   - The queue is bounded (QUEUE_MAX); overflow drops newest and counts them.
 *   - The flush timer only exists while the queue is non-empty — an idle menu costs nothing.
 *
 * Transport is a pluggable SINK — `{ name, send(payload) }` — so future backends
 * (self-hosted, Supabase, PlayFab, Steam, …) swap in without touching gameplay code:
 *   - beaconSink  (default in prod): navigator.sendBeacon → POST /api/analytics, the same
 *                 proven path errorReporter.js uses; lands in the AnalyticsLog DO.
 *   - consoleSink (default in DEV): console.debug batches — visible, never networked
 *                 (mirrors the errorReporter DEV skip; Vite has no /api route anyway).
 *   - custom      pass any sink via initAnalytics({ sink }) (tests use a memory sink).
 *
 * Privacy: no PII. `clientId` is the existing random cartRaveClientId; props are flat
 * primitives from gameplay state. Opt-out: ?analytics=off or localStorage cartRaveAnalytics="off".
 * Each event is stamped with `pageHost` (location.hostname) at flush so staging vs public
 * traffic is separable in list view without a DO schema change.
 */

import { STORAGE_KEYS, storageGet } from "../utils/storage.js";
import { readBuildInfo } from "../utils/buildInfo.js";

/** Queue bound — overflow beyond this drops the newest event (and counts the drop). */
const QUEUE_MAX = 64;
/** Flush as soon as this many events are queued (long sessions never hold a huge tail). */
const FLUSH_AT = 20;
/** Idle flush latency — armed on first queued event only, never a standing interval. */
const FLUSH_INTERVAL_MS = 30_000;
/** Same-origin ingest route (party/index.ts → party/analyticsLog.ts). */
const ENDPOINT = "/api/analytics";
/** Payload caps (defense in depth; the Worker route and DO cap again server-side). */
const NAME_MAX = 40;
const PROP_STRING_MAX = 80;

/**
 * @typedef {{ name: string, send: (payload: Record<string, unknown>) => void }} AnalyticsSink
 */

/** @type {AnalyticsSink} */
const beaconSink = {
  name: "beacon",
  send(payload) {
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* transport must never throw into gameplay */
    }
  },
};

/** @type {AnalyticsSink} */
const consoleSink = {
  name: "console",
  send(payload) {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] batch (${/** @type {any[]} */ (payload.events).length} events)`, payload);
  },
};

/**
 * @typedef {object} AnalyticsState
 * @property {string} sessionId
 * @property {AnalyticsSink} sink
 * @property {Array<{ name: string, t: number, [k: string]: unknown }>} queue
 * @property {number} sentEvents
 * @property {number} sentBatches
 * @property {number} dropped
 * @property {ReturnType<typeof setTimeout> | null} timer
 * @property {(() => void) | null} onPageHide
 * @property {number} startedAtMs
 */

/** @type {AnalyticsState | null} Null until initAnalytics(); null again when opted out. */
let state = null;

/** Window listeners are module-lifetime singletons (reset/re-init must not stack them). */
let listenersInstalled = false;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0;
}

function randomSessionId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Opt-out check: URL ?analytics=off/0/false or localStorage cartRaveAnalytics="off".
 * @param {string} [search]
 * @returns {boolean}
 */
export function isAnalyticsOptedOut(search) {
  const raw = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const v = new URLSearchParams(raw || "").get("analytics");
  if (v === "off" || v === "0" || v === "false") return true;
  return storageGet(STORAGE_KEYS.analytics) === "off";
}

/**
 * Install the analytics core. Idempotent; called once from main() (via
 * installGameplayAnalytics). When the player opted out this is a no-op and every
 * later trackEvent() stays a single null check.
 *
 * @param {{ sink?: AnalyticsSink, onPageHide?: () => void, dev?: boolean }} [opts]
 *   `onPageHide` runs BEFORE the final flush on pagehide, so the wiring layer can queue
 *   its last events (session_end / quit-by-close) into the same beacon. `dev` overrides
 *   import.meta.env.DEV for tests.
 * @returns {boolean} True when analytics are collecting.
 */
export function initAnalytics(opts = {}) {
  if (state) return true;
  if (isAnalyticsOptedOut()) return false;

  const dev = opts.dev ?? Boolean(import.meta.env?.DEV);
  state = {
    sessionId: randomSessionId(),
    sink: opts.sink ?? (dev ? consoleSink : beaconSink),
    queue: [],
    sentEvents: 0,
    sentBatches: 0,
    dropped: 0,
    timer: null,
    onPageHide: opts.onPageHide ?? null,
    startedAtMs: nowMs(),
  };

  if (!listenersInstalled && typeof window !== "undefined") {
    listenersInstalled = true;
    // * pagehide = the session is really ending (nav/close/refresh): give the wiring layer
    // * its final say, then beacon whatever is queued. visibilitychange→hidden is only a
    // * flush opportunity (tab switches are not quits) — sendBeacon survives backgrounding.
    window.addEventListener("pagehide", () => {
      try {
        state?.onPageHide?.();
      } catch {
        /* wiring errors must not lose the final flush */
      }
      flushAnalytics("pagehide");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAnalytics("hidden");
    });
  }
  return true;
}

/**
 * Queue one gameplay event. Cheap by contract: a guard, a shallow prop copy of primitives,
 * an array push. Call sites never need their own gating.
 *
 * @param {string} name  Short snake_case event name (match_started, player_quit, …).
 * @param {Record<string, unknown>} [props]  Flat primitives only; nested values are dropped.
 * @returns {boolean} True when the event was queued.
 */
export function trackEvent(name, props) {
  if (!state) return false;
  if (state.queue.length >= QUEUE_MAX) {
    state.dropped += 1;
    return false;
  }
  /** @type {{ name: string, t: number, [k: string]: unknown }} */
  const evt = { name: String(name).slice(0, NAME_MAX), t: nowMs() };
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "name" || k === "t") continue;
      const t = typeof v;
      if (t === "number" || t === "boolean") evt[k] = v;
      else if (t === "string") evt[k] = /** @type {string} */ (v).slice(0, PROP_STRING_MAX);
      // null/undefined/objects/functions are dropped — payloads stay flat and bounded.
    }
  }
  state.queue.push(evt);

  if (state.queue.length >= FLUSH_AT) {
    flushAnalytics("full");
  } else if (state.timer == null) {
    state.timer = setTimeout(() => flushAnalytics("timer"), FLUSH_INTERVAL_MS);
  }
  return true;
}

/**
 * Optional Glitch festival GameAnalyticsTracker bridge (loaded from index.html).
 * Pageviews are automatic; custom actions feed their dashboard. Never throws into gameplay.
 * No-op when the script has not loaded, or when Cart Clash analytics is opted out.
 *
 * @param {string} category  e.g. "engagement" | "gameplay"
 * @param {string} action    e.g. "menu_click" | "match_started"
 * @param {Record<string, unknown>} [props]
 * @returns {boolean} True when the third-party tracker accepted the call.
 */
export function trackGlitchEvent(category, action, props) {
  if (state == null && typeof window !== "undefined") {
    // * Before initAnalytics: still allow menu clicks if Glitch loaded and player did not opt out.
    try {
      if (isAnalyticsOptedOut()) return false;
    } catch {
      /* ignore */
    }
  } else if (state == null) {
    return false;
  }
  try {
    if (typeof window === "undefined") return false;
    /** @type {{ trackEvent?: (c: string, a: string, p?: Record<string, unknown>) => void } | undefined} */
    const tracker = /** @type {any} */ (window).GameAnalyticsTracker;
    if (!tracker || typeof tracker.trackEvent !== "function") return false;
    tracker.trackEvent(String(category), String(action), props ?? {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize the queue into one batch and hand it to the sink. Serialization is deferred
 * to here — never per event. Safe to call anytime; empty queue is a no-op.
 *
 * @param {string} [reason]  Why the flush fired (telemetry for the batch itself).
 * @returns {number} Events flushed.
 */
export function flushAnalytics(reason = "manual") {
  if (!state || state.queue.length === 0) return 0;
  if (state.timer != null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const events = state.queue;
  state.queue = [];
  // * Stamp pageHost onto each event so list-view props can separate staging (workers.dev)
  // * from public (cartclash.lol). Lands in the DO props JSON — no schema change. Summary
  // * aggregates ignore it; prove with analytics:pull --list.
  const pageHost =
    typeof location !== "undefined" && location.hostname
      ? String(location.hostname).slice(0, PROP_STRING_MAX)
      : "";
  if (pageHost) {
    for (const evt of events) {
      if (evt.pageHost == null) evt.pageHost = pageHost;
    }
  }
  const payload = {
    v: 1,
    sessionId: state.sessionId,
    // * Read lazily at flush: netcode owns this key and may write it after init.
    clientId: storageGet(STORAGE_KEYS.clientId),
    build: readBuildInfo(),
    sentAt: Date.now(),
    reason,
    dropped: state.dropped,
    events,
  };
  state.sentEvents += events.length;
  state.sentBatches += 1;
  state.sink.send(payload);
  return events.length;
}

/**
 * Read-only internals for the `analytics` diag probe and tests.
 * @returns {Record<string, unknown>}
 */
export function getAnalyticsDebugState() {
  if (!state) return { enabled: false };
  return {
    enabled: true,
    sink: state.sink.name,
    sessionId: state.sessionId,
    queued: state.queue.length,
    sentEvents: state.sentEvents,
    sentBatches: state.sentBatches,
    dropped: state.dropped,
    uptimeMs: nowMs() - state.startedAtMs,
  };
}

/**
 * Test-only singleton reset (mirrors __resetDiagnosticsForTest).
 * @returns {void}
 */
export function __resetAnalyticsForTest() {
  if (state?.timer != null) clearTimeout(state.timer);
  state = null;
}
