// scene.js — Three.js scene, camera, renderer, post-processing, environment

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { CONFIG } from "./config.js";
import { isLowQualityMode } from "./utils.js";

/**
 * Cap device pixel ratio for the on-screen canvas (drawing buffer).
 *
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {number} [cssWidth]
 * @param {number} [cssHeight]
 * @returns {number}
 */
export function computeSafePixelRatio(renderer, cssWidth = window.innerWidth, cssHeight = window.innerHeight) {
  const w = Math.max(1, cssWidth | 0);
  const h = Math.max(1, cssHeight | 0);
  const desired = isLowQualityMode() ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const maxTex = renderer?.capabilities?.maxTextureSize ?? 8192;
  const dimCap = Math.min(maxTex, 8192) / Math.max(w, h, 1);
  return Math.max(1, Math.min(desired, dimCap));
}

/**
 * Pixel ratio for EffectComposer HalfFloat RTs only.
 * Full-frame HalfFloat at ultrawide×DPR caused intermittent black slabs on Windows ANGLE;
 * UnsignedByte fixed flicker but destroyed HDR fog/bloom. Cap the *composer* long edge
 * so HalfFloat stays small enough to be stable while the final pass upscales to the canvas.
 *
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {number} [cssWidth]
 * @param {number} [cssHeight]
 * @returns {number}
 */
export function computeComposerPixelRatio(renderer, cssWidth = window.innerWidth, cssHeight = window.innerHeight) {
  const w = Math.max(1, cssWidth | 0);
  const h = Math.max(1, cssHeight | 0);
  const base = computeSafePixelRatio(renderer, w, h);
  // ~2K long edge in device pixels — enough for bloom/fog quality, far under 4K×2 HalfFloat.
  const maxLongEdge = isLowQualityMode() ? 1280 : 2048;
  const longEdge = Math.max(w, h) * base;
  if (longEdge <= maxLongEdge) return base;
  return Math.max(0.5, base * (maxLongEdge / longEdge));
}

/**
 * Reset scissor state before the composer runs. Do not force autoClear or a full
 * viewport rewrite — EffectComposer/RenderPass own those, and overriding them can
 * leave the first pass clearing/compositing wrong.
 *
 * @param {THREE.WebGLRenderer} renderer
 */
export function prepareComposerFrame(renderer) {
  if (!renderer) return;
  renderer.setScissorTest(false);
}

/** Bloom tuning — edit CONFIG.postFx.bloom in config.js; applied in createComposer(). */
const BLOOM_CONFIG = CONFIG.postFx.bloom;

/** Shared RT options for UnsignedByte bloom mips (when isolation forces byte path). */
const STABLE_RT = {
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  depthBuffer: false,
  stencilBuffer: false,
};

/**
 * Phase 1 isolation profile (handover-postfx-black-frames.md §8).
 * URL `?postfx=A`–`E` overrides CONFIG.postFx.isolationTest (hard-refresh required).
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   composerType: number,
 *   bloomEnabled: boolean,
 *   outputEnabled: boolean,
 *   bloomBeforeOutput: boolean,
 *   byteBloomMips: boolean,
 *   useDisplayBloomKnobs: boolean,
 * }} PostFxIsolation
 */

/** @type {PostFxIsolation | null} */
let activeIsolation = null;

/**
 * @returns {string}
 */
export function getPostFxIsolationId() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search).get("postfx");
    if (q && /^[A-Ea-e]$/.test(q.trim())) return q.trim().toUpperCase();
  }
  const cfg = CONFIG.postFx?.isolationTest;
  if (typeof cfg === "string" && /^[A-Ea-e]$/.test(cfg.trim())) return cfg.trim().toUpperCase();
  return "A";
}

/** Whether the active isolation profile allows bloom (false for tests A/C). */
export function isolationAllowsBloom() {
  return activeIsolation ? activeIsolation.bloomEnabled : true;
}

/**
 * @param {string} [id]
 * @returns {PostFxIsolation}
 */
