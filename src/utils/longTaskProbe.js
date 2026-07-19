/**
 * longTaskProbe.js — Run-7 P0 forensics for multi-second host freezes.
 *
 * Friend 2-human (cap-38, 4090 host): multi-second `perf/longframe` with `resume:true`
 * matched friend tHost snap gaps 1:1. Lab dual-PC after announcer warm was clean.
 * Existing probes only show *that* rAF stalled, not *what* blocked the main thread
 * (GC, audio decode, Rapier, Chrome scheduling) vs a focus/occlusion gap.
 *
 * Under `?diag=1` only:
 *   - PerformanceObserver("longtask") ring + counters (browser reports tasks ≥50ms)
 *   - Focus/visibility snapshot helpers for longframe enrichment
 *
 * Zero cost when not installed. Never mutates gameplay.
 */

import { isDiagActive, recordDiagEvent } from "./diagnostics.js";

/** Keep enough recent tasks to cover a multi-second freeze window. */
const RECENT_MAX = 48;
/** Only emit event-ring records for substantial tasks (ring is shared). */
const EVENT_MIN_MS = 100;
/** Rate-limit longtask event emission so a hitch storm cannot flush the ring. */
const EVENT_RATE_MS = 250;

/**
 * @typedef {object} LongTaskSample
 * @property {number} t       performance.now() when the task *ended* (approx)
 * @property {number} start   performance.now() when the task started
 * @property {number} durMs   duration ms
 * @property {string} name    attribution name or entry name ("self", "unknown", …)
 */

/** @type {LongTaskSample[]} */
let recent = [];
/** @type {{ count: number, maxMs: number, sumMs: number, over100: number, over500: number, over1000: number }} */
let stats = emptyStats();
let installed = false;
/** @type {PerformanceObserver | null} */
let observer = null;
let lastEventAtMs = -Infinity;

function emptyStats() {
  return { count: 0, maxMs: 0, sumMs: 0, over100: 0, over500: 0, over1000: 0 };
}

/**
 * Best-effort name from a Long Task PerformanceEntry.
 * Chrome often leaves attribution empty — still useful as duration evidence.
 * @param {PerformanceEntry} entry
 * @returns {string}
 */
function nameFromEntry(entry) {
  try {
    const attr = /** @type {any} */ (entry).attribution;
    if (Array.isArray(attr) && attr.length > 0) {
      const a = attr[0];
      const bits = [a.name, a.containerType, a.containerName, a.containerSrc]
        .filter((x) => typeof x === "string" && x.length > 0);
      if (bits.length) return bits.join("|").slice(0, 120);
    }
  } catch {
    /* attribution shape varies */
  }
  const n = entry.name;
  return typeof n === "string" && n.length > 0 ? n.slice(0, 80) : "unknown";
}

/**
 * Record one long task (observer or test injection).
 * @param {{ start: number, durMs: number, name?: string }} sample
 */
export function noteLongTask(sample) {
  const durMs = Math.max(0, Math.round(sample.durMs));
  const start = typeof sample.start === "number" ? sample.start : 0;
  const t = start + durMs;
  const name = typeof sample.name === "string" && sample.name ? sample.name.slice(0, 120) : "unknown";

  /** @type {LongTaskSample} */
  const row = { t, start, durMs, name };
  recent.push(row);
  if (recent.length > RECENT_MAX) recent.shift();

  stats.count += 1;
  stats.sumMs += durMs;
  if (durMs > stats.maxMs) stats.maxMs = durMs;
  if (durMs > 100) stats.over100 += 1;
  if (durMs > 500) stats.over500 += 1;
  if (durMs > 1000) stats.over1000 += 1;

  // * Event ring only when diag is live and the task is big enough to matter for freezes.
  if (!isDiagActive() || durMs < EVENT_MIN_MS) return;
  if (t - lastEventAtMs < EVENT_RATE_MS) return;
  lastEventAtMs = t;
  recordDiagEvent("perf", "longtask", { durMs, name, start: Math.round(start) });
}

