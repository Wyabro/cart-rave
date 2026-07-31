/**
 * diagnostics.js — window.__ccDiag, the unified dev diagnostics hub.
 *
 * One read-only surface for automated drivers (Playwright rigs in tools/, or a console)
 * to observe gameplay runtime state and a history of what happened. It is the general
 * complement to the two specialist harnesses that came before it — the netcode E2E rig
 * (window.__ccTest, ?nettest) and the visual QA harness (window.__cartRave, ?harness) —
 * and it deliberately reuses their conventions: a single URL flag gates everything,
 * production modules inject read-only getters, and the whole thing is inert (a couple of
 * boolean reads) when the flag is absent.
 *
 * Two primitives make future diagnostic modules cheap to add:
 *
 *   registerDiagProbe(ns, snapshotFn)  — a namespaced read-only state snapshot. Wired once
 *                                        (see gameplayDiagnostics.js) from the accessors a
 *                                        system already exposes. __ccDiag.snapshot() runs them.
 *   recordDiagEvent(channel, type, data) — append one structured record to a bounded ring
 *                                        buffer. A NO-OP when diagnostics are inactive, so
 *                                        production emission sites can call it unconditionally.
 *                                        This is what turns "did the announcer fire?" / "did
 *                                        the round wedge at a seam?" from eyeballing into a
 *                                        queryable log.
 *
 * On top of those, __ccDiag.captureBundle({scenario, reason}) assembles a self-contained
 * bug-capture bundle (snapshot + event log + runtime context + build stamp + timestamps)
 * for offline investigation — triggered in-app by a DEV hotkey (F8 / Ctrl+Shift+D), by the
 * harness on a failed check, or AUTOMATICALLY when an "error"/"assert" event lands: the hub
 * assembles a bundle a tick later (so trailing events of the same failure are included) and
 * keeps the last few under __ccDiag.captures(). Debounced + session-capped so an error loop
 * can't burn CPU assembling bundles.
 *
 * Gating:
 *   ?diag=1        — install the hub (snapshot + events + optional control). Works in prod
 *                    builds too, exactly like ?nettest / ?harness. Zero cost otherwise.
 *   __ccDiag.control — host-gated scenario levers (fast-end a round, grant KOs). Non-null
 *                    when the hub is installed and control was wired (DEV or prod, both under
 *                    ?diag=1); null if create failed or hub never installed. forceKillFeed is
 *                    DEV-only. The read surface never mutates game state by itself.
 *
 * Channels (event log): "round" | "score" | "ko" | "announcer" | "unlock" | "challenge"
 *   | "boot" | "error" | "scenario". Add more freely — the buffer is channel-agnostic.
 */

import { readBuildInfo } from "./buildInfo.js";
import { getCachedFreshness } from "./buildFreshness.js";

/** Max events retained in the ring buffer (oldest dropped first). */
const EVENT_BUFFER_MAX = 512;

/** Channels whose events auto-trigger a capture bundle (the "something is wrong" channels). */
const AUTO_CAPTURE_CHANNELS = new Set(["error", "assert"]);
/** Auto-captured bundles kept in memory (oldest dropped first). */
const AUTO_CAPTURE_MAX_KEPT = 3;
/** Hard cap per page load — an error loop must not keep assembling bundles. */
const AUTO_CAPTURE_MAX_PER_SESSION = 5;
/** Minimum spacing between auto-captures (one bundle per failure episode, not per event). */
const AUTO_CAPTURE_DEBOUNCE_MS = 5000;

/** @typedef {"round"|"score"|"ko"|"announcer"|"unlock"|"challenge"|"boot"|"error"|"scenario"|string} DiagChannel */

/**
 * @typedef {object} DiagEvent
 * @property {number} seq   Monotonic sequence id (drivers poll `events(sinceSeq)`).
 * @property {number} t     performance.now() at record time (ms).
 * @property {DiagChannel} ch
 * @property {string} type  Short event name within the channel (e.g. "phase", "add", "fatal").
 */

let active = false;
let seq = 0;
/** @type {DiagEvent[]} */
const events = [];
/** @type {Map<string, () => unknown>} */
const probes = new Map();

/** The installed api object (needed by auto-capture to call captureBundle). */
let apiRef = null;
/** @type {Array<Record<string, unknown>>} */
const autoCaptures = [];
let autoCaptureCount = 0;
let lastAutoCaptureAtMs = -Infinity;

/** Cheap monotonic timestamp; falls back to 0 outside a browser (tests). */
function nowMs() {
  return typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0;
}

/** Wall-clock ISO stamp for capture bundles; null if Date is somehow unavailable. */
function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return null;
  }
}

