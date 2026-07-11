/**
 * blackFrameMonitor.js — opt-in, real-hardware black-frame flicker probe.
 *
 * Enabled by `?blackmon=1` (see debugParams). Samples the live WebGL canvas
 * once per rendered frame at low resolution and reports intermittent pure-black
 * regions — the VFX-1 flicker bug — with hard numbers instead of eyeballing.
 *
 * WHY this exists: the offline blackframes battery runs headless SwiftShader
 * (software GL) and cannot reproduce the NVIDIA/ANGLE HalfFloat driver quirk.
 * This monitor runs in the *user's* real browser during a real playtest, so it
 * measures the bug where it actually happens. It cannot fix the bug — it turns
 * "it flickered a couple times, felt bad" into per-config event counts + the
 * left/right slab signature the handover describes.
 *
 * TIMING (critical): the sample must run SYNCHRONOUSLY right after the frame is
 * rendered (same rAF task) — see tickBlackFrameMonitor() called from
 * frameVisuals. The renderer uses preserveDrawingBuffer:false, so a read from a
 * *separate* rAF returns the cleared (all-black) buffer. We deliberately do NOT
 * force preserveDrawingBuffer on, because that changes buffer management and
 * could mask the very driver race we are trying to observe.
 *
 * Overhead: one downscaled drawImage + getImageData per frame forces a GPU→CPU
 * readback. Acceptable for a diagnostic session; do not leave it on for perf work.
 */

/**
 * @typedef {object} BlackEvent
 * @property {number} n         1-based event index
 * @property {number} tMs       ms since monitor start
 * @property {number} frame     frame index at onset
 * @property {number} full      full-frame black ratio (0..1)
 * @property {number} left      left-half black ratio (0..1)
 * @property {number} right     right-half black ratio (0..1)
 * @property {"full" | "left" | "right"} side  dominant slab
 * @property {number} durationFrames  frames the event lasted
 */

/** @typedef {{ sample: () => void, summary: () => object, stop: () => object }} Monitor */

/** @type {Monitor | null} Module singleton — one active monitor at a time. */
let active = null;

/**
 * @param {object} opts
 * @param {() => HTMLCanvasElement | null} opts.getCanvas
 * @param {number} [opts.sampleWidth]   downscaled sample width (px), default 80
 * @param {number} [opts.threshold]     per-channel black cutoff (0..255), default 4
 * @param {number} [opts.eventRatio]    region black ratio that counts as an event, default 0.35
 * @param {boolean} [opts.overlay]      draw the live on-screen counter, default true
 * @returns {Monitor}
 */
