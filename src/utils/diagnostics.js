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
 * Gating:
 *   ?diag=1        — install the read surface (snapshot + events). Works in prod builds too
 *                    (read-only QA), exactly like ?nettest / ?harness. Zero cost otherwise.
 *   __ccDiag.control — DEV-only scenario levers (fast-end a round, grant KOs). Never attached
 *                    in a production build; the read surface never mutates game state.
 *
 * Channels (event log): "round" | "score" | "ko" | "announcer" | "unlock" | "challenge"
 *   | "boot" | "error" | "scenario". Add more freely — the buffer is channel-agnostic.
 */

/** Max events retained in the ring buffer (oldest dropped first). */
const EVENT_BUFFER_MAX = 512;

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

/** Cheap monotonic timestamp; falls back to 0 outside a browser (tests). */
function nowMs() {
  return typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0;
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
  return seq;
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
 * @typedef {object} DiagControl DEV-only scenario levers (see gameplayDiagnostics.js). Each
 *   reuses an existing, proven production path — nothing here is a new mutation route.
 * @property {(remainMs?: number) => boolean} [rewindRoundClock] Fast-end a running round by
 *   rewinding the round-start stamp so only `remainMs` remains (the Force-Sudden-Death trick).
 * @property {(level: string, n: number) => void} [grantKos] Credit N KOs on a level (unlock funnel).
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

    /** DEV-only scenario levers; null in production builds / read-only sessions. */
    control: opts.control || null,
  };

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
  if (typeof window !== "undefined") {
    delete (/** @type {any} */ (window).__ccDiag);
    delete (/** @type {any} */ (window).__ccDiagActive);
  }
}
