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
/** Live per-channel occupancy of `events`, so eviction can find the loudest channel in O(#channels). */
/** @type {Map<string, number>} */
const channelCounts = new Map();
/** @type {Map<string, () => unknown>} */
const probes = new Map();

/** The installed api object (needed by auto-capture to call captureBundle). */
let apiRef = null;
/** @type {Array<Record<string, unknown>>} */
const autoCaptures = [];
let autoCaptureCount = 0;
/**
 * Bumped on every install and teardown (DIAG-FLAKE-1). Auto-capture assembles a tick late, and
 * the deferred callback reads `apiRef` at FIRE time — so a capture scheduled against one hub
 * could land against the next one, after a teardown+reinstall. Harmless-looking, but it writes
 * a bundle into a session that never asked for it (and made the test suite intermittently red).
 * The scheduler captures this value and no-ops if it moved.
 */
let hubGeneration = 0;
let lastAutoCaptureAtMs = -Infinity;
/**
 * Deferred bundle assemblies not yet fired, and uploads still in flight (DIAG-FLAKE-2).
 *
 * Auto-capture is fire-and-forget on every axis, which is right for production — evidence
 * collection must never block the app. But it left nothing able to ask "is that work done
 * yet?", so the tests drained it by counting macrotask turns. Measured, that guess is wrong:
 * the first `import("./captureUpload.js")` in a vite-node worker is a real module load costing
 * 4ms warm and 21-81ms under full-suite load, while eight `setTimeout(0)` turns are ~8-16ms.
 *
 * A Set of timer ids rather than one id, because `installDiagnostics` can be re-entered while
 * a capture is still queued: one slot would lose the older id, and the survivor would clear
 * the newer one's — the DIAG-FLAKE-1 shape rebuilt one layer down.
 */
const pendingCaptureTimers = new Set();
/** @type {Set<Promise<unknown>>} */
const inflightUploads = new Set();
/** Drain poll interval. 10ms per condition-based-waiting.md, which warns off 1ms. */
const DRAIN_POLL_MS = 10;

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
  bumpChannelCount(channel, 1);
  if (events.length > EVENT_BUFFER_MAX) evictOneEvent();
  if (AUTO_CAPTURE_CHANNELS.has(channel)) scheduleAutoCapture(channel, type);
  return seq;
}

/**
 * Keep `channelCounts` in step with `events`. Deleting at zero keeps the map's size equal to
 * the number of channels actually present, which is what makes the eviction scan cheap.
 * @param {string} ch
 * @param {number} delta
 */
function bumpChannelCount(ch, delta) {
  const n = (channelCounts.get(ch) || 0) + delta;
  if (n > 0) channelCounts.set(ch, n);
  else channelCounts.delete(ch);
}

/**
 * Make room for one event — NOT plain FIFO.
 *
 * Why (ROUND-WEDGE-1): cap-217's 512-slot ring arrived holding exactly two event types,
 * because 171 identical asserts fired at ~40ms and a FIFO ring let them evict everything
 * else. The single most interesting session this project has recorded therefore carried no
 * boot timeline, no perf spans and no warmupSettle — the storm destroyed the context that
 * would have explained it.
 *
 * So: drop the oldest event from whichever channel currently occupies the MOST slots,
 * rather than the oldest event overall. A flooding channel is by definition the largest, so
 * it eats its own evictions and can never push a quiet channel below parity with it. When
 * one channel is all there is, the largest channel IS the storm and this degrades to FIFO,
 * which is correct — there is nothing else left to protect.
 *
 * Deliberately not a tunable per-channel floor constant: channels are added freely (the
 * buffer is channel-agnostic by design), so any fixed table would silently stop covering
 * new ones. Parity needs no configuration and cannot go stale.
 */