export function startBlackFrameMonitor(opts) {
  const getCanvas = opts.getCanvas;
  const sampleW = Math.max(16, Math.floor(opts.sampleWidth ?? 80));
  const threshold = opts.threshold ?? 4;
  const eventRatio = opts.eventRatio ?? 0.35;
  const wantOverlay = opts.overlay !== false;

  const off = document.createElement("canvas");
  const ctx = off.getContext("2d", { willReadFrequently: true });

  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let frame = 0;
  let samples = 0;
  let unreadable = 0;
  /** @type {BlackEvent[]} */
  const events = [];
  /** @type {BlackEvent | null} */
  let activeEvent = null;
  let worstFull = 0;
  let worstLeft = 0;
  let worstRight = 0;
  let stopped = false;
  // * Loading screens / countdown / level-swap crossfades are legitimately full-black.
  // * Latch on the first clearly-rendered frame so those don't masquerade as flicker
  // * events; the VFX-1 bug is black frames *interrupting* live rendering.
  let hasContent = false;
  let skippedPreContent = 0;

  const overlay = wantOverlay ? makeOverlay() : null;

  /** @param {number} v */
  const pct = (v) => `${(v * 100).toFixed(0)}%`;

  /** @returns {{ full: number, left: number, right: number } | null} */
  function readCanvas() {
    const canvas = getCanvas?.();
    if (!canvas || !ctx) return null;
    const srcW = canvas.width || canvas.clientWidth || 0;
    const srcH = canvas.height || canvas.clientHeight || 0;
    if (srcW < 2 || srcH < 2) return null;

    const h = Math.max(2, Math.round(sampleW * (srcH / srcW)));
    if (off.width !== sampleW || off.height !== h) {
      off.width = sampleW;
      off.height = h;
    }
    try {
      ctx.drawImage(canvas, 0, 0, sampleW, h);
    } catch {
      unreadable += 1;
      return null;
    }
    let data;
    try {
      data = ctx.getImageData(0, 0, sampleW, h).data;
    } catch {
      unreadable += 1;
      return null;
    }

    const mid = Math.floor(sampleW / 2);
    let blackL = 0;
    let blackR = 0;
    let totL = 0;
    let totR = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < sampleW; x += 1) {
        const i = (y * sampleW + x) * 4;
        const isBlack =
          data[i] <= threshold && data[i + 1] <= threshold && data[i + 2] <= threshold;
        if (x < mid) {
          totL += 1;
          if (isBlack) blackL += 1;
        } else {
          totR += 1;
          if (isBlack) blackR += 1;
        }
      }
    }
    const left = totL > 0 ? blackL / totL : 0;
    const right = totR > 0 ? blackR / totR : 0;
    const full = (blackL + blackR) / (totL + totR || 1);
    return { full, left, right };
  }

  /** Sample the just-rendered frame. Call once per frame, synchronously after render. */
  function sample() {
    if (stopped) return;
    frame += 1;
    const r = readCanvas();
    if (!r) return;
    samples += 1;

    // * Wait for the first well-rendered frame before arming event detection.
    if (!hasContent) {
      if (r.full < eventRatio) hasContent = true;
      else {
        skippedPreContent += 1;
        if (overlay) {
          overlay.textContent = `BLK loading… (${skippedPreContent})`;
          overlay.style.color = "#8899aa";
        }
        return;
      }
    }

    if (r.full > worstFull) worstFull = r.full;
    if (r.left > worstLeft) worstLeft = r.left;
    if (r.right > worstRight) worstRight = r.right;

    // * Classify by half XOR, not full ratio: a pure left slab is L~1/R~0 → full~0.5,
    // * which would wrongly read as "full". left/right slabs are the unambiguous
    // * VFX-1 signature (loading/countdown/crossfade are always full-screen black).
    const leftBlack = r.left >= eventRatio;
    const rightBlack = r.right >= eventRatio;
    const isEvent = leftBlack || rightBlack;
    if (isEvent && !activeEvent) {
      const side = leftBlack && rightBlack ? "full" : leftBlack ? "left" : "right";
      activeEvent = {
        n: events.length + 1,
        tMs: Math.round(nowMs() - startMs),
        frame,
        full: +r.full.toFixed(3),
        left: +r.left.toFixed(3),
        right: +r.right.toFixed(3),
        side,
        durationFrames: 1,
      };
      events.push(activeEvent);
      // eslint-disable-next-line no-console
      console.warn(
        `[blackmon] EVENT #${activeEvent.n} ${activeEvent.side.toUpperCase()} t=${activeEvent.tMs}ms ` +
          `frame=${activeEvent.frame} full=${pct(r.full)} L=${pct(r.left)} R=${pct(r.right)}`,
      );
    } else if (isEvent && activeEvent) {
      activeEvent.durationFrames += 1;
      if (r.full > activeEvent.full) activeEvent.full = +r.full.toFixed(3);
    } else if (!isEvent && activeEvent) {
      // eslint-disable-next-line no-console
      console.warn(`[blackmon] EVENT #${activeEvent.n} ended (${activeEvent.durationFrames} frames)`);
      activeEvent = null;
    }

    if (overlay) {
      const bad = Boolean(activeEvent);
      overlay.textContent = `BLK L:${pct(r.left)} R:${pct(r.right)}  ev:${events.length}  ${samples}f`;
      overlay.style.color = bad ? "#ff3b3b" : "#39ff88";
    }
  }

  function summary() {
    const durMs = Math.round(nowMs() - startMs);
    const left = events.filter((e) => e.side === "left").length;
    const right = events.filter((e) => e.side === "right").length;
    const full = events.filter((e) => e.side === "full").length;
    return {
      durationSec: +(durMs / 1000).toFixed(1),
      samples,
      unreadable,
      skippedPreContent,
      // * slabEvents = the VFX-1 smoking gun (half-screen black; loading can't do this).
      // * fullBlackEvents = ambiguous (real flicker OR match-load/level-swap transitions).
      slabEvents: left + right,
      fullBlackEvents: full,
      events: events.length,
      bySide: { full, left, right },
      worst: { full: +worstFull.toFixed(3), left: +worstLeft.toFixed(3), right: +worstRight.toFixed(3) },
      eventLog: events,
    };
  }

  function stop() {
    if (stopped) return summary();
    stopped = true;
    const s = summary();
    // eslint-disable-next-line no-console
    console.log("[blackmon] summary", s);
    overlay?.remove();
    if (active === monitor) active = null;
    return s;
  }

  /** @type {Monitor} */
  const monitor = { sample, summary, stop };
  active = monitor;

  /** @type {any} */ (window).__blackMon = {
    summary,
    stop,
    get events() {
      return events;
    },
  };

  // eslint-disable-next-line no-console
  console.log(
    `[blackmon] armed — samples once per rendered frame (sampleW=${sampleW}, eventRatio=${eventRatio}). ` +
      "__blackMon.summary() any time, __blackMon.stop() to end.",
  );
  return monitor;
}

/**
 * Drives the active monitor for one frame. Call SYNCHRONOUSLY right after the
 * frame is rendered (same rAF task) so the WebGL buffer still holds content.
 * Cheap no-op when no monitor is armed.
 * @returns {void}
 */
export function tickBlackFrameMonitor() {
  active?.sample();
}

/** @returns {HTMLDivElement} */
function makeOverlay() {
  const el = document.createElement("div");
  el.id = "cr-blackmon";
  el.style.cssText = [
    "position:fixed",
    "top:6px",
    "left:6px",
    "z-index:99999",
    "font:600 11px/1.3 ui-monospace,Menlo,Consolas,monospace",
    "color:#39ff88",
    "background:rgba(0,0,0,0.55)",
    "padding:3px 6px",
    "border-radius:4px",
    "pointer-events:none",
    "white-space:nowrap",
  ].join(";");
  el.textContent = "BLK …";
  document.body.appendChild(el);
  return el;
}