export function resolvePostFxIsolation(id = getPostFxIsolationId()) {
  const key = String(id || "A").toUpperCase();
  /** @type {Record<string, PostFxIsolation>} */
  const table = {
    A: {
      id: "A",
      label: "HalfFloat composer, bloom OFF, OutputPass ON",
      composerType: THREE.HalfFloatType,
      bloomEnabled: false,
      outputEnabled: true,
      bloomBeforeOutput: false,
      byteBloomMips: false,
      useDisplayBloomKnobs: false,
    },
    B: {
      id: "B",
      label: "HalfFloat composer, bloom ON (HF mips), OutputPass OFF",
      composerType: THREE.HalfFloatType,
      bloomEnabled: true,
      outputEnabled: false,
      bloomBeforeOutput: true,
      byteBloomMips: false,
      useDisplayBloomKnobs: false,
    },
    C: {
      id: "C",
      label: "UnsignedByte composer, bloom OFF, OutputPass ON",
      composerType: THREE.UnsignedByteType,
      bloomEnabled: false,
      outputEnabled: true,
      bloomBeforeOutput: false,
      byteBloomMips: true,
      useDisplayBloomKnobs: false,
    },
    D: {
      id: "D",
      label: "UnsignedByte, bloom ON pre-tonemap (bloom→Output), HDR knobs",
      composerType: THREE.UnsignedByteType,
      bloomEnabled: true,
      outputEnabled: true,
      bloomBeforeOutput: true,
      byteBloomMips: true,
      useDisplayBloomKnobs: false,
    },
    E: {
      id: "E",
      label: "UnsignedByte, bloom ON post-tonemap (Output→bloom), display knobs",
      composerType: THREE.UnsignedByteType,
      bloomEnabled: true,
      outputEnabled: true,
      bloomBeforeOutput: false,
      byteBloomMips: true,
      useDisplayBloomKnobs: true,
    },
  };
  return table[key] ?? table.A;
}

/**
 * UnrealBloomPass hardcodes HalfFloat mips. When isolation uses the byte path,
 * rebuild bloom RTs as UnsignedByte after construction / resize.
 *
 * @param {UnrealBloomPass} bloomPass
 */
function stabilizeBloomTargets(bloomPass) {
  if (!activeIsolation?.byteBloomMips) return;
  const bp = /** @type {any} */ (bloomPass);
  if (!bp?.renderTargetBright) return;

  const swap = (rt, name) => {
    if (!rt) return rt;
    if (rt.texture?.type === THREE.UnsignedByteType) return rt;
    const next = new THREE.WebGLRenderTarget(rt.width, rt.height, STABLE_RT);
    next.texture.name = name || rt.texture?.name || "UnrealBloomPass.byte";
    next.texture.generateMipmaps = false;
    rt.dispose();
    return next;
  };

  bp.renderTargetBright = swap(bp.renderTargetBright, "UnrealBloomPass.bright");
  for (let i = 0; i < (bp.nMips ?? 0); i += 1) {
    bp.renderTargetsHorizontal[i] = swap(
      bp.renderTargetsHorizontal[i],
      `UnrealBloomPass.h${i}`,
    );
    bp.renderTargetsVertical[i] = swap(
      bp.renderTargetsVertical[i],
      `UnrealBloomPass.v${i}`,
    );
  }
}

/**
 * Default bloom knobs for the active isolation profile.
 * @returns {typeof BLOOM_CONFIG}
 */
function bloomConfigForIsolation() {
  if (activeIsolation?.useDisplayBloomKnobs && CONFIG.postFx?.bloomDisplay) {
    return CONFIG.postFx.bloomDisplay;
  }
  return BLOOM_CONFIG;
}

/**
 * Applies bloom pass settings from CONFIG.postFx.bloom (or an override object).
 *
 * @param {UnrealBloomPass} bloomPass
 * @param {typeof BLOOM_CONFIG} [bloomCfg]
 */
export function applyBloomSettings(bloomPass, bloomCfg) {
  if (!bloomPass) return;
  const cfg = bloomCfg ?? bloomConfigForIsolation();
  if (!cfg) return;
  bloomPass.strength = cfg.strength;
  bloomPass.radius = cfg.radius;
  bloomPass.threshold = cfg.threshold;
  const bp = /** @type {any} */ (bloomPass);
  if (bp.highPassUniforms?.luminosityThreshold) {
    bp.highPassUniforms.luminosityThreshold.value = cfg.threshold;
  }
  if (bp.highPassUniforms?.smoothWidth) {
    bp.highPassUniforms.smoothWidth.value = cfg.smoothWidth;
  }
  stabilizeBloomTargets(bloomPass);
}

