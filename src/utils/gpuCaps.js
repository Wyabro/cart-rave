/**
 * gpuCaps.js — one-shot GPU capability probe for quality defaults and
 * software-rasterizer detection.
 *
 * Why: a dev-box 4090 hides the fact that the non-touch default tier ("high":
 * DPR×2, reflector second scene render, HalfFloat bloom chain) melts iGPUs — and
 * outright kills machines where Chrome has blocklisted the GPU and quietly handed
 * us SwiftShader software WebGL (float render targets then allocate in system
 * RAM; the tab OOMs before the first frame — "the game crashed my browser").
 * Edge ships different acceleration defaults, which is why the same PC "works on
 * Edge but not Chrome".
 *
 * The probe reads the unmasked renderer string from a throwaway context (or the
 * live one via {@link classifyGpuRendererString}) and buckets it:
 *   - "software"  — SwiftShader / llvmpipe / Basic Render: must run LOW, no debate.
 *   - "discrete"  — GeForce/RTX/Radeon RX/Arc/Apple M: safe to default HIGH.
 *   - "unknown"   — iGPUs and anything unrecognized: default MEDIUM (full
 *                   personality, no reflector, DPR≤1.5 — see qualityTiers.js).
 */

/** @typedef {"software" | "discrete" | "unknown"} GpuClass */
/** @typedef {{ rendererString: string, gpuClass: GpuClass }} GpuProbeResult */

// * Software rasterizers (Chrome SwiftShader, Mesa llvmpipe/softpipe, Windows
// * "Microsoft Basic Render Driver" = WARP). Any hit means no real GPU is driving.
const SOFTWARE_GL_RE =
  /swiftshader|llvmpipe|softpipe|software\s*(rasterizer|renderer|adapter)|microsoft basic render|warp\b/i;

// * Clearly-discrete (or desktop-class Apple silicon) markers. Conservative on
// * purpose: "Radeon Vega 8" (iGPU) must NOT match, so Radeon requires RX/Pro/VII.
const DISCRETE_GPU_RE =
  /geforce|\brtx\b|\bgtx\b|quadro|titan\s?(x|v|rtx)|radeon\s+(rx|pro|vii)|\brx\s?\d{3,4}\b|arc\s+a\d|apple\s+m\d/i;

/**
 * Buckets a WebGL renderer string (masked or unmasked) into a GPU class.
 * @param {string | null | undefined} rendererString
 * @returns {GpuClass}
 */
export function classifyGpuRendererString(rendererString) {
  const str = String(rendererString ?? "");
  if (!str) return "unknown";
  if (SOFTWARE_GL_RE.test(str)) return "software";
  if (DISCRETE_GPU_RE.test(str)) return "discrete";
  return "unknown";
}

/** @type {GpuProbeResult | null} */
let cachedProbe = null;

/**
 * DEV-only override for exercising the potato paths on a strong machine:
 * `?forcegpu=sw` (software), `?forcegpu=igpu` (unknown), `?forcegpu=discrete`.
 * @returns {GpuProbeResult | null}
 */
function devForcedProbe() {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const forced = new URLSearchParams(location.search || "").get("forcegpu");
  if (forced === "sw") return { rendererString: "Forced SwiftShader (dev)", gpuClass: "software" };
  if (forced === "igpu") return { rendererString: "Forced iGPU (dev)", gpuClass: "unknown" };
  if (forced === "discrete") return { rendererString: "Forced discrete (dev)", gpuClass: "discrete" };
  return null;
}

/**
 * Probes GPU class once via a throwaway WebGL context (released immediately).
 * Safe anywhere: returns "unknown" when WebGL/document is unavailable (SSR,
 * happy-dom tests) so callers degrade to the MEDIUM default.
 * @returns {GpuProbeResult}
 */
export function probeGpu() {
  if (cachedProbe) return cachedProbe;
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