/**
 * @returns {boolean} True once installDiagnostics has run (i.e. ?diag was present).
 */
export function isDiagActive() {
  return active;
}

/**
 * Append one structured event to the ring buffer. No-op (single boolean read, immediate
 * return) when diagnostics are inactive, so production emission sites call it unconditionally.
 * `data` is shallow-spread into the record — pass plain primitives, never live object refs.
 *
 * @param {DiagChannel} channel
 * @param {string} type
 * @param {Record<string, unknown>} [data]
 * @returns {number} The event's seq id, or 0 when inactive.
 */
export function recordDiagEvent(channel, type, data) {
  if (!active) return 0;
  seq += 1;
  /** @type {DiagEvent} */
  const evt = { seq, t: nowMs(), ch: channel, type, ...(data || {}) };
  events.push(evt);
  if (events.length > EVENT_BUFFER_MAX) events.shift();
  if (AUTO_CAPTURE_CHANNELS.has(channel)) scheduleAutoCapture(channel, type);
  return seq;
}

/**
 * Automatic bug capture: when an error/assert event lands, assemble a bundle one tick later
 * (so trailing events of the same failure episode are included) and retain it under
 * __ccDiag.captures(). Debounced per episode and capped per session — an error loop must
 * never turn into a bundle-assembly loop. Capture failures are swallowed: evidence
 * collection can never break the app it is observing.
 *
 * @param {string} channel
 * @param {string} type
 */
function scheduleAutoCapture(channel, type) {
  if (!apiRef) return;
  if (autoCaptureCount >= AUTO_CAPTURE_MAX_PER_SESSION) return;
  const now = nowMs();
  if (now - lastAutoCaptureAtMs < AUTO_CAPTURE_DEBOUNCE_MS) return;
  lastAutoCaptureAtMs = now;
  autoCaptureCount += 1;
  setTimeout(() => {
    try {
      const bundle = apiRef.captureBundle({ scenario: "auto", reason: `${channel}/${type}` });
      autoCaptures.push(bundle);
      if (autoCaptures.length > AUTO_CAPTURE_MAX_KEPT) autoCaptures.shift();
      // eslint-disable-next-line no-console
      console.warn(`[diag] auto-captured bundle (${channel}/${type}) — __ccDiag.captures()`);
    } catch {
      /* never throw from evidence collection */
    }
  }, 0);
}

/**
 * Register (or replace) a namespaced read-only state probe. No-op when inactive so callers
 * need no guard of their own. The function is invoked lazily by `__ccDiag.snapshot()`.
 *
 * @param {string} ns
 * @param {() => unknown} snapshotFn
 * @returns {void}
 */
export function registerDiagProbe(ns, snapshotFn) {
  if (!active) return;
  if (typeof snapshotFn !== "function") return;
  probes.set(ns, snapshotFn);
}

/**
 * @typedef {object} DiagControl Host-gated scenario levers (gameplayDiagnostics.js / devControl.js).
 *   Each reuses an existing, proven production path — nothing here is a new mutation route.
 *   Present on __ccDiag when ?diag=1 and createDevControl succeeded (DEV or prod).
 * @property {(remainMs?: number) => { ok: boolean, message: string, reason?: string }} [rewindRoundClock] Fast-end a running round by
 *   rewinding the round-start stamp so only `remainMs` remains (the Force-Sudden-Death trick).
 * @property {(level: string, n: number) => { ok: boolean, message: string, reason?: string }} [grantKos] Credit N KOs on a level (unlock funnel).
 * @property {(scores: Record<number, number>) => { ok: boolean, message: string, reason?: string }} [setScores] Replace all slot scores on the host.
 * @property {() => { ok: boolean, message: string, reason?: string }} [forceSuddenDeath] Arm the natural timed-round Sudden Death path.
 */

/**
 * Install the diagnostics hub. Called once from main.js when ?diag is present.
 *
 * @param {{ flags?: Record<string, unknown>, control?: DiagControl | null }} [opts]
 * @returns {void}
 */