function evictOneEvent() {
  let worstCh = null;
  let worstN = 0;
  for (const [ch, n] of channelCounts) {
    if (n > worstN) {
      worstN = n;
      worstCh = ch;
    }
  }
  const idx = worstCh == null ? 0 : events.findIndex((e) => e.ch === worstCh);
  const [dropped] = events.splice(idx < 0 ? 0 : idx, 1);
  if (dropped) bumpChannelCount(dropped.ch, -1);
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
  const scheduledForGeneration = hubGeneration;
  const timerId = setTimeout(() => {
    // * Deregister FIRST — before the generation check and before anything that can throw, or
    // * a fired timer stays in the pending set and __drainAutoCapturesForTest waits out its
    // * whole timeout on a path that actually succeeded.
    pendingCaptureTimers.delete(timerId);
    // * The hub this capture was scheduled for is gone (torn down, or torn down and
    // * reinstalled). Dropping it is correct: the bundle would describe a session that no
    // * longer exists, and it would be filed against whoever installed next.
    if (scheduledForGeneration !== hubGeneration) return;
    try {
      const bundle = apiRef.captureBundle({ scenario: "auto", reason: `${channel}/${type}` });
      autoCaptures.push(bundle);
      if (autoCaptures.length > AUTO_CAPTURE_MAX_KEPT) autoCaptures.shift();
      // eslint-disable-next-line no-console
      console.warn(`[diag] auto-captured bundle (${channel}/${type}) — __ccDiag.captures()`);
      uploadAutoCapture(bundle, channel, type, scheduledForGeneration);
    } catch {
      /* never throw from evidence collection */
    }
  }, 0);
  pendingCaptureTimers.add(timerId);
}

/**
 * Ship an auto-captured bundle to the same `/api/captures` endpoint F8 posts to, so the
 * next occurrence is pullable with `npm run captures:pull` instead of dying in memory.
 *
 * Why this exists (ROUND-WEDGE-1): cap-217 caught the podium⇄running storm in production,
 * but the only reason we have ANY of it is that Wyatt happened to press F8. Up to
 * AUTO_CAPTURE_MAX_PER_SESSION bundles holding the pre-storm state had already been
 * assembled and were sitting in `__ccDiag.captures()` — never uploaded, then lost with the
 * tab. An intermittent bug that only reproduces on someone else's machine cannot be
 * investigated through a hotkey nobody remembers to press.
 *
 * Gating is STRUCTURAL, not a flag checked here: auto-capture requires `apiRef`, which only
 * exists after installDiagnostics(), which main.js calls only under `?diag=1`. Keep it that
 * way — installing the hub unconditionally would turn ordinary players into uploaders.
 * `tests/diagnostics.test.js` pins that relationship.
 *
 * Fire-and-forget on every axis: no await, failures only warn, and the whole thing is
 * skipped where fetch does not exist (unit tests, SSR). Evidence collection must never
 * break the app it is observing.
 *
 * Generation guard (DIAG-UPLOAD-GEN-1): the timer already drops assembly if the hub moved;
 * this continues that lineage across the dynamic-import yield and skips success/fail logs if
 * the hub moved after fetch started. Deliberately does not abort an in-flight POST —
 * evidence collection stays non-blocking on every axis.
 *
 * @param {Record<string, unknown>} bundle
 * @param {string} channel
 * @param {string} type
 * @param {number} [targetGeneration=hubGeneration] Hub generation this upload was scheduled for.
 */
function uploadAutoCapture(bundle, channel, type, targetGeneration = hubGeneration) {
  if (typeof fetch !== "function") return;
  // * Build the whole chain and register it BEFORE awaiting anything (DIAG-FLAKE-2). Populate
  // * the set after the first yield and a drain can observe an empty set while the upload is
  // * still running — the exact hole the drain exists to close.
  const chain = import("./captureUpload.js")
    .then(({ uploadCaptureBundle, deriveDefaultLabel }) => {
      // * Hub torn down / reinstalled during the import yield — drop before POST (DIAG-UPLOAD-GEN-1).
      if (targetGeneration !== hubGeneration) return null;
      return uploadCaptureBundle(bundle, {
        // * Prefix so a pulled capture says at a glance that nobody pressed a key for it,
        // * and carries which channel tripped it — `auto-assert-podium-host-high`.
        label: `auto-${channel}-${deriveDefaultLabel(bundle)}`,
      });
    })
    .then((up) => {
      // * Logging only: a POST already in flight is not aborted (fire-and-forget).
      if (!up || targetGeneration !== hubGeneration) return;
      if (up.ok) {
        // eslint-disable-next-line no-console
        console.info(
          `[diag] auto-capture (${channel}/${type}) uploaded → id=${up.id} (pull: npm run captures:pull)`,
        );
      } else {
        console.warn(`[diag] auto-capture upload failed: ${up.error ?? "unknown"}`);
      }
    })
    .catch(() => {
      /* never throw from evidence collection */
    });
  inflightUploads.add(chain);
  chain.finally(() => inflightUploads.delete(chain));
}

