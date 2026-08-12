/**
 * gpuCaps.js — GPU capability probe + first-run quality-tier policy
 * (TIER-DEFAULT-1).
 *
 * Why: a dev-box 4090 hides the fact that the non-touch default tier ("high":
 * DPR×2, reflector second scene render, HalfFloat bloom chain) melts iGPUs — and
 * outright kills machines where Chrome has blocklisted the GPU and quietly handed
 * us SwiftShader software WebGL (float render targets then allocate in system
 * RAM; the tab OOMs before the first frame — "the game crashed my browser").
 * Edge ships different acceleration defaults, which is why the same PC "works on
 * Edge but not Chrome".
 *
 * cap-288 (Intel UHD Gen11, prod) showed the ORIGINAL 3-class probe
 * (software/discrete/unknown) put every iGPU renderer string in "unknown", which
 * fell through to a MEDIUM default that ran the menu at 5.0–8.6 fps for ~3.3s
 * until the auto-quality watchdog (autoQuality.js) rescued it. `probeGpu()` now
 * buckets into six classes so an iGPU that genuinely cannot hold Medium starts at
 * Low, and an iGPU that can (Iris Xe, AMD 780M, …) is no longer lumped in with a
 * 4090 under "unknown".
 *
 * The classes, worst to best:
 *   - "software"       — SwiftShader / llvmpipe / Basic Render: must run LOW, no debate.
 *   - "igpu-basic"      — Intel HD/UHD, AMD Vega/unnumbered Radeon Graphics, mobile
 *                         GPUs (Adreno/Mali/PowerVR): default LOW.
 *   - "igpu-modern"     — Intel Iris/Xe/Arc-iGPU, AMD Radeon NNNM (680M/780M/…):
 *                         default MEDIUM.
 *   - "discrete-entry"  — old/weak discrete (GTX 6xx–9xx/1050, MX-series,
 *                         GT-series, Radeon R5/R7/R9, RX 530–560): default MEDIUM.
 *   - "discrete"        — everything else discrete/desktop-class (GeForce 10-series
 *                         up, Quadro, Titan, Radeon RX 570+, Arc Axxx/Bxxx, Apple
 *                         M-series): default HIGH.
 *   - "unknown"         — empty string, probe failure, or genuinely unrecognized:
 *                         default MEDIUM (unchanged from the original 3-class probe).
 *
 * Deliberately NOT done here (see TIER-DEFAULT-1 plan "out of scope"): no
 * NVIDIA/AMD model-number parsing to split mid-range discrete into its own tier
 * (PERF-TIER-1), and no demotion of bare Apple M-series — cap-288 is Intel-only
 * evidence, and a wrong-Low verdict is permanent for the session while a
 * wrong-High self-heals via the watchdog in ~3.3s. Every threshold in this file
 * follows that asymmetry: demote confidently, never demote on a guess.
 */

/** @typedef {"software" | "igpu-basic" | "igpu-modern" | "discrete-entry" | "discrete-mid" | "discrete" | "unknown"} GpuClass */
/** @typedef {{ rendererString: string, gpuClass: GpuClass }} GpuProbeResult */
/** @typedef {"low" | "medium" | "high-lite" | "high"} QualityTier */

/**
 * Ordered classification rules — **array order is the matching contract**, not a
 * conceptual "tier rung" (the array groups software → discrete-entry → discrete →
 * igpu-modern → igpu-basic, which is not tier order). First match wins. Two
 * ordering traps this order exists to resolve, both covered by
 * tests/gpuCaps.test.js:
 *   - "AMD Radeon 780M Graphics" must hit the NNNM pattern before the unnumbered
 *     "Radeon … Graphics" pattern, or a 780M iGPU reads as igpu-basic instead of
 *     igpu-modern.
 *   - "GeForce GTX 960" must hit a discrete-entry pattern before the general
 *     `\bgtx\b` discrete pattern, or every GTX reads as discrete.
 * @type {ReadonlyArray<{ re: RegExp, gpuClass: GpuClass }>}
 */
