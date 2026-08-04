/**
 * debugParams.js — URL debug surface for visual QA and agent sessions.
 *
 * Parsed once per page load. Safe in prod (flags are inert unless present).
 *
 * Flags:
 *   ?ablate=bloom,arcade,fxaa,vhs,output  — disable named post passes
 *   ?ablate=crowd,crowdcarts,stadium,     — hide Classic scene blocks (PERF-PASS-1 cost
 *           stagerig,billboard,bulbs,       menu). `all` covers post + scene; `none` is a
 *           pitlights,pitfill               no-op that still boots the harness path, so it
 *                                           is the comparable baseline for a timing sweep.
 *                                           pitlights = spindle + both pit lights;
 *                                           pitfill = the two pit lights only.
 *   ?postmin=1                            — bare color path (no bloom/arcade/fxaa)
 *   ?freeze=1                             — pin camera / stop attract orbit
 *   ?cam=x,y,z[,lx,ly,lz]                 — lock camera pose (look-at origin if look omitted)
 *   ?level=classicRecord|backrooms|zanzibar|testArena
 *   ?preset=low|medium|high               — session quality tier (not persisted)
 *   ?shot=classic|classic-edge|storerooms|sundial|sundial-edge
 *   ?harness=1                            — install visual harness hooks + warm world ASAP
 *   ?hud=0                                — hide main menu chrome (clean arena shots)
 *   ?t=<ms>                               — pin per-frame level animation to an exact
 *                                           timestamp so captures are reproducible
 *                                           (SHOOT-ANIM-1). Absent = free-run on real time.
 *   ?perfPump                             — existing (utils/perfPump.js)
 *   ?blackmon=1                           — live black-frame flicker monitor (VFX-1, real HW)
 *   ?floor=og|v2                              — Classic vinyl floor (default og = jam matte
 *                                               + dark Reflector; v2 = old clearcoat stack)
 *   ?bloom=v2|mid|og                          — UnrealBloom *knobs* A/B (mostly HDR path;
 *                                               display path has its own neon/storerooms sets)
 *   ?bloompipe=display|hdr                    — bloom pipeline. default display = all levels
 *                                               use post-tonemap UnsignedByte mips (no rebuild
 *                                               hitch on Storerooms swap). hdr = prior split
 *                                               (Classic/Sundial HDR HalfFloat, Storerooms display)
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
 * @property {number | null} animTimeMs Pinned level-animation timestamp (see ?t=)
 * @property {boolean} blackmon
 * @property {{ threshold?: number, strength?: number, radius?: number, smoothWidth?: number } | null} bloomTune
 * @property {"og" | "v2"} floor Classic High vinyl profile (see ?floor=)
 * @property {"v2" | "mid" | "og"} bloom Bloom knob profile (see ?bloom=)
 * @property {"display" | "hdr"} bloomPipe Unified display-referred vs split HDR (see ?bloompipe=)
 */

/** Named review poses — consumed via ?shot= (tools/shoot.mjs passes the key through the URL). */
const VISUAL_BOOKMARKS = {
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
function parseCamString(raw) {
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
function parseDebugParams(search) {
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

  // * ?t=<ms> pins level animation to one timestamp (SHOOT-ANIM-1) so a capture is a
  // * reproducible phase rather than whenever the shot happened to land. Number.isFinite
  // * (not truthiness) — ?t=0 is a legitimate phase and must survive as 0, not null.
  const animTimeRaw = Number(params.get("t"));
  const animTimeMs = params.has("t") && Number.isFinite(animTimeRaw) ? animTimeRaw : null;

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

  // * Display-referred bloom live tuning: ?bloomthr / bloomstr / bloomrad / bloomsmooth override
  // * the active bloom knobs so display-referred bloom can be dialed in during a real
  // * playtest without a rebuild. Any subset; absent keys keep the config value.
  const bloomNum = (key) => {
    const v = Number(params.get(key));
    return params.has(key) && Number.isFinite(v) ? v : undefined;
  };
  const bloomTuneRaw = {
    threshold: bloomNum("bloomthr"),
    strength: bloomNum("bloomstr"),
    radius: bloomNum("bloomrad"),
    smoothWidth: bloomNum("bloomsmooth"),
  };
  const bloomTune = Object.values(bloomTuneRaw).some((v) => v !== undefined)
    ? bloomTuneRaw
    : null;

  // * Classic floor — default "og" (jam matte + dark Reflector; fixed white pool).
  // * ?floor=v2 = prior Physical clearcoat stack.
  const floorRaw = (params.get("floor") || "").trim().toLowerCase();
  /** @type {"og" | "v2"} */
  const floor = floorRaw === "v2" ? "v2" : "og";

  // * Bloom knobs A/B. default v2 (shipping numbers); ?bloom=mid | og.
  const bloomProfileRaw = (params.get("bloom") || "").trim().toLowerCase();
  /** @type {"v2" | "mid" | "og"} */
  const bloom =
    bloomProfileRaw === "mid" || bloomProfileRaw === "og" ? bloomProfileRaw : "v2";

  // * Pipeline A/B — default display (unified, no float↔byte rebuild on level swap).
  // * ?bloompipe=hdr restores Classic/Sundial HDR + Storerooms-only display.
  const bloomPipeRaw = (params.get("bloompipe") || "").trim().toLowerCase();
  /** @type {"display" | "hdr"} */
  const bloomPipe = bloomPipeRaw === "hdr" ? "hdr" : "display";

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
    animTimeMs,
    blackmon,
    bloomTune,
    floor,
    bloom,
    bloomPipe,
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
 * Pinned level-animation timestamp (?t=<ms>), or null to free-run on real time.
 * Callers do `getDebugAnimTimeMs() ?? now` — 0 must stay 0, so this returns null,
 * never undefined, for "absent".
 * @returns {number | null}
 */
export function getDebugAnimTimeMs() {
  return getDebugParams().animTimeMs;
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
 * Hides scene blocks matching `?ablate=` scene tokens — the measurement probe for
 * PERF-PASS-1's cost menu. Duck-typed on `.visible`, so it never imports three.
 *
 * Call it *after* the tier knobs have been applied, not before: a tier pass that re-shows
 * a block would silently un-ablate the cut, and a cell that un-ablates measures ~0 ms and
 * reads as "this cut is worthless".
 *
 * A missing/null target is skipped and is NOT reported in `ablated` — a token only lands
 * there when it actually hid something.
 *
 * @param {Record<string, { visible: boolean } | ({ visible: boolean } | null | undefined)[] | null | undefined>} targets
 *   Token → the object (or array of objects) that token hides.
 * @returns {{ ablated: string[] }}
 */
export function applySceneAblation(targets) {
  const p = getDebugParams();
  /** @type {string[]} */
  const ablated = [];
  if (!targets) return { ablated };
  const all = p.ablate.has("all");

  for (const [token, target] of Object.entries(targets)) {
    if (!target) continue;
    if (!all && !p.ablate.has(token)) continue;
    let hidAny = false;
    for (const node of Array.isArray(target) ? target : [target]) {
      if (!node || typeof node !== "object" || typeof node.visible !== "boolean") continue;
      node.visible = false;
      hidAny = true;
    }
    if (hidAny) ablated.push(token);
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