/**
 * Test-only: resolve once no auto-capture is pending and no upload is in flight.
 *
 * Not wired anywhere in the app; exported so unit tests can wait for the *condition* instead
 * of guessing at a turn count. `tests/diagnostics.test.js` used to drain with a fixed number
 * of `setTimeout(0)` turns, which flaked under full-suite load because the dynamic import it
 * was really waiting on is 5-20x slower than the budget it was given (DIAG-FLAKE-2).
 *
 * Bounded on purpose: an unbounded idle-wait would turn one hung `fetch` into a stuck suite,
 * which is worse than the flake it replaces. The 2s cap sits well inside vitest's 5s default
 * so the failure names itself instead of arriving as a bare timeout.
 *
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export async function __drainAutoCapturesForTest(timeoutMs = 2000) {
  // * Date.now(), not nowMs(): nowMs() degrades to a constant 0 where `performance` is
  // * missing, which would make the deadline unreachable and hang forever.
  const deadline = Date.now() + timeoutMs;
  while (pendingCaptureTimers.size > 0 || inflightUploads.size > 0) {
    if (Date.now() > deadline) {
      const stuck = `timers=${pendingCaptureTimers.size}, uploads=${inflightUploads.size}`;
      // * Give up ON the work, not merely on waiting for it. Leaving a genuinely stuck chain
      // * registered makes every later drain time out too, turning one failure into a cascade
      // * — measured: one hung upload took a 25-test file from 0 to 8 failures and 0.5s to
      // * 115s. Only the tracking is dropped; a chain that does eventually finish still
      // * deregisters itself, and Set.delete of an absent entry is a no-op.
      pendingCaptureTimers.clear();
      inflightUploads.clear();
      throw new Error(`__drainAutoCapturesForTest: still busy after ${timeoutMs}ms (${stuck})`);
    }
    // * Await the real promises when there are any, so the common case costs one upload
    // * rather than a poll interval. Only poll while a bare timer is outstanding.
    //
    // * Both branches race the remaining budget. Awaiting a slow chain outright would sail
    // * straight past `deadline` — the loop only re-checks between awaits — and the timeout
    // * would be a lie: a 400ms upload against a 50ms budget resolved instead of throwing.
    const remaining = Math.max(0, deadline - Date.now());
    const wake = new Promise((r) => setTimeout(r, Math.min(DRAIN_POLL_MS, remaining)));
    if (inflightUploads.size > 0) await Promise.race([...inflightUploads, wake]);
    else await wake;
  }
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
  hubGeneration += 1;
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
  // * Invalidates any auto-capture already scheduled against the outgoing hub (DIAG-FLAKE-1).
  hubGeneration += 1;
  // * Second layer under that guard (DIAG-FLAKE-2): cancel the timers rather than only
  // * neutering them at fire time, so a teardown means teardown.
  //
  // * Honest about its coverage: this layer has NO independently observable behaviour. Every
  // * path converges because the generation guard already drops a fired straggler, so no test
  // * can null-arm it on its own — it is hygiene, not a proven guarantee. Kept because it is
  // * three lines and makes the stray timer impossible rather than merely harmless.
  //
  // * Deliberately does NOT clear `inflightUploads`: those are live promises that deregister
  // * themselves, and dropping the handle mid-flight is the very leak the drain exists to
  // * close.
  for (const id of pendingCaptureTimers) clearTimeout(id);
  pendingCaptureTimers.clear();
  seq = 0;
  events.length = 0;
  channelCounts.clear();
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
