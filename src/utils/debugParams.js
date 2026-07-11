/**
 * debugParams.js — URL debug surface for visual QA and agent sessions.
 *
 * Parsed once per page load. Safe in prod (flags are inert unless present).
 *
 * Flags:
 *   ?ablate=bloom,arcade,fxaa,vhs,output  — disable named post passes
 *   ?postmin=1                            — bare color path (no bloom/arcade/fxaa)
 *   ?freeze=1                             — pin camera / stop attract orbit
 *   ?cam=x,y,z[,lx,ly,lz]                 — lock camera pose (look-at origin if look omitted)
 *   ?level=classicRecord|backrooms|zanzibar|testArena
 *   ?preset=low|medium|high               — session quality tier (not persisted)
 *   ?shot=classic|classic-edge|storerooms|sundial|sundial-edge
 *   ?harness=1                            — install visual harness hooks + warm world ASAP
 *   ?hud=0                                — hide main menu chrome (clean arena shots)
 *   ?perfPump                             — existing (utils/perfPump.js)
 *   ?blackmon=1                           — live black-frame flicker monitor (VFX-1, real HW)
 *   ?rtmode=half|float|byte|bloombyte|bloomfix — composer/bloom RT A/B (VFX-1; half=default)
 *
 * Inspired by LAAS (fable5-world-demo) process tooling — process only, not their engine.
 */

/** @typedef {"low" | "medium" | "high"} QualityTier */

/**
 * @typedef {object} DebugCam
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} lx
 * @property {number} ly
 * @property {number} lz
 */

/**
 * @typedef {object} DebugParams
 * @property {ReadonlySet<string>} ablate
 * @property {boolean} postmin
 * @property {boolean} freeze
 * @property {DebugCam | null} cam
 * @property {string | null} level
 * @property {QualityTier | null} preset
 * @property {string | null} shot
 * @property {boolean} harness
 * @property {boolean} hideHud
 * @property {boolean} blackmon
 * @property {"half" | "float" | "byte" | "bloombyte" | "bloomfix"} rtmode
 */

/** Named review poses — used by ?shot= and tools/shoot.mjs */
export const VISUAL_BOOKMARKS = {
  classic: {
    level: "classicRecord",
    cam: "0,14,22,0,0.5,0",
    label: "Classic Record — three-quarter overview",
  },
  "classic-edge": {
    level: "classicRecord",
    cam: "18,6,4,0,0.2,0",
    label: "Classic Record — edge / void read",
  },
  storerooms: {
    level: "backrooms",
    cam: "0,8,16,0,0.5,0",
    label: "Storerooms — aisle overview",
  },
  sundial: {
    level: "zanzibar",
    cam: "0,12,20,0,0.5,0",
    label: "Sundial Station — deck overview",
  },
  "sundial-edge": {
    level: "zanzibar",
    cam: "16,5,8,0,0.2,0",
    label: "Sundial Station — edge water read",
  },
};

/** @type {DebugParams | null} */
let cached = null;

/**
 * @param {string} raw
 * @returns {DebugCam | null}
 */