// === IMAGE-BASED LIGHTING (IBL) ===
// RoomEnvironment is baked once via PMREMGenerator and assigned to scene.environment.
// Both levels share the same map — level swaps do not rebuild IBL.
// Adjust CONFIG.postFx.environment.intensity (default 0.6) or use the Post FX debug GUI.

/** @type {number} Live IBL multiplier — synced from CONFIG on setup, tweakable via GUI. */
let environmentIntensity = CONFIG.postFx.environment.intensity;

/** @type {number} Per-material IBL base scale — tweakable via graphics debug GUI. */
let materialEnvMapIntensityLive = CONFIG.postFx.environment.materialEnvMapIntensity;

/**
 * Per-material envMapIntensity = materialEnvMapIntensity × environmentIntensity.
 * Used by cart frame glow and scene-wide material refresh.
 *
 * @returns {number}
 */
export function getMaterialEnvMapIntensity() {
  return materialEnvMapIntensityLive * environmentIntensity;
}

/**
 * @returns {number}
 */
export function getMaterialEnvMapIntensityBase() {
  return materialEnvMapIntensityLive;
}

/**
 * Sets per-material IBL base scale and reapplies to existing scene materials.
 *
 * @param {THREE.Scene} scene
 * @param {number} value
 */
export function setMaterialEnvMapIntensity(scene, value) {
  materialEnvMapIntensityLive = value;
  refreshSceneEnvironmentMaterials(scene);
}

/**
 * MeshPhysicalMaterial with scene IBL envMapIntensity pre-applied.
 * Override envMapIntensity in params when a surface needs a custom scale.
 *
 * @param {THREE.MeshPhysicalMaterialParameters} [params]
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createPhysicalMaterial(params = {}) {
  return new THREE.MeshPhysicalMaterial({
    envMapIntensity: getMaterialEnvMapIntensity(),
    ...params,
  });
}

/**
 * @returns {number}
 */
export function getEnvironmentIntensity() {
  return environmentIntensity;
}

/**
 * Updates envMapIntensity on all scene materials that support it.
 *
 * @param {THREE.Scene} scene
 */
export function refreshSceneEnvironmentMaterials(scene) {
  if (!scene) return;
  const envMapIntensity = getMaterialEnvMapIntensity();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (mat && typeof mat.envMapIntensity === "number") {
        const scale = mat.userData?.envMapIntensityScale ?? 1;
        mat.envMapIntensity = envMapIntensity * scale;
      }
    }
  });
}

/**
 * Sets the global IBL intensity and reapplies it to existing scene materials.
 *
 * @param {THREE.Scene} scene
 * @param {number} intensity
 */
export function setEnvironmentIntensity(scene, intensity) {
  environmentIntensity = intensity;
  refreshSceneEnvironmentMaterials(scene);
}

/**
 * Bakes a RoomEnvironment PMREM and assigns it to scene.environment.
 * Call once at startup — before or after level load (level-agnostic).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @returns {{ envTexture: THREE.Texture, dispose: () => void }}
 */
export function setupSceneEnvironment(renderer, scene) {
  // * Suppress ANGLE/HLSL X4122 precision warnings from the PMREM convolution shader.
  // * These are harmless float-to-double warnings on Windows/DirectX (Three.js issue #32692).
  // * The patch filters only X4122; real shader compile/link errors are still logged.
  const gl = /** @type {(WebGLRenderingContext | WebGL2RenderingContext) & { _x4122Suppressed?: boolean }} */ (renderer.getContext());
  if (gl && !gl._x4122Suppressed) {
    const origGetProgramInfoLog = gl.getProgramInfoLog.bind(gl);
    gl.getProgramInfoLog = function (program) {
      const log = origGetProgramInfoLog(program);
      if (!log || !log.includes('warning X4122')) return log;
      return log
        .split('\n')
        .filter((l) => !l.includes('warning X4122'))
        .join('\n')
        .trim();
    };
    gl._x4122Suppressed = true;
  }

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const roomEnvironment = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnvironment).texture;
  pmremGenerator.dispose();

  scene.environment = envTexture;
  environmentIntensity = CONFIG.postFx.environment.intensity;
  refreshSceneEnvironmentMaterials(scene);

  return {
    envTexture,
    dispose() {
      envTexture?.dispose?.();
    },
  };
}