export function installDiagnostics(opts = {}) {
  active = true;
  if (typeof window !== "undefined") {
    /** @type {any} */ (window).__ccDiagActive = true;
  }

  /** @type {any} */
  const api = {
    version: 1,
    get active() {
      return active;
    },
    flags: opts.flags || {},

    /** Registered probe namespaces. */
    probes() {
      return [...probes.keys()];
    },

    /**
     * Run one probe (or all) and return the structured snapshot. Each probe is guarded so a
     * throwing getter degrades to `{ error }` for that namespace instead of breaking the read.
     * @param {string} [ns]
     * @returns {Record<string, unknown> | unknown}
     */
    snapshot(ns) {
      const runOne = (fn) => {
        try {
          return fn();
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      };
      if (ns) {
        const fn = probes.get(ns);
        return fn ? runOne(fn) : null;
      }
      /** @type {Record<string, unknown>} */
      const out = { t: nowMs(), tail: seq };
      for (const [key, fn] of probes) out[key] = runOne(fn);
      return out;
    },

    /**
     * Events newer than `sinceSeq` (0 = all retained). Drivers poll this to assert a sequence
     * of things happened (e.g. countdown_3 → countdown_2 → go → running).
     * @param {number} [sinceSeq]
     * @returns {DiagEvent[]}
     */
    events(sinceSeq = 0) {
      return sinceSeq > 0 ? events.filter((e) => e.seq > sinceSeq) : events.slice();
    },

    /** Highest event seq recorded so far (a cheap "cursor" to poll deltas against). */
    get tail() {
      return seq;
    },

    /**
     * Assemble a self-contained bug-capture bundle: everything needed to investigate a failure
     * without reproducing it by hand. Pure read — runs every probe and copies the event log; it
     * never mutates game state. The screenshot (Playwright) and any file write happen OUTSIDE
     * the page (see tools/lib/harness.mjs dumpFailureBundle) — this returns the serializable core.
     *
     * Runtime/device info (userAgent, GPU, quality tier, DPR) rides in via the "runtime" probe
     * registered in gameplayDiagnostics.js, so it lands under `snapshot.runtime`. There is no
     * gameplay RNG seed to record (arena selection is unseeded Math.random) — `seed` is null.
     *
     * @param {{ scenario?: string, reason?: string }} [meta]
     * @returns {Record<string, unknown>}
     */
    captureBundle(meta = {}) {
      const snap = api.snapshot();
      const evts = events.slice();
      /** @type {Record<string, number>} */
      const eventCounts = {};
      for (const e of evts) eventCounts[e.ch] = (eventCounts[e.ch] || 0) + 1;
      const round = /** @type {any} */ (snap)?.round;
      return {
        bundleVersion: 2,
        scenario: meta.scenario ?? null,
        reason: meta.reason ?? null,
        capturedAt: nowIso(),
        capturedAtPerfMs: nowMs(),
        build: readBuildInfo(),
        // * Stale-cache verdict (loaded bundle vs live-deployed). { checked:false } if the
        // * boot check hasn't resolved yet; manualCapture awaits a fresh check before this.
        // * A capture with buildFreshness.stale===true was taken on an OLD bundle — discount it.
        buildFreshness: getCachedFreshness(),
        phase: round && typeof round === "object" ? (round.phase ?? null) : null,
        flags: api.flags,
        tail: seq,
        seed: null, // * No exposed gameplay RNG seed exists (unseeded arena pick); documented, not a gap.
        eventCounts,
        events: evts,
        snapshot: snap,
      };
    },

    /**
     * Auto-captured bundles (newest last) — assembled automatically when error/assert
     * events landed. Bounded to the last few; a copy, safe to inspect or serialize.
     */
    captures() {
      return autoCaptures.slice();
    },

    /**
     * Host-gated scenario levers. Non-null when hub installed and control was wired
     * (DEV or prod, both under ?diag=1); null if create failed or hub never installed.
     */
    control: opts.control || null,
  };

  apiRef = api;
  /** @type {any} */ (window).__ccDiag = api;

  // eslint-disable-next-line no-console
  console.info("[diag] installed — window.__ccDiag ready", `(control=${api.control ? "on" : "off"})`);
}

/**
 * Parse the diagnostics URL flags without pulling in debugParams (this module stays
 * self-contained so tools and tests can import it in isolation).
 *
 * @param {string} [search]
 * @returns {{ enabled: boolean } & Record<string, string | boolean>}
 */
export function diagUrlFlags(search) {
  const raw = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(raw || "");
  const truthy = (v) => v !== null && v !== "0" && v !== "false" && v !== "off";
  return {
    enabled: params.has("diag") && truthy(params.get("diag")),
  };
}

/**
 * Test-only reset of module state (the ring buffer + registry are module singletons).
 * Not wired anywhere in the app; exported for deterministic unit tests.
 * @returns {void}
 */
export function __resetDiagnosticsForTest() {
  active = false;
  seq = 0;
  events.length = 0;
  probes.clear();
  apiRef = null;
  autoCaptures.length = 0;
  autoCaptureCount = 0;
  lastAutoCaptureAtMs = -Infinity;
  if (typeof window !== "undefined") {
    delete (/** @type {any} */ (window).__ccDiag);
    delete (/** @type {any} */ (window).__ccDiagActive);
  }
}