export function parseCamString(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(",").map((s) => Number(String(s).trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const [x, y, z, lx = 0, ly = 0, lz = 0] = parts;
  return {
    x,
    y,
    z,
    lx: Number.isFinite(lx) ? lx : 0,
    ly: Number.isFinite(ly) ? ly : 0,
    lz: Number.isFinite(lz) ? lz : 0,
  };
}

/**
 * @param {string | null | undefined} [search]
 * @returns {DebugParams}
 */
export function parseDebugParams(search) {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  );

  /** @type {Set<string>} */
  const ablate = new Set();
  const ablateRaw = params.get("ablate");
  if (ablateRaw) {
    for (const token of ablateRaw.split(/[,+\s]+/)) {
      const t = token.trim().toLowerCase();
      if (t) ablate.add(t);
    }
  }

  const postmin =
    params.has("postmin") &&
    params.get("postmin") !== "0" &&
    params.get("postmin") !== "false";
  if (postmin) {
    ablate.add("bloom");
    ablate.add("arcade");
    ablate.add("fxaa");
    ablate.add("vhs");
  }

  const freeze =
    params.has("freeze") &&
    params.get("freeze") !== "0" &&
    params.get("freeze") !== "false";

  const harness =
    params.has("harness") &&
    params.get("harness") !== "0" &&
    params.get("harness") !== "false";

  // * ?hud=0 hides menu chrome for clean arena screenshots.
  const hudRaw = params.get("hud");
  const hideHud = hudRaw === "0" || hudRaw === "false" || hudRaw === "off";

  let shot = params.get("shot");
  if (shot) shot = shot.trim().toLowerCase();
  const bookmark = shot && VISUAL_BOOKMARKS[shot] ? VISUAL_BOOKMARKS[shot] : null;

  let level = params.get("level")?.trim() || bookmark?.level || null;
  if (level === "classic") level = "classicRecord";
  if (level === "sundial") level = "zanzibar";
  if (level === "storerooms") level = "backrooms";

  const camStr = params.get("cam") || bookmark?.cam || null;
  const cam = parseCamString(camStr);

  /** @type {QualityTier | null} */
  let preset = null;
  const presetRaw = (params.get("preset") || "").trim().toLowerCase();
  if (presetRaw === "low" || presetRaw === "medium" || presetRaw === "high") {
    preset = presetRaw;
  }

  const blackmon =
    params.has("blackmon") &&
    params.get("blackmon") !== "0" &&
    params.get("blackmon") !== "false";

  // * Composer RT type A/B for the VFX-1 HalfFloat flicker. Absent → "half" (today's
  // * default path, byte-identical). float=RGBA32F composer; byte=UnsignedByte composer
  // * (known stable/bad-grade control); bloombyte=HalfFloat composer + UnsignedByte
  // * bloom mips only (half-res bloom chain suspect).
  const rtRaw = (params.get("rtmode") || "").trim().toLowerCase();
  /** @type {"half" | "float" | "byte" | "bloombyte" | "bloomfix"} */
  const rtmode =
    rtRaw === "float" || rtRaw === "byte" || rtRaw === "bloombyte" || rtRaw === "bloomfix"
      ? rtRaw
      : "half";

  return {
    ablate,
    postmin,
    freeze: freeze || Boolean(cam),
    cam,
    level,
    preset,
    shot: bookmark ? shot : null,
    harness: harness || Boolean(params.get("ablate")) || Boolean(cam) || postmin || hideHud,
    hideHud,
    blackmon,
    rtmode,
  };
}

/**
 * @returns {DebugParams}
 */
export function getDebugParams() {
  if (!cached) cached = parseDebugParams();
  return cached;
}

/**
 * True when camera should not be driven by follow/orbit systems.
 * @returns {boolean}
 */
export function isDebugCameraLocked() {
  const p = getDebugParams();
  return Boolean(p.cam) || p.freeze;
}

/**
 * Applies URL level side effects that must run before world/renderer init.
 * Quality preset is applied by main.js via setSessionQualityTier (same timing).
 * @returns {void}
 */
export function applyDebugBootSideEffects() {
  const p = getDebugParams();
  if (typeof window === "undefined") return;

  try {
    if (p.level) {
      // * Key string frozen until brand cutover (see utils/storage.js).
      localStorage.setItem("cartRaveLevel", p.level);
    }
    // * Visual QA: never block shots with first-run HOW TO PLAY.
    if (p.harness || p.shot || p.cam || p.freeze || p.ablate.size || p.postmin) {
      localStorage.setItem("cartRaveHowToSeen", "1");
    }
  } catch {
    /* privacy mode */
  }
}

/**
 * Disables post passes matching ablation / postmin flags.
 * Safe to call after quality toggles re-enable passes.
 *
 * @param {{
 *   bloomPass?: { enabled: boolean } | null,
 *   arcadePass?: { enabled: boolean, uniforms?: Record<string, { value: unknown }> } | null,
 *   fxaaPass?: { enabled: boolean } | null,
 *   outputPass?: { enabled: boolean } | null,
 * }} passes
 * @returns {{ ablated: string[] }}
 */
export function applyPostFxAblation(passes) {
  const p = getDebugParams();
  /** @type {string[]} */
  const ablated = [];
  const has = (name) => p.ablate.has(name);

  if (passes.bloomPass && (has("bloom") || has("all"))) {
    passes.bloomPass.enabled = false;
    ablated.push("bloom");
  }
  if (passes.arcadePass && (has("arcade") || has("fx") || has("all"))) {
    passes.arcadePass.enabled = false;
    ablated.push("arcade");
  }
  if (passes.fxaaPass && (has("fxaa") || has("aa") || has("all"))) {
    passes.fxaaPass.enabled = false;
    ablated.push("fxaa");
  }
  if (passes.outputPass && (has("output") || has("tonemap") || has("all"))) {
    passes.outputPass.enabled = false;
    ablated.push("output");
  }
  // * VHS is a uniform layer on the arcade pass — zero it without killing CRT arcade.
  if (passes.arcadePass?.uniforms?.uVhsAmount && (has("vhs") || has("all") || p.postmin)) {
    passes.arcadePass.uniforms.uVhsAmount.value = 0;
    ablated.push("vhs");
  }

  return { ablated: [...new Set(ablated)] };
}

/**
 * Applies a locked camera pose to a Three.js camera.
 * @param {import("three").PerspectiveCamera} camera
 * @param {DebugCam | null} [cam]
 * @returns {boolean} true if applied
 */
export function applyDebugCameraPose(camera, cam = getDebugParams().cam) {
  if (!camera || !cam) return false;
  camera.position.set(cam.x, cam.y, cam.z);
  camera.lookAt(cam.lx, cam.ly, cam.lz);
  camera.updateMatrixWorld(true);
  return true;
}