// === SCENE FOG (FogExp2) ===
// Applied on the root scene — Classic uses CONFIG.postFx.fog; Backrooms overrides on level load.
// Adjust CONFIG.postFx.fog or use the Post FX debug GUI.

/** @type {typeof CONFIG.postFx.fog} */
const FOG_CONFIG = CONFIG.postFx.fog;

/** @type {number} */
let fogColorLive = FOG_CONFIG.color;
/** @type {number} */
let fogDensityLive = FOG_CONFIG.density;
/** @type {boolean} */
let fogEnabledLive = true;

/**
 * @returns {number}
 */
export function getFogColor() {
  return fogColorLive;
}

/**
 * @returns {number}
 */
export function getFogDensity() {
  return fogDensityLive;
}

/**
 * @returns {boolean}
 */
export function getFogEnabled() {
  return fogEnabledLive;
}

/**
 * Toggles FogExp2 on the root scene without losing stored color/density.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {boolean} enabled
 */
export function setFogEnabled(scene, renderer, enabled) {
  fogEnabledLive = enabled;
  if (!scene) return;
  if (!enabled) {
    scene.fog = null;
    return;
  }
  setupSceneFog(scene, fogColorLive, fogDensityLive);
  if (renderer) renderer.setClearColor(fogColorLive, 1);
}

/**
 * Assigns or updates FogExp2 on the root scene.
 *
 * @param {THREE.Scene} scene
 * @param {number} [color]
 * @param {number} [density]
 * @returns {THREE.FogExp2 | null}
 */
function setupSceneFog(scene, color = FOG_CONFIG.color, density = FOG_CONFIG.density) {
  if (!scene) return null;
  fogColorLive = color;
  fogDensityLive = density;
  if (!(scene.fog instanceof THREE.FogExp2)) {
    scene.fog = new THREE.FogExp2(color, density);
  } else {
    scene.fog.color.setHex(color);
    scene.fog.density = density;
  }
  return scene.fog;
}

/**
 * Live-tweaks fog and optionally syncs the renderer clear color.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {{ color?: number, density?: number }} [options]
 */
/** @type {import("three/examples/jsm/postprocessing/RenderPass.js").RenderPass | null} */
let activeRenderPass = null;

export function setSceneFog(scene, renderer, options = {}) {
  const color = options.color ?? fogColorLive;
  const density = options.density ?? fogDensityLive;
  fogColorLive = color;
  fogDensityLive = density;
  if (fogEnabledLive) setupSceneFog(scene, color, density);
  if (renderer) renderer.setClearColor(color, 1);
  // * Composer RenderPass has its own clearColor (set once at createComposer). Without
  // * this sync, level fog changes (Storerooms warm haze) leave a classic-void clear that
  // * can flash at skybox/void edges when the depth buffer is empty for a frame.
  if (activeRenderPass?.clearColor) {
    activeRenderPass.clearColor.setHex(color);
  }
}

/**
 * Custom Arcade FX Shader: Combines Chromatic Aberration, Scanlines, and Vignette,
 * plus an optional VHS/security-camera layer (uVhsAmount, level-gated — currently only
 * The Storerooms enables it via applyLoadedLevelSideEffects in main.js). The VHS feel is
 * "cheap always-on CCTV feed", not glitch-horror: per-line micro-jitter, a faint
 * luminance-only tape-noise floor, a slow chroma-aberration wobble, and a soft tracking
 * band that sweeps the frame once every uVhsTrackPeriod seconds. Amplitudes are kept
 * small so competitive readability is untouched.
 */
const ArcadeFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 0.0045 },
    uScanlineDensity: { value: 1.5 },
    uVignette: { value: 1.2 },
    uFlash: { value: 0.0 },
    uVhsAmount: { value: 0.0 },
    uVhsNoise: { value: 0.028 },
    uVhsTrackPeriod: { value: 26.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAberration;
    uniform float uScanlineDensity;
    uniform float uVignette;
    uniform float uFlash;
    uniform float uVhsAmount;
    uniform float uVhsNoise;
    uniform float uVhsTrackPeriod;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    // Safe sample — clamp UVs so edge jitter never pulls the clear/black border of the RT.
    vec3 sampleScene(vec2 uv) {
      return texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5, 0.5);
      vec2 dir = uv - center;
      float dist = length(dir);

      // VHS: per-scanline micro-jitter + rare tracking band (displaces the sample).
      // Jitter is continuous (not floor(uTime*47)) — discrete snaps read as black-line
      // flicker on dark Storerooms frames, especially with bloom.
      float trackBand = 0.0;
      if (uVhsAmount > 0.001) {
        float line = floor(vUv.y * uResolution.y);
        // Slow time term + tiny continuous drift — stable CCTV, not 47Hz telecine pop.
        float lineNoise = hash(line * 0.137 + floor(uTime * 6.0) * 3.117);
        float lineDrift = hash(line * 0.271 + uTime * 1.7);
        float jitterPx = mix(lineNoise, lineDrift, 0.35);
        uv.x += (jitterPx - 0.5) * (0.9 / max(uResolution.x, 1.0)) * uVhsAmount;

        float phase = mod(uTime, max(uVhsTrackPeriod, 0.1));
        // Soft 0.9s band once per period; narrow, slight brighten only (never darken).
        if (phase < 0.9) {
          float bandY = 1.0 - phase / 0.9;
          trackBand = (1.0 - smoothstep(0.0, 0.028, abs(vUv.y - bandY))) * uVhsAmount;
          uv.x += trackBand * (4.0 / max(uResolution.x, 1.0));
        }
      }

      // Mild CA (CCTV, not fisheye). Cap so bloomed highlights don't rainbow-warp.
      float aberration = uAberration * (1.0 + uVhsAmount * 0.15 * sin(uTime * 1.05));
      aberration = min(aberration, 0.006);
      // Avoid normalize(0) at screen center — NaN RGB flashes as black on some GPUs.
      vec2 dirN = dist > 1e-5 ? dir / dist : vec2(0.0);
      // Linear radial falloff (not dist²) keeps edges from looking plastic/warped.
      vec2 offset = dirN * dist * aberration;
      float r = sampleScene(uv + offset).r;
      float g = sampleScene(uv).g;
      float b = sampleScene(uv - offset).b;
      vec4 color = vec4(r, g, b, 1.0);

      float scanline = sin(gl_FragCoord.y * uScanlineDensity) * 0.018;
      color.rgb -= scanline;

      // VHS: faint luminance-only tape-noise floor + a soft lift inside the tracking band.
      if (uVhsAmount > 0.001) {
        // ~12Hz grain (was 60Hz) — still tape-like, less sparkle/flash on dark carpet.
        float n = hash(dot(vUv * uResolution, vec2(0.129898, 0.78233)) + floor(uTime * 12.0));
        color.rgb += (n - 0.5) * uVhsNoise * uVhsAmount;
        color.rgb += trackBand * 0.04;
      }

      // Soft CRT vignette — edge0 < edge1 always (1 - smoothstep).
      float vigAmt = clamp(uVignette, 0.05, 2.5);
      float vigInner = 0.42;
      float vigOuter = mix(0.98, 0.78, clamp(vigAmt * 0.5, 0.0, 1.0));
      float vig = 1.0 - smoothstep(vigInner, vigOuter, dist) * 0.55;
      color.rgb *= clamp(vig, 0.0, 1.0);

      // Kill-confirm flash — brief lift toward white, strongest at screen center.
      float flashFalloff = 1.0 - smoothstep(0.15, 0.75, dist);
      color.rgb = mix(color.rgb, vec3(1.0), uFlash * 0.2 * flashFalloff);

      gl_FragColor = color;
    }
  `,
};

/**
 * Applies the game's tone mapping + exposure to a renderer. Single source of truth so
 * the in-game composer (via OutputPass, which reads renderer.toneMapping) and the
 * customization cart preview (direct render) grade colors identically.
 *
 * @param {THREE.WebGLRenderer} renderer
 */
export function applyRendererColorGrading(renderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = CONFIG.postFx.toneMappingExposure ?? 1.0;
}

/**
 * Creates the WebGL renderer bound to the game canvas.
 *
 * @param {HTMLCanvasElement} canvas Target canvas element.
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    // * Opaque canvas — transparent clears show body #000 as pure black slabs.
    alpha: false,
    premultipliedAlpha: false,
  });
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(computeSafePixelRatio(renderer, w, h));
  renderer.setSize(w, h);
  renderer.setClearColor(FOG_CONFIG.color, 1);
  renderer.setClearAlpha(1);
  applyRendererColorGrading(renderer);
  // * Contact grounding uses blob quads (contactShadows.js), not shadowMap — keeps GPU cost flat.
  return renderer;
}

/**
 * Creates the root Three.js scene with exponential fog.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  setupSceneFog(scene);
  return scene;
}

/**
 * Creates the perspective chase camera at the current window aspect ratio.
 *
 * @returns {THREE.PerspectiveCamera}
 */
function createCamera() {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  return camera;
}

/**
 * Toggles post-processing passes and renderer quality for runtime quality changes
 * without rebuilding the physics world.
 *
 * @param {import("three/examples/jsm/postprocessing/UnrealBloomPass.js").UnrealBloomPass | null} bloomPass
 * @param {import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null} arcadePass
 * @param {import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null} fxaaPass
 * @param {THREE.WebGLRenderer | null} renderer
 * @param {boolean} lowQuality
 * @param {EffectComposer | null} [composer]
 */
export function applyComposerQualityMode(bloomPass, arcadePass, fxaaPass, renderer, lowQuality, composer = null) {
  // * Isolation A/C force bloom off — quality mode must not re-enable it.
  const isolationAllowsBloom = activeIsolation ? activeIsolation.bloomEnabled : true;
  if (bloomPass) bloomPass.enabled = isolationAllowsBloom && !lowQuality;
  if (arcadePass) arcadePass.enabled = !lowQuality;
  if (renderer) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = lowQuality ? 1 : computeSafePixelRatio(renderer, w, h);
    renderer.setPixelRatio(pixelRatio);
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    }
    if (fxaaPass) {
      fxaaPass.material.uniforms.resolution.value.set(
        1 / (w * pixelRatio),
        1 / (h * pixelRatio),
      );
    }
  }
}

/**
 * Builds the post-processing pipeline for the active Phase 1 isolation profile.
 *
 * Isolation (CONFIG.postFx.isolationTest or ?postfx=A–E) — one change at a time:
 *   A HalfFloat + bloom off
 *   B HalfFloat + bloom on + OutputPass off
 *   C UnsignedByte + bloom off
 *   D UnsignedByte + bloom → Output (pre-tonemap HDR knobs)
 *   E UnsignedByte + Output → bloom (display knobs)
 *
 * Dev live-tweak: npm run dev → ?debug or H (postFxDebug.js). Menu z-index: keep
 * #game under .cr-root.
 *
 * @param {THREE.WebGLRenderer} renderer Active WebGL renderer.
 * @param {THREE.Scene} scene Root scene to render.
 * @param {THREE.PerspectiveCamera} camera Active camera.
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass, arcadePass: ShaderPass, fxaaPass: ShaderPass, outputPass: OutputPass, isolation: PostFxIsolation }}
 */
export function createComposer(renderer, scene, camera) {
  activeIsolation = resolvePostFxIsolation();
  const iso = activeIsolation;
  const bloomCfg = bloomConfigForIsolation();

  // * CSS/logical size into EffectComposer — it multiplies by pixelRatio internally.
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(size.x)),
    Math.max(1, Math.floor(size.y)),
    {
      type: iso.composerType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    },
  );
  rt.texture.name = `EffectComposer.rt1.${iso.id}`;
  const composer = new EffectComposer(renderer, rt);
  const cpr = renderer.getPixelRatio();
  composer.setPixelRatio(cpr);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(getFogColor());
  renderPass.clearAlpha = 1;
  activeRenderPass = renderPass;
  composer.addPass(renderPass);

  const outputPass = new OutputPass();
  outputPass.enabled = iso.outputEnabled;

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomCfg.strength,
    bloomCfg.radius,
    bloomCfg.threshold,
  );
  applyBloomSettings(bloomPass, bloomCfg);
  if (iso.byteBloomMips) {
    const bloomSetSize = bloomPass.setSize.bind(bloomPass);
    bloomPass.setSize = (w, h) => {
      bloomSetSize(w, h);
      stabilizeBloomTargets(bloomPass);
    };
    stabilizeBloomTargets(bloomPass);
  }
  // * Isolation bloom off wins over quality mode for A/C; low-quality still disables bloom.
  bloomPass.enabled = iso.bloomEnabled && !isLowQualityMode();

  if (iso.bloomBeforeOutput) {
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
  } else {
    composer.addPass(outputPass);
    composer.addPass(bloomPass);
  }

  const arcadeCfg = CONFIG.postFx.arcade;
  const arcadePass = new ShaderPass(ArcadeFxShader);
  arcadePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  arcadePass.uniforms.uAberration.value = arcadeCfg.aberration;
  arcadePass.uniforms.uScanlineDensity.value = arcadeCfg.scanlineDensity;
  arcadePass.uniforms.uVignette.value = arcadeCfg.vignette;
  arcadePass.enabled = !isLowQualityMode();
  composer.addPass(arcadePass);

  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * cpr),
    1 / (window.innerHeight * cpr),
  );
  composer.addPass(fxaaPass);

  const typeName = iso.composerType === THREE.HalfFloatType ? "HalfFloat" : "UnsignedByte";
  // eslint-disable-next-line no-console
  console.info(
    `[postFx isolation ${iso.id}] ${iso.label} | composerRT=${typeName} | ` +
      `bloom=${bloomPass.enabled} output=${outputPass.enabled} order=${iso.bloomBeforeOutput ? "bloom→Output" : "Output→bloom"} | ` +
      `override ?postfx=A..E`,
  );

  return { composer, bloomPass, arcadePass, fxaaPass, outputPass, isolation: iso };
}

/**
 * Resizes renderer, camera projection, and composer to the current window dimensions.
 *
 * @param {THREE.WebGLRenderer|null|undefined} renderer WebGL renderer.
 * @param {THREE.PerspectiveCamera|null|undefined} camera Perspective camera.
 * @param {EffectComposer|null|undefined} composer Post-processing composer.
 * @param {ShaderPass|null|undefined} arcadePass Arcade FX shader pass.
 * @param {ShaderPass|null|undefined} fxaaPass FXAA shader pass.
 */
export function updateViewport(renderer, camera, composer, arcadePass, fxaaPass) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (renderer) {
    const pixelRatio = computeSafePixelRatio(renderer, w, h);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
    if (composer) {
      // * Same DPR as canvas — flicker was HalfFloat type, not buffer size.
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    }
  }
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if (arcadePass) arcadePass.uniforms.uResolution.value.set(w, h);

  if (fxaaPass && renderer) {
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (w * pixelRatio),
      1 / (h * pixelRatio),
    );
  }
}

/**
 * Disposes WebGL resources held by the renderer.
 *
 * @param {THREE.WebGLRenderer|null|undefined} renderer WebGL renderer to dispose.
 */
function disposeRenderer(renderer) {
  if (!renderer) return;
  renderer.dispose();
}

/**
 * ! REQUIRED VRAM cleanup utility — intentionally retained for future use.
 *   Not currently called in any codepath, but must be available when
 *   post-processing teardown (quality toggles, scene disposal) is wired up.
 *
 * Disposes render targets and passes owned by the effect composer.
 *
 * @public Excluded from knip's unused-export report (see comment above).
 * @param {EffectComposer|null|undefined} composer Post-processing composer to dispose.
 */
export function disposeComposer(composer) {
  if (!composer) return;
  if (Array.isArray(composer.passes)) {
    for (const pass of composer.passes) {
      const p = /** @type {any} */ (pass);
      if (p.material) p.material.dispose?.();
      if (p.dispose) p.dispose();
    }
  }
  composer.renderTarget1?.dispose();
  composer.renderTarget2?.dispose();
  composer.dispose();
}