const GPU_CLASS_RULES = [
  // * Software rasterizers (Chrome SwiftShader, Mesa llvmpipe/softpipe, Windows
  // * "Microsoft Basic Render Driver" = WARP). Any hit means no real GPU is driving.
  {
    re: /swiftshader|llvmpipe|softpipe|software\s*(rasterizer|renderer|adapter)|microsoft basic render|warp\b/i,
    gpuClass: "software",
  },

  // * Old/weak discrete. Must precede the general discrete pattern below or e.g.
  // * "GTX 960" classifies as full discrete. (?!\d), not \b, after the number so
  // * laptop M-suffix SKUs ("GTX 970M") still match — the boundary would too, but
  // * (?!\d) is what keeps "RX 5500 XT" (discrete) from matching "RX 550" (entry).
  { re: /\bgtx\s?(1050|9\d0|8\d0|7\d0|6\d0)(?!\d)/i, gpuClass: "discrete-entry" },
  { re: /\bmx\s?\d{3}\b/i, gpuClass: "discrete-entry" },
  { re: /geforce\s+gt\s?\d{3,4}\b/i, gpuClass: "discrete-entry" },
  { re: /radeon\s+r[579]\s?\d{3}\b/i, gpuClass: "discrete-entry" },
  { re: /\brx\s?5[3-6]0(?!\d)/i, gpuClass: "discrete-entry" },

  // * Mid-range discrete — PERF-TIER-1: narrow allow-list of GPUs that belong
  // * on high-lite instead of high. Deliberately conservative: 1080/1080Ti,
  // * RTX 2060/3060/4060, RX 66x0XT/67x0+, and Arc A750/A770 stay in
  // * discrete/high (prefer false-High → watchdog self-heals over false-demotion).
  // * Placed before the general discrete rules so first-match wins over the
  // * catch-all /geforce|rtx|gtx|...|apple m\d/ pattern below.
  { re: /\bgtx\s?(1060|1070|1660|1660\s*ti|1660\s*super)\b/i, gpuClass: "discrete-mid" },
  { re: /\brtx\s?(3050|4050)\b/i, gpuClass: "discrete-mid" },
  // * (?!\s*xt) keeps RX 6600 XT in discrete; plain 6600 lands here.
  { re: /\brx\s?(5500|5600|5700|6500|6600|7600)(?!\s*xt)\b/i, gpuClass: "discrete-mid" },
  { re: /\barc\b[^,]*\b[ab](310|380|530|580|730)\b/i, gpuClass: "discrete-mid" },

  // * Clearly-discrete (or desktop-class Apple silicon). `apple\s+m\d` is kept
  // * verbatim from the original 3-class DISCRETE_GPU_RE — bare M1–M4 stay
  // * discrete/High (TIER-DEFAULT-1 decision: no Apple change without a measured
  // * Mac capture; cap-288 is Intel-only). Arc needs its own entry because a bare
  // * "Arc(TM) Graphics" (Meteor/Lunar Lake iGPU) must NOT match here — only a
  // * real A/Bxxx model number does.
  {
    re: /geforce|\brtx\b|\bgtx\b|quadro|titan\s?(x|v|rtx)|radeon\s+(rx|pro|vii)|\brx\s?\d{3,4}\b|apple\s+m\d/i,
    gpuClass: "discrete",
  },
  { re: /\barc\b[^,]*\b[ab]\d{3}\b/i, gpuClass: "discrete" },

  // * Modern iGPUs that can hold Medium. Must precede igpu-basic's unnumbered
  // * "Radeon … Graphics" pattern (see ordering-trap note above).
  { re: /iris|\bxe\s+graphics\b/i, gpuClass: "igpu-modern" },
  { re: /intel.*\barc\b/i, gpuClass: "igpu-modern" }, // Meteor/Lunar Lake Arc iGPU, no model number
  { re: /radeon\s+\d{3}m\b/i, gpuClass: "igpu-modern" }, // 680M/780M/880M/890M

  // * Basic iGPUs and mobile GPUs — cap-288's Intel UHD lands here.
  { re: /\b(hd|uhd)\s+graphics\b/i, gpuClass: "igpu-basic" },
  { re: /vega\s+\d+/i, gpuClass: "igpu-basic" },
  { re: /radeon\s*(\(tm\))?\s+graphics\b/i, gpuClass: "igpu-basic" },
  { re: /adreno|\bmali\b|powervr|apple\s+gpu/i, gpuClass: "igpu-basic" },
];

/**
 * Buckets a WebGL renderer string (masked or unmasked) into a GPU class.
 * @param {string | null | undefined} rendererString
 * @returns {GpuClass}
 */
export function classifyGpuRendererString(rendererString) {
  const str = String(rendererString ?? "");
  if (!str) return "unknown";
  for (const { re, gpuClass } of GPU_CLASS_RULES) {
    if (re.test(str)) return gpuClass;
  }
  return "unknown";
}

/** @type {GpuProbeResult | null} */
let cachedProbe = null;

