/**
 * perfSpans.js — name the code that ate a frozen frame.
 *
 * WHY THIS EXISTS: longframe diag events already carry `lt[]` (PerformanceLongTaskTiming),
 * but Chrome attributes nearly every long task to "unknown|window" — a 300ms host freeze
 * shows its DURATION but never its CAUSE. The open 07-21 forensics item is 1–8s host
 * freezes clustered near KO / PA. The prime suspects there (cart-shatter VFX, announcer
 * PA audio, the physics step) are SYNCHRONOUS main-thread work we can name ourselves.
 *
 * `mark(name, fn)` wraps a suspect call, times it, and drops a record into a ring buffer.
 * When a longframe fires, `spansOverlapping(frameStart, frameEnd)` returns the named spans
 * that ran inside the frozen window — turning "unknown|window 288ms" into "vfx.shatter 240ms".
 *
 * Cheap: one performance.now() pair per wrapped call, recorded only if it clears
 * MIN_SPAN_MS (a 1ms call is not a freeze suspect). Timebase is performance.now(), the
 * same domain as rAF timestamps and PerformanceEntry.startTime, so overlap math lines up
 * with the loop's `now`/`gapStart` and longTasksForGap(). Guard-safe, zero imports.
 */

/** Spans shorter than this aren't freeze suspects — don't spend a ring slot on them. */
const MIN_SPAN_MS = 4;
/** Ring capacity — a few seconds of suspect spans at gameplay rates. */
const RING = 96;

/** @typedef {{ n: string, d: number, end: number }} Span */
/** @type {Span[]} */
let ring = [];

/**
 * Time a synchronous suspect call and record it if it's long enough to matter. Behavior-
 * preserving: returns fn()'s value, re-throws its errors (still timed, via finally).
 * @template T
 * @param {string} name  Stable label, e.g. "vfx.shatter", "pa.sting", "physics.step".
 * @param {() => T} fn
 * @returns {T}
 */
export function mark(name, fn) {
  if (typeof performance === "undefined" || typeof performance.now !== "function") return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const t1 = performance.now();
    const d = t1 - t0;
    if (d >= MIN_SPAN_MS) {
      ring.push({ n: name, d: Math.round(d * 10) / 10, end: t1 });
      if (ring.length > RING) ring.shift();
    }
  }
}

/**
 * Named spans whose execution overlapped [startMs, endMs] (a frozen frame's window),
 * longest first. A span is attributed to the window if it ENDED inside it (± slack).
 * @param {number} startMs  performance.now() at frame start (loop `gapStart`).
 * @param {number} endMs    performance.now() at frame end (loop `now`).
 * @param {number} [max]    Cap the list so a storm can't bloat the bundle.
 * @returns {Array<{ n: string, d: number }>}
 */
export function spansOverlapping(startMs, endMs, max = 8) {
  const slack = 2;
  return ring
    .filter((s) => s.end >= startMs - slack && s.end <= endMs + slack)
    .sort((a, b) => b.d - a.d)
    .slice(0, max)
    .map((s) => ({ n: s.n, d: s.d }));
}

/** Test seam — clear the ring between cases. */
export function _resetSpans() {
  ring = [];
}