/**
 * Install the browser Long Task observer. Idempotent. No-op when the API is missing
 * (Firefox, older Safari — longframe focus flags still work without it).
 * @returns {boolean} true if the observer is active
 */
export function installLongTaskProbe() {
  if (installed) return Boolean(observer);
  installed = true;

  if (typeof PerformanceObserver === "undefined") return false;
  try {
    // * supportedEntryTypes is the feature-detect; "longtask" is Chromium-first.
    const supported = PerformanceObserver.supportedEntryTypes;
    if (Array.isArray(supported) && !supported.includes("longtask")) return false;
  } catch {
    /* older engines */
  }

  try {
    observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        noteLongTask({
          start: e.startTime,
          durMs: e.duration,
          name: nameFromEntry(e),
        });
      }
    });
    // * buffered:true pulls tasks that fired between page load and install (play-entry).
    observer.observe({ type: "longtask", buffered: true });
    return true;
  } catch {
    observer = null;
    return false;
  }
}

/**
 * Tasks whose time range overlaps `[sinceMs, untilMs]` (performance.now domain).
 * @param {number} sinceMs
 * @param {number} [untilMs]
 * @returns {LongTaskSample[]}
 */
export function getRecentLongTasks(sinceMs, untilMs = Infinity) {
  return recent.filter((r) => r.t >= sinceMs && r.start <= untilMs);
}

/** @returns {{ count: number, maxMs: number, sumMs: number, over100: number, over500: number, over1000: number, installed: boolean, observing: boolean }} */
export function getLongTaskStats() {
  return {
    ...stats,
    installed,
    observing: Boolean(observer),
  };
}

/**
 * Focus / visibility snapshot for longframe enrichment.
 * Distinguishes true main-thread blocks from tab hide / unfocused occlusion.
 * @returns {{ hidden: boolean | null, vis: string | null, focused: boolean | null }}
 */
export function getFocusSnapshot() {
  if (typeof document === "undefined") {
    return { hidden: null, vis: null, focused: null };
  }
  let focused = null;
  try {
    if (typeof document.hasFocus === "function") focused = document.hasFocus();
  } catch {
    focused = null;
  }
  return {
    hidden: Boolean(document.hidden),
    vis: typeof document.visibilityState === "string" ? document.visibilityState : null,
    focused,
  };
}

/**
 * Compact long-task list for embedding on a longframe event (bounded size).
 * Cap-47 race: rAF longframe sometimes logs a few ms before PerformanceObserver
 * delivers into our ring — fall back to the browser entry buffer so multi-s
 * freezes still carry `lt[]` on the longframe row.
 * @param {number} gapStartMs performance.now at the start of the rAF gap
 * @param {number} gapEndMs performance.now when the long frame was observed
 * @param {number} [max=6]
 * @returns {{ d: number, n: string }[]}
 */
export function longTasksForGap(gapStartMs, gapEndMs, max = 6) {
  const pad = 50;
  /** @type {LongTaskSample[]} */
  let hits = getRecentLongTasks(gapStartMs - pad, gapEndMs + pad);
  if (hits.length === 0 && typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
    try {
      const entries = performance.getEntriesByType("longtask");
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        const start = e.startTime;
        const durMs = Math.round(e.duration);
        const end = start + durMs;
        if (end < gapStartMs - pad || start > gapEndMs + pad) continue;
        hits.push({ t: end, start, durMs, name: nameFromEntry(e) });
      }
    } catch {
      /* */
    }
  }
  // * Largest first — multi-second freezes care about the big one, not 50ms noise.
  hits.sort((a, b) => b.durMs - a.durMs);
  return hits.slice(0, max).map((h) => ({ d: h.durMs, n: h.name }));
}

/** Test-only reset. */
export function __resetLongTaskProbeForTest() {
  if (observer) {
    try {
      observer.disconnect();
    } catch {
      /* */
    }
  }
  observer = null;
  installed = false;
  recent = [];
  stats = emptyStats();
  lastEventAtMs = -Infinity;
}