/** The full class vocabulary — used to validate `?forcegpu=` values. */
const GPU_CLASSES = new Set(
  /** @type {GpuClass[]} */ (["software", "igpu-basic", "igpu-modern", "discrete-entry", "discrete-mid", "discrete", "unknown"]),
);

/**
 * `?forcegpu=` legacy values, preserved with their EXACT original gpuClass
 * (TIER-DEFAULT-1 blocker B3): `igpu` must keep returning "unknown", not
 * "igpu-basic" — it is dev muscle memory for "the unknown/iGPU path" and
 * src/dev/modules/systems.js still offers it as a Tweakpane option.
 * @type {Record<string, GpuClass>}
 */
const FORCEGPU_LEGACY = { sw: "software", igpu: "unknown", discrete: "discrete" };

/**
 * DEV-only override for exercising every tier path on a strong dev machine:
 * `?forcegpu=sw|igpu|discrete` (legacy, unchanged) or the six class names
 * verbatim (`?forcegpu=igpu-basic`, `?forcegpu=discrete-entry`, …).
 * @returns {GpuProbeResult | null}
 */
function devForcedProbe() {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const forced = new URLSearchParams(location.search || "").get("forcegpu");
  if (!forced) return null;
  const asClass = /** @type {GpuClass} */ (forced);
  const gpuClass = FORCEGPU_LEGACY[forced] ?? (GPU_CLASSES.has(asClass) ? asClass : null);
  if (!gpuClass) return null;
  return { rendererString: `Forced ${forced} (dev)`, gpuClass };
}

/**
 * DEV-only: `?gpustr=<url-encoded renderer string>` runs an arbitrary real
 * renderer string through {@link classifyGpuRendererString} without owning the
 * hardware — the fastest way to check a newly-reported string against the rules
 * table. Takes precedence over `?forcegpu=` when both are present.
 * @returns {string | null}
 */
function devForcedGpuString() {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search || "");
  return params.has("gpustr") ? params.get("gpustr") : null;
}

/**
 * Probes GPU class once via a throwaway WebGL context (released immediately).
 * Safe anywhere: returns "unknown" when WebGL/document is unavailable (SSR,
 * happy-dom tests) so callers degrade to the MEDIUM default.
 * @returns {GpuProbeResult}
 */
export function probeGpu() {
  if (cachedProbe) return cachedProbe;
  const forcedStr = devForcedGpuString();
  if (forcedStr != null) {
    cachedProbe = { rendererString: forcedStr, gpuClass: classifyGpuRendererString(forcedStr) };
    return cachedProbe;
  }
  const forced = devForcedProbe();
  if (forced) {
    cachedProbe = forced;
    return cachedProbe;
  }
  let rendererString = "";
  try {
    const canvas = document.createElement("canvas");
    const gl = /** @type {WebGLRenderingContext | null} */ (
      canvas.getContext("webgl2") || canvas.getContext("webgl")
    );
    if (gl) {
      rendererString = readRendererString(gl);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // * Probe failure = no signal; classify as unknown below.
  }
  cachedProbe = { rendererString, gpuClass: classifyGpuRendererString(rendererString) };
  return cachedProbe;
}

/**
 * Reads the (unmasked when available) renderer string from a live GL context.
 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl
 * @returns {string}
 */
export function readRendererString(gl) {
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const unmasked = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    return String(unmasked || gl.getParameter(gl.RENDERER) || "");
  } catch {
    return "";
  }
}

/**
 * Base first-run tier per GPU class — the non-hard-floor part of the policy.
 * @type {Partial<Record<GpuClass, QualityTier>>}
 */
const BASE_TIER_BY_CLASS = {
  "igpu-basic": "low",
  "igpu-modern": "medium",
  "discrete-entry": "medium",
  "discrete-mid": "high-lite",
  discrete: "high",
  unknown: "medium",
};

/**
 * Ordered worst→best. Local mirror of qualityMode.js's QUALITY_TIER_ORDER — not
 * imported, because qualityMode.js imports settingsStore.js (which imports this
 * module for defaultTierForCaps), and that would be a cycle.
 * @type {ReadonlyArray<QualityTier>}
 */
const TIER_ORDER = ["low", "medium", "high-lite", "high"];

/**
 * TIER-DEFAULT-1 lever 5: above this many backing pixels — screen width times
 * screen height times device-pixel-ratio squared — a discrete verdict demotes
 * High to Medium instead of booting High at up to pixelRatioCap-times-2
 * fragments. Chosen so a MacBook Pro 16-inch (1728x1117 at 2x, about 7.72
 * million, carrying at minimum an M3 Pro — B1 keeps bare Apple M at discrete)
 * still boots High; true 4K (3840x2160 at 1x, or 1920x1080 at 2x, about 8.29
 * million) and 5K panels demote to Medium.
 *
 * This is a resolution guard, not a GPU-model guard (TIER-DEFAULT-1 decision 1:
 * no NVIDIA/AMD model parsing) — it cannot tell a 4090 from a 3060, so a 4090
 * on a 4K monitor now boots Medium. Escapes are one click: the menu segmented
 * control or `?preset=high`. Exported so the threshold is a one-line change if
 * it reads wrong on real hardware (see PT-3 in the TIER-DEFAULT-1 plan).
 */
export const HIGH_TIER_MAX_BACKING_PIXELS = 8_000_000;

/**
 * Pure first-run quality-tier policy. No globals — every signal is a parameter,
 * which is what makes the six-class table falsifiable in tests/gpuCaps.test.js
 * without owning six machines (docs/playtest/README.md previously flagged that
 * tier boundaries had never been verified on real hardware).
 *
 * Evaluation order: hard floors first (touch device, software GL, ≤2GB RAM —
 * all unchanged from the original 3-class policy), then the base tier for the
 * GPU class, then the 4K backing-pixel guard, then `reducedMotion` steps the
 * result down one more rung. The guard runs before the RM rung deliberately —
 * a 4K discrete box with reduced-motion on demotes TWICE (high→medium via the
 * guard, then medium→low via RM) — see {@link HIGH_TIER_MAX_BACKING_PIXELS}.
 *
 * `reducedMotion` used to be a hard floor → low (cap-287/288: the same Intel
 * box booted Low with Windows animations on and Medium with them off — an OS
 * accessibility toggle was silently picking the graphics tier). TIER-DEFAULT-1
 * lever 4 changes it to a one-rung demotion instead: high→medium, medium→low,
 * low stays low. Net effect for a discrete-GPU user with reduced-motion on a
 * sub-4K panel: Low → Medium, a quality *increase* for that cohort. The real
 * fix — actually reducing motion (attract-camera spin, shake, screen flash) —
 * is filed as MOTION-A11Y-1; this is the interim so the OS flag stops
 * overriding hardware.
 *
 * @param {{
 *   gpuClass: GpuClass,
 *   deviceMemoryGb?: number | null,
 *   touchLike?: boolean,
 *   reducedMotion?: boolean,
 *   backingPixels?: number | null,
 * }} caps
 * @returns {QualityTier}
 */
export function defaultTierForCaps({
  gpuClass,
  deviceMemoryGb = null,
  touchLike = false,
  reducedMotion = false,
  backingPixels = null,
}) {
  if (touchLike) return "low";
  if (gpuClass === "software") return "low";
  if (typeof deviceMemoryGb === "number" && deviceMemoryGb <= 2) return "low";

  let tier = BASE_TIER_BY_CLASS[gpuClass] ?? "medium";

  if (
    tier === "high"
    && typeof backingPixels === "number"
    && backingPixels > HIGH_TIER_MAX_BACKING_PIXELS
  ) {
    tier = "medium";
  }

  if (!reducedMotion) return tier;
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, idx - 1)];
}

/**
 * One-shot stored-preference migration (TIER-DEFAULT-1 lever 2 / H1). The
 * auto-quality watchdog never writes to localStorage (autoQuality.js — "no
 * localStorage write" is deliberate, a separate BACKLOG decision), so a
 * returning visitor whose GPU now classifies as igpu-basic or software can
 * carry a stale `qualityTier: "medium"` from before this card — cap-288's own
 * capture showed exactly that (`qualityTierStored: "medium"` beside effective
 * `"low"`). A first-run-only fix reaches nobody who has already loaded the
 * game once.
 *
 * Pure and pre-computed like {@link defaultTierForCaps} so it's testable
 * without a localStorage mock. Only ever downgrades, only from "medium", only
 * on hardware the watchdog was already about to demote — a user who re-picks
 * Medium afterwards keeps it (the migration key means "already checked", not
 * "was rewritten", so it never re-fires).
 *
 * @param {{ storedTier: string | null, migrationDone: string | null, gpuClass: GpuClass }} args
 * @returns {QualityTier | null} The tier to rewrite storage to, or null for no-op.
 */
export function migrateStoredTierIfNeeded({ storedTier, migrationDone, gpuClass }) {
  if (migrationDone) return null;
  if (storedTier !== "medium") return null;
  if (gpuClass !== "igpu-basic" && gpuClass !== "software") return null;
  return "low";
}
